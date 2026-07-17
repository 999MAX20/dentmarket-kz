import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { FileScannerService } from "./file-scanner.service";

export type UploadKind = "CSV" | "XLSX" | "PDF" | "DOCX" | "PNG" | "JPEG";
const mimeByKind: Record<UploadKind, string> = { CSV: "text/csv", XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", PDF: "application/pdf", DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", PNG: "image/png", JPEG: "image/jpeg" };
const extensionByKind: Record<UploadKind, string> = { CSV: ".csv", XLSX: ".xlsx", PDF: ".pdf", DOCX: ".docx", PNG: ".png", JPEG: ".jpg" };

function zipEntryNames(body: Buffer) {
  const names = new Set<string>();
  for (let offset = 0; offset + 46 <= body.length;) {
    if (body.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const nameLength = body.readUInt16LE(offset + 28);
    const extraLength = body.readUInt16LE(offset + 30);
    const commentLength = body.readUInt16LE(offset + 32);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (nameLength === 0 || end > body.length) return new Set<string>();
    names.add(body.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replaceAll("\\", "/"));
    offset = end;
  }
  return names;
}

function detectOoxmlKind(body: Buffer): "XLSX" | "DOCX" | null {
  const names = zipEntryNames(body);
  if (!names.has("[Content_Types].xml") || !names.has("_rels/.rels")) return null;
  if (names.has("xl/workbook.xml")) return "XLSX";
  if (names.has("word/document.xml")) return "DOCX";
  return null;
}

@Injectable()
export class FileUploadPolicyService {
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService, private readonly scanner: FileScannerService) {}

  decodeBase64(value: string, maxBytes: number) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new BadRequestException("Invalid base64 file content");
    const body = Buffer.from(value, "base64");
    if (body.byteLength === 0 || body.byteLength > maxBytes) throw new BadRequestException(`File must be between 1 byte and ${Math.floor(maxBytes / 1_000_000)} MB`);
    return body;
  }

  detect(body: Buffer): UploadKind | null {
    if (body.subarray(0, 5).toString("ascii") === "%PDF-") return "PDF";
    if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "PNG";
    if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "JPEG";
    if (body.length >= 4 && body[0] === 0x50 && body[1] === 0x4b && [0x03, 0x05, 0x07].includes(body[2]!) && [0x04, 0x06, 0x08].includes(body[3]!)) return null;
    if (!body.includes(0)) {
      try { new TextDecoder("utf-8", { fatal: true }).decode(body); return "CSV"; } catch { return null; }
    }
    return null;
  }

  private kindFromName(fileName: string): UploadKind | null {
    const extension = extname(fileName).toLowerCase();
    return extension === ".csv" ? "CSV" : extension === ".xlsx" ? "XLSX" : extension === ".pdf" ? "PDF" : extension === ".docx" ? "DOCX" : extension === ".png" ? "PNG" : [".jpg", ".jpeg"].includes(extension) ? "JPEG" : null;
  }

  async quarantine(input: { organizationId: string; actorId?: string; purpose: string; fileName: string; body: Buffer; allowedKinds: UploadKind[]; maxBytes: number }) {
    const originalName = input.fileName.normalize("NFKC");
    const declaredKind = this.kindFromName(originalName);
    const zip = input.body.length >= 4 && input.body[0] === 0x50 && input.body[1] === 0x4b && [0x03, 0x05, 0x07].includes(input.body[2]!) && [0x04, 0x06, 0x08].includes(input.body[3]!);
    const detectedKind = zip ? detectOoxmlKind(input.body) : this.detect(input.body);
    const invalidName = originalName !== basename(originalName) || /[\u0000-\u001f\u007f]/.test(originalName) || originalName.includes("..") || originalName.length > 240;
    const invalid = invalidName || input.body.byteLength === 0 || input.body.byteLength > input.maxBytes || !declaredKind || !detectedKind || declaredKind !== detectedKind || !input.allowedKinds.includes(detectedKind);
    const checksumSha256 = createHash("sha256").update(input.body).digest("hex");
    if (invalid) {
      await this.prisma.securityEvent.create({ data: { severity: "HIGH", type: "upload.policy.rejected", actorId: input.actorId, organizationId: input.organizationId, fingerprint: checksumSha256, metadata: { purpose: input.purpose, originalName, declaredKind, detectedKind, sizeBytes: input.body.byteLength, invalidName } } });
      throw new BadRequestException("File extension, MIME signature, name, type or size is not allowed");
    }
    const safeStem = basename(originalName, extname(originalName)).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "upload";
    const safeName = `${safeStem}${extensionByKind[detectedKind]}`;
    const storageKey = `quarantine/${input.organizationId}/${input.purpose}/${randomUUID()}-${safeName}`;
    await this.storage.put(storageKey, input.body, mimeByKind[detectedKind]);
    const asset = await this.prisma.uploadAsset.create({ data: { organizationId: input.organizationId, uploadedById: input.actorId, purpose: input.purpose, storageKey, originalName, safeName, declaredMime: mimeByKind[declaredKind], detectedMime: mimeByKind[detectedKind], sizeBytes: input.body.byteLength, checksumSha256, status: "QUARANTINED" } });
    try {
      const scan = await this.scanner.scan(input.body, safeName);
      return await this.prisma.uploadAsset.update({ where: { id: asset.id }, data: { status: "CLEAN", scanProvider: scan.provider, scanResult: "clean", availableAt: new Date() } });
    } catch (error) {
      await this.prisma.uploadAsset.update({ where: { id: asset.id }, data: { status: "REJECTED", scanResult: "rejected_or_unavailable", rejectionReason: error instanceof Error ? error.message.slice(0, 500) : "Upload scan failed" } });
      throw error;
    }
  }
}

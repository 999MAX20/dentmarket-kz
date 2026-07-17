import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

export type StoredObject = { key: string; size: number; contentType: string };

@Injectable()
export class ObjectStorageService {
  private readonly driver = process.env.OBJECT_STORAGE_DRIVER ?? "local";
  private readonly root = resolve(process.env.LOCAL_STORAGE_PATH ?? ".local-storage");
  private readonly bucket = process.env.S3_BUCKET ?? "marketplace";
  private readonly s3 = this.driver === "s3" ? new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  }) : null;

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION === "AES256" ? "AES256" : undefined }));
      return { key, size: body.byteLength, contentType };
    }
    const path = this.safePath(key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, body, { flag: "wx" });
    return { key, size: body.byteLength, contentType };
  }

  async get(key: string) {
    if (this.s3) {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) throw new Error("Stored object has no body");
      return Buffer.from(await response.Body.transformToByteArray());
    }
    return readFile(this.safePath(key));
  }

  async signedDownloadUrl(key: string, expiresInSeconds = 300) {
    if (!this.s3) return null;
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async health() {
    if (this.s3) { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); return { status: "ok" as const, driver: "s3" as const, bucket: this.bucket }; }
    await mkdir(this.root, { recursive: true });
    await access(this.root);
    return { status: "ok" as const, driver: "local" as const };
  }

  private safePath(key: string) {
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) throw new Error("Unsafe storage key");
    return path;
  }
}

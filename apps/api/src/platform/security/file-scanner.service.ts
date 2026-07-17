import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createConnection } from "node:net";
import { environment } from "../config/environment";

@Injectable()
export class FileScannerService {
  private readonly logger = new Logger(FileScannerService.name);

  async scan(body: Buffer, fileName: string) {
    const config = environment();
    if (config.AV_SCAN_MODE === "disabled") return { clean: true, provider: "disabled" as const };
    try {
      const response = await this.scanWithClamAv(body, config.CLAMAV_HOST, config.CLAMAV_PORT);
      if (/FOUND/i.test(response)) throw new BadRequestException(`Файл ${fileName} отклонён антивирусной проверкой`);
      if (!/OK/i.test(response)) throw new Error(`Unexpected ClamAV response: ${response}`);
      return { clean: true, provider: "clamav" as const };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Antivirus scan failed for ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Антивирусная проверка временно недоступна");
    }
  }

  private scanWithClamAv(body: Buffer, host: string, port: number) {
    return new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host, port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => { socket.destroy(); reject(new Error("ClamAV scan timed out")); }, 15_000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim());
      };
      socket.once("error", (error) => finish(error));
      socket.on("data", (chunk) => { chunks.push(Buffer.from(chunk)); if (chunk.includes(0)) finish(); });
      socket.once("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < body.length; offset += 64 * 1024) {
          const chunk = body.subarray(offset, offset + 64 * 1024);
          const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length); socket.write(size); socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

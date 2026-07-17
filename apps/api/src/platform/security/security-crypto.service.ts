import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

@Injectable()
export class SecurityCryptoService {
  private readonly key = this.resolveKey();

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(value: string) {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
    if (version !== "v1" || !ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Encrypted security value is malformed");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
  }

  private resolveKey() {
    const configured = process.env.APP_SECURITY_ENCRYPTION_KEY ?? process.env.INTEGRATION_ENCRYPTION_KEY;
    if (configured) {
      const decoded = Buffer.from(configured, "base64");
      if (decoded.length === 32) return decoded;
      throw new ServiceUnavailableException("APP_SECURITY_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    }
    if (process.env.NODE_ENV === "production") throw new ServiceUnavailableException("APP_SECURITY_ENCRYPTION_KEY is required in production");
    return createHash("sha256").update("marketplace-local-security-key").digest();
  }
}

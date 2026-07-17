import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

@Injectable()
export class IntegrationCryptoService {
  private key() {
    const configured = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (configured) {
      const decoded = Buffer.from(configured, "base64");
      if (decoded.length !== 32) throw new ServiceUnavailableException("INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
      return decoded;
    }
    if (process.env.NODE_ENV === "production") throw new ServiceUnavailableException("INTEGRATION_ENCRYPTION_KEY is required in production");
    return createHash("sha256").update("marketplace-local-integration-key-do-not-use-in-production").digest();
  }

  encrypt(value: Record<string, string>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  decrypt(value: string) {
    const [version, ivValue, tagValue, encryptedValue, ...rest] = value.split(":");
    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || rest.length > 0) throw new Error("Unsupported encrypted integration secret");
    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((item) => typeof item !== "string")) throw new Error("Invalid encrypted integration credentials");
    return parsed as Record<string, string>;
  }

  token(bytes = 32) {
    return randomBytes(bytes).toString("base64url");
  }

  hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  tokensMatch(token: string, expectedHash: string) {
    const actual = Buffer.from(this.hashToken(token), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

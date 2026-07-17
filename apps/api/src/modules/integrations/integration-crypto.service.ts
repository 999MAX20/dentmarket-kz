import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

@Injectable()
export class IntegrationCryptoService {
  private keys() {
    const configured = process.env.INTEGRATION_ENCRYPTION_KEY;
    const previous = process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS;
    if (!configured && process.env.NODE_ENV === "production") throw new ServiceUnavailableException("INTEGRATION_ENCRYPTION_KEY is required in production");
    if (!configured) return [createHash("sha256").update("marketplace-local-integration-key-do-not-use-in-production").digest()];
    return [configured, previous].filter((value): value is string => Boolean(value)).map((value) => {
      const decoded = Buffer.from(value, "base64");
      if (decoded.length !== 32) throw new ServiceUnavailableException("Integration encryption keys must be base64-encoded 32-byte keys");
      return decoded;
    });
  }

  encrypt(value: Record<string, string>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys()[0], iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  encryptJson(value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys()[0], iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  decryptJson(value: string): unknown {
    return this.decryptWithKey(value, (decrypted) => JSON.parse(decrypted));
  }

  decrypt(value: string) {
    const decrypted = this.decryptWithKey(value, (plainText) => plainText);
    const parsed: unknown = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((item) => typeof item !== "string")) throw new Error("Invalid encrypted integration credentials");
    return parsed as Record<string, string>;
  }

  private decryptWithKey<T>(value: string, parse: (plainText: string) => T): T {
    const [version, ivValue, tagValue, encryptedValue, ...rest] = value.split(":");
    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || rest.length > 0) throw new Error("Unsupported encrypted integration value");
    let lastError: unknown;
    for (const key of this.keys()) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
        decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
        return parse(Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8"));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Unable to decrypt integration value");
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

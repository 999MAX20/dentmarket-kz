import { afterEach, describe, expect, it } from "vitest";
import { IntegrationCryptoService } from "./integration-crypto.service";

const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = originalKey;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
});

describe("IntegrationCryptoService", () => {
  it("encrypts credentials with authenticated encryption", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const service = new IntegrationCryptoService();
    const encrypted = service.encrypt({ accessToken: "top-secret" });
    expect(encrypted).not.toContain("top-secret");
    expect(service.decrypt(encrypted)).toEqual({ accessToken: "top-secret" });
  });

  it("rejects modified ciphertext", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const service = new IntegrationCryptoService();
    const encrypted = service.encrypt({ accessToken: "token" });
    const parts = encrypted.split(":");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => service.decrypt(parts.join(":"))).toThrow();
  });

  it("encrypts arbitrary configuration and rejects tampering", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    const service = new IntegrationCryptoService();
    const value = { apiKey: "secret", nested: { enabled: true }, list: [1, 2] };
    const encrypted = service.encryptJson(value);
    expect(service.decryptJson(encrypted)).toEqual(value);
    const parts = encrypted.split(":");
    parts[3] = `${parts[3]}x`;
    expect(() => service.decryptJson(parts.join(":"))).toThrow();
  });

  it("uses constant-time comparison for high-entropy agent tokens", () => {
    const service = new IntegrationCryptoService();
    const token = service.token();
    expect(service.tokensMatch(token, service.hashToken(token))).toBe(true);
    expect(service.tokensMatch(`${token}x`, service.hashToken(token))).toBe(false);
  });
});

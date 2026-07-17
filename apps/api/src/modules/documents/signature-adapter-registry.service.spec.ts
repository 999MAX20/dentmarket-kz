import { afterEach, describe, expect, it } from "vitest";
import { SignatureAdapterRegistry } from "./signature-adapter-registry.service";
import { MockSignatureAdapter } from "./signature-adapter";

const originalNodeEnv = process.env.NODE_ENV;
const originalGateway = process.env.SIGNATURE_GATEWAY_URL;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  if (originalGateway === undefined) delete process.env.SIGNATURE_GATEWAY_URL; else process.env.SIGNATURE_GATEWAY_URL = originalGateway;
});

describe("signature adapter registry", () => {
  it("uses the deterministic adapter for EDS verification in development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.SIGNATURE_GATEWAY_URL;
    expect(new SignatureAdapterRegistry().resolve("EDS")).toBeInstanceOf(MockSignatureAdapter);
  });

  it("fails closed when the production EDS gateway is absent", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SIGNATURE_GATEWAY_URL;
    expect(() => new SignatureAdapterRegistry().resolve("EDS")).toThrow("SIGNATURE_GATEWAY_URL is missing");
  });
});

import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { DocumentSignatureMethod } from "@prisma/client";
import { ConfiguredSignatureAdapter, MockSignatureAdapter } from "./signature-adapter";

@Injectable()
export class SignatureAdapterRegistry {
  private readonly mock = new MockSignatureAdapter();
  resolve(method: DocumentSignatureMethod) {
    if (["MOCK", "SIMPLE"].includes(method)) return this.mock;
    const url = process.env.SIGNATURE_GATEWAY_URL;
    if (!url && process.env.NODE_ENV !== "production") return this.mock;
    if (!url) throw new ServiceUnavailableException(`Signature method ${method} is configured but SIGNATURE_GATEWAY_URL is missing`);
    return new ConfiguredSignatureAdapter(url);
  }

  capabilities() {
    return { methods: ["MOCK", "SIMPLE", "EDS", "EGOV_QR", "EXTERNAL"], configuredExternalGateway: Boolean(process.env.SIGNATURE_GATEWAY_URL) };
  }
}

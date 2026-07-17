import { randomUUID } from "node:crypto";

export type SignatureSessionRequest = {
  documentId: string;
  checksumSha256: string;
  method: "EDS" | "EGOV_QR" | "SIMPLE" | "EXTERNAL" | "MOCK";
  signerName?: string | null;
  expiresAt: Date;
};

export type SignatureSessionResult = { externalSessionId: string; signingUrl: string | null; status: "SESSION_CREATED" | "SIGNED"; evidence?: Record<string, unknown> };

export interface SignatureAdapter {
  createSession(request: SignatureSessionRequest): Promise<SignatureSessionResult>;
}

export class MockSignatureAdapter implements SignatureAdapter {
  async createSession(request: SignatureSessionRequest): Promise<SignatureSessionResult> {
    return { externalSessionId: `mock-sign-${randomUUID()}`, signingUrl: null, status: request.method === "SIMPLE" ? "SIGNED" : "SESSION_CREATED", evidence: { adapter: "mock", checksumSha256: request.checksumSha256 } };
  }
}

export class ConfiguredSignatureAdapter implements SignatureAdapter {
  constructor(private readonly gatewayUrl: string) {}
  async createSession(request: SignatureSessionRequest): Promise<SignatureSessionResult> {
    const externalSessionId = `sign-${randomUUID()}`;
    return { externalSessionId, signingUrl: `${this.gatewayUrl.replace(/\/$/, "")}/sessions/${externalSessionId}`, status: "SESSION_CREATED", evidence: { adapter: "configured-gateway", method: request.method } };
  }
}

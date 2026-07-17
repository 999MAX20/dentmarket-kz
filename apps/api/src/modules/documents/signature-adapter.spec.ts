import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguredSignatureAdapter } from "./signature-adapter";

afterEach(() => vi.unstubAllGlobals());

describe("ConfiguredSignatureAdapter", () => {
  it("creates a remote signing session without sending document contents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "eds-1", url: "https://eds.example/session/eds-1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ConfiguredSignatureAdapter("https://eds.example/api", "gateway-secret");
    const result = await adapter.createSession({ documentId: "doc-1", checksumSha256: "a".repeat(64), method: "EDS", signerName: "Clinic", expiresAt: new Date("2026-08-01T00:00:00.000Z") });
    expect(result).toMatchObject({ externalSessionId: "eds-1", signingUrl: "https://eds.example/session/eds-1", status: "SESSION_CREATED" });
    expect(fetchMock).toHaveBeenCalledWith("https://eds.example/api/sessions", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer gateway-secret" }) }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual(expect.objectContaining({ documentId: "doc-1", checksumSha256: "a".repeat(64) }));
    expect(body).not.toHaveProperty("content");
  });

  it("fails when the gateway does not return a session id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const adapter = new ConfiguredSignatureAdapter("https://eds.example/api");
    await expect(adapter.createSession({ documentId: "doc-1", checksumSha256: "a".repeat(64), method: "EDS", expiresAt: new Date() })).rejects.toThrow("externalSessionId");
  });
});

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignatureCallbackEnvelope } from "./signature-callbacks.service";

describe("EDS signature callback envelope", () => {
  const secret = "signature-callback-secret-with-32-chars";
  const now = Date.UTC(2026, 6, 17, 0, 0, 0);
  const timestamp = String(Math.floor(now / 1_000));
  const rawBody = Buffer.from('{"signatureId":"test"}');
  const signature = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");

  it("accepts a fresh exact raw-body HMAC", () => {
    expect(verifySignatureCallbackEnvelope({ rawBody, eventId: "event-12345", timestamp, signature: `sha256=${signature}`, secret, toleranceSeconds: 300, now })).toMatchObject({ payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("rejects modified bodies, stale timestamps and invalid event IDs", () => {
    expect(() => verifySignatureCallbackEnvelope({ rawBody: Buffer.from('{"signatureId":"changed"}'), eventId: "event-12345", timestamp, signature, secret, toleranceSeconds: 300, now })).toThrow("HMAC is invalid");
    expect(() => verifySignatureCallbackEnvelope({ rawBody, eventId: "event-12345", timestamp: String(Math.floor((now - 301_000) / 1_000)), signature, secret, toleranceSeconds: 300, now })).toThrow("outside the allowed window");
    expect(() => verifySignatureCallbackEnvelope({ rawBody, eventId: "short", timestamp, signature, secret, toleranceSeconds: 300, now })).toThrow("event ID is invalid");
  });
});

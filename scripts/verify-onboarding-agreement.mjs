import { createHmac, randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const CALLBACK_SECRET =
  process.env.SIGNATURE_CALLBACK_SECRET ??
  "local-signature-callback-secret-2026";
const OPERATOR = {
  actorId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000001",
  bin: "000000000001",
};
const identityHeaders = ({ actorId, organizationId }) => ({
  "x-user-id": actorId,
  "x-organization-id": organizationId,
});

async function request(
  path,
  { method = "GET", body, identity, expected = 200, headers = {} } = {},
) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(identity ? identityHeaders(identity) : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (response.status !== expected)
    throw new Error(
      `${method} ${path}: expected ${expected}, received ${response.status}: ${text}`,
    );
  return payload;
}

async function callback(signature, checksum, bin) {
  const body = JSON.stringify({
    signatureId: signature.id,
    externalSessionId: signature.externalSessionId,
    status: "SIGNED",
    externalSignatureId: `verified-${randomUUID()}`,
    signedDocumentChecksum: checksum,
    certificate: {
      subjectBin: bin,
      issuer: "Local qualified EDS certification authority",
      serialNumber: `SER-${randomUUID()}`,
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validTo: new Date(Date.now() + 86_400_000).toISOString(),
    },
    evidence: { verification: "end-to-end" },
  });
  const timestamp = String(Date.now());
  const eventId = `eds-${randomUUID()}`;
  const signatureHeader = createHmac("sha256", CALLBACK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return request("/documents/signatures/callback", {
    method: "POST",
    expected: 201,
    headers: {
      "content-type": "application/json",
      "x-signature-event-id": eventId,
      "x-signature-timestamp": timestamp,
      "x-signature-signature": signatureHeader,
    },
    body: JSON.parse(body),
  });
}

const suffix = `${Date.now()}`.slice(-12);
const email = `supplier.${suffix}@example.kz`;
const created = await request("/onboarding/registrations", {
  method: "POST",
  expected: 201,
  body: {
    email,
    ownerDisplayName: "Сквозной тест",
    legalName: `ТОО Сквозной тест ${suffix}`,
    organizationDisplayName: `Test Supplier ${suffix}`,
    bin: suffix,
    capability: "SUPPLIER",
    termsAccepted: true,
    privacyAccepted: true,
    marketingConsent: false,
    consentVersion: "2026-07-17",
    source: "verification",
    idempotencyKey: randomUUID(),
  },
});
if (!created.registrationToken)
  throw new Error("Registration token was not issued");
const completed = await request(
  "/onboarding/registrations/complete-development",
  {
    method: "POST",
    expected: 201,
    body: { registrationToken: created.registrationToken },
  },
);
const supplier = {
  actorId: completed.actorId,
  organizationId: completed.organizationId,
};
if (!supplier.actorId || !supplier.organizationId)
  throw new Error("Registration did not create an owner and organization");

const empty = await request("/marketplace-agreements/current", {
  identity: supplier,
});
if (!empty.signingRequired || empty.agreement)
  throw new Error("A new supplier must require an agreement");
const agreement = await request("/marketplace-agreements", {
  method: "POST",
  expected: 201,
  identity: supplier,
  body: { renewalMode: "AUTO_ANNUAL" },
});
if (agreement.signing.party !== "SUPPLIER" || !agreement.signing.available)
  throw new Error("Supplier signing window is unavailable");

const supplierSession = await request(
  `/marketplace-agreements/${agreement.id}/sign`,
  {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: { signerName: `ТОО Сквозной тест ${suffix}`, expiresInMinutes: 60 },
  },
);
await callback(
  supplierSession.signature,
  agreement.document.checksumSha256,
  suffix,
);
const pending = await request("/marketplace-agreements/operator/pending", {
  identity: OPERATOR,
});
const queued = pending.find(({ id }) => id === agreement.id);
if (!queued?.signing.supplierSigned || !queued.signing.available)
  throw new Error("Agreement did not reach the operator signature queue");

const operatorSession = await request(
  `/marketplace-agreements/${agreement.id}/sign`,
  {
    method: "POST",
    expected: 201,
    identity: OPERATOR,
    body: { signerName: "ТОО Marketplace Operator", expiresInMinutes: 60 },
  },
);
await callback(
  operatorSession.signature,
  agreement.document.checksumSha256,
  OPERATOR.bin,
);
const active = await request("/marketplace-agreements/current", {
  identity: supplier,
});
if (
  !active.agreement?.active ||
  active.signingRequired ||
  active.signingAvailable
)
  throw new Error(
    "Two EDS signatures did not activate and close the signing window",
  );
await request(`/marketplace-agreements/${agreement.id}/sign`, {
  method: "POST",
  expected: 409,
  identity: supplier,
  body: { signerName: "Retry forbidden", expiresInMinutes: 60 },
});

console.log(
  JSON.stringify(
    {
      verified: true,
      registration: {
        email,
        organizationId: supplier.organizationId,
        ownerUserId: supplier.actorId,
      },
      agreement: {
        id: agreement.id,
        number: agreement.agreementNumber,
        status: active.agreement.status,
        startsAt: active.agreement.startsAt,
        endsAt: active.agreement.endsAt,
        supplierSigned: active.agreement.signing.supplierSigned,
        operatorSigned: active.agreement.signing.operatorSigned,
        signingAvailable: active.agreement.signing.available,
      },
    },
    null,
    2,
  ),
);

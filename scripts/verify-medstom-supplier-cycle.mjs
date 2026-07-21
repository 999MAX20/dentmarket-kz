import fs from "node:fs/promises";
import path from "node:path";
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
const GLOVE_VARIANT_ID = "00000000-0000-4000-8000-000000000101";
const source = JSON.parse(
  await fs.readFile(
    path.resolve("apps/buyer-web/app/data/medstom-catalog.json"),
    "utf8",
  ),
);

const identityHeaders = ({ actorId, organizationId }) => ({
  "x-user-id": actorId,
  "x-organization-id": organizationId,
});
async function request(
  endpoint,
  { method = "GET", body, identity, expected = 200, headers = {} } = {},
) {
  const response = await fetch(`${API}${endpoint}`, {
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
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  if (!expectedStatuses.includes(response.status))
    throw new Error(
      `${method} ${endpoint}: expected ${expectedStatuses.join("/")}, received ${response.status}: ${text}`,
    );
  return { status: response.status, payload };
}
async function signCallback(signature, checksum, bin) {
  const payload = {
    signatureId: signature.id,
    externalSessionId: signature.externalSessionId,
    status: "SIGNED",
    externalSignatureId: `test-verified-${randomUUID()}`,
    signedDocumentChecksum: checksum,
    certificate: {
      subjectBin: bin,
      issuer: "DentMarket local EDS test authority",
      serialNumber: `TEST-${randomUUID()}`,
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validTo: new Date(Date.now() + 86_400_000).toISOString(),
    },
    evidence: {
      verification: "automated_supplier_lifecycle_test",
      legalEffect: false,
    },
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signatureHeader = createHmac("sha256", CALLBACK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return request("/documents/signatures/callback", {
    method: "POST",
    expected: 201,
    headers: {
      "content-type": "application/json",
      "x-signature-event-id": `test-eds-${randomUUID()}`,
      "x-signature-timestamp": timestamp,
      "x-signature-signature": signatureHeader,
    },
    body: payload,
  });
}

const suffix = `${Date.now()}`.slice(-12);
const email = `medstom-cycle.${suffix}@example.kz`;
const bin = suffix;
const steps = [];
const record = (step, result, evidence = {}) =>
  steps.push({ step, result, evidence });

const registration = (
  await request("/onboarding/registrations", {
    method: "POST",
    expected: 201,
    body: {
      email,
      ownerDisplayName: "Medstom lifecycle test",
      legalName: `ТОО TEST Medstom Catalog ${suffix}`,
      organizationDisplayName: `TEST Medstom Catalog ${suffix}`,
      bin,
      capability: "SUPPLIER",
      termsAccepted: true,
      privacyAccepted: true,
      marketingConsent: false,
      consentVersion: "2026-07-17",
      source: "automated-medstom-lifecycle",
      idempotencyKey: randomUUID(),
    },
  })
).payload;
const completed = (
  await request("/onboarding/registrations/complete-development", {
    method: "POST",
    expected: 201,
    body: { registrationToken: registration.registrationToken },
  })
).payload;
const supplier = {
  actorId: completed.actorId,
  organizationId: completed.organizationId,
};
record("registration", "PASSED", {
  organizationId: supplier.organizationId,
  email,
  testOnly: true,
});

await request(`/suppliers/${supplier.organizationId}/profile`, {
  method: "POST",
  expected: 201,
  identity: supplier,
  body: {
    regulatoryDetails: {
      onboarding: "automated_test",
      catalogSource: source.source.url,
      supplierVerification: "TEST_ONLY_NOT_LEGAL",
    },
  },
});
const warehouse = (
  await request(`/suppliers/${supplier.organizationId}/warehouses`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      code: `TEST_${suffix.slice(-8)}`,
      name: "Тестовый склад Medstom",
      addressLine: "Только автоматизированная проверка",
      timezone: "Asia/Almaty",
    },
  })
).payload;
const dataSource = (
  await request(`/suppliers/${supplier.organizationId}/data-sources`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      name: "Medstom public catalog pilot",
      type: "EXCEL",
      configuration: {
        sourceUrl: source.source.url,
        importedAt: source.source.importedAt,
        authorizedBySupplier: false,
        testOnly: true,
      },
    },
  })
).payload;
record("supplier_profile_warehouse_source", "PASSED", {
  warehouseId: warehouse.id,
  sourceId: dataSource.id,
});

const credential = (
  await request(
    `/compliance/organizations/${supplier.organizationId}/credentials`,
    {
      method: "POST",
      expected: 201,
      identity: supplier,
      body: {
        type: "OTHER",
        number: `TEST-${suffix}`,
        issuer: "Automated lifecycle test",
        metadata: { testOnly: true, legalEffect: false },
      },
    },
  )
).payload;
await request(`/compliance/credentials/${credential.id}/review`, {
  method: "POST",
  expected: 201,
  identity: OPERATOR,
  body: { status: "VERIFIED" },
});
record("test_credential_review", "PASSED", {
  credentialId: credential.id,
  testOnly: true,
});

const columnMapping = {
  externalId: "externalId",
  name: "name",
  supplierSku: "supplierSku",
  brand: "brand",
  manufacturer: "manufacturer",
  unit: "unit",
  priceMinor: "priceMinor",
  currency: "currency",
  quantityOnHand: "quantityOnHand",
};
const importRows = source.products.map(
  ({
    externalId,
    name,
    supplierSku,
    brand,
    manufacturer,
    unit,
    priceMinor,
    currency,
    quantityOnHand,
  }) => ({
    externalId,
    name,
    supplierSku,
    brand,
    manufacturer,
    unit,
    priceMinor,
    currency,
    quantityOnHand,
  }),
);
const batch = (
  await request(`/suppliers/${supplier.organizationId}/import-batches`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      sourceId: dataSource.id,
      fileName: "Medstom_KZ_catalog_supplier_cycle.xlsx",
      fileType: "MANUAL",
      columnMapping,
      rows: importRows,
    },
  })
).payload;
const processed = (
  await request(
    `/suppliers/${supplier.organizationId}/import-batches/${batch.id}/process`,
    { method: "POST", expected: 201, identity: supplier },
  )
).payload;
if (
  processed.processedRows !== source.products.length ||
  processed.errorRows !== 0
)
  throw new Error(
    `Catalog import QA failed: ${processed.processedRows}/${processed.errorRows}`,
  );
record("catalog_upload_normalization", "PASSED", {
  batchId: batch.id,
  rows: processed.processedRows,
  errors: processed.errorRows,
});

const glove = source.products.find(
  (item) => /перчат/i.test(item.name) && Number(item.priceMinor) > 0,
);
if (!glove)
  throw new Error(
    "A priced glove row is required for the matching lifecycle proof",
  );
const refreshBatch = (
  await request(`/suppliers/${supplier.organizationId}/import-batches`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      sourceId: dataSource.id,
      fileName: "medstom-glove-match.json",
      fileType: "MANUAL",
      columnMapping,
      rows: [glove],
    },
  })
).payload;
await request(
  `/suppliers/${supplier.organizationId}/import-batches/${refreshBatch.id}/process`,
  { method: "POST", expected: 201, identity: supplier },
);
const externalItems = (
  await request(`/suppliers/${supplier.organizationId}/external-items`, {
    identity: supplier,
  })
).payload;
const gloveItem = externalItems.find(
  (item) => item.externalId === glove.externalId,
);
if (!gloveItem)
  throw new Error("Refreshed glove item was not returned by matching queue");
await request(
  `/suppliers/${supplier.organizationId}/external-items/${gloveItem.id}/match`,
  {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: { productVariantId: GLOVE_VARIANT_ID },
  },
);
record("catalog_matching", "PASSED", {
  externalItemId: gloveItem.id,
  productVariantId: GLOVE_VARIANT_ID,
});

const offer = (
  await request(`/suppliers/${supplier.organizationId}/offers`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      productVariantId: GLOVE_VARIANT_ID,
      sourceId: dataSource.id,
      supplierSku: glove.supplierSku,
      baseUnitsPerSaleUnit: 1,
      minimumOrderQuantity: 1,
      orderIncrement: 1,
      confirmationMode: "MANUAL",
      sourceType: "IMPORT",
      externalId: glove.externalId,
    },
  })
).payload;
await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/price`,
  {
    method: "PUT",
    identity: supplier,
    body: {
      amountMinor: Number(glove.priceMinor),
      currency: "KZT",
      includesVat: true,
      source: "IMPORT",
      reason: "Automated supplier lifecycle test",
    },
  },
);
await request(`/suppliers/${supplier.organizationId}/inventory/balances`, {
  method: "PUT",
  identity: supplier,
  body: {
    warehouseId: warehouse.id,
    productVariantId: GLOVE_VARIANT_ID,
    offerId: offer.id,
    quantityOnHand: 3,
    quantityReserved: 0,
    safetyStock: 0,
    source: "IMPORT",
  },
});
const blocked = await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
  {
    method: "PUT",
    expected: 403,
    identity: supplier,
    body: { status: "PUBLISHED", marketplaceVisible: true },
  },
);
record("publication_gate_without_agreement", "PASSED", {
  httpStatus: blocked.status,
  offerId: offer.id,
});

const agreement = (
  await request("/marketplace-agreements", {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: { renewalMode: "AUTO_ANNUAL" },
  })
).payload;
const supplierSignature = (
  await request(`/marketplace-agreements/${agreement.id}/sign`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: { signerName: `TEST Medstom ${suffix}`, expiresInMinutes: 60 },
  })
).payload;
await signCallback(
  supplierSignature.signature,
  agreement.document.checksumSha256,
  bin,
);
const operatorSignature = (
  await request(`/marketplace-agreements/${agreement.id}/sign`, {
    method: "POST",
    expected: 201,
    identity: OPERATOR,
    body: { signerName: "TEST Marketplace Operator", expiresInMinutes: 60 },
  })
).payload;
await signCallback(
  operatorSignature.signature,
  agreement.document.checksumSha256,
  OPERATOR.bin,
);
const currentAgreement = (
  await request("/marketplace-agreements/current", { identity: supplier })
).payload;
if (!currentAgreement.agreement?.active || currentAgreement.signingAvailable)
  throw new Error(
    "Two-signature agreement did not activate or signing window stayed open",
  );
record("annual_two_eds_agreement", "PASSED", {
  agreementId: agreement.id,
  status: currentAgreement.agreement.status,
  startsAt: currentAgreement.agreement.startsAt,
  endsAt: currentAgreement.agreement.endsAt,
  testOnly: true,
});

const publication = (
  await request(
    `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
    {
      method: "PUT",
      identity: supplier,
      body: { status: "PUBLISHED", marketplaceVisible: true },
    },
  )
).payload;
if (!publication.marketplaceVisible)
  throw new Error("Publication did not pass after all gates");
await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
  {
    method: "PUT",
    identity: supplier,
    body: {
      status: "HIDDEN",
      marketplaceVisible: false,
      blockedReason:
        "Automated test finished; supplier is not legally verified",
    },
  },
);
record("publication_after_all_gates", "PASSED_AND_HIDDEN", {
  offerId: offer.id,
  publishedAt: publication.publishedAt,
  cleanup: "HIDDEN",
});

const progress = (
  await request("/onboarding/supplier/progress", { identity: supplier })
).payload;
if (progress.status !== "READY")
  throw new Error(
    `Supplier lifecycle did not reach READY: ${JSON.stringify(progress)}`,
  );
record("onboarding_readiness", "PASSED", {
  status: progress.status,
  completedSteps: progress.completedSteps,
  totalSteps: progress.totalSteps,
});

const report = {
  verified: true,
  mode: "AUTOMATED_TEST_NO_LEGAL_EFFECT",
  source: source.source,
  catalog: {
    rows: source.products.length,
    priced: source.products.filter((item) => Number(item.priceMinor) > 0)
      .length,
    categories: source.categories.length,
  },
  supplier: {
    organizationId: supplier.organizationId,
    ownerUserId: supplier.actorId,
    email,
  },
  steps,
};
const outputDir = path.resolve("outputs/medstom-supplier-onboarding-20260717");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  path.join(outputDir, "supplier-lifecycle-verification.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

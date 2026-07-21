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
const pricePdfPath = process.argv[2];
const catalogPdfPath = process.argv[3];
if (!pricePdfPath || !catalogPdfPath)
  throw new Error(
    "Usage: node scripts/verify-pdf-supplier-cycle.mjs <price.pdf> <catalog.pdf>",
  );

const identityHeaders = ({ actorId, organizationId }) => ({
  "x-user-id": actorId,
  "x-organization-id": organizationId,
});
async function request(
  endpoint,
  { method = "GET", body, identity, expected = 200, headers = {} } = {},
) {
  const startedAt = Date.now();
  console.log(`[pdf-cycle] ${method} ${endpoint}`);
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(identity ? identityHeaders(identity) : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status))
    throw new Error(
      `${method} ${endpoint}: expected ${statuses.join("/")}, got ${response.status}: ${text}`,
    );
  console.log(
    `[pdf-cycle] ${method} ${endpoint} -> ${response.status} (${Date.now() - startedAt}ms)`,
  );
  return { status: response.status, payload };
}
async function fileBase64(filePath) {
  return (await fs.readFile(filePath)).toString("base64");
}
async function signCallback(signature, checksum, bin) {
  const payload = {
    signatureId: signature.id,
    externalSessionId: signature.externalSessionId,
    status: "SIGNED",
    externalSignatureId: `test-pdf-${randomUUID()}`,
    signedDocumentChecksum: checksum,
    certificate: {
      subjectBin: bin,
      issuer: "DentMarket isolated test authority",
      serialNumber: `TEST-${randomUUID()}`,
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validTo: new Date(Date.now() + 86_400_000).toISOString(),
    },
    evidence: { verification: "pdf_supplier_cycle", legalEffect: false },
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
      "x-signature-event-id": `pdf-test-${randomUUID()}`,
      "x-signature-timestamp": timestamp,
      "x-signature-signature": signatureHeader,
    },
    body: payload,
  });
}

const suffix = `${Date.now()}`.slice(-12);
const bin = suffix;
const steps = [];
const record = (step, result, evidence = {}) =>
  steps.push({ step, result, evidence });
const registration = (
  await request("/onboarding/registrations", {
    method: "POST",
    expected: 201,
    body: {
      email: `pdf-cycle.${suffix}@example.kz`,
      ownerDisplayName: "PDF supplier cycle",
      legalName: `ТОО TEST PDF Supplier ${suffix}`,
      organizationDisplayName: `TEST PDF Supplier ${suffix}`,
      bin,
      capability: "SUPPLIER",
      termsAccepted: true,
      privacyAccepted: true,
      marketingConsent: false,
      consentVersion: "2026-07-17",
      source: "automated-pdf-supplier-cycle",
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
record("supplier_registration", "PASSED", {
  organizationId: supplier.organizationId,
  testOnly: true,
});

await request(`/suppliers/${supplier.organizationId}/profile`, {
  method: "POST",
  expected: 201,
  identity: supplier,
  body: {
    regulatoryDetails: {
      testOnly: true,
      supplierVerification: "NOT_LEGAL",
      sourceFiles: [path.basename(pricePdfPath), path.basename(catalogPdfPath)],
    },
  },
});
const warehouse = (
  await request(`/suppliers/${supplier.organizationId}/warehouses`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      code: `PDF_${suffix.slice(-8)}`,
      name: "Тестовый склад PDF-цикла",
      addressLine: "Изолированный автоматизированный тест",
      timezone: "Asia/Almaty",
    },
  })
).payload;
const source = (
  await request(`/suppliers/${supplier.organizationId}/data-sources`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      name: "PDF прайсы — боевой тест",
      type: "PDF",
      configuration: {
        extractionMode: "text-table-with-review",
        testOnly: true,
      },
    },
  })
).payload;
record("profile_warehouse_pdf_source", "PASSED", {
  warehouseId: warehouse.id,
  sourceId: source.id,
});

const mapping = {
  externalId: "externalId",
  name: "name",
  supplierSku: "supplierSku",
  unit: "unit",
  priceMinor: "priceMinor",
  currency: "currency",
};
const priceBatch = (
  await request(`/suppliers/${supplier.organizationId}/import-batches`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      sourceId: source.id,
      fileName: path.basename(pricePdfPath),
      fileType: "PDF",
      contentBase64: await fileBase64(pricePdfPath),
      columnMapping: mapping,
    },
  })
).payload;
if (priceBatch.status !== "MAPPED" || priceBatch.totalRows !== 41)
  throw new Error(
    `Text PDF extraction mismatch: ${JSON.stringify(priceBatch)}`,
  );
const priceDetails = (
  await request(
    `/suppliers/${supplier.organizationId}/import-batches/${priceBatch.id}`,
    { identity: supplier },
  )
).payload;
if (
  priceDetails.rows.some(
    (row) => row.rawData.priceMinor || row.rawData.currency,
  )
)
  throw new Error(
    "Unconfirmed PDF currency leaked into normalized price fields",
  );
record("real_text_pdf_upload_extraction", "PASSED", {
  batchId: priceBatch.id,
  rows: priceBatch.totalRows,
  method: priceBatch.extractionMetadata?.method,
  currencyGate: true,
});

const processedPrice = (
  await request(
    `/suppliers/${supplier.organizationId}/import-batches/${priceBatch.id}/process`,
    { method: "POST", expected: 201, identity: supplier },
  )
).payload;
if (processedPrice.processedRows !== 41 || processedPrice.errorRows !== 0)
  throw new Error(
    `Text PDF processing failed: ${JSON.stringify(processedPrice)}`,
  );
record("normalization_and_matching_queue", "PASSED", {
  processedRows: processedPrice.processedRows,
  errors: processedPrice.errorRows,
});

const catalogBatch = (
  await request(`/suppliers/${supplier.organizationId}/import-batches`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      sourceId: source.id,
      fileName: path.basename(catalogPdfPath),
      fileType: "PDF",
      contentBase64: await fileBase64(catalogPdfPath),
      columnMapping: mapping,
    },
  })
).payload;
if (
  catalogBatch.status !== "REVIEW_REQUIRED" ||
  catalogBatch.totalRows !== 0 ||
  catalogBatch.extractionMetadata?.method !== "pdf_no_table"
)
  throw new Error(
    `Image-only PDF safety route failed: ${JSON.stringify(catalogBatch)}`,
  );
const blockedCatalogProcessing = await request(
  `/suppliers/${supplier.organizationId}/import-batches/${catalogBatch.id}/process`,
  { method: "POST", expected: 400, identity: supplier },
);
record("real_image_catalog_safe_review", "PASSED", {
  batchId: catalogBatch.id,
  status: catalogBatch.status,
  processHttpStatus: blockedCatalogProcessing.status,
  inventedRows: 0,
});

const duplicateBatch = (
  await request(`/suppliers/${supplier.organizationId}/import-batches`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      sourceId: source.id,
      fileName: "duplicate-control-row.json",
      fileType: "MANUAL",
      columnMapping: {
        externalId: "externalId",
        name: "name",
        supplierSku: "supplierSku",
        gtin: "gtin",
        unit: "unit",
      },
      rows: [
        {
          externalId: `duplicate-${suffix}`,
          name: "Перчатки нитриловые SafeTouch Ultra",
          supplierSku: "ST-ULTRA-M-BLUE",
          gtin: "4870000000101",
          unit: "уп",
        },
      ],
    },
  })
).payload;
await request(
  `/suppliers/${supplier.organizationId}/import-batches/${duplicateBatch.id}/process`,
  { method: "POST", expected: 201, identity: supplier },
);
const items = (
  await request(`/suppliers/${supplier.organizationId}/external-items`, {
    identity: supplier,
  })
).payload;
const duplicateItem = items.find(
  (item) => item.externalId === `duplicate-${suffix}`,
);
const exactCandidate = duplicateItem?.matchCandidates?.find(
  (candidate) =>
    candidate.productVariantId === GLOVE_VARIANT_ID &&
    Number(candidate.score) === 1,
);
if (!duplicateItem || !exactCandidate || duplicateItem.productCandidate)
  throw new Error(
    "Exact duplicate was not routed to the existing catalog card",
  );
await request(
  `/suppliers/${supplier.organizationId}/external-items/${duplicateItem.id}/match`,
  {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: { productVariantId: GLOVE_VARIANT_ID },
  },
);
record("catalog_deduplication", "PASSED", {
  externalItemId: duplicateItem.id,
  matchedVariantId: GLOVE_VARIANT_ID,
  score: Number(exactCandidate.score),
  newCardCreated: false,
});

const offer = (
  await request(`/suppliers/${supplier.organizationId}/offers`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      productVariantId: GLOVE_VARIANT_ID,
      sourceId: source.id,
      supplierSku: `PDF-TEST-${suffix}`,
      baseUnitsPerSaleUnit: 1,
      minimumOrderQuantity: 1,
      orderIncrement: 1,
      confirmationMode: "MANUAL",
      sourceType: "IMPORT",
      externalId: duplicateItem.externalId,
    },
  })
).payload;
await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/price`,
  {
    method: "PUT",
    identity: supplier,
    body: {
      amountMinor: 100,
      currency: "KZT",
      includesVat: true,
      source: "MANUAL",
      reason: "Explicit isolated test price; not extracted from PDF",
    },
  },
);
const balance = (
  await request(`/suppliers/${supplier.organizationId}/inventory/balances`, {
    method: "PUT",
    identity: supplier,
    body: {
      warehouseId: warehouse.id,
      productVariantId: GLOVE_VARIANT_ID,
      offerId: offer.id,
      quantityOnHand: 1,
      quantityReserved: 0,
      safetyStock: 0,
      source: "MANUAL",
    },
  })
).payload;
const noAgreement = await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
  {
    method: "PUT",
    expected: 403,
    identity: supplier,
    body: { status: "PUBLISHED", marketplaceVisible: true },
  },
);
record("agreement_publication_gate", "PASSED", {
  httpStatus: noAgreement.status,
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
    body: { signerName: "TEST PDF Supplier", expiresInMinutes: 60 },
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
const missingCompliance = await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
  {
    method: "PUT",
    expected: 409,
    identity: supplier,
    body: { status: "PUBLISHED", marketplaceVisible: true },
  },
);
record("license_and_registration_gate", "PASSED", {
  httpStatus: missingCompliance.status,
  expected: "REVIEW_REQUIRED",
});

const notification = (
  await request(
    `/compliance/organizations/${supplier.organizationId}/credentials`,
    {
      method: "POST",
      expected: 201,
      identity: supplier,
      body: {
        type: "MEDICAL_DEVICE_SALE_NOTIFICATION",
        number: `TEST-NOTICE-${suffix}`,
        issuer: "Automated test only",
        validFrom: new Date(Date.now() - 86_400_000).toISOString(),
        validTo: new Date(Date.now() + 86_400_000).toISOString(),
        metadata: { testOnly: true, legalEffect: false },
      },
    },
  )
).payload;
await request(`/compliance/credentials/${notification.id}/review`, {
  method: "POST",
  expected: 201,
  identity: OPERATOR,
  body: { status: "VERIFIED" },
});
const lot = (
  await request(`/suppliers/${supplier.organizationId}/inventory/lots`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      inventoryBalanceId: balance.id,
      offerId: offer.id,
      lotNumber: `TEST-LOT-${suffix}`,
      expirationDate: "2028-12-31",
      registrationCertificate: `TEST-KZ-RC-${suffix}`,
      originSource: "Изолированный тест подтверждённого канала",
      quantityOnHand: 1,
      quantityReserved: 0,
      status: "ACTIVE",
    },
  })
).payload;
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
await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
  {
    method: "PUT",
    identity: supplier,
    body: {
      status: "HIDDEN",
      marketplaceVisible: false,
      blockedReason: "Боевой тест завершён; организация и документы тестовые",
    },
  },
);
record("compliance_pass_publish_cleanup", "PASSED_AND_HIDDEN", {
  credentialId: notification.id,
  lotId: lot.id,
  publishedAt: publication.publishedAt,
  finalVisibility: false,
});

const report = {
  verified: true,
  mode: "ISOLATED_PRODUCTION_PATH_TEST_NO_LEGAL_EFFECT",
  supplier: {
    organizationId: supplier.organizationId,
    actorId: supplier.actorId,
  },
  files: {
    price: path.basename(pricePdfPath),
    catalog: path.basename(catalogPdfPath),
  },
  steps,
};
const outputDir = path.resolve("outputs/pdf-supplier-cycle-20260717");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  path.join(outputDir, "verification.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

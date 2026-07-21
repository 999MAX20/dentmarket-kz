import fs from "node:fs/promises";
import path from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const API = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const SECRET =
  process.env.SIGNATURE_CALLBACK_SECRET ??
  "local-signature-callback-secret-2026";
const csvPath = process.argv[2];
if (!csvPath)
  throw new Error(
    "Usage: node scripts/verify-csv-supplier-cycle.mjs <catalog.csv>",
  );
const OPERATOR = {
  actorId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000001",
  bin: "000000000001",
};
const rows = parse(await fs.readFile(csvPath), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  trim: true,
});
const priced =
  rows.find(
    (row) => row.name && Number(row.priceMinor) > 0 && row.supplierSku,
  ) ?? rows.find((row) => row.name && Number(row.priceMinor) > 0);
if (!priced) throw new Error("CSV must contain a priced product");
const headers = (identity) => ({
  ...(identity
    ? {
        "x-user-id": identity.actorId,
        "x-organization-id": identity.organizationId,
      }
    : {}),
});
async function request(
  endpoint,
  { method = "GET", body, identity, expected = 200, headers: extra = {} } = {},
) {
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers(identity),
      ...extra,
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
  return payload;
}
async function callback(signature, checksum, bin) {
  const payload = {
    signatureId: signature.id,
    externalSessionId: signature.externalSessionId,
    status: "SIGNED",
    externalSignatureId: `csv-test-${randomUUID()}`,
    signedDocumentChecksum: checksum,
    certificate: {
      subjectBin: bin,
      issuer: "DentMarket isolated CSV test authority",
      serialNumber: `TEST-${randomUUID()}`,
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validTo: new Date(Date.now() + 86_400_000).toISOString(),
    },
    evidence: { verification: "csv_supplier_cycle", legalEffect: false },
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  return request("/documents/signatures/callback", {
    method: "POST",
    expected: 201,
    body: payload,
    headers: {
      "x-signature-event-id": `csv-test-${randomUUID()}`,
      "x-signature-timestamp": timestamp,
      "x-signature-signature": createHmac("sha256", SECRET)
        .update(`${timestamp}.${body}`)
        .digest("hex"),
    },
  });
}
const suffix = `${Date.now()}`.slice(-12);
const bin = suffix;
const registration = await request("/onboarding/registrations", {
  method: "POST",
  expected: 201,
  body: {
    email: `csv-cycle.${suffix}@example.kz`,
    ownerDisplayName: "CSV supplier cycle",
    legalName: `ТОО TEST CSV Supplier ${suffix}`,
    organizationDisplayName: `TEST CSV Supplier ${suffix}`,
    bin,
    capability: "SUPPLIER",
    termsAccepted: true,
    privacyAccepted: true,
    marketingConsent: false,
    consentVersion: "2026-07-17",
    source: "automated-csv-supplier-cycle",
    idempotencyKey: randomUUID(),
  },
});
const completed = await request(
  "/onboarding/registrations/complete-development",
  {
    method: "POST",
    expected: 201,
    body: { registrationToken: registration.registrationToken },
  },
);
const supplier = {
  actorId: completed.actorId,
  organizationId: completed.organizationId,
};
await request(`/suppliers/${supplier.organizationId}/profile`, {
  method: "POST",
  expected: 201,
  identity: supplier,
  body: {
    regulatoryDetails: { testOnly: true, sourceFile: path.basename(csvPath) },
  },
});
const warehouse = await request(
  `/suppliers/${supplier.organizationId}/warehouses`,
  {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      code: `CSV_${suffix.slice(-8)}`,
      name: "Тестовый склад CSV",
      addressLine: "Изолированный автоматизированный тест",
      timezone: "Asia/Almaty",
    },
  },
);
const source = await request(
  `/suppliers/${supplier.organizationId}/data-sources`,
  {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      name: `CSV прайс ${path.basename(csvPath)}`,
      type: "EXCEL",
      configuration: { sourceFile: path.basename(csvPath), testOnly: true },
    },
  },
);
const mapping = {
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
const batch = await request(
  `/suppliers/${supplier.organizationId}/import-batches`,
  {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      sourceId: source.id,
      fileName: path.basename(csvPath),
      fileType: "MANUAL",
      columnMapping: mapping,
      rows: rows.map(
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
      ),
    },
  },
);
const processed = await request(
  `/suppliers/${supplier.organizationId}/import-batches/${batch.id}/process`,
  { method: "POST", expected: 201, identity: supplier },
);
if (processed.errorRows !== 0)
  throw new Error(`CSV processing errors: ${processed.errorRows}`);
const items = await request(
  `/suppliers/${supplier.organizationId}/external-items`,
  { identity: supplier },
);
const item = items.find(
  (candidate) => candidate.externalId === priced.externalId,
);
const candidate = item?.matchCandidates?.[0];
const variantId = item?.matchedVariantId ?? candidate?.productVariantId;
if (!item || !variantId)
  throw new Error(`No canonical match for ${priced.externalId}`);
const existingOffers = await request(
  `/suppliers/${supplier.organizationId}/offers`,
  { identity: supplier },
);
const offer =
  existingOffers.find(
    (candidateOffer) => candidateOffer.externalId === priced.externalId,
  ) ??
  (await request(`/suppliers/${supplier.organizationId}/offers`, {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      productVariantId: variantId,
      sourceId: source.id,
      supplierSku: priced.supplierSku || null,
      baseUnitsPerSaleUnit: 1,
      minimumOrderQuantity: 1,
      orderIncrement: 1,
      confirmationMode: "MANUAL",
      sourceType: "IMPORT",
      externalId: priced.externalId,
    },
  }));
await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/price`,
  {
    method: "PUT",
    identity: supplier,
    body: {
      amountMinor: Number(priced.priceMinor),
      currency: priced.currency || "KZT",
      includesVat: true,
      source: "IMPORT",
      reason: "Automated isolated CSV test",
    },
  },
);
await request(`/suppliers/${supplier.organizationId}/inventory/balances`, {
  method: "PUT",
  identity: supplier,
  body: {
    warehouseId: warehouse.id,
    productVariantId: variantId,
    offerId: offer.id,
    quantityOnHand: 1,
    quantityReserved: 0,
    safetyStock: 0,
    source: "IMPORT",
  },
});
const credential = await request(
  `/compliance/organizations/${supplier.organizationId}/credentials`,
  {
    method: "POST",
    expected: 201,
    identity: supplier,
    body: {
      type: "OTHER",
      number: `TEST-${suffix}`,
      issuer: "Automated CSV test",
      metadata: { testOnly: true, legalEffect: false },
    },
  },
);
await request(`/compliance/credentials/${credential.id}/review`, {
  method: "POST",
  expected: 201,
  identity: OPERATOR,
  body: { status: "VERIFIED" },
});
const balance = await request(
  `/suppliers/${supplier.organizationId}/inventory/balances`,
  {
    method: "PUT",
    identity: supplier,
    body: {
      warehouseId: warehouse.id,
      productVariantId: variantId,
      offerId: offer.id,
      quantityOnHand: 1,
      quantityReserved: 0,
      safetyStock: 0,
      source: "IMPORT",
    },
  },
);
await request(`/suppliers/${supplier.organizationId}/inventory/lots`, {
  method: "POST",
  expected: 201,
  identity: supplier,
  body: {
    inventoryBalanceId: balance.id,
    offerId: offer.id,
    lotNumber: `TEST-${suffix}`,
    expirationDate: "2028-12-31",
    registrationCertificate: `TEST-RC-${suffix}`,
    originSource: "Изолированный тест",
    quantityOnHand: 1,
  },
});
const publication = await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
  {
    method: "PUT",
    expected: 200,
    identity: supplier,
    body: { status: "PUBLISHED", marketplaceVisible: true },
  },
);
await request(
  `/suppliers/${supplier.organizationId}/offers/${offer.id}/publication`,
  {
    method: "PUT",
    expected: 200,
    identity: supplier,
    body: {
      status: "HIDDEN",
      marketplaceVisible: false,
      blockedReason: "Automated test finished",
    },
  },
);
const report = {
  verified: true,
  mode: "ISOLATED_PRODUCTION_PATH_TEST_NO_LEGAL_EFFECT",
  sourceFile: path.basename(csvPath),
  importedRows: rows.length,
  processedRows: processed.processedRows,
  matchedExternalId: priced.externalId,
  matchedProductVariantId: variantId,
  candidateScore: Number(candidate?.score ?? 1),
  publicationWithoutPlatformAgreementHttpStatus: 200,
  publishedAt: publication.publishedAt,
  finalVisibility: false,
  supplierOrganizationId: supplier.organizationId,
};
const out = path.resolve(
  "outputs",
  `csv-supplier-cycle-${path.basename(csvPath, ".csv")}`,
);
await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  path.join(out, "verification.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

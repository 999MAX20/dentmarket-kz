import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const filePath = process.argv[2] ?? "outputs/catalog-import-fixture-sample-20260717/catalog-import-mixed-fixture.xlsx";
const OPERATOR = { actorId: "00000000-0000-4000-8000-000000000002", organizationId: "00000000-0000-4000-8000-000000000001" };
const bytes = await fs.readFile(path.resolve(filePath));
const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(path.resolve(filePath)), "manifest.json"), "utf8"));
const rows = manifest.rows;
const suffix = `${Date.now()}`.slice(-12);
const headersFor = (identity) => ({ ...(identity ? { "x-user-id": identity.actorId, "x-organization-id": identity.organizationId } : {}) });
async function request(endpoint, { method = "GET", body, identity, expected = 200 } = {}) {
  console.log(`${method} ${endpoint}`);
  const response = await fetch(`${API}${endpoint}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headersFor(identity) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const text = await response.text(); const payload = text ? JSON.parse(text) : null; const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status)) throw new Error(`${method} ${endpoint}: expected ${statuses.join("/")}, got ${response.status}: ${text}`);
  return payload;
}
const registration = await request("/onboarding/registrations", { method: "POST", expected: 201, body: { email: `xlsx-mixed.${suffix}@example.kz`, ownerDisplayName: "XLSX mixed scenario", legalName: `ТОО TEST XLSX Mixed ${suffix}`, organizationDisplayName: `TEST XLSX Mixed ${suffix}`, bin: suffix, capability: "SUPPLIER", termsAccepted: true, privacyAccepted: true, marketingConsent: false, consentVersion: "2026-07-17", source: "automated-xlsx-mixed-scenario", idempotencyKey: randomUUID() } });
const completed = await request("/onboarding/registrations/complete-development", { method: "POST", expected: 201, body: { registrationToken: registration.registrationToken } });
const supplier = { actorId: completed.actorId, organizationId: completed.organizationId };
await request(`/suppliers/${supplier.organizationId}/profile`, { method: "POST", expected: 201, identity: supplier, body: { regulatoryDetails: { testOnly: true, sourceFile: path.basename(filePath) } } });
await request(`/suppliers/${supplier.organizationId}/warehouses`, { method: "POST", expected: 201, identity: supplier, body: { code: `XLSX_${suffix.slice(-8)}`, name: "Тестовый склад XLSX", addressLine: "Изолированный автоматизированный тест", timezone: "Asia/Almaty" } });
const source = await request(`/suppliers/${supplier.organizationId}/data-sources`, { method: "POST", expected: 201, identity: supplier, body: { name: `XLSX mixed ${path.basename(filePath)}`, type: "EXCEL", configuration: { sourceFile: path.basename(filePath), testOnly: true } } });
const mapping = { externalId: "externalId", name: "name", supplierSku: "supplierSku", brand: "brand", manufacturer: "manufacturer", unit: "unit", priceMinor: "priceMinor", currency: "currency", quantityOnHand: "quantityOnHand" };
const batch = await request(`/suppliers/${supplier.organizationId}/import-batches`, { method: "POST", expected: 201, identity: supplier, body: { sourceId: source.id, fileName: path.basename(filePath), fileType: "EXCEL", contentBase64: bytes.toString("base64"), columnMapping: mapping } });
const processed = await request(`/suppliers/${supplier.organizationId}/import-batches/${batch.id}/process`, { method: "POST", expected: 201, identity: supplier });
const items = await request(`/suppliers/${supplier.organizationId}/external-items`, { identity: supplier });
const existing = items.filter((item) => item.matchCandidates?.length > 0);
const missing = items.filter((item) => item.productCandidate && item.matchCandidates?.length === 0);
const missingFixtureIds = new Set(rows.filter((row) => row.expectedAction === "CREATE_PRODUCT_CANDIDATE").map((row) => String(row.externalId)));
const existingFixtureIds = new Set(rows.filter((row) => row.expectedAction === "USE_EXISTING_CARD").map((row) => String(row.externalId)));
const existingMatched = items.filter((item) => existingFixtureIds.has(item.externalId) && item.matchCandidates?.length > 0).length;
const missingProposed = items.filter((item) => missingFixtureIds.has(item.externalId) && item.productCandidate && item.matchCandidates?.length === 0).length;
if (processed.errorRows !== 0 || items.length !== rows.length || existingMatched !== existingFixtureIds.size || missingProposed !== missingFixtureIds.size) throw new Error(`Mixed XLSX assertions failed: ${JSON.stringify({ processed, itemCount: items.length, existingMatched, existingExpected: existingFixtureIds.size, missingProposed, missingExpected: missingFixtureIds.size })}`);
const report = { verified: true, mode: "ISOLATED_PRODUCTION_PATH_TEST_NO_LEGAL_EFFECT", file: path.basename(filePath), fullFixture: "outputs/catalog-import-fixture-20260717/catalog-import-mixed-fixture.xlsx", uploadedFileType: "EXCEL", importedRows: rows.length, processedRows: processed.processedRows, errorRows: processed.errorRows, existingRows: existing.length, missingRows: missing.length, existingMatched, missingProposed, supplierOrganizationId: supplier.organizationId, batchId: batch.id };
const out = path.resolve("outputs", "xlsx-mixed-scenario-20260717"); await fs.mkdir(out, { recursive: true }); await fs.writeFile(path.join(out, "verification.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));

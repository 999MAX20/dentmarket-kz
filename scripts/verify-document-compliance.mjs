import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const actorId = "00000000-0000-4000-8000-000000000002";
const operatorOrganizationId = "00000000-0000-4000-8000-000000000001";
const supplierOrganizationId = "00000000-0000-4000-8000-000000000025";
const buyerOrganizationId = "00000000-0000-4000-8000-000000000030";
const headers = { "content-type": "application/json", "x-user-id": actorId, "x-organization-id": operatorOrganizationId };

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function json(path, method = "GET", body) {
  return (await request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })).json();
}

const templates = await json("/documents/templates");
const template = templates.find(({ code }) => code === "ORDER_SPECIFICATION_RU");
if (!template) throw new Error("Seeded document template is missing");
const supplierOrders = await json("/supplier-orders");
const supplierOrder = supplierOrders.find((order) => order.supplierOrganizationId === supplierOrganizationId);
if (!supplierOrder) throw new Error("Current database has no supplier order for the document scenario");
const supplierOrderId = supplierOrder.id;
const suffix = Date.now();
const document = await json("/documents/generate", "POST", {
  ownerOrganizationId: supplierOrganizationId,
  templateId: template.id,
  supplierOrderId,
  title: "Спецификация к заказу E2E",
  documentNumber: `SPEC-E2E-${suffix}`,
  data: {
    order: { number: "SO-E2E", total: "2250.00", currency: "KZT", items: "Стоматологический материал — 1 упаковка" },
    supplier: { name: "Dental Equipment KZ" },
    buyer: { name: "Стоматология Алматы" },
  },
});
const session = await json(`/documents/${document.id}/signature-sessions`, "POST", { method: "MOCK", signerOrganizationId: supplierOrganizationId, signerName: "Директор поставщика" });
const signature = await json(`/documents/signatures/${session.signature.id}/complete`, "POST", { status: "SIGNED", externalSignatureId: `mock-${suffix}`, evidence: { verified: true } });
const download = await request(`/documents/${document.id}/download`);
const pdf = Buffer.from(await download.arrayBuffer());
await mkdir(".tmp/e2e", { recursive: true });
await writeFile(".tmp/e2e/document-engine.pdf", pdf);
if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("Generated document is not a PDF");
if (download.headers.get("etag") !== document.checksumSha256) throw new Error("Downloaded document checksum header differs from immutable snapshot");
const version = await json(`/documents/${document.id}/versions`, "POST", {
  reason: "Сквозная проверка версионности",
  data: { order: { number: "SO-E2E", total: "2250.00", currency: "KZT", items: "Материал — 1 упаковка" }, supplier: { name: "Dental Equipment KZ" }, buyer: { name: "Стоматология Алматы" } },
});
const superseded = await json(`/documents/${document.id}`);
if (version.version !== 2 || superseded.status !== "SUPERSEDED") throw new Error("Document version chain was not preserved");

const credential = await json(`/compliance/organizations/${supplierOrganizationId}/credentials`, "POST", { type: "WHOLESALE_LICENSE", number: `E2E-${suffix}`, issuer: "Mock regulator", validFrom: "2026-01-01T00:00:00.000Z", validTo: "2028-01-01T00:00:00.000Z" });
await json(`/compliance/credentials/${credential.id}/review`, "POST", { status: "VERIFIED" });
const categories = await json("/catalog/categories");
const category = categories.find(({ code }) => code === "demo-materials");
const balances = await json(`/suppliers/${supplierOrganizationId}/inventory/balances`);
const balance = balances.find(({ offerId }) => offerId === "00000000-0000-4000-8000-000000000044") ?? balances[0];
if (!balance) throw new Error("Supplier inventory balance is missing");
const ruleResult = await json("/compliance/rules", "POST", {
  code: `E2E.MEDICAL.${suffix}`,
  version: 1,
  name: "E2E проверка медицинской продукции",
  industryCode: "dentistry-kz",
  categoryId: category?.id,
  riskLevel: "YELLOW",
  decision: "ALLOWED_WITH_DISCLOSURE",
  priority: 5,
  conditions: { requirements: { lotRequired: true, registrationCertificateRequired: true, minimumRemainingShelfLifeDays: 30 } },
  requiredCredentialTypes: ["WHOLESALE_LICENSE"],
  disclosureText: "Проверены документы поставщика и партии",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  status: "ACTIVE",
});
const check = await json("/compliance/checks/evaluate", "POST", {
  sellerOrganizationId: supplierOrganizationId,
  buyerOrganizationId,
  offerId: balance.offerId,
  warehouseId: balance.warehouseId,
  inventoryLotId: balance.lots?.[0]?.id,
});
if (check.status === "REVIEW_REQUIRED") await json(`/compliance/checks/${check.id}/review`, "POST", { decision: "ALLOWED_WITH_DISCLOSURE", comment: "E2E: документы и происхождение проверены оператором" });
if (check.status === "BLOCKED") throw new Error("Configured non-blocking E2E compliance rule unexpectedly blocked the offer");

await request("/notifications/process", { method: "POST" });
const notifications = await json(`/notifications/organizations/${supplierOrganizationId}?limit=200`);
const relevant = notifications.filter(({ aggregateId }) => [document.id, check.id, credential.id].includes(aggregateId));
if (relevant.length === 0 || relevant.some(({ status }) => status !== "SENT")) throw new Error("Domain events were not delivered as durable notifications");

console.log(JSON.stringify({
  document: { id: document.id, signedStatus: signature.document.status, version2Id: version.id, previousStatus: superseded.status, bytes: pdf.byteLength },
  compliance: { credentialStatus: "VERIFIED", ruleId: ruleResult.rule.id, checkStatus: check.status, recheckedOffers: ruleResult.recheck.checked },
  notifications: { relevant: relevant.length, sent: relevant.filter(({ status }) => status === "SENT").length },
}, null, 2));

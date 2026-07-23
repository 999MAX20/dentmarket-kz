import fs from "node:fs/promises";
import path from "node:path";

const registryPath = path.resolve("data/kz-market-brands.json");
const publicCatalogPath = path.resolve("apps/buyer-web/app/data/public-catalog-fallback.json");
const evidenceDir = path.resolve("data/catalog-evidence");
const classificationPath = path.resolve("data/catalog-evidence/kz-market-label-classifications.json");
const jsonOutputPath = path.resolve("data/reports/kz-brand-catalog-coverage.json");
const mdOutputPath = path.resolve("data/reports/kz-brand-catalog-coverage.md");
const queueOutputPath = path.resolve("data/curation/kz-brand-catalog-coverage-queue.csv");

const evidenceFiles = [
  "nordstom-full-catalog.json",
  "toboom-manufacturer-catalog.json",
  "vladmiva-dental-catalog.json",
  "ztdental-manufacturer-catalog.json",
  "pierrot-manufacturer-catalog.json",
  "latus-manufacturer-catalog.json",
  "dentkist-manufacturer-catalog.json",
  "cormed-manufacturer-catalog.json",
  "saeshin-manufacturer-catalog.json",
  "nic-manufacturer-catalog.json",
  "imd-manufacturer-catalog.json",
  "alpha-bio-kz-catalog.json",
  "osstem-kz-catalog.json",
  "medesy-manufacturer-catalog.json",
  "septodont-manufacturer-catalog.json",
  "zhermack-manufacturer-catalog.json",
  "melag-manufacturer-catalog.json",
  "dio-manufacturer-catalog.json",
  "medit-manufacturer-catalog.json",
  "shining3d-manufacturer-catalog.json",
  "genoray-manufacturer-catalog.json",
  "good-doctors-manufacturer-catalog.json",
  "osung-manufacturer-catalog.json",
  "bego-manufacturer-catalog.json",
  "durr-dental-manufacturer-catalog.json",
  "ray-manufacturer-catalog.json",
  "myobrace-manufacturer-catalog.json",
  "kavo-manufacturer-catalog.json",
  "morita-manufacturer-catalog.json",
  "revyline-kz-catalog.json",
  "binergia-manufacturer-catalog.json",
  "lintex-manufacturer-catalog.json",
  "medidez-kz-catalog.json",
  "aes-kz-catalog.json",
  "biola-kz-catalog.json",
  "amazing-white-manufacturer-catalog.json",
  "anthos-manufacturer-catalog.json",
  "denti-kz-brand-listings.json",
  "averon-manufacturer-catalog.json",
  "bilumix-manufacturer-catalog.json",
  "ajax-manufacturer-catalog.json",
  "dental-art-manufacturer-catalog.json",
  "castellini-manufacturer-catalog.json",
  "diplomat-dental-manufacturer-catalog.json",
  "doctor-smile-manufacturer-catalog.json",
  "dental-x-regional-catalog.json",
  "denu-manufacturer-catalog.json",
  "up3d-manufacturer-catalog.json",
  "myray-manufacturer-catalog.json",
  "mgf-manufacturer-catalog.json",
  "kaeser-dental-catalog.json",
  "humanchemie-manufacturer-catalog.json",
  "madespa-manufacturer-catalog.json",
  "handy-manufacturer-catalog.json",
  "olident-manufacturer-catalog.json",
  "falcon-manufacturer-catalog.json",
  "sani-manufacturer-catalog.json",
  "nti-manufacturer-catalog.json",
  "strauss-manufacturer-catalog.json",
  "suntem-manufacturer-catalog.json",
  "mercury-manufacturer-catalog.json",
  "gapadent-manufacturer-catalog.json",
  "draeger-anesthesia-catalog.json",
  "bisco-manufacturer-catalog.json",
  "gc-europe-catalog.json",
  "nsk-manufacturer-catalog.json",
  "wh-manufacturer-catalog.json",
  "ultradent-manufacturer-catalog.json",
  "ivoclar-russia-catalog.json",
  "tealth-manufacturer-catalog.json",
  "cicada-manufacturer-catalog.json",
  "youjoy-manufacturer-catalog.json",
  "shofu-manufacturer-catalog.json",
  "voco-manufacturer-catalog.json",
  "kuraray-noritake-manufacturer-catalog.json",
  "kulzer-manufacturer-catalog.json",
  "vita-manufacturer-catalog.json",
  "lm-dental-manufacturer-catalog.json",
  "woodpecker-manufacturer-catalog.json",
  "fomos-manufacturer-catalog.json",
  "dentsply-sirona-manufacturer-catalog.json",
  "kerr-manufacturer-catalog.json",
  "solventum-dental-catalog.json",
  "vrn-manufacturer-catalog.json",
  "iqdent-manufacturer-catalog.json",
];
const aliases = new Map([
  ["top bm", "tor vm"],
  ["тор вм", "tor vm"],
  ["hummer - pak", "hummer-pak"],
  ["dentkist, inc", "dentkist"],
  ["зао бинергия", "бинергия"],
  ["кристидент", "kristident"],
  ["омега дент", "omega dent"],
  ["стомадент", "stomadent"],
  ["alpha-bio tec.", "alpha-bio tec"],
]);
const key = (value) => {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("ru");
  return aliases.get(normalized) ?? normalized;
};
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const classifications = JSON.parse(await fs.readFile(classificationPath, "utf8"));
const classificationMap = new Map((classifications.classifications ?? []).map((entry) => [key(entry.label), entry]));
const publicCatalog = JSON.parse(await fs.readFile(publicCatalogPath, "utf8"));
const brandNames = [...new Set([
  ...(registry.existingCatalogBrands ?? []),
  ...(registry.sources ?? []).flatMap((source) => source.brands ?? []),
])].sort((a, b) => a.localeCompare(b, "ru"));
const publicCounts = new Map();
for (const product of publicCatalog.products ?? []) {
  const brandKey = key(product.brand);
  publicCounts.set(brandKey, (publicCounts.get(brandKey) ?? 0) + 1);
}
const evidenceCounts = new Map();
const evidenceSources = new Map();
for (const file of evidenceFiles) {
  const report = JSON.parse(await fs.readFile(path.join(evidenceDir, file), "utf8"));
  for (const product of report.products ?? []) {
    const brandKey = key(product.brand || report.brand);
    evidenceCounts.set(brandKey, (evidenceCounts.get(brandKey) ?? 0) + 1);
    const sources = evidenceSources.get(brandKey) ?? new Set();
    sources.add(file);
    evidenceSources.set(brandKey, sources);
  }
}
const rows = brandNames.map((brand) => {
  const brandKey = key(brand);
  const manufacturerEvidenceProducts = evidenceCounts.get(brandKey) ?? 0;
  const publicProducts = publicCounts.get(brandKey) ?? 0;
  const classification = classificationMap.get(brandKey);
  const status = manufacturerEvidenceProducts > 0
    ? "STRUCTURED_EVIDENCE_COLLECTED"
    : classification
      ? "MARKET_LABEL_CLASSIFIED_NO_CANONICAL_CATALOG"
      : publicProducts > 0
        ? "PUBLIC_CATALOG_RECONCILIATION_REQUIRED"
        : "PRODUCT_DISCOVERY_REQUIRED";
  return {
    brand,
    manufacturerEvidenceProducts,
    publicProducts,
    evidenceSources: [...(evidenceSources.get(brandKey) ?? [])].join(" | "),
    classificationStatus: classification?.classificationStatus ?? "",
    classificationReason: classification?.reason ?? "",
    status,
  };
});
const statusCounts = Object.fromEntries([...new Set(rows.map((row) => row.status))].map((status) => [status, rows.filter((row) => row.status === status).length]));
const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    marketBrandWithoutProductsRemainsInDiscoveryQueueUnlessClassified: true,
    supplierAndAmbiguousLabelsDoNotGenerateManufacturerCards: true,
    publicCatalogPresenceDoesNotProveFullManufacturerLine: true,
    structuredEvidenceDoesNotAuthorizeAutomaticPublicationWithoutExactKzSkuEvidence: true,
  },
  totals: { marketBrands: rows.length, ...statusCounts },
  brands: rows,
};
const headers = ["brand", "manufacturerEvidenceProducts", "publicProducts", "evidenceSources", "classificationStatus", "classificationReason", "status"];
const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))].join("\n") + "\n";
const markdown = `# Kazakhstan brand catalog coverage\n\nGenerated: ${report.generatedAt}\n\n- Market brands: ${rows.length}\n- Structured evidence collected: ${statusCounts.STRUCTURED_EVIDENCE_COLLECTED ?? 0}\n- Public catalog reconciliation required: ${statusCounts.PUBLIC_CATALOG_RECONCILIATION_REQUIRED ?? 0}\n- Market labels classified without canonical catalog: ${statusCounts.MARKET_LABEL_CLASSIFIED_NO_CANONICAL_CATALOG ?? 0}\n- Product discovery required: ${statusCounts.PRODUCT_DISCOVERY_REQUIRED ?? 0}\n\n| Brand | Evidence products | Public products | Status |\n|---|---:|---:|---|\n${rows.map((row) => `| ${row.brand} | ${row.manufacturerEvidenceProducts} | ${row.publicProducts} | ${row.status} |`).join("\n")}\n`;
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(mdOutputPath, markdown),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));

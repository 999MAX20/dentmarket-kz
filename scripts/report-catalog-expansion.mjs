import fs from "node:fs/promises";
import path from "node:path";

const catalogPath = path.resolve(
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const representativesPath = path.resolve("data/brand-representatives-kz.csv");
const expansionPath = path.resolve("data/catalog-expansion-wave-1.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record, rowIndex) => {
    if (record.length !== headers.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} has ${record.length} columns; expected ${headers.length}`,
      );
    }
    return Object.fromEntries(
      headers.map((header, columnIndex) => [header, record[columnIndex]]),
    );
  });
}

const [catalog, representativesText, expansionText] = await Promise.all([
  fs.readFile(catalogPath, "utf8").then(JSON.parse),
  fs.readFile(representativesPath, "utf8"),
  fs.readFile(expansionPath, "utf8"),
]);

const representatives = parseCsv(representativesText);
const expansion = parseCsv(expansionText);
const products = catalog.products ?? [];
const currentCounts = products.reduce((counts, product) => {
  if (product.brand) counts[product.brand] = (counts[product.brand] ?? 0) + 1;
  return counts;
}, {});

const requiredRepresentativeFields = [
  "brand",
  "manufacturer",
  "partnerName",
  "partnerRole",
  "evidenceLevel",
  "evidenceUrl",
  "verificationStatus",
  "lastChecked",
];
const requiredExpansionFields = [
  "priority",
  "brand",
  "manufacturer",
  "canonicalProductName",
  "category",
  "productType",
  "officialProductUrl",
  "kzPartnerCandidates",
  "evidenceStatus",
];

for (const [index, representative] of representatives.entries()) {
  for (const field of requiredRepresentativeFields) {
    if (!representative[field]) {
      throw new Error(`Representative row ${index + 2} is missing ${field}`);
    }
  }
  const url = new URL(representative.evidenceUrl);
  if (representative.evidenceLevel === "MANUFACTURER_DIRECTORY") {
    const manufacturerHosts = {
      Planmeca: "planmeca.com",
      NSK: "nsk-dental.com",
      Solventum: "solventum.com",
      Ivoclar: "ivoclar.com",
      Kerr: "kerrdental.com",
    };
    const expectedHost = manufacturerHosts[representative.brand];
    if (expectedHost && !url.hostname.endsWith(expectedHost)) {
      throw new Error(
        `${representative.brand} evidence must be hosted on ${expectedHost}`,
      );
    }
  }
}

const canonicalKeys = new Set();
for (const [index, candidate] of expansion.entries()) {
  for (const field of requiredExpansionFields) {
    if (!candidate[field]) {
      throw new Error(`Expansion row ${index + 2} is missing ${field}`);
    }
  }
  new URL(candidate.officialProductUrl);
  const key =
    `${candidate.brand}|${candidate.canonicalProductName}`.toLocaleLowerCase(
      "ru",
    );
  if (canonicalKeys.has(key))
    throw new Error(`Duplicate expansion card: ${key}`);
  canonicalKeys.add(key);
}

const brands = [...new Set(expansion.map((candidate) => candidate.brand))];
const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    catalogEntity: "brand-model",
    sellerEntity: "offer",
    duplicateSellerCardsAllowed: false,
    publishWithoutVerifiedImage: false,
    publishBrandCardWithoutKazakhstanOffer: true,
    publishSellerOfferWithoutChecks: false,
  },
  representatives: {
    records: representatives.length,
    confirmed: representatives.filter(
      (representative) => representative.verificationStatus === "CONFIRMED",
    ).length,
    manualReview: representatives.filter((representative) =>
      ["MANUAL_REVIEW", "CONFIRM_WITH_MANUFACTURER"].includes(
        representative.verificationStatus,
      ),
    ).length,
  },
  expansion: {
    candidates: expansion.length,
    brands: brands.map((brand) => ({
      brand,
      currentCards: currentCounts[brand] ?? 0,
      queuedCards: expansion.filter((candidate) => candidate.brand === brand)
        .length,
      confirmedPartners: new Set(
        representatives
          .filter(
            (representative) =>
              representative.brand === brand &&
              representative.verificationStatus === "CONFIRMED",
          )
          .map((representative) => representative.partnerName),
      ).size,
    })),
    readyForContent: expansion.filter(
      (candidate) => candidate.contentStatus === "READY_FOR_CONTENT",
    ).length,
    exactModelSourceRequired: expansion.filter(
      (candidate) => candidate.contentStatus === "EXACT_MODEL_SOURCE_REQUIRED",
    ).length,
  },
};

console.log(JSON.stringify(report, null, 2));

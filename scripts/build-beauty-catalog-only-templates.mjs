import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const registry = JSON.parse(
  await fs.readFile(
    path.join(root, "data/verticals/beauty-kz/supplier-brand-registry.json"),
    "utf8",
  ),
);
const outputDir = path.join(root, "data/templates/beauty-kz");
const headers = [
  "externalId",
  "name",
  "supplierSku",
  "gtin",
  "brand",
  "manufacturer",
  "unit",
  "description",
  "category",
  "variantLabel",
  "imageUrl",
  "sourceUrl",
  "priceMinor",
  "currency",
  "quantityOnHand",
  "warehouse",
  "leadTimeDays",
  "lotNumber",
  "expirationDate",
];
await fs.mkdir(outputDir, { recursive: true });
for (const supplier of registry.suppliers) {
  const fileName = `${supplier.key}.csv`;
  const lines = [headers.join(",")];
  await fs.writeFile(path.join(outputDir, fileName), `${lines.join("\n")}\n`);
}
await fs.writeFile(
  path.join(outputDir, "README.md"),
  `# Beauty KZ catalog-only templates\n\nThese templates intentionally contain no commercial data. Suppliers may provide names, brands, characteristics, variants and source links first. Keep priceMinor, currency and quantityOnHand empty until a commercial price/stock file is uploaded. The importer can create or match draft catalog records without publishing an offer.\n\nGenerated for ${registry.suppliers.length} suppliers.\n`,
);
console.log(
  `Beauty catalog-only templates generated: ${registry.suppliers.length} files.`,
);

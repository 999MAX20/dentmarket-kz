import fs from "node:fs/promises";
import path from "node:path";

const catalogPath = path.resolve(
  process.cwd(),
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const products = Array.isArray(catalog) ? catalog : catalog.products;

if (!Array.isArray(products)) {
  throw new Error("В файле каталога отсутствует массив products.");
}

const errors = [];
const globalVariantIds = new Set();

for (const product of products) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) {
    errors.push(`${product.name}: нет вариантов товара`);
    continue;
  }

  const productSkus = new Set();
  const productLabels = new Set();
  for (const variant of variants) {
    const label = String(variant.label ?? "").trim();
    const sku = String(variant.sku ?? "").trim();
    const normalizedLabel = label.toLocaleLowerCase("ru");
    const normalizedSku = sku.toLocaleLowerCase("ru");

    if (!label) errors.push(`${product.name}: пустое название варианта`);
    if (/^ref(?:\s|$)/i.test(label))
      errors.push(`${product.name}: техническое название «${label}»`);
    if (sku && normalizedLabel === normalizedSku)
      errors.push(`${product.name}: вместо названия показан артикул «${sku}»`);
    if (variants.length > 1 && normalizedLabel === "стандартный вариант")
      errors.push(`${product.name}: варианты не расшифрованы`);

    if (!variant.id) errors.push(`${product.name}: у варианта нет id`);
    else if (globalVariantIds.has(variant.id))
      errors.push(`${product.name}: повторяется id варианта ${variant.id}`);
    else globalVariantIds.add(variant.id);

    if (sku && productSkus.has(normalizedSku))
      errors.push(`${product.name}: повторяется артикул ${sku}`);
    if (sku) productSkus.add(normalizedSku);

    if (productLabels.has(normalizedLabel))
      errors.push(`${product.name}: повторяется комплектация «${label}»`);
    productLabels.add(normalizedLabel);
  }
}

if (errors.length > 0) {
  throw new Error(
    `Проверка вариантов каталога не пройдена (${errors.length}):\n${errors
      .map((error) => `- ${error}`)
      .join("\n")}`,
  );
}

const variants = products.reduce(
  (total, product) => total + product.variants.length,
  0,
);
const multiVariantProducts = products.filter(
  (product) => product.variants.length > 1,
).length;

console.log(
  JSON.stringify(
    {
      catalogCards: products.length,
      variants,
      multiVariantCards: multiVariantProducts,
      technicalVariantLabels: 0,
    },
    null,
    2,
  ),
);

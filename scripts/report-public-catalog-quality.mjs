import fs from "node:fs/promises";
import path from "node:path";

const input = path.resolve(
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const catalog = JSON.parse(await fs.readFile(input, "utf8"));
const products = catalog.products ?? [];
const countBy = (getValue) =>
  Object.entries(
    products.reduce((result, product) => {
      const value = getValue(product);
      if (value) result[value] = (result[value] ?? 0) + 1;
      return result;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
const percent = (count) =>
  Number(((count / Math.max(products.length, 1)) * 100).toFixed(1));
const branded = products.filter((product) => product.brand).length;
const priced = products.filter(
  (product) => product.minNormalizedPriceMinor,
).length;
const available = products.filter((product) => product.isAvailable).length;
const multiSeller = products.filter(
  (product) =>
    new Set(product.offers.map((offer) => offer.supplier.name)).size > 1,
).length;

console.log(
  JSON.stringify(
    {
      generatedAt: catalog.generatedAt,
      cards: products.length,
      brandCoverage: {
        cards: branded,
        percent: percent(branded),
        brands: countBy((product) => product.brand).length,
      },
      commercialCoverage: {
        withPrice: { cards: priced, percent: percent(priced) },
        available: { cards: available, percent: percent(available) },
        multipleSellers: { cards: multiSeller, percent: percent(multiSeller) },
      },
      topBrands: countBy((product) => product.brand)
        .slice(0, 30)
        .map(([brand, cards]) => ({ brand, cards })),
      topCategories: countBy((product) => product.category)
        .slice(0, 20)
        .map(([category, cards]) => ({ category, cards })),
      quarantine: catalog.quarantine ?? [],
    },
    null,
    2,
  ),
);

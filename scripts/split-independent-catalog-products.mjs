import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const files = [
  "apps/buyer-web/app/data/production-approved-catalog.json",
  "apps/buyer-web/app/data/public-catalog-fallback.json",
];
const apply = process.argv.includes("--apply");

const stableId = (sourceId, key) =>
  `${sourceId}-part-${crypto
    .createHash("sha256")
    .update(`${sourceId}:${key}`)
    .digest("hex")
    .slice(0, 16)}`;

const normalized = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/™|®/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

function componentKey(product, variant) {
  const label = normalized(variant.label);
  const withoutProduct = label
    .replace(normalized(product.name), "")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|мл|g|г|гр|pc|pcs|шт|bottles?|brushes?)\b/giu, " ")
    .replace(/\b(?:a[1-4]|b[1-4]|c[1-4]|d[2-4]|oa[1-4]|transparent|universal)\b/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (/\b(?:kit|set|набор|комплект)\b/iu.test(withoutProduct))
    return { key: "set", label: "Наборы" };
  if (/\b(?:applicator brush|brush|кисточ)/iu.test(withoutProduct))
    return { key: "applicator-brush", label: "Кисти-аппликаторы" };
  if (/\b(?:measuring spoon|spoon|мерная лож)/iu.test(withoutProduct))
    return { key: "measuring-spoon", label: "Мерные ложки" };
  if (/\b(?:color guide|shade guide|c-guide|шкала|расцветк)/iu.test(withoutProduct))
    return { key: "shade-guide", label: "Шкалы оттенков" };
  if (/\b(?:drill|сверл)/iu.test(withoutProduct))
    return { key: "drill", label: "Сверла" };
  if (/\b(?:post|штифт)/iu.test(withoutProduct))
    return { key: "post", label: "Штифты" };
  if (/\bprimer\s+liquid/iu.test(withoutProduct))
    return { key: "primer-liquid", label: "Праймер" };
  if (/\bbond\s+liquid/iu.test(withoutProduct))
    return { key: "bond-liquid", label: "Бонд" };
  if (/\b(?:liquid|жидкост)/iu.test(withoutProduct))
    return { key: "liquid", label: "Жидкость" };
  if (/\b(?:powder|порош)/iu.test(withoutProduct))
    return { key: "powder", label: "Порошок" };
  if (/\bes\s+glaze/iu.test(withoutProduct))
    return { key: "es-glaze", label: "Глазурь ES" };
  if (/\bvc\s+glaze/iu.test(withoutProduct))
    return { key: "vc-glaze", label: "Глазурь VC" };
  if (/\bopaque/iu.test(withoutProduct))
    return { key: "opaque", label: "Опаковые массы" };
  if (/\b(?:accessor|насадк|держател|ключ)/iu.test(withoutProduct))
    return { key: "accessory", label: "Аксессуары" };
  return { key: "material", label: "Материал" };
}

function splitProduct(product) {
  if (!Array.isArray(product.variants) || product.variants.length < 2)
    return [product];
  const groups = new Map();
  for (const variant of product.variants) {
    const component = componentKey(product, variant);
    const current = groups.get(component.key) ?? {
      component,
      variants: [],
    };
    current.variants.push(variant);
    groups.set(component.key, current);
  }
  if (groups.size < 2) return [product];
  const independentGroups = [...groups.values()];
  const hasIndependentComponent = independentGroups.some(({ component }) =>
    [
      "applicator-brush",
      "measuring-spoon",
      "shade-guide",
      "drill",
      "post",
      "primer-liquid",
      "bond-liquid",
      "liquid",
      "powder",
      "accessory",
    ].includes(component.key),
  );
  if (!hasIndependentComponent) return [product];

  const primary =
    independentGroups.find(({ component }) => component.key === "set") ??
    independentGroups.toSorted(
      (left, right) => right.variants.length - left.variants.length,
    )[0];
  return independentGroups.map(({ component, variants }) => {
    const keepOriginalId = component.key === primary.component.key;
    const name =
      component.key === "set"
        ? `${product.name}, наборы`
        : `${product.name}, ${component.label.toLocaleLowerCase("ru")}`;
    return {
      ...product,
      id: keepOriginalId ? product.id : stableId(product.id, component.key),
      canonicalProductId: keepOriginalId
        ? product.canonicalProductId
        : `${product.canonicalProductId ?? product.id}-${component.key.toUpperCase()}`,
      name,
      description: `${component.label} ${product.brand ? `бренда ${product.brand}` : ""} для самостоятельного заказа. Выберите точную фасовку или исполнение по варианту.`,
      aliases: [...new Set([...(product.aliases ?? []), product.name])],
      variants: variants.map((variant) => ({
        ...variant,
        id: keepOriginalId
          ? variant.id
          : stableId(variant.id, component.key),
      })),
      commerceModel: {
        grain: "Бренд + самостоятельный заказываемый компонент",
        status: "SKU_READY",
        variantDimensions: ["Фасовка", "Размер", "Оттенок", "Исполнение"],
      },
      moderationWarnings: (product.moderationWarnings ?? []).filter(
        (warning) => warning !== "MIXED_INDEPENDENT_PRODUCTS",
      ),
    };
  });
}

const summary = [];
for (const relative of files) {
  const target = path.join(root, relative);
  const catalog = JSON.parse(await fs.readFile(target, "utf8"));
  const before = catalog.products.length;
  let splitCards = 0;
  const products = catalog.products.flatMap((product) => {
    const parts = splitProduct(product);
    if (parts.length > 1) splitCards += 1;
    return parts;
  });
  const output = {
    ...catalog,
    generatedAt: new Date().toISOString(),
    products,
  };
  if (apply)
    await fs.writeFile(target, `${JSON.stringify(output, null, 2)}\n`);
  summary.push({
    file: relative,
    before,
    after: products.length,
    splitCards,
  });
}

console.log(JSON.stringify({ mode: apply ? "apply" : "audit", summary }, null, 2));

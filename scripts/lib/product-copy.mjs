const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const GENERIC_CATEGORY = "Стоматологические материалы и оборудование";

export function normalizeCatalogUnit(value) {
  const unit = clean(value).toLocaleLowerCase("ru").replace(/\.$/, "");
  if (!unit || ["piece", "pieces", "pcs", "pc", "ед", "единица", "штука", "шт"].includes(unit)) return "шт.";
  if (["pack", "package", "уп", "упаковка"].includes(unit)) return "уп.";
  if (["set", "набор", "комплект"].includes(unit)) return "набор";
  return clean(value);
}

export function normalizeCatalogCategory(value) {
  const category = clean(value);
  if (!category || /^https?:\/\//i.test(category) || category.includes("www.")) return GENERIC_CATEGORY;
  return category;
}

export function generateCanonicalDescription({ name, category, brand, manufacturer, unit, supplierCount = 1 }) {
  const safeName = clean(name);
  const safeCategory = normalizeCatalogCategory(category);
  const safeBrand = clean(brand);
  const safeManufacturer = clean(manufacturer);
  const safeUnit = normalizeCatalogUnit(unit);
  const sentences = [
    `${safeName} относится к категории «${safeCategory}».`,
    safeBrand ? `Бренд: ${safeBrand}.` : null,
    safeManufacturer && safeManufacturer.toLocaleLowerCase("ru") !== safeBrand.toLocaleLowerCase("ru")
      ? `Производитель: ${safeManufacturer}.`
      : null,
    `Единица поставки: ${safeUnit}${safeUnit.endsWith(".") ? "" : "."}`,
    supplierCount > 1
      ? `В карточке собраны предложения ${supplierCount} поставщиков; цена, наличие и условия зависят от выбранного продавца.`
      : "Цена, наличие и условия указаны в предложении продавца.",
  ];
  return sentences.filter(Boolean).join(" ");
}

export function buildDescriptionSources(row) {
  const sourceRecords = row.sourceRecords ?? [];
  const fields = [
    ["CANONICAL_NAME", row.name],
    ["CATEGORY", normalizeCatalogCategory(row.category)],
    ["BRAND", row.brand],
    ["MANUFACTURER", row.manufacturer],
    ["UNIT", normalizeCatalogUnit(row.unit)],
  ].filter(([, value]) => clean(value));
  const sources = [...new Map(sourceRecords.map((item) => {
    const sourceName = clean(item.source || item.supplier);
    const sourceUrl = clean(item.sourceUrl) || null;
    return [`${sourceName}|${sourceUrl ?? ""}`, { sourceName, sourceUrl, sourceType: "SUPPLIER_FEED" }];
  }).filter(([, source]) => source.sourceName)).values()];
  const confidence = sourceRecords.length > 1 ? 0.86 : 0.72;
  return {
    ownership: "DENTMARKET",
    policyVersion: 1,
    generatedFromStructuredData: true,
    confidence,
    fields: fields.map(([field, value]) => ({ field, value, confidence })),
    sources,
  };
}

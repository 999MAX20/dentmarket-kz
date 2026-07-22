export type MatchableSupplierItem = {
  name: string;
  normalizedName: string;
  supplierSku?: string | null;
  gtin?: string | null;
  brandText?: string | null;
  manufacturerText?: string | null;
};
export type MatchableVariant = {
  id: string;
  sku?: string | null;
  gtin?: string | null;
  saleUnitId?: string | null;
  externalMetadata?: unknown;
  product: {
    canonicalName: string;
    regulatoryClass?: string | null;
    externalMetadata?: unknown;
    brand?: { name: string } | null;
    manufacturer?: { name: string } | null;
  };
};

type CommercialSignals = {
  form: string[];
  measure: string[];
  quantity: string[];
  shade: string[];
  flavor: string[];
  connection: string[];
};

export function normalizeCatalogText(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalizeCatalogText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeCatalogText(right).split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

function commercialSignals(value: string): CommercialSignals {
  const normalized = normalizeCatalogText(value);
  const shadeSource = value
    .replace(/[Аа](?=\d)/gu, "A")
    .replace(/[Вв](?=\d)/gu, "B")
    .replace(/[Сс](?=\d)/gu, "C")
    .replace(/[Оо](?=[АаA]\d)/gu, "O");
  const measures = [
    ...value.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(мл|ml|г|гр|g|л|l)(?![\p{L}])/giu),
  ].map((match) => {
    const unit = match[2].toLocaleLowerCase("ru");
    const normalizedUnit = ["ml", "мл"].includes(unit)
      ? "мл"
      : ["l", "л"].includes(unit)
        ? "л"
        : "г";
    return `${match[1].replace(",", ".")} ${normalizedUnit}`;
  });
  const quantities = [
    ...value.matchAll(
      /\b(\d+)\s*(?:шт\.?|pcs|капсул[а-я]*|унидоз[а-я]*|доз[а-я]*)(?![\p{L}])/giu,
    ),
  ].map((match) => match[1]);
  const shades = [
    ...shadeSource.matchAll(
      /\b(?:A[1-4](?:[.,]5)?O?|B[1-4]|C[1-4]|D[2-4]|OA[1-4](?:[.,]5)?|AO\d|AE|JE|BW|BOW|TR|WO|PO|GA\d(?:[.,]\d+)?|BL|CL|CO|OB|OD|OL|OM)\b/giu,
    ),
  ].map((match) => match[0].toLocaleLowerCase("en").replace(",", "."));
  const namedShades = [
    "bleach light",
    "bleach xl",
    "белый непрозрачный",
    "белый опаковый",
    "универсальный",
    "прозрачный",
    "режущий край",
  ].filter((shade) => normalized.includes(shade));
  const flavorNames = [
    "дыня",
    "карамель",
    "вишня",
    "мята",
    "кола лайм",
    "пина колада",
    "жевательная резинка",
  ];
  const forms = [
    ["набор", /набор|\bkit\b/iu],
    ["шприц quickmix", /quickmix/iu],
    ["одноразовые дозы", /одноразов|l pop/iu],
    ["унидозы", /singledose|унидоз/iu],
    ["капсулы", /капсул/iu],
    ["шприц", /шприц|syringe/iu],
    ["флакон", /флакон|bottle/iu],
    ["тюбик", /тюбик|tube/iu],
    ["картридж", /картридж|cartridge/iu],
  ] as const;
  const detectedForm = forms.find(([, pattern]) => pattern.test(normalized));
  const connections = ["nsk", "kavo", "morita", "yoshida", "osada", "sirona"];
  return {
    form: detectedForm ? [detectedForm[0]] : [],
    measure: unique(measures),
    quantity: unique(quantities),
    shade: unique([...shades, ...namedShades]),
    flavor: flavorNames.filter((flavor) => normalized.includes(flavor)),
    connection: connections.filter((connection) =>
      normalized.includes(connection),
    ),
  };
}

function variantMetadataText(variant: MatchableVariant) {
  const metadata = variant.externalMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return "";
  const record = metadata as {
    label?: unknown;
    attributes?: unknown;
  };
  const attributes =
    record.attributes &&
    typeof record.attributes === "object" &&
    !Array.isArray(record.attributes)
      ? Object.entries(record.attributes)
          .filter(([key]) => key !== "Артикул производителя")
          .map(([, value]) => String(value))
      : [];
  return [typeof record.label === "string" ? record.label : "", ...attributes]
    .filter(Boolean)
    .join(" ");
}

export function scoreVariant(
  item: MatchableSupplierItem,
  variant: MatchableVariant,
) {
  const reasons: string[] = [];
  const itemName = normalizeCatalogText(item.normalizedName || item.name);
  const metadata = variant.product.externalMetadata;
  const aliases =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    Array.isArray((metadata as { catalogAliases?: unknown }).catalogAliases)
      ? (metadata as { catalogAliases: unknown[] }).catalogAliases.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  const names = [variant.product.canonicalName, ...aliases];
  let score = 0;
  let nameReason = "";
  for (const [index, candidate] of names.entries()) {
    const productName = normalizeCatalogText(candidate);
    const similarity = tokenSimilarity(itemName, productName);
    let candidateScore = similarity * 0.65;
    let candidateReason = similarity > 0 ? "name_tokens" : "";
    if (itemName === productName && itemName) {
      candidateScore = Math.max(candidateScore, 0.85);
      candidateReason = index === 0 ? "exact_name" : "exact_alias";
    } else if (
      (itemName.includes(productName) || productName.includes(itemName)) &&
      Math.min(itemName.length, productName.length) >= 8
    ) {
      candidateScore = Math.max(candidateScore, 0.7);
      candidateReason = index === 0 ? "name_contains" : "alias_contains";
    }
    if (candidateScore > score) {
      score = candidateScore;
      nameReason = candidateReason;
    }
  }
  if (nameReason) reasons.push(nameReason);
  if (item.gtin && variant.gtin && item.gtin === variant.gtin) {
    score = 1;
    reasons.push("exact_gtin");
  }
  if (
    item.supplierSku &&
    variant.sku &&
    normalizeCatalogText(item.supplierSku) === normalizeCatalogText(variant.sku)
  ) {
    score = Math.max(score, 0.8);
    reasons.push("exact_sku");
  }
  const variantMetadata = variant.externalMetadata;
  const manufacturerReferenceAliases =
    variantMetadata &&
    typeof variantMetadata === "object" &&
    !Array.isArray(variantMetadata) &&
    Array.isArray(
      (variantMetadata as { manufacturerReferenceAliases?: unknown })
        .manufacturerReferenceAliases,
    )
      ? (
          variantMetadata as { manufacturerReferenceAliases: unknown[] }
        ).manufacturerReferenceAliases.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  if (
    item.supplierSku &&
    manufacturerReferenceAliases.some(
      (alias) =>
        normalizeCatalogText(item.supplierSku ?? "") ===
        normalizeCatalogText(alias),
    )
  ) {
    score = Math.max(score, 0.8);
    reasons.push("exact_sku_alias");
  }
  const normalizedVariantSku = normalizeCatalogText(variant.sku ?? "");
  if (
    normalizedVariantSku &&
    itemName.split(" ").includes(normalizedVariantSku)
  ) {
    score = Math.max(score, 0.94);
    reasons.push("manufacturer_ref");
  }
  if (
    item.brandText &&
    variant.product.brand &&
    normalizeCatalogText(item.brandText) ===
      normalizeCatalogText(variant.product.brand.name)
  ) {
    score += 0.08;
    reasons.push("exact_brand");
  }
  if (
    item.manufacturerText &&
    variant.product.manufacturer &&
    normalizeCatalogText(item.manufacturerText) ===
      normalizeCatalogText(variant.product.manufacturer.name)
  ) {
    score += 0.12;
    reasons.push("exact_manufacturer");
  }
  const itemSignals = commercialSignals(item.name);
  const variantSignals = commercialSignals(variantMetadataText(variant));
  for (const dimension of Object.keys(itemSignals) as Array<
    keyof CommercialSignals
  >) {
    if (itemSignals[dimension].length === 0) continue;
    const matches = itemSignals[dimension].some((signal) =>
      variantSignals[dimension].includes(signal),
    );
    if (matches) {
      score += 0.06;
      reasons.push(`exact_variant_${dimension}`);
    } else if (variantSignals[dimension].length > 0) {
      score -= 0.18;
      reasons.push(`variant_${dimension}_conflict`);
    }
  }
  return { score: Math.min(1, Number(score.toFixed(4))), reasons };
}

export function rankVariants(
  item: MatchableSupplierItem,
  variants: MatchableVariant[],
) {
  return variants
    .map((variant) => ({ variant, ...scoreVariant(item, variant) }))
    .filter(({ score }) => score >= 0.3)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.variant.id.localeCompare(right.variant.id),
    )
    .slice(0, 5);
}

export function isConfidentAutomaticMatch(
  candidates: ReturnType<typeof rankVariants>,
) {
  const best = candidates[0];
  if (!best) return false;
  const runnerUp = candidates[1];
  if (best.reasons.includes("mapping_memory") && best.score >= 0.8) return true;
  if (
    best.reasons.some((reason) =>
      ["exact_gtin", "exact_sku", "exact_sku_alias"].includes(reason),
    )
  )
    return (
      best.reasons.includes("exact_gtin") ||
      best.reasons.includes("exact_brand") ||
      best.reasons.includes("exact_manufacturer") ||
      !runnerUp ||
      best.score - runnerUp.score >= 0.05
    );
  if (best.reasons.includes("manufacturer_ref"))
    return !runnerUp || best.score - runnerUp.score >= 0.12;
  if (
    best.reasons.some((reason) =>
      ["exact_name", "exact_alias"].includes(reason),
    )
  )
    return !runnerUp || best.score - runnerUp.score >= 0.12;
  return (
    best.score >= 0.9 && (!runnerUp || best.score - runnerUp.score >= 0.12)
  );
}

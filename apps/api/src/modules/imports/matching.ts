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
  product: {
    canonicalName: string;
    regulatoryClass?: string | null;
    externalMetadata?: unknown;
    brand?: { name: string } | null;
    manufacturer?: { name: string } | null;
  };
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
    best.reasons.some((reason) => ["exact_gtin", "exact_sku"].includes(reason))
  )
    return !runnerUp || best.score - runnerUp.score >= 0.05;
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

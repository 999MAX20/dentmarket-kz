export type MatchableSupplierItem = { name: string; normalizedName: string; supplierSku?: string | null; gtin?: string | null };
export type MatchableVariant = { id: string; sku?: string | null; gtin?: string | null; product: { canonicalName: string } };

export function normalizeCatalogText(value: string) {
  return value.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalizeCatalogText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeCatalogText(right).split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function scoreVariant(item: MatchableSupplierItem, variant: MatchableVariant) {
  const reasons: string[] = [];
  let score = tokenSimilarity(item.normalizedName, variant.product.canonicalName) * 0.5;
  if (score > 0) reasons.push("name_tokens");
  if (item.gtin && variant.gtin && item.gtin === variant.gtin) { score += 0.75; reasons.push("exact_gtin"); }
  if (item.supplierSku && variant.sku && normalizeCatalogText(item.supplierSku) === normalizeCatalogText(variant.sku)) { score += 0.55; reasons.push("exact_sku"); }
  return { score: Math.min(1, Number(score.toFixed(4))), reasons };
}

export function rankVariants(item: MatchableSupplierItem, variants: MatchableVariant[]) {
  return variants.map((variant) => ({ variant, ...scoreVariant(item, variant) }))
    .filter(({ score }) => score >= 0.25)
    .sort((left, right) => right.score - left.score || left.variant.id.localeCompare(right.variant.id))
    .slice(0, 5);
}

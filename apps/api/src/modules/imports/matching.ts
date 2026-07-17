export type MatchableSupplierItem = { name: string; normalizedName: string; supplierSku?: string | null; gtin?: string | null; brandText?: string | null; manufacturerText?: string | null };
export type MatchableVariant = { id: string; sku?: string | null; gtin?: string | null; saleUnitId?: string | null; product: { canonicalName: string; regulatoryClass?: string | null; brand?: { name: string } | null; manufacturer?: { name: string } | null } };

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
  const itemName = normalizeCatalogText(item.normalizedName || item.name);
  const productName = normalizeCatalogText(variant.product.canonicalName);
  const similarity = tokenSimilarity(itemName, productName);
  let score = similarity * 0.65;
  if (itemName === productName && itemName) { score = Math.max(score, 0.85); reasons.push("exact_name"); }
  else if ((itemName.includes(productName) || productName.includes(itemName)) && Math.min(itemName.length, productName.length) >= 8) { score = Math.max(score, 0.7); reasons.push("name_contains"); }
  else if (similarity > 0) reasons.push("name_tokens");
  if (item.gtin && variant.gtin && item.gtin === variant.gtin) { score = 1; reasons.push("exact_gtin"); }
  if (item.supplierSku && variant.sku && normalizeCatalogText(item.supplierSku) === normalizeCatalogText(variant.sku)) { score = Math.max(score, 0.8); reasons.push("exact_sku"); }
  if (item.brandText && variant.product.brand && normalizeCatalogText(item.brandText) === normalizeCatalogText(variant.product.brand.name)) { score += 0.08; reasons.push("exact_brand"); }
  if (item.manufacturerText && variant.product.manufacturer && normalizeCatalogText(item.manufacturerText) === normalizeCatalogText(variant.product.manufacturer.name)) { score += 0.12; reasons.push("exact_manufacturer"); }
  return { score: Math.min(1, Number(score.toFixed(4))), reasons };
}

export function rankVariants(item: MatchableSupplierItem, variants: MatchableVariant[]) {
  return variants.map((variant) => ({ variant, ...scoreVariant(item, variant) }))
    .filter(({ score }) => score >= 0.3)
    .sort((left, right) => right.score - left.score || left.variant.id.localeCompare(right.variant.id))
    .slice(0, 5);
}

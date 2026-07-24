export const CATALOG_API_URL = "https://dentmarket-shop.vercel.app/api/catalog-search";

export function buildCatalogUrl(baseUrl: string, query = "") {
  const url = new URL(baseUrl);
  if (query.trim()) url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", "60");
  return url.toString();
}

export function formatMinorCurrency(minor: number | string | null | undefined, currency = "KZT") {
  if (minor == null) return "Цена по запросу";
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(minor) / 100);
}

import { normalizeCatalogText } from "../imports/matching";
import { expandDentalSearchQuery } from "./dental-search-lexicon";

const BEAUTY_SYNONYMS: Array<[string, string[]]> = [
  ["крем для лица", ["крем", "уход за лицом"]],
  ["сыворотка", ["серум", "сироватка"]],
  ["шампунь", ["профессиональный шампунь", "hair shampoo"]],
  ["маска для волос", ["маска волос", "hair mask"]],
  ["гель лак", ["гель-лак", "gel polish"]],
  ["база", ["база под гель-лак", "base coat"]],
  ["топ", ["топ для ногтей", "top coat"]],
  ["праймер", ["дегидратор", "primer"]],
  ["ресницы", ["lash", "наращивание ресниц"]],
  ["брови", ["brow", "ламинирование бровей"]],
  ["одноразка", ["одноразовые материалы", "расходники"]],
  ["стерилизация", ["сухожар", "автоклав"]],
];

export function expandIndustrySearchQuery(industryCode: string | null | undefined, value: string) {
  if (industryCode !== "beauty-kz") return expandDentalSearchQuery(value);
  const normalizedQuery = normalizeCatalogText(value);
  if (!normalizedQuery) return { normalizedQuery: "", expandedQuery: "", matchedAliases: [] as string[] };
  const terms = new Set([normalizedQuery]);
  const matchedAliases: string[] = [];
  for (const [alias, expansions] of BEAUTY_SYNONYMS) {
    if (!normalizedQuery.includes(alias)) continue;
    matchedAliases.push(alias);
    for (const expansion of expansions) terms.add(normalizeCatalogText(expansion));
  }
  return { normalizedQuery, expandedQuery: [...terms].join(" OR "), matchedAliases: matchedAliases.slice(0, 6) };
}

export const beautySearchSuggestions = BEAUTY_SYNONYMS.map(([alias]) => alias);

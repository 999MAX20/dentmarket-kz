import { normalizeCatalogText } from "../imports/matching";

type DentalSearchEntry = { aliases: string[]; terms: string[] };

const RU_LAYOUT = "йцукенгшщзхъфывапролджэячсмитьбю";
const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const TYPO_ALIASES: Record<string, string> = {
  "коффердамм": "коффердам",
  "кофердам": "коффердам",
  "рабердам": "раббердам",
  "гуттаперч": "гуттаперча",
  "композитт": "композит",
  "апекслокаторр": "апекслокатор",
  "эндомоторр": "эндомотор",
  "карпуллы": "карпулы",
  "матриццы": "матрицы",
};

function swapKeyboardLayout(value: string, from: string, to: string) {
  const index = new Map([...from].map((character, position) => [character, to[position] ?? character]));
  return [...value].map((character) => index.get(character) ?? character).join("");
}

// Поисковые термины, которыми клиники реально называют товар в заявках и чатах.
// Официальные названия остаются в индексе; этот слой только расширяет запрос.
const LEXICON: DentalSearchEntry[] = [
  { aliases: ["светник", "светляк", "светоотверждайка", "светоотверждаемка", "фотополимер"], terms: ["композит", "светоотверждаемый", "реставрационный материал"] },
  { aliases: ["текучка", "флоу", "flow", "флоу композит"], terms: ["текучий композит", "flow", "жидкотекучий"] },
  { aliases: ["пломба", "пломбировочный", "пломбировочный материал"], terms: ["композит", "реставрационный материал", "пломбировочный материал"] },
  { aliases: ["бонд", "бондинг", "адгезив", "адгезивка"], terms: ["адгезивная система", "бондинговая система"] },
  { aliases: ["травилка", "травление", "etch", "этч"], terms: ["протравочный гель", "фосфорная кислота"] },
  { aliases: ["коффер", "коффердам", "раббердам", "rubber dam"], terms: ["раббердам", "коффердам", "изоляция рабочего поля"] },
  { aliases: ["эндошка", "эндодонтия", "эндо"], terms: ["эндодонтический", "корневой канал"] },
  { aliases: ["файлы", "эндодонтические файлы", "ручные файлы"], terms: ["эндодонтический файл", "инструмент для обработки каналов"] },
  { aliases: ["гутта", "гуттаперча", "гуттаперчевые штифты"], terms: ["гуттаперчевый штифт", "обтурация"] },
  { aliases: ["силер", "силеры", "sealer"], terms: ["материал для пломбирования каналов", "эндодонтический силер"] },
  { aliases: ["времянка", "временная пломба", "временный материал"], terms: ["временный пломбировочный материал"] },
  { aliases: ["карпулы", "карпула", "анестезия", "анестетик"], terms: ["карпульный анестетик", "местная анестезия"] },
  { aliases: ["иголки", "иглы", "иголки для карпул"], terms: ["стоматологическая игла", "игла для анестезии"] },
  { aliases: ["кламп", "клампы", "кламмер"], terms: ["кламп для коффердама", "зажим"] },
  { aliases: ["матрицы", "матрешки", "матричная система"], terms: ["стоматологическая матрица", "матричная система"] },
  { aliases: ["штрипсы", "штрипс", "полоски"], terms: ["абразивные полоски", "штрипсы для полировки"] },
  { aliases: ["полировщики", "полиры", "полир"], terms: ["полировочная система", "полировочный диск"] },
  { aliases: ["слюноотсос", "слюносос", "салива"], terms: ["слюноотсос", "система слюноотсоса"] },
  { aliases: ["апекслокатор", "апекслокаторы", "апекс"], terms: ["апекслокатор", "определитель апекса"] },
  { aliases: ["эндомотор", "эндо мотор", "мотор для эндо"], terms: ["эндодонтический мотор", "эндомотор"] },
  { aliases: ["лампа", "лампочка", "фотополимеризатор"], terms: ["стоматологический фотополимеризатор", "полимеризационная лампа"] },
  { aliases: ["цирконий", "циркония", "циркон"], terms: ["диоксид циркония", "циркониевые блоки"] },
  { aliases: ["абатмент", "абатменты"], terms: ["имплантологический абатмент", "система имплантации"] },
  { aliases: ["имплант", "импланты", "имплантация"], terms: ["дентальный имплантат", "имплантационная система"] },
  { aliases: ["боры", "борик", "боры для турбинки"], terms: ["стоматологический бор", "алмазный бор"] },
  { aliases: ["фрезы", "фреза"], terms: ["стоматологическая фреза", "фреза для лаборатории"] },
];

export function expandDentalSearchQuery(value: string) {
  const normalized = normalizeCatalogText(value).split(" ").map((token) => TYPO_ALIASES[token] ?? token).join(" ");
  if (!normalized) return { normalizedQuery: "", expandedQuery: "", matchedAliases: [] as string[] };
  const terms = new Set<string>([normalized]);
  const matchedAliases = new Set<string>();
  const layoutVariants = normalized.split(" ").length === 1 ? [swapKeyboardLayout(normalized, RU_LAYOUT, EN_LAYOUT), swapKeyboardLayout(normalized, EN_LAYOUT, RU_LAYOUT)] : [];
  layoutVariants.filter((variant) => variant !== normalized).forEach((variant) => terms.add(variant));
  for (const entry of LEXICON) {
    if (!entry.aliases.some((alias) => normalized.includes(normalizeCatalogText(alias)))) continue;
    entry.aliases.forEach((alias) => matchedAliases.add(alias));
    entry.terms.forEach((term) => terms.add(normalizeCatalogText(term)));
  }
  return { normalizedQuery: normalized, expandedQuery: [...terms].join(" OR "), matchedAliases: [...matchedAliases].slice(0, 6) };
}

export const dentalSearchSuggestions = ["светник", "текучка", "коффер", "эндошка", "гутта", "карпулы"];

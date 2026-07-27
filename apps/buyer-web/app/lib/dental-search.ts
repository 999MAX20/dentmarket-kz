const RU_LAYOUT = "йцукенгшщзхъфывапролджэячсмитьбю";
const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";

const STOP_WORDS = new Set([
  "для",
  "и",
  "или",
  "на",
  "по",
  "с",
  "со",
  "в",
  "во",
  "из",
  "к",
  "от",
  "до",
  "при",
  "the",
  "for",
  "with",
]);

const TYPO_ALIASES: Record<string, string> = {
  апекслокаторр: "апекслокатор",
  апекслокатр: "апекслокатор",
  гуттаперчя: "гуттаперча",
  гуттаперч: "гуттаперча",
  кофердам: "коффердам",
  коффердамм: "коффердам",
  компазит: "композит",
  композитт: "композит",
  печатки: "перчатки",
  пичатки: "перчатки",
  перчаки: "перчатки",
  перчтаки: "перчатки",
  перчатк: "перчатки",
  перчаткии: "перчатки",
  эндомоторр: "эндомотор",
  карпуллы: "карпулы",
  матриццы: "матрицы",
};

type SearchIntent = {
  aliases: string[];
  terms: string[];
};

// Язык стоматологов дополняет официальные названия, но не заменяет их.
const SEARCH_INTENTS: SearchIntent[] = [
  { aliases: ["адгезив", "бонд", "бондинг", "адгезивка", "adhesive", "bond"], terms: ["адгезивная система", "бондинговая система"] },
  { aliases: ["текучка", "флоу", "flow", "жидкий композит"], terms: ["текучий композит", "жидкотекучий композит", "flow composite"] },
  { aliases: ["светник", "светляк", "фотополимер", "светоотверждайка"], terms: ["светоотверждаемый композит", "реставрационный материал"] },
  { aliases: ["апекслокатор", "апекс", "apex locator", "apexlocator", "для определения длины канала", "определить длину канала"], terms: ["апекслокатор", "определитель апекса", "рабочая длина корневого канала"] },
  { aliases: ["эндошка", "эндо", "эндодонтия"], terms: ["эндодонтический", "корневой канал"] },
  { aliases: ["эндомотор", "эндо мотор", "endomotor", "endo motor"], terms: ["эндодонтический мотор"] },
  { aliases: ["гутта", "гуттаперча", "gutta percha"], terms: ["гуттаперчевые штифты", "обтурация канала"] },
  { aliases: ["силер", "sealer"], terms: ["материал для пломбирования корневых каналов", "эндодонтический силер"] },
  { aliases: ["файлы", "эндодонтические файлы", "endo files"], terms: ["инструменты для обработки корневых каналов"] },
  { aliases: ["для фиксации коронки", "зафиксировать коронку", "фиксация коронки", "цемент для коронки"], terms: ["фиксирующий цемент", "стоматологический цемент", "цемент для постоянной фиксации"] },
  { aliases: ["коффер", "коффердам", "раббердам", "rubber dam"], terms: ["изоляция рабочего поля", "раббердам"] },
  { aliases: ["травилка", "etch", "этч", "травление"], terms: ["протравочный гель", "фосфорная кислота"] },
  { aliases: ["лампа", "фотополимеризатор", "led лампа", "curing light"], terms: ["полимеризационная лампа"] },
  { aliases: ["наконечник", "турбинка", "handpiece"], terms: ["стоматологический наконечник", "турбинный наконечник"] },
  { aliases: ["бор", "боры", "бур", "burs"], terms: ["стоматологический бор", "алмазный бор"] },
  { aliases: ["скейлер", "scaler", "ультразвук"], terms: ["ультразвуковой скейлер"] },
  { aliases: ["эйрфлоу", "airflow", "air flow"], terms: ["порошок для профессиональной чистки"] },
  { aliases: ["карпулы", "карпула", "анестезия"], terms: ["карпульный анестетик", "местная анестезия"] },
  { aliases: ["матрицы", "матричная система"], terms: ["стоматологическая матрица", "секционная матричная система"] },
  { aliases: ["слепок", "оттиск", "альгинат", "impression"], terms: ["оттискной материал"] },
  { aliases: ["имплант", "имплантат", "implant"], terms: ["дентальный имплантат", "имплантационная система"] },
  { aliases: ["абатмент", "abutment"], terms: ["имплантологический абатмент"] },
  { aliases: ["автоклав", "autoclave", "sterilizer"], terms: ["стерилизатор", "оборудование для стерилизации"] },
  { aliases: ["перчатки", "нитрилки", "gloves"], terms: ["медицинские нитриловые перчатки"] },
  { aliases: ["маски", "маска"], terms: ["медицинская маска"] },
  { aliases: ["слюнявчики", "нагрудники"], terms: ["стоматологические нагрудники"] },
  { aliases: ["костный материал", "костная стружка", "графт", "bone graft"], terms: ["материал для костной пластики", "костный заменитель"] },
  { aliases: ["физиодиспенсер", "физио", "implant motor"], terms: ["хирургический мотор", "имплантологический мотор"] },
  { aliases: ["визиграф", "радиовизиограф", "rvG"], terms: ["стоматологический радиовизиограф"] },
  { aliases: ["оптг", "панорама", "ортопантомограф"], terms: ["панорамный рентген", "ортопантомограф"] },
];

export const normalizeDentalSearchText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/gu, "е")
    .replace(/([0-9])\s*(?:миллилитр(?:а|ов)?|ml|мл)\b/giu, "$1 мл")
    .replace(/([0-9])\s*(?:грамм(?:а|ов)?|gr|g|гр)\b/giu, "$1 г")
    .replace(/([0-9])\s*(?:millimeter|mm|мм)\b/giu, "$1 мм")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim();

const swapKeyboardLayout = (value: string, from: string, to: string) => {
  const index = new Map(
    [...from].map((character, position) => [
      character,
      to[position] ?? character,
    ]),
  );
  return [...value].map((character) => index.get(character) ?? character).join("");
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: "",
};

const transliterate = (value: string) =>
  [...value].map((character) => CYRILLIC_TO_LATIN[character] ?? character).join("");

const correctTypos = (value: string) =>
  value
    .split(" ")
    .map((token) => TYPO_ALIASES[token] ?? token)
    .join(" ");

const normalizedIntentValues = SEARCH_INTENTS.map((intent) => ({
  aliases: intent.aliases.map(normalizeDentalSearchText),
  terms: intent.terms.map(normalizeDentalSearchText),
}));

export function expandDentalSearchQuery(value: string) {
  const original = normalizeDentalSearchText(value);
  const normalizedQuery = correctTypos(original);
  if (!normalizedQuery) {
    return {
      normalizedQuery: "",
      concepts: [] as string[][],
      matchedAliases: [] as string[],
      interpretedTerms: [] as string[],
    };
  }

  const matched = normalizedIntentValues.filter(({ aliases, terms }) =>
    [...aliases, ...terms].some(
      (term) =>
        normalizedQuery.includes(term) ||
        (normalizedQuery.length >= 4 && term.includes(normalizedQuery)),
    ),
  );
  const concepts: string[][] = [];
  const matchedAliases = new Set<string>();
  const interpretedTerms = new Set<string>();

  for (const intent of matched) {
    const alternatives = [
      ...new Set(
        [...intent.aliases, ...intent.terms].flatMap((term) => [
          term,
          transliterate(term),
        ]),
      ),
    ];
    alternatives.forEach((term) => {
      interpretedTerms.add(term);
      matchedAliases.add(term);
    });
    concepts.push(alternatives);
  }

  const coveredTokens = new Set(
    matched.flatMap(({ aliases }) => aliases.flatMap((alias) => alias.split(" "))),
  );
  for (const token of normalizedQuery.split(" ")) {
    if (
      (token.length < 2 && !/^\d+$/u.test(token)) ||
      STOP_WORDS.has(token) ||
      coveredTokens.has(token)
    )
      continue;
    const alternatives = new Set([token, transliterate(token)]);
    if (/^[a-z]+$/u.test(token)) {
      alternatives.add(swapKeyboardLayout(token, EN_LAYOUT, RU_LAYOUT));
    } else if (/^[а-я]+$/u.test(token)) {
      alternatives.add(swapKeyboardLayout(token, RU_LAYOUT, EN_LAYOUT));
    }
    concepts.push([...alternatives].filter(Boolean));
  }

  if (!concepts.length) concepts.push([normalizedQuery, transliterate(normalizedQuery)]);
  return {
    normalizedQuery,
    concepts,
    matchedAliases: [...matchedAliases].slice(0, 12),
    interpretedTerms: [...interpretedTerms].filter(
      (term) => !normalizedQuery.includes(term),
    ).slice(0, 12),
  };
}

export const dentalSearchSuggestions = [
  "адгезив",
  "апекслокатор",
  "текучка",
  "светник",
  "эндошка",
  "для фиксации коронки",
  "для определения длины канала",
];

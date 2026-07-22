const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const GENERIC_CATEGORY = "Стоматологические материалы и оборудование";

const GENERIC_CATEGORIES = new Set([
  "стоматология",
  "стоматологические товары",
  "стоматологические материалы",
  "стоматологические материалы и оборудование",
]);

const BRAND_ALIASES = [
  [/(?:dentsply\s+sirona|\bsirona\b)/iu, "Dentsply Sirona"],
  [/(?:tokuyama\s+dental|\btokuyama\b)/iu, "Tokuyama Dental"],
  [/(?:one\s+drop\s+only)/iu, "One Drop Only"],
  [/(?:lm\s+dental)/iu, "LM Dental"],
  [/(?:zt\s+dental)/iu, "ZT Dental"],
  [/(?:iq\s*dent)/iu, "IQ Dent"],
  [/(?:hummer-?pak)/iu, "Hummer-Pak"],
  [/(?:coxo|сохо|коксо)/iu, "COXO"],
  [/(?:fomos)/iu, "FOMOS"],
  [/(?:woodpecker)/iu, "Woodpecker"],
  [/(?:cicada)/iu, "CICADA"],
  [/(?:tealth)/iu, "Tealth"],
  [/(?:\bvrn\b)/iu, "VRN"],
  [/(?:planmeca)/iu, "Planmeca"],
  [/(?:kettenbach)/iu, "Kettenbach"],
  [/(?:interdent)/iu, "Interdent"],
  [/(?:dentkist)/iu, "DentKist"],
  [/(?:ivoclar)/iu, "Ivoclar"],
  [/(?:tetric)/iu, "Ivoclar"],
  [/(?:charisma|karizma|каризма)/iu, "Kulzer"],
  [/(?:lumex\s*ac)/iu, "VITA"],
  [/(?:youjoy)/iu, "YouJoy"],
  [/(?:ormco)/iu, "Ormco"],
  [/(?:latus)/iu, "LaTus"],
  [/(?:tor\s*vm)/iu, "Tor VM"],
  [/(?:medexim)/iu, "Medexim"],
  [/(?:shofu)/iu, "Shofu"],
  [/(?:\bvoco\b)/iu, "VOCO"],
  [/(?:\badmira\b|\bstructur\s*2\b|структур\s*2)/iu, "VOCO"],
  [/(?:\bvdw\b)/iu, "VDW"],
  [/(?:\bgc\b)/iu, "GC"],
  [/(?:\bimd\b)/iu, "IMD"],
  [/(?:\bnic\b)/iu, "NIC"],
  [/(?:\btornado\b)/iu, "TORNADO"],
];

const NON_MANUFACTURERS = new Set([
  "",
  "inc",
  "шт",
  "шт.",
  "amdgroup",
  "тоо amdgroup",
]);

const NAME_INFERABLE_BRANDS = new Set([
  "COXO",
  "FOMOS",
  "IQ Dent",
  "Shofu",
  "TORNADO",
  "CICADA",
  "Tealth",
  "VRN",
  "Ivoclar",
  "Kulzer",
  "VITA",
  "VOCO",
]);

const SUPPLIER_ALIASES = new Map([
  ["amdgroup", "AMDgroup"],
  ["тоо amdgroup", "AMDgroup"],
  ["amdgroup-public", "AMDgroup"],
  ["stomir", "СТОМир"],
  ["тоо стомир", "СТОМир"],
  ["стомир", "СТОМир"],
  ["stomir-public", "СТОМир"],
  ["тоо allfordent", "AllForDent"],
  ["allfordent", "AllForDent"],
  ["medstom", "Medstom"],
  ["kazdentservice", "KazDentService"],
  ["nordstom", "NORD STOM"],
  ["nordstom-public", "NORD STOM"],
]);

const LATIN_PRODUCT_NAMES = new Map([
  ["admira", "Admira"],
  ["amaris", "Amaris"],
  ["ambria", "Ambria"],
  ["assistina", "Assistina"],
  ["bifluorid", "Bifluorid"],
  ["karizma", "Charisma"],
  ["lumex", "LUMEX"],
  ["piezomed", "Piezomed"],
  ["provikol", "Provicol"],
  ["septanest", "Septanest"],
  ["straumann", "Straumann"],
  ["struktur", "Structur"],
  ["twinpower", "TwinPower"],
  ["ufi", "Ufi"],
  ["ventura", "Ventura"],
  ["veraview", "Veraview"],
  ["veraviewepocs", "Veraviewepocs"],
  ["vistavox", "VistaVox"],
  ["axano", "Axano"],
  ["charisma", "Charisma"],
  ["klassik", "Classic"],
]);

const LATIN_TECHNICAL_WORDS = new Map([
  ["air", "Air"],
  ["bulk", "Bulk"],
  ["cf", "CF"],
  ["cherry", "Cherry"],
  ["coupling", "Coupling"],
  ["flow", "Flow"],
  ["gh", "GH"],
  ["hex", "HEX"],
  ["high", "High"],
  ["kid", "KID"],
  ["kit", "Kit"],
  ["led", "LED"],
  ["lemon", "Lemon"],
  ["long", "Long"],
  ["mint", "Mint"],
  ["multi", "Multi"],
  ["narrow", "Narrow"],
  ["neutral", "Neutral"],
  ["np", "NP"],
  ["plus", "Plus"],
  ["sc", "SC"],
  ["set", "Set"],
  ["sp", "SP"],
  ["system", "System"],
  ["tips", "tips"],
  ["unit", "Unit"],
  ["ceph", "Ceph"],
  ["corrective", "Corrective"],
  ["new", "New"],
  ["tom", "Tom"],
]);

const RUSSIAN_SHORT_WORDS = new Map([
  ["d", "для"],
  ["i", "и"],
  ["iz", "из"],
  ["k", "к"],
  ["na", "на"],
  ["po", "по"],
  ["s", "с"],
  ["so", "со"],
  ["v", "в"],
  ["za", "за"],
  ["g", "г"],
  ["gr", "г"],
  ["kaps", "капс."],
  ["ml", "мл"],
  ["mm", "мм"],
  ["sht", "шт."],
]);

const SOURCE_CATEGORY_NAMES = new Map([
  ["konusovidnye", "Бор алмазный"],
  ["konusovidnyebory", "Бор алмазный"],
  ["obratnokonusnye", "Бор алмазный"],
  ["grushevidnye", "Бор алмазный"],
  ["olivovidnye", "Бор алмазный"],
  ["butonovidnye", "Бор алмазный"],
  ["plamevidnye", "Бор алмазный"],
  ["plamevidnyebory", "Бор алмазный"],
  ["granadovidnye", "Бор алмазный"],
  ["grenadovidnye", "Бор алмазный"],
  ["oklyuzionnye", "Бор алмазный"],
  ["konicheskie", "Бор алмазный"],
  ["kolesovidnye", "Бор алмазный"],
  ["mezhzubnye", "Бор алмазный"],
  ["linzovidnye", "Бор алмазный"],
  ["torpedovidnye", "Бор алмазный"],
  ["khirurgicheskie_bory", "Бор хирургический"],
  ["bory_po_tsirkonu", "Бор по цирконию"],
  ["dlya_razrezaniya_koronok", "Бор для разрезания коронок"],
  ["dlya_udaleniya_kleya", "Бор для удаления клея"],
  ["poliry", "Полир"],
]);

const DIAMOND_BUR_DESCRIPTORS = new Map([
  ["detskie", "детский"],
  ["konisch", "конический"],
  ["oliva", "оливовидный"],
  ["ovalnye", "овальный"],
  ["sharovidnye", "шаровидный"],
  ["shlifovalnye", "шлифовальный"],
]);

const transliterateRussianWord = (word) => {
  let value = word.toLocaleLowerCase("en");
  const replacements = [
    ["shch", "щ"],
    ["yo", "ё"],
    ["zh", "ж"],
    ["kh", "х"],
    ["ts", "ц"],
    ["ch", "ч"],
    ["sh", "ш"],
    ["yu", "ю"],
    ["ya", "я"],
    ["ye", "е"],
    ["iy", "ий"],
    ["yy", "ый"],
    ["oy", "ой"],
    ["ey", "ей"],
    ["ay", "ай"],
    ["uy", "уй"],
  ];
  for (const [latin, cyrillic] of replacements)
    value = value.replaceAll(latin, cyrillic);
  return value.replace(
    /[a-z]/g,
    (letter) =>
      ({
        a: "а",
        b: "б",
        c: "к",
        d: "д",
        e: "е",
        f: "ф",
        g: "г",
        h: "х",
        i: "и",
        j: "й",
        k: "к",
        l: "л",
        m: "м",
        n: "н",
        o: "о",
        p: "п",
        q: "к",
        r: "р",
        s: "с",
        t: "т",
        u: "у",
        v: "в",
        w: "в",
        x: "кс",
        y: "ы",
        z: "з",
      })[letter],
  );
};

const normalizedCode = (value) =>
  value
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((token) => token.toLocaleUpperCase("en"))
    .join(" ");

const finalizeCanonicalName = (value) =>
  clean(value)
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .replace(/\b(\d{1,2})\s+(\d)(?=\s*(?:CF|×))/g, "$1,$2")
    .replace(/\bGH\s+(\d)\s+(\d)\b/g, "GH $1,$2")
    .replace(/\b(\d)\s+(\d)(?=×)/g, "$1,$2")
    .replace(/×(\d)\s+(\d)(?=×|\s|$)/g, "×$1,$2")
    .replace(/\s+-\s+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

export function normalizeCanonicalName(
  value,
  { brand, manufacturer, sourceUrl } = {},
) {
  const raw = clean(value)
    .replace(/наконенчик/giu, "наконечник")
    .replace(/внутреней/giu, "внутренней")
    .replace(/\bc(?=\s+внутренней)/giu, "с")
    .replace(/обличовоч/giu, "облицовоч")
    .replace(/комлект/giu, "комплект")
    .replace(/проволкa/giu, "проволока");
  if (!raw) return "";

  const sourceCategory = clean(sourceUrl)
    .match(/\/catalog\/([^/]+)\//i)?.[1]
    ?.toLocaleLowerCase("en");
  const sourceCategoryName = sourceCategory
    ? SOURCE_CATEGORY_NAMES.get(sourceCategory)
    : null;

  const micromotor = raw.match(
    /^(\d+)-([a-z])\s+набор\s+микромотор,\s*прямой,\s*угловой\s+наконечник\s+(со светом\s+и\s+)?с?\s*внутренней\s+подачи\s+воды$/iu,
  );
  if (micromotor)
    return finalizeCanonicalName(
      `Набор с микромотором, прямым и угловым наконечниками${micromotor[3] ? " со светом" : ""}, внутренняя подача воды, модель ${micromotor[1]}-${micromotor[2].toLocaleUpperCase("en")}`,
    );
  if (/^3d\s+ретрактор$/iu.test(raw)) return "Ретрактор 3D";

  const diamondDisk = raw.match(
    /^borye?\s+almaznye\s+diski\s+almaznye\s+(.+)$/i,
  );
  if (diamondDisk)
    return finalizeCanonicalName(
      `Диск алмазный ${normalizedCode(diamondDisk[1])}`,
    );
  const diamondDiskShort = raw.match(/^borye?\s+almaznye\s+diski\s+(.+)$/i);
  if (diamondDiskShort)
    return finalizeCanonicalName(
      `Диск алмазный ${normalizedCode(diamondDiskShort[1])}`,
    );
  const diamondDiskOnly = raw.match(/^diski\s+almaznye\s+(.+)$/i);
  if (diamondDiskOnly)
    return finalizeCanonicalName(
      `Диск алмазный ${normalizedCode(diamondDiskOnly[1])}`,
    );
  const carbideBur = raw.match(/^borye?\s+almaznye\s+tverdosplavnye\s+(.+)$/i);
  if (carbideBur)
    return finalizeCanonicalName(
      `Бор твердосплавный ${normalizedCode(carbideBur[1])}`,
    );
  const carbideSet = raw.match(
    /^borye?\s+almaznye\s+stomatologicheskie\s+volframovye\s+karbidnye\s+diametr\s+(\d+)\s+v\s+upakovke\s+(\d+)sht(?:\s+(\d+))?$/i,
  );
  if (carbideSet)
    return finalizeCanonicalName(
      `Бор твердосплавный, диаметр ${carbideSet[1]}, упаковка ${carbideSet[2]} шт.${carbideSet[3] ? `, вариант ${carbideSet[3]}` : ""}`,
    );
  const arkansasStone = raw.match(/^borye?\s+almaznye\s+arkanzas\s+(.+)$/i);
  if (arkansasStone)
    return finalizeCanonicalName(
      `Камень Arkansas ${normalizedCode(arkansasStone[1])}`,
    );
  const describedDiamondBur = raw.match(
    /^borye?\s+almaznye\s+(detskie|konisch|oliva|ovalnye|sharovidnye|shlifovalnye)(?:\s+sverkhmelkaya)?\s+(.+)$/i,
  );
  if (describedDiamondBur) {
    const grit = /sverkhmelkaya/i.test(raw) ? ", сверхмелкая зернистость" : "";
    return finalizeCanonicalName(
      `Бор алмазный ${DIAMOND_BUR_DESCRIPTORS.get(describedDiamondBur[1].toLocaleLowerCase("en"))}${grit} ${normalizedCode(describedDiamondBur[2])}`,
    );
  }
  const diamondPrefix = raw.match(/^borye?\s+almaznye\s+(.+)$/i);
  if (diamondPrefix)
    return finalizeCanonicalName(
      `Бор алмазный ${normalizedCode(diamondPrefix[1])}`,
    );
  const diamondSuffix = raw.match(/^(.+?)\s+borye?\s+almaznye$/i);
  if (diamondSuffix)
    return finalizeCanonicalName(
      `Бор алмазный ${normalizedCode(diamondSuffix[1])}`,
    );
  const cyrillicDiamond = raw.match(/^боры\s+алмазные\s+(.+)$/iu);
  if (cyrillicDiamond)
    return finalizeCanonicalName(
      `Бор алмазный ${normalizedCode(cyrillicDiamond[1])}`,
    );
  const genericBur = raw.match(/^bory\s+(.+)$/i);
  if (genericBur)
    return finalizeCanonicalName(
      `${sourceCategoryName?.startsWith("Бор") ? sourceCategoryName : "Бор"} ${normalizedCode(genericBur[1])}`,
    );
  const cyrillicBurSuffix = raw.match(/^(.+?)\s+бор$/iu);
  if (cyrillicBurSuffix)
    return finalizeCanonicalName(`Бор ${normalizedCode(cyrillicBurSuffix[1])}`);
  const buttonBur = raw.match(/^(.+?)\s+buton$/i);
  if (buttonBur)
    return finalizeCanonicalName(
      `Бор алмазный ${normalizedCode(buttonBur[1])}`,
    );
  if (sourceCategoryName && /^[0-9a-z\s-]+$/i.test(raw) && /\d/.test(raw)) {
    return finalizeCanonicalName(
      `${sourceCategoryName} ${normalizedCode(raw)}`.replace(
        /(\d)(?:KH|X)(?=\d)/g,
        "$1×",
      ),
    );
  }

  if (!/^[a-z0-9\s.,+()/-]+$/i.test(raw) || !/[a-z]{3}/i.test(raw)) {
    return finalizeCanonicalName(
      raw.charAt(0).toLocaleUpperCase("ru") + raw.slice(1),
    );
  }

  const protectedWords = new Map([
    ...LATIN_PRODUCT_NAMES,
    ...LATIN_TECHNICAL_WORDS,
  ]);
  for (const source of [brand, manufacturer]) {
    for (const token of clean(source).split(/\s+/).filter(Boolean))
      protectedWords.set(token.toLocaleLowerCase("en"), token);
  }
  const tokens = raw.split(/(\s+|[.,+()/-])/).map((token) => {
    if (!/[a-z]/i.test(token)) return token;
    const lower = token.toLocaleLowerCase("en");
    if (protectedWords.has(lower)) return protectedWords.get(lower);
    if (RUSSIAN_SHORT_WORDS.has(lower)) return RUSSIAN_SHORT_WORDS.get(lower);
    if (/\d/.test(token) || token.length <= 2)
      return token.toLocaleUpperCase("en");
    return transliterateRussianWord(token);
  });
  const result = tokens
    .join("")
    .replace(/(\d)(?:kh|x)(?=\d)/gi, "$1×")
    .replace(/(\d)\s*(?:g|gr)\b/gi, "$1 г")
    .replace(/(\d)\s*ml\b/gi, "$1 мл")
    .replace(/(\d)\s*mm\b/gi, "$1 мм")
    .replace(/\b(\d{1,2})\s+(\d)\s+(г|мл|мм)(?=\s|$)/g, "$1,$2 $3")
    .replace(/\s+/g, " ")
    .trim();
  return finalizeCanonicalName(
    result.charAt(0).toLocaleUpperCase("ru") + result.slice(1),
  );
}

export function normalizeCatalogUnit(value) {
  const unit = clean(value).toLocaleLowerCase("ru").replace(/\.$/, "");
  if (
    !unit ||
    ["piece", "pieces", "pcs", "pc", "ед", "единица", "штука", "шт"].includes(
      unit,
    )
  )
    return "шт.";
  if (["pack", "package", "уп", "упаковка"].includes(unit)) return "уп.";
  if (["set", "набор", "комплект"].includes(unit)) return "набор";
  return clean(value);
}

export function normalizeCatalogCategory(value) {
  const category = clean(value);
  if (!category || /^https?:\/\//i.test(category) || category.includes("www."))
    return GENERIC_CATEGORY;
  if (/^\d{4}-\d{2}-\d{2}$/.test(category)) return GENERIC_CATEGORY;
  if (/^эндодонти/i.test(category)) return "Эндодонтия";
  return category;
}

export function normalizeSupplierName(value) {
  const supplier = clean(value);
  return SUPPLIER_ALIASES.get(supplier.toLocaleLowerCase("ru")) ?? supplier;
}

export function normalizeCatalogBrand({
  brand,
  manufacturer,
  name,
  category,
} = {}) {
  for (const candidate of [brand, manufacturer].map(clean).filter(Boolean)) {
    for (const [pattern, canonical] of BRAND_ALIASES) {
      if (pattern.test(candidate)) return canonical;
    }
  }
  const explicit = clean(brand);
  if (explicit) return explicit;
  for (const candidate of [name, category].map(clean).filter(Boolean)) {
    for (const [pattern, canonical] of BRAND_ALIASES) {
      if (NAME_INFERABLE_BRANDS.has(canonical) && pattern.test(candidate))
        return canonical;
    }
  }
  return null;
}

export function normalizeCatalogManufacturer(value, brand) {
  const manufacturer = clean(value);
  if (NON_MANUFACTURERS.has(manufacturer.toLocaleLowerCase("ru"))) return null;
  const normalizedBrand = normalizeCatalogBrand({ brand: manufacturer });
  if (normalizedBrand && normalizedBrand === brand) return normalizedBrand;
  return manufacturer || null;
}

export function inferCatalogCategory(name, value) {
  const current = normalizeCatalogCategory(value);
  const normalized = current.toLocaleLowerCase("ru");
  const text = `${clean(name)} ${current}`.toLocaleLowerCase("ru");
  if (/брекет|ортодонт|ретейнер|лигатур|дуг[аи](?:\s|$)|эластик/iu.test(text))
    return "Ортодонтия";
  if (
    /имплант|абатмент|трансфер|формировател|аналоги? имплант|синус-лифт/iu.test(
      text,
    )
  )
    return "Имплантология";
  if (
    /эндодонт|эндомотор|эндоактиватор|апекслокатор|обтурац|корнев.*канал|гутт[ао]|бурав|гейтс|пульпоэкстрактор|эндо\s|файл(?:\s|$)/iu.test(
      text,
    )
  )
    return "Эндодонтия";
  if (
    /автоклав|стерилиз|дистиллятор|запечатыва|термосклеива|ультразвуковая ванна|дезинфекц|assistina|смазк.*наконеч/iu.test(
      text,
    )
  )
    return "Стерилизация";
  if (
    /стоматологическая установка|компрессор|рентген|томограф|визио|интраоральн.*камер|сканер|физиодиспенсер|микромотор|наконечник|аспирац|лампа|аппарат ультразвук|ультразвуковый скалер|порошкоструй|air\s*flow|эйр\s*фло|роторн.*групп|бинокуляр|печь/iu.test(
      text,
    )
  )
    return "Оборудование";
  const currentIsGeneric =
    GENERIC_CATEGORIES.has(normalized) ||
    BRAND_ALIASES.some(
      ([pattern, canonical]) =>
        pattern.test(current) &&
        canonical.toLocaleLowerCase("ru") === normalized,
    );
  if (!currentIsGeneric) return current;
  if (
    /бор(?:\s|$)|буры(?:\s|$)|диск алмаз|полир|инструмент|зонд|пинцет|щипц|ножниц|элеватор|гладил|зеркало|кусачк|зажим|бокс.*бор/iu.test(
      text,
    )
  )
    return "Инструменты";
  if (
    /композит|цемент|адгезив|протрав|пломбиров|герметик|бондинг|анестез|гемостат|кровоостан|лечебн.*паст/iu.test(
      text,
    )
  )
    return "Терапевтические материалы";
  if (
    /зуботехничес|cad.?cam|керамик|воск|гипс|лаборатор|артикулятор|вибростол|пылеуловител|изготовлен.*протез|дублирован|горелка/iu.test(
      text,
    )
  )
    return "Зуботехнические материалы";
  if (/профилактик|гигиен|зубная паста|ёршик|флосс/iu.test(text))
    return "Гигиена и профилактика";
  if (/однораз|расходн|салфет|маск|перчат|валики ватн/iu.test(text))
    return "Расходные материалы";
  return currentIsGeneric ? GENERIC_CATEGORY : current;
}

export function generateCanonicalDescription({
  name,
  category,
  brand,
  manufacturer,
  unit,
  supplierCount = 1,
}) {
  const safeCategory = normalizeCatalogCategory(category);
  const safeBrand = clean(brand);
  const safeUnit = normalizeCatalogUnit(unit);
  const brandAlreadyInName =
    safeBrand &&
    clean(name)
      .toLocaleLowerCase("ru")
      .includes(safeBrand.toLocaleLowerCase("ru"));
  const identity =
    safeBrand && !brandAlreadyInName
      ? `${clean(name)} бренда ${safeBrand}`
      : clean(name);
  const sentences = [
    `${identity} в категории «${safeCategory}».`,
    safeUnit !== "шт."
      ? `Поставляется как ${safeUnit}${safeUnit.endsWith(".") ? "" : "."}`
      : null,
    supplierCount > 1
      ? "Сравните предложения продавцов на одной странице."
      : null,
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
  const sources = [
    ...new Map(
      sourceRecords
        .map((item) => {
          const sourceName = clean(item.source || item.supplier);
          const sourceUrl = clean(item.sourceUrl) || null;
          const rawName = clean(item.rawName) || null;
          return [
            `${sourceName}|${sourceUrl ?? ""}|${rawName ?? ""}`,
            { sourceName, sourceUrl, sourceType: "SUPPLIER_FEED", rawName },
          ];
        })
        .filter(([, source]) => source.sourceName),
    ).values(),
  ];
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

import { normalizeDentalSearchText } from "./dental-search";

export type CatalogDepartment = {
  id: string;
  name: string;
  query: string;
  aliases: string[];
};

export type CatalogTaxonomyNode = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
};

type CatalogProductLike = {
  name?: string | null;
  description?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  categories?: Array<{ name?: string | null }>;
  attributes?: Array<Array<unknown>>;
  variants?: Array<{
    label?: string | null;
    sku?: string | null;
    attributes?: Record<string, unknown>;
  }>;
};

type TaxonomyRule = CatalogTaxonomyNode & {
  keywords: string[];
};

export const CATALOG_DEPARTMENTS: CatalogDepartment[] = [
  {
    id: "endodontics",
    name: "Эндодонтия",
    query: "эндодонтия",
    aliases: ["эндодонтия", "эндо", "endodontics", "endodontic"],
  },
  {
    id: "implantology",
    name: "Имплантология",
    query: "имплантология",
    aliases: ["имплантология", "импланты", "implantology", "implants"],
  },
  {
    id: "restoration",
    name: "Терапия и реставрация",
    query: "терапия и реставрация",
    aliases: ["терапия и реставрация", "реставрация", "composites"],
  },
  {
    id: "prosthetics",
    name: "Ортопедия",
    query: "ортопедия",
    aliases: ["ортопедия", "протезирование", "prosthetics", "prosthodontics"],
  },
  {
    id: "orthodontics",
    name: "Ортодонтия",
    query: "ортодонтия",
    aliases: ["ортодонтия", "orthodontics", "orthodontic"],
  },
  {
    id: "surgery",
    name: "Хирургия",
    query: "стоматологическая хирургия",
    aliases: ["стоматологическая хирургия", "хирургия", "oral surgery"],
  },
  {
    id: "hygiene",
    name: "Профилактика и гигиена",
    query: "профилактика и гигиена",
    aliases: ["профилактика и гигиена", "гигиена", "профилактика", "prophylaxis"],
  },
  {
    id: "sterilization",
    name: "Стерилизация",
    query: "стерилизация",
    aliases: ["стерилизация", "sterilization", "sterilisation"],
  },
  {
    id: "equipment",
    name: "Оборудование",
    query: "оборудование",
    aliases: ["оборудование", "equipment"],
  },
  {
    id: "instruments",
    name: "Инструменты",
    query: "инструменты",
    aliases: ["инструменты", "instruments", "instrumentation"],
  },
  {
    id: "consumables",
    name: "Расходные материалы",
    query: "расходные материалы",
    aliases: ["расходные материалы", "расходники", "consumables", "sundries"],
  },
  {
    id: "laboratory",
    name: "Зуботехническая лаборатория",
    query: "зуботехническая лаборатория",
    aliases: ["зуботехническая лаборатория", "лаборатория", "dental laboratory"],
  },
];

const departmentById = new Map(
  CATALOG_DEPARTMENTS.map((department) => [department.id, department]),
);

const node = (
  departmentId: string,
  id: string,
  name: string,
  keywords: string[],
): TaxonomyRule => ({
  id,
  name,
  departmentId,
  departmentName: departmentById.get(departmentId)?.name ?? "Каталог",
  keywords: keywords.map(normalizeDentalSearchText),
});

// Specific product types go first. This prevents a supplier path such as
// “Diamond burs / Endodontics” from placing ordinary burs in Endodontics.
const TAXONOMY_RULES: TaxonomyRule[] = [
  node("endodontics", "apex-locators", "Апекслокаторы", [
    "апекслокатор", "apex locator", "apexlocator", "определение длины канала", "эндометр",
  ]),
  node("endodontics", "endo-motors", "Эндомоторы и наконечники", [
    "эндомотор", "endo motor", "endomotor", "endo head", "endodontic motor",
    "reciprocating endo", "endo contra angle",
    "endo radar", "endo smart", "endo gold", "endo gt series", "endo mate",
  ]),
  node("endodontics", "endo-access", "Доступ к корневым каналам", [
    "endo access", "endodontic access", "доступ к каналу", "устье канала",
  ]),
  node("instruments", "burs", "Боры и фрезы", [
    "diamond bur", "dental bur", "бор алмазный", "боры", "burs", "фреза твердосплавная",
  ]),
  node("instruments", "handpieces", "Наконечники", [
    "турбинный наконечник", "угловой наконечник", "прямой наконечник", "handpiece", "contra angle",
  ]),
  node("endodontics", "rotary-files", "Машинные файлы", [
    "rotary file", "rotary files", "reciprocating file", "машинные файлы",
    "машинный файл", "файлы машинные", "protaper", "waveone", "mtwo",
    "reciproc", "endo files rotary",
  ]),
  node("endodontics", "hand-files", "Ручные файлы и римеры", [
    "k file", "h file", "hand file", "reamer", "ручные файлы", "ручной файл",
    "нервэкстрактор", "пульпоэкстрактор",
  ]),
  node("endodontics", "endo-files", "Эндодонтические файлы", [
    "эндодонтические файлы", "эндодонтический файл", "endodontic file",
    "endo file", "endofile",
  ]),
  node("endodontics", "irrigation", "Ирригация и обработка каналов", [
    "ирригац", "irrigation", "гипохлорит", "hypochlorite", "edta",
    "канал жидкость", "обработка каналов", "endo activator", "endoactivator",
    "ирригационная игла", "irrigation needle", "жидкость для обработки каналов",
    "эндожи",
  ]),
  node("endodontics", "obturation", "Обтурация и пломбирование каналов", [
    "обтурац", "obturation", "силер", "sealer", "пломбирование каналов",
    "root canal filling", "endodontic filling", "mta", "bioceramic",
    "биокерамический",
  ]),
  node("endodontics", "points", "Гуттаперча и штифты", [
    "гуттаперч", "gutta percha", "paper point", "бумажные штифты",
    "абсорбирующие штифты", "root canal point",
  ]),
  node("endodontics", "endo-instruments", "Ручные эндодонтические инструменты", [
    "plugger", "spreader", "плаггер", "спредер", "endodontic explorer",
    "endodontic excavator", "эндодонтический инструмент",
  ]),
  node("endodontics", "endo-accessories", "Аксессуары и хранение", [
    "endo box", "endodontic box", "эндобокс", "эндодонтическая линейка",
    "endometer", "file holder", "stopper", "silicone stop", "accessories for endodontic",
    "endo block", "endo clean", "endo ruler", "endodontic kit", "file prebender",
  ]),
  node("implantology", "abutments", "Абатменты и формирователи", [
    "abutment", "абатмент", "healing cap", "формирователь десны", "healing abutment",
  ]),
  node("implantology", "implant-prosthetics", "Компоненты для протезирования", [
    "transfer coping", "слепочный трансфер", "scanbody", "scan body",
    "аналог имплантата", "implant analog", "multi unit",
  ]),
  node("implantology", "bone-materials", "Костные материалы и мембраны", [
    "bone graft", "костный материал", "костный заменитель", "мембрана",
    "xenograft", "allograft",
  ]),
  node("implantology", "implant-surgery", "Хирургические наборы и инструменты", [
    "implant kit", "surgical kit", "набор для имплантации", "implant drill",
    "фреза для имплантации",
  ]),
  node("implantology", "implant-motors", "Физиодиспенсеры", [
    "физиодиспенсер", "implant motor", "surgical motor",
  ]),
  node("implantology", "implants", "Имплантаты", [
    "dental implant", "имплантат", "имплант", "fixture",
  ]),
  node("sterilization", "autoclaves", "Автоклавы", [
    "автоклав", "autoclave", "steam sterilizer",
  ]),
  node("sterilization", "ultrasonic-cleaners", "Ультразвуковые мойки", [
    "ультразвуковая мойка", "ultrasonic cleaner", "мойка инструментов",
  ]),
  node("sterilization", "sealers", "Упаковочные машины", [
    "упаковочная машина", "sealing machine", "термозапечатывающая",
  ]),
  node("sterilization", "sterilization-packaging", "Пакеты и рулоны", [
    "пакет для стерилизации", "стерилизационный пакет", "sterilization pouch",
    "sterilization roll", "рулон для стерилизации",
  ]),
  node("sterilization", "disinfection", "Дезинфекция", [
    "дезинфек", "disinfect", "антисептик для инструментов",
  ]),
  node("restoration", "flow-composites", "Текучие композиты", [
    "текучий композит", "flow composite", "flowable",
  ]),
  node("restoration", "composites", "Композиты", [
    "композит", "composite", "restorative", "пломбировочный материал",
  ]),
  node("restoration", "adhesives", "Адгезивные системы", [
    "адгезив", "adhesive", "bonding", "бондинг", "bond",
  ]),
  node("restoration", "etching", "Протравочные материалы", [
    "протравочный", "травление", "etch", "phosphoric acid", "фосфорная кислота",
  ]),
  node("restoration", "matrices", "Матрицы и клинья", [
    "матрица", "matrix", "клинья", "wedge", "sectional matrix",
  ]),
  node("restoration", "curing-lights", "Полимеризационные лампы", [
    "полимеризационная лампа", "curing light", "фотополимеризатор",
  ]),
  node("prosthetics", "cements", "Цементы для фиксации", [
    "цемент для фиксации", "luting cement", "resin cement", "фиксирующий цемент",
  ]),
  node("prosthetics", "impression-materials", "Оттискные материалы", [
    "оттискной материал", "impression material", "альгинат", "silicone impression",
  ]),
  node("prosthetics", "impression-trays", "Оттискные ложки", [
    "оттискная ложка", "impression tray",
  ]),
  node("prosthetics", "temporary-materials", "Временные материалы", [
    "временная коронка", "temporary crown", "временный цемент", "temporary cement",
  ]),
  node("orthodontics", "brackets", "Брекеты", [
    "брекет", "bracket", "braces",
  ]),
  node("orthodontics", "archwires", "Дуги", [
    "ортодонтическая дуга", "archwire", "nitinol arch",
  ]),
  node("orthodontics", "orthodontic-accessories", "Эластики и аксессуары", [
    "эластик", "ligature", "лигатура", "orthodontic accessories",
  ]),
  node("surgery", "extraction", "Инструменты для удаления", [
    "щипцы для удаления", "extraction forceps", "элеватор", "luxator",
  ]),
  node("surgery", "sutures", "Шовные материалы", [
    "шовный материал", "suture", "хирургическая нить",
  ]),
  node("hygiene", "prophylaxis", "Профессиональная гигиена", [
    "профилактика", "prophylaxis", "air flow", "airflow", "полировочная паста",
  ]),
  node("hygiene", "scalers", "Скейлеры и насадки", [
    "скейлер", "scaler", "ultrasonic tip", "пародонтологическая насадка",
  ]),
  node("equipment", "dental-units", "Стоматологические установки", [
    "стоматологическая установка", "dental unit", "dental chair",
  ]),
  node("equipment", "radiology", "Рентген и визуализация", [
    "рентген", "x ray", "радиовизиограф", "rvg", "томограф", "scanner",
  ]),
  node("equipment", "compressors", "Компрессоры и аспирация", [
    "компрессор", "compressor", "аспирационная система", "suction",
  ]),
  node("laboratory", "lab-equipment", "Лабораторное оборудование", [
    "зуботехнический", "dental laboratory", "lab equipment", "печь для керамики",
  ]),
  node("consumables", "gloves", "Перчатки", [
    "перчатки", "gloves", "нитриловые",
  ]),
  node("consumables", "barrier-protection", "Защита и одноразовые материалы", [
    "маска медицинская", "нагрудник", "салфетки", "бахилы", "одноразовый",
    "disposable", "barrier film",
  ]),
];

const DEPARTMENT_FALLBACK_KEYWORDS: Array<{
  departmentId: string;
  keywords: string[];
}> = [
  {
    departmentId: "endodontics",
    keywords: ["эндодонт", "endodont", "корневой канал", "root canal", "endo "],
  },
  {
    departmentId: "implantology",
    keywords: ["имплантолог", "implantology", "implant "],
  },
  {
    departmentId: "orthodontics",
    keywords: ["ортодонт", "orthodont"],
  },
  {
    departmentId: "prosthetics",
    keywords: ["ортопед", "prosthetic", "prosthodont"],
  },
  {
    departmentId: "sterilization",
    keywords: ["стерилиз", "steriliz", "sterilis"],
  },
  {
    departmentId: "hygiene",
    keywords: ["гигиен", "профилакти", "hygiene", "prophylaxis"],
  },
  {
    departmentId: "surgery",
    keywords: ["хирург", "surgery", "surgical"],
  },
  {
    departmentId: "restoration",
    keywords: ["терапия", "реставрац", "restorative"],
  },
  {
    departmentId: "laboratory",
    keywords: ["зуботехничес", "laboratory", "dental lab"],
  },
  {
    departmentId: "equipment",
    keywords: ["оборудован", "equipment", "аппарат", "device"],
  },
  {
    departmentId: "instruments",
    keywords: ["инструмент", "instrument", "forceps", "ножницы"],
  },
];

const normalizedProductText = (product: CatalogProductLike) =>
  normalizeDentalSearchText(
    [
      product.name,
      product.description,
      product.brand,
      product.manufacturer,
      product.category,
      ...(product.categories ?? []).map(({ name }) => name),
      ...(product.attributes ?? []).flat(),
      ...(product.variants ?? []).flatMap((variant) => [
        variant.label,
        variant.sku,
        ...Object.values(variant.attributes ?? {}),
      ]),
    ]
      .filter(Boolean)
      .join(" "),
  );

const includesKeyword = (text: string, keyword: string) =>
  text.includes(normalizeDentalSearchText(keyword));

const classificationCache = new WeakMap<object, CatalogTaxonomyNode>();

export const classifyCatalogProduct = (
  product: CatalogProductLike,
): CatalogTaxonomyNode => {
  const cached = classificationCache.get(product);
  if (cached) return cached;
  const text = normalizedProductText(product);
  const exactRule = TAXONOMY_RULES.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword)),
  );
  if (exactRule) {
    const { keywords: _keywords, ...category } = exactRule;
    classificationCache.set(product, category);
    return category;
  }

  const departmentMatch = DEPARTMENT_FALLBACK_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => includesKeyword(text, keyword)),
  );
  const departmentId = departmentMatch?.departmentId ?? "consumables";
  const department =
    departmentById.get(departmentId) ??
    departmentById.get("consumables")!;
  const category = {
    id: `${department.id}-other`,
    name: "Другие товары раздела",
    departmentId: department.id,
    departmentName: department.name,
  };
  classificationCache.set(product, category);
  return category;
};

export const canonicalCategoriesForProduct = (product: CatalogProductLike) => {
  const category = classifyCatalogProduct(product);
  return [
    {
      id: category.departmentId,
      name: category.departmentName,
    },
    {
      id: category.id,
      name: category.name,
    },
  ];
};

export const catalogDepartmentForQuery = (query: string) => {
  const normalized = normalizeDentalSearchText(query);
  if (!normalized) return null;
  return (
    CATALOG_DEPARTMENTS.find((department) =>
      department.aliases.some(
        (alias) => normalizeDentalSearchText(alias) === normalized,
      ),
    ) ?? null
  );
};

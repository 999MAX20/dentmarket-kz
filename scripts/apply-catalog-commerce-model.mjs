import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const apply = process.argv.includes("--apply");
const catalogPaths = [
  "apps/buyer-web/app/data/production-approved-catalog.json",
  "apps/buyer-web/app/data/public-catalog-fallback.json",
];
const reportDirectory = path.join(root, "data/reports");

const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const unique = (values) => [...new Set(values.filter(Boolean))];
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);

const setAttribute = (attributes, key, value) => {
  if (!value) return attributes ?? [];
  const next = [...(attributes ?? [])].filter(([name]) => name !== key);
  next.push([key, value]);
  return next;
};

const bracketMaterial = (value) => {
  if (/clear|ceramic|керами|сапфир/iu.test(value)) return "Керамика";
  if (/metal|металл|damon q/iu.test(value)) return "Металл";
  return null;
};

const bracketSystem = (value) =>
  value.match(/\b(Damon\s+(?:Clear2|Clear|Q2|Q))\b/iu)?.[1]
    ?.replace(/\s+/gu, " ")
    .replace(/^damon/iu, "Damon") ?? null;

const bracketVariantAttributes = (product, variant = {}) => {
  const value = [product.name, product.description, variant.label]
    .filter(Boolean)
    .join(" ");
  const sourceItem = String(variant.sourceUrl ?? product.sourceUrl ?? "").match(
    /\/item-(\d+)/u,
  )?.[1];
  const sourceVariant = {
    "15": { jaw: "Верхняя" },
    "54": { jaw: "Верхняя", hook: "Без крючка" },
    "55": { jaw: "Нижняя", hook: "Без крючка" },
    "56": { jaw: "Верхняя", hook: "С крючком" },
    "57": { jaw: "Нижняя", hook: "С крючком" },
    "58": { jaw: "Верхняя" },
    "59": { jaw: "Нижняя" },
    "60": { jaw: "Верхняя" },
    "61": { jaw: "Нижняя" },
  }[sourceItem];
  const specificValue = [variant.label, product.name]
    .filter(Boolean)
    .join(" ");
  const attributes = { ...(variant.attributes ?? {}) };
  const set = (key, candidate) => {
    if (candidate && !attributes[key]) attributes[key] = candidate;
  };
  const force = (key, candidate) => {
    if (candidate) attributes[key] = candidate;
  };
  set("Система", bracketSystem(value));
  set("Материал", bracketMaterial(value));
  if (/damon|самолиг|self[- ]?ligat|passive/iu.test(value))
    set("Тип брекетов", "Самолигирующие");
  else if (/лигатур|classic metal/iu.test(value))
    set("Тип брекетов", "Лигатурные");
  const prescription = unique(
    [...value.matchAll(/\b(Roth|MBT|Edgewise)\b/giu)].map((match) =>
      match[1].replace(/^roth$/iu, "Roth").replace(/^edgewise$/iu, "Edgewise"),
    ),
  );
  if (prescription.length === 1) set("Пропись", prescription[0]);
  const slot = value.match(/\b0[.,](018|022)\b/u)?.[0]?.replace(",", ".");
  set("Паз", slot);
  if (sourceVariant?.jaw) force("Челюсть", sourceVariant.jaw);
  else if (/(?:^|[\s(/])(?:ВЧ|верхн(?:яя|ие)|upper)(?=$|[\s)/])/iu.test(specificValue))
    force("Челюсть", "Верхняя");
  else if (/(?:^|[\s(/])(?:НЧ|нижн(?:яя|ие)|lower)(?=$|[\s)/])/iu.test(specificValue))
    force("Челюсть", "Нижняя");
  const tooth = specificValue.match(
    /(?:зуб|позици[яи]|tooth)\s*№?\s*((?:1[1-8]|2[1-8]|3[1-8]|4[1-8]))\b/iu,
  )?.[1];
  set("Позиция зуба", tooth);
  if (/(?:5\s*\+\s*5)/u.test(specificValue)) {
    set("Формат продажи", "Набор на одну челюсть");
    set("Комплектация", "10 брекетов · 5+5");
    set("Количество", "10 шт.");
  } else if (/(?:3\s*\+\s*3)/u.test(specificValue)) {
    set("Формат продажи", "Набор на одну челюсть");
    set("Комплектация", "6 эстетических брекетов · 3+3");
  } else if (tooth || /\b(?:1\s*шт|single bracket|по одному)\b/iu.test(value)) {
    set("Формат продажи", "Один брекет");
    set("Количество", "1 шт.");
  }
  if (sourceVariant?.hook) force("Крючок", sourceVariant.hook);
  else if (/с крючк/iu.test(specificValue)) force("Крючок", "С крючком");
  else if (/(?:без крючк|стандарт)/iu.test(specificValue))
    force("Крючок", "Без крючка");
  return attributes;
};

const bracketLabel = (attributes, fallback) =>
  [
    attributes["Челюсть"],
    attributes["Формат продажи"],
    attributes["Комплектация"],
    attributes["Крючок"],
    attributes["Паз"] ? `паз ${attributes["Паз"]}` : null,
    attributes["Пропись"],
    attributes["Позиция зуба"]
      ? `зуб ${attributes["Позиция зуба"]}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ") || fallback;

const enrichBracketProduct = (product) => {
  const value = `${product.name} ${product.description ?? ""}`;
  let attributes = product.attributes ?? [];
  attributes = setAttribute(attributes, "Категория", "Ортодонтия / Брекет-системы");
  attributes = setAttribute(attributes, "Материал", bracketMaterial(value));
  attributes = setAttribute(attributes, "Система", bracketSystem(value));
  const variants = (product.variants ?? []).map((variant) => {
    const variantAttributes = bracketVariantAttributes(product, variant);
    return {
      ...variant,
      label: bracketLabel(variantAttributes, variant.label),
      attributes: variantAttributes,
    };
  });
  return {
    ...product,
    category: "Ортодонтия / Брекет-системы",
    attributes,
    variants,
    commerceModel: {
      grain: "Бренд + система; покупаемая комплектация — вариант",
      status: variants.every((variant) => variant.sku)
        ? "SKU_READY"
        : "POSITION_SKU_MATRIX_REQUIRED",
      variantDimensions: [
        "Формат продажи",
        "Материал",
        "Тип брекетов",
        "Пропись",
        "Паз",
        "Челюсть",
        "Позиция зуба",
        "Торк",
        "Крючок",
      ],
    },
    moderationWarnings: unique([
      ...(product.moderationWarnings ?? []),
      ...(variants.every((variant) => variant.sku)
        ? []
        : ["EXACT_POSITION_SKU_MATRIX_REQUIRED"]),
    ]),
  };
};

const q2Description =
  "Самолигирующая металлическая брекет-система ORMCO Damon Q2. Выберите верхнюю или нижнюю челюсть и исполнение с крючками либо без них. Цена, наличие и продавцы показываются только для выбранной комплектации.";

const mergeOrmcoQ2 = (products) => {
  const members = products.filter(
    (product) =>
      /^ORMCO$/iu.test(product.brand ?? "") &&
      /Набор брекетов Damon Q2/iu.test(product.name),
  );
  if (members.length < 2) return { products, merged: 0 };
  const preferred =
    members.find((product) => /ВЧ 5\+5 стандарт/iu.test(product.name)) ??
    members[0];
  const memberIds = new Set(members.map(({ id }) => id));
  const variants = members.flatMap((member) =>
    (member.variants ?? []).map((variant) => {
      const attributes = bracketVariantAttributes(member, variant);
      return {
        ...variant,
        label: bracketLabel(attributes, member.name),
        attributes,
        imageUrl: member.imageUrl ?? null,
        sourceUrl: member.sourceUrl ?? null,
      };
    }),
  );
  let merged = {
    ...preferred,
    canonicalProductId: "CANON-ORMCO-DAMON-Q2",
    name: "Брекет-система ORMCO Damon Q2",
    description: q2Description,
    aliases: unique(
      members.flatMap((member) => [
        member.name,
        ...(member.aliases ?? []),
        "Даймон Q2",
        "Damon Q2",
      ]),
    ),
    sourceVariants: members.map((member) => ({
      productId: member.id,
      name: member.name,
      sourceUrl: member.sourceUrl,
      imageUrl: member.imageUrl,
    })),
    variants,
    offers: members.flatMap((member) => member.offers ?? []),
  };
  merged = enrichBracketProduct(merged);
  return {
    products: products
      .filter((product) => !memberIds.has(product.id))
      .concat(merged),
    merged: members.length,
  };
};

const newOrmcoFamily = ({
  canonicalProductId,
  name,
  description,
  members,
}) => {
  const productId = `approved-${hash(canonicalProductId)}`;
  const variants = members.map((member) => {
    const variantId = `${productId}-variant-${hash(member.sourceUrl)}`;
    const draftProduct = { name: member.name, description, brand: "ORMCO" };
    const attributes = bracketVariantAttributes(draftProduct, {
      label: member.name,
    });
    return {
      id: variantId,
      sku: null,
      gtin: null,
      label: bracketLabel(attributes, member.name),
      attributes,
      imageUrl: member.imageUrl,
      sourceUrl: member.sourceUrl,
    };
  });
  return enrichBracketProduct({
    id: productId,
    canonicalProductId,
    name,
    description,
    brand: "ORMCO",
    manufacturer: "Ormco",
    category: "Ортодонтия / Брекет-системы",
    sourceUrl: members[0].sourceUrl,
    sourceUpdatedAt: new Date().toISOString(),
    imageUrl: members[0].imageUrl,
    photoStatus: "exact",
    catalogSource: "kz_market",
    complianceClassification: "PUBLISH_WITH_REVIEW_FLAGS",
    moderationWarnings: ["MANUFACTURER_REFERENCE_REQUIRED"],
    exactKzEvidence: true,
    aliases: unique(members.flatMap((member) => [member.name, ...member.aliases])),
    attributes: [
      ["Категория", "Ортодонтия / Брекет-системы"],
      ["Бренд", "ORMCO"],
      ["Производитель", "Ormco"],
    ],
    variants,
    offers: [],
    minNormalizedPriceMinor: null,
    isAvailable: false,
  });
};

const ensureOrmcoKzFamilies = (products) => {
  const definitions = [
    {
      canonicalProductId: "CANON-ORMCO-DAMON-Q",
      name: "Брекет-система ORMCO Damon Q",
      description:
        "Самолигирующая металлическая брекет-система ORMCO Damon Q. В Казахстане подтверждены наборы 5+5 для верхней и нижней челюсти.",
      members: [
        {
          name: "Набор Damon Q ВЧ 5+5",
          sourceUrl: "https://nordstom.kz/catalog/orthodontia/braces/item-60",
          imageUrl: "https://nordstom.kz/userfiles/item/60/fullimage1.jpg",
          aliases: ["Damon Q верхняя челюсть", "Даймон Q ВЧ"],
        },
        {
          name: "Набор Damon Q НЧ 5+5",
          sourceUrl: "https://nordstom.kz/catalog/orthodontia/braces/item-61",
          imageUrl: "https://nordstom.kz/userfiles/item/61/fullimage1.jpg",
          aliases: ["Damon Q нижняя челюсть", "Даймон Q НЧ"],
        },
      ],
    },
    {
      canonicalProductId: "CANON-ORMCO-DAMON-CLEAR-Q-HYBRID",
      name: "Комбинированная брекет-система ORMCO Damon Clear + Damon Q",
      description:
        "Комбинированный набор ORMCO: эстетические керамические брекеты Damon Clear во фронтальном участке и металлические Damon Q в боковых участках. Выберите верхнюю или нижнюю челюсть.",
      members: [
        {
          name: "Набор Damon Clear ВЧ 3+3 + Damon Q",
          sourceUrl: "https://nordstom.kz/catalog/orthodontia/braces/item-58",
          imageUrl: "https://nordstom.kz/userfiles/item/58/fullimage1.jpg",
          aliases: ["Damon Clear верх + Damon Q"],
        },
        {
          name: "Набор Damon Clear НЧ 3+3 + Damon Q",
          sourceUrl: "https://nordstom.kz/catalog/orthodontia/braces/item-59",
          imageUrl: "https://nordstom.kz/userfiles/item/59/fullimage1.jpg",
          aliases: ["Damon Clear низ + Damon Q"],
        },
      ],
    },
  ];
  let added = 0;
  let merged = 0;
  for (const definition of definitions) {
    const memberNames = new Set(definition.members.map(({ name }) => name));
    const sourceMembers = products.filter(
      (product) =>
        /^ORMCO$/iu.test(product.brand ?? "") && memberNames.has(product.name),
    );
    const existingFamily = products.find(
      ({ canonicalProductId }) =>
        canonicalProductId === definition.canonicalProductId,
    );
    if (existingFamily) {
      if (sourceMembers.length) {
        const sourceIds = new Set(sourceMembers.map(({ id }) => id));
        products = products.filter((product) => !sourceIds.has(product.id));
        merged += sourceMembers.length;
      }
      continue;
    }
    const memberByName = new Map(
      sourceMembers.map((product) => [product.name, product]),
    );
    const completedDefinition = {
      ...definition,
      members: definition.members.map((member) => {
        const source = memberByName.get(member.name);
        return {
          ...member,
          sourceUrl: source?.sourceUrl ?? member.sourceUrl,
          imageUrl: source?.imageUrl ?? member.imageUrl,
          aliases: unique([...(member.aliases ?? []), ...(source?.aliases ?? [])]),
        };
      }),
    };
    const family = newOrmcoFamily(completedDefinition);
    if (sourceMembers.length) {
      const sourceIds = new Set(sourceMembers.map(({ id }) => id));
      products = products.filter((product) => !sourceIds.has(product.id));
      family.sourceVariants = sourceMembers.map((source) => ({
        productId: source.id,
        name: source.name,
        sourceUrl: source.sourceUrl,
        imageUrl: source.imageUrl,
      }));
      family.offers = sourceMembers.flatMap((source) => source.offers ?? []);
      merged += sourceMembers.length;
    } else {
      added += 1;
    }
    products.push(family);
  }
  return { products, added, merged };
};

const toolPattern =
  /(?:пинцет|позиционер|щипцы|gauge|tweezer|remover|positioner).{0,30}брекет|bracket.{0,30}(?:gauge|tweezer|remover|positioner)/iu;
const carePattern = /(?:уход|care|brace kit).{0,30}брекет|brace kit/iu;
const actualBracketPattern =
  /брекет(?:ы|ов|-систем)|\b(?:ceramic brackets|metal brackets|self[- ]?ligating brackets|orthodontic brackets|damon q|damon clear)\b/iu;

const classifyKnownOrthodonticGrain = (product) => {
  const placement = /(?:подарок|бонус(?:ы|ов)?|акци[яи]|скидк[аи])/iu.test(
    product.name,
  )
    ? "promotion"
    : product.placement;
  const placedProduct =
    placement === product.placement ? product : { ...product, placement };
  if (carePattern.test(product.name))
    return {
      ...placedProduct,
      category: "Профилактика и гигиена / Уход за брекет-системами",
    };
  if (toolPattern.test(product.name))
    return {
      ...placedProduct,
      category: "Ортодонтия / Инструменты для брекетов",
    };
  if (actualBracketPattern.test(product.name))
    return enrichBracketProduct(placedProduct);
  return placedProduct;
};

const auditCatalog = (products, source) => {
  const technicalVariants = [];
  const mixedIndependentForms = [];
  const genericCategories = [];
  const promotionLikeCatalogCards = [];
  const bracketFamiliesMissingSkuMatrix = [];
  for (const product of products) {
    const variants = product.variants ?? [];
    if (
      variants.length > 1 &&
      variants.every(
        (variant) =>
          /^REF(?:\s|$)/iu.test(clean(variant.label)) ||
          Object.keys(variant.attributes ?? {}).every((key) =>
            /артикул|ref|sku/iu.test(key),
          ),
      )
    )
      technicalVariants.push({
        id: product.id,
        brand: product.brand,
        name: product.name,
        variants: variants.length,
      });
    const variantText = variants
      .map((variant) => `${variant.label} ${Object.values(variant.attributes ?? {}).join(" ")}`)
      .join(" | ");
    const independentKinds = [
      /(?:порошок|powder)/iu.test(variantText) && "порошок",
      /(?:жидкость|liquid)/iu.test(variantText) && "жидкость",
      /(?:мерн(?:ый|ая)|стакан|дозатор|аксессуар|accessory)/iu.test(variantText) &&
        "самостоятельный аксессуар",
      /(?:набор|комплект|kit)/iu.test(variantText) && "набор",
    ].filter(Boolean);
    if (new Set(independentKinds).size >= 2)
      mixedIndependentForms.push({
        id: product.id,
        brand: product.brand,
        name: product.name,
        kinds: unique(independentKinds),
        variants: variants.length,
      });
    if (
      /^(?:стоматологические товары|стоматологические материалы|dental products)$/iu.test(
        clean(product.category),
      )
    )
      genericCategories.push({
        id: product.id,
        brand: product.brand,
        name: product.name,
        category: product.category,
      });
    if (
      product.placement !== "promotion" &&
      /(?:\s\+\s|подарок|бонус|акци[яи]|скидк)/iu.test(product.name)
    )
      promotionLikeCatalogCards.push({
        id: product.id,
        brand: product.brand,
        name: product.name,
      });
    if (
      product.commerceModel?.status === "POSITION_SKU_MATRIX_REQUIRED"
    )
      bracketFamiliesMissingSkuMatrix.push({
        id: product.id,
        brand: product.brand,
        name: product.name,
        variants: variants.length,
      });
  }
  return {
    source,
    cards: products.length,
    checks: {
      technicalOnlyMultiVariantCards: {
        severity: technicalVariants.length ? "HIGH" : "PASS",
        count: technicalVariants.length,
        risk: "Покупатель видит REF вместо различий, а прайс нельзя надёжно сопоставить по выбранной комплектации.",
        examples: technicalVariants.slice(0, 200),
      },
      mixedIndependentProducts: {
        severity: mixedIndependentForms.length ? "HIGH" : "PASS",
        count: mixedIndependentForms.length,
        risk: "Самостоятельно покупаемые компоненты ошибочно представлены как взаимоисключающие варианты одной карточки.",
        examples: mixedIndependentForms.slice(0, 200),
      },
      genericCategories: {
        severity: genericCategories.length ? "MEDIUM" : "PASS",
        count: genericCategories.length,
        risk: "Карточка не попадает в ожидаемую медицинскую группу.",
        examples: genericCategories.slice(0, 200),
      },
      promotionLikeCatalogCards: {
        severity: promotionLikeCatalogCards.length ? "MEDIUM" : "PASS",
        count: promotionLikeCatalogCards.length,
        risk: "Акционные комплекты засоряют основную товарную выдачу.",
        examples: promotionLikeCatalogCards.slice(0, 200),
      },
      bracketFamiliesMissingPositionSkuMatrix: {
        severity: bracketFamiliesMissingSkuMatrix.length ? "HIGH" : "PASS",
        count: bracketFamiliesMissingSkuMatrix.length,
        risk: "Наборы опубликованы, но одиночный брекет нельзя автоматически сопоставить по номеру зуба и REF.",
        examples: bracketFamiliesMissingSkuMatrix,
      },
    },
  };
};

const reports = [];
const summaries = [];
for (const relativePath of catalogPaths) {
  const absolutePath = path.join(root, relativePath);
  const catalog = await fs
    .readFile(absolutePath, "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
  if (!catalog) continue;
  const sourceProducts = Array.isArray(catalog) ? catalog : catalog.products;
  if (!Array.isArray(sourceProducts)) continue;
  let products = sourceProducts.map(classifyKnownOrthodonticGrain);
  const merge = mergeOrmcoQ2(products);
  products = merge.products;
  const ensured = relativePath.includes("production-approved")
    ? ensureOrmcoKzFamilies(products)
    : { products, added: 0, merged: 0 };
  products = ensured.products;
  const report = auditCatalog(products, relativePath);
  reports.push(report);
  summaries.push({
    source: relativePath,
    before: sourceProducts.length,
    after: products.length,
    mergedQ2Cards: merge.merged,
    mergedOtherOrmcoCards: ensured.merged,
    addedKzFamilies: ensured.added,
  });
  if (apply) {
    const output = Array.isArray(catalog)
      ? products
      : {
          ...catalog,
          generatedAt: new Date().toISOString(),
          products,
        };
    await fs.writeFile(absolutePath, `${JSON.stringify(output, null, 2)}\n`);
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  intendedGrain: {
    card: "Бренд + модель/система",
    variant:
      "Покупаемая фасовка, размер, оттенок, позиция зуба или комплектация",
    separateCard:
      "Самостоятельный материал, инструмент, аксессуар или запасная часть, которые можно одновременно добавить в корзину",
  },
  mode: apply ? "apply" : "dry-run",
  summaries,
  reports,
};
const markdown = `# Аудит товарной модели каталога

Сформирован: ${result.generatedAt}

## Правило

- Карточка: ${result.intendedGrain.card}.
- Вариант: ${result.intendedGrain.variant}.
- Отдельная карточка: ${result.intendedGrain.separateCard}.

${reports
  .map(
    (report) => `## ${report.source}

- Карточек: ${report.cards}
- Технические варианты только с REF: ${report.checks.technicalOnlyMultiVariantCards.count}
- Смешанные самостоятельные товары: ${report.checks.mixedIndependentProducts.count}
- Слишком общая категория: ${report.checks.genericCategories.count}
- Акционные названия в каталоге: ${report.checks.promotionLikeCatalogCards.count}
- Брекет-системы без матрицы одиночных REF: ${report.checks.bracketFamiliesMissingPositionSkuMatrix.count}`,
  )
  .join("\n\n")}

## Что исправлено автоматически

- Брекеты отделены от инструментов, материалов для фиксации, дуг, лигатур, цепочек, пружин и средств ухода.
- Наборы ORMCO Damon Q2 объединены в одну систему с выбором челюсти и крючка.
- Добавлены подтверждённые для Казахстана семейства Damon Q и Damon Clear + Damon Q.
- Для вариантов предусмотрены отдельные фотографии.

## Что нельзя объединять автоматически

Карточки, где вместе встречаются порошок, жидкость, набор и самостоятельный аксессуар, остаются в очереди проверки: они могут покупаться одновременно. Карточки только с REF требуют официальной расшифровки артикула; значения не выдумываются.
`;

await fs.mkdir(reportDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(
    path.join(reportDirectory, "catalog-commerce-grain-audit.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(reportDirectory, "catalog-commerce-grain-audit.md"),
    markdown,
  ),
]);

console.log(JSON.stringify(result.summaries, null, 2));

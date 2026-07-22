import fs from "node:fs/promises";
import path from "node:path";
import { normalizedCatalogIdentity } from "./lib/variant-attributes.mjs";

const root = path.resolve(process.cwd());
const catalogPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const mediaPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-media.json",
);
const reportDirectory = path.join(root, "data/reports");
const familyDecisionsPath = path.join(
  root,
  "data/catalog-family-decisions.json",
);
const jsonPath = path.join(reportDirectory, "catalog-normalization-audit.json");
const markdownPath = path.join(
  reportDirectory,
  "catalog-normalization-audit.md",
);

const [catalog, media, familyDecisionRegistry] = await Promise.all([
  fs.readFile(catalogPath, "utf8").then(JSON.parse),
  fs.readFile(mediaPath, "utf8").then(JSON.parse),
  fs
    .readFile(familyDecisionsPath, "utf8")
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return { decisions: [] };
      throw error;
    }),
]);
const products = catalog.products ?? [];
const percent = (count) =>
  Number(((count / Math.max(products.length, 1)) * 100).toFixed(1));
const groupBy = (items, getKey) =>
  items.reduce((groups, item) => {
    const key = getKey(item);
    if (!key) return groups;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
    return groups;
  }, new Map());

const familyBase = (name) =>
  normalizedCatalogIdentity(name)
    .replace(
      /\b(?:a[1-4](?: 5)?|b[1-4]|c[1-4]|d[2-4]|oa[1-4](?: 5)?|ao\d|ae|je|bw|bow|tr|wo|po|ga\d(?: \d+)?|bl)\b/giu,
      " ",
    )
    .replace(/\b\d+(?: \d+)?\s*(?:мл|ml|мг|г|гр|g|л|шт|pcs|mm|мм)\b/giu, " ")
    .replace(/\b(?:refill|шприц|капсулы|капсула|унидозы|унидоза)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();

const duplicateGroups = [
  ...groupBy(products, (product) =>
    [product.brand || "Без бренда", product.name]
      .map(normalizedCatalogIdentity)
      .join("|"),
  ).entries(),
]
  .filter(([, cards]) => cards.length > 1)
  .map(([key, cards]) => ({
    key,
    cards: cards.map((card) => ({ id: card.id, name: card.name })),
  }));

const detectedFamilyCandidates = [
  ...groupBy(products, (product) => {
    const base = familyBase(product.name);
    if (base.length < 8) return "";
    return `${normalizedCatalogIdentity(product.brand || "Без бренда")}|${base}`;
  }).entries(),
]
  .filter(([, cards]) => cards.length > 1)
  .map(([key, cards]) => ({
    key,
    confidence:
      cards.every((card) => card.brand) &&
      new Set(cards.map((card) => card.brand)).size === 1
        ? "MEDIUM"
        : "MANUAL_REVIEW",
    cards: cards.map((card) => ({
      id: card.id,
      name: card.name,
      brand: card.brand,
      sourceUrl: card.sourceUrl,
    })),
  }))
  .sort(
    (left, right) =>
      right.cards.length - left.cards.length ||
      left.key.localeCompare(right.key, "ru"),
  );
const familyDecisionByKey = new Map(
  (familyDecisionRegistry.decisions ?? []).map((decision) => [
    decision.familyKey,
    decision,
  ]),
);
const resolvedFamilyDecisions = detectedFamilyCandidates
  .filter((group) => familyDecisionByKey.has(group.key))
  .map((group) => ({ ...group, ...familyDecisionByKey.get(group.key) }));
const familyCandidates = detectedFamilyCandidates.filter(
  (group) => !familyDecisionByKey.has(group.key),
);

const variants = products.flatMap((product) =>
  (product.variants ?? []).map((variant) => ({ product, variant })),
);
const configuredVariants = variants.filter(({ variant }) =>
  Object.keys(variant.attributes ?? {}).some(
    (key) => key !== "Артикул производителя",
  ),
);
const technicalVariantLabels = variants.filter(({ variant }) =>
  /^REF(?:\s|$)/i.test(String(variant.label ?? "")),
);
const variantDataInCardName = products.filter((product) =>
  /(?:\b\d+(?:[.,]\d+)?\s*(?:мл|мг|г|гр|л|шт|pcs|mm|мм)\b|\b(?:A[1-4](?:[.,]5)?|B[1-4]|C[1-4]|D[2-4]|OA\d|GA\d)\b)/iu.test(
    product.name,
  ),
);
const exactMedia = products.filter(
  (product) =>
    media.entries?.[product.sourceUrl]?.metadata?.exactProductPhoto === true,
);
const anyMedia = products.filter((product) =>
  Boolean(media.entries?.[product.sourceUrl]?.securePath),
);
const unverifiedMediaRights = products.filter(
  (product) =>
    media.entries?.[product.sourceUrl]?.metadata?.rightsStatus ===
    "SOURCE_UNVERIFIED",
);

const report = {
  generatedAt: new Date().toISOString(),
  dataset: {
    source: path.relative(root, catalogPath),
    intendedGrain:
      "Одна карточка на бренд и модель; фасовки и оттенки — варианты",
    cards: products.length,
    variants: variants.length,
    offers: products.reduce(
      (total, product) => total + (product.offers?.length ?? 0),
      0,
    ),
  },
  checks: {
    uniqueness: {
      duplicateGroups: duplicateGroups.length,
      affectedCards: duplicateGroups.reduce(
        (total, group) => total + group.cards.length,
        0,
      ),
      evidence: duplicateGroups,
    },
    completeness: {
      brand: {
        cards: products.filter((product) => product.brand).length,
        percent: percent(products.filter((product) => product.brand).length),
      },
      manufacturer: {
        cards: products.filter((product) => product.manufacturer).length,
        percent: percent(
          products.filter((product) => product.manufacturer).length,
        ),
      },
      description: {
        cards: products.filter((product) => product.description).length,
        percent: percent(
          products.filter((product) => product.description).length,
        ),
      },
      exactProductPhoto: {
        cards: exactMedia.length,
        percent: percent(exactMedia.length),
      },
      anyPhoto: {
        cards: anyMedia.length,
        percent: percent(anyMedia.length),
      },
    },
    variantModel: {
      multiVariantCards: products.filter(
        (product) => (product.variants?.length ?? 0) > 1,
      ).length,
      structuredVariants: configuredVariants.length,
      structuredVariantPercent: Number(
        (
          (configuredVariants.length / Math.max(variants.length, 1)) *
          100
        ).toFixed(1),
      ),
      technicalLabels: technicalVariantLabels.length,
      cardsWithVariantDataInName: variantDataInCardName.length,
      candidateFamilyGroups: familyCandidates.length,
      candidateFamilies: familyCandidates,
      resolvedFamilyGroups: resolvedFamilyDecisions.length,
      resolvedFamilyDecisions,
    },
    mediaRights: {
      sourceUnverifiedCards: unverifiedMediaRights.length,
      percent: percent(unverifiedMediaRights.length),
    },
  },
  findings: [
    {
      severity: duplicateGroups.length ? "CRITICAL" : "PASS",
      confidence: "HIGH",
      finding: "Уникальность карточки по нормализованным бренду и названию",
      affectedCards: duplicateGroups.reduce(
        (total, group) => total + group.cards.length,
        0,
      ),
      risk: "Дубли разделяют предложения поставщиков и мешают сравнению цен.",
      remediation:
        "Автоматически объединять только пунктуационно эквивалентные названия внутри одного бренда.",
    },
    {
      severity:
        percent(products.filter((product) => product.brand).length) < 50
          ? "HIGH"
          : "MEDIUM",
      confidence: "HIGH",
      finding: "Заполнение бренда",
      affectedCards: products.filter((product) => !product.brand).length,
      risk: "Без бренда нельзя безопасно объединять фасовки и выбирать производителя.",
      remediation:
        "Обогащать бренд только по официальному артикулу, справочнику производителя или подтверждённому прайсу.",
    },
    {
      severity: anyMedia.length < products.length ? "HIGH" : "PASS",
      confidence: "HIGH",
      finding: "Покрытие фотографиями",
      affectedCards: products.length - anyMedia.length,
      risk: "Пустые или категорийные изображения снижают доверие к карточке.",
      remediation:
        "Публиковать точное фото модели после проверки источника и прав использования.",
    },
    {
      severity: familyCandidates.length ? "MEDIUM" : "PASS",
      confidence: "MEDIUM",
      finding: "Фасовки и оттенки, оставшиеся отдельными карточками",
      affectedCards: familyCandidates.reduce(
        (total, group) => total + group.cards.length,
        0,
      ),
      risk: "Покупатель не видит все варианты и предложения в одной карточке.",
      remediation:
        "Проверить кандидатов по бренду и артикулу, затем перенести различия в структурированные варианты.",
    },
  ],
};

const markdown = `# Аудит нормализации каталога

Сформирован: ${report.generatedAt}

## Набор данных и гранулярность

- Карточек: ${report.dataset.cards}
- Вариантов: ${report.dataset.variants}
- Предложений: ${report.dataset.offers}
- Правило: ${report.dataset.intendedGrain}

## Результаты проверок

| Проверка | Результат |
| --- | ---: |
| Дубли после нормализации | ${report.checks.uniqueness.duplicateGroups} групп |
| Карточки с брендом | ${report.checks.completeness.brand.cards} (${report.checks.completeness.brand.percent}%) |
| Карточки с производителем | ${report.checks.completeness.manufacturer.cards} (${report.checks.completeness.manufacturer.percent}%) |
| Карточки с точным фото | ${report.checks.completeness.exactProductPhoto.cards} (${report.checks.completeness.exactProductPhoto.percent}%) |
| Структурированные варианты | ${report.checks.variantModel.structuredVariants} (${report.checks.variantModel.structuredVariantPercent}%) |
| Технические подписи вариантов | ${report.checks.variantModel.technicalLabels} |
| Кандидаты на объединение | ${report.checks.variantModel.candidateFamilyGroups} групп |
| Проверенные отдельные семейства | ${report.checks.variantModel.resolvedFamilyGroups} групп |

## Риски и решения

${report.findings
  .map(
    (finding) =>
      `### ${finding.severity}: ${finding.finding}\n\nЗатронуто карточек: ${finding.affectedCards}. ${finding.risk}\n\nРешение: ${finding.remediation}`,
  )
  .join("\n\n")}

## Кандидаты на товарные семьи

${familyCandidates.length > 0 ? familyCandidates.map((group) => `- **${group.confidence}** — ${group.cards.map((card) => card.name).join(" / ")}`).join("\n") : "Кандидаты не найдены."}

## Проверенные решения «оставить раздельно»

${resolvedFamilyDecisions.length > 0 ? resolvedFamilyDecisions.map((group) => `- **${group.decision}** — ${group.cards.map((card) => card.name).join(" / ")} — ${group.reason}`).join("\n") : "Решения отсутствуют."}
`;

await fs.mkdir(reportDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
  fs.writeFile(markdownPath, markdown),
]);

console.log(
  JSON.stringify(
    {
      json: path.relative(root, jsonPath),
      markdown: path.relative(root, markdownPath),
      cards: report.dataset.cards,
      duplicateGroups: report.checks.uniqueness.duplicateGroups,
      candidateFamilyGroups: report.checks.variantModel.candidateFamilyGroups,
      exactPhotoPercent: report.checks.completeness.exactProductPhoto.percent,
    },
    null,
    2,
  ),
);

import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const classification = JSON.parse(
  await fs.readFile(
    path.join(root, "data/reports/canonical-publication-classification.json"),
    "utf8",
  ),
);
const approved = JSON.parse(
  await fs.readFile(
    path.join(root, "data/reports/production-approved-catalog.json"),
    "utf8",
  ),
);

const products = classification.products ?? [];
const approvedProducts = approved.products ?? [];
const decisions = new Map(products.map((item) => [item.canonicalProductId, item]));
const issues = [];

const check = (condition, code, severity, detail) => {
  if (!condition) issues.push({ code, severity, detail });
};

check(
  products.length === classification.totals?.total,
  "CLASSIFICATION_TOTAL_MISMATCH",
  "BLOCKER",
  `Классифицировано ${products.length}, в итогах ${classification.totals?.total ?? "—"}.`,
);
check(
  approvedProducts.length === classification.totals?.PUBLISH,
  "APPROVED_TOTAL_MISMATCH",
  "BLOCKER",
  `В белом списке ${approvedProducts.length}, решение PUBLISH получили ${classification.totals?.PUBLISH ?? "—"}.`,
);

for (const product of approvedProducts) {
  const decision = decisions.get(product.canonicalProductId);
  const variants = product.variants ?? [];
  const missingRefs = variants.filter((variant) => !String(variant.sku ?? "").trim());
  const unclearLabels = variants.filter(
    (variant) => !String(variant.label ?? "").trim() || /^(вариант|стандарт)/i.test(variant.label),
  );
  check(
    decision?.decision === "PUBLISH",
    "APPROVED_WITHOUT_PUBLISH_DECISION",
    "BLOCKER",
    `${product.canonicalProductId}: отсутствует согласованное решение PUBLISH.`,
  );
  check(
    product.complianceClassification === "PUBLISH",
    "APPROVED_WITHOUT_CLASSIFICATION",
    "BLOCKER",
    `${product.canonicalProductId}: неверная complianceClassification.`,
  );
  check(
    Boolean(product.sourceUrl && /^https?:\/\//i.test(product.sourceUrl)),
    "APPROVED_WITHOUT_SOURCE",
    "BLOCKER",
    `${product.canonicalProductId}: нет проверяемой страницы-источника.`,
  );
  check(
    Boolean(product.imageUrl && /^https?:\/\//i.test(product.imageUrl)),
    "APPROVED_WITHOUT_PHOTO",
    "BLOCKER",
    `${product.canonicalProductId}: нет точного фото товара.`,
  );
  check(
    product.photoStatus === "exact",
    "APPROVED_WITH_NON_EXACT_PHOTO",
    "BLOCKER",
    `${product.canonicalProductId}: фото не имеет статуса exact.`,
  );
  check(
    Boolean(String(product.description ?? "").trim()),
    "APPROVED_WITHOUT_DESCRIPTION",
    "BLOCKER",
    `${product.canonicalProductId}: нет понятного описания.`,
  );
  check(
    Boolean(String(product.category ?? "").trim()),
    "APPROVED_WITHOUT_CATEGORY",
    "BLOCKER",
    `${product.canonicalProductId}: не определена категория.`,
  );
  check(
    variants.length > 0 && missingRefs.length === 0,
    "APPROVED_WITHOUT_MANUFACTURER_REFERENCE",
    "BLOCKER",
    `${product.canonicalProductId}: ${missingRefs.length || "все"} вариантов без артикула производителя.`,
  );
  check(
    unclearLabels.length === 0,
    "APPROVED_WITH_UNCLEAR_SKU_LABEL",
    "REVIEW",
    `${product.canonicalProductId}: ${unclearLabels.length} вариантов с непонятной подписью.`,
  );
}

const blockerCount = issues.filter((issue) => issue.severity === "BLOCKER").length;
const reviewCount = issues.filter((issue) => issue.severity === "REVIEW").length;
const report = {
  generatedAt: new Date().toISOString(),
  mode: "REPORT_ONLY",
  dataMutated: false,
  scope: {
    canonicalCards: products.length,
    approvedCards: approvedProducts.length,
    moderationCards: classification.totals?.MODERATION ?? 0,
    rejectedCards: classification.totals?.REJECT ?? 0,
  },
  result: blockerCount === 0 ? "PASS" : "FAIL",
  blockerCount,
  reviewCount,
  reasonCounts: classification.reasonCounts,
  issues,
  controls: [
    "Каждая каноническая карточка имеет решение PUBLISH, MODERATION или REJECT.",
    "В продакшен допускается только PUBLISH.",
    "PUBLISH требует точный источник KZ, точное фото, категорию, описание и артикул производителя.",
    "Карточки без фото остаются на модерации и не удаляются.",
    "Отчёт ничего не исправляет, не исключает и не добавляет автоматически.",
  ],
};

const lines = [
  "# Комплаенс-аудит каталога DentMarket",
  "",
  `Сформирован: ${report.generatedAt}`,
  "",
  "Режим: **только отчёт**. Данные каталога не изменялись.",
  "",
  `Итог: **${report.result}**`,
  "",
  `- Канонических карточек: ${report.scope.canonicalCards}`,
  `- Допущено к публикации: ${report.scope.approvedCards}`,
  `- На модерации: ${report.scope.moderationCards}`,
  `- Отклонено как невалидные сущности: ${report.scope.rejectedCards}`,
  `- Блокирующих нарушений в белом списке: ${blockerCount}`,
  `- Замечаний для проверки: ${reviewCount}`,
  "",
  "## Контроли",
  "",
  ...report.controls.map((control) => `- ${control}`),
  "",
  "## Причины модерации",
  "",
  ...Object.entries(report.reasonCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `- ${reason}: ${count}`),
  "",
  "## Нарушения белого списка",
  "",
  ...(issues.length
    ? issues.map((issue) => `- **${issue.severity} · ${issue.code}** — ${issue.detail}`)
    : ["Нарушений не найдено."]),
  "",
];

await fs.writeFile(
  path.join(root, "data/reports/catalog-compliance-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await fs.writeFile(
  path.join(root, "data/reports/catalog-compliance-report.md"),
  `${lines.join("\n")}\n`,
);

console.log(JSON.stringify({ ok: true, ...report.scope, result: report.result, blockerCount, reviewCount }, null, 2));

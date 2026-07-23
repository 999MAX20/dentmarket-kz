import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const input = await fs.readFile(
  path.join(root, "data/curation/canonical-cards-without-approved-photo.csv"),
  "utf8",
);

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  const [headers, ...data] = rows;
  return data.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
};

const rows = parseCsv(input).map((item) => {
  let workflow = "FIND_EXACT_PRODUCT_PHOTO";
  let generationAllowed = false;
  let reason = "Нет исходного изображения точной модели.";
  if (item.photoStatus === "LOW_QUALITY_EXACT_REFERENCE" && item.evidenceImageUrl) {
    workflow = "RESTORE_EXACT_REFERENCE_WITH_AI";
    generationAllowed = true;
    reason = "Есть плохой, но точный исходник; допустимо улучшение без изменения товара и комплектации.";
  } else if (item.evidenceImageUrl) {
    workflow = "REVIEW_SHARED_OR_AMBIGUOUS_IMAGE";
    reason = "Изображение используется несколькими карточками или не доказывает точную модель; генерация по нему запрещена.";
  }
  return { ...item, workflow, generationAllowed, reason };
});

const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    exactReferenceRequiredForGeneration: true,
    generatedImageRequiresHumanModeration: true,
    generatedImageNeverBecomesEvidence: true,
    noGenericProductHallucination: true,
  },
  totals: {
    cards: rows.length,
    exactPoorReferencesReadyForRestoration: rows.filter((item) => item.generationAllowed).length,
    sharedOrAmbiguousImages: rows.filter((item) => item.workflow === "REVIEW_SHARED_OR_AMBIGUOUS_IMAGE").length,
    exactPhotoSearchRequired: rows.filter((item) => item.workflow === "FIND_EXACT_PRODUCT_PHOTO").length,
  },
  items: rows,
};

await fs.writeFile(
  path.join(root, "data/reports/product-image-restoration-queue.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({ ok: true, ...report.totals }, null, 2));

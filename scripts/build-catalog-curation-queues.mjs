import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const catalogPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const mediaPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-media.json",
);
const outputDirectory = path.join(root, "data/curation");
const publicDirectory = path.join(root, "apps/buyer-web/public");

const rejectedAsset = (value) =>
  /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image|\/(?:themes?|templates?|assets\/icons?|images?\/icons?)\/)/i.test(
    String(value ?? ""),
  );

const [catalog, media] = await Promise.all([
  fs.readFile(catalogPath, "utf8").then(JSON.parse),
  fs.readFile(mediaPath, "utf8").then(JSON.parse),
]);

const csv = (rows) => {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return (
    [
      columns.map(escape).join(","),
      ...rows.map((row) =>
        columns.map((column) => escape(row[column])).join(","),
      ),
    ].join("\n") + "\n"
  );
};

const priorityFor = (product) => {
  if ((product.offers?.length ?? 0) > 0) return "P0_COMMERCIAL";
  if ((product.variants ?? []).some((variant) => variant.sku))
    return "P1_IDENTIFIED";
  return "P2_CATALOG";
};

const products = catalog.products ?? [];
const usablePhotoBySource = new Map(
  await Promise.all(
    products.map(async (product) => {
      const item = media.entries?.[product.sourceUrl];
      const provenance =
        item?.metadata?.sourceImageUrl ?? item?.sourceUrl ?? item?.securePath;
      if (
        item?.metadata?.exactProductPhoto !== true ||
        !provenance ||
        rejectedAsset(provenance)
      ) {
        return [product.sourceUrl, false];
      }
      if (item.securePath?.startsWith("/catalog/")) {
        try {
          const stat = await fs.stat(
            path.join(publicDirectory, item.securePath.replace(/^\/+/, "")),
          );
          return [product.sourceUrl, stat.isFile() && stat.size >= 2_000];
        } catch {
          return [product.sourceUrl, false];
        }
      }
      return [
        product.sourceUrl,
        Boolean(item.securePath || /^https?:\/\//i.test(item.sourceUrl ?? "")),
      ];
    }),
  ),
);
const identityQueue = products
  .filter((product) => !product.brand || !product.manufacturer)
  .map((product) => ({
    productId: product.id,
    productName: product.name,
    missingBrand: !product.brand,
    missingManufacturer: !product.manufacturer,
    knownBrand: product.brand ?? "",
    knownManufacturer: product.manufacturer ?? "",
    manufacturerRefs: (product.variants ?? [])
      .map((variant) => variant.sku)
      .filter(Boolean)
      .join(" | "),
    sourceUrl: product.sourceUrl ?? "",
    priority: priorityFor(product),
    status: "NEEDS_OFFICIAL_EVIDENCE",
    requiredEvidence:
      "Официальная страница бренда, каталог производителя или подтверждённый прайс с артикулом",
  }));

const photoQueue = products
  .filter((product) => !usablePhotoBySource.get(product.sourceUrl))
  .map((product) => {
    const current = media.entries?.[product.sourceUrl];
    return {
      productId: product.id,
      productName: product.name,
      brand: product.brand ?? "",
      manufacturer: product.manufacturer ?? "",
      manufacturerRefs: (product.variants ?? [])
        .map((variant) => variant.sku)
        .filter(Boolean)
        .join(" | "),
      sourceUrl: product.sourceUrl ?? "",
      priority: priorityFor(product),
      currentMediaStatus: current ? "NON_EXACT_OR_UNVERIFIED" : "MISSING",
      rightsStatus: current?.metadata?.rightsStatus ?? "NOT_CHECKED",
      status: "NEEDS_OFFICIAL_PRODUCT_PHOTO",
      acceptanceRule:
        "Точная модель/семейство, без логотипа-заглушки, источник и права зафиксированы",
    };
  });

const summary = {
  generatedAt: new Date().toISOString(),
  grain: "Одна строка на каноническую карточку, требующую подтверждения",
  totalCards: products.length,
  identityQueue: {
    cards: identityQueue.length,
    missingBrand: identityQueue.filter((row) => row.missingBrand).length,
    missingManufacturer: identityQueue.filter((row) => row.missingManufacturer)
      .length,
    coveredByQueuePercent: 100,
  },
  photoQueue: {
    cards: photoQueue.length,
    coveredByQueuePercent: 100,
    exactPhotos: products.length - photoQueue.length,
  },
  safety: {
    inventedBrands: 0,
    categoryPlaceholdersAcceptedAsExactPhotos: 0,
    rule: "Не публиковать неподтверждённую идентичность или неточное фото как достоверные данные.",
  },
};

const markdown = `# Очереди подготовки каталога\n\nСформировано: ${summary.generatedAt}\n\n## Покрытие\n\n- Карточек: ${summary.totalCards}\n- Требуют подтверждения бренда или производителя: ${summary.identityQueue.cards}\n- Требуют точного фото: ${summary.photoQueue.cards}\n- Все незаполненные поля попали в очередь: 100%\n\n## Правило публикации\n\n${summary.safety.rule}\n\nКарточка получает бренд, производителя и точное фото только после сверки с официальным каталогом или подтверждённым прайсом. Это предотвращает ложные объединения предложений разных товаров.\n`;

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(
    path.join(outputDirectory, "catalog-identity-queue.csv"),
    csv(identityQueue),
  ),
  fs.writeFile(
    path.join(outputDirectory, "catalog-photo-queue.csv"),
    csv(photoQueue),
  ),
  fs.writeFile(
    path.join(outputDirectory, "catalog-curation-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  ),
  fs.writeFile(path.join(outputDirectory, "README.md"), markdown),
]);

console.log(JSON.stringify(summary, null, 2));

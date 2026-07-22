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
const publicDirectory = path.join(root, "apps/buyer-web/public");
const reportDirectory = path.join(root, "data/reports");
const jsonPath = path.join(reportDirectory, "catalog-media-integrity.json");
const markdownPath = path.join(reportDirectory, "catalog-media-integrity.md");

const rejectedAsset = (value) =>
  /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image|\/(?:themes?|templates?|assets\/icons?|images?\/icons?)\/)/i.test(
    String(value ?? ""),
  );

const genericListingSource = (value) => {
  try {
    const pathname = new URL(value).pathname.replace(/\/+$/, "") || "/";
    return /\/(?:product_list|products?|catalog|shop|store)$/i.test(pathname);
  } catch {
    return false;
  }
};

const [catalog, media] = await Promise.all([
  fs.readFile(catalogPath, "utf8").then(JSON.parse),
  fs.readFile(mediaPath, "utf8").then(JSON.parse),
]);
const products = catalog.products ?? [];
const entries = media.entries ?? {};
console.log(
  `Проверяем ${products.length} карточек и ${Object.keys(entries).length} записей фото...`,
);
const productIds = new Set();
const duplicateProductIds = [];
for (const product of products) {
  if (productIds.has(product.id)) duplicateProductIds.push(product.id);
  productIds.add(product.id);
}

const usedSourceUrls = new Set(
  products.map((product) => product.sourceUrl).filter(Boolean),
);
const rows = [];
const fileProducts = new Map();
for (const [productIndex, product] of products.entries()) {
  const item = entries[product.sourceUrl];
  const provenance =
    item?.metadata?.sourceImageUrl ?? item?.sourceUrl ?? item?.securePath;
  let status = "MISSING";
  let localPath = null;
  let bytes = null;

  if (item?.metadata?.exactProductPhoto === true) {
    if (!item.securePath && !/^https?:\/\//i.test(item.sourceUrl ?? "")) {
      status = "INVALID_NO_DELIVERY_PATH";
    } else if (rejectedAsset(provenance)) {
      status = "REJECTED_ASSET";
    } else if (item.securePath?.startsWith("/catalog/")) {
      localPath = path.join(
        publicDirectory,
        item.securePath.replace(/^\/+/, ""),
      );
      try {
        const stat = await fs.stat(localPath);
        bytes = stat.size;
        if (!stat.isFile() || stat.size < 2_000) {
          status = "BROKEN_LOCAL_FILE";
        } else {
          status = "USABLE_EXACT";
        }
      } catch {
        status = "BROKEN_LOCAL_FILE";
      }
    } else {
      status = "USABLE_REMOTE_UNCHECKED";
    }
  } else if (item) {
    status = "UNVERIFIED_MEDIA_IGNORED";
  }

  if (status === "USABLE_EXACT" && localPath) {
    if (!fileProducts.has(localPath)) fileProducts.set(localPath, []);
    fileProducts.get(localPath).push({
      productId: product.id,
      productName: product.name,
      sourceUrl: product.sourceUrl,
      localPath: path.relative(root, localPath),
    });
  }
  rows.push({
    productId: product.id,
    productName: product.name,
    sourceUrl: product.sourceUrl,
    mediaStatus: status,
    securePath: item?.securePath ?? null,
    sourceImageUrl: item?.metadata?.sourceImageUrl ?? item?.sourceUrl ?? null,
    rightsStatus: item?.metadata?.rightsStatus ?? null,
    bytes,
  });
  if ((productIndex + 1) % 500 === 0)
    console.log(`Проверено ${productIndex + 1}/${products.length} карточек`);
}

const sharedExactFiles = [...fileProducts.entries()]
  .filter(([, linkedProducts]) => linkedProducts.length > 1)
  .map(([filePath, linkedProducts]) => ({
    filePath: path.relative(root, filePath),
    linkedProducts,
  }));
const suspiciousSharedMedia = sharedExactFiles.filter(
  ({ linkedProducts }) =>
    linkedProducts.length >= 5 &&
    linkedProducts.some((product) => genericListingSource(product.sourceUrl)),
);
const criticalStatuses = new Set([
  "INVALID_NO_DELIVERY_PATH",
  "REJECTED_ASSET",
  "BROKEN_LOCAL_FILE",
]);
const brokenCards = rows.filter((row) => criticalStatuses.has(row.mediaStatus));
const usableCards = rows.filter((row) =>
  ["USABLE_EXACT", "USABLE_REMOTE_UNCHECKED"].includes(row.mediaStatus),
);
const withoutUsablePhoto = rows.filter(
  (row) =>
    !["USABLE_EXACT", "USABLE_REMOTE_UNCHECKED"].includes(row.mediaStatus),
);
const orphanManifestEntries = Object.keys(entries).filter(
  (sourceUrl) => !usedSourceUrls.has(sourceUrl),
);

const report = {
  generatedAt: new Date().toISOString(),
  intendedGrain: "Одна строка проверки на одну каноническую карточку",
  catalog: {
    cardsBeforeMediaJoin: products.length,
    cardsAfterMediaJoin: rows.length,
    lostCards: products.length - rows.length,
    duplicateProductIds,
  },
  photos: {
    usableCards: usableCards.length,
    usablePercent: Number(
      ((usableCards.length / Math.max(products.length, 1)) * 100).toFixed(1),
    ),
    withoutUsablePhoto: withoutUsablePhoto.length,
    cardsRetainedWithoutPhoto: withoutUsablePhoto.length,
    brokenCards: brokenCards.length,
    localExact: rows.filter((row) => row.mediaStatus === "USABLE_EXACT").length,
    remoteUnchecked: rows.filter(
      (row) => row.mediaStatus === "USABLE_REMOTE_UNCHECKED",
    ).length,
    sharedExactFiles: sharedExactFiles.length,
    suspiciousSharedMedia: suspiciousSharedMedia.length,
  },
  manifest: {
    entries: Object.keys(entries).length,
    orphanEntries: orphanManifestEntries.length,
  },
  evidence: {
    brokenCards,
    sharedExactFiles,
    suspiciousSharedMedia,
    orphanManifestEntries,
    missingPhotoProductIds: withoutUsablePhoto.map((row) => row.productId),
  },
  verdict:
    products.length === rows.length &&
    duplicateProductIds.length === 0 &&
    brokenCards.length === 0 &&
    suspiciousSharedMedia.length === 0
      ? "PASS"
      : "FAIL",
};

const markdown = `# Целостность фотографий каталога

Сформировано: ${report.generatedAt}

## Итог

- Вердикт: **${report.verdict}**
- Карточек до проверки фото: ${report.catalog.cardsBeforeMediaJoin}
- Карточек после присоединения фото: ${report.catalog.cardsAfterMediaJoin}
- Потеряно карточек: ${report.catalog.lostCards}
- Карточек с пригодным точным фото: ${report.photos.usableCards} (${report.photos.usablePercent}%)
- Карточек без пригодного фото, сохранённых в каталоге: ${report.photos.cardsRetainedWithoutPhoto}
- Битых или запрещённых изображений в выдаче: ${report.photos.brokenCards}
- Общих файлов у близких или дублирующихся карточек: ${report.photos.sharedExactFiles}
- Подозрительных общих фото со страниц списка: ${report.photos.suspiciousSharedMedia}
- Неиспользуемых записей медиаманифеста: ${report.manifest.orphanEntries}

## Правило отображения

Карточка никогда не удаляется из-за отсутствия фотографии. Подтверждённое фото отображается только при наличии точного источника и рабочего пути. При отсутствии или ошибке загрузки интерфейс показывает нейтральное состояние «Фото добавляем».
`;

await fs.mkdir(reportDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
  fs.writeFile(markdownPath, markdown),
]);

console.log(
  JSON.stringify(
    {
      verdict: report.verdict,
      cards: products.length,
      lostCards: report.catalog.lostCards,
      usableCards: report.photos.usableCards,
      withoutUsablePhoto: report.photos.withoutUsablePhoto,
      brokenCards: report.photos.brokenCards,
      sharedExactFiles: report.photos.sharedExactFiles,
      suspiciousSharedMedia: report.photos.suspiciousSharedMedia,
      report: path.relative(root, markdownPath),
    },
    null,
    2,
  ),
);

if (report.verdict !== "PASS") process.exitCode = 1;

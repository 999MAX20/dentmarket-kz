import fs from "node:fs/promises";
import path from "node:path";

const kzSourceUrl = "https://stomir.kz/catalog/rashodnye_materialy_i_akssesuary_terapevticheskie/170216043611";
const rangeSourceUrl = "https://www.pearsondental.com/flyers/Gapadent%20Page.pdf";
const regulatorySourceUrl = "https://stommarket.ru/upload/iblock/a16/2j2lo6ng3sfuj2a315vlf89stgb3tz74.pdf";
const jsonOutputPath = path.resolve("data/catalog-evidence/gapadent-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/gapadent-manufacturer-catalog-queue.csv");
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const family = (id, name, variants, categoryPath = "Эндодонтические штифты") => ({ officialProductId: `GAPADENT-${id}`, brand: "Gapadent", manufacturer: "Tianjin Gapadent Co., Ltd.", name, manufacturerRef: "", manufacturerRefs: "", model: "", variantCount: variants.length, variants: variants.map(([variantLabel, sourceOrderRef]) => ({ variantLabel, sourceOrderRef, referenceType: "DISTRIBUTOR_ORDER_REFERENCE_NOT_MANUFACTURER_REFERENCE" })), categoryPath, description: "Варианты подтверждены специализированным каталогом линейки Gapadent; заводской артикул требует сверки с актуальным прайсом производителя или поставщика.", sourceImageUrl: "", imageUrls: "", imageCount: 0, sourcePageUrl: rangeSourceUrl, additionalSourceUrls: regulatorySourceUrl, kzEvidence: "BRAND_AND_ABSORBENT_PAPER_POINTS_OBSERVED_IN_KAZAKHSTAN", status: "PHOTO_REQUIRED" });

const kzVariants = [
  ["№ 15", "170216043611", "https://stomir.kz/user_uploads/products/85-00003_35.jpg"],
  ["№ 20", "170216043819", "https://stomir.kz/user_uploads/products/170216043819-00003_36.jpg"],
  ["№ 25", "170216044001", "https://stomir.kz/user_uploads/products/170216044001-00003_37.jpg"],
  ["№ 35", "170216044200", "https://stomir.kz/user_uploads/products/170216044200-00003_38.jpg"],
  ["№ 40", "170216044301", "https://stomir.kz/user_uploads/products/170216044301-00003_39.jpg"],
  ["№ 15–40, ассорти", "170216044411", "https://stomir.kz/user_uploads/products/170216044411-00003_40.jpg"],
];
const products = [
  { officialProductId: "GAPADENT-ABSORBENT-PAPER-POINTS-KZ", brand: "Gapadent", manufacturer: "Tianjin Gapadent Co., Ltd.", name: "Абсорбирующие бумажные штифты Gapadent", manufacturerRef: "", manufacturerRefs: "", model: "", variantCount: kzVariants.length, variants: kzVariants.map(([variantLabel, sourceOfferId, sourceImageUrl]) => ({ variantLabel, sourceOfferId, sourceImageUrl, referenceType: "KZ_SELLER_VARIANT_ID_NOT_MANUFACTURER_REFERENCE" })), categoryPath: "Абсорбирующие бумажные штифты", description: "Шесть вариантов фактически представлены в каталоге СТОМир Казахстан. Артикул CKT-111 сохранён только как артикул продавца и не выдается за заводской код.", sourceImageUrl: kzVariants[0][2], imageUrls: kzVariants.map((variant) => variant[2]).join(" | "), imageCount: kzVariants.length, sourcePageUrl: kzSourceUrl, additionalSourceUrls: `${rangeSourceUrl} | ${regulatorySourceUrl}`, kzEvidence: "EXACT_KZ_LISTING_AND_VARIANTS", status: "MANUFACTURER_REFERENCE_REQUIRED" },
  family("GP-ENDO-AIDE", "Гуттаперчевые штифты Endo Aide", [["№ 15–40", "G16-0002"], ["№ 45–80", "G16-0004"], ["№ 15–80", "G16-0006"]]),
  family("PAPER-ENDO-AIDE", "Бумажные штифты Endo Aide", [["№ 15–40", "G16-0008"], ["№ 45–80", "G16-0010"], ["№ 15–80", "G16-0012"]]),
  family("ENDO-AIDE-COMBO", "Набор Endo Aide с гуттаперчевыми и бумажными штифтами", [["№ 15–40", "G16-0014"], ["№ 45–80", "G16-0016"]], "Эндодонтические наборы"),
  family("GP-WAVE-ONE", "Гуттаперчевые штифты для файлов WaveOne", [["Small", "G16-0104"], ["Primary", "G16-0106"], ["Large", "G16-0108"], ["Ассорти", "G16-0110"]]),
  family("GP-TAPER-04-06", "Гуттаперчевые штифты конусности 04 и 06", ["2", "3", "4", "5", "6", "7", "2–7, ассорти"].flatMap((size, index) => [[`.04, № ${size}`, `G16-${String(62 + index * 2).padStart(4, "0")}`], [`.06, № ${size}`, `G16-${String(76 + index * 2).padStart(4, "0")}`]])),
  family("GP-GREATER-TAPER", "Гуттаперчевые штифты повышенной конусности", [[".06", "G16-0112"], [".08", "G16-0114"], [".10", "G16-0116"], [".12", "G16-0118"], ["Ассорти", "G16-0120"]]),
  family("GP-PROTAPER", "Гуттаперчевые штифты для файлов ProTaper", [["F1", "G16-0090"], ["F2", "G16-0092"], ["F3", "G16-0094"], ["F4", "G16-0096"], ["F5", "G16-0098"], ["F1–F3, ассорти", "G16-0100"]]),
  family("PAPER-TAPER-04-06", "Бумажные штифты конусности 04 и 06", [[".04, № 15", "G16-0122"], [".04, № 20", "G16-0124"], [".04, № 25", "G16-0126"], [".04, № 30", "G16-0128"], [".04, № 35", "G16-0130"], [".04, № 40", "G16-0132"], [".04, № 15–40", "G16-0134"], [".06, № 15", "G16-0136"], [".06, № 20", "G16-0138"], [".06, № 25", "G16-0140"], [".06, № 30", "G16-0142"], [".06, № 35", "G16-0144"], [".06, № 40", "G16-0146"], [".06, № 15–40", "G16-0048"]]),
  family("PAPER-PROTAPER", "Бумажные штифты для файлов ProTaper", [["F1", "G16-0178"], ["F2", "G16-0180"], ["F3", "G16-0182"], ["F4", "G16-0184"], ["F5", "G16-0186"], ["F1–F3, ассорти", "G16-0188"]]),
  family("ENDO-AIDE-ORGANIZER", "Органайзер Endo Aide", [["Пустой органайзер", "G16-0000"], ["Пустой контейнер для гуттаперчи", "G16-0001"]], "Эндодонтические принадлежности"),
];
const report = { brand: "Gapadent", manufacturer: "Tianjin Gapadent Co., Ltd.", sourceType: "EXACT_KZ_RETAIL_LISTING_PLUS_VERIFIED_SPECIALIST_RANGE_AND_REGULATORY_EVIDENCE", sourceUrl: kzSourceUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { unavailableManufacturerWebsiteRecorded: true, exactKzVariantsAndImagesPreserved: true, distributorOrderReferencesNeverPromotedToManufacturerReferences: true, verifiedRangeWithoutExactPhotoRetainedInPhotoQueue: true, noProductCardsDeletedForMissingFields: true }, totals: { discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, productsWithoutImages: products.filter((product) => product.imageCount === 0).length, exactKzVariants: kzVariants.length, crawlErrors: 0 }, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));

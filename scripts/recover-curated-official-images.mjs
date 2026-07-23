import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const canonical = JSON.parse(
  await fs.readFile(
    path.join(root, "data/reports/canonical-manufacturer-intake.json"),
    "utf8",
  ),
);
const outputPath = path.join(
  root,
  "data/catalog-evidence/curated-official-product-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/curated-official-product-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";

const mappings = [
  {
    canonicalProductId: "CANON-VOCO-1526",
    brand: "VOCO",
    name: "AlignerFlow LC",
    sourcePageUrl:
      "https://www.voco.dental/en/products/direct-restoration/composites/alignerflow-lc.aspx",
    sourceImageUrl:
      "https://www.voco.dental/en/portaldata/1/resources/products/landingpages/alignerFlow-lc/de/alignerflowlc_spritze_1320x766px.webp",
    evidenceNote: "Official product-specific AlignerFlow LC syringe illustration",
  },
  {
    canonicalProductId: "CANON-ZHERMACK-UNIVERSAL-TRAY-ADHESIVE",
    brand: "Zhermack",
    name: "Universal Tray Adhesive",
    sourcePageUrl:
      "https://www.zhermack.com/en/product_category/dental/dental-practice/impression-systems/accessories/adhesive-for-trays/",
    sourceImageUrl:
      "https://www.zhermack.com/public/uploads/ZH-Web-Pack-Image-Universal-Tray-Adhesive-C700025-1.jpg",
    evidenceNote:
      "Official product photo of Universal Tray Adhesive C700025, 10 ml",
  },
  {
    canonicalProductId: "CANON-KAVO-KAVO-CONNECTME",
    brand: "KaVo",
    name: "CONNECTme App",
    sourcePageUrl:
      "https://www.kavo.com/en/products/practice-equipment/digital-connectivity/connectme",
    sourceImageUrl:
      "https://www.kavo.com/sites/default/files/styles/mq_media_16_7_1920_xxl_1_full/public/mq_acquia_dam/connectme-header_16-7.jpg?itok=fkQYfzTc",
    evidenceNote:
      "Official CONNECTme software product banner with the application icon",
  },
  {
    canonicalProductId: "CANON-DRA-GER-DRAEGER-PERSEUS-A500",
    brand: "Dräger",
    name: "Анестезиологический комплекс Dräger Perseus A500",
    sourcePageUrl: "https://www.draeger.com/ru_ru/Products/Perseus-A500",
    sourceImageUrl:
      "https://www.draeger.com/Media/Content/Products/Default/D-313-2023-ps.jpg",
    evidenceNote: "Official Perseus A500 product photo",
  },
  {
    canonicalProductId: "CANON-DRA-GER-DRAEGER-SET2GO-PACK2GO",
    brand: "Dräger",
    name: "Комплекты дыхательных контуров Dräger Set2Go и Pack2Go",
    sourcePageUrl:
      "https://www.draeger.com/ru_ru/Products/Set2Go-and-Pack2Go",
    sourceImageUrl:
      "https://www.draeger.com/Media/Content/Products/Default/Draeger-Set2Go-and-Pack2Go-1-D-42734-2015.jpg",
    evidenceNote: "Official Set2Go and Pack2Go product photo",
  },
  {
    canonicalProductId: "CANON-DRA-GER-DRAEGER-FABIUS-PLUS",
    brand: "Dräger",
    name: "Наркозный аппарат Dräger Fabius Plus",
    sourcePageUrl: "https://www.draeger.com/ru_ru/Products/Fabius-Plus",
    sourceImageUrl:
      "https://www.draeger.com/Media/Content/Products/Default/D-20328-2010.jpg",
    evidenceNote: "Official Fabius Plus product photo",
  },
  {
    canonicalProductId: "CANON-MEDIT-I600",
    brand: "Medit",
    name: "Medit i600",
    sourcePageUrl:
      "https://support.medit.com/hc/en-us/articles/5643552195865-i600-Components-and-Settings",
    validationPageUrl:
      "https://support.medit.com/api/v2/help_center/en-us/articles/5643552195865.json",
    sourceImageUrl:
      "https://support.medit.com/hc/article_attachments/36759393041689",
    evidenceNote:
      "Official Medit Help Center image of the i600 main package and handpiece",
  },
  {
    canonicalProductId: "CANON-COTISEN-DENTI-KZ-COTISEN-19723",
    brand: "Cotisen",
    name: "Микроаппликатор Cotisen безворсовый",
    sourcePageUrl:
      "https://www.cotisen-dental.com/fiber-free-micro-applicator/fiber-free-micro-applicator.html",
    sourceImageUrl:
      "https://www.cotisen-dental.com/data/watermark/main/20250107/677cd69132d13.jpg",
    evidenceNote:
      "Official Fiber-Free Micro Applicator product image with three size colors",
  },
  {
    canonicalProductId:
      "CANON-DENTSPLY-SIRONA-DENTSPLY-SIRONA-ENERGO",
    brand: "Dentsply Sirona",
    name: "Electric Handpieces | Straight & Contra-Angle",
    sourcePageUrl:
      "https://www.dentsplysirona.com/en-no/discover/discover-by-category/instruments/electric-handpieces.html",
    sourceImageUrl:
      "https://www.dentsplysirona.com/content/dam/master/product-procedure-brand-categories/instruments/product-categories/handpieces/electric-handpiece-systems/midwest-energo/images/INS-image-T1-Energo-Family.png",
    evidenceNote:
      "Official Dentsply Sirona family image of T1 Energo straight and contra-angle handpieces",
  },
  {
    canonicalProductId:
      "CANON-DENTSPLY-SIRONA-DENTSPLY-SIRONA-DS-PRIMETAPER",
    brand: "Dentsply Sirona",
    name: "Shop DS PrimeTaper dental products online",
    sourcePageUrl:
      "https://www.dentsplysirona.com/en-se/shop/product-page.html/BP-1000191382/ds-primetaper-implant.html",
    sourceImageUrl:
      "https://www.dentsplysirona.com/content/dam/master/ecom/product-procedure-brand-categories/implant-dentistry/product-categories/implants/ds-primetaper-implant/images/IMP-Product-Image-PrimeTaper-EV-BP.png",
    evidenceNote:
      "Official Dentsply Sirona DS PrimeTaper implant family image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-122-TAPER-FULL-KIT",
    brand: "Osstem",
    name: "122 TAPER FULL KIT",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/for-placement/122-kit/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/resize_cache/iblock/9f1/em9aa5yah5dahjr12zdafbqv7cqpsjsi/1000_0_1/122-Taper_Kit-30-copy.jpg",
    evidenceNote: "Official Osstem 122 Taper Kit product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-IMPLANTAT-TSIII-SOI-1",
    brand: "Osstem",
    name: "Имплантат TSIII SOI 1",
    sourcePageUrl: "https://www.osstem.ru/implants/ts/ts-soi/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/resize_cache/iblock/df7/1000_0_1/uah7e13typ22jw5sow0sb31vxtsts92t.png",
    evidenceNote: "Official Osstem TS SOI implant system product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-IMPLANTAT-TSIII-SA",
    brand: "Osstem",
    name: "Имплантат TSIII SA",
    sourcePageUrl: "https://www.osstem.ru/implants/ts/sa/iii/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/04d/e2x7s3bpt7qx3wzlg23zqdexsdtr9yah.jpg",
    evidenceNote: "Official Osstem TSIII SA implant system product image",
  },
  {
    canonicalProductId:
      "CANON-OSSTEM-IMPLANTAT-MS-SA-TIPA-NARROW-RIDGE-1",
    brand: "Osstem",
    name: "Имплантат MS SA TIPA NARROW RIDGE 1",
    sourcePageUrl: "https://www.osstem.ru/implants/ms/narrow/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/a51/6iqywlr6hqykc2zrn66xtkyy07wicubt.jpg",
    evidenceNote:
      "Official Osstem MS Narrow Ridge implant product image with dimensional diagram",
  },
  {
    canonicalProductId: "CANON-OSSTEM-IMPLANTAT-MS-SA-TIPA-DENTURE",
    brand: "Osstem",
    name: "Имплантат MS SA TIPA DENTURE",
    sourcePageUrl: "https://www.osstem.ru/implants/ms/removable/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/9cd/jugr1tbtcycr8ap0g478tswgh3qemr0q.jpg",
    evidenceNote:
      "Official Osstem MS Denture implant product image with dimensional diagram",
  },
  {
    canonicalProductId: "CANON-OSSTEM-MEMBRANA-OSSGUIDE",
    brand: "Osstem",
    name: "Мембрана OSSGUIDE",
    sourcePageUrl: "https://www.osstem.ru/dbr/ossguide/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/482/67ch57di2uf8fugt0p47dwwrwgabx3sa.png",
    evidenceNote: "Official Osstem OssGuide membrane product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-MEMBRANA-SUREDERM",
    brand: "Osstem",
    name: "Мембрана SUREDERM",
    sourcePageUrl:
      "https://www.osstem.ru/dbr/bone-materials/surederm/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/resize_cache/iblock/49b/1000_0_1/1qr67b04sd4hg2uon96nyeeqb1eyqegi.png",
    evidenceNote: "Official Osstem SureDerm membrane product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-FIZIODISPENSER-SM5-1",
    brand: "Osstem",
    name: "Физиодиспенсер sm5 1",
    sourcePageUrl:
      "https://www.osstem.ru/stom-oborudovanie/kavo-expertsurg-sm5/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/resize_cache/iblock/70f/1000_0_1/nvn26sqxnw0mp7wt5fsqoo1ymnu0xzsd.png",
    evidenceNote: "Official Osstem Russia KaVo EXPERTsurg SM5 product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-MS-KIT",
    brand: "Osstem",
    name: "MS KIT",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/for-placement/ms-kit/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/resize_cache/iblock/932/1000_0_1/wlft5knq6ylnekyzie0s1dxmv9h14281.png",
    evidenceNote: "Official Osstem MS KIT product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-ORTHO-KIT",
    brand: "Osstem",
    name: "ORTHO KIT",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/for-placement/ortho-kit/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/resize_cache/iblock/4f3/lzdunl0fntevyeiwk3yjisd14038lji0/1000_0_1/orto-kit_01.png",
    evidenceNote: "Official Osstem Ortho KIT product image",
  },
  {
    canonicalProductId:
      "CANON-OSSTEM-PARALLEL-GUIDE-FULL-KITRASSHIRENNAYA-KOMPLEKTACIYA",
    brand: "Osstem",
    name: "PARALLEL GUIDE FULL KITRASSHIRENNAYA KOMPLEKTACIYA",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/hirurgiya-po-shablonam/parallel-guide-kit/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/resize_cache/iblock/c78/1000_0_1/mrlodbzmpjlmcab5x9o7horyuxgz57yy.png",
    evidenceNote: "Official Osstem Parallel Guide KIT product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-BONE-SPREADER-KIT",
    brand: "Osstem",
    name: "BONE SPREADER KIT",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/nabory-instrumentov/bone-spreader-kit/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/e68/e2y6rx4ysxjyqfgogxtms698do73ci3n.jpg",
    evidenceNote: "Official Osstem Bone Spreader KIT product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-OSTEOTOME-KIT",
    brand: "Osstem",
    name: "OSTEOTOME KIT",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/nabory-instrumentov/osteo-kit/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/fb9/1ba0gzhh55eze5ulumsqj8ei3xyn7ynk.png",
    evidenceNote: "Official Osstem Osteo KIT product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-RIDGE-SPLIT-KIT-PRYAMOJ",
    brand: "Osstem",
    name: "RIDGE SPLIT KIT прямой",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/nabory-instrumentov/ridge-split-kit-straight/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/e30/swwyi3sy6yyft4b7562q6g1bniut0a3r.png",
    evidenceNote: "Official Osstem Ridge Split KIT straight product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-RIDGE-SPLIT-KIT-UGLOVOJ",
    brand: "Osstem",
    name: "RIDGE SPLIT KIT угловой",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/nabory-instrumentov/ridge-split-kit-offset/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/b6d/d434k2cmvzxlbq7qrnap3nymzzfp230j.png",
    evidenceNote: "Official Osstem Ridge Split KIT offset product image",
  },
  {
    canonicalProductId: "CANON-OSSTEM-SINUS-KIT",
    brand: "Osstem",
    name: "SINUS KIT",
    sourcePageUrl:
      "https://www.osstem.ru/surgery-kits/nabory-instrumentov/sinus-kit/",
    sourceImageUrl:
      "https://www.osstem.ru/upload/iblock/eb6/fmgj11bxzewv4qe76jky3anydxtoej9h.png",
    evidenceNote: "Official Osstem Sinus KIT product image",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-C-17",
    brand: "Castellini",
    name: "C-17",
    sourcePageUrl:
      "https://www.castellini.com/en/sterilisation/autoclaves",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/CASTELLINI/Images/C.jpg",
    evidenceNote:
      "Official Castellini C-series image with the exact C17 model marking",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-C7-STOOL",
    brand: "Castellini",
    name: "C7 Stool",
    sourcePageUrl: "https://www.castellini.com/en/dental-units/stools",
    sourceImageUrl:
      "https://www.castellini.com/hs-fs/hubfs/Castellini%202025/images/CA_STOOLS_27.8.2024%203.jpg?width=2000&name=CA_STOOLS_27.8.2024%203.jpg",
    evidenceNote:
      "Official Castellini C7 Stool image attached to the C7 product section",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-C9-STOOL",
    brand: "Castellini",
    name: "C9 Stool",
    sourcePageUrl: "https://www.castellini.com/en/dental-units/stools",
    sourceImageUrl:
      "https://www.castellini.com/hs-fs/hubfs/Castellini%202025/images/CA_STOOLS_27.8.2024%209.jpg?width=2000&name=CA_STOOLS_27.8.2024%209.jpg",
    evidenceNote:
      "Official Castellini C9 Stool image attached to the C9 product section",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-DAILY-OIL-PLUS",
    brand: "Castellini",
    name: "DAILY OIL PLUS",
    sourcePageUrl:
      "https://www.castellini.com/en/dental-units/disinfectants-and-lubricants",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/CASTELLINI/Images/Daylioil.jpg",
    evidenceNote: "Official Castellini Daily Oil Plus product image",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-PEROXY-AG",
    brand: "Castellini",
    name: "PEROXY Ag+",
    sourcePageUrl:
      "https://www.castellini.com/en/dental-units/disinfectants-and-lubricants",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/CASTELLINI/Images/Peroxi.jpg",
    evidenceNote: "Official Castellini Peroxy Ag+ product image",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-M-W-B",
    brand: "Castellini",
    name: "M.W.B.",
    sourcePageUrl:
      "https://www.castellini.com/en/dental-units/autosteril-and-mwb",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/CASTELLINI/Images/MWB.jpg",
    evidenceNote:
      "Official Castellini M.W.B. image attached to the M.W.B. product section",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-X-VS",
    brand: "Castellini",
    name: "X-VS",
    sourcePageUrl: "https://www.castellini.com/en/imaging/sensors",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/Castellini_XVS.png",
    evidenceNote: "Official Castellini X-VS sensor product image",
  },
  {
    canonicalProductId: "CANON-CASTELLINI-CASTELLINI-X-VS-E",
    brand: "Castellini",
    name: "X-VS E",
    sourcePageUrl: "https://www.castellini.com/en/imaging/sensors",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/Castellini_XVSe.png",
    evidenceNote: "Official Castellini X-VS E sensor product image",
  },
  {
    canonicalProductId:
      "CANON-CASTELLINI-CASTELLINI-X-RADIUS-TRIO-PLUS",
    brand: "Castellini",
    name: "X-RADiUS TRiO PLUS",
    sourcePageUrl: "https://www.castellini.com/en/extraoral-devices",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/CASTELLINI/Images/XRTP.jpg",
    evidenceNote: "Official Castellini X-RADiUS TRiO PLUS product image",
  },
  {
    canonicalProductId:
      "CANON-CASTELLINI-CASTELLINI-X-RADIUS-TRIO-PLUS-FULLVIEW",
    brand: "Castellini",
    name: "X-RADiUS TRiO PLUS FullView",
    sourcePageUrl: "https://www.castellini.com/en/extraoral-devices",
    sourceImageUrl:
      "https://www.castellini.com/hubfs/CASTELLINI/Images/XRTP%20F.jpg",
    evidenceNote:
      "Official Castellini X-RADiUS TRiO PLUS FullView product image",
  },
];

const clean = (value) =>
  String(value ?? "")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
const slug = (value) =>
  clean(value)
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 100) || "product";
const detectImageType = (buffer, responseContentType) => {
  if (
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  )
    return { contentType: "image/png", extension: "png" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8)
    return { contentType: "image/jpeg", extension: "jpg" };
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return { contentType: "image/webp", extension: "webp" };
  if (responseContentType.startsWith("image/"))
    return {
      contentType: responseContentType,
      extension: responseContentType.includes("webp") ? "webp" : "jpg",
    };
  throw new Error("downloaded payload is not a supported image");
};

const canonicalById = new Map(
  canonical.products.map((product) => [product.canonicalProductId, product]),
);
const historicalProducts = canonical.products.filter((product) =>
  product.sourceEvidenceFiles?.includes(path.basename(outputPath)),
);
const candidates = [];
const review = [];

for (const mapping of mappings) {
  const product =
    canonicalById.get(mapping.canonicalProductId) ??
    canonical.products.find(
      (candidate) =>
        clean(candidate.brand).toLocaleLowerCase("en") ===
          clean(mapping.brand).toLocaleLowerCase("en") &&
        clean(candidate.name).toLocaleLowerCase("en") ===
          clean(mapping.name).toLocaleLowerCase("en"),
    );
  if (!product) {
    review.push({
      canonicalProductId: mapping.canonicalProductId,
      sourcePageUrl: mapping.sourcePageUrl,
      reason: "CANONICAL_PRODUCT_NOT_FOUND",
    });
    continue;
  }
  try {
    const validationPageUrl =
      mapping.validationPageUrl ?? mapping.sourcePageUrl;
    const pageResponse = await fetch(validationPageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!pageResponse.ok)
      throw new Error(`official page HTTP ${pageResponse.status}`);
    const html = await pageResponse.text();
    const imagePath = new URL(mapping.sourceImageUrl).pathname;
    const imageBasename = path.basename(imagePath);
    if (!html.includes(imagePath) && !html.includes(imageBasename))
      throw new Error("image is not referenced by the official product page");

    const imageResponse = await fetch(mapping.sourceImageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!imageResponse.ok)
      throw new Error(`official image HTTP ${imageResponse.status}`);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length < 4_000) throw new Error("image payload too small");
    const imageType = detectImageType(
      buffer,
      imageResponse.headers.get("content-type") ?? "",
    );
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const filename = `official-${slug(product.brand)}-${slug(product.name)}-${hash.slice(0, 10)}.${imageType.extension}`;
    candidates.push({
      mapping,
      product,
      buffer,
      hash,
      filename,
      bytes: buffer.length,
      ...imageType,
    });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: mapping.sourcePageUrl,
      sourceImageUrl: mapping.sourceImageUrl,
      reason: "CURATED_OFFICIAL_IMAGE_RECOVERY_FAILED",
      error: String(error?.message ?? error),
    });
  }
}

const byHash = new Map();
for (const candidate of candidates) {
  const group = byHash.get(candidate.hash) ?? [];
  group.push(candidate);
  byHash.set(candidate.hash, group);
}

await fs.mkdir(publicDir, { recursive: true });
const recovered = [];
for (const group of byHash.values()) {
  if (group.length > 1) {
    for (const candidate of group) {
      review.push({
        canonicalProductId: candidate.product.canonicalProductId,
        brand: candidate.product.brand,
        name: candidate.product.name,
      sourcePageUrl: candidate.mapping.sourcePageUrl,
        sourceImageUrl: candidate.mapping.sourceImageUrl,
        duplicateGroupSize: group.length,
        reason: "SHARED_OFFICIAL_IMAGE_NOT_EXACT_TO_ONE_CARD",
      });
    }
    continue;
  }
  const candidate = group[0];
  await fs.writeFile(
    path.join(publicDir, candidate.filename),
    candidate.buffer,
  );
  const imageUrl = `${productionOrigin}/catalog/products/${candidate.filename}`;
  recovered.push({
    officialProductId: `CURATED-PHOTO-${candidate.mapping.canonicalProductId}`,
    brand: candidate.product.brand,
    manufacturer: candidate.product.manufacturer,
    name: candidate.product.name,
    manufacturerRef: candidate.product.manufacturerRef,
    manufacturerRefs: candidate.product.manufacturerRefs,
    model: candidate.product.model,
    variantCount: candidate.product.variantCount,
    variants: candidate.product.variants,
    categoryPath: candidate.product.categoryPath,
    description: candidate.product.description,
    sourceImageUrl: imageUrl,
    imageUrls: imageUrl,
    imageCount: 1,
    sourcePageUrl: candidate.mapping.sourcePageUrl,
    kzEvidence: candidate.product.kzEvidence,
    status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
    photoEvidence: {
      method: "CURATED_OFFICIAL_PRODUCT_PAGE_IMAGE",
      evidenceNote: candidate.mapping.evidenceNote,
      validationPageUrl:
        candidate.mapping.validationPageUrl ??
        candidate.mapping.sourcePageUrl,
      originalImageUrl: candidate.mapping.sourceImageUrl,
      sha256: candidate.hash,
      bytes: candidate.bytes,
      contentType: candidate.contentType,
    },
  });
}

const historicalRecovered = historicalProducts
  .map((product) => ({
    officialProductId:
      product.sourceProductIds?.find((id) =>
        id.startsWith("CURATED-PHOTO-"),
      ) ?? `CURATED-PHOTO-${product.canonicalProductId}`,
    brand: product.brand,
    manufacturer: product.manufacturer,
    name: product.name,
    manufacturerRef: product.manufacturerRef,
    manufacturerRefs: product.manufacturerRefs,
    model: product.model,
    variantCount: product.variantCount,
    variants: product.variants,
    categoryPath: product.categoryPath,
    description: product.description,
    sourceImageUrl: product.evidenceImageUrl || product.sourceImageUrl,
    imageUrls: product.evidenceImageUrl || product.sourceImageUrl,
    imageCount: 1,
    sourcePageUrl: product.sourcePageUrl,
    kzEvidence: product.kzEvidence,
    status: "RETAINED_PREVIOUS_OFFICIAL_IMAGE_RECOVERY",
  }))
  .filter((product) => product.sourceImageUrl);
const mergedRecovered = [
  ...new Map(
    [...historicalRecovered, ...recovered].map((product) => [
      product.officialProductId,
      product,
    ]),
  ).values(),
].sort((left, right) => left.name.localeCompare(right.name, "ru"));

const evidence = {
  sourceType: "CURATED_OFFICIAL_MANUFACTURER_PRODUCT_PAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    explicitCanonicalProductMappingRequired: true,
    imageMustBeReferencedByOfficialProductPage: true,
    duplicateDownloadedImagesRejected: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: mappings.length,
    candidates: candidates.length,
    recovered: mergedRecovered.length,
    recoveredThisRun: recovered.length,
    retainedFromPreviousRuns: historicalRecovered.length,
    reviewRequired: review.length,
  },
  products: mergedRecovered,
};

await Promise.all([
  fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`),
  fs.writeFile(
    reportPath,
    `${JSON.stringify({ ...evidence, review }, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify(evidence.totals, null, 2));

import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { calculateSupplierTrust } from "../src/modules/trust-commerce/trust-score.engine";
import { buildInvoiceDraft } from "../src/modules/payments/invoice-rules";

const prisma = new PrismaClient();

async function ensureActiveSeedPrice(offerId: string, priceId: string, amountMinor: number) {
  const active = await prisma.offerPrice.findFirst({ where: { offerId, status: "ACTIVE" }, orderBy: { validFrom: "desc" } });
  if (active) return active;
  return prisma.offerPrice.upsert({ where: { id: priceId }, update: { offerId, amountMinor, currency: "KZT", status: "ACTIVE", validTo: null }, create: { id: priceId, offerId, amountMinor, currency: "KZT", status: "ACTIVE" } });
}

const permissionCodes = [
  "catalog.product.view",
  "catalog.product.create",
  "catalog.product.moderate",
  "catalog.category.manage",
  "catalog.attribute.manage",
  "catalog.offer.edit",
  "inventory.view",
  "inventory.adjust",
  "order.create",
  "order.approve",
  "order.confirm",
  "payment.view",
  "payment.mock.capture",
  "payment.capture",
  "payment.merchant.manage",
  "payment.merchant.review",
  "payment.payout.manage",
  "payment.reconcile",
  "refund.request",
  "refund.approve",
  "document.sign",
  "organization.members.manage",
  "organization.roles.manage",
  "organization.view",
  "organization.create",
  "approval.manage",
  "audit.view",
  "supplier.profile.manage",
  "supplier.warehouse.manage",
  "import.manage",
  "matching.manage",
  "catalog.offer.publish",
  "pricing.manage",
  "inventory.reserve",
  "catalog.candidate.moderate",
  "pricing.contract.manage",
  "inventory.recall.manage",
  "inventory.freshness.manage",
  "integration.view",
  "integration.manage",
  "integration.reconcile",
  "delivery.view",
  "delivery.manage",
  "shipment.manage",
  "document.view",
  "document.manage",
  "document.template.manage",
  "compliance.view",
  "compliance.evaluate",
  "compliance.credential.manage",
  "compliance.review",
  "compliance.rule.manage",
  "notification.view",
  "notification.manage",
  "promotion.view",
  "promotion.manage",
  "support.ticket.create",
  "support.ticket.view",
  "support.ticket.manage",
  "support.impersonate",
  "budget.view",
  "budget.manage",
  "billing.view",
  "billing.manage",
  "ai.use",
  "ai.manage",
  "security.event.view",
  "trust.incident.view",
  "trust.incident.manage",
  "trust.incident.appeal",
  "trust.comment.view",
  "trust.comment.manage",
  "trust.review.view",
  "trust.review.create",
  "trust.review.respond",
  "trust.review.moderate",
  "trust.rating.view",
  "trust.rating.manage",
  "trust.rating.appeal",
  "geo.view",
  "geo.manage",
  "geo.verify",
  "recommendation.use",
  "promotion.placement.manage",
];

async function seed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Production seeding requires ALLOW_PRODUCTION_SEED=true");
  }

  await prisma.country.upsert({
    where: { code: "KZ" },
    update: {},
    create: {
      code: "KZ",
      nameRu: "Казахстан",
      nameKk: "Қазақстан",
      regions: {
        create: [
          { code: "ALA", nameRu: "Алматы", nameKk: "Алматы", cities: { create: { code: "ALMATY", nameRu: "Алматы", nameKk: "Алматы" } } },
          { code: "AST", nameRu: "Астана", nameKk: "Астана", cities: { create: { code: "ASTANA", nameRu: "Астана", nameKk: "Астана" } } },
        ],
      },
    },
  });

  const dentistryIndustry = await prisma.industry.upsert({
    where: { code: "dentistry-kz" },
    update: {},
    create: { code: "dentistry-kz", nameRu: "Стоматология", nameKk: "Стоматология" },
  });

  for (const code of permissionCodes) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
  }

  for (const flag of [
    { key: "ai.assistant", description: "Tenant-aware AI procurement assistant" },
    { key: "billing.enforcement", description: "Enforce plan limits; disabled during pilot" },
    { key: "promoted.offers", description: "Paid promoted offer placement" },
    { key: "trust.smart-commerce", description: "Verified reviews, explainable rating and geo recommendations" },
    { key: "social.apple", description: "Apple social sign-in" },
    { key: "social.google", description: "Google social sign-in" },
  ]) await prisma.featureFlag.upsert({ where: { key: flag.key }, update: { description: flag.description }, create: { ...flag, enabled: false } });

  const pilotPlan = await prisma.billingPlan.upsert({
    where: { code: "pilot" },
    update: { name: "Пилот", monthlyPriceMinor: 0, currency: "KZT", status: "ACTIVE" },
    create: { code: "pilot", name: "Пилот", description: "Полный доступ без списаний на период пилота", monthlyPriceMinor: 0, currency: "KZT", trialDays: 90, graceDays: 30 },
  });
  for (const featureKey of ["catalog.core", "orders.core", "integrations.core", "promotion.core", "support.core"]) await prisma.planEntitlement.upsert({ where: { planId_featureKey: { planId: pilotPlan.id, featureKey } }, update: { enabled: true }, create: { planId: pilotPlan.id, featureKey, enabled: true } });

  for (const template of [
    { code: "MARKETPLACE_SUPPLIER_AGREEMENT_RU", kind: "MARKETPLACE_SUPPLIER_AGREEMENT" as const, name: "Договор поставщика с платформой", format: "PDF" as const, requiredSignatureCount: 2, templateBody: "ДОГОВОР № {{agreement.number}}\n\nПлатформа: {{operator.legalName}}, БИН {{operator.bin}}\nПоставщик: {{supplier.legalName}}, БИН {{supplier.bin}}\n\nСрок: {{agreement.term}}. Договор вступает в силу после подписания ЭЦП обеими сторонами. Условие продления: {{agreement.renewal}}. Если новая версия условий не требует повторного согласия и ни одна сторона не заявила об отказе от продления, договор продлевается на следующий 12-месячный период.\n\nДокумент и подписи фиксируются неизменяемой версией." },
    { code: "FRAMEWORK_SUPPLY_AGREEMENT_RU", kind: "FRAMEWORK_SUPPLY_AGREEMENT" as const, name: "Рамочный договор поставки", format: "PDF" as const, requiredSignatureCount: 2, templateBody: "РАМОЧНЫЙ ДОГОВОР ПОСТАВКИ № {{agreement.number}}\n\nПоставщик: {{supplier.legalName}}, БИН {{supplier.bin}}\nПокупатель: {{buyer.legalName}}, БИН {{buyer.bin}}\n\nСрок: {{agreement.term}}. Договор вступает в силу после подписания ЭЦП обеими сторонами. {{agreement.renewal}}. Заказы могут оформляться как по рамочному договору, так и разовой сделкой без обязательного рамочного договора.\n\nДокумент и подписи фиксируются неизменяемой версией." },
    { code: "ORDER_SPECIFICATION_RU", kind: "ORDER_SPECIFICATION" as const, name: "Спецификация к заказу", format: "PDF" as const, requiredSignatureCount: 1, templateBody: "СПЕЦИФИКАЦИЯ № {{order.number}}\n\nПоставщик: {{supplier.name}}\nПокупатель: {{buyer.name}}\nСумма: {{order.total}} {{order.currency}}\n\nСостав заказа:\n{{order.items}}\n\nДокумент сформирован Marketplace." },
    { code: "INVOICE_RU", kind: "INVOICE" as const, name: "Счёт на оплату", format: "PDF" as const, requiredSignatureCount: 0, templateBody: "СЧЁТ № {{invoice.number}}\n\nПоставщик: {{supplier.name}}\nБИН поставщика: {{supplier.bin}}\nПокупатель: {{buyer.name}}\nБИН покупателя: {{buyer.bin}}\nИтого к оплате: {{invoice.total}} {{invoice.currency}}." },
    { code: "WAYBILL_RU", kind: "WAYBILL" as const, name: "Накладная", format: "DOCX" as const, requiredSignatureCount: 2, templateBody: "НАКЛАДНАЯ № {{shipment.number}}\nПоставщик: {{supplier.name}}\nПолучатель: {{recipient.name}}\nАдрес: {{recipient.address}}\nТовары: {{shipment.items}}" },
  ]) await prisma.documentTemplate.upsert({
    where: { code_version: { code: template.code, version: 1 } },
    update: {},
    create: { ...template, version: 1, locale: "ru-KZ", signatureMethods: ["MOCK", "EDS", "EGOV_QR"] },
  });

  const operatorOrganization = await prisma.organization.upsert({
    where: { bin: "000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      legalName: "ТОО Marketplace Operator",
      displayName: "Marketplace Operator",
      bin: "000000000001",
      capabilities: { create: { capability: "MARKETPLACE_OPERATOR" } },
    },
  });
  const operatorUser = await prisma.user.upsert({
    where: { email: "operator@marketplace.local" },
    update: {},
    create: { id: "00000000-0000-4000-8000-000000000002", email: "operator@marketplace.local", displayName: "Локальный оператор" },
  });
  const operatorRole = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: operatorOrganization.id, code: "platform_operator" } },
    update: {
      permissions: {
        deleteMany: {},
        create: permissionCodes.map((code) => ({ permission: { connect: { code } } })),
      },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000003",
      organizationId: operatorOrganization.id,
      code: "platform_operator",
      name: "Оператор платформы",
      isSystem: true,
      permissions: { create: permissionCodes.map((code) => ({ permission: { connect: { code } } })) },
    },
  });
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: operatorUser.id, organizationId: operatorOrganization.id } },
    update: { status: "ACTIVE" },
    create: {
      id: "00000000-0000-4000-8000-000000000004",
      userId: operatorUser.id,
      organizationId: operatorOrganization.id,
      status: "ACTIVE",
      acceptedAt: new Date(),
      isPrimary: true,
      roles: { create: { roleId: operatorRole.id } },
    },
  });
  console.info(JSON.stringify({ operatorUserId: operatorUser.id, operatorOrganizationId: operatorOrganization.id }, null, 2));

  for (const unit of [
    { code: "piece", nameRu: "Штука", nameKk: "Дана", symbol: "шт" },
    { code: "pack", nameRu: "Упаковка", nameKk: "Қаптама", symbol: "уп" },
    { code: "pair", nameRu: "Пара", nameKk: "Жұп", symbol: "пар" },
    { code: "box", nameRu: "Короб", nameKk: "Қорап", symbol: "кор" },
    { code: "gram", nameRu: "Грамм", nameKk: "Грамм", symbol: "г" },
    { code: "milliliter", nameRu: "Миллилитр", nameKk: "Миллилитр", symbol: "мл" },
    { code: "tube", nameRu: "Тюбик", nameKk: "Түтік", symbol: "тюб" },
    { code: "set", nameRu: "Набор", nameKk: "Жинақ", symbol: "наб" },
  ]) {
    await prisma.unitOfMeasure.upsert({ where: { code: unit.code }, update: {}, create: unit });
  }

  const pieceUnit = await prisma.unitOfMeasure.findUniqueOrThrow({ where: { code: "piece" } });
  const [packUnit, pairUnit, boxUnit, gramUnit, setUnit] = await Promise.all(["pack", "pair", "box", "gram", "set"].map((code) => prisma.unitOfMeasure.findUniqueOrThrow({ where: { code } })));
  const kazakhstan = await prisma.country.findUniqueOrThrow({ where: { code: "KZ" } });
  const citySpecs = [
    { regionCode: "ALA", regionRu: "Алматы", regionKk: "Алматы", cityCode: "ALMATY", cityRu: "Алматы", cityKk: "Алматы" },
    { regionCode: "AST", regionRu: "Астана", regionKk: "Астана", cityCode: "ASTANA", cityRu: "Астана", cityKk: "Астана" },
    { regionCode: "SHY", regionRu: "Шымкент", regionKk: "Шымкент", cityCode: "SHYMKENT", cityRu: "Шымкент", cityKk: "Шымкент" },
    { regionCode: "KAR", regionRu: "Карагандинская область", regionKk: "Қарағанды облысы", cityCode: "KARAGANDA", cityRu: "Караганда", cityKk: "Қарағанды" },
    { regionCode: "PAV", regionRu: "Павлодарская область", regionKk: "Павлодар облысы", cityCode: "PAVLODAR", cityRu: "Павлодар", cityKk: "Павлодар" },
  ];
  const cities = new Map<string, { id: string }>();
  for (const spec of citySpecs) {
    const region = await prisma.region.upsert({ where: { countryId_code: { countryId: kazakhstan.id, code: spec.regionCode } }, update: { nameRu: spec.regionRu, nameKk: spec.regionKk }, create: { countryId: kazakhstan.id, code: spec.regionCode, nameRu: spec.regionRu, nameKk: spec.regionKk } });
    const city = await prisma.city.upsert({ where: { regionId_code: { regionId: region.id, code: spec.cityCode } }, update: { nameRu: spec.cityRu, nameKk: spec.cityKk }, create: { regionId: region.id, code: spec.cityCode, nameRu: spec.cityRu, nameKk: spec.cityKk } });
    cities.set(spec.cityCode, city);
  }

  for (const policy of [
    { source: "API" as const, dataType: "INVENTORY" as const, staleAfterMinutes: 15, expirationBehavior: "PAUSE" as const, confirmationRequired: false },
    { source: "ERP" as const, dataType: "INVENTORY" as const, staleAfterMinutes: 15, expirationBehavior: "PAUSE" as const, confirmationRequired: false },
    { source: "IMPORT" as const, dataType: "INVENTORY" as const, staleAfterMinutes: 24 * 60, expirationBehavior: "REQUIRE_CONFIRMATION" as const, confirmationRequired: true },
    { source: "MANUAL" as const, dataType: "INVENTORY" as const, staleAfterMinutes: 48 * 60, expirationBehavior: "MARK_UNKNOWN" as const, confirmationRequired: true },
    { source: "API" as const, dataType: "PRICE" as const, staleAfterMinutes: 15, expirationBehavior: "PAUSE" as const, confirmationRequired: false },
    { source: "ERP" as const, dataType: "PRICE" as const, staleAfterMinutes: 15, expirationBehavior: "PAUSE" as const, confirmationRequired: false },
    { source: "IMPORT" as const, dataType: "PRICE" as const, staleAfterMinutes: 24 * 60, expirationBehavior: "REQUIRE_CONFIRMATION" as const, confirmationRequired: true },
    { source: "MANUAL" as const, dataType: "PRICE" as const, staleAfterMinutes: 48 * 60, expirationBehavior: "REQUIRE_CONFIRMATION" as const, confirmationRequired: true },
  ]) await prisma.freshnessPolicy.upsert({ where: { scopeKey_source_dataType: { scopeKey: "global", source: policy.source, dataType: policy.dataType } }, update: policy, create: { scopeKey: "global", ...policy, priority: 100 } });
  const demoCategory = await prisma.category.upsert({
    where: { industryId_code: { industryId: dentistryIndustry.id, code: "demo-materials" } },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000011",
      industryId: dentistryIndustry.id,
      code: "demo-materials",
      nameRu: "Демонстрационные материалы",
      nameKk: "Демонстрациялық материалдар",
      path: "demo-materials",
    },
  });
  const categorySpecs = [
    { code: "gloves", nameRu: "Перчатки", nameKk: "Қолғаптар" },
    { code: "bibs", nameRu: "Стоматологические нагрудники и салфетки", nameKk: "Стоматологиялық алжапқыштар мен майлықтар" },
    { code: "shoe-covers", nameRu: "Бахилы", nameKk: "Бахилалар" },
    { code: "equipment", nameRu: "Стоматологическое оборудование", nameKk: "Стоматологиялық жабдық" },
  ];
  const categories = new Map<string, { id: string }>([[demoCategory.code, demoCategory]]);
  for (const spec of categorySpecs) {
    const category = await prisma.category.upsert({ where: { industryId_code: { industryId: dentistryIndustry.id, code: spec.code } }, update: { nameRu: spec.nameRu, nameKk: spec.nameKk }, create: { industryId: dentistryIndustry.id, code: spec.code, nameRu: spec.nameRu, nameKk: spec.nameKk, path: spec.code } });
    categories.set(spec.code, category);
  }
  const specificationGroup = await prisma.attributeGroup.upsert({ where: { code: "dentistry-specification" }, update: {}, create: { code: "dentistry-specification", nameRu: "Характеристики", nameKk: "Сипаттамалар" } });
  const attributeSpecs = [
    { code: "material", nameRu: "Материал", nameKk: "Материал", valueType: "TEXT" as const },
    { code: "size", nameRu: "Размер", nameKk: "Өлшем", valueType: "TEXT" as const },
    { code: "color", nameRu: "Цвет", nameKk: "Түс", valueType: "TEXT" as const },
    { code: "sterile", nameRu: "Стерильность", nameKk: "Стерильділік", valueType: "BOOLEAN" as const },
    { code: "package_count", nameRu: "Количество в упаковке", nameKk: "Қаптамадағы саны", valueType: "INTEGER" as const },
    { code: "layers", nameRu: "Количество слоёв", nameKk: "Қабаттар саны", valueType: "INTEGER" as const },
    { code: "density_gsm", nameRu: "Плотность", nameKk: "Тығыздық", valueType: "DECIMAL" as const },
    { code: "warranty_months", nameRu: "Гарантия, месяцев", nameKk: "Кепілдік, ай", valueType: "INTEGER" as const },
    { code: "installation_required", nameRu: "Требуется монтаж", nameKk: "Орнату қажет", valueType: "BOOLEAN" as const },
  ];
  const attributes = new Map<string, { id: string }>();
  for (const spec of attributeSpecs) {
    const attribute = await prisma.attributeDefinition.upsert({ where: { code: spec.code }, update: { isSearchable: true, isFilterable: true }, create: { ...spec, groupId: specificationGroup.id, isSearchable: true, isFilterable: true } });
    attributes.set(spec.code, attribute);
  }
  const rulesByCategory: Record<string, Array<[string, boolean]>> = {
    gloves: [["material", true], ["size", true], ["color", false], ["sterile", true], ["package_count", true]],
    bibs: [["material", false], ["layers", true], ["density_gsm", false], ["package_count", true]],
    "shoe-covers": [["material", false], ["color", false], ["sterile", false], ["package_count", true]],
    equipment: [["warranty_months", false], ["installation_required", false]],
  };
  for (const [categoryCode, rules] of Object.entries(rulesByCategory)) for (const [attributeCode, isVariant] of rules) await prisma.categoryAttributeRule.upsert({
    where: { categoryId_attributeId: { categoryId: categories.get(categoryCode)!.id, attributeId: attributes.get(attributeCode)!.id } },
    update: { isRequired: true, isVariant },
    create: { categoryId: categories.get(categoryCode)!.id, attributeId: attributes.get(attributeCode)!.id, isRequired: true, isVariant },
  });
  const demoProduct = await prisma.product.upsert({
    where: { slug: "demo-dental-composite" },
    update: { status: "ACTIVE" },
    create: {
      id: "00000000-0000-4000-8000-000000000012",
      canonicalName: "Демонстрационный стоматологический композит",
      slug: "demo-dental-composite",
      productType: "material",
      status: "ACTIVE",
      baseUnitId: pieceUnit.id,
      industries: { create: { industryId: dentistryIndustry.id } },
      categories: { create: { categoryId: demoCategory.id } },
      searchDocument: { create: { searchableText: "Демонстрационный стоматологический композит", normalizedText: "демонстрационный стоматологический композит", facets: {} } },
    },
  });
  const demoVariantId = "00000000-0000-4000-8000-000000000013";
  await prisma.productVariant.upsert({
    where: { id: demoVariantId },
    update: { status: "ACTIVE" },
    create: { id: "00000000-0000-4000-8000-000000000013", productId: demoProduct.id, sku: "DEMO-COMP-A2", gtin: "1234567890123", saleUnitId: pieceUnit.id, packageQuantity: 1, status: "ACTIVE" },
  });

  const fixedId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  const brands = new Map<string, { id: string }>();
  for (const name of ["SafeTouch", "CleanDent", "MediStep", "DentTech"]) brands.set(name, await prisma.brand.upsert({ where: { name }, update: {}, create: { name } }));
  const manufacturers = new Map<string, { id: string }>();
  for (const name of ["SafeMed Industries", "CleanDent Europe", "MediStep Asia", "DentTech GmbH"]) manufacturers.set(name, await prisma.manufacturer.upsert({ where: { name }, update: {}, create: { name } }));

  async function seedProduct(spec: { sequence: number; slug: string; name: string; category: string; productType: string; regulatoryClass?: string; brand: string; manufacturer: string; variantSku: string; variantGtin: string; saleUnitId: string; baseUnitId: string; attributes: Record<string, string | number | boolean> }) {
    const product = await prisma.product.upsert({
      where: { slug: spec.slug },
      update: { canonicalName: spec.name, status: "ACTIVE", brandId: brands.get(spec.brand)!.id, manufacturerId: manufacturers.get(spec.manufacturer)!.id, productType: spec.productType, regulatoryClass: spec.regulatoryClass ?? null, baseUnitId: spec.baseUnitId },
      create: { id: fixedId(spec.sequence), canonicalName: spec.name, slug: spec.slug, brandId: brands.get(spec.brand)!.id, manufacturerId: manufacturers.get(spec.manufacturer)!.id, productType: spec.productType, regulatoryClass: spec.regulatoryClass, status: "ACTIVE", baseUnitId: spec.baseUnitId },
    });
    await prisma.productIndustry.upsert({ where: { productId_industryId: { productId: product.id, industryId: dentistryIndustry.id } }, update: {}, create: { productId: product.id, industryId: dentistryIndustry.id } });
    await prisma.productCategory.upsert({ where: { productId_categoryId: { productId: product.id, categoryId: categories.get(spec.category)!.id } }, update: {}, create: { productId: product.id, categoryId: categories.get(spec.category)!.id } });
    const variant = await prisma.productVariant.upsert({ where: { id: fixedId(spec.sequence + 1) }, update: { status: "ACTIVE", saleUnitId: spec.saleUnitId }, create: { id: fixedId(spec.sequence + 1), productId: product.id, sku: spec.variantSku, gtin: spec.variantGtin, saleUnitId: spec.saleUnitId, status: "ACTIVE" } });
    for (const [code, value] of Object.entries(spec.attributes)) {
      const attributeId = attributes.get(code)?.id;
      if (!attributeId) continue;
      await prisma.variantAttributeValue.upsert({
        where: { variantId_attributeId: { variantId: variant.id, attributeId } },
        update: { valueText: typeof value === "string" ? value : null, valueInteger: typeof value === "number" && Number.isInteger(value) ? BigInt(value) : null, valueDecimal: typeof value === "number" && !Number.isInteger(value) ? value : null, valueBoolean: typeof value === "boolean" ? value : null },
        create: { variantId: variant.id, attributeId, valueText: typeof value === "string" ? value : null, valueInteger: typeof value === "number" && Number.isInteger(value) ? BigInt(value) : null, valueDecimal: typeof value === "number" && !Number.isInteger(value) ? value : null, valueBoolean: typeof value === "boolean" ? value : null },
      });
    }
    await prisma.productSearchDocument.upsert({ where: { productId: product.id }, update: { searchableText: `${spec.name} ${spec.brand} ${spec.manufacturer} ${spec.variantSku} ${spec.variantGtin}`, normalizedText: `${spec.name} ${spec.brand} ${spec.manufacturer}`.toLocaleLowerCase("ru"), facets: { seed: "dentistry" }, projectionVersion: { increment: 1 } }, create: { productId: product.id, searchableText: `${spec.name} ${spec.brand} ${spec.manufacturer} ${spec.variantSku} ${spec.variantGtin}`, normalizedText: `${spec.name} ${spec.brand} ${spec.manufacturer}`.toLocaleLowerCase("ru"), facets: { seed: "dentistry" } } });
    return { product, variant };
  }

  const gloves = await seedProduct({ sequence: 100, slug: "safetouch-ultra-nitrile-m-blue-100", name: "Перчатки нитриловые SafeTouch Ultra", category: "gloves", productType: "consumable", regulatoryClass: "medical-device-low-risk", brand: "SafeTouch", manufacturer: "SafeMed Industries", variantSku: "ST-ULTRA-M-BLUE", variantGtin: "4870000000101", saleUnitId: packUnit.id, baseUnitId: pieceUnit.id, attributes: { material: "нитрил", size: "M", color: "синий", sterile: false, package_count: 100 } });
  const bibs = await seedProduct({ sequence: 110, slug: "cleandent-bibs-2ply-500", name: "Нагрудники стоматологические CleanDent 2-слойные", category: "bibs", productType: "consumable", brand: "CleanDent", manufacturer: "CleanDent Europe", variantSku: "CD-BIB-2L-500", variantGtin: "4870000000118", saleUnitId: packUnit.id, baseUnitId: pieceUnit.id, attributes: { material: "целлюлоза и полиэтилен", layers: 2, density_gsm: 32.5, package_count: 500 } });
  const shoeCovers = await seedProduct({ sequence: 120, slug: "medistep-shoe-covers-blue-50", name: "Бахилы MediStep усиленные", category: "shoe-covers", productType: "consumable", brand: "MediStep", manufacturer: "MediStep Asia", variantSku: "MS-SHOE-BLUE-50", variantGtin: "4870000000125", saleUnitId: packUnit.id, baseUnitId: pairUnit.id, attributes: { material: "полиэтилен", color: "синий", sterile: false, package_count: 50 } });
  const equipment = await seedProduct({ sequence: 130, slug: "denttech-x5-treatment-unit", name: "Стоматологическая установка DentTech X5", category: "equipment", productType: "equipment", regulatoryClass: "medical-equipment", brand: "DentTech", manufacturer: "DentTech GmbH", variantSku: "DT-X5-KZ", variantGtin: "4870000000132", saleUnitId: setUnit.id, baseUnitId: pieceUnit.id, attributes: { warranty_months: 24, installation_required: true } });

  async function seedPackaging(variantId: string, code: string, name: string, level: "BASE" | "SALE" | "TRANSPORT", unitId: string, quantityInBaseUnit: number, parentPackagingId?: string) {
    return prisma.productPackaging.upsert({ where: { productVariantId_code: { productVariantId: variantId, code } }, update: { name, level, unitId, quantityInBaseUnit, parentPackagingId: parentPackagingId ?? null, status: "ACTIVE" }, create: { productVariantId: variantId, code, name, level, unitId, quantityInBaseUnit, parentPackagingId } });
  }
  const demoPackaging = await seedPackaging(demoVariantId, "piece", "Штука", "SALE", pieceUnit.id, 1);
  const glovePack = await seedPackaging(gloves.variant.id, "pack-100", "Упаковка 100 штук", "SALE", packUnit.id, 100);
  await seedPackaging(gloves.variant.id, "carton-10x100", "Короб 10 упаковок", "TRANSPORT", boxUnit.id, 1_000, glovePack.id);
  const bibPack = await seedPackaging(bibs.variant.id, "pack-500", "Упаковка 500 штук", "SALE", packUnit.id, 500);
  const shoePack = await seedPackaging(shoeCovers.variant.id, "pack-50-pairs", "Упаковка 50 пар", "SALE", packUnit.id, 50);
  const equipmentSet = await seedPackaging(equipment.variant.id, "installation-set", "Комплект установки", "SALE", setUnit.id, 1);

  const demoSupplier = await prisma.organization.upsert({
    where: { bin: "000000000010" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000020",
      legalName: "ТОО Demo Dental Supply",
      displayName: "Demo Dental Supply",
      bin: "000000000010",
      capabilities: { create: [{ capability: "SUPPLIER" }, { capability: "IMPORTER" }] },
    },
  });
  await prisma.supplierProfile.upsert({ where: { organizationId: demoSupplier.id }, update: { regulatoryDetails: { officialDistributor: true, supplierWarranty: true, demoOnly: true, bankName: "Демо Банк Казахстан", iban: "KZ00DEMO000000000000", bik: "DEMO0000" } }, create: { organizationId: demoSupplier.id, regulatoryDetails: { officialDistributor: true, supplierWarranty: true, demoOnly: true, bankName: "Демо Банк Казахстан", iban: "KZ00DEMO000000000000", bik: "DEMO0000" } } });
  const supplierPermissionCodes = ["organization.view", "catalog.product.view", "catalog.offer.edit", "catalog.offer.publish", "import.manage", "matching.manage", "compliance.view", "compliance.credential.manage", "inventory.view", "inventory.adjust", "inventory.freshness.manage", "order.confirm", "document.view", "document.sign", "integration.view", "integration.manage", "delivery.view", "delivery.manage", "shipment.manage", "promotion.view", "promotion.manage", "support.ticket.create", "support.ticket.view", "ai.use", "trust.incident.view", "trust.incident.appeal", "trust.comment.view", "trust.comment.manage", "trust.review.view", "trust.review.respond", "trust.rating.view", "trust.rating.appeal", "geo.view", "geo.manage"];
  const demoSupplierUser = await prisma.user.upsert({ where: { email: "supplier@marketplace.local" }, update: { displayName: "Demo Dental Supply" }, create: { id: fixedId(510), email: "supplier@marketplace.local", displayName: "Demo Dental Supply", emailVerifiedAt: new Date() } });
  const demoSupplierRole = await prisma.role.upsert({
    where: {
      organizationId_code: {
        organizationId: demoSupplier.id,
        code: "supplier_owner",
      },
    },
    update: {
      permissions: {
        deleteMany: {},
        create: supplierPermissionCodes.map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
    create: {
      id: fixedId(511),
      organizationId: demoSupplier.id,
      code: "supplier_owner",
      name: "Владелец поставщика",
      isSystem: true,
      permissions: {
        create: supplierPermissionCodes.map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
  });
  const demoSupplierMembership = await prisma.organizationMembership.upsert({ where: { userId_organizationId: { userId: demoSupplierUser.id, organizationId: demoSupplier.id } }, update: { status: "ACTIVE", isPrimary: true, acceptedAt: new Date() }, create: { id: fixedId(512), userId: demoSupplierUser.id, organizationId: demoSupplier.id, status: "ACTIVE", isPrimary: true, acceptedAt: new Date() } });
  await prisma.membershipRole.upsert({ where: { membershipId_roleId: { membershipId: demoSupplierMembership.id, roleId: demoSupplierRole.id } }, update: {}, create: { membershipId: demoSupplierMembership.id, roleId: demoSupplierRole.id } });
  await prisma.organizationFeature.upsert({ where: { organizationId_featureKey: { organizationId: demoSupplier.id, featureKey: "ai.assistant" } }, update: { enabled: true, source: "SEED_PILOT" }, create: { organizationId: demoSupplier.id, featureKey: "ai.assistant", enabled: true, source: "SEED_PILOT" } });
  await prisma.organizationFeature.upsert({ where: { organizationId_featureKey: { organizationId: demoSupplier.id, featureKey: "commerce.profile" } }, update: { enabled: true, source: "SEED_PILOT", limits: { tier: "BASIC", operatingMode: "SEMI_AUTOMATED", integration: "EXCEL_PDF", paymentMethods: ["CARD", "BANK_TRANSFER", "INVOICE"], bankAddOnEnabled: false } }, create: { organizationId: demoSupplier.id, featureKey: "commerce.profile", enabled: true, source: "SEED_PILOT", limits: { tier: "BASIC", operatingMode: "SEMI_AUTOMATED", integration: "EXCEL_PDF", paymentMethods: ["CARD", "BANK_TRANSFER", "INVOICE"], bankAddOnEnabled: false } } });
  const demoWarehouse = await prisma.warehouse.upsert({
    where: { supplierOrganizationId_code: { supplierOrganizationId: demoSupplier.id, code: "ALM-01" } },
    update: { cityId: cities.get("ALMATY")!.id, addressLine: "Алматы, ул. Толе би, 101" },
    create: { id: "00000000-0000-4000-8000-000000000021", supplierOrganizationId: demoSupplier.id, code: "ALM-01", name: "Основной склад Алматы", cityId: cities.get("ALMATY")!.id, addressLine: "Алматы, ул. Толе би, 101" },
  });
  const existingSource = await prisma.supplierDataSource.findFirst({ where: { supplierOrganizationId: demoSupplier.id, name: "Demo CSV import" } });
  if (!existingSource) {
    await prisma.supplierDataSource.create({ data: { id: "00000000-0000-4000-8000-000000000022", supplierOrganizationId: demoSupplier.id, name: "Demo CSV import", type: "CSV" } });
  }

  const demoBuyer = await prisma.organization.upsert({
    where: { bin: "000000000030" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000030",
      legalName: "ТОО Demo Dental Clinic",
      displayName: "Demo Dental Clinic",
      bin: "000000000030",
      capabilities: { create: { capability: "BUYER" } },
    },
  });
  const buyerPermissionCodes = ["organization.view", "catalog.product.view", "order.create", "order.approve", "document.view", "document.sign", "notification.view", "support.ticket.create", "support.ticket.view", "budget.view", "budget.manage", "ai.use", "trust.incident.view", "trust.incident.appeal", "trust.comment.view", "trust.comment.manage", "trust.review.view", "trust.review.create", "trust.rating.view", "geo.view", "geo.manage", "recommendation.use"];
  const demoBuyerUser = await prisma.user.upsert({
    where: { email: "buyer@marketplace.local" },
    update: { displayName: "Demo Dental Clinic" },
    create: { id: fixedId(500), email: "buyer@marketplace.local", displayName: "Demo Dental Clinic", emailVerifiedAt: new Date() },
  });
  const demoBuyerRole = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: demoBuyer.id, code: "buyer_owner" } },
    update: { permissions: { deleteMany: {}, create: buyerPermissionCodes.map((code) => ({ permission: { connect: { code } } })) } },
    create: { id: fixedId(501), organizationId: demoBuyer.id, code: "buyer_owner", name: "Владелец клиники", isSystem: true, permissions: { create: buyerPermissionCodes.map((code) => ({ permission: { connect: { code } } })) } },
  });
  const demoBuyerMembership = await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: demoBuyerUser.id, organizationId: demoBuyer.id } },
    update: { status: "ACTIVE", isPrimary: true, acceptedAt: new Date() },
    create: { id: fixedId(502), userId: demoBuyerUser.id, organizationId: demoBuyer.id, status: "ACTIVE", isPrimary: true, acceptedAt: new Date() },
  });
  await prisma.membershipRole.upsert({ where: { membershipId_roleId: { membershipId: demoBuyerMembership.id, roleId: demoBuyerRole.id } }, update: {}, create: { membershipId: demoBuyerMembership.id, roleId: demoBuyerRole.id } });
  await prisma.organizationFeature.upsert({ where: { organizationId_featureKey: { organizationId: demoBuyer.id, featureKey: "ai.assistant" } }, update: { enabled: true, source: "SEED_PILOT" }, create: { organizationId: demoBuyer.id, featureKey: "ai.assistant", enabled: true, source: "SEED_PILOT" } });

  const existingDemoOffer = await prisma.supplierOffer.findFirst({ where: { supplierOrganizationId: demoSupplier.id, productVariantId: demoVariantId, saleUnitId: pieceUnit.id } });
  const demoOffer = existingDemoOffer ?? await prisma.supplierOffer.create({ data: {
    id: "00000000-0000-4000-8000-000000000040",
    supplierOrganizationId: demoSupplier.id,
    productVariantId: demoVariantId,
    saleUnitId: pieceUnit.id,
    supplierSku: "DEMO-SUPPLY-COMP-A2",
    confirmationMode: "MANUAL",
    status: "ACTIVE",
  } });
  await prisma.supplierOffer.update({ where: { id: demoOffer.id }, data: { status: "ACTIVE", confirmationMode: "MANUAL", packagingId: demoPackaging.id, baseUnitsPerSaleUnit: 1 } });
  await ensureActiveSeedPrice(demoOffer.id, "00000000-0000-4000-8000-000000000041", 245000);
  await prisma.offerPublication.upsert({ where: { offerId: demoOffer.id }, update: { status: "PUBLISHED", marketplaceVisible: true, blockedReason: null, publishedAt: new Date() }, create: { offerId: demoOffer.id, status: "PUBLISHED", marketplaceVisible: true, publishedAt: new Date() } });
  const demoBalance = await prisma.inventoryBalance.upsert({
    where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId: demoSupplier.id, warehouseId: demoWarehouse.id, productVariantId: demoVariantId } },
    update: { offerId: demoOffer.id, freshnessStatus: "FRESH", freshnessExpiresAt: new Date(Date.now() + 24 * 60 * 60_000), lastSuccessfulSyncAt: new Date(), externalUpdatedAt: new Date() },
    create: { id: "00000000-0000-4000-8000-000000000042", supplierOrganizationId: demoSupplier.id, warehouseId: demoWarehouse.id, productVariantId: demoVariantId, offerId: demoOffer.id, quantityOnHand: 100, quantityReserved: 0, safetyStock: 0, quantityAvailable: 100, availabilityStatus: "IN_STOCK", freshnessStatus: "FRESH", freshnessExpiresAt: new Date(Date.now() + 24 * 60 * 60_000), lastSuccessfulSyncAt: new Date(), externalUpdatedAt: new Date() },
  });
  await prisma.inventoryLot.upsert({
    where: { warehouseId_productVariantId_lotNumber: { warehouseId: demoWarehouse.id, productVariantId: demoVariantId, lotNumber: "DEMO-LOT-2026-A" } },
    update: { offerId: demoOffer.id, registrationCertificate: "KZ-RC-DEMO-001", originSource: "Официальная поставка" },
    create: { id: "00000000-0000-4000-8000-000000000043", inventoryBalanceId: demoBalance.id, supplierOrganizationId: demoSupplier.id, warehouseId: demoWarehouse.id, productVariantId: demoVariantId, offerId: demoOffer.id, lotNumber: "DEMO-LOT-2026-A", series: "A2-2026", registrationCertificate: "KZ-RC-DEMO-001", originSource: "Официальная поставка", quantityOnHand: 100, quantityReserved: 0, quantityAvailable: 100, status: "ACTIVE", expirationDate: new Date("2028-12-31") },
  });

  const secondSupplier = await prisma.organization.upsert({
    where: { bin: "000000000025" },
    update: {},
    create: { id: "00000000-0000-4000-8000-000000000025", legalName: "ТОО Ortho Trade Kazakhstan", displayName: "Ortho Trade KZ", bin: "000000000025", capabilities: { create: { capability: "SUPPLIER" } } },
  });
  await prisma.supplierProfile.upsert({ where: { organizationId: secondSupplier.id }, update: { regulatoryDetails: { officialDistributor: false, supplierWarranty: true } }, create: { organizationId: secondSupplier.id, regulatoryDetails: { officialDistributor: false, supplierWarranty: true } } });
  const secondWarehouse = await prisma.warehouse.upsert({ where: { supplierOrganizationId_code: { supplierOrganizationId: secondSupplier.id, code: "AST-01" } }, update: { cityId: cities.get("ASTANA")!.id, addressLine: "Астана, пр. Кабанбай батыра, 21" }, create: { id: "00000000-0000-4000-8000-000000000026", supplierOrganizationId: secondSupplier.id, code: "AST-01", name: "Склад Астана", cityId: cities.get("ASTANA")!.id, addressLine: "Астана, пр. Кабанбай батыра, 21" } });
  const existingSecondOffer = await prisma.supplierOffer.findFirst({ where: { supplierOrganizationId: secondSupplier.id, productVariantId: demoVariantId, saleUnitId: pieceUnit.id } });
  const secondOffer = existingSecondOffer ?? await prisma.supplierOffer.create({ data: { id: "00000000-0000-4000-8000-000000000044", supplierOrganizationId: secondSupplier.id, productVariantId: demoVariantId, saleUnitId: pieceUnit.id, supplierSku: "ORTHO-COMP-A2", confirmationMode: "MANUAL", status: "ACTIVE" } });
  await prisma.supplierOffer.update({ where: { id: secondOffer.id }, data: { status: "ACTIVE", confirmationMode: "MANUAL", packagingId: demoPackaging.id, baseUnitsPerSaleUnit: 1 } });
  await ensureActiveSeedPrice(secondOffer.id, "00000000-0000-4000-8000-000000000045", 239000);
  await prisma.offerPublication.upsert({ where: { offerId: secondOffer.id }, update: { status: "PUBLISHED", marketplaceVisible: true, blockedReason: null, publishedAt: new Date() }, create: { offerId: secondOffer.id, status: "PUBLISHED", marketplaceVisible: true, publishedAt: new Date() } });
  const secondBalance = await prisma.inventoryBalance.upsert({ where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId: secondSupplier.id, warehouseId: secondWarehouse.id, productVariantId: demoVariantId } }, update: { offerId: secondOffer.id, freshnessStatus: "FRESH", freshnessExpiresAt: new Date(Date.now() + 48 * 60 * 60_000), lastSuccessfulSyncAt: new Date(), externalUpdatedAt: new Date() }, create: { id: "00000000-0000-4000-8000-000000000046", supplierOrganizationId: secondSupplier.id, warehouseId: secondWarehouse.id, productVariantId: demoVariantId, offerId: secondOffer.id, quantityOnHand: 80, quantityReserved: 0, safetyStock: 0, quantityAvailable: 80, availabilityStatus: "IN_STOCK", freshnessStatus: "FRESH", freshnessExpiresAt: new Date(Date.now() + 48 * 60 * 60_000), lastSuccessfulSyncAt: new Date(), externalUpdatedAt: new Date() } });
  await prisma.inventoryLot.upsert({ where: { warehouseId_productVariantId_lotNumber: { warehouseId: secondWarehouse.id, productVariantId: demoVariantId, lotNumber: "DEMO-LOT-2026-B" } }, update: { offerId: secondOffer.id, registrationCertificate: "KZ-RC-DEMO-002", originSource: "Параллельный разрешённый импорт" }, create: { id: "00000000-0000-4000-8000-000000000047", inventoryBalanceId: secondBalance.id, supplierOrganizationId: secondSupplier.id, warehouseId: secondWarehouse.id, productVariantId: demoVariantId, offerId: secondOffer.id, lotNumber: "DEMO-LOT-2026-B", series: "A2-2026-B", registrationCertificate: "KZ-RC-DEMO-002", originSource: "Параллельный разрешённый импорт", quantityOnHand: 80, quantityReserved: 0, quantityAvailable: 80, status: "ACTIVE", expirationDate: new Date("2029-06-30") } });

  const additionalSupplierSpecs = [
    { sequence: 60, bin: "000000000060", legalName: "ТОО MedConsum Shymkent", displayName: "MedConsum", cityCode: "SHYMKENT", warehouseCode: "SHY-01", warehouseName: "Склад Шымкент", address: "Шымкент, ул. Байтурсынова, 18", officialDistributor: false, sourceType: "MANUAL" as const },
    { sequence: 70, bin: "000000000070", legalName: "ТОО TechDent Systems", displayName: "TechDent Systems", cityCode: "ALMATY", warehouseCode: "ALM-EQ", warehouseName: "Склад оборудования Алматы", address: "Алматы, пр. Райымбека, 212", officialDistributor: true, sourceType: "ERP" as const },
    { sequence: 80, bin: "000000000080", legalName: "ТОО SterileLine Karaganda", displayName: "SterileLine", cityCode: "KARAGANDA", warehouseCode: "KAR-01", warehouseName: "Склад Караганда", address: "Караганда, ул. Ермекова, 52", officialDistributor: true, sourceType: "IMPORT" as const },
  ];
  const additionalSuppliers: Array<{ organization: typeof demoSupplier; warehouse: typeof demoWarehouse; sourceType: "MANUAL" | "IMPORT" | "API" | "ERP" }> = [];
  for (const spec of additionalSupplierSpecs) {
    const organization = await prisma.organization.upsert({ where: { bin: spec.bin }, update: { legalName: spec.legalName, displayName: spec.displayName }, create: { id: fixedId(spec.sequence), legalName: spec.legalName, displayName: spec.displayName, bin: spec.bin, capabilities: { create: { capability: "SUPPLIER" } } } });
    await prisma.organizationCapability.upsert({ where: { organizationId_capability: { organizationId: organization.id, capability: "SUPPLIER" } }, update: {}, create: { organizationId: organization.id, capability: "SUPPLIER" } });
    await prisma.supplierProfile.upsert({ where: { organizationId: organization.id }, update: { regulatoryDetails: { officialDistributor: spec.officialDistributor, supplierWarranty: true } }, create: { organizationId: organization.id, regulatoryDetails: { officialDistributor: spec.officialDistributor, supplierWarranty: true } } });
    const warehouse = await prisma.warehouse.upsert({ where: { supplierOrganizationId_code: { supplierOrganizationId: organization.id, code: spec.warehouseCode } }, update: { name: spec.warehouseName, cityId: cities.get(spec.cityCode)!.id, addressLine: spec.address }, create: { id: fixedId(spec.sequence + 1), supplierOrganizationId: organization.id, code: spec.warehouseCode, name: spec.warehouseName, cityId: cities.get(spec.cityCode)!.id, addressLine: spec.address } });
    additionalSuppliers.push({ organization, warehouse, sourceType: spec.sourceType });
  }
  for (const organization of [demoSupplier, secondSupplier]) await prisma.organizationCapability.upsert({ where: { organizationId_capability: { organizationId: organization.id, capability: "SUPPLIER" } }, update: {}, create: { organizationId: organization.id, capability: "SUPPLIER" } });

  async function seedOffer(spec: { sequence: number; supplier: typeof demoSupplier; warehouse: typeof demoWarehouse; variantId: string; saleUnitId: string; packagingId: string; baseUnits: number; sku: string; sourceType: "MANUAL" | "IMPORT" | "API" | "ERP"; priceMinor: number; quantity: number; lotNumber?: string; expirationDate?: string; registrationCertificate?: string; method?: "PICKUP" | "SUPPLIER_CITY" | "NATIONWIDE" | "CARRIER" | "SPECIAL"; fixedDeliveryMinor?: number; installationRequired?: boolean }) {
    const existing = await prisma.supplierOffer.findFirst({ where: { supplierOrganizationId: spec.supplier.id, productVariantId: spec.variantId, saleUnitId: spec.saleUnitId } });
    const offer = existing ?? await prisma.supplierOffer.create({ data: { id: fixedId(spec.sequence), supplierOrganizationId: spec.supplier.id, productVariantId: spec.variantId, saleUnitId: spec.saleUnitId, packagingId: spec.packagingId, supplierSku: spec.sku, baseUnitsPerSaleUnit: spec.baseUnits, confirmationMode: spec.sourceType === "MANUAL" ? "MANUAL" : "AUTO", sourceType: spec.sourceType, status: "ACTIVE" } });
    await prisma.supplierOffer.update({ where: { id: offer.id }, data: { packagingId: spec.packagingId, supplierSku: spec.sku, baseUnitsPerSaleUnit: spec.baseUnits, confirmationMode: spec.sourceType === "MANUAL" ? "MANUAL" : "AUTO", sourceType: spec.sourceType, status: "ACTIVE" } });
    const price = await ensureActiveSeedPrice(offer.id, fixedId(spec.sequence + 1), spec.priceMinor);
    const staleMinutes = spec.sourceType === "API" || spec.sourceType === "ERP" ? 15 : spec.sourceType === "IMPORT" ? 24 * 60 : 48 * 60;
    await prisma.offerPrice.update({ where: { id: price.id }, data: { lastConfirmedAt: new Date(), freshnessExpiresAt: new Date(Date.now() + staleMinutes * 60_000) } });
    await prisma.offerPublication.upsert({ where: { offerId: offer.id }, update: { status: "PUBLISHED", marketplaceVisible: true, blockedReason: null, publishedAt: new Date() }, create: { offerId: offer.id, status: "PUBLISHED", marketplaceVisible: true, publishedAt: new Date() } });
    const balance = await prisma.inventoryBalance.upsert({
      where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId: spec.supplier.id, warehouseId: spec.warehouse.id, productVariantId: spec.variantId } },
      update: { offerId: offer.id, freshnessStatus: "FRESH", source: spec.sourceType, externalUpdatedAt: new Date(), lastSuccessfulSyncAt: new Date(), freshnessExpiresAt: new Date(Date.now() + staleMinutes * 60_000) },
      create: { id: fixedId(spec.sequence + 2), supplierOrganizationId: spec.supplier.id, warehouseId: spec.warehouse.id, productVariantId: spec.variantId, offerId: offer.id, quantityOnHand: spec.quantity, quantityReserved: 0, safetyStock: 0, quantityAvailable: spec.quantity, availabilityStatus: "IN_STOCK", freshnessStatus: "FRESH", source: spec.sourceType, externalUpdatedAt: new Date(), lastSuccessfulSyncAt: new Date(), freshnessExpiresAt: new Date(Date.now() + staleMinutes * 60_000) },
    });
    if (spec.lotNumber) await prisma.inventoryLot.upsert({
      where: { warehouseId_productVariantId_lotNumber: { warehouseId: spec.warehouse.id, productVariantId: spec.variantId, lotNumber: spec.lotNumber } },
      update: { offerId: offer.id, registrationCertificate: spec.registrationCertificate, originSource: "Проверенный канал" },
      create: { id: fixedId(spec.sequence + 3), inventoryBalanceId: balance.id, supplierOrganizationId: spec.supplier.id, warehouseId: spec.warehouse.id, productVariantId: spec.variantId, offerId: offer.id, lotNumber: spec.lotNumber, registrationCertificate: spec.registrationCertificate, originSource: "Проверенный канал", quantityOnHand: spec.quantity, quantityReserved: 0, quantityAvailable: spec.quantity, status: "ACTIVE", expirationDate: spec.expirationDate ? new Date(spec.expirationDate) : null },
    });
    const method = spec.method ?? "CARRIER";
    await prisma.offerDeliveryOption.upsert({ where: { offerId_warehouseId_method: { offerId: offer.id, warehouseId: spec.warehouse.id, method } }, update: { priceType: spec.fixedDeliveryMinor ? "FIXED" : "FREE", fixedAmountMinor: spec.fixedDeliveryMinor ?? null, minLeadTimeHours: method === "SPECIAL" ? 48 : 4, maxLeadTimeHours: method === "SPECIAL" ? 240 : 48, installationRequired: spec.installationRequired ?? false, status: "ACTIVE" }, create: { offerId: offer.id, warehouseId: spec.warehouse.id, method, priceType: spec.fixedDeliveryMinor ? "FIXED" : "FREE", fixedAmountMinor: spec.fixedDeliveryMinor, minLeadTimeHours: method === "SPECIAL" ? 48 : 4, maxLeadTimeHours: method === "SPECIAL" ? 240 : 48, installationRequired: spec.installationRequired ?? false } });
    return offer;
  }

  const supplierThree = additionalSuppliers[0]!;
  const supplierFour = additionalSuppliers[1]!;
  const supplierFive = additionalSuppliers[2]!;
  const dentistryOffers = [
    await seedOffer({ sequence: 150, supplier: demoSupplier, warehouse: demoWarehouse, variantId: gloves.variant.id, saleUnitId: packUnit.id, packagingId: glovePack.id, baseUnits: 100, sku: "DDS-ST-M-100", sourceType: "IMPORT", priceMinor: 490_000, quantity: 150, lotNumber: "GLV-ALM-2026", expirationDate: "2029-12-31", registrationCertificate: "KZ-GLV-001", method: "SUPPLIER_CITY" }),
    await seedOffer({ sequence: 160, supplier: secondSupplier, warehouse: secondWarehouse, variantId: bibs.variant.id, saleUnitId: packUnit.id, packagingId: bibPack.id, baseUnits: 500, sku: "OTKZ-BIB-500", sourceType: "MANUAL", priceMinor: 1_250_000, quantity: 60, lotNumber: "BIB-AST-2026", expirationDate: "2030-06-30", registrationCertificate: "KZ-BIB-001", fixedDeliveryMinor: 150_000 }),
    await seedOffer({ sequence: 170, supplier: supplierThree.organization, warehouse: supplierThree.warehouse, variantId: shoeCovers.variant.id, saleUnitId: packUnit.id, packagingId: shoePack.id, baseUnits: 50, sku: "MC-SHOE-50", sourceType: supplierThree.sourceType, priceMinor: 350_000, quantity: 200, lotNumber: "SHOE-SHY-2026", expirationDate: "2031-01-31", registrationCertificate: "KZ-SHOE-001", fixedDeliveryMinor: 200_000 }),
    await seedOffer({ sequence: 180, supplier: supplierThree.organization, warehouse: supplierThree.warehouse, variantId: gloves.variant.id, saleUnitId: packUnit.id, packagingId: glovePack.id, baseUnits: 100, sku: "MC-ST-M-100", sourceType: supplierThree.sourceType, priceMinor: 475_000, quantity: 90, lotNumber: "GLV-SHY-2026", expirationDate: "2029-08-31", registrationCertificate: "KZ-GLV-002", fixedDeliveryMinor: 220_000 }),
    await seedOffer({ sequence: 190, supplier: supplierFour.organization, warehouse: supplierFour.warehouse, variantId: equipment.variant.id, saleUnitId: setUnit.id, packagingId: equipmentSet.id, baseUnits: 1, sku: "TDS-DT-X5", sourceType: supplierFour.sourceType, priceMinor: 85_000_000, quantity: 5, method: "SPECIAL", fixedDeliveryMinor: 2_500_000, installationRequired: true }),
    await seedOffer({ sequence: 200, supplier: supplierFour.organization, warehouse: supplierFour.warehouse, variantId: bibs.variant.id, saleUnitId: packUnit.id, packagingId: bibPack.id, baseUnits: 500, sku: "TDS-BIB-500", sourceType: supplierFour.sourceType, priceMinor: 1_180_000, quantity: 75, lotNumber: "BIB-ALM-2026", expirationDate: "2030-12-31", registrationCertificate: "KZ-BIB-002", method: "SUPPLIER_CITY" }),
    await seedOffer({ sequence: 210, supplier: supplierFive.organization, warehouse: supplierFive.warehouse, variantId: gloves.variant.id, saleUnitId: packUnit.id, packagingId: glovePack.id, baseUnits: 100, sku: "SL-ST-M-100", sourceType: supplierFive.sourceType, priceMinor: 510_000, quantity: 120, lotNumber: "GLV-KAR-2026", expirationDate: "2030-03-31", registrationCertificate: "KZ-GLV-003", fixedDeliveryMinor: 180_000 }),
    await seedOffer({ sequence: 220, supplier: supplierFive.organization, warehouse: supplierFive.warehouse, variantId: demoVariantId, saleUnitId: pieceUnit.id, packagingId: demoPackaging.id, baseUnits: 1, sku: "SL-COMP-A2", sourceType: supplierFive.sourceType, priceMinor: 242_000, quantity: 40, lotNumber: "COMP-KAR-2026", expirationDate: "2028-11-30", registrationCertificate: "KZ-RC-DEMO-003", fixedDeliveryMinor: 180_000 }),
  ];
  await prisma.offerDeliveryOption.upsert({ where: { offerId_warehouseId_method: { offerId: demoOffer.id, warehouseId: demoWarehouse.id, method: "SUPPLIER_CITY" } }, update: { priceType: "FREE_FROM_AMOUNT", fixedAmountMinor: 150_000, freeFromAmountMinor: 2_000_000, minLeadTimeHours: 2, maxLeadTimeHours: 24, status: "ACTIVE" }, create: { offerId: demoOffer.id, warehouseId: demoWarehouse.id, method: "SUPPLIER_CITY", priceType: "FREE_FROM_AMOUNT", fixedAmountMinor: 150_000, freeFromAmountMinor: 2_000_000, minLeadTimeHours: 2, maxLeadTimeHours: 24 } });
  await prisma.offerDeliveryOption.upsert({ where: { offerId_warehouseId_method: { offerId: secondOffer.id, warehouseId: secondWarehouse.id, method: "CARRIER" } }, update: { priceType: "FIXED", fixedAmountMinor: 200_000, minLeadTimeHours: 12, maxLeadTimeHours: 72, status: "ACTIVE" }, create: { offerId: secondOffer.id, warehouseId: secondWarehouse.id, method: "CARRIER", priceType: "FIXED", fixedAmountMinor: 200_000, minLeadTimeHours: 12, maxLeadTimeHours: 72 } });

  const mockCapabilities = { supports_split_payment: true, supports_single_charge_multi_recipient: true, supports_partial_capture: true, supports_partial_refund: true, supports_delayed_capture: true, supports_submerchant_onboarding: true, supports_payout_status: true, supports_reconciliation_api: true, supports_platform_fee: true };
  const mockProvider = await prisma.paymentProvider.upsert({ where: { code: "MOCK" }, update: { name: "Mock PSP", capabilities: mockCapabilities, status: "ACTIVE" }, create: { id: "00000000-0000-4000-8000-000000000050", code: "MOCK", name: "Mock PSP", capabilities: mockCapabilities } });
  const paymentSuppliers = [demoSupplier, secondSupplier, ...additionalSuppliers.map(({ organization }) => organization)];
  for (const organization of paymentSuppliers) {
    const externalMerchantId = `mock_merchant_${organization.bin}`;
    await prisma.paymentMerchantAccount.upsert({
      where: { organizationId_providerId: { organizationId: organization.id, providerId: mockProvider.id } },
      update: { externalMerchantId, onboardingStatus: "ACTIVE", verificationStatus: "VERIFIED", payoutStatus: "READY", capabilities: mockCapabilities, lastVerifiedAt: new Date() },
      create: { organizationId: organization.id, providerId: mockProvider.id, externalMerchantId, onboardingStatus: "ACTIVE", verificationStatus: "VERIFIED", payoutStatus: "READY", capabilities: mockCapabilities, lastVerifiedAt: new Date() },
    });
  }

  const semiAutomatedSuppliers = new Set([demoSupplier.id, paymentSuppliers[2]?.id, paymentSuppliers[4]?.id].filter((value): value is string => Boolean(value)));
  for (const organization of paymentSuppliers) {
    const currentProfile = await prisma.supplierProfile.findUnique({ where: { organizationId: organization.id } });
    const currentDetails = currentProfile?.regulatoryDetails && typeof currentProfile.regulatoryDetails === "object" && !Array.isArray(currentProfile.regulatoryDetails) ? currentProfile.regulatoryDetails as Record<string, unknown> : {};
    await prisma.supplierProfile.update({ where: { organizationId: organization.id }, data: { regulatoryDetails: { ...currentDetails, demoOnly: true, bankName: "Демо Банк Казахстан", iban: `KZ00DEMO${organization.bin}`, bik: "DEMO0000" } } });
    await prisma.organizationFeature.upsert({
      where: { organizationId_featureKey: { organizationId: organization.id, featureKey: "commerce.profile" } },
      update: { enabled: true, source: "SEED_PILOT", limits: { tier: semiAutomatedSuppliers.has(organization.id) ? "BASIC" : organization.id === paymentSuppliers[3]?.id ? "ENTERPRISE" : "BASIC", operatingMode: semiAutomatedSuppliers.has(organization.id) ? "SEMI_AUTOMATED" : organization.id === paymentSuppliers[3]?.id ? "AUTOMATED" : "MANUAL", integration: semiAutomatedSuppliers.has(organization.id) ? "EXCEL_PDF" : organization.id === paymentSuppliers[3]?.id ? "ERP_WMS_EDO" : "NONE", paymentMethods: ["CARD", "BANK_TRANSFER", "INVOICE"], bankAddOnEnabled: false } },
      create: { organizationId: organization.id, featureKey: "commerce.profile", enabled: true, source: "SEED_PILOT", limits: { tier: semiAutomatedSuppliers.has(organization.id) ? "BASIC" : organization.id === paymentSuppliers[3]?.id ? "ENTERPRISE" : "BASIC", operatingMode: semiAutomatedSuppliers.has(organization.id) ? "SEMI_AUTOMATED" : organization.id === paymentSuppliers[3]?.id ? "AUTOMATED" : "MANUAL", integration: semiAutomatedSuppliers.has(organization.id) ? "EXCEL_PDF" : organization.id === paymentSuppliers[3]?.id ? "ERP_WMS_EDO" : "NONE", paymentMethods: ["CARD", "BANK_TRANSFER", "INVOICE"], bankAddOnEnabled: false } },
    });
  }

  const geoByCityCode: Record<string, { latitude: number; longitude: number }> = {
    ALMATY: { latitude: 43.238949, longitude: 76.889709 },
    ASTANA: { latitude: 51.169392, longitude: 71.449074 },
    SHYMKENT: { latitude: 42.3417, longitude: 69.5901 },
    KARAGANDA: { latitude: 49.806, longitude: 73.085 },
    PAVLODAR: { latitude: 52.2873, longitude: 76.9674 },
  };
  for (const [cityCode, point] of Object.entries(geoByCityCode)) {
    const city = cities.get(cityCode);
    if (city) await prisma.warehouse.updateMany({ where: { cityId: city.id }, data: { ...point, geoStatus: "VERIFIED", geoMethod: "OPERATOR", geoEvidence: { source: "seed_pilot_map", cityCode }, geoVerifiedAt: new Date(), geoVerifiedById: operatorUser.id } });
  }
  const pavlodar = await prisma.city.findUniqueOrThrow({ where: { regionId_code: { regionId: (await prisma.region.findUniqueOrThrow({ where: { countryId_code: { countryId: kazakhstan.id, code: "PAV" } } })).id, code: "PAVLODAR" } }, include: { region: true } });
  const buyerAddress = await prisma.address.upsert({
    where: { id: fixedId(503) },
    update: { organizationId: demoBuyer.id, countryId: kazakhstan.id, regionId: pavlodar.regionId, cityId: pavlodar.id, line1: "Павлодар, ул. Академика Сатпаева, 48", district: "Центральный", latitude: geoByCityCode.PAVLODAR!.latitude, longitude: geoByCityCode.PAVLODAR!.longitude, geoStatus: "VERIFIED", geoMethod: "ORGANIZATION_DETAILS", geoEvidence: { source: "seed_pilot_details" }, geoVerifiedAt: new Date(), geoVerifiedById: operatorUser.id },
    create: { id: fixedId(503), organizationId: demoBuyer.id, countryId: kazakhstan.id, regionId: pavlodar.regionId, cityId: pavlodar.id, line1: "Павлодар, ул. Академика Сатпаева, 48", district: "Центральный", latitude: geoByCityCode.PAVLODAR!.latitude, longitude: geoByCityCode.PAVLODAR!.longitude, geoStatus: "VERIFIED", geoMethod: "ORGANIZATION_DETAILS", geoEvidence: { source: "seed_pilot_details" }, geoVerifiedAt: new Date(), geoVerifiedById: operatorUser.id },
  });
  await prisma.organizationFeature.upsert({ where: { organizationId_featureKey: { organizationId: demoBuyer.id, featureKey: "trust.smart-commerce" } }, update: { enabled: true, source: "SEED_PILOT" }, create: { organizationId: demoBuyer.id, featureKey: "trust.smart-commerce", enabled: true, source: "SEED_PILOT" } });

  const multiSupplierCartId = fixedId(700);
  const multiSupplierCheckoutId = fixedId(701);
  const multiSupplierPaymentIntentId = fixedId(702);
  const multiSupplierItems = [
    { offer: demoOffer, warehouse: demoWarehouse, quantity: 1 },
    { offer: secondOffer, warehouse: secondWarehouse, quantity: 1 },
    { offer: dentistryOffers[2]!, warehouse: supplierThree.warehouse, quantity: 2 },
    { offer: dentistryOffers[4]!, warehouse: supplierFour.warehouse, quantity: 1 },
    { offer: dentistryOffers[5]!, warehouse: supplierFive.warehouse, quantity: 1 },
  ];
  const multiSupplierCart = await prisma.cart.upsert({ where: { id: multiSupplierCartId }, update: { buyerOrganizationId: demoBuyer.id, currency: "KZT", status: "CHECKED_OUT", version: 1 }, create: { id: multiSupplierCartId, buyerOrganizationId: demoBuyer.id, currency: "KZT", status: "CHECKED_OUT", version: 1 } });
  const seededCartItems: Array<{ id: string; offer: typeof demoOffer; warehouse: typeof demoWarehouse; quantity: number; unitPriceMinor: number; totalPriceMinor: number; inventory: { id: string; quantityAvailable: number } }> = [];
  for (let index = 0; index < multiSupplierItems.length; index += 1) {
    const item = multiSupplierItems[index]!;
    const price = await prisma.offerPrice.findFirstOrThrow({ where: { offerId: item.offer.id, status: "ACTIVE" }, orderBy: { validFrom: "desc" } });
    const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { offerId: item.offer.id, warehouseId: item.warehouse.id } });
    const cartItem = await prisma.cartItem.upsert({ where: { cartId_offerId: { cartId: multiSupplierCart.id, offerId: item.offer.id } }, update: { quantity: item.quantity, unitPriceMinor: price.amountMinor, totalPriceMinor: Number(price.amountMinor) * item.quantity, currency: "KZT", priceSource: "SEED_PILOT", pricingSnapshot: { source: "SEED_PILOT", supplierOrganizationId: item.offer.supplierOrganizationId } }, create: { id: fixedId(710 + index), cartId: multiSupplierCart.id, offerId: item.offer.id, quantity: item.quantity, unitPriceMinor: price.amountMinor, totalPriceMinor: Number(price.amountMinor) * item.quantity, currency: "KZT", priceSource: "SEED_PILOT", pricingSnapshot: { source: "SEED_PILOT", supplierOrganizationId: item.offer.supplierOrganizationId } } });
    seededCartItems.push({ id: cartItem.id, offer: item.offer, warehouse: item.warehouse, quantity: item.quantity, unitPriceMinor: Number(price.amountMinor), totalPriceMinor: Number(price.amountMinor) * item.quantity, inventory: { id: balance.id, quantityAvailable: Number(balance.quantityAvailable) } });
  }
  const multiSupplierTotal = seededCartItems.reduce((sum, item) => sum + item.totalPriceMinor, 0);
  const multiSupplierCheckout = await prisma.checkout.upsert({ where: { id: multiSupplierCheckoutId }, update: { cartId: multiSupplierCart.id, buyerOrganizationId: demoBuyer.id, totalAmountMinor: multiSupplierTotal, currency: "KZT", status: "COMPLETED", idempotencyKey: "seed-five-supplier-checkout", pricingSnapshot: { scenario: "five_suppliers_three_semi_automated" } }, create: { id: multiSupplierCheckoutId, cartId: multiSupplierCart.id, buyerOrganizationId: demoBuyer.id, totalAmountMinor: multiSupplierTotal, currency: "KZT", status: "COMPLETED", idempotencyKey: "seed-five-supplier-checkout", pricingSnapshot: { scenario: "five_suppliers_three_semi_automated" } } });
  const seededOrders: Array<{ id: string; supplierOrganizationId: string; subtotalAmountMinor: number }> = [];
  for (let index = 0; index < seededCartItems.length; index += 1) {
    const item = seededCartItems[index]!;
    const order = await prisma.supplierOrder.upsert({ where: { checkoutId_supplierOrganizationId: { checkoutId: multiSupplierCheckout.id, supplierOrganizationId: item.offer.supplierOrganizationId } }, update: { status: "CONFIRMED", paymentStatus: "PROCESSING", subtotalAmountMinor: item.totalPriceMinor, currency: "KZT", transactionMode: index === 3 ? "FRAMEWORK_AGREEMENT" : "ONE_TIME" }, create: { id: fixedId(720 + index), checkoutId: multiSupplierCheckout.id, supplierOrganizationId: item.offer.supplierOrganizationId, buyerOrganizationId: demoBuyer.id, orderNumber: `SO-SEED-5SUP-${String(index + 1).padStart(2, "0")}`, status: "CONFIRMED", paymentStatus: "PROCESSING", subtotalAmountMinor: item.totalPriceMinor, currency: "KZT", transactionMode: index === 3 ? "FRAMEWORK_AGREEMENT" : "ONE_TIME" } });
    await prisma.supplierOrderItem.upsert({ where: { cartItemId: item.id }, update: { supplierOrderId: order.id, offerId: item.offer.id, productVariantId: item.offer.productVariantId, warehouseId: item.warehouse.id, quantity: item.quantity, acceptedQuantity: item.quantity, unitPriceMinor: item.unitPriceMinor, totalPriceMinor: item.totalPriceMinor, currency: "KZT", status: "CONFIRMED", offerSnapshot: { seeded: true, supplierOrganizationId: item.offer.supplierOrganizationId }, inventorySnapshot: { balanceId: item.inventory.id, quantityAvailable: item.inventory.quantityAvailable } }, create: { id: fixedId(730 + index), supplierOrderId: order.id, cartItemId: item.id, offerId: item.offer.id, productVariantId: item.offer.productVariantId, warehouseId: item.warehouse.id, quantity: item.quantity, acceptedQuantity: item.quantity, unitPriceMinor: item.unitPriceMinor, totalPriceMinor: item.totalPriceMinor, currency: "KZT", status: "CONFIRMED", offerSnapshot: { seeded: true, supplierOrganizationId: item.offer.supplierOrganizationId }, inventorySnapshot: { balanceId: item.inventory.id, quantityAvailable: item.inventory.quantityAvailable } } });
    seededOrders.push({ id: order.id, supplierOrganizationId: order.supplierOrganizationId, subtotalAmountMinor: item.totalPriceMinor });
  }
  const seededPaymentIntent = await prisma.paymentIntent.upsert({ where: { id: multiSupplierPaymentIntentId }, update: { checkoutId: multiSupplierCheckout.id, buyerOrganizationId: demoBuyer.id, providerId: mockProvider.id, paymentMethod: "INVOICE", totalAmountMinor: multiSupplierTotal, currency: "KZT", status: "PENDING", idempotencyKey: "seed-five-supplier-invoice" }, create: { id: multiSupplierPaymentIntentId, checkoutId: multiSupplierCheckout.id, buyerOrganizationId: demoBuyer.id, providerId: mockProvider.id, paymentMethod: "INVOICE", totalAmountMinor: multiSupplierTotal, currency: "KZT", status: "PENDING", idempotencyKey: "seed-five-supplier-invoice", expiresAt: new Date(Date.now() + 30 * 60 * 1_000) } });
  const seededInvoices: Array<ReturnType<typeof buildInvoiceDraft>> = [];
  for (const order of seededOrders) {
    const allocation = await prisma.paymentAllocation.upsert({ where: { supplierOrderId: order.id }, update: { paymentIntentId: seededPaymentIntent.id, recipientOrganizationId: order.supplierOrganizationId, grossAmountMinor: order.subtotalAmountMinor, platformFeeMinor: Math.floor(order.subtotalAmountMinor * 0.02), netAmountMinor: order.subtotalAmountMinor - Math.floor(order.subtotalAmountMinor * 0.02), status: "PENDING", merchantAccountId: null }, create: { id: fixedId(740 + seededInvoices.length), paymentIntentId: seededPaymentIntent.id, supplierOrderId: order.id, recipientOrganizationId: order.supplierOrganizationId, grossAmountMinor: order.subtotalAmountMinor, platformFeeMinor: Math.floor(order.subtotalAmountMinor * 0.02), netAmountMinor: order.subtotalAmountMinor - Math.floor(order.subtotalAmountMinor * 0.02), status: "PENDING" } });
    const supplier = await prisma.organization.findUniqueOrThrow({ where: { id: order.supplierOrganizationId }, include: { supplierProfile: true } });
    const details = supplier.supplierProfile?.regulatoryDetails as { bankName?: string; iban?: string; bik?: string } | null;
    seededInvoices.push(buildInvoiceDraft({ paymentIntentId: seededPaymentIntent.id, paymentAllocationId: allocation.id, supplierOrderId: order.id, amountMinor: order.subtotalAmountMinor.toString(), currency: "KZT", bankDetails: details?.bankName && details.iban && details.bik ? { bankName: details.bankName, iban: details.iban, bik: details.bik, beneficiary: supplier.legalName } : undefined }));
  }
  await prisma.paymentSession.upsert({ where: { paymentIntentId_idempotencyKey: { paymentIntentId: seededPaymentIntent.id, idempotencyKey: "seed-five-supplier-invoice-session" } }, update: { status: "ACTIVE", externalSessionId: `invoice_${seededPaymentIntent.id}`, responsePayload: { type: "BANK_TRANSFER_INVOICE", paymentMethod: "INVOICE", status: "AWAITING_BANK_TRANSFER", invoices: seededInvoices } }, create: { paymentIntentId: seededPaymentIntent.id, externalSessionId: `invoice_${seededPaymentIntent.id}`, status: "ACTIVE", idempotencyKey: "seed-five-supplier-invoice-session", requestPayload: { scenario: "five_suppliers_three_semi_automated" }, responsePayload: { type: "BANK_TRANSFER_INVOICE", paymentMethod: "INVOICE", status: "AWAITING_BANK_TRANSFER", invoices: seededInvoices } } });

  const metricCodes = ["availability_accuracy", "price_accuracy", "order_fulfillment", "confirmation_speed", "delivery_ontime", "document_quality", "communication_quality", "data_freshness", "dispute_resolution"] as const;
  for (let supplierIndex = 0; supplierIndex < paymentSuppliers.length; supplierIndex += 1) {
    const organization = paymentSuppliers[supplierIndex]!;
    const events = [];
    for (let metricIndex = 0; metricIndex < metricCodes.length; metricIndex += 1) {
      const metricCode = metricCodes[metricIndex]!;
      const value = Math.max(0.62, 0.96 - supplierIndex * 0.035 - (metricIndex % 3) * 0.025);
      const event = await prisma.supplierTrustMetricEvent.upsert({
        where: { supplierOrganizationId_metricCode_sourceEntityType_sourceEntityId: { supplierOrganizationId: organization.id, metricCode, sourceEntityType: "SEED_PILOT", sourceEntityId: `${organization.id}:${metricCode}` } },
        update: { value, weight: 4, occurredAt: new Date(), disputed: false, excludedAt: null, metadata: { scenario: "verified_pilot_execution" } },
        create: { supplierOrganizationId: organization.id, metricCode, value, weight: 4, sourceEntityType: "SEED_PILOT", sourceEntityId: `${organization.id}:${metricCode}`, occurredAt: new Date(), metadata: { scenario: "verified_pilot_execution" } },
      });
      events.push(event);
    }
    const trust = calculateSupplierTrust(events.map((event) => ({ metricCode: event.metricCode, value: Number(event.value), weight: Number(event.weight), occurredAt: event.occurredAt })));
    await prisma.supplierTrustSnapshot.upsert({ where: { supplierOrganizationId: organization.id }, update: { ...trust, indicators: trust.indicators, factors: trust.factors, recommendations: trust.recommendations, reviewCount: 0, computedAt: new Date() }, create: { supplierOrganizationId: organization.id, ...trust, indicators: trust.indicators, factors: trust.factors, recommendations: trust.recommendations, reviewCount: 0 } });
  }
  await prisma.productGapIncident.upsert({
    where: { idempotencyKey: "seed-unreliable-stock-ortho" },
    update: { impactedOrganizationId: secondSupplier.id, status: "SOFT_ACTION_ACTIVE", actionType: "REQUIRE_CONFIRMATION", explanation: "В пилотном сценарии ручной остаток требует подтверждения перед заказом.", remediation: "Подтвердить остаток в кабинете или подключить регулярную синхронизацию.", restorationCondition: "Три последовательных обновления остатка без расхождений." },
    create: { ownerOrganizationId: operatorOrganization.id, impactedOrganizationId: secondSupplier.id, subjectType: "Organization", subjectId: secondSupplier.id, type: "UNRELIABLE_STOCK", severity: "MEDIUM", status: "SOFT_ACTION_ACTIVE", reasonCode: "manual_stock_confirmation", explanation: "В пилотном сценарии ручной остаток требует подтверждения перед заказом.", actionType: "REQUIRE_CONFIRMATION", remediation: "Подтвердить остаток в кабинете или подключить регулярную синхронизацию.", restorationCondition: "Три последовательных обновления остатка без расхождений.", sourceEntityType: "SEED_PILOT", sourceEntityId: secondSupplier.id, createdById: operatorUser.id, idempotencyKey: "seed-unreliable-stock-ortho" },
  });

  const agreementTemplate = await prisma.documentTemplate.findUniqueOrThrow({ where: { code_version: { code: "MARKETPLACE_SUPPLIER_AGREEMENT_RU", version: 1 } } });
  const agreementPdf = await PDFDocument.create();
  const agreementPage = agreementPdf.addPage([595, 842]);
  const agreementFont = await agreementPdf.embedFont(StandardFonts.Helvetica);
  agreementPage.drawText("DentMarket KZ marketplace supplier agreement", { x: 54, y: 780, size: 16, font: agreementFont });
  agreementPage.drawText("Signed with EDS by marketplace operator and supplier. Annual auto-renewal.", { x: 54, y: 748, size: 10, font: agreementFont });
  const agreementBytes = Buffer.from(await agreementPdf.save());
  const agreementChecksum = createHash("sha256").update(agreementBytes).digest("hex");
  const agreementStorageRoot = process.env.LOCAL_STORAGE_PATH ?? ".local-storage";
  const agreementStart = new Date();
  const agreementEnd = new Date(agreementStart); agreementEnd.setUTCFullYear(agreementEnd.getUTCFullYear() + 1);
  for (let index = 0; index < paymentSuppliers.length; index += 1) {
    const organization = paymentSuppliers[index]!;
    const agreementNumber = `DMA-SEED-${organization.bin}`;
    const storageKey = `agreements/${organization.id}/${agreementNumber}.pdf`;
    const storagePath = join(agreementStorageRoot, storageKey);
    await mkdir(dirname(storagePath), { recursive: true });
    await writeFile(storagePath, agreementBytes);
    const document = await prisma.document.upsert({
      where: { ownerOrganizationId_documentNumber_version: { ownerOrganizationId: organization.id, documentNumber: agreementNumber, version: 1 } },
      update: {},
      create: { id: fixedId(300 + index * 4), ownerOrganizationId: organization.id, templateId: agreementTemplate.id, kind: "MARKETPLACE_SUPPLIER_AGREEMENT", format: "PDF", source: "GENERATED", status: "SIGNED", title: "Договор с платформой DentMarket KZ", documentNumber: agreementNumber, version: 1, storageKey, fileName: `${agreementNumber}.pdf`, contentType: "application/pdf", byteSize: agreementBytes.byteLength, checksumSha256: agreementChecksum, templateSnapshot: { id: agreementTemplate.id, code: agreementTemplate.code, version: agreementTemplate.version }, dataSnapshot: { supplierOrganizationId: organization.id, operatorOrganizationId: operatorOrganization.id, annualAutoRenewal: true }, requiredSignatureCount: 2, generatedAt: agreementStart, immutableAt: agreementStart, expiresAt: agreementEnd, metadata: { seeded: true, agreementType: "marketplace_supplier" } },
    });
    for (const [partyIndex, party] of [organization, operatorOrganization].entries()) {
      const existingSignature = await prisma.documentSignature.findFirst({ where: { documentId: document.id, signerOrganizationId: party.id, method: "EDS", status: "SIGNED" } });
      if (!existingSignature) await prisma.documentSignature.create({ data: { id: fixedId(301 + index * 4 + partyIndex), documentId: document.id, signerOrganizationId: party.id, signerUserId: party.id === operatorOrganization.id ? operatorUser.id : null, signerName: party.legalName, method: "EDS", status: "SIGNED", externalSessionId: `seed-eds-session-${party.id}`, externalSignatureId: `seed-eds-signature-${party.id}`, signatureHash: createHash("sha256").update(`${agreementChecksum}:${party.id}`).digest("hex"), signedAt: agreementStart, expiresAt: agreementEnd, evidence: { provider: "seed-qualified-eds", certificateVerified: true } } });
    }
    await prisma.marketplaceAgreement.upsert({ where: { documentId: document.id }, update: {}, create: { id: fixedId(303 + index * 4), agreementNumber, supplierOrganizationId: organization.id, operatorOrganizationId: operatorOrganization.id, documentId: document.id, templateId: agreementTemplate.id, templateVersion: agreementTemplate.version, status: "ACTIVE", renewalMode: "AUTO_ANNUAL", startsAt: agreementStart, endsAt: agreementEnd, autoRenew: true, activatedAt: agreementStart, activatedBySystem: false, metadata: { seeded: true } } });
  }
  console.info(JSON.stringify({ demoBuyerOrganizationId: demoBuyer.id, demoBuyerAddressId: buyerAddress.id, demoOfferIds: [demoOffer.id, secondOffer.id, ...dentistryOffers.map(({ id }) => id)], suppliers: paymentSuppliers.length, cities: cities.size, paymentProvider: "MOCK", multiSupplierDemo: { cartId: multiSupplierCart.id, checkoutId: multiSupplierCheckout.id, paymentIntentId: seededPaymentIntent.id, supplierCount: seededOrders.length, semiAutomatedSupplierCount: [...semiAutomatedSuppliers].filter((id) => seededOrders.some((order) => order.supplierOrganizationId === id)).length, invoiceCount: seededInvoices.length } , trustSnapshots: paymentSuppliers.length }, null, 2));
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

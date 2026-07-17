import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateAttributeDefinitionInput, CreateCategoryInput, CreateProductInput, CreateVariantInput, UpdateProductInput, UpsertCategoryAttributeRuleInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

type ActorContext = { actorId: string; organizationId: string };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  attributes() {
    return this.prisma.attributeDefinition.findMany({ include: { group: true, unit: true, options: true }, orderBy: { nameRu: "asc" } });
  }

  createAttribute(input: CreateAttributeDefinitionInput, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const attribute = await tx.attributeDefinition.create({ data: { ...input, groupId: input.groupId ?? null, unitId: input.unitId ?? null, validation: input.validation ? input.validation as Prisma.InputJsonValue : undefined } });
      await tx.auditLog.create({ data: { ...context, action: "catalog.attribute.created", entityType: "AttributeDefinition", entityId: attribute.id, after: attribute } });
      await tx.outboxEvent.create({ data: { aggregateType: "AttributeDefinition", aggregateId: attribute.id, eventType: "AttributeDefinitionCreated", payload: { attributeId: attribute.id } } });
      return attribute;
    });
  }

  categories() {
    return this.prisma.category.findMany({ orderBy: [{ industryId: "asc" }, { path: "asc" }] });
  }

  industries() {
    return this.prisma.industry.findMany({ where: { status: "ACTIVE" }, orderBy: { nameRu: "asc" } });
  }

  units() {
    return this.prisma.unitOfMeasure.findMany({ orderBy: { nameRu: "asc" } });
  }

  categoryAttributeRules(categoryId: string) {
    return this.prisma.categoryAttributeRule.findMany({
      where: { categoryId },
      include: { attribute: { include: { group: true, unit: true, options: true } } },
      orderBy: [{ sortOrder: "asc" }, { attribute: { nameRu: "asc" } }],
    });
  }

  async upsertCategoryAttributeRule(categoryId: string, input: UpsertCategoryAttributeRuleInput, context: ActorContext) {
    const [category, attribute] = await Promise.all([
      this.prisma.category.findUnique({ where: { id: categoryId } }),
      this.prisma.attributeDefinition.findUnique({ where: { id: input.attributeId } }),
    ]);
    if (!category) throw new NotFoundException("Category not found");
    if (!attribute) throw new NotFoundException("Attribute definition not found");
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.categoryAttributeRule.upsert({
        where: { categoryId_attributeId: { categoryId, attributeId: input.attributeId } },
        update: { isRequired: input.isRequired, isVariant: input.isVariant, sortOrder: input.sortOrder, overrides: input.overrides ? input.overrides as Prisma.InputJsonValue : Prisma.JsonNull },
        create: { categoryId, attributeId: input.attributeId, isRequired: input.isRequired, isVariant: input.isVariant, sortOrder: input.sortOrder, overrides: input.overrides ? input.overrides as Prisma.InputJsonValue : undefined },
        include: { attribute: true },
      });
      await tx.auditLog.create({ data: { ...context, action: "catalog.category.attribute_rule.upserted", entityType: "Category", entityId: categoryId, after: rule } });
      await tx.outboxEvent.create({ data: { aggregateType: "Category", aggregateId: categoryId, eventType: "CategoryAttributeRuleChanged", payload: { categoryId, attributeId: input.attributeId } } });
      return rule;
    });
  }

  async removeCategoryAttributeRule(categoryId: string, attributeId: string, context: ActorContext) {
    const rule = await this.prisma.categoryAttributeRule.findUnique({ where: { categoryId_attributeId: { categoryId, attributeId } } });
    if (!rule) throw new NotFoundException("Category attribute rule not found");
    return this.prisma.$transaction(async (tx) => {
      await tx.categoryAttributeRule.delete({ where: { categoryId_attributeId: { categoryId, attributeId } } });
      await tx.auditLog.create({ data: { ...context, action: "catalog.category.attribute_rule.removed", entityType: "Category", entityId: categoryId, before: rule } });
      await tx.outboxEvent.create({ data: { aggregateType: "Category", aggregateId: categoryId, eventType: "CategoryAttributeRuleRemoved", payload: { categoryId, attributeId } } });
      return { categoryId, attributeId, removed: true };
    });
  }

  async createCategory(input: CreateCategoryInput, context: ActorContext) {
    const parent = input.parentId ? await this.prisma.category.findUnique({ where: { id: input.parentId } }) : null;
    if (input.parentId && !parent) throw new NotFoundException("Parent category not found");
    if (parent && parent.industryId !== input.industryId) throw new NotFoundException("Parent category belongs to another industry");
    const path = parent ? `${parent.path}.${input.code}` : input.code;
    const depth = parent ? parent.depth + 1 : 0;

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({ data: { ...input, parentId: input.parentId ?? null, path, depth } });
      await tx.auditLog.create({ data: { ...context, action: "catalog.category.created", entityType: "Category", entityId: category.id, after: category } });
      await tx.outboxEvent.create({ data: { aggregateType: "Category", aggregateId: category.id, eventType: "CategoryCreated", payload: { categoryId: category.id } } });
      return category;
    });
  }

  products() {
    return this.prisma.product.findMany({
      include: { brand: true, manufacturer: true, attributeValues: { include: { attribute: true } }, variants: { include: { attributeValues: { include: { attribute: true } } } }, categories: { include: { category: true } }, industries: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  createProduct(input: CreateProductInput, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          canonicalName: input.canonicalName,
          slug: input.slug,
          productType: input.productType,
          brandId: input.brandId ?? null,
          manufacturerId: input.manufacturerId ?? null,
          manufacturerSku: input.manufacturerSku ?? null,
          gtin: input.gtin ?? null,
          baseUnitId: input.baseUnitId ?? null,
          industries: { create: input.industryIds.map((industryId) => ({ industryId })) },
          categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
          searchDocument: { create: { searchableText: input.canonicalName, normalizedText: input.canonicalName.toLocaleLowerCase("ru"), facets: {} } },
        },
        include: { categories: true, industries: true, searchDocument: true },
      });
      await tx.auditLog.create({ data: { ...context, action: "catalog.product.created", entityType: "Product", entityId: product.id, after: product } });
      await tx.outboxEvent.create({ data: { aggregateType: "Product", aggregateId: product.id, eventType: "ProductCreated", payload: { productId: product.id } } });
      return product;
    });
  }

  async updateProduct(productId: string, input: UpdateProductInput, context: ActorContext) {
    const current = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!current) throw new NotFoundException("Product not found");
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.product.updateMany({
        where: { id: productId, version: input.version },
        data: {
          canonicalName: input.canonicalName,
          productType: input.productType,
          regulatoryClass: input.regulatoryClass,
          status: input.status,
          manufacturerSku: input.manufacturerSku,
          gtin: input.gtin,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException("Product changed; reload the latest version");
      if (input.canonicalName) {
        await tx.productSearchDocument.updateMany({
          where: { productId },
          data: { searchableText: input.canonicalName, normalizedText: input.canonicalName.toLocaleLowerCase("ru"), projectionVersion: { increment: 1 } },
        });
      }
      const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      await tx.auditLog.create({ data: { ...context, action: "catalog.product.updated", entityType: "Product", entityId: product.id, before: current, after: product } });
      await tx.outboxEvent.create({ data: { aggregateType: "Product", aggregateId: product.id, eventType: "ProductUpdated", payload: { productId: product.id, version: product.version } } });
      return product;
    });
  }

  async createVariant(productId: string, input: CreateVariantInput, context: ActorContext) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Product not found");
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: { productId, sku: input.sku ?? null, gtin: input.gtin ?? null, saleUnitId: input.saleUnitId ?? null, packageQuantity: input.packageQuantity ?? null },
      });
      await tx.auditLog.create({ data: { ...context, action: "catalog.variant.created", entityType: "ProductVariant", entityId: variant.id, after: variant } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductVariant", aggregateId: variant.id, eventType: "ProductVariantCreated", payload: { productId, variantId: variant.id } } });
      return variant;
    });
  }
}

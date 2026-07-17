import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SetAttributeValueInput } from "@marketplace/schemas";
import { AttributeValueType, Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

type ActorContext = { actorId: string; organizationId: string };

@Injectable()
export class AttributeValuesService {
  constructor(private readonly prisma: PrismaService) {}

  typedData(valueType: AttributeValueType, value: SetAttributeValueInput["value"]): Prisma.ProductAttributeValueUncheckedUpdateInput {
    const data: Prisma.ProductAttributeValueUncheckedUpdateInput = {
      valueText: null,
      valueInteger: null,
      valueDecimal: null,
      valueBoolean: null,
      valueDate: null,
      valueOptionId: null,
      valueOptionIds: Prisma.JsonNull,
      rangeMin: null,
      rangeMax: null,
      unitId: null,
    };
    if ((valueType === "TEXT" || valueType === "LONG_TEXT") && typeof value === "string") data.valueText = value;
    else if (valueType === "INTEGER" && typeof value === "number" && Number.isInteger(value)) data.valueInteger = BigInt(value);
    else if (valueType === "DECIMAL" && typeof value === "number") data.valueDecimal = value;
    else if (valueType === "BOOLEAN" && typeof value === "boolean") data.valueBoolean = value;
    else if ((valueType === "DATE" || valueType === "DATETIME") && typeof value === "string" && !Number.isNaN(Date.parse(value))) data.valueDate = new Date(value);
    else if (valueType === "OPTION" && typeof value === "object" && "optionId" in value) data.valueOptionId = value.optionId;
    else if (valueType === "MULTI_OPTION" && typeof value === "object" && "optionIds" in value) data.valueOptionIds = value.optionIds;
    else if (valueType === "RANGE" && typeof value === "object" && "min" in value && "max" in value) { data.rangeMin = value.min; data.rangeMax = value.max; }
    else if (valueType === "NUMBER_WITH_UNIT" && typeof value === "object" && "amount" in value && "unitId" in value) { data.valueDecimal = value.amount; data.unitId = value.unitId; }
    else throw new BadRequestException(`Value does not match attribute type ${valueType}`);
    return data;
  }

  async setProductValue(productId: string, input: SetAttributeValueInput, context: ActorContext) {
    const [product, attribute] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId } }),
      this.prisma.attributeDefinition.findUnique({ where: { id: input.attributeId } }),
    ]);
    if (!product) throw new NotFoundException("Product not found");
    if (!attribute) throw new NotFoundException("Attribute definition not found");
    const data = this.typedData(attribute.valueType, input.value);
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.productAttributeValue.upsert({
        where: { productId_attributeId: { productId, attributeId: input.attributeId } },
        update: data,
        create: { productId, attributeId: input.attributeId, ...data } as Prisma.ProductAttributeValueUncheckedCreateInput,
      });
      await tx.auditLog.create({ data: { ...context, action: "catalog.product.attribute.set", entityType: "Product", entityId: productId, after: { attributeId: input.attributeId, value: input.value } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Product", aggregateId: productId, eventType: "ProductAttributeChanged", payload: { productId, attributeId: input.attributeId } } });
      return stored;
    });
  }

  async setVariantValue(variantId: string, input: SetAttributeValueInput, context: ActorContext) {
    const [variant, attribute] = await Promise.all([
      this.prisma.productVariant.findUnique({ where: { id: variantId } }),
      this.prisma.attributeDefinition.findUnique({ where: { id: input.attributeId } }),
    ]);
    if (!variant) throw new NotFoundException("Product variant not found");
    if (!attribute) throw new NotFoundException("Attribute definition not found");
    const data = this.typedData(attribute.valueType, input.value);
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.variantAttributeValue.upsert({
        where: { variantId_attributeId: { variantId, attributeId: input.attributeId } },
        update: data,
        create: { variantId, attributeId: input.attributeId, ...data } as Prisma.VariantAttributeValueUncheckedCreateInput,
      });
      await tx.auditLog.create({ data: { ...context, action: "catalog.variant.attribute.set", entityType: "ProductVariant", entityId: variantId, after: { attributeId: input.attributeId, value: input.value } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductVariant", aggregateId: variantId, eventType: "VariantAttributeChanged", payload: { variantId, attributeId: input.attributeId } } });
      return stored;
    });
  }
}

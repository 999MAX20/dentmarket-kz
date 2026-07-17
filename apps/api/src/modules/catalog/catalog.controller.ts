import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createAttributeDefinitionSchema, createCategorySchema, createProductPackagingSchema, createProductSchema, createVariantSchema, setAttributeValueSchema, updateProductSchema, upsertCategoryAttributeRuleSchema } from "@marketplace/schemas";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { CatalogService } from "./catalog.service";
import { AttributeValuesService } from "./attribute-values.service";
import { PackagingService } from "./packaging.service";

@ApiTags("catalog")
@UseGuards(PermissionsGuard)
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly attributeValues: AttributeValuesService, private readonly packaging: PackagingService) {}

  @Get("attributes")
  @RequirePermissions("catalog.product.view")
  attributes() {
    return this.catalog.attributes();
  }

  @Post("attributes")
  @RequirePermissions("catalog.attribute.manage")
  createAttribute(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createAttributeDefinitionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.catalog.createAttribute(parsed.data, { actorId, organizationId });
  }

  @Get("categories")
  @RequirePermissions("catalog.product.view")
  categories() {
    return this.catalog.categories();
  }

  @Get("industries")
  @RequirePermissions("catalog.product.view")
  industries() {
    return this.catalog.industries();
  }

  @Get("units")
  @RequirePermissions("catalog.product.view")
  units() {
    return this.catalog.units();
  }

  @Post("categories")
  @RequirePermissions("catalog.category.manage")
  createCategory(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.catalog.createCategory(parsed.data, { actorId, organizationId });
  }

  @Get("categories/:categoryId/attribute-rules")
  @RequirePermissions("catalog.product.view")
  categoryAttributeRules(@Param("categoryId") categoryId: string) {
    return this.catalog.categoryAttributeRules(categoryId);
  }

  @Put("categories/:categoryId/attribute-rules")
  @RequirePermissions("catalog.attribute.manage")
  upsertCategoryAttributeRule(@Param("categoryId") categoryId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = upsertCategoryAttributeRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.catalog.upsertCategoryAttributeRule(categoryId, parsed.data, { actorId, organizationId });
  }

  @Delete("categories/:categoryId/attribute-rules/:attributeId")
  @RequirePermissions("catalog.attribute.manage")
  removeCategoryAttributeRule(@Param("categoryId") categoryId: string, @Param("attributeId") attributeId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.catalog.removeCategoryAttributeRule(categoryId, attributeId, { actorId, organizationId });
  }

  @Get("products")
  @RequirePermissions("catalog.product.view")
  products() {
    return this.catalog.products();
  }

  @Get("quality")
  @RequirePermissions("catalog.product.view")
  quality() {
    return this.catalog.qualityReport();
  }

  @Post("products")
  @RequirePermissions("catalog.product.create")
  createProduct(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.catalog.createProduct(parsed.data, { actorId, organizationId });
  }

  @Patch("products/:productId")
  @RequirePermissions("catalog.product.create")
  updateProduct(@Param("productId") productId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.catalog.updateProduct(productId, parsed.data, { actorId, organizationId });
  }

  @Post("products/:productId/variants")
  @RequirePermissions("catalog.product.create")
  createVariant(@Param("productId") productId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createVariantSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.catalog.createVariant(productId, parsed.data, { actorId, organizationId });
  }

  @Put("products/:productId/attributes")
  @RequirePermissions("catalog.product.create")
  setProductAttribute(@Param("productId") productId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = setAttributeValueSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.attributeValues.setProductValue(productId, parsed.data, { actorId, organizationId });
  }

  @Put("variants/:variantId/attributes")
  @RequirePermissions("catalog.product.create")
  setVariantAttribute(@Param("variantId") variantId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = setAttributeValueSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.attributeValues.setVariantValue(variantId, parsed.data, { actorId, organizationId });
  }

  @Get("variants/:variantId/packagings")
  @RequirePermissions("catalog.product.view")
  packagings(@Param("variantId") variantId: string) { return this.packaging.list(variantId); }

  @Post("variants/:variantId/packagings")
  @RequirePermissions("catalog.product.create")
  createPackaging(@Param("variantId") variantId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createProductPackagingSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.packaging.create(variantId, parsed.data, { actorId, organizationId });
  }
}

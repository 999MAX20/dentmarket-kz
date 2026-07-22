import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { addCartItemSchema, checkoutCartSchema, confirmSupplierOrderSchema, createCartSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { CommerceService } from "./commerce.service";

@ApiTags("commerce")
@UseGuards(PermissionsGuard)
@Controller()
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("buyers/:buyerOrganizationId/marketplace-offers")
  @RequirePermissions("order.create")
  marketplaceOffers(@Param("buyerOrganizationId") buyerOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.commerce.marketplaceOffers(buyerOrganizationId, this.context(actorId, organizationId));
  }

  @Get("buyers/:buyerOrganizationId/carts")
  @RequirePermissions("order.create")
  carts(@Param("buyerOrganizationId") buyerOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.commerce.carts(buyerOrganizationId, this.context(actorId, organizationId));
  }

  @Post("buyers/:buyerOrganizationId/carts")
  @RequirePermissions("order.create")
  createCart(@Param("buyerOrganizationId") buyerOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createCartSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.createCart(buyerOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("carts/:cartId/items")
  @RequirePermissions("order.create")
  addItem(@Param("cartId") cartId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = addCartItemSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.addItem(cartId, parsed.data, this.context(actorId, organizationId));
  }

  @Patch("carts/:cartId/items/:itemId")
  @RequirePermissions("order.create")
  updateItem(@Param("cartId") cartId: string, @Param("itemId") itemId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const quantity = Number((body as { quantity?: unknown } | null)?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestException("Quantity must be a positive integer");
    return this.commerce.updateItem(cartId, itemId, quantity, this.context(actorId, organizationId));
  }

  @Delete("carts/:cartId/items/:itemId")
  @RequirePermissions("order.create")
  removeItem(@Param("cartId") cartId: string, @Param("itemId") itemId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.commerce.removeItem(cartId, itemId, this.context(actorId, organizationId));
  }

  @Post("carts/:cartId/reprice")
  @RequirePermissions("order.create")
  reprice(@Param("cartId") cartId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.commerce.reprice(cartId, this.context(actorId, organizationId));
  }

  @Post("carts/:cartId/checkout")
  @RequirePermissions("order.create")
  checkout(@Param("cartId") cartId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = checkoutCartSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.checkout(cartId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("checkouts/:checkoutId")
  @RequirePermissions("order.create")
  getCheckout(@Param("checkoutId") checkoutId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.commerce.getCheckout(checkoutId, this.context(actorId, organizationId));
  }

  @Get("supplier-orders")
  @RequirePermissions("order.confirm")
  supplierOrders(@Query("checkoutId") checkoutId: string | undefined, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.commerce.supplierOrders(this.context(actorId, organizationId), checkoutId);
  }

  @Get("buyers/:buyerOrganizationId/orders")
  @RequirePermissions("order.create")
  buyerOrders(@Param("buyerOrganizationId") buyerOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.commerce.buyerOrders(buyerOrganizationId, this.context(actorId, organizationId));
  }

  @Post("supplier-orders/:orderId/confirm")
  @RequirePermissions("order.confirm")
  confirmSupplierOrder(@Param("orderId") orderId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = confirmSupplierOrderSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.confirmSupplierOrder(orderId, parsed.data, this.context(actorId, organizationId));
  }
}

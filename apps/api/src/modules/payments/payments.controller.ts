import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { authorizePaymentSchema, cancelPaymentIntentSchema, captureMockPaymentSchema, capturePaymentSchema, createPaymentIntentSchema, createPaymentSessionSchema, createRefundSchema, ledgerQuerySchema, onboardPaymentMerchantSchema, paymentOperationsQuerySchema, paymentReconciliationImportSchema, processPayoutSchema, requestPaymentMerchantChangeSchema, reviewPaymentMerchantChangeSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { PaymentsService } from "./payments.service";
import { PaymentMerchantService } from "./payment-merchant.service";
import { PaymentSettlementService } from "./payment-settlement.service";

@ApiTags("payments")
@UseGuards(PermissionsGuard)
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly merchants: PaymentMerchantService, private readonly settlement: PaymentSettlementService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Post("checkouts/:checkoutId/payment-intents")
  @RequirePermissions("payment.view")
  createIntent(@Param("checkoutId") checkoutId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createPaymentIntentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.payments.createIntent(checkoutId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("payment-intents/:paymentIntentId")
  @RequirePermissions("payment.view")
  getIntent(@Param("paymentIntentId") paymentIntentId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.payments.getIntent(paymentIntentId, this.context(actorId, organizationId));
  }

  @Post("payment-intents/:paymentIntentId/mock-capture")
  @RequirePermissions("payment.mock.capture")
  captureMock(@Param("paymentIntentId") paymentIntentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = captureMockPaymentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.payments.captureMock(paymentIntentId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("payment-providers")
  @RequirePermissions("payment.view")
  providers() { return this.merchants.providers(); }

  @Get("organizations/:organizationId/payment-merchant-accounts")
  @RequirePermissions("payment.view")
  merchantAccounts(@Param("organizationId") organizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    return this.merchants.accounts(organizationId, this.context(actorId, actorOrganizationId));
  }

  @Post("organizations/:organizationId/payment-merchant-accounts")
  @RequirePermissions("payment.merchant.manage")
  onboardMerchant(@Param("organizationId") organizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    const parsed = onboardPaymentMerchantSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.merchants.onboard(organizationId, parsed.data, this.context(actorId, actorOrganizationId));
  }

  @Post("organizations/:organizationId/payment-merchant-accounts/:accountId/change-requests")
  @RequirePermissions("payment.merchant.manage")
  requestMerchantChange(@Param("organizationId") organizationId: string, @Param("accountId") accountId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    const parsed = requestPaymentMerchantChangeSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.merchants.requestChange(organizationId, accountId, parsed.data, this.context(actorId, actorOrganizationId));
  }

  @Get("payment-merchant-change-requests")
  @RequirePermissions("payment.merchant.review")
  merchantChanges(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.merchants.pendingChanges(this.context(actorId, organizationId)); }

  @Post("payment-merchant-change-requests/:requestId/review")
  @RequirePermissions("payment.merchant.review")
  reviewMerchantChange(@Param("requestId") requestId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = reviewPaymentMerchantChangeSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.merchants.reviewChange(requestId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("payment-intents/:paymentIntentId/sessions")
  @RequirePermissions("payment.view")
  createSession(@Param("paymentIntentId") paymentIntentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createPaymentSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.merchants.createSession(paymentIntentId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("payment-intents/:paymentIntentId/authorize")
  @RequirePermissions("payment.capture")
  authorize(@Param("paymentIntentId") paymentIntentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = authorizePaymentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.authorize(paymentIntentId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("payment-intents/:paymentIntentId/capture")
  @RequirePermissions("payment.capture")
  capture(@Param("paymentIntentId") paymentIntentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = capturePaymentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.capture(paymentIntentId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("payment-intents/:paymentIntentId/cancel")
  @RequirePermissions("payment.capture")
  cancel(@Param("paymentIntentId") paymentIntentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = cancelPaymentIntentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.cancel(paymentIntentId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("payment-allocations/:allocationId/refunds")
  @RequirePermissions("refund.approve")
  refund(@Param("allocationId") allocationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createRefundSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.refund(allocationId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("payouts")
  @RequirePermissions("payment.view")
  payouts(@Query() query: Record<string, unknown>, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = paymentOperationsQuerySchema.safeParse(query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.payouts(parsed.data, this.context(actorId, organizationId));
  }

  @Post("payouts/:payoutId/process")
  @RequirePermissions("payment.payout.manage")
  processPayout(@Param("payoutId") payoutId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = processPayoutSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.processPayout(payoutId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("payment-intents/:paymentIntentId/reconcile")
  @RequirePermissions("payment.reconcile")
  reconcile(@Param("paymentIntentId") paymentIntentId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.settlement.reconcile(paymentIntentId, this.context(actorId, organizationId)); }

  @Get("payment-reconciliation")
  @RequirePermissions("payment.reconcile")
  reconciliation(@Query() query: Record<string, unknown>, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = paymentOperationsQuerySchema.safeParse(query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.reconciliation(parsed.data, this.context(actorId, organizationId));
  }

  @Post("payment-reconciliation/import")
  @RequirePermissions("payment.reconcile")
  importReconciliation(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = paymentReconciliationImportSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.settlement.importReconciliation(parsed.data, this.context(actorId, organizationId));
  }

  @Get("ledger")
  @RequirePermissions("payment.view")
  ledger(@Query() query: Record<string, unknown>, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = ledgerQuerySchema.safeParse(query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.payments.ledger(parsed.data, this.context(actorId, organizationId));
  }
}

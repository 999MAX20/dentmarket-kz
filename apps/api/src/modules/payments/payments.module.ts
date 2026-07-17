import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaymentAdapterRegistry } from "./adapters/payment-adapter-registry.service";
import { MockPaymentAdapter } from "./adapters/mock-payment.adapter";
import { PaymentMerchantService } from "./payment-merchant.service";
import { PaymentSettlementService } from "./payment-settlement.service";
import { PaymentWebhooksController } from "./payment-webhooks.controller";
import { PaymentWebhooksService } from "./payment-webhooks.service";
import { HttpPaymentAdapter } from "./adapters/http-payment.adapter";
import { MarketplaceAgreementsModule } from "../agreements/marketplace-agreements.module";

@Module({ imports: [MarketplaceAgreementsModule], controllers: [PaymentsController, PaymentWebhooksController], providers: [MockPaymentAdapter, HttpPaymentAdapter, PaymentAdapterRegistry, PaymentMerchantService, PaymentSettlementService, PaymentWebhooksService, PaymentsService], exports: [PaymentsService, PaymentSettlementService] })
export class PaymentsModule {}

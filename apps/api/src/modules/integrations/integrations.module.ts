import { Module } from "@nestjs/common";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { InventoryModule } from "../inventory/inventory.module";
import { IntegrationAdapterRegistry } from "./adapters/adapter-registry.service";
import { MockIntegrationAdapter } from "./adapters/mock.adapter";
import { MoySkladIntegrationAdapter } from "./adapters/moysklad.adapter";
import { CustomApiIntegrationAdapter } from "./adapters/custom-api.adapter";
import { ConnectorAgentController } from "./connector-agent.controller";
import { ConnectorAgentService } from "./connector-agent.service";
import { ExternalReservationsService } from "./external-reservations.service";
import { IntegrationCryptoService } from "./integration-crypto.service";
import { IntegrationExecutionService } from "./integration-execution.service";
import { IntegrationJobsService } from "./integration-jobs.service";
import { IntegrationOutboxService } from "./integration-outbox.service";
import { IntegrationWebhooksController } from "./integration-webhooks.controller";
import { IntegrationWebhooksService } from "./integration-webhooks.service";
import { IntegrationWorkerService } from "./integration-worker.service";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { ConnectorReadinessController } from "./connector-readiness.controller";
import { ConnectorReadinessService } from "./connector-readiness.service";
import { MarketplaceAgreementsModule } from "../agreements/marketplace-agreements.module";

@Module({
  imports: [SuppliersModule, InventoryModule, MarketplaceAgreementsModule],
  controllers: [IntegrationsController, ConnectorAgentController, IntegrationWebhooksController, ConnectorReadinessController],
  providers: [
    IntegrationCryptoService,
    MockIntegrationAdapter,
    MoySkladIntegrationAdapter,
    CustomApiIntegrationAdapter,
    IntegrationAdapterRegistry,
    IntegrationJobsService,
    IntegrationsService,
    ConnectorAgentService,
    IntegrationWebhooksService,
    IntegrationExecutionService,
    IntegrationOutboxService,
    IntegrationWorkerService,
    ExternalReservationsService,
    ConnectorReadinessService,
  ],
  exports: [ExternalReservationsService, IntegrationJobsService],
})
export class IntegrationsModule {}

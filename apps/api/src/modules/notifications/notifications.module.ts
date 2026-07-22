import { Module } from "@nestjs/common";
import { NotificationAdapterRegistry } from "./notification-adapter-registry.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { IntegrationsModule } from "../integrations/integrations.module";

@Module({ imports: [IntegrationsModule], controllers: [NotificationsController], providers: [NotificationsService, NotificationAdapterRegistry], exports: [NotificationsService] })
export class NotificationsModule {}

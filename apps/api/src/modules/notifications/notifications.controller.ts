import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createNotificationSchema, notificationPreferenceSchema, notificationQuerySchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@UseGuards(PermissionsGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("capabilities")
  @RequirePermissions("notification.view")
  capabilities() { return this.notifications.capabilities(); }

  @Get("organizations/:organizationId/preferences")
  @RequirePermissions("notification.view")
  preferences(@Param("organizationId") organizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    return this.notifications.preferences(organizationId, this.context(actorId, actorOrganizationId));
  }

  @Post("organizations/:organizationId/preferences")
  @RequirePermissions("notification.manage")
  upsertPreference(@Param("organizationId") organizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    const parsed = notificationPreferenceSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.notifications.upsertPreference(organizationId, parsed.data, this.context(actorId, actorOrganizationId));
  }

  @Post()
  @RequirePermissions("notification.manage")
  create(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createNotificationSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.notifications.create(parsed.data, this.context(actorId, organizationId));
  }

  @Get("organizations/:organizationId")
  @RequirePermissions("notification.view")
  list(@Param("organizationId") organizationId: string, @Query() query: Record<string, unknown>, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    const parsed = notificationQuerySchema.safeParse(query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.notifications.list(organizationId, parsed.data, this.context(actorId, actorOrganizationId));
  }

  @Post(":notificationId/read")
  @RequirePermissions("notification.view")
  markRead(@Param("notificationId") notificationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.notifications.markRead(notificationId, this.context(actorId, organizationId));
  }

  @Post(":notificationId/retry")
  @RequirePermissions("notification.manage")
  retry(@Param("notificationId") notificationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.notifications.retry(notificationId, this.context(actorId, organizationId));
  }

  @Post("process")
  @RequirePermissions("notification.manage")
  process() { return this.notifications.tick(); }
}

import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { completeDevelopmentRegistrationSchema, createRegistrationIntentSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { environment } from "../../platform/config/environment";
import { OnboardingService } from "./onboarding.service";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";

@ApiTags("onboarding")
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post("registrations")
  @Throttle({ ip: { limit: 8, ttl: 60_000 }, user: { limit: 8, ttl: 60_000 }, tenant: { limit: 8, ttl: 60_000 } })
  create(@Body() body: unknown, @Req() request: Request) {
    const parsed = createRegistrationIntentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.onboarding.createIntent(parsed.data, { ipAddress: request.ip ?? request.socket.remoteAddress ?? null, userAgent: request.get("user-agent") ?? null });
  }

  @Post("registrations/complete-development")
  @Throttle({ ip: { limit: 12, ttl: 60_000 }, user: { limit: 12, ttl: 60_000 }, tenant: { limit: 12, ttl: 60_000 } })
  completeDevelopment(@Body() body: unknown, @Req() request: Request) {
    if (environment().NODE_ENV === "production") throw new ForbiddenException("Development onboarding is unavailable");
    const parsed = completeDevelopmentRegistrationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const ip = request.ip ?? request.socket.remoteAddress ?? "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) throw new ForbiddenException("Development onboarding is local-only");
    return this.onboarding.completeDevelopment(parsed.data.registrationToken);
  }

  @Get("supplier/progress")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("supplier.profile.manage")
  supplierProgress(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.onboarding.supplierProgress(actorId, organizationId);
  }
}

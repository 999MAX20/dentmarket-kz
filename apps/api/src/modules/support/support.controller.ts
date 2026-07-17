import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { addSupportMessageSchema, createSupportTicketSchema, startImpersonationSchema, updateSupportTicketSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { SupportService } from "./support.service";

@ApiTags("support")
@UseGuards(PermissionsGuard)
@Controller("support")
export class SupportController {
  constructor(private readonly support: SupportService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Post("tickets") @RequirePermissions("support.ticket.create")
  create(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createSupportTicketSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.support.create(parsed.data, this.context(actorId, organizationId)); }

  @Get("tickets") @RequirePermissions("support.ticket.view")
  list(@Query("status") status: string | undefined, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { if (status && !z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]).safeParse(status).success) throw new BadRequestException("Invalid ticket status"); return this.support.list(this.context(actorId, organizationId), status); }

  @Get("tickets/:ticketId") @RequirePermissions("support.ticket.view")
  get(@Param("ticketId") ticketId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.support.get(ticketId, this.context(actorId, organizationId)); }

  @Post("tickets/:ticketId/messages") @RequirePermissions("support.ticket.create")
  message(@Param("ticketId") ticketId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = addSupportMessageSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.support.addMessage(ticketId, parsed.data, this.context(actorId, organizationId)); }

  @Patch("tickets/:ticketId") @RequirePermissions("support.ticket.manage")
  update(@Param("ticketId") ticketId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = updateSupportTicketSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.support.update(ticketId, parsed.data, this.context(actorId, organizationId)); }

  @Post("impersonation") @RequirePermissions("support.impersonate")
  impersonate(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = startImpersonationSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.support.startImpersonation(parsed.data, this.context(actorId, organizationId)); }

  @Post("impersonation/:sessionId/end") @RequirePermissions("support.impersonate")
  end(@Param("sessionId") sessionId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.support.endImpersonation(sessionId, this.context(actorId, organizationId)); }

  @Get("knowledge") @RequirePermissions("support.ticket.view")
  knowledge(@Query("audience") audience?: string, @Query("q") query?: string) { return this.support.knowledge(audience, query); }
}

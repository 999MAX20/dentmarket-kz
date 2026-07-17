import { BadRequestException, Controller, Get, Headers, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { AuditService } from "./audit.service";

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entityType: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(160).optional(),
  entityId: z.string().trim().min(1).max(160).optional(),
  actorId: z.uuid().optional(),
});

@ApiTags("audit")
@UseGuards(PermissionsGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions("audit.view")
  list(@Headers("x-organization-id") organizationId: string, @Query() query: unknown) {
    const parsed = auditQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.audit.list(organizationId, parsed.data);
  }
}

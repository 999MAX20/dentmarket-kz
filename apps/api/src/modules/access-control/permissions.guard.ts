import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AccessControlService } from "./access-control.service";
import { REQUIRED_PERMISSIONS } from "./require-permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly access: AccessControlService) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    if (required.length === 0) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.header("x-user-id");
    const organizationId = request.header("x-organization-id");
    if (!userId || !organizationId) throw new UnauthorizedException("Active user and organization context are required");
    if (!(await this.access.hasAll(userId, organizationId, required))) throw new ForbiddenException("Insufficient permissions");
    return true;
  }
}

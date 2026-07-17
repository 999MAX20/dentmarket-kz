import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { demoSessionSchema, refreshSessionSchema, revokeSessionSchema, socialExchangeSchema, switchSessionOrganizationSchema, unlinkExternalIdentitySchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { environment } from "../../platform/config/environment";
import { AuthSessionsService } from "./auth-sessions.service";
import { Throttle } from "@nestjs/throttler";

const cookies = (header: string | undefined) => Object.fromEntries((header ?? "").split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
const equal = (left: string, right: string) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };

@ApiTags("auth-sessions")
@Throttle({ ip: { limit: 20, ttl: 60_000 }, user: { limit: 30, ttl: 60_000 }, tenant: { limit: 60, ttl: 60_000 } })
@Controller("auth")
export class AuthSessionsController {
  constructor(private readonly sessions: AuthSessionsService) {}
  private metadata(request: Request) { return { ipAddress: request.ip, userAgent: request.header("user-agent"), correlationId: request.header("x-request-id") }; }
  private setCookies(response: Response, refreshToken: string, csrfToken: string, expiresAt: Date | string) {
    const config = environment();
    const common = { secure: config.NODE_ENV === "production", sameSite: "lax" as const, domain: config.AUTH_COOKIE_DOMAIN, path: "/api/auth", expires: new Date(expiresAt) };
    response.cookie("mp_refresh", refreshToken, { ...common, httpOnly: true });
    response.cookie("mp_csrf", csrfToken, { ...common, httpOnly: false });
  }

  @Post("social/exchange")
  async exchange(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = socialExchangeSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.sessions.exchange(parsed.data, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url");
    this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("demo")
  async demo(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    if (!environment().PUBLIC_DEMO_MODE) throw new UnauthorizedException("Демонстрационный вход отключён");
    const parsed = demoSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.sessions.demo(parsed.data.capability, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url");
    this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("handoff")
  createHandoff(@Headers("x-user-id") userId: string, @Headers("x-organization-id") organizationId: string, @Headers("x-session-id") sessionId: string, @Body() body: unknown) {
    const value = body && typeof body === "object" ? body as { capability?: unknown } : {};
    if (!userId || !organizationId || !["BUYER", "SUPPLIER"].includes(String(value.capability))) throw new UnauthorizedException("Authenticated organization and capability are required");
    return this.sessions.createHandoff(userId, organizationId, String(value.capability) as "BUYER" | "SUPPLIER", sessionId || undefined);
  }

  @Post("handoff/exchange")
  exchangeHandoff(@Body() body: unknown) {
    const value = body && typeof body === "object" ? body as { handoffCode?: unknown } : {};
    if (typeof value.handoffCode !== "string" || value.handoffCode.length < 20) throw new BadRequestException("handoffCode is required");
    return this.sessions.exchangeHandoff(value.handoffCode);
  }

  @Post("refresh")
  async refresh(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = refreshSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const cookie = cookies(request.header("cookie"));
    const refreshToken = parsed.data.refreshToken ?? cookie.mp_refresh;
    if (!refreshToken) throw new UnauthorizedException("Refresh token is required");
    if (cookie.mp_refresh) {
      const suppliedCsrf = request.header("x-csrf-token") ?? parsed.data.csrfToken;
      if (!suppliedCsrf || !cookie.mp_csrf || !equal(suppliedCsrf, cookie.mp_csrf)) throw new UnauthorizedException("CSRF validation failed");
    }
    const result = await this.sessions.rotate(refreshToken, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url");
    this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: cookie.mp_refresh ? undefined : result.refreshToken, csrfToken };
  }

  @Get("sessions")
  list(@Headers("x-user-id") userId: string) { if (!userId) throw new UnauthorizedException(); return this.sessions.list(userId); }

  @Post("sessions/:sessionId/revoke")
  revoke(@Param("sessionId") sessionId: string, @Headers("x-user-id") userId: string, @Body() body: unknown) { const parsed = revokeSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.revoke(sessionId, userId, parsed.data.reason); }

  @Post("sessions/:sessionId/organization")
  switchOrganization(@Param("sessionId") sessionId: string, @Headers("x-user-id") userId: string, @Body() body: unknown) { const parsed = switchSessionOrganizationSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.switchOrganization(sessionId, userId, parsed.data.organizationId); }

  @Delete("identities")
  unlink(@Headers("x-user-id") userId: string, @Body() body: unknown) { const parsed = unlinkExternalIdentitySchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.unlink(userId, parsed.data.provider); }
}

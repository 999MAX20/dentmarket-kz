import { UnauthorizedException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { environment, type MarketplaceEnvironment } from "../config/environment";

type MarketplaceClaims = JwtPayload & { organization_id?: string; organization_ids?: string[]; amr?: string[] | string };

export function resolveJwtActor(token: string, requestedOrganizationId: string | undefined, config: MarketplaceEnvironment, allowMfaBootstrap = false) {
  const key = (config.JWT_PUBLIC_KEY ?? config.JWT_SECRET)?.replaceAll("\\n", "\n");
  if (!key) throw new UnauthorizedException("JWT verification key is not configured");
  let claims: MarketplaceClaims;
  try {
    const verified = jwt.verify(token, key, { issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, algorithms: config.JWT_PUBLIC_KEY ? ["RS256", "ES256"] : ["HS256"] });
    if (typeof verified === "string") throw new Error("JWT payload is not an object");
    claims = verified as MarketplaceClaims;
  } catch {
    throw new UnauthorizedException("Bearer token is invalid or expired");
  }
  if (!claims.sub) throw new UnauthorizedException("Bearer token has no subject");
  const allowedOrganizations = claims.organization_ids ?? (claims.organization_id ? [claims.organization_id] : []);
  const organizationId = requestedOrganizationId ?? claims.organization_id ?? (allowedOrganizations.length === 1 ? allowedOrganizations[0] : undefined);
  if (!organizationId || !allowedOrganizations.includes(organizationId)) throw new UnauthorizedException("Active organization is not allowed by the bearer token");
  const methods = Array.isArray(claims.amr) ? claims.amr : claims.amr ? [claims.amr] : [];
  if (config.JWT_REQUIRE_MFA && !allowMfaBootstrap && !methods.some((method) => ["mfa", "otp", "totp"].includes(method.toLowerCase()))) throw new UnauthorizedException("Multi-factor authentication is required");
  return { actorId: claims.sub, organizationId, authenticationMethods: methods, sessionId: typeof claims.jti === "string" ? claims.jti : undefined };
}

export function identityContextMiddleware() {
  const config = environment();
  return (request: Request, _response: Response, next: NextFunction) => {
    if (config.AUTH_MODE === "development") return next();
    const authorization = request.header("authorization");
    const requestedOrganizationId = request.header("x-organization-id");
    delete request.headers["x-user-id"];
    delete request.headers["x-organization-id"];
    if (!authorization?.startsWith("Bearer ")) return next();
    try {
      const allowMfaBootstrap = /^\/api\/identity\/mfa(?:\/|$)/.test(request.originalUrl.split("?")[0] ?? "");
      const actor = resolveJwtActor(authorization.slice(7), requestedOrganizationId, config, allowMfaBootstrap);
      request.headers["x-user-id"] = actor.actorId;
      request.headers["x-organization-id"] = actor.organizationId;
      request.headers["x-authentication-methods"] = actor.authenticationMethods.join(",");
      if (actor.sessionId) request.headers["x-session-id"] = actor.sessionId;
      next();
    } catch (error) { next(error); }
  };
}

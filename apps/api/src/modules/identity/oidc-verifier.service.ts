import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createPublicKey, type JsonWebKey } from "node:crypto";
import jwt, { type JwtHeader, type JwtPayload } from "jsonwebtoken";
import { environment } from "../../platform/config/environment";

type Provider = "GOOGLE" | "APPLE";
type VerifiedIdentity = { subject: string; email: string; emailVerified: boolean; displayName: string; profile: Record<string, unknown> };
type JwksResponse = { keys: Array<JsonWebKey & { kid?: string; alg?: string }> };

const providerConfig = {
  GOOGLE: { issuer: ["https://accounts.google.com", "accounts.google.com"], jwks: "https://www.googleapis.com/oauth2/v3/certs", algorithms: ["RS256"] as const },
  APPLE: { issuer: ["https://appleid.apple.com"], jwks: "https://appleid.apple.com/auth/keys", algorithms: ["RS256"] as const },
};

@Injectable()
export class OidcVerifierService {
  private readonly cache = new Map<Provider, { expiresAt: number; keys: JwksResponse["keys"] }>();

  private audiences(provider: Provider) {
    const config = environment();
    const raw = provider === "GOOGLE" ? config.GOOGLE_CLIENT_IDS : config.APPLE_CLIENT_IDS;
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }

  private async jwks(provider: Provider) {
    const cached = this.cache.get(provider);
    if (cached && cached.expiresAt > Date.now()) return cached.keys;
    const response = await fetch(providerConfig[provider].jwks, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new UnauthorizedException("Social identity keys are unavailable");
    const payload = await response.json() as JwksResponse;
    if (!Array.isArray(payload.keys) || payload.keys.length === 0) throw new UnauthorizedException("Social identity keys are invalid");
    const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 300);
    this.cache.set(provider, { keys: payload.keys, expiresAt: Date.now() + Math.min(maxAge, 3_600) * 1_000 });
    return payload.keys;
  }

  async verify(provider: Provider, idToken: string): Promise<VerifiedIdentity> {
    const config = environment();
    if (!config.SOCIAL_AUTH_ENABLED) throw new UnauthorizedException("Social authentication is disabled");
    const audiences = this.audiences(provider);
    if (audiences.length === 0) throw new UnauthorizedException(`${provider} authentication is not configured`);
    const decoded = jwt.decode(idToken, { complete: true });
    const header = decoded?.header as JwtHeader | undefined;
    if (!header?.kid || !providerConfig[provider].algorithms.includes(header.alg as "RS256")) throw new UnauthorizedException("Social identity token header is invalid");
    const jwk = (await this.jwks(provider)).find((candidate) => candidate.kid === header.kid && (!candidate.alg || candidate.alg === header.alg));
    if (!jwk) {
      this.cache.delete(provider);
      throw new UnauthorizedException("Social identity signing key is unknown");
    }
    let claims: JwtPayload;
    try {
      const verified = jwt.verify(idToken, createPublicKey({ key: jwk, format: "jwk" }), {
        algorithms: [...providerConfig[provider].algorithms],
        issuer: providerConfig[provider].issuer as [string, ...string[]],
        audience: audiences as [string, ...string[]],
        clockTolerance: 30,
      });
      if (typeof verified === "string") throw new Error("OIDC token payload is not an object");
      claims = verified;
    } catch {
      throw new UnauthorizedException("Social identity token is invalid or expired");
    }
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    const emailVerified = claims.email_verified === true || claims.email_verified === "true" || (provider === "APPLE" && Boolean(email));
    if (!claims.sub || !email || !emailVerified) throw new UnauthorizedException("A verified email is required");
    const displayName = [claims.given_name, claims.family_name].filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join(" ") || (typeof claims.name === "string" ? claims.name : email.split("@")[0]);
    return { subject: claims.sub, email, emailVerified, displayName, profile: { name: claims.name, givenName: claims.given_name, familyName: claims.family_name, picture: claims.picture } };
  }
}

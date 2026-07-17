import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import type { MarketplaceEnvironment } from "../config/environment";
import { resolveJwtActor } from "./identity-context.middleware";

const config = { AUTH_MODE: "jwt", JWT_SECRET: "a-secure-test-secret-that-is-longer-than-32-bytes", JWT_REQUIRE_MFA: true } as MarketplaceEnvironment;

describe("JWT identity context", () => {
  it("accepts a signed tenant-bound MFA token", () => {
    const token = jwt.sign({ organization_ids: ["org-a", "org-b"], amr: ["pwd", "mfa"] }, config.JWT_SECRET!, { subject: "user-a", algorithm: "HS256", expiresIn: "5m" });
    expect(resolveJwtActor(token, "org-b", config)).toEqual({ actorId: "user-a", organizationId: "org-b", authenticationMethods: ["pwd", "mfa"], sessionId: undefined });
  });

  it("rejects tenant switching and tokens without MFA", () => {
    const token = jwt.sign({ organization_ids: ["org-a"], amr: ["pwd"] }, config.JWT_SECRET!, { subject: "user-a", algorithm: "HS256", expiresIn: "5m" });
    expect(() => resolveJwtActor(token, "org-b", config)).toThrow();
    expect(() => resolveJwtActor(token, "org-a", config)).toThrow();
  });

  it("allows a tenant-bound primary token only for the MFA bootstrap path", () => {
    const token = jwt.sign({ organization_ids: ["org-a"], amr: ["google"] }, config.JWT_SECRET!, { subject: "user-a", jwtid: "session-a", algorithm: "HS256", expiresIn: "5m" });
    expect(resolveJwtActor(token, "org-a", config, true)).toEqual({ actorId: "user-a", organizationId: "org-a", authenticationMethods: ["google"], sessionId: "session-a" });
    expect(() => resolveJwtActor(token, "org-a", config)).toThrow("Multi-factor authentication is required");
  });
});

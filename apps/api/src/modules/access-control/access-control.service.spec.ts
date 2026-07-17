import { describe, expect, it } from "vitest";
import { AccessControlService } from "./access-control.service";

const activeMembership = {
  status: "ACTIVE",
  roles: [
    { role: { permissions: [{ permission: { code: "catalog.product.view" } }, { permission: { code: "catalog.product.create" } }] } },
    { role: { permissions: [{ permission: { code: "catalog.product.view" } }] } },
  ],
};

describe("AccessControlService", () => {
  it("returns a sorted unique permission set", async () => {
    const prisma = { organizationMembership: { findUnique: async () => activeMembership } };
    const service = new AccessControlService(prisma as never);
    await expect(service.permissionsFor("user", "organization")).resolves.toEqual(["catalog.product.create", "catalog.product.view"]);
  });

  it("denies inactive memberships", async () => {
    const prisma = { organizationMembership: { findUnique: async () => ({ ...activeMembership, status: "BLOCKED" }) } };
    const service = new AccessControlService(prisma as never);
    await expect(service.hasAll("user", "organization", ["catalog.product.view"])).resolves.toBe(false);
  });
});

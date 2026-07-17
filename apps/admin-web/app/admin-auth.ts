import type { ApiContext } from "@marketplace/api-client";

const SESSION_KEY = "dentmarket_admin_session";
const DEV_ACTOR = process.env.NEXT_PUBLIC_DEV_USER_ID ?? "00000000-0000-4000-8000-000000000002";
const DEV_ORGANIZATION = process.env.NEXT_PUBLIC_DEV_ORGANIZATION_ID ?? "00000000-0000-4000-8000-000000000001";
type AdminSession = { accessToken: string; activeOrganizationId?: string; organizationId?: string; user?: { displayName?: string } };

export function readAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  const handoff = window.location.hash.startsWith("#session=") ? decodeURIComponent(window.location.hash.slice(9)) : null;
  if (handoff) {
    try { window.sessionStorage.setItem(SESSION_KEY, handoff); window.history.replaceState(null, "", window.location.pathname + window.location.search); }
    catch { return null; }
  }
  try { const parsed = JSON.parse(handoff ?? window.sessionStorage.getItem(SESSION_KEY) ?? "null") as AdminSession | null; return parsed?.accessToken ? parsed : null; }
  catch { return null; }
}

export function isLocalAdminDevelopment() {
  return typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export function adminApiContext(): ApiContext {
  const session = readAdminSession();
  return session?.accessToken ? { accessToken: session.accessToken } : isLocalAdminDevelopment() ? { actorId: DEV_ACTOR, organizationId: DEV_ORGANIZATION } : {};
}

export function adminAuthHeaders(contentType = true): Record<string, string> {
  const context = adminApiContext();
  const headers: Record<string, string> = contentType ? { "content-type": "application/json" } : {};
  if (context.accessToken) headers.authorization = `Bearer ${context.accessToken}`;
  else if (context.actorId && context.organizationId) { headers["x-user-id"] = context.actorId; headers["x-organization-id"] = context.organizationId; }
  return headers;
}

export function clearAdminSession() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
}

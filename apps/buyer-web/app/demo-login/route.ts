import { NextResponse } from "next/server";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
const supplierAppUrl = process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ?? "https://dentmarket-supplier.vercel.app";

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== "true") {
    return NextResponse.redirect(new URL("/login?error=demo_disabled", request.url));
  }
  const capability = new URL(request.url).searchParams.get("capability") === "SUPPLIER" ? "SUPPLIER" : "BUYER";
  try {
    const demoResponse = await fetch(`${apiUrl}/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capability }), cache: "no-store" });
    const session = (await demoResponse.json()) as { accessToken?: string; sessionId?: string; activeOrganizationId?: string | null; organizationId?: string; organizationDisplayName?: string; user?: { id: string; displayName: string }; message?: string };
    if (!demoResponse.ok || !session.accessToken || !session.user) return NextResponse.redirect(new URL("/login?error=service", request.url));
    const organizationId = session.activeOrganizationId ?? session.organizationId;
    if (!organizationId) return NextResponse.redirect(new URL("/login?error=organization", request.url));
    const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}`, "x-user-id": session.user.id, "x-organization-id": organizationId, ...(session.sessionId ? { "x-session-id": session.sessionId } : {}) }, body: JSON.stringify({ capability }), cache: "no-store" });
    const handoffPayload = (await handoffResponse.json()) as { handoffCode?: string; organizationId?: string; organizationDisplayName?: string; message?: string };
    if (!handoffResponse.ok || !handoffPayload.handoffCode) return NextResponse.redirect(new URL("/login?error=handoff", request.url));
    // The access token stays in the URL fragment and is never sent to the server.
    // It is a short-lived demo token and prevents a transient one-time-code
    // exchange failure from leaving the clinic on a raw JSON error page.
    const handoff = encodeURIComponent(JSON.stringify({ displayName: session.user.displayName, organizationDisplayName: handoffPayload.organizationDisplayName ?? session.organizationDisplayName, organizationId: handoffPayload.organizationId ?? organizationId, handoffCode: handoffPayload.handoffCode, accessToken: session.accessToken, sessionId: session.sessionId, capability }));
    const target = capability === "SUPPLIER" ? supplierAppUrl : new URL("/", request.url).origin;
    return NextResponse.redirect(`${target}/#session=${handoff}`);
  } catch {
    // Never leave a browser on a raw JSON error page. The login screen can
    // render a useful recovery message and keep the user in the right app.
    return NextResponse.redirect(new URL("/login?error=service", request.url));
  }
}

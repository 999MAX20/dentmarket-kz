import { NextResponse } from "next/server";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
const supplierAppUrl = process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ?? "https://dentmarket-supplier.vercel.app";

export async function GET(request: Request) {
  const capability = new URL(request.url).searchParams.get("capability") === "SUPPLIER" ? "SUPPLIER" : "BUYER";
  try {
    const demoResponse = await fetch(`${apiUrl}/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capability }), cache: "no-store" });
    const session = (await demoResponse.json()) as { accessToken?: string; sessionId?: string; activeOrganizationId?: string | null; organizationId?: string; organizationDisplayName?: string; user?: { id: string; displayName: string }; message?: string };
    if (!demoResponse.ok || !session.accessToken || !session.user) return NextResponse.json({ message: session.message ?? "Сервис входа временно недоступен" }, { status: 502 });
    const organizationId = session.activeOrganizationId ?? session.organizationId;
    if (!organizationId) return NextResponse.json({ message: "У аккаунта нет активной организации" }, { status: 502 });
    const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}`, "x-user-id": session.user.id, "x-organization-id": organizationId, ...(session.sessionId ? { "x-session-id": session.sessionId } : {}) }, body: JSON.stringify({ capability }), cache: "no-store" });
    const handoffPayload = (await handoffResponse.json()) as { handoffCode?: string; organizationId?: string; organizationDisplayName?: string; message?: string };
    if (!handoffResponse.ok || !handoffPayload.handoffCode) return NextResponse.json({ message: handoffPayload.message ?? "Не удалось создать безопасный переход" }, { status: 502 });
    const handoff = encodeURIComponent(JSON.stringify({ displayName: session.user.displayName, organizationDisplayName: handoffPayload.organizationDisplayName ?? session.organizationDisplayName, organizationId: handoffPayload.organizationId ?? organizationId, handoffCode: handoffPayload.handoffCode, capability }));
    const target = capability === "SUPPLIER" ? supplierAppUrl : new URL("/", request.url).origin;
    return NextResponse.redirect(`${target}/#session=${handoff}`);
  } catch {
    return NextResponse.json({ message: "Сервис входа временно недоступен" }, { status: 502 });
  }
}

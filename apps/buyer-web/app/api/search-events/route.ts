import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
    resultCount?: unknown;
    matchedAliases?: unknown;
  } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 240) : "";
  const resultCount = Number(body?.resultCount);
  if (!query || !Number.isInteger(resultCount) || resultCount < 0) {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ??
    "https://dentmarket-api.vercel.app/api";
  try {
    await fetch(`${apiUrl.replace(/\/$/u, "")}/catalog/search/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        resultCount,
        matchedAliases: Array.isArray(body?.matchedAliases)
          ? body.matchedAliases.slice(0, 20)
          : [],
      }),
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
  } catch {
    // Событие аналитики допускает повторную потерю: поиск остаётся доступным.
  }

  return NextResponse.json({ accepted: true }, { status: 202 });
}

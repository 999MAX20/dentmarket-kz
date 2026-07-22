import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const apiOrigin = new URL(
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
  ).origin;
  const response = NextResponse.next();
  response.headers.set(
    "Content-Security-Policy",
    // Next.js emits bootstrap hydration snippets without a per-tag nonce in
    // this deployment mode. Keep eval disabled and allow only same-origin
    // scripts/styles plus the required inline hydration snippets.
    `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}; connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`,
  );
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

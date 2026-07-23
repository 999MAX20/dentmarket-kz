import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const apiOrigin = new URL(
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
  ).origin;
  // Next.js reads x-nonce from the forwarded request and applies it to its
  // hydration scripts. This lets production CSP reject arbitrary inline JS.
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}; connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`,
  );
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

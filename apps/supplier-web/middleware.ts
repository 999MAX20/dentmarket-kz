import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const dev = process.env.NODE_ENV !== "production";
  const apiOrigin = new URL(
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
  ).origin;
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'${dev ? " 'unsafe-eval'" : ""}; connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`,
  );
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

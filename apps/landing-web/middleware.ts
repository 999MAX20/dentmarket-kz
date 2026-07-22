import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://accounts.google.com https://appleid.cdn-apple.com; font-src 'self'; connect-src 'self' ${new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api").origin} https://accounts.google.com https://appleid.apple.com; frame-src https://accounts.google.com https://appleid.apple.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://appleid.apple.com`,
  );
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

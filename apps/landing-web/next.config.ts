import type { NextConfig } from "next";

const origin = (value: string | undefined, fallback: string) => {
  try {
    return new URL(value ?? fallback).origin;
  } catch {
    return fallback;
  }
};
const apiOrigin = origin(
  process.env.NEXT_PUBLIC_API_URL,
  "http://127.0.0.1:4012",
);
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: `default-src 'self'; img-src 'self' data: https://*.googleusercontent.com; style-src 'self'; script-src 'self' https://accounts.google.com https://appleid.cdn-apple.com; font-src 'self'; connect-src 'self' ${apiOrigin} https://accounts.google.com https://appleid.apple.com; frame-src https://accounts.google.com https://appleid.apple.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://appleid.apple.com`,
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default nextConfig;

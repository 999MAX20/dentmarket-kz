import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  outputFileTracingIncludes: {
    "/api/catalog-search": ["./app/data/production-approved-catalog.json"],
    "/products/[id]": ["./app/data/production-approved-catalog.json"],
  },
  transpilePackages: ["@marketplace/ui", "@marketplace/api-client"],
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
  experimental: {
    // Next's isolated webpack worker can stall on the large curated catalog.
    // Building in-process is deterministic and keeps the same runtime output.
    webpackBuildWorker: false,
  },
  async headers() {
    return [
      { source: "/catalog/products/:path*", headers: productImageHeaders() },
      { source: "/(.*)", headers: securityHeaders() },
    ];
  },
};

function productImageHeaders() {
  return [
    { key: "Content-Disposition", value: "inline" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];
}

function securityHeaders() {
  const apiOrigin = (() => {
    try {
      return new URL(
        process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
      ).origin;
    } catch {
      return "http://127.0.0.1:4012";
    }
  })();
  const dev = process.env.NODE_ENV !== "production";
  return [
    {
      key: "Content-Security-Policy",
      // Next.js emits a small inline bootstrap required to hydrate the app.
      // Without it Safari keeps the server HTML but none of the React controls
      // receive event handlers (login, search, city selector, etc.).
      value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self'; script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}; connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`,
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    ...(dev
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ]),
  ];
}

export default nextConfig;

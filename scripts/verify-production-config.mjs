import { spawnSync } from "node:child_process";

const requiredFiles = [
  ".env.production.example",
  "compose.production.yaml",
  "infra/Caddyfile",
  "scripts/backup.sh",
  "scripts/restore.sh",
  "scripts/backup-production.sh",
  "scripts/restore-production.sh",
  "docs/production-deployment.md",
  ".github/workflows/release.yml",
  ".github/workflows/security.yml",
];
for (const file of requiredFiles) {
  const check = spawnSync("test", ["-s", file]);
  if (check.status !== 0)
    throw new Error(
      `Required production artifact is missing or empty: ${file}`,
    );
}

const valid = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://user:password@db.example.kz:5432/marketplace?sslmode=require",
  REDIS_URL: "rediss://default:password@redis.example.kz:6379",
  AUTH_MODE: "jwt",
  JWT_SECRET: "x".repeat(64),
  JWT_ISSUER: "https://api.example.kz",
  JWT_AUDIENCE: "dentmarket-kz",
  JWT_REQUIRE_MFA: "true",
  TRUST_PROXY: "true",
  CORS_ORIGINS:
    "https://admin.example.kz,https://buyer.example.kz,https://supplier.example.kz,https://example.kz",
  INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 105).toString("base64"),
  APP_SECURITY_ENCRYPTION_KEY: Buffer.alloc(32, 97).toString("base64"),
  MEDIA_SIGNING_SECRET: "media-signing-secret-for-config-test".repeat(2),
  OBJECT_STORAGE_DRIVER: "s3",
  S3_ENDPOINT: "https://s3.example.kz",
  S3_BUCKET: "marketplace",
  S3_ACCESS_KEY_ID: "access",
  S3_SECRET_ACCESS_KEY: "s".repeat(32),
  S3_SERVER_SIDE_ENCRYPTION: "AES256",
  AV_SCAN_MODE: "required",
  SIGNATURE_GATEWAY_URL: "https://eds.example.kz",
  SIGNATURE_CALLBACK_SECRET: "e".repeat(48),
  PAYMENT_PROVIDER_MODE: "external",
  PAYMENT_GATEWAY_URL: "https://pay.example.kz",
  PAYMENT_GATEWAY_TOKEN: "p".repeat(32),
  EMAIL_PROVIDER_URL: "https://mail.example.kz/send",
  EMAIL_PROVIDER_TOKEN: "m".repeat(32),
  NOTIFICATION_WEBHOOK_SECRET: "n".repeat(48),
  SENTRY_DSN: "https://public@sentry.example.kz/1",
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.kz/v1/traces",
};
const run = (env) =>
  spawnSync(
    process.execPath,
    [
      "-e",
      "require('./apps/api/dist/src/platform/config/environment.js').environment(); console.log('valid')",
    ],
    { env, encoding: "utf8" },
  );
const accepted = run(valid);
if (accepted.status !== 0)
  throw new Error(`Valid production contract rejected: ${accepted.stderr}`);
const insecure = run({ ...valid, CORS_ORIGINS: "http://localhost:3000" });
if (insecure.status === 0)
  throw new Error("Insecure localhost production CORS was accepted");
const mockPayment = run({
  ...valid,
  PAYMENT_PROVIDER_MODE: "mock",
  PAYMENT_GATEWAY_URL: "",
});
if (mockPayment.status === 0)
  throw new Error("Mock payment mode was accepted in production");
console.log(
  JSON.stringify(
    {
      productionContract: true,
      insecureCorsRejected: true,
      mockPaymentsRejected: true,
      artifacts: requiredFiles,
    },
    null,
    2,
  ),
);

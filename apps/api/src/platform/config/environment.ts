import { z } from "zod";

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());

const encryptionKeySchema = z.string().refine((value) => {
  try { return Buffer.from(value, "base64").length === 32; } catch { return false; }
}, "must be a base64-encoded 32-byte key");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEPLOYMENT_PROFILE: z.enum(["go_live", "pilot"]).default("go_live"),
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  // Managed container platforms (Render, Railway, Fly.io) inject PORT.
  // Keep API_PORT as the local/dev fallback so existing compose workflows
  // remain unchanged.
  PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  AUTH_MODE: z.enum(["development", "jwt"]).default("development"),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_PUBLIC_KEY: z.string().min(64).optional(),
  JWT_PRIVATE_KEY: z.string().min(64).optional(),
  JWT_ISSUER: z.string().min(1).optional(),
  JWT_AUDIENCE: z.string().min(1).optional(),
  JWT_REQUIRE_MFA: booleanFromString.default(false),
  SOCIAL_AUTH_ENABLED: booleanFromString.default(false),
  PUBLIC_DEMO_MODE: booleanFromString.default(false),
  PUBLIC_CATALOG_ORGANIZATION_ID: z.string().uuid().default("00000000-0000-4000-8000-000000000030"),
  GOOGLE_CLIENT_IDS: z.string().default(""),
  APPLE_CLIENT_IDS: z.string().default(""),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(900),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  SIGNATURE_CALLBACK_SECRET: z.string().min(32).optional(),
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:3003"),
  TRUST_PROXY: booleanFromString.default(false),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1_000).default(60_000),
  RATE_LIMIT_REQUESTS: z.coerce.number().int().min(1).default(240),
  REDIS_URL: z.string().url().optional(),
  BACKGROUND_QUEUE_ENABLED: booleanFromString.default(true),
  BACKGROUND_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
  AV_SCAN_MODE: z.enum(["disabled", "clamav", "required"]).default("disabled"),
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  INTEGRATION_ENCRYPTION_KEY: encryptionKeySchema.optional(),
  INTEGRATION_ENCRYPTION_KEY_PREVIOUS: encryptionKeySchema.optional(),
  APP_SECURITY_ENCRYPTION_KEY: encryptionKeySchema.optional(),
  MEDIA_SIGNING_SECRET: z.string().min(32).optional(),
  OBJECT_STORAGE_DRIVER: z.enum(["local", "s3", "supabase"]).default("local"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(16).optional(),
  S3_SERVER_SIDE_ENCRYPTION: z.enum(["AES256", "aws:kms"]).optional(),
  SIGNATURE_GATEWAY_URL: z.string().url().optional(),
  SIGNATURE_GATEWAY_TOKEN: z.string().min(16).optional(),
  PAYMENT_PROVIDER_MODE: z.enum(["mock", "external"]).default("mock"),
  PAYMENT_GATEWAY_URL: z.string().url().optional(),
  PAYMENT_GATEWAY_TOKEN: z.string().min(16).optional(),
  EMAIL_PROVIDER_URL: z.string().url().optional(),
  EMAIL_PROVIDER_TOKEN: z.string().min(16).optional(),
  AUTH_EMAIL_BASE_URL: z.string().url().default("http://localhost:3000"),
  AUTH_EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  AUTH_PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  SMS_PROVIDER_URL: z.string().url().optional(),
  SMS_PROVIDER_TOKEN: z.string().min(16).optional(),
  NOTIFICATION_WEBHOOK_SECRET: z.string().min(32).optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.AUTH_MODE === "development") context.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "Development identity headers are forbidden in production" });
  if (value.AUTH_MODE === "jwt" && !value.JWT_SECRET && !value.JWT_PUBLIC_KEY) context.addIssue({ code: "custom", path: ["JWT_PUBLIC_KEY"], message: "JWT_PUBLIC_KEY or JWT_SECRET is required in JWT mode" });
  if (value.SOCIAL_AUTH_ENABLED && !value.JWT_SECRET && !value.JWT_PRIVATE_KEY) context.addIssue({ code: "custom", path: ["JWT_PRIVATE_KEY"], message: "JWT_PRIVATE_KEY or JWT_SECRET is required to issue social sessions" });
  if (value.SOCIAL_AUTH_ENABLED && !value.GOOGLE_CLIENT_IDS && !value.APPLE_CLIENT_IDS) context.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_IDS"], message: "At least one social client ID is required" });
  if (value.NODE_ENV === "production" && process.env.SIGNATURE_GATEWAY_URL && !value.SIGNATURE_CALLBACK_SECRET) context.addIssue({ code: "custom", path: ["SIGNATURE_CALLBACK_SECRET"], message: "Signed signature callbacks are required when the EDS gateway is configured" });
  if (value.NODE_ENV === "production" && value.AV_SCAN_MODE === "disabled") context.addIssue({ code: "custom", path: ["AV_SCAN_MODE"], message: "File scanning must be enabled in production" });
  if (value.BACKGROUND_QUEUE_ENABLED && value.NODE_ENV === "production" && !value.REDIS_URL) context.addIssue({ code: "custom", path: ["REDIS_URL"], message: "Redis is required for production background queues" });
  if (value.NODE_ENV === "production" && value.DEPLOYMENT_PROFILE === "go_live") {
    const corsOrigins = value.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (!value.TRUST_PROXY) context.addIssue({ code: "custom", path: ["TRUST_PROXY"], message: "Trusted reverse proxy mode is required in production" });
    if (corsOrigins.length === 0 || corsOrigins.some((origin) => !origin.startsWith("https://") || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin))) context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Production CORS origins must be explicit HTTPS public origins" });
    if (!value.JWT_ISSUER || !value.JWT_AUDIENCE) context.addIssue({ code: "custom", path: ["JWT_ISSUER"], message: "JWT issuer and audience are required in production" });
    if (!value.JWT_REQUIRE_MFA) context.addIssue({ code: "custom", path: ["JWT_REQUIRE_MFA"], message: "MFA must be required in production" });
    if (!value.INTEGRATION_ENCRYPTION_KEY || !value.APP_SECURITY_ENCRYPTION_KEY) context.addIssue({ code: "custom", path: ["APP_SECURITY_ENCRYPTION_KEY"], message: "Independent application and integration encryption keys are required" });
    if (!value.MEDIA_SIGNING_SECRET) context.addIssue({ code: "custom", path: ["MEDIA_SIGNING_SECRET"], message: "Media signing secret is required in production" });
    if (value.OBJECT_STORAGE_DRIVER !== "s3" || !value.S3_BUCKET || !value.S3_ACCESS_KEY_ID || !value.S3_SECRET_ACCESS_KEY || !value.S3_SERVER_SIDE_ENCRYPTION) context.addIssue({ code: "custom", path: ["OBJECT_STORAGE_DRIVER"], message: "Encrypted S3-compatible object storage is required in production" });
    if (!value.SIGNATURE_GATEWAY_URL || !value.SIGNATURE_CALLBACK_SECRET) context.addIssue({ code: "custom", path: ["SIGNATURE_GATEWAY_URL"], message: "External EDS gateway and signed callbacks are required in production" });
    if (value.PAYMENT_PROVIDER_MODE !== "external" || !value.PAYMENT_GATEWAY_URL || !value.PAYMENT_GATEWAY_TOKEN) context.addIssue({ code: "custom", path: ["PAYMENT_GATEWAY_URL"], message: "External payment gateway is required in production" });
    if (!value.EMAIL_PROVIDER_URL || !value.EMAIL_PROVIDER_TOKEN) context.addIssue({ code: "custom", path: ["EMAIL_PROVIDER_URL"], message: "Transactional email provider is required in production" });
    if (!value.NOTIFICATION_WEBHOOK_SECRET) context.addIssue({ code: "custom", path: ["NOTIFICATION_WEBHOOK_SECRET"], message: "Notification webhook signing secret is required in production" });
    if (!value.SENTRY_DSN || !value.OTEL_EXPORTER_OTLP_ENDPOINT) context.addIssue({ code: "custom", path: ["SENTRY_DSN"], message: "Sentry and OTLP telemetry endpoints are required in production" });
  }
});

export type MarketplaceEnvironment = z.infer<typeof environmentSchema>;

let cached: MarketplaceEnvironment | undefined;

export function environment(): MarketplaceEnvironment {
  if (cached) return cached;
  const normalized = Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, typeof value === "string" && value.trim() === "" ? undefined : value]));
  const parsed = environmentSchema.safeParse(normalized);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvironmentForTests() { cached = undefined; }

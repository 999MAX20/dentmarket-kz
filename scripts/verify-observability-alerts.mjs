import { URL } from "node:url";

const required = ["SENTRY_DSN", "OTEL_EXPORTER_OTLP_ENDPOINT"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing observability configuration: ${missing.join(", ")}`);
  process.exit(2);
}
for (const key of required) {
  const value = process.env[key];
  try {
    new URL(value);
  } catch {
    console.error(`${key} must be an absolute URL`);
    process.exit(2);
  }
}
const result = {
  configured: true,
  sentry: {
    dsn: true,
    piiDisabled: process.env.SENTRY_SEND_DEFAULT_PII !== "true",
  },
  otel: {
    endpoint: true,
    serviceName: process.env.OTEL_SERVICE_NAME ?? "marketplace-api",
  },
  syntheticAlert:
    process.env.ALERT_TEST_CONFIRM === "I_UNDERSTAND_SYNTHETIC_ALERT"
      ? "AUTHORIZED"
      : "NOT_RUN",
};
if (result.syntheticAlert === "NOT_RUN")
  console.log(
    "Configuration verified. Set ALERT_TEST_CONFIRM to run a live synthetic alert through the deployment runbook.",
  );
console.log(JSON.stringify(result, null, 2));

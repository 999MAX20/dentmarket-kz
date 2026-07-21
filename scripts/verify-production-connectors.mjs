const required = [
  ["SIGNATURE_GATEWAY_URL", process.env.SIGNATURE_GATEWAY_URL],
  ["SIGNATURE_CALLBACK_SECRET", process.env.SIGNATURE_CALLBACK_SECRET],
  [
    "PAYMENT_PROVIDER_MODE=external",
    process.env.PAYMENT_PROVIDER_MODE === "external" ? "configured" : "",
  ],
  ["PAYMENT_GATEWAY_URL", process.env.PAYMENT_GATEWAY_URL],
  ["PAYMENT_GATEWAY_TOKEN", process.env.PAYMENT_GATEWAY_TOKEN],
  ["SENTRY_DSN", process.env.SENTRY_DSN],
  ["OTEL_EXPORTER_OTLP_ENDPOINT", process.env.OTEL_EXPORTER_OTLP_ENDPOINT],
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
const result = {
  profile: process.env.DEPLOYMENT_PROFILE ?? "go_live",
  configured: missing.length === 0,
  missing,
  liveVerified: false,
  checks: [],
};

if (process.env.CHECK_EXTERNAL_CONNECTORS === "1" && missing.length === 0) {
  for (const [name, value] of [
    ["SIGNATURE_GATEWAY_URL", process.env.SIGNATURE_GATEWAY_URL],
    ["PAYMENT_GATEWAY_URL", process.env.PAYMENT_GATEWAY_URL],
  ]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${value.replace(/\/$/, "")}/health`, {
        signal: controller.signal,
        headers:
          name === "PAYMENT_GATEWAY_URL"
            ? { authorization: `Bearer ${process.env.PAYMENT_GATEWAY_TOKEN}` }
            : {},
      });
      result.checks.push({
        name,
        status: response.status,
        reachable: response.ok,
      });
    } catch (error) {
      result.checks.push({
        name,
        reachable: false,
        error: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      clearTimeout(timer);
    }
  }
  result.liveVerified =
    result.checks.length === 2 &&
    result.checks.every((check) => check.reachable);
}

console.log(JSON.stringify(result));
if (
  missing.length > 0 ||
  (process.env.CHECK_EXTERNAL_CONNECTORS === "1" && !result.liveVerified)
)
  process.exitCode = 1;

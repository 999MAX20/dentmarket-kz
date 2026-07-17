import * as Sentry from "@sentry/nestjs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) Sentry.init({ dsn: sentryDsn, environment: process.env.NODE_ENV ?? "development", release: process.env.APP_RELEASE, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"), sendDefaultPii: false });

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (otlpEndpoint) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "marketplace-api",
    traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint.replace(/\/$/, "")}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations({ "@opentelemetry/instrumentation-fs": { enabled: false } })],
  });
  sdk.start();
  process.once("SIGTERM", () => { void sdk.shutdown(); });
}

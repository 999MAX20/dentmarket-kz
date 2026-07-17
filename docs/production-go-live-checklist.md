# Production go-live checklist

## Already automated

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm verify:production-config`
- `pnpm verify:production-connectors`
- API health and readiness checks
- Agreement gate: publication, marketplace visibility, confirmation, checkout, capture and order export
- Supplier onboarding readiness and import diagnostics
- Search/index/catalog quality report
- Operator work queue: `/api/operations/work-queue` aggregates commercial blockers before go-live.
- `pnpm verify:security-storage` checks encrypted storage columns, key format/rotation and plaintext-sensitive configuration.

## Requires real credentials or external confirmation

- `SIGNATURE_GATEWAY_URL` and `SIGNATURE_CALLBACK_SECRET` — real EDS provider sandbox and callback verification.
- `PAYMENT_PROVIDER_MODE=external`, `PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_TOKEN` — PSP sandbox capture/refund/webhook cycle.
- `SENTRY_DSN` and `OTEL_EXPORTER_OTLP_ENDPOINT` — production observability.
- Real supplier BIN, credentials, warehouse, prices, inventory and legal confirmation.
- Signed 1C Agent and a real 1C database.
- Real МойСклад tenant and API token.
- DNS/TLS, backup restore drill and alert routing.

The connector preflight exits non-zero while required external values are missing. This is intentional: the marketplace remains fail-closed and cannot publish commercial offers with unverified contracts, prices or stock.

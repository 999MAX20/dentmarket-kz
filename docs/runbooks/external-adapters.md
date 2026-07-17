# External adapter runbook

The marketplace keeps provider credentials outside the codebase. A connector becomes active by creating an encrypted integration connection and supplying the provider-specific configuration below, then running `testConnection` before enabling imports or order export.

## Generic supplier API (`CUSTOM_API`)

Required connection values:

```json
{
  "provider": "CUSTOM_API",
  "credentials": { "accessToken": "supplier-secret" },
  "configuration": {
    "baseUrl": "https://supplier.example.kz/api",
    "timeoutMs": 15000,
    "pageSize": 100,
    "catalogPath": "/catalog",
    "pricesPath": "/prices",
    "inventoryPath": "/inventory",
    "ordersPath": "/orders",
    "reservationsPath": "/reservations",
    "reservationReleasePath": "/reservationRelease"
  }
}
```

The adapter sends `Authorization: Bearer ...`, requires HTTPS, retries 429/5xx/network timeouts, and sends `Idempotency-Key` for order/reservation operations. Read endpoints accept `{ "items": [], "nextCursor": {} }` or the equivalent under `data`/`meta`. Catalog rows require `id`/`externalId`/`sku` and `name`; prices use `valueMinor`/`amountMinor`/`price`; inventory uses `stock`, `reserved`, and optional warehouse identifiers.

## MySklad

Use `provider: "MOYSKLAD"` and encrypted `credentials.accessToken`. The default API base is the official v1.2 endpoint; an HTTPS `configuration.baseUrl` may be supplied for a compatible sandbox. Order and reservation payloads must contain a mapped `externalPayload`; `idempotencyKey` is sent as a header and is never copied into the MySklad document body. Reservation release remains disabled until the tenant-specific order status mapping is configured.

## EDS gateway

Set `SIGNATURE_GATEWAY_URL` and, when required by the gateway, `SIGNATURE_GATEWAY_TOKEN`. The adapter POSTs only document identity, SHA-256 checksum, signing method, signer name, and expiry to `${SIGNATURE_GATEWAY_URL}/sessions`. The gateway must return `externalSessionId` or `sessionId` and may return `signingUrl` or `url`. Production still requires signed callbacks via `SIGNATURE_CALLBACK_SECRET`; a local/mock adapter is never a production substitute.

## PSP

Set `PAYMENT_PROVIDER_MODE=external`, `PAYMENT_GATEWAY_URL`, and `PAYMENT_GATEWAY_TOKEN`. The existing payment adapter uses bearer authentication, operation paths, and `idempotency-key`. Validate the provider in sandbox with authorize, capture, refund, and webhook replay tests before switching a tenant to live mode.

## 1C

The marketplace-side connector boundary is ready for the signed 1C Agent. The agent remains an external deployment because it must reach the customer's real 1C database. Do not put 1C credentials or database access into the marketplace API; provision the signed agent, tenant endpoint, certificate, and a real staging database before enabling export/import jobs.

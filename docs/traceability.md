# Матрица покрытия ТЗ

Статус `готово` означает наличие схемы данных, API/application logic и проверок. Внешние production credentials и юридические договоры с провайдерами являются rollout-конфигурацией, а не кодом платформы.

| Область ТЗ | Статус | Реализация и проверка |
| --- | --- | --- |
| TypeScript monorepo, pnpm, Turborepo | Готово | 10 workspace packages, общие build/typecheck/test pipelines |
| Modular monolith и доменные границы | Готово | NestJS modules, ADR 001, application services |
| Organizations, capabilities, memberships | Готово | Prisma models, tenant checks, invitations и membership lifecycle |
| RBAC и approval limits вне ролей | Готово | Permission/Role плюс отдельный versioned `ApprovalPolicy` evaluator |
| Production identity и 2FA | Готово | JWT signature/issuer/audience/tenant validation, Google/Apple OIDC, refresh rotation/replay revoke, CSRF, TOTP, recovery codes, lockout |
| Гибридный каталог | Готово | Нормализованные поля, typed values, JSONB metadata и search projection |
| Стоматологическая конфигурация | Готово | 5 suppliers, 4 cities, категории, атрибуты, упаковки, партии и 10 offers |
| PostgreSQL FTS и pg_trgm | Готово | Cyrillic-safe normalized vector, filters, facets и comparison API |
| CSV/XLSX import и raw rows | Готово | csv-parse, ExcelJS, preview/mapping, validation, retryable async process |
| Matching и moderation | Готово | exact GTIN/SKU, token score, candidates и operator decision |
| Offers/publication/pricing | Готово | Price history, tiers, contracts, normalized package price и publication gates |
| Inventory и партии | Готово | Warehouse balance, lots, FEFO, expiry, registration certificate, recalls |
| Конкурентное резервирование | Готово | Conditional update, idempotency и отдельный Testcontainers race test |
| Freshness и ручные overrides | Готово | Policies per source/data type, expiration actions, protected manual data |
| Cart и split checkout | Готово | Repricing, supplier grouping, rollback/release on failure |
| Supplier order states | Готово | Full/partial/reject confirmation, reservation quantity restoration |
| Payment domain | Готово | Provider adapters, auth/capture/cancel/refund, allocations, fee rounding |
| Payouts/reconciliation/ledger | Готово | Merchant approval, payouts, import/API reconciliation, immutable trigger |
| Integrations | Частично до внешней сертификации | Mock и internal foundation готовы; МойСклад требует real tenant, 1С требует installer/binary/real DB; точный статус хранит Connector Readiness Registry |
| External reservations | Готово | Reserve before supplier confirmation/capture, consume/release lifecycle |
| Logistics | Готово | Zones, methods, price rules, quotes, shipments и fulfillment state machines |
| Documents | Готово | Real PDF/DOCX, S3/local storage, immutable versions, hash, download |
| Electronic signatures | Готово | Mock/SIMPLE plus configurable EDS/eGov QR/external gateway adapters; callback HMAC, timestamp, replay, checksum и BIN certificate checks |
| Marketplace supplier agreement | Готово | Две ЭЦП сторон, ACTIVE только после обеих подписей, 12 месяцев, annual renewal/non-renewal/template supersede, commercial gates, недоступность повторной подписи |
| Promotions и промокоды | Готово | Percentage/fixed/free-shipping, scopes, schedule, coupon hash, limits, redemption idempotency, price evidence и supplier UI |
| Product gaps и loyal reaction | Готово | Versioned incidents, severity, temporary actions, remediation, restoration condition, tenant visibility, appeal и operator decision |
| Verified B2B reviews | Готово | Только по подтверждённому заказу и купленному товару; revision history, anti-fraud flags, supplier response, moderation и appeal |
| Explainable supplier trust | Готово | Weighted metrics 20/15/20/10/10/10/5/5/5, 180-day window, 90-day decay, Bayesian prior, insufficient-data state, event appeal/exclusion |
| Verified geography | Готово | Country/region/city/district/address, coordinates, evidence, operator verification, verified warehouses, radius/region/exclusion zones и delivery events |
| Smart recommendations и fairness | Готово | 5 user modes, landed cost, ETA, distance, trust, freshness, soft/critical risk; sponsored placement отделено и не меняет organic order |
| Owner workspaces | Готово | Buyer/supplier summaries, saved lists, reorder foundation, cost centers и purchase budgets |
| Support и SLA | Готово | Tenant tickets/messages/links, SLA, operator queue, audited impersonation и knowledge base; buyer UI |
| Billing и feature flags | Готово | Plans, trial/grace subscription lifecycle, entitlements, invoices и organization overrides |
| AI assistant | Готово | Tenant-scoped allowlisted trust/geo/commerce tools, prompt-injection/redaction guard, отказ от медицинских советов и автономных критических действий, execution logs и feedback |
| Compliance | Готово | Credentials, versioned rules, risk/decision, manual review, recheck/block |
| Notifications | Готово | In-app/email/SMS/webhook, preferences, durable attempts, backoff/dead letter |
| Redis/BullMQ | Готово | Workers trigger DB-durable import, integration/outbox, search, notification jobs |
| Outbox и idempotency | Готово | Transactional events and domain-specific unique request keys |
| S3/MinIO и antivirus | Готово | Quarantine assets, extension/magic/OOXML checks, S3-compatible storage, bucket init, ClamAV INSTREAM fail-closed adapter |
| Observability | Готово | Pino JSON logs, request/correlation/trace/job IDs, OTel OTLP, Sentry |
| Buyer/Supplier/Admin apps | Готово | Shared Fluent UI and API client; договор с ЭЦП, акции, бюджеты, поддержка и AI доступны в кабинетах |
| Public landing | Готово | Две аудитории, CTA, FAQ, metadata/OpenGraph/Schema.org, responsive layout и собственный product visual |
| Self-registration и onboarding | Готово локально | Buyer/Supplier intent, legal consent, Google/Apple contract, Cyrillic-safe handoff, tab session recovery, supplier profile/warehouse/source forms, 7-step progress |
| Connector readiness v3 | Готово как контрольный слой | 9-step supplier wizard, operator registry, audit updates, owner/runbook/evidence/limitations и честные `INTERNAL_READY` / `CONNECTOR_NEEDED` / `LIVE_VERIFIED` |
| Vitest/Testcontainers/Playwright | Готово | Unit/schema suites, opt-in PostgreSQL container race, four-app E2E включая отрицательный сценарий повторной ЭЦП |
| Docker Compose и health checks | Готово | PostgreSQL, Redis, MinIO, ClamAV, OTel, API, readiness, seed и 4 web apps |
| Backup/restore | Готово | PostgreSQL + object bucket scripts and operational runbook |

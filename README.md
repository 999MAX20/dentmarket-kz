# DentMarket KZ

B2B-маркетплейс для закупок стоматологических клиник Казахстана. Кодовая база остаётся отраслево-независимым TypeScript-монорепозиторием, а стоматология подключена как первая конфигурация каталога, атрибутов, правил и demo data.

## Приложения

- `apps/api` — NestJS modular monolith, OpenAPI и background workers.
- `apps/buyer-web` — поиск, сравнение, корзина, заказы, документы и уведомления клиники.
- `apps/supplier-web` — предложения, цены, остатки, заказы, интеграции и комплаенс поставщика.
- `apps/admin-web` — операционный control plane платформы.
- `apps/landing-web` — публичный двухаудиторный лендинг с SEO и FAQ.
- `apps/e2e` — Playwright-проверки пяти web-приложений и сквозной регистрации.
- `packages/schemas` — общие Zod DTO.
- `packages/api-client` — общий browser API client.
- `packages/ui` — общая Fluent UI дизайн-система.

## Быстрый запуск через Docker

```bash
docker compose up --build
```

Первый запуск ClamAV может занять несколько минут: контейнер загружает актуальные сигнатуры. Миграции применяются API автоматически, затем `seed` создаёт демонстрационный контур.

После запуска:

- API: `http://127.0.0.1:4012/api`
- OpenAPI: `http://127.0.0.1:4012/docs`
- Admin: `http://127.0.0.1:3000`
- Buyer: `http://127.0.0.1:3001`
- Supplier: `http://127.0.0.1:3002`
- Landing: `http://127.0.0.1:3003`
- MinIO console: `http://127.0.0.1:9001`

## Нативный запуск для разработки

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm --filter @marketplace/api exec prisma migrate deploy
pnpm db:seed
pnpm dev
```

Нужны PostgreSQL 17, Redis 7 и, если `AV_SCAN_MODE` не `disabled`, ClamAV. Для локального файлового режима установите `OBJECT_STORAGE_DRIVER=local`.

Seed создаёт development context:

```text
x-user-id: 00000000-0000-4000-8000-000000000002
x-organization-id: 00000000-0000-4000-8000-000000000001
```

Для кабинета клиники создаётся отдельная tenant-role, без операторских прав:

```text
x-user-id: 00000000-0000-4000-8000-000000000500
x-organization-id: 00000000-0000-4000-8000-000000000030
```

В `NODE_ENV=production` такой режим запрещён валидатором конфигурации. Используется `AUTH_MODE=jwt` с проверкой подписи, tenant claims, issuer/audience и опциональным обязательным MFA claim.

## Реализованные контуры

- организации, memberships, RBAC, approval policies, audit и transactional outbox;
- гибридный каталог, типизированные атрибуты, упаковки, PostgreSQL FTS и `pg_trgm`;
- CSV/XLSX import, raw rows, matching, moderation и повторный запуск;
- offers, publication, price history, quantity tiers, contract pricing и freshness policies;
- balances, партии, FEFO, recalls, conditional reservations и manual overrides;
- cart, repricing, split checkout, supplier order state machine;
- payment providers, sessions, authorization, capture, cancellation, partial refunds, allocations, payouts, reconciliation и immutable ledger;
- МойСклад, Mock и pull-only 1С Agent, encrypted credentials, signed webhook inbox, external reservations и DLQ;
- delivery zones/rules/options, quotes, shipments и fulfillment steps;
- PDF/DOCX, S3/MinIO, immutable versions, SHA-256 и подписи Mock/ЭЦП/eGov/external;
- compliance credentials, versioned rules, automatic recheck и publication blocking;
- in-app/email/SMS/webhook notifications с retry/backoff;
- TOTP 2FA и одноразовые recovery codes;
- Google/Apple OIDC linking, проверка email, refresh rotation, CSRF и отзыв сессий;
- годовой договор поставщика с платформой: две ЭЦП, проверенный callback, автоматическая пролонгация и блокировка повторного окна подписи;
- promotions/promocodes, saved lists, cost centers, budgets, SLA support, billing/entitlements и tenant-aware AI assistant;
- закрытые отзывы только по исполненным B2B-заказам, ответ поставщика, модерация и апелляции;
- объяснимый рейтинг поставщика с Bayesian prior, временным затуханием и статусом «недостаточно данных»;
- верифицированная география адресов и складов, delivery zones и фактическая ETA-статистика;
- smart-commerce рекомендации в режимах срочности, цены, баланса, доверия и персональной цены; платное размещение отделено от organic ranking;
- Redis/BullMQ workers для imports/matching, integrations/outbox, search projection и notifications;
- structured JSON logging, request/correlation/trace IDs, OpenTelemetry, Sentry, Helmet и rate limiting;
- quarantine + magic-byte/OOXML validation и ClamAV INSTREAM-проверка загружаемых импортов, документов и сертификатов.

Актуальное ТЗ Trust/Geo/AI: [`Dental_Marketplace_Technical_Plan_v2_Trust_Geo_AI.docx`](/Users/maksim/Desktop/Dental_Marketplace_Technical_Plan_v2_Trust_Geo_AI.docx). Карта реализации: [`docs/trust-geo-ai.md`](docs/trust-geo-ai.md).

Матрица покрытия ТЗ: [`docs/traceability.md`](docs/traceability.md). Эксплуатация: [`docs/operations.md`](docs/operations.md). Модель безопасности: [`docs/security.md`](docs/security.md).

## Проверки

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:search-commerce
pnpm verify:document-compliance
pnpm verify:security
pnpm verify:onboarding-agreement
pnpm verify:trust-geo
pnpm verify:production-config
pnpm verify:web
```

Опциональный PostgreSQL concurrency test через Testcontainers:

```bash
pnpm test:containers
```

## Backup и restore

```bash
./scripts/backup.sh
RESTORE_CONFIRM=20260717T000000Z ./scripts/restore.sh /absolute/path/to/backups/20260717T000000Z
```

Скрипты сохраняют PostgreSQL custom dump, объектный bucket и manifest с количеством применённых миграций.

Production deployment, immutable image release, managed-service backup and rollback: [`docs/production-deployment.md`](docs/production-deployment.md).

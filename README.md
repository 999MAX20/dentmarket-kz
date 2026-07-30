# DentMarket KZ — полный статус проекта

## 1. Что это за продукт

DentMarket KZ — отраслево-независимая B2B-платформа закупок. Первая активная вертикаль — стоматология Казахстана. Архитектура поддерживает отдельные каталоги и правила для других профессиональных сфер: Beauty, косметология, парикмахерские, nail, SPA, медицина, лаборатории, HoReCa и других.

Главная бизнес-модель:

```text
Canonical-карточка DentMarket
        ├── Offer поставщика A
        ├── Offer поставщика B
        └── Offer поставщика C
```

Карточка принадлежит платформе и не дублируется для каждого поставщика. Поставщик добавляет к ней собственные SKU, цену, остаток, склад, срок поставки и условия.

## 2. Текущее состояние в одном абзаце

Технически платформа развита: есть API, кабинеты, каталог, поиск, импорт XLSX/CSV/PDF, matching, договоры ЭЦП, compliance, корзина, разбиение заказа, платежный контур, документы, уведомления, рейтинг поставщиков, география, интеграционные адаптеры, RBAC и аудит.

Стоматологический каталог количественно сформирован: в последнем зафиксированном аудите — 10 363 canonical-карточки в статусе DRAFT, с вариантами, категориями, отраслью и поисковыми документами. Они не означают 10 363 коммерчески активных товара: реальные цены, остатки, договоры и подтверждённые offers поставщиков должны подключаться отдельно.

Beauty подготовлен архитектурно и уже загружен в локальную БД: 12 поставщиков, 44 брендовые позиции, 12 категорий, onboarding-очередь, публичный intake UCG и 217 локальных DRAFT-карточек с вариантами. UCG intake содержит 218 исходных строк, 218 официальных изображений и 218 описаний; одна повторная canonical-карточка объединяется по идентичности. Offers, цены и остатки для них не создавались.

## 3. Репозиторий и приложения

```text
apps/api             NestJS modular monolith, Prisma, OpenAPI, workers
apps/buyer-web       магазин и кабинет клиники
apps/supplier-web    кабинет поставщика
apps/admin-web       операционный control plane
apps/landing-web     публичная навигация, регистрация, SEO/FAQ
apps/mobile          Expo-заготовка мобильного клиента
apps/e2e             Playwright E2E и mobile E2E
packages/schemas     общие Zod DTO и контракты
packages/api-client  общий API client
packages/ui          общий UI-слой
data                 каталоги, источники, очереди, отчёты и intake
scripts               импорт, crawling, аудит, backup, нагрузочные проверки
docs                  архитектура, runbooks, ADR и матрица ТЗ
supabase               конфигурация Supabase
infra                  OTEL, Caddy и инфраструктурные конфиги
```

## 4. Реализованные бизнес-модули

### Организации и доступ

- организации, пользователи, memberships и роли;
- RBAC/permissions и tenant isolation;
- роли клиники, поставщика, оператора и администратора;
- approval policies;
- переключение организаций и отраслей с permission gate;
- аудит действий и transactional outbox;
- onboarding registration intent;
- отрасль организации хранится в `primaryIndustryId`;
- каталог покупателя фильтруется по отрасли организации.

### Аутентификация

- email/password login;
- refresh rotation и отзыв сессий;
- проверка email;
- Google/Apple OIDC linking;
- CSRF protection;
- TOTP 2FA и recovery codes;
- rate limiting и ограничение неудачных попыток;
- security log и блокировка сценариев при подозрительной активности;
- одноразовый handoff между магазином и кабинетом вместо access token в URL;
- access token в URL не используется.

Демо-логины разрешены только в development-режиме. В production development onboarding должен быть заблокирован.

### Каталог

- Product, ProductVariant, Brand, Manufacturer, UnitOfMeasure;
- ProductCategory и ProductIndustry;
- typed attributes и category attribute rules;
- canonical identity и source records;
- manufacturer/SKU/GTIN aliases;
- варианты фасовок, оттенков, размеров и исполнений;
- product search document;
- public catalog fallback;
- карточка товара с описанием, фото, характеристиками и источником;
- отдельные предложения поставщиков;
- отсутствие коммерческого offer не удаляет canonical-карточку.

### Поиск

- поиск по названию, бренду, SKU и GTIN;
- стоматологический профессиональный сленг;
- более 100 alias-групп и исправления типовых опечаток;
- поиск по раскладке клавиатуры;
- точные совпадения усиливаются в ranking;
- фасовка, единица, доставка и наличие;
- сортировка по релевантности, цене и популярности;
- подсказки и история поисковых запросов;
- SearchQueryEvent и операторская аналитика;
- запросы без результата отслеживаются.

### Импорт поставщиков

Поддерживаются:

- Excel/XLSX;
- CSV;
- PDF с извлечением таблиц и OCR-подготовкой;
- ручной supplier API;
- MySklad adapter;
- pull-only 1C Agent adapter;
- custom API adapter;
- сохранение raw rows;
- tenant-specific column mapping;
- supplier external item;
- matching по SKU, GTIN, бренду и названию;
- mapping memory;
- ручной override и версии mapping;
- очередь ошибок импорта;
- повторная загрузка без дублей;
- идемпотентность по `sourceId + externalId`.

Обязательные поля для canonical-карточки: `externalId` и `name`. Цена, валюта и остаток не обязательны для создания карточки, но обязательны для коммерческой публикации offer.

### Offers и коммерция

- supplier offers;
- draft/active/publication state machine;
- price history;
- contract prices;
- quantity tiers;
- остатки и freshness policy;
- склады;
- партии, FEFO и recalls;
- conditional reservations;
- manual override;
- автоматическая публикация только при выполнении всех gates;
- supplier confirmation;
- импорт price/stock отдельным этапом после создания карточки.

### Договоры и ЭЦП

Реализован договорный gate через `MarketplaceAgreementsService.assertActive()` для:

- публикации offer;
- marketplace visibility;
- supplier confirmation;
- checkout и offer resolution;
- payment capture;
- внешнего order export.

Поддержаны:

- версия договора;
- две подписи;
- callback ЭЦП;
- HMAC/replay/checksum validation;
- BIN и certificate expiry checks;
- ежегодная пролонгация;
- блокировка повторного окна подписи при активном договоре;
- fail-closed при отсутствии или окончании договора.

Реальный EDS gateway пока не подключён: используется mock/provider-independent adapter и подготовленный контракт внешнего gateway.

### Корзина и заказы

- demo-cart для карточек без реального offer;
- quantity control;
- repricing;
- split checkout по поставщикам;
- supplier order state machine;
- одноразовый заказ без рамочного договора;
- framework agreement mode при активном договоре buyer-supplier;
- invoice flow;
- отмены, возвраты и статусы заказа;
- supplier confirmation;
- reservation и inventory checks;
- external order export.

### Оплата и документы

- payment sessions;
- authorization/capture/cancel;
- partial refunds;
- allocations;
- payouts;
- reconciliation;
- immutable ledger;
- invoice rules;
- PDF/DOCX generation;
- immutable document versions;
- SHA-256;
- mock signature, eGov and external signature adapters;
- подготовка PSP sandbox.

### Compliance

- compliance credentials;
- versioned rules;
- автоматическая повторная проверка;
- блокировка публикации;
- регулируемые товары;
- lot/expiration checks;
- manual review;
- статусы `READY`, `REVIEW_REQUIRED`, `DOCUMENT_REQUIRED`, `BLOCKED`, `EXPIRED`.

### Поставщики и onboarding

Readiness-цепочка проверяет:

```text
organization
  → credentials
  → warehouse
  → data source
  → import
  → matching memory
  → compliance
  → EDS agreement
  → offer
  → price
  → fresh stock
```

Есть endpoint `/api/suppliers/:supplierOrganizationId/onboarding-readiness` и supplier onboarding progress.

### Отзывы, доверие и рекомендации

- комментарии и отзывы только после исполненного B2B-заказа;
- ответ поставщика;
- модерация и апелляция;
- Bayesian supplier rating;
- temporal decay;
- статус «недостаточно данных»;
- trust score;
- smart-commerce recommendations;
- режимы срочности, цены, доверия, персональной цены и наличия;
- sponsored placement отделён от organic ranking.

### География и доставка

- город покупателя;
- адреса и склады;
- верифицированная география;
- delivery zones;
- delivery rules/options;
- quotes;
- shipment и fulfillment steps;
- фактическая ETA-статистика.

### Уведомления

- in-app;
- email;
- SMS adapter;
- webhook;
- retry/backoff;
- push adapter подготовлен;
- notification preferences;
- события заказов, импорта, договора и безопасности.

### Интеграции

- MySklad adapter — контракт и кодовая готовность;
- 1C Agent — pull-only adapter и контракт;
- custom supplier API;
- encrypted credentials;
- signed webhook inbox;
- external reservations;
- dead-letter queue;
- outbox/integration workers;
- provider-independent registry.

Реальные tenant credentials и production-подключения не подтверждены.

## 5. Стоматологический каталог

По последнему статусному аудиту:

- 10 363 canonical-карточки;
- 0 карточек без `ProductVariant`;
- 0 карточек без `ProductCategory`;
- 0 карточек без `ProductIndustry`;
- 10 363 поисковых документа;
- 10 168 строк mapping review;
- источники: Denti.kz, AMDgroup, Dentalmarket, DM Market, DDD, Mediclus, NORD STOM, СТОМир, Profident-S и другие;
- импортированные карточки остаются DRAFT до supplier confirmation;
- цены и остатки из публичных источников не превращаются автоматически в активные offers.

Важно: «карточка готова» означает, что canonical-структура существует. Это не означает, что товар доступен к заказу: для этого нужны offer, цена, свежий остаток, compliance и договорный gate.

## 6. Beauty-вертикаль

### Готово

- отрасль `beauty-kz` зарегистрирована и пока не активна для свободного production-публикации;
- 12 Beauty-категорий;
- 10 Beauty-атрибутов;
- category attribute rules;
- Beauty search lexicon и базовые синонимы;
- draft compliance rules `BEAUTY.PROFESSIONAL_USE` и `BEAUTY.SHELF_LIFE`;
- 12 поставщиков в реестре;
- 44 брендовые позиции;
- onboarding queue CSV/JSON;
- catalog-only CSV-шаблоны для всех 12 поставщиков;
- canonical intake policy;
- UCG public catalog crawler;
- 218 товарных строк UCG в intake с публичными изображениями, описаниями и source URL;
- 217 локальных UCG canonical-карточек после bootstrap;
- canonical intake report.

### Поставщики в очереди

PROФФ-KZ, UCG/Aesthetics Group, VLAEKAN, DD Business, LaBeauty, Futora, Janssen Cosmetics Kazakhstan, Beeyoung, Keune Kazakhstan/Antara Global, AIF Cosmetics, NICKOL, Fox Beauty House.

### Пока не готово

- UCG-карточки записаны в локальную БД как DRAFT; в production они ещё не синхронизированы;
- полный товарный intake остальных поставщиков не собран;
- документы, BIN и полномочия на бренды не подтверждены;
- Beauty-категории остаются inactive до сертификации;
- Beauty offers, цены, остатки и коммерческие договоры не подключены;
- полноценная Beauty-публикация в production не разрешена.

Файлы:

- `data/verticals/beauty-kz/supplier-brand-registry.json`;
- `data/verticals/beauty-kz/canonical-intake-policy.json`;
- `data/intake/beauty-kz/ucg-kz.csv`;
- `data/reports/beauty-kz/canonical-intake-report.md`;
- `data/reports/beauty-kz/supplier-onboarding-queue.csv`.

## 7. Безопасность

Реализовано на уровне кода:

- tenant isolation;
- RBAC;
- JWT validation;
- refresh rotation;
- CSRF;
- rate limits;
- security audit log;
- MFA/TOTP;
- recovery codes;
- encrypted integration credentials;
- file quarantine;
- magic-byte validation;
- OOXML validation;
- ClamAV INSTREAM;
- Helmet;
- CSP-конфигурация;
- request/correlation/trace IDs;
- JSON structured logs;
- Sentry/OTEL hooks;
- signed webhooks;
- HMAC/replay protection;
- idempotency keys;
- immutable ledger and document hashes;
- fail-closed gates.

Не закрыто полностью:

- production DAST/pentest;
- окончательное удаление всех inline-механизмов CSP требует отдельной production-проверки;
- production restore drill не подтверждён в этом окружении;
- production alerts/Sentry/OTEL alert tests требуют внешних credentials;
- ротация production secrets и проверка облачного vault требуют доступа к инфраструктуре.

## 8. Тесты и проверки

Фактически выполнено в текущем окружении:

- API typecheck — PASS;
- API tests: 36 test files, 115 passed, 1 skipped;
- buyer-web typecheck — PASS;
- buyer-web tests: 5 files, 24 passed;
- Beauty registry validation — PASS;
- Beauty onboarding queue generation — PASS;
- Beauty template generation — PASS;
- Beauty canonical intake audit — PASS;
- UCG public crawler — PASS, 218 rows, 218 images, 218 descriptions;
- multi-industry canonical bootstrap typechecked by formatting/static review, но DB-run заблокирован отсутствующим `DATABASE_URL`.

Команды:

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
pnpm verify:web:mobile
pnpm test:containers
```

Специализированные команды:

```bash
pnpm catalog:validate-variants
pnpm catalog:report-quality
pnpm catalog:build:beauty-brand-registry
pnpm catalog:validate:beauty-brand-registry
pnpm catalog:build:beauty-onboarding-queue
pnpm catalog:build:beauty-templates
pnpm catalog:audit:beauty-canonical-intake
pnpm catalog:crawl:beauty-ucg
pnpm verify:security-storage
pnpm load-test:search
pnpm load-test:handoff
```

Что ещё требуется проверить отдельно:

- полный E2E клиника → поиск → карточка → корзина → checkout → заказ;
- production E2E с реальными credentials;
- frontend unit coverage всех кабинетов;
- DAST/pentest;
- performance/load testing production;
- mobile E2E на iOS/Android;
- restore drill в целевом облаке.

## 9. Production и deployment

Кодовая база подключена к GitHub:

- репозиторий: `https://github.com/999MAX20/dentmarket-kz`;
- рабочая ветка текущей серии: `codex/production-hardening`;
- последний push: commit `d479344`.

Известный публичный storefront:

- `https://dentmarket-shop.vercel.app`

Локальные порты:

```text
API       http://127.0.0.1:4012/api
OpenAPI   http://127.0.0.1:4012/docs
Admin     http://127.0.0.1:3000
Buyer     http://127.0.0.1:3001
Supplier  http://127.0.0.1:3002
Landing   http://127.0.0.1:3003
MinIO     http://127.0.0.1:9001
```

Запуск:

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm --filter @marketplace/api exec prisma migrate deploy
pnpm db:seed
pnpm dev
```

Docker:

```bash
docker compose up --build
```

Production deployment не считается подтверждённым только по push в GitHub. Нужны:

- правильная Vercel project/branch binding;
- production `DATABASE_URL`;
- Supabase migrations;
- production secrets;
- EDS gateway credentials;
- PSP sandbox/production credentials;
- OAuth Client IDs;
- email/SMS provider;
- object storage;
- Sentry/OTEL;
- DNS/TLS;
- smoke/E2E после deployment.

В текущей рабочей сессии найден и подключён локальный PostgreSQL `dental_marketplace`. Production `DATABASE_URL` по-прежнему не подтверждён и production-sync не выполнялся.

## 10. Мобильное приложение

`apps/mobile` создан как Expo-клиент с общими API contracts и готовой точкой подключения к тем же API.

Готово:

- Expo workspace;
- команды start/ios/android/web;
- TypeScript configuration;
- общий API client direction;
- возможность подключить тот же каталог, auth и checkout.

Не готово:

- полноценные mobile screens;
- native auth/OIDC;
- push permissions и device token registration;
- mobile checkout;
- App Store/Google Play signing;
- mobile E2E и performance certification.

Мобильный клиент не должен подключаться к отдельной бизнес-логике: он должен использовать те же API и те же отраслевые/catalog contracts.

## 11. Что нужно сделать для production в правильном порядке

### P0 — обязательно

1. Подключить production `DATABASE_URL` и проверить Supabase migrations.
2. Выполнить Beauty canonical import после появления реального DB connection.
3. Проверить весь production E2E: регистрация → поиск → карточка → корзина → заказ.
4. Подключить реальный EDS gateway sandbox.
5. Подключить PSP sandbox.
6. Убедиться, что договорный gate блокирует публикацию и заказ без активного договора.
7. Настроить реальные OAuth/email credentials.
8. Провести production smoke и rollback check.

### P1 — коммерческая активация

1. Получить BIN и документы первых поставщиков.
2. Получить XLSX/CSV/PDF каталоги.
3. Выполнить mapping и модерацию.
4. Подтвердить лицензии и regulated goods.
5. Создать склады и источники.
6. Подписать договор ЭЦП.
7. Загрузить price/stock.
8. Провести тестовый заказ по 3–5 поставщикам.
9. Настроить 1С Agent и реальный MySklad tenant.

### P2 — эксплуатационная зрелость

1. Signed 1C Agent и реальная база 1С.
2. Полный frontend unit coverage.
3. DAST/pentest.
4. Load/performance testing.
5. Backup restore drill.
6. Sentry/OTEL alert tests.
7. DNS/TLS и production alerts.
8. SLA и incident response rehearsal.
9. Mobile app E2E и публикация.

## 12. Команды для поставщиков и Beauty

```bash
# Проверка реестра брендов
pnpm catalog:validate:beauty-brand-registry

# Очередь onboarding
pnpm catalog:build:beauty-onboarding-queue

# Шаблоны без цены и остатков
pnpm catalog:build:beauty-templates

# Публичный intake UCG
pnpm catalog:crawl:beauty-ucg

# Аудит canonical-ready строк
pnpm catalog:audit:beauty-canonical-intake
```

После подключения БД импорт canonical-карточек для Beauty:

```bash
CANONICAL_INDUSTRY_CODE=beauty-kz \
node scripts/bootstrap-canonical-catalog.mjs \
data/intake/beauty-kz/ucg-kz.csv
```

## 13. Backup и restore

```bash
./scripts/backup.sh
RESTORE_CONFIRM=20260717T000000Z \
./scripts/restore.sh \
/absolute/path/to/backups/20260717T000000Z
```

Backup должен включать PostgreSQL custom dump, object bucket и migration manifest. Фактический production restore drill требует доступа к целевой инфраструктуре.

## 14. Главный вывод

DentMarket уже не является только UI-прототипом: основные платформенные и коммерческие блоки реализованы в коде, стоматологический canonical-каталог сформирован, а схема «одна карточка — много поставщиков» заложена правильно.

Но production-магазином с полностью боевыми продажами систему можно считать только после подключения внешних credentials, реальной БД, EDS/PSP, поставщиков, цен/остатков, production E2E и эксплуатационной сертификации.

Для Beauty правильная последовательность уже подготовлена: сначала canonical-карточки и бренды, затем supplier mapping, потом price/stock offers, 1С/MySklad и автоматическое обновление.

## 15. Связанные документы

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/traceability.md`](docs/traceability.md)
- [`docs/security.md`](docs/security.md)
- [`docs/operations.md`](docs/operations.md)
- [`docs/production-go-live-checklist.md`](docs/production-go-live-checklist.md)
- [`docs/production-deployment.md`](docs/production-deployment.md)
- [`docs/connector-readiness.md`](docs/connector-readiness.md)
- [`docs/v4-implementation-status.md`](docs/v4-implementation-status.md)
- [`docs/beauty-kz-supplier-brand-registry.md`](docs/beauty-kz-supplier-brand-registry.md)
- [`data/reports/beauty-kz/canonical-intake-report.md`](data/reports/beauty-kz/canonical-intake-report.md)

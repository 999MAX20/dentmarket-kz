# Trust, Geo и AI: карта реализации

Источник: `Dental_Marketplace_Technical_Plan_v2_Trust_Geo_AI.docx`, разделы 16–26.

## Product gaps

- Инцидент хранит type, severity, reason, explanation, action, expiration, remediation и restoration condition.
- Мягкие реакции могут скрыть скидку, снизить ранг, потребовать подтверждение, приостановить или отключить сравнение. Hard block доступен operator workflow.
- Апелляция версионна, имеет evidence и явное operator decision.

## Reviews и trust rating

- Отзыв доступен покупателю только по его подтверждённому B2B-заказу; product target должен присутствовать в заказе.
- Применены one-review constraint, 14-day revision history, PII/burst anomaly flags, ответ поставщика, moderation и appeal.
- Веса рейтинга: availability 20%, price accuracy 15%, confirmation 20%, completeness 10%, delivery 10%, documents 10%, communication 5%, returns 5%, reviews 5%.
- Окно 180 дней, half-life 90 дней, Bayesian prior. Менее 5 событий дают `INSUFFICIENT_DATA` и `score=null`.

## Geography и recommendations

- Address и Warehouse хранят район, координаты, verification status/method/evidence и version. Любое изменение требует повторной верификации.
- Delivery zone поддерживает radius, region codes и city exclusions. Фактические исполнения хранятся в delivery performance events.
- Recommendation engine имеет `URGENT`, `VALUE`, `BALANCED`, `TRUSTED`, `PERSONAL_PRICE`; считает landed cost, ETA, distance, trust, geo, freshness и risk.
- Organic scenarios не изменяются платным размещением. Sponsored list имеет явный label, feature flag и не может обойти critical risk.

## UI и AI

- Buyer: «Город и рекомендации», пять режимов, verified address, organic и sponsored blocks.
- Supplier: «Доверие и география», score factors, indicators, incidents, reviews и verified warehouses.
- Admin: Trust & Smart Commerce operations queue, incident decision и explainable ratings.
- AI tools выдают только tenant-scoped read context. Медицинские советы и autonomous critical commerce actions отклоняются.

## Проверка

```bash
pnpm typecheck
pnpm test
DATABASE_URL=... API_URL=http://127.0.0.1:4012/api pnpm verify:trust-geo
pnpm verify:web
```

Live verification покрывает rating/insufficient-data, recommendation fairness и idempotency, geo reset/reverification, incident appeal, реальный checkout и verified review, supplier response, private order comment, rating appeal и AI refusals.

Финальная сертификация: 16/16 миграций с нуля, двойной idempotent seed, полный smoke на чистой базе и 8/8 Playwright-сценариев.

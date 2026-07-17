# Целевая архитектура

## Решение

Платформа создаётся как TypeScript-монорепозиторий и модульный монолит. Доменные модули имеют собственные application interfaces. Прямой доступ одного модуля к внутренним таблицам другого модуля запрещён.

Первая конфигурация `dentistry-kz` состоит из данных: отрасли, таксономии, атрибутов, compliance-правил и UI-конфигурации. Общие модели не содержат стоматологических названий.

## Приложения

- `api`: NestJS REST API, фоновые workers и OpenAPI.
- `admin-web`: управление организациями, каталогом, импортом и операционными исключениями.
- `supplier-web`: предложения, цены, остатки, заказы и документы поставщика.
- `buyer-web`: поиск, закупки, согласование и отслеживание заказов.

## Доменные границы

| Модуль | Ответственность |
| --- | --- |
| identity | Пользователь, аутентификация, 2FA, сессии |
| organizations | Организации, capabilities, memberships, филиалы |
| access-control | Role, Permission, assignments, permission evaluation |
| approvals | ApprovalPolicy, условия и решения согласующих |
| geography | Страны, регионы, города и адреса |
| industries | Отрасли и конфигурация вертикалей |
| catalog | Категории, бренды, производители, товары, варианты и атрибуты |
| suppliers | Профили поставщиков, склады и источники данных |
| imports | Файлы, batches, raw rows и column mapping |
| matching | Нормализация, кандидаты и объяснимый score |
| pricing | Публикации, цены, история, tiers и contract pricing |
| inventory | Balances, lots, reservations, FEFO и recalls |
| orders | Cart, Checkout, SupplierOrder и state machines |
| payments | Intents, allocations, ledger, refunds и reconciliation |
| integrations | Connections, bindings, mappings, adapters, jobs, webhooks и external reservations |
| audit | Неизменяемый журнал критических действий |

## Сквозные механизмы

- PostgreSQL является источником истины.
- Transactional outbox записывается в транзакции с доменным изменением.
- Все повторяемые write-операции используют сохранённый idempotency key.
- Конкурентное резервирование использует row lock или conditional update.
- Изменяемые агрегаты имеют optimistic `version`.
- Статусы меняются только через domain transition services.
- Денежные суммы хранятся как `Decimal`, валюта указывается явно.
- История цен и financial ledger являются append-only.

## Integration layer

`IntegrationConnection` связывает одного поставщика и управляемый `SupplierDataSource` с провайдером, режимом, зашифрованными credentials и операционным состоянием. Архитектура не делает 1С центром доменной модели: типы данных (`CATALOG`, `PRICE`, `INVENTORY`, `ORDER`, `RESERVATION` и другие), области `IntegrationDataBinding` и `IntegrationMapping` одинаковы для МойСклад, 1С и следующих adapters.

МойСклад и Mock выполняются server-side adapter-ами. МойСклад adapter использует Bearer token, официальный Remap 1.2 API, пагинацию, продукты и модификации, типы цен, остатки по складам и retryable обработку 429/5xx. 1С работает только исходящим HTTPS pull-agent: enrollment выдаёт одноразовый token, далее agent отправляет heartbeat, забирает задания и завершает их тем же durable protocol. Входящее соединение из маркетплейса в сеть 1С не требуется.

`IntegrationSyncJob` является durable queue с idempotency key, атомарным `FOR UPDATE SKIP LOCKED` claim, exponential backoff, восстановлением просроченного claim и `DEAD_LETTER`. Webhook сначала сохраняется в deduplicated inbox с результатом проверки HMAC, затем создаёт incremental sync. Payment outbox ставит экспорт оплаченного supplier order в ту же очередь.

Проекция внешних цен и остатков не перезаписывает активный `MANUAL` источник без `allowOverwriteManual`. Обновление остатка сохраняет локальный reserved и safety stock, учитывает внешний available и отклоняется в reconciliation, если внешний on-hand нарушит существующие резервы или сумму отслеживаемых партий. Успешный повтор автоматически закрывает ранее обнаруженное расхождение.

Checkout сначала создаёт локальный условный резерв, затем обязательный `ExternalReservation` для подходящего binding. Синхронные adapters должны вернуть `ACTIVE`; 1С может вернуть `PENDING`, но supplier confirmation и payment capture блокируются до `ACTIVE`. Capture атомарно переводит внешний резерв в `CONSUMED` вместе с локальным списанием.

Credentials и webhook secrets хранятся как AES-256-GCM ciphertext и никогда не входят в read DTO. Production требует явный `INTEGRATION_ENCRYPTION_KEY`; одноразовые enrollment/access tokens хранятся только как SHA-256 hash.

## Identity adapter

Домен доступа не зависит от конкретного identity provider. Локальный `development` adapter читает `x-user-id` и `x-organization-id` и запрещён валидатором environment в production. JWT adapter проверяет подпись HS256 либо RS256/ES256, issuer, audience, subject, tenant claims и опциональный MFA `amr`, затем заменяет непроверенные context headers. Permission guard после этого всё равно требует активную membership. TOTP factor хранит AES-256-GCM secret, hashed recovery codes, lockout и audit trail.

## Каталог

Каталог использует гибридную схему: нормализованные ключевые поля, типизированные dynamic attribute values, JSONB только для raw/external metadata и отдельный `ProductSearchDocument`. Поиск MVP строится на PostgreSQL FTS и `pg_trgm`.

`Product.version` участвует в conditional update. Клиент обязан передать прочитанную версию; при параллельном изменении API отвечает HTTP 409 и не создаёт audit/outbox для проигравшей операции.

## Политики согласования

`ApprovalPolicy.conditions` содержит проверяемый набор условий: диапазон суммы в минимальных денежных единицах, валюты, категории, regulatory classes, поставщики, филиалы и признак срочности. `approvalSteps` хранит упорядоченные этапы с кодами ролей и требуемым количеством согласований.

Evaluator рассматривает только `ACTIVE`-политики активной организации, требует совпадения всех заданных в политике условий и возвращает все применимые политики по `priority`, затем по стабильному идентификатору. Изменение политики также защищено `version` и conditional update.

## Аудит

Audit API всегда ограничивает выборку `x-organization-id`. Фильтры не могут расширить tenant scope. Записи успешных доменных изменений и outbox-события создаются в одной транзакции; конфликт версий не оставляет ложного audit event.

## Supplier data

`SupplierProfile` расширяет универсальную `Organization` с capability `SUPPLIER`, не создавая отдельный несовместимый тип компании. Доступ разрешён самой организации или организации с capability `MARKETPLACE_OPERATOR`; проверка всё равно начинается с permission guard.

Импорт разделён на `SupplierDataSource`, `ImportBatch` и неизменённые `ImportRow.rawData`. CSV разбирается через `csv-parse`, Excel — через `exceljs`. Column mapping переводит внешние колонки в нормализованную проекцию, но исходная строка не перезаписывается. Matching использует GTIN, SKU и token similarity, хранит score/reasons и требует явного подтверждения.

Коммерческие состояния разделены:

- `SupplierOffer` связывает поставщика, вариант и единицу продажи;
- `OfferPublication` управляет видимостью;
- `OfferPrice` хранит одну активную цену;
- `OfferPriceHistory` является append-only;
- `InventoryBalance` хранит остаток по складу и SKU;
- `InventoryLot` хранит партии, сроки годности и FEFO-порядок;
- `InventoryReservation` является idempotent foundation для будущего `SupplierOrderItem`.

Публикация требует активную цену и свежий положительный остаток. Conditional update не позволяет двум резервам превысить `quantityAvailable`. Синхронизация on-hand сохраняет существующий reserved quantity и отклоняется, если новый остаток нарушит уже созданные резервы или safety stock.

### Moderation

Если import item не получает match candidate выше минимального score, система создаёт `ProductCandidate`. Решение оператора append-only фиксируется в audit/outbox. Approval в одной транзакции создаёт классифицированные `Product` и `ProductVariant`, связывает исходную supplier row с вариантом и закрывает candidate. Rejection сохраняет причину и не удаляет raw row.

### Pricing resolution

Pricing resolver детерминирован и применяет приоритет:

1. активная `ContractPrice` для покупателя;
2. наиболее высокая подходящая ступень `OfferPriceTier`;
3. текущая базовая `OfferPrice`;
4. `UNAVAILABLE`, если действующего правила нет.

Диапазоны tiers не могут пересекаться. При замене договорной цены предыдущая запись становится `INACTIVE`; partial unique index гарантирует одну активную договорную цену для buyer/offer.

### Freshness и recalls

`InventoryFreshnessService` выполняется планировщиком и доступен для ручного запуска. Устаревший balance получает `STALE`; offer без другого свежего доступного balance переводится из `PUBLISHED` в `PAUSED` и скрывается.

`LotRecall` имеет одну активную запись на партию. Создание recall атомарно обнуляет доступность партии, пересчитывает balance, приостанавливает публикацию при отсутствии остатка и сохраняет IDs затронутых reservations. Закрытие recall переводит партию только в `UNDER_REVIEW`: автоматического возврата в доступный остаток нет.

## Commerce skeleton

`CartItem` хранит выбранное количество и полный pricing snapshot: версию offer, источник правила (`CONTRACT`, `TIER` или `BASE`), rule ID, unit price, total и момент расчёта. Добавление позиции и явный reprice используют тот же resolver. Checkout не доверяет snapshot корзины вслепую: цена, публикация, freshness, доступный balance, minimum quantity и order increment проверяются повторно.

Один `Checkout` создаёт по одному `SupplierOrder` на поставщика. Каждая строка заказа связывается с одним `InventoryReservation`; idempotency key строится из checkout и order item. Если хотя бы один резерв не создан, ранее созданные резервы освобождаются, checkout получает `FAILED`, а supplier orders становятся `CANCELLED`. Успешный путь закрывает корзину только после всех резервов.

Supplier подтверждает все строки одним решением. Accepted quantity может быть меньше requested quantity; разница атомарно возвращается в balance и активную lot, reservation уменьшается, а order получает `CONFIRMED`, `PARTIALLY_CONFIRMED` или `REJECTED`. Повтор того же решения безопасен, другое решение после terminal state возвращает conflict.

## Payments и ledger

Payment intent создаётся только после terminal decision каждого supplier order. Для каждого подтверждённого заказа формируется `PaymentAllocation`: gross, platform fee 2% и supplier net. PostgreSQL CHECK гарантирует `gross = fee + net` и запрещает отрицательные суммы.

Mock capture использует conditional state claim `PENDING -> PROCESSING`, поэтому параллельные запросы создают только один `PaymentAttempt`. Capture переводит allocations в `CAPTURED`, supplier orders в `PAID`, reservations в `CONSUMED` и атомарно списывает reserved quantity из on-hand balance/lot. Затем добавляются две группы проводок: supplier payable и marketplace revenue. Сумма ledger entries равна captured total. Таблица ledger защищена trigger, запрещающим `UPDATE` и `DELETE`; исправления должны оформляться новыми компенсирующими проводками.

Provider layer поддерживает onboarding/verification merchant accounts, payment sessions, authorization, partial capture, cancellation, partial refund, payouts и reconciliation import/API. Capability matrix не позволяет использовать неподдерживаемую операцию провайдера.

## Логистика, документы и комплаенс

Delivery options разделены от offers и включают метод, geography, lead time, temperature/installation flags и price type. Versioned rules формируют quote; `Shipment` и `FulfillmentStep` меняются только разрешёнными transition services.

Документы формируются в PDF/DOCX из versioned templates, сохраняются в S3-compatible storage, получают SHA-256 и immutable relation к предыдущей версии. Signature adapter registry поддерживает локальные методы и внешние ЭЦП/eGov gateways.

Compliance rules версионируются по effective window и применяются к seller, buyer, offer, warehouse и lot. Credential validity, required credential types и risk decision могут автоматически блокировать публикацию и checkout, а manual review оставляет audit/outbox.

## Trust, geography и smart commerce

`ProductGapIncident` хранит причину, срок, временную реакцию, план исправления и условие восстановления. Hard block доступен только platform operator; поставщик и затронутый tenant видят объяснение и могут апеллировать.

`VerifiedReview` возникает один раз на organization/order/target и только после допустимого статуса реального B2B-заказа. События исполнения формируют рейтинг: метрики взвешены, старые события затухают, Bayesian prior защищает малую выборку, а новый поставщик получает `INSUFFICIENT_DATA`, а не ложно низкую оценку.

Изменение адреса или склада сбрасывает geo-статус в `PENDING`; `VERIFIED` возвращается проверенным operator workflow с evidence. Recommendation engine считает landed cost, ETA, distance, trust и freshness, применяет temporary gap actions и хранит версию решения. Sponsored offers вычисляются отдельно, маркируются и не меняют organic ranking.

## Очереди и observability

BullMQ является execution plane для import/matching, integrations/outbox, search projection и notifications. PostgreSQL остаётся durable source: очередь только будит handler, а domain record хранит attempts, locks, result и dead-letter state. При отключённом Redis development использует безопасный inline fallback; production требует Redis.

Pino пишет structured JSON с request/correlation/trace IDs. OpenTelemetry автоматически инструментирует HTTP, Nest и PostgreSQL и экспортирует OTLP. Sentry получает необработанные exceptions без default PII. Helmet, CORS allowlist, global throttling и ClamAV дополняют application security.

## Последовательность

1. 1A: platform foundation, organizations, RBAC, geography, catalog — реализовано.
2. 1B: suppliers, warehouses, import, matching, offers, pricing, inventory lots — реализовано.
3. 1C: cart, checkout, supplier orders, reservations, mock payments — реализовано.
4. 2A: provider-independent integrations, МойСклад и 1С Agent protocol — реализовано; tenant credentials и установка 1С binary относятся к rollout.
5. 2B: provider payment domain, payouts и reconciliation — реализовано; production acquiring credentials относятся к rollout.
6. Logistics, documents, signatures, compliance и notifications — реализовано.
7. Buyer, supplier и admin applications на общей UI/API системе — реализовано.
8. Security, queues, observability, Docker, backup и full verification — реализовано.
9. Trust/Geo/AI phases A–I: incidents, verified reviews, trust rating, verified geography, fair recommendations, UI и AI guardrails — реализовано.

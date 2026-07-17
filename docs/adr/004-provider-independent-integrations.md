# ADR 004: Provider-independent integration layer

## Статус

Принято.

## Контекст

Поставщики используют МойСклад, разные конфигурации 1С, файлы и будущие API. Привязка доменной модели к одной ERP сделала бы каталог, цены, остатки и заказы зависимыми от форматов конкретного поставщика и потребовала бы входящего доступа в локальные сети.

## Решение

Использовать единый integration contract из connection, data binding, external-to-internal mapping, durable sync job, webhook inbox, reconciliation entry и external reservation. Provider adapter нормализует данные на границе; доменные таблицы не содержат полей конкретной ERP.

МойСклад выполняется server-side adapter-ом. 1С использует отдельный pull-only agent, который инициирует исходящий HTTPS, проходит одноразовый enrollment и работает через ту же очередь. Webhooks всегда сначала сохраняются в inbox. Экспорт заказов создаётся из transactional outbox после capture.

Credentials шифруются AES-256-GCM, bearer/enrollment tokens хранятся как hash. Ручные значения защищены по умолчанию; любое небезопасное или неоднозначное соответствие создаёт reconciliation entry.

## Последствия

Новый провайдер добавляется adapter-ом и capability metadata без изменения commerce core. Отказ внешней системы не нарушает локальные транзакции и виден через retry/DLQ/reconciliation. Для production подключения всё равно необходимы tenant-specific mappings, credential rotation, live acceptance и runbook провайдера.

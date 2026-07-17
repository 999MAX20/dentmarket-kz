# МойСклад runbook

1. Получить tenant token безопасным каналом; выбрать организацию, склад, тип цены, контрагента и mapping статусов.
2. Выполнить `TEST_CONNECTION`, `DISCOVER`, затем тестовую синхронизацию 10–50 товаров.
3. Проверить товары, модификации, цены, остатки, упаковки и confidence mapping.
4. Создать заказ и резерв во внешнем tenant; отменить заказ и проверить release.
5. Повторить webhook с тем же external event id; дубликат не должен изменить состояние.
6. Запустить reconciliation, устранить mismatch с причиной и audit trail.
7. При 401/403 ротировать token; при 429/5xx использовать retry/backoff, не создавать ручные дубликаты.
8. Сохранить tenant evidence, job ids и дату в readiness registry.

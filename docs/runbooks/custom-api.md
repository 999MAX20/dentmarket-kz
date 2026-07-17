# Custom API runbook

1. Согласовать versioned contract, auth/HMAC, nonce/replay policy, rate limits и IP/domain allowlist.
2. Настроить mapping всех используемых сущностей и направления read/write.
3. Прогнать smoke на 10–50 товаров, цену, остаток и партию.
4. Выполнить заказ, резерв, shipment/document при поддержке, отмену и release.
5. Проверить повтор запроса, timeout, 4xx/5xx retry, DLQ и reconciliation.
6. Сохранить endpoint version, evidence, owner и ограничения в readiness registry.

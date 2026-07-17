# Эксплуатация

## Компоненты

PostgreSQL остаётся source of truth. Redis/BullMQ выполняет фоновые задания; доменные integration jobs, notification attempts и outbox сохраняются в PostgreSQL, поэтому потеря Redis не приводит к потере бизнес-события. MinIO/S3 хранит исходные и сгенерированные файлы. ClamAV проверяет uploads. OTel Collector принимает OTLP traces.

## Health и диагностика

- API liveness: `GET /api/health`.
- API readiness: `GET /api/health/ready` проверяет PostgreSQL, обязательную очередь и object storage; только этот endpoint следует использовать для снятия pod из traffic.
- Все ответы содержат `x-request-id`; логи включают correlation ID, trace ID, actor и organization.
- BullMQ failed jobs сохраняются с exponential backoff, а DB-level jobs переходят в dead-letter status после исчерпания попыток.
- Sentry включается только при наличии `SENTRY_DSN`.

Scheduler `MarketplaceAgreementsService.processRenewals` ежедневно закрывает истёкшие договоры либо переносит активный AUTO_ANNUAL договор на следующий год. После длительного простоя он догоняет все пропущенные годовые периоды за один idempotent transaction. Новая версия обязательного шаблона переводит договор в `SUPERSEDED` и требует повторной ЭЦП.

## Backup policy

Рекомендуемая базовая политика:

- PostgreSQL full dump ежедневно, WAL/PITR в production;
- S3 versioning и cross-region/lifecycle policy;
- retention: 7 daily, 4 weekly, 12 monthly;
- целевые RPO 15 минут и RTO 4 часа для первой production-конфигурации;
- restore drill не реже раза в квартал.

Локальный backup:

```bash
./scripts/backup.sh
```

Restore полностью заменяет schema `public`, поэтому выполняется только в остановленном maintenance-контуре:

```bash
docker compose stop api admin-web buyer-web supplier-web landing-web seed
RESTORE_CONFIRM=<backup-directory-name> ./scripts/restore.sh /absolute/path/to/backup
docker compose up -d api admin-web buyer-web supplier-web landing-web
```

После восстановления обязательны `prisma migrate status`, health, search rebuild и read-only сверка ledger/document checksums.

Production backup/restore, immutable release and rollback описаны в [`production-deployment.md`](production-deployment.md). Production scripts работают напрямую с `DATABASE_URL`, проверяют SHA-256 и требуют явного `RESTORE_CONFIRM` перед удалением schema.

## Incident flow

1. Зафиксировать request/correlation/trace ID и affected aggregate IDs.
2. Остановить повторные side effects через provider/feature operational switch.
3. Проверить outbox, integration jobs, notification attempts и reconciliation.
4. Не изменять ledger и signed documents вручную; использовать compensating operation/version.
5. После устранения выполнить targeted retry и записать incident decision в audit/operations log.

# SLA и incident response

## Цели сервиса

| Приоритет | Пример                                                      |   Обнаружение | Первичная реакция | Цель восстановления |
| --------- | ----------------------------------------------------------- | ------------: | ----------------: | ------------------: |
| SEV-1     | недоступен checkout, утечка данных, массовая ошибка заказов |       5 минут |          15 минут |              4 часа |
| SEV-2     | существенная деградация каталога или интеграций             |      15 минут |          30 минут |             8 часов |
| SEV-3     | отдельный поставщик, UI или отчёт                           |  рабочий день |    1 рабочий день |       3 рабочих дня |
| SEV-4     | вопрос или улучшение                                        | 2 рабочих дня |     3 рабочих дня |         планируется |

## Порядок действий

1. Дежурный подтверждает алерт, назначает incident commander и фиксирует correlation/request IDs.
2. Команда ограничивает ущерб: feature flag, остановка конкретной интеграции, блокировка публикации или checkout.
3. Для SEV-1/2 обновление статуса каждые 30 минут; персональные данные и секреты не помещаются в чат или тикет.
4. После стабилизации выполняются smoke-check, проверка outbox/reconciliation и при необходимости изолированный restore drill.
5. В течение 2 рабочих дней публикуется postmortem: timeline, impact, root cause, detection gap, corrective actions и owner.

## Контрольные процедуры

- Sentry: error rate, unhandled exceptions, release regression.
- OTEL: latency p95/p99, 5xx, queue lag, database pool saturation.
- Backup: `scripts/verify-restore-drill.sh` на отдельной базе с подтверждением `I_UNDERSTAND_RESTORE_DRILL`.
- DAST: ручной workflow `.github/workflows/dast.yml` против HTTPS staging, без production target.
- Live connectors: любой статус `CONNECTOR_NEEDED` блокирует go-live sign-off.

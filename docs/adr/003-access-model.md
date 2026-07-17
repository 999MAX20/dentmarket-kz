# ADR 003: Capabilities, membership, RBAC и approvals

## Статус

Принято.

## Решение

Возможности организации, членство пользователя, роли, permissions и approval policies являются отдельными моделями. Authorization проверяет permissions в контексте активной membership. Approval policy оценивается после authorization и не расширяет permissions.

## Последствия

Одна организация может выполнять несколько функций, пользователь может работать в нескольких организациях, а лимиты закупок меняются без переопределения RBAC.

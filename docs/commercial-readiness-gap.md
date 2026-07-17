# Commercial readiness: исполняемая матрица

Дата аудита: 17 июля 2026. Источник: `Dental_Marketplace_Technical_Plan.docx`.

Статусы: `готово` означает наличие реализации и проверки в репозитории; `усилить` означает рабочий базовый контур с недостающим production-условием; `реализовать` означает новый контур текущего этапа.

| Этап | Требование | Статус до этапа | Реализация этого этапа | Проверка |
| --- | --- | --- | --- | --- |
| P0 Security | JWT issuer, audience, expiry, tenant claims, MFA | готово | сохранить default-deny membership/permission guard | unit и negative tenant tests |
| P0 Security | Refresh rotation, revoke, session management | готово | `AuthSession`, хэш refresh token, семейство, replay revoke | typecheck + session service contracts |
| P0 Security | Google/Apple, account linking, duplicate prevention | готово | OIDC verifier, `ExternalIdentity`, verified-email linking, unlink guard | schema/typecheck; live smoke требует client IDs |
| P0 Security | Per IP/user/tenant throttling и brute-force | готово | три независимых throttler и security events | `verify:security` проверяет headers |
| P0 Security | CORS, CSRF, CSP, HSTS, secure cookie | готово | strict origin, double-submit CSRF для cookie refresh, production Helmet | `verify:security` + E2E |
| P0 Security | Webhook HMAC, timestamp, replay | готово | timestamp window и replay key для payments/integrations/EDS | unit tests свежести, HMAC и изменённого payload |
| P0 Security | Idempotency checkout/reserve/payments/shipment | готово | добавить общий guard там, где нет доменного ключа | replay tests |
| P0 Security | Upload MIME/magic/size/quarantine/private URL | готово | единый upload policy, OOXML structure, quarantine metadata, private storage | malicious ZIP/magic tests |
| P0 Security | Secrets, scans, DB SSL/pool, backup/restore | усилить | CI secret/dependency scans, encrypted storage audit, Supabase env contract, restore drill | CI, live storage audit и scripts |
| P0 Integrations | Три «грязных» Excel прайса | готово | auto-detection header row: title, metadata preamble и offset columns | 3 Excel integration fixtures |
| P0 Integrations | Реальный МойСклад цикл | усилить | adapter/jobs/webhook/reconcile готовы; статус `CONNECTOR_NEEDED` до tenant credentials | live smoke при токене |
| P0 Integrations | 1С Agent install/enroll/offline/recovery | усилить | серверный протокол готов; installer/binary/real 1С явно остаются внешним blocker | agent E2E на реальной базе |
| P0 Integrations | Freshness, external reserve/release/compensation | готово | расширить проверками restart/retry | E2E 02/04/05 |
| P0 Staging | HTTPS URLs, worker, rollback, env tags | реализовать | deployment manifests и runbook; deploy при доступной сессии | public health/readiness |
| P1 UX | Buyer dashboard, recent, reorder, saved lists | готово | owner summary + saved lists и buyer surfaces | Playwright |
| P1 UX | Supplier onboarding/progress/bulk operations | готово | 7-шаговый onboarding, формы profile/warehouse/source и 9-шаговый connector wizard | browser desktop + live API |
| P1 UX | Operator unified work queue/risk/retry | готово | `/api/operations/work-queue` агрегирует catalog review, compliance, reconciliation, imports, EDS signatures, supplier confirmation и stale inventory; доступ только operator | API unit + typecheck/build |
| P1 Catalog | New Product workflow | готово | добавить прямую supplier submission и duplicate suggestions | E2E 08 |
| P1 Promotions | скидки, scope, coupons, history, analytics | готово | promotion engine, immutable price baseline, redemption limits и supplier UI | unit + API smoke |
| P2 Owners | clinic budget/cost centers/approvals/analytics | готово | cost centers, budgets, dashboard read models и buyer UI | API + Playwright |
| P2 Owners | supplier analytics/lost sales/integrations/payouts | усилить | owner dashboard aggregation | API/UI tests |
| P2 Support | ticket/thread/SLA/links/impersonation/KB | готово | support domain, audited impersonation, knowledge base и buyer UI | Playwright |
| P2 AI | tenant tool-only assistant, confirmation, logs, feedback | готово | deterministic tool gateway, policy guard, feature flag, audit и buyer UI | safety unit + Playwright |
| P2 Landing | two-audience landing, CTA, FAQ, SEO, analytics | готово | отдельное public web приложение | production build + Playwright |
| P3 Billing | plans/trial/grace/limits/entitlements/invoices | готово | billing foundation, feature flags off by default | typecheck/build/API contracts |
| Certification | empty DB, idempotent seed, all builds/tests | готово | 18 migrations, clean `marketplace_certification`, double seed, monorepo checks | 7 organizations / 84 permissions / 5 agreements / 10 offers |

## Условия внешней сертификации

Реальные МойСклад, Google, Apple, Supabase, public DNS/TLS и GitHub protected branches проверяются opt-in smoke jobs. Код и runbooks не должны подменять отсутствие внешнего токена или права доступа фиктивным успехом. Локальная и CI-сертификация остаются полностью воспроизводимыми без production secrets.

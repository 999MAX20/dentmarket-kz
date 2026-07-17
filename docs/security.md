# Модель безопасности

## Идентификация и tenant context

Локальный `AUTH_MODE=development` принимает фиксированные `x-user-id` и `x-organization-id`. Этот режим блокируется при `NODE_ENV=production`.

`AUTH_MODE=jwt` проверяет HS256 либо RS256/ES256 подпись, срок жизни, issuer, audience, subject и tenant claims `organization_id`/`organization_ids`. Переданный клиентом user header удаляется и заменяется проверенным `sub`. Активная организация должна входить в подписанный список, после чего `PermissionsGuard` дополнительно проверяет активную membership и permissions.

При `JWT_REQUIRE_MFA=true` токен обязан содержать `mfa`, `otp` или `totp` в `amr`.

Google и Apple OIDC проверяются по issuer, audience, сроку и JWKS. Автоматическое связывание допускается только для подтверждённого email. Refresh token хранится как hash, вращается при каждом использовании; повтор старого токена отзывает всю token family. Cookie-refresh защищён double-submit CSRF.

## TOTP MFA

- Secret: 160 random bits, Base32, AES-256-GCM at rest.
- Enrollment активируется только после верного TOTP.
- Допускается окно ±30 секунд.
- Recovery codes выдаются один раз и хранятся как SHA-256 hash.
- Пять ошибок блокируют factor на 15 минут.
- Enrollment, challenge и disable пишутся в audit log.

## Данные и файлы

- Integration credentials и MFA secrets используют независимые 32-byte keys.
- Документы имеют SHA-256 checksum и immutable version chain. Договор поставщика активируется только после проверенных ЭЦП поставщика и оператора; callback сверяет HMAC, timestamp, event id, checksum, certificate validity и БИН стороны.
- Financial ledger защищён database trigger от update/delete.
- Upload сначала попадает в quarantine. Имя, extension, magic bytes и структура OOXML проверяются до публикации; обычный ZIP нельзя выдать за DOCX/XLSX. ClamAV получает байты через INSTREAM, а при required mode недоступность scanner закрывает загрузку.
- Payment/integration/signature webhooks подписывают `timestamp.rawBody`; окно по умолчанию 300 секунд, event id обеспечивает replay protection.
- AI не имеет прямого доступа к Prisma: модель получает только результат allowlisted tenant-tools. Prompt injection блокируется, секреты редактируются, medical advice и autonomous critical commerce actions получают safe refusal.
- Trust/Geo writes проходят permission, membership и tenant checks, optimistic versioning, idempotency и audit. Полная история отзывов и рейтинговых апелляций сохраняется; dispute не удаляет исходное событие.
- HTTP использует Helmet, строгий CORS allowlist, rate limiting и request IDs.
- Structured logger redacts authorization, cookies, passwords, tokens, secrets и credentials.

## Production minimum

- `AUTH_MODE=jwt`, `JWT_PUBLIC_KEY` или 32+ symbol `JWT_SECRET`;
- отдельные `INTEGRATION_ENCRYPTION_KEY` и `APP_SECURITY_ENCRYPTION_KEY`;
- ротация integration key выполняется без простоя: новый ключ задаётся в `INTEGRATION_ENCRYPTION_KEY`, старый временно остаётся в `INTEGRATION_ENCRYPTION_KEY_PREVIOUS`; новые записи шифруются новым ключом, старые расшифровываются обоими;
- `JWT_REQUIRE_MFA=true` для операторов и финансовых ролей;
- `AV_SCAN_MODE=required` и доступный ClamAV;
- TLS termination, `TRUST_PROXY=true` только за доверенным proxy;
- Sentry DSN и OTLP endpoint без передачи PII;
- секреты из secret manager, не из image или Git;
- регулярная ротация webhook/provider keys и проверка restore.
- `SIGNATURE_CALLBACK_SECRET` и независимые webhook secrets из secret manager; tolerance не увеличивать без incident decision.
- `pnpm verify:security-storage` проверяет формат и различие ключей, наличие encrypted columns и отсутствие plaintext-sensitive keys в конфигурациях; при наличии `SECURITY_AUDIT_DATABASE_URL` или `DATABASE_URL` выполняет live-аудит БД без вывода значений.

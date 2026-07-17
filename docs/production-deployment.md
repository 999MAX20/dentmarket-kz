# Production deployment and rollback

## Release contract

Production is deployed only from an immutable `v*` image tag built by `.github/workflows/release.yml`. Configure GitHub repository variables `PUBLIC_API_URL`, `BUYER_APP_URL`, `SUPPLIER_APP_URL`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, and `APPLE_REDIRECT_URI`. Copy `.env.production.example` to `.env.production` on the host and replace every `CHANGE_ME` value through the secret manager.

The API refuses to start when production would use development auth, localhost CORS, mock payments, local object storage, optional antivirus, unencrypted storage, missing EDS/payment/email endpoints, missing MFA, missing Redis, or missing observability exporters.

## First deployment

1. Create managed PostgreSQL with PITR, managed Redis with TLS, an encrypted S3-compatible private bucket, DNS records, EDS gateway credentials, PSP credentials, transactional email credentials, Sentry and OTLP projects.
2. Pre-provision at least two corporate operator users as active members of the `MARKETPLACE_OPERATOR` organization. Their Google/Apple verified emails must match the users. Both must enroll TOTP at `/login`.
3. Validate configuration with `pnpm build && pnpm verify:production-config` and `docker compose --env-file .env.production -f compose.production.yaml config --quiet`.
4. Take a backup, set `REGISTRY` and immutable `APP_RELEASE`, then run `docker compose --env-file .env.production -f compose.production.yaml pull` and `docker compose --env-file .env.production -f compose.production.yaml up -d`.
5. Check `/api/health`, `/api/health/ready`, social login + MFA, supplier onboarding, two-party EDS callback, search, checkout against PSP sandbox, document download, notification delivery and operator queues.

## Backup and restore drill

Run `DATABASE_URL=... S3_BUCKET=... scripts/backup-production.sh`. A backup is valid only when `SHA256SUMS` verifies. Quarterly, restore into an isolated database and bucket with `RESTORE_CONFIRM=<backup-directory-name> scripts/restore-production.sh <absolute-backup-directory>`, then execute all verification scripts. Never run a restore against the live database while traffic is open.

## Rollback

Application rollback changes `APP_RELEASE` to the previous immutable tag and runs `compose pull/up` again. Database migrations must be backward-compatible expand/contract changes; application rollback does not reverse migrations. If a destructive data incident occurred, close traffic, preserve the affected database, restore the last verified backup into a new database, run smoke verification, then switch `DATABASE_URL` and reopen traffic.

## External go-live blockers

The repository cannot manufacture third-party acceptance. Production remains blocked until real tenant evidence exists for MySklad, a signed 1C agent build and customer database, qualified Kazakhstan EDS, the selected PSP, transactional email/SMS, DNS/TLS, managed PostgreSQL/Redis/S3, monitoring alerts and a timed restore drill. Connector status stays `CONNECTOR_NEEDED` or `PILOT` until evidence is attached; it must never be marked `LIVE_VERIFIED` from mocks.

Run `NODE_ENV=production CHECK_EXTERNAL_CONNECTORS=1 scripts/verify-production-connectors.mjs` after injecting production environment variables. The command never prints secret values and exits non-zero when EDS/PSP/telemetry credentials are missing or their `/health` endpoints are not reachable.

# Supabase database

The temporary production database is an isolated Supabase PostgreSQL project:

- project: `dentmarket-kz`
- project ref: `tlxxicjzppflpkcgnauo`
- region: `eu-central-1`
- dashboard: <https://supabase.com/dashboard/project/tlxxicjzppflpkcgnauo>

The database password is stored in the local macOS Keychain under service
`dentmarket-kz-supabase-db`. The full connection string is stored as the
repository secret `DATABASE_URL`; it must never be committed to Git.

All schema changes remain source-controlled in `apps/api/prisma/migrations`.
Production migrations are intentionally manual: run the GitHub Actions workflow
`Deploy database migrations`. The workflow only executes `prisma migrate deploy`
and never seeds or destroys data.

For a deliberate pilot-data refresh, retrieve the password from Keychain, set a
session-scoped `DATABASE_URL`, and run:

```sh
ALLOW_PRODUCTION_SEED=true pnpm --filter @marketplace/api prisma:seed
```

Do not run the seed command against a live customer database.

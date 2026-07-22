# Supabase database runbook

## Connection roles

- Runtime API: use the Supabase direct connection when the host supports IPv6;
  otherwise use the Supavisor session pooler.
- Serverless/edge traffic: use the transaction pooler and disable prepared
  statements in the client configuration.
- Migrations: run `prisma migrate deploy` from a controlled release job, not
  during every web request.

## Initial setup

```bash
export DATABASE_URL='postgresql://...'
pnpm db:generate
pnpm --filter @marketplace/api exec prisma migrate deploy
pnpm --filter @marketplace/api exec prisma validate
```

## Backup

```bash
DATABASE_URL='...' BACKUP_DIR="$PWD/backups/$(date -u +%Y%m%dT%H%M%SZ)" \
  ./scripts/backup-production.sh
```

The backup includes a custom-format PostgreSQL dump, migration count, object
storage manifest (when configured), and SHA-256 checksums.

## Restore drill

Use an isolated Supabase project or isolated PostgreSQL database:

```bash
RESTORE_DRILL_DATABASE_URL='...' \
RESTORE_DRILL_CONFIRM=I_UNDERSTAND_RESTORE_DRILL \
  ./scripts/verify-restore-drill.sh /absolute/path/to/backup-directory
```

Never point the drill at the live production database.

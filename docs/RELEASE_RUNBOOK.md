# DentMarket release runbook

This runbook protects the current release from accidental data or deployment loss.

## Before pushing a release

1. Confirm the branch and remote commit:

   ```bash
   git branch --show-current
   git fetch origin
   git status --short
   git log -1 --oneline
   ```

2. Do not stage generated files (`*.tsbuildinfo`) or unrelated catalog work.
3. Run the non-destructive checks:

   ```bash
   pnpm --filter @marketplace/api exec tsc --noEmit --pretty false
   pnpm --filter @marketplace/buyer-web exec tsc --noEmit --pretty false
   pnpm test
   pnpm verify:production-smoke
   ```

4. For a production database change, run migrations separately through the
   protected database workflow. Never combine an unreviewed data sync with a
   frontend release.

## Release sequence

1. Push the reviewed commit.
2. Wait for the deployment to become healthy.
3. Run `pnpm verify:production-smoke` against the public API and web URLs.
4. Check login, logout, product navigation, cart, checkout, and order export.
5. Record the deployed commit SHA and deployment URL.

## Rollback

Rollback the application to the previous immutable deployment/image first.
Do not roll back the database automatically. Database migrations must be
backward-compatible; use a forward fix unless the migration has an explicitly
reviewed down/restore procedure.

## Stop conditions

Stop the release if any of the following occurs:

- catalog/search count unexpectedly drops;
- `/api/health/ready` is not ready;
- login or logout fails;
- checkout creates a partial order;
- order export bypasses the active agreement gate;
- a secret appears in logs or build output.

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then echo "Usage: $0 /absolute/path/to/backup-directory" >&2; exit 2; fi
BACKUP_DIR="$1"
[[ -f "${BACKUP_DIR}/database.dump" && -f "${BACKUP_DIR}/SHA256SUMS" ]] || { echo "Backup is incomplete" >&2; exit 2; }
(cd "${BACKUP_DIR}" && shasum -a 256 --check SHA256SUMS)
pg_restore --list "${BACKUP_DIR}/database.dump" >/dev/null

if [[ -z "${RESTORE_DRILL_DATABASE_URL:-}" ]]; then
  echo "DRY_RUN: checksum and pg_restore manifest verified; set RESTORE_DRILL_DATABASE_URL for an isolated restore"
  exit 0
fi
[[ "${RESTORE_DRILL_CONFIRM:-}" == "I_UNDERSTAND_RESTORE_DRILL" ]] || { echo "Set RESTORE_DRILL_CONFIRM=I_UNDERSTAND_RESTORE_DRILL for the isolated target" >&2; exit 2; }
psql "${RESTORE_DRILL_DATABASE_URL}" --set ON_ERROR_STOP=1 --command 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pg_restore --dbname "${RESTORE_DRILL_DATABASE_URL}" --no-owner --no-acl --exit-on-error "${BACKUP_DIR}/database.dump"
psql "${RESTORE_DRILL_DATABASE_URL}" --set ON_ERROR_STOP=1 --command 'SELECT COUNT(*) AS restored_migrations FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'
echo "RESTORE_DRILL_OK: isolated database restored and migration table is readable"

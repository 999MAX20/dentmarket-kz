#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then echo "Usage: $0 /absolute/path/to/backup-directory" >&2; exit 2; fi
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="$1"
NAME="$(basename "${BACKUP_DIR}")"
[[ "${RESTORE_CONFIRM:-}" == "${NAME}" ]] || { echo "Set RESTORE_CONFIRM=${NAME} to authorize destructive restore" >&2; exit 2; }
[[ -f "${BACKUP_DIR}/database.dump" && -f "${BACKUP_DIR}/SHA256SUMS" ]] || { echo "Backup is incomplete" >&2; exit 2; }
(cd "${BACKUP_DIR}" && shasum -a 256 --check SHA256SUMS)

psql "${DATABASE_URL}" --set ON_ERROR_STOP=1 --command 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pg_restore --dbname "${DATABASE_URL}" --no-owner --no-acl --exit-on-error "${BACKUP_DIR}/database.dump"

if [[ -n "${S3_BUCKET:-}" && -d "${BACKUP_DIR}/objects" ]]; then
  command -v aws >/dev/null || { echo "aws CLI is required for S3 restore" >&2; exit 2; }
  AWS_ARGS=(); [[ -n "${S3_ENDPOINT:-}" ]] && AWS_ARGS+=(--endpoint-url "${S3_ENDPOINT}")
  aws "${AWS_ARGS[@]}" s3 sync "${BACKUP_DIR}/objects" "s3://${S3_BUCKET}" --delete --only-show-errors
fi
psql "${DATABASE_URL}" --tuples-only --no-align --command 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'
echo "Production restore completed from ${BACKUP_DIR}. Run smoke verification before reopening traffic."

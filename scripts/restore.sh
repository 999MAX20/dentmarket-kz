#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /absolute/path/to/backup-directory" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$1"
DATABASE_DUMP="${BACKUP_DIR}/database.dump"

if [[ "${RESTORE_CONFIRM:-}" != "$(basename "${BACKUP_DIR}")" ]]; then
  echo "Refusing destructive restore. Set RESTORE_CONFIRM=$(basename "${BACKUP_DIR}")" >&2
  exit 2
fi

if [[ ! -f "${DATABASE_DUMP}" ]]; then
  echo "Database dump not found: ${DATABASE_DUMP}" >&2
  exit 2
fi

if [[ -f "${BACKUP_DIR}/SHA256SUMS" ]]; then
  (cd "${BACKUP_DIR}" && shasum -a 256 --check SHA256SUMS)
else
  echo "Backup checksum manifest is missing" >&2
  exit 2
fi

cd "${ROOT_DIR}"
docker compose exec -T postgres psql --username marketplace --dbname marketplace --command 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker compose exec -T postgres pg_restore --username marketplace --dbname marketplace --no-owner --no-acl < "${DATABASE_DUMP}"

if [[ -d "${BACKUP_DIR}/objects" ]]; then
  docker compose run --rm --no-deps --entrypoint /bin/sh -v "${BACKUP_DIR}/objects:/backup:ro" minio-client -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite /backup local/marketplace'
fi

echo "Restore completed from: ${BACKUP_DIR}"

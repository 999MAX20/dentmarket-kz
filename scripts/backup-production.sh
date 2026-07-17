#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups/production-${TIMESTAMP}}"
mkdir -p "${BACKUP_DIR}/objects"

pg_dump --dbname "${DATABASE_URL}" --format=custom --no-owner --no-acl --file "${BACKUP_DIR}/database.dump"
MIGRATIONS="$(psql "${DATABASE_URL}" --tuples-only --no-align --command 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')"

if [[ -n "${S3_BUCKET:-}" ]]; then
  command -v aws >/dev/null || { echo "aws CLI is required for S3 backup" >&2; exit 2; }
  AWS_ARGS=()
  [[ -n "${S3_ENDPOINT:-}" ]] && AWS_ARGS+=(--endpoint-url "${S3_ENDPOINT}")
  aws "${AWS_ARGS[@]}" s3 sync "s3://${S3_BUCKET}" "${BACKUP_DIR}/objects" --only-show-errors
fi

cat > "${BACKUP_DIR}/manifest.txt" <<EOF
created_at=${TIMESTAMP}
release=${APP_RELEASE:-unknown}
database_host=$(node -e 'console.log(new URL(process.env.DATABASE_URL).hostname)')
object_bucket=${S3_BUCKET:-not-configured}
schema_migrations=${MIGRATIONS}
EOF
(cd "${BACKUP_DIR}" && shasum -a 256 database.dump > SHA256SUMS && find objects -type f -print0 | sort -z | xargs -0 shasum -a 256 >> SHA256SUMS)
echo "Production backup created and checksummed: ${BACKUP_DIR}"

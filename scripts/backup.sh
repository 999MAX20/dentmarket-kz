#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups/${TIMESTAMP}}"
mkdir -p "${BACKUP_DIR}/objects"

cd "${ROOT_DIR}"
docker compose exec -T postgres pg_dump --username marketplace --dbname marketplace --format=custom --no-owner --no-acl > "${BACKUP_DIR}/database.dump"
docker compose run --rm --no-deps --entrypoint /bin/sh -v "${BACKUP_DIR}/objects:/backup" minio-client -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite local/marketplace /backup'

cat > "${BACKUP_DIR}/manifest.txt" <<EOF
created_at=${TIMESTAMP}
database=marketplace
object_bucket=marketplace
schema_migrations=$(docker compose exec -T postgres psql --username marketplace --dbname marketplace --tuples-only --no-align --command 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')
EOF

(cd "${BACKUP_DIR}" && shasum -a 256 database.dump > SHA256SUMS && find objects -type f -print0 | sort -z | xargs -0 shasum -a 256 >> SHA256SUMS)

echo "Backup created: ${BACKUP_DIR}"

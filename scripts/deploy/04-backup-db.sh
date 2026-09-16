#!/usr/bin/env bash
# Nightly PostgreSQL backup for the OTRI API's database, meant to run via cron
# on the same Droplet as the API (see scripts/deploy/README.md).
#
# Keeps the last 14 daily backups, gzip-compressed, under BACKUP_DIR.
#
# Usage: ./04-backup-db.sh
# Cron example (2am daily, as the deploy user):
#   0 2 * * * /opt/otri/scripts/deploy/04-backup-db.sh >> /var/log/otri-backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/otri}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "${APP_DIR}/.env" ]] && grep -q '^DATABASE_URL=' "${APP_DIR}/.env"; then
    DATABASE_URL="$(grep '^DATABASE_URL=' "${APP_DIR}/.env" | cut -d= -f2-)"
  else
    echo "Set DATABASE_URL or ensure ${APP_DIR}/.env has one." >&2
    exit 1
  fi
fi

mkdir -p "${BACKUP_DIR}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/otri-${TIMESTAMP}.sql.gz"

echo "==> Backing up database to ${OUTPUT_FILE}"
pg_dump "${DATABASE_URL}" | gzip > "${OUTPUT_FILE}"

echo "==> Pruning backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name 'otri-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "==> Done. Current backups:"
ls -lh "${BACKUP_DIR}"

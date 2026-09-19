#!/usr/bin/env bash
# Nightly backup of everything the Droplet holds that cannot be rebuilt from git:
#   - the PostgreSQL database (pg_dump, gzip, integrity-checked)
#   - the shared calculator courses (data/cache/shared-courses) and .env, as one tar.gz
# Keeps RETENTION_DAYS (default 30) days locally and, when OTRI_BACKUP_RCLONE_REMOTE is set in
# .env (e.g. "spaces:otri-backups"), copies every new backup off the Droplet with rclone.
#
# Usage: ./04-backup-db.sh
# Cron (2am daily, as the deploy user; the log must be somewhere the user can write):
#   0 2 * * * /opt/otri/scripts/deploy/04-backup-db.sh >> /home/otri/otri-backup.log 2>&1
# Restore: ./07-restore-db.sh <backup.sql.gz>   (see that script for the test-restore flow)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/otri}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

env_value() { grep "^$1=" "${APP_DIR}/.env" 2>/dev/null | head -1 | cut -d= -f2- || true; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(env_value DATABASE_URL)"
fi
if [[ -z "${DATABASE_URL}" ]]; then
  echo "Set DATABASE_URL or ensure ${APP_DIR}/.env has one." >&2
  exit 1
fi
REMOTE="${OTRI_BACKUP_RCLONE_REMOTE:-$(env_value OTRI_BACKUP_RCLONE_REMOTE)}"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="${BACKUP_DIR}/otri-${TIMESTAMP}.sql.gz"
FILES_FILE="${BACKUP_DIR}/otri-files-${TIMESTAMP}.tar.gz"

echo "$(date -u +%FT%TZ) ==> Database -> ${DB_FILE}"
pg_dump --no-owner --no-privileges "${DATABASE_URL}" | gzip -6 > "${DB_FILE}"
gzip -t "${DB_FILE}"
TABLES="$(gzip -dc "${DB_FILE}" | grep -c '^CREATE TABLE' || true)"
if [[ "${TABLES}" -lt 5 ]]; then
  echo "backup looks wrong: only ${TABLES} CREATE TABLE statements" >&2
  exit 1
fi

echo "$(date -u +%FT%TZ) ==> Files -> ${FILES_FILE}"
tar -czf "${FILES_FILE}" -C "${APP_DIR}" \
  --ignore-failed-read \
  .env data/cache/shared-courses dem/manifest.json 2>/dev/null || true
gzip -t "${FILES_FILE}"
chmod 600 "${DB_FILE}" "${FILES_FILE}"

echo "$(date -u +%FT%TZ) ==> Pruning local backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name 'otri-*.gz' -mtime "+${RETENTION_DAYS}" -delete

if [[ -n "${REMOTE}" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) ==> Copying to ${REMOTE}"
    rclone copy --min-age 1s "${BACKUP_DIR}" "${REMOTE}" --include 'otri-*.gz' && \
    rclone delete "${REMOTE}" --min-age "$((RETENTION_DAYS * 3))d" --include 'otri-*.gz' || \
    echo "WARNING: off-site copy failed; the local backup is still in ${BACKUP_DIR}" >&2
  else
    echo "WARNING: OTRI_BACKUP_RCLONE_REMOTE is set but rclone is not installed (apt-get install rclone; rclone config)" >&2
  fi
else
  echo "NOTE: no OTRI_BACKUP_RCLONE_REMOTE in .env - backups stay on this Droplet only. A disk failure loses them."
fi

echo "$(date -u +%FT%TZ) ==> Done: $(du -h "${DB_FILE}" | cut -f1) database (${TABLES} tables), $(du -h "${FILES_FILE}" | cut -f1) files. $(ls "${BACKUP_DIR}"/otri-*.sql.gz | wc -l) database backups kept."

#!/usr/bin/env bash
# Restore a database backup made by 04-backup-db.sh.
#
# Test restore (the default; run this monthly so you know the backups work):
#   ./07-restore-db.sh /opt/otri/backups/otri-20260918-020001.sql.gz
#   -> restores into a scratch database "otri_restore_test", prints row counts, drops it again.
#
# Real restore into the live database (stops the API, replaces every table, restarts):
#   ./07-restore-db.sh <backup.sql.gz> --into otri
#
# Files (shared courses, .env) live in the matching otri-files-<stamp>.tar.gz:
#   tar -xzf /opt/otri/backups/otri-files-<stamp>.tar.gz -C /opt/otri
#
# Needs: sudo rights for createdb/dropdb as postgres and systemctl for otri-api (see 09-harden-sudo.sh).
set -euo pipefail

BACKUP="${1:?Usage: $0 <backup.sql.gz> [--into <database>]}"
TARGET="otri_restore_test"
if [[ "${2:-}" == "--into" ]]; then
  TARGET="${3:?--into needs a database name}"
fi
APP_DIR="${APP_DIR:-/opt/otri}"

if [[ ! -f "${BACKUP}" ]]; then
  echo "no such file: ${BACKUP}" >&2
  exit 1
fi
gzip -t "${BACKUP}"

DATABASE_URL="${DATABASE_URL:-$(grep '^DATABASE_URL=' "${APP_DIR}/.env" | cut -d= -f2-)}"
# postgresql://user:pass@host:port/db -> same URL pointing at the target database
TARGET_URL="${DATABASE_URL%/*}/${TARGET}"
DB_USER="$(printf '%s' "${DATABASE_URL}" | sed -E 's#^[a-z]+://([^:/@]+).*#\1#')"

if [[ "${TARGET}" == "otri" ]]; then
  echo "==> Stopping the API before replacing the live database"
  sudo systemctl stop otri-api
fi

echo "==> Recreating database ${TARGET} (owner ${DB_USER})"
sudo -u postgres dropdb --if-exists "${TARGET}"
sudo -u postgres createdb -O "${DB_USER}" "${TARGET}"

echo "==> Restoring ${BACKUP}"
gzip -dc "${BACKUP}" | psql -q -v ON_ERROR_STOP=1 "${TARGET_URL}" >/dev/null

echo "==> Row counts in ${TARGET}"
psql -At "${TARGET_URL}" -c "
  SELECT relname || ': ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname;" | sed 's/^/   /'
for table in organizers events races results; do
  psql -At "${TARGET_URL}" -c "SELECT '   ${table} (exact): ' || COUNT(*) FROM ${table};"
done

if [[ "${TARGET}" == "otri" ]]; then
  echo "==> Restarting the API"
  sudo systemctl start otri-api
  sleep 3
  curl -sf -m 10 http://127.0.0.1:8000/health && echo || echo "WARNING: /health not answering yet; check: journalctl -u otri-api -n 50"
else
  echo "==> Test restore succeeded; dropping ${TARGET}"
  sudo -u postgres dropdb "${TARGET}"
fi
echo "==> Done"

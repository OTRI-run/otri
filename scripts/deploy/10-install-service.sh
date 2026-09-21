#!/usr/bin/env bash
# Run as root, on the Droplet. Installs (or updates) the otri-api systemd unit and restarts the API.
#
# This is root's job and not the deploy's: whoever may write a unit file decides which program
# runs as which user, so a deploy user allowed to write this one has root, whatever else its sudo
# rules deny (09-harden-sudo.sh). The deploy (02-deploy-app.sh) compares the unit installed with
# the one this script would write, and asks for this script when they differ. That is rare: a new
# sandbox path, a different worker count.
#
# Usage:
#   sudo ./10-install-service.sh [service_user] [app_dir]
#   ./10-install-service.sh --print [service_user] [app_dir]    # the unit, to stdout; needs no root
#
# GUNICORN_WORKERS overrides the worker count (default: one per CPU plus one). The terrain folder
# the API may write to is read from OTRI_DEM_MANIFEST in the app's .env.
set -euo pipefail

PRINT_ONLY=""
if [[ "${1:-}" == "--print" ]]; then
  PRINT_ONLY=1
  shift
fi
SERVICE_USER="${1:-otri}"
APP_DIR="${2:-/opt/otri}"
GUNICORN_WORKERS="${GUNICORN_WORKERS:-$(( $(nproc) + 1 ))}"
UNIT=/etc/systemd/system/otri-api.service

if [[ -z "${OTRI_DEM_MANIFEST:-}" ]] && [[ -r "${APP_DIR}/.env" ]]; then
  OTRI_DEM_MANIFEST="$(sed -n 's/^OTRI_DEM_MANIFEST=//p' "${APP_DIR}/.env" | tail -n 1)"
fi
OTRI_DEM_MANIFEST="${OTRI_DEM_MANIFEST:-${APP_DIR}/dem/manifest.json}"

render() {
  cat <<EOF
[Unit]
Description=OTRI API (FastAPI/Gunicorn)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
# ProtectHome hides /home; newer gunicorn wants a writable HOME for its control socket.
Environment=HOME=${APP_DIR}/data
ExecStart=${APP_DIR}/venv/bin/gunicorn api.app:app \\
    --workers ${GUNICORN_WORKERS} \\
    --worker-class uvicorn.workers.UvicornWorker \\
    --bind 127.0.0.1:8000 \\
    --access-logfile - \\
    --error-logfile -
Restart=on-failure
RestartSec=5
# An upload that asks for more memory than the box has should end as a restarted API, not as
# whatever the kernel's OOM killer picks, which on a 1 GB droplet may well be postgres.
MemoryMax=700M
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}/data $(dirname "${OTRI_DEM_MANIFEST}")
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
}

if [[ -n "${PRINT_ONLY}" ]]; then
  render
  exit 0
fi

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this as root (sudo $0 ${SERVICE_USER} ${APP_DIR})." >&2
  exit 1
fi
id "${SERVICE_USER}" >/dev/null

# The unit may only name folders that exist, or the service does not start.
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${APP_DIR}/data" "$(dirname "${OTRI_DEM_MANIFEST}")"

TMP="$(mktemp)"
render >"${TMP}"
install -m 644 -o root -g root "${TMP}" "${UNIT}"
rm -f "${TMP}"
systemctl daemon-reload
systemctl enable otri-api
systemctl restart otri-api
echo "==> Installed ${UNIT} and restarted otri-api"
systemctl --no-pager --full status otri-api || true

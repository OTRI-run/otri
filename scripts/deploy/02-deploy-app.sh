#!/usr/bin/env bash
# Run as the deploy user (e.g. otri), on the Droplet. Clones/updates the repo,
# sets up the Python virtualenv, and installs/updates the otri-api systemd
# service. Safe to re-run for updates (git pull + restart).
#
# Usage:
#   OTRI_API_ALLOWED_ORIGINS="https://otri.run,https://www.otri.run" \
#     ./02-deploy-app.sh [repo_url] [branch] [app_dir]
set -euo pipefail

REPO_URL="${1:-https://github.com/OTRI-run/otri.git}"
BRANCH="${2:-main}"
APP_DIR="${3:-/opt/otri}"
SERVICE_USER="$(whoami)"

if [[ ${EUID} -eq 0 ]]; then
  echo "Run this as the deploy user (e.g. otri), not root." >&2
  exit 1
fi

if [[ -z "${OTRI_API_ALLOWED_ORIGINS:-}" ]]; then
  echo "Set OTRI_API_ALLOWED_ORIGINS before running, e.g.:" >&2
  echo '  OTRI_API_ALLOWED_ORIGINS="https://otri.run,https://www.otri.run" ./02-deploy-app.sh' >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]] && [[ -f "${HOME}/otri-database-url.txt" ]]; then
  DATABASE_URL="$(cat "${HOME}/otri-database-url.txt")"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL, or run 01-bootstrap.sh first (it writes ~/otri-database-url.txt)." >&2
  exit 1
fi

if [[ -z "${RESEND_API_KEY:-}" ]]; then
  echo "WARNING: RESEND_API_KEY not set — verification/password-reset emails will" >&2
  echo "         be logged instead of sent until you set it (see api/README.md)." >&2
fi

echo "==> Fetching code into ${APP_DIR}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  sudo mkdir -p "${APP_DIR}"
  sudo chown "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" fetch origin "${BRANCH}"
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull origin "${BRANCH}"
fi

echo "==> Setting up virtualenv"
cd "${APP_DIR}"
python3.12 -m venv venv
# shellcheck source=/dev/null
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-dev.txt
pip install -r course/requirements-terrain.txt
pip install gunicorn
deactivate

# Terrain dataset (course-measurement-v2 / scoring V0.7): if 06-install-dem.sh has pinned tiles,
# point the API at them. Without it every score reports Low confidence, on purpose.
if [[ -z "${OTRI_DEM_MANIFEST:-}" ]] && [[ -f "${APP_DIR}/dem/manifest.json" ]]; then
  OTRI_DEM_MANIFEST="${APP_DIR}/dem/manifest.json"
  echo "==> Using terrain manifest ${OTRI_DEM_MANIFEST}"
elif [[ -z "${OTRI_DEM_MANIFEST:-}" ]]; then
  echo "WARNING: no terrain manifest - elevation will come from uploaded GPX files and every" >&2
  echo "         score will report Low confidence. Run 06-install-dem.sh to pin DEM tiles." >&2
fi

# Preserve an existing JWT secret across re-deploys (regenerating it would log
# out every organizer on every deploy); only generate one the first time.
if [[ -z "${OTRI_API_JWT_SECRET:-}" ]]; then
  if [[ -f "${APP_DIR}/.env" ]] && grep -q '^OTRI_API_JWT_SECRET=' "${APP_DIR}/.env"; then
    OTRI_API_JWT_SECRET="$(grep '^OTRI_API_JWT_SECRET=' "${APP_DIR}/.env" | cut -d= -f2-)"
    echo "==> Reusing existing OTRI_API_JWT_SECRET from ${APP_DIR}/.env"
  else
    OTRI_API_JWT_SECRET="$(python3.12 -c 'import secrets; print(secrets.token_hex(32))')"
    echo "==> Generated a new OTRI_API_JWT_SECRET"
  fi
fi

# Optional settings live in .env only (set by hand on the Droplet); keep them across re-deploys.
keep_env() { grep "^$1=" "${APP_DIR}/.env" 2>/dev/null | head -1 | cut -d= -f2- || true; }
OTRI_ADMIN_EMAILS="${OTRI_ADMIN_EMAILS:-$(keep_env OTRI_ADMIN_EMAILS)}"
OTRI_ALERT_EMAIL="${OTRI_ALERT_EMAIL:-$(keep_env OTRI_ALERT_EMAIL)}"
OTRI_SHARED_COURSES_MAX_MB="${OTRI_SHARED_COURSES_MAX_MB:-$(keep_env OTRI_SHARED_COURSES_MAX_MB)}"
OTRI_BACKUP_RCLONE_REMOTE="${OTRI_BACKUP_RCLONE_REMOTE:-$(keep_env OTRI_BACKUP_RCLONE_REMOTE)}"
SENTRY_DSN="${SENTRY_DSN:-$(keep_env SENTRY_DSN)}"
OTRI_ENV="${OTRI_ENV:-$(keep_env OTRI_ENV)}"

echo "==> Writing ${APP_DIR}/.env"
cat >"${APP_DIR}/.env" <<EOF
OTRI_API_ALLOWED_ORIGINS=${OTRI_API_ALLOWED_ORIGINS}
OTRI_API_JWT_SECRET=${OTRI_API_JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
RESEND_API_KEY=${RESEND_API_KEY:-}
OTRI_EMAIL_FROM=${OTRI_EMAIL_FROM:-OTRI <noreply@otri.run>}
OTRI_APP_BASE_URL=${OTRI_APP_BASE_URL:-https://otri.run}
OTRI_DEM_MANIFEST=${OTRI_DEM_MANIFEST:-}
OTRI_ADMIN_EMAILS=${OTRI_ADMIN_EMAILS}
OTRI_ALERT_EMAIL=${OTRI_ALERT_EMAIL}
OTRI_SHARED_COURSES_MAX_MB=${OTRI_SHARED_COURSES_MAX_MB:-2048}
OTRI_BACKUP_RCLONE_REMOTE=${OTRI_BACKUP_RCLONE_REMOTE}
SENTRY_DSN=${SENTRY_DSN}
OTRI_ENV=${OTRI_ENV:-production}
EOF
chmod 600 "${APP_DIR}/.env"

echo "==> Applying schema migrations, seeding demo data on first run"
source venv/bin/activate
DATABASE_URL="${DATABASE_URL}" python scripts/migrate.py upgrade
DATABASE_URL="${DATABASE_URL}" python scripts/seed_demo_data.py
DATABASE_URL="${DATABASE_URL}" python scripts/migrate.py status
deactivate

echo "==> Installing systemd unit"
sudo tee /etc/systemd/system/otri-api.service >/dev/null <<EOF
[Unit]
Description=OTRI API (FastAPI/Gunicorn)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${APP_DIR}/venv/bin/gunicorn api.app:app \\
    --workers 2 \\
    --worker-class uvicorn.workers.UvicornWorker \\
    --bind 127.0.0.1:8000 \\
    --access-logfile - \\
    --error-logfile -
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}/data
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now otri-api
sudo systemctl restart otri-api

echo
echo "==> Done. Service status:"
sudo systemctl --no-pager --full status otri-api || true
echo
echo "Tail logs with: journalctl -u otri-api -f"

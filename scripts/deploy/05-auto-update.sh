#!/usr/bin/env bash
# Polls origin/<branch> once and redeploys only if a new commit is found — cheap to run every
# minute via cron, since it does nothing (no output, no restart) when there's nothing new.
#
# Install with cron (as the deploy user, e.g. otri):
#   crontab -e
#   * * * * * /opt/otri/scripts/deploy/05-auto-update.sh >> /home/otri/otri-auto-update.log 2>&1
#
# Usage: ./05-auto-update.sh [app_dir] [branch]
set -euo pipefail

APP_DIR="${1:-/opt/otri}"
BRANCH="${2:-main}"
LOCK_FILE="/tmp/otri-auto-update.lock"

# Prevent overlapping runs if a previous invocation is still mid-deploy (e.g. slow pip install).
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

cd "${APP_DIR}"

git fetch --quiet origin "${BRANCH}"

LOCAL_COMMIT="$(git rev-parse HEAD)"
REMOTE_COMMIT="$(git rev-parse "origin/${BRANCH}")"

if [[ "${LOCAL_COMMIT}" == "${REMOTE_COMMIT}" ]]; then
  exit 0
fi

echo "$(date -u +%FT%TZ) auto-update: ${LOCAL_COMMIT} -> ${REMOTE_COMMIT}, redeploying"

# Discard local changes to tracked-but-gitignored files (e.g. __pycache__) that would otherwise
# block the pull — see docs/methodology or repo memory notes for why these end up tracked.
git checkout -- .
git clean -fd api course ingestion scoring tests

ALLOWED_ORIGINS="$(grep '^OTRI_API_ALLOWED_ORIGINS=' .env | cut -d= -f2-)"
RESEND_KEY="$(grep '^RESEND_API_KEY=' .env | cut -d= -f2-)"

OTRI_API_ALLOWED_ORIGINS="${ALLOWED_ORIGINS}" RESEND_API_KEY="${RESEND_KEY}" \
  bash scripts/deploy/02-deploy-app.sh "" "${BRANCH}" "${APP_DIR}"

echo "$(date -u +%FT%TZ) auto-update: done"

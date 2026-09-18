#!/usr/bin/env bash
# Run with sudo. Installs a systemd timer that checks the API every 2 minutes and:
#   - restarts otri-api after 3 consecutive failed /health checks, and emails an alert
#   - emails an alert when the disk is 80% full (once a day while it stays full)
#   - emails when nginx or postgresql are not running
# Alerts go through Resend (RESEND_API_KEY / OTRI_EMAIL_FROM from /opt/otri/.env) to
# OTRI_ALERT_EMAIL, or the first address in OTRI_ADMIN_EMAILS when that is unset.
# At most one alert email per hour per topic. State lives in /var/lib/otri-watchdog.
#
# This is the in-house half of monitoring. It cannot tell you the Droplet itself is down: add an
# external uptime check (e.g. UptimeRobot / Better Stack, free tiers) on https://api.otri.run/health.
#
# Usage: sudo ./08-install-watchdog.sh [app_dir]
set -euo pipefail

APP_DIR="${1:-/opt/otri}"
if [[ ${EUID} -ne 0 ]]; then
  echo "Run this with sudo." >&2
  exit 1
fi

install -d -m 750 /var/lib/otri-watchdog

cat >/usr/local/bin/otri-watchdog.sh <<'EOF'
#!/usr/bin/env bash
set -uo pipefail
APP_DIR="${APP_DIR:-/opt/otri}"
STATE=/var/lib/otri-watchdog
HEALTH_URL="http://127.0.0.1:8000/health"
DISK_LIMIT=80
FAILS_BEFORE_RESTART=3

env_value() { grep "^$1=" "${APP_DIR}/.env" 2>/dev/null | head -1 | cut -d= -f2-; }
RESEND_API_KEY="$(env_value RESEND_API_KEY)"
EMAIL_FROM="$(env_value OTRI_EMAIL_FROM)"; EMAIL_FROM="${EMAIL_FROM:-OTRI <noreply@otri.run>}"
ALERT_TO="$(env_value OTRI_ALERT_EMAIL)"
if [[ -z "${ALERT_TO}" ]]; then ALERT_TO="$(env_value OTRI_ADMIN_EMAILS | cut -d, -f1)"; fi
HOST="$(hostname)"

log() { echo "$(date -u +%FT%TZ) $*"; }

# alert <topic> <subject> <body>; one email per topic per hour
alert() {
  local topic="$1" subject="$2" body="$3" stamp="${STATE}/alert-$1"
  if [[ -f "${stamp}" ]] && [[ $(( $(date +%s) - $(stat -c %Y "${stamp}") )) -lt 3600 ]]; then
    log "alert (${topic}) suppressed: sent less than an hour ago"; return
  fi
  touch "${stamp}"
  log "ALERT (${topic}): ${subject}"
  if [[ -z "${RESEND_API_KEY}" || -z "${ALERT_TO}" ]]; then
    log "no RESEND_API_KEY / alert address in ${APP_DIR}/.env - alert stays in this log only"; return
  fi
  local payload
  payload="$(printf '{"from":"%s","to":["%s"],"subject":"[OTRI %s] %s","text":"%s\\n\\n%s"}' \
    "${EMAIL_FROM}" "${ALERT_TO}" "${HOST}" "${subject}" "${body}" "$(date -u +%FT%TZ)")"
  curl -s -m 15 -o /dev/null -w "resend: %{http_code}\n" https://api.resend.com/emails \
    -H "Authorization: Bearer ${RESEND_API_KEY}" -H "Content-Type: application/json" -d "${payload}" || true
}

# --- API health
body="$(curl -s -m 10 -w '\n%{http_code}' "${HEALTH_URL}" 2>/dev/null)"
code="${body##*$'\n'}"
if [[ "${code}" == "404" ]]; then  # older build without /health: the root route stands in
  code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/ 2>/dev/null)"
fi
if [[ "${code}" == "200" ]]; then
  if [[ -f "${STATE}/fails" ]] && [[ "$(cat "${STATE}/fails")" != "0" ]]; then log "api healthy again"; fi
  echo 0 > "${STATE}/fails"
else
  fails=$(( $(cat "${STATE}/fails" 2>/dev/null || echo 0) + 1 ))
  echo "${fails}" > "${STATE}/fails"
  log "api check failed (${fails}/${FAILS_BEFORE_RESTART}): http ${code:-none} ${body%$'\n'*}"
  if [[ "${fails}" -ge "${FAILS_BEFORE_RESTART}" ]]; then
    systemctl restart otri-api
    echo 0 > "${STATE}/fails"
    alert api "API not healthy, restarted otri-api" "Three checks in a row failed (last: http ${code:-none}). The service was restarted. Last log lines:\\n$(journalctl -u otri-api -n 20 --no-pager -q 2>/dev/null | tail -20 | sed 's/"/\\"/g' | tr '\n' ' ')"
  fi
fi

# --- disk
used="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [[ "${used}" -ge "${DISK_LIMIT}" ]]; then
  stamp="${STATE}/alert-disk"
  if [[ ! -f "${stamp}" ]] || [[ $(( $(date +%s) - $(stat -c %Y "${stamp}") )) -ge 86400 ]]; then
    rm -f "${stamp}"
    alert disk "Disk ${used}% full" "Root filesystem is ${used}% used. Largest: $(du -sh ${APP_DIR}/backups ${APP_DIR}/data/cache /var/log 2>/dev/null | tr '\n' ' ' | sed 's/"/\\"/g')"
  fi
fi

# --- neighbours
for unit in nginx postgresql fail2ban; do
  if ! systemctl is-active --quiet "${unit}"; then
    alert "${unit}" "${unit} is not running" "systemctl status ${unit} on ${HOST}: $(systemctl is-active "${unit}")"
  fi
done
EOF
chmod 755 /usr/local/bin/otri-watchdog.sh

cat >/etc/systemd/system/otri-watchdog.service <<EOF
[Unit]
Description=OTRI watchdog: health check, auto-restart, disk and service alerts

[Service]
Type=oneshot
Environment=APP_DIR=${APP_DIR}
ExecStart=/usr/local/bin/otri-watchdog.sh
EOF

cat >/etc/systemd/system/otri-watchdog.timer <<'EOF'
[Unit]
Description=Run the OTRI watchdog every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=20s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now otri-watchdog.timer
systemctl start otri-watchdog.service
echo "==> Installed. Follow it with: journalctl -u otri-watchdog -f"
systemctl list-timers otri-watchdog.timer --no-pager

#!/usr/bin/env bash
# Run as root (ssh root@… or from a root shell). Replaces the deploy user's blanket
# "NOPASSWD: ALL" with exactly the commands the deploy, backup, restore and admin-dashboard
# scripts need, and takes the user out of the sudo group. Root stays reachable over SSH with the
# same key for everything else (03-configure-nginx.sh, 08-install-watchdog.sh, apt, …).
#
# The API's own process is already confined by the systemd unit (NoNewPrivileges, ProtectSystem=
# strict, ReadWritePaths only under /opt/otri/data, ProtectHome, PrivateTmp) — this closes the
# other door: a stolen deploy key or a bug in a script run as the deploy user no longer has root.
#
# Nothing here may let the deploy user write a file root acts on. An earlier version allowed
# `tee /etc/systemd/system/otri-api.service` with `daemon-reload` and `restart`: a unit file says
# which program runs as which user, so that was root in three commands. The unit is installed by
# root (10-install-service.sh); the deploy restarts the service and no more.
#
# Usage: ./09-harden-sudo.sh [deploy_user] [app_dir]
set -euo pipefail

DEPLOY_USER="${1:-otri}"
APP_DIR="${2:-/opt/otri}"
if [[ ${EUID} -ne 0 ]]; then
  echo "Run this as root." >&2
  exit 1
fi
id "${DEPLOY_USER}" >/dev/null

TMP="$(mktemp)"
cat >"${TMP}" <<EOF
# Managed by scripts/deploy/09-harden-sudo.sh — the deploy user's whole sudo surface.
Defaults:${DEPLOY_USER} !requiretty

Cmnd_Alias OTRI_SERVICE = /usr/bin/systemctl start otri-api, /usr/bin/systemctl stop otri-api, \\
    /usr/bin/systemctl restart otri-api, /usr/bin/systemctl status otri-api, \\
    /usr/bin/systemctl --no-pager --full status otri-api, \\
    /usr/bin/systemctl reload nginx, /usr/sbin/nginx -t
Cmnd_Alias OTRI_FIRSTRUN = /usr/bin/mkdir -p ${APP_DIR}, /usr/bin/chown ${DEPLOY_USER}\\:${DEPLOY_USER} ${APP_DIR}
Cmnd_Alias OTRI_STATUS = /usr/sbin/ufw status, /usr/bin/fail2ban-client status, /usr/bin/fail2ban-client status *
Cmnd_Alias OTRI_RESTORE = /usr/bin/createdb -O ${DEPLOY_USER} otri*, /usr/bin/dropdb otri_restore_test, \\
    /usr/bin/dropdb --if-exists otri_restore_test, /usr/bin/dropdb --if-exists otri, /usr/bin/dropdb otri

${DEPLOY_USER} ALL=(root) NOPASSWD: OTRI_SERVICE, OTRI_FIRSTRUN, OTRI_STATUS
${DEPLOY_USER} ALL=(postgres) NOPASSWD: OTRI_RESTORE
EOF

visudo -cf "${TMP}"
install -m 440 -o root -g root "${TMP}" /etc/sudoers.d/otri-deploy
rm -f "${TMP}"
# Older bootstrap wrote a blanket rule under this name too; anything else granting ALL goes.
for f in /etc/sudoers.d/*; do
  [[ "$f" == /etc/sudoers.d/otri-deploy || "$f" == /etc/sudoers.d/README ]] && continue
  if grep -qE "^${DEPLOY_USER}[[:space:]]" "$f"; then
    echo "==> Removing ${DEPLOY_USER} rule from $f"
    sed -i "/^${DEPLOY_USER}[[:space:]]/d" "$f"
  fi
done
if id -nG "${DEPLOY_USER}" | grep -qw sudo; then
  echo "==> Removing ${DEPLOY_USER} from the sudo group"
  deluser "${DEPLOY_USER}" sudo >/dev/null
fi
chmod 600 "${APP_DIR}/.env" 2>/dev/null || true

echo "==> ${DEPLOY_USER} may now run:"
sudo -l -U "${DEPLOY_USER}" | sed -n '/may run/,$p'
echo "==> Check: the following must all print OK"
for cmd in "systemctl status otri-api" "ufw status" "fail2ban-client status"; do
  if sudo -n -u "${DEPLOY_USER}" sudo -n ${cmd} >/dev/null 2>&1; then echo "   OK   sudo ${cmd}"; else echo "   FAIL sudo ${cmd}"; fi
done
if sudo -n -u "${DEPLOY_USER}" sudo -n apt-get --version >/dev/null 2>&1; then echo "   FAIL sudo apt-get should be denied"; else echo "   OK   sudo apt-get denied"; fi
if sudo -n -u "${DEPLOY_USER}" sudo -n -l /usr/bin/tee /etc/systemd/system/otri-api.service >/dev/null 2>&1; then echo "   FAIL writing the systemd unit should be denied"; else echo "   OK   writing the systemd unit denied"; fi

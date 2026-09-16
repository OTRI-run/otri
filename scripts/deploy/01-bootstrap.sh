#!/usr/bin/env bash
# Run once, as root, immediately after creating the Droplet.
#
# Creates the deploy user, installs runtime dependencies, and hardens the
# firewall. Assumes the Droplet was created with SSH-key-only authentication
# (DigitalOcean disables root password login automatically in that case) —
# this script does not touch sshd_config.
#
# Usage: ./01-bootstrap.sh [deploy_user]
set -euo pipefail

DEPLOY_USER="${1:-otri}"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this as root (fresh root SSH session, or via sudo)." >&2
  exit 1
fi

echo "==> Creating user '${DEPLOY_USER}' (if missing)"
if ! id "${DEPLOY_USER}" &>/dev/null; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  usermod -aG sudo "${DEPLOY_USER}"
fi

echo "==> Copying SSH authorized_keys to ${DEPLOY_USER}"
if [[ -f /root/.ssh/authorized_keys ]]; then
  mkdir -p "/home/${DEPLOY_USER}/.ssh"
  cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
  chmod 700 "/home/${DEPLOY_USER}/.ssh"
  chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
else
  echo "WARNING: /root/.ssh/authorized_keys not found — set up SSH key access" >&2
  echo "         for ${DEPLOY_USER} manually before relying on this Droplet." >&2
fi

echo "==> Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  ufw fail2ban unattended-upgrades \
  python3.12 python3.12-venv \
  nginx git certbot python3-certbot-nginx

echo "==> Configuring firewall (ufw)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Enabling fail2ban"
systemctl enable --now fail2ban

echo "==> Enabling unattended security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

cat <<EOF

==> Bootstrap complete.

Next: confirm you can log in as the deploy user, then continue with
02-deploy-app.sh:
  ssh ${DEPLOY_USER}@<droplet-ip>

Also remember to enable DigitalOcean's Cloud Firewall (Networking -> Firewalls)
with the same 22/80/443 rule as a second layer in front of this Droplet.
EOF

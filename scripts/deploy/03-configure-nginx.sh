#!/usr/bin/env bash
# Run with sudo, on the Droplet, after 02-deploy-app.sh has the API running
# on 127.0.0.1:8000. Configures the Nginx reverse proxy and issues a Let's
# Encrypt certificate for the given domain.
#
# Prerequisite: point a DNS A record for <domain> at this Droplet's IP first.
#
# Usage: sudo ./03-configure-nginx.sh api.otri.run you@example.com
set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this with sudo." >&2
  exit 1
fi

echo "==> Writing Nginx site for ${DOMAIN}"
tee /etc/nginx/sites-available/otri-api >/dev/null <<EOF
# Per-IP request budget in front of the API's own (per-endpoint) limits: 20 requests/second
# sustained with a burst of 40 absorbs a real user's page load and stops a flood at the edge.
limit_req_zone \$binary_remote_addr zone=otri_api:10m rate=20r/s;
limit_conn_zone \$binary_remote_addr zone=otri_conn:10m;

server {
    listen 80;
    server_name ${DOMAIN};

    # Only meaningful over TLS (certbot adds the 443 server below); harmless on the redirect.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location / {
        limit_req zone=otri_api burst=40 nodelay;
        limit_conn otri_conn 20;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8000;
        proxy_read_timeout 120s;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Reasonable limit for GPX/CSV/XLSX uploads
        client_max_body_size 20m;
    }
}
EOF

ln -sf /etc/nginx/sites-available/otri-api /etc/nginx/sites-enabled/otri-api
nginx -t
systemctl reload nginx

echo "==> Requesting TLS certificate for ${DOMAIN}"
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

echo
echo "==> Done. Verify with: curl -I https://${DOMAIN}/"
echo "Certbot's renewal timer is installed automatically — check with:"
echo "  systemctl list-timers | grep certbot"

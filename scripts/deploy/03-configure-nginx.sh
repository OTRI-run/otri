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

echo "==> Writing the public-read microcache"
# Anonymous GETs of public data (race lists, leaderboards, runner profiles) carry
# "Cache-Control: public, max-age=30" from the API and are served from this cache for that long,
# so a shared link that goes round a club hits the database once, not once per viewer. Anything
# personal is "no-store" and is never cached; requests carrying a session are bypassed entirely.
mkdir -p /var/cache/nginx/otri
tee /etc/nginx/conf.d/otri-cache.conf >/dev/null <<EOF
proxy_cache_path /var/cache/nginx/otri levels=1:2 keys_zone=otri_cache:10m max_size=200m inactive=10m use_temp_path=off;
EOF

echo "==> Writing Nginx site for ${DOMAIN}"
tee /etc/nginx/sites-available/otri-api >/dev/null <<EOF
# Per-IP request budget in front of the API's own (per-endpoint) limits: 20 requests/second
# sustained with a burst of 40 absorbs a real user's page load and stops a flood at the edge.
limit_req_zone \$binary_remote_addr zone=otri_api:10m rate=20r/s;
limit_conn_zone \$binary_remote_addr zone=otri_conn:10m;

# The path, never the query string. Some of OTRI's one-time links arrive as query parameters (a
# Google identity-link token, an OAuth code), and the default combined format would write them
# into a file that is kept, rotated and backed up. \$uri is the path after normalisation.
log_format otri_no_query '\$remote_addr - \$remote_user [\$time_local] '
                         '"\$request_method \$uri \$server_protocol" \$status \$body_bytes_sent '
                         '"\$http_referer" "\$http_user_agent"';

server {
    listen 80;
    server_name ${DOMAIN};
    # Do not tell every visitor which nginx version and distribution this is.
    server_tokens off;
    access_log /var/log/nginx/access.log otri_no_query;

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

        # Microcache for public reads; the API's Cache-Control decides what is cacheable and for
        # how long, a session cookie or bearer token bypasses the cache, and a stale copy is
        # served while one request refreshes it (no thundering herd on a popular leaderboard).
        proxy_cache otri_cache;
        proxy_cache_methods GET HEAD;
        proxy_cache_bypass \$http_authorization \$cookie_otri_session;
        proxy_no_cache \$http_authorization \$cookie_otri_session;
        proxy_cache_lock on;
        proxy_cache_use_stale updating error timeout;
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

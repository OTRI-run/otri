# Deploy scripts

Automates most of [`docs/operations/digitalocean-deployment.md`](../../docs/operations/digitalocean-deployment.md). Run in order, on a fresh Ubuntu 24.04 Droplet:

| # | Script | Run as | What it does |
| --- | --- | --- | --- |
| 1 | `01-bootstrap.sh [deploy_user]` | root | Creates the deploy user, copies your SSH key to it, installs packages (`ufw`, `fail2ban`, Python, Nginx, certbot, **PostgreSQL**), configures the firewall, enables `fail2ban` and unattended security updates, and creates the `otri` database/role (credentials saved to `~deploy_user/otri-database-url.txt`). |
| 2 | `02-deploy-app.sh [repo_url] [branch] [app_dir]` | deploy user | Clones/updates the repo, sets up the Python venv, installs dependencies, writes `.env` (including `DATABASE_URL`, `RESEND_API_KEY`, etc.), runs the database schema/seed step, and installs/starts the `otri-api` systemd service. Safe to re-run for updates. Requires `OTRI_API_ALLOWED_ORIGINS` to be set first; auto-generates `OTRI_API_JWT_SECRET` on first run and preserves it on later runs (set it yourself to control the value); picks up `DATABASE_URL` automatically from step 1's output file. |
| 3 | `03-configure-nginx.sh <domain> <email>` | root (sudo) | Configures the Nginx reverse proxy and issues a Let's Encrypt certificate. Point a DNS `A` record at the Droplet before running this. |
| 4 | `04-backup-db.sh` | deploy user (via cron) | Nightly `pg_dump`, gzip-compressed, 14-day retention. Not installed automatically — add the cron line printed in the script's header comment. |

## SSH access

This assumes the Droplet was created with SSH-key-only authentication (DigitalOcean disables root password login automatically when you add a key at creation time), so there's no separate SSH-hardening step here. If you created the Droplet with password auth enabled, disable it yourself in `/etc/ssh/sshd_config` (`PasswordAuthentication no`) before exposing it publicly.

## Example run

```bash
# As root, right after Droplet creation:
./01-bootstrap.sh otri

# As the otri user:
RESEND_API_KEY="re_..." \
  OTRI_API_ALLOWED_ORIGINS="https://otri.run,https://www.otri.run" ./02-deploy-app.sh

# As root/sudo, after pointing DNS at the Droplet:
sudo ./03-configure-nginx.sh api.otri.run you@example.com

# As the otri user, add nightly backups:
crontab -e
# 0 2 * * * /opt/otri/scripts/deploy/04-backup-db.sh >> /var/log/otri-backup.log 2>&1
```

## Notes

- These scripts assume Ubuntu 24.04 (matching `docs/operations/digitalocean-deployment.md`).
- Get a `RESEND_API_KEY` from [resend.com](https://resend.com) — without it, organizer verification/password-reset emails are logged instead of sent (see `api/README.md`).

- All are idempotent enough to re-run safely.
- `*.sh` files are forced to LF line endings via `.gitattributes` — a CRLF shell script fails on Linux.

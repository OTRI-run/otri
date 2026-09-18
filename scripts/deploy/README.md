# Deploy scripts

Automates most of [`docs/operations/digitalocean-deployment.md`](../../docs/operations/digitalocean-deployment.md). Run in order, on a fresh Ubuntu 24.04 Droplet:

| # | Script | Run as | What it does |
| --- | --- | --- | --- |
| 1 | `01-bootstrap.sh [deploy_user]` | root | Creates the deploy user, copies your SSH key to it, installs packages (`ufw`, `fail2ban`, Python, Nginx, certbot, **PostgreSQL**), configures the firewall, enables `fail2ban` and unattended security updates, and creates the `otri` database/role (credentials saved to `~deploy_user/otri-database-url.txt`). |
| 2 | `02-deploy-app.sh [repo_url] [branch] [app_dir]` | deploy user | Clones/updates the repo, sets up the Python venv, installs dependencies, writes `.env` (including `DATABASE_URL`, `RESEND_API_KEY`, etc.), runs the database schema/seed step, and installs/starts the `otri-api` systemd service. Safe to re-run for updates. Requires `OTRI_API_ALLOWED_ORIGINS` to be set first; auto-generates `OTRI_API_JWT_SECRET` on first run and preserves it on later runs (set it yourself to control the value); picks up `DATABASE_URL` automatically from step 1's output file. |
| 3 | `03-configure-nginx.sh <domain> <email>` | root (sudo) | Configures the Nginx reverse proxy and issues a Let's Encrypt certificate. Point a DNS `A` record at the Droplet before running this. |
| 4 | `04-backup-db.sh` | deploy user (via cron) | Nightly `pg_dump` (integrity-checked) plus a tar of the shared courses and `.env`; 30-day local retention; copied off the Droplet with `rclone` when `OTRI_BACKUP_RCLONE_REMOTE` is set in `.env`. Cron line in the script header (log under the user's home, not `/var/log`). |
| 7 | `07-restore-db.sh <backup.sql.gz> [--into otri]` | deploy user | Restores a backup into a scratch database, prints row counts and drops it (the monthly "do the backups work" check); with `--into otri` stops the API, replaces the live database and restarts. |
| 8 | `08-install-watchdog.sh` | root (sudo) | systemd timer every 2 minutes: restarts `otri-api` after three failed `/health` checks, alerts by email (Resend, to `OTRI_ALERT_EMAIL` or the first `OTRI_ADMIN_EMAILS` entry) on restarts, disk ≥ 80 % and stopped nginx/postgresql/fail2ban. Pair it with an external uptime check on `https://api.otri.run/health`. |
| 9 | `09-harden-sudo.sh` | root | Replaces the deploy user's blanket `NOPASSWD: ALL` with the exact commands the scripts need (service restart, unit file, ufw/fail2ban status, restore-test databases) and removes it from the sudo group. Root stays reachable over SSH for everything else. |
| 6 | `06-install-dem.sh <tile-id>...` | deploy user | Downloads the named 1°×1° Copernicus GLO-30 tiles (e.g. `N45E006`, ~25 MB each) into `/opt/otri/dem/`, checksums them and writes `manifest.json`. `02-deploy-app.sh` then sets `OTRI_DEM_MANIFEST` automatically. Courses outside the installed tiles still score, from uploaded elevations, at Low confidence with the reason shown. |
| 5 | `05-auto-update.sh [app_dir] [branch]` | deploy user (via cron) | Polls `origin/<branch>` once; if there's a new commit, discards local changes to tracked-but-gitignored files, pulls, and re-runs `02-deploy-app.sh` (reusing the existing `.env`'s `OTRI_API_ALLOWED_ORIGINS`/`RESEND_API_KEY`). Does nothing (no output, no restart) when there's nothing new — cheap to run every minute via cron. Not installed automatically — add the cron line printed in the script's header comment. |

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

# As the otri user, pin terrain tiles for the regions you expect (then re-run step 2):
./06-install-dem.sh N45E006 N45E007 N46E006 N46E007 N07E098 N08E098

# As the otri user, add nightly backups:
crontab -e
# 0 2 * * * /opt/otri/scripts/deploy/04-backup-db.sh >> /var/log/otri-backup.log 2>&1

# As the otri user, add auto-deploy-on-push (checks for a new commit every minute):
crontab -e
# * * * * * /opt/otri/scripts/deploy/05-auto-update.sh >> /home/otri/otri-auto-update.log 2>&1
```

## Notes

- These scripts assume Ubuntu 24.04 (matching `docs/operations/digitalocean-deployment.md`).
- Get a `RESEND_API_KEY` from [resend.com](https://resend.com) — without it, organizer verification/password-reset emails are logged instead of sent (see `api/README.md`).

- All are idempotent enough to re-run safely.
- The API writes a bounded measurement cache to `/opt/otri/data/cache/measurements/` (one JSON per GPX content hash + terrain manifest, at most 64). It is content-addressed and safe to delete at any time; the next request just measures again.
- `*.sh` files are forced to LF line endings via `.gitattributes` — a CRLF shell script fails on Linux.

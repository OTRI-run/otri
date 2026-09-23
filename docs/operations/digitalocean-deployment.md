# Deploying the OTRI API on DigitalOcean

This runbook covers deploying **`api/`** (the FastAPI backend) to a DigitalOcean Droplet, hardened for public exposure. It does not cover the frontend — see "Architecture" below for why.

## Automated setup

Most of this is scripted under [`scripts/deploy/`](../../scripts/deploy) — see [`scripts/deploy/README.md`](../../scripts/deploy/README.md) for the exact commands. The sections below explain what each script does and why, and remain the fallback if you'd rather run the steps by hand.

## Architecture: what goes where

- **Frontend** (the site: the app at `/`, the organizer app at `/organizer/`, the embeddable calculator at `/embed/`; old `/prototype/` links redirect) stays on **GitHub Pages**, built by the existing [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml). It's static; nothing about it needs a server.
- **`api/`** is the only piece that needs an always-on process — it's the only part of this project that requires a Droplet at all.

This keeps cost and attack surface minimal: one small Droplet running one Python process behind Nginx, nothing else public-facing. Point the frontend at it via `VITE_OTRI_API_BASE_URL=https://api.otri.run` (see `.env.example`) at build time.

## 1. Create the Droplet

- **Image:** Ubuntu 24.04 LTS.
- **Size:** the smallest plan (1 vCPU / 512 MB–1 GB RAM) is enough — this is a lightweight FastAPI app with no database yet. Resize later if needed; DigitalOcean allows vertical resizing without rebuilding.
- **Authentication:** SSH key only. Do not enable password authentication.
- **Region:** wherever is closest to your expected users.

## 2. Initial server hardening

**Automated:** `scripts/deploy/01-bootstrap.sh` does everything below.

SSH in as `root` once. If you created the Droplet with SSH-key-only authentication (recommended, and the default when you add a key at creation time), DigitalOcean already disables root password login for you — no extra `sshd_config` changes needed here.

```bash
# Create a non-root deploy user
adduser otri
usermod -aG sudo otri

# Copy your SSH key to the new user
rsync --archive --chown=otri:otri ~/.ssh /home/otri
```

From now on, prefer SSHing in as `otri` and using `sudo`, rather than working as `root` directly.

```bash
# Firewall: only SSH, HTTP, HTTPS
sudo apt update && sudo apt install -y ufw fail2ban unattended-upgrades
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# fail2ban protects SSH from brute-force attempts, with sane defaults out of the box
sudo systemctl enable --now fail2ban

# Unattended security updates
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Also enable DigitalOcean's built-in Cloud Firewall (Networking → Firewalls) as a second layer in front of the Droplet, mirroring the same 22/80/443 rule — defense in depth in case `ufw` is ever misconfigured.

## 3. Install runtime dependencies

**Automated:** included in `01-bootstrap.sh`.

```bash
sudo apt install -y python3.12 python3.12-venv nginx git
```

## 4. Deploy the code

```bash
sudo mkdir -p /opt/otri
sudo chown otri:otri /opt/otri
cd /opt/otri
git clone https://github.com/OTRI-run/otri.git .

python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
pip install gunicorn
```

Use a dedicated venv (not system Python) so dependency upgrades never touch the OS's own Python packages.

## 5. Run the API as a systemd service (auto-restart, auto-start on boot)

**Automated:** `scripts/deploy/02-deploy-app.sh` does everything in this section, including steps 4 and 6 below, except writing the unit file once the deploy user's sudo is hardened (`09-harden-sudo.sh`): a user who may write a unit file has root, so the unit is root's to install, with `sudo ./scripts/deploy/10-install-service.sh [service_user] [app_dir]`. The deploy compares the installed unit with the one the release expects and asks for that command when they differ (rare: a new sandbox path, another worker count); until then it restarts the service with the unit that is there.

Create `/etc/systemd/system/otri-api.service`:

```ini
[Unit]
Description=OTRI API (FastAPI/Gunicorn)
After=network.target

[Service]
Type=simple
User=otri
Group=otri
WorkingDirectory=/opt/otri
EnvironmentFile=/opt/otri/.env
ExecStart=/opt/otri/venv/bin/gunicorn api.app:app \
    --workers 2 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --access-logfile - \
    --error-logfile -
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/otri/data
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Notes on the hardening directives:
- `NoNewPrivileges=true` / `ProtectSystem=strict` / `ProtectHome=true` restrict what the service can touch on disk, limiting blast radius if the process is ever compromised.
- `ReadWritePaths=/opt/otri/data` is the **one** exception, required because `POST /races` writes to `data/demo/races.csv` and organizer accounts are stored in `data/organizers.db` (see `api/README.md` "Known gaps" — both are prototype-only persistence, not a real database).
- 2 workers is enough for a low-traffic prototype; increase only if you see real load (`(2 × CPU cores) + 1` is the usual Gunicorn rule of thumb).

Create `/opt/otri/.env` (not committed to git — see `.gitignore`):

```
OTRI_API_ALLOWED_ORIGINS=https://otri.run,https://www.otri.run
OTRI_API_BASE_URL=https://api.otri.run
# Optional. "Continue with Google" for organizers: an OAuth client (Web application) in the Google
# Cloud console, with https://api.otri.run/auth/google/callback as an authorised redirect URI.
OTRI_GOOGLE_CLIENT_ID=
OTRI_GOOGLE_CLIENT_SECRET=
OTRI_API_JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
```

`OTRI_API_BASE_URL` is where Google is told to send the browser back and where a link the API emails points. Without it the address is read from the request, and Nginx passes `X-Forwarded-Host` through from whoever sent it, so the address would be the caller's to choose. It must match the redirect URI registered in the Google console exactly.

`OTRI_API_JWT_SECRET` matters here specifically: without it, a random secret is generated on every process start, which means every organizer gets logged out whenever the service restarts (deploys, reboots, crashes). Generate it once and keep it in `.env`.

The deploy script rewrites this file on every deploy, but carries over every setting already in it, so a setting added by hand stays.

Lock it down:

```bash
sudo chmod 600 /opt/otri/.env
sudo chown otri:otri /opt/otri/.env
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now otri-api
sudo systemctl status otri-api
```

Check logs with `journalctl -u otri-api -f`.

## 6. Nginx reverse proxy + TLS

**Automated:** `scripts/deploy/03-configure-nginx.sh <domain> <email>`.

Point a DNS `A` record for `api.otri.run` at the Droplet's IP first, then:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/otri-api`:

```nginx
server {
    listen 80;
    server_name api.otri.run;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Reasonable limits for GPX/CSV/XLSX uploads
        client_max_body_size 20m;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/otri-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Issues and auto-configures HTTPS, sets up auto-renewal via a systemd timer
sudo certbot --nginx -d api.otri.run
```

Certbot's renewal timer is installed automatically — verify it with `sudo systemctl list-timers | grep certbot`.

## 7. Point the frontend at it

Rebuild the frontend with the production API URL:

```powershell
$env:VITE_OTRI_API_BASE_URL = "https://api.otri.run"
npm run build
```

If you want this baked in automatically for every GitHub Pages deploy, add it as a repository variable and export it as an env var in [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) before the `npm run build` step.

## 8. Deploying updates

**Automated:** re-run `scripts/deploy/02-deploy-app.sh` — it pulls the latest code and restarts the service.

Simplest manual approach — SSH in and pull:

```bash
cd /opt/otri
git pull
source venv/bin/activate
pip install -r requirements-dev.txt
sudo systemctl restart otri-api
```

For less manual work later, a GitHub Actions workflow that SSHes in and runs the same steps (using a deploy key stored as a repository secret) is the natural next step — not set up here since it requires provisioning secrets you control.

## 9. Backups and monitoring

- **Data**: `data/demo/races.csv` is the only mutable state right now (via `POST /races`). Since it's prototype-only persistence, back it up manually before demos if it matters, or just re-clone from git (it's tracked) — a real database replaces this entirely before any production organizer use.
- **Droplet snapshots**: enable DigitalOcean's automatic weekly backups (Droplet → Backups) for disaster recovery of the whole server config.
- **Monitoring**: enable DigitalOcean's free Droplet monitoring (CPU, memory, disk, bandwidth graphs + alert policies) from the control panel — no extra setup needed.
- **Logs**: `journalctl -u otri-api` (API) and `/var/log/nginx/access.log` / `error.log` (Nginx).

## 10. Before this becomes the real production API (not just the prototype)

Per `api/README.md`'s "Known gaps" and `docs/roadmap.md`, do **not** point real organizers at this setup as-is. Required first:

- Replace the CSV-append `POST /races` with a real database (PostgreSQL, per `HANDBOOK.md`'s recommended stack).
- Replace the SQLite/hand-rolled JWT organizer auth with a battle-tested auth provider once real accounts matter.
- Add rate limiting (e.g. Nginx `limit_req`, or a proper API gateway) before any public announcement — `/auth/login` and `/auth/register` are currently unthrottled.

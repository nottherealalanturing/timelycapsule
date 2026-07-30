# T-19 production deploy — server setup runbook

One-time manual setup on the EC2 VM (`52.59.102.62`), then all future
deploys are automatic via `.github/workflows/deploy.yml` on every push to
`main` that passes CI.

## 1. Install Docker

SSH in first:
```bash
ssh -i ~/.ssh/timelycapsule-key.pem ubuntu@52.59.102.62
```

Then, on the server:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker   # or log out/in for the group change to take effect
docker --version
docker compose version
```

## 2. Clone the repo

```bash
sudo mkdir -p /opt/timelycapsule
sudo chown ubuntu:ubuntu /opt/timelycapsule
git clone https://github.com/<your-username>/<your-repo>.git /opt/timelycapsule
cd /opt/timelycapsule
```

## 3. Create `.env.production`

```bash
cp .env.production.example .env.production
nano .env.production   # or vim/your editor of choice
```

Fill in every value using the credentials/keys you collected during the
human-setup checklist (Postgres password — generate a fresh long random
one, JWT keypair, Backblaze B2 key, healthchecks.io ping URL, Resend/R2
keys already in use since earlier tickets, etc). Generate the JWT keypair
first if you haven't:

```bash
node apps/api/scripts/generate-jwt-keys.mjs
```

(paste its output into `JWT_PRIVATE_KEY_B64`/`JWT_PUBLIC_KEY_B64` in
`.env.production`)

**Never commit this file** — it's gitignored, but double-check with
`git status` before any commit from this directory.

## 4. First manual deploy (verify before trusting CI/CD)

```bash
export GHCR_OWNER=<your-github-username>
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

All services should show `running` except `migrate`, which should show
`exited (0)` — it runs once per deploy, not continuously. Check logs if
anything looks wrong:

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Confirm the API responds locally on the box before trusting DNS/TLS:
```bash
curl http://localhost:4001/health
```

## 5. Firewall (ufw)

Restrict the VM to only the ports it needs — 22 (SSH), 80/443 (Caddy).
Everything else (Postgres's 5432, the app's internal 4001, etc.) stays
reachable only inside the Docker network, never from the internet.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

**Also check your EC2 security group** (in the AWS console, not just
`ufw`) — it should likewise only allow 22/80/443 inbound. `ufw` alone isn't
enough if the security group is wide open; the two need to agree.

## 6. fail2ban (auto-block repeated failed SSH logins)

```bash
sudo apt-get update && sudo apt-get install -y fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

Default config (ban after a handful of failed attempts within a window) is
fine to start — no custom jail config needed at this scale.

## 7. Confirm DNS + TLS end-to-end

Once the `caddy` container is up and `api.timelycapsule.com` resolves to
this box (already confirmed live from the earlier DNS step), Caddy should
automatically obtain a real Let's Encrypt certificate on first request.
Check:

```bash
curl -v https://api.timelycapsule.com/health
```

If that returns `200` with a valid cert, **go to the Cloudflare dashboard
→ SSL/TLS → Overview and switch the mode from "Flexible" to "Full
(strict)."** This was flagged as a follow-up back when the DNS record was
created — Flexible mode talks plaintext HTTP to the origin, which is no
longer necessary (or desired) once Caddy has a real cert here.

## 8. Set a B2 lifecycle rule (prune old backups automatically)

In the Backblaze B2 dashboard → your `tc-db-backups` bucket → **Lifecycle
Settings** → set a rule to keep files for e.g. 30 days then delete. This
replaces having the backup script itself manage retention — one less thing
for the script to get wrong.

## 9. GitHub Actions secrets (for automatic future deploys)

In the GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `52.59.102.62` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | contents of the **private** key (`timelycapsule-key.pem`) used to SSH in — paste the whole file including the `BEGIN`/`END` lines |
| `DEPLOY_PATH` | `/opt/timelycapsule` |

`GITHUB_TOKEN` (used to push to GHCR) is automatic — no setup needed.

Once these are set, every push to `main` that passes CI will automatically
build, push, and redeploy.

## 10. Verify the DoD

- `curl https://api.timelycapsule.com/health` → 200, from your own laptop (not the server).
- Stop the scheduler and confirm the dead-man's switch actually fires:
  ```bash
  docker compose -f docker-compose.prod.yml stop scheduler
  ```
  Wait up to ~10 minutes — you should get a "down" email from healthchecks.io.
  Then restart it:
  ```bash
  docker compose -f docker-compose.prod.yml start scheduler
  ```
- Run a real restore drill — see `deploy/RESTORE_DRILL.md`.

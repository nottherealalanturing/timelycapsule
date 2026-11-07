# External monitoring with healthchecks.io (design; nothing configured yet)

Today alerts only go to the local journal (`tc-health-watch`, every 5 minutes, `ALERT:` lines at priority err). Nobody is notified if a host, the API, the scheduler or the backups stop. healthchecks.io is a dead-man switch: each check expects a ping; silence (or a `/fail` ping) alerts you by email.

## Checks to create (account: yours; free plan allows 20)
| Check name | Pinged by | Period / grace | Alerts when |
|---|---|---|---|
| `oracle-tc-app` | `tc-health-watch` on tc-app every 5 min (existing code: pings URL when `ok`, `URL/fail` on any problem) | 5 min / 10 min | host down, API unhealthy, 5xx, memory/disk/restart alarms |
| `oracle-tc-db` | `tc-health-watch` on tc-db every 5 min (same logic) | 5 min / 10 min | host down, PostgreSQL unhealthy, disk, local backup older than 26 h, off-site upload older than 30 h |
| `scheduler-heartbeat` (exists per project notes; reuse allowed) | the scheduler process on every successful 30 s tick via `HEALTHCHECKS_PING_URL` (`apps/api/src/scheduler.ts`) | 1 min / 5 min | scheduler stopped or cannot reach the database: protects delivery of sealed capsules |
| `oracle-offsite-backup` | `tc-pg-offsite` after a successful upload (`/etc/tc-health/offsite-ping-url`) | 1 day / 6 h | nightly encrypted upload missing (covers a silent B2 or key problem) |
Channels: your email (add Telegram/Slack/SMS later if wanted).
Existing UptimeRobot monitors `TimelyCapsule API` (`https://api.timelycapsule.com/health`) and `TimelyCapsule Web` (apex) cover the public side after DNS cutover; I cannot see them (no login), please confirm they are still active.

## How each URL is installed (you type it; it never goes through chat or shell history)
The ping URL is the secret. On tc-app and tc-db:
```bash
sudo install -d -m 0750 /etc/tc-health
read -rs U && printf '%s' "$U" | sudo install -m 0600 /dev/stdin /etc/tc-health/ping-url; unset U   # paste the URL, press Enter (nothing is echoed)
sudo systemctl start tc-health-watch.service && journalctl -t tc-health-watch -n 1 --no-pager     # then confirm the check turned green
```
Scheduler (tc-app, needs a restart of the scheduler container only):
```bash
cd /opt/timelycapsule && read -rs U && printf 'HEALTHCHECKS_PING_URL=%s\n' "$U" | sudo tee -a .env.production >/dev/null; unset U
sudo docker compose up -d --force-recreate scheduler
```
Off-site backup (tc-db): same as above with `/etc/tc-health/offsite-ping-url`.
Rollback for any of them: delete the file (or the `.env.production` line + recreate scheduler); a missing URL simply disables the ping.

## Test (before relying on it)
Pause or break nothing in production: use healthchecks' "Send test notification"; then stop pinging for one period on a *test* check, or `curl <URL>/fail` once, and confirm the email arrives.

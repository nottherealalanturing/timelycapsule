#!/bin/bash
# Runs backup.sh once immediately (so a fresh deploy has at least one backup
# without waiting up to 24h), then once daily at 03:00 UTC thereafter.
set -euo pipefail

/scripts/backup.sh || echo "[backup] initial run failed, will retry at the next scheduled time"

while true; do
  now_epoch=$(date -u +%s)
  next_3am_epoch=$(date -u -d 'tomorrow 03:00' +%s)
  # If it's currently before today's 03:00 UTC, target that instead of tomorrow's.
  today_3am_epoch=$(date -u -d 'today 03:00' +%s)
  if [ "$now_epoch" -lt "$today_3am_epoch" ]; then
    next_3am_epoch=$today_3am_epoch
  fi
  sleep_secs=$((next_3am_epoch - now_epoch))
  echo "[backup] sleeping ${sleep_secs}s until next run at $(date -u -d "@${next_3am_epoch}" -Iseconds)"
  sleep "$sleep_secs"
  /scripts/backup.sh || echo "[backup] run failed, will retry at the next scheduled time"
done

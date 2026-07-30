#!/bin/bash
# Nightly full Postgres dump, gzipped, uploaded to the Backblaze B2 bucket
# created during T-19's human-setup checklist. Pruning of old backups is
# handled by a B2 bucket lifecycle rule (set in the B2 dashboard), not here
# — keeps this script's only job "make a dump, upload it, done."
set -euo pipefail

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILENAME="timelycapsule-${TIMESTAMP}.sql.gz"
TMP="/tmp/${FILENAME}"

echo "[backup] $(date -u -Iseconds) starting dump -> ${FILENAME}"
pg_dump "${DATABASE_URL}" | gzip > "${TMP}"

export RCLONE_CONFIG_B2REMOTE_TYPE=b2
export RCLONE_CONFIG_B2REMOTE_ACCOUNT="${B2_KEY_ID}"
export RCLONE_CONFIG_B2REMOTE_KEY="${B2_APPLICATION_KEY}"

rclone copyto "${TMP}" "b2remote:${B2_BUCKET}/${FILENAME}"
rm -f "${TMP}"

echo "[backup] $(date -u -Iseconds) uploaded ${FILENAME} to b2://${B2_BUCKET}"

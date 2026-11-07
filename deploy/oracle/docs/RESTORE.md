# Backups, retention and restore (Oracle deployment)

Every procedure here was rehearsed against a seeded local PostgreSQL 16.15 (same image digest as production) on 2026-11-07; the drill also has negative tests (corrupted, truncated, tampered backups are rejected).

## 1. What exists

| Where | What | Made by | Kept |
|---|---|---|---|
| tc-db `/var/backups/tc-db` | per night (03:15 UTC): `NAME.dump` (pg_dump custom format, all schemas incl. `pgboss`, `drizzle`), `NAME.dump.sha256`, `NAME.globals.sql` (roles, SCRAM password hashes, connection limits), `NAME.manifest.json` (schema hash, exact row counts before/after the dump) | `tc-pg-backup.timer` | **forever**: nothing deletes local backups |
| Backblaze B2 `tc-db-backups/oracle/` | one age-encrypted bundle per night: `NAME.bundle.tar.age` containing the four files above | `tc-pg-offsite.timer` (03:45 UTC), **disabled until activated** | per the lifecycle rule (section 2) |
| Oracle | tc-app boot-volume backups (2, manual) | by hand | until you delete them |

`NAME.globals.sql` contains password hashes: treat it as a secret (files are 0600 root, and encrypted off-site).
Capsule contents are end-to-end encrypted by the clients; the database holds ciphertext and key wraps, so a backup never contains plaintext capsule content.

## 2. Retention: exactly what is kept

**Local (tc-db):** unlimited by design (standing rule: no automatic deletion). Growth today is ~120 kB per night (about 45 MB a year); it will grow with data. The health watch alerts at 80 % disk. Pruning is a manual, approved action (list first, then delete named files).

**B2:** controlled by one bucket lifecycle rule that **you** set once in the B2 console; B2 executes it itself, so the upload-only key never needs delete rights.
`[{ "fileNamePrefix": "oracle/", "daysFromUploadingToHiding": 30, "daysFromHidingToDeleting": 7 }]`
- Rules run once a day. A bundle uploaded on day 0 is hidden by the first run on or after day 30 and permanently deleted by the first run on or after 7 more days: **visible 30-31 days, stored 37-38 days**. Steady state: 30-31 visible nightly bundles plus ~7 hidden ones.
- Hidden = not shown in normal listings but recoverable: with your owner credentials delete the hide marker (B2 console: show "all versions", delete the marker, or `b2 file unhide`).
- Overlap: if other rules match the same files, B2 applies the smallest value of each property. The bucket is currently "Keep all versions", so nothing overlaps; **re-check before adding the rule** (an empty-prefix rule with a short hide time would shorten retention).
- Time-based, not count-based: if uploads silently stopped, copies still expire after ~37 days. Alerts: health watch warns when no off-site upload succeeded in 30 hours; external ping (healthchecks.io) covers the case where the whole host is down. Local copies are unaffected.
- Recovery point (RPO) = up to 24 h (nightly). Recovery time for the current size: seconds to minutes; scale tested only with seeded data (31 rows): re-run the drill after real data exists.

## 3. Monthly restore drill (proves a backup works; never touches production)

Run on a machine with spare RAM (your Mac), not tc-db:
```bash
# 1. get one backup bundle (from B2 with the age identity) or copy files from tc-db into ./drill/
mkdir -p drill && cd drill
age -d -i ~/tc-backup-identity.txt NAME.bundle.tar.age | tar -x
# 2. restore into a scratch PostgreSQL (same image as production) and verify
/path/to/tc-pg-restore-drill .            # newest backup in the directory; or: tc-pg-restore-drill . NAME
```
PASS means: sha256 matches; globals define `tc_app`; `pg_restore --exit-on-error` succeeded; schema hash equals the manifest; every table's restored row count is within the manifest's before/after counts; `tc_app` can read its tables. Exit code 0 = PASS. Record date and result in the execution log.

## 4. Fetching a backup from B2

Needs a B2 key with `listFiles`/`readFiles` on prefix `oracle/` (the upload key has both) and the age identity.
```bash
export RCLONE_CONFIG_B2_TYPE=b2 RCLONE_CONFIG_B2_ACCOUNT=<keyId> RCLONE_CONFIG_B2_KEY=<appKey>   # type them, do not paste into chat/history
docker run --rm -e RCLONE_CONFIG_B2_TYPE -e RCLONE_CONFIG_B2_ACCOUNT -e RCLONE_CONFIG_B2_KEY rclone/rclone@sha256:7cbeec24a44f206067597c0368be4de90ae19a64d5113c7d1938bd737a81e466 lsf B2:tc-db-backups/oracle/ | tail
docker run --rm -e RCLONE_CONFIG_B2_TYPE -e RCLONE_CONFIG_B2_ACCOUNT -e RCLONE_CONFIG_B2_KEY -v "$PWD":/out rclone/rclone@sha256:7cbeec24a44f206067597c0368be4de90ae19a64d5113c7d1938bd737a81e466 copyto B2:tc-db-backups/oracle/NAME.bundle.tar.age /out/NAME.bundle.tar.age
```

## 5. Procedure B: damaged data in production (database server intact)

Rehearsed. Nothing is deleted: the damaged database is kept under a new name.
1. Decide the restore point (a backup from before the damage). Fetch/unpack it (section 4/3 step 1) onto tc-db, or use the local file.
2. On tc-app: `cd /opt/timelycapsule && sudo docker compose stop api worker scheduler` (Caddy may stay up).
3. On tc-db (as tc_admin over the local socket):
```bash
sudo docker exec tc-postgres psql -U tc_admin -d postgres -c "create database timelycapsule_restore owner tc_app"
sudo docker exec -i tc-postgres pg_restore -U tc_admin -d timelycapsule_restore --exit-on-error < NAME.dump
sudo docker exec tc-postgres psql -U tc_admin -d timelycapsule_restore -c "select count(*) from users"   # compare with NAME.manifest.json
sudo docker exec tc-postgres psql -U tc_admin -d postgres \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('timelycapsule','timelycapsule_restore') and pid<>pg_backend_pid()" \
  -c "alter database timelycapsule rename to timelycapsule_damaged_$(date -u +%Y%m%d)" \
  -c "alter database timelycapsule_restore rename to timelycapsule"
```
4. `sudo docker compose up -d` on tc-app; check `/health`, logs, row counts. Keep `timelycapsule_damaged_*` until you approve its removal.
5. Undo: stop the stack and rename the two databases back.

## 6. Procedure C: tc-db lost (new instance)

1. Provision the VM and the 50 GB data volume as in `RUNBOOK.md`; bring up PostgreSQL through the init gate (`tc-pg-preflight`, `tc-pg-init-gate`, `tc-postgres.service`) so it is initialised exactly like production.
2. Apply roles: `docker exec -i tc-postgres psql -U tc_admin -d postgres -v ON_ERROR_STOP=0 -q < NAME.globals.sql` (one expected error: `role "tc_admin" already exists`; the file also restores `tc_app` with its password hash and `CONNECTION LIMIT 24`, so `DATABASE_URL` on tc-app keeps working unchanged).
3. `create database timelycapsule owner tc_app`, then `pg_restore -U tc_admin -d timelycapsule --exit-on-error < NAME.dump`.
4. Check `pg_hba.conf` allows `tc_app` from tc-app's private IP only; verify login from tc-app, then start the stack.
5. Run `tc-pg-backup` once and the drill on its output.

## 7. Procedure D: tc-app lost
The stack is reproducible: compose files and Caddy config are in the repo (`deploy/oracle/tc-app`), images are rebuilt with `release.sh` from the tag. **The only irreplaceable files are `.env.production` (secrets) and the Origin CA private key**; keep both in your password manager. Losing the JWT keys signs users out (no data loss); losing `GATE_TOKEN_SECRET` invalidates outstanding gate tokens.

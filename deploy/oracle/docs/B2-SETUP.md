# Off-site backup activation checklist (B2, bucket `tc-db-backups`, prefix `oracle/`)

Nothing here has been done. Order matters; steps marked YOU need your accounts.

1. YOU: read the bucket's Lifecycle Settings (currently "Keep all versions": confirmed 2026-11-07).
2. YOU: create the lifecycle rule `[{"fileNamePrefix":"oracle/","daysFromUploadingToHiding":30,"daysFromHidingToDeleting":7}]` (B2 console: Buckets -> tc-db-backups -> Lifecycle Settings -> Custom). Re-verify no empty-prefix rule exists.
3. YOU: create an **application key**, name `tc-oracle-backup`: bucket `tc-db-backups` only; name prefix `oracle/`; capabilities `listBuckets, listFiles, readFiles, writeFiles` (no delete, no bucket settings); no expiry or a long one you will calendar.
4. YOU: generate the age keypair on your Mac: `age-keygen -o ~/tc-backup-identity.txt`; store the identity in your password manager AND an offline copy. Send only the public line (`age1...`).
5. On tc-db (me, with your values; values typed by you with hidden input, never in chat):
   - `/etc/tc-postgres/age-recipient.txt` (the public line; root 0644)
   - `/etc/tc-postgres/b2.env` (root 0600): `B2_KEY_ID=...`, `B2_APP_KEY=...`, `B2_BUCKET=tc-db-backups`
6. Dry check: `sudo systemctl start tc-pg-offsite.service` once manually; expect `tc-pg-offsite: ok file=...bundle.tar.age files=4`, then confirm the object in the console, download it and run the restore drill from it (docs/RESTORE.md section 3).
7. Only then: `sudo systemctl enable --now tc-pg-offsite.timer`. Observe two nights. The health watch begins alerting if an upload is older than 30 h.
Rollback: `systemctl disable --now tc-pg-offsite.timer`; remove `b2.env`.

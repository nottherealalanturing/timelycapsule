# Restore drill (run monthly)

Proves a real backup can actually be restored — not just that the nightly
job "succeeded." Run this against a throwaway database, never production.

## 1. Find a recent backup

```bash
export RCLONE_CONFIG_B2REMOTE_TYPE=b2
export RCLONE_CONFIG_B2REMOTE_ACCOUNT=<B2_KEY_ID>
export RCLONE_CONFIG_B2REMOTE_KEY=<B2_APPLICATION_KEY>
rclone lsl b2remote:tc-db-backups | tail -5
```

## 2. Download it

```bash
rclone copy b2remote:tc-db-backups/<filename>.sql.gz /tmp/
gunzip /tmp/<filename>.sql.gz
```

## 3. Restore into a throwaway Postgres

Don't restore over the real production database. Spin up a scratch
container instead:

```bash
docker run --rm -d --name restore-drill \
  -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill \
  -p 5555:5432 postgres:16

sleep 5
psql postgres://drill:drill@localhost:5555/drill < /tmp/<filename>.sql
```

## 4. Verify it actually worked

```bash
psql postgres://drill:drill@localhost:5555/drill -c "select count(*) from users;"
psql postgres://drill:drill@localhost:5555/drill -c "select count(*) from capsules;"
```

Row counts should look plausible (non-zero, roughly matching what you'd
expect from production at the time of the dump) — not just "the command
didn't error."

## 5. Clean up

```bash
docker stop restore-drill
rm /tmp/<filename>.sql
```

## Log it

Record the date and result (row counts, any issues found) in
`plan/PROGRESS.md`'s decisions log — this is what makes "we tested restores"
a verifiable fact later, not just a claim.

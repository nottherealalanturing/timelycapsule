# Nightly Postgres -> Backblaze B2 backup, per T-19. Based on the official
# postgres image (already has a version-matched `pg_dump`) rather than the
# api's node image, since this container's only job is dump+upload, not
# running any app code.
FROM postgres:16-alpine

RUN apk add --no-cache rclone bash gzip dcron

COPY backup.sh /scripts/backup.sh
COPY crontab /etc/crontabs/root
RUN chmod +x /scripts/backup.sh

# Foreground cron daemon so the container has a real PID 1 process and
# `docker logs` / `restart: unless-stopped` work as expected.
ENTRYPOINT ["crond", "-f", "-l", "2"]

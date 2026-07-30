# Nightly Postgres -> Backblaze B2 backup, per T-19. Based on the official
# postgres image (already has a version-matched `pg_dump`) rather than the
# api's node image, since this container's only job is dump+upload, not
# running any app code.
FROM postgres:16-alpine

RUN apk add --no-cache rclone bash gzip coreutils

COPY backup.sh /scripts/backup.sh
COPY run.sh /scripts/run.sh
RUN chmod +x /scripts/backup.sh /scripts/run.sh

# A plain sleep-loop instead of Alpine's dcron: dcron calls setpgid on
# itself when starting a job, which the kernel refuses once dcron is the
# container's PID 1 (no parent process to hand pgid control to) — it
# crash-looped on every container start with "setpgid: Operation not
# permitted" before this was caught by actually running the container, not
# just building the image. A sleep-until-next-3am loop needs no init
# wrapper and has no such PID-1-specific behavior to trip over.
ENTRYPOINT ["/scripts/run.sh"]

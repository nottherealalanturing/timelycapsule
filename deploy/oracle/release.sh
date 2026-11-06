#!/bin/bash
# Reproducible release of the API image from a CLEAN, TAGGED commit.
# Run on the Mac from the repo root. It builds and ships; it does NOT switch the
# running stack: the final `docker compose up -d` stays a deliberate manual step.
set -euo pipefail

TAG="${1:?usage: release.sh <git-tag, e.g. v2026.11.1>}"
cd "$(git rev-parse --show-toplevel)"

[ -z "$(git status --porcelain)" ] || { echo "REFUSE: working tree is not clean"; exit 1; }
SHA=$(git rev-parse "refs/tags/$TAG^{commit}") || { echo "REFUSE: tag $TAG does not exist"; exit 1; }
[ "$SHA" = "$(git rev-parse HEAD)" ] || { echo "REFUSE: HEAD is not tag $TAG"; exit 1; }

IMG="timelycapsule-api:$TAG"
docker buildx build --platform linux/amd64 -f apps/api/Dockerfile \
  --build-arg GIT_SHA="$SHA" -t "$IMG" --load .
ID=$(docker image inspect "$IMG" --format '{{.Id}}')
echo "built $IMG id=$ID revision=$SHA"

# Ship by tarball (no registry credentials on the server).
docker save "$IMG" | gzip -1 | ssh tc-app 'gunzip | sudo docker load'
ssh tc-app "sudo docker image inspect '$IMG' --format '{{.Id}}'" | grep -qx "$ID" \
  && echo "OK: server image id matches build ($ID)"

cat <<MSG
Next (manual, on tc-app):
  1. cd /opt/timelycapsule && sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/' .env
  2. sudo docker compose up -d      # migrate runs first
  3. record in RUNBOOK: tag=$TAG commit=$SHA image=$ID
Rollback: set IMAGE_TAG to the previous tag and run 'docker compose up -d'.
MSG

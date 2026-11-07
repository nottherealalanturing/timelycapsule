#!/bin/bash
# Reproducible release of the API image from a CLEAN, TAGGED commit that is already on origin/main.
# Run on the Mac, inside the repo. It BUILDS and SHIPS an image; it never starts, stops, restarts or
# reconfigures anything on the server: `docker load` only adds an image. Switching the running
# stack (`docker compose up -d`) remains a separate, deliberate step printed at the end.
#
# Guarantees (each one is a hard refusal, not a warning):
#   1. TAG matches vYYYY.M.N.
#   2. The working tree is clean and HEAD is exactly the commit the tag points to.
#   3. That commit is contained in origin/main (merged, CI-tested), after a fresh fetch.
#   4. The build input is `git archive` of the tagged commit, NOT the working directory,
#      so ignored/untracked local files can never end up in the image.
#   5. The server is reachable BEFORE the (slow) build, has >= 6 GB free, and does not already
#      hold an image with this tag (an existing tag is never overwritten).
#   6. After shipping, the image ID on the server must equal the one built.
# DRY_RUN=1 runs only checks 1-3 (and 5's SSH reachability is skipped) and exits.
set -euo pipefail

TAG="${1:?usage: release.sh <tag, e.g. v2026.11.1>}"
[[ "$TAG" =~ ^v[0-9]{4}\.[0-9]{1,2}\.[0-9]+$ ]] || { echo "REFUSE: tag must look like v2026.11.1"; exit 1; }

cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain)" ] || { echo "REFUSE: working tree is not clean"; exit 1; }
SHA=$(git rev-parse -q --verify "refs/tags/$TAG^{commit}") || { echo "REFUSE: tag $TAG does not exist"; exit 1; }
[ "$SHA" = "$(git rev-parse HEAD)" ] || { echo "REFUSE: HEAD is not the commit tag $TAG points to"; exit 1; }
git fetch -q origin main
git merge-base --is-ancestor "$SHA" origin/main || { echo "REFUSE: $SHA is not on origin/main (merge first)"; exit 1; }
echo "OK: $TAG -> $SHA is clean, checked out, and on origin/main"
[ "${DRY_RUN:-0}" = 1 ] && { echo "DRY_RUN: stopping before build"; exit 0; }

IMG="timelycapsule-api:$TAG"
SSH="ssh -o BatchMode=yes -o ConnectTimeout=15 tc-app"
$SSH true || { echo "REFUSE: cannot reach tc-app over SSH (admin IP changed? use WireGuard/Bastion)"; exit 1; }
FREE_KB=$($SSH "df --output=avail -k / | tail -1")
[ "$FREE_KB" -ge 6000000 ] || { echo "REFUSE: tc-app has less than 6 GB free"; exit 1; }
if $SSH "sudo docker image inspect '$IMG' >/dev/null 2>&1"; then
  echo "REFUSE: $IMG already exists on tc-app (never overwritten). Use a new tag."; exit 1
fi

BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT
git archive "$SHA" | tar -x -C "$BUILD_DIR"

docker buildx build --platform linux/amd64 -f "$BUILD_DIR/apps/api/Dockerfile" \
  --build-arg GIT_SHA="$SHA" -t "$IMG" --load "$BUILD_DIR"
ID=$(docker image inspect "$IMG" --format '{{.Id}}')
echo "built $IMG id=$ID revision=$SHA"

docker save "$IMG" | gzip -1 | $SSH 'gunzip | sudo docker load'
REMOTE_ID=$($SSH "sudo docker image inspect '$IMG' --format '{{.Id}}'")
if [ "$REMOTE_ID" != "$ID" ]; then
  echo "ERROR: server image id ($REMOTE_ID) differs from build ($ID). Nothing was started."
  echo "Remove the bad image with: ssh tc-app 'sudo docker image rm $IMG'"
  exit 1
fi
echo "OK: server image id matches build ($ID)"

cat <<MSG

Image is on tc-app but NOTHING is running it yet. To switch (manual, on tc-app):
  1. cd /opt/timelycapsule && cp .env .env.pre-$TAG && sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/' .env
  2. sudo docker compose up -d        # migrate runs first, then api/worker/scheduler
  3. verify: docker compose ps; curl -sk --resolve api.timelycapsule.com:443:127.0.0.1 https://api.timelycapsule.com/health
  4. record in RUNBOOK: tag=$TAG commit=$SHA image=$ID
Rollback: cp .env.pre-$TAG .env (restores the previous IMAGE_TAG) and 'sudo docker compose up -d'.
         The previous image stays on the server; this script never removes images.
MSG

# One image, three commands (T-19): the same build runs as the API server,
# the worker, or the scheduler — docker-compose.prod.yml picks the command.
# Runs via `tsx` rather than compiled `dist/`, matching this monorepo's
# existing convention (packages/contracts, packages/core ship raw TS with no
# build step, per plan/PROGRESS.md's decisions log) — apps/api's own `tsc`
# build stays as a CI compile-check gate, but production runs source directly
# through the same tsx that `pnpm dev` already uses, so there's no separate
# "does the compiled output actually work" surface to maintain.
#
# Uses `turbo prune` to cut the monorepo down to just what @tc/api needs
# before installing, keeping the image from dragging in apps/web,
# apps/mobile, or unrelated packages.

FROM node:22-alpine AS base
# Install pnpm as a real global binary (not via Corepack's shim) pinned to
# root package.json's "packageManager" version. Corepack's shim looked
# appealing but lazily re-downloads pnpm from the registry on first use in
# whatever user context invokes it — since the build runs as root but the
# runner stage drops to a non-root user with a different $HOME, that cache
# doesn't carry over, so every container cold start hit the network again.
# A plain global npm install has no such per-user cache to lose.
RUN npm install -g pnpm@9.15.0
RUN apk add --no-cache libc6-compat

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @tc/api --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 tcapi && adduser --system --uid 1001 --ingroup tcapi tcapi
COPY --from=installer --chown=tcapi:tcapi /app .
USER tcapi
ENV NODE_ENV=production
EXPOSE 4001

# Default process is the API; docker-compose.prod.yml overrides `command:`
# for the worker and scheduler services to run the other two.
CMD ["pnpm", "--filter", "@tc/api", "run", "start"]

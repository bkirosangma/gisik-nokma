# syntax=docker/dockerfile:1
#
# Multi-stage build for @gisik-nokma/server. Runs pending migrations on boot,
# then starts the server. Also usable as the backup-worker image with CMD
# overridden (apps/server/src/ops/backup-daemon-main.ts).
#
# `node-pg-migrate` is a RUNTIME dependency of this image, and it is declared as
# one. The entrypoint below applies pending migrations before the server starts,
# so the migrator is part of the shipped artifact rather than part of the
# toolchain that built it — which is what `dependencies` means. It was moved out
# of `devDependencies` in the same change set as this file.
#
# The first cut of this Dockerfile could not make that move (a lockfile edit
# would have raced a concurrent test gate) and used `pnpm deploy` WITHOUT
# `--prod` to keep the migrator reachable. That shipped the entire devDependency
# set — typescript, vitest, tsx, aws-sdk-client-mock, every `@types/*` — plus
# the package's own `src/` and `test/` trees into a production image, measured at
# 823 MB. Both are gone now: `--prod` prunes them, and the migrator survives
# because it is declared where it is actually used.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@gisik-nokma/server...
RUN pnpm deploy --prod --filter=@gisik-nokma/server /out
# `--prod` prunes devDEPENDENCIES; it does not prune the package's own files.
# Measured on the --prod image before this line: `src` (22 entries) and `test`
# (35 entries) still shipped, because `apps/server/package.json` declares no
# `files` field and `pnpm deploy` therefore copies the whole package directory.
#
# Removed HERE, in the build stage, rather than after the COPY in the runtime
# stage: Docker layers are additive, so a `rm` in a later layer hides the files
# without reclaiming their bytes. Removing before the COPY is what actually
# keeps them out of the image.
#
# Done in the Dockerfile rather than by adding a `files` field to
# `apps/server/package.json`, deliberately: that manifest is a live collision
# surface across five parallel lanes, and `files` changes what the package means
# everywhere, to fix something only this image cares about.
RUN rm -rf /out/src /out/test

# ---------------------------------------------------------------------------
# ⛔ RETIRED 2026-09-19 — HOT-RELOAD DEV STAGE. `docker-compose.hot.yml` targetED
# this, and NO SHIPPED COMMAND NAMES IT ANY MORE: the owner removed hot reload
# (*"no more hot reloads. rebuilt once they hit the main, is fine"*) and
# `pnpm dev:stack` now composes `docker-compose.dev.yml` alone, whose build
# names no `target:` — so what it builds is the un-targeted default.
#
# **THE INVARIANT BELOW IS STILL LIVE AND IS NOW THE ONLY THING STANDING
# BETWEEN `dev:stack:rebuild` AND A PRODUCTION IMAGE THAT IS NOT PRODUCTION.**
# With the `target: dev` gone from the compose path, the LAST stage wins for
# every build this repo ships — so this stage's position is load-bearing even
# though nothing selects it. Verify it after any edit here.
#
# **THIS STAGE MUST SIT BEFORE `runtime`.** Docker builds the LAST stage when no
# target is named, and neither `docker-compose.dev.yml` nor `docker-compose.yml`
# names one — so a `dev` stage appended at the end would silently BECOME the
# production image and `CMD ["node", "dist/index.js"]` would stop being what
# `docker compose up` produces. Kept above `runtime` so the un-targeted default
# stays the production build. Verify after any edit here:
#   docker build -f apps/server/Dockerfile -q .
#   docker image inspect --format '{{.Config.Cmd}}' <that image>   # node dist/index.js
#
# What this stage WAS for (FALSE SINCE 2026-09-19 — hot mode is retired, so no
# container runs a branch's source): the container ran the branch's SOURCE —
# bind-mounted from the checkout at compose time, not baked — so an edit on the
# host was live without a rebuild or a restart. The manifest-then-fetch pair
# below still applies to the stage; what changed is that nothing composes it.
#
# The MANIFEST COPY is deliberate and is not interchangeable with `COPY . .`:
# `pnpm fetch` reads the lockfile alone, so this layer's cache key is the
# lockfile plus the manifests. Copying the whole tree first would invalidate it
# on every source edit and rebuilds would stop being rare — which is the entire
# point of the stage. CONSEQUENCE: a NEW workspace package needs a line here.
# Not because the install below would miss an importer — `COPY . .` runs first,
# so every manifest is present by then — but because `pnpm fetch` above is the
# step whose cache key this list sets, and a package absent from it surfaces as
# an offline-store miss at the install.
FROM node:22-alpine AS dev
RUN corepack enable
RUN apk add --no-cache postgresql16-client
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY package.json ./
COPY apps/desktop/package.json apps/desktop/
COPY apps/mobile/package.json apps/mobile/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/app-core/package.json packages/app-core/
COPY packages/domain/package.json packages/domain/
COPY packages/editor/package.json packages/editor/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/rule-engine/package.json packages/rule-engine/
COPY packages/sync-client/package.json packages/sync-client/
COPY packages/ui/package.json packages/ui/
RUN pnpm fetch
# Source last, so the edits above stay cache-warm for the fetch layer.
COPY . .
# `--offline` is load-bearing rather than an optimisation: it makes the build
# fail loudly if the fetch layer did not populate the store, instead of silently
# reaching the network and hiding a broken cache key.
RUN pnpm install --offline --frozen-lockfile
# Dependencies' `dist` only (`server^...` excludes the server itself — `tsx`
# runs its `src` directly). Consumers import workspace packages BY NAME
# (`@gisik-nokma/domain` resolves through `./dist`), so their dist must exist
# before the watchers take over. The watchers then keep it current.
RUN pnpm turbo run build --filter=@gisik-nokma/server^...
ENV NODE_ENV=development HOST=0.0.0.0 PORT=3000
EXPOSE 3000
# Overridden by `docker-compose.hot.yml`, which runs migrations first and then
# the package watchers in parallel with this. The default here is the plain
# source-run so the stage is usable on its own.
CMD ["pnpm", "--filter", "@gisik-nokma/server", "exec", "tsx", "watch", "src/index.ts"]

FROM node:22-alpine AS runtime
RUN apk add --no-cache postgresql16-client
WORKDIR /app
COPY --from=build /out ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
# The entrypoint is a SCRIPT since go-live day (2026-09-22), not an inline
# `sh -c`: it grew a branch (write the bound `DATABASE_CA_CERT` to a file and
# migrate over verified TLS) that no longer fits a JSON-quoted one-liner. It is
# copied from the build stage, which holds the whole repo at /repo; `/out` is
# `pnpm deploy`'s pruned tree and does not carry it. Case 13.1283.
COPY --from=build /repo/apps/server/docker-entrypoint.sh /app/docker-entrypoint.sh
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

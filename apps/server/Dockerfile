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
# The MANIFEST COPY is deliberate and is not interchangeable with `COPY . .`:
# `pnpm fetch` reads the lockfile alone, so this layer's cache key is the
# lockfile plus the manifests. Copying the whole tree first would invalidate
# it on every source edit, which is exactly the shape measured on App
# Platform before this change — kaniko's registry cache HIT the apk layer
# and `corepack enable`, then found "No cached layer found" for `pnpm
# install` on every deploy (71s), because that layer's key was the whole
# tree via `COPY . .`, unique on every commit. CONSEQUENCE: a NEW workspace
# package needs a line here — `pnpm fetch` below is the step whose cache key
# this list sets, and a package absent from it surfaces as an offline-store
# miss at the install.
COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY package.json ./
COPY apps/desktop/package.json apps/desktop/
COPY apps/mobile/package.json apps/mobile/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/app-core/package.json packages/app-core/
COPY packages/domain/package.json packages/domain/
COPY packages/editor/package.json packages/editor/
COPY packages/knowledge-graph/package.json packages/knowledge-graph/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/rule-engine/package.json packages/rule-engine/
COPY packages/sync-client/package.json packages/sync-client/
COPY packages/ui/package.json packages/ui/
RUN pnpm fetch
# Source last, so the edits above stay cache-warm for the fetch layer.
COPY . .
# `--offline` is load-bearing rather than an optimisation: it makes the build
# fail loudly if the fetch layer did not populate the store, instead of
# silently reaching the network and hiding a broken cache key.
RUN pnpm install --offline --frozen-lockfile
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

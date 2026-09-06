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

FROM node:22-alpine AS runtime
RUN apk add --no-cache postgresql16-client
WORKDIR /app
COPY --from=build /out ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
ENTRYPOINT ["sh", "-c", "set -e; echo 'gisik-nokma: applying migrations...'; node node_modules/node-pg-migrate/bin/node-pg-migrate.js up --migrations-dir migrations; echo 'gisik-nokma: migrations current.'; exec \"$@\"", "--"]
CMD ["node", "dist/index.js"]

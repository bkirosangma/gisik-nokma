# syntax=docker/dockerfile:1
#
# Multi-stage build for @gisik-nokma/web (Next.js 15, standalone output).
# NEXT_PUBLIC_* vars are baked in at build time (Next's model), so they are
# passed as build args, not runtime env.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# The two variables the web shell ACTUALLY reads, and both bind at BUILD time.
#
# SERVER_ORIGIN is the proxy target in next.config.ts. It is not a runtime
# knob: `rewrites()` runs during `next build` and its result is serialised
# into .next/routes-manifest.json, which the standalone server then reads.
# Measured, not assumed -- a build with SERVER_ORIGIN unset produced
#   "/v1/:path*" -> "http://localhost:3000/v1/:path*"
# literally baked into that manifest. Setting SERVER_ORIGIN in the container's
# runtime environment therefore changes NOTHING; it has to be an ARG.
#
# NEXT_PUBLIC_SERVER_URL is read by src/providers.tsx for the WebSocket dial,
# which the rewrites deliberately do not cover (Next does not proxy protocol
# upgrades). NEXT_PUBLIC_ means baked into the browser bundle, so also build-time.
#
# Both are already declared in turbo.json's globalEnv, which is what lets them
# reach the build task at all: turbo 2 defaults to envMode:strict and delivers
# an undeclared variable to a task as `undefined`.
ARG SERVER_ORIGIN
ARG NEXT_PUBLIC_SERVER_URL
# The three NEXT_PUBLIC_GOOGLE_* args below have ZERO readers in apps/ or
# packages/ today (swept at this commit; positive control: SERVER_ORIGIN 20
# hits, NEXT_PUBLIC_SERVER_URL 4). packages/editor's Drive picker takes its
# credentials as parameters and hard-codes only the two Google script URLs.
# They are kept rather than deleted because wiring the picker into apps/web is
# Plan 7's surface, not seam 1's -- but they are recorded here as unread so the
# next reader does not mistake their presence for evidence that something
# consumes them. Owner: whoever wires the Drive picker into apps/web.
# NOTE they are also absent from turbo.json's globalEnv, so under envMode:strict
# they would arrive at `next build` as undefined even if something did read them.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
ARG NEXT_PUBLIC_GOOGLE_APP_ID
ENV SERVER_ORIGIN=$SERVER_ORIGIN \
    NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=$NEXT_PUBLIC_GOOGLE_PICKER_API_KEY \
    NEXT_PUBLIC_GOOGLE_APP_ID=$NEXT_PUBLIC_GOOGLE_APP_ID
RUN pnpm turbo run build --filter=@gisik-nokma/web...
# `apps/web/public` NOW EXISTS and carries a real asset — `google-mark.svg`,
# the vendor mark on the sign-in button. This comment used to read "apps/web
# ships no public/ directory today (verified at T5a)", and that stopped being
# true the moment the mark landed. **The `mkdir -p` is what made the change
# invisible**: it was written so the COPY stays valid whether or not the
# directory exists, so adding one produced no build error and no diff here, and
# the comment kept asserting an absence next to the line handling the presence.
# Kept, because it is still doing that job for anyone who removes the last
# asset. Verified rather than assumed: the rebuilt container answers
# `GET /google-mark.svg` with 200 image/svg+xml, 2070 bytes.
RUN mkdir -p apps/web/public

# ---------------------------------------------------------------------------
# HOT-RELOAD DEV STAGE — `docker-compose.hot.yml` targets this, the same way it
# targets the `server` Dockerfile's own `dev` stage.
#
# **THIS STAGE MUST SIT BEFORE `runtime`.** Docker builds the LAST stage when no
# target is named, and neither `docker-compose.dev.yml` nor `docker-compose.yml`
# names one — so a `dev` stage appended at the end would silently BECOME the
# production image and `CMD ["node", "apps/web/server.js"]` would stop being what
# `docker compose up` produces. Kept above `runtime` so the un-targeted default
# stays the production build. Verify after any edit here:
#   docker build -f apps/web/Dockerfile -q .
#   docker image inspect --format '{{.Config.Cmd}}' <that image>   # node apps/web/server.js
#
# What this stage is FOR: the container runs the branch's SOURCE — bind-mounted
# from the checkout at compose time, not baked — so an edit on the host is live
# on :3001 without a rebuild or a restart.
#
# NO `next build` HERE, deliberately. The production path above bakes a
# standalone server at build time and that is exactly what hot mode replaces:
# `next dev` compiles on demand, per route, and watches the source itself. A
# `next build` in this stage would be paid for on every image rebuild and then
# never read.
#
# The MANIFEST COPY is deliberate and is not interchangeable with `COPY . .`:
# `pnpm fetch` reads the lockfile alone, so this layer's cache key is the
# lockfile plus the manifests. Copying the whole tree first would invalidate it
# on every source edit and rebuilds would stop being rare — which is the entire
# point of the stage. CONSEQUENCE: a NEW workspace package needs a line here,
# for the same reason `apps/server/Dockerfile`'s `dev` stage does.
FROM node:22-alpine AS dev
RUN corepack enable
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
# Dependencies' `dist` only (`web^...` excludes the web itself). This app imports
# `@gisik-nokma/app-core`, `@gisik-nokma/domain` and `@gisik-nokma/ui` BY PACKAGE
# NAME, so they resolve through `./dist` — the same resolution the server's `dev`
# stage documents, and the reason it runs the same line. `next dev` gains nothing
# from the web's own build, which is why it is filtered out.
RUN pnpm turbo run build --filter=@gisik-nokma/web^...
ENV NODE_ENV=development NEXT_TELEMETRY_DISABLED=1
# 3000 INSIDE, mapped to the host's 3001 by `docker-compose.dev.yml`'s
# `ports: "3001:3000"` — which the hot override inherits rather than restates.
EXPOSE 3000
# Overridden by `docker-compose.hot.yml`, which starts the package watchers in
# parallel with this. The default here is the plain `next dev` so the stage is
# usable on its own.
CMD ["pnpm", "--filter", "@gisik-nokma/web", "exec", "next", "dev", "-p", "3000", "-H", "0.0.0.0"]

FROM node:22-alpine AS runtime
WORKDIR /app
# Standalone server lives at apps/web/.next/standalone/apps/web/server.js in
# this monorepo layout (verified against actual build output, T5a); static
# assets and public/ are not included in standalone and must be copied
# alongside it or the app serves no CSS or JS.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

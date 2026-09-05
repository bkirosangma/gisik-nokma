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
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
ARG NEXT_PUBLIC_GOOGLE_APP_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=$NEXT_PUBLIC_GOOGLE_PICKER_API_KEY \
    NEXT_PUBLIC_GOOGLE_APP_ID=$NEXT_PUBLIC_GOOGLE_APP_ID
RUN pnpm turbo run build --filter=@gisik-nokma/web...
# apps/web ships no public/ directory today (verified at T5a); create an
# empty one so the COPY below is stable even if that stays true, and starts
# picking up real assets automatically the day one is added.
RUN mkdir -p apps/web/public

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

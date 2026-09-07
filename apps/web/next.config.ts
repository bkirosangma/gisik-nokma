import type { NextConfig } from 'next';

/**
 * The API server this shell proxies to. `SERVER_ORIGIN` is read here, in the
 * Next config, and NOT through `process.env` inside any page: a rewrite is
 * resolved once at server start, and a page that read the same variable would
 * bake a second, possibly disagreeing origin into the browser bundle.
 */
const serverOrigin = process.env.SERVER_ORIGIN ?? 'http://localhost:3000';

/**
 * ## Two rewrites, and the third one is deliberately absent
 *
 * Same-origin proxying: the browser talks to Next, Next forwards to the API
 * server. Cookies stay first-party and no CORS pre-flight is involved, which is
 * why `createOnlineDataSource` is mounted with `baseUrl: ''`.
 *
 * Both `source` prefixes were checked against the routes the server actually
 * registers, not against the plan text (`test/next-config.test.ts` re-checks it
 * on every run, and refuses a rule naming a prefix nothing serves):
 *
 * - `/v1/*` — the whole product API. Twenty-odd registrations under
 *   `apps/server/src/routes/*.ts` plus `/v1/stream`.
 * - `/api/auth/*` — better-auth's vendor surface, mounted whole as a wildcard
 *   in `apps/server/src/auth/routes.ts:76`. It is the ONLY `/api/` route the
 *   server has: a sweep of `apps/server/src` for `'/api/` (`grep -rn "'/api/"
 *   apps/server/src --include="*.ts"`) returns that one line. Widened to the
 *   whole repo the same pattern returns ~55 more, every one of them a
 *   `/api/auth/...` call site in `apps/server/test` or an assertion in this
 *   app's own `test/next-config.test.ts` — no second registration among them.
 *
 * The plan carried a THIRD rule for `/api/workspaces/*`, dropped on 2026-08-27
 * when Plan 4's ticket reads moved to `/v1`. Nothing serves `/api/workspaces`:
 * workspaces live at `/v1/workspaces` (`routes/workspaces.ts:74`). Left in, the
 * rule would forward the request to a server that 404s it, so the path would
 * fail differently through Next than it does direct — which is the confusing
 * half of a 404 rather than the informative half.
 *
 * The WebSocket is the exception and does NOT appear here: Next's dev server
 * does not proxy protocol upgrades, so `/v1/stream` is dialled directly at
 * `NEXT_PUBLIC_SERVER_URL` (see `src/providers.tsx`). A rewrite for it would be
 * the same trap in the other direction — a rule that looks like it covers the
 * socket and does not.
 */
const nextConfig: NextConfig = {
  // Standalone server output for the Docker image (apps/web/Dockerfile):
  // bundles a minimal server.js plus only the node_modules it needs, at
  // apps/web/.next/standalone/apps/web/server.js in this monorepo layout.
  output: 'standalone',

  /**
   * Relative imports in this app carry an explicit `.js` suffix — the repo's
   * ESM convention, and what `packages/*` already ship. TypeScript resolves
   * those to the `.ts`/`.tsx` beside them; Next's bundler does NOT, and answers
   * `Module not found: Can't resolve '../../src/auth-client.js'` for every one
   * of them. Measured, not assumed: without these four lines `next build` fails
   * with five such errors across three pages.
   *
   * `extensionAlias` is webpack's own resolver setting and this hook is the
   * supported way to reach it. The consequence to state plainly: a `webpack`
   * key opts this app out of Turbopack, so `next dev` and `next build` both
   * run webpack. Turbopack has no `extensionAlias` equivalent today, so the
   * alternative was extensionless relative imports here and suffixed ones in
   * every package — one convention for the shell and another for its libraries.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },

  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${serverOrigin}/v1/:path*` },
      { source: '/api/auth/:path*', destination: `${serverOrigin}/api/auth/:path*` },
    ];
  },

  /**
   * HSTS for the WEB host, which is a different host from the API's.
   *
   * `pm.artsourced.in` and `pm-api.artsourced.in` are two sibling names
   * (`deploy/do/app.yaml`'s `domains:` block). HSTS is scoped per host, so the
   * API server sending it — which it now does, `apps/server/src/http/hsts.ts` —
   * says nothing whatsoever about this one. Both must send it or the browser
   * still opens a cleartext connection to whichever host it was never told
   * about.
   *
   * ## Gated on the CONFIGURED origin, not on `NODE_ENV`
   *
   * RFC 6797 §7.2 forbids sending this over plain HTTP, and Next's `headers()`
   * runs at build time with no request to inspect — so the protocol has to come
   * from configuration. `NODE_ENV === 'production'` was the obvious gate and is
   * the wrong one: it means "this is a production BUILD", not "this is served
   * over TLS", and the two come apart the first time somebody runs a production
   * build behind plain HTTP to reproduce something. `SERVER_ORIGIN` is already
   * https for the real deployment and http for local dev, so it is a signal
   * this config already has, already documents, and `test/next-config.test.ts`
   * can drive both ways.
   *
   * The honest limit, stated rather than left to be found: this infers the
   * BROWSER's protocol from the API origin the same build was pointed at. They
   * are the same in every configuration that exists (both https in
   * `app.yaml`, both http in dev). A deployment that served this app over TLS
   * while addressing its API over cleartext would get no header here — it would
   * also be a deployment sending session traffic in the clear, so the missing
   * header would not be its most urgent problem.
   */
  async headers() {
    // Three unconditional, then HSTS only when this build targets https.
    //
    // The split matters and the old shape hid it: this function used to return
    // `[]` outright for an http `SERVER_ORIGIN`, which was right for HSTS and
    // would be wrong for everything else. `nosniff`, `DENY` and a referrer
    // policy are safe — and useful — over plain http, and gating them on the
    // deployment protocol would leave local dev running under a weaker
    // configuration than production, which is how a header that breaks
    // something gets discovered by users rather than by a developer.
    //
    // `strict-origin-when-cross-origin`, NOT the API server's `no-referrer`,
    // and the difference is deliberate: this IS a document origin. A page whose
    // own links stop carrying their origin breaks flows that legitimately read
    // it, while the API is never a page a browser navigates FROM.
    //
    // No `Content-Security-Policy` here yet. It is the one that needs real
    // design for this app — webpack rather than Turbopack, `output:
    // 'standalone'`, and a rewrite-based same-origin proxy — and its failure
    // mode is breaking in production only. Deferred by the owner on 2026-09-08
    // rather than guessed at; `test/next-config.test.ts` pins the absence so
    // adding one is a deliberate act.
    const always = [
      { key: 'x-content-type-options', value: 'nosniff' },
      { key: 'x-frame-options', value: 'DENY' },
      { key: 'referrer-policy', value: 'strict-origin-when-cross-origin' },
    ];
    const hsts = serverOrigin.startsWith('https://')
      ? [{ key: 'strict-transport-security', value: 'max-age=31536000; includeSubDomains' }]
      : [];
    return [{ source: '/:path*', headers: [...always, ...hsts] }];
  },
};

export default nextConfig;

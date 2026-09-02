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
};

export default nextConfig;

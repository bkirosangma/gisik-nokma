import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../next.config.js';

/**
 * ## A PROXY RULE FOR A PATH NOTHING SERVES IS A TRAP, and this is the check
 *
 * The plan carried a third rewrite for `/api/workspaces/*`, dropped on
 * 2026-08-27 when Plan 4's ticket reads moved to `/v1`. Left in, a request to
 * `/api/workspaces/…` would 404 through Next and 404 direct for two different
 * reasons, and whoever debugged it would be chasing the proxy. Prose in
 * `next.config.ts` can say the rules were checked; only this can keep saying it
 * after the next route moves.
 *
 * `apps/web/test` and `apps/server/src` are in one repo and one gate, so this
 * reads the server's source directly rather than trusting a copy of its route
 * list. What it CANNOT do is notice a route the server registers from a
 * computed string — every registration in `apps/server/src` today is a literal,
 * and the enumeration below fails loudly (`toContain`) if the ones it names
 * stop being found, which is what would happen if that changed.
 *
 * `apps/web/src` is deliberately NOT scanned: the shell's HTTP base is `''`
 * (same-origin), so it names no server path at all.
 */

// apps/web/test → three levels up is the repo root. Resolved from a converted
// `import.meta.url` rather than `new URL('../../..', import.meta.url)`, which
// Vite statically rewrites into a dev-server asset URL that `fileURLToPath`
// then refuses.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SERVER_SRC = join(REPO_ROOT, 'apps/server/src');

/**
 * Comment lines are dropped BEFORE the path scan, for one measured reason:
 * `apps/server/src/auth/routes.ts` discusses `/api/auth/*` in prose, and
 * `apps/server/src/routes/invites.ts` and `routes/events.ts` do too. A scan
 * that counted those would report a path as served because somebody mentioned
 * it — the exact failure this file exists to prevent, one level up.
 */
function withoutCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Every absolute path the server names in a string literal, outside comments. */
function servedPaths(): Array<{ path: string; file: string }> {
  return sourceFiles(SERVER_SRC).flatMap((file) => {
    const code = withoutCommentLines(readFileSync(file, 'utf8'));
    return [...code.matchAll(/['"`](\/[A-Za-z0-9_\-:./*[\]{}]*)['"`]/g)].map((match) => ({
      path: match[1] ?? '',
      file: relative(REPO_ROOT, file),
    }));
  });
}

/** `/v1/:path*` → `/v1/`; `/api/auth/:path*` → `/api/auth/`. */
function literalPrefixOf(source: string): string {
  return source.replace(/:[^/]*\*?$/, '');
}

const SERVED = servedPaths();
const served = (prefix: string) => SERVED.filter((entry) => entry.path.startsWith(prefix));

describe('the scan finds the server’s real routes before it is trusted to say one is missing', () => {
  it('POSITIVE CONTROL — it finds routes under both rewritten prefixes, by name', () => {
    const paths = SERVED.map((entry) => entry.path);
    expect(paths).toContain('/api/auth/*');
    expect(paths).toContain('/v1/me/workspaces');
    expect(paths).toContain('/v1/projects/:projectId/board');
    expect(paths).toContain('/v1/stream');
  });

  it('POSITIVE CONTROL — the comment stripper removes prose without removing code', () => {
    const withProse = " * `/api/workspaces/*` was dropped\napp.get('/v1/kept', handler);";
    expect(withoutCommentLines(withProse)).not.toContain('/api/workspaces');
    expect(withoutCommentLines(withProse)).toContain('/v1/kept');
  });
});

/**
 * 3.87 — every Next dev rewrite names a prefix `apps/server/src` actually registers, re-derived from the server source on every run. The POSITIVE CONTROLS above are load-bearing: without them a scan that found nothing would silently report every rewrite as valid.
 */
describe('every dev rewrite names a prefix the server actually serves', () => {
  it('both rules resolve to at least one registered route', async () => {
    const rules = await nextConfig.rewrites?.();
    expect(Array.isArray(rules)).toBe(true);
    const sources = (rules as Array<{ source: string }>).map((rule) => rule.source);

    // The LOOP runs before the exact list, deliberately. With the order
    // reversed, `toEqual` fails first for any added rule and the loop below is
    // never reached — so the check that actually says WHY a rule is wrong would
    // be an unreachable line, and a rule added for a real route would fail with
    // the same message as one added for a route that does not exist.
    for (const source of sources) {
      const matches = served(literalPrefixOf(source));
      // The matching routes are PRINTED rather than counted: a count that went
      // to zero and a count that was always zero read the same in a failure.
      expect(
        matches.map((entry) => `${entry.file}: ${entry.path}`),
        `rewrite ${source} matched no registered route`,
      ).not.toEqual([]);
    }

    // …and these two and no others, so a rule that happens to sit under /v1
    // still has to be argued for rather than appearing.
    expect(sources).toEqual(['/v1/:path*', '/api/auth/:path*']);
  });

  it('NEGATIVE CONTROL — the dropped /api/workspaces rule would be rejected by this same check', () => {
    // If this ever finds something, the rule stops being a trap and the
    // `next.config.ts` docblock explaining its absence stops being true.
    expect(served('/api/workspaces')).toEqual([]);
    expect(served(literalPrefixOf('/api/workspaces/:path*'))).toEqual([]);
  });

  it('the WebSocket is deliberately NOT rewritten — Next dev does not proxy upgrades', async () => {
    const rules = (await nextConfig.rewrites?.()) as Array<{ source: string }>;
    expect(rules.map((rule) => rule.source)).not.toContain('/v1/stream');
    // …and it is still a real route, reached directly at NEXT_PUBLIC_SERVER_URL.
    expect(SERVED.map((entry) => entry.path)).toContain('/v1/stream');
  });
});

/**
 * HSTS on the WEB host — pre-launch checklist item 5.
 *
 * `pm.artsourced.in` and `pm-api.artsourced.in` are two sibling names
 * (`deploy/do/app.yaml`). HSTS is scoped per host, so the API server sending it
 * says nothing about this one; both must, or a browser still opens a cleartext
 * connection to whichever host it was never told about.
 *
 * `serverOrigin` is captured at MODULE LOAD, so each case re-imports the config
 * under a different `SERVER_ORIGIN` rather than mutating a live object —
 * `resetModules` is what makes the second import re-read the environment. A
 * test that stubbed the env without resetting would measure the first import
 * twice and pass whatever the gate did.
 */
describe('HSTS — emitted only when this build targets an https deployment', () => {
  async function headersUnder(serverOrigin: string): Promise<Array<{ key: string; value: string }>> {
    vi.resetModules();
    vi.stubEnv('SERVER_ORIGIN', serverOrigin);
    const fresh = (await import('../next.config.js')).default;
    const groups = (await fresh.headers?.()) ?? [];
    return groups.flatMap((group) => group.headers as Array<{ key: string; value: string }>);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('13.247 sends it for an https SERVER_ORIGIN, a year long and without preload', async () => {
    const headers = await headersUnder('https://pm-api.artsourced.in');
    const hsts = headers.find((header) => header.key === 'strict-transport-security');
    expect(hsts?.value).toBe('max-age=31536000; includeSubDomains');
    // Same one-way-door reasoning as the server's own case: adding `preload`
    // must be a deliberate act that reddens a test.
    expect(hsts?.value).not.toContain('preload');
  });

  it('13.248 sends NO HSTS for an http SERVER_ORIGIN — RFC 6797 forbids it, and local dev is http', async () => {
    // The positive case above is this one's control: the same function, the
    // same import path, one input changed.
    //
    // This asserted `toEqual([])` until 2026-09-08, when the three
    // unconditional headers landed beside HSTS. That was a weaker claim wearing
    // a stronger sentence: an empty array equally well meant `headers()` was not
    // wired at all, and it would have gone green if someone had deleted the
    // whole function. Naming the header that must be absent says the thing the
    // case is actually about, and it fails if the gate is removed.
    const headers = await headersUnder('http://localhost:3000');
    expect(headers.find((header) => header.key === 'strict-transport-security')).toBeUndefined();
    expect(headers.length).toBeGreaterThan(0);
  });
});

/**
 * 13.260 — the three headers that do NOT depend on the deployment protocol, over http and https alike.
 * 13.261 — Content-Security-Policy is DEFERRED, and its absence is asserted so adding one is deliberate.
 */
describe('the unconditional security headers', () => {
  async function headersUnder(serverOrigin: string): Promise<Array<{ key: string; value: string }>> {
    vi.resetModules();
    vi.stubEnv('SERVER_ORIGIN', serverOrigin);
    const fresh = (await import('../next.config.js')).default;
    const groups = (await fresh.headers?.()) ?? [];
    return groups.flatMap((group) => group.headers as Array<{ key: string; value: string }>);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const EXPECTED = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    // NOT the API server's `no-referrer`: this is a document origin, and a page
    // whose links stop carrying their origin breaks flows that legitimately
    // read it.
    'referrer-policy': 'strict-origin-when-cross-origin',
  };

  /**
   * 14.236 — the hosted-MCP consent page must not be frameable: a page that can
   * be embedded is a page whose Allow button can be clickjacked. The rule is the
   * app-wide `/:path*`, so the case measures that its pattern REACHES
   * `/mcp/connect?request=x` rather than trusting the source string.
   */
  it('14.236 the consent page is covered by x-frame-options: DENY', async () => {
    vi.resetModules();
    vi.stubEnv('SERVER_ORIGIN', 'https://pm-api.artsourced.in');
    const fresh = (await import('../next.config.js')).default;
    const groups = (await fresh.headers?.()) ?? [];
    const covering = groups.filter((group) => group.source === '/:path*'); // CONTROL — the pattern that matches every path, `/mcp/connect?request=x` included
    expect(covering).toHaveLength(1);
    expect(covering[0]!.headers.find((h) => h.key === 'x-frame-options')?.value).toBe('DENY');
    const scopedElsewhere = groups.filter((group) => group.source !== '/:path*' && group.headers.some((h) => h.key === 'x-frame-options'));
    expect(scopedElsewhere).toEqual([]);
  });

  it('13.260 sends all three over http AND https — they carry no protocol condition', async () => {
    // Both inputs, in one case. Either alone passes for a function that gates
    // everything on the protocol, which is exactly the shape this replaced.
    for (const origin of ['http://localhost:3000', 'https://pm-api.artsourced.in']) {
      const headers = await headersUnder(origin);
      for (const [key, value] of Object.entries(EXPECTED)) {
        expect(headers.find((header) => header.key === key)?.value, `${key} under ${origin}`).toBe(
          value,
        );
      }
    }
  });

  it('13.263 does not advertise the framework — X-Powered-By is off', async () => {
    vi.resetModules();
    const fresh = (await import('../next.config.js')).default;
    // The config flag, not a header assertion: Next strips the header itself
    // when this is false, so there is nothing in `headers()` to look for. Found
    // by curling the running container — a sweep for MISSING headers cannot
    // notice one that is present and unwanted.
    expect(fresh.poweredByHeader).toBe(false);
  });

  it('13.261 sends NO Content-Security-Policy — deferred, and pinned so adding one is deliberate', async () => {
    const headers = await headersUnder('https://pm-api.artsourced.in');
    const keys = headers.map((header) => header.key);
    // A CSP for this app is a real design problem — webpack rather than
    // Turbopack, `output: 'standalone'`, a rewrite-based same-origin proxy —
    // whose failure mode is breaking in production only. The owner deferred it
    // on 2026-09-08. Asserting the absence is what turns "we have not done it
    // yet" into a statement the next person has to change on purpose.
    expect(keys).not.toContain('content-security-policy');
    expect(keys).not.toContain('permissions-policy');
  });
});

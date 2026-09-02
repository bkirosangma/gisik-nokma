import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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

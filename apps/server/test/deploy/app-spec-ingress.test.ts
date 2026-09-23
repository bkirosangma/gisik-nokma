import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * The production live-update socket, pinned in the deploy spec.
 *
 * 2026-09-23: every `/v1/stream` handshake in production answered 401. The
 * browser dialled the socket at `NEXT_PUBLIC_SERVER_URL` = the API host
 * (`pm-api.artsourced.in`), the session cookie belongs to the web host
 * (`pm.artsourced.in`, cross-subdomain cookies deliberately off — see
 * `src/auth/auth.ts`), so the upgrade carried no cookie and `requireSession`
 * refused it. The dev stack cannot show this: both hosts are localhost and
 * cookies ignore ports. The fix is routing, not code: App Platform's ingress
 * sends `pm.artsourced.in/v1` and `/api/auth` to the `server` component, and
 * the bundle dials the socket at the web host, where the cookie travels with it.
 * These cases pin that arrangement so a later edit cannot quietly move the
 * socket back off-host.
 */

type Rule = {
  match?: { authority?: { exact?: string; prefix?: string }; path?: { prefix?: string; exact?: string } };
  component?: { name?: string };
};
type Spec = {
  domains?: { domain: string; type?: string }[];
  ingress?: { rules?: Rule[] };
  services?: { name: string; envs?: { key: string; value?: string; scope?: string }[] }[];
};

const SPEC_PATH = resolve(__dirname, '../../../../deploy/do/app.yaml');
const spec = parseYaml(readFileSync(SPEC_PATH, 'utf8')) as Spec;
const primaryDomain = spec.domains?.find((d) => d.type === 'PRIMARY')?.domain;
const rules = spec.ingress?.rules ?? [];
const ruleFor = (authority: string, pathPrefix: string | undefined) =>
  rules.find(
    (r) => r.match?.authority?.exact === authority && r.match?.path?.prefix === pathPrefix,
  );

describe('13.1424 the API paths of the web host route to the server component', () => {
  it('13.1424 /v1 and /api/auth on the primary domain go to `server`, ahead of the web catch-all', () => {
    expect(primaryDomain).toBe('pm.artsourced.in');
    const v1 = ruleFor(primaryDomain!, '/v1');
    const auth = ruleFor(primaryDomain!, '/api/auth');
    const catchAll = ruleFor(primaryDomain!, undefined);
    expect(v1?.component?.name).toBe('server');
    expect(auth?.component?.name).toBe('server');
    expect(catchAll?.component?.name).toBe('web');
    // Order: the path rules precede the host catch-all, so a precedence scheme
    // that takes the first match cannot hand /v1 to the web shell.
    expect(rules.indexOf(v1!)).toBeLessThan(rules.indexOf(catchAll!));
    expect(rules.indexOf(auth!)).toBeLessThan(rules.indexOf(catchAll!));
    // CONTROL: the API alias host still routes whole to `server`.
    expect(ruleFor('pm-api.artsourced.in', undefined)?.component?.name).toBe('server');
  });
});

describe('13.1425 the browser dials the socket at the host that holds its cookie', () => {
  it('13.1425 NEXT_PUBLIC_SERVER_URL is the primary domain, and SERVER_ORIGIN still names the API host', () => {
    const web = spec.services?.find((s) => s.name === 'web');
    const env = Object.fromEntries((web?.envs ?? []).map((e) => [e.key, e.value]));
    expect(env.NEXT_PUBLIC_SERVER_URL).toBe(`https://${primaryDomain}`);
    // CONTROL: the build-time proxy target is unchanged — Next's rewrites are
    // dev-only once ingress routes the paths, but the value must stay a real origin.
    expect(env.SERVER_ORIGIN).toBe('https://pm-api.artsourced.in');
  });
});

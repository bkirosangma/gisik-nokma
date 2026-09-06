/**
 * Is the stack the stack?
 *
 * Every URL this suite uses — `:3001`, `:3000`, `:8025` — is satisfiable by a
 * stray local dev process with the compose stack entirely down. A suite that
 * only checks "something answered" is the check-that-cannot-fail in its most
 * expensive costume: it reports E2E coverage of a deployment it never touched.
 *
 * The assertion that actually discriminates is the PROXY HOP, and it has a
 * measured negative control rather than an argued one. `SERVER_ORIGIN` binds at
 * BUILD time (`next.config.ts`'s rewrites are serialised into
 * `.next/routes-manifest.json`), so a web image built without it proxies `/v1/*`
 * at `http://localhost:3000` — itself. Measured on this stack, both states, same
 * request:
 *
 *   stale image      GET :3001/v1/me/workspaces -> 500  after 30.014 s
 *   correct image    GET :3001/v1/me/workspaces -> 401  in 0.059 s,
 *                                                  body {"error":"unauthenticated"}
 *
 * and `docker compose ps` reported every container healthy in BOTH states. So
 * "the containers are up" proves nothing about the hop, and this file exists to
 * refuse the run rather than let the specs pass over a broken proxy.
 */

const WEB = 'http://localhost:3001';
const SERVER = 'http://localhost:3000';
const MAILPIT = 'http://localhost:8025';

/** The 30-second stall is the broken-proxy signature; bound well under it. */
const HOP_BUDGET_MS = 10_000;

async function within<T>(label: string, budgetMs: number, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await work();
  const elapsed = Date.now() - started;
  if (elapsed > budgetMs) {
    throw new Error(
      `${label} took ${elapsed}ms, over its ${budgetMs}ms budget. A proxied /v1 request that ` +
        `stalls for tens of seconds is the signature of a web image built without SERVER_ORIGIN ` +
        `(it dials itself). Rebuild with: docker compose -f docker-compose.dev.yml up -d --build web`,
    );
  }
  return result;
}

export async function assertStackIsTheStack(): Promise<{ sha: string }> {
  // 1. The API server itself, by its own door.
  const health = await fetch(`${SERVER}/healthz`).catch((cause: unknown) => {
    throw new Error(`no answer from the API server at ${SERVER}/healthz — is the stack up? (${String(cause)})`);
  });
  if (!health.ok) throw new Error(`${SERVER}/healthz answered ${health.status}, expected 200`);
  const body = (await health.json()) as { status?: string; sha?: string };
  if (body.status !== 'ok') throw new Error(`/healthz says status=${String(body.status)}, expected "ok"`);
  if (typeof body.sha !== 'string' || body.sha.length === 0) {
    throw new Error('/healthz carries no deploy sha — this build predates Task 1 or DEPLOY_SHA is unset');
  }

  // 2. THE HOP. Answered by the SERVER, through the WEB container, fast.
  const proxied = await within('the proxied /v1 hop', HOP_BUDGET_MS, () =>
    fetch(`${WEB}/v1/me/workspaces`, { redirect: 'manual' }),
  );
  if (proxied.status !== 401) {
    throw new Error(
      `GET :3001/v1/me/workspaces answered ${proxied.status}, expected 401 from the API server. ` +
        `500 means the web container could not reach the server; anything HTML-shaped means Next ` +
        `answered it itself and the rewrite is not in the built manifest.`,
    );
  }
  const proxiedBody = await proxied.text();
  // The server's own error shape. Next's 404 page is HTML and fails this line.
  if (!proxiedBody.includes('unauthenticated')) {
    throw new Error(
      `the proxied 401 did not carry the API server's error body (got: ${proxiedBody.slice(0, 120)}). ` +
        `Something other than the server answered on the /v1 path.`,
    );
  }

  // 3. The test inbox, without which no sign-in can complete.
  const inbox = await fetch(`${MAILPIT}/api/v1/messages?limit=1`).catch((cause: unknown) => {
    throw new Error(`no answer from Mailpit at ${MAILPIT} — is the stack up? (${String(cause)})`);
  });
  if (!inbox.ok) throw new Error(`Mailpit answered ${inbox.status} on its messages API`);

  return { sha: body.sha };
}

export { MAILPIT, SERVER, WEB };

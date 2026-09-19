export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpClient = {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  put(path: string, body: unknown): Promise<unknown>;
  /**
   * No body, by design — every DELETE this product ships names its target in
   * the path. A 404 THROWS here, unlike a GET: the read affordance below is a
   * read affordance, and a revoke that quietly resolved on "not yours or
   * already gone" would tell somebody their credential was withdrawn when the
   * server had done nothing.
   */
  del(path: string): Promise<unknown>;
};

/**
 * A non-2xx answer the transport will not turn into a value.
 *
 * `status` and `body` are carried rather than folded into the message because callers act
 * on it: a 401 is a session that ended, a 404 on a READ is the server declining
 * to say whether the thing exists (see `send`), and a 500 is the server's
 * problem — three different things a client does three different things about.
 * A 404 on a WRITE reaches the caller as one of these, like every other non-2xx.
 */
export class HttpError extends Error {
  readonly status: number;
  /**
   * The refusal the server actually sent, parsed, or `undefined` when there was
   * none to parse.
   *
   * ## Why the status alone was not enough
   *
   * Every WRITE door on this branch answers a refusal as a BODY and the status
   * only classifies it. `POST /v1/workspaces` sends `INVALID_NAME_BODY` at 400
   * and the ingest layer's own `IngestResult` at 422; `POST
   * /v1/workspaces/:id/invites` sends that same `IngestResult` — a named rule
   * and the reason the engine wrote — at 422; `GET /v1/workspaces/:id/invites`
   * sends `INVITE_ADMIN_ONLY_BODY` at 403. Until this field existed the only
   * thing a caller could put on screen was this class's own message, `HTTP 422
   * for /v1/workspaces`, which is the shell paraphrasing a refusal it never
   * read — the exact failure `src/shell-refusal.tsx` in `apps/web` exists to
   * prevent for the refusing READS. **⚠ CORRECTED 2026-09-20:** this read *"— six of
   * them until ruling P25 clause 1 served two, four since."* The count is now
   * **ZERO** — it emptied on 2026-09-19 — so this class no longer stands beside a
   * serving gap; it stands beside the ordinary failures, which it was always also
   * for.
   *
   * It is `unknown`, not a refusal type: the doors send at least three
   * different shapes (`{error,message}`, `{error,rule,message}`, an
   * `IngestResult` union) and a client type asserting one of them would be this
   * package claiming to know a contract it does not own. Callers narrow it
   * themselves; `refusalText` below is the one narrowing this package ships.
   *
   * `undefined` is load-bearing and distinct from a body that parsed to `null`:
   * a 204, a non-JSON error page and a truncated response all leave it unset,
   * and a caller must be able to tell "the server said nothing I could read"
   * from "the server said null".
   */
  readonly body: unknown;
  constructor(status: number, path: string, body?: unknown) {
    super(`HTTP ${status} for ${path}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/**
 * The server's own words out of a refusal body, or `null` when the body carries
 * none.
 *
 * `null` rather than a fallback sentence, deliberately: a caller that gets one
 * must decide what to show, and a default like "something went wrong" minted
 * here would be this module inventing a sentence no server said and every
 * caller then rendering it as though it had. The two keys are the two the
 * shipped doors use — `message` on the frozen refusal bodies, `reason` on an
 * `IngestResult` whose `status` is `refused`.
 */
export function refusalText(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record['message'] === 'string') return record['message'];
  if (typeof record['reason'] === 'string') return record['reason'];
  return null;
}

/**
 * Thin JSON transport. `credentials: 'include'` carries the better-auth session
 * cookie.
 *
 * **404 answers `null` on a GET, and ONLY on a GET.** Every `/v1` read route on
 * this branch answers the SAME frozen 404 body for "no such thing" and for "not
 * yours" (`READ_NOT_FOUND_BODY` — `apps/server/src/read/membership.ts`),
 * deliberately, so a stranger cannot use the status as an existence oracle. A
 * client that threw there would be inventing a distinction the server refused to
 * make. So 404-as-`null` is a READ affordance, and the method gate is what keeps
 * it one.
 *
 * On a WRITE the same value is a lie about what happened. `PUT
 * /v1/me/preferences` answers 404 whenever `requireMember` is null
 * (`apps/server/src/routes/preferences.ts`) — a member revoked mid-session — and
 * `putPreferences` discards this function's return, so a `null` there resolved
 * the promise and told the client their save had landed. Nothing was stored.
 * Every non-2xx on a POST or a PUT therefore throws `HttpError`, carrying the
 * status, exactly as a 500 always did.
 *
 * `fetchImpl` is injected — never `globalThis.fetch` reached for inside — so
 * every test in this package drives the real transport rather than a stub of
 * it, and a non-browser shell can supply its own.
 */
export function createHttpClient(baseUrl: string, fetchImpl: FetchLike): HttpClient {
  async function send(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The method gate, not a status gate: the affordance belongs to reads.
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) {
      // The body is read INSIDE a try, and a failure to read it is not allowed
      // to replace the HTTP failure with a parse failure: a proxy's HTML 502
      // page would otherwise surface as `SyntaxError: Unexpected token '<'`,
      // which names neither the status nor the door. `undefined` then says
      // "nothing readable was sent", which is exactly what happened.
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      throw new HttpError(response.status, path, body);
    }
    if (response.status === 204) return undefined;
    return response.json();
  }
  return {
    get: (path) => send('GET', path),
    post: (path, body) => send('POST', path, body),
    put: (path, body) => send('PUT', path, body),
    del: (path) => send('DELETE', path),
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpClient = {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  put(path: string, body: unknown): Promise<unknown>;
};

/**
 * A non-2xx answer the transport will not turn into a value.
 *
 * `status` is carried rather than folded into the message because callers act
 * on it: a 401 is a session that ended, a 404 on a READ is the server declining
 * to say whether the thing exists (see `send`), and a 500 is the server's
 * problem — three different things a client does three different things about.
 * A 404 on a WRITE reaches the caller as one of these, like every other non-2xx.
 */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`HTTP ${status} for ${path}`);
    this.name = 'HttpError';
    this.status = status;
  }
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
    if (!response.ok) throw new HttpError(response.status, path);
    if (response.status === 204) return undefined;
    return response.json();
  }
  return {
    get: (path) => send('GET', path),
    post: (path, body) => send('POST', path, body),
    put: (path, body) => send('PUT', path, body),
  };
}

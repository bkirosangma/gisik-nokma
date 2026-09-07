export class TransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransportError';
  }
}

/** Carries the server's own body, unread and unrewritten. Whoever surfaces
 *  this to an MCP client shows that body; nothing here summarises it. */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`gisik-nokma answered ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export type GisikClient = {
  get(path: string, token: string): Promise<unknown>;
  post(path: string, body: unknown, token: string | null): Promise<unknown>;
};

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createGisikClient(serverUrl: string, fetchImpl: typeof fetch = fetch): GisikClient {
  async function send(method: string, path: string, body: unknown, token: string | null): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token !== null) headers['authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchImpl(`${serverUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      // NOT retried, on purpose. See case 14.46 and the spec's Error handling
      // section: a retried write against a server that becomes reachable
      // mid-retry double-submits, and a double-submitted ticket is worse than
      // a failure the person is told about once.
      throw new TransportError(
        `could not reach gisik-nokma at ${serverUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
    const parsed = await readBody(response);
    if (!response.ok) throw new HttpError(response.status, parsed);
    return parsed;
  }

  return {
    get: (path, token) => send('GET', path, undefined, token),
    post: (path, body, token) => send('POST', path, body, token),
  };
}

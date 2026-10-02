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

export type FileBytes = { name: string; bytes: Uint8Array };
export type DownloadedBytes = { bytes: Uint8Array; contentType: string; filename: string | null };

export type GisikClient = {
  get(path: string, token: string): Promise<unknown>;
  getBytes(path: string, token: string): Promise<DownloadedBytes>;
  post(path: string, body: unknown, token: string | null): Promise<unknown>;
  postMultipart(path: string, fields: Record<string, string>, file: FileBytes, token: string): Promise<unknown>;
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

/**
 * One `multipart/form-data` body: every FIELD part first, then the file part — the order the upload
 * route's contract asks for (`apps/server/src/routes/attachments.ts`, `packages/editor/src/upload.ts:86-88`).
 * The part's Content-Type is octet-stream on purpose: the server sniffs the bytes and never trusts a claim.
 */
export function encodeMultipart(fields: Record<string, string>, file: FileBytes, boundary: string): Uint8Array {
  const enc = new TextEncoder();
  const safe = (value: string): string => value.replace(/["\r\n\\]/g, '_');
  const chunks: Uint8Array[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${safe(name)}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(
    enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safe(file.name)}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
  );
  chunks.push(file.bytes);
  chunks.push(enc.encode(`\r\n--${boundary}--\r\n`));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function createGisikClient(serverUrl: string, fetchImpl: typeof fetch = fetch): GisikClient {
  async function request(
    method: string,
    path: string,
    init: { body?: string | Uint8Array; headers?: Record<string, string> },
    token: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json', ...init.headers };
    if (token !== null) headers['authorization'] = `Bearer ${token}`;
    try {
      return await fetchImpl(`${serverUrl}${path}`, { method, headers, body: init.body as RequestInit['body'] });
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
  }
  async function json(response: Response): Promise<unknown> {
    const parsed = await readBody(response);
    if (!response.ok) throw new HttpError(response.status, parsed);
    return parsed;
  }

  return {
    get: async (path, token) => json(await request('GET', path, {}, token)),
    post: async (path, body, token) =>
      json(
        await request(
          'POST',
          path,
          body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
          token,
        ),
      ),
    postMultipart: async (path, fields, file, token) => {
      const boundary = `gisik-${crypto.randomUUID()}`;
      return json(
        await request(
          'POST',
          path,
          { body: encodeMultipart(fields, file, boundary), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } },
          token,
        ),
      );
    },
    getBytes: async (path, token) => {
      const response = await request('GET', path, { headers: { accept: '*/*' } }, token);
      if (!response.ok) throw new HttpError(response.status, await readBody(response));
      const disposition = response.headers.get('content-disposition') ?? '';
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        filename: /filename="([^"]*)"/.exec(disposition)?.[1] ?? null,
      };
    },
  };
}

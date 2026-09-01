import WebSocket from 'ws';
import { serverStreamFrameSchema, type ServerStreamFrame } from '@gisik-nokma/domain';

/**
 * What the server answered when it refused the HANDSHAKE — the whole HTTP
 * response, not just "it did not open".
 *
 * MEASURED on this branch (2026-09-02, `@fastify/websocket` 11.3.0): a
 * `preHandler` that replies on a `websocket: true` route refuses the upgrade
 * with an ordinary HTTP response and **no socket is ever created**. The `ws`
 * client surfaces that as an `unexpected-response` event carrying the
 * `IncomingMessage`, and only then an `error`. A test that listened for `error`
 * alone would learn that the connection failed and nothing about WHAT the door
 * said — and "the door said 401" versus "the door accepted me and then hung up"
 * is the entire difference between a refusal before the socket and a refusal
 * after it. So the response is captured and handed to the caller.
 */
export type StreamRefusal = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

export class StreamRefused extends Error {
  constructor(readonly response: StreamRefusal) {
    super(`stream handshake refused: ${response.statusCode} ${response.body}`);
    this.name = 'StreamRefused';
  }
}

export type TestStream = {
  /** The PARSED frames — the shape check's output. Not the wire. */
  frames: ServerStreamFrame[];
  /**
   * The BYTES, exactly as they arrived. Every "this id never reached that
   * subscriber" claim is asserted over THESE, never over `frames`.
   *
   * `serverStreamFrameSchema`'s outer object is strict but the ENVELOPE inside
   * an event frame is not, so an undeclared envelope key is silently stripped
   * on the way into `frames`. `stream-socket.ts` states the boundary in full;
   * this recorder inherits it because it parses with the same schema.
   */
  raw: string[];
  socket: WebSocket;
  /** Protocol-level pings the SERVER sent us. `ws` answers them automatically. */
  pings: number;
  /** Protocol-level pongs the server sent us. Recorded for completeness. */
  pongs: number;
  subscribe(workspaceId: string, afterSeq: number): void;
  sendRaw(data: string | Buffer): void;
  /** Resolves with the first frame — already received or future — matching. */
  next(match: (frame: ServerStreamFrame) => boolean, timeoutMs?: number): Promise<ServerStreamFrame>;
  closed: Promise<{ code: number; reason: string }>;
  close(): Promise<void>;
};

/**
 * A `ws` client against a LISTENING server, recording bytes and frames.
 *
 * A real socket and a real listen, not `app.inject`: an upgrade is the one
 * request Fastify's injector cannot make, and the whole subject of this task is
 * what happens during and after that upgrade.
 *
 * There is deliberately no `settle(ms)` here, and its absence is the point. The
 * plan's helper offers one and every absence claim written with it is a claim
 * about how long the test slept. Absence is asserted instead by ingesting the
 * invisible event, ingesting a VISIBLE one after it, awaiting the visible
 * frame, and only then looking at `raw` — the ordering is the evidence, and it
 * does not get flakier on a loaded machine.
 */
export function openStream(
  port: number,
  headers: Record<string, string>,
  options: { autoPong?: boolean } = {},
): Promise<TestStream> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/stream`, {
    headers,
    autoPong: options.autoPong ?? true,
  });
  const frames: ServerStreamFrame[] = [];
  const raw: string[] = [];
  const waiters: Array<{
    match: (frame: ServerStreamFrame) => boolean;
    resolve: (frame: ServerStreamFrame) => void;
  }> = [];

  const stream: TestStream = {
    frames,
    raw,
    socket,
    pings: 0,
    pongs: 0,
    subscribe: (workspaceId, afterSeq) =>
      socket.send(JSON.stringify({ type: 'subscribe', workspaceId, afterSeq })),
    sendRaw: (data) => socket.send(data),
    next: (match, timeoutMs = 5000) =>
      new Promise((resolve, reject) => {
        const found = frames.find(match);
        if (found !== undefined) {
          resolve(found);
          return;
        }
        const timer = setTimeout(
          () => reject(new Error(`no matching frame within ${timeoutMs}ms; saw: ${raw.join('\n')}`)),
          timeoutMs,
        );
        waiters.push({
          match,
          resolve: (frame) => {
            clearTimeout(timer);
            resolve(frame);
          },
        });
      }),
    closed: new Promise((resolve) =>
      socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    ),
    close: () =>
      new Promise((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        socket.once('close', () => resolve());
        socket.close();
      }),
  };

  socket.on('ping', () => {
    stream.pings += 1;
  });
  socket.on('pong', () => {
    stream.pongs += 1;
  });
  socket.on('message', (data) => {
    const text = data.toString();
    raw.push(text);
    // Parsed through the PUBLISHED schema, exactly as `stream-socket.ts` does
    // for the hub's own writes: Plans 6, 9 and 10 will mock this protocol, and
    // a frame the real server emits that the published shape refuses is the
    // failure this series has already recorded in its own words.
    const frame = serverStreamFrameSchema.parse(JSON.parse(text)) as ServerStreamFrame;
    frames.push(frame);
    const index = waiters.findIndex((w) => w.match(frame));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      waiter?.resolve(frame);
    }
  });

  return new Promise((resolve, reject) => {
    let refusal: StreamRefusal | undefined;
    socket.once('unexpected-response', (_request, response) => {
      let body = '';
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      response.on('end', () => {
        refusal = {
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body,
        };
        reject(new StreamRefused(refusal));
      });
    });
    socket.once('error', (error) => {
      // `unexpected-response` fires first and rejects with the whole response;
      // this only catches the transport failures that carry no response at all.
      if (refusal === undefined) reject(error);
    });
    socket.once('open', () => resolve(stream));
  });
}

/**
 * `openStream`, but for a call that is EXPECTED to be refused: returns the
 * server's HTTP answer, and throws if the socket opened instead.
 *
 * The throw matters more than the return. `await expect(openStream(...)).rejects.toThrow()`
 * — the plan's spelling — passes when the door refuses, and it also passes when
 * the port is closed, when the path is wrong, and when `ws` cannot resolve the
 * host. This one fails on all three, because it asserts a STATUS.
 */
export async function refusedStream(
  port: number,
  headers: Record<string, string>,
): Promise<StreamRefusal> {
  try {
    const stream = await openStream(port, headers);
    await stream.close();
    throw new Error('the handshake was ACCEPTED; expected the door to refuse it');
  } catch (error) {
    if (error instanceof StreamRefused) return error.response;
    throw error;
  }
}

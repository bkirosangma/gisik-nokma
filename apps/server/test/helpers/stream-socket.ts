import { serverStreamFrameSchema, type ServerStreamFrame } from '@gisik-nokma/domain';
import type { StreamSocket } from '../../src/stream/hub.js';

export type FakeSocket = StreamSocket & {
  /** The PARSED frames — the shape check's output. See the docblock: not the wire. */
  frames: ServerStreamFrame[];
  /** The BYTES, exactly as the hub wrote them. What a disclosure claim is made over. */
  raw: string[];
  closes: Array<{ code: number; reason: string }>;
  buffered: number;
};

/**
 * Every key present on the wire that the schema did not keep, as dotted paths.
 *
 * `serverStreamFrameSchema` strips before it refuses. The OUTER frame object is
 * `.strict()`, so an extra top-level frame key throws — but the ENVELOPE inside
 * is `eventEnvelopeSchema.and(...)` over a plain non-strict `z.object`, and an
 * unknown key there is dropped in silence. Comparing the parse RESULT against
 * the value that went in is what turns that silence back into a failure.
 *
 * `payload` is `z.unknown()`, so its contents come through by the same
 * reference and this walk finds nothing inside it — correct, because a payload
 * key is the claim, not a widening of the protocol.
 */
function keysStrippedByParse(onWire: unknown, kept: unknown, path = ''): string[] {
  if (onWire === null || typeof onWire !== 'object') return [];
  if (kept === null || typeof kept !== 'object') return [];
  if (Array.isArray(onWire) !== Array.isArray(kept)) return [];
  const wire = onWire as Record<string, unknown>;
  const parsed = kept as Record<string, unknown>;
  const stripped: string[] = [];
  for (const key of Object.keys(wire)) {
    const here = path === '' ? key : `${path}.${key}`;
    if (!(key in parsed)) stripped.push(here);
    else stripped.push(...keysStrippedByParse(wire[key], parsed[key], here));
  }
  return stripped;
}

/**
 * A `StreamSocket` that records what the hub wrote to it — the BYTES and the
 * parse of them, which are not the same recording and were once conflated here.
 *
 * Every frame goes through `serverStreamFrameSchema` on the way in, which is
 * not decoration. Plans 6, 9 and 10 will mock this protocol, and this series'
 * recorded signature failure is that "a mocked contract is the thing that
 * excuses the server from existing" — so the frames the REAL server emits are
 * held to the same published shape those mocks will be written against.
 *
 * ## What the recording guarantees, precisely
 *
 * The earlier version of this docblock claimed "a widened field, a missing
 * `workspaceSeq`, an invented key: all of them redden here", and only the first
 * two were true. `socket.frames` held the parse RESULT, so anything the schema
 * STRIPPED was gone before any assertion could look at it — an event frame
 * whose envelope carried an attacker-chosen extra key passed every stream test.
 * Two things fix that, and they cover different failures:
 *
 * 1. **`socket.raw`** is the string the hub passed to `send`, recorded before
 *    anything can refuse it. Every claim of the form *this id did not reach
 *    that subscriber* is asserted over these bytes, because a claim asserted
 *    over `frames` is a claim about what survived the schema.
 * 2. **The parse must strip nothing.** `keysStrippedByParse` compares the
 *    result against what went in and throws naming the paths, so an undeclared
 *    ENVELOPE key reddens here rather than travelling. The strictness is this
 *    recorder's, NOT the schema's — `serverStreamFrameSchema` alone still
 *    admits it, which is stated where the schema is declared because that is
 *    what Plans 6/9/10 point their fakes at.
 *
 * A throw here happens inside the hub's drain, so the pump catches it and
 * closes the socket 1011 instead of surfacing an assertion. The frames the case
 * expected are then absent and it reddens on that — a real kill, but the
 * failure reads as a close. Look at `raw` and the `onError` argument first.
 */
export function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    frames: [],
    raw: [],
    closes: [],
    buffered: 0,
    get bufferedAmount() {
      return socket.buffered;
    },
    send(data: string) {
      // Before the parse: a frame the schema refuses was still SENT, and the
      // bytes are the evidence of what it said.
      socket.raw.push(data);
      const onWire: unknown = JSON.parse(data);
      const parsed = serverStreamFrameSchema.parse(onWire);
      const stripped = keysStrippedByParse(onWire, parsed);
      if (stripped.length > 0) {
        throw new Error(
          `stream: the frame on the wire carried ${stripped.join(', ')}, which the published schema does not declare and silently strips`,
        );
      }
      socket.frames.push(parsed as ServerStreamFrame);
    },
    close(code: number, reason: string) {
      socket.closes.push({ code, reason });
    },
    terminate() {
      socket.closes.push({ code: -1, reason: 'terminated' });
    },
  };
  return socket;
}

/**
 * The same recorder WITHOUT the schema check.
 *
 * One caller: the prototype-key case in `hub.test.ts`. `serverStreamFrameSchema`
 * types every frame's `workspaceId` as a ULID, so a frame naming `__proto__` is
 * refused by the published protocol — the right answer, and the reason
 * `fakeSocket` cannot observe the hub's keying at all in that case (the parse
 * throws, the pump catches it, the socket is closed 1011 with no frames). This
 * one steps around the wire layer to look at the data structure underneath it.
 * It still records `raw`, so the bytes are available either way.
 */
export function rawSocket(): FakeSocket {
  const socket = fakeSocket();
  socket.send = (data: string) => {
    socket.raw.push(data);
    socket.frames.push(JSON.parse(data) as ServerStreamFrame);
  };
  return socket;
}

export const frameTypes = (socket: FakeSocket): string[] => socket.frames.map((f) => f.type);

/**
 * The bytes the hub wrote from `from` onward, concatenated.
 *
 * `from` is an index into `raw`, never into `frames`: the two arrays diverge
 * the moment a frame is sent and refused, and a disclosure assertion sliced by
 * the wrong one silently moves off the frames it meant to inspect. Capture
 * `socket.raw.length` BEFORE the commit under test, not after it.
 */
export const rawSince = (socket: FakeSocket, from: number): string => socket.raw.slice(from).join('\n');

/** Every frame about one workspace, whichever field of the frame names it. */
export const framesAbout = (socket: FakeSocket, workspaceId: string): ServerStreamFrame[] =>
  socket.frames.filter((f) =>
    f.type === 'event' ? f.envelope.workspaceId === workspaceId : f.workspaceId === workspaceId,
  );

/**
 * One comparable string per frame — the shape the visibility suite already uses
 * for `SyncItem`, so a stream assertion and a filter assertion read alike.
 */
export const frameIds = (socket: FakeSocket): string[] =>
  socket.frames.map((frame) => {
    switch (frame.type) {
      case 'event':
        return frame.envelope.id;
      case 'purge':
        return `purge:${frame.entityId}`;
      case 'scope-revoked':
        return `scope-revoked:${frame.workspaceId}`;
      case 'caught-up':
        return `caught-up:${frame.seq}`;
      case 'error':
        return `error:${frame.code}`;
    }
  });

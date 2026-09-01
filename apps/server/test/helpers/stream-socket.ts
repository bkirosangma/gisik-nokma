import { serverStreamFrameSchema, type ServerStreamFrame } from '@gisik-nokma/domain';
import type { StreamSocket } from '../../src/stream/hub.js';

export type FakeSocket = StreamSocket & {
  frames: ServerStreamFrame[];
  closes: Array<{ code: number; reason: string }>;
  buffered: number;
};

/**
 * A `StreamSocket` that records what the hub wrote to it.
 *
 * Every frame goes through `serverStreamFrameSchema` on the way in, which is
 * not decoration. Plans 6, 9 and 10 will mock this protocol, and this series'
 * recorded signature failure is that "a mocked contract is the thing that
 * excuses the server from existing" — so the frames the REAL server emits are
 * held to the same published shape those mocks will be written against. A
 * widened field, a missing `workspaceSeq`, an invented key: all of them redden
 * here rather than in the plan that trusted the type.
 */
export function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    frames: [],
    closes: [],
    buffered: 0,
    get bufferedAmount() {
      return socket.buffered;
    },
    send(data: string) {
      socket.frames.push(serverStreamFrameSchema.parse(JSON.parse(data)) as ServerStreamFrame);
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
 */
export function rawSocket(): FakeSocket {
  const socket = fakeSocket();
  socket.send = (data: string) => {
    socket.frames.push(JSON.parse(data) as ServerStreamFrame);
  };
  return socket;
}

export const frameTypes = (socket: FakeSocket): string[] => socket.frames.map((f) => f.type);

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

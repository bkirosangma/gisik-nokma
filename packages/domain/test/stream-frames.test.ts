import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import type { LedgerEvent } from '../src/ledger-event.js';
import { ledgerEventSchema } from '../src/ledger-event.js';
import {
  STREAM_CLOSE_CODES,
  serverStreamFrameSchema,
  subscribeFrameSchema,
  type ServerStreamFrame,
} from '../src/stream-frames.js';

/**
 * Plan 5 Task 14 — the WS `/v1/stream` wire protocol.
 *
 * ## Why this file validates SERVER frames too, when only the client frame
 * ## crosses an untrusted boundary
 *
 * Nothing in this repository parses a server frame: the server writes them and
 * the client reads them, so a schema for them refuses no hostile input. It
 * exists for a different reason, and the reason is the series' own recorded
 * failure — "a mocked contract is the thing that excuses the server from
 * existing". Plans 6, 9 and 10 build fakes against this shape. A fake that
 * emits `{type:'event', envelope}` where the envelope has no `workspaceSeq`
 * looks correct against the TYPE at compile time in a hand-written mock, and
 * `serverStreamFrameSchema` is what makes it fail at run time — so a replica
 * built against the fake cannot pass while being unable to resume from a real
 * server.
 *
 * `workspaceSeq` is the field that carries that weight, which is why the
 * `refuses an event frame whose envelope has no workspaceSeq` case sits beside
 * a positive control that differs from it only in that field.
 */

const WORKSPACE = newUlid();
const TICKET = newUlid();

function ledgerEvent(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    id: newUlid(),
    workspaceId: WORKSPACE,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.created',
    version: 1,
    payload: { typeId: 'task', projectId: newUlid(), parentId: null, title: 'A ticket' },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq: 1,
    workspaceSeq: 42,
    ...overrides,
  };
}

describe('subscribeFrameSchema', () => {
  it('accepts a well-formed subscribe frame', () => {
    const frame = { type: 'subscribe', workspaceId: WORKSPACE, afterSeq: 0 };
    expect(subscribeFrameSchema.parse(frame)).toEqual(frame);
  });

  it('refuses wrong types, negative cursors, non-ULID workspaces and unknown keys', () => {
    // The positive control for every refusal below: one field changed at a time
    // from a frame that IS accepted, so a schema that refused everything would
    // fail the case above rather than pass this one vacuously.
    expect(() =>
      subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: WORKSPACE, afterSeq: -1 }),
    ).toThrow();
    expect(() =>
      subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: WORKSPACE, afterSeq: 1.5 }),
    ).toThrow();
    expect(() =>
      subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: '', afterSeq: 0 }),
    ).toThrow();
    // The plan text's `z.string().min(1)` admits this. A workspace id is a ULID
    // everywhere else in the domain, and an actor-supplied string that reaches
    // a lookup key is the hazard this branch has already been bitten by, so the
    // narrower rule is stated at the door rather than trusted downstream.
    expect(() =>
      subscribeFrameSchema.parse({ type: 'subscribe', workspaceId: '__proto__', afterSeq: 0 }),
    ).toThrow();
    expect(() =>
      subscribeFrameSchema.parse({ type: 'unsubscribe', workspaceId: WORKSPACE, afterSeq: 0 }),
    ).toThrow();
    expect(() =>
      subscribeFrameSchema.parse({
        type: 'subscribe',
        workspaceId: WORKSPACE,
        afterSeq: 0,
        extra: true,
      }),
    ).toThrow();
  });
});

describe('close codes', () => {
  it('pins the protocol close codes', () => {
    expect(STREAM_CLOSE_CODES).toEqual({ unauthorized: 1008, slowConsumer: 1013, internalError: 1011 });
  });
});

describe('serverStreamFrameSchema', () => {
  it('accepts every frame the server can send, round-tripping each unchanged', () => {
    const frames: ServerStreamFrame[] = [
      { type: 'event', envelope: ledgerEvent() },
      { type: 'purge', workspaceId: WORKSPACE, entityId: TICKET },
      { type: 'scope-revoked', workspaceId: WORKSPACE },
      { type: 'caught-up', workspaceId: WORKSPACE, seq: 0 },
      { type: 'caught-up', workspaceId: WORKSPACE, seq: 42 },
      { type: 'error', workspaceId: WORKSPACE, code: 'not-a-member', message: 'no' },
      { type: 'error', workspaceId: null, code: 'bad-message', message: 'no' },
      { type: 'error', workspaceId: WORKSPACE, code: 'already-subscribed', message: 'no' },
    ];
    for (const frame of frames) {
      expect(serverStreamFrameSchema.parse(JSON.parse(JSON.stringify(frame)))).toEqual(frame);
    }
  });

  it('refuses an event frame whose envelope carries no workspaceSeq — the resume cursor a fake omits', () => {
    const withCursor = { type: 'event', envelope: ledgerEvent({ workspaceSeq: 7 }) };
    // Positive control: identical but for the one field.
    expect(serverStreamFrameSchema.parse(withCursor)).toEqual(withCursor);

    const { workspaceSeq: _dropped, ...envelopeWithoutCursor } = ledgerEvent();
    expect(() =>
      serverStreamFrameSchema.parse({ type: 'event', envelope: envelopeWithoutCursor }),
    ).toThrow();
    // `seq` is the per-entity counter and cannot stand in for it (sync/stream-seq.ts).
    expect(() =>
      serverStreamFrameSchema.parse({
        type: 'event',
        envelope: { ...envelopeWithoutCursor, workspaceSeq: 0 },
      }),
    ).toThrow();
  });

  it('refuses a scope-revoked frame carrying a projectId, because no emitter produces one', () => {
    const wholeWorkspace = { type: 'scope-revoked', workspaceId: WORKSPACE };
    expect(serverStreamFrameSchema.parse(wholeWorkspace)).toEqual(wholeWorkspace);
    expect(() =>
      serverStreamFrameSchema.parse({ ...wholeWorkspace, projectId: newUlid() }),
    ).toThrow();
  });

  it('refuses unknown frame types, unknown keys and unknown error codes', () => {
    expect(() =>
      serverStreamFrameSchema.parse({ type: 'heartbeat', workspaceId: WORKSPACE }),
    ).toThrow();
    expect(() =>
      serverStreamFrameSchema.parse({ type: 'caught-up', workspaceId: WORKSPACE, seq: 1, extra: 1 }),
    ).toThrow();
    expect(() =>
      serverStreamFrameSchema.parse({
        type: 'error',
        workspaceId: WORKSPACE,
        code: 'teapot',
        message: 'no',
      }),
    ).toThrow();
    expect(() =>
      serverStreamFrameSchema.parse({ type: 'purge', workspaceId: WORKSPACE, entityId: '' }),
    ).toThrow();
  });
});

describe('ledgerEventSchema', () => {
  it('accepts a LedgerEvent and refuses the same value with the workspace cursor removed', () => {
    const event = ledgerEvent();
    expect(ledgerEventSchema.parse(event)).toEqual(event);
    const { workspaceSeq: _dropped, ...withoutCursor } = event;
    expect(() => ledgerEventSchema.parse(withoutCursor)).toThrow();
  });
});

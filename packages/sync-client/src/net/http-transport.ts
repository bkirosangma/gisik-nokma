import type { LedgerEvent, ServerStreamFrame, SubmittedEvent } from '@gisik-nokma/domain';
import type { BootstrapResponse } from '../replica/replica.js';
import type { SyncEventResult } from '../outbox/outbox.js';
import type {
  ReconcileAnswer,
  StreamHandle,
  StreamHandlers,
  SyncTransport,
} from '../engine/sync-engine.js';

/**
 * The subset of the DOM `WebSocket` this transport needs — injectable for tests
 * and for non-browser shells.
 *
 * A MIRROR of `packages/app-core/src/online/stream.ts:5`, and a deliberate one,
 * the same way `sync-item.ts` mirrors the server's `SyncItem`. `app-core`
 * declared this shape first and for the same stated reason (Tauri and Expo have
 * to supply their own socket), and neither package depends on the other today:
 * `app-core` does not import `@gisik-nokma/sync-client`, and this package's
 * dependencies are `@gisik-nokma/domain` and `@gisik-nokma/rule-engine` alone.
 * Creating that edge in either direction to share ten lines of structural type
 * would cost more than the duplicate.
 *
 * *RECORDED, NOT FIXED: `WebSocketLike` belongs in one place once Task 12 gives
 * these two packages a dependency edge — it is the shape of a platform object,
 * not of this protocol, so `@gisik-nokma/domain`'s `stream-frames.ts` is not
 * obviously its home either. Owner: Plan 10 Task 12.*
 */
export type WebSocketLike = {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

/** The same derivation `app-core/src/online/stream.ts` uses — one wire, one URL rule. */
export function streamUrl(baseUrl: string): string {
  return `${baseUrl.replace(/^http/, 'ws')}/v1/stream`;
}

/**
 * The frame types this transport switches on.
 *
 * THIS IS NOT A PARALLEL FRAME UNION — it is a union of the discriminant's
 * string literals, checked below against the real one. The executor ruling
 * deferring `ServerStreamFrame` → `ServerStreamFrame` is protected by two constraints,
 * and one of them is that no client declares a truncated copy of the frame
 * union locally. The plan's own `openStream` snippet declares exactly such a
 * copy and its five members omit `scope-revoked`, so a revoked device would be
 * told nothing and keep showing work it was removed from.
 */
type HandledFrameType = 'event' | 'purge' | 'scope-revoked' | 'reach-granted' | 'caught-up' | 'error';

type AssertTrue<T extends true> = T;

/**
 * Compile-time link to `@gisik-nokma/domain`'s declaration: every member of
 * `ServerStreamFrame` has a branch below. The day amendment 13 grows a sixth
 * frame, this line stops compiling.
 *
 * WHAT IT PINS AND WHAT IT DOES NOT: the frame TYPE STRINGS are all handled. It
 * says nothing about whether each branch reads the right fields or calls the
 * right handler — case 12.167 is what asserts that. Written as
 * `AssertTrue<… ? true : false>` rather than `… ? true : never`, because a type
 * alias resolving to `never` is legal and errors nothing: it would be a check
 * that cannot fail. Verified by deletion — dropping `'purge'` from
 * `HandledFrameType` makes `pnpm turbo run typecheck --force` red.
 *
 * The direction is deliberate too: `ServerStreamFrame['type'] extends Handled`,
 * not the reverse. `ping` is a CLIENT-visible keepalive that
 * `serverStreamFrameSchema` does not model, so the reverse would fail on a
 * frame this transport is right to answer.
 */
type _FramesHandled = AssertTrue<ServerStreamFrame['type'] extends HandledFrameType ? true : false>;

/**
 * The wire implementation: `GET /v1/sync/bootstrap`, `POST /v1/sync`, and
 * amendment 13's stream at `/v1/stream`.
 *
 * ## Parsing is LENIENT, and that is the repo's decided position rather than a
 * ## shortcut
 *
 * `@gisik-nokma/domain` publishes `serverStreamFrameSchema` over these frames
 * and this module does not call it, for the reasons
 * `packages/app-core/src/online/stream.ts:34-45` sets out at length and which
 * apply here unchanged: every id in that schema is `ulidString`, so a server
 * that one day emits a non-ULID id would have its frames REFUSED by a client
 * that trusts it — and a client which hard-drops a frame it could have
 * delivered fails silently, the worse direction. The schema's own docblock also
 * states that nothing in this repository parses a frame with it and that it is
 * not a security boundary; wiring it into a live client path would make that
 * sentence false in a file this task does not own.
 *
 * TWO FIELDS are held to the server's own rule, and they are enumerated rather
 * than counted because this paragraph said "the ONE field" while the second was
 * unguarded:
 *
 * - `envelope.workspaceSeq` on an `event` frame: an integer **> 0**, required.
 *   `ledgerEventSchema` requires it because `readStreamSeq` returns 0 for an
 *   empty workspace, so 0 is a cursor value and never an event's position — and
 *   a frame without it is a frame this subscription cannot resume from.
 * - `seq` on a `caught-up` frame: an integer **>= 0**, because that is the value
 *   this client PERSISTS. The looser bound is the empty workspace's legitimate
 *   position. See the branch itself for what `1e999` did before this held.
 *
 * Everything else is lenient on purpose, per the paragraph above.
 *
 * ## Why this is not `app-core`'s `parseFrame` called from here
 *
 * `parseFrame` returns `app-core`'s `ServerStreamFrame`, the very union the executor
 * ruling defers replacing, and moving it would BE that replacement. The
 * duplication is one lenient switch, and it is bounded by the compile-time link
 * above rather than by anyone remembering.
 */
export function createHttpTransport(opts: {
  /** e.g. `https://api.gisik-nokma.example` — no trailing slash. */
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  webSocketFactory?: (url: string) => WebSocketLike;
}): SyncTransport {
  const doFetch = opts.fetchImpl ?? fetch;
  const factory = opts.webSocketFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
  const headers = { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' };

  return {
    async bootstrap(workspaceId: string): Promise<BootstrapResponse> {
      const url = `${opts.baseUrl}/v1/sync/bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`;
      const res = await doFetch(url, { headers });
      if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
      return (await res.json()) as BootstrapResponse;
    },

    async sync(events: SubmittedEvent[]): Promise<SyncEventResult[]> {
      const res = await doFetch(`${opts.baseUrl}/v1/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(`sync failed: ${res.status}`);
      return ((await res.json()) as { results: SyncEventResult[] }).results;
    },

    async reconcile(workspaceId: string, heldIds: string[]): Promise<ReconcileAnswer> {
      const res = await doFetch(`${opts.baseUrl}/v1/sync/reconcile`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceId, heldIds }),
      });
      // Same shape as the two doors above: a non-2xx is a throw, never a silent
      // empty answer. An empty `restricted` means "everything you named is still
      // yours", and a failed request that returned one would be a device quietly
      // concluding it had nothing to give back.
      if (!res.ok) throw new Error(`reconcile failed: ${res.status}`);
      return (await res.json()) as ReconcileAnswer;
    },

    openStream(workspaceId: string, afterSeq: number, handlers: StreamHandlers): StreamHandle {
      const socket = factory(streamUrl(opts.baseUrl));
      // Token via subprotocol is what the plan's snippet reaches for; the
      // handshake is Plan 5's to define and `app-core`'s shipped subscriber
      // sends none, so this one does not either. Following the shipped client
      // rather than the plan's guess keeps ONE handshake to change when Plan 5
      // settles it.
      socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', workspaceId, afterSeq }));

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return; // unparseable bytes are ignored, never guessed at
        }
        if (raw === null || typeof raw !== 'object') return;
        const frame = raw as Record<string, unknown>;

        if (frame.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (frame.type === 'event') {
          if (frame.envelope === null || typeof frame.envelope !== 'object') return;
          const workspaceSeq = (frame.envelope as Record<string, unknown>).workspaceSeq;
          if (typeof workspaceSeq !== 'number' || !Number.isInteger(workspaceSeq) || workspaceSeq <= 0) return;
          handlers.onItem(frame.envelope as LedgerEvent);
          return;
        }

        // Amendment 19: purge/scope-revoked/caught-up/error name their
        // workspace. This socket holds ONE subscription, so a frame for another
        // workspace is a crossed stream — drop it rather than advance this
        // cursor by a number that means nothing here, or empty a replica nobody
        // revoked. `error` is the exception: `workspaceId` is null for
        // connection-level errors raised before any subscribe.
        if (frame.type === 'error') {
          if (typeof frame.code !== 'string' || typeof frame.message !== 'string') return;
          if (typeof frame.workspaceId === 'string' && frame.workspaceId !== workspaceId) return;
          handlers.onError({ code: frame.code, message: frame.message });
          return;
        }
        if (frame.workspaceId !== workspaceId) return;

        if (frame.type === 'purge') {
          if (typeof frame.entityId !== 'string') return;
          handlers.onItem({ kind: 'purge', entityId: frame.entityId });
          return;
        }
        if (frame.type === 'scope-revoked') {
          // `projectId` is `?: never` on the server side and the hub refuses an
          // instruction carrying one, so a `projectId` on the wire is not a
          // narrowing this client may honour — nothing here reads one.
          handlers.onItem({ kind: 'scope-revoked', workspaceId });
          return;
        }
        if (frame.type === 'reach-granted') {
          // Ruling P37.1, closure 5b(d): the reader's reach grew and these are
          // the ids it now admits. Validated the way every other id-bearing
          // frame here is — an array of strings, non-empty — because the ids go
          // straight into a durable pending set and then into request URLs; a
          // frame carrying `[null]` would persist a `"null"` this device asks
          // for on every catch-up forever.
          //
          // Filtered rather than refused WHOLE on a bad element, unlike
          // `caught-up` above. The asymmetry is the consequence, not a
          // preference: a bad cursor is terminal and survives restarts, whereas
          // a dropped id costs one un-pulled ticket that the NEXT widening
          // names again. Refusing the whole frame over one bad element would
          // discard the good ids with it.
          if (!Array.isArray(frame.ticketIds)) return;
          const ticketIds = frame.ticketIds.filter((id: unknown): id is string => typeof id === 'string' && id !== '');
          if (ticketIds.length === 0) return;
          handlers.onItem({ kind: 'reach-granted', workspaceId, ticketIds });
          return;
        }
        if (frame.type === 'caught-up') {
          // HELD TO THE SAME RULE AS `envelope.workspaceSeq` ABOVE, and it is
          // the more important of the two: `workspaceSeq` decides whether one
          // frame is delivered, while THIS number is the one written to durable
          // storage (`replica.setCursor` stores `String(seq)`, `getCursor`
          // returns `Number(value)`), so one bad frame is terminal and survives
          // process restarts.
          //
          // JSON cannot carry NaN, but it carries `1e999`, which `JSON.parse`
          // yields as `Infinity` with `typeof 'number'` — measured end to end:
          // the cursor persists as `"Infinity"`, `needsBootstrap` is false
          // forever because `Infinity !== 0`, and every later `subscribe` sends
          // `{"afterSeq":null}` because that is what `JSON.stringify` does with
          // it. The device can then neither resume nor re-bootstrap, silently.
          // A negative or fractional `seq` is milder and equally unrefused; a
          // too-large finite one advances the cursor past events never
          // delivered, which is the permanent silent skip `onError`'s note
          // refuses one branch away.
          //
          // `>= 0`, NOT `> 0`: `readStreamSeq` returns 0 for an empty
          // workspace, so 0 is a legitimate caught-up position — the one case
          // where this rule is deliberately looser than the event branch's,
          // which rejects 0 because no event can hold it. Case 12.171.
          if (typeof frame.seq !== 'number' || !Number.isInteger(frame.seq) || frame.seq < 0) return;
          handlers.onCaughtUp(frame.seq);
        }
      };

      socket.onclose = () => handlers.onClose();
      socket.onerror = () => socket.close();
      return { close: () => socket.close() };
    },
  };
}

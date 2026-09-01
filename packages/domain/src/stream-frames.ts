import { z } from 'zod';
import { ulidString } from './envelope.js';
import { ledgerEventSchema, type LedgerEvent } from './ledger-event.js';

/**
 * WS `/v1/stream` protocol (coordination amendment 13).
 *
 * Client → server: `{type:'subscribe', workspaceId, afterSeq}` — one per
 * workspace per connection; several workspaces multiplex on one socket.
 *
 * Server → client, per subscription:
 * ```
 *   {type:'event', envelope}                catch-up and live tail, cursor order
 *   {type:'purge', workspaceId, entityId}   revocation: forget this entity
 *   {type:'scope-revoked', workspaceId}     a guest's / an ex-member's revocation
 *   {type:'caught-up', workspaceId, seq}    once, after the first drain
 *   {type:'error', workspaceId|null, code, message}
 * ```
 *
 * **A subscribe's first drain ends with exactly ONE of `caught-up` or
 * `scope-revoked`, never both and never neither.** A client state machine that
 * waits for `caught-up` before it renders would hang forever on the revocation
 * path, so the alternative is stated here rather than left to be discovered:
 * `scope-revoked` is TERMINAL for that subscription (`stream/hub.ts`), it
 * carries no cursor, and the correct client move after it is a fresh bootstrap,
 * not a resume.
 *
 * The `error` frame is declared here and emitted by the ROUTE (Task 15), not by
 * the hub: the hub answers a duplicate subscription with a discriminated string
 * and lets the route frame it, and `bad-message` and `not-a-member` are
 * decisions only the door can make. Nothing in Task 14 produces an `error`
 * frame.
 *
 * ## A SECOND expression of this protocol already exists, and it disagrees
 *
 * `packages/app-core/src/data-source.ts` declares `StreamItem`, written against
 * coordination amendments 13 + 19 before any server emitted a frame. It is not
 * imported from here and it differs from what the server actually sends in
 * three ways, each of which breaks a replica quietly rather than loudly:
 *
 * - its event frame carries `EventEnvelope`, so it has **no `workspaceSeq`** —
 *   a client holding only that cannot compute the `afterSeq` it must send back,
 *   which is the whole resume protocol;
 * - it has **no `scope-revoked` member**, so the one instruction that tells a
 *   removed device to empty itself arrives as an unknown `type` and is dropped;
 * - its `code` is a bare `string` rather than `StreamErrorCode`, so a
 *   misspelled code is a runtime surprise instead of a compile error.
 *
 * It is left standing rather than edited here: `DataSource` is a cross-plan
 * contract and this task has no business rewriting the client seam. But it is
 * exactly the shape of failure this series has already recorded in its own
 * words — *a mocked contract is the thing that excuses the server from
 * existing* — so it is named here, where the plan that consumes it will be
 * reading. **`StreamItem` should be replaced by `ServerStreamFrame`, not
 * re-synchronised with it.** *Owner: Plan 10 (the replica `DataSource`), with
 * Plan 6 affected.*
 *
 * ## `afterSeq` is the WORKSPACE cursor, and that is why the event frame
 * ## carries a `LedgerEvent` rather than the plan's `EventEnvelope`
 *
 * The plan's Interfaces section declares `{type:'event'; envelope: EventEnvelope}`
 * and, three paragraphs later, "the client resumes with `afterSeq` = the highest
 * envelope seq it has applied". Those two sentences cannot both be obeyed.
 * `EventEnvelope.seq` is the PER-ENTITY counter and restarts at 1 for every new
 * entity, so a client resuming by it skips every new entity's early events and
 * never learns it missed them — `sync/stream-seq.ts` states that hazard as the
 * reason `workspace_seq` exists, and `visibleEventsFor` selects on
 * `workspace_seq > $2`. The resume cursor the client must echo back is
 * therefore `workspaceSeq`, and a frame that does not carry it is a frame the
 * client cannot resume from. `LedgerEvent` is `EventEnvelope` plus exactly that
 * field, so this is a widening: a Plan 10 consumer typed to `EventEnvelope`
 * still compiles against it.
 *
 * It is also the field that makes this protocol hard to fake. `workspaceSeq` is
 * assigned inside the appending transaction under `lockWorkspace` and nowhere
 * else, so a mock that has not spoken to a ledger has nothing true to put in it
 * — and `serverStreamFrameSchema` below refuses the frame when it is absent.
 *
 * ## Reconnect semantics
 *
 * Delivery is at-least-once. The client resumes with `afterSeq` = the highest
 * `envelope.workspaceSeq` it has applied; frames at or below the cursor may
 * repeat; dedupe by envelope id; purges are idempotent. A slow consumer is
 * closed with 1013 `slow-consumer` — the ledger is the durable buffer, so
 * reconnect-and-resume loses nothing.
 *
 * ## What a frame discloses by existing
 *
 * An `event` frame carries the whole envelope, so there is no "notification
 * without payload" tier here and no separate existence-disclosure to reason
 * about: a subscriber is told about entity X exactly when `visibleEventsFor`
 * decides they may see the event about X. That decision is Plan 4's, taken per
 * subscriber, and the hub re-derives none of it. `purge` and `scope-revoked`
 * are the two frames that name something the recipient may no longer see, and
 * both are `visibleEventsFor`'s own instructions passed through one-to-one —
 * their disclosure trade is argued in `visible-events-for.ts` (cases 6.100–6.104)
 * and is not re-decided here.
 */
export const subscribeFrameSchema = z
  .object({
    type: z.literal('subscribe'),
    /**
     * A ULID, not the plan's `z.string().min(1)`. Every workspace id in this
     * domain is a ULID, and this string arrives from an actor and is used as a
     * lookup key — `'__proto__'` and `'toString'` are refused here rather than
     * defended against in three places downstream. The hub still keys by `Map`;
     * this is the first of the two, not the only one.
     */
    workspaceId: ulidString,
    /** 0 means "I hold nothing"; `readStreamSeq` returns 0 for an empty workspace. */
    afterSeq: z.number().int().min(0),
  })
  .strict();
export type SubscribeFrame = z.infer<typeof subscribeFrameSchema>;
export type ClientStreamFrame = SubscribeFrame;

export const STREAM_ERROR_CODES = ['bad-message', 'not-a-member', 'already-subscribed'] as const;
export type StreamErrorCode = (typeof STREAM_ERROR_CODES)[number];

export type ServerStreamFrame =
  | { type: 'event'; envelope: LedgerEvent }
  | { type: 'purge'; workspaceId: string; entityId: string }
  /**
   * A guest's — or an ex-member's — revocation as ONE frame rather than one
   * purge per ticket (owner decision 2026-08-27): per-id purges would tell an
   * external party how many tickets existed in the scope they were never shown.
   * No cursor: like `purge` it cannot advance a resume position, and the
   * replica's handler is a local delete by scope, so it is idempotent.
   *
   * **`projectId` is declared and CANNOT be populated, and that is stated in
   * the type rather than in this sentence.** `ScopeRevokedInstruction` admits
   * an optional `projectId`, but both of `visibleEventsFor`'s emitters yield
   * `{kind:'scope-revoked', workspaceId}` and neither has a project scope to
   * name — the project-scoped revocation is served as an itemised purge list
   * instead. `?: never` is what makes that a compile error to fill in rather
   * than a docblock a later author skims: the day an emitter grows a project
   * scope, the hub's mapping stops compiling and somebody has to decide what
   * the wire says. Until then the hub REFUSES an instruction carrying one
   * (`stream/hub.ts`), because silently dropping the narrowing would wipe a
   * whole workspace's replica for the loss of one project.
   */
  | { type: 'scope-revoked'; workspaceId: string; projectId?: never }
  | { type: 'caught-up'; workspaceId: string; seq: number }
  | { type: 'error'; workspaceId: string | null; code: StreamErrorCode; message: string };

/**
 * The runtime shape of every server frame.
 *
 * Nothing in this repository parses one — the server writes them, the client
 * reads them — so this refuses no hostile input and is not a security boundary.
 * It exists because Plans 6, 9 and 10 mock this protocol, and this series'
 * recorded signature failure is that "a mocked contract is the thing that
 * excuses the server from existing". A hand-written fake that omits
 * `envelope.workspaceSeq`, or invents a `scope-revoked.projectId`, satisfies a
 * loosely-read TYPE and fails HERE. Point the fake at this schema and it cannot
 * be more permissive than the server.
 */
export const serverStreamFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('event'), envelope: ledgerEventSchema }).strict(),
  z
    .object({ type: z.literal('purge'), workspaceId: ulidString, entityId: ulidString })
    .strict(),
  z.object({ type: z.literal('scope-revoked'), workspaceId: ulidString }).strict(),
  z
    .object({
      type: z.literal('caught-up'),
      workspaceId: ulidString,
      seq: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      workspaceId: ulidString.nullable(),
      code: z.enum(STREAM_ERROR_CODES),
      message: z.string().min(1),
    })
    .strict(),
]);

export const STREAM_CLOSE_CODES = {
  unauthorized: 1008,
  slowConsumer: 1013,
  internalError: 1011,
} as const;

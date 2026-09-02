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
 * imported from here, and it differed from what the server actually sends in
 * three ways, each of which broke a replica quietly rather than loudly:
 *
 * - its event frame carried `EventEnvelope`, so it had **no `workspaceSeq`** —
 *   a client holding only that cannot compute the `afterSeq` it must send back,
 *   which is the whole resume protocol. **CLOSED 2026-09-02, Plan 6 Task 8:**
 *   the member now carries `LedgerEvent`. `EventEnvelope` itself was NOT
 *   widened — it is the contract-pinned wire type, and `LedgerEvent` is exactly
 *   it plus the cursor, so the change is a widening on the client side alone;
 * - it had **no `scope-revoked` member**, so the one instruction that tells a
 *   removed device to empty itself arrived as an unknown `type` and was dropped.
 *   **CLOSED 2026-09-02, Plan 6 Task 8:** it is a fifth member and copies the
 *   `projectId?: never` below verbatim rather than softening it to an optional
 *   `string`;
 * - its `code` is a bare `string` rather than `StreamErrorCode`, so a
 *   misspelled code is a runtime surprise instead of a compile error. **STILL
 *   OPEN**, and it is the only one of the three that is.
 *
 * The two that closed were closed by widening, not by replacement, and the
 * end-state judgement here is unchanged: **`StreamItem` should be REPLACED by
 * `ServerStreamFrame`, not re-synchronised with it.** *Owner: Plan 10 (the
 * replica `DataSource`).* Plan 6 Task 8 took only the two widenings its own
 * consumer could not work without, because a client that drops revocations and
 * cannot name its resume cursor is broken today, while the replacement moves a
 * cross-plan contract and belongs to the plan that owns the other implementer.
 *
 * The reason the drift was found at all, recorded because it is the transferable
 * part: this docblock's claims were pinned as executable cases in
 * `apps/server/test/integration/client-contract.test.ts`, deriving the client's
 * shape from its source TEXT. Those cases went red on the reconciliation, which
 * is how a prose claim gets to be evidence.
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
 * loosely-read TYPE and fails HERE.
 *
 * ## Where the strictness stops — measured, and NOT what an earlier draft claimed
 *
 * This docblock used to end "point the fake at this schema and it cannot be more
 * permissive than the server." That is false, and the boundary is worth stating
 * exactly because Plans 6, 9 and 10 are the readers:
 *
 * - the OUTER frame object of every member is `.strict()`, so an unknown
 *   TOP-LEVEL frame key is refused;
 * - the ENVELOPE inside the event frame is NOT. `ledgerEventSchema` is
 *   `eventEnvelopeSchema.and(…)` over a plain non-strict `z.object`, so an
 *   unknown ENVELOPE key is **silently STRIPPED, not refused** — a fake (or a
 *   server) that adds one parses clean and the key disappears from the result;
 * - `payload` is `z.unknown()` by design, so payload CONTENTS pass through
 *   untouched and this schema says nothing about them. `parseEvent` is what
 *   validates a payload; `envelope.ts` states that where the envelope is
 *   declared.
 *
 * So a mock CAN be more permissive than the server in exactly one place: extra
 * envelope keys. The server's own frames are held tighter than this by the
 * recording socket in `apps/server/test/helpers/stream-socket.ts`, which
 * compares the parse RESULT against the bytes and refuses anything the schema
 * dropped — a recorder's check, not this schema's, and it does not travel to a
 * consumer that only imports this file. A consumer that needs the guarantee
 * should `.strict()` the envelope on its own side rather than assume it here.
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

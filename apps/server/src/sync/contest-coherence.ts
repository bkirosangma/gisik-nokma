import {
  claimContestedPayloadSchema,
  newSubmittedEvent,
  type EventEnvelope,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';

/**
 * # The §11 closer: a contest's embedded claim must be about the contest's own
 * ticket, in the contest's own workspace.
 *
 * **"envelope-origin" vs "HTTP-Origin".** Nothing in this module concerns the
 * browser `Origin` header, CSRF, or cross-site requests. Where it says
 * envelope-origin it means `EventEnvelope.origin`, the provenance enum
 * `'web' | 'mobile' | 'desktop' | 'server' | 'mcp'`. The two are routinely conflated in
 * this area of the repo and the conflation is how someone writes a header check
 * and believes this window is closed.
 *
 * ## The defect this closes, stated fully
 *
 * `claim.contested`'s payload embeds a whole `SubmittedEvent` — the refused
 * claim, carried WHOLE so the ticket banner can say what was claimed. Every
 * layer validated one half of that and none of them compared the halves:
 *
 * - `claimContestedPayloadSchema` validates the EMBEDDED event's internal shape.
 * - `parseEvent` validates the OUTER envelope.
 * - `evaluateClaimContested` reads the outer envelope-origin and nothing else.
 * - `ENTITY_WORKSPACE_MISMATCH_RULE` (ingest-service.ts) refuses an envelope
 *   filing an entity under the wrong workspace — but the forgery's OUTER
 *   envelope is HONEST (a real ticket in its real workspace). The lie is inside
 *   `payload`, which that guard does not read and, `payload` being opaque JSON
 *   at that layer, could not.
 *
 * So a contest filed on ticket B in workspace B could embed a fabricated claim
 * naming ticket A in workspace A, attributed to any actor, and commit — proven
 * end to end over the shipped door. Combined with the envelope-origin forgery
 * (closed at the CLIENT door by Plan 4 Task 5's gate) the reachable shape was a
 * **permanent, un-deletable ledger entry attributing a fabricated claim to any
 * actor, naming any workspace**: `renderContestedClaimText` renders it into a
 * comment body, and the ledger is append-only by trigger, so such a row can
 * only ever be superseded, never removed.
 *
 * ## What the check BINDS — exactly three comparisons, derived from the schemas
 *
 * `SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>`, so the embedded
 * claim carries every field the outer envelope does except the two ingest
 * assigns. Of those, three and only three must agree:
 *
 * 1. `payload.originalEvent.workspaceId === env.workspaceId`
 * 2. `payload.originalEvent.entity.kind === env.entity.kind`
 * 3. `payload.originalEvent.entity.id === env.entity.id`
 *
 * A contest is a record filed ON a ticket ABOUT a claim that touched that
 * ticket. Those three are what "that ticket" means.
 *
 * ## What it deliberately does NOT bind, and why each one would be wrong
 *
 * - **`actorId`.** The contest's actor is the SERVER; the embedded claim's
 *   actor is the CLAIMANT. `proj_contested.claimant_id` reads
 *   `originalEvent.actorId` precisely because the two differ. Binding them
 *   would empty My Work for everyone.
 * - **`origin`.** The contest is `'server'` by `contest.server-only`; the
 *   refused claim is an ordinary client event and is normally `'web'`,
 *   `'mobile'` or `'desktop'`. Binding them would refuse every real contest.
 * - **`clientTime`.** The claimant's clock; the contest is filed later, by a
 *   different party. `renderContestedClaimText` prints the CLAIM's time on
 *   purpose.
 * - **`type` / `version` / `id`.** A contest is `claim.contested`; the refused
 *   claim is whatever it was.
 * - **Existence of `originalEvent.id` in `events`.** This is the one a reader
 *   reaches for and it is exactly backwards: **a refused claim is never
 *   appended — that is what refusal means** — so the row it would look for does
 *   not exist, and requiring it would refuse every honest contest.
 *
 * ## What this check CANNOT establish, recorded rather than implied
 *
 * That the embedded claim was **actually refused**, and that the named `rule`
 * is the rule that refused it. Nothing observable at this layer distinguishes a
 * true record of a refusal from a plausible fabrication about the right ticket.
 * Only the server's own construction path guarantees it — which is what
 * `buildContestedClaim` below is for. **Owner: Plan 10 Task 7** (`POST /v1/sync`),
 * the one caller that will hold a real refusal in hand when it files a contest.
 *
 * ## Why it is PURE — no database read
 *
 * A check that reads a row can go stale, can be defeated by a missing row, and
 * cannot be exercised without Postgres. Every fact this needs is inside the
 * event.
 */

/**
 * One rule id for the whole coherence family, with a distinct sentence per
 * comparison. Deliberately NOT a member of the rule-engine's `CONTEST_RULES`:
 * this is a SERVER-SIDE door refusal in the shape of `entity-workspace-mismatch`
 * (`packages/domain/src/ingest-result.ts`), not a shared engine rule, and the
 * shared engine is where a rule id has to mean the same thing on a replica.
 *
 * A distinct id rather than borrowing `permission.role`: ruling P13 — a refusal
 * id is correct for the subject it was written about, and this subject is
 * neither a permission nor a role.
 */
export const CONTEST_COHERENCE_RULE = 'contest.incoherent-original';

/**
 * Three sentences, one per comparison, and they are deliberately different
 * strings. Ruling P20: when two refusals share an identifier, asserting the
 * identifier is not a discriminating check — so deleting the workspace
 * comparison must redden a different test than deleting the ticket comparison,
 * and only the reasons can carry that.
 */
export const CONTEST_WORKSPACE_MISMATCH_REASON =
  'The refused claim inside this contest names a different workspace than the contest itself.';
export const CONTEST_ENTITY_KIND_MISMATCH_REASON =
  'The refused claim inside this contest is about a different kind of entity than the contest itself.';
export const CONTEST_TICKET_MISMATCH_REASON =
  'The refused claim inside this contest names a different ticket than the contest is filed on.';

function refuse(reason: string): Refusal {
  return { refused: true, rule: CONTEST_COHERENCE_RULE, reason };
}

/**
 * Answers the coherence question for one event, or `null` when it has no
 * coherence question to answer.
 *
 * `null` means one of three things and the caller cannot tell them apart,
 * because for the caller they are the same answer — *this check found no fault*:
 * the event is not a `claim.contested`; its payload is not shaped like one; or
 * the embedded claim agrees with the envelope on all three bindings.
 *
 * The second of those is the one worth stating. Payload SHAPE is the vocabulary
 * door's refusal, not this one's: `parseEvent` has already parsed the payload
 * against `claimContestedPayloadSchema` by the time ingest calls this, so a
 * `safeParse` failure here is unreachable through the ingest path. It answers
 * `null` rather than throwing because a throw inside `commitOne` becomes an
 * opaque 500 and would replace a truthful `malformed-payload` answer with one.
 */
export function checkContestCoherence(env: EventEnvelope | SubmittedEvent): Refusal | null {
  if (env.type !== 'claim.contested') {
    return null;
  }
  const parsed = claimContestedPayloadSchema.safeParse(env.payload);
  if (!parsed.success) {
    return null;
  }
  const original = parsed.data.originalEvent;
  if (original.workspaceId !== env.workspaceId) {
    return refuse(CONTEST_WORKSPACE_MISMATCH_REASON);
  }
  if (original.entity.kind !== env.entity.kind) {
    return refuse(CONTEST_ENTITY_KIND_MISMATCH_REASON);
  }
  if (original.entity.id !== env.entity.id) {
    return refuse(CONTEST_TICKET_MISMATCH_REASON);
  }
  return null;
}

/**
 * The server-side CONSTRUCTOR for contests, and the reason it exists is that it
 * makes the three bindings above STRUCTURAL rather than checked: `workspaceId`
 * and `entity` are read off the refused claim, so this function has no
 * parameter through which they could disagree. `checkContestCoherence` is the
 * door that catches a contest built any other way; this is the way that cannot
 * build an incoherent one.
 *
 * `origin: 'server'` because `contest.server-only` requires it — only the server
 * records the system's own account of a refusal — and this is the path that is
 * entitled to it. Callers append the result through the INTERNAL door
 * (`ingestBatch`); the client door refuses server-origin by design.
 *
 * `now` is injected rather than read, so a caller under test gets a fixed
 * instant and this function stays a pure function of its arguments.
 *
 * **Not yet called in production.** Plan 10 Task 7's `POST /v1/sync` is the
 * caller: it is the path that holds a real refusal when a synced-in claim is
 * refused, and it is the only place that can honestly answer the question this
 * module records as unanswerable — whether the embedded claim was actually
 * refused, by the rule the contest names.
 */
export function buildContestedClaim(args: {
  /** The claim that was refused. Its workspace and entity BECOME the contest's. */
  originalEvent: SubmittedEvent;
  /** The rule id that refused it. */
  rule: string;
  /** The refusal's plain-language sentence, as the claimant will read it. */
  reason: string;
  /** The server identity the contest is attributed to. */
  actorId: string;
  now?: () => Date;
}): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: args.originalEvent.workspaceId,
    entity: args.originalEvent.entity,
    type: 'claim.contested',
    payload: {
      originalEvent: args.originalEvent,
      rule: args.rule,
      reason: args.reason,
    },
    actorId: args.actorId,
    origin: 'server',
    ...(args.now === undefined ? {} : { now: args.now }),
  });
}

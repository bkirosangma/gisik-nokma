import type { ReachGrantedNote, ReachGrantedTicket } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { canReadNote, loadNoteForVisibility } from './can-read-note.js';
import { canSee } from './can-see.js';
import { listVisibleTickets } from './visible-tickets.js';

/**
 * Notice on newly GRANTED visibility — the half of closure 5 that gives back
 * the copy nobody gives back, rebuilt PULL-SHAPED under ruling P37.1
 * (2026-09-06; cases 6.104's mirror, 12.274, and the wedge at 12.290).
 *
 * ## The gap this closes, stated as the measurement that found it
 *
 * `visibleEventsFor` streams `workspace_seq > afterSeq` and filters against
 * visibility AS OF NOW. The cursor is the highest `workspace_seq` of an
 * envelope actually DELIVERED. So any visible commit landing while a ticket is
 * narrowed carries the client's cursor PAST the narrowing and past everything
 * filed on that ticket meanwhile, and re-widening later delivers only the
 * widening itself: the earlier rows sit below the cursor and nothing re-sends
 * them. Measured twice on the dual-client rig — insert ONE unrelated visible
 * commit between a narrow and a re-widen and client B ends holding 2 events
 * where the server holds 4, permanently, with no purge, no backfill and no
 * resync path (case 12.274).
 *
 * ## Closure 5 pushed the history. That WEDGED, and this module is the repair
 *
 * The first shape yielded the ticket's whole pre-cursor tail, and every one of
 * those envelopes is at or below `afterSeq` by construction, so **none of them
 * could move a cursor** — while the only one that could, the trigger, was
 * yielded LAST. `stream/hub.ts` closes a socket 1013 `slow-consumer` above
 * `maxBufferedBytes` and detaches; no `caught-up` is sent; the engine persists
 * its cursor only in `onCaughtUp`; `needsBootstrap` refuses to re-bootstrap
 * over a local baseline. A client cut short mid-burst reconnected at the same
 * cursor, was handed the identical burst, and was cut short again —
 * permanently and silently (case 12.290).
 *
 * **The obvious one-line repair is unsafe and a reader must not reach for it.**
 * Yielding the trigger FIRST would advance the cursor before the burst, and it
 * breaks `ticket.reparented`: that event IS folded, so a client which never
 * held the ticket replays a transition with no `ticket.created` and
 * `applyTicketEvent` throws — the engine's terminal stall, a worse failure than
 * the one it fixes. Measured before the option was proposed.
 *
 * ## So the direction inverted, into the narrow half's own shape
 *
 * **The server names the ids; the client fetches what it lacks.** This module
 * now yields a bounded `reach-granted` NOTICE — ticket ids and nothing else —
 * and the client pulls each ticket it does not hold through
 * `GET /v1/sync/bootstrap/ticket` before applying the trigger. That is exactly
 * `POST /v1/sync/reconcile`'s inversion, one direction over.
 *
 * What it buys, each measured rather than argued:
 *
 * - **No wedge.** A list of ids is a list of ids however long the histories
 *   behind it are, so the burst that tripped the slow-consumer bound is gone.
 *   A session cut short mid-PULL resumes by pulling what it still lacks, from a
 *   durable pending set on the device — no per-subscriber state on the server,
 *   which is the thing `visibleEventsFor` deliberately does not have.
 * - **The amplifier is bounded by HOLDINGS rather than by trust.**
 *   `check-permission.ts` does not refuse a `visibility.set` that sets the mode
 *   a ticket already has, so a member could re-issue one per commit and make
 *   the server re-walk and re-stream a whole subtree to every subscriber. Now a
 *   client that already holds the subtree does no work for it at all: the
 *   notice names ids, the client finds it holds them, and nothing is fetched.
 * - **The refold hazard closes** as *bootstrap-before-apply on any event for an
 *   entity not held* — which is the rule a replica needs for `ReplicaGapError`
 *   anyway, rather than a special case for this module.
 *
 * ## ⚠️ THE GRANT HALF DOES NOT CLOSE 12.274 ON ITS OWN, and the reason is subtle
 *
 * The client's filter is *"do I hold this ticket"* (`applyInstruction`'s
 * `reach-granted` arm asks `getTicket(id) === null`). **A device can hold a
 * STALE PARTIAL copy**, because a narrowing purges nothing — the per-event walk
 * was struck on 6.101 and the residual is 6.104, both deliberate. So in 12.274's
 * own script the re-widening's notice names a ticket the client "holds", nothing
 * is fetched, and the divergence survives wearing this fix's clothes.
 *
 * **What actually closes it is BOTH halves of closure 5, in the order
 * `onCaughtUp` runs them:** `reconcile` purges the stale copy first, and only
 * then does a notice find a ticket the device does not hold. The narrow half is
 * not an independent feature that happens to ship alongside this one; it is a
 * precondition of this one converging.
 *
 * **CLOSED, by closure 5c's minimal form, and the first account of this was
 * WRONG in a way worth keeping.** It said the residual was "bounded in time" by
 * `RECONCILE_MIN_INTERVAL_MS`. It was not: `hub.ts` sends `caught-up` once per
 * SUBSCRIPTION (`caughtUpSent`), so the automatic reconcile is once per
 * RECONNECT — and a narrow-and-re-widen with no reconnect between them never
 * reconciles at all. On a stable socket the "bounded" residual was the FULL
 * defect. The branch review found it; the sentence that was wrong is kept here
 * rather than deleted, because "bounded in time" is exactly the kind of
 * reassurance a later reader would have taken on trust.
 *
 * What closes it: the client's `reach-granted` handler reconciles the ids the
 * notice NAMED before deciding what to pull, and re-owes anything that purged.
 * The schedule and the reconnect latch are then irrelevant for exactly the
 * tickets a notice names, which are exactly the tickets at risk.
 *
 * **THE CANDIDATE CLOSE, ruled by the controller 2026-09-06 and deliberately NOT
 * built here — "closure 5c: reconcile-on-notice", OWNER: Lane F.** A grant
 * notice naming a ticket the client already holds triggers a reconcile of THAT
 * ID before the pull decision, which makes `RECONCILE_MIN_INTERVAL_MS`
 * irrelevant for exactly the tickets a notice names — the stale copy is purged
 * on the spot and the pull then finds a ticket not held. Written down so nobody
 * re-derives it, and NOT taken into this change set.
 *
 * **The other obvious repairs are worse and are named so nobody spends the round.**
 * Dropping the holdings filter — pull every id a notice names — closes this and
 * reopens the amplifier the filter exists to bound, because
 * `check-permission.ts` does not refuse a `visibility.set` that sets the mode a
 * ticket already has. Moving the filter from record-time to drain-time does not
 * help either: the drain that matters runs inside `applyOne`, ahead of the
 * trigger, which is where it must be for the refold hazard, and that is before
 * any reconcile in the same catch-up.
 *
 * ## This is NOT case 6.101's purge walk arriving from the other side
 *
 * The server enumerating ids to a client inverts `reconcile-route.ts`'s safety
 * argument, so the distinction is stated rather than left to be re-derived. A
 * purge names an entity to a device that may never have held it: the recipient
 * learns a ticket exists and is now hidden, which is news, and that is what
 * struck the per-event walk. A notice names ids the recipient may at that
 * moment READ IN FULL, and would read in full a moment later by asking. It
 * discloses nothing, because the entitlement is the premise.
 *
 * ## The trigger is the EVENT, never a reconstructed prior audience
 *
 * This module never asks "who could see this before". It cannot: `proj_visibility`
 * keeps no history and neither payload carries a before-image, and re-deriving
 * the pre-event audience here would be a second definition of visibility that
 * can disagree with the table every other door reads — the ban cases 6.82 and
 * 6.94 already recorded, and the reason the per-event PURGE walk was struck
 * (6.101). So the trigger is the arrival of a visibility-changing event on a
 * ticket the reader may see NOW, and nothing finer.
 *
 * That is deliberately coarse in one direction and exact in the other:
 *
 * - **It over-names.** A reader who already holds the ticket is named it again.
 *   Free now, where under the push shape it cost the whole history: the client
 *   drops ids it holds without asking the server anything.
 * - **It never under-selects towards a leak, because narrowings never fire it.**
 *   A narrowing `visibility.set` is invisible to the viewer who just lost the
 *   ticket — `visibleEventsFor`'s `canSee` refuses to yield it — so it is never
 *   a trigger for that viewer, and the only readers who reach this module for a
 *   given event are readers `canSee` admits now. A widening self-selects; a
 *   narrowing self-excludes. No before-image is needed to tell them apart, and
 *   that is the whole reason this shape is legal under 6.82/6.94.
 */

export const GRANT_BACKFILL_TRIGGERS = ['visibility.set', 'ticket.reparented'] as const;

/**
 * The most tickets one trigger will name in one notice.
 *
 * **What this constant bounds CHANGED when the shape did, and the number
 * staying the same is the reason to say so loudly.** Under the push shape it
 * bounded the WALK and, because the walk's output was streamed history, it
 * bounded the wire — badly, since one ticket with a long history is one ticket
 * whatever its event count. Under the notice shape the wire is a list of ids
 * and 200 of them is nothing. So the constant now bounds two different things,
 * neither of which is bytes:
 *
 * 1. **The walk itself** — one `proj_visibility` query per candidate. Unchanged
 *    by the reshape, and the reason a cap was wanted in the first place.
 * 2. **The CLIENT's fan-out** — up to one `GET /v1/sync/bootstrap/ticket` per
 *    id named. This cost site did not exist when P37.1 chose the number, and it
 *    is now the expensive half. 200 sequential pulls is a long catch-up.
 *
 * *That the same 200 is right for a cost dimension it was not chosen for is
 * NOT established, and is recorded rather than asserted. Owner: unassigned.*
 *
 * **Truncation is still silent, and now it is silent by CHOICE rather than for
 * want of anywhere to put a notice.** The previous wording here said there was
 * nowhere honest to announce a clipped backfill — that inventing a wire member
 * "would be a protocol nobody agreed and a fourth `SyncItem` arm". P37.1 agreed
 * exactly that protocol, the arm exists, and a `truncated: true` beside
 * `ticketIds` would now be cheap. It is not added because nothing would read
 * it: a client told its notice was clipped has no door to ask for the rest
 * through, and inventing one is a resume protocol, not a flag. What a truncated
 * client loses is history it did not have a moment ago — the pre-P37 behaviour
 * — so it is left where the next widening or a full resync corrects it.
 * *Owner: unassigned; it becomes worth adding the day a client can act on it.*
 * Case 12.291 pins the cap; case 12.290 owns the wedge it was an interim guard
 * against, and that wedge is closed by the reshape rather than by this number.
 */
export const GRANT_BACKFILL_MAX_TICKETS = 200;

export function isGrantBackfillTrigger(type: string): boolean {
  const triggers: readonly string[] = GRANT_BACKFILL_TRIGGERS;
  return triggers.includes(type);
}

/**
 * The note events that can WIDEN which reader may read a note — Plan 2 of 6,
 * the note half of `GRANT_BACKFILL_TRIGGERS` above, read by
 * `visible-events-for.ts`'s `note` branch and by nothing here.
 *
 * ## Every member, and the direction it can move
 *
 * - `note.scope_set` — the direct width change. The one the notice exists for:
 *   it is how `private` becomes `workspace`, which is the transition a reader
 *   cannot learn about any other way (the event that would tell them is itself
 *   invisible to them, which is `GRANT_BACKFILL_TRIGGERS`' docblock's whole
 *   asymmetry — a widening self-selects, a narrowing self-excludes).
 * - `note.attached` — an `inherit` note gains a door. It cannot narrow:
 *   `canReadNote`'s `inherit` arm admits on ANY attached visible ticket, so
 *   adding one is monotone.
 * - `note.created` — a note born already-wide. It is above every live cursor at
 *   the instant it is created, so a SUBSCRIBED device gets the event on the
 *   ordinary stream and needs no notice; a device whose cursor has since run
 *   past it (it was offline, then caught up on other traffic) does not.
 * - `note.restored` — the undo. A note deleted while a reader could not read it
 *   and then restored is the same shape as `note.created`: visible now, and
 *   possibly below a cursor that moved in between.
 *
 * ## Why `note.created` and `note.restored` are named rather than omitted
 *
 * The case for omitting them is real — a trigger whose own event is above every
 * live cursor asks the client to pull what the stream is about to hand it
 * anyway, which is the amplifier `GRANT_BACKFILL_TRIGGERS`' docblock bounds.
 * They are kept because the consumer of a notice guards cheaply and exactly:
 * the client queues a pull only when its local head for that note is BELOW
 * `headSeq`, and `headSeq` is bounded at the reader's cursor (`withHeadSeq`
 * below) — so a device already current on the note compares equal and fetches
 * nothing. Over-naming is the cheap direction here, as it is above.
 *
 * ## Not `note.detached`, and the asymmetry is the module's own law
 *
 * A detach can NARROW: the last attachment removed from an `inherit` note
 * reverts it to its remembered scope. A narrowing must never reach this module
 * — it cannot ask "who could see this before" and may not reconstruct it (the
 * ban cases 6.82 and 6.94, restated at `GRANT_BACKFILL_TRIGGERS`). Narrowing
 * reaches a device through `POST /v1/sync/reconcile` instead, client-driven and
 * asking nothing about a before-image (ruling P23). `note.deleted` is the same
 * answer for a different reason: it is not a readership change at all
 * (`canReadNote` ignores `deleted`), so it neither widens nor narrows.
 */
export const NOTE_GRANT_TRIGGERS = [
  'note.created',
  'note.scope_set',
  'note.attached',
  'note.restored',
] as const;

export function isNoteGrantTrigger(type: string): boolean {
  const triggers: readonly string[] = NOTE_GRANT_TRIGGERS;
  return triggers.includes(type);
}

/**
 * The tickets whose resolved audience depends on `ticketId`: itself, plus every
 * descendant that inherits, pruning at any child with an authored mode.
 *
 * **This is `reResolveSubtree`'s traversal, read-only.** That function
 * (`../projections/proj-visibility.ts`) restores the resolution invariant over
 * exactly this set when one of these same events lands, so "whose row did that
 * event change" and "whose audience must be backfilled" are the same question,
 * and asking it the same way is what keeps the two answers from drifting. The
 * prune is the same prune and for the same reason: an authored subtree resolves
 * from its own claim, so nothing above it can change what it sees.
 *
 * It is a read of `proj_visibility`'s own `parent_id` / `own_mode` columns — the
 * projection's structure — and NOT a re-derivation of the visibility RULE. The
 * audience question is still asked once per candidate, of `canSee`, and of
 * nothing else. That is the line 6.82 and 6.94 draw, and this stays the legal
 * side of it.
 *
 * **Neither this walk nor `reResolveSubtree`'s carries a WORKSPACE predicate**, and that is inherited
 * rather than introduced — `proj-visibility.ts`'s own children query is
 * `WHERE parent_id = $1` with no workspace clause either. Adding one HERE would
 * be the drift this function exists to avoid: two answers to "whose row did that
 * event change", from two queries that no longer match. It is not a disclosure
 * in any case, because the audience question is still asked once per candidate
 * of `canSee`, which resolves each ticket's OWN workspace
 * (`can-see.ts`: `getResolvedVisibility` then `resolveEffectiveRole(v.workspaceId)`)
 * — so a foreign-workspace candidate is admitted only to someone who may see it
 * there. What it could do, IF a cross-workspace `parent_id` is reachable at all
 * (not established here), is put a foreign ticket's id in a notice tagged with
 * THIS workspace. *Recorded, not fixed, and not closure 5b's to fix: the fix
 * belongs wherever a cross-workspace parent is either refused or declared legal.
 * Owner: unassigned.*
 *
 * `visited` guards a `parent_id` cycle, exactly as `reResolveSubtree`'s does and
 * for the reason case 6.58 records: nothing on this branch refuses a
 * cycle-creating reparent, so a walk that assumed acyclicity would hang the
 * drain rather than serve a wrong answer. Termination is all it provides.
 *
 * A ticket with no `proj_visibility` row yields ITSELF ALONE, not the empty set:
 * the seed is pushed before any query runs, and only the children lookup can
 * shorten the walk. `grantBackfillFor`'s own `canSee` then refuses it — a
 * rowless ticket answers false there (`can-see.ts`: "unknown and invisible are
 * the same answer") — so nothing is yielded for it either way. *This sentence
 * said "the empty set … so this only saves the work" until the branch review
 * measured it; both halves were false, and the second would have been a
 * plausible reason for a later reader to drop the `canSee` below as redundant.*
 */
async function audienceDependents(db: Queryable, ticketId: string): Promise<string[]> {
  const visited = new Set<string>();
  const out: string[] = [];
  const frontier: string[] = [ticketId];
  // `out.length < GRANT_BACKFILL_MAX_TICKETS` is ruling P37.1's interim guard.
  // Breadth-first, so what survives the cap is the trigger ticket and the
  // shallowest descendants — the ones a viewer is most likely to be looking at
  // — rather than an arbitrary slice. The trigger ticket itself is always
  // reached: it is the seed, and the cap is checked before the pop.
  while (frontier.length > 0 && out.length < GRANT_BACKFILL_MAX_TICKETS) {
    const current = frontier.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    out.push(current);
    const children = await db.query<{ ticket_id: string }>(
      `SELECT ticket_id FROM proj_visibility
       WHERE parent_id = $1 AND own_mode = 'inherit' ORDER BY ticket_id`,
      [current],
    );
    for (const child of children.rows) frontier.push(child.ticket_id);
  }
  return out;
}

/**
 * The ids this reader may now read because `ticketId`'s audience just changed —
 * the payload of one `reach-granted` notice.
 *
 * Returns ids only. No history is read, and `readEntityEvents` is no longer
 * imported by this module at all: the client fetches each ticket it lacks
 * through `GET /v1/sync/bootstrap/ticket`, which is what removed the wedge.
 *
 * `backfilled` is the caller's per-drain ledger of tickets already named. Two
 * triggers on one ticket in one range, or a trigger on a ticket already covered
 * by an ancestor's subtree walk, name it once.
 *
 * ## The `canSee` on every candidate is NOT redundant with the caller's
 *
 * The caller checked `canSee` for the TRIGGER ticket alone. Every other ticket
 * this function reaches arrives through `audienceDependents`, which the caller
 * never asked about — a descendant may be inside the new audience or outside it
 * (it may have an authored explicit list of its own further down, or the reader
 * may be a guest whom the widening did not name), and this call is the only
 * thing that decides. It is also the only thing standing between a subtree walk
 * and a notice that names ids the reader may not see, which under the notice
 * shape is the ONE way this module could disclose something: the ids ARE the
 * payload now. Mutating it to permit must redden the excluding case on its own;
 * the trigger list carries the other half.
 */
export async function grantNoticeFor(
  db: Queryable,
  userId: string,
  ticketId: string,
  afterSeq: number,
  backfilled: Set<string>,
): Promise<ReachGrantedTicket[]> {
  const admitted: string[] = [];
  for (const candidate of await audienceDependents(db, ticketId)) {
    if (backfilled.has(candidate)) continue;
    backfilled.add(candidate);
    // THE SECOND MUTABLE SITE. See the docblock: load-bearing for descendants,
    // redundant only for the trigger ticket itself — and now load-bearing for
    // disclosure too, because what it filters is what goes on the wire.
    if (!(await canSee(db, userId, candidate))) continue;
    admitted.push(candidate);
  }
  return withHeadSeq(db, admitted, afterSeq);
}

/**
 * The `inherit`-scoped notes attached to any of these tickets — the candidates
 * a ticket-audience change can widen, before any per-reader question is asked
 * (spec §5.2).
 *
 * ## Why the filter is `scope_mode = 'inherit'` and nothing else
 *
 * Only an `inherit` note's readership depends on a ticket. A `workspace`,
 * `project` or `explicit` note attached to the same ticket is readable or not
 * for reasons the ticket has no part in, so a ticket-wide event is not news
 * about it and announcing it would be a notice the client could not act on.
 * `private` is excluded by the same clause for the stronger reason: nothing
 * about a private note's audience involves a ticket at all.
 *
 * ## `deleted = FALSE`, and it is a DELIVERY decision rather than a read rule
 *
 * `canReadNote` deliberately ignores `deleted` — a deleted note is in the undo
 * window and still readable — so this clause is NOT a restatement of that
 * function and does not belong beside it. It is here because the cascade
 * announces *"this is now readable, pull it"*, and a device that pulls a
 * deleted note's history learns nothing it can show anybody. The deleted note
 * is not stranded: its own `note.deleted` arrives on the ordinary stream to
 * every reader who already held it, and `note.restored` is in
 * `NOTE_GRANT_TRIGGERS`, so a restore re-announces it from the note's side.
 * *Case 18.097 is the two-device witness.*
 *
 * ## No workspace predicate, inherited rather than chosen
 *
 * The same inheritance `audienceDependents`' docblock records: the caller's
 * ticket ids come from a walk that has none, so adding one here would make this
 * query and that walk disagree about the candidate set. It is not a disclosure
 * on its own — what these ids become is a `noteGrantNoticeFor` call filtered by
 * `canReadNote`, and a note in another workspace is admitted only to somebody
 * who may read it there.
 */
export async function notesAttachedTo(
  db: Queryable,
  ticketIds: readonly string[],
): Promise<string[]> {
  if (ticketIds.length === 0) return [];
  const { rows } = await db.query<{ note_id: string }>(
    `SELECT DISTINCT na.note_id
       FROM proj_note_attachments na
       JOIN proj_notes n ON n.note_id = na.note_id
      WHERE na.ticket_id = ANY($1::text[])
        AND n.scope_mode = 'inherit'
        AND n.deleted = FALSE
      ORDER BY 1`,
    [[...ticketIds]],
  );
  return rows.map((r) => r.note_id);
}

/**
 * The note ids this reader may now read because their own reach, or the reach
 * of a ticket they inherit from, just changed — the notes arm of one
 * `reach-granted` notice (Plan 2 of 6, spec §5.1–§5.2).
 *
 * The same shape as `grantNoticeFor` above, one entity kind over, and the two
 * differ in exactly one substantive way: a ticket's audience is walked
 * (`audienceDependents`), while a note's is a function of its own scope and its
 * attached tickets, so the caller decides which note ids are candidates and
 * this function only decides which of them the reader may read.
 *
 * ## The `canReadNote` on every candidate is the disclosure gate
 *
 * Same argument as `grantNoticeFor`'s, and here it is the whole of it: under
 * the notice shape the IDS ARE THE PAYLOAD, so a candidate admitted without
 * this call is an id the reader may not see, disclosed. It is also what makes
 * the caller's candidate list safe to over-produce — Task 2 hands over every
 * `inherit` note attached to a ticket whose audience changed, and many of them
 * are notes this particular reader still cannot read.
 *
 * ## `eff` is resolved per NOTE, cached per workspace — not once for the call
 *
 * The plan text resolved it once from `noteIds[0]`'s workspace, with the stated
 * assumption that every id in one call is one workspace's. That assumption is
 * not held anywhere: Task 2's candidate list comes from `notesAttachedTo`, and
 * `audienceDependents`' own docblock records (unfixed, owner unassigned) that
 * its walk carries no workspace predicate at all. A role resolved against the
 * WRONG workspace is not a degraded answer, it is a different function — a
 * member of workspace A would be admitted to workspace B's note by holding a
 * role in A.
 *
 * The cache keeps the cost the same as the plan's single resolution in the
 * ordinary case (one workspace, one lookup) and removes the extra
 * `getNoteStateFromDb` read the plan's form needed to find the workspace at
 * all: the note is loaded here regardless, and it names its own workspace.
 */
export async function noteGrantNoticeFor(
  db: Queryable,
  userId: string,
  noteIds: readonly string[],
  afterSeq: number,
  backfilled: Set<string>,
): Promise<ReachGrantedNote[]> {
  const admitted: string[] = [];
  const effs = new Map<string, Awaited<ReturnType<typeof resolveEffectiveRole>>>();
  for (const id of noteIds) {
    // Namespaced, because this set is shared with the ticket walk above in both
    // callers: a ticket id and a note id are both ULIDs and a bare id would let
    // one kind's delivery suppress the other's.
    const key = `note:${id}`;
    if (backfilled.has(key)) continue;
    // Marked BEFORE the readability question, so a note this reader cannot read
    // is not re-loaded by every later trigger in the same drain.
    backfilled.add(key);
    const loaded = await loadNoteForVisibility(db, id);
    if (loaded === null) continue;
    let eff = effs.get(loaded.note.workspaceId);
    if (eff === undefined) {
      eff = await resolveEffectiveRole(db, userId, loaded.note.workspaceId);
      effs.set(loaded.note.workspaceId, eff);
    }
    if (!canReadNote(eff, userId, loaded.note, loaded.attachedVisibilities)) continue;
    admitted.push(id);
  }
  return withNoteHeadSeq(db, admitted, afterSeq);
}

/**
 * Attach each entity's head position — ruling P37.2.
 *
 * `entityKind` is a parameter rather than a second copy of the query (Plan 2 of
 * 6 added notes). `entity_kind` is the ONLY thing that differs between the two
 * arms, and a copy is what comes to disagree the day one of them grows a clause
 * the other does not — which is the failure mode this module's sibling
 * (`can-read-note.ts`) already has an equality case against.
 *
 * **An ID-ONLY notice was MEASURED not to work**, which is why this exists. The
 * client cannot tell a complete local copy from a STALE PARTIAL one by asking
 * whether it holds the ticket, and it cannot ask the server either: a notice
 * only ever names ids the viewer can see NOW, and `reconcile` only ever answers
 * about ids they CANNOT — complementary predicates over the same `canSee`, so
 * their intersection is empty by construction. Staleness here is about CONTENT
 * and `canSee` answers about AUDIENCE, so reconcile was the wrong instrument
 * rather than a mistimed one. Case 12.316 carries the measurement.
 *
 * **READ, never computed, and never a neighbour's.** `MAX(workspace_seq)` over
 * the entity's own events is the ledger's own number for "the last thing that
 * happened to this entity". Ruling P36 refused a synthesised instant one surface
 * over for exactly this reason: a number the server derives rather than reads is
 * one that can disagree with the ledger, and it would pass a gate.
 *
 * **BOUNDED AT `afterSeq`, and that bound is the whole correctness of the
 * comparison.** The notice answers "how much of this entity's history will you
 * NOT receive by simply staying subscribed" — which is the part at or below the
 * reader's cursor. Everything above it, the trigger event included, is already
 * in the caller's own range and arrives moments later on the stream.
 *
 * Taking the entity's absolute head instead is WRONG and was measured wrong:
 * the notice is yielded BEFORE its trigger, so the trigger's own row is always
 * above the client's local maximum at the instant it compares — making
 * `localHead < headSeq` true for every trigger entity, forever, and pulling on
 * every no-op `visibility.set`. That is precisely the amplifier bound ruling
 * P37.1 exists to hold, and case 12.276 caught it.
 *
 * ONE query for the whole notice, not one per candidate. On the ticket side the
 * walk above already costs a query each and doubling that for something a single
 * `GROUP BY` answers would be real cost for no property; on the note side the
 * caller has no walk at all and this is the only read the notice costs.
 *
 * `?? 0` is kept rather than asserted away: zero makes the client PULL, which is
 * the safe direction, where a throw would take down the whole drain. On the
 * ticket side a rowless candidate cannot reach here (`canSee` refuses a ticket
 * with no `proj_visibility` row, and every candidate has passed it); on the note
 * side nothing like that is true — a note whose every event is above the cursor
 * is an ordinary case, and this is the line that drops it rather than naming it
 * with a zero the published schema would refuse.
 */
async function withHeadSeq(
  db: Queryable,
  entityIds: readonly string[],
  afterSeq: number,
  entityKind: 'ticket' | 'note' = 'ticket',
): Promise<Array<{ id: string; headSeq: number }>> {
  if (entityIds.length === 0) return [];
  const { rows } = await db.query<{ entity_id: string; head: string }>(
    `SELECT entity_id, MAX(workspace_seq) AS head FROM events
      WHERE entity_kind = $3 AND entity_id = ANY($1::text[]) AND workspace_seq <= $2
      GROUP BY entity_id`,
    [[...entityIds], afterSeq, entityKind],
  );
  const heads = new Map(rows.map((r) => [r.entity_id, Number(r.head)]));
  // An entity with NOTHING at or below the cursor is DROPPED, not named with a
  // zero — and the reason is semantic before it is schematic. Such a ticket has
  // no pre-cursor history to be missing: every one of its events is above the
  // reader's cursor and arrives on the stream unaided, so naming it would ask
  // for a pull that could only re-fetch what is already on its way.
  //
  // The published schema also refuses `headSeq: 0` (`min(1)`), and an earlier
  // draft of this function emitted one. It did not surface as a bad frame: the
  // drain THREW, the hub closed 1011, and the symptom was a MISSING `caught-up`
  // three assertions away in `client-contract.test.ts`. Recorded because that
  // is what a schema violation looks like from the outside here — not a
  // rejected frame, a silent stream.
  return entityIds
    .map((id) => ({ id, headSeq: heads.get(id) ?? 0 }))
    .filter((t) => t.headSeq > 0);
}

/** `withHeadSeq` over notes. The kind is a parameter rather than a second copy
 * of the query: two copies is what comes to disagree the day one grows a clause
 * the other does not, and `entity_kind` is the ONLY difference between them. */
async function withNoteHeadSeq(
  db: Queryable,
  noteIds: readonly string[],
  afterSeq: number,
): Promise<ReachGrantedNote[]> {
  return withHeadSeq(db, noteIds, afterSeq, 'note');
}

/**
 * The ids one reader may now see because THEIR OWN reach grew — case 12.283,
 * the third shape of grant, and the one `GRANT_BACKFILL_TRIGGERS` structurally
 * cannot carry.
 *
 * ## Why it could not just be another trigger type
 *
 * `membership.granted` and `project.member_added` are ROSTER events, filed
 * against the roster entity, not against a ticket. `grantNoticeFor` above starts
 * from a ticket and walks its inheriting subtree; there is no ticket here to
 * start from. The widening is on the READER's side of `canSee`, so the question
 * inverts with it: not "who can now see this ticket" but "which tickets can this
 * viewer now see".
 *
 * Every ticket such an event reveals carries the identical pre-cursor gap — the
 * client's cursor has already passed the history of tickets it could not see —
 * so it is the same defect and it gets the same repair.
 *
 * ## Scoped to the event, and over-naming rather than guessing
 *
 * `project.member_added` scopes to the project it names; `membership.granted`
 * cannot scope at all and names the workspace. Both then ask
 * `listVisibleTickets` — the SAME predicate every read endpoint uses
 * (`read/visible-where.ts`), not a second definition of visibility, which is the
 * line 6.82 and 6.94 draw and the reason this function does no filtering of its
 * own beyond the project scope.
 *
 * It answers "what can they see NOW", not "what did they gain", because there is
 * no before-image to subtract and inventing one here would be exactly the second
 * definition of visibility that is banned. So it OVER-NAMES, deliberately, and
 * over-naming is affordable in a way it was not under the push shape: the client
 * drops every id it already holds without asking the server anything. A member
 * added to a project they were already effectively reading pulls nothing.
 *
 * **The narrowing counterpart already exists and is not touched**:
 * `membership.revoked` and `project.member_removed` yield itemised purges or a
 * `scope-revoked` from `visible-events-for.ts`'s roster arm. This is that arm's
 * missing half, and the asymmetry — narrowings itemised there, widenings named
 * here — is why the two live in different files rather than one.
 *
 * ## The cap matters MORE here than it does above
 *
 * A subtree walk is bounded by a subtree. A workspace-wide `membership.granted`
 * is bounded by the workspace, which is the largest set this module can produce
 * — and it is also the case where the client is most likely to hold none of it
 * and pull all of it. `GRANT_BACKFILL_MAX_TICKETS` applies unchanged and is felt
 * here as a real limit rather than a formality. Truncation stays silent for the
 * same reason as above, and the residual is the same one: what a truncated
 * client does not get is history it did not have a moment ago.
 *
 * *A first-ever `membership.granted` needs none of this — a device with no
 * cursor bootstraps the whole workspace through `/v1/sync/bootstrap` and this
 * notice would be redundant with it. What this closes is the RE-grant and the
 * role change: a guest promoted to member, a member re-granted after a
 * revocation, someone added to a project on a device that has been syncing all
 * along. Stated because "membership.granted" reads like the first-run case and
 * is not the one that was broken.*
 */
export async function readerReachNoticeFor(
  db: Queryable,
  userId: string,
  workspaceId: string,
  scope: 'workspace' | { projectId: string },
  afterSeq: number,
): Promise<ReachGrantedTicket[]> {
  const rows = await listVisibleTickets(db, userId, workspaceId);
  const inScope =
    scope === 'workspace' ? rows : rows.filter((row) => row['project_id'] === scope.projectId);
  return withHeadSeq(
    db,
    inScope
      .map((row) => row['ticket_id'])
      .filter((id): id is string => typeof id === 'string')
      .slice(0, GRANT_BACKFILL_MAX_TICKETS),
    afterSeq,
  );
}

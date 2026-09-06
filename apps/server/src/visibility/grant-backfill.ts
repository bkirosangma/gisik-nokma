import type { Queryable } from '../db/queryable.js';
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
  backfilled: Set<string>,
): Promise<string[]> {
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
  return admitted;
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
): Promise<string[]> {
  const rows = await listVisibleTickets(db, userId, workspaceId);
  const inScope =
    scope === 'workspace' ? rows : rows.filter((row) => row['project_id'] === scope.projectId);
  return inScope
    .map((row) => row['ticket_id'])
    .filter((id): id is string => typeof id === 'string')
    .slice(0, GRANT_BACKFILL_MAX_TICKETS);
}

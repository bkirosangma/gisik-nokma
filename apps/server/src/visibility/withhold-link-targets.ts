import {
  isFlowCause,
  isTicketLinkEvent,
  linkPayloadDirection,
  withheldLinkPayload,
  withholdCauseTicket,
  type TicketLinkKind,
  type TicketState,
  type WithheldFlowCause,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { LINK_TARGET_NOT_VISIBLE_REASON, PERMISSION_VISIBILITY_RULE } from '../permissions/check-permission.js';
import { canOpen } from './can-open.js';

/**
 * Spec A §2.4 on the doors that serve STORED claims (typed-links T4b): a link's
 * other end is withheld from a viewer who cannot see it. ONE predicate,
 * `canOpen`: `canSee`, or the viewer's own openable draft (drafts T6, R41: the
 * author is shown a link to their own draft in full; `canSee` alone is false
 * for every draft, the author's too). It answers a never-minted, a purged, a
 * hidden id and another person's draft the same (`can-see.ts`, "Unknown and
 * invisible are the same answer"), so the withheld copy cannot tell them apart.
 * A draft-side entry or event (drafts R42) names its OTHER end in `from`; its
 * `targetId` is the draft whose stream holds it. Withheld, such an event keeps its
 * `from` key and loses the id, `{kind, targetId: null, from: null}`, so History, the
 * replica and MCP still read it in (`linkPayloadDirection`; drafts T6 FIX 1, planner ruling 2026-10-04 21:08); a plain
 * link keeps `{kind, targetId: null}`. A `leads_to` label is kept on a plain link, where it is the visible source's branch
 * (workflow-timeline-graphs LK-6, planner ruling 2026-10-04 13:01), and dropped on a from entry, where the hidden end IS
 * the source (planner ruling 2026-10-05 00:13). `withheldLinkPayload` alone decides it: this passes `p.label` on both
 * arms. `parentId` is NOT withheld, and the difference
 * is the read door's: the detail read serves a restricted parent's id
 * (`parent: {kind:'restricted', id}`), and it withholds a link's.
 * See `visible-events-for.ts`, "What the filter does NOT hide".
 *
 * The doors: `GET …/tickets/:id/events` and the detail read
 * (`routes/tickets.ts`), the stream's ticket arm (`visible-events-for.ts`),
 * both bootstraps (`sync/sync-routes.ts`'s `bootstrapTicket`), History
 * (`routes/ticket-history.ts`) and `GET /v1/contests` (`sync/contests-route.ts`).
 * A served-withheld link event folds to nothing on the client
 * (`isWithheldLinkEvent` in the domain's `foldTicketEvent`).
 *
 * The same doors withhold a FLOW CAUSE's ticket and person (wtg-flow-cause-withhold,
 * planner rulings 2026-10-06 03:49): `withholdFlowCause` below, on the three
 * event types that carry one (`withholdEvent`) and on a folded close
 * (`withholdState`, the detail read and the snapshot). A served-withheld cause
 * still folds on the client: the domain's `applyTicketEvent` parses the served
 * shape (`isWithheldFlowCause`), and `notTakenOf` still reads it Not taken.
 *
 * ## Residuals, each with an owner
 *
 * - **Widening staleness** (owner ruling Q1 = (a), 2026-10-04). The replica
 *   dedupes by id and never rewrites a held event, and a held source is not
 *   re-pulled. So when a hidden target later becomes visible, the offline
 *   Links section lacks that link until the next full re-bootstrap. Online
 *   reads are correct. Owner: TL4c widening refresh (post-KG-release).
 * - **Narrowing.** A device keeps an id it already held when the target is
 *   later hidden. Not a disclosure: it was told when it could see it
 *   (the reconcile reasoning). Owner: none (accepted).
 * - **The claimant's own copies** keep the original cause: `my-work` and the
 *   stored contest notification are claimant-only, and the claimant passed
 *   `canSee(target)` at the gate. Owner: none (accepted). The same holds for a
 *   contested claim carrying a flow cause: only the flow actor may file one
 *   (`cause.forged`), so a person's refused copy holds only ids they typed, and
 *   `my-work` serves it to them whole (wtg-flow-cause-withhold census row 7).
 *   The stored notification carries no payload at all.
 */
export type TargetSight = (targetId: string) => Promise<boolean>;

/** `canOpen`, memoised for one request or one drain: a page or a range names the same target many times. */
export function targetSight(db: Queryable, viewerId: string): TargetSight {
  const memo = new Map<string, Promise<boolean>>();
  return (targetId) => {
    let answer = memo.get(targetId);
    if (answer === undefined) {
      answer = canOpen(db, viewerId, targetId);
      memo.set(targetId, answer);
    }
    return answer;
  };
}

/**
 * A flow cause as this viewer may be served it (wtg-flow-cause-withhold; spec FL-1). It names a ticket (`sourceTicketId`
 * for `led-to`, else `decisionTicketId`) and a person (`triggeredBy` / `decidedBy`); a viewer who cannot see that ticket
 * gets both NULLED with their keys kept, the kind, pass and the opaque decision event id kept, and the label or outcome
 * gone, its key absent: the hidden ticket's own branch name (`withholdCauseTicket`, T17 AMEND 2 and planner ruling
 * 2026-10-06 05:46: the shape MCP's `phrasedCause` reads as "a ticket you can't see" / "someone you
 * can't see"). The person goes with the ticket, never on their own: no person-sight rule exists, and a person's act on a
 * ticket the viewer can see is already theirs to read in that ticket's History (planner ruling 2026-10-06 03:49, Q3).
 * Anything that is not a flow cause (no cause, a person's `reopened-for-child`) comes back as the same reference, as does
 * a cause naming a ticket the viewer can see.
 */
export async function withholdFlowCause<C>(cause: C, sees: TargetSight): Promise<C | WithheldFlowCause> {
  if (!isFlowCause(cause)) return cause;
  return (await sees(cause.kind === 'led-to' ? cause.sourceTicketId : cause.decisionTicketId)) ? cause : withholdCauseTicket(cause);
}

const FLOW_CAUSE_EVENT_TYPES: readonly string[] = ['ticket.transitioned', 'ticket.closed', 'ticket.reopened'];

async function withheldOrSame(type: string, payload: unknown, sees: TargetSight): Promise<unknown> {
  if (payload === null || typeof payload !== 'object') return payload;
  if (FLOW_CAUSE_EVENT_TYPES.includes(type)) {
    const p = payload as { cause?: unknown };
    const cause = await withholdFlowCause(p.cause, sees);
    return cause === p.cause ? payload : { ...p, cause };
  }
  if (!isTicketLinkEvent(type)) return payload;
  const p = payload as { kind: TicketLinkKind; targetId?: unknown; from?: unknown; label?: string };
  const other = p.from ?? p.targetId;
  if (typeof other !== 'string' || (await sees(other))) return payload;
  return withheldLinkPayload(p.kind, linkPayloadDirection(payload), p.label);
}

/**
 * A contested LINK claim whose target this viewer cannot see: the embedded
 * payload is withheld AND the cause is the gate's own (owner ruling
 * 2026-10-04). A `link.duplicate`/`link.reverse` reason names the hidden
 * ticket's title, and `link.target-deleted` / `purge.erased` name its
 * state; the cause a never-minted target earns is `permission.visibility`
 * with this sentence. The claim itself is not cut: only its cause is
 * withheld, per viewer. Same reference back when nothing is withheld.
 */
export async function withholdContest<C extends { rule: string; reason: string; originalEvent: unknown }>(
  c: C,
  sees: TargetSight,
): Promise<C> {
  const o = c.originalEvent as { type?: unknown; payload?: unknown } | null;
  if (o === null || typeof o !== 'object' || typeof o.type !== 'string') return c;
  const payload = await withheldOrSame(o.type, o.payload, sees);
  if (payload === o.payload) return c;
  // A link's refusal names the hidden ticket, so its cause is the gate's own; a flow-cause claim's refusal
  // (`cause.forged`) names nothing, so it keeps its own rule and reason and only its ids are withheld.
  if (!isTicketLinkEvent(o.type)) return { ...c, originalEvent: { ...o, payload } };
  return { ...c, rule: PERMISSION_VISIBILITY_RULE, reason: LINK_TARGET_NOT_VISIBLE_REASON, originalEvent: { ...o, payload } };
}

/** One stored event as this viewer may be served it. Same reference back when nothing is withheld. */
export async function withholdEvent<E extends { type: string; payload: unknown }>(e: E, sees: TargetSight): Promise<E> {
  if (e.type === 'claim.contested') {
    const c = e.payload as { rule: string; reason: string; originalEvent: unknown };
    const out = await withholdContest(c, sees);
    // `claimContestedPayloadSchema`'s key order (`contest-events.ts`): originalEvent, rule, reason.
    return out === c ? e : { ...e, payload: { originalEvent: out.originalEvent, rule: out.rule, reason: out.reason } };
  }
  const payload = await withheldOrSame(e.type, e.payload, sees);
  return payload === e.payload ? e : { ...e, payload };
}

/**
 * A folded state as this viewer may be served it: `withholdLinks`, then the close's flow cause (`withholdFlowCause`), the
 * one state member that carries one. Every door that serves a `TicketState` calls this, not `withholdLinks` alone: the
 * detail read (`routes/tickets.ts`) and the bootstraps' snapshot (`sync/sync-routes.ts`). Same reference back when
 * nothing is withheld.
 */
export async function withholdState(state: TicketState, sees: TargetSight): Promise<TicketState> {
  const linked = await withholdLinks(state, sees);
  const closed = linked.closed ?? null;
  if (closed === null || closed.cause === undefined) return linked;
  const cause = await withholdFlowCause(closed.cause, sees);
  return cause === closed.cause ? linked : { ...linked, closed: { ...closed, cause } };
}

/** A folded state's links, visible other ends only; the key absent when none remain (T1's absent-not-empty rule). */
export async function withholdLinks(state: TicketState, sees: TargetSight): Promise<TicketState> {
  if (state.links === undefined) return state;
  const kept: NonNullable<TicketState['links']> = [];
  for (const l of state.links) if (await sees(l.from ?? l.targetId)) kept.push(l);
  if (kept.length === state.links.length) return state;
  const { links: _all, ...rest } = state;
  return kept.length > 0 ? { ...rest, links: kept } : rest;
}

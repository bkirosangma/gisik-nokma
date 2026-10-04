import { isTicketLinkEvent, linkPayloadDirection, withheldLinkPayload, type TicketLinkKind, type TicketState } from '@gisik-nokma/domain';
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
 * link keeps `{kind, targetId: null}`. `parentId` is NOT withheld, and the difference
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
 *   `canSee(target)` at the gate. Owner: none (accepted).
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

async function withheldOrSame(type: string, payload: unknown, sees: TargetSight): Promise<unknown> {
  if (!isTicketLinkEvent(type) || payload === null || typeof payload !== 'object') return payload;
  const p = payload as { kind: TicketLinkKind; targetId?: unknown; from?: unknown };
  const other = p.from ?? p.targetId;
  if (typeof other !== 'string' || (await sees(other))) return payload;
  return withheldLinkPayload(p.kind, linkPayloadDirection(payload));
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

/** A folded state's links, visible other ends only; the key absent when none remain (T1's absent-not-empty rule). */
export async function withholdLinks(state: TicketState, sees: TargetSight): Promise<TicketState> {
  if (state.links === undefined) return state;
  const kept: NonNullable<TicketState['links']> = [];
  for (const l of state.links) if (await sees(l.from ?? l.targetId)) kept.push(l);
  if (kept.length === state.links.length) return state;
  const { links: _all, ...rest } = state;
  return kept.length > 0 ? { ...rest, links: kept } : rest;
}

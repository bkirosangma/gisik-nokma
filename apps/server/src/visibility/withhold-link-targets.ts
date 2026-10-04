import { isTicketLinkEvent, withheldLinkPayload, type TicketLinkKind, type TicketState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { LINK_TARGET_NOT_VISIBLE_REASON, PERMISSION_VISIBILITY_RULE } from '../permissions/check-permission.js';
import { canSee } from './can-see.js';

/**
 * Spec A §2.4 on the doors that serve STORED claims (typed-links T4b): a link's
 * other end is withheld from a viewer who cannot see it. ONE predicate,
 * `canSee`, which answers a never-minted, a purged and a hidden id the same
 * (`can-see.ts`, "Unknown and invisible are the same answer"), so the withheld
 * copy cannot tell them apart. `parentId` is NOT withheld, and the difference
 * is the read door's: the detail read serves a restricted parent's id
 * (`parent: {kind:'restricted', id}`), and it withholds a link's.
 * See `visible-events-for.ts`, "What the filter does NOT hide".
 */
export type TargetSight = (targetId: string) => Promise<boolean>;

/** `canSee`, memoised for one request or one drain: a page or a range names the same target many times. */
export function targetSight(db: Queryable, viewerId: string): TargetSight {
  const memo = new Map<string, Promise<boolean>>();
  return (targetId) => {
    let answer = memo.get(targetId);
    if (answer === undefined) {
      answer = canSee(db, viewerId, targetId);
      memo.set(targetId, answer);
    }
    return answer;
  };
}

async function withheldOrSame(type: string, payload: unknown, sees: TargetSight): Promise<unknown> {
  if (!isTicketLinkEvent(type) || payload === null || typeof payload !== 'object') return payload;
  const p = payload as { kind: TicketLinkKind; targetId?: unknown };
  if (typeof p.targetId !== 'string' || (await sees(p.targetId))) return payload;
  return withheldLinkPayload(p.kind);
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

/** A folded state's links, visible targets only; the key absent when none remain (T1's absent-not-empty rule). */
export async function withholdLinks(state: TicketState, sees: TargetSight): Promise<TicketState> {
  if (state.links === undefined) return state;
  const kept: NonNullable<TicketState['links']> = [];
  for (const l of state.links) if (await sees(l.targetId)) kept.push(l);
  if (kept.length === state.links.length) return state;
  const { links: _all, ...rest } = state;
  return kept.length > 0 ? { ...rest, links: kept } : rest;
}

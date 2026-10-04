import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type TicketState } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { canOpen } from '../../src/visibility/can-open.js';
import { targetSight, withholdContest, withholdEvent, withholdLinks } from '../../src/visibility/withhold-link-targets.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';

/**
 * Typed links T4b, the one predicate and the one rewrite (spec A §2.4): a link's
 * other end is withheld from a viewer who cannot see it, on every door that
 * serves stored claims. These cases drive the module directly against a REAL
 * database; the doors themselves are `test/routes/ticket-link-doors.test.ts`.
 *
 * ## The world
 *
 * `buildReadTestApp`'s scenario (`read-scenario.ts`): the member sees S
 * (`taskInEpicId`) and SH (`sharedTaskId`, explicit owner + member), not H
 * (`hiddenTaskId`, explicit owner only, titled "Salary review — keep private").
 * NEVER is a fresh ULID nothing creates.
 */

let db: TestDatabase;
let world: ReadWorld;
let WS: string;
let S: string;
let SH: string;
let H: string;
let NEVER: string;
let ownerId: string;
let memberId: string;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  WS = world.world.workspaceId;
  S = world.world.taskInEpicId;
  SH = world.world.sharedTaskId;
  H = world.world.hiddenTaskId;
  NEVER = newUlid();
  ownerId = world.userIds.owner;
  memberId = world.userIds.member;
});

afterAll(async () => {
  await db.drop();
});

const link = (target: string) => ({ type: 'ticket.link_added', payload: { kind: 'duplicates', targetId: target } as unknown });
const contest = (target: string, rule: string, reason: string) => ({
  type: 'claim.contested',
  payload: {
    originalEvent: {
      ...newSubmittedEvent({
        workspaceId: WS,
        entity: { kind: 'ticket', id: S },
        type: 'ticket.link_added',
        payload: { kind: 'blocks', targetId: target },
        actorId: ownerId,
        origin: 'web',
      }),
    } as { type: string; payload: unknown },
    rule,
    reason,
  },
});

describe('typed links T4b, withhold a hidden link target (27.081–27.082)', () => {
  it('27.081 hidden and never-minted withheld byte for byte, contest cause rewritten; control: visible and owner untouched', async () => {
    const member = targetSight(db.pool, memberId);
    const hidden = await withholdEvent(link(H), member);
    const never = await withholdEvent(link(NEVER), member);
    expect(JSON.stringify(hidden.payload)).toBe('{"kind":"duplicates","targetId":null}');
    expect(JSON.stringify(never.payload)).toBe(JSON.stringify(hidden.payload));
    const titled = contest(H, 'link.reverse', '"Salary review — keep private" already blocks "File the GST return".');
    const out = await withholdEvent(titled, member);
    expect(out.payload).toMatchObject({ rule: 'permission.visibility', reason: 'The other ticket does not exist in this workspace, or you cannot see it.' });
    expect((out.payload as { originalEvent: { payload: unknown } }).originalEvent.payload).toEqual({ kind: 'blocks', targetId: null });
    // The rebuilt contest payload keeps `claimContestedPayloadSchema`'s key order.
    expect(Object.keys(out.payload)).toEqual(['originalEvent', 'rule', 'reason']);
    expect(JSON.stringify(out)).not.toContain(H);
    expect(JSON.stringify(out)).not.toContain('Salary review');
    const neverContest = await withholdEvent(
      contest(NEVER, 'permission.visibility', 'The other ticket does not exist in this workspace, or you cannot see it.'),
      member,
    );
    const cause = (e: { payload: unknown }) => {
      const p = e.payload as { rule: string; reason: string; originalEvent: { payload: unknown } };
      return JSON.stringify([p.rule, p.reason, p.originalEvent.payload]);
    };
    expect(cause(neverContest)).toBe(cause(out)); // byte-identical causes
    // controls: same reference back
    const visible = link(SH);
    expect(await withholdEvent(visible, member)).toBe(visible);
    const visContest = contest(SH, 'link.reverse', '"Renew the trade licence" already blocks "File the GST return".');
    expect(await withholdEvent(visContest, member)).toBe(visContest);
    const other = { type: 'ticket.transitioned', payload: { to: 'done', targetId: H } };
    expect(await withholdEvent(other, member)).toBe(other);
    const ownerSight = targetSight(db.pool, ownerId);
    const h = link(H);
    expect(await withholdEvent(h, ownerSight)).toBe(h);
    expect(await withholdEvent(titled, ownerSight)).toBe(titled);

    // AMEND p11 T4-T6: malformed and already-withheld claims. A contest's
    // `originalEvent.payload` may be `null` or `{}` (`submittedEventSchema`
    // accepts both, `contest-events.ts`), so these guards meet stored data.
    const malformed = (payload: unknown) => {
      const c = contest(SH, 'link.unknown-target', 'The other ticket does not exist in this workspace.');
      return { ...c, payload: { ...c.payload, originalEvent: { ...c.payload.originalEvent, payload } } };
    };
    // T4: a null claim payload comes back as the same reference.
    const nullClaim = malformed(null);
    expect(await withholdEvent(nullClaim, member)).toBe(nullClaim);
    // T5: a claim payload with no targetId, and an already-withheld event, come back as the same reference.
    const emptyClaim = malformed({});
    expect(await withholdEvent(emptyClaim, member)).toBe(emptyClaim);
    expect(await withholdEvent(hidden, member)).toBe(hidden); // idempotent
    // T6: a contest view whose originalEvent is null comes back as the same reference.
    const nullOriginal = { rule: 'link.reverse', reason: 'x', originalEvent: null };
    expect(await withholdContest(nullOriginal, member)).toBe(nullOriginal);
  });

  it('27.082 withholdLinks filters, drops the key, memoises; control: owner whole', async () => {
    const stored = await getTicketStateFromDb(db.pool, WS, S);
    expect(stored).not.toBeNull(); // precondition
    const state = { ...stored!, links: [{ kind: 'blocks', targetId: SH }, { kind: 'duplicates', targetId: H }] } as TicketState;
    expect((await withholdLinks(state, targetSight(db.pool, memberId))).links).toEqual([{ kind: 'blocks', targetId: SH }]);
    const onlyHidden = { ...state, links: [{ kind: 'duplicates', targetId: H }] } as TicketState;
    expect('links' in (await withholdLinks(onlyHidden, targetSight(db.pool, memberId)))).toBe(false);
    expect(await withholdLinks(state, targetSight(db.pool, ownerId))).toBe(state);
    // AMEND p11 T7: the common case. A ticket with no links comes back as the same reference.
    const { links: _none, ...bare } = state;
    const noLinks = bare as TicketState;
    expect(await withholdLinks(noLinks, targetSight(db.pool, memberId))).toBe(noLinks);
    // Memo: a counting Queryable. One sight asked about H three times costs what ONE canOpen(H) costs (the
    // predicate since drafts T6: canSee, then the own-draft read for an id canSee says no to).
    const counting = (n: { q: number }): Queryable =>
      ({
        query: (...a: unknown[]) => {
          n.q += 1;
          return (db.pool.query as (...x: unknown[]) => unknown).apply(db.pool, a);
        },
      }) as unknown as Queryable;
    const once = { q: 0 };
    await canOpen(counting(once), memberId, H);
    const thrice = { q: 0 };
    const sight = targetSight(counting(thrice), memberId);
    for (let i = 0; i < 3; i += 1) await withholdEvent(link(H), sight);
    expect(once.q).toBeGreaterThan(0); // precondition: the counter sees canOpen's queries
    expect(thrice.q).toBe(once.q);
  });
});

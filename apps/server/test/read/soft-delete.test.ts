import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { visibleProjectCounts } from '../../src/read/workspace-counts.js';
import { rollupFor } from '../../src/visibility/rollup.js';
import { readAttention } from '../../src/routes/attention.js';
import { readBoard } from '../../src/routes/board.js';
import { readList } from '../../src/routes/list.js';
import { readMyWork } from '../../src/routes/my-work.js';
import { readSearch } from '../../src/routes/search.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * The soft delete as a READ rule — THE `LIVE_TICKET_WHERE` COVERAGE SUITE.
 *
 * ## Why this file is one seed and six readers
 *
 * The delete filter has **no choke point**. `read/visible-where.ts`'s
 * `LIVE_TICKET_WHERE` is a constant AND-ed in at each reading site, deliberately
 * (`visibleTicketsWhere` is cross-checked ticket-by-ticket against `canSee` in
 * `test/read/visible-where.test.ts`, and folding deletion into it would make
 * that check certify two rules at once). The cost of that decision is that
 * coverage is a LIST rather than an inheritance, so the list is what this file
 * enumerates: board, list, search, My Work, attention, counts — and, in the
 * opposite direction, the engine's own by-id read.
 *
 * `grep -rn "LIVE_TICKET_WHERE" apps/server/src/` is the other half of that
 * enumeration and the two are meant to be compared. A site that ANDs the
 * constant in and has no case here is covered by a rule nobody ran; a case here
 * for a site that does not AND it in would be a case that passes for the wrong
 * reason.
 *
 * ## The three tickets, and why each one is load-bearing
 *
 * - **LIVE** — never deleted. The positive control in every invocation below.
 *   Without it, a reader that returned NOTHING would satisfy every "absent"
 *   assertion in this file.
 * - **DELETED** — created, then `ticket.deleted`. Must be absent everywhere.
 * - **RESTORED** — created, deleted, then `ticket.restored`. Must be PRESENT
 *   everywhere, exactly as a never-deleted ticket is. It is the ticket that
 *   proves the undo is real at the READ layer and not merely in the reducer:
 *   a reader that keyed on "was this ticket ever deleted" — a `deleted_at IS
 *   NULL` predicate is not that, but an EXISTS-over-the-ledger one would be —
 *   passes every DELETED assertion below and reddens only on this one.
 *
 * All three carry a DUE DATE and an ASSIGNEE, so each reader's own specific
 * conjunct is exercised: My Work filters by `assignee_id`, and the attention
 * strip's due-soon bucket is what makes a ticket appear there at all.
 *
 * ## The fixture-level control, in `beforeAll` and again in the first case
 *
 * Every reader below reads `proj_tickets`, and all three rows are STILL THERE —
 * the delete is a flag, not a row removal, which is the FAQ's *"its history is
 * retained"*. So the first case asserts the raw table before any reader is
 * asked anything: three rows, with `deleted_at` set on exactly one and `NULL` on
 * the other two. A suite that skipped that check could not tell "the reader
 * filters" from "the row was never written".
 */

let db: TestDatabase;

const WS = newUlid();
const PRJ = newUlid();
const WF = newUlid();
const TYPE_ID = newUlid();
const OWNER = newUlid();

const LIVE = newUlid();
const DELETED = newUlid();
const RESTORED = newUlid();

/** Frozen, so the attention strip's windows are a fixed fact rather than the wall clock. */
const NOW = new Date('2026-08-20T12:00:00.000Z');
/** Inside any reasonable due-soon window from `NOW`, and the same day for all three. */
const DUE = '2026-08-21';

const TITLES: Record<string, string> = {
  [LIVE]: 'Softdelete live marker',
  [DELETED]: 'Softdelete gone marker',
  [RESTORED]: 'Softdelete back marker',
};

beforeAll(async () => {
  db = await createTestDatabase();
  const ws = { workspaceId: WS, actorId: OWNER };

  const events: LedgerEvent[] = [
    // The workspace has to exist before a membership can name it: `checkProjectExists`
    // is not in this path (nothing here goes through the ingest door) but
    // `resolveEffectiveRole` reads `proj_memberships`, which the membership
    // event writes.
    makeCommitted({
      ...ws,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.created',
      payload: { name: 'Soft delete' },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'membership', id: newUlid() },
      type: 'membership.granted',
      payload: { userId: OWNER, role: 'owner' },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'project', id: PRJ },
      type: 'project.created',
      payload: { name: 'Soft delete project' },
    }),
    // The OWNER is on the roster as well as holding the workspace role, so
    // `visibleTicketsWhere`'s project-mode branch admits them without needing
    // the owner bypass to be the reason. A fixture that leaned on the bypass
    // would not exercise the predicate the other readers share.
    makeCommitted({
      ...ws,
      entity: { kind: 'project', id: PRJ },
      type: 'project.member_added',
      payload: { userId: OWNER, projectAdmin: true },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Soft-delete flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: '*', to: 'doing', rules: [] }],
      },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Soft-delete task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
    }),
  ];

  const lifecycle = (id: string, parentId: string | null = null): LedgerEvent[] => [
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: TYPE_ID, projectId: PRJ, parentId, title: TITLES[id] },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.assigned',
      payload: { assigneeId: OWNER },
    }),
    makeCommitted({
      ...ws,
      actorId: OWNER,
      entity: { kind: 'ticket', id },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: DUE } },
    }),
  ];

  events.push(...lifecycle(LIVE), ...lifecycle(DELETED, LIVE), ...lifecycle(RESTORED, LIVE));
  // The three flag events, and the whole difference between the three tickets.
  events.push(makeCommitted({ ...ws, entity: { kind: 'ticket', id: DELETED }, type: 'ticket.deleted', payload: {} }));
  events.push(makeCommitted({ ...ws, entity: { kind: 'ticket', id: RESTORED }, type: 'ticket.deleted', payload: {} }));
  events.push(makeCommitted({ ...ws, entity: { kind: 'ticket', id: RESTORED }, type: 'ticket.restored', payload: {} }));

  await applyCommitted(db.pool, events);
}, 120_000);

afterAll(async () => {
  await db.drop();
});

/** Every reader takes the same two head arguments; this is the one `beforeAll` builds. */
async function ownerEff() {
  const eff = await resolveEffectiveRole(db.pool, OWNER, WS);
  return eff;
}

/**
 * A response flattened to one string, so an assertion about a ticket's presence
 * is about the WHOLE answer rather than about a shape this file would have to
 * re-derive per reader. The ids are ULIDs and cannot collide with a title, an
 * actor or another ticket, so a substring hit is a real presence.
 *
 * The cost of the shape-independence is that the assertion is only as strong as
 * its control — which is why every case below asserts the LIVE and RESTORED
 * markers through the SAME string, in the SAME invocation. See the file header.
 */
const flatten = (response: unknown): string => JSON.stringify(response);

describe('the soft delete is a READ rule, and the rows are still there', () => {
  it('all three rows survive in proj_tickets; exactly the deleted one carries deleted_at', async () => {
    // THE FIXTURE CONTROL for every case below, and the FAQ's *"its history is
    // retained"* as a query. If this reddens, no absence assertion further down
    // means anything: a reader with no row to filter cannot be caught filtering.
    const { rows } = await db.pool.query<{ ticket_id: string; deleted_at: Date | null; deleted_by: string | null }>(
      'SELECT ticket_id, deleted_at, deleted_by FROM proj_tickets WHERE ticket_id = ANY ($1::text[]) ORDER BY ticket_id',
      [[LIVE, DELETED, RESTORED]],
    );
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((row) => [row.ticket_id, row]));
    expect(byId.get(LIVE)?.deleted_at).toBeNull();
    expect(byId.get(LIVE)?.deleted_by).toBeNull();
    expect(byId.get(DELETED)?.deleted_at).not.toBeNull();
    expect(byId.get(DELETED)?.deleted_by).toBe(OWNER);
    // THE UNDO, at the row: the flag is cleared, not a second row written.
    // A `deleted_at` that survived a restore would make the ticket permanently
    // absent from every view while `TicketState.deleted` read `null` — the two
    // halves of the feature disagreeing with nothing red.
    expect(byId.get(RESTORED)?.deleted_at).toBeNull();
  });

  it('the ENGINE read still sees the deleted ticket, with its flag — the prohibition this change must not break', async () => {
    // The one read that must NOT filter, and the reason is not stylistic:
    // `getTicketStateFromDb` feeds `EngineContext`, and `ticket.restored` is
    // resolved through it. Filter here and the UNDO answers "no such ticket" —
    // the feature cannot be undone at all.
    //
    // MEASURED, 2026-09-20, and the result is STRONGER than a red case here.
    // Adding `AND deleted_at IS NULL` to `getTicketStateFromDb` does not redden
    // this assertion and leave the rest green — it makes the fixture unseedable.
    // `beforeAll` throws `applyTicketEvent: ticket.restored for ticket … that
    // was never created` and all eight cases report skipped. Reason: the
    // projection reaches the reducer through this same reader for `getState`
    // (`./helpers/apply.ts` runs projections only, no engine), so the reader is
    // not merely the ENGINE's by-id read — it is the PROJECTION's own fold input
    // for every ticket event that is not a creation. A "live tickets only"
    // predicate here does not hide a deleted ticket from a view; it makes the
    // ticket not exist to the code that has to undo the delete.
    const state = await getTicketStateFromDb(db.pool, WS, DELETED);
    expect(state).not.toBeNull();
    expect(state?.deleted).toEqual({ actorId: OWNER, at: expect.any(String) as unknown as string });
    // The pair's other end: the restored ticket reads `null`, the SAME value a
    // never-deleted ticket reads. A projection that wrote `{ restoredAt }` or
    // left a stale object would redden here.
    expect((await getTicketStateFromDb(db.pool, WS, RESTORED))?.deleted).toBeNull();
    expect((await getTicketStateFromDb(db.pool, WS, LIVE))?.deleted).toBeNull();
  });

  it('readBoard', async () => {
    const board = await readBoard(db.pool, await ownerEff(), OWNER, WS, PRJ);
    const text = flatten(board);
    expect(text).toContain(LIVE);
    expect(text).toContain(RESTORED);
    expect(text).not.toContain(DELETED);
  });

  it('readList', async () => {
    const list = await readList(db.pool, await ownerEff(), OWNER, WS, PRJ, {
      spec: {},
      groupBy: 'status',
      limit: 100,
    });
    const text = flatten(list);
    expect(text).toContain(LIVE);
    expect(text).toContain(RESTORED);
    expect(text).not.toContain(DELETED);
  });

  it('readSearch', async () => {
    // `q` matches all three titles ("Softdelete …"), so the deleted one is a row
    // the search WOULD return — the exclusion is the only thing removing it.
    const found = await readSearch(db.pool, await ownerEff(), OWNER, WS, 'Softdelete', {});
    const text = flatten(found);
    expect(text).toContain(LIVE);
    expect(text).toContain(RESTORED);
    expect(text).not.toContain(DELETED);
  });

  it('readMyWork', async () => {
    // All three are assigned to OWNER, so every one of them qualifies on the
    // assignee conjunct and the delete is the only thing that can remove one.
    const work = await readMyWork(db.pool, await ownerEff(), OWNER, WS);
    const text = flatten(work);
    expect(text).toContain(LIVE);
    expect(text).toContain(RESTORED);
    expect(text).not.toContain(DELETED);
  });

  it('readAttention', async () => {
    // All three are due the day after `NOW`, so the due-soon bucket would carry
    // all three — the fixture would be worthless if the deleted one qualified
    // for no bucket anyway, and the two controls below are what rules that out.
    const attention = await readAttention(db.pool, await ownerEff(), OWNER, WS, NOW);
    const text = flatten(attention);
    expect(text).toContain(LIVE);
    expect(text).toContain(RESTORED);
    expect(text).not.toContain(DELETED);
  });

  it('visibleProjectCounts', async () => {
    // A COUNT is where an absence assertion is weakest — `toBe(2)` and `toBe(3)`
    // are one character apart and neither says WHICH ticket is missing. The
    // control is the same three tickets through the same call, so the number is
    // pinned to a known membership rather than to a magnitude.
    const counts = await visibleProjectCounts(db.pool, await ownerEff(), OWNER, WS);
    expect(counts?.get(PRJ)?.ticketCount).toBe(2);
    // The same number read back from the table, in the same case: three rows
    // exist and two are countable, so the difference is the filter and not a
    // fixture that never wrote the third.
    const { rows } = await db.pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM proj_tickets WHERE workspace_id = $1 AND project_id = $2',
      [WS, PRJ],
    );
    expect(Number(rows[0]?.n)).toBe(3);
  });

  /**
   * ⚠ ADDED IN THE FIX ROUND FOR INDEPENDENT REVIEW'S **I2**, which measured
   * that eleven sites carry `LIVE_TICKET_WHERE` and are **executed but
   * UNCONSTRAINED** — mutating each to `AND TRUE` left the whole server suite
   * green, because no fixture in the tree held a deleted ticket at a site they
   * read. This is the first of those sites to get a fixture: the parent's child
   * ROLLUP, which is the number a board card actually prints.
   *
   * `DELETED` and `RESTORED` are children of `LIVE` (`lifecycle`'s new second
   * argument). The ticket COUNT is unchanged by that — still three rows, two
   * countable — so the pinned `2` above is untouched, and the difference here is
   * the membership rather than a magnitude.
   *
   * `total` is 1 and not 2 (the field is `RollupView.total` — `rows.length`
   * AFTER the predicate; the client's `totalChildren` is a later rename of the
   * same number). Remove the predicate at `visibility/rollup.ts` and it becomes
   * 2, which is the "5 of 8" this file exists to keep honest reading about a
   * ticket nobody can reach.
   */
  it('rollupFor — a deleted CHILD leaves its parent’s count', async () => {
    const rollup = await rollupFor(db.pool, OWNER, LIVE);
    expect(rollup).not.toBeNull();
    expect(rollup?.total).toBe(1);
    // The control, in the same invocation: the SAME call for the deleted child
    // itself, which is not a parent of anything, answers `null` — so the `1`
    // above is a reading of a real rollup and not of an empty one.
    expect(await rollupFor(db.pool, OWNER, DELETED)).toBeNull();
  });
});

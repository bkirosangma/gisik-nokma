import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { runAutoCloseSweep } from '../../src/auto-close/sweep.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { runNotificationSweep } from '../../src/notifications/sweep.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getWorkflowDefFromProjection } from '../../src/projections/workflows.js';
import { readStateOccupancy, readTicketCounts, readTypePopulation } from '../../src/routes/builder-reads.js';
import { ticketVisibleProjectIds } from '../../src/read/workspace-counts.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * **THE SOFT-DELETE INVARIANT, ARM 2: THE PATHS A CLIENT QUERY CANNOT REACH.**
 *
 * Catalogue entry: **case 16.89** (`test-cases/16-remaining-doors.md`). Arm 1 is
 * **case 16.88**, and the attachments leak named below is **case 16.90**.
 *
 * ## Why this file is separate from Arm 1, in one sentence
 *
 * Arm 1 (`test/integration/soft-delete-client-surface.test.ts`) walks
 * `keyof DataSourceQuery` and gets its completeness **from the type system** —
 * a sixteenth read method is a compile error rather than a silent omission.
 * **Nothing here has that property, and claiming otherwise would be the same
 * defect one layer up.** This file's coverage is a LIST, so the list is
 * published below with its scope, and a reader can check it against the sweep
 * that produced it.
 *
 * ## THE ENUMERATION, WITH ITS SCOPE — every site that carries the rule
 *
 * ⚠ **THIS TABLE WAS WRONG TWICE, AND BOTH CORRECTIONS CAME FROM SOMEONE WHO DID
 * NOT WRITE IT.** It first said FOURTEEN, from a sweep for the named constant
 * plus `rollup.ts`'s one longhand predicate. An independent reviewer mutated a
 * site that sweep could not see and found it a **SURVIVOR**; widening the
 * pattern then found **two more, also survivors, also invisible to the first
 * pattern**. **A sweep is only as complete as its pattern, and "the constant" is
 * not "the rule"** — *the universe is the bug*.
 *
 * The table is therefore produced by TWO sweeps, both given so a reader can
 * re-run them:
 *
 *   1. `git grep -n 'LIVE_TICKET_WHERE' -- apps/server/src` → **13 executable
 *      uses of the named constant**, across 9 files. It must be run for the
 *      SYMBOL: a search for the literal `deleted_at` reports ZERO in
 *      `auto-close/sweep.ts` and `notifications/sweep.ts`, because they splice
 *      the constant — the trap the dispatch opens with, and it cost the
 *      dispatcher a wrong answer before a control caught it.
 *   2. `git grep -nE 'deleted_at +IS +NULL' -- apps/server/src`, minus the
 *      constant's own definition and the docblock that quotes it → **4 written
 *      LONGHAND**, in three functions on two different aliases.
 *
 * **13 + 4 = 17 SQL statements carry the rule.** One further application is
 * written in TypeScript and is published below rather than counted here.
 *
 * ⚠ **"Eleven" appears in the dispatch AND in a withdrawn sentence in
 * `visible-where.ts`'s own docblock. Neither is reproducible; these two sweeps
 * are.** Count the sites in the tree you are standing in.
 *
 * | # | site | function | constrained by |
 * |---|---|---|---|
 * | 1 | `read/workspace-counts.ts:112` | `visibleProjectCounts` | **Arm 1** — the directory's `ProjectRef.ticketCount` |
 * | 2 | `read/workspace-counts.ts:226` | `ticketVisibleProjectIds` | **THIS FILE** — case below |
 * | 3 | `routes/board.ts:115` | `readBoard` | **Arm 1** — `getBoard` |
 * | 4 | `routes/list.ts:137` | `readList` | **Arm 1** — `getTickets` |
 * | 5 | `routes/search.ts:137` | `readSearch` | **Arm 1** — `search` |
 * | 6 | `routes/my-work.ts:141` | `readMyWork` — the **ASSIGNED** half | **Arm 1** — `getMyWork` |
 * | 7 | `routes/my-work.ts:252` | `sharedWithMeRows` — the **SHARED** half | **Arm 1** — `getMyWork` + the explicit-shared case |
 * | 8 | `routes/attention.ts:191` | `readAttention` | **Arm 1** — `getAttention` + `getWorkspaceSettings` |
 * | 9 | `routes/builder-reads.ts:362` | `readStateOccupancy` | **THIS FILE** — case below |
 * | 10 | `routes/builder-reads.ts:438` | `readTypePopulation` | **THIS FILE** — case below |
 * | 11 | `auto-close/sweep.ts:197` | `runAutoCloseSweep` | **THIS FILE** — case below |
 * | 12 | `notifications/sweep.ts:187` | `runNotificationSweep` (due) | **THIS FILE** — case below |
 * | 13 | `notifications/sweep.ts:265` | `runNotificationSweep` (stale) | **THIS FILE** — case below |
 * | 14 | `visibility/rollup.ts:263` | `rollupFor` (**longhand**) | **Arm 1** (the list row's `rollup`) **and** `test/read/soft-delete.test.ts` (the pre-existing function-level case) |
 * | 15 | `routes/builder-reads.ts:504` | `readTicketCounts` (**longhand, on alias `k`**) | **THIS FILE** — case below |
 * | 16 | `projections/rollups.ts:221` | `recomputeParent` (**longhand**) | **Arm 1** — `proj_rollups.total_children` for a parent that KEEPS a row |
 * | 17 | `projections/rollups.ts:320` | the stale-row DELETE (**longhand**) | **Arm 1** — the same case |
 *
 * ⚠ **Rows 6 and 7 were labelled the wrong way round** when this table was first
 * written — `:141` read "shared" and `:252` read "rest". Corrected at the line,
 * and the correction kept, because the two are why a mutation survived the first
 * battery: a fixture that populates one half tells you nothing about the other,
 * and a swapped label is how that stops being visible.
 *
 * ⚠ **Rows 16 and 17 are MUTUALLY MASKING on a single-child parent, and the case
 * for them has to be built for the reachable shape.** Un-filter `:221` and the
 * recompute writes a row for the tombstoned child — and `:320`'s DELETE then
 * removes that row anyway, because the parent has no live children at all, so
 * the observable is identical and BOTH mutations hide. The shape where they are
 * separable is a parent that KEEPS a row: one live child, one deleted. That is
 * what Arm 1's second parent exists for, and it was measured rather than
 * reasoned — `:221` survived the whole suite until that fixture existed.
 *
 * ### Sites 2 and 9–15 are here because no `DataSourceQuery` METHOD reaches them, or they need their own fixture
 *
 * ⚠ **CORRECTED: this paragraph read *"there is no question the client can ask
 * that reaches them"*, and that is FALSE.** `DataSourceQuery` has no member for
 * `state-occupancy`, `ticket-types/:typeId/population` or
 * `ticket-counts-by-type` — that is what makes Arm 1 blind to sites 9, 10, 11,
 * 12, 13 and 15. But the **shipped web client reaches all three of those
 * routes**: `apps/web/src/authoring/data-source-gateway.ts`'s
 * `getStateOccupancy`, `getTypeWorkflowPopulation` and `getTicketCountsByType`.
 * **Arm 1's blindness is a property of the TYPE it walks, not of the product**,
 * and an earlier version of this paragraph claimed the stronger thing. It was
 * refuted by an independent reviewer who opened the gateway — which is the whole
 * reason a claim about what a client *can* ask belongs next to the line that
 * proves it.
 *
 * **Site 2 is a third case**: `ticketVisibleProjectIds` IS reached by
 * `getMyWorkspaces` — it feeds `nameRestrictedProjectCount`. But that consumer
 * is a NUMBER, and `packages/app-core/src/view-types.ts` records that **an
 * owner's is `0` by construction**, so an owner fixture cannot move it and a
 * marker cannot reach it at all.
 *
 * ### ⛔ WHAT NEITHER ARM COVERS, NAMED RATHER THAN LEFT AS AN ABSENCE
 *
 * **FOUR surfaces, every one of them MEASURED as a survivor rather than
 * suspected.** Three are the attachment doors and one is a TypeScript gate.
 *
 * #### (a) A soft-deleted ticket's ATTACHMENTS are served by THREE doors, and the third serves the BYTES
 *
 * MEASURED 2026-09-20 for the list: one ticket, deleted through the real door,
 * `GET …/tickets/:id` → **404** while `GET …/tickets/:id/attachments` → **200**
 * carrying the file, with the same pair answering `200/200` before the delete.
 * The other two doors are **read at the line, NOT independently measured**, and
 * are named that way rather than folded into the measurement:
 *
 * 1. the **list** — `GET …/tickets/:id/attachments` (`routes/tickets.ts:628`),
 *    guards `loadTicketRow` + `canSee`;
 * 2. the **upload** — `POST /v1/attachments` (`routes/attachments.ts:285`),
 *    guard at `:356` is `canSee` alone;
 * 3. the **download** — `GET /v1/attachments/:id` (`routes/attachments.ts:482`),
 *    guard at `:486` is `canSee` alone. **The sharpest of the three: what leaves
 *    is the file itself.**
 *
 * None of the three consults deletion, for one ruling: `canSee` by its own words
 * does not mean "not deleted" (`read/visible-where.ts:137-139`). The sibling
 * detail route carries the third guard they lack (`routes/tickets.ts:366`).
 * ⚠ **The grep, with its control: `routes/attachments.ts` contains the word
 * `deleted` ZERO times, while the same grep finds it 6 times in
 * `routes/tickets.ts` — an absence at the file, not a missed line.**
 * Write-up: `gisik-nokma-lanes/EXEC-2026-09-20-softdelete-attachment-leak.md`.
 * **Named owner: whoever next picks up the attachment surface.**
 *
 * #### (b) `routes/my-work.ts:364` — the CONTESTED-claim title gate, in TypeScript
 *
 * The 18th application, and the one the SQL sweeps above cannot see because it is
 * not SQL. `contested.push({ … title: row.deleted_at === null && (await canSee(…)) ? … : null })`
 * — the file's own docblock says it is *"`LIVE_TICKET_WHERE`'s rule reaching the
 * one surface that cannot filter its row, so it is applied to the TITLE alone"*.
 *
 * **MEASURED SURVIVOR when this was written, WITNESSED since 2026-09-21** (round-1
 * F4, release batch B07). Then: with the `row.deleted_at === null &&` conjunct
 * removed, 89 tests across 7 files stayed green, while the same invocation run
 * against site 6 (`my-work.ts:141`) reported 18 failures — the command could
 * fail, and an edit to that file reached the compiled artifact; neither arm
 * contained the word `contested`, and `test/routes/my-work.test.ts` never
 * exercised a deleted ticket. Now: that suite's last case (case 17.124, "F4:
 * the deleted ticket keeps its row and loses its title; the live sibling keeps
 * both") contests two of the owner's own tickets, reads both titles by VALUE,
 * soft-deletes one, and reads again — the row survives, the title is `null`,
 * the live sibling is unchanged. Re-run of the same mutation against it:
 * `Tests  1 failed | 24 passed (25)`, at `expected 'Contested, then deleted'
 * to be null`. It is constrained by that case and by nothing in THIS file,
 * which is why the paragraph stays: this file's table of sites says which arm
 * covers each, and for this one the answer is neither arm.
 *
 * #### (c) `packages/app-core/src/replica/replica-data-source.ts` — the OFFLINE source's two gates
 *
 * The client has **two** implementations of `DataSource`, and Arm 1 walks only
 * the ONLINE one. The replica — Plan 10's local store, which is what a user sees
 * offline — applied the rule in TypeScript in two places when this was
 * written, each with a docblock naming `LIVE_TICKET_WHERE` as the rule it is
 * carrying — cited by CONTENT, because this paragraph carried `:947` and
 * `:980` and both came to rest on other lines (`getMyWork`'s refusal and a
 * `stateNameOf` binding — resolving, and neither a gate; round-1 F5): the
 * `if ((state.deleted ?? null) !== null) continue;` in `getTickets`' ticket
 * enumeration, and the `(state.deleted ?? null) === null` conjunct beside
 * `closed` in `getBoard`'s filter. ⚠ "Two places" counted the GATES, not the
 * reads: three sibling reads had no gate at all (`listTicketSummaries`,
 * `myWork`, `searchOfflineCopy` — round-2 E6-24, fixed in release batch B07
 * and pinned by case 12.399), so the file now carries the rule at four reads.
 *
 * **BOTH MEASURED SURVIVORS when this was written, on ONE valid witness — and
 * WITNESSED since 2026-09-21 (round-1 F5, release batch B07, case 17.125)**:
 * `packages/app-core/test/replica/replica-deleted-reads.test.ts` now holds the
 * deleted-ticket fixture this arm asked for, and the same two mutations each
 * redden exactly their own case there (`Tests 1 failed | 5 passed (6)`, twice).
 * Then: with each conjunct removed in turn, app-core's replica suite read
 * **27 passed / 0 failed**. That suite
 * imports `../../src/replica/replica-data-source.js` by RELATIVE PATH
 * (`packages/app-core/test/replica/replica-data-source.test.ts`), so the
 * mutation reached what it measured. ⚠ **This paragraph ALSO published
 * `apps/server`'s `test/dual-client` reading 21 passed / 0 failed under the
 * same warrant, and the warrant was false of it** (round-1 F2): `test/dual-client/
 * rig.ts` imports `@gisik-nokma/app-core` by PACKAGE NAME, which resolves
 * through `dist`, and nothing rebuilt `dist` between the mutation and that
 * run — the built copy still carried both gates, so the 21/0 half could not
 * have failed and measured nothing. Re-measured 2026-09-21: no file under
 * `apps/server/test` imports `packages/app-core` by a relative path (`grep -rnE
 * "^\s*import .*from '[^']*packages/app-core" apps/server/test/` → 0, with
 * `grep -rln "from '@gisik-nokma/app-core'" apps/server/test/` → 3 files as the
 * control). The 27/0 half is the measurement, and it is sufficient; the 21/0
 * reading is withdrawn as evidence rather than deleted, because a number that
 * was published and later found unwarranted is a fact about this record.
 *
 * ⚠ **The pre-existing I2 note in `test-cases/16-remaining-doors.md` already
 * named these two as unconstrained, at `:888`/`:921` — line numbers that have
 * since rot. It was right about them and its citations had drifted**, which is
 * why this file cites by what the line READS rather than by where it sat.
 *
 * **The owner line this paragraph carried ("whoever next picks up Plan 10's
 * replica reads") is discharged by case 17.125; kept as a sentence about the
 * record rather than as an open assignment.**
 *
 * **A case recording ALL THREE gaps is minted in `test-cases/` (16.90).**
 *
 *
 * ## The fixture, and why the control is a LIVE ticket and not a count
 *
 * Every path below is asked about a DELETED ticket AND about a LIVE twin that
 * differs from it in exactly one respect — the delete. The twin is what makes an
 * absence a filter rather than an empty world: a sweep that returned nothing,
 * or a count that read 0 because the fixture wrote nothing, reddens on the twin
 * rather than passing quietly. A count alone could not do this — `1` and `2` are
 * one character apart and neither says WHICH ticket is missing.
 */

let db: TestDatabase;

const WS = newUlid();
const OWNER = newUlid();
const PROJECT_A = newUlid();
/** A project whose ONLY ticket is deleted — the cell for `ticketVisibleProjectIds`. */
const PROJECT_B = newUlid();
const WF = 'wf-bg';
const TYPE_ID = 'bg-task';

/** Frozen, so every window is a fixed fact rather than the wall clock. */
const NOW = '2026-09-18T12:00:00.000Z';
/** IST day 2026-09-18 minus 7 IST days — the auto-close and staleness cutoff base. */
const LONG_AGO = '2026-08-01T00:00:00.000Z';
/** Inside a 7-day due-soon window from IST day 2026-09-18. */
const DUE_SOON = '2026-09-20';

const LIVE_TERMINAL = newUlid();
const DEAD_TERMINAL = newUlid();
const LIVE_DUE = newUlid();
const DEAD_DUE = newUlid();
const LIVE_STALE = newUlid();
const DEAD_STALE = newUlid();
const DEAD_ALONE = newUlid();

/** Every deleted ticket's title carries this; no live ticket's does. */
const MARKER = 'BGTOMBSTONE';

const titles: Array<[string, string]> = [
  [LIVE_TERMINAL, 'Bg terminal live'],
  [DEAD_TERMINAL, `Bg terminal ${MARKER}`],
  [LIVE_DUE, 'Bg due live'],
  [DEAD_DUE, `Bg due ${MARKER}`],
  [LIVE_STALE, 'Bg stale live'],
  [DEAD_STALE, `Bg stale ${MARKER}`],
  [DEAD_ALONE, `Bg alone ${MARKER}`],
];

beforeAll(async () => {
  db = await createTestDatabase();
  const ws = { workspaceId: WS, actorId: OWNER };

  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'workspace', id: WS }, type: 'workspace.created', payload: { name: 'Bg paths' } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'membership', id: newUlid() },
      type: 'membership.granted',
      payload: { userId: OWNER, role: 'owner' },
    }),
    // The windows are CLAIMED the way an admin would, not injected — the sweeps
    // deliberately take no threshold argument, so a test and the product cannot
    // disagree about where the number lives.
    makeCommitted({
      ...ws,
      entity: { kind: 'workspace', id: WS },
      type: 'workspace.settings_set',
      payload: { autoCloseAfterDays: 7, dueSoonDays: 7, staleDays: 7 },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: {
        id: WF,
        version: 1,
        name: 'Bg flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: 'todo', to: 'doing', rules: [] },
          { from: 'doing', to: 'done', rules: [] },
          { from: 'done', to: 'doing', rules: [] },
        ],
      },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket-type', id: TYPE_ID },
      type: 'ticket-type.defined',
      payload: { id: TYPE_ID, name: 'Bg task', icon: 'check', rank: 1, workflowId: WF, fields: [] },
    }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: PROJECT_A }, type: 'project.created', payload: { name: 'Bg A' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: PROJECT_B }, type: 'project.created', payload: { name: 'Bg B' } }),
  ];

  const created = (id: string, title: string, projectId: string): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: TYPE_ID, projectId, parentId: null, title },
    });

  for (const [id, title] of titles) {
    events.push(created(id, title, id === DEAD_ALONE ? PROJECT_B : PROJECT_A));
  }

  /** The last state-entering event, at a server time chosen per ticket. */
  const entered = (id: string, to: string, at: string): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.transitioned', payload: { to }, serverTime: at });

  const assigned = (id: string): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.assigned', payload: { assigneeId: OWNER } });

  const due = (id: string): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: DUE_SOON } },
      serverTime: '2026-09-01T00:00:00.000Z',
    });

  const deleted = (id: string): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.deleted', payload: {} });

  // TERMINAL PAIR — auto-close candidates: terminal, never closed, entered long ago.
  for (const id of [LIVE_TERMINAL, DEAD_TERMINAL]) {
    events.push(entered(id, 'doing', LONG_AGO), entered(id, 'done', LONG_AGO), assigned(id));
  }
  // DUE PAIR — non-terminal, due inside the window, assigned (so a notification has an addressee).
  for (const id of [LIVE_DUE, DEAD_DUE]) {
    events.push(entered(id, 'doing', '2026-09-17T00:00:00.000Z'), assigned(id), due(id));
  }
  // STALE PAIR — active, entered long ago, assigned.
  for (const id of [LIVE_STALE, DEAD_STALE]) {
    events.push(entered(id, 'doing', LONG_AGO), assigned(id));
  }
  events.push(entered(DEAD_ALONE, 'doing', LONG_AGO));

  // The three deletes — the ONLY difference between each dead ticket and its twin.
  for (const id of [DEAD_TERMINAL, DEAD_DUE, DEAD_STALE, DEAD_ALONE]) {
    events.push(deleted(id));
  }

  await applyCommitted(db.pool, events);
}, 120_000);

afterAll(async () => {
  await db.drop();
});

async function ownerEff() {
  return resolveEffectiveRole(db.pool, OWNER, WS);
}

/** The real engine, the real projections, the real door — no permissive stub. */
function realIngest() {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

/** Every `ticket.closed` in the ledger for one ticket — the sweep's observable. */
async function closedEventsFor(ticketId: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.closed'`,
    [ticketId],
  );
  return Number(rows[0]?.n);
}

/** Which ticket ids reached a notification payload. */
async function notifiedTicketIds(): Promise<Set<string>> {
  const { rows } = await db.pool.query<{ payload: Record<string, unknown> }>(
    'SELECT payload FROM notifications WHERE workspace_id = $1',
    [WS],
  );
  const found = new Set<string>();
  for (const row of rows) {
    const text = JSON.stringify(row.payload);
    for (const [id] of titles) {
      if (text.includes(id)) found.add(id);
    }
  }
  return found;
}

describe('THE SOFT DELETE HOLDS ON THE PATHS NO CLIENT QUERY CAN REACH', () => {
  /**
   * The fixture control, first and separately.
   *
   * Every case below asserts something is ABSENT. Absence is the weakest kind of
   * assertion — a reader that returned nothing satisfies all of them — so the
   * fixture proves HERE that the deleted rows still exist and carry their flag,
   * and each case below carries a LIVE twin that must be PRESENT.
   */
  it('FIXTURE CONTROL: every deleted row is still in proj_tickets, flagged, with its twin unflagged', async () => {
    const ids = titles.map(([id]) => id);
    const { rows } = await db.pool.query<{ ticket_id: string; deleted_at: Date | null }>(
      'SELECT ticket_id, deleted_at FROM proj_tickets WHERE ticket_id = ANY ($1::text[])',
      [ids],
    );
    expect(rows).toHaveLength(ids.length);
    const byId = new Map(rows.map((row) => [row.ticket_id, row.deleted_at]));
    for (const [id, title] of titles) {
      const deletedAt = byId.get(id);
      if (title.includes(MARKER)) {
        expect(deletedAt, `${id} is a tombstone and must carry deleted_at`).not.toBeNull();
      } else {
        expect(deletedAt, `${id} is a live twin and must not carry deleted_at`).toBeNull();
      }
    }
  });

  /**
   * SITE 11 — `auto-close/sweep.ts:197`.
   *
   * The sweep APPENDS a `ticket.closed` to the ledger, and the ledger is
   * append-only by trigger: closing a tombstone would be an unfalsifiable
   * mutation against a ticket that appears in no view, for a clock that means
   * nothing for a ticket nobody has.
   */
  it('runAutoCloseSweep closes the live terminal ticket and NOT its deleted twin', async () => {
    const report = await runAutoCloseSweep({
      pool: db.pool,
      ingest: realIngest(),
      now: () => new Date(NOW),
    });

    // The LIVE twin is the control: it is a candidate on every axis the deleted
    // one is, so a sweep that selected nothing would redden here rather than
    // passing as "correctly suppressed".
    expect(await closedEventsFor(LIVE_TERMINAL)).toBe(1);
    expect(await closedEventsFor(DEAD_TERMINAL)).toBe(0);
    // ...and the report agrees with the ledger rather than the assertion resting
    // on one observable: `closed` counts what the door committed.
    expect(report.closed).toBe(1);
    expect(report.refused).toBe(0);
  });

  /**
   * SITES 12 AND 13 — `notifications/sweep.ts:187` (due) and `:265` (stale).
   *
   * A notification is a VIEW — it appears in a person's list — so a soft-deleted
   * ticket must not arrive there. `canSeeTicket` is not a substitute: it is the
   * audience question and knows nothing about deletion, which is exactly why the
   * two predicates are separate (`read/visible-where.ts`).
   *
   * **Both arms are asserted in ONE case, and deliberately.**
   * `notifiedTicketIds` reads the whole notification table, so a case per arm
   * would make the second one's reading depend on whether the first had run —
   * the ordering coupling this file avoids everywhere else. The two LIVE twins
   * separate the arms just as well: if the STALE arm stopped selecting, its twin
   * is missing and the set comparison names it.
   */
  it('runNotificationSweep notifies for the live due/stale tickets and NOT for their deleted twins', async () => {
    const report = await runNotificationSweep({
      pool: db.pool,
      transports: [createInAppTransport(db.pool)],
      canSeeTicket: async () => true,
      now: () => new Date(NOW),
      // A no-op logger would make "correctly suppressed" indistinguishable from
      // "attempted and the insert threw" — the failure this suite's own sibling
      // records at `notifications/sweep.test.ts`.
      log: () => {},
    });

    const notified = await notifiedTicketIds();
    // THE DUE ARM (`:187`), with its control.
    expect(notified.has(LIVE_DUE), 'the live due ticket must be notified').toBe(true);
    expect(notified.has(DEAD_DUE), 'the deleted due ticket must NOT be notified').toBe(false);
    // THE STALE ARM (`:265`), with its control.
    expect(notified.has(LIVE_STALE), 'the live stale ticket must be notified').toBe(true);
    expect(notified.has(DEAD_STALE), 'the deleted stale ticket must NOT be notified').toBe(false);
    // A candidate count below 2 would mean an arm never selected at all, which
    // would make the two `false` assertions above vacuous.
    expect(report.dueCandidates).toBeGreaterThanOrEqual(1);
    expect(report.staleCandidates).toBeGreaterThanOrEqual(1);
    expect(report.delivered).toBeGreaterThanOrEqual(2);
  });

  /**
   * SITE 9 — `routes/builder-reads.ts:362` (`readStateOccupancy`).
   *
   * The number is the WHOLE workspace's, counted over tickets the caller may not
   * see — so a tombstone counted here is a screen promising work that no view
   * contains.
   */
  it('readStateOccupancy counts live tickets only', async () => {
    const def = await getWorkflowDefFromProjection(db.pool, WS, WF);
    expect(def).not.toBeNull();
    const counts = await readStateOccupancy(db.pool, WS, def as NonNullable<typeof def>);

    // `doing` holds FIVE rows in this fixture: LIVE_DUE and LIVE_STALE (LIVE,
    // on PROJECT_A) plus DEAD_DUE, DEAD_STALE and DEAD_ALONE (TOMBSTONES —
    // DEAD_ALONE is on PROJECT_B, and this reader is workspace-wide, not
    // project-scoped).
    //
    // So the filtered answer is 2 and the unfiltered one is 5. ⚠ The first
    // version of this assertion said 3: I had counted DEAD_ALONE as live because
    // it is the one dead ticket with no live twin, which is exactly the kind of
    // arithmetic a fixture should not be trusted to keep in a reader's head.
    // The number below is the one the code produced, and the comment names the
    // membership so the next reader can check it rather than re-derive it.
    expect(counts['doing']).toBe(2);
    expect(counts['todo']).toBe(0);
    // `done` holds LIVE_TERMINAL (live — it was closed by the case above, which
    // does not move `state_id`) and DEAD_TERMINAL (a tombstone). So 1 filtered
    // against 2 unfiltered. ⚠ The first version of this line said 0, which is
    // the same mistake as the `doing` count twice over: a number written from
    // the shape of the fixture rather than read off it.
    expect(counts['done']).toBe(1);

    // THE CONTROL, in the same case: the same two states read back from the
    // table with no predicate. `2` and `1` are one character apart from numbers
    // that would be wrong, so the pair is what pins them to a known MEMBERSHIP
    // rather than to a magnitude.
    const { rows } = await db.pool.query<{ state_id: string; n: string }>(
      'SELECT state_id, count(*) AS n FROM proj_tickets WHERE workspace_id = $1 AND workflow_id = $2 GROUP BY state_id',
      [WS, WF],
    );
    const all = new Map(rows.map((row) => [row.state_id, Number(row.n)]));
    expect(all.get('doing')).toBe(5);
    expect(all.get('done')).toBe(2);
    expect(all.get('todo')).toBeUndefined();
  });

  /**
   * SITE 10 — `routes/builder-reads.ts:438` (`readTypePopulation`).
   *
   * Same door, same reason: `"N tickets"` on the type list is the workspace's
   * number, not the caller's.
   */
  it('readTypePopulation counts live tickets only', async () => {
    const population = await readTypePopulation(db.pool, WS, TYPE_ID, WF);
    // SEVEN tickets in this fixture, FOUR of them tombstones (DEAD_TERMINAL,
    // DEAD_DUE, DEAD_STALE, DEAD_ALONE) — so the unfiltered answer is 7 and the
    // filtered one is 3. Two distant numbers, which is the point: a reader one
    // off would be invisible at 4-vs-3 and obvious here.
    expect(population).toBe(3);
    const { rows } = await db.pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM proj_tickets WHERE workspace_id = $1 AND type_id = $2 AND workflow_id = $3',
      [WS, TYPE_ID, WF],
    );
    expect(Number(rows[0]?.n)).toBe(7);
  });

  /**
   * SITE 2 — `read/workspace-counts.ts:226` (`ticketVisibleProjectIds`).
   *
   * *"A project whose only sight-into row is a soft-deleted ticket is not a
   * project they can see anything in"* — the function's own docblock states the
   * rule and then says, in its own words, **"No fixture separates the two
   * today; stated here rather than left as an absence."** This case is that
   * fixture. `PROJECT_B` exists for exactly this cell: it holds ONE ticket and
   * that ticket is a tombstone.
   */
  /**
   * SITE 15 — `routes/builder-reads.ts:504` (`readTicketCounts`).
   *
   * ⚠ **FOUND BY AN INDEPENDENT REVIEWER, AND THE FIRST ENUMERATION MISSED IT.**
   * The sweep this file's header publishes searched for the CONSTANT plus
   * `rollup.ts`'s longhand predicate, and stopped there — so a second longhand
   * predicate written on a DIFFERENT ALIAS (`k`, because this is the one builder
   * read whose `t` is already taken by `proj_ticket_types`) was invisible to it.
   * The reviewer mutated it and found it a SURVIVOR.
   *
   * That is the exact failure the header warns about one layer down: *the
   * universe is the bug*. A sweep is only as complete as the pattern it runs,
   * and "the constant" is not "the rule".
   *
   * The predicate is in the JOIN's ON clause rather than the WHERE, deliberately
   * — a LEFT JOIN whose job is to report ZERO for a type with no tickets — so a
   * WHERE on the right-hand alias would turn a zero into an absent row.
   */
  it('readTicketCounts counts live tickets only, on its own alias and in a LEFT JOIN', async () => {
    const counts = await readTicketCounts(db.pool, WS);
    // 3 live of 7, the same membership `readTypePopulation` reads through a
    // different query — two readers of one question, so a case per reader is
    // what keeps them from drifting apart.
    expect(counts[TYPE_ID]).toBe(3);
    // The control that makes `3` a membership rather than a magnitude: the raw
    // table holds all seven, four of them tombstones. A LEFT JOIN that dropped
    // the deleted rows by turning them into absent rows would redden HERE with
    // the type missing entirely, which is the failure the ON-clause placement
    // exists to prevent.
    const { rows } = await db.pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM proj_tickets WHERE workspace_id = $1 AND type_id = $2',
      [WS, TYPE_ID],
    );
    expect(Number(rows[0]?.n)).toBe(7);
  });

  it('ticketVisibleProjectIds drops a project whose only ticket is deleted', async () => {
    const ids = await ticketVisibleProjectIds(db.pool, await ownerEff(), OWNER, WS);
    // The control is `PROJECT_A`, which holds both live and deleted tickets and
    // must survive — so a function that returned an EMPTY set reddens here
    // rather than satisfying the `PROJECT_B` assertion by accident.
    expect(ids.has(PROJECT_A), 'PROJECT_A holds live tickets and must be in the set').toBe(true);
    expect(ids.has(PROJECT_B), 'PROJECT_B holds only a tombstone and must not be').toBe(false);
  });
});

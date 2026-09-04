import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DUE_SOON_DAYS, DEFAULT_STALE_DAYS } from '@gisik-nokma/domain';
import { isoDatePlusDays, resolveSweepWindows, runNotificationSweep } from '../../src/notifications/sweep.js';
import type { CanSeeFn } from '../../src/notifications/fanout.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
// Plan 5 Task 4's shared seeders: an event goes into the ledger AND through
// every registered projection, one transaction per event, exactly as ingest
// would. Settings are seeded HERE the way Plan 5's own attention tests seed
// them, so neither suite can pass against a mechanism the other does not use.
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';

let db: TestDatabase;

/**
 * ## THE ZONE DISCIPLINE OF THIS FILE, and exactly what it is worth
 *
 * This suite is about a day boundary, so it must never be able to pass because
 * the machine running it happens to already be in the calendar under test. Both
 * dev machines here ARE `Asia/Kolkata`; on main, zero of 48 test files vary
 * `TZ`, and the seven that are day-sensitive therefore cannot distinguish "the
 * code computes IST" from "the machine is already in IST". This file does not
 * add to that gap.
 *
 * Two devices, and they answer different questions:
 *
 *  1. **A file-wide forced non-IST zone** (`FILE_ZONE`, below). Every assertion
 *     in this file — boundaries, dedupe keys, settings, idempotence — runs with
 *     the process's local zone pinned somewhere that is NOT India. Nothing here
 *     can be green because the laptop agreed with it.
 *  2. **A per-zone loop over the boundary block** (`ZONES`). The two
 *     IST-midnight cases run once per zone, each in its own `it` so each gets a
 *     clean `beforeEach` and asserts exact row sets rather than an accumulation.
 *
 * ### What the zone axis CAN and CANNOT catch — stated where it is claimed
 *
 * Against the CORRECT implementation this axis cannot fail, and saying
 * otherwise would be an overclaim of the kind `apps/web/test/ist-today.test.ts`
 * already refuses in writing. `sweep.ts` reads an instant, hands it to
 * `istDayOf`, and `istDayOf` does constant +05:30 arithmetic and then reads
 * `getUTC*` only; `isoDatePlusDays` round-trips through `istDayBounds`/
 * `istDayOf`, likewise UTC-only. No local zone is consulted anywhere on the
 * path, so every zone below yields the identical day and the identical rows.
 *
 * Its teeth are the MUTATION, and the divergence is predicted rather than
 * hoped for. Replace `istDayOf(createdAt)` in `sweep.ts` with a local-clock
 * read (`now.getFullYear()/getMonth()/getDate()`) and the two instants below
 * are read as:
 *
 *   zone                    18:29Z            18:31Z
 *   Asia/Kolkata            23 (agrees)       24 (agrees)
 *   Pacific/Kiritimati +14  24 (DIVERGES)     24 (agrees)
 *   Pacific/Niue       −11  23 (agrees)       23 (DIVERGES)
 *
 * So under that mutation the cross-midnight case reddens under Kiritimati (both
 * claims notify on the first sweep) and under Niue (the 31 Aug claim never
 * arrives on the second), for opposite halves, and stays GREEN under
 * `Asia/Kolkata` — which is precisely why a suite that only ever runs in India
 * proves nothing here. Measured, not assumed: see the mutation log in the task
 * report. If Kiritimati stays green at 18:29Z under that mutation, the mutation
 * did not run.
 *
 * ### The limit `process.env.TZ` cannot reach, named
 *
 * `createTestDatabase` pins the DATABASE to Asia/Kolkata and `createPool` pins
 * every SESSION to it. `process.env.TZ` moves neither. This loop therefore
 * covers the Node-side day arithmetic ONLY: a `now()`, `CURRENT_DATE` or
 * `AT TIME ZONE` inside the sweep's SQL would be decided by the Postgres
 * session and no zone here would ever see it. The sweep's SQL contains none —
 * the due comparison is day-string against day-string and the staleness bind is
 * an explicit-offset ISO instant computed in Node — so this is a statement of
 * scope, not a defect being chased.
 */
const ZONES = ['Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Niue'] as const;
/** Deliberately NOT India: the whole file runs somewhere it cannot be flattered by. */
const FILE_ZONE = 'Pacific/Kiritimati';

let fileZoneRestore: string | undefined;
let fileZoneWasSet = false;

/**
 * Borrow the process's zone for the duration of one call and hand it back.
 *
 * The delete-when-unset restore is not fussiness: `= undefined` assigns the
 * STRING "undefined", which ICU resolves to GMT, silently switching every later
 * file in this worker to UTC — and only when TZ was unset, which is CI's
 * default.
 */
async function underZone<T>(zone: string, run: () => Promise<T>): Promise<T> {
  const original = process.env['TZ'];
  const wasSet = Object.hasOwn(process.env, 'TZ');
  process.env['TZ'] = zone;
  try {
    return await run();
  } finally {
    if (wasSet && original !== undefined) process.env['TZ'] = original;
    else delete process.env['TZ'];
  }
}

beforeAll(async () => {
  fileZoneWasSet = Object.hasOwn(process.env, 'TZ');
  fileZoneRestore = process.env['TZ'];
  process.env['TZ'] = FILE_ZONE;
  // A NO-OP under vitest's default `forks` pool, where every test FILE gets its
  // own process and `apply.ts`'s module-level seq maps start empty anyway. Kept
  // because it is also the thing that would be WRONG to omit under
  // `pool: 'threads'`, where those maps would be shared with whatever file ran
  // before this one — and stated rather than left silent, because clearing
  // state that belongs to every other suite importing the helper is not a
  // free action to leave unexplained. This suite's own numbering does not
  // depend on it either way: every `makeCommitted` call below passes an
  // explicit `seq`/`workspaceSeq` from the file-global counter.
  resetEntitySeqs();
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
  if (fileZoneWasSet && fileZoneRestore !== undefined) process.env['TZ'] = fileZoneRestore;
  else delete process.env['TZ'];
});

const WS = '01J9GWS0000000000000000000';
const OTHER_WS = '01J9GWS2000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const KIRO = '01J9GUKR000000000000000000';
const ANSELMA = '01J9GUAN000000000000000000';

/**
 * Frozen clock: 23 Aug 2026, 05:00 UTC — 10:30 IST, mid-morning of IST day
 * 2026-08-23. A `DEFAULT_DUE_SOON_DAYS` window from that IST day reaches 30 Aug.
 */
const NOW_INSTANT = '2026-08-23T05:00:00.000Z';

/**
 * Typed as `CanSeeFn` rather than cast: the cast the plan text used
 * (`as never`) is exactly what would hide the next cross-plan signature drift,
 * and this task already hit one on `getWorkflowDefFromProjection`.
 */
const seeEverything: CanSeeFn = async () => true;

/**
 * A gate that DENIES a named `${userId}:${ticketId}` pair and allows the rest —
 * the house pattern from `fanout.test.ts`'s `visible` set, inverted so the
 * default stays permissive and only the pair under test is refused.
 *
 * Every other test in this file passed `seeEverything`, so before this existed
 * the gate's FALSE branch was never taken on either loop and deleting the gate
 * outright from either one left the suite fully green (mutations M17a/M17b in
 * the task report). A visibility gate exists for the deny direction; an
 * allow-only fake exercises the seam and proves nothing about the decision.
 *
 * The leak it closes is concrete. `can-see.ts` states that "the explicit list
 * is exactly the authored list. Creator and assignee are not implicitly
 * appended" — so an assignee on an explicit-mode ticket that omits them is
 * DENIED, and an ungated sweep would post that person a row carrying the
 * ticket's title and the claim's note.
 */
function gateDenying(pairs: string[]): CanSeeFn {
  const denied = new Set(pairs);
  return async (_db, userId, ticketId) => !denied.has(`${userId}:${ticketId}`);
}

/**
 * What the sweep logged, per test.
 *
 * `deliverToAll` CATCHES every transport failure and reports it only through
 * this callback. With the `log: () => {}` this file used to pass, an assertion
 * that no notification arrived could not tell "correctly suppressed" from
 * "attempted, and the insert threw" — and that is not hypothetical: a mutation
 * during review deleted the null-assignee guard, every delivery hit a NOT NULL
 * violation on `user_id`, and the suite reported 30/30 green. Reads go through
 * `expectNoNotifications` below, which checks BOTH observables.
 */
let loggedProblems: Array<{ message: string; error?: unknown }> = [];

/**
 * The sweep at an arbitrary instant — the IST-boundary block drives it directly.
 * Note what is NOT here: a `windows` argument. The sweep has no threshold
 * parameter to pass, by design; a test that wants different windows claims them
 * with `seedWorkspaceSettings` below, the way an admin would.
 */
function sweepAt(instant: string, canSeeTicket: CanSeeFn = seeEverything) {
  return runNotificationSweep({
    pool: db.pool,
    transports: [createInAppTransport(db.pool)],
    canSeeTicket,
    now: () => new Date(instant),
    log: (message, error) => {
      loggedProblems.push({ message, error });
    },
  });
}

function sweep(canSeeTicket: CanSeeFn = seeEverything) {
  return sweepAt(NOW_INSTANT, canSeeTicket);
}

type SeedTicket = {
  ticketId: string;
  workspaceId?: string;
  stateId?: string;
  stateCategory?: 'open' | 'active' | 'terminal';
  assigneeId?: string | null;
  dueDate?: { date: string; note?: string } | null;
  title?: string;
};

async function seedTicket(t: SeedTicket): Promise<void> {
  const fields: Record<string, unknown> = {
    title: {
      value: t.title ?? 'Renew the DLT registration',
      actorId: KIRO,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
  };
  if (t.dueDate) {
    fields.dueDate = {
      value: t.dueDate,
      actorId: KIRO,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    };
  }
  // `workflow_version` and `transitions` are NOT NULL in the shipped
  // proj_tickets migration and the plan text's INSERT omits both — adapted, not
  // worked around: a ticket really does carry a workflow version and a (here
  // empty) transition log.
  await db.pool.query(
    `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, workflow_version, state_id, state_category, assignee_id, collaborator_ids, fields, transitions)
     VALUES ($1, $2, $3, 'task', NULL, 'wf-basic', 1, $4, $5, $6, '[]', $7, '[]')`,
    [t.ticketId, t.workspaceId ?? WS, PROJECT, t.stateId ?? 'doing', t.stateCategory ?? 'active', t.assigneeId ?? null, JSON.stringify(fields)],
  );
}

let seq = 0;

/**
 * Claim workspace settings the way an owner or admin would: a real
 * `workspace.settings_set` v1 event, through Plan 5's `applyCommitted`, which
 * runs it past every registered projection — so `proj_workspace_settings` ends
 * up holding exactly what a production claim would leave there, and
 * `getWorkspaceSettings` reads it back the same way the attention strip does.
 *
 * The explicit `seq`/`workspaceSeq` come from THIS suite's global counter
 * (`seedEnteredState` feeds from it too). `makeCommitted` would otherwise
 * allocate from its own module-level maps starting at 1 and collide with the
 * hand-seeded ledger rows on `UNIQUE (workspace_id, workspace_seq)`. One
 * counter, monotonic, shared — the same discipline `seedEnteredState`
 * documents below.
 */
async function seedWorkspaceSettings(
  payload: { staleDays?: number; dueSoonDays?: number },
  options: { workspaceId?: string; actorId?: string } = {},
): Promise<void> {
  const workspaceId = options.workspaceId ?? WS;
  seq += 1;
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      payload,
      actorId: options.actorId ?? KIRO,
      seq,
      workspaceSeq: seq,
    }),
  ]);
}

/**
 * The name `wf-basic` publishes for the `doing` state — deliberately unlike the
 * id in more than case. That gap is what lets the payload assertion tell the
 * resolved NAME from the id it was resolved by: with `SIMPLE_KANBAN_TEMPLATE`'s
 * own `'Doing'` the discriminator would have been a single capital letter, and
 * a one-character-case difference is a weak thing to rest a claim on.
 */
const DOING_STATE_NAME = 'Being worked on';

/**
 * Publish `wf-basic` v1 — the workflow every `seedTicket` row above says it is
 * on — as a real `workflow.defined` event through the same `applyCommitted`
 * path, so `proj_workflows` holds what a production publish would leave there
 * and `getWorkflowDefFromProjection` reads it back the way the engine does.
 *
 * Until this existed the sweep's ONLY assertion about Plan 2's reader was
 * `stateName: null` — the unresolved path — and the test's own comment admitted
 * why: no `workflow.defined` row was ever seeded. So the whole resolved branch
 * was dead to the suite: `?.name` could be `?.id` and the lookup could be
 * deleted outright and nothing reddened (M18/M18b). The state name is the part
 * of a stale-ticket notification a person actually reads.
 *
 * The envelope shape is `test/proj-workflows.test.ts`'s, and the counters come
 * from THIS suite's shared `seq` for the same reason `seedWorkspaceSettings`
 * documents: `makeCommitted`'s own maps start at 1 and would collide with the
 * hand-seeded ledger rows on `UNIQUE (workspace_id, workspace_seq)`.
 */
async function seedWorkflow(workspaceId: string = WS): Promise<void> {
  seq += 1;
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId,
      entity: { kind: 'workflow', id: 'wf-basic' },
      type: 'workflow.defined',
      payload: {
        id: 'wf-basic',
        version: 1,
        name: 'Basic',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'Not started', category: 'open' },
          { id: 'doing', name: DOING_STATE_NAME, category: 'active' },
          { id: 'done', name: 'Finished', category: 'terminal' },
        ],
        transitions: [
          { from: 'todo', to: 'doing', rules: [] },
          { from: 'doing', to: 'done', rules: [] },
        ],
      },
      actorId: KIRO,
      seq,
      workspaceSeq: seq,
    }),
  ]);
}

/**
 * Append a state-entering event straight into the ledger (append-only: inserts
 * are legal). The column list is Plan 1's: `events` carries BOTH counters —
 * `seq` (per entity, UNIQUE (entity_kind, entity_id, seq)) and `workspace_seq`
 * (per workspace, NOT NULL, UNIQUE (workspace_id, workspace_seq); coordination
 * §18). Real ingest assigns them inside the transaction under the workspace
 * advisory lock taken BEFORE the per-entity lock; a test seeder does not race
 * anyone, so one suite-global counter feeds both. It is monotonic, every row
 * here belongs to a single workspace at a time, and every ticket id is
 * distinct, so both unique constraints hold — and a ticket's later event always
 * carries the higher `seq`, which is what the sweep's per-entity
 * `ORDER BY e.seq DESC` reads.
 */
async function seedEnteredState(
  ticketId: string,
  serverTime: string,
  actorId: string,
  workspaceId: string = WS,
): Promise<void> {
  seq += 1;
  const id = `01J9GEVT00000000000000${String(seq).padStart(4, '0')}`.slice(0, 26);
  await db.pool.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, 'ticket', $3, 'ticket.transitioned', 1, $4, $5, 'web', $6, $7, $8, $9)`,
    [id, workspaceId, ticketId, JSON.stringify({ toStateId: 'doing' }), actorId, serverTime, serverTime, seq, seq],
  );
}

let ticketCounter = 0;

/** Fresh ULID-shaped ticket ids per test: the append-only events table cannot be truncated. */
function freshTicketId(): string {
  ticketCounter += 1;
  return `01J9GTKT00000000000000${String(ticketCounter).padStart(4, '0')}`.slice(0, 26);
}

/**
 * Index a result set with a real check.
 *
 * `rows[0]` is `T | undefined` under `noUncheckedIndexedAccess`, and a `!`
 * would turn "the sweep wrote no row" into `undefined.user_id` — a TypeError at
 * the assertion, naming nothing. This names what was expected and what came
 * back, so a silent sweep fails as a silent sweep.
 */
function at<T>(rows: T[], index: number): T {
  const row = rows[index];
  if (row === undefined) {
    throw new Error(`expected a notification row at index ${index}, but the sweep wrote ${rows.length}`);
  }
  return row;
}

/**
 * "Nothing was sent" asserted so that it cannot also mean "something was sent
 * and the write blew up".
 *
 * The row count alone is the weaker half: `deliverToAll` swallows a throwing
 * transport, so a sweep that ATTEMPTED a delivery and crashed leaves exactly
 * the same empty table as a sweep that correctly stayed silent. The log is the
 * other half of the observable, and it is checked here so every suppression
 * claim in this file gets both. Per-call rather than in an `afterEach`, because
 * `sweep.ts`'s malformed-claim branch logs LEGITIMATELY and a test written for
 * it must be free to expect a line.
 */
async function expectNoNotifications(kind?: string): Promise<void> {
  expect(await notificationRows(kind)).toHaveLength(0);
  expect(loggedProblems).toEqual([]);
}

async function notificationRows(kind?: string) {
  const result = kind
    ? await db.pool.query('SELECT user_id, kind, dedupe_key, payload FROM notifications WHERE kind = $1 ORDER BY id', [kind])
    : await db.pool.query('SELECT user_id, kind, dedupe_key, payload FROM notifications ORDER BY id');
  return result.rows as Array<{ user_id: string; kind: string; dedupe_key: string; payload: Record<string, unknown> }>;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  loggedProblems = [];
  await db.pool.query('DELETE FROM notifications');
  await db.pool.query('DELETE FROM proj_tickets');
  // Each test starts from an unclaimed workspace, so "the default" in these
  // tests always means the settings defaults the reader applies — never a
  // number this file remembers.
  await db.pool.query('DELETE FROM proj_workspace_settings');
  // And from a workspace that has published no workflow. The projection's
  // insert is `ON CONFLICT (workflow_id, version) DO NOTHING`, so one seeded
  // `wf-basic` v1 row would otherwise outlive its own test and resolve
  // `stateName` for every test declared after it — including the one that
  // asserts `stateName: null` because nothing was published. That test is now
  // true under any ordering rather than by luck.
  await db.pool.query('DELETE FROM proj_workflows');
});

describe('the zone knob itself', () => {
  it('CONTROL — this file really is running outside India, and process.env.TZ really moves this process', () => {
    // Without this, every zone claim below could be a no-op against a process
    // whose TZ assignment ICU quietly ignored. Measured at the very instant the
    // boundary block sweeps at — NOT at the Unix epoch, where Kiritimati was
    // still UTC−10:40 (it jumped the date line in 1995) and this control would
    // have asserted a false offset about a zone nobody runs a cron in.
    const AT = () => new Date(BEFORE_IST_MIDNIGHT); // 2026-08-23T18:29:00Z
    const localAt = (zone: string): { hour: number; day: number } => {
      const original = process.env['TZ'];
      const wasSet = Object.hasOwn(process.env, 'TZ');
      process.env['TZ'] = zone;
      const at = AT();
      const reading = { hour: at.getHours(), day: at.getDate() };
      if (wasSet && original !== undefined) process.env['TZ'] = original;
      else delete process.env['TZ'];
      return reading;
    };

    expect(process.env['TZ']).toBe(FILE_ZONE);
    expect(localAt('UTC')).toEqual({ hour: 18, day: 23 });
    expect(localAt('Asia/Kolkata')).toEqual({ hour: 23, day: 23 });
    expect(localAt('Pacific/Kiritimati')).toEqual({ hour: 8, day: 24 });
    expect(localAt('Pacific/Niue')).toEqual({ hour: 7, day: 23 });
    // The knob moves the DAY, not just the hour: that is the divergence the
    // boundary block's mutation is supposed to expose, proved here to be real.
    expect(localAt('Pacific/Kiritimati').day).not.toBe(localAt('Asia/Kolkata').day);
    expect(process.env['TZ']).toBe(FILE_ZONE);
  });

  it('CONTROL — a device-local reading of the two boundary instants really would land on different days', () => {
    // The divergence the zone loop is watching for, computed by arithmetic here
    // rather than by the TZ database and by nothing under test — which is what
    // makes the loop a test instead of a tautology.
    const naiveDayAt = (instant: string, offsetHours: number) =>
      new Date(Date.parse(instant) + offsetHours * 3_600_000).toISOString().slice(0, 10);
    expect(naiveDayAt('2026-08-23T18:29:00.000Z', 14)).toBe('2026-08-24'); // Kiritimati says the 24th
    expect(naiveDayAt('2026-08-23T18:29:00.000Z', 5.5)).toBe('2026-08-23'); // IST says the 23rd
    expect(naiveDayAt('2026-08-23T18:31:00.000Z', -11)).toBe('2026-08-23'); // Niue says the 23rd
    expect(naiveDayAt('2026-08-23T18:31:00.000Z', 5.5)).toBe('2026-08-24'); // IST says the 24th
  });

  it('the zone borrow hands the worker back exactly the TZ it took', async () => {
    await underZone('Pacific/Niue', async () => {
      expect(process.env['TZ']).toBe('Pacific/Niue');
    });
    expect(process.env['TZ']).toBe(FILE_ZONE);

    const outer = process.env['TZ'];
    delete process.env['TZ'];
    await underZone('Pacific/Niue', async () => {});
    expect(Object.hasOwn(process.env, 'TZ')).toBe(false);
    process.env['TZ'] = outer as string;
  });
});

describe('isoDatePlusDays', () => {
  it('adds across month boundaries', () => {
    expect(isoDatePlusDays('2026-08-23', 7)).toBe('2026-08-30');
    expect(isoDatePlusDays('2026-08-30', 7)).toBe('2026-09-06');
  });

  it('subtracts too — the staleness cut-off walks backwards from today', () => {
    expect(isoDatePlusDays('2026-08-23', -10)).toBe('2026-08-13');
    expect(isoDatePlusDays('2026-09-06', -7)).toBe('2026-08-30');
    expect(isoDatePlusDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('shifts a calendar day, and no zone the process is in changes the answer', async () => {
    for (const zone of ZONES) {
      await underZone(zone, async () => {
        expect(isoDatePlusDays('2026-08-23', 7), `zone ${zone}`).toBe('2026-08-30');
        expect(isoDatePlusDays('2026-02-28', 1), `zone ${zone}`).toBe('2026-03-01');
        expect(isoDatePlusDays('2026-01-01', -1), `zone ${zone}`).toBe('2025-12-31');
      });
    }
  });
});

describe('date-approaching', () => {
  it('notifies the assignee when a claimed date enters the window, with the claim verbatim', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA, dueDate: { date: '2026-08-30', note: 'GST filing' } });
    await sweep();
    const rows = await notificationRows('date-approaching');
    expect(rows).toHaveLength(1);
    expect(at(rows, 0).user_id).toBe(ANSELMA);
    expect(at(rows, 0).dedupe_key).toBe(`date-approaching:${ticketId}:2026-08-30`);
    // WHOLESALE, matching what the stale-ticket payload has always done.
    // Reaching into `.claim` alone left the two fields beside it unpinned:
    // `ticketTitle` and `field` could both be deleted from the payload and this
    // suite stayed green (M20). `ticketTitle` is the only words in the row —
    // an inbox entry without it says a date is approaching and never says on
    // what — and `field` is what tells `dueDate` from every other date claim a
    // ticket can carry.
    expect(at(rows, 0).payload).toEqual({
      ticketId,
      ticketTitle: 'Renew the DLT registration',
      field: 'dueDate',
      claim: {
        date: '2026-08-30',
        note: 'GST filing',
        actorId: KIRO,
        clientTime: '2026-08-19T10:00:00.000Z',
        serverTime: '2026-08-19T10:00:01.000Z',
      },
    });
  });

  it('running the sweep twice notifies once (planted defect: idempotence)', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await sweep();
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(1);
  });

  it('an undated ticket produces nothing — there is no date to approach (planted defect: the invented date is impossible)', async () => {
    await seedTicket({ ticketId: freshTicketId(), assigneeId: ANSELMA, dueDate: null });
    await sweep();
    await expectNoNotifications('date-approaching');
  });

  it('a claim beyond the window is not yet news', async () => {
    await seedTicket({ ticketId: freshTicketId(), assigneeId: ANSELMA, dueDate: { date: '2026-09-15' } });
    await sweep();
    await expectNoNotifications('date-approaching');
  });

  it('an already-passed claimed date still notifies once — overdue is inside the window, not past it', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA, dueDate: { date: '2026-08-20' } });
    await sweep();
    const rows = await notificationRows('date-approaching');
    expect(rows).toHaveLength(1);
    expect(at(rows, 0).dedupe_key).toBe(`date-approaching:${ticketId}:2026-08-20`);
  });

  it('a terminal ticket never notifies — done work has no approaching deadline', async () => {
    await seedTicket({ ticketId: freshTicketId(), stateCategory: 'terminal', stateId: 'done', assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await sweep();
    await expectNoNotifications('date-approaching');
  });

  it("an unassigned ticket notifies the claim's author — the person who claimed the date owns the caring", async () => {
    await seedTicket({ ticketId: freshTicketId(), assigneeId: null, dueDate: { date: '2026-08-30' } });
    await sweep();
    const rows = await notificationRows('date-approaching');
    expect(rows).toHaveLength(1);
    expect(at(rows, 0).user_id).toBe(KIRO);
  });

  /**
   * The gate is `state_category <> 'terminal'`, and that is NOT `= 'active'`.
   *
   * Three categories exist — `open`, `active`, `terminal` — and this suite
   * seeded only two of them, so narrowing the predicate to `= 'active'` left
   * every test green (M15). What that mutation silences is the commonest
   * ticket there is: `packages/domain/src/simple-kanban.ts` gives the shipped
   * default workflow a `todo` state whose category is **'open'**, so a ticket
   * someone just created with a due date next week sits in `open` and would
   * stop warning entirely.
   *
   * Asserted as one sweep over all three categories rather than as three
   * absence checks, because a set of keys distinguishes "the open one was
   * correctly included" from "the seed silently failed" — an empty table
   * cannot.
   */
  it("an OPEN ticket's claimed date still approaches — the gate is 'not terminal', which is not 'active'", async () => {
    const open = freshTicketId();
    const active = freshTicketId();
    const terminal = freshTicketId();
    await seedTicket({ ticketId: open, stateId: 'todo', stateCategory: 'open', assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await seedTicket({ ticketId: active, stateId: 'doing', stateCategory: 'active', assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await seedTicket({ ticketId: terminal, stateId: 'done', stateCategory: 'terminal', assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await sweep();
    const keys = (await notificationRows('date-approaching')).map((row) => row.dedupe_key);
    // Sorted: the sweep's SELECT has no ORDER BY, so WHICH of the two arrives
    // first is not a fact this test is entitled to pin — only which two.
    expect(keys.slice().sort()).toEqual(
      [`date-approaching:${open}:2026-08-30`, `date-approaching:${active}:2026-08-30`].sort(),
    );
  });

  /**
   * THE DENY DIRECTION, which is the only direction a visibility gate exists
   * for. Every other test in this file hands the sweep `seeEverything`, so
   * before this test the gate at `sweep.ts`'s date-approaching loop could be
   * DELETED and all 30 tests stayed green (M17a).
   *
   * Both tickets are candidates and one is refused, so the report's counters
   * come apart here in a way no green-path test can make them: `dueCandidates`
   * counts rows read out of `proj_tickets`, `delivered` counts rows that got
   * past the gate. An implementation that incremented `delivered` alongside the
   * candidate — or one that returned zeros for the whole report (M21) — passes
   * every other assertion in this file and fails this one.
   */
  it('a target who cannot SEE the ticket is told nothing about its date, and the report says so', async () => {
    const refused = freshTicketId();
    const permitted = freshTicketId();
    await seedTicket({ ticketId: refused, assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await seedTicket({ ticketId: permitted, assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    const report = await sweep(gateDenying([`${ANSELMA}:${refused}`]));
    expect((await notificationRows('date-approaching')).map((row) => row.dedupe_key)).toEqual([
      `date-approaching:${permitted}:2026-08-30`,
    ]);
    expect(report).toEqual({ dueCandidates: 2, staleCandidates: 0, delivered: 1 });
  });

  /**
   * WHICH PERSON the date-approaching gate is asked about, on the branch where
   * that is not the assignee.
   *
   * The target is `row.assignee_id ?? claim.data.actorId`, and the test above
   * seeds an assignee — so it witnesses only the first half of that `??`. Ask
   * the gate about `row.assignee_id ?? ''` instead of the target and every one
   * of the 36 tests stayed green (M17d): the unassigned test hands the sweep a
   * permissive gate, which says yes to the empty string as readily as to
   * anyone. The recipient is still the claim's author, so the sweep would post
   * a title and a note to someone it never asked about.
   *
   * The stale loop has no matching hole — its recipient is `row.assignee_id`
   * and its `entered_by` is a different person in the fixture above, so
   * swapping the gate's user argument to `row.entered_by` already reddens
   * (M17e). This test is what makes the two loops equally covered.
   */
  it("the gate is asked about the person who will RECEIVE it — for an unassigned ticket that is the claim's author, not the absent assignee", async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: null, dueDate: { date: '2026-08-30' } });
    // KIRO authored the claim (`seedTicket` stamps every field with him), so
    // KIRO is who this row would be addressed to, and KIRO is who is refused.
    const report = await sweep(gateDenying([`${KIRO}:${ticketId}`]));
    await expectNoNotifications('date-approaching');
    expect(report).toEqual({ dueCandidates: 1, staleCandidates: 0, delivered: 0 });
  });
});

describe('stale-ticket', () => {
  it('notifies the assignee when an active state outlives the threshold, attributing who moved it there', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO); // IST day 2026-08-01, 22 IST days back — past the unclaimed workspace's DEFAULT_STALE_DAYS
    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(1);
    expect(at(rows, 0).user_id).toBe(ANSELMA);
    expect(at(rows, 0).dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-01T09:00:00.000Z`);
    expect(at(rows, 0).payload).toEqual({
      ticketId,
      ticketTitle: 'Renew the DLT registration',
      stateId: 'doing',
      // No workflow.defined row seeded (and `beforeEach` now DELETEs
      // proj_workflows, so that is true under any ordering rather than by
      // luck) — the name is honestly unresolvable and the id is always
      // present. The resolved path is pinned by its own test below.
      stateName: null,
      enteredAt: '2026-08-01T09:00:00.000Z',
      enteredBy: KIRO,
    });
  });

  /**
   * PLAN 2's `getWorkflowDefFromProjection` is a DECLARED CONSUMED INTERFACE of
   * this task, and until this test the only thing the suite ever saw it return
   * was `null` — the branch where nothing was published. So `?.name` could be
   * `?.id` (M18) and the lookup could be deleted entirely for a hardcoded
   * `null` (M18b) and nothing reddened. The state NAME is what a person reads
   * in their inbox; `doing` is not an answer to "where is this stuck?".
   *
   * The published name is `'Being worked on'` and the state id is `'doing'`,
   * which is what makes this assertion able to tell the two apart: had the
   * fixture used `SIMPLE_KANBAN_TEMPLATE`'s own `'Doing'`, the discriminator
   * would have been one capital letter.
   */
  it("names the state from Plan 2's published workflow — the inbox says WHERE a ticket is stuck, not an opaque id", async () => {
    await seedWorkflow();
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO);
    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(1);
    expect(at(rows, 0).payload).toEqual({
      ticketId,
      ticketTitle: 'Renew the DLT registration',
      stateId: 'doing',
      // Written out rather than referencing DOING_STATE_NAME: the whole point
      // is that a reader sees `stateId: 'doing'` and `stateName: 'Being worked
      // on'` one line apart and can tell at a glance which one the sweep
      // resolved. `?.id` in place of `?.name` would put 'doing' on both lines.
      stateName: 'Being worked on',
      enteredAt: '2026-08-01T09:00:00.000Z',
      enteredBy: KIRO,
    });
  });

  /**
   * THE RANGE IS CLOSED AT BOTH ENDS, and it was not.
   *
   * The two "fresh" fixtures in this file sit 3 and 22 IST days from the
   * boundary — one comfortably inside, one comfortably outside, and neither
   * one day INSIDE it. So widening the threshold by a day (nagging a full IST
   * day EARLY) left every test green (M2), while narrowing it reddened three
   * (M3). A range gated at one end is half a range.
   *
   * The arithmetic, at the unclaimed default of DEFAULT_STALE_DAYS = 7 and
   * today = IST day 2026-08-23: the cut-off DAY is 2026-08-16, and
   * `istDayBounds` makes the comparison a strict `<` against its `endUtc`,
   * 2026-08-16T18:30:00.000Z.
   *
   *   entered 2026-08-16T09:00Z (14:30 IST, 16 Aug) -> before endUtc -> STALE
   *   entered 2026-08-17T09:00Z (14:30 IST, 17 Aug) -> after  endUtc -> FRESH
   *
   * They are ADJACENT IST days, so moving the threshold by one in EITHER
   * direction moves one of them across: -6 makes the 17th stale (two rows),
   * -8 makes the 16th fresh (no rows). That is the shape the approaching
   * horizon already had, copied.
   */
  it('the staleness range is closed at BOTH ends — the last stale IST day nags and the first fresh one does not', async () => {
    const lastStaleDay = freshTicketId();
    const firstFreshDay = freshTicketId();
    await seedTicket({ ticketId: lastStaleDay, assigneeId: ANSELMA });
    await seedTicket({ ticketId: firstFreshDay, assigneeId: ANSELMA });
    await seedEnteredState(lastStaleDay, '2026-08-16T09:00:00.000Z', KIRO);
    await seedEnteredState(firstFreshDay, '2026-08-17T09:00:00.000Z', KIRO);
    await sweep();
    expect((await notificationRows('stale-ticket')).map((row) => row.dedupe_key)).toEqual([
      `stale-ticket:${lastStaleDay}:doing:2026-08-16T09:00:00.000Z`,
    ]);
  });

  /**
   * Only an ACTIVE state goes stale, and the two categories that do not are
   * pinned in the SAME sweep as the one that does.
   *
   * Widening the gate from `= 'active'` to `<> 'terminal'` used to leave every
   * test green (M16), because no test ever seeded an `'open'` ticket at all —
   * and `open` is where the shipped default workflow's `todo` sits. That
   * mutation starts nagging people about tickets nobody has picked up yet,
   * which is a queue, not a stall. The terminal half was only half pinned too:
   * the suite proved a terminal ticket has no approaching DATE and never that
   * it goes un-nagged for sitting still.
   *
   * All three entered the same state on the same instant, 22 IST days back, so
   * the ONLY thing separating them is the category — and the assertion is the
   * exact key set, which an empty-table check could never be.
   */
  it('only ACTIVE states go stale — an open ticket is waiting, not stuck, and a terminal one is finished', async () => {
    const open = freshTicketId();
    const active = freshTicketId();
    const terminal = freshTicketId();
    await seedTicket({ ticketId: open, stateId: 'todo', stateCategory: 'open', assigneeId: ANSELMA });
    await seedTicket({ ticketId: active, stateId: 'doing', stateCategory: 'active', assigneeId: ANSELMA });
    await seedTicket({ ticketId: terminal, stateId: 'done', stateCategory: 'terminal', assigneeId: ANSELMA });
    for (const ticketId of [open, active, terminal]) {
      await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO);
    }
    await sweep();
    expect((await notificationRows('stale-ticket')).map((row) => row.dedupe_key)).toEqual([
      `stale-ticket:${active}:doing:2026-08-01T09:00:00.000Z`,
    ]);
  });

  /**
   * The deny direction on the OTHER loop — deleting the stale loop's gate was
   * its own surviving mutation (M17b), and the leak it opens is the worse of
   * the two: the stale payload carries the ticket's title AND the id and name
   * of the state it is sitting in.
   *
   * Same report reasoning as the date-approaching deny test: two candidates,
   * one delivery.
   */
  it('an assignee who cannot SEE the ticket is not nagged about it, and the report says so', async () => {
    const refused = freshTicketId();
    const permitted = freshTicketId();
    await seedTicket({ ticketId: refused, assigneeId: ANSELMA });
    await seedTicket({ ticketId: permitted, assigneeId: ANSELMA });
    await seedEnteredState(refused, '2026-08-01T09:00:00.000Z', KIRO);
    await seedEnteredState(permitted, '2026-08-01T09:00:00.000Z', KIRO);
    const report = await sweep(gateDenying([`${ANSELMA}:${refused}`]));
    expect((await notificationRows('stale-ticket')).map((row) => row.dedupe_key)).toEqual([
      `stale-ticket:${permitted}:doing:2026-08-01T09:00:00.000Z`,
    ]);
    expect(report).toEqual({ dueCandidates: 0, staleCandidates: 2, delivered: 1 });
  });

  it('a fresh active ticket is not stale', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-20T09:00:00.000Z', KIRO); // 3 days
    await sweep();
    await expectNoNotifications('stale-ticket');
  });

  it('an unassigned stale ticket sends nothing — the read-time attention strip owns it', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: null });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO);
    await sweep();
    await expectNoNotifications('stale-ticket');
  });

  it('re-running after the notification does not re-nag; a NEW entry into the same state may', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO);
    await sweep();
    await sweep();
    expect(await notificationRows('stale-ticket')).toHaveLength(1);
    // The ticket leaves and re-enters doing much earlier; the latest entering event wins.
    await seedEnteredState(ticketId, '2026-08-05T09:00:00.000Z', ANSELMA);
    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(2);
    // Positional, not `toContain`: the new entry must be the SECOND row.
    // `notificationRows` orders by id, ids are time-ordered ULIDs, and the
    // third sweep ran last — so "which row is the new nag" is a fact this
    // assertion is entitled to pin, and a set-membership check would not.
    expect(at(rows, 1).dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-05T09:00:00.000Z`);
    expect(at(rows, 0).dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-01T09:00:00.000Z`);
  });
});

/**
 * PLANTED DEFECT — the day boundary, run once per zone.
 *
 * 18:29:00Z is 23:59 IST on 2026-08-23; 18:31:00Z is 00:01 IST on 2026-08-24.
 * Same UTC date, different IST days. A sweep that took its "today" from a UTC
 * slice of the timestamp (`now.toISOString().slice(0, 10)`) would answer
 * '2026-08-23' at BOTH instants, because a UTC day does not roll until 05:30
 * IST. A sweep that took it from the LOCAL clock would answer whatever the
 * machine believes — the 24th at 18:29Z in Kiritimati, the 23rd at 18:31Z in
 * Niue. Two things then go wrong, and this block catches both:
 *
 *  1. The 31 Aug claim — which enters the 7-day window the moment the IST day
 *     becomes the 24th — would stay silent all night and only be noticed
 *     after 05:30 IST. A day late, silently, for exactly the claims that just
 *     became due-soon.
 *  2. The 30 Aug claim, already inside the window at both instants, must
 *     notify EXACTLY ONCE across the pair. Its dedupe key embeds the claimed
 *     day, so this holds as long as consecutive runs derive their days from
 *     the same facts. It is the idempotence guarantee above, restated at the
 *     one moment a shifting boundary could break it.
 *
 * `describe.each` and not a `for` loop inside one `it`: these cases assert
 * exact row sets and exact lengths, and three zones sharing one test body would
 * accumulate rows and fail for a reason that has nothing to do with time.
 */
const BEFORE_IST_MIDNIGHT = '2026-08-23T18:29:00.000Z'; // 23:59 IST, 23 Aug
const AFTER_IST_MIDNIGHT = '2026-08-23T18:31:00.000Z'; // 00:01 IST, 24 Aug

describe.each(ZONES)('the sweep window is an IST day, and a sweep across IST midnight proves it [TZ=%s]', (zone) => {
  it('one claim, two sweeps either side of IST midnight, exactly one notification — and the next IST day brings its own', async () => {
    const inWindowBoth = freshTicketId();
    const entersOnTheNextIstDay = freshTicketId();
    // 30 Aug is 7 days from IST-day 23 Aug: inside the window at both instants.
    await seedTicket({ ticketId: inWindowBoth, assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    // 31 Aug is 8 days from IST-day 23 Aug and 7 from IST-day 24 Aug: it enters
    // the window precisely when the IST day turns over, and not before.
    await seedTicket({ ticketId: entersOnTheNextIstDay, assigneeId: ANSELMA, dueDate: { date: '2026-08-31' } });

    await underZone(zone, () => sweepAt(BEFORE_IST_MIDNIGHT));
    const afterFirst = await notificationRows('date-approaching');
    expect(afterFirst.map((row) => row.dedupe_key), `zone ${zone}`).toEqual([`date-approaching:${inWindowBoth}:2026-08-30`]);

    await underZone(zone, () => sweepAt(AFTER_IST_MIDNIGHT));
    const afterSecond = await notificationRows('date-approaching');
    // The 30 Aug claim did NOT notify a second time — the boundary moved, the key did not.
    expect(afterSecond.filter((row) => row.dedupe_key === `date-approaching:${inWindowBoth}:2026-08-30`), `zone ${zone}`).toHaveLength(1);
    // The 31 Aug claim got its own notification, on the IST day it became news.
    expect(afterSecond.filter((row) => row.dedupe_key === `date-approaching:${entersOnTheNextIstDay}:2026-08-31`), `zone ${zone}`).toHaveLength(1);
    expect(afterSecond, `zone ${zone}`).toHaveLength(2);
  });

  it('PLANTED DEFECT: the staleness cut-off is an IST day count, not a millisecond subtraction from the cron clock', async () => {
    // Nothing is claimed for this workspace, so the threshold is the settings
    // default — DEFAULT_STALE_DAYS, which the owner approved at 7. The sweep
    // runs at 00:01 IST on 24 Aug, so today is IST day 2026-08-24 and the
    // cut-off day is 2026-08-17, whose half-open bounds END at
    // 2026-08-17T18:30:00.000Z. The ticket entered at 2026-08-17T09:00:00.000Z
    // — 14:30 IST on IST day 2026-08-17 — which is exactly DEFAULT_STALE_DAYS
    // IST days back, so it IS stale.
    //
    // A raw `now.getTime() - staleDays * 86_400_000` would put the cut-off at
    // 2026-08-16T18:31:00.000Z and call this ticket fresh, because 6 days
    // 23 hours 29 minutes is not 7 x 24 h. A day count is a statement about
    // the calendar the user reads, not about the second the scheduler happened
    // to fire — and under the raw subtraction the answer would move every time
    // cron drifts. This block is about the BOUNDARY, not about the number: it
    // deliberately runs on the unclaimed default so the day arithmetic is the
    // only thing under test.
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-17T09:00:00.000Z', KIRO);
    await underZone(zone, () => sweepAt(AFTER_IST_MIDNIGHT));
    const rows = await notificationRows('stale-ticket');
    expect(rows, `zone ${zone}`).toHaveLength(1);
    expect(at(rows, 0).dedupe_key, `zone ${zone}`).toBe(`stale-ticket:${ticketId}:doing:2026-08-17T09:00:00.000Z`);
  });
});

describe('the sweep windows ARE the workspace settings — one origin, not two', () => {
  it('an unclaimed workspace sweeps on the settings defaults — the same two the attention strip shows', async () => {
    const windows = await resolveSweepWindows(db.pool, WS);
    // The mapping, asserted rather than described: approaching IS dueSoonDays,
    // staleness IS staleDays. No number is written down on either side of this
    // expectation — both come from the domain module Plan 5 owns.
    expect(windows).toEqual({
      approachingWindowDays: DEFAULT_DUE_SOON_DAYS,
      stalenessThresholdDays: DEFAULT_STALE_DAYS,
    });
  });

  it('a claimed workspace resolves to what the admin claimed, mapped concept for concept', async () => {
    await seedWorkspaceSettings({ staleDays: 3, dueSoonDays: 21 });
    expect(await resolveSweepWindows(db.pool, WS)).toEqual({
      approachingWindowDays: 21,
      stalenessThresholdDays: 3,
    });
  });

  /**
   * PLANTED DEFECT — the two-sources-of-truth defect this task exists to close.
   *
   * An admin narrows the workspace's staleness threshold to 3 days. A ticket
   * that has sat in an active state for 5 IST days is now stale BY THE
   * WORKSPACE'S OWN DEFINITION, and the sweep must say so.
   *
   * This test fails against every implementation that keeps its own number:
   *   - a private staleness constant in the sweep (the fortnight-long default
   *     this task deleted) -> cut-off day 2026-08-09, the ticket reads fresh,
   *     no row;
   *   - the settings DEFAULT applied without reading the claim -> cut-off day
   *     2026-08-16, the ticket reads fresh, no row.
   * It passes only if the sweep read `staleDays` out of proj_workspace_settings
   * for THIS workspace. That is the whole point: the board flags a ticket stale
   * and the inbox says so on the same day, because there is one number.
   */
  it("PLANTED DEFECT: an admin who narrows staleDays makes the sweep nag sooner — the threshold is the workspace's claim, never a constant in the sweep", async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    // 5 IST days before IST day 2026-08-23: fresh under any default, stale
    // under the claimed 3.
    await seedEnteredState(ticketId, '2026-08-18T09:00:00.000Z', KIRO);

    await sweep();
    await expectNoNotifications('stale-ticket'); // unclaimed: the default holds it back

    await seedWorkspaceSettings({ staleDays: 3 }, { actorId: KIRO });
    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(1);
    expect(at(rows, 0).user_id).toBe(ANSELMA);
    expect(at(rows, 0).dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-18T09:00:00.000Z`);
  });

  it('PLANTED DEFECT: an admin who widens staleDays silences a ticket the default would have flagged — the setting moves the sweep in both directions', async () => {
    await seedWorkspaceSettings({ staleDays: 30 });
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO); // 22 IST days: stale under the default, fresh under 30
    await sweep();
    await expectNoNotifications('stale-ticket');
  });

  it("the approaching window is the workspace's dueSoonDays — narrowing it holds back a claim the default would have warned about", async () => {
    await seedWorkspaceSettings({ dueSoonDays: 2 });
    await seedTicket({ ticketId: freshTicketId(), assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await sweep();
    await expectNoNotifications('date-approaching'); // horizon 2026-08-25, the claim is beyond it

    await seedWorkspaceSettings({ dueSoonDays: 21 });
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(1); // horizon 2026-09-13, the claim is inside it
  });

  it("PLANTED DEFECT: each workspace gets ITS OWN settings — one server-wide sweep is not one workspace's thresholds applied to everyone", async () => {
    await seedWorkspaceSettings({ staleDays: 3 }, { workspaceId: WS });
    await seedWorkspaceSettings({ staleDays: 30 }, { workspaceId: OTHER_WS });

    const nagged = freshTicketId();
    const spared = freshTicketId();
    await seedTicket({ ticketId: nagged, workspaceId: WS, assigneeId: ANSELMA });
    await seedTicket({ ticketId: spared, workspaceId: OTHER_WS, assigneeId: ANSELMA });
    // The SAME entry instant in both workspaces — 22 IST days back. Stale under
    // WS's claimed 3, fresh under OTHER_WS's claimed 30. A sweep that read
    // settings once and reused them would get exactly one of these wrong.
    await seedEnteredState(nagged, '2026-08-01T09:00:00.000Z', KIRO, WS);
    await seedEnteredState(spared, '2026-08-01T09:00:00.000Z', KIRO, OTHER_WS);

    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows.map((row) => row.dedupe_key)).toEqual([
      `stale-ticket:${nagged}:doing:2026-08-01T09:00:00.000Z`,
    ]);
  });

  it('settings are read once per workspace, not once per ticket — a sweep must not query them per row', async () => {
    await seedWorkspaceSettings({ staleDays: 3 }, { workspaceId: WS });
    await seedWorkspaceSettings({ staleDays: 3 }, { workspaceId: OTHER_WS });
    for (const workspaceId of [WS, OTHER_WS]) {
      for (let i = 0; i < 3; i += 1) {
        const ticketId = freshTicketId();
        await seedTicket({ ticketId, workspaceId, assigneeId: ANSELMA, dueDate: { date: '2026-08-25' } });
        await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO, workspaceId);
      }
    }

    // Spy AFTER seeding: applyCommitted's projection write touches
    // proj_workspace_settings too, and counting it would flatter the result.
    const querySpy = vi.spyOn(db.pool, 'query');
    await sweep();
    const settingsReads = querySpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('proj_workspace_settings'),
    );
    // Two workspaces, six tickets, twelve notifications — and exactly two reads
    // of the thresholds. Per-ticket resolution would show six.
    expect(settingsReads).toHaveLength(2);
    expect(await notificationRows()).toHaveLength(12);
  });
});

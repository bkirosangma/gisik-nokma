import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { istDayBounds, newUlid, SYSTEM_ACTOR_AUTO_CLOSE } from '@gisik-nokma/domain';
import { runAutoCloseSweep } from '../../src/auto-close/sweep.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Task 8 (backlog/closed spec §8.2, second wave 2026-09-18) — the auto-close
 * sweep: a ticket that has SAT in a terminal state for the workspace's
 * `autoCloseAfterDays` is closed by the reserved system actor, through the
 * ingest door, and a ticket somebody explicitly reopened is not.
 *
 * ## Why every case builds its own database
 *
 * The report's counters are GLOBAL — `workspacesOn` counts every workspace with
 * auto-close on, and `candidates`/`closed`/`refused` count every ticket the run
 * touched. A shared database would make each case's arithmetic depend on which
 * cases ran before it, and the honest fix is a world per case rather than an
 * assertion weakened to survive its neighbours' residue. The events table is
 * append-only and cannot be truncated (3.7), so a shared database could not be
 * reset either. One `createTestDatabase()` per case, dropped afterwards, and
 * every count below is a fact about a world this case built.
 *
 * ## The zone discipline, and exactly what it is worth
 *
 * The cutoff is IST-day arithmetic — `istDayBounds(isoDatePlusDays(todayIst,
 * -N)).endUtc` — so a case that ran only in India could not tell "the code
 * computes IST" from "the machine is already in IST". This file therefore pins
 * the process zone to a NON-India zone for its whole life (the same device
 * `notifications/sweep.test.ts` uses and for the same reason), and 13.727
 * carries the two instants that straddle an IST midnight so a local-clock read
 * is a red rather than a coincidence.
 *
 * ## What the zone pin does NOT reach, and the case that does
 *
 * `process.env.TZ` moves the PROCESS's calendar. It cannot touch a
 * `clientTime.slice(0, 10)`, because a UTC slice never consults the process
 * zone — so a whole class of IST-vs-UTC regression is invisible to the zone
 * axis, and the file's non-India `TZ` gives it no protection at all. Measured:
 * substituting that slice for `istDayOf(clientTime)` **survived every case in
 * this file** until 13.727's rollover arm supplied a `now` inside 18:30Z–24:00Z,
 * where the UTC date and the IST date differ. That arm — not the `TZ` pin — is
 * what kills it.
 *
 * **Its limit, stated rather than implied:** `process.env.TZ` moves Node, not
 * Postgres. `createTestDatabase` pins the database and `createPool` pins every
 * session to `Asia/Kolkata`. A `now()`, `CURRENT_DATE` or `AT TIME ZONE` in the
 * sweep's SQL would be decided by the session and no zone here would see it.
 * The sweep's SQL contains none — the comparison is a `timestamptz` against an
 * explicitly-offset ISO instant computed in Node — so this is a statement of
 * scope, not a defect being chased.
 */
const FILE_ZONE = 'Pacific/Kiritimati';
let fileZoneRestore: string | undefined;
let fileZoneWasSet = false;

const PROJECT = '01J9GPRJ000000000000000000';
const TYPE_ID = 'ac-sweep-task';
const WF = 'wf-ac';
const HUMAN = '01J9GUKR000000000000000000';

/** 2026-09-18 12:00Z = 17:30 IST, mid-evening of IST day 2026-09-18. */
const NOW = '2026-09-18T12:00:00.000Z';
/** The workspace's window, in IST days. */
const DAYS = 7;
/**
 * `istDayBounds(isoDatePlusDays('2026-09-18', -7)).endUtc`, MEASURED against
 * the real domain helpers before it was written down — not arithmetic done in
 * the author's head. The sweep's predicate is a strict `<` against it, so the
 * interval is half-open and this instant belongs to the NEXT day: a ticket whose
 * last state-entering event is exactly `CUTOFF` is NOT a candidate.
 */
const CUTOFF = '2026-09-11T18:30:00.000Z';
/** One millisecond earlier — the last instant of IST 11 Sep, and a candidate. */
const JUST_INSIDE = '2026-09-11T18:29:59.999Z';

let db: TestDatabase;

beforeAll(() => {
  fileZoneWasSet = Object.hasOwn(process.env, 'TZ');
  fileZoneRestore = process.env['TZ'];
  process.env['TZ'] = FILE_ZONE;
});

afterAll(async () => {
  if (fileZoneWasSet && fileZoneRestore !== undefined) process.env['TZ'] = fileZoneRestore;
  else delete process.env['TZ'];
});

beforeEach(async () => {
  // `makeCommitted`'s seq maps are module-level; this suite allocates from them
  // rather than from a shared counter (it never hand-inserts ledger rows), so
  // each case starts numbering at 1 in a database that is empty. A no-op under
  // vitest's default `forks` pool, kept because it is the thing that would be
  // WRONG to omit under `pool: 'threads'`.
  resetEntitySeqs();
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.drop();
});

/**
 * Publish the workflow and the type every ticket in this file is created under.
 *
 * `suffix` exists because a case that seeds TWO workspaces needs two DISTINCT
 * workflow ids: `proj_workflows` is keyed by the workflow's own id, so a second
 * workspace publishing `wf-ac` collides with the first and the ticket projection
 * refuses with "holds no version at workspace_seq 1". One workspace per case
 * never noticed; the two-window case does, which is the case earning its keep
 * before it even ran green.
 */
async function seedWorkflowAndType(workspaceId: string, suffix = ''): Promise<void> {
  const wfId = `${WF}${suffix}`;
  const typeId = `${TYPE_ID}${suffix}`;
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId,
      actorId: HUMAN,
      entity: { kind: 'workflow', id: wfId },
      type: 'workflow.defined',
      payload: {
        id: wfId,
        version: 1,
        name: 'Auto-close flow',
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
      workspaceId,
      actorId: HUMAN,
      entity: { kind: 'ticket-type', id: typeId },
      type: 'ticket-type.defined',
      payload: { id: typeId, name: 'Sweep task', icon: 'check', rank: 1, workflowId: wfId, fields: [] },
    }),
  ]);
}

/** Claim the workspace's auto-close window the way an admin would. */
async function seedAutoClose(workspaceId: string, days: number | null): Promise<void> {
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId,
      actorId: HUMAN,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      payload: { autoCloseAfterDays: days },
    }),
  ]);
}

type SeedTicket = {
  workspaceId: string;
  /**
   * Defaults to this file's one type. A case that seeds TWO workspaces must pass
   * the suffix it gave `seedWorkflowAndType`, because `proj_ticket_types` is
   * keyed by the type's own id: creating a ticket under a type nothing defined
   * makes `applyTicketEvent` throw "unknown ticket type" inside the projection.
   */
  typeSuffix?: string;
  /** The `server_time` of the LAST state-entering event — what the sweep's LATERAL reads. */
  enteredAt: string;
  /** `'active'` for a ticket that never reached a terminal column. */
  state?: 'done' | 'doing';
  /** When set, a `ticket.closed` is appended after the ticket reached `done`. */
  closedAt?: string;
  /** When set, a `ticket.reopened` is appended after the close. */
  reopenedAt?: string;
};

/**
 * One ticket, driven through the REAL projection with explicit server times.
 *
 * Every event goes through `applyCommitted`, so `proj_tickets` holds what a
 * production history would leave there — `state_category`, `closed_at` and
 * `reopened_at` are all real columns written by the real projection, not values
 * a test wrote into the row behind the code's back. That matters more here than
 * usual: the sweep's predicate reads exactly those columns, so a ticket
 * assembled by hand would let the sweep under test and the fixture agree on a
 * world the projection never produces.
 */
async function seedTicket(opts: SeedTicket): Promise<string> {
  const ticketId = newUlid();
  const state = opts.state ?? 'done';
  const events = [
    makeCommitted({
      workspaceId: opts.workspaceId,
      actorId: HUMAN,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.created',
      payload: {
        typeId: `${TYPE_ID}${opts.typeSuffix ?? ''}`,
        projectId: PROJECT,
        parentId: null,
        title: `Sweep target ${ticketId.slice(-4)}`,
        start: 'focus',
      },
      serverTime: '2026-08-01T00:00:00.000Z',
    }),
  ];
  if (state === 'done') {
    events.push(
      makeCommitted({
        workspaceId: opts.workspaceId,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'doing' },
        serverTime: '2026-08-01T00:05:00.000Z',
      }),
      makeCommitted({
        workspaceId: opts.workspaceId,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
        serverTime: opts.enteredAt,
      }),
    );
  } else {
    // `doing`, and `enteredAt` is the transition INTO it: the last
    // state-entering event, so the sweep sees this ticket as active-but-old.
    events.push(
      makeCommitted({
        workspaceId: opts.workspaceId,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.transitioned',
        payload: { to: 'doing' },
        serverTime: opts.enteredAt,
      }),
    );
  }
  if (opts.closedAt !== undefined) {
    events.push(
      makeCommitted({
        workspaceId: opts.workspaceId,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.closed',
        payload: {},
        serverTime: opts.closedAt,
      }),
    );
  }
  if (opts.reopenedAt !== undefined) {
    events.push(
      makeCommitted({
        workspaceId: opts.workspaceId,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.reopened',
        payload: {},
        serverTime: opts.reopenedAt,
      }),
    );
  }
  await applyCommitted(db.pool, events);
  return ticketId;
}

/** The real engine, the real projections, the real door — no permissive stub. */
function realIngest() {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

function sweep(overrides: { ingest?: { ingestBatch: (e: unknown[]) => Promise<unknown[]> }; now?: string } = {}) {
  return runAutoCloseSweep({
    pool: db.pool,
    ingest: (overrides.ingest ?? realIngest()) as never,
    now: () => new Date(overrides.now ?? NOW),
  });
}

/** `closed_at` off the projection row — the column the sweep's event must produce. */
async function closedAt(ticketId: string): Promise<Date | null> {
  const { rows } = await db.pool.query<{ closed_at: Date | null; closed_by: string | null }>(
    'SELECT closed_at, closed_by FROM proj_tickets WHERE ticket_id = $1',
    [ticketId],
  );
  return rows[0]?.closed_at ?? null;
}

/** Every `ticket.closed` in the ledger for this ticket, with the actor that filed it. */
async function closedEvents(ticketId: string): Promise<Array<{ actor_id: string; origin: string }>> {
  const { rows } = await db.pool.query<{ actor_id: string; origin: string }>(
    `SELECT actor_id, origin FROM events
      WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.closed'
      ORDER BY seq`,
    [ticketId],
  );
  return rows;
}

/**
 * 13.727 — the sweep's whole predicate in one world, and the case Task 7's
 * column exists for.
 *
 * Five tickets, all in one workspace with `autoCloseAfterDays: 7` and all driven
 * past the same clock. Only A closes:
 *
 * | ticket | why it is or is not a candidate |
 * |---|---|
 * | A | terminal, open, never reopened, entered `done` 8 IST days ago — **closes** |
 * | B | identical but entered 3 days ago — inside the window |
 * | C | `active` for 30 days — the sweep is about TERMINAL states, not staleness |
 * | D | terminal and old, but `closed_at` is set — already closed |
 * | E | terminal and old, open, but `reopened_at` is set — **an explicit reopen wins** |
 *
 * E is the load-bearing row and the one the mutation targets: without
 * `AND t.reopened_at IS NULL` it closes too, undoing a person's reopen an hour
 * after they made it. The final arm asserts the two INSTANTS that straddle the
 * cutoff's IST midnight, so a cutoff computed from the machine's clock rather
 * than from IST is a red here rather than a coincidence.
 */
describe('13.727 the auto-close sweep closes only terminal, long-sitting, never-reopened tickets', () => {
  it('closes A only, under the system actor, through the door', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);

    // A: 8 IST days before NOW — one day past the 7-day window.
    const a = await seedTicket({ workspaceId: ws, enteredAt: '2026-09-10T06:00:00.000Z' });
    // B: 3 days before NOW.
    const b = await seedTicket({ workspaceId: ws, enteredAt: '2026-09-15T06:00:00.000Z' });
    // C: active for a month.
    const c = await seedTicket({ workspaceId: ws, state: 'doing', enteredAt: '2026-08-19T06:00:00.000Z' });
    // D: terminal and old, already closed.
    const d = await seedTicket({
      workspaceId: ws,
      enteredAt: '2026-08-10T06:00:00.000Z',
      closedAt: '2026-08-11T06:00:00.000Z',
    });
    // E: terminal and old, open, but reopened 30 days ago and untouched since.
    const e = await seedTicket({
      workspaceId: ws,
      enteredAt: '2026-08-01T06:00:00.000Z',
      closedAt: '2026-08-02T06:00:00.000Z',
      reopenedAt: '2026-08-19T06:00:00.000Z',
    });

    const report = await sweep();

    expect(report).toEqual({ workspacesOn: 1, candidates: 1, closed: 1, refused: 0 });
    // `candidates` is 1 and NOT 3, and getting this wrong once is why the
    // sentence is here: `closed_at IS NULL` and `reopened_at IS NULL` are IN the
    // SELECT, so D and E are excluded by the QUERY and never become candidates
    // at all. They are not "selected and then skipped" — there is no later
    // filter in this sweep that could skip them, which is exactly what makes the
    // mutation red rather than merely different: dropping the `reopened_at`
    // clause moves BOTH `candidates` and `closed` to 2, and closes E.
    // B is excluded by the same `entered.server_time < $cutoff` comparison, and
    // C never enters the terminal set.

    // A closed, and the two columns agree it was the SYSTEM actor.
    expect(await closedAt(a)).not.toBeNull();
    const aEvents = await closedEvents(a);
    expect(aEvents).toHaveLength(1);
    expect(aEvents[0]?.actor_id).toBe(SYSTEM_ACTOR_AUTO_CLOSE);
    // The envelope's provenance, not the browser header: `'server'` is what the
    // record says about who claimed it, and no client door would have accepted
    // this event with it set.
    expect(aEvents[0]?.origin).toBe('server');

    // Every other ticket is untouched, and each for its OWN reason — asserted
    // one by one so a sweep that closed B instead of A cannot pass by symmetry.
    //
    // The expected counts are the counts the SEEDER left, not zero: D was
    // created already-closed and E was closed and then reopened, so both already
    // own one `ticket.closed` event before the sweep runs. Asserting "zero"
    // here would have been a check failing for a reason unrelated to what it
    // named — which is how this assertion was written on the first pass, and
    // what caught it. What the sweep must not do is ADD one.
    for (const [label, id, alreadyClosed] of [
      ['B', b, 0],
      ['C', c, 0],
      ['D', d, 1],
      ['E', e, 1],
    ] as const) {
      expect(await closedEvents(id), `${label} must not have been closed`).toHaveLength(
        alreadyClosed,
      );
    }
    expect(await closedAt(b)).toBeNull();
    expect(await closedAt(c)).toBeNull();
    // D keeps the close it already had — the sweep neither cleared nor doubled it.
    expect(await closedAt(d)).toEqual(new Date('2026-08-11T06:00:00.000Z'));
    // E is the load-bearing one and it is asserted in full rather than by count:
    // its close is still the human's, and it is still OPEN — which is what
    // "an explicit reopen wins" means in the columns.
    expect(await closedAt(e)).toBeNull();

    // IDEMPOTENCE, asserted rather than asserted-about. The module docblock says
    // the sweep is "idempotent by the ledger, not by a cursor", and until this
    // arm existed that sentence was pinned by nothing: a second run in the same
    // hour must select NOTHING, because the ticket it closed no longer satisfies
    // `closed_at IS NULL`. A cursor would have had to be remembered; this needs
    // no memory, and that is the claim.
    expect(await sweep()).toEqual({ workspacesOn: 1, candidates: 0, closed: 0, refused: 0 });
    // And A is still closed exactly once — a second run neither re-closed it nor
    // cleared it.
    expect(await closedEvents(a)).toHaveLength(1);
  });

  it('the cutoff is an IST-day boundary: one millisecond either side decides', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);

    // Exactly at the cutoff — the first instant of IST 12 Sep, which is six
    // days before NOW in IST-day terms and therefore INSIDE the window.
    const onBoundary = await seedTicket({ workspaceId: ws, enteredAt: CUTOFF });
    // One millisecond earlier: the last instant of IST 11 Sep, seven days back.
    const justInside = await seedTicket({ workspaceId: ws, enteredAt: JUST_INSIDE });

    const report = await sweep();

    expect(report.closed).toBe(1);
    expect(await closedAt(justInside)).not.toBeNull();
    // The half-open interval, asserted from the far side: `< CUTOFF` and not
    // `<= CUTOFF`. Under the file's non-India TZ, a cutoff derived from the
    // machine's calendar reads both of these as the same day and closes both.
    expect(await closedAt(onBoundary)).toBeNull();
  });

  /**
   * **The IST rollover — the arm that kills a mutant every other case in this
   * file lets through.**
   *
   * Between 18:30Z and midnight the UTC date and the IST date are DIFFERENT:
   * `2026-09-18T19:00:00.000Z` is IST 19 Sep 00:30. `istDayOf` says the 19th; a
   * naive `clientTime.slice(0, 10)` says the 18th. So the two agree at midday —
   * where every other case in this file runs — and disagree for 5.5 hours of
   * every day, during which the cut-off walks one day further back and every
   * eligible ticket waits until 05:30 IST to close.
   *
   * **Measured: replacing `istDayOf(clientTime)` with `clientTime.slice(0, 10)`
   * SURVIVED all five cases before this arm existed.** The file-wide non-India
   * `TZ` cannot catch it, and that is the point — a UTC slice never consults the
   * process zone, so the zone pin gives this mutant no protection at all. The
   * only lever that reaches it is a `now` inside the 18:30Z–24:00Z window, which
   * is what this case supplies. `notifications/sweep.ts:128` already carries the
   * same warning one file over.
   */
  it('reads the IST day, not the UTC date, in the 5.5 hours where they differ', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);

    // 19:00Z = IST 19 Sep 00:30. `todayIst` is therefore 2026-09-19 and the
    // 7-day cut-off is IST 12 Sep, whose endUtc is 2026-09-12T18:30:00.000Z.
    const ROLLED = '2026-09-18T19:00:00.000Z';
    // Entered IST 12 Sep, mid-morning — inside the correct window, outside the
    // one a UTC slice would compute (IST 11 Sep).
    const inside = await seedTicket({ workspaceId: ws, enteredAt: '2026-09-12T06:00:00.000Z' });

    const report = await sweep({ now: ROLLED });

    expect(report.closed).toBe(1);
    expect(await closedAt(inside)).not.toBeNull();
  });

  /**
   * Each workspace is measured by its OWN window, and the cut-off is computed
   * inside the loop that reads it.
   *
   * Every other case in this file seeds exactly ONE workspace, so hoisting the
   * cut-off out of the loop — using one workspace's `days` for all of them —
   * would survive the whole suite. Two workspaces with different windows make
   * that mutant red: the same 10-day-old ticket must close under a 7-day window
   * and stay open under a 30-day one, and `workspacesOn: 2` is witnessed for the
   * first time.
   */
  it('measures each workspace against its own window', async () => {
    const short = newUlid();
    const long = newUlid();
    await seedWorkflowAndType(short, '-short');
    await seedWorkflowAndType(long, '-long');
    await seedAutoClose(short, 7);
    await seedAutoClose(long, 30);

    // Ten days old: past the 7-day window, inside the 30-day one.
    const tenDaysOld = '2026-09-08T06:00:00.000Z';
    const inShort = await seedTicket({
      workspaceId: short,
      typeSuffix: '-short',
      enteredAt: tenDaysOld,
    });
    const inLong = await seedTicket({
      workspaceId: long,
      typeSuffix: '-long',
      enteredAt: tenDaysOld,
    });
    // And one that is older than BOTH windows, so the long workspace is not
    // simply inert.
    const ancient = await seedTicket({
      workspaceId: long,
      typeSuffix: '-long',
      enteredAt: '2026-07-01T06:00:00.000Z',
    });

    const report = await sweep();

    expect(report).toEqual({ workspacesOn: 2, candidates: 2, closed: 2, refused: 0 });
    expect(await closedAt(inShort)).not.toBeNull();
    expect(await closedAt(ancient)).not.toBeNull();
    // The 30-day workspace's ten-day-old ticket is the discriminator: one
    // hoisted cut-off closes it, and the per-workspace one does not.
    expect(await closedAt(inLong)).toBeNull();
  });
});

/**
 * 13.728 — a workspace that has NOT turned auto-close on contributes nothing.
 *
 * Both spellings are exercised because they are different facts about the row
 * and only one of them is obvious: `null` as an explicit claim means "off", and
 * a workspace that never claimed anything has no row at all. The domain's
 * default for this knob IS `null` (`DEFAULT_AUTO_CLOSE_AFTER_DAYS`), so the two
 * collapse to the same answer — which is the point, and is why the control
 * below sits in the same test: `workspacesOn: 0` twice, then `workspacesOn: 1`
 * once the SAME world claims a window. Without that third arm, a sweep that
 * never counted any workspace would pass this case perfectly.
 */
describe('13.728 a workspace without auto-close contributes nothing', () => {
  it('counts zero for an explicit null and for a workspace that never claimed one, and one once it claims', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, null);
    const old = await seedTicket({ workspaceId: ws, enteredAt: '2026-08-01T06:00:00.000Z' });

    expect(await sweep()).toEqual({ workspacesOn: 0, candidates: 0, closed: 0, refused: 0 });
    expect(await closedAt(old)).toBeNull();

    // The control: the same ticket, the same world, one claim later.
    await seedAutoClose(ws, DAYS);
    expect(await sweep()).toEqual({ workspacesOn: 1, candidates: 1, closed: 1, refused: 0 });
    expect(await closedAt(old)).not.toBeNull();
  });
});

/**
 * 13.729 — a transition re-arms the clock, including one back into the state the
 * ticket is already in.
 *
 * This is the other half of "reopen wins": the flag must not exempt a ticket
 * from auto-close FOREVER. A ticket that was reopened and then acted on again —
 * here, moved back into `done` ten days ago — has a fresh state-entry instant
 * and a cleared `reopened_at`, so the sweep closes it. The first sweep in this
 * case runs against the reopened-but-untouched world and finds nothing, which is
 * the control that makes the second sweep's close a fact about the transition
 * rather than about the ticket simply being old.
 */
describe('13.729 a transition back into the terminal state re-arms the clock', () => {
  it('closes the ticket on the sweep after it is transitioned, and not before', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);
    const ticket = await seedTicket({
      workspaceId: ws,
      enteredAt: '2026-08-01T06:00:00.000Z',
      closedAt: '2026-08-02T06:00:00.000Z',
      reopenedAt: '2026-08-19T06:00:00.000Z',
    });

    // Reopened and untouched: the sweep must leave it alone — and `candidates`
    // is 0, not 1, because the `reopened_at IS NULL` clause is in the SELECT.
    // The row is never selected, so there is no "skip" downstream to assert.
    expect(await sweep()).toEqual({ workspacesOn: 1, candidates: 0, closed: 0, refused: 0 });
    expect(await closedAt(ticket)).toBeNull();

    // The re-arm — back into `done`, the state it was already in. Ten days
    // before NOW, so it is inside the window from this point on.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: ticket },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
        serverTime: '2026-09-08T06:00:00.000Z',
      }),
    ]);

    // The fold really did clear the flag — asserted before the sweep, so a
    // failure here names the reducer rather than the sweep.
    const { rows } = await db.pool.query<{ reopened_at: Date | null }>(
      'SELECT reopened_at FROM proj_tickets WHERE ticket_id = $1',
      [ticket],
    );
    expect(rows[0]?.reopened_at).toBeNull();

    expect(await sweep()).toEqual({ workspacesOn: 1, candidates: 1, closed: 1, refused: 0 });
    expect(await closedAt(ticket)).not.toBeNull();
  });
});

/**
 * 13.730 — the sweep closes THROUGH THE DOOR, and this case proves it by making
 * the door say no.
 *
 * **Which of the plan's two shapes, and why.** The plan offered (a) construct a
 * candidate the engine refuses, or (b) count ledger rows rather than projection
 * writes. (b) is weaker than it looks: a sweep that wrote `proj_tickets`
 * directly and ALSO appended a ledger row by hand would satisfy it, and the
 * whole question is whether an engine decision stands between the SELECT and
 * the write. (a) is decisive — a REFUSED close leaves the ticket open and the
 * ledger empty, which no direct writer can produce — so (a) is the shape here.
 *
 * **The race has to be injected, and saying why is part of the case.** A
 * statically-seeded candidate the engine refuses is impossible: the sweep's
 * SELECT and `checkTicketClosed` read the SAME two projection columns, so any
 * ticket the SELECT returns is one the engine would accept. The window is
 * therefore temporal — the ticket moves between selection and ingest — and the
 * only honest place to open it is the `ingest` dependency, which is exactly the
 * seam the real window sits on. The wrapper commits a real transition first and
 * then hands the batch to the REAL service, so the refusal below is the engine's
 * own `close-requires-terminal` and not a stub's opinion.
 */
describe('13.730 a refused close is counted and leaves the ticket open', () => {
  it('counts the engine refusal, leaves the projection open, and writes no ledger event', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);
    const ticket = await seedTicket({ workspaceId: ws, enteredAt: '2026-08-01T06:00:00.000Z' });

    const real = realIngest();
    const racyIngest = {
      ingestBatch: async (events: unknown[]) => {
        // THE RACE, injected at the one boundary where it can happen: an actor
        // moves the ticket out of its terminal state after the sweep selected
        // it and before the sweep's close reaches the door.
        await applyCommitted(db.pool, [
          makeCommitted({
            workspaceId: ws,
            actorId: HUMAN,
            entity: { kind: 'ticket', id: ticket },
            type: 'ticket.transitioned',
            payload: { to: 'doing' },
            serverTime: '2026-09-18T11:59:00.000Z',
          }),
        ]);
        return real.ingestBatch(events);
      },
    };

    const report = await sweep({ ingest: racyIngest as never });

    expect(report).toEqual({ workspacesOn: 1, candidates: 1, closed: 0, refused: 1 });

    // THE DECISIVE PAIR. A sweep that wrote the projection directly would have
    // set `closed_at` and skipped the engine entirely; both of these say it did
    // not — and the second is the stronger half, because the projection row is
    // derived from the ledger and a hand-written one could have hidden it.
    expect(await closedAt(ticket)).toBeNull();
    expect(await closedEvents(ticket)).toHaveLength(0);
  });

  /**
   * **The `invalid` arm — the count shape the docblock argues for and, until
   * this case, nothing exercised.**
   *
   * Mutating the counter to include only `status === 'refused'` SURVIVED the
   * whole file, because no case ever fed the sweep an `invalid` result: the
   * sweep builds its own envelopes, so an `invalid` can only come from a bug in
   * this function, and a suite that never simulates one cannot see the
   * difference between counting both and counting one. The docblock's argument
   * (`closed + refused < candidates` should be a signal, not a puzzle) was prose.
   *
   * **The `ingest` here is a deliberate hand-written answer, and it is honest to
   * say so.** It is not standing in for the engine — the arm above proves the
   * engine path with the real service. This one tests the sweep's OWN counting
   * against the contract `ingestBatch` publishes, which is the thing under test.
   * A future reader should not mistake it for a second proof that the door works.
   */
  it('counts an invalid answer in refused rather than letting it vanish', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);
    await seedTicket({ workspaceId: ws, enteredAt: '2026-08-01T06:00:00.000Z' });

    const invalidAnswer = {
      ingestBatch: async (events: unknown[]) =>
        events.map(() => ({
          status: 'invalid' as const,
          eventId: null,
          code: 'malformed-envelope' as const,
          message: 'the door could not read this envelope',
        })),
    };

    const report = await sweep({ ingest: invalidAnswer as never });

    // Counted, not dropped: `closed + refused === candidates` still holds, which
    // is the property the docblock claims and a `=== 'refused'` filter breaks.
    expect(report).toEqual({ workspacesOn: 1, candidates: 1, closed: 0, refused: 1 });
  });
});

/**
 * 13.1167 — E6-8 (release 2026-09-22, B12): the sweep never builds a close
 * over open children.
 *
 * Case 4.23 keeps a parent from ENTERING a terminal state over open children,
 * but a workflow republish that promotes a kept state to `terminal` puts the
 * parent there without a transition, and `workflow-defined.ts` accepts that
 * on purpose (publish legality never depends on where tickets sit). Until
 * this fix the engine's `ticket.closed` asked only `stateCategory`, so the
 * sweep — which selects on `state_category = 'terminal'` and nothing about
 * children — closed such a parent unattended, over its open work.
 *
 * Two halves, and they are different instruments: the ENGINE now refuses the
 * close (`checks/close.ts`, `parent-terminal-with-open-children` — pinned in
 * `packages/rule-engine/test/close-with-open-children.test.ts`), and the
 * sweep's SELECT mirrors that predicate so the parent is not a CANDIDATE at
 * all — no envelope built, no nightly "refused" for a world that did not
 * move. This case is the second half: `candidates: 0`, which a sweep that
 * relied on the engine's refusal alone would answer `candidates: 1,
 * refused: 1`. The world is built the way it happens in production — the
 * child created while the parent was still active, then the republish — not
 * assembled by hand behind the projection's back.
 */
describe('13.1167 a parent promoted into terminal by a republish is not swept while a child is open', () => {
  it('is not a candidate while the child is open, and closes on the sweep after the child finishes', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);
    // The parent: `doing` (active), entered long ago — old enough to sweep the
    // moment its state reads terminal.
    const parent = await seedTicket({ workspaceId: ws, enteredAt: '2026-08-01T06:00:00.000Z', state: 'doing' });
    // A child type one rank deeper, and a child created under the parent while
    // the parent was still active — the only order the hierarchy check allows.
    const childType = `${TYPE_ID}-child`;
    const child = newUlid();
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'ticket-type', id: childType },
        type: 'ticket-type.defined',
        payload: { id: childType, name: 'Sweep sub-task', icon: 'check', rank: 2, workflowId: WF, fields: [] },
      }),
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: child },
        type: 'ticket.created',
        payload: { typeId: childType, projectId: PROJECT, parentId: parent, title: 'Open child', start: 'focus' },
        serverTime: '2026-08-01T06:01:00.000Z',
      }),
      // v2: `doing` KEPT and promoted active → terminal. The projection's
      // refresh-on-publish folds the parent's category to terminal with no
      // ticket event at all — so the sweep's "entered" clock still reads the
      // old transition into `doing`.
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'workflow', id: WF },
        type: 'workflow.defined',
        payload: {
          id: WF,
          version: 2,
          name: 'Auto-close flow',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'doing', name: 'Doing', category: 'terminal' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: 'todo', to: 'doing', rules: [] },
            { from: 'doing', to: 'done', rules: [] },
            { from: 'done', to: 'doing', rules: [] },
          ],
        },
        serverTime: '2026-08-02T00:00:00.000Z',
      }),
    ]);
    // The world the defect needs, asserted off the projection rather than
    // assumed of the seed: a TERMINAL parent with an OPEN child under it.
    const { rows: before } = await db.pool.query<{ ticket_id: string; state_category: string; parent_id: string | null }>(
      'SELECT ticket_id, state_category, parent_id FROM proj_tickets WHERE workspace_id = $1 ORDER BY parent_id NULLS FIRST',
      [ws],
    );
    expect(before).toEqual([
      { ticket_id: parent, state_category: 'terminal', parent_id: null },
      { ticket_id: child, state_category: 'open', parent_id: parent },
    ]);

    const report = await sweep();
    expect(report).toEqual({ workspacesOn: 1, candidates: 0, closed: 0, refused: 0 });
    expect(await closedAt(parent)).toBeNull();
    expect(await closedEvents(parent)).toHaveLength(0);

    // POSITIVE CONTROL in the same world: the child finishes, and the very
    // next sweep closes the parent through the door — so the zero above was
    // the child, not a sweep that closes nothing.
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'ticket', id: child },
        type: 'ticket.transitioned',
        // `todo → doing` is a declared edge, and under v2 `doing` IS terminal:
        // the child finishes by the one move the workflow actually offers it —
        // INSIDE the window, so the child itself is not a candidate and the
        // count below is the parent alone.
        payload: { to: 'doing' },
        serverTime: '2026-09-17T00:00:00.000Z',
      }),
    ]);
    const after = await sweep();
    expect(after).toEqual({ workspacesOn: 1, candidates: 1, closed: 1, refused: 0 });
    expect(await closedAt(parent)).not.toBeNull();
    expect(await closedEvents(parent)).toEqual([{ actor_id: SYSTEM_ACTOR_AUTO_CLOSE, origin: 'server' }]);
  });
});

describe('28.096 a draft child is not open work for the sweep (drafts spec)', () => {
  it('closes a terminal parent whose only child is a draft, and still holds back one with a published open child beside a draft', async () => {
    const ws = newUlid();
    await seedWorkflowAndType(ws);
    await seedAutoClose(ws, DAYS);
    const childType = `${TYPE_ID}-child`;
    // Two parents that reach `done` long ago, each after its children were filed (the only order the hierarchy check allows).
    const onlyDraft = await seedTicket({ workspaceId: ws, enteredAt: '2026-08-01T06:00:00.000Z', state: 'doing' });
    const withOpen = await seedTicket({ workspaceId: ws, enteredAt: '2026-08-01T06:00:00.000Z', state: 'doing' });
    const draftUnderOnlyDraft = newUlid();
    const draftUnderOpen = newUlid();
    const openChild = newUlid();
    const child = (id: string, parentId: string, draft: boolean) =>
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'ticket', id },
        type: 'ticket.created',
        payload: {
          typeId: childType,
          projectId: PROJECT,
          parentId,
          title: draft ? 'A draft child' : 'An open child',
          start: draft ? 'backlog' : 'focus',
          ...(draft ? { draft: true } : {}),
        },
        serverTime: '2026-08-01T06:01:00.000Z',
      });
    const finish = (id: string) =>
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'ticket', id },
        type: 'ticket.transitioned',
        payload: { to: 'done' },
        serverTime: '2026-08-02T00:00:00.000Z',
      });
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: ws,
        actorId: HUMAN,
        entity: { kind: 'ticket-type', id: childType },
        type: 'ticket-type.defined',
        payload: { id: childType, name: 'Sweep sub-task', icon: 'check', rank: 2, workflowId: WF, fields: [] },
      }),
      child(draftUnderOnlyDraft, onlyDraft, true),
      child(draftUnderOpen, withOpen, true),
      child(openChild, withOpen, false),
      finish(onlyDraft),
      finish(withOpen),
    ]);
    // The world, read off the projection rather than assumed of the seed: both parents terminal, the drafts flagged.
    const { rows } = await db.pool.query<{ ticket_id: string; state_category: string; is_draft: boolean }>(
      'SELECT ticket_id, state_category, draft_author_id IS NOT NULL AS is_draft FROM proj_tickets WHERE workspace_id = $1',
      [ws],
    );
    const byId = new Map(rows.map((r) => [r.ticket_id, r]));
    expect(byId.get(onlyDraft)).toMatchObject({ state_category: 'terminal', is_draft: false });
    expect(byId.get(withOpen)).toMatchObject({ state_category: 'terminal', is_draft: false });
    expect(byId.get(draftUnderOnlyDraft)?.is_draft).toBe(true);
    expect(byId.get(draftUnderOpen)?.is_draft).toBe(true);
    expect(byId.get(openChild)).toMatchObject({ state_category: 'open', is_draft: false });

    const report = await sweep();
    expect(report).toEqual({ workspacesOn: 1, candidates: 1, closed: 1, refused: 0 });
    expect(await closedAt(onlyDraft)).not.toBeNull(); // the draft child did not hold it
    expect(await closedEvents(onlyDraft)).toEqual([{ actor_id: SYSTEM_ACTOR_AUTO_CLOSE, origin: 'server' }]);
    expect(await closedAt(withOpen)).toBeNull(); // CONTROL: a published open child still does
    expect(await closedEvents(withOpen)).toHaveLength(0);
  });
});

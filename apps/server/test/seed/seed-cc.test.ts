import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { existingSeedEventIds, seedConvenienceCorner } from '../../src/seed/seed-convenience-corner.js';
import { seedUlid } from '../../src/seed/seed-ulid.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Plan 11 Task 9 — the Convenience Corner seed, end to end, through the door a
 * person uses.
 *
 * ## These tests SHARE state, deliberately, and run in declaration order
 *
 * One database, one seeded world, built up across the file: first run, then the
 * reads that prove what it says, then the re-run, then the staged guest. Making
 * them independent would delete the only thing three of them prove — that the
 * SECOND run of the same seed behaves differently from the first, and in
 * exactly one way. Vitest runs `it` blocks in declaration order within a file,
 * and nothing here may be reordered or `.only`-d in isolation.
 *
 * ## The door is `ingestClientBatch`, and that is the point of the exercise
 *
 * `routes/workspaces.ts`'s docblock says Plan 11's seeds found workspaces
 * through the same path as `POST /v1/workspaces`. A dogfooding seed that
 * reached for the ungated internal door would be a demo of a product nobody
 * can actually use: it would never learn that the owner must be ON the project
 * before creating a ticket in it, because that refusal lives at the client door
 * alone.
 */
const boardPath = new URL('../../../../reference/convenience-corner-tracker/board.data.js', import.meta.url)
  .pathname;

let db: TestDatabase;
const ownerUserId = newUlid();
const accountantUserId = newUlid();
const users = new Map([
  ['kiro@example.com', ownerUserId],
  ['accountant@example.com', accountantUserId],
]);
const resolveUserId = async (email: string): Promise<string | null> => users.get(email) ?? null;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

/**
 * Which door each run used, counted at the door itself.
 *
 * The compile-time narrowing (`SeedIngest = Pick<IngestService,'ingestClientBatch'>`)
 * makes `deps.ingest.ingestBatch(...)` an error inside the seed, but a type is
 * only a claim about source that exists today. This is the runtime half, and it
 * is deliberately DIRECT: the object handed to the seed carries a live,
 * working `ingestBatch` — the ungated internal door, wired to the same real
 * service — so a seed that reached for it would succeed, commit the same
 * events, and every arithmetic assertion in this file would still pass. The
 * only thing that would change is `ungated`, which is why it is asserted
 * explicitly rather than left to be inferred from a permission refusal
 * somewhere downstream.
 */
type DoorCalls = {
  /** Calls to `ingestBatch` — the ungated internal door. Must stay 0, always. */
  ungated: number;
  /** Calls to `ingestClientBatch` — the door a person's browser uses. */
  client: number;
  /** How many events the last client-door call carried. */
  lastBatchSize: number;
};

function makeDeps() {
  const projections = buildProjectionRegistry();
  const real = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections });
  // An OBJECT, handed out by reference — not three loose numbers. A snapshot
  // copied at `makeDeps()` time (or spread through `...makeDeps()`) would read
  // 0 forever and the assertions below would be checks that cannot fail.
  const doorCalls: DoorCalls = { ungated: 0, client: 0, lastBatchSize: -1 };
  const ingest = {
    ingestBatch: async (rawEvents: unknown[]) => {
      doorCalls.ungated += 1;
      return real.ingestBatch(rawEvents);
    },
    ingestClientBatch: async (rawEvents: unknown[], sessionUserId: string) => {
      doorCalls.client += 1;
      doorCalls.lastBatchSize = rawEvents.length;
      return real.ingestClientBatch(rawEvents, sessionUserId);
    },
  };
  return {
    ingest,
    projections,
    doorCalls,
    resolveUserId,
    existingEventIds: (ids: readonly string[]) => existingSeedEventIds(db.pool, ids),
  };
}

async function eventCount(): Promise<number> {
  const result = await db.pool.query('SELECT count(*)::int AS n FROM events');
  return (result.rows[0] as { n: number }).n;
}

/** The first run's numbers, kept so the re-run can be compared against them
 * rather than against zero — see the re-run case. */
let firstRunCommitted = 0;

describe('seedConvenienceCorner', () => {
  /**
   * 13.77 — the seed refuses when the owner has never signed in, and the
   * ledger stays empty — people are never invented.
   */
  it('refuses when the owner has never signed in — people are not invented', async () => {
    const deps = makeDeps();
    await expect(
      seedConvenienceCorner(deps, {
        boardPath,
        ownerEmail: 'nobody@example.com',
        accountantEmail: null,
        allowMissingGuest: true,
      }),
    ).rejects.toThrowError(/sign in once/);
    expect(await eventCount()).toBe(0);
  });

  /**
   * 13.78 — first run through ingestClientBatch lands exactly 118 events —
   * 7 the seed owns plus 111 errand events — and the server adds its own
   * 6-event founding sequence.
   * 13.79 — 23 errand tickets, guest NOT configured when the accountant has
   * not signed in (--allow-missing-guest).
   * 13.91 — the door, asserted directly: the seed is handed a LIVE ungated
   * ingestBatch alongside the gated one and calls it exactly 0 times, while
   * ingestClientBatch is called once carrying all 118 events.
   */
  it('first run without the accountant: everything except the guest surface lands', async () => {
    const deps = makeDeps();
    const report = await seedConvenienceCorner(deps, {
      boardPath,
      ownerEmail: 'kiro@example.com',
      accountantEmail: 'not-yet@example.com',
      allowMissingGuest: true,
    });
    expect(report.tickets).toBe(23);
    expect(report.guestConfigured).toBe(false);
    expect(report.skippedExisting).toBe(0);
    // The exact arithmetic, not `toBeGreaterThan(0)`. Seven events the seed
    // owns outright — workspace.created, project.created, project.member_added
    // (the owner joining their own project: the client door requires it before
    // any ticket.created), workflow.defined, ticket-type.defined, and the two
    // epic tickets — plus 111 errand events, which is what `buildErrandEvents`
    // yields over the frozen snapshot: 23 created + 23 description + 23
    // counterparty + 1 startDate (only `ops:accountant-hsn-digits` is dated by
    // its own record) + 23 dueDate + 18 transitions (the 5 `later` items sit in
    // the template's initial state and emit none).
    expect(report.committed).toBe(118);
    // Plus the six the SERVER appends for itself: `bootstrapWorkspace`'s
    // simple-Kanban workflow, the four built-in ticket types and the founder's
    // owner grant. They are not in the seed's results — the array is index-
    // aligned with what the seed submitted — but they are in the ledger, and
    // their presence is what makes the workspace usable at all.
    expect(await eventCount()).toBe(118 + 6);
    // THE DOOR, asserted directly and not as a side effect of a refusal. One
    // call, to the gated client door, carrying every one of the 118 events;
    // zero calls to the ungated internal door that was live on the same object
    // and would have committed the identical 118 without ever meeting the gate.
    expect(deps.doorCalls.ungated).toBe(0);
    expect(deps.doorCalls.client).toBe(1);
    expect(deps.doorCalls.lastBatchSize).toBe(118);
    firstRunCommitted = report.committed;
  });

  /**
   * 13.80 — the seeded board tells the record's truth: ops:duns in `next`,
   * ops:accountant-hsn-digits in `in-progress`, ops:apple-developer in
   * `waiting`.
   * 13.81 — provenance: the dueDate claim is the OWNER's, and its note
   * carries the derivation ("from the tracker record — first needed in
   * week N").
   * 13.82 — the one origin-dated item carries its startDate verbatim
   * (2026-08-18) as a built-in field claim.
   */
  it('the seeded board tells the record’s truth', async () => {
    const workspaceId = seedUlid('workspace', 'convenience-corner');
    const duns = await getTicketStateFromDb(db.pool, workspaceId, seedUlid('ticket', 'cc#ops:duns'));
    expect(duns?.stateId).toBe('next');
    const hsn = await getTicketStateFromDb(db.pool, workspaceId, seedUlid('ticket', 'cc#ops:accountant-hsn-digits'));
    expect(hsn?.stateId).toBe('in-progress');
    const apple = await getTicketStateFromDb(db.pool, workspaceId, seedUlid('ticket', 'cc#ops:apple-developer'));
    expect(apple?.stateId).toBe('waiting');
    // Provenance: the dueDate claim is the owner's, with the derivation note.
    const dueClaim = hsn?.fields['dueDate'];
    expect(dueClaim?.actorId).toBe(ownerUserId);
    expect((dueClaim?.value as { note: string }).note).toContain('from the tracker record');
    // The one item the record dates itself, verbatim, in the built-in field.
    expect((hsn?.fields['startDate']?.value as { date: string }).date).toBe('2026-08-18');
  });

  /**
   * 13.83 — re-run is a no-op: committed is 0 and the ledger is
   * byte-for-byte the same size.
   * 13.84 — the re-run accounts for EXACTLY the first run's committed
   * count (skippedExisting === firstRun.committed) — a seed that built
   * nothing would pass a bare `> 0` check and is caught here.
   */
  it('re-run is a no-op: every event is already present, none commits', async () => {
    const before = await eventCount();
    const deps = makeDeps();
    const report = await seedConvenienceCorner(deps, {
      boardPath,
      ownerEmail: 'kiro@example.com',
      accountantEmail: 'not-yet@example.com',
      allowMissingGuest: true,
    });
    expect(report.committed).toBe(0);
    // NOT `toBeGreaterThan(0)`. A seed that built nothing at all would pass
    // that, and "built nothing" is a different bug wearing idempotence's
    // clothes. The re-run must account for EXACTLY the events the first run
    // committed — same ids, all of them found already present.
    expect(report.skippedExisting).toBe(firstRunCommitted);
    expect(await eventCount()).toBe(before);
  });

  /**
   * 13.85 — staged guest: a later run with the accountant resolvable
   * commits EXACTLY 5 events — 1 membership.granted + 4 visibility.set —
   * and the ledger grows by exactly 5.
   */
  it('a later run with the accountant present adds ONLY the guest surface (staged seeding)', async () => {
    const before = await eventCount();
    const deps = makeDeps();
    const report = await seedConvenienceCorner(deps, {
      boardPath,
      ownerEmail: 'kiro@example.com',
      accountantEmail: 'accountant@example.com',
      allowMissingGuest: false,
    });
    expect(report.guestConfigured).toBe(true);
    // The guest membership plus explicit visibility on exactly the four items
    // whose record names the accountant (`meta.who === 'Accountant'` in the
    // frozen snapshot: ops:accountant-cloud-gst, -gst-scheme, -hsn-digits,
    // -hsn-values).
    expect(report.committed).toBe(5);
    expect(report.skippedExisting).toBe(firstRunCommitted);
    expect(await eventCount()).toBe(before + 5);
  });

  /**
   * 13.86 — the four explicit-visibility rows are exactly the items whose
   * record names the accountant (meta.who === 'Accountant'), and each list
   * is exactly [owner, accountant] — the owner never loses sight of their
   * own errand.
   */
  it('the accountant sees the four errands their record names, and nothing else', async () => {
    const workspaceId = seedUlid('workspace', 'convenience-corner');
    const named = await getTicketStateFromDb(
      db.pool,
      workspaceId,
      seedUlid('ticket', 'cc#ops:accountant-hsn-digits'),
    );
    expect(named).not.toBeNull();
    const { rows } = await db.pool.query<{ ticket_id: string; resolved_mode: string; resolved_user_ids: string[] }>(
      `SELECT ticket_id, resolved_mode, resolved_user_ids
         FROM proj_visibility
        WHERE workspace_id = $1 AND resolved_mode = 'explicit'
        ORDER BY ticket_id`,
      [workspaceId],
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      // The explicit list is exactly the authored list (Plan 4): the owner
      // stays on it or the owner loses sight of their own errand.
      expect(row.resolved_user_ids.sort()).toEqual([ownerUserId, accountantUserId].sort());
    }
  });

  /**
   * 13.89 — a refused event fails the run loudly with the rule id and the
   * refusal sentence quoted, and the ledger is unchanged.
   */
  it('a refused event fails the run loudly, naming the refusal, and commits nothing', async () => {
    // A stranger's copy of the same seed. `existingEventIds` is stubbed empty
    // so the events actually reach the door — which is also the real race
    // window, and the only way to exercise the refusal path once the world is
    // already seeded. Every event is refused (they are not a member of this
    // workspace), so the ledger must be untouched.
    const before = await eventCount();
    const strangerId = newUlid();
    const deps = {
      ...makeDeps(),
      resolveUserId: async (email: string) => (email === 'stranger@example.com' ? strangerId : null),
      existingEventIds: async () => new Set<string>(),
    };
    await expect(
      seedConvenienceCorner(deps, {
        boardPath,
        ownerEmail: 'stranger@example.com',
        accountantEmail: null,
        allowMissingGuest: true,
      }),
      // The refusal is quoted, not summarised: an operator who meets this needs
      // the rule id and the sentence the product itself would have shown.
    ).rejects.toThrowError(/was not accepted.*permission\.role/s);
    expect(await eventCount()).toBe(before);
  });

  /**
   * 13.88 — planted defect: two records sharing one seed id fail the run
   * before the batch is submitted or the ledger is queried — never counted
   * as "already present".
   */
  it('planted defect: two records sharing one seed id fail the run before anything is submitted', async () => {
    // The failure this guards is silent by construction: two items hashing to
    // one `seedUlid` would answer `duplicate-event-id` and be COUNTED as
    // "already present", so half a board could quietly not be seeded and the
    // report would look clean. The ingest and ledger stubs throw, so the test
    // also proves the refusal happens before anything reaches either.
    const dir = await mkdtemp(join(tmpdir(), 'cc-seed-twin-'));
    const twinBoard = join(dir, 'board.data.js');
    const item = (title: string) => ({
      id: 'ops:twin',
      title,
      epic: 'registrations',
      state: 'later',
      body: 'the same tracker id twice',
      done: false,
      lane: 'now',
      origin_file: 'origins/twin.md',
      origin_state: 'open',
      origin_status: 'open',
      meta: {},
    });
    const twin = {
      week1: '2026-08-18',
      epics: [
        { id: 'registrations', label: 'Registrations' },
        { id: 'questions', label: 'Open questions' },
      ],
      items: [item('First'), item('Second')],
    };
    await writeFile(twinBoard, `window.CC_TRACKER = ${JSON.stringify(twin, null, 2)};\n`, 'utf8');
    try {
      await expect(
        seedConvenienceCorner(
          {
            ingest: {
              ingestClientBatch: () => {
                throw new Error('the seed must not submit a batch it knows is self-colliding');
              },
            },
            resolveUserId,
            existingEventIds: () => {
              throw new Error('the seed must not query the ledger about a self-colliding batch');
            },
          },
          { boardPath: twinBoard, ownerEmail: 'kiro@example.com', accountantEmail: null, allowMissingGuest: true },
        ),
      ).rejects.toThrowError(/duplicate event id/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  /**
   * 13.87 — verifyProjections is clean over the whole seeded world — every
   * projection is derivable from the ledger the seed wrote.
   */
  it('the freshness gate holds over the seeded world', async () => {
    const { projections } = makeDeps();
    const verdict = await verifyProjections({ pool: db.pool, projections });
    expect(verdict.clean).toBe(true);
  });
});

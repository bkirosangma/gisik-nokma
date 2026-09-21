import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { docToPlainText, newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { readPlanSeries } from '../../src/seed/plan-series.js';
import { existingSeedEventIds } from '../../src/seed/seed-convenience-corner.js';
import { buildDevSeedEvents, seedDevWorkspace } from '../../src/seed/seed-dev-workspace.js';
import { seedUlid } from '../../src/seed/seed-ulid.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Plan 11 Task 10 — the Gisik Nokma dev seed: one epic per plan document, one
 * task ticket per `### Task N:` heading, titles verbatim.
 *
 * Reuses Task 9's `CcSeedDeps`/`SeedReport` shape exactly, including its two
 * divergences from the plan text: `ingest` is narrowed to the gated CLIENT
 * door (`SeedIngest`, `ingestClientBatch` only — `ingestBatch` does not
 * compile against this seed), and `existingEventIds` is a required field, not
 * optional, so idempotence is answered by the ledger one step before the
 * gate rather than by a `duplicate-event-id` this seed's own events could
 * never reach (the same three earlier refusals Task 9 measured apply here:
 * `workspace.created`, `ticket.created`, and — not present here at all —
 * `ticket.transitioned`).
 */
const plansDir = new URL('../../../../docs/superpowers/plans', import.meta.url).pathname;
const ownerUserId = newUlid();
const resolveUserId = async (email: string): Promise<string | null> =>
  email === 'kiro@example.com' ? ownerUserId : null;

/**
 * A corpus the END-TO-END seed test can afford, and the measurement that chose it.
 *
 * ## The instrument, not a flake
 *
 * `seedDevWorkspace`'s test used to run the **real** plan series — **359 events**
 * through one `ingestClientBatch` (`seed-dev-workspace.ts:171`) — TWICE, taking
 * **1690 ms** under `vitest.config.ts`'s `testTimeout: 30_000`. That is real work:
 * the limit is breached only when per-event latency amplifies ~18x, which is what
 * the shared Postgres does on a loaded box (measured red at load average 201, and
 * green on the next gate once the box went quiet).
 *
 * So the controller's question — *is the limit too tight, does the test do work it
 * does not need, or does it share a resource* — has a measured answer:
 *
 * - **the test does ~27.6x more work than the property it asserts requires.** Its
 *   claims are `committed > 0`, `committed === 0` on a re-run, and
 *   `skippedExisting === first.committed` — **not one of which is a fact about
 *   corpus SIZE.** The real corpus's *shape* is a different property and stays
 *   pinned (below).
 * - **the database is NOT shared** — `createTestDatabase` makes a
 *   `gisik_test_<uuid>` per file and drops it, so there is no name collision to
 *   isolate away. Only the Postgres *server* is shared, and one server is not
 *   something a test can isolate from.
 * - **the limit is not too tight at rest** — 1690 ms under 30 000 ms is ~18x of
 *   headroom — so raising it would buy the flake away without the red ever being
 *   about the code, which is the trade this project refuses.
 *
 * ## What still proves what, because shrinking a corpus can silently drop coverage
 *
 * - **The real corpus's SHAPE stays pinned, in this same file and for free.** The
 *   `buildDevSeedEvents` describe above reads `plansDir` — the real series — and
 *   asserts its invariants *in memory*: one epic per plan with titles verbatim, no
 *   date claims, no transitions, `origin: 'web'`, membership strictly before the
 *   first `ticket.created`, no duplicate ids.
 * - **The real-database end-to-end path is pinned separately**, by
 *   `seed-dev-cli.test.ts`, which drives this same `seedDevWorkspace` against a real
 *   database through the CLI (with its own one-plan fixture).
 * - **And this fixture ADDS assertion strength.** 13 events is a number the test can
 *   name exactly, so `committed` is asserted for its VALUE — `toBeGreaterThan(0)`
 *   passes for a seed that committed a single event.
 */
const plansDirWithTwoPlans = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'gn-plans-load-'));
  // Three things `readPlanSeries` requires, each documented at the same fixture in
  // `seed-dev-cli.test.ts`: the `NNNN-NN-NN-NN-*.md` shape; a plan number that is
  // NOT `00` (that is the coordination document, skipped on purpose); and inside the
  // file an H1, a `**Goal:**` line and at least one `### Task N:` heading.
  const plan = (n: number, tasks: number[]): string =>
    [
      `# Plan ${n}`,
      '',
      '**Goal:** give the seed enough structure to prove its accounting.',
      '',
      ...tasks.flatMap((t) => [`### Task ${t}: do the thing`, '']),
    ].join('\n');
  writeFileSync(join(dir, '2026-08-20-01-first.md'), plan(1, [1, 2]));
  writeFileSync(join(dir, '2026-08-20-02-second.md'), plan(2, [1]));
  return dir;
};

describe('buildDevSeedEvents — the calendar stays empty', () => {
  const docs = readPlanSeries(plansDir);
  const events = buildDevSeedEvents(docs, ownerUserId, '2026-08-20T12:00:00.000Z');

  /**
   * 13.95 — planted defects (invariant 4, "the calendar stays empty"):
   * buildDevSeedEvents claims no startDate/dueDate (this test) and emits no
   * ticket.transitioned (the test below) — no script claims progress or
   * dates on work it did not do.
   */
  it('planted defect (invariant 4): no date claims at all — the plan series claims no dates', () => {
    const dateClaims = events.filter((event) => {
      if (event.type !== 'ticket.field_set') return false;
      const fieldId = (event.payload as { fieldId: string }).fieldId;
      return fieldId === 'dueDate' || fieldId === 'startDate';
    });
    expect(dateClaims).toHaveLength(0);
  });

  /**
   * 13.95 — planted defects (invariant 4): buildDevSeedEvents emits no
   * ticket.transitioned (part of the same row as the no-date-claims test
   * above).
   */
  it('planted defect: no transitions — no script claims progress on work it did not do', () => {
    expect(events.filter((event) => event.type === 'ticket.transitioned')).toHaveLength(0);
  });

  /**
   * 13.96 — every built event wears the client door's origin: 'web', never
   * the internal door's 'server'.
   */
  it('every event wears the client door\'s origin, not the internal door\'s', () => {
    expect(events.every((event) => event.origin === 'web')).toBe(true);
  });

  /**
   * 13.97 — the owner joins the one project this seed creates
   * (project.member_added, correct userId) strictly before the first
   * ticket.created.
   */
  it('the owner joins the one project this seed creates, before any ticket.created', () => {
    const memberAddedIndex = events.findIndex((event) => event.type === 'project.member_added');
    const firstTicketCreatedIndex = events.findIndex((event) => event.type === 'ticket.created');
    expect(memberAddedIndex).toBeGreaterThanOrEqual(0);
    expect(memberAddedIndex).toBeLessThan(firstTicketCreatedIndex);
    const payload = events[memberAddedIndex]?.payload as { userId: string; projectAdmin: boolean };
    expect(payload.userId).toBe(ownerUserId);
  });

  /**
   * 13.98 — one epic ticket per plan document and one task ticket per
   * `### Task N:` heading, titles verbatim, including plan 11's own title
   * among the epics.
   */
  it('one epic per plan, one task ticket per task heading, titles verbatim', () => {
    const created = events.filter((event) => event.type === 'ticket.created');
    const epics = created.filter((event) => (event.payload as { typeId: string }).typeId === 'epic');
    const tasks = created.filter((event) => (event.payload as { typeId: string }).typeId === 'task');
    expect(epics).toHaveLength(docs.length);
    expect(tasks).toHaveLength(docs.reduce((sum, doc) => sum + doc.tasks.length, 0));
    const eleven = docs.find((doc) => doc.planNumber === '11');
    expect(epics.some((event) => (event.payload as { title: string }).title === eleven?.title)).toBe(true);
  });

  /**
   * 16.80 — the PLAN seed's descriptions obey the same split as the tracker seed's:
   * the `Goal:` prose is parsed, and the `source:` line beside it is not.
   *
   * ⚠ **THIS CASE READS THE REAL PLAN SERIES** (`docs = readPlanSeries(plansDir)`,
   * `plansDir` = the repo's `docs/superpowers/plans`), which is why it can prove
   * the real corpus is parsed. It first asserted against a MARKED FIXTURE goal,
   * and that was changed for exactly this reason — **a fixture cannot show that
   * the real series is parsed.** What the real series supplies is measured: **3
   * of the 11 goals carry markdown**, and plan 06 — the one asserted on — carries
   * backticked package names and no `**`. ⚠ The docblock above this case still
   * described the deleted fixture until an independent review read it; the
   * correction had reached the case and not its comment.
   */
  it('the plan descriptions split too: Goal is parsed, the source line is not', () => {
    const descriptions = events.filter(
      (event) => event.type === 'ticket.field_set' && (event.payload as { fieldId: string }).fieldId === 'description',
    );
    const textOf = (event: (typeof descriptions)[number]): string =>
      docToPlainText((event.payload as { value: unknown }).value);

    // Every description is a goal OR a task source line, and no other shape exists.
    expect(descriptions).toHaveLength(docs.length + docs.reduce((sum, doc) => sum + doc.tasks.length, 0));
    const goals = descriptions.filter((event) => textOf(event).startsWith('Goal: '));
    expect(goals).toHaveLength(docs.filter((doc) => doc.goal).length);

    // THE RECORD HALF, over the whole real series: every `source:` line survives
    // byte-for-byte, whichever plan or task it belongs to.
    for (const doc of docs) {
      const source = `source: docs/superpowers/plans/${doc.file}`;
      const carrying = descriptions.find((event) => textOf(event).includes(source));
      // ⚠ NO `?? descriptions[0]` FALLBACK. It was there to keep the loop from
      // throwing, and it turned "some event carries this source line" into
      // "descriptions[0] does" — satisfied whether or not the predicate ever
      // matched, and turning a whole-series loss into a confusing one-line
      // mismatch. A missing source line should say so.
      expect(carrying, `no description carries ${source}`).toBeDefined();
      expect(textOf(carrying!)).toContain(source);
    }

    // THE PROSE HALF, on a plan that really carries markdown: three of the eleven
    // goals do (measured), and plan 06 is one — its backticked package names are
    // the assertion, because a `Goal:` line with no markers would pass under a
    // renderer that parsed nothing.
    const marked = docs.find((doc) => doc.planNumber === '06');
    expect(marked?.goal).toContain('`');
    const goalEvent = descriptions.find((event) => textOf(event).startsWith(`Goal: ${marked?.goal?.replace(/`/g, '')}`));
    const goalText = textOf(goalEvent!);
    expect(goalText).not.toContain('`');
    expect(goalText).toContain('packages/ui');

    const marks: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const candidate = node as { marks?: Array<{ type: string }>; content?: unknown[] };
      for (const mark of candidate.marks ?? []) marks.push(mark.type);
      if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
    };
    walk((goalEvent?.payload as { value: unknown }).value);
    expect(marks.filter((mark) => mark === 'code').length).toBeGreaterThanOrEqual(2);
  });

  /**
   * 13.99 — buildDevSeedEvents builds no duplicate event ids across the
   * whole batch.
   */
  it('builds no duplicate event ids across the whole batch', () => {
    const ids = events.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('seedDevWorkspace', () => {
  let db: TestDatabase;
  /** The FIXTURE, not the real series — see `plansDirWithTwoPlans` for the measurement. */
  const fixtureDir = plansDirWithTwoPlans();
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);
  afterAll(async () => {
    await db.drop();
  });

  function makeDeps() {
    const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
    return {
      ingest,
      resolveUserId,
      existingEventIds: (ids: readonly string[]) => existingSeedEventIds(db.pool, ids),
    };
  }

  /**
   * 13.100 — seedDevWorkspace refuses when the owner has never signed in —
   * the seed never invents people (this test) — and, once signed in, a
   * first run commits real events while a second run is a no-op
   * (committed: 0, skippedExisting exactly accounting for the first run —
   * the test below).
   */
  it('refuses when the owner has never signed in — people are not invented', async () => {
    await expect(
      seedDevWorkspace(
        { ...makeDeps(), resolveUserId: async () => null },
        { plansDir: fixtureDir, ownerEmail: 'nobody@example.com' },
      ),
    ).rejects.toThrowError(/sign in once/);
  });

  /**
   * 13.100 — seedDevWorkspace: once signed in, a first run commits real
   * events while a second run is a no-op (part of the same row as the
   * refusal test above).
   */
  it('lands, and a re-run is a no-op', async () => {
    const first = await seedDevWorkspace(makeDeps(), {
      plansDir: fixtureDir,
      ownerEmail: 'kiro@example.com',
    });
    // The fixture's WHOLE event count, asserted for its value rather than as
    // `toBeGreaterThan(0)`: `buildDevSeedEvents` yields `workspace.created` +
    // `project.created` + `project.member_added` + five `ticket.created` (two
    // epics, three tasks) + five `ticket.field_set`. A `> 0` would pass for a
    // seed that committed exactly one event; this cannot.
    expect(first.committed).toBe(13);
    const second = await seedDevWorkspace(makeDeps(), {
      plansDir: fixtureDir,
      ownerEmail: 'kiro@example.com',
    });
    expect(second.committed).toBe(0);
    expect(second.skippedExisting).toBe(first.committed);
  });

  /**
   * 13.1228 — the seed spreads all three levels (spec 2026-09-22): a fresh
   * database must SHOW the whole ladder, not only its middle. Read back from
   * `proj_tickets` rather than from the built events, so the claim is proved to
   * survive ingest and projection rather than merely to be spelled in a payload.
   *
   * Depends on the case above having seeded — the describe's tests run in
   * declaration order and this one reads what that one committed.
   */
  it('13.1228 the dev seed spreads the three priorities so a fresh database shows every level', async () => {
    const rows = await db.pool.query<{ p: string }>(
      `SELECT DISTINCT fields -> 'priority' ->> 'value' AS p FROM proj_tickets WHERE project_id = $1 ORDER BY p`,
      [seedUlid('project', 'dev#build')],
    );
    expect(rows.rows.map((row) => row.p)).toEqual(['P1', 'P2', 'P3']);
  });
});

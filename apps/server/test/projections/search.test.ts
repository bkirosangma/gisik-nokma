import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readLedger } from '../../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { searchProjection } from '../../src/projections/search.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

/**
 * `proj_search` — the full-text projection (Plan 5 Task 6).
 *
 * ## The world is seeded ONCE, and declaration order is load-bearing
 *
 * The plan text's `beforeEach` — `truncateAll` + `resetEntitySeqs` + a fresh
 * `seedReadScenario` — cannot run here for two independent reasons, and both
 * are the helpers' own documented rules rather than a preference:
 *
 * - `test/helpers/db.ts` exports no `truncateAll`; every read test takes one
 *   FRESH DATABASE per file (`createTestDatabase`).
 * - `seedReadScenario` REFUSES a second seed into the same database — the
 *   workflow and the two ticket types have FIXED entity ids, so the second seed
 *   collides on `events_entity_seq_unique`, and `resetEntitySeqs()` makes that
 *   worse rather than better: it re-mints the colliding `1`.
 *
 * So: one database, one `resetEntitySeqs()` BEFORE the one seed, and never
 * again. That makes the order of the cases below part of the fixture. The
 * read-only cases come first; the cases that APPEND to the ledger come after
 * them (each through `applyCommitted`, so live projections stay in agreement
 * with the ledger, which is what the verifier case at the end depends on); the
 * verifier case is last and repairs its own planted corruption. A reordering
 * that moves an appending case above a read-only one changes what the read-only
 * one is asserting — say so in the case, do not silently shuffle.
 *
 * ## Why the assertions are exact strings and exact id sets
 *
 * A full-text test passes for the wrong reason very easily: a query can match
 * because the stemmer normalised something incidental, and `toEqual([])` cannot
 * tell "correctly matched nothing" from "the column is empty and nothing will
 * ever match". So every `[]` below stands beside a POSITIVE CONTROL in the same
 * case, and the load-bearing claims (plain-text extraction, mention rendering,
 * comment accumulation) are asserted as EXACT COLUMN CONTENTS — a wrong
 * implementation then returns a different NON-EMPTY value rather than nothing.
 *
 * ## The weights are invisible to `@@`
 *
 * `tsv @@ websearch_to_tsquery(...)` ignores weight labels entirely, so a
 * migration that concatenated the three `to_tsvector` calls with NO `setweight`
 * at all would pass every match-based case in this file. The weights are
 * therefore asserted directly against `tsv::text`, which is the only place they
 * are observable — the same hazard as an oracle both sides ignore, covered by a
 * fixture rather than by a comparison.
 */

let db: TestDatabase;
let world: ReadScenario;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  world = await seedReadScenario(db.pool, scenarioUsers());
});

afterAll(async () => {
  await db.drop();
});

/** The read the `/v1/search` route and `compileFilterSpec`'s text clause both make. */
async function ftsHits(query: string): Promise<string[]> {
  const { rows } = await db.pool.query(
    `SELECT ticket_id FROM proj_search
      WHERE workspace_id = $1 AND tsv @@ websearch_to_tsquery('simple', $2)
      ORDER BY ticket_id`,
    [world.workspaceId, query],
  );
  return rows.map((row) => (row as { ticket_id: string }).ticket_id);
}

async function textOf(ticketId: string): Promise<{ title: string; description: string; comments: string }> {
  const { rows } = await db.pool.query(
    'SELECT title, description, comments FROM proj_search WHERE ticket_id = $1',
    [ticketId],
  );
  return rows[0] as { title: string; description: string; comments: string };
}

async function tsvTextOf(ticketId: string): Promise<string> {
  const { rows } = await db.pool.query('SELECT tsv::text AS tsv FROM proj_search WHERE ticket_id = $1', [
    ticketId,
  ]);
  return (rows[0] as { tsv: string }).tsv;
}

describe('proj_search', () => {
  it('holds exactly one row per seeded ticket, filed under its own workspace and project', async () => {
    const { rows } = await db.pool.query(
      'SELECT ticket_id, workspace_id, project_id FROM proj_search ORDER BY ticket_id',
    );
    // An EXPECTED COUNT, not `> 0`: the verifier case at the end takes a clean
    // verdict over this table, and a clean verdict over an empty (or
    // half-populated) table proves nothing. Five tickets are seeded.
    expect(rows).toHaveLength(5);
    expect(rows).toEqual(
      [world.epicId, world.taskInEpicId, world.sharedTaskId, world.hiddenTaskId, world.guestTaskId]
        .map((ticketId) => ({
          ticket_id: ticketId,
          workspace_id: world.workspaceId,
          project_id: world.projectId,
        }))
        .sort((a, b) => (a.ticket_id < b.ticket_id ? -1 : 1)),
    );
  });

  /**
   * 7.71 — the A/B/C weights asserted against `tsv::text` — the ONLY place they are observable, since `tsv @@ websearch_to_tsquery(...)` ignores weights.
   */
  it('weights title A, description B and comments C — the one place setweight is observable', async () => {
    // `@@` ignores weights, so no matching case in this file can see them. Read
    // off `tsv::text` instead: dropping any one setweight renders that source's
    // lexemes with the default weight D, which prints as a bare position.
    const tsv = await tsvTextOf(world.taskInEpicId);
    expect(tsv, 'title lexeme lost weight A').toMatch(/'gst':\d+A/);
    expect(tsv, 'description lexeme lost weight B').toMatch(/'timing':\d+B/);
    expect(tsv, 'comment lexeme lost weight C').toMatch(/'otp':\d+C/);
    // Positions are re-offset by `||`, hence `\d+` rather than a fixed number.
  });

  it('stores descriptions as PLAIN TEXT through docToPlainText, not as the document JSON', async () => {
    // Exact contents, not a match: a projection that stored `JSON.stringify(doc)`
    // would still answer every `timing` query, because the word is in the JSON.
    expect((await textOf(world.taskInEpicId)).description).toBe(
      'GSTR-3B for July, portal keeps timing out',
    );
  });

  it('renders a comment mention as @label, so a mention is searchable by the name that was shown', async () => {
    expect((await textOf(world.taskInEpicId)).comments).toBe('Called the @Kiro about the OTP hold-up');
    // And it is reachable through the query path, not merely stored.
    expect(await ftsHits('Kiro')).toEqual([world.taskInEpicId]);
  });

  /**
   * 7.11 — the row’s first clause: titles indexed from `ticket.created` in the `simple` configuration, nothing stemmed. Its other clauses — descriptions through `docToPlainText`, comments, and the title re-claim — are asserted by the neighbouring tests in this block.
   */
  it("indexes titles from ticket.created, in the 'simple' configuration — nothing is stemmed", async () => {
    expect(await ftsHits('licence')).toEqual([world.sharedTaskId]);
    expect(await ftsHits('return')).toEqual([world.taskInEpicId]);
    // The config pin. Under 'english' the stored `timing` stems to `time` while
    // the query stays `timing`, and this line dies. (`returns` -> [] does NOT
    // pin the config: `return` stems to itself, so an english column would keep
    // answering nothing to a simple `returns` query. Kept below only as the
    // "no stemming" statement it honestly is, with its positive control.)
    expect(await ftsHits('timing')).toEqual([world.taskInEpicId]);
    expect(await ftsHits('returns')).toEqual([]);
  });

  it('indexes every comment on the ticket it was filed against', async () => {
    expect(await ftsHits('hold-up')).toEqual([world.taskInEpicId]);
    expect(await ftsHits('zebra-confidential')).toEqual([world.hiddenTaskId]);
  });

  // ---- from here on, the cases APPEND to the ledger (see the file docblock) ----

  it('APPENDS a second comment newline-separated and keeps the first', async () => {
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.hiddenTaskId },
        type: 'comment.added',
        payload: {
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'appraisal letters go out Monday' }] },
            ],
          },
        },
      }),
    ]);
    // Exact contents: an implementation that ASSIGNED instead of appending
    // returns a different non-empty string here, not an empty one.
    expect((await textOf(world.hiddenTaskId)).comments).toBe(
      'zebra-confidential detail\nappraisal letters go out Monday',
    );
    expect(await ftsHits('appraisal')).toEqual([world.hiddenTaskId]);
    expect(await ftsHits('zebra-confidential')).toEqual([world.hiddenTaskId]);
  });

  /**
   * 7.73 — one of the three guards, each proven by a mutation that dies on it alone: a comment whose document renders to no text adds NOTHING, not even a separator.
   */
  it('adds nothing at all for a comment whose document renders to no text — not even a separator', async () => {
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.hiddenTaskId },
        type: 'comment.added',
        payload: { body: { type: 'doc', content: [] } },
      }),
    ]);
    expect((await textOf(world.hiddenTaskId)).comments).toBe(
      'zebra-confidential detail\nappraisal letters go out Monday',
    );
  });

  it('follows a title re-claim (ticket.field_set title) and drops the words the old title carried', async () => {
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.sharedTaskId },
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value: 'Renew the FSSAI licence' },
      }),
    ]);
    expect((await textOf(world.sharedTaskId)).title).toBe('Renew the FSSAI licence');
    expect(await ftsHits('FSSAI')).toEqual([world.sharedTaskId]);
    // `trade` is gone with the old title — with `licence` beside it as the
    // positive control, so the empty answer means "re-indexed", not "the row
    // stopped matching anything".
    expect(await ftsHits('trade')).toEqual([]);
    expect(await ftsHits('licence')).toEqual([world.sharedTaskId]);
  });

  it('ignores a non-string title claim, and honours a description CLEARING claim', async () => {
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.sharedTaskId },
        type: 'ticket.field_set',
        // `ticketFieldSetPayload` admits any value; a number is not a title.
        payload: { fieldId: 'title', value: 42 },
      }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.owner,
        entity: { kind: 'ticket', id: world.taskInEpicId },
        type: 'ticket.field_set',
        // `null` is the explicit clearing claim (design decision 3).
        payload: { fieldId: 'description', value: null },
      }),
    ]);
    expect((await textOf(world.sharedTaskId)).title).toBe('Renew the FSSAI licence');
    expect((await textOf(world.taskInEpicId)).description).toBe('');
    expect(await ftsHits('timing')).toEqual([]);
    // The positive control the empty answer needs: the row still matches on the
    // text it still holds, so `timing` being gone is the clearing and not death.
    expect(await ftsHits('GST')).toEqual([world.taskInEpicId]);
  });

  it('is registered at the registry TAIL, after proj_tickets and proj_workspace_settings', () => {
    // The pin of record is test/projection-order.test.ts (DB-free), which
    // asserts the whole array; this is the local statement of what this
    // projection needs. See src/projections/index.ts for why appending is a
    // DEPENDENCY decision and not a coordination §8 position.
    const names = buildProjectionRegistry()
      .all()
      .map((projection) => projection.name);
    expect(names.indexOf('proj_search')).toBeGreaterThan(names.indexOf('proj_tickets'));
    expect(names.indexOf('proj_search')).toBeGreaterThan(names.indexOf('proj_workspace_settings'));
    expect(names.at(-1)).toBe('proj_search');
  });

  /**
   * 7.12 — `proj_search` reproduces byte-identically on reset-and-replay in canonical `(entity_kind, entity_id, seq)` order — the whole row, tsvector included.
   */
  it('reproduces byte-identically on reset-and-replay in canonical order', async () => {
    const before = await db.pool.query('SELECT * FROM proj_search ORDER BY ticket_id');
    // Non-vacuity: a replay that agreed about nothing would agree here too.
    expect(before.rows).toHaveLength(5);
    const ledger = await readLedger(db.pool);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await searchProjection.reset(client);
      for (const event of ledger) {
        await searchProjection.apply(event, client);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const after = await db.pool.query('SELECT * FROM proj_search ORDER BY ticket_id');
    expect(after.rows).toEqual(before.rows);
  });

  /**
   * THE tsvector PROOF.
   *
   * `verifyProjections` diffs live against a shadow rebuild with `EXCEPT`,
   * which needs an equality operator on EVERY column. That requirement is why
   * `json` is banned as a projection column type here, and jsonb was admitted
   * only after a predecessor proved it by execution. `tsvector` is the next new
   * column-type class this repo's projections have taken, so it owes the same
   * proof — by execution, not by reasoning from the type name in either
   * direction.
   *
   * Two halves, and both are needed:
   *
   * - The CLEAN verdict over a NON-EMPTY table. If `tsvector` had no equality
   *   operator the `EXCEPT` would not return a wrong answer, it would raise
   *   `could not identify an equality operator for type tsvector` out of
   *   `diffTable`. So a clean run is already the operator's existence — but
   *   only if the table has rows, which is why the count is asserted first.
   * - The PLANTED corruption, REPORTED. `title` is corrupted rather than `tsv`,
   *   because `tsv` is GENERATED: corrupting the text makes the generated
   *   column follow, so the differing rows differ in `tsv` too and the tsvector
   *   genuinely participates in the comparison rather than riding along equal.
   */
  /**
   * 7.72 — `tsvector` under `verify-projections`, proven by EXECUTION rather than reasoned from the type name: a clean verdict over a non-empty table, and a planted live corruption reported in both directions. `title` is corrupted rather than `tsv` precisely because `tsv` is GENERATED, so the tsvector genuinely participates in the comparison instead of riding along equal.
   */
  it('tsvector survives the verifier: clean over a non-empty table, and a planted live corruption is REPORTED', async () => {
    const projections = buildProjectionRegistry();
    const counted = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_search');
    expect(counted.rows[0]?.n, 'proj_search is empty — a clean verdict over it proves nothing').toBe(5);

    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });

    await db.pool.query('UPDATE proj_search SET title = $2 WHERE ticket_id = $1', [
      world.epicId,
      'corrupted past the ledger',
    ]);
    const report = await verifyProjections({ pool: db.pool, projections });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_search']);
    expect(report.diffs[0]).toMatchObject({ missingFromLive: 1, extraInLive: 1 });
    expect(report.diffs[0]?.samples.join('\n')).toContain('corrupted past the ledger');
    // The differing rows differ in the tsvector as well as in the text.
    expect(report.diffs[0]?.samples.join('\n')).toContain("'corrupted':1A");

    // The verify wrote nothing live — the corruption is still there.
    expect((await textOf(world.epicId)).title).toBe('corrupted past the ledger');

    // And the loop closes: rebuild repairs it and the verdict is clean again.
    await rebuildProjection('proj_search', { pool: db.pool, projections });
    expect((await textOf(world.epicId)).title).toBe('Registrations drive');
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });
  });
});

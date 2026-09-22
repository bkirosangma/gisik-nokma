import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

/**
 * 13.1364 (owner request 2026-09-23) — a ticket's BIRTH description reaches
 * `proj_search`.
 *
 * ## Why this is its own FILE rather than two more cases in `search.test.ts`
 *
 * Not tidiness: that file's docblock makes the order of its cases part of its
 * fixture, and two of its read-only cases assert the table has exactly FIVE
 * rows — the seeded world's size — as the non-vacuity control under the verifier
 * case that takes a clean verdict over the whole table. **Every case in its
 * appending region so far UPDATED an existing row** (`comment.added`,
 * `ticket.field_set`), so the count never moved. A description at birth needs a
 * NEW ticket, which moves the count, so adding these there would have forced
 * edits to two assertions belonging to cases about something else — and those
 * assertions would then silently be about this file's cases too. A separate
 * database costs one seed and keeps each file's count binding only itself.
 *
 * ## The defect being closed, stated as a measurement
 *
 * `proj_search.description` was written by the `ticket.field_set` branch ALONE.
 * The `ticket.created` branch inserted `(ticket_id, workspace_id, project_id,
 * title)` and nothing else, so a ticket created with a description carried the
 * document in head state — the sheet rendered it, `docToPlainText` rendered it
 * for the read models — while the search column kept the table's own default.
 * The person who wrote the description would find the ticket by its TITLE and
 * not by the words they had just typed, which reads as a search that is broken
 * rather than as one column that was never written.
 *
 * ## The assertions are exact contents beside a match, for the file-local reason
 *
 * `toEqual([])` cannot tell "correctly matched nothing" from "this column is
 * empty and nothing will ever match", and a description stored as the serialised
 * document would still answer every query about the words inside it. So the
 * plain-text claim is asserted as the EXACT COLUMN CONTENTS — an implementation
 * that stored `JSON.stringify(doc)` returns a different non-empty string rather
 * than an empty one — and each empty answer stands beside a positive control.
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

async function textOf(ticketId: string): Promise<{ title: string; description: string; comments: string }> {
  const { rows } = await db.pool.query(
    'SELECT title, description, comments FROM proj_search WHERE ticket_id = $1',
    [ticketId],
  );
  return rows[0] as { title: string; description: string; comments: string };
}

/** The same read the `/v1/search` route makes, so a match is reachable and not merely stored. */
async function ftsHits(query: string): Promise<string[]> {
  const { rows } = await db.pool.query(
    `SELECT ticket_id FROM proj_search
      WHERE workspace_id = $1 AND tsv @@ websearch_to_tsquery('simple', $2)
      ORDER BY ticket_id`,
    [world.workspaceId, query],
  );
  return rows.map((row) => (row as { ticket_id: string }).ticket_id);
}

function bornWith(id: string, title: string, description?: unknown) {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId: world.owner,
    entity: { kind: 'ticket', id },
    type: 'ticket.created',
    payload: {
      typeId: 'task',
      projectId: world.projectId,
      parentId: null,
      title,
      ...(description === undefined ? {} : { description }),
    },
  });
}

describe('13.1364 a birth description is indexed as plain text', () => {
  it('indexes the description a ticket is BORN with, exactly as the field_set door renders it', async () => {
    const id = newUlid();
    await applyCommitted(db.pool, [
      bornWith(id, 'Order the new sign', {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the laminate is peeling' }] }],
      }),
    ]);

    expect((await textOf(id)).description).toBe('the laminate is peeling');
    // Reachable through the query path, not merely stored — the half an exact
    // column assertion cannot show, since a description written to the right
    // place but never reaching `tsv` would satisfy the line above.
    expect(await ftsHits('laminate')).toEqual([id]);
    // The positive control the empty answers below need: this ticket's TITLE
    // still matches, so the row exists and is indexed at all, and the
    // description assertion is not passing against a row that was never made.
    expect(await ftsHits('sign')).toEqual([id]);
    // …and it is PLAIN TEXT. Asserted on the column rather than by a query: the
    // document's own key names (`doc`, `type`, `paragraph`) are common English
    // on other rows, so a query for one of them would be a poor instrument for
    // this question. The exact string above already excludes the JSON, and this
    // line says why that is the measurement being relied on.
    expect((await textOf(id)).description).not.toContain('"type"');
  });

  it('CONTROL: a ticket born with NO description gets an EMPTY one — absent is not a serialised nothing', async () => {
    // The other half of the same branch. A `ticket.created` with no description
    // must not invent one, and must not store the string `'null'` or
    // `'undefined'` — either would be searchable text nobody typed, in an index
    // the product presents as a record of what was said.
    const id = newUlid();
    await applyCommitted(db.pool, [bornWith(id, 'Ring the plumber')]);

    expect((await textOf(id)).description).toBe('');
    expect(await ftsHits('plumber')).toEqual([id]);
    expect(await ftsHits('undefined')).toEqual([]);
    expect(await ftsHits('null')).toEqual([]);
  });

  it('CONTROL: the seeded world is untouched by either case, so the count assertion in the sibling file is not this one', async () => {
    // Two tickets were added and the seeded five were not modified — asserted
    // here so a projection change that rewrote every row would redden in THIS
    // file, where the cause is, rather than in `search.test.ts`'s fixture count.
    const { rows } = await db.pool.query('SELECT COUNT(*)::int AS n FROM proj_search WHERE workspace_id = $1', [
      world.workspaceId,
    ]);
    expect((rows[0] as { n: number }).n).toBe(7);
    expect((await textOf(world.taskInEpicId)).description).toBe(
      'GSTR-3B for July, portal keeps timing out',
    );
  });
});

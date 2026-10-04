/**
 * wtg2 T2 (workflow-timeline-graphs LK-5): `proj_ticket_links` takes kind `leads_to` and a `label`. Case 29.125
 * (`test-cases/29-workflow-timeline-graphs.md`). The setup is typed-links T2's (`ticket-links.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';

let db: TestDatabase;
let f: NotesFixture;
beforeAll(async () => {
  db = await createTestDatabase();
  f = await seedNotesFixture(db.pool);
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const link = (type: 'ticket.link_added' | 'ticket.link_removed', source: string, kind: string, target: string) =>
  makeCommitted({ workspaceId: f.WS, actorId: f.ids.owner, entity: { kind: 'ticket', id: source }, type, payload: { kind, targetId: target } });
const lead = (type: 'ticket.link_added' | 'ticket.link_removed', source: string, target: string, label?: string) =>
  makeCommitted({ workspaceId: f.WS, actorId: f.ids.owner, entity: { kind: 'ticket', id: source }, type,
    payload: { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) } });
const rows = async () =>
  (await db.pool.query<{ kind: string; label: string | null }>(
    'SELECT kind, label FROM proj_ticket_links WHERE source_id = $1 AND target_id = $2 ORDER BY kind',
    [f.TP, f.TE],
  )).rows;

describe('29.125 proj_ticket_links and leads_to', () => {
  it('29.125 label stored, relabel rewrites, CHECKs refuse, links round-trip, rebuild equals live', async () => {
    await applyCommitted(db.pool, [lead('ticket.link_added', f.TP, f.TE, 'Yes'), link('ticket.link_added', f.TP, 'blocks', f.TE)]);
    expect((await rows()).map((r) => [r.kind, r.label])).toEqual([['blocks', null], ['leads_to', 'Yes']]); // control: blocks NULL
    await applyCommitted(db.pool, [lead('ticket.link_removed', f.TP, f.TE), lead('ticket.link_added', f.TP, f.TE, 'Maybe')]);
    expect((await rows()).find((r) => r.kind === 'leads_to')?.label).toBe('Maybe');
    expect((await getTicketStateFromDb(db.pool, f.WS, f.TP))?.links).toContainEqual({ kind: 'leads_to', targetId: f.TE, label: 'Maybe' });
    const def = (await db.pool.query("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'proj_ticket_links_kind_check'")).rows[0]?.d;
    expect(def).toContain('leads_to');
    const insert = (kind: string, label: string | null) => db.pool.query(
      `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, label, created_by, created_at, origin, seq) VALUES ($1,$2,$3,$4,$5,$6,now(),'web',1)`,
      [f.WS, f.TE, f.TP, kind, label, f.ids.owner]);
    await expect(insert('parent', null)).rejects.toMatchObject({ code: '23514' });
    await expect(insert('blocks', 'Yes')).rejects.toMatchObject({ code: '23514' });
    await expect(insert('leads_to', 'Yes')).resolves.toMatchObject({ rowCount: 1 }); // control: the two CHECKs admit a labelled leads_to
    await db.pool.query("DELETE FROM proj_ticket_links WHERE source_id = $1 AND target_id = $2 AND label = 'Yes'", [f.TE, f.TP]); // a hand-made row has no ledger event
    const verdict = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(verdict.clean, JSON.stringify(verdict.diffs)).toBe(true);
  });
});

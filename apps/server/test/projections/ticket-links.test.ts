/**
 * Typed links T2 (Knowledge Graph spec A §2.5): `proj_ticket_links` and the `proj_tickets.links` column.
 * Cases 27.020–27.022 (`test-cases/27-knowledge-graph.md` §27.1). One database per file, as `seedNotesFixture` demands.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';

let db: TestDatabase;
let f: NotesFixture;
beforeAll(async () => {
  db = await createTestDatabase();
  f = await seedNotesFixture(db.pool);
}, 60_000);
afterAll(async () => {
  await db.drop();
});

/** A fresh ticket in the fixture's project, so no case reads another case's links. */
async function newTicket(title: string): Promise<string> {
  const id = newUlid();
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: f.WS, actorId: f.ids.owner, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId: f.P, parentId: null, title } }),
  ]);
  return id;
}

const link = (type: 'ticket.link_added' | 'ticket.link_removed', source: string, kind: string, target: string, extra: { actorId?: string; origin?: string } = {}) =>
  makeCommitted({ workspaceId: f.WS, actorId: extra.actorId ?? f.ids.owner, entity: { kind: 'ticket', id: source }, type, payload: { kind, targetId: target }, ...(extra.origin ? { origin: extra.origin } : {}) });

const ticketEvent = (type: 'ticket.deleted' | 'ticket.restored', id: string) =>
  makeCommitted({ workspaceId: f.WS, actorId: f.ids.owner, entity: { kind: 'ticket', id }, type, payload: {} });

type LinkRow = { workspace_id: string; source_id: string; target_id: string; kind: string; created_by: string; created_at: Date; origin: string; seq: number };
const rowsBetween = async (source: string, target: string) =>
  (await db.pool.query<LinkRow>(
    'SELECT workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq FROM proj_ticket_links WHERE source_id = $1 AND target_id = $2 ORDER BY kind',
    [source, target],
  )).rows;

describe('27.020 proj_ticket_links', () => {
  it('27.020 add writes a provenance row (actor, server time, origin, workspace seq); remove deletes exactly that kind', async () => {
    const A = await newTicket('Link source');
    const B = await newTicket('Link target');
    // The admin from MCP, so neither the actor nor the origin is the fixture's default (owner, 'web').
    const blocks = link('ticket.link_added', A, 'blocks', B, { actorId: f.ids.admin, origin: 'mcp' });
    const relates = link('ticket.link_added', A, 'relates', B);
    // The entity seq and the workspace seq differ, so a row holding the wrong one cannot pass.
    expect(blocks.seq).not.toBe(blocks.workspaceSeq);
    await applyCommitted(db.pool, [blocks, relates]);
    const rows = await rowsBetween(A, B);
    expect(rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))).toEqual([
      { workspace_id: f.WS, source_id: A, target_id: B, kind: 'blocks', created_by: f.ids.admin, created_at: blocks.serverTime, origin: 'mcp', seq: blocks.workspaceSeq },
      { workspace_id: f.WS, source_id: A, target_id: B, kind: 'relates', created_by: f.ids.owner, created_at: relates.serverTime, origin: 'web', seq: relates.workspaceSeq },
    ]);
    await applyCommitted(db.pool, [link('ticket.link_removed', A, 'blocks', B)]);
    // CONTROL: the second kind between the same pair is its own row and survives the removal.
    expect((await rowsBetween(A, B)).map((r) => r.kind)).toEqual(['relates']);
  });
});

describe('27.021 proj_tickets.links', () => {
  it('27.021 the column reads back as the reducer folds it, and a ticket with no links has NO links key', async () => {
    const A = await newTicket('Holds links');
    const B = await newTicket('Is linked');
    // CONTROL first: a ticket that never linked has no key (the reducer's own shape).
    expect('links' in ((await getTicketStateFromDb(db.pool, f.WS, A)) ?? {})).toBe(false);
    await applyCommitted(db.pool, [link('ticket.link_added', A, 'relates', B), link('ticket.link_added', A, 'blocks', B)]);
    expect((await getTicketStateFromDb(db.pool, f.WS, A))?.links).toEqual([
      { kind: 'relates', targetId: B },
      { kind: 'blocks', targetId: B },
    ]);
    // The target's own state holds nothing: links are outbound only.
    expect('links' in ((await getTicketStateFromDb(db.pool, f.WS, B)) ?? {})).toBe(false);
    await applyCommitted(db.pool, [link('ticket.link_removed', A, 'relates', B)]);
    expect((await getTicketStateFromDb(db.pool, f.WS, A))?.links).toEqual([{ kind: 'blocks', targetId: B }]);
    await applyCommitted(db.pool, [link('ticket.link_removed', A, 'blocks', B)]);
    const after = await getTicketStateFromDb(db.pool, f.WS, A);
    expect(after).not.toBeNull();
    expect('links' in (after ?? {})).toBe(false);
  });
});

describe('27.022 trash keeps the row', () => {
  it('27.022 moving either end to the trash keeps the row, and restoring keeps it', async () => {
    const A = await newTicket('Trashed source');
    const B = await newTicket('Trashed target');
    await applyCommitted(db.pool, [link('ticket.link_added', A, 'duplicates', B)]);
    const kinds = async () => (await rowsBetween(A, B)).map((r) => r.kind);
    expect(await kinds()).toEqual(['duplicates']); // CONTROL: present before any delete
    await applyCommitted(db.pool, [ticketEvent('ticket.deleted', B)]);
    expect(await kinds()).toEqual(['duplicates']);
    await applyCommitted(db.pool, [ticketEvent('ticket.restored', B)]);
    expect(await kinds()).toEqual(['duplicates']);
    await applyCommitted(db.pool, [ticketEvent('ticket.deleted', A)]);
    expect(await kinds()).toEqual(['duplicates']);
    await applyCommitted(db.pool, [ticketEvent('ticket.restored', A)]);
    expect(await kinds()).toEqual(['duplicates']);
    // The source's folded copy survives the trash too.
    expect((await getTicketStateFromDb(db.pool, f.WS, A))?.links).toEqual([{ kind: 'duplicates', targetId: B }]);
  });
});

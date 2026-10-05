import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { readHome } from '../../src/routes/home.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';
import { normaliseHome } from './home-golden.js';
import { newUlid } from '@gisik-nokma/domain';

/**
 * The byte-identical proof of WTG4 T1's collector split (`readHome` → `collectHome` + `toHomeResponse`): the golden was
 * captured with `WTG4_CAPTURE=1` on the UNTOUCHED `home.ts` (before the split) and committed; after the split this reads
 * the same bytes. The case is T3's 29.307 (it seeds and flips the line); T3's route test reuses `normaliseHome` and this file.
 */
const FILE = new URL('./fixtures/home-golden.json', import.meta.url);

let db: TestDatabase;
let read: ReadWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  // The read world has no note, no past-due and no closed ticket: without these the golden could not see a mutant that
  // swaps open for tickets, past-due for due-soon, or drops a notes clause. Ids are fresh per run, so they normalise to '#'.
  const { workspaceId, projectId, owner } = read.world;
  const ws = { workspaceId, actorId: owner };
  const done = newUlid();
  const late = newUlid();
  const notes = { ws: newUlid(), project: newUlid(), mine: newUlid(), gone: newUlid() };
  await applyCommitted(db.pool, [
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: done }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Golden done' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: done }, type: 'ticket.transitioned', payload: { to: 'done' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: late }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Golden late', dueDate: { date: '2026-08-10' } } }),
    makeCommitted({ ...ws, entity: { kind: 'note', id: notes.ws }, type: 'note.created', payload: { title: 'Golden workspace note', homeProjectId: '', scope: { mode: 'workspace' } } }),
    makeCommitted({ ...ws, entity: { kind: 'note', id: notes.project }, type: 'note.created', payload: { title: 'Golden project note', homeProjectId: projectId, scope: { mode: 'workspace' } } }),
    makeCommitted({ ...ws, entity: { kind: 'note', id: notes.mine }, type: 'note.created', payload: { title: 'Golden private note', homeProjectId: projectId, scope: { mode: 'explicit', userIds: [owner] } } }),
    makeCommitted({ ...ws, entity: { kind: 'note', id: notes.gone }, type: 'note.created', payload: { title: 'Golden deleted note', homeProjectId: '', scope: { mode: 'workspace' } } }),
    makeCommitted({ ...ws, entity: { kind: 'note', id: notes.gone }, type: 'note.deleted', payload: {} }),
  ]);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

describe('29.307 readHome is byte-identical across the collector split', () => {
  it('29.307 the normalised body for the read world equals the stored golden, for every role, twice in a row; control: a changed count is caught', async () => {
    const names = { ...read.world, ...read.userIds };
    const bodies: string[] = [];
    for (const role of ['owner', 'member', 'outsider', 'guest'] as const) {
      const viewer = read.userIds[role];
      const eff = await resolveEffectiveRole(db.pool, viewer, read.world.workspaceId);
      const body = normaliseHome(await readHome(db.pool, eff, viewer, read.world.workspaceId, SCENARIO_NOW), names);
      const again = normaliseHome(await readHome(db.pool, eff, viewer, read.world.workspaceId, SCENARIO_NOW), names);
      expect(again).toBe(body); // stable across calls
      bodies.push(`${role}\n${body}`);
    }
    const all = bodies.join('');
    if (process.env['WTG4_CAPTURE'] === '1') writeFileSync(FILE, all);
    expect(all).toBe(readFileSync(FILE, 'utf8'));
    const owner = JSON.parse(bodies[0]!.slice('owner\n'.length)) as { counts: Record<string, number> };
    expect(normaliseHome({ ...owner, counts: { ...owner.counts, tickets: -1 } }, names)).not.toBe(bodies[0]!.slice('owner\n'.length)); // control: the comparison can fail
  });
});

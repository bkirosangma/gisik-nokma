import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { readHome } from '../../src/routes/home.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';

/**
 * 27.600 — spec E §2.4's budget: p95 ≤ 120 ms server-side on a prod-sized copy. Gated like
 * `search/perf.test.ts` (18.162): `HOME_PERF=1` or it prints what it would measure and skips.
 * Sizes come from HOME_PERF_TICKETS / HOME_PERF_NOTES (the brief's prod counts × 10, floor 10 000 / 2 000).
 */
const ENABLED = process.env['HOME_PERF'] === '1';
const TICKETS = Number(process.env['HOME_PERF_TICKETS'] ?? 10_000);
const NOTES = Number(process.env['HOME_PERF_NOTES'] ?? 2_000);

let db: TestDatabase;
let read: ReadWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  if (ENABLED) read = await buildReadTestApp(db);
}, 3_600_000);
afterAll(async () => {
  if (ENABLED) await read.app.close();
  await db.drop();
});

function percentile(sorted: number[], fraction: number): number {
  const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, at)] as number;
}

describe('27.600 the home read meets p95 ≤ 120 ms at prod size', () => {
  if (!ENABLED) {
    console.log(`home-perf: SKIPPED — set HOME_PERF=1 to seed ${TICKETS} tickets / ${NOTES} notes and measure p95 ≤ 120 ms.`);
    it.skip('seeds and measures (set HOME_PERF=1)', () => undefined);
    return;
  }
  it('27.600 p95 for the owner (TRUE predicate) and the member (audience + assignee arms) are both ≤ 120 ms', async () => {
    const { workspaceId, projectId, owner, member } = read.world;
    const ws = { workspaceId, actorId: owner };
    const events: LedgerEvent[] = [];
    for (let i = 0; i < TICKETS; i += 1) {
      const id = newUlid();
      events.push(makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: `Perf ${i}` } }));
      if (i % 5 === 0) events.push(makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.field_set', payload: { fieldId: 'dueDate', value: { date: i % 2 === 0 ? '2026-08-10' : '2026-08-24' } } }));
      if (i % 7 === 0) events.push(makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.transitioned', payload: { to: 'done' } }));
    }
    for (let i = 0; i < NOTES; i += 1) {
      events.push(makeCommitted({ ...ws, entity: { kind: 'note', id: newUlid() }, type: 'note.created', payload: { title: `Perf note ${i}`, homeProjectId: projectId, scope: { mode: 'workspace' } } }));
    }
    const seededAt = Date.now();
    await applyCommitted(db.pool, events);
    console.log(`home-perf: seeded ${events.length} events in ${Date.now() - seededAt} ms`);

    for (const viewer of [owner, member]) {
      const eff = await resolveEffectiveRole(db.pool, viewer, workspaceId);
      for (let i = 0; i < 10; i += 1) await readHome(db.pool, eff, viewer, workspaceId, SCENARIO_NOW); // warm
      const times: number[] = [];
      for (let i = 0; i < 100; i += 1) {
        const t0 = performance.now();
        await readHome(db.pool, eff, viewer, workspaceId, SCENARIO_NOW);
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const p95 = percentile(times, 0.95);
      console.log(`home-perf: ${viewer === owner ? 'owner' : 'member'} p95 ${p95.toFixed(1)} ms over 100 reads (${TICKETS} tickets, ${NOTES} notes), machine ${process.platform}/${process.arch}`);
      expect(p95, 'spec E §2.4: p95 ≤ 120 ms').toBeLessThanOrEqual(120);
    }
  }, 3_600_000);
});

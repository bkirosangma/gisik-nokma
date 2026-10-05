import os from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Knowledge Graph spec D §10, KG-D Task 4 (27.473): `get_concept` p95 at 500 items, through the route the MCP tool
 * calls (`GET /v1/concepts/:id`, `app.inject`). The bar is spec C §2.2's per-ring budget, reused: ≤ 150 ms.
 * Gated like `test/search/perf.test.ts` and `test/semantic/perf.test.ts`: a default run prints a skip, and
 * `CONCEPT_PERF=1` seeds and measures.
 *
 * The world is 27.414's: 500 tickets, every 50th explicit to the owner. C500 holds all 500, so the member cannot
 * see it (10 hidden); C490 holds the 490 the member sees, and is what is timed.
 */
const ENABLED = process.env['CONCEPT_PERF'] === '1';
const MACHINE = `${os.cpus()[0]?.model ?? 'cpu'} x${String(os.cpus().length)}, ${String(Math.round(os.totalmem() / 2 ** 30))} GB, node ${process.version}`;

let db: TestDatabase | undefined;
beforeAll(async () => {
  if (ENABLED) db = await createTestDatabase();
}, 600_000);
afterAll(async () => {
  await db?.drop();
});

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, at)] as number;
}

describe('27.473 get_concept at 500 items', () => {
  if (!ENABLED) {
    console.log(
      'concept-perf: SKIPPED — set CONCEPT_PERF=1 to seed 500 tickets into two concepts and measure ' +
        'GET /v1/concepts/:id as a member (p95 ≤ 150 ms over 100 runs).',
    );
    it.skip('measures GET /v1/concepts/:id p95 (set CONCEPT_PERF=1)', () => undefined);
    return;
  }

  it('27.473 GET /v1/concepts/C490 has p95 ≤ 150 ms; controls: every answer is 200 with 490 items, and C500 (10 hidden) is a 404', async () => {
    const pool = (db as TestDatabase).pool;
    const { app, otp } = buildTestApp(db as TestDatabase);
    await app.ready();
    const owner = await signInWithPhone(app, otp, '+911100047300');
    const member = await signInWithPhone(app, otp, '+911100047301');
    const WS = newUlid();
    const P = newUlid();
    await seedProject(pool, WS, P);
    await seedMember(pool, WS, owner.userId, 'owner', [{ projectId: P, projectAdmin: true }]);
    await seedMember(pool, WS, member.userId, 'member', [{ projectId: P }]);
    const ids = Array.from({ length: 500 }, () => newUlid());
    const visible: string[] = [];
    for (const [i, id] of ids.entries()) {
      await seedTicket(pool, { workspaceId: WS, ticketId: id, projectId: P, title: `Perf ${String(i)}` });
      if (i % 50 === 0) await applyAll(pool, [setVisibilityEnv(WS, id, 'explicit', [owner.userId])]);
      else visible.push(id);
    }
    const C500 = newUlid();
    const C490 = newUlid();
    const cev = (conceptId: string, type: string, payload: Record<string, unknown>): LedgerEvent =>
      makeCommitted({ workspaceId: WS, actorId: owner.userId, entity: { kind: 'concept', id: conceptId }, type, payload });
    await applyCommitted(pool, [
      cev(C500, 'concept.created', { name: 'Everything' }),
      ...ids.map((id) => cev(C500, 'concept.item_tagged', { itemKind: 'ticket', itemId: id })),
      cev(C490, 'concept.created', { name: 'What the member sees' }),
      ...visible.map((id) => cev(C490, 'concept.item_tagged', { itemKind: 'ticket', itemId: id })),
    ]);
    const headers = { authorization: `Bearer ${member.token}` };
    // Control: the 10 hidden tickets hide C500, so the measured route does D4's work and not a shortcut.
    expect((await app.inject({ method: 'GET', url: `/v1/concepts/${C500}`, headers })).statusCode).toBe(404);

    const samples: number[] = [];
    for (let run = 0; run < 100; run += 1) {
      const started = performance.now();
      const res = await app.inject({ method: 'GET', url: `/v1/concepts/${C490}`, headers });
      samples.push(performance.now() - started);
      // Every measured answer is the real one: a route that answered 404 fast would otherwise meet the bar.
      expect(res.statusCode).toBe(200);
      expect((res.json() as { items: unknown[] }).items).toHaveLength(490);
    }
    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 0.95);
    console.log(
      `concept-perf [${MACHINE}]: GET /v1/concepts/:id at 490 visible of 500, 100 runs: p50=${percentile(samples, 0.5).toFixed(1)} ms ` +
        `p95=${p95.toFixed(1)} ms max=${(samples[samples.length - 1] as number).toFixed(1)} ms (bar 150 ms)`,
    );
    expect(p95).toBeLessThanOrEqual(150);
    await app.close();
  }, 3_600_000);
});

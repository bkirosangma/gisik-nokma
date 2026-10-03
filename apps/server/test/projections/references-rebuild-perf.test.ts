import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { backfillReferences } from '../../src/projections/backfill-references.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Knowledge Graph spec B §2.1 / §8: the rebuild AND the boot backfill of
 * proj_references, measured before shipping (case 27.118). Prod size was not
 * supplied; the size is the planner's FLOOR (P = 100 000 body events,
 * Q = 400 000 other events), the defaults below.
 *
 * REFS_PERF=1 [REFS_PERF_BODY_EVENTS=<n>] [REFS_PERF_OTHER_EVENTS=<m>]
 * The ledger is written straight into `events` (bulk INSERT): the rebuild reads
 * `events` alone, and seeding through `applyCommitted` at prod size would take
 * longer than the thing measured. Bodies carry two ticket chips, a note link and a
 * mention each, in three paragraphs — denser than a typical body, so the number errs high.
 */
const ENABLED = process.env['REFS_PERF'] === '1';
const BACKFILL_ONLY = process.env['REFS_PERF_BACKFILL_ONLY'] === '1'; // skip the two whole-ledger rebuilds (see the case)
const BODY_EVENTS = Number(process.env['REFS_PERF_BODY_EVENTS'] ?? '100000');
const OTHER_EVENTS = Number(process.env['REFS_PERF_OTHER_EVENTS'] ?? '400000');
// The bar (planner ruling 2026-10-03 13:24, RULING A: the first 10 000 ms bar was set without measuring the
// existing projections — proj_search takes ~50 s at this floor). Machine-relative, so it means the same on any box.
const BAR_RATIO = 3; // rebuild proj_references <= 3 x the proj_search rebuild measured in THIS run
const BAR_RSS_MB = 512;
const BAR_ENTITY_MS = 100; // the deploy path: the backfill's longest single-entity transaction

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 600_000);
afterAll(async () => {
  await db.drop();
});

const para = (...inline: unknown[]) => ({ type: 'paragraph', content: inline });
const text = (value: string) => ({ type: 'text', text: value });

/** Seeds the ledger and returns the number of distinct SOURCES it wrote: a repeated description or note body REPLACES its source's rows, only a comment is a new source each time. */
async function seed(bodyEvents: number, otherEvents: number): Promise<number> {
  const WS = newUlid();
  const ACTOR = newUlid();
  const tickets = Array.from({ length: Math.max(2, Math.floor(bodyEvents / 10)) }, () => newUlid());
  const notes = Array.from({ length: Math.max(1, Math.floor(bodyEvents / 20)) }, () => newUlid());
  const sources = new Set<string>();
  const entitySeq = new Map<string, number>();
  let workspaceSeq = 0;
  const columns: unknown[][] = Array.from({ length: 13 }, () => []);
  const flush = async () => {
    if (columns[0]!.length === 0) return;
    await db.pool.query(
      `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::jsonb[], $8::text[], $9::text[], $10::timestamptz[], $11::timestamptz[], $12::bigint[], $13::bigint[])`,
      columns,
    );
    for (const column of columns) column.length = 0;
  };
  for (let i = 0; i < bodyEvents + otherEvents; i += 1) {
    const isBody = i < bodyEvents;
    const onNote = isBody && i % 3 === 2;
    const entityId = onNote ? notes[i % notes.length]! : tickets[i % tickets.length]!;
    const key = `${onNote ? 'note' : 'ticket'}:${entityId}`;
    const seq = (entitySeq.get(key) ?? 0) + 1;
    entitySeq.set(key, seq);
    workspaceSeq += 1;
    const docBody = {
      type: 'doc',
      content: [
        para(text(`Line ${i} about `), { type: 'ticketRef', attrs: { ticketId: tickets[(i + 1) % tickets.length], projectId: 'P', key: 'GN-1', title: 'Chiller' } }),
        para(text('and '), { type: 'wikiLink', attrs: { noteId: notes[(i + 3) % notes.length], title: 'Rulings' } }, text(' with '), { type: 'mention', attrs: { userId: ACTOR, label: 'Ama' } }),
        para(text('blocked by '), { type: 'ticketRef', attrs: { ticketId: tickets[(i + 7) % tickets.length], projectId: 'P', key: 'GN-2', title: 'Compressor' } }, text(' until the part arrives.')),
      ],
    };
    const [type, payload] = !isBody
      ? ['ticket.ranked', { rank: 'a0' }]
      : onNote
        ? ['note.body_set', { body: docBody }]
        : i % 3 === 0
          ? ['ticket.field_set', { fieldId: 'description', value: docBody }]
          : ['comment.added', { body: docBody }];
    const at = new Date(Date.UTC(2026, 8, 22) + i * 1000).toISOString();
    const eventId = newUlid();
    if (type === 'comment.added') sources.add(`comment:${eventId}`);
    else if (isBody) sources.add(`${onNote ? 'note' : 'ticket'}:${entityId}`);
    const row = [eventId, WS, onNote ? 'note' : 'ticket', entityId, type, 1, JSON.stringify(payload), ACTOR, 'web', at, at, seq, workspaceSeq];
    row.forEach((value, index) => columns[index]!.push(value));
    if (columns[0]!.length === 5_000) await flush();
  }
  await flush();
  return sources.size;
}

async function measure(name: string): Promise<{ ms: number; rssMb: number }> {
  const base = process.memoryUsage().rss;
  let peak = base;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 25);
  const started = performance.now();
  await rebuildProjection(name, { pool: db.pool, projections: buildProjectionRegistry() });
  const ms = performance.now() - started;
  clearInterval(timer);
  peak = Math.max(peak, process.memoryUsage().rss);
  return { ms, rssMb: (peak - base) / 1_048_576 };
}

async function measureBackfill(): Promise<{ ms: number; rssMb: number; maxEntityMs: number; entities: number }> {
  await db.pool.query('TRUNCATE proj_references');
  await db.pool.query('DELETE FROM projection_backfills');
  const base = process.memoryUsage().rss;
  let peak = base;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 25);
  // Diagnostic only (not the bar): the replay-to-commit time of every entity, from the probe stages, so a single
  // spike in `maxEntityMs` can be told from a slow body of entities.
  const spans: number[] = [];
  let mark = 0;
  const result = await backfillReferences(db.pool, {
    projections: buildProjectionRegistry(),
    probe: async (stage) => {
      if (stage === 'replaying') mark = performance.now();
      else spans.push(performance.now() - mark);
    },
  });
  const sorted = [...spans].sort((x, y) => x - y);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  console.log(
    `refs-perf: backfill entity replay+commit p50 ${at(0.5).toFixed(1)} ms, p99 ${at(0.99).toFixed(1)} ms, p99.9 ${at(0.999).toFixed(1)} ms, ` +
      `${sorted.filter((ms) => ms > BAR_ENTITY_MS).length} of ${sorted.length} over ${BAR_ENTITY_MS} ms, first entity ${(spans[0] ?? 0).toFixed(1)} ms`,
  );
  clearInterval(timer);
  peak = Math.max(peak, process.memoryUsage().rss);
  return { ms: result.ms, rssMb: (peak - base) / 1_048_576, maxEntityMs: result.maxEntityMs, entities: result.entities };
}

describe('27.118 the rebuild and the boot backfill at the size floor', () => {
  if (!ENABLED) {
    console.log('refs-perf: SKIPPED — set REFS_PERF=1 to measure the proj_references rebuild and backfill at the floor (P=100 000, Q=400 000) against the bar (rebuild ≤ 3 × the proj_search baseline of the same run and ≤ +512 MB RSS; backfill ≤ +512 MB RSS and longest entity transaction ≤ 100 ms).');
    it.skip('measures the proj_references rebuild (set REFS_PERF=1)', () => undefined);
    return;
  }
  it('27.118 proj_references rebuilds and backfills within the bar; proj_search on the same ledger is the baseline', async () => {
    expect(BODY_EVENTS).toBeGreaterThan(0);
    const sourceCount = await seed(BODY_EVENTS, OTHER_EVENTS);
    if (BACKFILL_ONLY) {
      // Headroom run: `rebuildProjection` loads the WHOLE ledger (`readLedger`), which at 10x the floor exceeds
      // node's default heap for ANY projection (proj_search too); the backfill, which walks entities, does not.
      const only = await measureBackfill();
      console.log(
        `refs-perf: backfill-only ${BODY_EVENTS} body + ${OTHER_EVENTS} other events: ${only.entities} entities in ${only.ms.toFixed(0)} ms (+${only.rssMb.toFixed(0)} MB), ` +
          `longest entity transaction ${only.maxEntityMs.toFixed(0)} ms (the ${sourceCount * 4} rows expected)`,
      );
      expect(only.rssMb).toBeLessThanOrEqual(BAR_RSS_MB);
      return;
    }
    const baseline = await measure('proj_search');
    const refs = await measure('proj_references');
    const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_references');
    console.log(
      `refs-perf: ${BODY_EVENTS} body + ${OTHER_EVENTS} other events on ${cpus()[0]?.model ?? 'unknown cpu'}; ` +
        `proj_search ${baseline.ms.toFixed(0)} ms (+${baseline.rssMb.toFixed(0)} MB); ` +
        `proj_references ${refs.ms.toFixed(0)} ms (+${refs.rssMb.toFixed(0)} MB), ${rows[0]?.n ?? 0} rows`,
    );
    // Four references per body, one body per SOURCE (a later body replaces an earlier one): the rebuild did the work.
    // A miss here is a fixture fault, NOT the stop bar — the bar is the two lines below.
    expect(rows[0]?.n).toBe(sourceCount * 4);
    const backfill = await measureBackfill();
    const after = (await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM proj_references')).rows[0]?.n;
    console.log(
      `refs-perf: backfill ${backfill.entities} entities in ${backfill.ms.toFixed(0)} ms (+${backfill.rssMb.toFixed(0)} MB), ` +
        `longest entity transaction ${backfill.maxEntityMs.toFixed(0)} ms, ${after ?? 0} rows`,
    );
    expect(after).toBe(rows[0]?.n); // the backfill reaches the rebuild's rows
    console.log(`refs-perf: bar — rebuild ${refs.ms.toFixed(0)} ms = ${(refs.ms / baseline.ms).toFixed(2)} x the proj_search baseline ${baseline.ms.toFixed(0)} ms (limit ${BAR_RATIO}x)`);
    expect(refs.ms).toBeLessThanOrEqual(BAR_RATIO * baseline.ms);
    expect(refs.rssMb).toBeLessThanOrEqual(BAR_RSS_MB);
    expect(backfill.rssMb).toBeLessThanOrEqual(BAR_RSS_MB);
    expect(backfill.maxEntityMs).toBeLessThanOrEqual(BAR_ENTITY_MS);
  }, 3_600_000);
});

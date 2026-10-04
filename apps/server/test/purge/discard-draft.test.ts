import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, purgeCompletedPayload, SYSTEM_ACTOR_PURGE } from '@gisik-nokma/domain';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { discardDraft, pendingDraftDiscards } from '../../src/purge/discard-draft.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { runPurgeSweep, type PurgeSweepDeps } from '../../src/purge/sweep.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { doc, ev, newMarker, projectCreated, recordingStore, seedWorkspace, text, TYPE_ID, ticketCreated, type Base } from './world.js';

/**
 * Drafts T5 — erasing a discarded draft: the same transaction as a trashed ticket's purge, through a different gate
 * (`draftDiscarded`: the draft is flagged discarded, no mark and no delay). Cases 28.101 and 28.106 to 28.109.
 */
const AUTHOR = newUlid();

type DraftWorld = Base & { P: string; D: string; C: string; S: string; PUBT: string; marker: string };

/**
 * A project with a published ticket PUBT (number 1), a draft D with a sub-draft C, a sibling draft S, and a marker
 * in D's and C's titles and D's description. Everything is applied through the real projections, no engine.
 */
async function buildDraftWorld(db: TestDatabase): Promise<DraftWorld> {
  const base = await seedWorkspace(db.pool);
  const [P, D, C, S, PUBT] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
  const marker = newMarker();
  const draft = (id: string, parentId: string | null, title: string) =>
    ev(base, 'ticket', id, 'ticket.created', { typeId: TYPE_ID, projectId: P, parentId, title, start: 'backlog', draft: true }, AUTHOR);
  await applyCommitted(db.pool, [
    projectCreated(base, P, 'Drafts', 'DR'),
    ticketCreated(base, PUBT, P, 'Published first'),
    draft(D, null, `Quokka ${marker}`),
    draft(C, D, `Child ${marker}`),
    draft(S, null, 'Sibling draft'),
    ev(base, 'ticket', D, 'ticket.field_set', { fieldId: 'description', value: doc(text(`details ${marker}`)) }, AUTHOR),
  ]);
  return { ...base, P, D, C, S, PUBT, marker };
}

const discard = (base: Base, id: string) => ev(base, 'ticket', id, 'ticket.discarded', {}, AUTHOR);

function deps(store = recordingStore()): PurgeDeps {
  return { projections: buildProjectionRegistry(), store, now: new Date('2026-10-04T06:00:00.000Z') };
}

async function count(db: TestDatabase, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}
const ticketRows = (db: TestDatabase, id: string) => count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [id]);

let shared: TestDatabase;
beforeAll(async () => {
  resetEntitySeqs();
  shared = await createTestDatabase();
}, 60_000);
afterAll(async () => {
  await shared.drop();
});

describe('28.106 the erasure set and its record', () => {
  it('erases the draft and its sub-draft with nothing left but the redacted creations, the tombstone and the registry; the sibling and the published ticket are whole; no number was consumed', async () => {
    const w = await buildDraftWorld(shared);
    await applyCommitted(shared.pool, [discard(w, w.D)]);
    const { rows: when } = await shared.pool.query<{ server_time: Date }>(
      `SELECT server_time FROM events WHERE entity_id = $1 AND type = 'ticket.discarded'`,
      [w.D],
    );
    const discardedAt = when[0]?.server_time.toISOString() ?? '';
    expect((await ticketNumbers(shared.pool, w.WS, [w.PUBT])).get(w.PUBT)).toBe(1);
    expect(Object.keys(await scan(shared.pool, [w.marker]))).toEqual(expect.arrayContaining(['events.payload', 'proj_tickets.fields'])); // CONTROL: it is there to be erased

    const outcome = await discardDraft(shared.pool, w.D, deps());
    expect(outcome).toMatchObject({ status: 'purged', erased: 2, target: { kind: 'ticket', id: w.D } });

    expect(await scan(shared.pool, [w.marker])).toEqual({});
    expect(await scan(shared.pool, [w.D, w.C])).toEqual({
      'events.entity_id': 3,
      'proj_entity_heads.entity_id': 2,
      'purged_entities.entity_id': 2,
    });
    // CONTROL: the sibling draft and the published ticket keep their rows
    expect(await ticketRows(shared, w.S)).toBe(1);
    expect(await ticketRows(shared, w.PUBT)).toBe(1);

    const { rows: redacted } = await shared.pool.query(
      `SELECT entity_id, payload FROM events WHERE workspace_id = $1 AND type = 'ticket.created' AND payload @> '{"purged": true}' ORDER BY entity_id`,
      [w.WS],
    );
    expect(redacted).toEqual(
      [w.D, w.C].sort().map((entity_id) => ({ entity_id, payload: { projectId: w.P, purged: true, draft: true } })),
    );

    const { rows: tombstone } = await shared.pool.query(
      `SELECT actor_id, origin, payload FROM events WHERE entity_id = $1 AND type = 'purge.completed'`,
      [w.D],
    );
    expect(tombstone).toEqual([
      {
        actor_id: SYSTEM_ACTOR_PURGE,
        origin: 'server',
        payload: purgeCompletedPayload.parse({ kind: 'ticket', markedBy: AUTHOR, markedAt: discardedAt }),
      },
    ]);

    // no number consumed: PUBT is still #1 and the next ticket is #2 (a redacted draft creation is not a numbering row)
    expect((await ticketNumbers(shared.pool, w.WS, [w.PUBT])).get(w.PUBT)).toBe(1);
    const next = newUlid();
    // The tombstone took the stream's next position from the ledger (`nextWorkspaceSeq`), which the fixture's
    // process-local counter cannot know (`../helpers/apply.ts`: "pass explicit seqs"), so this event names its own.
    const { rows: tip } = await shared.pool.query<{ next: number }>(
      'SELECT max(workspace_seq)::int + 1 AS next FROM events WHERE workspace_id = $1',
      [w.WS],
    );
    await applyCommitted(shared.pool, [{ ...ticketCreated(w, next, w.P, 'Next'), workspaceSeq: tip[0]?.next ?? 0 }]);
    expect((await ticketNumbers(shared.pool, w.WS, [next])).get(next)).toBe(2);
  });
});

describe('28.108 the gate parameter', () => {
  it('skips an undiscarded draft, a published ticket and an unknown id; the trash gate says not-marked for a discarded draft, which only the draft gate erases; a repeat is already-purged', async () => {
    const w = await buildDraftWorld(shared);
    const skipped = (id: string, reason: string) => ({ status: 'skipped', target: { kind: 'ticket', id }, reason });
    expect(await discardDraft(shared.pool, w.S, deps())).toEqual(skipped(w.S, 'not-discarded'));
    expect(await discardDraft(shared.pool, w.PUBT, deps())).toEqual(skipped(w.PUBT, 'not-discarded'));
    const ghost = newUlid();
    expect(await discardDraft(shared.pool, ghost, deps())).toEqual(skipped(ghost, 'not-found'));
    expect(await ticketRows(shared, w.S)).toBe(1);

    await applyCommitted(shared.pool, [discard(w, w.D)]);
    // the DEFAULT gate is the trash gate, unchanged: no mark, so no erasure
    expect(await purgeItem(shared.pool, { kind: 'ticket', id: w.D }, deps())).toEqual(skipped(w.D, 'not-marked'));
    expect(await ticketRows(shared, w.D)).toBe(1);
    // CONTROL: the draft gate erases the same item
    expect(await discardDraft(shared.pool, w.D, deps())).toMatchObject({ status: 'purged' });
    expect(await ticketRows(shared, w.D)).toBe(0);
    expect(await discardDraft(shared.pool, w.D, deps())).toEqual(skipped(w.D, 'already-purged'));
    expect(await pendingDraftDiscards(shared.pool)).not.toContain(w.D);
  });
});

/** A world per case for the sweep's counters, which are global (`test/purge/sweep.test.ts` gives the argument). */
async function withDb(fn: (db: TestDatabase) => Promise<void>): Promise<void> {
  resetEntitySeqs();
  const db = await createTestDatabase();
  try {
    await fn(db);
  } finally {
    await db.drop();
  }
}
function recordingAlerter() {
  const calls: Array<{ context: string; message: string }> = [];
  const alerter: ErrorAlerter & { calls: typeof calls } = {
    calls,
    async notify(context: string, error: unknown): Promise<void> {
      calls.push({ context, message: error instanceof Error ? error.message : String(error) });
    },
  };
  return alerter;
}
const NOW = new Date('2026-10-04T06:00:00.000Z');
function sweepDeps(db: TestDatabase, overrides: Partial<PurgeSweepDeps> = {}): PurgeSweepDeps {
  return {
    pool: db.pool,
    projections: buildProjectionRegistry(),
    store: recordingStore(),
    alerter: recordingAlerter(),
    now: () => NOW,
    log: () => {},
    ...overrides,
  };
}

describe('28.101 the sweep erases what the hook missed', () => {
  it('erases a discarded draft and its sub-draft; the undiscarded draft and the published ticket survive; a second sweep finds nothing', async () => {
    await withDb(async (db) => {
      const w = await buildDraftWorld(db);
      await applyCommitted(db.pool, [discard(w, w.D)]);
      expect(await pendingDraftDiscards(db.pool)).toEqual([w.D]); // the sub-draft is erased WITH it, not queued on its own
      const first = await runPurgeSweep(sweepDeps(db));
      expect(first).toMatchObject({ candidates: 0, purged: 0, drafts: 1, failed: 0 });
      expect(await ticketRows(db, w.D)).toBe(0);
      expect(await ticketRows(db, w.C)).toBe(0);
      expect(await ticketRows(db, w.S)).toBe(1); // CONTROL: an undiscarded draft is not touched
      expect(await ticketRows(db, w.PUBT)).toBe(1);
      expect(await runPurgeSweep(sweepDeps(db))).toMatchObject({ drafts: 0, failed: 0 });
    });
  }, 60_000);
});

describe('28.109 a failed erasure is alerted and retried', () => {
  it('logs, alerts draft-discard:<id>, erases the other draft anyway, and erases the first on the next sweep', async () => {
    await withDb(async (db) => {
      const w = await buildDraftWorld(db);
      await applyCommitted(db.pool, [discard(w, w.D), discard(w, w.S)]);
      const failing = new Set([w.D]);
      const injected: typeof discardDraft = async (pool, id, d) => {
        if (failing.has(id)) throw new Error(`injected failure for ${id}`);
        return discardDraft(pool, id, d);
      };
      const alerter = recordingAlerter();
      const logged: string[] = [];
      const first = await runPurgeSweep(sweepDeps(db, { discard: injected, alerter, log: (message) => logged.push(message) }));
      expect(first).toMatchObject({ drafts: 1, failed: 1 });
      expect(alerter.calls).toEqual([{ context: `draft-discard:${w.D}`, message: `injected failure for ${w.D}` }]);
      expect(logged.some((line) => line.includes(w.D))).toBe(true);
      expect(await ticketRows(db, w.D)).toBe(1); // still there, still flagged: retried
      expect(await ticketRows(db, w.S)).toBe(0);

      failing.clear();
      expect(await runPurgeSweep(sweepDeps(db, { discard: injected }))).toMatchObject({ drafts: 1, failed: 0 });
      expect(await ticketRows(db, w.D)).toBe(0);
    });
  }, 60_000);
});

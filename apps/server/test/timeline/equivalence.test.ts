import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, SYSTEM_ACTOR_FLOW, type LedgerEvent } from '@gisik-nokma/domain';
import { readTimelineChunk } from '../../src/timeline/read-chunk.js';
import { readTimelineIndex } from '../../src/timeline/read-index.js';
import { readTimelineTray } from '../../src/timeline/read-tray.js';
import { readableWorkspaces, type TimelineScope } from '../../src/timeline/scope.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { readTimelineChunkBeforeC, readTimelineIndexBeforeC, readTimelineTrayBeforeC } from './helpers/before-c.js';
import { seedDraft, seedTimelineWorld, type TimelineWorld } from './helpers/world.js';

/**
 * 29.295 / 29.299, the owner's (c) ruling (AMEND-wtg4-t1-reads-perf.md): edge bucketing, the narrow SELECT and the
 * edgeless-singleton shortcut change no answer. Every index, chunk page and tray page the shipped reads answer is compared,
 * byte for byte, with the 1882524a reads kept VERBATIM in `helpers/before-c.ts` (the oracle; never this code against itself).
 *
 * The world is `seedTimelineWorld` (A, B; a hidden middle; a Decision diamond) plus, so each column the narrow SELECT stubs
 * or narrows holds a value its stub does not: a long `description` and a priority (narrowed out of `fields`), transitions
 * and periods (a ticket worked to Done), `reopened_at`, a `rank`, a draft with a pending child (`pending_children`, the
 * draft columns), `links` (every link source); and, for the assembler: a Decision that has decided (passes, a pruned
 * branch), a loop edge, a Not-taken ticket under a Decision bo cannot see, a `blocks` inside a flow and one between two
 * singletons, and a flow in B.
 */
const NOW = new Date('2026-10-03T06:00:00.000Z');
let db: TestDatabase;
let w: TimelineWorld;
const x = Object.fromEntries(
  ['desc', 'worked', 'reopened', 'ranked', 'child', 'D', 'T', 'N', 'L1', 'LD', 'L2', 'bHead', 'bTail', 'single1', 'single2', 'dueOnly'].map((k) => [k, newUlid()]),
) as Record<string, string> as Record<'desc' | 'worked' | 'reopened' | 'ranked' | 'child' | 'D' | 'T' | 'N' | 'L1' | 'LD' | 'L2' | 'bHead' | 'bTail' | 'single1' | 'single2' | 'dueOnly', string>;
let draft = '';

beforeAll(async () => {
  db = await createTestDatabase();
  w = await seedTimelineWorld(db.pool);
  const A = w.A;
  const B = w.B;
  const ev = (ws: string, id: string, type: string, payload: Record<string, unknown>, actorId = w.ama): LedgerEvent =>
    makeCommitted({ workspaceId: ws, actorId, entity: { kind: 'ticket', id }, type, payload });
  const created = (ws: typeof A, id: string, title: string, extra: Record<string, unknown> = {}, typeId = 'task', project = ws.p1): LedgerEvent =>
    ev(ws.workspaceId, id, 'ticket.created', { typeId, projectId: project, parentId: null, title, ...extra });
  const lead = (ws: typeof A, from: string, to: string, label?: string): LedgerEvent =>
    ev(ws.workspaceId, from, 'ticket.link_added', { kind: 'leads_to', targetId: to, ...(label === undefined ? {} : { label }) });
  const long = 'A long description the Timeline never reads. '.repeat(60);
  await applyCommitted(db.pool, [
    created(A, x.desc, 'Described', { startDate: { date: '2026-10-06' }, estimate: 2, description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }] }, priority: 'P1' }),
    created(A, x.worked, 'Worked', { startDate: { date: '2026-09-28' }, estimate: 3 }),
    ev(A.workspaceId, x.worked, 'ticket.transitioned', { to: 'doing' }),
    ev(A.workspaceId, x.worked, 'ticket.transitioned', { to: 'done' }),
    created(A, x.reopened, 'Reopened', { dueDate: { date: '2026-10-09' } }),
    ev(A.workspaceId, x.reopened, 'ticket.transitioned', { to: 'done' }),
    ev(A.workspaceId, x.reopened, 'ticket.reopened', {}),
    created(A, x.ranked, 'Ranked', { estimate: 1 }),
    ev(A.workspaceId, x.ranked, 'ticket.ranked', { rank: 'm' }),
    created(A, x.child, 'Child of a draft', { startDate: { date: '2026-10-07' }, dueDate: { date: '2026-10-08' } }),
    // a Decision only ama sees; T is reached by its 'Go', N was closed Not taken by its 'Stop'; N blocks T inside the flow
    created(A, x.D, 'Secret call', { startDate: { date: '2026-10-14' }, estimate: 1, assigneeId: w.ama }, 'decision', A.p2),
    ev(A.workspaceId, x.D, 'visibility.set', { ticketId: x.D, mode: 'explicit', userIds: [w.ama] }),
    created(A, x.T, 'Go ahead', {}, 'task', A.p2),
    created(A, x.N, 'Stopped', { assigneeId: w.bo }, 'task', A.p2),
    lead(A, x.D, x.T, 'Go'),
    lead(A, x.D, x.N, 'Stop'),
    ev(A.workspaceId, x.N, 'ticket.link_added', { kind: 'blocks', targetId: x.T }),
    ev(A.workspaceId, x.N, 'ticket.transitioned', { to: 'done' }, SYSTEM_ACTOR_FLOW),
    ev(A.workspaceId, x.N, 'ticket.closed', { cause: { kind: 'branch-not-taken', decisionTicketId: x.D, outcome: 'Stop', pass: 1, decidedBy: w.ama, decisionEventId: newUlid() } }, SYSTEM_ACTOR_FLOW),
    // a loop: L1 -> LD (decided 'Rework') -> L2 'Ship', LD -> L1 'Rework'
    created(A, x.L1, 'Build', { startDate: { date: '2026-10-05' }, estimate: 2, reworkEstimate: 1 }),
    created(A, x.LD, 'Review', { estimate: 1 }, 'decision'),
    created(A, x.L2, 'Ship', { estimate: 1 }),
    lead(A, x.L1, x.LD),
    lead(A, x.LD, x.L2, 'Ship'),
    lead(A, x.LD, x.L1, 'Rework'),
    ev(A.workspaceId, x.LD, 'ticket.decided', { outcome: 'Rework' }),
    // the diamond's Decision has decided 'Yes': fNo is pruned (a ghost)
    ev(A.workspaceId, w.t.fDec, 'ticket.decided', { outcome: 'Yes' }),
    // singletons: dated + undated + due-only, and a blocks between two of them (a link that makes no flow)
    created(A, x.single1, 'Single dated', { startDate: { date: '2026-10-10' }, estimate: 2 }),
    created(A, x.single2, 'Single undated'),
    created(A, x.dueOnly, 'Due only', { dueDate: { date: '2026-10-12' } }),
    ev(A.workspaceId, x.single1, 'ticket.link_added', { kind: 'blocks', targetId: x.single2 }),
    // a flow in B
    created(B, x.bHead, 'B head', { startDate: { date: '2026-10-08' }, estimate: 2 }),
    created(B, x.bTail, 'B tail', { estimate: 3 }),
    lead(B, x.bHead, x.bTail),
  ]);
  draft = await seedDraft(db.pool, { authorId: w.ama, workspaceId: A.workspaceId, projectId: A.p1, title: 'Her draft', explicitStart: '2026-10-09', estimate: 2 });
  await applyCommitted(db.pool, [ev(A.workspaceId, draft, 'ticket.reparented', { newParentId: draft, childId: x.child })]);
}, 120_000);
afterAll(async () => {
  await db.drop();
});

const scopeOf = (ws: string[], mine: boolean): TimelineScope => ({ workspaceIds: [...ws].sort(), projectIds: [], mine });
const WINDOWS = [
  { from: '2026-09-01', to: '2026-12-31' },
  { from: '2026-10-06', to: '2026-10-08' },
];

/** Every body a viewer can be served for one scope: the index, every chunk page of each window, every tray page (page size 2). */
async function bodies(
  reads: { index: typeof readTimelineIndex; chunk: typeof readTimelineChunk; tray: typeof readTimelineTray },
  viewer: string,
  scope: TimelineScope,
): Promise<string[]> {
  const readable = await readableWorkspaces(db.pool, viewer, scope);
  const out = [JSON.stringify(await reads.index(db.pool, readable, viewer, scope, NOW))];
  for (const win of WINDOWS) {
    out.push(JSON.stringify(await reads.chunk(db.pool, readable, viewer, scope, NOW, win)));
    for (let cursor: string | undefined, n = 0; n < 30; n += 1) {
      const page = await reads.chunk(db.pool, readable, viewer, scope, NOW, win, cursor, 2);
      out.push(JSON.stringify(page));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
  }
  for (let cursor: string | undefined, n = 0; n < 30; n += 1) {
    const page = await reads.tray(db.pool, readable, viewer, scope, NOW, cursor, 2);
    out.push(JSON.stringify(page));
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  return out;
}

describe('29.295 / 29.299 the (c) changes answer exactly what the 1882524a reads answered', () => {
  it('29.295 every stubbed or narrowed column holds a real value in this world; control: the stub would differ', async () => {
    const { rows } = await db.pool.query<Record<string, boolean>>(
      `SELECT bool_or(jsonb_array_length(transitions) > 0) AS transitions, bool_or(jsonb_array_length(links) > 0) AS links,
              bool_or(jsonb_array_length(pending_children) > 0) AS pending,
              bool_or(reopened_at IS NOT NULL) AS reopened, bool_or(rank IS NOT NULL) AS rank, bool_or(draft_author_id IS NOT NULL) AS draft,
              bool_or(fields ? 'description') AS description, bool_or(fields ? 'priority') AS priority,
              bool_or(started_at IS NOT NULL) AS started, bool_or(ended_at IS NOT NULL) AS ended
         FROM proj_tickets WHERE workspace_id = $1`,
      [w.A.workspaceId],
    );
    expect(rows[0]).toEqual({ transitions: true, links: true, pending: true, reopened: true, rank: true, draft: true, description: true, priority: true, started: true, ended: true });
  });

  it('29.295 / 29.299 the index, every chunk page and every tray page are byte-identical for both viewers, Everyone and Me, one and two workspaces; control: the bodies differ across viewers', async () => {
    const shipped = { index: readTimelineIndex, chunk: readTimelineChunk, tray: readTimelineTray };
    const oracle = { index: readTimelineIndexBeforeC, chunk: readTimelineChunkBeforeC, tray: readTimelineTrayBeforeC };
    let compared = 0;
    const seen: Record<string, string> = {};
    for (const viewer of [w.ama, w.bo]) {
      for (const ws of [[w.A.workspaceId], [w.A.workspaceId, w.B.workspaceId]]) {
        for (const mine of [false, true]) {
          const scope = scopeOf(ws, mine);
          const now = await bodies(shipped, viewer, scope);
          const then = await bodies(oracle, viewer, scope);
          expect(now).toEqual(then);
          compared += now.length;
          seen[`${viewer === w.ama ? 'ama' : 'bo'}|${ws.length}|${mine}`] = now[0] as string;
        }
      }
    }
    expect(compared).toBeGreaterThan(60); // pages, not just three bodies
    // control: the comparison is not of empty or identical answers. ama's index names the hidden Decision, bo's does not;
    // the decided loop, the pruned ghost, the draft, the B flow and the narrowed ticket are drawn
    const amaAll = seen[`ama|2|false`] as string;
    expect(amaAll).toContain(x.D);
    expect(seen[`bo|2|false`]).not.toContain(x.D);
    for (const id of [x.desc, x.worked, x.L1, x.L2, w.t.fNo, draft, x.bHead, x.single1]) expect(amaAll).toContain(id);
    expect(amaAll).toContain('"type":"ghost"');
    expect(amaAll).not.toContain('A long description');
  });
});

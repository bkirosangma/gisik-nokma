import type { Pool } from 'pg';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../../helpers/apply.js';

/**
 * The Timeline reads' world (wtg Part 4 T1): three workspaces, so a scope can span them and drop one.
 *
 * - `ama` owns A and is a member of B; `bo` is a member of A and owns B; `cy` owns C (ama is NOT in C).
 * - Each workspace: two projects (`p1`, `p2`; every member is on both), the workflow `wf` (To do / Doing / Done) and the
 *   ticket types `task` and `decision` (`DECISION_TYPE_ID`, so `flowNodeOf` reads a Decision).
 * - A (p1): `dated` (10-05 to 10-07), `mine` (assigned to ama), `collab` (assigned to bo, ama a collaborator), `other`
 *   (assigned to bo), and the chain `step1 -> hidden -> step2` whose middle only ama sees (explicit audience).
 * - A (p2): the diamond `fStart -> fDec (decision) -> fYes ('Yes') | fNo ('No')`.
 * - B (p1): `bTask`, dated.
 *
 * Events go in through `applyCommitted` (ledger plus every projection, no engine): `makeCommitted`'s seqs are process-local, so
 * one fresh database per file. `t.draft` is minted here and filed by the test that needs it (`seedDraft`).
 */
export type TWorkspace = { workspaceId: string; wf: string; p1: string; p2: string };
export type TimelineWorld = {
  ama: string;
  bo: string;
  cy: string;
  A: TWorkspace;
  B: TWorkspace;
  C: TWorkspace;
  t: Record<'dated' | 'mine' | 'collab' | 'other' | 'hidden' | 'step1' | 'step2' | 'draft' | 'fStart' | 'fDec' | 'fYes' | 'fNo' | 'bTask', string>;
};

/** A person's `"user"` row: Home's Members joins it (`visibleMemberIds`), so a membership alone is not a member there. */
export async function insertUser(pool: Pool, id: string, name: string): Promise<void> {
  await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, now(), now())`, [id, name, `${id}@timeline.test`]);
}

/** One workspace: `owner` owns it, `members` are members; every one of them is on both projects; the workflow and the two ticket types. */
export async function seedWorkspace(pool: Pool, owner: string, members: readonly string[]): Promise<TWorkspace> {
  const w: TWorkspace = { workspaceId: newUlid(), wf: `wf-${newUlid()}`, p1: newUlid(), p2: newUlid() };
  const ws = { workspaceId: w.workspaceId, actorId: owner };
  const ev: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'workspace', id: w.workspaceId }, type: 'workspace.created', payload: { name: 'W' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(w.workspaceId, owner) }, type: 'membership.granted', payload: { userId: owner, role: 'owner' } }),
    ...members.map((m) =>
      makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(w.workspaceId, m) }, type: 'membership.granted', payload: { userId: m, role: 'member' } }),
    ),
    makeCommitted({ ...ws, entity: { kind: 'project', id: w.p1 }, type: 'project.created', payload: { name: 'Client pitches' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: w.p2 }, type: 'project.created', payload: { name: 'Website' } }),
    ...[owner, ...members].flatMap((u) =>
      [w.p1, w.p2].map((p) => makeCommitted({ ...ws, entity: { kind: 'project', id: p }, type: 'project.member_added', payload: { userId: u, projectAdmin: u === owner } })),
    ),
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: w.wf },
      type: 'workflow.defined',
      payload: {
        id: w.wf,
        version: 1,
        name: 'Flow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: ['todo', 'doing', 'done'].map((to) => ({ from: '*', to, rules: [] })),
      },
    }),
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'task' }, type: 'ticket-type.defined', payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: w.wf, fields: [] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'decision' }, type: 'ticket-type.defined', payload: { id: 'decision', name: 'Decision', icon: 'diamond', rank: 3, workflowId: w.wf, fields: [] } }),
  ];
  await applyCommitted(pool, ev);
  return w;
}

export async function seedTimelineWorld(pool: Pool): Promise<TimelineWorld> {
  const ama = newUlid();
  const bo = newUlid();
  const cy = newUlid();
  for (const [id, name] of [[ama, 'Ama'], [bo, 'Bo'], [cy, 'Cy']] as const) await insertUser(pool, id, name);
  const A = await seedWorkspace(pool, ama, [bo]);
  const B = await seedWorkspace(pool, bo, [ama]);
  const C = await seedWorkspace(pool, cy, []);
  const t = Object.fromEntries(
    ['dated', 'mine', 'collab', 'other', 'hidden', 'step1', 'step2', 'draft', 'fStart', 'fDec', 'fYes', 'fNo', 'bTask'].map((k) => [k, newUlid()]),
  ) as Record<string, string> as TimelineWorld['t'];
  const wa = { workspaceId: A.workspaceId, actorId: ama };
  const task = (id: string, w: TWorkspace, project: string, title: string, extra: Record<string, unknown> = {}, typeId = 'task'): LedgerEvent =>
    makeCommitted({ workspaceId: w.workspaceId, actorId: ama, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId, projectId: project, parentId: null, title, ...extra } });
  const link = (from: string, to: string, w: TWorkspace, label?: string): LedgerEvent =>
    makeCommitted({
      workspaceId: w.workspaceId,
      actorId: ama,
      entity: { kind: 'ticket', id: from },
      type: 'ticket.link_added',
      payload: { kind: 'leads_to', targetId: to, ...(label === undefined ? {} : { label }) },
    });
  await applyCommitted(pool, [
    task(t.dated, A, A.p1, 'Dated', { startDate: { date: '2026-10-05' }, dueDate: { date: '2026-10-07' } }),
    task(t.mine, A, A.p1, 'Mine', { startDate: { date: '2026-10-08' }, estimate: 2 }),
    makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.mine }, type: 'ticket.assigned', payload: { assigneeId: ama } }),
    task(t.collab, A, A.p1, 'Collab only', { startDate: { date: '2026-10-09' }, estimate: 1 }),
    makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.collab }, type: 'ticket.assigned', payload: { assigneeId: bo } }),
    makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.collab }, type: 'ticket.collaborator_added', payload: { userId: ama } }),
    task(t.other, A, A.p1, 'Someone else', { startDate: { date: '2026-10-09' }, estimate: 1 }),
    makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.other }, type: 'ticket.assigned', payload: { assigneeId: bo } }),
    // a three-ticket chain whose middle is hidden from bo (explicit audience: ama only)
    task(t.step1, A, A.p1, 'Step 1', { startDate: { date: '2026-10-12' }, estimate: 1 }),
    task(t.hidden, A, A.p1, 'Hidden middle', { estimate: 1 }),
    makeCommitted({ ...wa, entity: { kind: 'ticket', id: t.hidden }, type: 'visibility.set', payload: { ticketId: t.hidden, mode: 'explicit', userIds: [ama] } }),
    task(t.step2, A, A.p1, 'Step 2', { estimate: 1 }),
    link(t.step1, t.hidden, A),
    link(t.hidden, t.step2, A),
    // a diamond in project 2
    task(t.fStart, A, A.p2, 'Brief', { startDate: { date: '2026-10-05' }, estimate: 3 }),
    task(t.fDec, A, A.p2, 'Client decides', { estimate: 1 }, 'decision'),
    task(t.fYes, A, A.p2, 'Approved', { estimate: 2 }),
    task(t.fNo, A, A.p2, 'Rework', { estimate: 2 }),
    link(t.fStart, t.fDec, A),
    link(t.fDec, t.fYes, A, 'Yes'),
    link(t.fDec, t.fNo, A, 'No'),
    // workspace B: one dated task that ama sees as a member
    task(t.bTask, B, B.p1, 'B task', { startDate: { date: '2026-10-06' }, estimate: 1 }),
  ]);
  return { ama, bo, cy, A, B, C, t };
}

/**
 * A draft by `authorId`, in Drafts' own `ticket.created` form (`draft: true` with `start: 'backlog'`, as
 * `test/helpers/draft-world.ts` files it): the projection sets `draft_author_id` from the actor.
 */
export async function seedDraft(
  pool: Pool,
  o: { authorId: string; workspaceId: string; projectId: string; title: string; explicitStart?: string; estimate?: number; assigneeId?: string; id?: string },
): Promise<string> {
  const id = o.id ?? newUlid();
  await applyCommitted(pool, [
    makeCommitted({
      workspaceId: o.workspaceId,
      actorId: o.authorId,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: {
        typeId: 'task',
        projectId: o.projectId,
        parentId: null,
        title: o.title,
        start: 'backlog',
        draft: true,
        ...(o.explicitStart === undefined ? {} : { startDate: { date: o.explicitStart } }),
        ...(o.estimate === undefined ? {} : { estimate: o.estimate }),
        ...(o.assigneeId === undefined ? {} : { assigneeId: o.assigneeId }),
      },
    }),
  ]);
  return id;
}

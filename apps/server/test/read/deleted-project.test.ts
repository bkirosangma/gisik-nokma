import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { LIFECYCLE_RULE, PROJECT_DELETED_REASON } from '../../src/permissions/check-lifecycle.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { listNotes, listNotesForTicket } from '../../src/read/notes.js';
import { readTicketCounts } from '../../src/routes/builder-reads.js';
import { rollupFor } from '../../src/visibility/rollup.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * A deleted project — hidden with its contents, writes refused (trash series,
 * Plan 1 Task 6, spec §4 T10). Cases 19.050-19.055, `test-cases/19-trash.md`
 * §19.6. Every case mints its own workspace via `setupWorld` so no case can
 * read another's rows.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phoneCounter = 0;

type Caller = { userId: string; headers: { authorization: string } };

async function signedIn(): Promise<Caller> {
  phoneCounter += 1;
  return signInWithPhone(app, otp, `+9190022${String(phoneCounter).padStart(5, '0')}`).then((user) => ({
    userId: user.userId,
    headers: { authorization: `Bearer ${user.token}` },
  }));
}

async function found(caller: Caller, name = 'Trash Project Co'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: caller.headers,
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

type Seed = Pick<SubmittedEvent, 'workspaceId' | 'entity' | 'type' | 'payload'>;

async function submitBatch(caller: Caller, seeds: Seed[]): Promise<IngestResult[]> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: caller.headers,
    payload: {
      events: seeds.map((seed) => ({
        id: newUlid(),
        version: 1,
        origin: 'web',
        clientTime: new Date().toISOString(),
        actorId: caller.userId,
        ...seed,
      })),
    },
  });
  expect(res.statusCode).toBe(200);
  const results = (res.json() as { results: IngestResult[] }).results;
  expect(results).toHaveLength(seeds.length);
  return results;
}

/**
 * A workspace with TWO projects — `siblingProjectId` (stays live) and
 * `doomedProjectId` (the one every case below deletes) — created under the
 * SAME name on purpose: `resolveProjectPrefixes` then collides them, so
 * 19.050 can prove the live sibling's resolved prefix is unaffected by its
 * neighbour's deletion rather than merely unchanged because nothing forced a
 * recompute. One shared workflow/ticket-type; one ticket per project, each
 * assigned to `member` (so 19.052's contested-claim fixture and any
 * "assigned to me" reads have something real to lose), with distinctive
 * two-word title markers `Doomed Xyzmarker` / `Sibling Xyzmarker` — sharing
 * the word `Xyzmarker` so a search for it matches BOTH before exclusion is
 * applied, which is what makes the "doomed is excluded" arm non-vacuous, and
 * a whole word (not camelCase, which is no boundary to the 'simple' FTS
 * parser) so `websearch_to_tsquery` actually finds it.
 * `member` is a project admin on both projects, matching `owner` — ticket/note
 * creation checks project membership even for the workspace owner.
 */
async function setupWorld(
  owner: Caller,
  member: Caller,
): Promise<{
  workspaceId: string;
  doomedProjectId: string;
  siblingProjectId: string;
  workflowId: string;
  typeKey: string;
  doomedTicketId: string;
  siblingTicketId: string;
}> {
  const workspaceId = await found(owner);
  const doomedProjectId = newUlid();
  const siblingProjectId = newUlid();
  // Founded through the REAL door (not the `seedProject` test helper, which
  // bypasses the ingest pipeline and never populates `proj_entity_heads` —
  // `workspaceOfProject`, which the board/list routes below stand on, reads
  // nothing else). Same name on both — a guaranteed prefix collision, doomed
  // founded first so it takes the plain derived prefix and the sibling takes
  // the collision candidate.
  const projectsCreated = await submitBatch(owner, [
    { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.created', payload: { name: 'Twin Harbor' } },
    { workspaceId, entity: { kind: 'project', id: siblingProjectId }, type: 'project.created', payload: { name: 'Twin Harbor' } },
  ]);
  expect(projectsCreated.every((r) => r.status === 'committed')).toBe(true);
  const bothProjects = [
    { projectId: doomedProjectId, projectAdmin: true },
    { projectId: siblingProjectId, projectAdmin: true },
  ];
  await seedMember(db.pool, workspaceId, owner.userId, 'owner', bothProjects);
  await seedMember(db.pool, workspaceId, member.userId, 'member', bothProjects);

  const workflowId = newUlid();
  const typeKey = `task-19-1${Math.floor(Math.random() * 900 + 100)}`;
  const setup = await submitBatch(owner, [
    {
      workspaceId,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: {
        id: workflowId,
        version: 1,
        name: 'Basic',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      },
    },
    {
      workspaceId,
      entity: { kind: 'ticket-type', id: newUlid() },
      type: 'ticket-type.defined',
      payload: { id: typeKey, name: typeKey, icon: 'check', rank: 1, workflowId, fields: [] },
    },
  ]);
  expect(setup.every((r) => r.status === 'committed')).toBe(true);

  const doomedTicketId = newUlid();
  const siblingTicketId = newUlid();
  const tickets = await submitBatch(owner, [
    {
      workspaceId,
      entity: { kind: 'ticket', id: doomedTicketId },
      type: 'ticket.created',
      payload: {
        typeId: typeKey,
        projectId: doomedProjectId,
        parentId: null,
        title: 'Doomed Xyzmarker',
        assigneeId: member.userId,
      },
    },
    {
      workspaceId,
      entity: { kind: 'ticket', id: siblingTicketId },
      type: 'ticket.created',
      payload: {
        typeId: typeKey,
        projectId: siblingProjectId,
        parentId: null,
        title: 'Sibling Xyzmarker',
        assigneeId: member.userId,
      },
    },
  ]);
  expect(tickets.every((r) => r.status === 'committed')).toBe(true);

  return { workspaceId, doomedProjectId, siblingProjectId, workflowId, typeKey, doomedTicketId, siblingTicketId };
}

type WorkspacesBody = {
  workspaces: Array<{
    workspaceId: string;
    projects: Array<{ projectId: string; prefix: string | null }>;
  }>;
};

describe('19.050 a deleted project is absent from workspace projects, board, list, search and my-work', () => {
  it("excludes the project and its ticket from every read; the prefix-colliding sibling's ticket and resolved prefix are unaffected", async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, siblingProjectId, doomedTicketId, siblingTicketId } = await setupWorld(
      owner,
      member,
    );

    const before = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: member.headers });
    expect(before.statusCode).toBe(200);
    const beforeWs = (before.json() as WorkspacesBody).workspaces.find((w) => w.workspaceId === workspaceId)!;
    expect(beforeWs.projects.map((p) => p.projectId).sort()).toEqual([doomedProjectId, siblingProjectId].sort());
    const siblingPrefixBefore = beforeWs.projects.find((p) => p.projectId === siblingProjectId)!.prefix;

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);

    for (const [label, caller] of [
      ['owner', owner],
      ['member', member],
    ] as const) {
      const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: caller.headers });
      expect(res.statusCode).toBe(200);
      const ws = (res.json() as WorkspacesBody).workspaces.find((w) => w.workspaceId === workspaceId)!;
      const ids = ws.projects.map((p) => p.projectId);
      expect(ids, label).not.toContain(doomedProjectId);
      expect(ids, label).toContain(siblingProjectId);
      expect(ws.projects.find((p) => p.projectId === siblingProjectId)!.prefix, label).toBe(siblingPrefixBefore);
    }

    const siblingBoard = await app.inject({
      method: 'GET',
      url: `/v1/projects/${siblingProjectId}/board`,
      headers: member.headers,
    });
    expect(siblingBoard.statusCode).toBe(200);
    const siblingBoardCards = (siblingBoard.json() as { columns: Array<{ cards: Array<{ ticketId: string }> }> })
      .columns.flatMap((c) => c.cards.map((card) => card.ticketId));
    expect(siblingBoardCards).toContain(siblingTicketId);

    const doomedBoard = await app.inject({
      method: 'GET',
      url: `/v1/projects/${doomedProjectId}/board`,
      headers: member.headers,
    });
    expect(doomedBoard.statusCode).toBe(200);
    const doomedBoardCards = (doomedBoard.json() as { columns: Array<{ cards: Array<{ ticketId: string }> }> }).columns.flatMap(
      (c) => c.cards.map((card) => card.ticketId),
    );
    expect(doomedBoardCards).not.toContain(doomedTicketId);

    const siblingList = await app.inject({
      method: 'GET',
      url: `/v1/projects/${siblingProjectId}/tickets`,
      headers: member.headers,
    });
    expect(siblingList.statusCode).toBe(200);
    const siblingListCards = (siblingList.json() as { groups: Array<{ cards: Array<{ ticketId: string }> }> }).groups.flatMap(
      (g) => g.cards.map((card) => card.ticketId),
    );
    expect(siblingListCards).toContain(siblingTicketId);

    const doomedList = await app.inject({
      method: 'GET',
      url: `/v1/projects/${doomedProjectId}/tickets`,
      headers: member.headers,
    });
    expect(doomedList.statusCode).toBe(200);
    const doomedListCards = (doomedList.json() as { groups: Array<{ cards: Array<{ ticketId: string }> }> }).groups.flatMap(
      (g) => g.cards.map((card) => card.ticketId),
    );
    expect(doomedListCards).not.toContain(doomedTicketId);

    // `Xyzmarker` matches BOTH titles before exclusion — the doomed ticket's
    // absence below is the container clause working, not a search term that
    // could never have matched it.
    const search = await app.inject({
      method: 'GET',
      url: `/v1/search?workspaceId=${workspaceId}&q=Xyzmarker`,
      headers: member.headers,
    });
    expect(search.statusCode).toBe(200);
    const hitIds = (search.json() as { hits: Array<{ card: { ticketId: string } }> }).hits.map((h) => h.card.ticketId);
    expect(hitIds).toContain(siblingTicketId);
    expect(hitIds).not.toContain(doomedTicketId);

    const myWork = await app.inject({
      method: 'GET',
      url: `/v1/me/work?workspaceId=${workspaceId}`,
      headers: member.headers,
    });
    expect(myWork.statusCode).toBe(200);
    const myWorkBody = myWork.json() as { groups: { open: Array<{ ticketId: string }>; active: Array<{ ticketId: string }>; terminal: Array<{ ticketId: string }> } };
    const myWorkIds = [...myWorkBody.groups.open, ...myWorkBody.groups.active, ...myWorkBody.groups.terminal].map(
      (c) => c.ticketId,
    );
    expect(myWorkIds).toContain(siblingTicketId);
    expect(myWorkIds).not.toContain(doomedTicketId);
  });
});

describe('19.051 each converted longhand site excludes a deleted project ticket, one arm per file', () => {
  it('visibility/rollup.ts: a deleted-project child leaves the enumeration, the sibling parent unaffected', async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, siblingProjectId, typeKey, workflowId } = await setupWorld(owner, member);

    // A second, deeper-ranked type for the children — `hierarchy.rank` refuses
    // a parent and child of the SAME rank ("a ticket's parent must be a bigger
    // kind of work"), so `typeKey` (rank 1) cannot parent another `typeKey`.
    const childTypeKey = `task-19-1${Math.floor(Math.random() * 900 + 100)}-child`;
    const typeSetup = await submitBatch(owner, [
      {
        workspaceId,
        entity: { kind: 'ticket-type', id: newUlid() },
        type: 'ticket-type.defined',
        payload: { id: childTypeKey, name: childTypeKey, icon: 'check', rank: 2, workflowId, fields: [] },
      },
    ]);
    expect(typeSetup[0]?.status).toBe('committed');

    const parentDoom = newUlid();
    const childDoom = newUlid();
    const parentLive = newUlid();
    const childLive = newUlid();
    const created = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: parentDoom }, type: 'ticket.created', payload: { typeId: typeKey, projectId: doomedProjectId, parentId: null, title: 'Parent Doom' } },
    ]);
    expect(created[0]?.status).toBe('committed');
    const createdChild = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: childDoom }, type: 'ticket.created', payload: { typeId: childTypeKey, projectId: doomedProjectId, parentId: parentDoom, title: 'Child Doom' } },
    ]);
    expect(createdChild[0]?.status).toBe('committed');
    const createdParentLive = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: parentLive }, type: 'ticket.created', payload: { typeId: typeKey, projectId: siblingProjectId, parentId: null, title: 'Parent Live' } },
    ]);
    expect(createdParentLive[0]?.status).toBe('committed');
    const createdChildLive = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: childLive }, type: 'ticket.created', payload: { typeId: childTypeKey, projectId: siblingProjectId, parentId: parentLive, title: 'Child Live' } },
    ]);
    expect(createdChildLive[0]?.status).toBe('committed');
    const deleted = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);
    expect(deleted[0]?.status).toBe('committed');

    // A deleted-project child LEAVES the enumeration, the same as an
    // individually-deleted one does (the module's own docblock: "the child
    // LEAVES the enumeration" — a WHERE predicate, not the join's ON clause).
    // `parentDoom` has exactly one child and it is the one excluded, so the
    // honest answer is `null` (no live children), not a total that still
    // counts it as uncategorized — `hierarchy.cross-project` means every
    // child of one parent shares that parent's project, so there is no
    // partial case here either.
    const doomRollup = await rollupFor(db.pool, owner.userId, parentDoom);
    expect(doomRollup).toBeNull();

    const liveRollup = await rollupFor(db.pool, owner.userId, parentLive);
    expect(liveRollup).toEqual({ total: 1, terminal: 0, uncategorized: 0, restrictedCount: 0 });
  });

  it('routes/builder-reads.ts readTicketCounts: a deleted-project ticket is not counted against its type', async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, typeKey } = await setupWorld(owner, member);

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);

    const counts = await readTicketCounts(db.pool, workspaceId);
    // One ticket of this type survives (the sibling's); the doomed one is not
    // counted.
    expect(counts[typeKey]).toBe(1);
  });

  it("projections/note-search.ts: a note's ticket-text search index drops a deleted-project attachment", async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, doomedTicketId, siblingTicketId } = await setupWorld(owner, member);

    const noteId = newUlid();
    await submitBatch(owner, [
      {
        workspaceId,
        entity: { kind: 'note', id: noteId },
        type: 'note.created',
        payload: { title: 'Search Note', homeProjectId: '', scope: { mode: 'workspace' } },
      },
    ]);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.attached', payload: { ticketId: doomedTicketId } },
    ]);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.attached', payload: { ticketId: siblingTicketId } },
    ]);

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);
    // Forces a reindex — the note's own home project (workspace-level) stays
    // live, so this passes the door — after the attached ticket's project is
    // gone.
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.renamed', payload: { title: 'Search Note Reindexed' } },
    ]);

    const { rows } = await db.pool.query<{ ticket_text: string }>(
      'SELECT ticket_text FROM proj_note_search WHERE note_id = $1',
      [noteId],
    );
    const ticketText = (rows[0]?.ticket_text ?? '').toLowerCase();
    expect(ticketText).toContain('sibling');
    expect(ticketText).not.toContain('doomed');
  });
});

describe("19.052 routes/my-work.ts's TypeScript filter excludes a deleted project's ticket from a contested claim's title", () => {
  it('blanks the title once the ticket\'s project is deleted; the sibling stays titled', async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, doomedTicketId, siblingTicketId } = await setupWorld(owner, member);

    // A contested claim on each ticket — filed directly (this case's subject is
    // the READ side's title-blanking, not the sync-conflict filing mechanism
    // that would normally produce this row).
    async function fileContest(ticketId: string): Promise<void> {
      await db.pool.query(
        `INSERT INTO proj_contested
           (contested_event_id, original_event_id, workspace_id, ticket_id, claimant_id, rule, reason, original_event, contested_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [
          newUlid(),
          newUlid(),
          workspaceId,
          ticketId,
          member.userId,
          'permission.role',
          'not allowed',
          JSON.stringify({ actorId: member.userId, clientTime: new Date().toISOString() }),
        ],
      );
    }
    await fileContest(doomedTicketId);
    await fileContest(siblingTicketId);

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);

    const res = await app.inject({ method: 'GET', url: `/v1/me/work?workspaceId=${workspaceId}`, headers: member.headers });
    expect(res.statusCode).toBe(200);
    const contested = (res.json() as { contested: Array<{ ticketId: string; title: string | null }> }).contested;
    const doomed = contested.find((c) => c.ticketId === doomedTicketId);
    const sibling = contested.find((c) => c.ticketId === siblingTicketId);
    expect(doomed?.title ?? null).toBeNull();
    expect(sibling?.title).toBe('Sibling Xyzmarker');
  });
});

describe('19.053 a project-scoped note in a deleted project is absent from the notes list and a ticket\'s attached-notes read', () => {
  it('excludes the project-scoped note; a workspace-scoped note is unaffected', async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, siblingTicketId } = await setupWorld(owner, member);

    const projectNoteId = newUlid();
    const workspaceNoteId = newUlid();
    await submitBatch(owner, [
      {
        workspaceId,
        entity: { kind: 'note', id: projectNoteId },
        type: 'note.created',
        payload: { title: 'Project Note', homeProjectId: doomedProjectId, scope: { mode: 'project' } },
      },
    ]);
    await submitBatch(owner, [
      {
        workspaceId,
        entity: { kind: 'note', id: workspaceNoteId },
        type: 'note.created',
        payload: { title: 'Workspace Note', homeProjectId: '', scope: { mode: 'workspace' } },
      },
    ]);
    // Both attached to the LIVE sibling ticket — so the ticket-read arm proves
    // the exclusion is driven by the NOTE's own container, not the ticket's.
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: projectNoteId }, type: 'note.attached', payload: { ticketId: siblingTicketId } },
    ]);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: workspaceNoteId }, type: 'note.attached', payload: { ticketId: siblingTicketId } },
    ]);

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);

    const eff = await resolveEffectiveRole(db.pool, owner.userId, workspaceId);
    const list = await listNotes(db.pool, eff, owner.userId, workspaceId, {});
    const listIds = list.map((n) => n.noteId);
    expect(listIds).not.toContain(projectNoteId);
    expect(listIds).toContain(workspaceNoteId);

    const attached = await listNotesForTicket(db.pool, eff, owner.userId, workspaceId, siblingTicketId);
    const attachedIds = attached.map((n) => n.noteId);
    expect(attachedIds).not.toContain(projectNoteId);
    expect(attachedIds).toContain(workspaceNoteId);
  });
});

describe('19.054 a ticket event and a project-scoped note event into a deleted project are refused with PROJECT_DELETED_REASON', () => {
  it('refuses both while deleted; both accepted again after project.undeleted', async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, doomedTicketId } = await setupWorld(owner, member);

    const noteId = newUlid();
    await submitBatch(owner, [
      {
        workspaceId,
        entity: { kind: 'note', id: noteId },
        type: 'note.created',
        payload: { title: 'Project Note', homeProjectId: doomedProjectId, scope: { mode: 'project' } },
      },
    ]);

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);

    const refusedTicket = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: doomedTicketId }, type: 'ticket.field_set', payload: { fieldId: 'title', value: 'Edited' } },
    ]);
    expect(refusedTicket[0]).toMatchObject({ status: 'refused', rule: LIFECYCLE_RULE, reason: PROJECT_DELETED_REASON });

    const refusedNote = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.renamed', payload: { title: 'Edited Note' } },
    ]);
    expect(refusedNote[0]).toMatchObject({ status: 'refused', rule: LIFECYCLE_RULE, reason: PROJECT_DELETED_REASON });

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.undeleted', payload: {} },
    ]);

    const acceptedTicket = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: doomedTicketId }, type: 'ticket.field_set', payload: { fieldId: 'title', value: 'Edited' } },
    ]);
    expect(acceptedTicket[0]?.status).toBe('committed');

    const acceptedNote = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.renamed', payload: { title: 'Edited Note' } },
    ]);
    expect(acceptedNote[0]?.status).toBe('committed');
  });
});

describe('19.055 a ticket deleted on its own survives its project being deleted then undeleted', () => {
  it("stays deleted (absent from the board, deleted_at unchanged); its sibling that was not deleted on its own is back", async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const { workspaceId, doomedProjectId, typeKey } = await setupWorld(owner, member);

    const ticketA = newUlid();
    const ticketB = newUlid();
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: ticketA }, type: 'ticket.created', payload: { typeId: typeKey, projectId: doomedProjectId, parentId: null, title: 'A' } },
    ]);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: ticketB }, type: 'ticket.created', payload: { typeId: typeKey, projectId: doomedProjectId, parentId: null, title: 'B' } },
    ]);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: ticketA }, type: 'ticket.deleted', payload: {} },
    ]);
    const { rows: beforeRows } = await db.pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM proj_tickets WHERE ticket_id = $1',
      [ticketA],
    );
    const deletedAtBefore = beforeRows[0]!.deleted_at;
    expect(deletedAtBefore).not.toBeNull();

    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} },
    ]);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: doomedProjectId }, type: 'project.undeleted', payload: {} },
    ]);

    const { rows: afterRows } = await db.pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM proj_tickets WHERE ticket_id = $1',
      [ticketA],
    );
    expect(afterRows[0]!.deleted_at).toEqual(deletedAtBefore);

    const board = await app.inject({
      method: 'GET',
      url: `/v1/projects/${doomedProjectId}/board`,
      headers: member.headers,
    });
    expect(board.statusCode).toBe(200);
    const cardIds = (board.json() as { columns: Array<{ cards: Array<{ ticketId: string }> }> }).columns.flatMap(
      (c) => c.cards.map((card) => card.ticketId),
    );
    expect(cardIds).not.toContain(ticketA);
    expect(cardIds).toContain(ticketB);
  });
});

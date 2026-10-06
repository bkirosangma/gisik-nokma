import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * Cases 18.520, 18.521, 18.524 and 18.525 (task/notes-cross-workspace-followup, a PRODUCTION privacy follow-up to
 * 18.500–18.503): the two write doors that named a second entity with no workspace check at all.
 *
 * - `note.moved {homeProjectId}` re-files a note under a project, and nothing asked which project: an author could
 *   file a note under a project of ANOTHER workspace, one they are not on, or one nobody founded. It now meets
 *   `note.created`'s home-project rule, the same code: membership for a non-owner (one sentence for every project
 *   they are not on, a foreign or made-up one included), existence in this workspace for the owner, and a live target.
 * - `ticket.transitioned {cause.childTicketId}` (a parent reopened for a child) was stored and served whole. The
 *   child may not be born yet (the reopen goes FIRST, then the child's `ticket.created`), so an id bound NOWHERE
 *   commits; one bound to another workspace, or to something that is not a ticket, is refused. And the child can then
 *   be born only in the parent's workspace.
 *
 * The world is the notes fixture's WS plus W2, which `author` OWNS (`author` is a MEMBER of WS, on P): the one person
 * the holes admitted. Everything is seeded in `beforeAll`, and every act after it goes through the CLIENT door
 * (`ingestClientBatch`: the entity guard, the permission gate, the engine, the projections), because the door numbers
 * a workspace's events from the ledger and `applyCommitted` from a process-local map.
 *
 * Sentences and rules are LITERALS, never the module's constants: a test that imported them would follow a mutated
 * literal and stay green.
 */
const NOTE_RULE = 'permission.note';
const HOME = 'You are not a member of the project this note is filed under.';
const UNKNOWN_PROJECT_RULE = 'project.unknown';
const LIFECYCLE_RULE = 'lifecycle.state';
const DELETED = 'This project is deleted. Restore it from Deleted items on your Account page first.';
const VISIBILITY_RULE = 'permission.visibility';
const OTHER_TICKET = 'The other ticket does not exist in this workspace, or you cannot see it.';

type Who = 'author' | 'owner' | 'admin' | 'demoted';

let db: TestDatabase;
let world: NotesFixture;
let ingest: IngestService;
let W2: string;
let P2: string;
let P2b: string;
/** A second live project of WS, and a DELETED one. */
let PB: string;
let PD: string;
/** A visible ticket of WS beside TP (a same-workspace child for the cause control). */
let TQ: string;
/** A ticket of W2. */
let TW2: string;
/** A workspace-scope note homed in W2, authored by `author`. */
let away: string;
/** A member who wrote a note and was then made a guest; the note, homed in PB. */
let demoted: string;
let nDemoted: string;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
  W2 = newUlid();
  P2 = newUlid();
  P2b = newUlid();
  PB = newUlid();
  PD = newUlid();
  TQ = newUlid();
  TW2 = newUlid();
  away = newUlid();
  demoted = newUlid();
  nDemoted = newUlid();
  const inWS = { workspaceId: world.WS, actorId: world.ids.owner };
  const inW2 = { workspaceId: W2, actorId: world.ids.author };
  await applyCommitted(db.pool, [
    makeCommitted({ ...inWS, entity: { kind: 'project', id: PB }, type: 'project.created', payload: { name: 'Second shelf' } }),
    makeCommitted({ ...inWS, entity: { kind: 'project', id: PD }, type: 'project.created', payload: { name: 'Binned' } }),
    makeCommitted({ ...inWS, entity: { kind: 'project', id: PD }, type: 'project.deleted', payload: {} }),
    // A smaller kind of work than the fixture's `task`, so a child can be born under TP (the hierarchy rank rule).
    makeCommitted({
      ...inWS,
      entity: { kind: 'ticket-type', id: 'xws-subtask' },
      type: 'ticket-type.defined',
      payload: { id: 'xws-subtask', name: 'Sub-task', icon: 'check', rank: 4, workflowId: 'wf-errands', fields: [] },
    }),
    makeCommitted({
      ...inWS,
      entity: { kind: 'ticket', id: TQ },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: world.P, parentId: null, title: 'Order the shelf labels' },
    }),
    makeCommitted({
      ...inWS,
      entity: { kind: 'membership', id: `${world.WS}:${demoted}` },
      type: 'membership.granted',
      payload: { userId: demoted, role: 'member' },
    }),
    makeCommitted({
      ...inWS,
      actorId: demoted,
      entity: { kind: 'note', id: nDemoted },
      type: 'note.created',
      payload: { title: 'Written while a member', homeProjectId: PB, scope: { mode: 'workspace' } },
    }),
    // The same person re-granted as a GUEST: still the note's author, now on no project (a guest reaches work
    // through explicit lists, never a project; rule A covers owner, admin and member only).
    makeCommitted({
      ...inWS,
      entity: { kind: 'membership', id: `${world.WS}:${demoted}` },
      type: 'membership.granted',
      payload: { userId: demoted, role: 'guest' },
    }),

    makeCommitted({ ...inW2, entity: { kind: 'workspace', id: W2 }, type: 'workspace.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'membership', id: `${W2}:${world.ids.author}` },
      type: 'membership.granted',
      payload: { userId: world.ids.author, role: 'owner' },
    }),
    makeCommitted({ ...inW2, entity: { kind: 'project', id: P2 }, type: 'project.created', payload: { name: 'Elsewhere' } }),
    makeCommitted({ ...inW2, entity: { kind: 'project', id: P2b }, type: 'project.created', payload: { name: 'Elsewhere too' } }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'workflow', id: 'wf-elsewhere' },
      type: 'workflow.defined',
      payload: {
        id: 'wf-elsewhere',
        version: 1,
        name: 'Elsewhere',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'ticket-type', id: 'task-elsewhere' },
      type: 'ticket-type.defined',
      payload: { id: 'task-elsewhere', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-elsewhere', fields: [] },
    }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'ticket', id: TW2 },
      type: 'ticket.created',
      payload: { typeId: 'task-elsewhere', projectId: P2, parentId: null, title: 'Zanzibar shipping quote' },
    }),
    makeCommitted({
      ...inW2,
      entity: { kind: 'note', id: away },
      type: 'note.created',
      payload: { title: 'Homed in the second workspace', homeProjectId: P2, scope: { mode: 'workspace' } },
    }),
  ]);
  ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry(), gates: buildServerGates() });
}, 120_000);

afterAll(async () => {
  await db.drop();
});

const idOf = (who: Who) => (who === 'demoted' ? demoted : world.ids[who]);

/** One event through the client door. */
async function door(who: Who, workspaceId: string, entity: { kind: 'note' | 'ticket'; id: string }, type: string, payload: unknown) {
  const [result] = await ingest.ingestClientBatch(
    [
      {
        id: newUlid(),
        workspaceId,
        entity,
        type,
        version: 1,
        payload,
        actorId: idOf(who),
        origin: 'web',
        clientTime: '2026-10-06T13:00:00.000Z',
      },
    ],
    idOf(who),
  );
  return result as { status: string; rule?: string; reason?: string };
}

const note = (id: string) => ({ kind: 'note' as const, id });
const ticket = (id: string) => ({ kind: 'ticket' as const, id });
const move = (who: Who, workspaceId: string, noteId: string, homeProjectId: string) =>
  door(who, workspaceId, note(noteId), 'note.moved', { homeProjectId });
const home = async (noteId: string) =>
  (await db.pool.query<{ h: string }>('SELECT home_project_id AS h FROM proj_notes WHERE note_id = $1', [noteId])).rows[0]?.h;
const reopenFor = (childTicketId: string, to: string) =>
  door('author', world.WS, ticket(world.TP), 'ticket.transitioned', { to, cause: { kind: 'reopened-for-child', childTicketId } });
const stateOf = async (ticketId: string) =>
  (await db.pool.query<{ s: string }>('SELECT state_id AS s FROM proj_tickets WHERE ticket_id = $1', [ticketId])).rows[0]?.s;

describe('18.520 note.moved names a project of the note\'s own workspace', () => {
  it('18.520 a person in both workspaces moving a note under a project of the OTHER workspace is refused, each way, with the sentence a project they are not on gets; the same person moves both notes within their own workspaces', async () => {
    // CONTROL first, the same person: each note moves to another live project of its own workspace.
    expect(await move('author', world.WS, world.NOTES.nWorkspace, PB)).toMatchObject({ status: 'committed' });
    expect(await home(world.NOTES.nWorkspace)).toBe(PB);
    expect(await move('author', W2, away, P2b)).toMatchObject({ status: 'committed' });
    expect(await home(away)).toBe(P2b);

    // WS note → W2's project. `author` is a MEMBER of WS, so the membership half answers: P2 is on no list of WS.
    expect(await move('author', world.WS, world.NOTES.nWorkspace, P2)).toMatchObject({ status: 'refused', rule: NOTE_RULE, reason: HOME });
    expect(await home(world.NOTES.nWorkspace)).toBe(PB);
    // W2 note → WS's project. `author` OWNS W2, and the owner is exempt from the membership half, so the existence
    // half answers, asked in W2: P is founded, but not there.
    expect(await move('author', W2, away, world.P)).toMatchObject({
      status: 'refused',
      rule: UNKNOWN_PROJECT_RULE,
      reason: `There is no project ${world.P} in this workspace.`,
    });
    expect(await home(away)).toBe(P2b);

    // ONE rule for both events: a new note homed in W2's project is refused by the same person with the same
    // sentence (CONTROL: homed in a project of WS, it commits). Since rule A (2026-09-29) this is the only kind of id
    // that reaches the membership half for a member: a foreign, deleted or made-up one.
    const born = (homeProjectId: string) =>
      door('author', world.WS, note(newUlid()), 'note.created', { title: 'Born here', homeProjectId, scope: { mode: 'workspace' } });
    expect(await born(PB)).toMatchObject({ status: 'committed' });
    expect(await born(P2)).toMatchObject({ status: 'refused', rule: NOTE_RULE, reason: HOME });
  });
});

describe('18.521 note.moved names a project the mover can see, and a live one', () => {
  it('18.521 a GUEST author (a member who wrote the note, then was made a guest) moving it under a live project of its own workspace is refused the same way; the admin-reader and the owner move it there', async () => {
    // CONTROL: the guest is still the author, and a move to workspace level names no project at all.
    expect(await move('demoted', world.WS, nDemoted, '')).toMatchObject({ status: 'committed' });
    expect(await home(nDemoted)).toBe('');

    expect(await move('demoted', world.WS, nDemoted, world.P)).toMatchObject({ status: 'refused', rule: NOTE_RULE, reason: HOME });
    expect(await home(nDemoted)).toBe('');
    // The same note, the same project, people who can see it: the admin reads the workspace-scope note.
    expect(await move('admin', world.WS, nDemoted, world.P)).toMatchObject({ status: 'committed' });
    expect(await home(nDemoted)).toBe(world.P);
    expect(await move('owner', world.WS, nDemoted, PB)).toMatchObject({ status: 'committed' });
    expect(await home(nDemoted)).toBe(PB);
  });

  it('18.521 a DELETED project of the same workspace: a member is refused it by the membership half (rule A puts them on LIVE projects only), and the owner, exempt from it, by the lifecycle gate', async () => {
    // CONTROL: the owner moves the note to a live project.
    expect(await move('owner', world.WS, world.NOTES.nProject, PB)).toMatchObject({ status: 'committed' });
    expect(await home(world.NOTES.nProject)).toBe(PB);

    expect(await move('author', world.WS, world.NOTES.nProject, PD)).toMatchObject({ status: 'refused', rule: NOTE_RULE, reason: HOME });
    expect(await move('owner', world.WS, world.NOTES.nProject, PD)).toMatchObject({ status: 'refused', rule: LIFECYCLE_RULE, reason: DELETED });
    expect(await home(world.NOTES.nProject)).toBe(PB);
  });
});

describe('18.524 ticket.transitioned cause.childTicketId names no entity of another workspace', () => {
  it('18.524 a reopen cause naming a ticket of ANOTHER workspace, or an entity that is not a ticket, is refused with the other-ticket sentence; a same-workspace child commits', async () => {
    // CONTROL first: the same person, the same parent, a child of the parent's own workspace; and a transition with
    // no cause at all, which the new check must let through untouched.
    expect(await door('author', world.WS, ticket(world.TP), 'ticket.transitioned', { to: 'done' })).toMatchObject({ status: 'committed' });
    expect(await reopenFor(TQ, 'doing')).toMatchObject({ status: 'committed' });
    expect(await stateOf(world.TP)).toBe('doing');

    expect(await reopenFor(TW2, 'todo')).toMatchObject({ status: 'refused', rule: VISIBILITY_RULE, reason: OTHER_TICKET });
    // Bound to THIS workspace, but a note: refused alike, so the two halves are told apart.
    expect(await reopenFor(world.NOTES.nWorkspace, 'todo')).toMatchObject({ status: 'refused', rule: VISIBILITY_RULE, reason: OTHER_TICKET });
    expect(await stateOf(world.TP)).toBe('doing');
  });

  it('18.524 the future child: a cause naming an id bound NOWHERE commits (the reopen goes before the child is born), and that id is then born only in the parent\'s workspace', async () => {
    // CONTROL first: `author` files a ticket in W2 under a fresh id that no cause names.
    expect(
      await door('author', W2, ticket(newUlid()), 'ticket.created', { typeId: 'task-elsewhere', projectId: P2, parentId: null, title: 'Unrelated' }),
    ).toMatchObject({ status: 'committed' });

    // THE ASYMMETRY 18.525 does not cover, pinned: an id bound nowhere COMMITS (it may be the child about to be
    // born), while a foreign one is refused (above). The refusal tells the sender only that an id they already hold
    // is bound elsewhere; ULIDs are not enumerable.
    const future = newUlid();
    expect(await reopenFor(future, 'todo')).toMatchObject({ status: 'committed' });
    expect(await stateOf(world.TP)).toBe('todo');

    // Born in ANOTHER workspace under the id a WS cause already names: refused, with the same sentence.
    expect(
      await door('author', W2, ticket(future), 'ticket.created', { typeId: 'task-elsewhere', projectId: P2, parentId: null, title: 'Born elsewhere' }),
    ).toMatchObject({ status: 'refused', rule: VISIBILITY_RULE, reason: OTHER_TICKET });
    // Born under its parent in the parent's workspace: commits.
    expect(
      await door('author', world.WS, ticket(future), 'ticket.created', { typeId: 'xws-subtask', projectId: world.P, parentId: world.TP, title: 'Born at home' }),
    ).toMatchObject({ status: 'committed' });
  });
});

describe('18.525 the note.moved refusal for a REAL project of another workspace is the refusal for a made-up id (no existence oracle)', () => {
  it('18.525 per actor, byte for byte: a member gets one sentence for both; the owner gets the sentence that names the id, the same sentence once the id is set aside', async () => {
    const madeUp = newUlid();
    const pick = (r: { rule?: string; reason?: string }) => ({ rule: r.rule, reason: r.reason });
    const foreignMember = pick(await move('author', world.WS, world.NOTES.nPrivate, P2));
    const unknownMember = pick(await move('author', world.WS, world.NOTES.nPrivate, madeUp));
    expect(foreignMember).toEqual(unknownMember);
    expect(unknownMember).toEqual({ rule: NOTE_RULE, reason: HOME });

    // The owner's sentence names the id the sender gave, so the two are compared with that id set aside, and the
    // literal below proves the id WAS in the sentence (a sentence without it would compare equal unchanged).
    const shape = (r: { rule?: string; reason?: string }, id: string) => ({ rule: r.rule, reason: r.reason?.split(id).join('<id>') });
    const foreignOwner = shape(await move('author', W2, away, world.P), world.P);
    const unknownOwner = shape(await move('author', W2, away, madeUp), madeUp);
    expect(foreignOwner).toEqual(unknownOwner);
    expect(unknownOwner).toEqual({ rule: UNKNOWN_PROJECT_RULE, reason: 'There is no project <id> in this workspace.' });
  });
});

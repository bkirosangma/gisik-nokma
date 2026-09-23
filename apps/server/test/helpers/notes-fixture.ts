import type { Pool } from 'pg';
import { newUlid } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted, resetEntitySeqs } from './apply.js';

/**
 * The notes series' shared fixture: 5 notes × 7 people (Plan 1 of 6, spec
 * §4.1–§4.2).
 *
 * Extracted here in Task 5 because two files now need the same world — the
 * reader predicate's table (`test/visibility/can-read-note.test.ts`, 18.020) and
 * the writer matrix (`test/permissions/check-note-permission.test.ts`, 18.024) —
 * and two hand-built copies of a fixture is how two tests come to disagree about
 * what "the world" is while both staying green.
 *
 * ## Why it is its own world rather than `seedReadScenario`'s
 *
 * `read-scenario.ts` seeds 4 people (owner, member, outsider, guest) and no
 * `admin` at all — its own docblock names that absence ("There is no viewer with
 * workspace role `'admin'`") — and it REFUSES a second seed into the same
 * database, because its workflow and the two ticket types have fixed entity ids.
 * The roles this fixture is about cannot be added to it.
 *
 * ## The cells, and what each one is FOR
 *
 * - `memberIn` is on project P; `memberOut` is a workspace member on no project.
 *   Without both, "project scope means membership" and "project scope means
 *   being in the workspace" are the same predicate.
 * - `admin` is a workspace admin who is NOT on P. That is deliberate and it is
 *   what gives the matrix its `admin` column a `false` cell: `canSeeResolved`
 *   grants admins no read bypass (`can-see.ts`), so an admin who was also on P
 *   could not tell a role gate from a membership one. It is also the only source
 *   of an "admin-reader" (on a workspace note) and an "admin-non-reader" (on a
 *   project note) in ONE person, which is the pair spec §4.2's admin cell needs.
 * - `guestListed` is a guest named in two explicit audiences; `guestUnlisted` is
 *   a guest named in none. A single guest cannot tell "explicit admits guests"
 *   from "explicit admits everyone".
 * - `author` is a member on P and the author of every note, so the author arm is
 *   exercised separately from every scope arm.
 *
 * ## The tickets
 *
 * `TP` is a plain ticket in P with no authored audience, so it resolves to
 * `project`. `TE` is `explicit: [guestListed]`. They exist to give `nInherit`
 * something to inherit from, and their two modes are what make the union
 * observable.
 *
 * ## One call per fresh database
 *
 * This seeds through `applyCommitted`, whose docblock binds: it mints seqs from a
 * PROCESS-LOCAL map and refuses nothing, so a second seed into a database that
 * already holds events for these entities collides. `resetEntitySeqs()` runs
 * first, inside, so the caller only has to create the database. `SEEDED` makes a
 * second call in the same process a loud error rather than a unique-violation
 * from somewhere in the middle of the ledger.
 */
export type NotesUser = 'owner' | 'admin' | 'memberIn' | 'memberOut' | 'guestListed' | 'guestUnlisted' | 'author';

/** Every person the matrix has a column for, in the order the cases report them. */
export const NOTES_USERS: NotesUser[] = [
  'owner',
  'admin',
  'memberIn',
  'memberOut',
  'guestListed',
  'guestUnlisted',
  'author',
];

export type NotesFixture = {
  WS: string;
  P: string;
  TP: string;
  TE: string;
  ids: Record<NotesUser, string>;
  NOTES: { nPrivate: string; nWorkspace: string; nProject: string; nExplicit: string; nInherit: string };
};

/** `seedReadScenario`'s own workflow id, copied with the events below that need it. */
const SCENARIO_WORKFLOW_ID = 'wf-errands';

let SEEDED = false;

export async function seedNotesFixture(pool: Pool): Promise<NotesFixture> {
  if (SEEDED) {
    throw new Error(
      'seedNotesFixture: already seeded in this process. Its entity ids are minted per call but `applyCommitted` mints seqs process-locally, so a second seed into the same database collides on the ledger unique constraints. Use ONE fresh database per file (`createTestDatabase`).',
    );
  }
  SEEDED = true;
  resetEntitySeqs();

  const WS = newUlid();
  const P = newUlid();
  const TP = newUlid();
  const TE = newUlid();
  const ids: Record<NotesUser, string> = {
    owner: newUlid(),
    admin: newUlid(),
    memberIn: newUlid(),
    memberOut: newUlid(),
    guestListed: newUlid(),
    guestUnlisted: newUlid(),
    author: newUlid(),
  };
  const NOTES = {
    nPrivate: newUlid(),
    nWorkspace: newUlid(),
    nProject: newUlid(),
    nExplicit: newUlid(),
    nInherit: newUlid(),
  };

  const ws = { workspaceId: WS, actorId: ids.owner };
  // The roster shapes are copied from `helpers/read-scenario.ts` rather than
  // paraphrased, because the projection is the oracle: `membership.granted`
  // DECLARES scope as `z.never()` (the 2026-08-27 collapse), so a `scope` key
  // would be refused inside proj_memberships and the person would silently hold
  // no role at all.
  const ticket = (id: string, title: string) =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: P, parentId: null, title },
    });
  const noteEv = (id: string, type: string, payload: unknown) =>
    makeCommitted({ ...ws, actorId: ids.author, entity: { kind: 'note', id }, type, payload });

  await applyCommitted(pool, [
    makeCommitted({ ...ws, entity: { kind: 'workspace', id: WS }, type: 'workspace.created', payload: { name: 'Convenience Corner' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: P }, type: 'project.created', payload: { name: 'Registrations' } }),
    ...(
      [
        ['owner', 'owner'],
        ['admin', 'admin'],
        ['memberIn', 'member'],
        ['memberOut', 'member'],
        ['guestListed', 'guest'],
        ['guestUnlisted', 'guest'],
        ['author', 'member'],
      ] as [NotesUser, string][]
    ).map(([who, role]) =>
      makeCommitted({
        ...ws,
        entity: { kind: 'membership', id: `${WS}:${ids[who]}` },
        type: 'membership.granted',
        payload: { userId: ids[who], role },
      }),
    ),
    // ON P: owner, memberIn, author. NOT admin, NOT memberOut — those two
    // absences are the cells the `project` row is written from.
    ...(['owner', 'memberIn', 'author'] as NotesUser[]).map((who) =>
      makeCommitted({
        ...ws,
        entity: { kind: 'project', id: P },
        type: 'project.member_added',
        payload: { userId: ids[who], projectAdmin: who === 'owner' },
      }),
    ),
    // The workflow and the ticket type, in `seedReadScenario`'s exact shapes and
    // with its exact ids. Not decoration: `proj_tickets` folds `ticket.created`
    // through the engine, which refuses an unknown type, so a fixture that seeded
    // tickets without these would fail at the projection rather than at an
    // assertion. The ids are fixed rather than minted for the same reason they
    // are fixed there (`type_id = 'task'` is asserted by name elsewhere), and
    // that is safe because every caller uses its own fresh database.
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: SCENARIO_WORKFLOW_ID },
      type: 'workflow.defined',
      payload: {
        id: SCENARIO_WORKFLOW_ID,
        version: 1,
        name: 'Errands',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket-type', id: 'task' },
      type: 'ticket-type.defined',
      payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: SCENARIO_WORKFLOW_ID, fields: [] },
    }),
    ticket(TP, 'Renew the trade licence'),
    ticket(TE, 'Share the July invoices'),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: TE },
      type: 'visibility.set',
      payload: { ticketId: TE, mode: 'explicit', userIds: [ids.guestListed] },
    }),

    noteEv(NOTES.nPrivate, 'note.created', { title: 'Private', homeProjectId: P, scope: { mode: 'private' } }),
    noteEv(NOTES.nWorkspace, 'note.created', { title: 'Workspace', homeProjectId: P, scope: { mode: 'workspace' } }),
    noteEv(NOTES.nProject, 'note.created', { title: 'Project', homeProjectId: P, scope: { mode: 'project' } }),
    noteEv(NOTES.nExplicit, 'note.created', {
      title: 'Explicit',
      homeProjectId: P,
      scope: { mode: 'explicit', userIds: [ids.guestListed] },
    }),
    noteEv(NOTES.nInherit, 'note.created', {
      title: 'Inherit',
      homeProjectId: P,
      scope: { mode: 'inherit' },
      attachTicketId: TE,
    }),
  ]);

  return { WS, P, TP, TE, ids, NOTES };
}

/**
 * The SAME five notes, seeded into a world that already exists — the read-app's
 * (`helpers/read-app.ts`), whose workspace, project, roster, workflow and ticket
 * types are already in the ledger and whose `seedReadScenario` refuses a second
 * seeding of them.
 *
 * ## Why the deps are passed in rather than derived
 *
 * This helper must not mint a workspace: the notes have to land in the world the
 * signed-in roles belong to, or every route case would 404 for the wrong reason.
 * So the caller hands over the ids and the helper seeds nothing else — no
 * workspace, no project, no membership, no ticket type. It also does NOT call
 * `resetEntitySeqs`: the caller's seeding already spent the process-local
 * counter, and resetting it here would re-mint seqs that are already in the
 * ledger.
 *
 * ## The author is the OWNER, and that is load-bearing
 *
 * Every note here is authored by `owner` rather than by `member`, so the
 * `member` cell can be a genuine NON-reader of an inherited note (18.032) — the
 * author arm admits the author whatever the scope, so a fixture that authored
 * these by `member` could not tell "member may not read this" from "member wrote
 * this". `owner` is on the read scenario's project AND is its project admin, so
 * the author is also a legitimate member of the note's home project.
 *
 * `TP` should be the world's PROJECT-mode ticket and `TE` its
 * explicit-to-guest one. In `seedReadScenario` those are `taskInEpicId` and
 * `guestTaskId`; its `sharedTaskId` is NOT project-mode (it carries
 * `visibility.set explicit [owner, member]`), which is the one thing about that
 * world a reader is most likely to assume wrong.
 */
export type ReadWorldNotes = {
  NOTES: NotesFixture['NOTES'] & { nDeleted: string };
  TP: string;
  TE: string;
};

export async function seedNotesIntoReadWorld(
  pool: Pool,
  deps: { workspaceId: string; projectId: string; authorId: string; guestUserId: string; TP: string; TE: string },
): Promise<ReadWorldNotes> {
  const { workspaceId, projectId, authorId, guestUserId, TP, TE } = deps;
  const NOTES = {
    nPrivate: newUlid(),
    nWorkspace: newUlid(),
    nProject: newUlid(),
    nExplicit: newUlid(),
    nInherit: newUlid(),
    nDeleted: newUlid(),
  };
  const ws = { workspaceId, actorId: authorId };
  const noteEv = (id: string, type: string, payload: unknown) =>
    makeCommitted({ ...ws, entity: { kind: 'note', id }, type, payload });

  await applyCommitted(pool, [
    noteEv(NOTES.nPrivate, 'note.created', { title: 'Private', homeProjectId: projectId, scope: { mode: 'private' } }),
    noteEv(NOTES.nWorkspace, 'note.created', {
      title: 'Workspace',
      homeProjectId: projectId,
      scope: { mode: 'workspace' },
    }),
    noteEv(NOTES.nProject, 'note.created', { title: 'Project', homeProjectId: projectId, scope: { mode: 'project' } }),
    noteEv(NOTES.nExplicit, 'note.created', {
      title: 'Explicit',
      homeProjectId: projectId,
      scope: { mode: 'explicit', userIds: [guestUserId] },
    }),
    noteEv(NOTES.nInherit, 'note.created', {
      title: 'Inherit',
      homeProjectId: projectId,
      scope: { mode: 'inherit' },
      attachTicketId: TE,
    }),
    // A workspace-scope note that is then DELETED: workspace scope so that a
    // plain member can READ it, which is what makes 18.030's negative ("a
    // member sees [] among the deleted") a statement about the deleted rule
    // rather than about readability.
    noteEv(NOTES.nDeleted, 'note.created', { title: 'Deleted', homeProjectId: projectId, scope: { mode: 'workspace' } }),
    noteEv(NOTES.nDeleted, 'note.deleted', {}),
  ]);

  return { NOTES, TP, TE };
}

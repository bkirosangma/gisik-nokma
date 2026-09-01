import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildTestApp } from './app.js';
import type { TestDatabase } from './db.js';
import { applyCommitted, makeCommitted } from './apply.js';
import { seedReadScenario, type ReadScenario } from './read-scenario.js';
import { signInWithPhone } from './session.js';

/**
 * The assembled read world every Plan 5 route test (Tasks 8–15) stands on: a
 * real server, five REAL sessions, the shared seeded scenario, and a second
 * workspace next door.
 *
 * ## Why this is not the plan text's `buildReadTestApp`
 *
 * The plan's Step 2 helper hand-assembles Fastify, auth, ingest and the route
 * registrations a second time, beside `./app.ts`'s `buildTestApp`. That is the
 * duplication `./app.ts`'s own docblock exists to stop ("a shared helper rather
 * than a per-file copy … because the copies drift"), and it would drift
 * immediately: `buildApp` registers the board route itself, so a hand-assembled
 * app would be missing every route `buildApp` grows and carrying every route the
 * plan snippet remembers to list. So this helper CALLS `buildTestApp` and adds
 * only what a read test needs on top of it.
 *
 * It also takes a `TestDatabase` rather than the plan's `Pool`: the plan's
 * `migrateTestDb` / `testPool` / `truncateAll` do not exist on this branch, and
 * `seedReadScenario` REFUSES a second seed into one database, so the shape that
 * works is one `createTestDatabase` per file, seeded once.
 *
 * ## The sessions are real, and that is the point
 *
 * Membership events must name the same user ids the sessions carry, or a route
 * test proves the door admits a person the ledger never heard of. So sign-in
 * runs FIRST, over the wire, and the seeds are written under the ids it
 * answered.
 *
 * ## The five roles, and what each is for
 *
 * - `owner` — workspace owner, on the project, project admin. Reads everything.
 * - `member` — workspace member, on the project.
 * - `outsider` — workspace member, NOT on the project. The 200-empty cell.
 * - `guest` — workspace-scope role `guest`, on no project; reaches work only
 *   through explicit lists.
 * - `stranger` — a real signed-in user with NO membership anywhere. The 404 cell.
 * - `neighbour` — owner of a SECOND workspace with its own project and ticket.
 *   A stranger's 404 does not prove tenancy: a gate reading "is this caller a
 *   member of ANY workspace" would pass it. The neighbour is the cell that
 *   fails such a gate, and their own project is the positive control that keeps
 *   their 404 from being a route that 404s everything.
 */
export type ReadRole = 'owner' | 'member' | 'outsider' | 'guest' | 'stranger' | 'neighbour';

/**
 * A SECOND project inside the seeded workspace, with one ticket of its own and
 * both `owner` and `member` on its roster.
 *
 * `seedReadScenario`'s docblock lists "no second project" among the twelve
 * things its world does not contain, and for a route keyed on a project id that
 * absence is load-bearing: with one project per workspace, a board that dropped
 * its `project_id` clause entirely and filtered on `workspace_id` alone answers
 * exactly the same bytes, and no test can tell a project board from a workspace
 * board. MEASURED — that mutation passed all eleven cases before this existed.
 *
 * The ticket is visible to `member` (project mode, and they are on the roster),
 * so it is a card they COULD see that must not appear on the other project's
 * board. A ticket nobody could see would make the same mutation pass again.
 *
 * ## It also carries the only SECOND WORKFLOW in the suite
 *
 * `seedReadScenario` defines exactly one workflow and binds both its ticket
 * types to it, so without this every board in every test has one workflow and
 * the board's `card.workflowId === workflowId` filter is unconstrained: deleting
 * it leaves every case green while, on a real two-workflow board, every card
 * lands in EVERY workflow's column that happens to share its state id. MEASURED.
 * That is the hazard `blockedStateKeys`'s docblock names in words — "a state id
 * is only unique within its workflow" — so the second workflow deliberately
 * repeats two of the first's state ids (`todo`, `waiting`) and flags NEITHER as
 * blocked, while `wf-errands.waiting` IS blocked. One board then shows the same
 * state id twice, once blocked and once not, and a flag that leaked between
 * workflows has somewhere to be seen.
 *
 * It lives on the SIBLING project rather than the seeded one on purpose: the
 * seeded project's exact column and card sets are asserted by four cases, and a
 * fixture that changes what an existing case measures is a fixture that makes
 * the suite pass by declaration order.
 */
export type SiblingProject = {
  projectId: string;
  /** `task` → `wf-errands`, the workspace's first workflow. Lands in `todo`. */
  ticketId: string;
  ticketTitle: string;
  /** The SECOND workflow, defined here and used by nothing else. */
  secondWorkflowId: string;
  /** `chore` → `wf-second`. Lands in that workflow's own `todo`. */
  choreTicketId: string;
  choreTicketTitle: string;
};

export type NeighbourWorkspace = {
  workspaceId: string;
  projectId: string;
  workflowId: string;
  ticketId: string;
  ticketTitle: string;
};

export type ReadWorld = {
  app: FastifyInstance;
  world: ReadScenario;
  sibling: SiblingProject;
  neighbour: NeighbourWorkspace;
  userIds: Record<ReadRole, string>;
  tokens: Record<ReadRole, string>;
  /** `Authorization` header for a role, ready to spread into `app.inject`. */
  authOf(role: ReadRole): { authorization: string };
};

/** Distinct per role so no two sign-ins resolve to the same user. */
const PHONES: Record<ReadRole, string> = {
  owner: '+911111111101',
  member: '+911111111102',
  outsider: '+911111111103',
  guest: '+911111111104',
  stranger: '+911111111105',
  neighbour: '+911111111106',
};

const ROLES: ReadRole[] = ['owner', 'member', 'outsider', 'guest', 'stranger', 'neighbour'];

export async function buildReadTestApp(db: TestDatabase): Promise<ReadWorld> {
  const { app, otp } = buildTestApp(db);
  await app.ready();

  const userIds = {} as Record<ReadRole, string>;
  const tokens = {} as Record<ReadRole, string>;
  for (const role of ROLES) {
    const user = await signInWithPhone(app, otp, PHONES[role]);
    userIds[role] = user.userId;
    tokens[role] = user.token;
  }

  const world = await seedReadScenario(db.pool, {
    owner: userIds.owner,
    member: userIds.member,
    outsider: userIds.outsider,
    guest: userIds.guest,
  });
  const sibling = await seedSiblingProject(db.pool, world);
  const neighbour = await seedNeighbourWorkspace(db.pool, userIds.neighbour);

  return {
    app,
    world,
    sibling,
    neighbour,
    userIds,
    tokens,
    authOf: (role) => ({ authorization: `Bearer ${tokens[role]}` }),
  };
}

/** See `SiblingProject` — the same workspace, a different project. */
export async function seedSiblingProject(
  pool: Pool,
  world: ReadScenario,
): Promise<SiblingProject> {
  const projectId = newUlid();
  const ticketId = newUlid();
  const ticketTitle = 'Sibling project marker';
  const secondWorkflowId = 'wf-second';
  const choreTicketId = newUlid();
  const choreTicketTitle = 'Second workflow marker';
  const ws = { workspaceId: world.workspaceId, actorId: world.owner };

  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Licences' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: world.owner, projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: world.member, projectAdmin: false } }),
    // Reuses the workspace's already-defined `task` type and `wf-errands`
    // workflow: re-emitting either would collide on events_entity_seq_unique.
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: ticketTitle } }),
    // `wf-second` sorts after `wf-errands`, so a board carrying both has a
    // deterministic column order to assert rather than a set to sort.
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: secondWorkflowId },
      type: 'workflow.defined',
      payload: {
        id: secondWorkflowId,
        version: 1,
        name: 'Second flow',
        initialStateId: 'todo',
        states: [
          // `todo` and `waiting` repeat ids `wf-errands` also uses, and
          // `waiting` is NOT blocked here while it IS there. Both repetitions
          // are the point: they are what a workflow-blind column filter or a
          // leaking blocked flag would show up in.
          { id: 'todo', name: 'Queued', category: 'open' },
          { id: 'waiting', name: 'Parked', category: 'active' },
          { id: 'done', name: 'Filed', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'waiting', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'chore' }, type: 'ticket-type.defined', payload: { id: 'chore', name: 'Chore', icon: 'broom', rank: 3, workflowId: secondWorkflowId, fields: [] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: choreTicketId }, type: 'ticket.created', payload: { typeId: 'chore', projectId, parentId: null, title: choreTicketTitle } }),
  ];
  await applyCommitted(pool, events);
  return { projectId, ticketId, ticketTitle, secondWorkflowId, choreTicketId, choreTicketTitle };
}

/**
 * A second tenancy: one workspace, one owner, one project, one ticket.
 *
 * Every fixed entity id here is PREFIXED `nb-`. `seedReadScenario` pins
 * `wf-errands`, `epic` and `task` as fixed ids and the ledger's
 * `events_entity_seq_unique` would reject a second `('workflow', 'wf-errands',
 * 1)`; a neighbour reusing them would fail the seed rather than the assertion.
 *
 * The ticket is workspace-mode by default (a root with no authored visibility),
 * which is the cell that matters: `visibleTicketsWhere` compiles to `TRUE` for
 * an owner, so if a route ever loses its project/workspace scope this row is
 * what the OTHER workspace's owner would suddenly be able to read.
 */
export async function seedNeighbourWorkspace(
  pool: Pool,
  ownerId: string,
): Promise<NeighbourWorkspace> {
  const workspaceId = newUlid();
  const projectId = newUlid();
  const ticketId = newUlid();
  const workflowId = 'nb-workflow';
  const ticketTitle = 'Neighbour tenancy marker';
  const ws = { workspaceId, actorId: ownerId };

  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.created', payload: { name: 'Next Door' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, ownerId) }, type: 'membership.granted', payload: { userId: ownerId, role: 'owner' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Next Door errands' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: ownerId, projectAdmin: true } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: {
        id: workflowId,
        version: 1,
        name: 'Next Door flow',
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
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'nb-task' }, type: 'ticket-type.defined', payload: { id: 'nb-task', name: 'Task', icon: 'check', rank: 3, workflowId, fields: [] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.created', payload: { typeId: 'nb-task', projectId, parentId: null, title: ticketTitle } }),
  ];
  await applyCommitted(pool, events);
  return { workspaceId, projectId, workflowId, ticketId, ticketTitle };
}

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
  const neighbour = await seedNeighbourWorkspace(db.pool, userIds.neighbour);

  return {
    app,
    world,
    neighbour,
    userIds,
    tokens,
    authOf: (role) => ({ authorization: `Bearer ${tokens[role]}` }),
  };
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

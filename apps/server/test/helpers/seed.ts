import { membershipId, type LedgerEvent } from '@gisik-nokma/domain';
import type { Pool } from 'pg';
import { membershipsProjection } from '../../src/projections/proj-memberships.js';
import { projProjects } from '../../src/projections/proj-projects.js';
import { projVisibility } from '../../src/projections/proj-visibility.js';
import { testEnvelope } from './envelope.js';
import { appendTestEvent } from './ledger.js';

/**
 * Scenario seeds for Plan 4's visibility tests: build the membership and
 * visibility state a viewer would really have, through the REAL events and the
 * REAL projections, never by writing the tables by hand.
 *
 * That is the point of the file. `canSee` reads `proj_memberships` through
 * `resolveEffectiveRole`, whose one safety property — a revoked member resolves
 * no projects THOUGH THE PROJECT-SCOPE ROW SURVIVES — is only observable if the
 * surviving row got there the way a real revocation leaves it. A fixture that
 * INSERTed the rows it wanted could seed the post-revocation state without the
 * revocation, and a test built on it would pass with the safety property
 * deleted.
 *
 * ## Every id is a ULID, and that is forced rather than tidy
 *
 * `ticketCreatedPayload.projectId`, `membershipGrantedPayload.userId`,
 * `projectMemberAddedPayload.userId` and `visibilitySetPayload.userIds` are all
 * `ulidString` (`packages/domain/src/envelope.js`), and the projections parse
 * their payloads with those very schemas. The plan text's `wks_01` / `usr_guest`
 * fixtures throw at the parse. Callers pass `newUlid()` values.
 *
 * ## `applyAll` takes a Pool and checks out ONE client
 *
 * `Projection.apply` takes a `PoolClient`, deliberately — a projection may only
 * write inside the ingest transaction (`src/projections/registry.ts`), and the
 * plan text's `Queryable` parameter here would not typecheck. One checkout for
 * the whole batch keeps the seeding on a single connection, which is also what
 * a real ingest transaction gives a projection.
 *
 * Projections are applied in the registry's own order — projects, then
 * memberships, then visibility (coordination doc §8) — so a seed cannot pass
 * under an order the product never uses. `projProjects` joined the list at
 * Plan 4 Task 9 and goes FIRST of the three because §8 puts it there; it is
 * inert for every event but `project.created`, so no existing caller changes
 * behaviour, but a wrong order here would make this docblock a lie.
 */
export async function applyAll(pool: Pool, envs: readonly LedgerEvent[]): Promise<void> {
  const client = await pool.connect();
  try {
    for (const env of envs) {
      await projProjects.apply(env, client);
      await membershipsProjection.apply(env, client);
      await projVisibility.apply(env, client);
    }
  } finally {
    client.release();
  }
}

/**
 * Found a project, through the real `project.created` event.
 *
 * Needed since Plan 4 Task 9 Step 3b: `checkProjectExists` refuses any event
 * naming a project `proj_projects` has no row for, so a seed that grants
 * membership on a project id nobody founded now produces a `project.unknown`
 * refusal rather than the refusal the test meant to observe. That is the check
 * working — and it is exactly why every refusal test here must found its
 * project first, so the refusal under test is the one that fires.
 */
export async function seedProject(
  pool: Pool,
  workspaceId: string,
  projectId: string,
  name = `Project ${projectId}`,
): Promise<void> {
  await applyAll(pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: { name },
      actorId: SEED_ACTOR,
    }),
  ]);
}

/** The actor every seed attributes its claims to. Any ULID; the tests never assert it. */
const SEED_ACTOR = '01J0SEEDADM1N0000000000000';

export interface SeedProject {
  projectId: string;
  projectAdmin?: boolean;
}

/**
 * A workspace member, optionally on some projects.
 *
 * The grant is filed against the MEMBERSHIP entity and each project attachment
 * against the PROJECT entity — two streams, exactly as the vocabulary files
 * them, because which entity a roster event belongs to is what decides which
 * rows a revocation may delete.
 */
export async function seedMember(
  pool: Pool,
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
  projects: readonly SeedProject[] = [],
): Promise<void> {
  const envs: LedgerEvent[] = [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role },
      actorId: SEED_ACTOR,
    }),
    ...projects.map((p) =>
      testEnvelope({
        workspaceId,
        entity: { kind: 'project', id: p.projectId },
        type: 'project.member_added',
        payload: { userId, projectAdmin: p.projectAdmin ?? false },
        actorId: SEED_ACTOR,
      }),
    ),
  ];
  await applyAll(pool, envs);
}

/**
 * A guest belongs to the workspace and to no project — the `projectId`
 * parameter the plan text once had is GONE rather than ignored, because a
 * caller passing one would be expressing an association this vocabulary no
 * longer has. What a guest can reach comes from `visibility.set` explicit lists
 * on individual tickets.
 */
export async function seedGuest(pool: Pool, workspaceId: string, userId: string): Promise<void> {
  await applyAll(pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role: 'guest' },
      actorId: SEED_ACTOR,
    }),
  ]);
}

/**
 * Put someone out of the workspace, exactly as the product does.
 *
 * This deletes the WORKSPACE-scope row and nothing else — the projection's own
 * behaviour, not a simplification here — which is why a test using this helper
 * can assert that the project-scope row is still standing and that it confers
 * nothing.
 */
export async function revokeMember(
  pool: Pool,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await applyAll(pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.revoked',
      payload: { userId },
      actorId: SEED_ACTOR,
    }),
  ]);
}

export interface SeedTicketArgs {
  workspaceId: string;
  projectId: string;
  ticketId: string;
  /** `null` is the claim "this is a root". The payload key is REQUIRED, not optional. */
  parentId?: string | null;
  typeId?: string;
  title?: string;
  createdBy?: string;
}

/**
 * Creates the ticket in `proj_visibility` via the real `ticket.created` event,
 * AND appends that event to the ledger.
 *
 * The ledger append arrived with Plan 4 Task 9 and is not decoration.
 * Creatorship — Task 9's check 5 — has no projection to read on this branch:
 * `proj_tickets` does not exist and `proj_visibility` has no creator column, so
 * `check-permission.ts` reads `events.actor_id` on the ticket's own
 * `ticket.created` row. A fixture that only applied the projection would leave
 * every creator lookup answering null, and the creator cases below would pass
 * or fail for a reason unrelated to creatorship. It also makes
 * `workspaceHasLedger` answer truthfully for a workspace that has tickets in
 * it, which is what a real workspace looks like.
 *
 * The plan text's version also INSERTed a `proj_tickets` head row; that table
 * does not exist on this branch (Plan 3 Task 12 owns it), and its `ticket.created`
 * payload was missing the required `typeId` and `title` while spelling
 * `parentId` as an optional key — `ticketCreatedPayload` requires all three and
 * makes `parentId` nullable-but-present, so the plan's helper throws at the
 * parse before it reaches any assertion.
 */
export async function seedTicket(pool: Pool, args: SeedTicketArgs): Promise<void> {
  const created = testEnvelope({
    workspaceId: args.workspaceId,
    entity: { kind: 'ticket', id: args.ticketId },
    type: 'ticket.created',
    payload: {
      typeId: args.typeId ?? 'task',
      projectId: args.projectId,
      parentId: args.parentId ?? null,
      title: args.title ?? `Ticket ${args.ticketId}`,
    },
    actorId: args.createdBy ?? SEED_ACTOR,
  });
  await appendTestEvent(pool, created);
  await applyAll(pool, [created]);
}

/**
 * A `visibility.set` claim, filed against the ticket it is about.
 *
 * `payload.ticketId` restates the entity id here, which is the coherent case.
 * A claim where the two DISAGREE is Task 9's refusal to make; the projection
 * keys on the entity regardless (`proj-visibility.ts`).
 */
export function setVisibilityEnv(
  workspaceId: string,
  ticketId: string,
  mode: 'workspace' | 'project' | 'explicit' | 'inherit',
  userIds?: readonly string[],
  actorId: string = SEED_ACTOR,
): LedgerEvent {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'visibility.set',
    payload: { ticketId, mode, ...(userIds ? { userIds: [...userIds] } : {}) },
    actorId,
  });
}

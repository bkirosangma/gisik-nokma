import { membershipId, type LedgerEvent } from '@gisik-nokma/domain';
import type { Pool } from 'pg';
import { membershipsProjection } from '../../src/projections/proj-memberships.js';
import { projVisibility } from '../../src/projections/proj-visibility.js';
import { testEnvelope } from './envelope.js';

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
 * Projections are applied in the registry's own order — memberships before
 * visibility (coordination doc §8) — so a seed cannot pass under an order the
 * product never uses.
 */
export async function applyAll(pool: Pool, envs: readonly LedgerEvent[]): Promise<void> {
  const client = await pool.connect();
  try {
    for (const env of envs) {
      await membershipsProjection.apply(env, client);
      await projVisibility.apply(env, client);
    }
  } finally {
    client.release();
  }
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
 * Creates the ticket in `proj_visibility` via the real `ticket.created` event.
 *
 * The plan text's version also INSERTed a `proj_tickets` head row; that table
 * does not exist on this branch (Plan 3 Task 12 owns it), and its `ticket.created`
 * payload was missing the required `typeId` and `title` while spelling
 * `parentId` as an optional key — `ticketCreatedPayload` requires all three and
 * makes `parentId` nullable-but-present, so the plan's helper throws at the
 * parse before it reaches any assertion.
 */
export async function seedTicket(pool: Pool, args: SeedTicketArgs): Promise<void> {
  await applyAll(pool, [
    testEnvelope({
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
    }),
  ]);
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

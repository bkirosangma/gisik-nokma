import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import {
  checkPermission,
  NOT_A_MEMBER_REASON,
  NOT_ON_PROJECT_REASON,
  PERMISSION_ROLE_RULE,
  PROJECT_UNKNOWN_RULE,
  projectUnknownReason,
} from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { seedMember, seedProject } from '../helpers/seed.js';

/**
 * Plan 4 Task 9 Step 3b — a ticket cannot be created into a project that was
 * never founded (owner decision 2026-08-26).
 *
 * ## Why the rule NAME is asserted in every case here
 *
 * The whole subject of this file is a refusal firing for the RIGHT reason. The
 * membership check already refused most fabricated project ids — nobody is a
 * member of a project that does not exist — so a test asserting only "refused"
 * would have passed before this step existed. What changed is which refusal
 * comes back, so that is what is measured, and `project.unknown` is a distinct
 * rule id precisely so a test can tell the two apart (ruling P20).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function ticketCreated(workspaceId: string, projectId: string, actorId: string) {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId: null, title: 'A ticket' },
    actorId,
  });
}

const gate = (env: ReturnType<typeof ticketCreated>, sessionUserId: string) =>
  checkPermission(env, { db: db.pool, sessionUserId });

describe('checkProjectExists — the honest precondition', () => {
  it('planted defect: membership granted on a project nobody founded no longer admits a ticket', async () => {
    // THE reachable path, and the only one the coincidence never covered.
    // `project.member_added` accepts any ULID as a project scope without
    // validating it, so the roster row below exists for a project that does
    // not. Before this step the ticket COMMITTED and landed in proj_visibility
    // with a dangling project_id — on no board, in no project list, nobody
    // told.
    //
    // Mutation: delete the checkProjectExists call from checkPermission and
    // this returns null (the actor IS a member of the phantom project), which
    // is the pre-step behaviour exactly.
    const ws = newUlid();
    const ghost = newUlid();
    const user = newUlid();
    await seedMember(db.pool, ws, user, 'member', [{ projectId: ghost }]);

    expect(await gate(ticketCreated(ws, ghost, user), user)).toEqual({
      refused: true,
      rule: PROJECT_UNKNOWN_RULE,
      reason: projectUnknownReason(ghost),
    });
  });

  it('positive control: the same submission is admitted once the project is founded', async () => {
    // Without this, "refuses every ticket.created" would pass the case above.
    // Nothing changes but the founding event.
    const ws = newUlid();
    const projectId = newUlid();
    const user = newUlid();
    await seedMember(db.pool, ws, user, 'member', [{ projectId }]);
    await seedProject(db.pool, ws, projectId);

    expect(await gate(ticketCreated(ws, projectId, user), user)).toBeNull();
  });

  it('the ordering: a member off the project is told the project does not exist, not that they are not on it', async () => {
    // Both checks would fire here, and this pins which one wins. Mutation: move
    // checkProjectExists below checkVisibilityPermission in checkPermission and
    // the answer becomes NOT_ON_PROJECT_REASON — the user told they are not a
    // member of something that was never there.
    //
    // The actor is a workspace member on a DIFFERENT project, deliberately: a
    // workspace non-member is refused earlier and for a different reason, which
    // the next case measures rather than leaves implied.
    const ws = newUlid();
    const ghost = newUlid();
    const realProject = newUlid();
    const user = newUlid();
    await seedMember(db.pool, ws, user, 'member', [{ projectId: newUlid() }]);
    await seedProject(db.pool, ws, realProject);

    expect(await gate(ticketCreated(ws, ghost, user), user)).toEqual({
      refused: true,
      rule: PROJECT_UNKNOWN_RULE,
      reason: projectUnknownReason(ghost),
    });
    // The control for the sentence above, and the reason it is a MEASUREMENT of
    // ordering rather than a description of one: the SAME actor, off the
    // project either way, is told the membership fact as soon as the project
    // really exists. Without this line the case would pass against a build that
    // answered project.unknown to everything.
    expect(await gate(ticketCreated(ws, realProject, user), user)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_ON_PROJECT_REASON,
    });
  });

  it('the ordering has a BOUND: a workspace non-member is refused before the project is ever looked up', async () => {
    // Stated because it is the half of the ordering claim that goes the other
    // way, and a reader of "the honest reason wins" would otherwise expect
    // project.unknown here. Someone with no standing in the workspace may not
    // use this check to enumerate which project ids exist in it. Mutation: hoist
    // checkProjectExists above checkRolePermission and this reddens.
    const ws = newUlid();
    const stranger = newUlid();
    expect(await gate(ticketCreated(ws, newUlid(), stranger), stranger)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });
  });

  it('a member ON a founded project still meets the project-membership refusal when they are not', async () => {
    // The refusal check 2's project half owns, observed where it can only be
    // itself: the project exists, so project.unknown cannot fire, and the actor
    // is a workspace member, so NOT_A_MEMBER_REASON cannot either.
    const ws = newUlid();
    const projectId = newUlid();
    const outsider = newUlid();
    await seedMember(db.pool, ws, outsider, 'member', [{ projectId: newUlid() }]);
    await seedProject(db.pool, ws, projectId);

    expect(await gate(ticketCreated(ws, projectId, outsider), outsider)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_ON_PROJECT_REASON,
    });
  });
});

describe('checkProjectExists — every event that NAMES a project, not only ticket creation', () => {
  it('a roster event naming a project nobody founded is refused, and the founded one is not', async () => {
    // This is the side the hole is re-openable from: validating only
    // ticket.created leaves `project.member_added` free to mint membership on a
    // project id that does not exist, and the ticket check then passes for the
    // wrong reason. The actor is a workspace ADMIN so hasProjectAdminRights is
    // true on every project and the role gate has nothing to say — without that
    // the refusal observed would be PROJECT_ROSTER_REASON and this case would
    // prove nothing.
    const ws = newUlid();
    const ghost = newUlid();
    const real = newUlid();
    const admin = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');
    await seedProject(db.pool, ws, real);

    const roster = (projectId: string) =>
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'project', id: projectId },
        type: 'project.member_added',
        payload: { userId: newUlid(), projectAdmin: false },
        actorId: admin,
      });

    expect(await checkPermission(roster(ghost), { db: db.pool, sessionUserId: admin })).toEqual({
      refused: true,
      rule: PROJECT_UNKNOWN_RULE,
      reason: projectUnknownReason(ghost),
    });
    expect(await checkPermission(roster(real), { db: db.pool, sessionUserId: admin })).toBeNull();
  });

  it('project.created itself is never asked whether it exists — founding one would be impossible', async () => {
    // Mutation: add 'project.created' to projectNamedBy returning env.entity.id
    // and no project can ever be founded again.
    const ws = newUlid();
    const admin = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');

    const founding = testEnvelope({
      workspaceId: ws,
      entity: { kind: 'project', id: newUlid() },
      type: 'project.created',
      payload: { name: 'Brand new' },
      actorId: admin,
    });
    expect(await checkPermission(founding, { db: db.pool, sessionUserId: admin })).toBeNull();
  });

  it('a real project id borrowed from ANOTHER workspace is not found', async () => {
    // proj_projects is keyed by project id alone, so the workspace clause in
    // projectExists is the only thing standing here. Mutation: drop it and a
    // member of workspace B creates tickets into workspace A's project.
    const wsA = newUlid();
    const wsB = newUlid();
    const projectId = newUlid();
    const user = newUlid();
    await seedProject(db.pool, wsA, projectId);
    await seedMember(db.pool, wsB, user, 'member', [{ projectId }]);

    expect(await gate(ticketCreated(wsB, projectId, user), user)).toEqual({
      refused: true,
      rule: PROJECT_UNKNOWN_RULE,
      reason: projectUnknownReason(projectId),
    });
  });
});

/**
 * The existence check reads a table an earlier event in the SAME batch may have
 * just written, which is a claim about ingest's transaction shape rather than
 * about this check — so it is measured rather than inferred.
 *
 * `commitOne` opens its own connection and its own BEGIN/COMMIT per event, so a
 * batch is a SEQUENCE of committed transactions and event 2's gate reads event
 * 1's committed row. If ingest were ever changed to wrap a whole batch in one
 * transaction, or to gate every event up front before committing any, this case
 * is what would notice: a real client sends "create the project, then put people
 * on it" as one call, and the second half would be refused for naming a project
 * that — from the gate's point of view — did not exist yet.
 */
describe('a project founded EARLIER IN THE SAME BATCH is found by the check', () => {
  it('project.created followed by project.member_added commits in one ingestClientBatch call', async () => {
    const ingest = createIngestService({
      pool: db.pool,
      evaluate: evaluateEvent,
      projections: buildProjectionRegistry(),
    });

    const workspaceId = newUlid();
    const owner = newUlid();
    const event = (fields: {
      entity: SubmittedEvent['entity'];
      type: string;
      payload: unknown;
    }): SubmittedEvent => ({
      id: newUlid(),
      workspaceId,
      version: 1,
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
      actorId: owner,
      ...fields,
    });

    // Founded through the INTERNAL door, so the bootstrap's server-origin
    // appends are not judged by the client gate; the founding sequence makes
    // this actor the workspace owner.
    const founding = await ingest.ingestBatch([
      event({ entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.created', payload: { name: 'Founded' } }),
    ]);
    expect(founding[0]).toMatchObject({ status: 'committed' });

    const projectId = newUlid();
    const results = await ingest.ingestClientBatch(
      [
        event({ entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Same batch' } }),
        event({
          entity: { kind: 'project', id: projectId },
          type: 'project.member_added',
          payload: { userId: newUlid(), projectAdmin: false },
        }),
      ],
      owner,
    );

    expect(results.map((result) => result.status)).toEqual(['committed', 'committed']);

    // The control, without which this case would pass against a build that had
    // no existence check at all: the SAME two events in the OTHER order. The
    // roster event now names a project nothing has founded yet and is refused,
    // and the founding behind it still commits — so what the case above
    // measures is the check consulting the table per event, not the check being
    // absent.
    const reversed = newUlid();
    const outOfOrder = await ingest.ingestClientBatch(
      [
        event({
          entity: { kind: 'project', id: reversed },
          type: 'project.member_added',
          payload: { userId: newUlid(), projectAdmin: false },
        }),
        event({ entity: { kind: 'project', id: reversed }, type: 'project.created', payload: { name: 'Late' } }),
      ],
      owner,
    );
    expect(outOfOrder[0]).toMatchObject({
      status: 'refused',
      rule: PROJECT_UNKNOWN_RULE,
      reason: projectUnknownReason(reversed),
    });
    expect(outOfOrder[1]).toMatchObject({ status: 'committed' });
  });
});

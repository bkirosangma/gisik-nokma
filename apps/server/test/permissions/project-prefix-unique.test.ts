import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import {
  PERMISSION_ROLE_RULE,
  PROJECT_PREFIX_TAKEN_RULE,
  checkPermission,
} from '../../src/permissions/check-permission.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { seedMember, seedProject } from '../helpers/seed.js';

/**
 * Owner ruling 2026-09-20 — *"yes project prefixes are unique per workspace"*.
 *
 * ## The case this file exists for is the DERIVED one
 *
 * A check against the stored `proj_projects.prefix` column alone passes every
 * obvious test and still lets two projects answer to one prefix: a project that
 * entered NOTHING derives one, and `resolveProjectPrefixes` lets an ENTERED
 * value outrank a derived one. So creating a second project that enters `SO`
 * would take `SO`, and the older project — which never typed anything — would
 * silently move to `SO2`, changing every ticket key in it after readers had
 * quoted one.
 *
 * `13.1015` is that sequence, and it is the one a stored-column-only
 * implementation fails while `13.1014` stays green.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function projectCreated(
  workspaceId: string,
  projectId: string,
  actorId: string,
  payload: { name: string; prefix?: string },
) {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload,
    actorId,
  });
}

const gate = (env: ReturnType<typeof projectCreated>, sessionUserId: string) =>
  checkPermission(env, { db: db.pool, sessionUserId });

describe('13.1014-13.1018 a project prefix is unique within its workspace', () => {
  it('13.1014 — refuses a prefix another project ENTERED, naming the value and the reason', async () => {
    const ws = newUlid();
    const admin = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');
    await seedProject(db.pool, ws, newUlid(), 'Shop operations', undefined, 'SO');

    const refusal = await gate(projectCreated(ws, newUlid(), admin, { name: 'Sunday orders', prefix: 'SO' }), admin);
    expect(refusal).toEqual({
      refused: true,
      rule: PROJECT_PREFIX_TAKEN_RULE,
      reason:
        'Another project in this workspace already uses the prefix SO. A prefix identifies a project\'s tickets — SO-1, SO-2 — so two projects cannot share one. Choose a different prefix.',
    });
  });

  it('13.1015 — refuses a prefix another project DERIVES, which is what the column cannot see', async () => {
    // `Shop operations` enters NOTHING here, so `proj_projects.prefix` is NULL
    // and a check reading the column finds nothing to collide with. The read
    // still answers `SO` for it — `resolveProjectPrefixes` derives it — so
    // accepting this creation would hand `SO` to the new project and move the
    // old one to `SO2` at every read site, silently.
    const ws = newUlid();
    const admin = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');
    await seedProject(db.pool, ws, newUlid(), 'Shop operations');

    const refusal = await gate(projectCreated(ws, newUlid(), admin, { name: 'Sunday orders', prefix: 'SO' }), admin);
    expect(refusal?.rule).toBe(PROJECT_PREFIX_TAKEN_RULE);
    // The CONTROL: the same workspace, the same shape, a prefix nobody derives
    // — so this is not "refuses every project.created with a prefix".
    expect(
      await gate(projectCreated(ws, newUlid(), admin, { name: 'Sunday orders', prefix: 'ZZ' }), admin),
    ).toBeNull();
  });

  it('13.1016 — admits a free prefix, and admits the same prefix in a DIFFERENT workspace', async () => {
    // The residual scope the owner accepted: keys are unique WITHIN a
    // workspace only. Two workspaces may both choose `SO`, and that is a
    // decision rather than an oversight, so it is pinned rather than left to
    // be discovered as a surprise by whoever reads the check next.
    const admin = newUlid();
    const one = newUlid();
    const two = newUlid();
    await seedMember(db.pool, one, admin, 'admin');
    await seedMember(db.pool, two, admin, 'admin');
    await seedProject(db.pool, one, newUlid(), 'Shop operations', undefined, 'SO');

    expect(
      await gate(projectCreated(one, newUlid(), admin, { name: 'Site work', prefix: 'SI' }), admin),
    ).toBeNull();
    expect(
      await gate(projectCreated(two, newUlid(), admin, { name: 'Site work', prefix: 'SO' }), admin),
    ).toBeNull();
  });

  it('13.1017 — a project that enters NOTHING is never refused, whatever its name derives', async () => {
    // Two projects named identically in one workspace. Refusing the second
    // would make the prefix mandatory in fact while the schema keeps it
    // optional in form, and the derived path already resolves a collision by
    // moving — which it can only do because nobody claimed the value.
    const ws = newUlid();
    const admin = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');
    await seedProject(db.pool, ws, newUlid(), 'Shop operations');

    expect(
      await gate(projectCreated(ws, newUlid(), admin, { name: 'Shop operations' }), admin),
    ).toBeNull();
  });

  it('13.1028 — a RE-DELIVERY of the same project.created is not refused by its OWN prefix', async () => {
    // ⚠ FOUND BY THE INDEPENDENT REVIEWER, and no case here could have seen it:
    // every other case uses a FRESH project id. `projectPrefixesInWorkspace`
    // resolves every project in the workspace including the one this event
    // names, and its `proj_projects` row already exists because the FIRST
    // delivery wrote it — so the gate answered "taken" for the project's own
    // prefix and refused a retry with `project.prefix-taken` instead of the
    // `duplicate-event-id` the ledger answers.
    //
    // A retry is the ordinary way a client recovers from a lost response, on
    // `POST /v1/events` and on `POST /v1/sync`, so this is a real path even
    // though nothing in today's UI reaches it.
    const ws = newUlid();
    const admin = newUlid();
    const projectId = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');
    await seedProject(db.pool, ws, projectId, 'Shop operations', undefined, 'SO');

    // The SAME event, re-delivered: same entity id, same prefix.
    const retry = projectCreated(ws, projectId, admin, { name: 'Shop operations', prefix: 'SO' });
    expect(await gate(retry, admin)).toBeNull();

    // THE CONTROL, same call shape, same workspace: a DIFFERENT project asking
    // for the same prefix is still refused. Without it, this case would also
    // pass against a gate that had simply stopped refusing anything.
    expect(
      (await gate(projectCreated(ws, newUlid(), admin, { name: 'Sunday orders', prefix: 'SO' }), admin))
        ?.rule,
    ).toBe(PROJECT_PREFIX_TAKEN_RULE);
  });

  it('13.1018 — a MEMBER is told they may not found a project, not which prefixes are taken', async () => {
    // The ordering bound. This check reads the workspace's prefixes, so a
    // caller with no standing to found a project must not be able to use it to
    // enumerate them — the same bound `checkProjectExists` documents.
    const ws = newUlid();
    const member = newUlid();
    await seedMember(db.pool, ws, member, 'member');
    await seedProject(db.pool, ws, newUlid(), 'Shop operations', undefined, 'SO');

    const refusal = await gate(projectCreated(ws, newUlid(), member, { name: 'Sunday orders', prefix: 'SO' }), member);
    expect(refusal?.rule).toBe(PERMISSION_ROLE_RULE);
    expect(refusal?.rule).not.toBe(PROJECT_PREFIX_TAKEN_RULE);
  });
});

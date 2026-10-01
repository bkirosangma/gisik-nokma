import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  PERMISSION_ROLE_RULE,
  PROJECT_PREFIX_RESERVED_RULE,
  PROJECT_PREFIX_TAKEN_RULE,
  adminOnlyReason,
  checkPermission,
} from '../../src/permissions/check-permission.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { applyAll, seedMember, seedProject } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Prefixes/groups plan Task 3 (spec §3.1), cases 22.040–22.045: the door.
 *
 * A prefix a project has moved off is RESERVED to it. Its old ticket keys
 * (`SO-3`) still resolve to that project, so handing `SO` to another project
 * would make one key name two tickets. The holder itself may take the prefix
 * back, and a workspace may reuse its own former prefix (no check for those).
 *
 * Two harnesses on purpose: `checkPermission` directly for the refusal texts,
 * and the real `POST /v1/events` door for 22.045, which is about what the LEDGER
 * answers once the gate lets a retry through.
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `d MMM` of an instant, in IST — spelled out here so the expectation is not the implementation. */
function dayMonth(instant: string): string {
  const ist = new Date(new Date(instant).getTime() + 330 * 60_000);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`;
}

const reservedReason = (prefix: string, holder: string, until: string) =>
  `${prefix} was ${holder} prefix until ${dayMonth(until)}. Its old ticket keys still point there, so it can't be reused.`;

function projectUpdated(
  workspaceId: string,
  projectId: string,
  actorId: string,
  payload: { name?: string; prefix?: string },
) {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.updated',
    payload,
    actorId,
  });
}

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

const gate = (env: ReturnType<typeof testEnvelope>, sessionUserId: string) =>
  checkPermission(env, { db: db.pool, sessionUserId });

/**
 * A workspace, an admin, and project A which entered `SO` and then moved to `SH`.
 * `movedAt` FIXES the move's `serverTime` (default: the helper's own clock).
 */
async function workspaceWhereSoWasRetired(movedAt?: string) {
  const ws = newUlid();
  const admin = newUlid();
  const holder = newUlid();
  await seedMember(db.pool, ws, admin, 'admin');
  await seedProject(db.pool, ws, holder, 'Shop operations', undefined, 'SO');
  const move = {
    ...projectUpdated(ws, holder, admin, { prefix: 'SH' }),
    ...(movedAt === undefined ? {} : { serverTime: movedAt }),
  };
  await applyAll(db.pool, [move]);
  return { ws, admin, holder, until: move.serverTime };
}

describe('22.040-22.042 the door refuses a prefix that is held or reserved', () => {
  it("22.040 — project.updated onto a retired prefix is refused project.prefix-reserved, naming the holder's CURRENT name and the date", async () => {
    const { ws, admin, holder, until } = await workspaceWhereSoWasRetired();
    const other = newUlid();
    await seedProject(db.pool, ws, other, 'Sunday orders');

    expect(await gate(projectUpdated(ws, other, admin, { prefix: 'SO' }), admin)).toEqual({
      refused: true,
      rule: PROJECT_PREFIX_RESERVED_RULE,
      reason: reservedReason('SO', "Shop operations'", until),
    });

    // The CURRENT name, not the founding one: rename the holder and ask again.
    await applyAll(db.pool, [projectUpdated(ws, holder, admin, { name: 'Store' })]);
    expect(await gate(projectUpdated(ws, other, admin, { prefix: 'SO' }), admin)).toMatchObject({
      rule: PROJECT_PREFIX_RESERVED_RULE,
      reason: reservedReason('SO', "Store's", until),
    });

    // CONTROL, same call shape and workspace: a prefix nobody held is accepted,
    // so this is not "refuses every prefix change".
    expect(await gate(projectUpdated(ws, other, admin, { prefix: 'SX' }), admin)).toBeNull();
  });

  it('22.041 — project.created with a retired prefix is refused the same way', async () => {
    const { ws, admin, until } = await workspaceWhereSoWasRetired();

    expect(
      await gate(projectCreated(ws, newUlid(), admin, { name: 'Sunday orders', prefix: 'SO' }), admin),
    ).toEqual({
      refused: true,
      rule: PROJECT_PREFIX_RESERVED_RULE,
      reason: reservedReason('SO', "Shop operations'", until),
    });
    // CONTROL: a free prefix on the same creation is accepted.
    expect(
      await gate(projectCreated(ws, newUlid(), admin, { name: 'Sunday orders', prefix: 'SX' }), admin),
    ).toBeNull();
  });

  it("22.042 — another project's CURRENT prefix is refused with the existing project.prefix-taken text", async () => {
    const { ws, admin } = await workspaceWhereSoWasRetired();
    const other = newUlid();
    await seedProject(db.pool, ws, other, 'Sunday orders');

    // `SH` is project A's current prefix (it moved SO -> SH).
    expect(await gate(projectUpdated(ws, other, admin, { prefix: 'SH' }), admin)).toEqual({
      refused: true,
      rule: PROJECT_PREFIX_TAKEN_RULE,
      reason:
        "Another project in this workspace already uses the prefix SH. A prefix identifies a project's tickets — SH-1, SH-2 — so two projects cannot share one. Choose a different prefix.",
    });
    // CONTROL: the prefix it was RETIRED from is a different refusal, so the two
    // rules are not one message.
    expect((await gate(projectUpdated(ws, other, admin, { prefix: 'SO' }), admin))?.rule).toBe(
      PROJECT_PREFIX_RESERVED_RULE,
    );
  });
});

describe('22.046 the date in the refusal is the IST day', () => {
  it('22.046 — a move at 2026-09-30T19:00Z (IST 1 Oct 00:30) reads "until 1 Oct", not the UTC day; control: a same-day instant reads that day', async () => {
    const claimSo = async (movedAt: string) => {
      const { ws, admin } = await workspaceWhereSoWasRetired(movedAt);
      const other = newUlid();
      await seedProject(db.pool, ws, other, 'Sunday orders');
      return (await gate(projectUpdated(ws, other, admin, { prefix: 'SO' }), admin))?.reason;
    };

    // Control FIRST: 06:00Z is 11:30 IST the same calendar day, so UTC and IST agree.
    expect(await claimSo('2026-09-30T06:00:00.000Z')).toBe(
      "SO was Shop operations' prefix until 30 Sep. Its old ticket keys still point there, so it can't be reused.",
    );
    // 19:00Z is already 1 Oct in India; the UTC day would say 30 Sep.
    expect(await claimSo('2026-09-30T19:00:00.000Z')).toBe(
      "SO was Shop operations' prefix until 1 Oct. Its old ticket keys still point there, so it can't be reused.",
    );
  });
});

describe('22.043 workspace.prefix_changed is an admin act', () => {
  it('22.043 — a member is refused permission.role; an admin is accepted', async () => {
    const ws = newUlid();
    const admin = newUlid();
    const member = newUlid();
    await seedMember(db.pool, ws, admin, 'admin');
    await seedMember(db.pool, ws, member, 'member');
    const change = (actorId: string) =>
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'workspace', id: ws },
        type: 'workspace.prefix_changed',
        payload: { prefix: 'ZZ' },
        actorId,
      });

    expect(await gate(change(member), member)).toMatchObject({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: adminOnlyReason('member'),
    });
    expect(await gate(change(admin), admin)).toBeNull();
  });
});

describe('22.044 the holder may take its own prefix back', () => {
  it('22.044 — project A going SO -> SH -> SO is accepted at every step', async () => {
    const { ws, admin, holder } = await workspaceWhereSoWasRetired();
    const other = newUlid();
    await seedProject(db.pool, ws, other, 'Sunday orders');

    // A is on SH; SO is A's own former prefix. Taking it back must be allowed.
    const back = projectUpdated(ws, holder, admin, { prefix: 'SO' });
    expect(await gate(back, admin)).toBeNull();
    await applyAll(db.pool, [back]);
    // ...and SH is now A's own former prefix, which A may also re-take.
    expect(await gate(projectUpdated(ws, holder, admin, { prefix: 'SH' }), admin)).toBeNull();
    // A naming the prefix it holds right now is its own, not "taken".
    expect(await gate(projectUpdated(ws, holder, admin, { prefix: 'SO' }), admin)).toBeNull();

    // CONTROL: the same two prefixes are NOT free for a different project, so
    // the acceptance above is "own", not "everything is accepted".
    expect((await gate(projectUpdated(ws, other, admin, { prefix: 'SO' }), admin))?.rule).toBe(
      PROJECT_PREFIX_TAKEN_RULE,
    );
    expect((await gate(projectUpdated(ws, other, admin, { prefix: 'SH' }), admin))?.rule).toBe(
      PROJECT_PREFIX_RESERVED_RULE,
    );
  });
});

describe('22.045 a retry reaches the ledger, not a prefix refusal', () => {
  let phoneCounter = 0;
  type Caller = { userId: string; headers: { authorization: string } };

  async function signedIn(): Promise<Caller> {
    phoneCounter += 1;
    const user = await signInWithPhone(app, otp, `+9190450${String(phoneCounter).padStart(5, '0')}`);
    return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
  }

  async function submit(caller: Caller, id: string, event: Pick<SubmittedEvent, 'workspaceId' | 'entity' | 'type' | 'payload'>) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: caller.headers,
      payload: {
        events: [
          {
            id,
            version: 1,
            origin: 'web',
            clientTime: new Date().toISOString(),
            actorId: caller.userId,
            ...event,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { results: IngestResult[] }).results[0]!;
  }

  it('22.045 — re-delivering an EARLIER (SO -> SH) or the LATEST (SH -> SO) project.updated is duplicate-event-id, not project.prefix-reserved', async () => {
    const owner = await signedIn();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: owner.headers,
      payload: { name: 'Prefix Retry Co' },
    });
    expect(created.statusCode).toBe(201);
    const workspaceId = (created.json() as { workspaceId: string }).workspaceId;
    const holder = newUlid();
    const other = newUlid();
    await seedProject(db.pool, workspaceId, holder, 'Shop operations', undefined, 'SO');
    await seedProject(db.pool, workspaceId, other, 'Sunday orders');
    const update = (projectId: string, prefix: string) => ({
      workspaceId,
      entity: { kind: 'project' as const, id: projectId },
      type: 'project.updated' as const,
      payload: { prefix },
    });

    const toSh = newUlid();
    expect(await submit(owner, toSh, update(holder, 'SH'))).toMatchObject({ status: 'committed' });
    const backToSo = newUlid();
    expect(await submit(owner, backToSo, update(holder, 'SO'))).toMatchObject({ status: 'committed' });

    // The holder is back on SO and SH is its own former prefix. The first
    // event's retry names SH, which a gate that reserved the holder's OWN
    // former prefixes against the holder would refuse before the ledger spoke.
    expect(await submit(owner, toSh, update(holder, 'SH'))).toMatchObject({
      status: 'invalid',
      code: 'duplicate-event-id',
    });

    // The latest event's retry names SO, the holder's CURRENT prefix.
    expect(await submit(owner, backToSo, update(holder, 'SO'))).toMatchObject({
      status: 'invalid',
      code: 'duplicate-event-id',
    });

    // CONTROL, same door and prefix: a NEW event from another project asking for
    // SH is refused as reserved, so the gate was live for the retry above.
    expect(await submit(owner, newUlid(), update(other, 'SH'))).toMatchObject({
      status: 'refused',
      rule: PROJECT_PREFIX_RESERVED_RULE,
    });
  });
});

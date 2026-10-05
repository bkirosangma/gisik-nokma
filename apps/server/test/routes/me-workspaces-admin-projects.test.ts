import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Cases 30.011–30.012 (my-work-global T1, Step 4). Each `/v1/me/workspaces` row
 * carries `adminProjectIds`: the projects the caller administers in THAT
 * workspace, which the My work page reads to decide whether to offer the
 * "Projects I run" chip (`?show=project-admin`, refused where it is empty).
 *
 * V is an `admin` of W1 and a project admin of P1 there (not of P2), and a
 * `member` of W2. U owns both and is on no project roster.
 */

let db: TestDatabase;
let app: FastifyInstance;
let tokenV = '';
let tokenU = '';
let V = '';
let U = '';

const W1 = newUlid();
const W2 = newUlid();
const P1 = newUlid();
const P2 = newUlid();
const P3 = newUlid();

function ev(
  workspaceId: string,
  entity: LedgerEvent['entity'],
  type: string,
  payload: Record<string, unknown>,
): LedgerEvent {
  return makeCommitted({ workspaceId, actorId: U, entity, type, payload });
}

function founding(workspaceId: string, name: string, vRole: 'admin' | 'member'): LedgerEvent[] {
  return [
    ev(workspaceId, { kind: 'workspace', id: workspaceId }, 'workspace.created', { name }),
    ev(workspaceId, { kind: 'membership', id: membershipId(workspaceId, U) }, 'membership.granted', { userId: U, role: 'owner' }),
    ev(workspaceId, { kind: 'membership', id: membershipId(workspaceId, V) }, 'membership.granted', { userId: V, role: vRole }),
  ];
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const viewer = await signInWithPhone(app, built.otp, '+913100000001');
  const owner = await signInWithPhone(app, built.otp, '+913100000002');
  V = viewer.userId;
  U = owner.userId;
  tokenV = viewer.token;
  tokenU = owner.token;

  await applyCommitted(db.pool, [
    ...founding(W1, 'Alpha', 'admin'),
    ev(W1, { kind: 'project', id: P1 }, 'project.created', { name: 'Registrations' }),
    ev(W1, { kind: 'project', id: P2 }, 'project.created', { name: 'Accounts' }),
    ev(W1, { kind: 'project', id: P1 }, 'project.member_added', { userId: V, projectAdmin: true }),
    // On P2's roster too, but NOT as its admin: membership alone is not the flag.
    ev(W1, { kind: 'project', id: P2 }, 'project.member_added', { userId: V, projectAdmin: false }),
    ...founding(W2, 'Beta', 'member'),
    ev(W2, { kind: 'project', id: P3 }, 'project.created', { name: 'Payroll' }),
  ]);
}, 120_000);

afterAll(async () => {
  await app.close();
  await db.drop();
});

async function adminProjectIdsByWorkspace(token: string): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/me/workspaces',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.statusCode).toBe(200);
  const { workspaces } = response.json() as { workspaces: Array<Record<string, unknown>> };
  return Object.fromEntries(workspaces.map((row) => [row['workspaceId'], row['adminProjectIds']]));
}

describe('30.011 each workspace row names the projects the caller administers there', () => {
  it('30.011 V’s W1 row carries [P1] (not P2, where V is a plain roster member); V’s W2 row carries []', async () => {
    expect(await adminProjectIdsByWorkspace(tokenV)).toEqual({ [W1]: [P1], [W2]: [] });
  });
});

describe('30.012 a workspace role administers no project by itself', () => {
  it('30.012 an owner with no explicit project rows gets [] in both workspaces; given projectAdmin rows, the same owner gets them, sorted', async () => {
    expect(await adminProjectIdsByWorkspace(tokenU)).toEqual({ [W1]: [], [W2]: [] });

    // CONTROL, same `it`: the field reads the owner's EXPLICIT rows, so the []
    // above is the implicit `projectAdmin: false` answering, not a field that
    // is always empty for an owner.
    await applyCommitted(db.pool, [
      ev(W1, { kind: 'project', id: P2 }, 'project.member_added', { userId: U, projectAdmin: true }),
      ev(W1, { kind: 'project', id: P1 }, 'project.member_added', { userId: U, projectAdmin: true }),
    ]);
    expect(await adminProjectIdsByWorkspace(tokenU)).toEqual({ [W1]: [P1, P2].sort(), [W2]: [] });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { LedgerEvent } from '@gisik-nokma/domain';
import { INTERNAL_ERROR_BODY } from '../../src/app.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import type { Projection } from '../../src/projections/registry.js';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * What a workspace whose founding sequence half-landed actually does — MEASURED,
 * through the real route, with a real failure injected mid-sequence.
 *
 * ## Why this file exists at all
 *
 * `test-cases/06-auth-visibility.md` case 6.53 stated three things as facts:
 * that a mid-bootstrap throw reaches the caller as a **500 with no id**, that a
 * **retry mints a fresh ULID and founds a complete workspace**, and that the
 * residue **never appears in `GET /v1/me/workspaces`** because its founder holds
 * no grant. All three were read out of the source — no `try/catch` intercepts
 * between `bootstrapWorkspace` and Fastify's boundary — and reading that no
 * handler exists is an INFERENCE about a rejected promise, not an observation of
 * a status code. It is also the weakest kind: "no catch" is equally consistent
 * with an unhandled rejection that never becomes an HTTP answer at all.
 *
 * Nothing anywhere in the suite injected a partial-bootstrap failure, so no
 * workspace with a half-landed sequence had ever existed to ask. This file makes
 * one and asks it. Cases **6.110** and **6.111**.
 *
 * ## How the failure is injected, and why this way
 *
 * `bootstrapWorkspace` appends its eight events through the INTERNAL door, one
 * transaction each. A projection registered behind the real ones therefore gets
 * to fail a single event of the sequence while its predecessors stay committed —
 * which is exactly the shape 6.53 describes and the shape no ordinary error can
 * be talked into producing.
 *
 * The fault is **real SQL against a function that does not exist**, not a thrown
 * JavaScript `Error`. That difference is load-bearing twice over: the ingest
 * transaction is genuinely aborted by Postgres, so `commitOne`'s `ROLLBACK` and
 * connection-release path run the way an infrastructure failure really drives
 * them; and the error carries a SQLSTATE `code` rather than an HTTP
 * `statusCode`, which is what `app.ts`'s error handler branches on. A hand-built
 * `Error` with a `statusCode` field would answer something else and prove
 * nothing about the real case.
 *
 * There is **no `// Mutation:` line in this file, deliberately.** The properties
 * here are not held up by a guard that could be deleted — they are what an
 * uncaught rejection out of `ingestClientBatch` DOES. The thing that would
 * falsify them is a `try/catch` appearing around the bootstrap call site, and
 * that is an addition, not a deletion; these cases are what would notice it.
 */

/** The name the injected fault calls, which no migration defines. */
const MISSING_FUNCTION = 'gisik_nokma_injected_bootstrap_fault';

/**
 * Fails the SECOND built-in ticket-type definition of the founding sequence —
 * the fourth event of the eight — and only while armed.
 *
 * Mid-sequence rather than at either end, and that is the point: the residue it
 * leaves is a workspace with a real ledger prefix (`workspace.created`, the
 * default workflow, the `epic` type) and no grant. Failing the first event would
 * leave a workspace with nothing but its founding claim, and failing the last
 * would leave one that is complete but for the grant — neither is the
 * "half-landed" object 6.53 is about.
 */
function faultProjection(armed: () => boolean): Projection {
  return {
    name: 'test_injected_bootstrap_fault',
    // It writes nothing, so it has nothing to reset. This registry is built for
    // this file and never reaches `verify-projections` or a rebuild.
    tables: [],
    async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
      const payloadId = (event.payload as { id?: unknown } | null)?.id;
      if (!armed() || event.type !== 'ticket-type.defined' || payloadId !== 'story') {
        return;
      }
      await tx.query(`SELECT ${MISSING_FUNCTION}()`);
    },
    async reset(): Promise<void> {
      // Nothing to empty.
    },
  };
}

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let faultArmed = false;

beforeAll(async () => {
  db = await createTestDatabase();
  // The REAL registry, in its real §8 order, with the fault appended behind it.
  // Registering it last means every real projection has already applied for the
  // failing event, so the rollback that follows is a real one taking real work
  // with it — not a fault that fired before anything happened.
  const projections = buildProjectionRegistry();
  projections.register(faultProjection(() => faultArmed));
  const built = buildTestApp(db, { projections });
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phoneCounter = 0;

async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190006${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

/** Every `workspace.created` this person authored, oldest first. The residue is found by this, not returned. */
async function workspacesFoundedBy(userId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM events
      WHERE actor_id = $1 AND type = 'workspace.created'
      ORDER BY server_time, workspace_id`,
    [userId],
  );
  return rows.map((row) => row.workspace_id);
}

async function streamTypes(workspaceId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string }>(
    'SELECT type FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
    [workspaceId],
  );
  return rows.map((row) => row.type);
}

async function workspaceMembers(workspaceId: string): Promise<{ user_id: string; role: string }[]> {
  const { rows } = await db.pool.query<{ user_id: string; role: string }>(
    `SELECT user_id, role FROM proj_memberships
      WHERE workspace_id = $1 AND scope_kind = 'workspace'`,
    [workspaceId],
  );
  return rows;
}

/** The workspace ids the directory hands this person — the answer a person actually sees. */
async function directoryIds(headers: { authorization: string }): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers });
  expect(res.statusCode).toBe(200);
  return (res.json() as { workspaces: { workspaceId: string }[] }).workspaces.map(
    (row) => row.workspaceId,
  );
}

describe('POST /v1/workspaces — a founding sequence that fails partway', () => {
  it('the caller is answered 500 with no workspace id, and the residue is a real half-founded ledger', async () => {
    // CASE 6.110. The first half of 6.53, which until now was read from the
    // source rather than observed: `bootstrapWorkspace` throws, nothing between
    // it and Fastify catches, and the caller gets — this. Whatever this turns
    // out to be, it is asserted rather than predicted.
    const { userId, headers } = await signedIn();

    faultArmed = true;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers,
      payload: { name: 'Half a corner' },
    });
    faultArmed = false;

    // The status a rejected promise out of `ingestClientBatch` actually becomes.
    expect(res.statusCode).toBe(500);
    // The FIXED body, exactly — which also settles a second question the source
    // could only have been reasoned about: the Postgres error naming a missing
    // function does not reach the caller. `toEqual` rather than a status check,
    // because a body that grew the SQLSTATE or the function name would be the
    // leak `app.ts` exists to prevent.
    expect(res.json()).toEqual(INTERNAL_ERROR_BODY);
    // "and no id": the caller is told nothing it could act on.
    expect(res.json()).not.toHaveProperty('workspaceId');

    // The residue exists and is genuinely HALF founded — the prefix that
    // committed before the fault, and nothing after it. This is the object 6.53
    // is about, and this is the first time in the suite one has existed.
    const founded = await workspacesFoundedBy(userId);
    expect(founded).toHaveLength(1);
    const residue = founded[0] as string;
    expect(await streamTypes(residue)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
    ]);

    // The consequence 6.53 states and nothing measured: no grant, so no member,
    // so nobody can act in it. The directory answer is the one a person sees.
    expect(await workspaceMembers(residue)).toEqual([]);
    expect(await directoryIds(headers)).toEqual([]);
  });

  it('a retry founds a SECOND, complete workspace — it does not repair the first', async () => {
    // CASE 6.111, and the sharp half. 6.53 says a retry "mints a fresh ULID and
    // founds a complete workspace"; the sentence is easy to read as the retry
    // FIXING the half-founded one. It does not, and the difference is the whole
    // reason 6.53 stays open: the residue is still there afterwards, still
    // unrepaired, and the person now owns one workspace while the ledger holds
    // two of their foundings.
    const { userId, headers } = await signedIn();

    faultArmed = true;
    const failed = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers,
      payload: { name: 'First try' },
    });
    faultArmed = false;
    expect(failed.statusCode).toBe(500);

    // The retry, with the transient failure gone — which is what a retry after
    // an infrastructure fault means. Nothing else about the request changes.
    const retry = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers,
      payload: { name: 'Second try' },
    });
    expect(retry.statusCode).toBe(201);
    const founded = (retry.json() as { workspaceId: string }).workspaceId;

    const all = await workspacesFoundedBy(userId);
    expect(all).toHaveLength(2);
    const residue = all.find((id) => id !== founded) as string;
    // A FRESH ULID: the retry did not re-use, re-submit or re-found the first.
    expect(residue).not.toBe(founded);

    // The residue, unchanged by the retry. Asserted AFTER the retry rather than
    // before, because "the retry repaired it" and "the retry founded a new one"
    // are indistinguishable from a reading taken before.
    expect(await streamTypes(residue)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
    ]);
    expect(await workspaceMembers(residue)).toEqual([]);

    // The new one is COMPLETE — all eight events (five built-in types since wtg2 T5), in order, and its founder
    // owning it. This is the positive control that stops "every founding 500s
    // now" from passing this file, and it is taken through the same door, by the
    // same person, one armed flag apart from the failure above.
    expect(await streamTypes(founded)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'membership.granted',
    ]);
    expect(await workspaceMembers(founded)).toEqual([{ user_id: userId, role: 'owner' }]);

    // And the answer a person is actually given: ONE workspace, the complete
    // one. The residue is inert ledger noise — not a lock-out, not a leak, and
    // not something the directory has to know how to hide, because it holds no
    // membership row for it to find.
    expect(await directoryIds(headers)).toEqual([founded]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, PURGE_RULE as DOMAIN_PURGE_RULE, PURGED_LOOKUP_MAX_IDS, type PurgedRef } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { PURGE_RULE } from '../../src/purge/check-purged.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Trash series Plan 3, Task 1 (deviation D1): the content-free lookup a device
 * and the web renderer use to learn that an id they hold was erased. Rows are
 * inserted straight into `purged_entities` — it is not a trigger-protected
 * table, and these cases are about the READ, not about how Plan 2 fills it.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let headers: { authorization: string };

const WS = newUlid();
const T = newUlid();
const W = newUlid();
const LIVE = newUlid();
const WF = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
  const user = await signInWithPhone(app, otp, '+919004400001');
  headers = { authorization: `Bearer ${user.token}` };
  await db.pool.query(
    `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at) VALUES
       ('ticket', $1, $2, now()), ('workspace', $3, $3, now()), ('workflow', $4, $2, now())`,
    [T, WS, W, WF],
  );
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

async function lookup(ids: unknown, withSession = true): Promise<{ status: number; purged: PurgedRef[] }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/purged-lookup',
    ...(withSession ? { headers } : {}),
    payload: { ids },
  });
  const purged = res.statusCode === 200 ? (res.json() as { purged: PurgedRef[] }).purged : [];
  return { status: res.statusCode, purged };
}

describe('19.161 the lookup answers the erased subset, lifecycle kinds only', () => {
  it('19.161 names the purged ticket and workspace in order; the live id and the workflow row are absent', async () => {
    const answer = await lookup([LIVE, W, T, WF]);
    expect(answer.status).toBe(200);
    expect(answer.purged).toEqual([
      { kind: 'ticket', id: T },
      { kind: 'workspace', id: W },
    ]);
    // CONTROL
    expect(answer.purged.map((ref) => ref.id)).not.toContain(LIVE);
    expect(answer.purged.map((ref) => ref.id)).not.toContain(WF);
  });
});

describe('19.162 the body is bounded and typed', () => {
  it('19.162 refuses 501 ids and a non-ULID with 400; 500 ULIDs and an empty list answer 200', async () => {
    const tooMany = Array.from({ length: PURGED_LOOKUP_MAX_IDS + 1 }, () => newUlid());
    expect((await lookup(tooMany)).status).toBe(400);
    expect((await lookup(['not-a-ulid'])).status).toBe(400);
    // CONTROL
    const atCap = Array.from({ length: PURGED_LOOKUP_MAX_IDS }, () => newUlid());
    expect((await lookup(atCap)).status).toBe(200);
    expect(await lookup([])).toEqual({ status: 200, purged: [] });
  });
});

describe('19.163 the lookup needs a session', () => {
  it('19.163 answers 401 without one and 200 with one', async () => {
    expect((await lookup([T], false)).status).toBe(401);
    // CONTROL
    expect((await lookup([T])).status).toBe(200);
  });
});

describe('19.164 the rule id is one constant', () => {
  it('19.164 the server re-exports the domain PURGE_RULE', () => {
    expect(PURGE_RULE).toBe(DOMAIN_PURGE_RULE);
    // CONTROL: the spelling the device matches on
    expect(DOMAIN_PURGE_RULE).toBe('purge.erased');
  });
});

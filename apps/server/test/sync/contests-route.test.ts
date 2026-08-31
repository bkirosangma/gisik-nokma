import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildContestedClaim } from '../../src/sync/contest-coherence.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * `GET /v1/contests`. A contest is exactly as visible as its ticket.
 *
 * Everything here is seeded through REAL events and REAL projections: the
 * memberships and visibility rows arrive the way the product leaves them, and
 * the contests arrive through the internal ingest door, which runs the whole
 * projection registry. A test that INSERTed into `proj_contested` would pass
 * with the projection deleted.
 *
 * Session user ids are the ones the tokens actually resolve to, never literals:
 * `canSee` resolves the caller's role from `request.currentUserId`, so a seed
 * naming a made-up user id would grant nothing to the caller under test and the
 * visible case would fail for a reason unrelated to visibility.
 */

let db: TestDatabase;
let app: FastifyInstance;
let ingest: IngestService;

const WS = newUlid();
const PROJECT = newUlid();
const TICKET = newUlid();
const OTHER_TICKET = newUlid();

let memberId = '';
let memberHeaders: Record<string, string> = {};
let outsiderHeaders: Record<string, string> = {};

let openContestId = '';
let openOriginalId = '';
let resolvedContestId = '';

/** A claim by `actorId` on `ticketId`, of the kind the engine would refuse. */
function refusedClaim(ticketId: string, actorId: string): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId,
    origin: 'mobile',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  ingest = built.ingest;

  const member = await signInWithPhone(app, built.otp, '+911111111111');
  const outsider = await signInWithPhone(app, built.otp, '+912222222222');
  memberId = member.userId;
  memberHeaders = { authorization: `Bearer ${member.token}` };
  outsiderHeaders = { authorization: `Bearer ${outsider.token}` };

  // The member belongs to the workspace; the outsider belongs to nothing.
  await seedMember(db.pool, WS, memberId, 'member');
  await seedTicket(db.pool, { workspaceId: WS, projectId: PROJECT, ticketId: TICKET });
  await seedTicket(db.pool, { workspaceId: WS, projectId: PROJECT, ticketId: OTHER_TICKET });
  // Workspace mode, so a member who is on no project can still see it — the
  // audience is the thing under test, not project attachment.
  await applyAll(db.pool, [
    setVisibilityEnv(WS, TICKET, 'workspace'),
    setVisibilityEnv(WS, OTHER_TICKET, 'workspace'),
  ]);

  // Contests built by the SERVER-SIDE CONSTRUCTOR and appended through the
  // internal door, exactly as Plan 10 Task 7 will do it.
  const openOriginal = refusedClaim(TICKET, memberId);
  openOriginalId = openOriginal.id;
  const open = buildContestedClaim({
    originalEvent: openOriginal,
    rule: 'require-field',
    reason: 'A due date is required before this move.',
    actorId: newUlid(),
  });
  openContestId = open.id;

  const settled = buildContestedClaim({
    originalEvent: refusedClaim(OTHER_TICKET, newUlid()),
    rule: 'restrict-to',
    reason: 'Only the assignee may do this.',
    actorId: newUlid(),
  });
  resolvedContestId = settled.id;

  const results = await ingest.ingestBatch([open, settled]);
  for (const result of results) expect(result.status).toBe('committed');

  // Resolving it also exercises the engine's `getContest` end to end: the
  // evaluator refuses `contest.unknown` unless the server context can read
  // proj_contested, and `contest.wrong-ticket` unless it reads the right ticket.
  const [resolution] = await ingest.ingestBatch([
    {
      id: newUlid(),
      workspaceId: WS,
      entity: { kind: 'ticket', id: OTHER_TICKET },
      type: 'claim.contested_resolved',
      version: 1,
      payload: { contestedEventId: resolvedContestId, resolution: 'discarded', note: 'stale' },
      actorId: memberId,
      origin: 'web',
      clientTime: '2026-08-20T11:00:00.000Z',
    },
  ]);
  expect(resolution).toMatchObject({ status: 'committed' });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('GET /v1/contests', () => {
  it('401s without a session, and never reaches the projection', async () => {
    // Mutation that reddens it: drop `preHandler: requireSession` from
    // registerContestsRoute.
    const res = await app.inject({ method: 'GET', url: `/v1/contests?workspaceId=${WS}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('lists an open contest for a ticket the caller can see, carrying the refused claim whole', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&ticketId=${TICKET}&open=true`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
    const { contests } = res.json() as { contests: Array<Record<string, unknown>> };
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({
      contestedEventId: openContestId,
      originalEventId: openOriginalId,
      workspaceId: WS,
      ticketId: TICKET,
      claimantId: memberId,
      rule: 'require-field',
      reason: 'A due date is required before this move.',
      resolved: false,
      resolution: null,
      resolvedBy: null,
      resolvedEventId: null,
      resolvedAt: null,
    });
    // The claim travels whole — provenance floor.
    expect((contests[0]?.originalEvent as { id: string }).id).toBe(openOriginalId);
  });

  it('planted defect: a caller who cannot see the ticket gets NO contest — not even its existence', async () => {
    // Mutation that reddens it: delete the `canSee` guard in the route loop.
    // The outsider is signed in and names the right workspace, so the ONLY
    // thing withholding the row is that call.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&ticketId=${TICKET}`,
      headers: outsiderHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().contests).toEqual([]);
  });

  it('open=true excludes resolved contests; without it they are listed', async () => {
    // Mutation that reddens it: drop the `NOT resolved` clause. Both halves are
    // asserted, so a filter that excluded everything would fail the second.
    const openOnly = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&ticketId=${OTHER_TICKET}&open=true`,
      headers: memberHeaders,
    });
    expect(openOnly.json().contests).toEqual([]);

    const all = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&ticketId=${OTHER_TICKET}`,
      headers: memberHeaders,
    });
    const { contests } = all.json() as { contests: Array<Record<string, unknown>> };
    expect(contests).toHaveLength(1);
    expect(contests[0]).toMatchObject({
      contestedEventId: resolvedContestId,
      resolved: true,
      resolution: 'discarded',
      resolvedBy: memberId,
    });
    expect(contests[0]?.resolvedAt).not.toBeNull();
  });

  it('filters by claimant for the My Work surface', async () => {
    // Mutation that reddens it: drop the `claimant_id = $n` clause — the other
    // ticket's contest names a different claimant and would appear.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${WS}&claimantId=${memberId}`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
    const { contests } = res.json() as { contests: Array<{ claimantId: string }> };
    expect(contests.map((c) => c.claimantId)).toEqual([memberId]);
  });

  it('a workspace the caller is not in answers empty, not an error — no existence oracle', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contests?workspaceId=${newUlid()}`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().contests).toEqual([]);
  });

  it('refuses a request with no workspaceId — the query is workspace-scoped by contract', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/contests', headers: memberHeaders });
    expect(res.statusCode).toBe(400);
  });
});

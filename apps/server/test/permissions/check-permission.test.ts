import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

/**
 * The envelope-origin gate at the client door.
 *
 * TERMINOLOGY: "envelope-origin" throughout means the event envelope's `origin`
 * field — the provenance enum `'web' | 'mobile' | 'desktop' | 'server'`. It is
 * NOT the browser `Origin` header, and this file tests nothing about CSRF or
 * cross-site requests.
 *
 * The two rule strings below are written out by hand rather than imported from
 * the module under test, deliberately: importing them would make the assertion
 * agree with whatever the module says, including a wrong value. The contract is
 * these exact characters (Plan 4 Task 5's plan text pins them), so the test
 * spells them.
 */
const EXPECTED_RULE = 'permission.role';
const EXPECTED_REASON = 'Only the server itself may record server-origin events.';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function testAuth() {
  return createAuth({
    pool: db.pool,
    otpSender: new LogOtpSender(() => {}),
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
  });
}

function ingestService(): IngestService {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

function app(ingest: IngestService = ingestService()) {
  return buildApp({ db: db.pool, ingest, auth: testAuth() });
}

/**
 * The reachable forgery, exactly as the coordination doc describes it: a
 * `claim.contested` whose OUTER envelope is honest — a real ticket filed under
 * its own workspace, so `ENTITY_WORKSPACE_MISMATCH_RULE` has nothing to catch —
 * carrying a fabricated claim inside `payload`, attributed to a victim actor in
 * a different workspace. Nothing binds the embedded event to the outer
 * envelope, so the only thing standing between this and a permanent
 * un-deletable ledger entry is `contest.server-only`, which reads envelope-origin.
 */
function forgedContest(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  const workspaceId = newUlid();
  const victimWorkspaceId = newUlid();
  const victimActorId = newUlid();
  const fabricatedClaim: SubmittedEvent = {
    id: newUlid(),
    workspaceId: victimWorkspaceId,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: victimActorId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'claim.contested',
    version: 1,
    payload: {
      originalEvent: fabricatedClaim,
      rule: 'workflow.transition-not-allowed',
      reason: 'this refusal never happened',
    },
    actorId: newUlid(),
    origin: 'server', // the forgery: the client wears the server's provenance
    clientTime: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

async function ledgerRowsFor(eventId: string): Promise<number> {
  const { rows } = await db.pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM events WHERE id = $1',
    [eventId],
  );
  return rows[0]?.count ?? 0;
}

describe('envelope-origin gate — the client door (POST /v1/events)', () => { // test-cases 3.31
  it('refuses a client-submitted server-origin event with the exact rule and reason', async () => {
    const forged = forgedContest();
    const response = await app().inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [forged] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: unknown[] };
    expect(body.results[0]).toEqual({
      status: 'refused',
      eventId: forged.id,
      rule: EXPECTED_RULE,
      reason: EXPECTED_REASON,
    });
  });

  it('commits nothing for the refused forgery — the append-only ledger never sees it', async () => {
    const forged = forgedContest();
    await app().inject({ method: 'POST', url: '/v1/events', payload: { events: [forged] } });

    expect(await ledgerRowsFor(forged.id)).toBe(0);
  });

  it('refuses only the forgery in a batch, and keeps results index-aligned', async () => {
    const before = submittedWorkspaceCreated();
    const forged = forgedContest();
    const after = submittedWorkspaceCreated();

    const response = await app().inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [before, forged, after] },
    });

    const body = response.json() as { results: Array<{ status: string; eventId: string }> };
    expect(body.results).toHaveLength(3);
    expect(body.results[0]).toMatchObject({ status: 'committed', eventId: before.id });
    expect(body.results[1]).toMatchObject({ status: 'refused', eventId: forged.id, rule: EXPECTED_RULE });
    expect(body.results[2]).toMatchObject({ status: 'committed', eventId: after.id });
  });

  /**
   * The gate must refuse envelope-origin `'server'` and nothing else. Without
   * this case, a gate that refused every client submission would pass every
   * assertion above.
   */
  it('still admits an ordinary client submission through the same door', async () => {
    const honest = submittedWorkspaceCreated({ origin: 'web' });
    const response = await app().inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [honest] },
    });

    const body = response.json() as { results: Array<{ status: string }> };
    expect(body.results[0]).toMatchObject({ status: 'committed', eventId: honest.id });
    expect(await ledgerRowsFor(honest.id)).toBe(1);
  });
});

describe('envelope-origin gate — the internal door (ingestBatch) is NOT gated', () => { // test-cases 3.31
  /**
   * The discriminating case. The server's own appends are legitimately
   * server-origin — Task 5's workspace bootstrap and Task 14's invite
   * acceptance both append internally — and `claim.contested` is the sharpest
   * possible probe because `contest.server-only` REQUIRES envelope-origin
   * `'server'`: the event can only commit if the internal door leaves origin
   * alone AND the engine sees it. A gate wired blanket into the ingest path
   * turns this test red.
   */
  it('commits a server-origin claim.contested appended internally', async () => {
    const internal = forgedContest();
    const results = await ingestService().ingestBatch([internal]);

    expect(results[0]).toMatchObject({ status: 'committed', eventId: internal.id });
    expect(await ledgerRowsFor(internal.id)).toBe(1);
  });
});

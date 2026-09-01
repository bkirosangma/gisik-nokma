import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import {
  CONTEST_COHERENCE_RULE,
  CONTEST_TICKET_MISMATCH_REASON,
  CONTEST_WORKSPACE_MISMATCH_REASON,
} from '../../src/sync/contest-coherence.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';
import { applyAll, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * THE TEST THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT.
 *
 * The §11 forgery, exactly as it was committed end to end over the shipped
 * door: a `claim.contested` whose OUTER envelope is honest — a real ticket
 * filed under its real workspace, so `ENTITY_WORKSPACE_MISMATCH_RULE` has
 * nothing to catch — carrying inside its payload a fabricated claim naming a
 * DIFFERENT ticket, or a DIFFERENT workspace. Both must be refused, and nothing
 * may reach the append-only ledger, which can only ever supersede, never
 * delete.
 *
 * `contest-coherence.test.ts` decides the same question as a pure function.
 * This file proves it is WIRED — a check proven only where it is defined is a
 * check nothing proves is reachable, which is the shape this series keeps
 * catching.
 *
 * ## The paths enumerated here, and the one that is not
 *
 * `IngestService` has exactly two doors, and the property — no incoherent
 * contest reaches the ledger — has to hold at both:
 *
 * - **`ingestBatch`, the INTERNAL door.** Ungated by design (the server's own
 *   appends are legitimately envelope-origin `'server'`), so it is the door the
 *   coherence check cannot be carried past. This is the compound's own path.
 * - **`ingestClientBatch`, the CLIENT door.** Reached here through the real
 *   `POST /v1/events`, by a caller who FOUNDED the workspace — so identity,
 *   membership and role all pass — and whose forgery wears an honest
 *   envelope-origin. Without both of those the permission gate refuses first
 *   and this file would be pinning Plan 4's gate by accident.
 *
 * NOT enumerated: `POST /v1/sync` (Plan 10 Task 7) does not exist yet. When it
 * does it calls `ingestClientBatch`, so it inherits this check with the rest of
 * the door — but a path that does not exist cannot be walked, and saying
 * otherwise is the overclaim this file is written against.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function ingestService(): IngestService {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

/**
 * A contest whose OUTER envelope is honest. `embedded` decides what the
 * fabricated claim inside names — the whole subject of this file.
 */
function contest(args: {
  workspaceId: string;
  ticketId: string;
  actorId: string;
  origin?: SubmittedEvent['origin'];
  embedded?: { workspaceId?: string; ticketId?: string };
}): SubmittedEvent {
  const fabricated: SubmittedEvent = {
    id: newUlid(),
    workspaceId: args.embedded?.workspaceId ?? args.workspaceId,
    entity: { kind: 'ticket', id: args.embedded?.ticketId ?? args.ticketId },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: newUlid(),
    origin: 'mobile',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
  return {
    id: newUlid(),
    workspaceId: args.workspaceId,
    entity: { kind: 'ticket', id: args.ticketId },
    type: 'claim.contested',
    version: 1,
    payload: {
      originalEvent: fabricated,
      rule: 'workflow.transition-not-allowed',
      reason: 'this refusal never happened',
    },
    actorId: args.actorId,
    origin: args.origin ?? 'server',
    clientTime: '2026-08-20T09:00:01.000Z',
  };
}

async function ledgerRowsFor(eventId: string): Promise<number> {
  const { rows } = await db.pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM events WHERE id = $1',
    [eventId],
  );
  return rows[0]?.count ?? 0;
}

async function contestRowsFor(eventId: string): Promise<number> {
  const { rows } = await db.pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM proj_contested WHERE contested_event_id = $1',
    [eventId],
  );
  return rows[0]?.count ?? 0;
}

describe('§11 closer — the INTERNAL door (ingestBatch)', () => {
  it('non-vacuity control: a COHERENT server contest still commits and lands in proj_contested', async () => {
    // Without this, every refusal below is consistent with a check that refuses
    // all contests — and with the whole event type having been broken.
    const honest = contest({ workspaceId: newUlid(), ticketId: newUlid(), actorId: newUlid() });
    const [result] = await ingestService().ingestBatch([honest]);
    expect(result).toMatchObject({ status: 'committed', eventId: honest.id });
    expect(await ledgerRowsFor(honest.id)).toBe(1);
    expect(await contestRowsFor(honest.id)).toBe(1);
  });

  it('refuses a contest embedding a claim about a DIFFERENT TICKET, and appends nothing', async () => {
    // Mutation that reddens it, naming its own site: delete the
    // `original.entity.id !== env.entity.id` comparison in
    // src/sync/contest-coherence.ts. Deleting the CALL in commitOne reddens this
    // too — which is the point of testing at the door rather than only at the
    // function.
    const forged = contest({
      workspaceId: newUlid(),
      ticketId: newUlid(),
      actorId: newUlid(),
      embedded: { ticketId: newUlid() },
    });
    const [result] = await ingestService().ingestBatch([forged]);
    expect(result).toEqual({
      status: 'refused',
      eventId: forged.id,
      rule: CONTEST_COHERENCE_RULE,
      reason: CONTEST_TICKET_MISMATCH_REASON,
    });
    // The permanence half. The ledger is append-only by trigger: a row that
    // lands here can only ever be superseded, never removed, so "refused" is
    // only true if nothing was written.
    expect(await ledgerRowsFor(forged.id)).toBe(0);
    expect(await contestRowsFor(forged.id)).toBe(0);
  });

  it('refuses a contest embedding a claim naming a DIFFERENT WORKSPACE, and appends nothing', async () => {
    // Mutation that reddens it, naming its own site: delete the
    // `original.workspaceId !== env.workspaceId` comparison. The ticket
    // comparison cannot catch this one — the ticket ids agree.
    const forged = contest({
      workspaceId: newUlid(),
      ticketId: newUlid(),
      actorId: newUlid(),
      embedded: { workspaceId: newUlid() },
    });
    const [result] = await ingestService().ingestBatch([forged]);
    expect(result).toEqual({
      status: 'refused',
      eventId: forged.id,
      rule: CONTEST_COHERENCE_RULE,
      reason: CONTEST_WORKSPACE_MISMATCH_REASON,
    });
    expect(await ledgerRowsFor(forged.id)).toBe(0);
  });

  it('refuses only the forged contest in a batch, leaving its honest neighbour committed', async () => {
    const workspaceId = newUlid();
    const ticketId = newUlid();
    const honest = contest({ workspaceId, ticketId, actorId: newUlid() });
    const forged = contest({
      workspaceId,
      ticketId,
      actorId: newUlid(),
      embedded: { workspaceId: newUlid() },
    });
    const results = await ingestService().ingestBatch([honest, forged]);
    expect(results[0]).toMatchObject({ status: 'committed', eventId: honest.id });
    expect(results[1]).toMatchObject({ status: 'refused', rule: CONTEST_COHERENCE_RULE });
    expect(await ledgerRowsFor(honest.id)).toBe(1);
    expect(await ledgerRowsFor(forged.id)).toBe(0);
  });
});

describe('§11 closer — the CLIENT door (POST /v1/events)', () => {
  let phoneCounter = 0;

  /**
   * A signed-in caller who FOUNDED their workspace AND owns a ticket they can
   * see, so the permission gate has nothing left to refuse: identity matches,
   * membership is `owner` (the founding sequence grants it), the forgery below
   * wears an honest envelope-origin, and the ticket it is filed against is one
   * the caller may act on. Any of those missing and the gate refuses first, and
   * this describe block would be pinning Plan 4 rather than the §11 closer.
   *
   * The visible ticket arrived with Plan 4 Task 9. A `claim.contested` is filed
   * against a TICKET entity, so the visibility check now examines it — and
   * `canSee` answers false for a ticket with no `proj_visibility` row exactly as
   * it does for one the caller may not see. Against the bare `newUlid()` this
   * file used to contest, the client-door case drew `permission.visibility`
   * instead of the coherence refusal: the gate had something to say after all.
   * The fixture is repaired rather than the assertion loosened, which is the
   * same remedy this file's sibling (`test/permissions/check-permission.ts`)
   * records for the identity and membership faults it removed before.
   *
   * The founding is ASSERTED, never assumed.
   */
  async function founder() {
    const { app, otp } = buildTestApp(db);
    phoneCounter += 1;
    const user = await signInWithPhone(app, otp, `+9196000${String(phoneCounter).padStart(5, '0')}`);
    const headers = { authorization: `Bearer ${user.token}` };
    const founding = submittedWorkspaceCreated({ actorId: user.userId });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [founding] },
    });
    const body = response.json() as { results: Array<{ status: string }> };
    expect(body.results[0]).toMatchObject({ status: 'committed' });

    const ticketId = newUlid();
    await seedTicket(db.pool, {
      workspaceId: founding.workspaceId,
      projectId: newUlid(),
      ticketId,
    });
    await applyAll(db.pool, [setVisibilityEnv(founding.workspaceId, ticketId, 'workspace')]);

    return { app, headers, user, workspaceId: founding.workspaceId, ticketId };
  }

  it('refuses a client contest embedding a claim about a different ticket — the gate having nothing to say', async () => {
    const { app, headers, user, workspaceId, ticketId } = await founder();
    const forged = contest({
      workspaceId,
      ticketId,
      actorId: user.userId,
      // An HONEST envelope-origin. 'server' here would draw Plan 4's
      // `permission.role` refusal first and this case would prove nothing about
      // coherence. (envelope-origin, the provenance enum — not the HTTP Origin
      // header.)
      origin: 'web',
      embedded: { ticketId: newUlid() },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [forged] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toEqual({
      status: 'refused',
      eventId: forged.id,
      rule: CONTEST_COHERENCE_RULE,
      reason: CONTEST_TICKET_MISMATCH_REASON,
    });
    expect(await ledgerRowsFor(forged.id)).toBe(0);
    await app.close();
  });

  it('a client contest wearing server provenance still meets the ENVELOPE-ORIGIN refusal first', async () => {
    // The ordering the coherence check was placed to preserve: a client that has
    // forged its provenance is told the fault it can actually fix, and Plan 4's
    // gate keeps owning that refusal. Mutation that reddens it: move the
    // coherence check above the gate in commitOne.
    const { app, headers, user, workspaceId, ticketId } = await founder();
    const forged = contest({
      workspaceId,
      ticketId,
      actorId: user.userId,
      origin: 'server',
      embedded: { ticketId: newUlid() },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [forged] },
    });
    expect(response.json().results[0]).toMatchObject({
      status: 'refused',
      rule: 'permission.role',
      reason: 'Only the server itself may record server-origin events.',
    });
    expect(await ledgerRowsFor(forged.id)).toBe(0);
    await app.close();
  });
});

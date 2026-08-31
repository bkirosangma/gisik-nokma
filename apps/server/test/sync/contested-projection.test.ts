import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { newUlid, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { projContested } from '../../src/projections/contested.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * No per-test truncation, and that is forced rather than chosen: `events` is
 * APPEND-ONLY by trigger, so `DELETE FROM events` is refused by the database.
 * Isolation therefore comes from fresh ticket ids per test, and every assertion
 * is scoped to the ids the test made.
 *
 * It matters for the rebuild case at the bottom: `rebuildProjection` replays the
 * WHOLE ledger, so anything an earlier test appended is replayed too — which is
 * exactly why the loud-failure case below applies its event WITHOUT storing it.
 * A `claim.contested_resolved` with no contest left in the ledger would make
 * every later rebuild throw.
 */
const WS = newUlid();

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

function contestEnv(ticketId: string, claimantId: string, rule = 'restrict-to'): LedgerEvent {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'claim.contested',
    payload: {
      originalEvent: refusedClaim(ticketId, claimantId),
      rule,
      reason: 'Only the assignee may do this.',
    },
    // The SERVER files the contest. The claimant is inside the payload; these
    // two being different people is the whole reason claimant_id is read from
    // there and not from here.
    actorId: newUlid(),
    origin: 'server',
  });
}

function resolvedEnv(ticketId: string, contestedEventId: string, resolvedBy: string): LedgerEvent {
  return testEnvelope({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'claim.contested_resolved',
    payload: { contestedEventId, resolution: 'discarded', note: 'stale' },
    actorId: resolvedBy,
    origin: 'web',
  });
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Applies events in the given ARRIVAL order, and stores them in the ledger too. */
async function applyAndStore(events: readonly LedgerEvent[]): Promise<void> {
  await withClient(async (client) => {
    for (const event of events) {
      await insertEvent(client, event);
      await projContested.apply(event, client);
    }
  });
}

/** Applies without appending — for the case whose event must never enter the ledger. */
async function applyOnly(events: readonly LedgerEvent[]): Promise<void> {
  await withClient(async (client) => {
    for (const event of events) {
      await projContested.apply(event, client);
    }
  });
}

/** Every projection row for the named tickets, as canonical JSON text. */
async function dump(ticketIds: readonly string[]): Promise<string> {
  const { rows } = await db.pool.query<{ row: string }>(
    `SELECT row_to_json(c)::text AS row FROM proj_contested c
      WHERE c.ticket_id = ANY($1::text[]) ORDER BY c.contested_event_id`,
    [[...ticketIds]],
  );
  return rows.map((r) => r.row).join('\n');
}

describe('projContested', () => {
  it('records a contest open, keyed by both event ids, claimant read off the refused claim', async () => {
    const ticket = newUlid();
    const claimant = newUlid();
    const env = contestEnv(ticket, claimant);
    await applyAndStore([env]);

    const { rows } = await db.pool.query(
      'SELECT * FROM proj_contested WHERE contested_event_id = $1',
      [env.id],
    );
    expect(rows).toHaveLength(1);
    const payload = env.payload as { originalEvent: SubmittedEvent };
    expect(rows[0]).toMatchObject({
      original_event_id: payload.originalEvent.id,
      workspace_id: WS,
      ticket_id: ticket,
      // Mutation that reddens it: use `event.actorId` instead of
      // `payload.originalEvent.actorId` in the INSERT. Every row would then name
      // the server, and My Work would be empty for every claimant.
      claimant_id: claimant,
      rule: 'restrict-to',
      reason: 'Only the assignee may do this.',
      resolved: false,
      resolution: null,
      resolved_by: null,
      resolved_event_id: null,
      resolved_at: null,
    });
    // The refused claim travels WHOLE — the provenance floor the banner reads.
    expect(rows[0].original_event).toEqual(payload.originalEvent);
    // contested_at is the event's STORED serverTime, not a clock read at apply
    // time. Mutation that reddens it: pass `new Date()` instead of
    // `event.serverTime`.
    expect((rows[0].contested_at as Date).toISOString()).toBe(env.serverTime);
  });

  it('marks the contest resolved with who, how, when, and the resolving event', async () => {
    const ticket = newUlid();
    const contest = contestEnv(ticket, newUlid());
    const resolver = newUlid();
    const resolution = resolvedEnv(ticket, contest.id, resolver);
    await applyAndStore([contest, resolution]);

    const { rows } = await db.pool.query(
      'SELECT * FROM proj_contested WHERE contested_event_id = $1',
      [contest.id],
    );
    expect(rows[0]).toMatchObject({
      resolved: true,
      resolution: 'discarded',
      resolved_by: resolver,
      resolved_event_id: resolution.id,
    });
    expect((rows[0].resolved_at as Date).toISOString()).toBe(resolution.serverTime);
  });

  it('ignores every other event type — determinism over defensiveness', async () => {
    const ticket = newUlid();
    await applyAndStore([contestEnv(ticket, newUlid())]);
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    await applyAndStore([
      testEnvelope({
        workspaceId: WS,
        entity: { kind: 'ticket', id: ticket },
        type: 'ticket.assigned',
        payload: { assigneeId: newUlid() },
        actorId: newUlid(),
      }),
    ]);
    const after = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('a resolution aimed at an unknown contest FAILS LOUDLY rather than silently doing nothing', async () => {
    // The ordering premise asserted rather than assumed: the evaluator refuses
    // `contest.wrong-ticket`, so this state is unreachable through ingest. If it
    // is ever reached, a silent no-op would leave a resolved contest showing as
    // open forever with no instrument saying so.
    await expect(applyOnly([resolvedEnv(newUlid(), newUlid(), newUlid())])).rejects.toThrow(
      /resolves unknown contest/,
    );
  });

  it('reset empties the table, which is what makes a rebuild start from scratch', async () => {
    await applyAndStore([contestEnv(newUlid(), newUlid())]);
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(before.rows[0].n).toBeGreaterThan(0); // non-vacuity: reset of an empty table proves nothing
    await withClient((client) => projContested.reset(client));
    const after = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(after.rows[0].n).toBe(0);
  });
});

describe('projContested determinism: canonical replay equals live arrival', () => {
  it('a rebuild in canonical order derives the same bytes as an application in a DIFFERENT arrival order', async () => {
    // Two ticket streams, interleaved on arrival. `readLedger` replays
    // (entity_kind, entity_id, seq) — per-entity causality only — so the
    // rebuild REGROUPS these by ticket. That regrouping is the whole subject:
    // a determinism test that replays the order it applied is vacuous, so the
    // difference is asserted BEFORE the bytes are compared.
    const ticketA = newUlid();
    const ticketB = newUlid();
    const contestA = contestEnv(ticketA, newUlid(), 'restrict-to');
    const contestB = contestEnv(ticketB, newUlid(), 'require-field');
    const arrival: LedgerEvent[] = [
      contestB,
      contestA,
      resolvedEnv(ticketA, contestA.id, newUlid()),
      resolvedEnv(ticketB, contestB.id, newUlid()),
    ];

    const canonical = [...arrival].sort((a, b) => {
      if (a.entity.kind !== b.entity.kind) return a.entity.kind < b.entity.kind ? -1 : 1;
      if (a.entity.id !== b.entity.id) return a.entity.id < b.entity.id ? -1 : 1;
      return a.seq - b.seq;
    });
    // NON-VACUITY: if these two orders coincided, the comparison below would be
    // an application compared with itself and would pass with every ordering
    // guarantee deleted.
    expect(canonical.map((e) => e.id)).not.toEqual(arrival.map((e) => e.id));

    await applyAndStore(arrival);
    const live = await dump([ticketA, ticketB]);
    expect(live.split('\n')).toHaveLength(2);

    await rebuildProjection('proj_contested', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    expect(await dump([ticketA, ticketB])).toBe(live);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  newUlid,
  redactedTicketCreatedPayload,
  redactedTicketPublishedPayload,
  SYSTEM_ACTOR_PURGE,
  type LedgerEvent,
} from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { entityHeadsProjection } from '../../src/projections/entity-heads.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { projVisibility } from '../../src/projections/proj-visibility.js';
import type { Projection } from '../../src/projections/registry.js';
import { searchProjection } from '../../src/projections/search.js';
import { ticketsProjection } from '../../src/projections/tickets.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { foldTicketHead } from '../../src/sync/snapshot-writer.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { projectCreated, seedWorkspace, ticketCreated, type Base } from './world.js';

/**
 * Drafts T2 (spec §6.3, R29), case 28.027 (`test-cases/28-drafts.md` §28.2): a purged PUBLISHED draft-born
 * ticket keeps two redacted rows, its creation (`draft: true` kept, so not a numbering row) and its publish
 * (a numbering row). Every reader produces nothing from either, and the ticket keeps its slot.
 *
 * The shape of `redacted-row.test.ts` (19.092-19.096): X's two redacted rows are PLANTED with `insertEvent`
 * (the trigger guards UPDATE and DELETE, never INSERT) plus their entity-head rows. X's creation lands
 * BEFORE Y1, so it is a non-counted row, and X's publish lands BETWEEN Y1 and Y2, so X's slot comes from the
 * publish: Y1 = 1, X = 2, Y2 = 3. Each projection case applies the redacted publish through ONE projection;
 * the last case runs `verifyProjections` over the whole database.
 */

let db: TestDatabase;
let base: Base;
const P = newUlid();
const Y1 = newUlid();
const X = newUlid();
const Y2 = newUlid();
let redactedPublish: LedgerEvent;

async function plant(event: LedgerEvent): Promise<void> {
  const client = await db.pool.connect();
  try {
    await insertEvent(client, event);
    await entityHeadsProjection.apply(event, client);
  } finally {
    client.release();
  }
}

async function applyOne(projection: Projection, event: LedgerEvent): Promise<void> {
  const client = await db.pool.connect();
  try {
    await projection.apply(event, client);
  } finally {
    client.release();
  }
}

async function count(table: string, key: string, id: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${key} = $1`, [
    id,
  ]);
  return rows[0]?.n ?? 0;
}

const redactedRow = (type: string, payload: unknown): LedgerEvent =>
  makeCommitted({ workspaceId: base.WS, entity: { kind: 'ticket', id: X }, type, payload, actorId: base.OWNER });

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  base = await seedWorkspace(db.pool);
  await applyCommitted(db.pool, [projectCreated(base, P, 'Redaction', 'RD')]);
  await plant(redactedRow('ticket.created', redactedTicketCreatedPayload(P, true)));
  await applyCommitted(db.pool, [ticketCreated(base, Y1, P, 'Before')]);
  redactedPublish = redactedRow('ticket.published', redactedTicketPublishedPayload(P));
  await plant(redactedPublish);
  await applyCommitted(db.pool, [ticketCreated(base, Y2, P, 'After')]);
  await plant(
    makeCommitted({
      workspaceId: base.WS,
      entity: { kind: 'ticket', id: X },
      type: 'purge.completed',
      payload: { kind: 'ticket', markedBy: base.OWNER, markedAt: '2026-08-20T09:00:00.000Z' },
      actorId: SYSTEM_ACTOR_PURGE,
      origin: 'server',
    }),
  );
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('28.027 proj_tickets produces no ticket from a redacted publish', () => {
  it('28.027 writes no row for X (applying the redacted publish alone); Y1 has its row', async () => {
    await applyOne(ticketsProjection, redactedPublish);
    expect(await count('proj_tickets', 'ticket_id', X)).toBe(0);
    expect(await count('proj_tickets', 'ticket_id', Y1)).toBe(1);
  });
});

describe('28.027 proj_visibility and proj_search produce no row from a redacted publish', () => {
  it('28.027 writes no row for X in either; Y1 has both', async () => {
    await applyOne(projVisibility, redactedPublish);
    await applyOne(searchProjection, redactedPublish);
    expect(await count('proj_visibility', 'ticket_id', X)).toBe(0);
    expect(await count('proj_search', 'ticket_id', X)).toBe(0);
    expect(await count('proj_visibility', 'ticket_id', Y1)).toBe(1);
    expect(await count('proj_search', 'ticket_id', Y1)).toBe(1);
  });
});

describe('28.027 the snapshot fold and the ledger', () => {
  it('28.027 folds X to null and Y1 to its state; verifyProjections is clean; X keeps its slot (Y1 = 1, X = 2, Y2 = 3)', async () => {
    const client = await db.pool.connect();
    try {
      const deps = await buildLedgerDeps(client, base.WS);
      expect(await foldTicketHead(client, X, deps)).toBeNull();
      expect((await foldTicketHead(client, Y1, deps))?.state.fields['title']?.value).toBe('Before');
    } finally {
      client.release();
    }
    const numbers = await ticketNumbers(db.pool, base.WS, [Y1, X, Y2]);
    expect([numbers.get(Y1), numbers.get(X), numbers.get(Y2)]).toEqual([1, 2, 3]);
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});

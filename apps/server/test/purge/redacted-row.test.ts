import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  newUlid,
  redactedTicketCreatedPayload,
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
 * Spec §5.4 — "every reader of `ticket.created` payloads … must accept the
 * redacted shape and produce no ticket from it". Cases 19.092–19.096
 * (`test-cases/19-trash.md` §19.11).
 *
 * The redacted row X is PLANTED with `insertEvent` (the trigger guards UPDATE
 * and DELETE, never INSERT), plus its entity-head row, so the live tables hold
 * exactly what a rebuild derives. Each case then applies X through ONE
 * projection, so a missing skip reddens its own case rather than the whole file.
 * 19.096 runs `verifyProjections` over the whole database, so it goes last.
 */

let db: TestDatabase;
let base: Base;
const P = newUlid();
const Y1 = newUlid();
const X = newUlid();
const Y2 = newUlid();
let redacted: LedgerEvent;

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

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  base = await seedWorkspace(db.pool);
  await applyCommitted(db.pool, [projectCreated(base, P, 'Redaction', 'RD'), ticketCreated(base, Y1, P, 'Before')]);
  redacted = makeCommitted({
    workspaceId: base.WS,
    entity: { kind: 'ticket', id: X },
    type: 'ticket.created',
    payload: redactedTicketCreatedPayload(P),
    actorId: base.OWNER,
  });
  await plant(redacted);
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

describe('19.092 proj_tickets produces no ticket from a redacted creation', () => {
  it('writes no row for X; Y1 has its row', async () => {
    await applyOne(ticketsProjection, redacted);
    expect(await count('proj_tickets', 'ticket_id', X)).toBe(0);
    expect(await count('proj_tickets', 'ticket_id', Y1)).toBe(1);
  });
});

describe('19.093 proj_visibility produces no row from a redacted creation', () => {
  it('writes no row for X; Y1 has its row', async () => {
    await applyOne(projVisibility, redacted);
    expect(await count('proj_visibility', 'ticket_id', X)).toBe(0);
    expect(await count('proj_visibility', 'ticket_id', Y1)).toBe(1);
  });
});

describe('19.094 proj_search produces no row from a redacted creation', () => {
  it('writes no row for X; Y1 is indexed under its title', async () => {
    await applyOne(searchProjection, redacted);
    expect(await count('proj_search', 'ticket_id', X)).toBe(0);
    const { rows } = await db.pool.query<{ title: string }>('SELECT title FROM proj_search WHERE ticket_id = $1', [Y1]);
    expect(rows[0]?.title).toBe('Before');
  });
});

describe('19.095 the snapshot fold produces no head for a redacted ticket', () => {
  it('folds X to null and Y1 to its state', async () => {
    const client = await db.pool.connect();
    try {
      const deps = await buildLedgerDeps(client, base.WS);
      expect(await foldTicketHead(client, X, deps)).toBeNull();
      const y1 = await foldTicketHead(client, Y1, deps);
      expect(y1?.state.fields['title']?.value).toBe('Before');
    } finally {
      client.release();
    }
  });
});

describe('19.096 a redacted creation keeps its key slot, and the ledger still verifies', () => {
  it('numbers Y1 = 1 and Y2 = 3, and verifyProjections is clean', async () => {
    const numbers = await ticketNumbers(db.pool, base.WS, [Y1, Y2]);
    expect(numbers.get(Y1)).toBe(1); // CONTROL
    expect(numbers.get(Y2)).toBe(3);
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
  });
});

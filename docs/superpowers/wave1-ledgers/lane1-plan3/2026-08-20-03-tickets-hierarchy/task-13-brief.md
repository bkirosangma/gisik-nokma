### Task 13: GET /v1/tickets/:id/history — the read model IS the ledger, filtered

**Files:**
- Create: `apps/server/src/routes/ticket-history.ts`
- Test: `apps/server/test/ticket-history.test.ts`
- Modify: `apps/server/src/server.ts` (register the route)

**Interfaces:**
- Consumes: `buildServer({ db })` (Plan 1); the `events` ledger table (Plan 1, columns per Coordination); `proj_tickets` (Task 10, existence check only).
- Produces:
  - `GET /v1/tickets/:id/history?afterSeq=<n>&limit=<n>` → `200 { ticketId, events: TicketHistoryEvent[] }` | `400` | `404`
  - `type TicketHistoryEvent = { id: string; type: string; version: number; payload: unknown; actorId: string; origin: string; clientTime: string; serverTime: string; seq: number }`
  - `ticketHistoryRoutes(app: FastifyInstance, opts: { db: Pool })` (Fastify plugin function)

**Spec §3:** clients read projections, never raw ledger — "except the history view, which *is* the ledger, filtered." This route is that exception: no re-shaping, no summarising, both clocks returned, ordered by `seq`. Auth/visibility enforcement wraps this route in the auth plan — this task ships the route and serialization only. Errors stay generic (workspace security standard: no internals in responses).

**On the two clocks (owner decision 2026-08-20, "time is Asia/Kolkata"):** `client_time` and `server_time` are both `timestamptz`, so the driver returns `Date` and this route emits ISO 8601 `Z` — the same normalization Plan 1's `rowToEnvelope` performs. The consequence to hold onto: a claim submitted as `2026-08-20T14:30:00+05:30` comes back as `2026-08-20T09:00:00.000Z`. That is not lossy about *when* — it is the same instant — and the pair of facts the spec cares about (the claimed instant beside the received instant) is untouched. No test in this plan asserts a verbatim offset on readback; asserting one would pin a storage format the product deliberately gave up.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/test/ticket-history.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { EventEnvelope } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { applyEvent } from '../src/projections/index';
import { buildServer } from '../src/server';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';

const db: Pool = await testPool();
const app = await buildServer({ db });
beforeEach(async () => wipe(db));
afterAll(async () => { await app.close(); await db.end(); });

/**
 * Tests write the ledger directly — ingest owns this in production.
 *
 * Both time columns are `timestamptz` (Plan 1 Task 6, owner decision
 * 2026-08-20), so the fixture hands pg an INSTANT — a `Date` — not a text
 * time. Passing the ISO string would work by implicit cast, which is exactly
 * the habit the text-column era left behind and the reason a fixture could
 * quietly disagree with the column it writes.
 */
async function ledgerInsert(env: EventEnvelope): Promise<void> {
  await db.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload,
                         actor_id, origin, client_time, server_time, seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [env.id, env.workspaceId, env.entity.kind, env.entity.id, env.type, env.version,
     JSON.stringify(env.payload), env.actorId, env.origin,
     new Date(env.clientTime), new Date(env.serverTime), env.seq],
  );
  await applyEvent(db, env);
}

async function seedTicket(): Promise<EventEnvelope[]> {
  const wf = makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
    payload: { id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: '*', to: 'done', rules: [] }, { from: '*', to: 'todo', rules: [] }] } });
  const type = makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: 'task' }, workspaceId: WS,
    payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] } });
  const events = [
    makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 1,
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'File GST' } }),
    makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 2,
      payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } }, actorId: 'user-anselma' }),
    makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 3,
      payload: { toStateId: 'done' } }),
  ];
  await applyEvent(db, wf);
  await applyEvent(db, type);
  for (const env of events) await ledgerInsert(env);
  return events;
}

describe('GET /v1/tickets/:id/history', () => {
  it('returns the ticket ledger, filtered and seq-ordered, with both clocks and the actor on every event', async () => {
    const events = await seedTicket();
    const res = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ticketId: string; events: Array<Record<string, unknown>> };
    expect(body.ticketId).toBe(TICKET);
    expect(body.events.map((e) => e.type)).toEqual(['ticket.created', 'ticket.field_set', 'ticket.transitioned']);
    expect(body.events[1]).toMatchObject({
      id: events[1].id, version: 1, actorId: 'user-anselma', origin: 'server',
      payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } }, seq: 2,
    });
    expect(typeof body.events[1].clientTime).toBe('string');
    expect(typeof body.events[1].serverTime).toBe('string');
  });

  it('a +05:30 claim reads back as the equivalent Z instant — the label was never the fact', async () => {
    await seedTicket();
    // 2026-08-20T14:30:00+05:30 IS 2026-08-20T09:00:00Z. Since Plan 1 stores
    // both clocks as timestamptz (owner decision 2026-08-20), the offset the
    // device typed is not retained; the moment it named is. Assert the Z form
    // — asserting the verbatim '+05:30' string here would be asserting a
    // storage format the product deliberately gave up.
    const claim = makeEnvelope({
      type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, seq: 4,
      payload: { fieldId: 'startDate', value: { date: '2026-09-01' } }, actorId: 'user-anselma',
      clientTime: '2026-08-20T14:30:00.000+05:30',
      serverTime: '2026-08-20T14:30:01.000+05:30',
    });
    await ledgerInsert(claim);

    const res = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history?afterSeq=3` });
    const body = res.json() as { events: Array<{ clientTime: string; serverTime: string }> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0].clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(body.events[0].serverTime).toBe('2026-08-20T09:00:01.000Z');
    // …and the two clocks are still two separate facts, one second apart.
    expect(Date.parse(body.events[0].serverTime) - Date.parse(body.events[0].clientTime)).toBe(1000);
  });

  it('pages with afterSeq and limit', async () => {
    await seedTicket();
    const res = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history?afterSeq=1&limit=1` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ seq: number }> };
    expect(body.events.map((e) => e.seq)).toEqual([2]);
  });

  it('404 for a ticket that does not exist, 400 for junk paging params — both with generic bodies', async () => {
    await seedTicket();
    const missing = await app.inject({ method: 'GET', url: '/v1/tickets/01J9GGHT000000000000000000/history' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'ticket not found' });
    const junk = await app.inject({ method: 'GET', url: `/v1/tickets/${TICKET}/history?afterSeq=banana` });
    expect(junk.statusCode).toBe(400);
    expect(junk.json()).toEqual({ error: 'afterSeq and limit must be non-negative integers' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/ticket-history.test.ts`
Expected: FAIL — cannot find module `../src/routes/ticket-history` (via `buildServer` once registered) or 404-for-every-route before registration.

- [ ] **Step 3: Implement the route**

```ts
// apps/server/src/routes/ticket-history.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export type TicketHistoryEvent = {
  id: string;
  type: string;
  version: number;
  payload: unknown;
  actorId: string;
  origin: string;
  clientTime: string;
  serverTime: string;
  seq: number;
};

/** The stored row: both clocks are `timestamptz`, so pg yields `Date`. */
type EventRow = {
  id: string;
  type: string;
  version: number;
  payload: unknown;
  actor_id: string;
  origin: string;
  client_time: Date;
  server_time: Date;
  seq: string | number;
};

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

function parseNonNegativeInt(raw: unknown, fallback: number): number | null {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Spec §3: clients read projections, never raw ledger — except the history
 * view, which IS the ledger, filtered. No re-shaping, no summarising: the
 * actor, both clocks, and the payload return exactly as claimed.
 * Auth/visibility enforcement wraps this route in the auth plan.
 */
export async function ticketHistoryRoutes(app: FastifyInstance, opts: { db: Pool }): Promise<void> {
  app.get('/v1/tickets/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { afterSeq?: string; limit?: string };

    const afterSeq = parseNonNegativeInt(query.afterSeq, 0);
    const limitRaw = parseNonNegativeInt(query.limit, DEFAULT_LIMIT);
    if (afterSeq === null || limitRaw === null || limitRaw === 0) {
      return reply.code(400).send({ error: 'afterSeq and limit must be non-negative integers' });
    }
    const limit = Math.min(limitRaw, MAX_LIMIT);

    const exists = await opts.db.query('SELECT 1 FROM proj_tickets WHERE ticket_id = $1', [id]);
    if (exists.rowCount === 0) {
      return reply.code(404).send({ error: 'ticket not found' });
    }

    const res = await opts.db.query(
      `SELECT id, type, version, payload, actor_id, origin, client_time, server_time, seq
       FROM events
       WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq > $2
       ORDER BY seq ASC
       LIMIT $3`,
      [id, afterSeq, limit],
    );

    // Both time columns are timestamptz, so pg hands them back as Date. Emit
    // ISO 8601 Z, exactly as Plan 1's `rowToEnvelope` does — one normalization
    // rule for the whole product, so a claim made at +05:30 and the same claim
    // made at Z are indistinguishable on the wire, because they were the same
    // moment. (`String(row.client_time)` would print a locale string here; the
    // conversion is `.toISOString()`, never a cast and never a stringify.)
    const events: TicketHistoryEvent[] = (res.rows as EventRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      version: row.version,
      payload: row.payload,
      actorId: row.actor_id,
      origin: row.origin,
      clientTime: row.client_time.toISOString(),
      serverTime: row.server_time.toISOString(),
      seq: Number(row.seq),
    }));

    return { ticketId: id, events };
  });
}
```

Register it in `apps/server/src/server.ts`, alongside the existing route registrations in `buildServer`:

```ts
import { ticketHistoryRoutes } from './routes/ticket-history';

  await app.register(ticketHistoryRoutes, { db });
```

- [ ] **Step 4: Run the test to verify it passes, then the full server suite**

Run: `pnpm --filter server exec vitest run test/ticket-history.test.ts`
Expected: PASS (4 tests) — including the `+05:30` → `Z` round trip.
Run: `pnpm --filter server exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/ticket-history.ts apps/server/src/server.ts apps/server/test/ticket-history.test.ts
git commit -m "Ticket history is the ledger filtered, not a summary: every claim returns with its actor and both clocks, paged by sequence, and a missing ticket is a plain 404 that explains nothing it should not"
```


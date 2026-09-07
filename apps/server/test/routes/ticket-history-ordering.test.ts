import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { seedMember, seedTicket } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 3 Chain B Task 13 — the ONE case that can falsify `ORDER BY seq ASC`.
 *
 * ## Why it needs its own database, and why the ordinary file cannot do this
 *
 * `ticket-history.test.ts` stores its claims out of order and asserts the
 * response comes back in seq order. **That case survives deleting the
 * `ORDER BY`**, and the reason was measured rather than guessed:
 * `EXPLAIN (ANALYZE)` on the route's own query shows
 *
 *     Index Scan using events_entity_seq_unique on events
 *       Index Cond: entity_kind = 'ticket' AND entity_id = $1 AND seq > $2
 *
 * and `events_entity_seq_unique` is `(entity_kind, entity_id, seq)`, so the
 * scan emits rows in seq order whether the query asks for it or not. The heap
 * really is out of order — the same measurement read `ctid` beside `seq` and
 * got `(0,1)=4, (0,2)=3, (0,3)=2, (0,4)=1` — but no caller can see that while
 * the planner keeps choosing the index. An ordering assertion under that plan
 * is a check that passes for a reason unrelated to the property it names.
 *
 * So this file takes the index away. `enable_indexscan`, `enable_indexonlyscan`
 * and `enable_bitmapscan` are turned off **on the database**, before the app
 * pool opens its first connection (an `ALTER DATABASE ... SET` reaches new
 * sessions only, which is why it runs on a separate admin client here and why
 * `db.pool` is not touched until after it). Every plan in this file is then a
 * sequential scan, and a sequential scan emits HEAP order — the order the rows
 * were stored in, which this fixture deliberately made backwards.
 *
 * ## The instrument validates itself, and that is not optional
 *
 * If the settings failed to apply, every assertion below would pass for the old
 * reason and this file would be decoration. So the case FIRST asks the database
 * the route's query WITHOUT an `ORDER BY` and asserts the rows come back
 * **descending** — proof that the plan really is order-destroying — and only
 * then asserts the route answers ascending. A green run therefore means the
 * ordering came from the route, and deleting `ORDER BY seq ASC` reddens the
 * second half while the first half stays green.
 *
 * ## What it does NOT claim
 *
 * Not that the product runs without indexes. The `ORDER BY` is what makes the
 * route's contract independent of whatever plan the planner picks at whatever
 * table size — this file is how that independence is observed, not how the
 * server is deployed.
 */

let db: TestDatabase;
let app: FastifyInstance;
let headers: { authorization: string };
let ticketId: string;
let ws: string;
/**
 * The three claims this file stores BACKWARDS, minted in `beforeAll` so neither
 * case depends on the other having run. `tickets-read.test.ts` states the rule:
 * an assertion that breaks the day someone inserts a test above it breaks for a
 * reason unrelated to what it names, and the paging case below reads seq 2 and
 * 3, which only the appends produce.
 */
let stored: { second: LedgerEvent; third: LedgerEvent; fourth: LedgerEvent };

/** The three settings, applied to the database so every NEW session inherits them. */
const NO_INDEX_PLANS = ['enable_indexscan', 'enable_indexonlyscan', 'enable_bitmapscan'] as const;

beforeAll(async () => {
  db = await createTestDatabase();

  // Before `db.pool` is used for anything: `ALTER DATABASE ... SET` reaches
  // sessions opened after it, and a pooled connection already established would
  // keep the old settings for the life of the file.
  const name = db.url.slice(db.url.lastIndexOf('/') + 1);
  const admin = new pg.Client({ connectionString: db.url });
  await admin.connect();
  for (const setting of NO_INDEX_PLANS) {
    await admin.query(`ALTER DATABASE ${name} SET ${setting} = off`);
  }
  await admin.end();

  const built = buildTestApp(db);
  app = built.app;
  await app.ready();

  const user = await signInWithPhone(app, built.otp, '+919000099999');
  headers = { authorization: `Bearer ${user.token}` };
  ws = newUlid();
  const prj = newUlid();
  await seedMember(db.pool, ws, user.userId, 'member', [{ projectId: prj }]);
  ticketId = newUlid();
  await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });

  // BUILT 2, 3, 4 (`testEnvelope` mints seq in build order); STORED 4, 3, 2.
  const claim = (to: string): LedgerEvent =>
    testEnvelope({
      workspaceId: ws,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned',
      payload: { to },
      actorId: newUlid(),
    });
  stored = { second: claim('doing'), third: claim('review'), fourth: claim('done') };
  for (const env of [stored.fourth, stored.third, stored.second]) {
    await appendTestEvent(db.pool, env);
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

/**
 * 5.75 — the route's ORDER BY seq is falsified against the query planner (not a naive out-of-order fixture): index/bitmap/index-only scans are disabled on the test database so a sequential scan exposes true out-of-heap-order rows, and deleting the route's ORDER BY reddens exactly the two cases here.
 */
describe('GET /v1/tickets/:id/history — the ordering is the route decision, not the plan', () => {
  it('answers seq-ascending under a plan that emits rows newest-stored-first', async () => {
    const { second, third, fourth } = stored;
    // The fixture is only backwards if these really are 2, 3, 4 — a build order
    // that drifted would leave the heap accidentally sorted and the control
    // below would be the thing that caught it.
    expect([second.seq, third.seq, fourth.seq]).toEqual([2, 3, 4]);

    // THE INSTRUMENT'S OWN CONTROL. The route's exact WHERE, without the
    // ORDER BY. If the settings did not take, this comes back ascending and the
    // whole file is decoration — so it is asserted to be DESCENDING before
    // anything is concluded from the route's answer below.
    const unordered = await db.pool.query<{ seq: number }>(
      `SELECT seq FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq > $2 LIMIT $3`,
      [ticketId, 0, 200],
    );
    // Heap order is `1, 4, 3, 2`: `seedTicket` appended the `ticket.created`
    // first, then `beforeAll` stored 4, 3, 2. That is not ascending, which is the
    // whole requirement on this control — it is asserted EXACTLY rather than as
    // "not sorted", so a settings change that restored index order reddens here
    // and names what it got.
    expect(unordered.rows.map((r) => r.seq)).toEqual([1, 4, 3, 2]);

    // And the route, over the very same rows and the very same plan.
    const res = await app.inject({ method: 'GET', url: `/v1/tickets/${ticketId}/history`, headers });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ seq: number; id: string }> };
    expect(body.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(body.events.slice(1).map((e) => e.id)).toEqual([second.id, third.id, fourth.id]);
  });

  it('pages from the front of the seq order, not from the front of the heap', async () => {
    // `afterSeq`/`limit` are a cursor over the SEQ order. Under a heap-order
    // plan, a LIMIT applied before the sort would take the newest-stored rows
    // instead — so this is the case that would catch an ORDER BY moved below
    // the LIMIT, or a limit applied in JavaScript after the query.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tickets/${ticketId}/history?limit=2`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { events: Array<{ seq: number }> }).events.map((e) => e.seq)).toEqual([
      1, 2,
    ]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope, newUlid, SYSTEM_ACTOR_FLOW } from '@gisik-nokma/domain';
import { checkPurged, PURGE_RULE } from '../../src/purge/check-purged.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * wtg2 T8 (case 29.208): a flow cause names the ticket that led here (`led-to` sourceTicketId) or the Decision whose
 * outcome moved it (`decisionTicketId`); the door refuses the flow's move when that ticket was erased, as it refuses a
 * link to one (27.025). The erased ids are seeded straight into `purged_entities`, the precedent of `sweep.test.ts`
 * 19.151: this case is about the door's `payloadIds`, not about how a purge fills the registry.
 */

let db: TestDatabase;
const WS = newUlid();
const [A, ERASED_DECISION, ERASED_SOURCE, LIVE] = [newUlid(), newUlid(), newUlid(), newUlid()];
const PERSON = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  for (const id of [ERASED_DECISION, ERASED_SOURCE]) {
    await db.pool.query(
      `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at) VALUES ('ticket', $1, $2, now())`,
      [id, WS],
    );
  }
}, 60_000);
afterAll(async () => {
  await db.drop();
});

const env = (type: 'ticket.transitioned' | 'ticket.closed' | 'ticket.reopened', payload: unknown) =>
  makeEnvelope({ workspaceId: WS, entity: { kind: 'ticket', id: A }, type, payload, actorId: SYSTEM_ACTOR_FLOW });
const decisionCause = (kind: 'branch-not-taken' | 'reopened-by-flow', decisionTicketId: string) =>
  ({ kind, decisionTicketId, outcome: 'No', pass: 1, decidedBy: PERSON, decisionEventId: newUlid() });
const ledTo = (sourceTicketId: string) => ({ kind: 'led-to', sourceTicketId, triggeredBy: PERSON });
const refused = { refused: true, rule: PURGE_RULE };

describe('29.208 the purge door reads a flow cause', () => {
  it('29.208 a close, reopen or transition whose cause names an erased Decision or source is refused; control: the same event naming a live ticket passes', async () => {
    // The close (a branch not taken) and the reopen (a loop reset) name the Decision.
    expect(await checkPurged(db.pool, env('ticket.closed', { cause: decisionCause('branch-not-taken', ERASED_DECISION) }))).toMatchObject(refused);
    expect(await checkPurged(db.pool, env('ticket.closed', { cause: decisionCause('branch-not-taken', LIVE) }))).toBeNull();
    expect(await checkPurged(db.pool, env('ticket.reopened', { cause: decisionCause('reopened-by-flow', ERASED_DECISION) }))).toMatchObject(refused);
    expect(await checkPurged(db.pool, env('ticket.reopened', { cause: decisionCause('reopened-by-flow', LIVE) }))).toBeNull();
    // The transition: a led-to names its source, a reset names its Decision.
    expect(await checkPurged(db.pool, env('ticket.transitioned', { to: 'todo', cause: ledTo(ERASED_SOURCE) }))).toMatchObject(refused);
    expect(await checkPurged(db.pool, env('ticket.transitioned', { to: 'todo', cause: ledTo(LIVE) }))).toBeNull();
    expect(await checkPurged(db.pool, env('ticket.transitioned', { to: 'todo', cause: decisionCause('reopened-by-flow', ERASED_DECISION) }))).toMatchObject(refused);
    // A raw `cause: null` names nothing and must not throw: the door reads the payload BEFORE the engine's schema parse
    // (ingest-service.ts checkPurged, ahead of the permission gate), and the engine then refuses it as malformed. Each type.
    for (const type of ['ticket.transitioned', 'ticket.closed', 'ticket.reopened'] as const) {
      expect(await checkPurged(db.pool, env(type, type === 'ticket.transitioned' ? { to: 'todo', cause: null } : { cause: null })), type).toBeNull();
    }
    // Control: an uncaused move of the same ticket names nothing erased.
    expect(await checkPurged(db.pool, env('ticket.transitioned', { to: 'todo' }))).toBeNull();
  });
});

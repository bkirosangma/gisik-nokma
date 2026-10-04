import { afterAll, beforeAll, expect, it } from 'vitest';
import { runNotificationSweep } from '../../src/notifications/sweep.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedDraftWorld, withDraftsOpened, type DraftWorld } from '../helpers/draft-world.js';
import { buildReadTestApp, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';

/**
 * Drafts T3 (spec §4.2 group B): the date-approaching and stale sweeps never name a draft (28.064). The
 * visibility gate is stubbed to allow everything, so only the SQL predicate (`LIVE_TICKET_WHERE`) closes it.
 */

let db: TestDatabase;
let read: ReadWorld;
let world: DraftWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  world = await seedDraftWorld(db.pool, read);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

/** `canSeeTicket` is stubbed to allow everything, so ONLY the SQL predicate can keep a draft out. */
const sweep = () =>
  runNotificationSweep({
    pool: db.pool, transports: [createInAppTransport(db.pool)],
    canSeeTicket: async () => true, now: () => SCENARIO_NOW, log: () => undefined,
  });

it('28.064 the due-soon and stale candidates never include a draft; control: cleared, exactly the planted drafts join', async () => {
  const closed = await sweep();
  expect(closed.dueCandidates).toBeGreaterThanOrEqual(2);   // the scenario's task and the twin: the sweep is live
  expect(closed.staleCandidates).toBeGreaterThanOrEqual(2);
  const opened = await withDraftsOpened(db.pool, world.draftIds, sweep);
  expect(opened.dueCandidates - closed.dueCandidates).toBe(1);   // draftActive is the only draft with a due date
  expect(opened.staleCandidates - closed.staleCandidates).toBe(2); // draftActive and the root draft sit in `doing` since STALE_SINCE
});

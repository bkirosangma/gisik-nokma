import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildPendingOverlay } from '../src/precheck/local-context.js';
import { createReplica } from '../src/replica/replica.js';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { LOCAL_SCHEMA_VERSION } from '../src/storage/schema.js';
import { apply, bootstrap, claim, envelope, freshReplica, queue, ticketCreated, TIME, WF, WS } from './purge-world.js';

/**
 * Cases 29.354 and 29.360 (wtg2 T9, ES-4). The replica's two seams for work periods: a PENDING claim has no server
 * clock, so its fold keeps the confirmed periods (`keepConfirmedPeriods` in `buildPendingOverlay`); and a replica that
 * held tickets before periods existed (local schema 4) owes a pull for each of them when it opens at schema 5, because
 * its stored snapshots predate the fold and `migrateLocal` has no ALTER path.
 *
 * `purge-world.ts`'s workflow has no ACTIVE state, so 29.354 boots its own copy of that world with one (`doing`).
 */

/** `purge-world`'s bootstrap with an active `doing` between To do and Done (same workflow and type ids). */
async function replicaWithDoing() {
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const base = bootstrap();
  const workflow = envelope(
    { kind: 'workflow', id: WF },
    'workflow.defined',
    {
      id: WF,
      version: 1,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: ['todo', 'doing', 'done'].map((to) => ({ from: '*', to, rules: [] })),
    },
    { seq: 1 },
  );
  await replica.loadBootstrap({ ...base, definitions: [workflow, ...base.definitions.slice(1)] });
  return { storage, replica };
}

describe('29.354 pending periods', () => {
  it('29.354 a pending event leaves periods unchanged; the accepted one records them', async () => {
    const { storage, replica } = await replicaWithDoing();
    const A = newUlid();
    await apply(replica, [ticketCreated(A), envelope({ kind: 'ticket', id: A }, 'ticket.transitioned', { to: 'doing' })]);
    // Precondition: a CONFIRMED open period, so "unchanged" is a value, not an absence (an absent key would also pass a
    // keepConfirmedPeriods that wiped the periods).
    expect((await replica.getTicket(A))!.confirmed!.periods).toEqual([{ start: TIME, end: null, pass: 1 }]);
    await queue(storage, claim({ kind: 'ticket', id: A }, 'ticket.transitioned', { to: 'done' }));
    const pending = (await buildPendingOverlay({ storage, replica })).states.get(A)!;
    expect(pending.stateId).toBe('done'); // the claim WAS folded
    expect(pending.periods).toEqual([{ start: TIME, end: null, pass: 1 }]); // not closed at the device clock
    await apply(replica, [envelope({ kind: 'ticket', id: A }, 'ticket.transitioned', { to: 'done' })]); // control
    expect((await replica.getTicket(A))!.confirmed!.periods).toEqual([{ start: TIME, end: TIME, pass: 1 }]);
  });
});

describe('29.360 schema 5 re-pull', () => {
  it('29.360 schema 5 owes a pull per held ticket; a fresh replica owes none', async () => {
    expect(LOCAL_SCHEMA_VERSION).toBe(5);
    const { storage, replica } = await freshReplica();
    const A = newUlid();
    const B = newUlid();
    await apply(replica, [ticketCreated(A), ticketCreated(B)]);
    expect(await replica.listPendingPulls(WS)).toEqual([]);
    await storage.run("UPDATE meta SET value = '4' WHERE key = 'schema_version'", []);
    const reopened = await createReplica({ storage });
    expect((await reopened.listPendingPulls(WS)).map((t) => t.id).sort()).toEqual([A, B].sort());
    for (const id of [A, B]) await reopened.clearPendingPull(WS, id);
    expect(await (await createReplica({ storage })).listPendingPulls(WS)).toEqual([]); // control
    const held = (await reopened.getTicket(A))!.confirmed!;
    await reopened.loadTicketBootstrap({
      workspaceId: WS,
      definitions: [],
      ticket: { ticketId: A, snapshot: { seq: 1, state: { ...held, periods: [{ start: TIME, end: null, pass: 1 }] }, provenance: null }, events: [] },
    });
    expect((await reopened.getTicket(A))!.confirmed!.periods).toEqual([{ start: TIME, end: null, pass: 1 }]);
  });
});

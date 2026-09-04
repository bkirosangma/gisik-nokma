import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type LedgerEvent, type TicketState } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';

/**
 * Plan 10 Task 9 — two RECORDED hazards on the replica, pinned as executable
 * cases. Cases 12.154–12.155.
 *
 * ## Why these are cases at all
 *
 * Both assert behaviour nobody wants. They exist because the whole-branch
 * review refuted the prose that had been standing in for them: `replica.ts`
 * defended one hazard with the sentence "unreachable today, because nothing
 * calls `loadBootstrap` a second time", and case 12.149 — added in the SAME
 * change set — calls `loadBootstrap` a second time on an already-bootstrapped
 * replica. A hazard defended by a claim about the whole tree is re-derived by
 * nothing; a failing input written down as a case is re-derived on every run.
 *
 * Neither is a specification of desired behaviour. Each names its owner, and
 * whoever fixes it should DELETE the case rather than "make it pass".
 *
 * ## Why they are in their own file rather than in `replica.test.ts`
 *
 * `replica.test.ts` carries nineteen mutation enumerations, and every one of
 * them is a FILE-SCOPED measurement — "red here and on 12.137
 * (`Tests 2 failed | 18 passed (20)`)" is a fact about a run of
 * `vitest run test/replica.test.ts`. Appending two cases to that file would
 * silently change what all nineteen measured, and would have falsified AT LEAST
 * ONE outright. TWO of the nineteen were run against the merged pair and the
 * other seventeen were not, so this sentence claims nothing about them:
 * 12.128's mutation ("keep the definitions" on a workspace revocation) reddens
 * 12.155 too — measured, `Tests 2 failed | 20 passed (22)` over the two files —
 * so its "red here alone" would stop being true the moment the files merged,
 * while 12.129's ("ignore `projectId`") does not. This docblock claimed both,
 * then claimed exactly one; both were counts standing on a sample of two.
 * Keeping the recorded-hazard
 * cases separate is not a way of preserving a number — it is what makes the
 * category difference operational: these two are DELETED when their owner fixes
 * them, while `replica.test.ts` holds the task's contract.
 *
 * The consequence is stated so it can be checked: this file adds two executions
 * to the package, whose own run therefore reads `Tests 47 passed (47)` rather
 * than 45. Per-file, `vitest run test/recorded-hazards.test.ts` reads
 * `Tests 2 passed (2)`.
 *
 * Fixtures are duplicated here rather than shared, following this package's own
 * convention — `replica.test.ts`, `outbox.test.ts` and `precheck.test.ts` each
 * build their own ULIDs, workflow definitions and `bootstrapOf`.
 */

const WS = newUlid();
const PROJECT = newUlid();
const TICKET = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const stateOf = (id: string, name: string, category: string) => ({ id, name, category });

const wfV1 = {
  id: WF,
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [stateOf('todo', 'To do', 'open'), stateOf('doing', 'Doing', 'active'), stateOf('done', 'Done', 'terminal')],
  transitions: [
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

/** v2 drops 'doing' entirely; the mandatory stateMapping says where its tickets go. */
const wfV2Dropped = {
  ...wfV1,
  version: 2,
  states: [stateOf('todo', 'To do', 'open'), stateOf('done', 'Done', 'terminal')],
  transitions: [
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
  stateMapping: { doing: 'todo' },
};

const ticketTypeDef = { id: TYPE, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

/** Server-shaped: the per-entity `seq` AND the never-reset workspace stream position. */
function envelope(
  entity: { kind: 'ticket' | 'workflow' | 'ticket-type'; id: string },
  type: string,
  payload: unknown,
  opts: { seq?: number } = {},
): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: SERVER_TIME,
    seq: opts.seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

const workflowDefined = (def: unknown, seq: number): LedgerEvent =>
  envelope({ kind: 'workflow', id: WF }, 'workflow.defined', def, { seq });

const typeDefined = (seq = 1): LedgerEvent =>
  envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', ticketTypeDef, { seq });

const created = (ticketId: string, seq?: number): LedgerEvent =>
  envelope(
    { kind: 'ticket', id: ticketId },
    'ticket.created',
    { typeId: TYPE, projectId: PROJECT, parentId: null, title: 'In flight' },
    { seq },
  );

const transitioned = (ticketId: string, to: string, seq?: number): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'ticket.transitioned', { to }, { seq });

function bootstrapOf(overrides: Partial<BootstrapResponse> = {}): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [workflowDefined(wfV1, 1), typeDefined(1)],
    tickets: [],
    ...overrides,
  };
}

async function seededReplica(storage: SyncStorage): Promise<Replica> {
  seqCounter = 0;
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());
  seqCounter = 0;
  return replica;
}

describe('12.154–12.155 recorded hazards on the replica, pinned as executable cases', () => {
  /**
   * 12.154 — THE BOOTSTRAP DOOR CAN LOWER A BASELINE THE STREAM DOOR RAISED.
   *
   * `loadBootstrap`'s `writeSnapshot` is an unconditional
   * `ON CONFLICT … DO UPDATE SET seq = excluded.seq` with no `Math.max` against
   * the standing local baseline, so a response carrying an older snapshot moves
   * the replay baseline BACKWARDS — the exact failure 12.131 exists to prevent
   * on the other door.
   *
   * THE OLD EXCUSE WAS FALSE, WHICH IS WHY THIS CASE EXISTS. `replica.ts` and
   * `test-cases/12` both said the overwrite was "unreachable today, because
   * nothing calls `loadBootstrap` a second time"; 12.149, in the same change
   * set, calls `loadBootstrap` a second time on an already-bootstrapped replica
   * and its own docblock calls that sequence "a live sequence, not a
   * contrivance".
   *
   * AND IT IS A DIFFERENT HAZARD FROM THE ONE `foldSnapshotForward` ALREADY
   * RECORDS TWO PARAGRAPHS EARLIER. That one needs the throwing
   * `ticket.transitioned` in the RESPONSE's tail (`ticket.events`), and it is
   * Task 6's, because only a server-written snapshot above the event can repair
   * it. Here `events` is `[]` on BOTH bootstraps — written out below, since that
   * emptiness is the whole distinction — and the throwing row is a LOCALLY
   * STORED event the stream-door fold had already moved past. Only the baseline
   * drop puts it back in front of the reducer, so this hazard belongs to the
   * bootstrap door's own baseline arithmetic.
   *
   * ## The obvious guard is WORSE than the throw, and that is measured
   *
   * `Math.max(ticket.snapshot.seq, await snapshotSeqOf(tx, ticket.ticketId))` —
   * the guard `foldTicketsOntoVersion` already applies on the stream door — was
   * tried on this exact input. It removes the throw and leaves all nineteen
   * cases in `replica.test.ts` green — twenty executions, since 12.132 runs
   * twice — and it writes the SERVER's seq-5 state under the
   * LOCAL seq-6 baseline: `refoldTicket` then replays nothing above 6, and the
   * seq-6 transition is silently dropped from the log while its row still stands
   * in `events`. Measured under the guard, `transitions` came back as
   * `[{toStateId:'todo', seq:5}]` alone, where the stream-door fold had left
   * both entries. A loud throw became a quiet divergence in the very log
   * `require-different-user` sorts on, with no case anywhere to catch it. The
   * consistent repair is the other shape — keep the higher local baseline, do
   * not write the older snapshot at all, and fold the LOCAL state forward — and
   * that is a decision about what a re-bootstrap MEANS, not a guard.
   *
   * *Owner: Plan 10 Task 11 (the sync engine), the first PRODUCTION caller that
   * will re-bootstrap a live replica — 12.149 already re-bootstraps one in a
   * test, which is why the old "nothing calls it twice" defence is gone.*
   */
  it('12.154 a re-bootstrap LOWERS the replay baseline and the replay then throws — recorded, not fixed', async () => {
    const storage = createBetterSqliteStorage();
    seqCounter = 0;
    const replica = await createReplica({ storage });

    // The server's snapshot: seq 5, sitting in `todo` at v1. It is served
    // unchanged on BOTH bootstraps because nothing on the server invalidates a
    // snapshot when a workflow is published (`snapshot-writer.ts` has no
    // `workflowVersion` handling, `snapshot-store.ts` has no DELETE).
    const staleSnapshot = () => ({
      ticketId: TICKET,
      snapshot: {
        seq: 5,
        state: {
          kind: 'ticket' as const,
          id: TICKET,
          workspaceId: WS,
          projectId: PROJECT,
          typeId: TYPE,
          parentId: null,
          workflowId: WF,
          workflowVersion: 1,
          stateId: 'todo',
          stateCategory: 'open' as TicketState['stateCategory'],
          assigneeId: null,
          collaboratorIds: [],
          fields: {
            title: { value: 'Re-bootstrapped', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME },
          },
          transitions: [{ toStateId: 'todo', actorId: USER_A, seq: 5, workflowId: WF, workflowVersion: 1 }],
        },
      },
      // EMPTY ON PURPOSE, and this is the line that separates this hazard from
      // the tail hazard `foldSnapshotForward` records for Task 6: no response
      // tail is involved on either bootstrap.
      events: [] as LedgerEvent[],
    });

    await replica.loadBootstrap(
      bootstrapOf({ definitions: [workflowDefined(wfV1, 1), typeDefined(1)], tickets: [staleSnapshot()] }),
    );

    // The stream moves the ticket to `doing` at seq 6, then publishes a v2 that
    // DROPS `doing`. The stream door folds the ticket to `todo` and raises the
    // baseline to 6 — `MAX` against the standing one, which is 12.131's rule.
    await replica.applyServerItem(transitioned(TICKET, 'doing', 6));
    await replica.applyServerItem(workflowDefined(wfV2Dropped, 2));
    const raised = await storage.all("SELECT seq FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [
      TICKET,
    ]);
    expect(raised.map((r) => Number(r.seq))).toEqual([6]);
    expect((await replica.getTicket(TICKET))?.confirmed?.transitions).toEqual([
      { toStateId: 'todo', actorId: USER_A, seq: 5, workflowId: WF, workflowVersion: 1 },
      { toStateId: 'doing', actorId: USER_A, seq: 6, workflowId: WF, workflowVersion: 1 },
    ]);

    // The device re-bootstraps. The bootstrap door writes seq 5 over the
    // standing 6, and `refoldTicket` replays the seq-6 move into a state v2 no
    // longer has.
    await expect(
      replica.loadBootstrap(
        bootstrapOf({
          definitions: [workflowDefined(wfV1, 1), workflowDefined(wfV2Dropped, 2), typeDefined(1)],
          tickets: [staleSnapshot()],
        }),
      ),
    ).rejects.toThrow(`applyTicketEvent: workflow "${WF}" has no state "doing"`);

    // The throw is inside `loadBootstrap`'s transaction, so the WHOLE response
    // rolls back and the replica is unchanged — which is why the consequence is
    // not "one ticket is wrong": every re-bootstrap throws identically for as
    // long as the server keeps serving that snapshot and the offending event
    // stays stored locally. Printed, not counted: the baseline and ledger rows.
    const after = await storage.all("SELECT seq FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = ?", [
      TICKET,
    ]);
    expect(after.map((r) => Number(r.seq))).toEqual([6]);
    expect((await replica.listEntityEvents(TICKET)).map((env) => `${env.type}@${env.seq}`)).toEqual([
      'ticket.transitioned@6',
    ]);
    await storage.close();
  });

  /**
   * 12.155 — A REDUCER THROW ON THE STREAM DOOR TAKES THE WHOLE ARRIVAL DOWN,
   * WHERE THE PRE-CHECK DOOR CATCHES IT.
   *
   * `buildPendingOverlay` wraps `applyTicketEvent` in `try`/`catch` and says
   * why: `revokeScope` empties `workflows` and `ticket_types` while outbox rows
   * deliberately stay, so an unwrapped fold would make every `enqueue` after a
   * revocation throw on the device, offline, with no way back. 12.143 pins that,
   * and dropping the catch reddens 12.141 and 12.143. `refoldTicket` folds the
   * SAME reducer against the SAME `buildLocalDeps` object and has NO catch, and
   * nobody wrote the equivalent sentence for `applyServerItem`.
   *
   * THE ASYMMETRY IS THE FINDING; the throws below are the evidence. Both halves
   * are the same race — an item already in flight when the revocation was
   * applied — and a stream item is not ordered against a local delete.
   *
   * ## Why this is RECORDED rather than made to match the pre-check
   *
   * The two doors answer different questions, and the difference stops looking
   * like an oversight once it is named. `enqueue` is a USER's offline action and
   * must not brick the device, so an unfoldable claim is named `unfoldable` and
   * stays queued and flushable. `applyServerItem` is machine-driven and its
   * stated contract is per-arrival rollback (12.125): an arrival the replica
   * cannot fold is refused whole rather than half-applied. Catching here would
   * mean inventing what an unfoldable CONFIRMED ticket is and where it surfaces,
   * which is Plan 10 Task 11's design and not a fix round's.
   *
   * WHAT THE OWNER INHERITS, stated because "it throws" is not the whole cost:
   * the throw is inside `storage.transaction`, so the envelope insert rolls back
   * with it and the arrival is gone from the local ledger too — asserted below
   * against the exact row list from before the arrival. A sync engine that
   * leaves its cursor unadvanced on a throw is handed the same item again and
   * throws again: a wedged stream, offline, after a revocation.
   *
   * *Owner: Plan 10 Task 11 (the sync engine), the first caller of
   * `applyServerItem` that has a cursor to advance.*
   */
  it('12.155 a stream item that lands after a scope revocation throws out of applyServerItem — recorded, not fixed', async () => {
    // HALF ONE — project-scoped revocation, then an in-flight transition for the
    // ticket the revocation just deleted. The reducer is handed `undefined`.
    const scoped = createBetterSqliteStorage();
    const replica = await seededReplica(scoped);
    await replica.applyServerItem(created(TICKET, 1));
    const beforeIds = (await scoped.all('SELECT id, entity_id FROM events', [])).map((r) => r.entity_id as string);
    await replica.applyServerItem({ kind: 'scope-revoked', workspaceId: WS, projectId: PROJECT });
    const revokedIds = (await scoped.all('SELECT id, entity_id FROM events', [])).map((r) => r.entity_id as string);
    // Printed, not counted: the ticket's row is gone and the definitions stay.
    expect(beforeIds).toContain(TICKET);
    expect(revokedIds).not.toContain(TICKET);
    expect(revokedIds).toEqual([WF, TYPE]);

    await expect(replica.applyServerItem(transitioned(TICKET, 'doing', 2))).rejects.toThrow(
      `applyTicketEvent: ticket.transitioned for ticket ${TICKET} that was never created`,
    );
    // The insert rolled back with the fold: the arrival is not merely unfolded,
    // it is absent from the local ledger.
    expect((await scoped.all('SELECT id, entity_id FROM events', [])).map((r) => r.entity_id as string)).toEqual(
      revokedIds,
    );
    await scoped.close();

    // HALF TWO — a workspace-wide revocation empties `ticket_types` by design,
    // so an in-flight `ticket.created` cannot resolve its type. Different
    // message, same door, same rollback.
    const wide = createBetterSqliteStorage();
    const second = await seededReplica(wide);
    await second.applyServerItem({ kind: 'scope-revoked', workspaceId: WS });
    expect(await wide.all('SELECT * FROM ticket_types', [])).toEqual([]);
    // The definition EVENTS are deliberately still standing — 12.141's point,
    // and it is why the throw is about the emptied TABLE and not a missing
    // history.
    expect((await wide.all("SELECT id, entity_id FROM events", [])).map((r) => r.entity_id as string)).toEqual([
      WF,
      TYPE,
    ]);

    await expect(second.applyServerItem(created(TICKET, 1))).rejects.toThrow(
      `applyTicketEvent: unknown ticket type "${TYPE}"`,
    );
    expect((await wide.all("SELECT id, entity_id FROM events", [])).map((r) => r.entity_id as string)).toEqual([
      WF,
      TYPE,
    ]);
    await wide.close();

    // POSITIVE CONTROL from the same helpers and the same door: with no
    // revocation, both arrivals are ordinary `{applied: true}` answers, so the
    // two throws above are the revocation and not a malformed fixture.
    const control = createBetterSqliteStorage();
    const third = await seededReplica(control);
    expect(await third.applyServerItem(created(TICKET, 1))).toEqual({ applied: true });
    expect(await third.applyServerItem(transitioned(TICKET, 'doing', 2))).toEqual({ applied: true });
    expect((await third.getTicket(TICKET))?.confirmed?.stateId).toBe('doing');
    await control.close();
  });
});

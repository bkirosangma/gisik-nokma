import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type EventEnvelope, type LedgerEvent } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica, type TicketBootstrap } from '../src/replica/replica.js';

/**
 * Closure 5b(d)(i) — the PER-TICKET bootstrap door and the durable pending-pull
 * set. Cases 12.292–12.298.
 *
 * Ruling P37.1 makes the grant side pull-shaped: the hub sends a bounded notice
 * naming ids, and the client pulls each ticket it does not hold. This file
 * covers the client's half of that — the door that applies ONE ticket, and the
 * set that remembers what a failed pull still owes.
 *
 * ## The two properties that are not obvious, and why each has its own case
 *
 * **The cursor must not move (12.293).** `loadBootstrap` writes
 * `cursor:<workspaceId>` to the server's head unconditionally, which is right
 * for a whole-workspace cut and catastrophic for one ticket: a device at 40
 * pulling from a server at 900 would skip everything between for every OTHER
 * ticket, silently, and look exactly like convergence in a fixture quiet enough
 * to have no such events. The fixture is therefore deliberately NOT quiet — the
 * pulled ticket's own events sit far above the cursor, so the plausible wrong
 * implementation ("advance to the highest `workspaceSeq` I just applied") has
 * something to advance TO. A case whose fixture cannot express the bug it names
 * is the failure this series keeps paying for.
 *
 * **Definitions are load-bearing (12.297).** Over the live stream a definition
 * is class `'definition'` and reaches every client unconditionally, in
 * `workspaceSeq` order, ahead of anything depending on it — so the push path
 * never needs to think about it. A separate HTTP pull has no such ordering, and
 * handed an empty `definitions` the fold does not fail where you would look for
 * it: `foldSnapshotForward` silently returns the state unchanged and the throw
 * arrives one step later, out of `refoldTicket`. Both halves are asserted.
 */

const WS = newUlid();
const OTHER_WS = newUlid();
const PROJECT = newUlid();
const TICKET = newUlid();
const HELD_TICKET = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE = newUlid();
/** A workflow the seeded device has never heard of — see 12.298. */
const WF_UNSEEN = newUlid();

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
  ],
};

/**
 * A whole workflow the device does not hold, which is the shape the hazard
 * actually takes — see 12.298's docblock for why "a HIGHER VERSION of a
 * workflow it does hold" is NOT the shape, measured.
 */
const wfUnseen = { ...wfV1, id: WF_UNSEEN, name: 'Unseen' };

const ticketTypeDef = { id: TYPE, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { seq?: number; workspaceSeq?: number } = {},
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
    workspaceSeq: opts.workspaceSeq ?? streamCounter,
  };
}

const workflowDefined = (def: { id: string }, seq: number, workspaceSeq?: number): LedgerEvent =>
  envelope({ kind: 'workflow', id: def.id }, 'workflow.defined', def, { seq, workspaceSeq });

const typeDefined = (seq = 1, workspaceSeq?: number): LedgerEvent =>
  envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', ticketTypeDef, { seq, workspaceSeq });

const created = (ticketId: string, title: string, seq?: number, workspaceSeq?: number): LedgerEvent =>
  envelope(
    { kind: 'ticket', id: ticketId },
    'ticket.created',
    { typeId: TYPE, projectId: PROJECT, parentId: null, title },
    { seq, workspaceSeq },
  );

const transitioned = (ticketId: string, to: string, seq?: number, workspaceSeq?: number): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'ticket.transitioned', { to }, { seq, workspaceSeq });

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

function ticketBootstrapOf(overrides: Partial<TicketBootstrap> = {}): TicketBootstrap {
  return {
    workspaceId: WS,
    definitions: [workflowDefined(wfV1, 1), typeDefined(1)],
    ticket: { ticketId: TICKET, snapshot: null, events: [] },
    ...overrides,
  };
}

/** One owed ticket, as ruling P37.2 shapes it. */
const owed = (id: string, headSeq: number) => ({ id, headSeq });
/** The ids of an owed list, sorted — the shape most assertions here want. */
const idsOwed = (ts: readonly { id: string }[]): string[] => ts.map((t) => t.id).sort();

const tempDirs: string[] = [];

/** A replica on a REAL FILE, so "survives a restart" is a restart and not a metaphor. */
function fileStorage(): { storage: SyncStorage; reopen: () => SyncStorage } {
  const dir = mkdtempSync(join(tmpdir(), 'gisik-replica-'));
  tempDirs.push(dir);
  const path = join(dir, 'replica.sqlite');
  return { storage: createBetterSqliteStorage(path), reopen: () => createBetterSqliteStorage(path) };
}

async function seededReplica(storage: SyncStorage = createBetterSqliteStorage()): Promise<Replica> {
  seqCounter = 0;
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());
  return replica;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('12.292–12.294 the per-ticket door applies one ticket and touches nothing else', () => {
  it('12.292 applies a pulled ticket the device did not hold, snapshot-less, so it becomes readable', async () => {
    const replica = await seededReplica();
    expect(await replica.getTicket(TICKET)).toBeNull();

    await replica.loadTicketBootstrap(
      ticketBootstrapOf({
        ticket: {
          ticketId: TICKET,
          snapshot: null,
          events: [created(TICKET, 'Pulled', 1), transitioned(TICKET, 'doing', 2)],
        },
      }),
    );

    const held = await replica.getTicket(TICKET);
    expect(held?.confirmed?.stateId).toBe('doing');
    // The POSITIVE CONTROL for this case: the ticket is readable because its
    // own events were folded, not because some other door happened to run. A
    // title comes only from `ticket.created`'s payload.
    expect(held?.confirmed?.fields['title']?.value).toBe('Pulled');
  });

  it('12.293 does NOT move the workspace cursor, though the events it applies sit far above it', async () => {
    const replica = await seededReplica();
    await replica.setCursor(WS, 40);

    // The fixture is deliberately not quiet: workspaceSeq 900/901 are well
    // above the cursor, so an implementation that advanced to "the highest
    // workspaceSeq I just applied" WOULD move it. That is the mutation this
    // case is written against.
    await replica.loadTicketBootstrap(
      ticketBootstrapOf({
        ticket: {
          ticketId: TICKET,
          snapshot: null,
          events: [created(TICKET, 'Far ahead', 1, 900), transitioned(TICKET, 'doing', 2, 901)],
        },
      }),
    );

    expect(await replica.getCursor(WS)).toBe(40);
    // Paired with the positive control, so "the cursor did not move" cannot be
    // satisfied by a door that did nothing at all.
    expect((await replica.getTicket(TICKET))?.confirmed?.stateId).toBe('doing');
  });

  it('12.294 a pull that cannot fold rolls back ITSELF and leaves the rest of the session intact', async () => {
    const replica = await seededReplica();
    await replica.loadTicketBootstrap(
      ticketBootstrapOf({ ticket: { ticketId: HELD_TICKET, snapshot: null, events: [created(HELD_TICKET, 'Kept', 1)] } }),
    );
    await replica.setCursor(WS, 40);

    // A transition with no `ticket.created` and no snapshot: `applyTicketEvent`
    // has no state to fold onto and throws. This is the shape a pull hits when
    // the server's tail is genuinely incomplete, not a contrived one.
    await expect(
      replica.loadTicketBootstrap(
        ticketBootstrapOf({
          ticket: { ticketId: TICKET, snapshot: null, events: [transitioned(TICKET, 'doing', 1)] },
        }),
      ),
    ).rejects.toThrow();

    // The failed ticket left NOTHING — not a half-applied row.
    expect(await replica.getTicket(TICKET)).toBeNull();
    expect(await replica.listEntityEvents(TICKET)).toEqual([]);
    // And the session survived it: the earlier ticket and the cursor stand.
    expect((await replica.getTicket(HELD_TICKET))?.confirmed?.fields['title']?.value).toBe('Kept');
    expect(await replica.getCursor(WS)).toBe(40);
  });
});

describe('12.295–12.296 the pending-pull set is durable and workspace-scoped', () => {
  it('12.295 survives a process restart — a fresh replica over the same file still owes the ids', async () => {
    const { storage, reopen } = fileStorage();
    const replica = await seededReplica(storage);
    await replica.addPendingPulls(WS, [owed(TICKET, 4), owed(HELD_TICKET, 7)]);
    expect(idsOwed(await replica.listPendingPulls(WS))).toEqual([TICKET, HELD_TICKET].sort());

    // A NEW replica over the SAME file — no shared JS object between them, so
    // an in-memory set would answer empty here and this is the mutation the
    // case is written against. The `headSeq` survives too, and it must: it is
    // what a 404's keyed drop compares against (P37.3).
    const restarted = await createReplica({ storage: reopen() });
    expect(idsOwed(await restarted.listPendingPulls(WS))).toEqual([TICKET, HELD_TICKET].sort());
    expect((await restarted.listPendingPulls(WS)).find((t) => t.id === TICKET)?.headSeq).toBe(4);

    await restarted.clearPendingPull(WS, TICKET);
    expect(idsOwed(await restarted.listPendingPulls(WS))).toEqual([HELD_TICKET]);
  });

  it('12.296 a re-recorded id does not duplicate, and an unknown workspace owes nothing', async () => {
    const replica = await seededReplica();
    await replica.addPendingPulls(WS, [owed(TICKET, 4)]);
    await replica.addPendingPulls(WS, [owed(TICKET, 11), owed(HELD_TICKET, 7)]);
    expect(idsOwed(await replica.listPendingPulls(WS))).toEqual([TICKET, HELD_TICKET].sort());
    // A LATER notice SUPERSEDES an earlier one for the same id, and the
    // overwrite is load-bearing rather than tidy: P37.3's keyed drop compares
    // against this value, so an entry stuck at a stale `headSeq` would be
    // dropped by a 404 that a newer notice had already answered.
    expect((await replica.listPendingPulls(WS)).find((t) => t.id === TICKET)?.headSeq).toBe(11);
    // Scoped by workspace exactly as `cursor:` is — one storage file can hold
    // more than one, and a notice for one must not be owed by the other.
    expect(await replica.listPendingPulls(OTHER_WS)).toEqual([]);
  });

  it('12.297 a workspace-wide revocation forgets what the device was owed; a project-scoped one does not', async () => {
    const replica = await seededReplica();
    await replica.addPendingPulls(WS, [owed(TICKET, 4), owed(HELD_TICKET, 7)]);

    await replica.revokeScope({ kind: 'scope-revoked', workspaceId: WS, projectId: PROJECT });
    // Membership stands, so the owed ids stand: this is the control that proves
    // the next assertion is about the WORKSPACE arm and not about revocation
    // generally.
    expect(idsOwed(await replica.listPendingPulls(WS))).toEqual([TICKET, HELD_TICKET].sort());

    await replica.revokeScope({ kind: 'scope-revoked', workspaceId: WS });
    // Left behind, these would have a removed device asking for ids in a
    // workspace it is not in, on every catch-up, answered 403 each time.
    expect(await replica.listPendingPulls(WS)).toEqual([]);
  });
});

describe('12.298 definitions travel with the pulled ticket, because ordering no longer does it for us', () => {
  /**
   * ## The hazard is an ABSENT workflow, not a newer VERSION of a held one —
   * ## and this case says so because its first draft got it wrong
   *
   * The obvious fixture is a device on v1 pulling a ticket whose snapshot names
   * v2. **Measured: that does not throw.** With no definitions,
   * `foldSnapshotForward` finds no latest and returns the state untouched;
   * `refoldTicket` then resolves the workflow id out of the LOCAL table, finds
   * v1, and folds the tail against v1's transitions perfectly happily. The
   * pulled ticket ends up held, with `workflowVersion: 2` recorded on a state
   * that was folded under v1's rules.
   *
   * *RECORDED, NOT FIXED, and not this case's subject:* that silent
   * version-down fold is reachable through `loadBootstrap` too and is a
   * property of `foldSnapshotForward`'s `latest === undefined` guard, not of
   * the per-ticket door. It wants an owner. **Owner: unassigned** — naming it
   * here so a later reader does not discover it and assume closure 5b(d)
   * introduced it.
   *
   * What DOES throw is the case ruling P37.1 actually produces: a device whose
   * stream cursor lags pulls a ticket over HTTP, and that ticket sits on a
   * workflow whose defining event is above the device's cursor — so the local
   * table has NO row for it at all. `getWorkflow` answers `undefined` and
   * `applyTicketEvent` refuses.
   */
  it('12.298 a ticket on a workflow the device has never seen folds WITH its definition and throws WITHOUT it', async () => {
    const snapshotOnUnseen = {
      ticketId: TICKET,
      snapshot: {
        seq: 1,
        state: {
          kind: 'ticket',
          id: TICKET,
          workspaceId: WS,
          projectId: PROJECT,
          typeId: TYPE,
          parentId: null,
          workflowId: WF_UNSEEN,
          workflowVersion: 1,
          stateId: 'todo',
          stateCategory: 'open',
          assigneeId: null,
          collaboratorIds: [],
          fields: { title: { value: 'Unseen workflow', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME } },
          transitions: [],
        },
      },
      events: [transitioned(TICKET, 'done', 2)],
    } as TicketBootstrap['ticket'];

    const without = await seededReplica();
    // The exact refusal, not merely "some error": a looser matcher would pass
    // against a payload the schema rejected for an unrelated reason.
    await expect(
      without.loadTicketBootstrap(ticketBootstrapOf({ definitions: [], ticket: snapshotOnUnseen })),
    ).rejects.toThrow(/vanished — replay integrity is broken/);
    expect(await without.getTicket(TICKET)).toBeNull();

    // The SAME payload; the only difference is the definition shipped beside
    // it. This is what the per-ticket route owes the client and what the live
    // stream's unconditional, ordered definition delivery would have given for
    // free.
    const with_ = await seededReplica();
    await with_.loadTicketBootstrap(
      ticketBootstrapOf({
        definitions: [workflowDefined(wfV1, 1), typeDefined(1), workflowDefined(wfUnseen, 1)],
        ticket: snapshotOnUnseen,
      }),
    );
    expect((await with_.getTicket(TICKET))?.confirmed?.stateId).toBe('done');
  });
});

describe('12.302 a pulled ticket keeps the provenance closure 4 shipped it', () => {
  /**
   * Ruling P36 closed this: a snapshot-bounded device cannot name who put a
   * ticket in its state, because the creating and transitioning events are
   * below the snapshot's seq and were never shipped — so the snapshot carries
   * the recorded claim beside it.
   *
   * **The per-ticket door is the one place that reopens most easily, and the
   * one where it matters most.** A ticket arriving here is by definition one
   * this device has never held, so it is snapshot-bounded on arrival by
   * construction — the exact shape `replica-data-source.ts` refuses without a
   * provenance block. Dropping the argument compiles (it defaults to `null`)
   * and every other case in this file stays green, which is the whole reason
   * this one exists.
   *
   * The block is passed THROUGH and never constructed: `writeSnapshot` treats
   * an absent block as "nothing new to say" rather than "forget what you knew",
   * so a door that helpfully supplied its own `null` would erase a good block
   * on a re-pull.
   */
  it('12.302 carries the snapshot provenance through, and a door that drops it is not visible any other way', async () => {
    const replica = await seededReplica();
    const claim = { actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME };

    await replica.loadTicketBootstrap(
      ticketBootstrapOf({
        ticket: {
          ticketId: TICKET,
          snapshot: {
            seq: 1,
            state: {
              kind: 'ticket',
              id: TICKET,
              workspaceId: WS,
              projectId: PROJECT,
              typeId: TYPE,
              parentId: null,
              workflowId: WF,
              workflowVersion: 1,
              stateId: 'doing',
              stateCategory: 'active',
              assigneeId: null,
              collaboratorIds: [],
              fields: { title: { value: 'Pulled with provenance', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME } },
              transitions: [],
            },
            provenance: { state: claim, assigned: null },
          },
          events: [],
        },
      }),
    );

    // The positive control first: the pull landed at all. Without it, a door
    // that threw early would satisfy "no provenance was invented".
    expect((await replica.getTicket(TICKET))?.confirmed?.stateId).toBe('doing');
    expect(await replica.getSnapshotProvenance(TICKET)).toEqual({ state: claim, assigned: null });
  });
});

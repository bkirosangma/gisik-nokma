import { describe, expect, it } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
  type WorkspaceRole,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { createOutbox, type Outbox } from '../src/outbox/outbox.js';
import { buildLocalEngineContext } from '../src/precheck/local-context.js';

/**
 * Plan 10 Task 10 — the local pre-check. Cases 12.138–12.143.
 *
 * The range above is a fact about the moment it was written; recompute it
 * before quoting it. `grep -cE "^[[:space:]]*it\(" test/precheck.test.ts`
 * prints the number of declarations here, one per id, and no `it` in this file
 * sits inside a loop.
 *
 * ## What this file is trying to falsify
 *
 * That the instant answer and the server's answer can differ. The pre-check
 * runs `evaluateEvent` — the same function, the same rule modules, the same
 * reason strings — against `buildMemoryContext` seeded from the replica's own
 * tables. So the cases below are not "does the engine work" (Plans 2 and 3 own
 * that, with 61 fixtures); they are "is the CONTEXT this device builds the same
 * world the server would see, including the claims this device has queued and
 * not yet sent".
 *
 * ## Spellings the plan's snippets get wrong, kept right here
 *
 * - a `ticket.transitioned` PAYLOAD spells its destination `to`, never
 *   `toStateId` (`ticketTransitionedPayloadSchema`); a `TicketState.transitions`
 *   LOG ENTRY spells it `toStateId`. Both plan snippets for this task use the
 *   log spelling in a payload, which zod refuses. `replica.test.ts` records the
 *   same trap.
 * - every id is a ULID. `'ws_p'` / `'user_a'` survive `newSubmittedEvent`
 *   (which validates nothing) but not `ticketCreatedPayload`, whose `projectId`
 *   and `parentId` are `ulidString`.
 */

const WS = newUlid();
const PROJECT = newUlid();
const PARENT = newUlid();
const USER_A = newUlid();
const USER_B = newUlid();
const WF = newUlid();
const TYPE_TASK = newUlid();
const TYPE_SUB = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

/**
 * `done` is terminal and its edge is guarded by `restrict-to: ['admin']`; the
 * `todo` edge is open to anyone. One workflow carries both because the two
 * properties are exercised by different cases and a second workflow would
 * only add a second thing to keep in step.
 */
const wfDone = {
  id: WF,
  version: 1,
  name: 'Doneable',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'done', rules: [{ kind: 'restrict-to', roles: ['admin'] }] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

const taskType = { id: TYPE_TASK, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };
const subTaskType = { id: TYPE_SUB, name: 'Sub-task', icon: 'dot', rank: 4, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

/** A server-shaped `LedgerEvent` (coordination §18): per-entity `seq` plus the stream position. */
function committed(entity: EventEnvelope['entity'], type: string, payload: unknown, seq?: number): LedgerEvent {
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
    seq: seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

function bootstrapOf(role: WorkspaceRole): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: role, projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      committed({ kind: 'workflow', id: WF }, 'workflow.defined', wfDone, 1),
      committed({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType, 1),
      committed({ kind: 'ticket-type', id: TYPE_SUB }, 'ticket-type.defined', subTaskType, 1),
    ],
    tickets: [],
  };
}

type Seeded = { storage: SyncStorage; replica: Replica; outbox: Outbox };

/** A replica holding one PARENT ticket that has been transitioned into `done` (terminal). */
async function seeded(role: WorkspaceRole = 'member'): Promise<Seeded> {
  seqCounter = 0;
  streamCounter = 0;
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf(role));
  await replica.applyServerItem(
    committed({ kind: 'ticket', id: PARENT }, 'ticket.created', {
      typeId: TYPE_TASK,
      projectId: PROJECT,
      parentId: null,
      title: 'Parent',
    }, 1),
  );
  // Straight through the reducer: `applyServerItem` folds, it does not evaluate,
  // so the guarded `done` edge is irrelevant to the SETUP and only binds claims.
  await replica.applyServerItem(committed({ kind: 'ticket', id: PARENT }, 'ticket.transitioned', { to: 'done' }, 2));
  return { storage, replica, outbox: createOutbox({ storage, replica }) };
}

function childUnderParent(): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.created',
    payload: { typeId: TYPE_SUB, projectId: PROJECT, parentId: PARENT, title: 'Late child' },
    actorId: USER_A,
    origin: 'desktop',
  });
}

function rootTicket(): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.created',
    payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title: 'Root' },
    actorId: USER_A,
    origin: 'desktop',
  });
}

describe('12.138–12.139 the same engine, the same refusals, before anything is queued', () => {
  /**
   * 12.19 — the local pre-check refuses a locally-illegal claim instantly, naming the engine's own rule and reason string, and leaves the outbox table and nextBatch() both empty.
   */
  it('12.138 creating under a terminal parent refuses hierarchy.parent-terminal and queues NOTHING', async () => {
    const { storage, outbox } = await seeded();
    const result = await outbox.enqueue(childUnderParent());

    expect(result).toMatchObject({ queued: false, rule: 'hierarchy.parent-terminal' });
    // The refusal is the ENGINE's sentence, not a local paraphrase — it names
    // the parent by title and the state by name, which is what makes it
    // actionable and what proves the reason came through `evaluateEvent`.
    expect((result as { reason: string }).reason).toContain('Parent');
    expect((result as { reason: string }).reason).toContain('Done');
    // An enumeration, not a count: the rows themselves, so an empty answer from
    // a broken query cannot pass as an empty outbox.
    expect(await storage.all('SELECT event_id, status FROM outbox')).toEqual([]);
    expect(await outbox.nextBatch()).toEqual([]);
    await storage.close();
  });

  it('12.139 the reopen pair passes: the child sees the parent reopened by a claim still in the outbox', async () => {
    const { storage, replica, outbox } = await seeded();
    const child = childUnderParent();
    const reopen = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: PARENT },
      type: 'ticket.transitioned',
      payload: { to: 'todo' },
      actorId: USER_A,
      origin: 'desktop',
    });

    expect(await outbox.enqueue(reopen)).toEqual({ queued: true, eventId: reopen.id });
    // 12.138 IS this case's control: the identical child event, against the
    // identical replica, refused — the ONLY difference is the queued reopen
    // above. Without the pending overlay this line reads
    // `{queued: false, rule: 'hierarchy.parent-terminal'}`.
    expect(await outbox.enqueue(child)).toEqual({ queued: true, eventId: child.id });

    expect((await outbox.nextBatch()).map((item) => item.eventId)).toEqual([reopen.id, child.id]);
    // And the settled world did not move an inch while both claims were made.
    expect((await replica.getTicket(PARENT))?.confirmed?.stateId).toBe('done');
    await storage.close();
  });
});

describe('12.140–12.141 what the context is allowed to know', () => {
  it('12.140 getEntityState(membership) answers for me and only me, out of bootstrap', async () => {
    const { storage, replica } = await seeded();
    const ctx = await buildLocalEngineContext({ storage, replica });

    expect(await ctx.getEntityState('membership', `${WS}:${USER_A}`)).toEqual({
      kind: 'membership',
      id: `${WS}:${USER_A}`,
      workspaceId: WS,
      userId: USER_A,
      role: 'member',
    });
    // Somebody else's membership is not knowledge this device has. `null` is the
    // honest answer; a guess here becomes an invented refusal or an invented
    // accept the moment a `restrict-to` names a role.
    expect(await ctx.getEntityState('membership', `${WS}:${USER_B}`)).toBeNull();
    // Not a colon-shaped id at all — no crash, no half-parsed pair.
    expect(await ctx.getEntityState('membership', USER_A)).toBeNull();
    await storage.close();
  });

  it('12.141 definitions come from the replica TABLES, so a revoked scope really is forgotten', async () => {
    const { storage, replica, outbox } = await seeded();

    // CONTROL: the same claim is legal before the revocation, so the refusal
    // below is caused by the revocation and not by the claim being malformed.
    const before = await outbox.enqueue(rootTicket());
    expect(before).toMatchObject({ queued: true });

    await replica.revokeScope({ kind: 'scope-revoked', workspaceId: WS });

    // POSITIVE CONTROL for the mutation this case exists to catch: `revokeScope`
    // empties `ticket_types` but does NOT delete the `ticket-type.defined` rows
    // from `events` (it deletes by entity id, and only ticket ids are walked).
    // So a context that rebuilt definitions by replaying the event log would
    // resurrect them and answer for a workspace this device has been removed
    // from. The rows are printed, not counted.
    expect(await storage.all('SELECT def FROM ticket_types')).toEqual([]);
    expect(
      (await storage.all("SELECT type FROM events WHERE entity_kind = 'ticket-type'")).map((row) => row.type),
    ).toEqual(['ticket-type.defined', 'ticket-type.defined']);

    expect(await outbox.enqueue(rootTicket())).toMatchObject({
      queued: false,
      rule: 'ticket.unknown-type',
    });
    await storage.close();
  });
});

describe("12.142 a rule that reads the actor's role gets the answer through the engine", () => {
  /**
   * THE ADMIN HALF IS THE LOAD-BEARING HALF, and the member half is not — worth
   * saying because the pair looks symmetric and is not. `restrict-to` refuses
   * when the membership lookup answers `null` just as it refuses when the role
   * does not match, so the member case passes with the membership door
   * unimplemented. Only the admin case fails if `getEntityState('membership')`
   * stops answering.
   *
   * MEASURED rather than reasoned: replacing the membership arm of
   * `local-context.ts` with a bare `return null` reddens exactly TWO cases in
   * this package — 12.140, which asks that door directly, and THIS one's second
   * half. The first half stays green, which is the point of the paragraph
   * above; a reader who trusted the pair as symmetric would read a passing
   * member case as evidence the door works.
   */
  it('12.142 restrict-to: a member is refused the guarded edge and an admin is not', async () => {
    const asMember = await seeded('member');
    const memberMove = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: PARENT },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: USER_A,
      origin: 'desktop',
    });
    expect(await asMember.outbox.enqueue(memberMove)).toMatchObject({ queued: false, rule: 'restrict-to' });
    await asMember.storage.close();

    const asAdmin = await seeded('admin');
    const adminMove = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: PARENT },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: USER_A,
      origin: 'desktop',
    });
    expect(await asAdmin.outbox.enqueue(adminMove)).toEqual({ queued: true, eventId: adminMove.id });
    await asAdmin.storage.close();
  });
});

describe('12.143 a queued claim the reducer can no longer fold does not take the device down with it', () => {
  /**
   * The reachable combination the two modules make between them:
   * `revokeScope` empties `workflows` and `ticket_types` and DELIBERATELY
   * leaves outbox rows standing, while `applyTicketEvent` THROWS on an unknown
   * ticket type. Unwrapped, the overlay throws — and since every `enqueue`
   * builds an overlay, the first claim made after a revocation takes down every
   * subsequent claim on the device, offline, permanently.
   *
   * Mutation that reddens this: delete the `try`/`catch` around
   * `applyTicketEvent` in `buildPendingOverlay`. Measured — that mutation fails
   * TWO cases, this one and 12.141 (which also leaves a claim queued across the
   * revocation), both with the same thrown
   * `applyTicketEvent: unknown ticket type "…"`.
   */
  it('12.143 the claim stays queued and flushable; its pending READING is null rather than partial', async () => {
    const { storage, replica, outbox } = await seeded();
    const orphaned = rootTicket();
    expect(await outbox.enqueue(orphaned)).toMatchObject({ queued: true });

    await replica.revokeScope({ kind: 'scope-revoked', workspaceId: WS });

    // Not lost: still counted, still offered to the flush, still visible.
    expect(await outbox.queuedCount(WS)).toBe(1);
    expect((await outbox.nextBatch()).map((item) => item.eventId)).toEqual([orphaned.id]);
    // Not rendered: no pending reading can be honestly built for it.
    expect(await outbox.pendingFor(orphaned.entity.id)).toBeNull();
    expect(await outbox.pendingCreatedTickets(WS)).toEqual([]);
    await storage.close();
  });
});

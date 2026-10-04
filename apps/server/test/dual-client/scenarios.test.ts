import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '@gisik-nokma/rule-engine';
import { TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { VISIBILITY_REFUSAL_RULE } from '../../src/sync/sync-service.js';
import {
  createHarness,
  HARNESS_SUB_TASK_TYPE_ID,
  HARNESS_WORKFLOW_ID,
  TASK_TYPE_ID,
  USER_A,
  USER_ADMIN,
  USER_B,
  type Harness,
  type HarnessClient,
  type LedgerRow,
} from './rig.js';

/**
 * The six scripted divergences (Plan 10 Task 15), on Task 14's rig. Two
 * replicas diverge offline, sync, and the outcome is asserted EXACTLY — the
 * final ledger, the server's read model, BOTH replicas, and every contested
 * claim with its rule, its reason and the refused claim it embeds.
 *
 * ## What "exactly" means here, and what it costs
 *
 * Every contest is asserted by rule id AND by the sentence the claimant reads.
 * The sentences are spelled out in this file rather than imported, on purpose:
 * `restrict-to`'s reason is built inside the rule evaluator and
 * `hierarchy.parent-terminal`'s inside `checks/refusals.ts`, neither of which
 * exports the text. A change to either sentence reddens the scenario that
 * quotes it, which is the point — the reason is product surface (Plan 6
 * renders it verbatim), not an implementation detail.
 *
 * Where a scenario could pass for a reason unrelated to the property it names,
 * the control is beside it: "offline" is witnessed at the LEDGER before any
 * client goes online, not inferred from a silent replica; "the refused claim
 * moved nothing" is read off the server projection AND both replicas; and
 * `expectReplicasConverged` refuses a vacuous pass by insisting the ticket is
 * actually held.
 *
 * ## The plan text versus this file
 *
 * The plan's code block for this task predates the rig and most of the
 * product it drives. The rig's own docblocks record the API differences
 * (argument shapes, ULID identities, the gated door, the transport gate, the
 * flush-then-catch-up order). Two departures are about the PRODUCT rather than
 * the rig, and they are documented on the scenarios that carry them:
 *
 * - S4's premise — a purge on sync-down after `visibility.set` — is false of
 *   the shipped product. The scenario is rewritten against what the server
 *   actually does; its docblock says which half of the plan held.
 * - S3's rule is pinned to a single literal rather than the plan's three-way
 *   membership, derived by reading `transition.ts`'s check order.
 *
 * ## The order of `goOnline()`
 *
 * The rig flushes and THEN catches up, the inverse of the product's
 * `onCaughtUp → flush`. No scenario here asserts a replica's state between
 * those two steps; every replica assertion is made after both have run, or
 * after an explicit `syncDown()`. The server-side outcome is order-independent
 * for every shape below because the queued claim is judged by the server
 * against the server's world either way.
 */

let h: Harness;
/** The "online" side of each divergence: its claims go through `ingestInteractive` or its own replica. */
let a: HarnessClient;
/** The offline claimant. */
let b: HarnessClient;

beforeEach(async () => {
  h = await createHarness();
  a = await h.client(USER_A);
  b = await h.client(USER_B);
});

afterEach(async () => {
  await h.drop();
});

const SHARED_TITLE = 'Shared ground';

/**
 * The sentence `evaluateRestrictTo` builds for an assignee-only edge when the
 * actor is not the assignee (`packages/rule-engine/src/rules/restrict-to.ts`).
 * The harness workflow's guarded edges all carry `{ assignee: true }` alone, so
 * `allowed` has exactly one entry and no "or" clause.
 */
function restrictToAssigneeReason(actorId: string): string {
  return `Only the ticket's assignee may make this move, and ${actorId} is not among them.`;
}

/**
 * `parentTerminalRefusal(parentTitle, stateName, 'add')` from
 * `packages/rule-engine/src/checks/refusals.ts`, for a `ticket.created` under
 * a finished parent. The title is read off the parent's `fields.title` claim
 * and the state name off the parent's OWN workflow version — the same lookups
 * on the server and in the replica's pre-check, which is why S5 can assert the
 * two sentences are identical.
 */
function parentTerminalReason(parentTitle: string, stateName: string): string {
  return `"${parentTitle}" is finished (${stateName}). Adding live work reopens it — choose a state to reopen it to, then add this ticket.`;
}

function ticketEvent(actorId: string, ticketId: string, type: string, payload: unknown): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: h.workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId,
    // Provenance the way the two shells would stamp it — and never `'server'`,
    // which the gated door refuses from a client (rig.test.ts pins that).
    origin: actorId === USER_A ? 'desktop' : 'mobile',
  });
}

/**
 * One root ticket, created by A through the gated interactive door, delivered
 * to BOTH replicas through the stream door.
 *
 * No `visibility.set` and no `seedTicket`: a ticket that authors no visibility
 * resolves to `'project'` mode (`proj-visibility.ts`'s `ROOT_DEFAULT_MODE`),
 * and both scenario users are members ON the project, so it is shared already.
 * The plan's `seedTicket(..., { visibility: 'workspace' })` names a parameter
 * the helper does not have and a second `ticket.created` for a ticket that
 * already exists.
 *
 * The clients were created in `beforeEach`, BEFORE this ticket existed, so
 * it reaches them the way a running client receives new work — through
 * `syncDown()` — rather than through bootstrap. Both replicas are checked to
 * hold it, so a scenario that later finds a ticket missing is looking at the
 * scenario's own doing.
 */
async function seedSharedTicket(): Promise<{ ticketId: string; created: SubmittedEvent }> {
  const ticketId = newUlid();
  const created = ticketEvent(USER_A, ticketId, 'ticket.created', {
    typeId: TASK_TYPE_ID,
    projectId: h.projectId,
    parentId: null,
    title: SHARED_TITLE,
  });
  const [result] = await h.ingestInteractive(USER_A, [created]);
  expect(result).toMatchObject({ status: 'committed', eventId: created.id, seq: 1 });
  await a.syncDown();
  await b.syncDown();
  expect((await a.replica.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
  expect((await b.replica.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
  return { ticketId, created };
}

/** `ingestInteractive` for exactly one claim that must commit — the online user's ordinary action. */
async function commitInteractive(userId: string, event: SubmittedEvent): Promise<void> {
  const [result] = await h.ingestInteractive(userId, [event]);
  expect(result, `${event.type} by ${userId} should commit`).toMatchObject({ status: 'committed', eventId: event.id });
}

/** The one `proj_contested` row filed for a refused claim, by the id of the claim it embeds. */
function contestFor(rows: readonly Record<string, unknown>[], originalEventId: string): Record<string, unknown> {
  const row = rows.find((r) => r['original_event_id'] === originalEventId);
  if (row === undefined) throw new Error(`no proj_contested row embeds ${originalEventId}`);
  return row;
}

/** `contested_at` comes back from pg as a Date; the replicas hold the same instant as the server's ISO string. */
function instantOf(value: unknown): string {
  return new Date(value as Date).toISOString();
}

/**
 * Server ≡ replica A ≡ replica B, for one ticket, with nothing left in transit.
 *
 * The strongest line in the file is the last one: the SERVER's read model
 * (`proj_tickets`, Plan 3's projection) equals the reducer-folded replicas.
 * That is spec §7's property — server and clients can never quietly disagree —
 * and it holds only because both sides fold with the one `applyTicketEvent`.
 *
 * `onA` is checked non-null FIRST. Two replicas that both answer `null` are
 * equal, and a convergence check that passed on a ticket neither side holds
 * would prove the opposite of what it claims.
 */
async function expectReplicasConverged(ticketId: string): Promise<void> {
  const onA = await a.replica.getTicket(ticketId);
  const onB = await b.replica.getTicket(ticketId);
  expect(onA, `replica A must hold ${ticketId} for convergence to mean anything`).not.toBeNull();
  expect(onA?.confirmed).not.toBeNull();
  // Confirmed state AND the contests filed against the ticket, byte for byte —
  // including `contestedAt`, which is the server's instant on both sides only
  // if the streamed envelope corrected any local stub the outbox wrote.
  expect(onB).toEqual(onA);
  const historyA = await a.replica.listEntityEvents(ticketId);
  expect(historyA.length).toBeGreaterThan(0);
  expect(await b.replica.listEntityEvents(ticketId)).toEqual(historyA);
  for (const client of [a, b]) {
    expect(await client.outbox.pendingFor(ticketId), `${client.userId} has nothing in transit`).toBeNull();
    expect(await client.outbox.queuedCount(h.workspaceId)).toBe(0);
    // A contested claim is a CONTEST, never a failed outbox item — `failed` is
    // reserved for `refused`/`invalid` answers (outbox.ts).
    expect(await client.outbox.failedItems(h.workspaceId)).toEqual([]);
  }
  expect(await h.projTicket(ticketId)).toEqual(onA?.confirmed);
}

/** The replica's cursor stands at the workspace stream head — nothing undelivered remains. */
async function expectCurrent(client: HarnessClient): Promise<void> {
  expect(await client.replica.getCursor(h.workspaceId)).toBe(await readStreamSeq(h.pool, h.workspaceId));
}

describe('S1 — concurrent field_set: the later claim wins the projection, the earlier survives in history', () => {
  /**
   * Two people edit the same field on the same ticket while both are offline.
   * A race is not a rule violation: BOTH claims commit, in stream order, and
   * the reducer's last-write-wins puts the later one in the projection while
   * the earlier one stays in the ledger and in every replica's history.
   *
   * `title` rather than the plan's `notes`: the harness ticket types declare
   * `fields: []`, so `notes` is refused LOCALLY as `field.unknown` and the
   * scenario would never leave the device. `title` is a built-in the field
   * check accepts as non-blank text (`checks/fields.ts`).
   */
  /**
   * 12.30 — S1: two concurrent field_set claims on the same ticket both commit; the later claim (B) wins the server projection, the earlier claim (A) survives whole in the ledger and every replica's history, and both replicas converge byte-identical.
   */
  it('12.267 — asserts the exact final ledger, the server projection, and both replicas byte-identical', async () => {
    const { ticketId, created } = await seedSharedTicket();
    const claimA = ticketEvent(USER_A, ticketId, 'ticket.field_set', { fieldId: 'title', value: 'A said this' });
    const claimB = ticketEvent(USER_B, ticketId, 'ticket.field_set', { fieldId: 'title', value: 'B said this' });
    expect(await a.submit(claimA)).toEqual({ status: 'pending', eventId: claimA.id });
    expect(await b.submit(claimB)).toEqual({ status: 'pending', eventId: claimB.id });
    // Offline means the ledger has neither. Witnessed here, not inferred.
    expect(await h.ledger(ticketId)).toEqual([{ id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A }]);

    await a.goOnline(); // A lands first…
    await b.goOnline(); // …B lands second: the later claim
    await a.syncDown();

    expect(await h.ledger(ticketId)).toEqual<LedgerRow[]>([
      { id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A },
      { id: claimA.id, type: 'ticket.field_set', seq: 2, actorId: USER_A },
      { id: claimB.id, type: 'ticket.field_set', seq: 3, actorId: USER_B },
    ]);
    const server = await h.projTicket(ticketId);
    // Later wins in the SERVER projection, with the winner's provenance intact.
    expect(server?.fields['title']).toMatchObject({ value: 'B said this', actorId: USER_B, clientTime: claimB.clientTime });
    // …and on A, whose OWN claim landed first and was folded through the flush
    // door before B's ever arrived: the stream echo re-ordered it correctly.
    expect((await a.replica.getTicket(ticketId))?.confirmed?.fields['title']).toEqual(server?.fields['title']);
    // The earlier claim is preserved, never erased: whole, in order, with its payload.
    const history = await a.replica.listEntityEvents(ticketId);
    expect(history.map((e) => e.id)).toEqual([created.id, claimA.id, claimB.id]);
    expect(history[1]?.payload).toEqual({ fieldId: 'title', value: 'A said this' });
    expect(await h.contests()).toEqual([]);
    await expectReplicasConverged(ticketId);
    await expectCurrent(a);
    await expectCurrent(b);
  });
});

describe('S2 — restrict-to violated because the world changed: contested with the exact rule', () => {
  /**
   * B is the assignee as far as B's replica knows, so the local pre-check —
   * the SAME `evaluateEvent` the server runs, against a world an hour old —
   * accepts the move to Done. Meanwhile A takes the assignment back. The
   * server judges the queued claim against ITS world and refuses `restrict-to`;
   * the refusal is recorded as a `claim.contested` event on the ticket, and the
   * claimant's attention is where the contest surfaces.
   */
  /**
   * 12.31 — re-filed as 12.268: B's local replica still shows B as assignee (the stale fact asserted, not assumed) so the local restrict-to pre-check passes B's own submit, and the claim then contests at the sync door with the exact restrict-to rule once A's reassignment has landed.
   */
  it('12.268 — B was assignee locally, reassignment landed meanwhile; the offline claim contests', async () => {
    const { ticketId, created } = await seedSharedTicket();
    const assignB = ticketEvent(USER_A, ticketId, 'ticket.assigned', { assigneeId: USER_B });
    await commitInteractive(USER_A, assignB);
    await a.syncDown();
    await b.syncDown();
    // The stale fact B is about to judge against.
    expect((await b.replica.getTicket(ticketId))?.confirmed?.assigneeId).toBe(USER_B);

    // B, offline, claims Done. `todo → done` is assignee-only in the harness
    // workflow and B IS the assignee locally, so the pre-check passes and the
    // overlay shows the ticket finished — the honest "as this device believes".
    const doneClaim = ticketEvent(USER_B, ticketId, 'ticket.transitioned', { to: 'done' });
    expect(await b.submit(doneClaim)).toEqual({ status: 'pending', eventId: doneClaim.id });
    expect(await b.outbox.pendingFor(ticketId)).toMatchObject({
      pendingEventIds: [doneClaim.id],
      pending: expect.objectContaining({ stateId: 'done', stateCategory: 'terminal' }),
    });

    // Meanwhile the world changes: A takes the ticket back.
    const assignA = ticketEvent(USER_A, ticketId, 'ticket.assigned', { assigneeId: USER_A });
    await commitInteractive(USER_A, assignA);

    await b.goOnline();
    await a.syncDown();

    const contests = await h.contests();
    expect(contests).toHaveLength(1);
    const contest = contestFor(contests, doneClaim.id);
    expect(contest).toMatchObject({
      original_event_id: doneClaim.id,
      workspace_id: h.workspaceId,
      ticket_id: ticketId,
      claimant_id: USER_B,
      rule: REFUSAL_RULES.restrictTo,
      reason: restrictToAssigneeReason(USER_B),
      resolved: false,
      // The refused claim is embedded WHOLE — what B typed, not a summary of it.
      original_event: doneClaim,
    });
    const contestEventId = contest['contested_event_id'] as string;
    // The contest is history on the ticket's own stream. Its `actorId` is the
    // CLAIMANT: the server attributes its append to the person whose claim
    // caused it (sync-service.ts, "actorId is the CLAIMANT"), with envelope-
    // origin `'server'` carrying the "the server wrote this" fact.
    expect(await h.ledger(ticketId)).toEqual<LedgerRow[]>([
      { id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A },
      { id: assignB.id, type: 'ticket.assigned', seq: 2, actorId: USER_A },
      { id: assignA.id, type: 'ticket.assigned', seq: 3, actorId: USER_A },
      { id: contestEventId, type: 'claim.contested', seq: 4, actorId: USER_B },
    ]);
    // The refused claim moved NOTHING: still To do, still A's, no transition logged.
    expect(await h.projTicket(ticketId)).toMatchObject({ stateId: 'todo', assigneeId: USER_A, transitions: [] });

    const onB = await b.replica.getTicket(ticketId);
    expect(onB?.confirmed).toMatchObject({ stateId: 'todo', assigneeId: USER_A });
    // B's contest is the SERVER's envelope, not the outbox's stub: `contestedAt`
    // is the server's instant, which the stub (device clock) could not know.
    expect(onB?.contests).toEqual([
      {
        contestedEventId: contestEventId,
        originalEventId: doneClaim.id,
        workspaceId: h.workspaceId,
        ticketId,
        claimantId: USER_B,
        rule: REFUSAL_RULES.restrictTo,
        reason: restrictToAssigneeReason(USER_B),
        originalEvent: doneClaim,
        contestedAt: instantOf(contest['contested_at']),
        resolved: false,
        resolution: null,
      },
    ]);
    // The pending overlay is gone — the claim was answered — and it is not a
    // failed outbox item either: a contest is neither queued nor failed.
    expect(await b.outbox.pendingFor(ticketId)).toBeNull();
    expect(await b.outbox.failedItems(h.workspaceId)).toEqual([]);
    // The claimant's attention, and ONLY the claimant's.
    expect((await b.ds.query.myWork(h.workspaceId, USER_B)).contested).toEqual(onB?.contests);
    expect((await a.ds.query.myWork(h.workspaceId, USER_A)).contested).toEqual([]);
    await expectReplicasConverged(ticketId);
    await expectCurrent(a);
    await expectCurrent(b);
  });
});

describe('S3 — workflow changed while offline: the stranded transition contests', () => {
  /**
   * B queues a move to "review", legal under v1. While B is offline the owner
   * publishes v2, which drops "review" (mapping it to "todo"). The server's
   * refresh-on-publish folds the ticket onto v2 at once; B's queued claim is
   * then judged against v2 and refused.
   *
   * ## The rule is `unknown-state`, pinned by reading the check order
   *
   * The plan's three-way `toContain(['unknown-state', 'illegal-transition',
   * 'stranded-state'])` is replaced with the single literal, as its own step 2
   * instructs. Derived from `transition.ts` rather than observed — this file was
   * written under a gate lock that forbids running it:
   *
   * 1. `resolveCurrentStateId` walks the ticket's state forward to v2. The
   *    ticket stands in "todo", which v2 still has, so the walk succeeds —
   *    `stranded-state` needs a state the NEW version dropped WITHOUT a
   *    mapping, and this ticket never left the initial state.
   * 2. `latest.states.find(s => s.id === payload.to)` — "review" is not in v2
   *    → `REFUSAL_RULES.unknownState`, reason `The workflow "<v2 name>" has no
   *    state "review".`
   * 3. `illegal-transition` is checked AFTER the target state resolves, so it
   *    is unreachable for a target that does not exist.
   *
   * v2 is named "Harness v2", NOT "Harness", so the reason sentence proves the
   * refusal was judged against the NEW definition: a server still holding v1
   * would have accepted the move, and one naming v1 in a refusal would be a
   * different bug. If the observed rule is not this literal, that is a finding
   * about the check order, not a reason to widen the assertion.
   *
   * The publish goes through the GATED door as the workspace OWNER: a member's
   * `workflow.defined` is refused (`ADMIN_ONLY_TYPES`; rig.test.ts I2 pins it).
   */
  /**
   * 12.32 — re-filed as 12.269: a transition to a state (review) legal under workflow v1 while B is offline is later judged against v2 (which dropped that state) on arrival, contesting with the unknownState rule rather than a 'stranded-state' literal.
   */
  it("12.269 — v2 removed 'review'; B's queued transition to it contests with unknown-state, judged against v2", async () => {
    const { ticketId, created } = await seedSharedTicket();
    // B offline: legal under v1 (`* → review` carries no rule).
    const toReview = ticketEvent(USER_B, ticketId, 'ticket.transitioned', { to: 'review' });
    expect(await b.submit(toReview)).toEqual({ status: 'pending', eventId: toReview.id });
    expect((await b.outbox.pendingFor(ticketId))?.pending).toMatchObject({ stateId: 'review', workflowVersion: 1 });

    // Meanwhile v2 lands without "review". `stateMapping` is the key the
    // domain schema declares (`workflowDefinedPayloadSchema`), and a dropped
    // state without one is refused at publish.
    const v2 = newSubmittedEvent({
      workspaceId: h.workspaceId,
      entity: { kind: 'workflow', id: HARNESS_WORKFLOW_ID },
      type: 'workflow.defined',
      payload: {
        id: HARNESS_WORKFLOW_ID,
        version: 2,
        name: 'Harness v2',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
        ],
        stateMapping: { review: 'todo' },
      },
      actorId: USER_ADMIN,
      origin: 'web',
    });
    const [published] = await h.ingestInteractive(USER_ADMIN, [v2]);
    expect(published).toMatchObject({ status: 'committed', eventId: v2.id, seq: 2 });
    // Refresh-on-publish, SERVER side: the ticket already stands on v2 before
    // B's claim arrives. This is what the claim is judged against.
    expect(await h.projTicket(ticketId)).toMatchObject({ workflowVersion: 2, stateId: 'todo', stateCategory: 'open' });

    await b.goOnline();
    await a.syncDown();

    const contests = await h.contests();
    expect(contests).toHaveLength(1);
    const contest = contestFor(contests, toReview.id);
    expect(contest).toMatchObject({
      original_event_id: toReview.id,
      ticket_id: ticketId,
      claimant_id: USER_B,
      rule: REFUSAL_RULES.unknownState,
      reason: 'The workflow "Harness v2" has no state "review".',
      resolved: false,
      original_event: toReview,
    });
    expect(await h.ledger(ticketId)).toEqual<LedgerRow[]>([
      { id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A },
      { id: contest['contested_event_id'] as string, type: 'claim.contested', seq: 2, actorId: USER_B },
    ]);
    expect(await h.ledger(HARNESS_WORKFLOW_ID)).toEqual([
      expect.objectContaining({ type: 'workflow.defined', seq: 1 }),
      { id: v2.id, type: 'workflow.defined', seq: 2, actorId: USER_ADMIN },
    ]);
    // Refresh-on-publish, REPLICA side, on both: the definition is stored and
    // the ticket folded onto it. Neither replica keeps v1's vocabulary.
    for (const client of [a, b]) {
      expect(await client.ds.query.getWorkflowDef(h.workspaceId, HARNESS_WORKFLOW_ID)).toMatchObject({
        version: 2,
        name: 'Harness v2',
      });
      expect((await client.replica.getTicket(ticketId))?.confirmed).toMatchObject({
        workflowVersion: 2,
        stateId: 'todo',
        stateCategory: 'open',
        transitions: [],
      });
    }
    expect(await b.outbox.pendingFor(ticketId)).toBeNull();
    expect((await b.ds.query.myWork(h.workspaceId, USER_B)).contested.map((c) => c.originalEventId)).toEqual([
      toReview.id,
    ]);
    await expectReplicasConverged(ticketId);
    await expectCurrent(a);
    await expectCurrent(b);
  });
});

describe('S4 — visibility narrowed while offline: contest up, NO purge down, a stale copy until re-widened', () => {
  /**
   * ## THE PLAN'S PREMISE FOR THIS SCENARIO IS HALF FALSE, AND THIS IS THE HALF
   *
   * The plan's S4 asserts "purge on sync-down": after `visibility.set` narrows
   * a ticket away from B, B's replica is to hold NO content for it —
   * `getTicket` null, `listEntityEvents` empty, the offline search blank —
   * with only the claimant's own contest stub surviving.
   *
   * **There is no purge on `visibility.set` in the shipped product.** The
   * per-event visibility walk that once emitted `purge` for every
   * `visibility.set` / `ticket.reparented` was struck by the controller
   * (coordination cases 6.101 and 6.104; `visible-events-for.ts`'s
   * `PurgeInstruction` docblock carries the argument — naming a ticket id to a
   * device that never held it is a disclosure, and "could they see it BEFORE"
   * is a question the projection keeps no history to answer). A purge is now
   * a per-BOUNDARY instruction only: `membership.revoked` or
   * `project.member_removed`. The residual is an UNDER-purge, taken
   * deliberately: a member un-shared by a plain `visibility.set` keeps the
   * stale copy until a full resync.
   *
   * So the sync-down half of the plan's S4 asserts a product that does not
   * exist, and a rig bent to make it pass would be a harness excusing the
   * server from existing. This scenario asserts what the server ACTUALLY does
   * to a narrowed-out replica, exactly:
   *
   * - **Down: nothing.** `visibleEventsFor` yields neither the narrowing
   *   `visibility.set` nor the `claim.contested` that follows it — both are
   *   events on a ticket B cannot see NOW — and, by the hub's cursor rule (only
   *   a DELIVERED envelope moves it), B's cursor does not advance. B keeps the
   *   ticket, its history, and its searchable title, all one `visibility.set`
   *   behind the truth.
   * - **Up: the contest-up half of the plan HOLDS.** The queued edit is refused
   *   at the gated door by `checkVisibilityPermission` with
   *   `permission.visibility` / "This ticket is not visible to you." — the
   *   rule the plan named, spelled by `VISIBILITY_REFUSAL_RULE`, which
   *   `sync-service.ts` defines AS `PERMISSION_VISIBILITY_RULE` — and, the
   *   entity being a ticket, recorded as a `claim.contested` event. B's only
   *   record of it is the stub `outbox.applyResult` writes from the sync
   *   response (`outbox.ts`: "or never arrives, if visibility was lost with
   *   the refusal, and then this stub is the claimant's only record").
   * - **Viewers see it.** A, still listed, receives the `visibility.set` and
   *   the contest as ledger history.
   * - **Re-widening re-delivers HERE — and that is a property of this
   *   scenario's shape AND, since closure 5, of the product.** Once A puts the
   *   ticket back on `'project'` mode, B drains the narrowing, the contest and
   *   the widening in order and the replicas converge exactly.
   *
   *   **WHAT THIS PARAGRAPH USED TO SAY, and why the correction is worth
   *   keeping:** it read "this works ONLY because B's cursor is still BELOW the
   *   narrowing", and that was true when written. The cursor is the highest
   *   `workspaceSeq` DELIVERED (`rig.ts`'s `syncDown`, mirroring `hub.ts`), so
   *   any later visible event carried it past the invisible rows and
   *   re-widening delivered only the widening — measured as case 12.274, a
   *   permanent divergence with no purge, no backfill and no resync path.
   *   Ruling P37 assigned that gap and `visibility/grant-backfill.ts` closes
   *   it: a widening now hands back the ticket's pre-cursor history to everyone
   *   in the new audience, cursor notwithstanding.
   *
   *   So THIS scenario's convergence no longer depends on its own quietness,
   *   and the case that proves the difference is **12.275**, which runs the
   *   noisy shape — one unrelated visible commit between narrow and widen — and
   *   asserts B's cursor really did pass the narrowing before converging.
   *   Nothing below changed; only the reason it holds did.
   *
   * What this scenario does NOT prove: that the retained copy is ever purged
   * without a re-widening. It is not — that is case 6.104, recorded, owner
   * Plan 10 — and asserting its retention here is asserting the product, not
   * endorsing it.
   *
   * A is the ticket's CREATOR, which is what lets A author the `visibility.set`
   * at all: `checkVisibilityPermission`'s check 5 admits project-admin rights
   * or creatorship, and A is a plain member.
   */
  it('12.270 — the claim contests permission.visibility; B keeps a stale copy and lags the head; A sees the contest; re-widening converges both', async () => {
    const { ticketId, created } = await seedSharedTicket();
    // B offline edits.
    const edit = ticketEvent(USER_B, ticketId, 'ticket.field_set', { fieldId: 'title', value: 'B edited this offline' });
    expect(await b.submit(edit)).toEqual({ status: 'pending', eventId: edit.id });

    // Meanwhile visibility narrows to explicitly A alone. `payload.ticketId`
    // restates the entity — a disagreeing pair is refused (`visibilitySetPayload`).
    const narrow = ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'explicit', userIds: [USER_A] });
    await commitInteractive(USER_A, narrow);
    const headAfterNarrowing = await readStreamSeq(h.pool, h.workspaceId);
    const cursorBefore = await b.replica.getCursor(h.workspaceId);
    const heldBefore = await b.replica.listEntityEvents(ticketId);
    expect(heldBefore.map((e) => e.id)).toEqual([created.id]);
    expect(cursorBefore).toBeLessThan(headAfterNarrowing);

    await b.goOnline(); // pushes the edit → contested; then catches up → receives NOTHING

    // UP: the claim contested with the visibility rule, recorded as history.
    const contests = await h.contests();
    expect(contests).toHaveLength(1);
    const contest = contestFor(contests, edit.id);
    expect(contest).toMatchObject({
      original_event_id: edit.id,
      ticket_id: ticketId,
      claimant_id: USER_B,
      rule: VISIBILITY_REFUSAL_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
      resolved: false,
      original_event: edit,
    });
    const contestEventId = contest['contested_event_id'] as string;
    expect(await h.ledger(ticketId)).toEqual<LedgerRow[]>([
      { id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A },
      { id: narrow.id, type: 'visibility.set', seq: 2, actorId: USER_A },
      { id: contestEventId, type: 'claim.contested', seq: 3, actorId: USER_B },
    ]);
    // The refused edit moved nothing on the server.
    expect((await h.projTicket(ticketId))?.fields['title']).toMatchObject({ value: SHARED_TITLE, actorId: USER_A });

    // DOWN: NOTHING IS DELIVERED. This is the EXCLUDING half and the point of
    // the scenario — continued delivery to a narrowed-out replica is the
    // disclosure, and it is what a broken visibility gate would produce.
    // Asserted by ID, not by count: a count would pass if the wrong two events
    // arrived in place of these two.
    const heldAfter = await b.replica.listEntityEvents(ticketId);
    expect(heldAfter.map((e) => e.id)).not.toContain(narrow.id);
    expect(heldAfter.map((e) => e.id)).not.toContain(contestEventId);
    // …and the cursor did not move, because only a DELIVERED envelope moves it.
    expect(await b.replica.getCursor(h.workspaceId)).toBe(cursorBefore);

    // WHAT IS *RECORDED* HERE AND DELIBERATELY NOT ASSERTED — Ruling P35(a),
    // as amended after this lane raised the conflict below.
    //
    // MEASURED at this sha: B still holds its pre-narrowing copy in full —
    // `listEntityEvents` still equals `heldBefore` (one `ticket.created`),
    // `getTicket().confirmed` still holds the pre-narrowing state, and
    // `searchOfflineCopy('${SHARED_TITLE}')` still returns the ticket. That is
    // the accepted UNDER-PURGE RESIDUAL of case 6.104: the per-event purge walk
    // was DELETED rather than narrowed (ruling on 6.101), so a member un-shared
    // by a plain `visibility.set` keeps the stale copy until a full resync.
    //
    // **It is recorded and not asserted, on 6.104's own stated reason**: "a
    // test asserting 'no purge arrives' would harden the wrong half of a gap
    // this branch wants closed rather than preserved." 6.104's owner is
    // **Plan 10 — this plan**. An assertion here would therefore be a test that
    // whoever closes the gap must BREAK to fix it, with a comment insisting its
    // own redness is correct — and the cheap move at that moment is to repair
    // the test. The assertions kept above survive that fix: closing 6.104 adds
    // a purge INSTRUCTION, which removes state and does not move the cursor,
    // so "these two events never arrived" and "the cursor did not move" both
    // stay true. Retention does not.
    //
    // The claim is out of transit either way, and that IS asserted:
    expect(await b.outbox.pendingFor(ticketId)).toBeNull();
    expect(await b.outbox.queuedCount(h.workspaceId)).toBe(0);
    expect(await b.outbox.failedItems(h.workspaceId)).toEqual([]);
    // …and the claimant keeps an honest record of their own contested claim:
    // the outbox's stub from the sync response, carrying the server's rule,
    // reason and contest id — but the DEVICE's clock, because the envelope that
    // would correct it is on a ticket B cannot see.
    const stubs = await b.ds.query.listContests(h.workspaceId, { claimantId: USER_B, open: true });
    expect(stubs).toEqual([
      expect.objectContaining({
        contestedEventId: contestEventId,
        originalEventId: edit.id,
        workspaceId: h.workspaceId,
        ticketId,
        claimantId: USER_B,
        rule: VISIBILITY_REFUSAL_RULE,
        reason: TICKET_NOT_VISIBLE_REASON,
        originalEvent: edit,
        resolved: false,
        resolution: null,
      }),
    ]);
    expect((await b.ds.query.myWork(h.workspaceId, USER_B)).contested).toEqual(stubs);

    // A, still listed, sees both the narrowing and the contest as history.
    await a.syncDown();
    expect((await a.replica.listEntityEvents(ticketId)).map((e) => e.type)).toEqual([
      'ticket.created',
      'visibility.set',
      'claim.contested',
    ]);
    const onA = await a.replica.getTicket(ticketId);
    expect(onA?.contests).toEqual([
      expect.objectContaining({
        contestedEventId: contestEventId,
        originalEventId: edit.id,
        claimantId: USER_B,
        rule: VISIBILITY_REFUSAL_RULE,
        contestedAt: instantOf(contest['contested_at']),
      }),
    ]);
    // Control: A's copy is the SERVER's, not a stub — A never queued anything.
    expect(onA?.confirmed?.fields['title']?.value).toBe(SHARED_TITLE);
    await expectCurrent(a);
    // Control on B: the two replicas do NOT yet agree on this ticket, so the
    // convergence below is something the re-widening has to DO rather than a
    // state both were already in.
    //
    // Compared on the ONE field that differs — `contestedAt` — rather than with
    // `not.toEqual` on the whole object. The stub carries B's device clock
    // (`outbox.ts`, `new Date()`) and the server's envelope carries the ingest
    // clock; every other field is identical. A whole-object `not.toEqual` would
    // therefore be a WALL-CLOCK race: two calls landing in the same millisecond
    // make the objects equal and redden a correct scenario. It fails safe
    // rather than falsely green, but the rig's claim is to be deterministic
    // without timers, and this keeps it so.
    const bStubBefore = (await b.replica.getTicket(ticketId))?.contests?.[0];
    expect(bStubBefore?.contestedEventId).toBe(contestEventId);
    expect(bStubBefore?.contestedAt).not.toBe(instantOf(contest['contested_at']));

    // RE-WIDEN. **Recoverable HERE because B's cursor never passed the
    // narrowing** — not because the product backfills on grant. It does not
    // (case 12.274 records the measurement). Asserted as the behaviour of this
    // shape, and the docblock above says which shape it is.
    const widen = ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'project' });
    await commitInteractive(USER_A, widen);
    await b.syncDown();
    await a.syncDown();
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toEqual([
      created.id,
      narrow.id,
      contestEventId,
      widen.id,
    ]);
    await expectReplicasConverged(ticketId);
    await expectCurrent(a);
    await expectCurrent(b);
  });
});

describe('S5 — the offline reopen pair contests coherently when the world changed', () => {
  /**
   * The reopen dialog's pair, judged offline against a stale assignment:
   * creating a child under a Done parent refuses locally
   * (`hierarchy.parent-terminal`, the dialog trigger); B accepts the dialog,
   * which queues the parent's reopen and re-issues the child — legal locally,
   * because B's replica still believes B is the assignee and the overlay folds
   * the reopen before judging the child. The server, where A has the
   * assignment back, refuses BOTH, each for its own reason: the reopen on
   * `restrict-to`, and then the child on `hierarchy.parent-terminal`, because
   * the parent it was to be born under is still finished.
   *
   * ## Two things this scenario records about the product
   *
   * 1. **The child's contest attaches to the CHILD's ticket id** — the entity
   *    the refused claim addressed — though that ticket never came to exist.
   *    Its ledger is exactly one `claim.contested` at seq 1.
   * 2. **That contest streams to NOBODY.** `canSee` answers false for a ticket
   *    with no `proj_visibility` row (unknown and invisible are the same
   *    answer, by design), so `visibleEventsFor` never yields the child's
   *    contest to A OR to B. A learns nothing of it; B holds only the
   *    outbox's response stub. And because the hub's cursor rule advances only
   *    on a DELIVERED envelope, both replicas' cursors stand one below the
   *    stream head AT THIS INSTANT.
   *
   *    **What is PERMANENT is the NON-DELIVERY, not the lag** — an earlier
   *    version of this comment said the cursors stay at `head - 1` for good,
   *    and that is false. The next visible envelope in this workspace carries
   *    both cursors past the invisible row (measured: after one `field_set` on
   *    the parent, head 8 and both cursors 8, with the child's contest still
   *    reaching neither replica). The value `head - 1` is also incidental to
   *    BATCH ORDER: the reopen is submitted before the child, so the child's
   *    contest happens to be the head row; child-first would leave the cursors
   *    AT head with the same non-delivery. The assertion below is therefore a
   *    fact about this scenario's ordering, and the durable claim is the one
   *    above it — the child's contest reaches nobody, ever.
   *
   *    The parent's contest, on a ticket both
   *    can see, streams normally. The plan asserted `myWork(...).contested`
   *    has two entries for B; it does — one from the server, one a stub — and
   *    that difference is asserted rather than glossed.
   *
   * The local refusal's sentence and the server's contest reason for the child
   * are asserted EQUAL: the same `parentTerminalRefusal` over the same title
   * and the same state name, answered offline first (spec §5).
   *
   * The rig's flush-then-catch-up order is benign here: both queued claims are
   * refused by the server, so nothing folds through the flush door, and the
   * catch-up that follows delivers A's re-assignment and the parent's contest.
   * The replica's INTERMEDIATE state is not asserted.
   */
  /**
   * 12.34 — re-filed as 12.272: the offline reopen pair each contest coherently with their own exact rules (restrict-to on the parent side, hierarchy.parent-terminal on the child's locally-refused create), with nothing in the ticket state moved by either.
   */
  it('12.272 — reopen refused restrict-to, child then refused hierarchy.parent-terminal — two contests, exact rules and reasons', async () => {
    // Parent assigned to A and finished by A (A is the assignee, so `todo → done` passes).
    const { ticketId: parentId, created } = await seedSharedTicket();
    const assignA1 = ticketEvent(USER_A, parentId, 'ticket.assigned', { assigneeId: USER_A });
    const finish = ticketEvent(USER_A, parentId, 'ticket.transitioned', { to: 'done' });
    await commitInteractive(USER_A, assignA1);
    await commitInteractive(USER_A, finish);
    await a.syncDown();
    await b.syncDown();
    expect((await b.replica.getTicket(parentId))?.confirmed).toMatchObject({ stateId: 'done', assigneeId: USER_A });

    // B offline: a child under a Done parent refuses LOCALLY — the dialog trigger.
    const childId = newUlid();
    const child = ticketEvent(USER_B, childId, 'ticket.created', {
      typeId: HARNESS_SUB_TASK_TYPE_ID,
      projectId: h.projectId,
      parentId,
      title: 'Needs the parent open',
    });
    const bare = await b.submit(child);
    expect(bare).toEqual({
      status: 'refused',
      eventId: child.id,
      rule: 'hierarchy.parent-terminal',
      reason: parentTerminalReason(SHARED_TITLE, 'Done'),
    });
    // A refusal queues nothing — the pre-check answered, nothing is in transit.
    expect(await b.outbox.queuedCount(h.workspaceId)).toBe(0);
    expect(await b.outbox.pendingFor(childId)).toBeNull();

    // For the pair to pass LOCALLY but contest on the server, B's replica must
    // be stale: A hands the parent to B, B syncs (reopen now locally legal),
    // then A takes it back while B is offline.
    const assignB = ticketEvent(USER_A, parentId, 'ticket.assigned', { assigneeId: USER_B });
    await commitInteractive(USER_A, assignB);
    await b.syncDown();
    const assignA2 = ticketEvent(USER_A, parentId, 'ticket.assigned', { assigneeId: USER_A });
    await commitInteractive(USER_A, assignA2);
    expect((await b.replica.getTicket(parentId))?.confirmed?.assigneeId).toBe(USER_B); // stale
    expect((await h.projTicket(parentId))?.assigneeId).toBe(USER_A); // true

    // B accepts the dialog: the reopen carries its cause, then the child again.
    const reopen = ticketEvent(USER_B, parentId, 'ticket.transitioned', {
      to: 'todo',
      cause: { kind: 'reopened-for-child', childTicketId: childId },
    });
    expect(await b.submit(reopen)).toEqual({ status: 'pending', eventId: reopen.id });
    // The overlay folds the queued reopen, so the SAME child claim now passes.
    expect(await b.submit(child)).toEqual({ status: 'pending', eventId: child.id });
    // The pending world as B honestly sees it: parent reopened, child born
    // under it, findable by title on the offline copy (case 12.188) — and none
    // of it settled: the server has nothing.
    expect(await b.outbox.pendingFor(parentId)).toMatchObject({
      pendingEventIds: [reopen.id],
      pending: expect.objectContaining({ stateId: 'todo', stateCategory: 'open' }),
    });
    expect(await b.outbox.pendingFor(childId)).toMatchObject({
      pendingEventIds: [child.id],
      pending: expect.objectContaining({ parentId, stateId: 'todo', typeId: HARNESS_SUB_TASK_TYPE_ID }),
    });
    expect((await b.ds.query.searchOfflineCopy(h.workspaceId, 'Needs the parent open')).hits).toEqual([
      { ticketId: childId, title: 'Needs the parent open' },
    ]);
    expect(await b.replica.getTicket(childId)).toBeNull();
    expect(await h.ledger(childId)).toEqual([]);

    await b.goOnline();
    await a.syncDown();

    const contests = await h.contests();
    expect(contests).toHaveLength(2);
    const reopenContest = contestFor(contests, reopen.id);
    const childContest = contestFor(contests, child.id);
    expect(reopenContest).toMatchObject({
      ticket_id: parentId,
      claimant_id: USER_B,
      rule: REFUSAL_RULES.restrictTo,
      reason: restrictToAssigneeReason(USER_B),
      resolved: false,
      original_event: reopen,
    });
    expect(childContest).toMatchObject({
      ticket_id: childId,
      claimant_id: USER_B,
      rule: 'hierarchy.parent-terminal',
      reason: parentTerminalReason(SHARED_TITLE, 'Done'),
      resolved: false,
      original_event: child,
    });
    // The server said, character for character, what the device said first.
    if (bare.status !== 'refused') throw new Error('unreachable: asserted refused above');
    expect(childContest['reason']).toBe(bare.reason);

    const reopenContestId = reopenContest['contested_event_id'] as string;
    const childContestId = childContest['contested_event_id'] as string;
    expect(await h.ledger(parentId)).toEqual<LedgerRow[]>([
      { id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A },
      { id: assignA1.id, type: 'ticket.assigned', seq: 2, actorId: USER_A },
      { id: finish.id, type: 'ticket.transitioned', seq: 3, actorId: USER_A },
      { id: assignB.id, type: 'ticket.assigned', seq: 4, actorId: USER_A },
      { id: assignA2.id, type: 'ticket.assigned', seq: 5, actorId: USER_A },
      { id: reopenContestId, type: 'claim.contested', seq: 6, actorId: USER_B },
    ]);
    // The child's contest is on the CHILD's stream — the whole of that stream.
    expect(await h.ledger(childId)).toEqual<LedgerRow[]>([
      { id: childContestId, type: 'claim.contested', seq: 1, actorId: USER_B },
    ]);
    // Nothing moved and nothing was born, on the server…
    expect(await h.projTicket(parentId)).toMatchObject({ stateId: 'done', assigneeId: USER_A });
    expect((await h.projTicket(parentId))?.transitions).toHaveLength(1); // A's finish alone; no reopen logged
    expect(await h.projTicket(childId)).toBeNull();
    // …nor on A, who sees the parent's contest and nothing of the child at all.
    const parentOnA = await a.replica.getTicket(parentId);
    expect(parentOnA?.confirmed).toMatchObject({ stateId: 'done', assigneeId: USER_A });
    expect(parentOnA?.contests.map((c) => c.originalEventId)).toEqual([reopen.id]);
    expect(await a.replica.getTicket(childId)).toBeNull();
    expect(await a.replica.listContests(h.workspaceId, { ticketId: childId })).toEqual([]);
    // …nor on B: the offline-born child is gone from every door (its claim
    // was answered), and the parent is back to the truth.
    expect(await b.replica.getTicket(childId)).toBeNull();
    expect(await b.outbox.pendingFor(childId)).toBeNull();
    expect(await b.outbox.pendingFor(parentId)).toBeNull();
    expect((await b.ds.query.searchOfflineCopy(h.workspaceId, 'Needs the parent open')).hits).toEqual([]);
    expect((await b.replica.getTicket(parentId))?.confirmed).toMatchObject({ stateId: 'done', assigneeId: USER_A });
    // B's attention holds BOTH — the parent's from the server's envelope, the
    // child's as the response stub that no stream will ever correct.
    const attention = (await b.ds.query.myWork(h.workspaceId, USER_B)).contested;
    expect(attention.map((c) => c.originalEventId).sort()).toEqual([child.id, reopen.id].sort());
    expect(attention.find((c) => c.originalEventId === reopen.id)).toMatchObject({
      contestedEventId: reopenContestId,
      ticketId: parentId,
      contestedAt: instantOf(reopenContest['contested_at']),
    });
    expect(attention.find((c) => c.originalEventId === child.id)).toMatchObject({
      contestedEventId: childContestId,
      ticketId: childId,
      rule: 'hierarchy.parent-terminal',
      reason: parentTerminalReason(SHARED_TITLE, 'Done'),
      originalEvent: child,
    });
    // The parent converges exactly. The cursor values below are a fact about
    // THIS scenario's batch order at THIS instant, not a permanent state — see
    // the docblock. What is durable is that the child's contest reached neither
    // replica, which is asserted above by id.
    await expectReplicasConverged(parentId);
    const head = await readStreamSeq(h.pool, h.workspaceId);
    expect(await a.replica.getCursor(h.workspaceId)).toBe(head - 1);
    expect(await b.replica.getCursor(h.workspaceId)).toBe(head - 1);
  });
});

describe('S6 — the same batch twice: idempotent to the byte', () => {
  /**
   * A retrying client lands one outbox batch twice. Through the REAL sync door
   * — `Harness.sync` is the object `POST /v1/sync` delegates to, and the same
   * call `goOnline`'s transport makes — so a duplicate-suppression bug living
   * in per-instance state would be visible here where the plan's second
   * `createSyncService` (which does not compile: `serverAppend` is required)
   * would have hidden it.
   *
   * The batch is fed to the door directly, as the plan intends, because B's
   * own pre-check would refuse the illegal half (B's replica knows A is the
   * assignee) and the point is the SERVER's idempotency, not the device's
   * honesty. The two replicas then catch up, so the doubled batch is also
   * shown to leave one ledger both fold identically.
   */
  /**
   * 12.35 — re-filed as 12.273: replaying the same batch of two real POST /v1/sync calls through the object the route delegates to is byte-identical, compared with toEqual over both the committed and contested results.
   */
  it('12.273 — replaying a mixed committed/contested batch changes nothing', async () => {
    const { ticketId, created } = await seedSharedTicket();
    const assignA = ticketEvent(USER_A, ticketId, 'ticket.assigned', { assigneeId: USER_A });
    await commitInteractive(USER_A, assignA);

    const legal = ticketEvent(USER_B, ticketId, 'ticket.field_set', { fieldId: 'title', value: 'kept' });
    const illegal = ticketEvent(USER_B, ticketId, 'ticket.transitioned', { to: 'done' }); // assignee-only; A's

    const first = await h.sync(USER_B, [legal, illegal]);
    const ledgerAfterFirst = await h.ledger(ticketId);
    const contestsAfterFirst = await h.contests();
    const headAfterFirst = await readStreamSeq(h.pool, h.workspaceId);

    const second = await h.sync(USER_B, [legal, illegal]);

    expect(second).toEqual(first); // identical answers: same seqs, same instant, same contest id
    expect(first).toEqual([
      { status: 'committed', eventId: legal.id, seq: 3, workspaceSeq: expect.any(Number), serverTime: expect.any(String) },
      {
        status: 'contested',
        eventId: illegal.id,
        rule: REFUSAL_RULES.restrictTo,
        reason: restrictToAssigneeReason(USER_B),
        contestEventId: expect.any(String),
      },
    ]);
    const contestEventId = (first[1] as { contestEventId: string }).contestEventId;
    // Not one event more, and not one contest more. The ledger and the
    // projection are the witnesses, not the answer shape.
    expect(await h.ledger(ticketId)).toEqual(ledgerAfterFirst);
    expect(ledgerAfterFirst).toEqual<LedgerRow[]>([
      { id: created.id, type: 'ticket.created', seq: 1, actorId: USER_A },
      { id: assignA.id, type: 'ticket.assigned', seq: 2, actorId: USER_A },
      { id: legal.id, type: 'ticket.field_set', seq: 3, actorId: USER_B },
      { id: contestEventId, type: 'claim.contested', seq: 4, actorId: USER_B },
    ]);
    expect(await h.contests()).toEqual(contestsAfterFirst);
    expect(contestsAfterFirst).toHaveLength(1);
    expect(contestFor(contestsAfterFirst, illegal.id)).toMatchObject({
      contested_event_id: contestEventId,
      ticket_id: ticketId,
      claimant_id: USER_B,
      rule: REFUSAL_RULES.restrictTo,
      original_event: illegal,
    });
    // The workspace stream did not move either — a retry appends nothing anywhere.
    expect(await readStreamSeq(h.pool, h.workspaceId)).toBe(headAfterFirst);
    expect(await h.projTicket(ticketId)).toMatchObject({
      stateId: 'todo',
      assigneeId: USER_A,
      fields: { title: expect.objectContaining({ value: 'kept', actorId: USER_B }) },
    });

    // Both replicas catch up on the doubled batch's one ledger and agree.
    await a.syncDown();
    await b.syncDown();
    expect((await b.replica.getTicket(ticketId))?.contests.map((c) => c.contestedEventId)).toEqual([contestEventId]);
    await expectReplicasConverged(ticketId);
    await expectCurrent(a);
    await expectCurrent(b);
  });
});

describe('S7 — typed links: add, a reverse refused at the server, remove; the replica holds the server state, links included', () => {
  /**
   * 27.062 (typed-links T4). A links T1 blocks T2 while B, offline and not yet
   * told, files T2 blocks T1. B's local pre-check passes (B's replica holds no
   * link), and the server, which holds T1 blocks T2 by then, contests it
   * `link.reverse`. A then removes the link. After every step the replica's
   * TicketState equals the server's `rowToTicketState` (`projTicket`), so the
   * fold of both link events and the projection's `links` column agree.
   */
  it('27.062 — links fold the same on the server and both replicas, through add, a contested reverse, and remove', async () => {
    const { ticketId: T1 } = await seedSharedTicket();
    const { ticketId: T2 } = await seedSharedTicket();

    // B, offline and unaware of A's link, files the reverse.
    const reverse = ticketEvent(USER_B, T2, 'ticket.link_added', { kind: 'blocks', targetId: T1 });
    expect(await b.submit(reverse)).toEqual({ status: 'pending', eventId: reverse.id });

    // Step 1: A links T1 blocks T2.
    const add = ticketEvent(USER_A, T1, 'ticket.link_added', { kind: 'blocks', targetId: T2 });
    expect(await a.submit(add)).toEqual({ status: 'pending', eventId: add.id });
    await a.goOnline();
    await a.syncDown();
    expect((await h.projTicket(T1))?.links).toEqual([{ kind: 'blocks', targetId: T2 }]); // precondition: the comparison holds a link
    expect((await a.replica.getTicket(T1))?.confirmed).toEqual(await h.projTicket(T1));

    // Step 2: B's reverse reaches the server, which refuses it as a contest.
    await b.goOnline();
    await a.syncDown();
    await b.syncDown();
    const contest = contestFor(await h.contests(), reverse.id);
    expect(contest).toMatchObject({
      ticket_id: T2,
      claimant_id: USER_B,
      rule: 'link.reverse',
      reason: `"${SHARED_TITLE}" already blocks "${SHARED_TITLE}".`,
    });
    expect('links' in ((await h.projTicket(T2)) ?? {})).toBe(false); // the refused claim moved nothing
    await expectReplicasConverged(T1);
    await expectReplicasConverged(T2);

    // Step 3: A removes the link.
    const remove = ticketEvent(USER_A, T1, 'ticket.link_removed', { kind: 'blocks', targetId: T2 });
    expect(await a.submit(remove)).toEqual({ status: 'pending', eventId: remove.id });
    await a.goOnline();
    await a.syncDown();
    await b.syncDown();
    expect('links' in ((await h.projTicket(T1)) ?? {})).toBe(false);
    await expectReplicasConverged(T1);
    await expectCurrent(a);
    await expectCurrent(b);
  });
});

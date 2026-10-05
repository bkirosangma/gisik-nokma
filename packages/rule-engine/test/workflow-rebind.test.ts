import { describe, expect, it } from 'vitest';
import type { EventEnvelope, PublishedWorkflowDef, TicketState } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketWorkflowRebound } from '../src/checks/workflow-rebind.js';
import { evaluateEvent } from '../src/evaluate.js';
import { REFUSAL_RULES } from '../src/refusal-rules.js';
import type { EngineContext } from '../src/engine.js';
import { OTHER_WS, PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

const T = '01J9GTKT000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

/**
 * The workflow on the OTHER side of a migration. Declared here rather than in
 * `test-support.ts` because only this suite needs two: `WF` is the ladder every
 * hierarchy test shares, and a second one in the shared builders would leave a
 * reader wondering which is the default.
 *
 * Its state ids are deliberately disjoint from `WF`'s (`intake`/`shipped`, not
 * `todo`/`done`): the two workflows are unrelated graphs, which is exactly why
 * the event names its destination instead of inferring one.
 */
const WF_OPS: PublishedWorkflowDef = {
  id: 'wf-ops',
  version: 1,
  name: 'Operations',
  initialStateId: 'intake',
  states: [
    { id: 'intake', name: 'Intake', category: 'open' },
    { id: 'shipped', name: 'Shipped', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'intake', rules: [] },
    { from: '*', to: 'shipped', rules: [] },
  ],
};

/** A second version that ADDS a state — what "latest, not pinned" has to mean. */
const WF_OPS_V2: PublishedWorkflowDef = {
  ...WF_OPS,
  version: 2,
  states: [...WF_OPS.states, { id: 'triage', name: 'Triage', category: 'active' }],
  transitions: [...WF_OPS.transitions, { from: '*', to: 'triage', rules: [] }],
};

function rebind(ticketId: string, toWorkflowId: string, toStateId: string): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.workflow_rebound',
    entity: { kind: 'ticket', id: ticketId },
    workspaceId: WS,
    // The one payload in this vocabulary whose destination field genuinely IS
    // `toStateId` (`events/ticket-events.ts:159-162`, pre-flight A10). Spelled
    // `to` here it would not parse.
    payload: { toWorkflowId, toStateId },
  });
}

/** One task on `wf-basic`, with `wf-ops` defined and available to migrate onto. */
const ctx = () => buildMemoryContext([WF, WF_OPS], [typeDefined(TASK), created(T, 'task', null)]);

/** `ticket.transitioned`/`ticket.closed`, in the domain's own dialect — `close.test.ts`'s pattern, needed here too for Rulings 52(b) and 53(i). */
const move = (to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { to } });
const close = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });

/**
 * Literal rule ids and literal, fully-interpolated reasons — never the builder
 * that produced them. A test that asserts the constant it is testing certifies a
 * typo in that constant as correct copy.
 */
describe('checkTicketWorkflowRebound', () => {
  /**
   * 5.47 — the PREMISE under case 5.43, asserted here rather than left to the neighbouring assertion. That a DIFFERENT workflow is accepted says the check works; it does not say the ticket’s own type binding resolves in this context, which is what the P13 argument rests on. The added line asserts that premise directly. It is true by construction — which is exactly why leaving it implicit cost the claim its evidence rather than making it wrong.
   */
  it('accepts a migration onto a different workflow at a state that workflow has', async () => {
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'shipped'), ctx())).toEqual({ refused: false });
  });

  it('resolves the target at its LATEST version, so a state a later version added is reachable', async () => {
    // `triage` exists only in v2. Asking for an exact version here would refuse a
    // migration onto a state the workflow currently has.
    const withV2 = buildMemoryContext([WF, WF_OPS, WF_OPS_V2], [typeDefined(TASK), created(T, 'task', null)]);
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'triage'), withV2)).toEqual({ refused: false });
  });

  it('planted defect: a rebound for a ticket that does not exist', async () => {
    expect(await checkTicketWorkflowRebound(rebind(GHOST, 'wf-ops', 'shipped'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
  });

  /**
   * THE LOAD-BEARING ONE. This event sets `stateId` directly and evaluates no
   * transition rule, because across two unrelated graphs there is no transition
   * to check. Permitted within one workflow it is a universal bypass: any actor
   * who can emit it reaches any state without satisfying `restrict-to`,
   * `require-comment`, `require-evidence`, `require-field` or
   * `require-different-user`, and without leaving the log entry four-eyes reads
   * (the reducer appends none). The reason names that, not the redundancy.
   */
  /**
   * 5.35 — a rebound to the ticket’s OWN workflow is refused `ticket.rebound-same-workflow`.
   */
  it('planted defect: a rebound to the workflow the ticket is already on', async () => {
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-basic', 'done'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.rebound-same-workflow',
      reason:
        "Ticket 01J9GTKT000000000000000000 is already on this workflow. Moving within a workflow is a transition, so that it can be checked against the workflow's own rules.",
    });
  });

  /**
   * The subject is the workflow the PAYLOAD names. This used to answer
   * `ticket.workflow-undefined` — "This ticket type's workflow has not been
   * defined yet, so the ticket would have no status." — which is false on this
   * path: the ticket's type is `task`, bound to `wf-basic`, which IS defined in
   * this very context. The borrowed sentence sent an admin to inspect a binding
   * that was not broken. Controller ruling P13, the third instance of the
   * defect class P11 and P12 closed.
   */
  it('planted defect: a rebound onto a workflow nobody defined names THAT workflow, not the type\'s binding', async () => {
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ghost', 'shipped'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.rebound-unknown-workflow',
      reason:
        'The workflow "wf-ghost" is not defined in this workspace, so there is nowhere to move this ticket to. Pick a workflow that has been published, or publish that one first.',
    });
    // The premise the refusal rests on, asserted rather than assumed: the
    // ticket's own type binding resolves in this same context, so the sentence
    // the old refusal told was false of the world it was told in.
    //
    // This line is the premise ITSELF — `task`'s workflow, looked up by the
    // binding on the type, answering non-null. The line below it is a NEIGHBOUR
    // of the premise: a different workflow being accepted says the check works,
    // not that the type's binding resolves. The premise happens to be true by
    // construction here (`buildMemoryContext`'s reducer throws on a
    // `ticket.created` whose type's workflow is undefined, `ticket-state.ts:103-107`),
    // which is exactly why asserting it costs one line and leaving it implicit
    // cost the claim its evidence.
    expect(await ctx().getWorkflowDef({ workspaceId: WS }, TASK.workflowId)).not.toBeNull();
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'shipped'), ctx())).toEqual({ refused: false });
  });

  /**
   * "The ledger accepts only what it can later replay" (spec §3): the reducer
   * throws on a rebound whose destination the target workflow does not have
   * (`ticket-state.ts:229-232`), so an accepted one would be unprojectable. The
   * state named is one of the OUTGOING workflow's, which is the mistake an
   * admin authoring a cross-workflow map actually makes.
   */
  /**
   * 5.34 — a rebound naming a state the target workflow does not have is refused `ticket.rebound-unknown-state`. The row’s other half — a rebound onto an undefined workflow naming THAT workflow rather than the type’s binding — is the test above.
   */
  it('planted defect: a rebound naming a state the target workflow does not have', async () => {
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'done'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.rebound-unknown-state',
      reason:
        'The workflow "Operations" has no state "done", so ticket 01J9GTKT000000000000000000 cannot be placed there.',
    });
  });

  it('planted defect: a ticket.workflow_rebound that does not point at a ticket', async () => {
    const env = makeEnvelope({
      type: 'ticket.workflow_rebound',
      entity: { kind: 'project', id: PROJECT },
      workspaceId: WS,
      payload: { toWorkflowId: 'wf-ops', toStateId: 'shipped' },
    });
    expect(await checkTicketWorkflowRebound(env, ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket.workflow_rebound event does not point at a ticket; it points at a project.',
    });
  });

  it('planted defect: a malformed payload REFUSES rather than throwing out of the engine', async () => {
    const env = makeEnvelope({
      type: 'ticket.workflow_rebound',
      entity: { kind: 'ticket', id: T },
      workspaceId: WS,
      payload: { toWorkflowId: 'wf-ops', toStateId: '' },
    });
    expect(await checkTicketWorkflowRebound(env, ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason:
        'This ticket.workflow_rebound event\'s payload is malformed: at toStateId: String must contain at least 1 character(s)',
    });
  });
});

/**
 * Order, staged two defects at a time. Every case above leaves exactly one
 * refusal available, so a check that answered them in any order would pass the
 * whole suite.
 */
describe('checkTicketWorkflowRebound — which refusal names the event when two are available', () => {
  it("the ticket's absence outranks an undefined target workflow: there is nothing to migrate", async () => {
    expect(await checkTicketWorkflowRebound(rebind(GHOST, 'wf-ghost', 'shipped'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
  });

  it('the same-workflow bypass outranks an unknown state: fixing the state would still be a bypass', async () => {
    // `wf-basic` has no `ghost-state`, so the unknown-state refusal is available
    // too — and offering it would send the actor to pick a valid state, after
    // which the event would be exactly the rule-free jump this refusal exists to
    // stop.
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-basic', 'ghost-state'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.rebound-same-workflow',
      reason:
        "Ticket 01J9GTKT000000000000000000 is already on this workflow. Moving within a workflow is a transition, so that it can be checked against the workflow's own rules.",
    });
  });
});

/**
 * The dispatch. Without it, deleting `case 'ticket.workflow_rebound'` from
 * `evaluate.ts` passes the whole suite and every same-workflow rebind — the
 * universal transition-rule bypass — is accepted through the pass-through
 * default.
 */
describe('evaluateEvent dispatches ticket.workflow_rebound', () => {
  it('routes the event to checkTicketWorkflowRebound rather than passing it through', async () => {
    expect(await evaluateEvent(rebind(T, 'wf-basic', 'done'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.rebound-same-workflow',
      reason:
        "Ticket 01J9GTKT000000000000000000 is already on this workflow. Moving within a workflow is a transition, so that it can be checked against the workflow's own rules.",
    });
  });
});

/**
 * Controller ruling P14's residual risk, made falsifiable — the one misuse the
 * compiler cannot catch.
 *
 * `TicketState` satisfies `TenantScope` structurally, so
 * `ctx.getWorkflowDef(ticket, p.toWorkflowId)` on the line below type-checks and
 * asks the question the TICKET's tenancy answers instead of the event's. It is
 * behaviour-preserving on every live path — ingest's entity-to-workspace guard
 * refuses an event filed against a ticket homed elsewhere, so the two are equal
 * by the time the engine runs — which means a mutation of that line survives the
 * whole suite unless something drives the two apart deliberately. This does.
 *
 * A hand-built context rather than `buildMemoryContext`: that context derives a
 * ticket's workspace from the event that created it, so the divergence this case
 * needs cannot be staged through it.
 */
describe('the scope threaded into the target-workflow lookup', () => {
  const ticketElsewhere: TicketState = {
    kind: 'ticket',
    id: T,
    workspaceId: OTHER_WS,
    projectId: PROJECT,
    typeId: 'task',
    parentId: null,
    workflowId: 'wf-basic',
    workflowVersion: 1,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {},
    transitions: [],
  };

  /**
   * 5.70 — the scope threaded into the target-workflow lookup on the rebind path is the EVENT’s workspace, never the resolved ticket’s.
   */
  it("is the EVENT's workspace, never the resolved ticket's", async () => {
    const asked: string[] = [];
    const spy: EngineContext = {
      getEntityState: async (kind, id) => (kind === 'ticket' && id === T ? ticketElsewhere : null),
      getChildrenStates: async () => [],
      getWorkflowDef: async (scope, workflowId) => {
        asked.push(scope.workspaceId);
        return workflowId === 'wf-ops' ? WF_OPS : null;
      },
      getTicketTypeDef: async () => TASK,
    };

    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'shipped'), spy)).toEqual({
      refused: false,
    });
    // `WS` is the rebind envelope's workspace; `OTHER_WS` is the ticket's. The
    // assertion is which one reached the store.
    expect(asked).toEqual([WS]);
    expect(asked).not.toContain(OTHER_WS);
  });
});

/**
 * 13.605 — Ruling 52(b), Finding 2 (final whole-branch review, 2026-09-17):
 * parked means parked. `target.states` never contains backlog (it is
 * universal, never declared — spec §1.1), so a bare
 * `target.states.some((state) => state.id === p.toStateId)` refused
 * `toStateId: 'backlog'` UNCONDITIONALLY — for a ticket already parked as
 * much as for one that was not, which is what made the bulk migration route
 * a dead end for any type holding a parked ticket (13.606, the server case).
 * Amendment 3's own rule — "a rebind is defined as landing a ticket in a
 * DECLARED state of the target workflow; parking it is a separate
 * Send-to-backlog move afterward" — is still correct for a ticket that is
 * NOT already parked, which the second case here pins: `Amendment 3 stands`
 * for exactly the case it was written for.
 */
describe('checkTicketWorkflowRebound — Ruling 52(b): a parked ticket rebinds onto backlog; a declared-state ticket still cannot', () => {
  it('13.605 accepts backlog -> backlog: a ticket already parked carries across as parked', async () => {
    // `move('backlog')` as a PRIOR event: `buildMemoryContext` folds it
    // unconditionally (no evaluation happens on a prior event — the same
    // reason 7.88/7.89 could plant an Object.prototype-named state), and the
    // universal Send-to-backlog edge makes `todo -> backlog` a real move a
    // live ticket could make, so this is not a state the reducer would ever
    // refuse to fold.
    const parkedCtx = buildMemoryContext([WF, WF_OPS], [typeDefined(TASK), created(T, 'task', null), move('backlog')]);
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'backlog'), parkedCtx)).toEqual({ refused: false });
  });

  it('13.605 still refuses a DECLARED-state ticket rebinding onto backlog (Amendment 3 stands)', async () => {
    // `ctx()` puts the ticket on `todo`, `wf-basic`'s own initial state — not
    // parked. The only thing that changed is the parked case above; this one
    // proves it did not become "any ticket may rebind onto backlog".
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'backlog'), ctx())).toEqual({
      refused: true,
      rule: 'ticket.rebound-unknown-state',
      reason: 'The workflow "Operations" has no state "backlog", so ticket 01J9GTKT000000000000000000 cannot be placed there.',
    });
  });
});

/**
 * 13.608 — Ruling 53(i), Finding 5 (final whole-branch review, 2026-09-17):
 * closed ⇒ terminal must survive a rebind, not only an ordinary transition.
 * `checkTicketWorkflowRebound` never read `ticket.closed` at all before this
 * fix, so a closed ticket in a terminal state could be rebound onto an
 * ACTIVE state of the target workflow with nothing to stop it —
 * `close-requires-terminal`'s own invariant, breached through the one door
 * that never asked. `WF_OPS_V2` (already declared above, for the
 * "latest, not pinned" case) is reused rather than duplicated: it carries
 * both an active state (`triage`) and a terminal one (`shipped`) at the
 * SAME version, which is exactly what these two cases need side by side.
 */
describe('checkTicketWorkflowRebound — Ruling 53(i): closed tickets may only migrate to a terminal state', () => {
  /** `wf-basic`'s ticket, moved to `done` (terminal) and closed. */
  const closedCtx = () => buildMemoryContext([WF, WF_OPS, WF_OPS_V2], [typeDefined(TASK), created(T, 'task', null), move('done'), close()]);

  it('13.608 refuses a closed ticket mapped to a non-terminal (active) target state, naming the reason verbatim', async () => {
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'triage'), closedCtx())).toEqual({
      refused: true,
      rule: REFUSAL_RULES.closedTicket,
      reason: 'This ticket is closed; a migration may only move it to a terminal state.',
    });
  });

  it('13.608 accepts a closed ticket mapped to ANOTHER terminal target state, and it commits still closed', async () => {
    const before = closedCtx();
    expect(await checkTicketWorkflowRebound(rebind(T, 'wf-ops', 'shipped'), before)).toEqual({ refused: false });

    // Committed and still closed: a SECOND context that also folds the
    // accepted rebind (prior events are folded unconditionally, exactly as
    // `checkTicketWorkflowRebound` above just approved), read back through
    // `getEntityState` rather than assumed from the accept alone.
    const after = buildMemoryContext(
      [WF, WF_OPS, WF_OPS_V2],
      [typeDefined(TASK), created(T, 'task', null), move('done'), close(), rebind(T, 'wf-ops', 'shipped')],
    );
    const ticket = (await after.getEntityState('ticket', T)) as TicketState;
    expect(ticket.workflowId).toBe('wf-ops');
    expect(ticket.stateId).toBe('shipped');
    expect(ticket.stateCategory).toBe('terminal');
    expect(ticket.closed).toEqual({ actorId: expect.any(String), at: expect.any(String) });
  });
});

import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema, isUlid, type TicketState, type WorkflowDef } from '@gisik-nokma/domain';
import { REFUSAL_RULES, evaluateEvent } from '@gisik-nokma/rule-engine';
import { createClientStateCache, type ClientStateCache } from '../src/cache.js';
import {
  PARENT_TERMINAL_RULE,
  completeForPrecheck,
  contextFromCache,
  precheckEvent,
  type PrecheckResult,
} from '../src/precheck.js';
import { makeSubmittedFactory } from '../src/submit.js';
import { PARENT, PROJECT, TICKET, WF_ERRAND, WS, ticketStateSeed } from './helpers/seed.js';

/**
 * ULID actor and ticket ids. The pre-check runs the REAL engine, and the events
 * it builds are the same events that go to the server's door — where `actorId`,
 * `workspaceId`, `entity.id` and `ticket.created`'s `projectId`/`parentId` are
 * all `ulidString`. `seed.ts`'s `user_kiro`-shaped actor ids are coordination
 * §5's known latent issue; nothing here relies on them.
 */
const ACTOR = '01J9GKRA000000000000000000';
const OTHER_ACTOR = '01J9GANS000000000000000000';
const NEW_TICKET = '01J9GNEW000000000000000000';
const CHILD = '01J9GCHD000000000000000000';

const make = makeSubmittedFactory({ actorId: ACTOR, origin: 'web' });

/**
 * ADAPTATION (map row 1). The shipped `ticket.transitioned` payload is
 * `{ to, comment?: { text }, evidenceAttachmentId?, cause? }`
 * (`packages/domain/src/workflow.ts`) — NOT the plan's `{ toStateId }`, and the
 * comment is an object, not a bare string. The engine `safeParse`s it, so the
 * plan's shape refuses `malformed-payload` rather than reaching any rule.
 */
function transitionTo(to: string, extras: Record<string, unknown> = {}) {
  return make({
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    payload: { to, ...extras },
  });
}

function reparentUnder(newParentId: string | null) {
  return make({
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.reparented',
    payload: { newParentId },
  });
}

function createUnder(parentId: string | null, ticketId = NEW_TICKET) {
  return make({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId: PROJECT, parentId, title: 'Follow-up' },
  });
}

/**
 * Version 2 of the errand workflow: the SAME state ids, one new guard on
 * doing -> waiting. Nothing structural changes, which is the point — a client
 * holding v1 sees an unguarded edge where the server sees a guarded one.
 */
const WF_ERRAND_V2: WorkflowDef = {
  ...WF_ERRAND,
  version: 2,
  transitions: WF_ERRAND.transitions.map((transition) =>
    transition.from === 'doing' && transition.to === 'waiting'
      ? { ...transition, rules: [{ kind: 'require-comment' as const }] }
      : transition,
  ),
};

/** A ticket read AFTER a republish: its snapshot names v2 while this client still holds v1. */
function ticketAtV2(): TicketState {
  return ticketStateSeed({
    id: TICKET,
    stateId: 'doing',
    stateCategory: 'active',
    workflowVersion: 2,
    transitions: [{ toStateId: 'doing', actorId: OTHER_ACTOR, seq: 3, workflowId: 'wf-errand', workflowVersion: 1 }],
  });
}

/** A cache holding the moving ticket, its workflow, and a vouched-empty child set. */
function readyCache(ticket: Partial<TicketState> = {}, def: WorkflowDef = WF_ERRAND): ClientStateCache {
  const cache = createClientStateCache();
  cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active', ...ticket }));
  cache.upsertWorkflowDef(def);
  cache.markChildrenComplete(TICKET, []);
  return cache;
}

/**
 * The rule a refusal names, or the kind it answered instead. Reporting the KIND
 * on a non-refusal keeps a failure legible: `expect(false).toBe('require-comment')`
 * says nothing about which property drifted.
 */
function ruleOf(result: PrecheckResult): string {
  return result.kind === 'refused' ? result.rule : result.kind;
}

describe('the ids this file feeds the real engine', () => {
  it('are the shape the envelope door demands', () => {
    expect([ACTOR, OTHER_ACTOR, NEW_TICKET, CHILD, TICKET, PARENT, PROJECT, WS].filter((id) => !isUlid(id))).toEqual([]);
  });
});

describe('precheckEvent — instant named-reason previews from the same engine the server runs', () => {
  it('previews a refusal with the rule named: require-comment without a comment', async () => {
    const result = await precheckEvent(transitionTo('done'), readyCache());
    expect(result).toEqual({
      kind: 'refused',
      rule: REFUSAL_RULES.requireComment,
      reason: 'This move must carry a comment explaining it, and none was provided.',
    });
  });

  it('passes the same transition once the comment rides along', async () => {
    const result = await precheckEvent(transitionTo('done', { comment: { text: 'filed at the portal' } }), readyCache());
    expect(result).toEqual({ kind: 'passed' });
  });

  /** The plan's `{ toStateId }` payload never reaches a rule — it dies at the engine's own door. */
  it("refuses the plan's obsolete payload shape as malformed, which is why it could not be transcribed", async () => {
    const stale = make({
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.transitioned',
      payload: { toStateId: 'done' },
    });
    const result = await precheckEvent(stale, readyCache());
    expect(ruleOf(result)).toBe(REFUSAL_RULES.malformedPayload);
  });

  it('previews an illegal transition by name', async () => {
    const result = await precheckEvent(transitionTo('waiting'), readyCache({ stateId: 'todo', stateCategory: 'open' }));
    expect(ruleOf(result)).toBe(REFUSAL_RULES.illegalTransition);
  });

  it('previews the parent-terminal invariant when the vouched child set really does hold an open child', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active' }));
    cache.upsertWorkflowDef(WF_ERRAND);
    cache.markChildrenComplete(TICKET, [
      ticketStateSeed({ id: CHILD, parentId: TICKET, stateId: 'doing', stateCategory: 'active' }),
    ]);
    const result = await precheckEvent(transitionTo('done', { comment: { text: 'done' } }), cache);
    expect(ruleOf(result)).toBe(REFUSAL_RULES.parentTerminal);
  });

  it('previews hierarchy.parent-terminal on create under a cached terminal parent — the reopen moment', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'done', stateCategory: 'terminal' }));
    const result = await precheckEvent(createUnder(PARENT), cache);
    expect(ruleOf(result)).toBe(PARENT_TERMINAL_RULE);
  });

  it('names the remedy in the reason, because the refusal exists to offer the reopen', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'done', stateCategory: 'terminal' }));
    const result = await precheckEvent(createUnder(PARENT), cache);
    expect(result.kind === 'refused' ? result.reason : result.kind).toContain('reopen');
  });

  /**
   * INVERTED by Plan 3 Chain A (2026-08-31), and this is the BEST case the
   * cache can offer: a parent cached, alive, and contradicting nothing. It
   * still defers, because a `passed` would have to be an accept, and every
   * engine accept for `ticket.created` is decided behind the ticket's own type
   * definition (`checks/hierarchy.ts:84`) — which this cache has no store for.
   */
  it('defers a create under a cached non-terminal parent — the accept reads a type rank this cache cannot serve', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'doing', stateCategory: 'active' }));
    expect(await precheckEvent(createUnder(PARENT), cache)).toEqual({
      kind: 'not-evaluated',
      why: 'missing-local-state',
    });
  });

  /**
   * The no-parent path is not the exception it looks like. `hierarchy.ts:84`
   * resolves the type BEFORE the no-parent branch at `:90`, and `:108` refuses
   * `hierarchy.deepest-rank-parent-required` off `type.rank` — so the old
   * unconditional `passed` was false for every type at or below the deepest
   * rank, not merely unproven.
   */
  it('defers a create with no parent at all — a rank it cannot read decides whether a parent was required', async () => {
    expect(await precheckEvent(createUnder(null), createClientStateCache())).toEqual({
      kind: 'not-evaluated',
      why: 'missing-local-state',
    });
  });

  it('previews the same refusal when LIVE work is reparented under a cached terminal parent', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'done', stateCategory: 'terminal' }));
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active' }));
    expect(ruleOf(await precheckEvent(reparentUnder(PARENT), cache))).toBe(PARENT_TERMINAL_RULE);
  });

  /**
   * MAP-MISSED ADAPTATION. The coordination doc and Plan 3 pin the reparent
   * half narrower than the plan's Task 6 text: a `ticket.reparented` refuses
   * only when it moves a NON-TERMINAL ticket under a terminal parent — "a
   * terminal child under a terminal parent stays legal because nothing
   * contradicts". Refusing here would invent a reopen nothing asked for.
   *
   * The narrow-refusal claim above is unchanged and still true. What changed
   * (Plan 3 Chain A, 2026-08-31) is the other half: NOT REFUSING is not the
   * same as passing, once the engine's accept for `ticket.reparented` reads a
   * definition (`checks/hierarchy.ts:215`) this cache cannot serve.
   */
  it('does not refuse a FINISHED ticket reparented under a terminal parent — but defers rather than passing', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'done', stateCategory: 'terminal' }));
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'done', stateCategory: 'terminal' }));
    expect(await precheckEvent(reparentUnder(PARENT), cache)).toEqual({
      kind: 'not-evaluated',
      why: 'missing-local-state',
    });
  });

  /** The seam Plan 10 reuses over its replica: the evaluator is injectable. */
  it('honours an injected evaluator in place of the shared engine', async () => {
    const result = await precheckEvent(transitionTo('done'), readyCache(), {
      evaluate: async () => ({ refused: false }),
    });
    expect(result).toEqual({ kind: 'passed' });
  });

  /**
   * A restrict-to that names only the assignee is decidable from the cache: the
   * snapshot carries `assigneeId`. Refusing here is honest, and downgrading it
   * would throw away the preview the feature exists for. Its twin — the
   * roles-bearing rule — is in the not-evaluated matrix below.
   */
  it('keeps an assignee-only restrict-to refusal, because the cache holds the assignee', async () => {
    const def: WorkflowDef = {
      ...WF_ERRAND,
      transitions: WF_ERRAND.transitions.map((transition) =>
        transition.to === 'done' ? { ...transition, rules: [{ kind: 'restrict-to', assignee: true }] } : transition,
      ),
    };
    const cache = readyCache({ assigneeId: OTHER_ACTOR }, def);
    const result = await precheckEvent(transitionTo('done'), cache);
    expect(ruleOf(result)).toBe(REFUSAL_RULES.restrictTo);
  });
});

/**
 * THE SAFE DIRECTION, PROVED AS A CLOSED SET.
 *
 * `passed` means: no rule the shared engine can evaluate refuses this claim,
 * AND every fact the verdict rested on came from server-served state this
 * client actually holds. Whenever a fact the verdict needs is one only the
 * server holds — a membership, a child this client has never seen, an
 * intermediate workflow version, the state of an uncached entity — the answer
 * is `not-evaluated`, never `passed`. A caller reading `not-evaluated` defers
 * to the server, which is exactly what it should do.
 *
 * Asserted as an exact record rather than with `toContain`: `toContain` cannot
 * see a scenario that answered `passed` when it should have deferred, and that
 * is the only failure this test exists to catch.
 *
 * NON-VACUOUS ONLY AS A SYSTEM. This record ALONE is satisfied by a pre-check
 * that answers `not-evaluated` to everything and previews nothing. What rules
 * that out is the company it keeps: the gate-LIFTING twins directly below, and
 * the thirteen preview tests above. Anyone trimming those as redundant guts this
 * one without touching it.
 */
describe('precheckEvent — coverage it does not have downgrades, and never fakes a pass', () => {
  it('answers not-evaluated on every path whose verdict would rest on state it does not hold', async () => {
    const kinds: Record<string, PrecheckResult['kind']> = {};

    kinds['the ticket is not cached'] = (await precheckEvent(transitionTo('done'), createClientStateCache())).kind;

    const noDef = createClientStateCache();
    noDef.upsertTicket(ticketStateSeed({ id: TICKET }));
    noDef.markChildrenComplete(TICKET, []);
    kinds['the workflow definition is not cached'] = (await precheckEvent(transitionTo('done'), noDef)).kind;

    const brokenChain = createClientStateCache();
    brokenChain.upsertTicket(ticketStateSeed({ id: TICKET, workflowVersion: 1 }));
    brokenChain.upsertWorkflowDef({ ...WF_ERRAND, version: 3 });
    brokenChain.markChildrenComplete(TICKET, []);
    kinds['an intermediate workflow version is missing from the chain'] = (
      await precheckEvent(transitionTo('done'), brokenChain)
    ).kind;

    kinds['no vouched child set for a move into a terminal state'] = (
      await precheckEvent(transitionTo('done', { comment: { text: 'filed' } }), (() => {
        const cache = createClientStateCache();
        cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active' }));
        cache.upsertWorkflowDef(WF_ERRAND);
        return cache;
      })())
    ).kind;

    const rolesDef: WorkflowDef = {
      ...WF_ERRAND,
      transitions: WF_ERRAND.transitions.map((transition) =>
        transition.to === 'done' ? { ...transition, rules: [{ kind: 'restrict-to', roles: ['admin'] }] } : transition,
      ),
    };
    kinds['a roles-based restrict-to refusal, memberships being server-side'] = (
      await precheckEvent(transitionTo('done'), readyCache({}, rolesDef))
    ).kind;

    kinds['a create under an uncached parent'] = (
      await precheckEvent(createUnder(PARENT), createClientStateCache())
    ).kind;

    kinds['a ticket event type the shared engine does not evaluate'] = (
      await precheckEvent(
        make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.assigned', payload: { assigneeId: null } }),
        readyCache(),
      )
    ).kind;

    kinds['an event about something that is not a ticket'] = (
      await precheckEvent(
        make({ workspaceId: WS, entity: { kind: 'project', id: PROJECT }, type: 'project.created', payload: { name: 'x' } }),
        readyCache(),
      )
    ).kind;

    // B1, TOP OF THE CHAIN. The cache HOLDS the proof a version is absent: the
    // ticket names v2 and the newest definition here is v1. `foldStateIdForward`
    // runs zero iterations when fromVersion exceeds latest.version and then only
    // containment-checks the id, so the state resolves cleanly against the WRONG
    // vocabulary and v1's unguarded edge is evaluated where the server evaluates
    // v2's guarded one. Destination 'waiting' is active, so gate 3 never engages.
    const aheadTicket = createClientStateCache();
    aheadTicket.upsertTicket(ticketAtV2());
    aheadTicket.upsertWorkflowDef(WF_ERRAND);
    aheadTicket.markChildrenComplete(TICKET, []);
    kinds['the ticket names a workflow version newer than the cached definition'] = (
      await precheckEvent(transitionTo('waiting'), aheadTicket)
    ).kind;

    // The same gap on the transition-log side: four-eyes skips an entry it
    // cannot resolve, so an entry above the cached latest disarms the rule
    // rather than refusing.
    const aheadEntry = createClientStateCache();
    aheadEntry.upsertTicket(
      ticketStateSeed({
        id: TICKET,
        stateId: 'doing',
        stateCategory: 'active',
        workflowVersion: 1,
        transitions: [{ toStateId: 'doing', actorId: OTHER_ACTOR, seq: 3, workflowId: 'wf-errand', workflowVersion: 2 }],
      }),
    );
    aheadEntry.upsertWorkflowDef(WF_ERRAND);
    aheadEntry.markChildrenComplete(TICKET, []);
    kinds['a transition-log entry names a version newer than the cached definition'] = (
      await precheckEvent(transitionTo('waiting'), aheadEntry)
    ).kind;

    const terminalParent = createClientStateCache();
    terminalParent.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'done', stateCategory: 'terminal' }));
    kinds['a reparent whose moving ticket is not cached'] = (
      await precheckEvent(reparentUnder(PARENT), terminalParent)
    ).kind;

    // B2. The twin of the create row below. Without it, a `claimedParentId`
    // that answered `null` ("no parent named") instead of `undefined` ("this
    // payload does not say") on a reparent parse failure survives every other
    // test in this file and turns an unreadable claim into a pass.
    kinds['a reparent whose payload the door itself would refuse'] = (
      await precheckEvent(
        make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.reparented', payload: { newParentId: 'not-a-ulid' } }),
        createClientStateCache(),
      )
    ).kind;

    kinds['a create whose payload the door itself would refuse'] = (
      await precheckEvent(
        make({ workspaceId: WS, entity: { kind: 'ticket', id: NEW_TICKET }, type: 'ticket.created', payload: { parentId: PARENT } }),
        createClientStateCache(),
      )
    ).kind;

    expect(kinds).toEqual({
      'the ticket is not cached': 'not-evaluated',
      'the workflow definition is not cached': 'not-evaluated',
      'an intermediate workflow version is missing from the chain': 'not-evaluated',
      'no vouched child set for a move into a terminal state': 'not-evaluated',
      'a roles-based restrict-to refusal, memberships being server-side': 'not-evaluated',
      'a create under an uncached parent': 'not-evaluated',
      'a reparent whose moving ticket is not cached': 'not-evaluated',
      'a ticket event type the shared engine does not evaluate': 'not-evaluated',
      'an event about something that is not a ticket': 'not-evaluated',
      'a create whose payload the door itself would refuse': 'not-evaluated',
      'a reparent whose payload the door itself would refuse': 'not-evaluated',
      'the ticket names a workflow version newer than the cached definition': 'not-evaluated',
      'a transition-log entry names a version newer than the cached definition': 'not-evaluated',
    });
  });

  it('says why, and the why is the one a caller can act on', async () => {
    expect(await precheckEvent(transitionTo('done'), createClientStateCache())).toEqual({
      kind: 'not-evaluated',
      why: 'missing-local-state',
    });
  });

  /**
   * The gates above are not "always defer": each one lifts the moment the
   * missing state arrives. Without these twins the matrix could be satisfied by
   * a pre-check that never evaluates anything.
   */
  it('lifts the version-chain gate once the intermediate version is cached', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, workflowVersion: 1 }));
    cache.upsertWorkflowDef({ ...WF_ERRAND, version: 2 });
    cache.upsertWorkflowDef({ ...WF_ERRAND, version: 3 });
    cache.markChildrenComplete(TICKET, []);
    const result = await precheckEvent(transitionTo('done'), cache);
    expect(ruleOf(result)).toBe(REFUSAL_RULES.requireComment);
  });

  it('lifts the child-set gate once a vouch arrives', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active' }));
    cache.upsertWorkflowDef(WF_ERRAND);
    cache.markChildrenComplete(TICKET, []);
    expect(await precheckEvent(transitionTo('done', { comment: { text: 'filed' } }), cache)).toEqual({ kind: 'passed' });
  });

  it('lifts the top-of-chain gate once the version the ticket names is cached, and then refuses on the NEW rule', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketAtV2());
    cache.upsertWorkflowDef(WF_ERRAND);
    cache.upsertWorkflowDef(WF_ERRAND_V2);
    cache.markChildrenComplete(TICKET, []);
    const result = await precheckEvent(transitionTo('waiting'), cache);
    expect(ruleOf(result)).toBe(REFUSAL_RULES.requireComment);
  });

  /**
   * And the same move against the definition the client used to hold PASSES —
   * which is what makes the gate above load-bearing rather than decorative: the
   * two vocabularies genuinely disagree about this edge.
   */
  it('the older definition really does answer differently, so the gate is not guarding a distinction without one', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active', workflowVersion: 1 }));
    cache.upsertWorkflowDef(WF_ERRAND);
    cache.markChildrenComplete(TICKET, []);
    expect(await precheckEvent(transitionTo('waiting'), cache)).toEqual({ kind: 'passed' });
  });

  /**
   * THE SIDE DOOR, END TO END. A vouched parent with one open child; a stream
   * frame touches that child. Targeted invalidation would drop the child and
   * keep the vouch, and this pre-check would answer `passed` for a move the
   * server refuses parent-terminal-with-open-children.
   */
  it('a stream frame touching a vouched child returns the move to not-evaluated, never to passed', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active' }));
    cache.upsertWorkflowDef(WF_ERRAND);
    cache.markChildrenComplete(TICKET, [
      ticketStateSeed({ id: CHILD, parentId: TICKET, stateId: 'doing', stateCategory: 'active' }),
    ]);
    cache.noteEvent({
      id: '01J9GEVT000000000000000000',
      workspaceId: WS,
      entity: { kind: 'ticket', id: CHILD },
      type: 'ticket.assigned',
      version: 1,
      payload: { assigneeId: null },
      actorId: ACTOR,
      origin: 'web',
      clientTime: '2026-08-20T09:01:00.000Z',
      serverTime: '2026-08-20T09:01:01.000Z',
      seq: 5,
    });
    const result = await precheckEvent(transitionTo('done', { comment: { text: 'filed' } }), cache);
    expect(result).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
  });
});

/**
 * CANARY, RE-AIMED — superseded in place on 2026-08-31, not deleted and not
 * greened. It fired exactly as written, and its firing is the record.
 *
 * The predecessor asserted that the shared engine had nothing to say about
 * `ticket.created` / `ticket.reparented`, so that Plan 3's landing would break
 * `app-core` loudly rather than quietly widening what a `passed` claims
 * (coordination §12 claim 2). Plan 3 Chain A landed both as engine cases and it
 * tripped. Two things followed in that same change set: `precheckParentTerminal`
 * stopped answering `passed` for either type, and `contextFromCache` gained the
 * required fourth `EngineContext` method.
 *
 * THE HONEST MECHANISM, stated because the designed one is not quite what
 * happened: it did not trip on a hierarchy RULE refusing a planted claim. It
 * trips at the ticket's own type lookup (`checks/hierarchy.ts:84` for creation,
 * `:215` for a reparent), which sits ahead of every hierarchy rule. So this
 * successor must not claim to witness the rules — it witnesses the DOOR, and
 * says so.
 *
 * What it pins, and why it cannot pass for an unrelated reason: it drives the
 * REAL engine through the REAL adapter, so it fails in BOTH directions. Remove
 * the dispatcher cases and the claim resolves without ever reaching the type
 * door, so no rejection is thrown. Change `getTicketTypeDef` back to answering
 * `null` and the engine refuses instead of rejecting. Either way this goes red,
 * which is what a drift-pin is for. The hierarchy RULES themselves are pinned
 * where they live — `packages/rule-engine/test/hierarchy.test.ts` and
 * `reparent.test.ts`, plus the fourteen Task 8 fixtures — and are deliberately
 * not re-asserted here, in another lane's file, over an unexported sentence.
 *
 * WHEN THIS ONE FAILS: the cache has grown a ticket-type store (Plan 6a) and a
 * producer feeding it (Plan 6 Task 7). That is the prompt to route
 * `precheckParentTerminal` through the engine and replace this a second time.
 */
describe('CANARY, re-aimed: the engine now reads ticket-type definitions this cache cannot serve', () => {
  it('rejects ticket.created and ticket.reparented at the type door — when it fails, the cache has grown types and precheckParentTerminal must route through the engine', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'done', stateCategory: 'terminal' }));
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active' }));
    const ctx = contextFromCache(cache);
    await expect(evaluateEvent(completeForPrecheck(createUnder(PARENT)), ctx)).rejects.toThrow(
      /ticket-type definitions/,
    );
    await expect(evaluateEvent(completeForPrecheck(reparentUnder(PARENT)), ctx)).rejects.toThrow(
      /ticket-type definitions/,
    );
  });

  /**
   * The other half of the same landing, at the surface a caller actually meets:
   * `precheckEvent` never lets that rejection escape, because it does not route
   * these two types through the engine at all. The exact `toEqual` is the
   * point — a `not.toEqual({kind:'passed'})` would pass on a refusal too.
   */
  it('and precheckEvent defers rather than propagating it, for the best case the cache can offer', async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, stateId: 'doing', stateCategory: 'active' }));
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing', stateCategory: 'active' }));
    expect(await precheckEvent(createUnder(PARENT), cache)).toEqual({
      kind: 'not-evaluated',
      why: 'missing-local-state',
    });
    expect(await precheckEvent(reparentUnder(PARENT), cache)).toEqual({
      kind: 'not-evaluated',
      why: 'missing-local-state',
    });
  });
});

/**
 * The provisional envelope exists ONLY inside a local evaluation. `seq: 0` is
 * not a plausible position — the ledger's first is 1 — so the completed
 * envelope cannot be mistaken for, or laundered into, a ledger fact: the
 * envelope door refuses it, and refuses it on `seq` and on nothing else.
 */
describe('completeForPrecheck — a stand-in that could never pass for a fact', () => {
  it('stamps the injected clock as the provisional serverTime', () => {
    const completed = completeForPrecheck(transitionTo('done'), () => new Date('2026-08-20T09:30:00.000Z'));
    expect(completed.serverTime).toBe('2026-08-20T09:30:00.000Z');
  });

  it('carries the claim through unchanged', () => {
    const submitted = transitionTo('done');
    const completed = completeForPrecheck(submitted);
    expect({ ...completed, serverTime: undefined, seq: undefined }).toEqual({
      ...submitted,
      serverTime: undefined,
      seq: undefined,
    });
  });

  it('is refused by the envelope door, on seq and on nothing else', () => {
    const parsed = eventEnvelopeSchema.safeParse(completeForPrecheck(transitionTo('done')));
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(['seq']);
  });
});

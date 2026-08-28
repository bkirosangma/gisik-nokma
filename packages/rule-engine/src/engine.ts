import type { EntityState, EventEnvelope, TicketState, WorkflowDef } from '@gisik-nokma/domain';

export type Refusal = { refused: true; rule: string; reason: string }; // reason: plain language, names the rule
export type Accept = { refused: false };
export type Verdict = Accept | Refusal;

/**
 * What a recorded contested claim looks like to a rule: the ticket it was filed
 * against, and whether a resolution has already landed on it. Nothing else —
 * the contest's own payload is history, not an input to a rule.
 *
 * Plan 10 declares this here rather than in a new `types.ts`: the plan's file
 * list names `src/types.ts`, but no such module exists and `Accept`,
 * `EngineContext` and `Refusal` have always lived in THIS file. Creating one
 * would compile clean — a second `EngineContext` whose `getContest` is optional
 * is structurally assignable from this one — and only fail where an object
 * literal meets an excess-property check, i.e. at runtime in the fixtures.
 */
export type ContestLookup = { ticketId: string; resolved: boolean };

export type EngineContext = {
  getEntityState(kind: EventEnvelope['entity']['kind'], id: string): Promise<EntityState | null>;
  getChildrenStates(ticketId: string): Promise<TicketState[]>;
  getWorkflowDef(workflowId: string, version?: number): Promise<WorkflowDef | null>;
  /**
   * Look up a recorded contested claim by the `claim.contested` event id.
   * Additive (Plan 10): implemented by the server context over its contest
   * projection, by the fixture harness over `priorEvents`, and by the offline
   * replica over its local contests table. OPTIONAL so every context that
   * predates contests still typechecks — which is exactly why the contest
   * evaluators throw rather than refuse when it is absent: a context that
   * cannot see contests has answered nothing about the world.
   */
  getContest?(contestedEventId: string): Promise<ContestLookup | null>;
};

/**
 * `evaluateEvent` used to live here as Plan 1's pass-through. Plan 2 replaced
 * it with the real dispatcher in `./evaluate.js`; the types above stayed,
 * because they are what the server, the fixture harness and every rule module
 * bind to. The signature Plan 1 froze is unchanged and remains cross-plan
 * contract: pure, no I/O, all state arrives through `ctx`.
 */

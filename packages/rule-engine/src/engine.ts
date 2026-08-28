import type {
  EntityState,
  EventEnvelope,
  TicketState,
  TicketTypeDef,
  WorkflowDef,
} from '@gisik-nokma/domain';

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
  /**
   * A ticket type's DEFINITION — rank, name, workflow binding, custom fields.
   *
   * A fourth method rather than a fourth answer from `getEntityState`, because
   * `getEntityState('ticket-type', id)` cannot serve one: `'ticket-type'` is an
   * `OtherEntityState` in the domain union — literally `{ kind, id }`, identity
   * and nothing else (`packages/domain/src/entity-state.ts:49-53`) — and the
   * server context returns exactly that, by design. Every hierarchy rank check
   * (Plan 3 Tasks 5–7) needs `rank`, so without this method not one of them is
   * implementable through the shipped context (pre-flight BA-4).
   *
   * The alternative — promoting `'ticket-type'` into a real `TicketTypeState`
   * in the domain union — was REJECTED (controller ruling P3, 2026-08-28): it
   * rewrites a union three lanes read concurrently, while this addition leaves
   * the union and the four identity-only kinds untouched and cannot regress any
   * existing `getEntityState` reader. `getEntityState('ticket-type', id)` keeps
   * answering identity-only FOREVER; the definition arrives here.
   *
   * Three implementations, and they must not drift: the reducer-backed memory
   * context (`./memory-context.js`, Plan 3 Task 4 — the first), the fixture
   * harness (`./fixtures/harness.js`, Task 8), and the server's Postgres-backed
   * context over `proj_ticket_types` (`apps/server/src/engine-context.ts`,
   * Task 12). The two later ones throw or answer null until their task lands,
   * loudly rather than quietly.
   */
  getTicketTypeDef(typeId: string): Promise<TicketTypeDef | null>;
};

/**
 * `evaluateEvent` used to live here as Plan 1's pass-through. Plan 2 replaced
 * it with the real dispatcher in `./evaluate.js`; the types above stayed,
 * because they are what the server, the fixture harness and every rule module
 * bind to. The signature Plan 1 froze is unchanged and remains cross-plan
 * contract: pure, no I/O, all state arrives through `ctx`.
 */

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

/**
 * The tenancy a DEFINITION lookup is asked inside — always the workspace of the
 * event under evaluation, never the workspace of a state a check has just
 * resolved.
 *
 * Controller ruling P14 (2026-08-31) is what put it here, and only on the two
 * lookups below that take it. Both resolve an id the ACTOR chose —
 * `getWorkflowDef(p.toWorkflowId)` on the rebind path, `getTicketTypeDef(p.typeId)`
 * on the create path — and neither answer carries a workspace for a check to
 * compare against afterwards: a `WorkflowDef` and a `TicketTypeDef` are
 * definitions, not entities. So the predicate cannot live in the check the way
 * ruling P12's parent guard does (`checks/hierarchy.ts`,
 * `parent.workspaceId !== env.workspaceId`), and a store keyed globally answered
 * a foreign id — the target-state check then ran against ANOTHER WORKSPACE'S
 * state graph and the rebind was ACCEPTED. The predicate lives on the lookup so
 * that no check can be the one that forgets it.
 *
 * An object rather than a bare `workspaceId: string` parameter, deliberately: a
 * second ULID-shaped string beside `workflowId` is a silent swap that compiles,
 * and an object beside a string is not.
 *
 * `EventEnvelope` satisfies it structurally, so every check passes `env`. **So
 * does `TicketState`, and that is the one misuse the compiler cannot catch** —
 * `ctx.getWorkflowDef(parent, parent.workflowId)` would type-check and would ask
 * the question the PARENT's tenancy answers instead of the event's. A resolved
 * state's `workspaceId` is the fact being CHECKED; it is never the fact doing
 * the checking. The two sites where that temptation is real are the
 * parent-terminal reason lookups in `checks/hierarchy.ts`, where the id and the
 * version come off the parent and only the scope comes off the event.
 */
export type TenantScope = { readonly workspaceId: string };

export type EngineContext = {
  /**
   * UNSCOPED, and deliberately (controller rulings P12 and P14 together). The
   * answer is an `EntityState` that carries its own `workspaceId`, so the
   * tenancy comparison stays in the check — `checks/hierarchy.ts` refuses
   * `hierarchy.unknown-parent` when `parent.workspaceId !== env.workspaceId` —
   * where it is one readable line and a test can plant a foreign parent and
   * watch it be refused. Adding a scope here would make that guard UNREACHABLE:
   * the reader would refuse the foreign parent on its own, the guard would
   * become a branch no input can take, and the assertion that pins it would
   * then pass with `workspaceId` missing from the server's row mapper — which
   * is the total-outage trap `apps/server/src/projections/tickets.ts` documents.
   * A check that cannot fail is this series' signature defect; this is the one
   * place where NOT adding a predicate is what keeps a check falsifiable.
   */
  getEntityState(kind: EventEnvelope['entity']['kind'], id: string): Promise<EntityState | null>;
  /** UNSCOPED for the same reason as `getEntityState`: every answer carries its own `workspaceId`. */
  getChildrenStates(ticketId: string): Promise<TicketState[]>;
  /** SCOPED (ruling P14) — see `TenantScope`. */
  getWorkflowDef(scope: TenantScope, workflowId: string, version?: number): Promise<WorkflowDef | null>;
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
   * FOUR implementations, and they must not drift (ruling P9, discharged by
   * Plan 3 Chain B Task 12): the reducer-backed memory context
   * (`./memory-context.js`, Plan 3 Task 4 — the first), the fixture harness
   * (`./fixtures/harness.js`, Task 8), the server's Postgres-backed context over
   * `proj_ticket_types` (`apps/server/src/engine-context.ts`, Task 12 — it
   * answers for real as of that task), and the client cache adapter
   * (`packages/app-core/src/precheck.ts`), which THROWS because it holds no
   * ticket-type store at all and `null` there would manufacture a refusal out of
   * an absence. Every note before this one said THREE; the fourth was counted
   * when Task 12 changed this signature and the compiler named every
   * implementation.
   *
   * SCOPED (ruling P14) — see `TenantScope`. A type id is a slug the ACTOR
   * chose (`epic`, `task`, `bug`), so an unscoped lookup hands one tenancy
   * another's rank, workflow binding and field list.
   */
  getTicketTypeDef(scope: TenantScope, typeId: string): Promise<TicketTypeDef | null>;
  /**
   * How many members of this workspace hold the `owner` role, optionally
   * ignoring one user — the subject of the change under judgement, because an
   * owner being demoted must not count themselves.
   *
   * SCOPED (ruling P14's shape, and for its reason): the id is a workspace, the
   * answer is a count over that one tenancy, and a caller that named another
   * workspace would be asking a question the actor has no standing to ask.
   *
   * A COUNT and not a list, deliberately: a check has no business reading other
   * members' rows, and a list would tempt one to.
   *
   * OPTIONAL so every context that predates this still typechecks — the same
   * shape, and the same consequence, as `getContest` above. A check that needs
   * it and cannot get it THROWS rather than refusing: a context that cannot
   * count owners has made no claim about the world, and "this change would
   * leave the workspace with no owner" is a claim about the world. Manufactured
   * from an absence it would be a sentence about the actor dressed as a fact
   * about their workspace.
   */
  countWorkspaceOwners?(scope: TenantScope, excludingUserId?: string): Promise<number>;
};

/**
 * `evaluateEvent` used to live here as Plan 1's pass-through. Plan 2 replaced
 * it with the real dispatcher in `./evaluate.js`; the types above stayed,
 * because they are what the server, the fixture harness and every rule module
 * bind to. The signature Plan 1 froze is unchanged and remains cross-plan
 * contract: pure, no I/O, all state arrives through `ctx`.
 */

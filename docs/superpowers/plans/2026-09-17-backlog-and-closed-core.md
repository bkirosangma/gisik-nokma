# Backlog and Closed — Core Implementation Plan (spec §1–§7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ticket is born in a universal Backlog state the board never shows, a new Backlog tab shows them with a Start action, and a ticket in a terminal state can be Closed (a flag, explicit Reopen) — closed tickets leave the board, stay on the list with their final state and a badge, and are filterable.

**Architecture:** The domain declares ONE reserved state (`backlog`) and two helpers (`statesWithBacklog`, `transitionsWithBacklog`) that every consumer reads instead of `def.states`/`def.transitions` when it needs the full set; the engine, the precheck, the board arrows and the dialog then offer Start / Send to backlog with no special cases. `closed` is a field on `TicketState` written by two new ledger events and refused by four new engine rules; the projection carries it in two nullable columns; the board and my-work exclude it in SQL, the list carries it on the row. Nothing on the wire changes shape except additive fields and one new filter term.

**Tech Stack:** TypeScript, zod (`packages/domain`), the rule engine (`packages/rule-engine`), Fastify + Postgres + node-pg-migrate (`apps/server`), React 19 (`packages/app-core`, `apps/web`), vitest, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-09-17-backlog-and-closed-design.md` (read it first; its "Decisions" table and §1.3's additive-field rule are binding).

## Global Constraints

- **Branch:** `owner/workspace-edits` in this checkout. Never commit or push to `main`; never `git push`; never start `next dev` (port 3001 is the owner's).
- **Node 22 for every run, including the first RED:** `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node --version && …` in one shell command; quote the version. Output to a file, never `| head`. Server route tests need Postgres: `apps/server/test/helpers/db.ts`'s `createTestDatabase` — run them from `apps/server` exactly as the existing files do.
- **The reserved id is the string `'backlog'`**, exported as `BACKLOG_STATE_ID`; its category is `'open'`; its display name is `Backlog`. Universal edges: `backlog → def.initialStateId` and `s → backlog` for every declared NON-terminal `s`; never from a terminal state; never carrying rules.
- **`closed` is `{ actorId: string; at: string } | null`**: OPTIONAL on the domain `TicketState` (`closed?:`), REQUIRED on `TicketCard` and `ListRow`. Readers spell `state.closed ?? null`.
- **`start` on `ticket.created` is OPTIONAL and its absence means focus** (the v1 meaning). The client always sends it.
- **Refusal rule ids and reasons, verbatim:** `close-requires-terminal` / `A ticket can only be closed from a terminal state; "${stateName}" is not one.`; `already-closed` / `This ticket is already closed.`; `not-closed` / `This ticket is not closed.`; `closed-ticket` / `This ticket is closed — reopen it first.`; validator issue code `reserved-state-id` / `` `backlog` is reserved — every workflow has it without declaring it. ``
- **Copy:** Backlog tab label `Backlog`; Start button `Start`; board/sheet buttons `Close` / `Reopen`; sheet badge `Closed by <name> on <date>`; disabled-move sentence `Closed — reopen it first`; New-ticket note `Starts in the backlog`; checkbox `Start in focus`; Filters control `Closed` with values `All` / `Closed only` / `Not closed`; strip chips `Closed: only` / `Closed: hidden`; empty Backlog tab `Nothing in the backlog — new tickets land here.`
- **Test-case ids** continue in `test-cases/13-deployment-dogfooding.md` under a new section `## Backlog and closed (owner request, 2026-09-17)` starting at `13.562`; every ✅ id cited verbatim in a test; `node scripts/check-case-ids.mjs` after each task (only `13.387`/`13.413` may duplicate).
- **`Features.md`** in the same commit as each user-visible change.
- **Mutation discipline** as in every plan here: cp backup to /tmp, mutate, run, name the case that fails, cp restore, sha256-verify.
- Docblocks at the neighbouring density citing "backlog/closed spec §N, 2026-09-17".

---

## File structure

| Task | Creates / modifies |
|---|---|
| 1 | `packages/domain/src/workflow.ts` (constants, three helpers, `foldStateIdForward` exemption), `workflow-helpers.ts` (`stateCategoryOf` via `statesWithBacklog`), `validate-workflow.ts` (reserved id), `index.ts` exports; test `packages/domain/test/backlog.test.ts` |
| 2 | `packages/domain/src/entity-state.ts` (`closed?`), `events/ticket-events.ts` (`start`, two payloads), `vocabulary.ts` (two registrations), `ticket-state.ts` (creation, two folds, `TICKET_EVENT_TYPES`); tests `packages/domain/test/ticket-state.test.ts`, `ticket-events.test.ts` |
| 3 | `packages/rule-engine/src/refusal-rules.ts`, `checks/close.ts` (new), `evaluate.ts`, `transition.ts`; tests `packages/rule-engine/test/close.test.ts` (new), `transition-backlog.test.ts` (new) |
| 4 | `apps/server/migrations/1789100000000_proj-tickets-closed.sql` (new), `src/projections/tickets.ts`, `src/read/ticket-cards.ts`, `packages/domain/src/read-models.ts` (`TicketCard.closed`), `apps/server/src/sync/*` backfill list; tests `apps/server/test/projections/tickets-closed.test.ts` (new), `read/ticket-cards.test.ts` |
| 5 | `apps/server/src/routes/board.ts`, `routes/list.ts`, `routes/my-work.ts`, `routes/attention.ts`, `read/compile-filter.ts`, `packages/domain/src/filter-spec.ts`, `read-models.ts` (`ListCard` inherits); tests `routes/board.test.ts`, `list.test.ts`, `my-work.test.ts`, `attention.test.ts`, `read/compile-filter.test.ts` |
| 6 | `packages/app-core/src/view-types.ts`, `online/mappers.ts`, `filter/{matches-filter,list-filter,id-axes}.ts`, `views/transition-dialog.tsx` (`transitionOptions`), `precheck.ts`, `replica/replica-data-source.ts`; tests in the matching test files |
| 7 | `packages/app-core/src/views/ticket-sheet.tsx`; test `views/ticket-sheet.test.tsx` |
| 8 | `packages/app-core/src/views/board.tsx` (`MoveArrows` gains Close on terminal columns); test `views/board-close.test.tsx` (new) |
| 9 | `packages/app-core/src/views/new-ticket-dialog.tsx`, `create-ticket-flow.tsx`, `flows/guarded-child-event.ts` (closed parent); `apps/web/…/page.tsx` (`parentCandidates.inFocus`); tests `views/new-ticket-dialog.test.tsx`, `create-ticket-flow.test.tsx` |
| 10 | `packages/app-core/src/views/ticket-list.tsx` (`rowAction`, Closed chip); `apps/web/…/page.tsx` (fifth tab, Backlog view, `TAB_NOUN`); `apps/web/src/backlog-start.ts` (new); tests `views/ticket-list.test.tsx`, `apps/web/test/backlog-tab.test.tsx` (new) |
| 11 | `apps/web/…/page.tsx` (Closed control, State options from defs, Calendar/Timeline default hide), `apps/web/src/board-search-scope.ts` (Closed chip), `apps/web/src/filter-cycle.ts` (`closedMode`); tests `filters-sheet.test.tsx`, `board-search-scope.test.ts`, `board-narrowing.test.tsx` |
| 12 | Final gate, catalogue checks, citation sweep, spec amendments |

Run helpers (Node 22 selected):

```bash
S=/private/tmp/claude-501/-Users-kiro-my-projects-gisik-nokma/3eba53cb-776b-4047-86d8-45d37cfb1d72/scratchpad
cd packages/domain && pnpm exec vitest run test/backlog.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E 'PASS \(|Tests |×|Error' $S/t.log
```

---

### Task 1: The universal state in the domain

**Files:**
- Modify: `packages/domain/src/workflow.ts` (add after `workflowStateSchema`/`transitionSchema`; amend `foldStateIdForward` at `:109-128`)
- Modify: `packages/domain/src/workflow-helpers.ts:19-21` (`stateCategoryOf`)
- Modify: `packages/domain/src/validate-workflow.ts` (new issue after the duplicate-state check)
- Modify: `packages/domain/src/index.ts` (export the new symbols beside the existing `workflow.js` exports)
- Test: `packages/domain/test/backlog.test.ts` (new); extend `packages/domain/test/validate-workflow.test.ts` if it exists, else put the validator case in `backlog.test.ts`

**Interfaces:**
- Produces: `BACKLOG_STATE_ID: 'backlog'`, `BACKLOG_STATE: WorkflowState`, `statesWithBacklog(def): WorkflowState[]`, `universalTransitions(def): Transition[]`, `transitionsWithBacklog(def): Transition[]`; `stateCategoryOf(def, 'backlog') === 'open'`; `foldStateIdForward('backlog', …)` is `{ ok: true, stateId: 'backlog' }` for every version chain; `validateWorkflowDef` issue `reserved-state-id`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/domain/test/backlog.test.ts
import { describe, expect, it } from 'vitest';
import {
  BACKLOG_STATE,
  BACKLOG_STATE_ID,
  foldStateIdForward,
  statesWithBacklog,
  transitionsWithBacklog,
  universalTransitions,
  type WorkflowDef,
} from '../src/workflow.js';
import { stateCategoryOf } from '../src/workflow-helpers.js';
import { validateWorkflowDef } from '../src/validate-workflow.js';

const WF: WorkflowDef = {
  id: 'wf', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
  ],
};

/** 13.562 — the universal state (backlog/closed spec §1.1): every workflow has it without declaring it. */
describe('13.562 statesWithBacklog and the universal edges', () => {
  it('appends the one Backlog state, category open, after the declared states', () => {
    expect(BACKLOG_STATE).toEqual({ id: 'backlog', name: 'Backlog', category: 'open' });
    expect(statesWithBacklog(WF).map((s) => s.id)).toEqual(['todo', 'doing', 'done', 'backlog']);
    expect(stateCategoryOf(WF, BACKLOG_STATE_ID)).toBe('open');
  });

  it('declares Start (backlog → initial) and Send to backlog from every NON-terminal state, with no rules', () => {
    expect(universalTransitions(WF)).toEqual([
      { from: 'backlog', to: 'todo', rules: [] },
      { from: 'todo', to: 'backlog', rules: [] },
      { from: 'doing', to: 'backlog', rules: [] },
    ]);
    // `done` is terminal: finished, not parked — no edge to backlog.
    expect(universalTransitions(WF).some((t) => t.from === 'done')).toBe(false);
  });

  it('transitionsWithBacklog is the declared edges followed by the universal ones, declared rules intact', () => {
    const all = transitionsWithBacklog(WF);
    expect(all.slice(0, 2)).toEqual(WF.transitions);
    expect(all.slice(2)).toEqual(universalTransitions(WF));
    expect(all.find((t) => t.from === 'doing' && t.to === 'done')?.rules).toEqual([{ kind: 'require-comment' }]);
  });

  it('is pure: the def is not mutated', () => {
    const before = JSON.stringify(WF);
    statesWithBacklog(WF);
    transitionsWithBacklog(WF);
    expect(JSON.stringify(WF)).toBe(before);
  });
});

/** 13.563 — the fold on republish (spec §1.4): backlog is never a dropped state. */
describe('13.563 foldStateIdForward treats backlog as never dropped', () => {
  const V2: WorkflowDef = { ...WF, version: 2, states: WF.states.filter((s) => s.id !== 'doing') };
  it('folds a backlog ticket forward across a version that dropped a declared state, without a mapping', () => {
    expect(foldStateIdForward(BACKLOG_STATE_ID, 1, V2, () => null)).toEqual({ ok: true, stateId: 'backlog' });
  });
  it('still refuses a dropped DECLARED state with no mapping — the exemption is for backlog alone', () => {
    expect(foldStateIdForward('doing', 1, V2, () => null)).toEqual({ ok: false, unmappedStateId: 'doing' });
  });
});

/** 13.564 — the reserved id (spec §1.1). */
describe('13.564 validateWorkflowDef refuses a declared backlog', () => {
  it('as a state', () => {
    const def: WorkflowDef = { ...WF, states: [...WF.states, { id: 'backlog', name: 'Mine', category: 'open' }] };
    expect(validateWorkflowDef(def)).toContainEqual({
      code: 'reserved-state-id',
      message: '`backlog` is reserved — every workflow has it without declaring it.',
    });
  });
  it('as a transition endpoint, even when no state declares it', () => {
    const def: WorkflowDef = { ...WF, transitions: [...WF.transitions, { from: 'backlog', to: 'todo', rules: [] }] };
    expect(validateWorkflowDef(def).map((i) => i.code)).toContain('reserved-state-id');
  });
  it('a clean def has no such issue', () => {
    expect(validateWorkflowDef(WF).map((i) => i.code)).not.toContain('reserved-state-id');
  });
});
```

- [ ] **Step 2: Run to verify RED** — `cd packages/domain && pnpm exec vitest run test/backlog.test.ts` → import errors (`BACKLOG_STATE` etc. not exported), EXIT=1.

- [ ] **Step 3: Implement**

In `packages/domain/src/workflow.ts`, after `export type Transition = …;` add:

```ts
/**
 * THE UNIVERSAL STATE (backlog/closed spec §1.1, 2026-09-17). Every workflow
 * has a Backlog BEFORE its own initial state without declaring it: new tickets
 * are born there (§1.3), the board never shows it, the Backlog tab does. The id
 * is reserved — `validateWorkflowDef` refuses a definition that declares it —
 * so no authored state can collide with it, and `foldStateIdForward` treats it
 * as never dropped, so no republish can strand a ticket that sits in it.
 *
 * Consumers that need the FULL state or edge set read the two helpers below
 * instead of `def.states`/`def.transitions`: the engine's edge resolution, the
 * client's `transitionOptions`, the precheck. A consumer that reads the raw
 * arrays sees only what the workflow AUTHORED — correct for the builder and
 * the validator, wrong for anything that decides whether a move is legal.
 */
export const BACKLOG_STATE_ID = 'backlog';
export const BACKLOG_STATE: WorkflowState = { id: BACKLOG_STATE_ID, name: 'Backlog', category: 'open' };

/** `def.states` plus `BACKLOG_STATE`, always last. Pure. */
export function statesWithBacklog(def: WorkflowDef): WorkflowState[] {
  return [...def.states, BACKLOG_STATE];
}

/**
 * The universal edges: Start (`backlog → def.initialStateId`) and Send to
 * backlog (`s → backlog` for every declared NON-terminal `s`, in declared
 * order). A terminal ticket cannot go to backlog — finished, not parked. No
 * rules, ever: a workflow cannot gate its own Start edge; the first DECLARED
 * edge out of the initial state keeps whatever rules it has.
 */
export function universalTransitions(def: WorkflowDef): Transition[] {
  const start: Transition = { from: BACKLOG_STATE_ID, to: def.initialStateId, rules: [] };
  const sendBack = def.states
    .filter((state) => state.category !== 'terminal')
    .map((state): Transition => ({ from: state.id, to: BACKLOG_STATE_ID, rules: [] }));
  return [start, ...sendBack];
}

/** `def.transitions` followed by `universalTransitions(def)`. Pure. */
export function transitionsWithBacklog(def: WorkflowDef): Transition[] {
  return [...def.transitions, ...universalTransitions(def)];
}
```

In `foldStateIdForward`, as the first line of the body (before `let current = stateId;`):

```ts
  // Backlog is universal (spec §1.4): in no version's `states`, dropped by
  // none, so it folds to itself across any chain — including one with holes,
  // which is why this returns before the version walk rather than inside it.
  if (stateId === BACKLOG_STATE_ID) return { ok: true, stateId };
```

In `workflow-helpers.ts`, `stateCategoryOf` reads `statesWithBacklog(def)` instead of `def.states` (import it from `./workflow.js`; amend its docblock: "…including the universal Backlog, category open — spec §1.1").

In `validate-workflow.ts`, after the duplicate-state-id loop, add:

```ts
  // The universal state's id is reserved (backlog/closed spec §1.1): every
  // workflow has it without declaring it, so a declaration would be a second
  // state wearing the universal one's name.
  const declaresReserved =
    def.states.some((state) => state.id === BACKLOG_STATE_ID) ||
    def.transitions.some((t) => t.from === BACKLOG_STATE_ID || t.to === BACKLOG_STATE_ID);
  if (declaresReserved) {
    issues.push({
      code: 'reserved-state-id',
      message: '`backlog` is reserved — every workflow has it without declaring it.',
    });
  }
```

(import `BACKLOG_STATE_ID` from `./workflow.js`). Export the four new symbols from `packages/domain/src/index.ts` wherever `foldStateIdForward` is exported (grep it).

- [ ] **Step 4: Run GREEN + the whole domain suite + typecheck** — `pnpm exec vitest run` in `packages/domain` (every existing case stays green: `stateCategoryOf` on a declared id is unchanged), `pnpm run typecheck`. Also `pnpm --filter @gisik-nokma/domain build` so downstream packages see the exports.

- [ ] **Step 5: Mutation** — remove the `state.category !== 'terminal'` filter → the "no edge from done" assertion fails; restore. Remove the early return in `foldStateIdForward` → 13.563's first case fails; restore.

- [ ] **Step 6: Record and commit** — create the section `## Backlog and closed (owner request, 2026-09-17)` at the end of `test-cases/13-deployment-dogfooding.md` with a three-sentence intro (the owner's words, the spec path, "every task below is TDD with mutation") and the lines for 13.562–13.564; `Features.md`: a ⚙️ bullet "Universal Backlog state (`BACKLOG_STATE`, `statesWithBacklog`, `transitionsWithBacklog`, the reserved id) — backlog/closed spec §1.1, 2026-09-17; cases 13.562–13.564" beside the workflow-definition bullets. Commit `packages/domain/**`, `test-cases/…`, `Features.md`.

---

### Task 2: The closed flag, the two events, and creation's `start`

**Files:**
- Modify: `packages/domain/src/entity-state.ts:24-39` (`TicketState`)
- Modify: `packages/domain/src/events/ticket-events.ts` (`ticketCreatedPayload` gains `start`; add `ticketClosedPayload`, `ticketReopenedPayload`)
- Modify: `packages/domain/src/vocabulary.ts` (two registrations after `ticket.workflow_rebound`)
- Modify: `packages/domain/src/ticket-state.ts` (`TICKET_EVENT_TYPES`, the `ticket.created` branch, two new `case`s)
- Modify: `packages/domain/src/index.ts` (export the two payload schemas)
- Tests: `packages/domain/test/ticket-state.test.ts` (append), `packages/domain/test/ticket-events.test.ts` (append)

**Interfaces:**
- Produces: `TicketState.closed?: { actorId: string; at: string } | null`; `ticketCreatedPayload` with `start?: 'backlog' | 'focus'`; `ticketClosedPayload = z.object({}).strict()`, `ticketReopenedPayload = z.object({}).strict()`; event types `'ticket.closed'`, `'ticket.reopened'` registered v1 on `ticket`; `TICKET_EVENT_TYPES` includes both.

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/test/ticket-state.test.ts` (read its existing `deps`/`created()`-style helpers first and reuse them; below assumes a `fold(events)` helper that replays through `applyTicketEvent` with `WF` whose `initialStateId` is `'todo'` — write one if the file lacks it):

```ts
/** 13.565 — born in the backlog, unless the client says focus; absence means focus (spec §1.3). */
describe('13.565 ticket.created lands in backlog when start says so', () => {
  it('start: "backlog" → the universal state, category open, closed null', () => {
    const state = fold([createdWith({ start: 'backlog' })]);
    expect(state.stateId).toBe('backlog');
    expect(state.stateCategory).toBe('open');
    expect(state.closed).toBeNull();
    expect(state.transitions).toEqual([]);
  });
  it('start: "focus" → the workflow\'s initial state, as before', () => {
    expect(fold([createdWith({ start: 'focus' })]).stateId).toBe('todo');
  });
  it('no start at all (a v1 event) → focus — the additive-field rule', () => {
    expect(fold([createdWith({})]).stateId).toBe('todo');
  });
});

/** 13.566 — the flag folds and unfolds; the state is untouched (spec §1.2). */
describe('13.566 ticket.closed / ticket.reopened', () => {
  it('closed records the actor and the server time; reopened clears it; stateId never moves', () => {
    const closed = fold([createdWith({ start: 'focus' }), transitioned('doing'), transitioned('done'), closedEvent()]);
    expect(closed.closed).toEqual({ actorId: ACTOR, at: closedEvent().serverTime });
    expect(closed.stateId).toBe('done');
    const reopened = fold([createdWith({ start: 'focus' }), transitioned('doing'), transitioned('done'), closedEvent(), reopenedEvent()]);
    expect(reopened.closed).toBeNull();
    expect(reopened.stateId).toBe('done');
  });
  it('TICKET_EVENT_TYPES names both, so every replay reader that iterates it sees them', () => {
    expect(TICKET_EVENT_TYPES).toContain('ticket.closed');
    expect(TICKET_EVENT_TYPES).toContain('ticket.reopened');
  });
});
```

`createdWith(payloadExtra)` builds a `ticket.created` envelope whose payload is the file's usual one spread with `payloadExtra`; `closedEvent()`/`reopenedEvent()` build `ticket.closed`/`ticket.reopened` envelopes with `payload: {}` via the file's envelope helper (`makeEnvelope`).

Append to `packages/domain/test/ticket-events.test.ts`:

```ts
/** 13.567 — the payload schemas (spec §1.2/§1.3). */
describe('13.567 start and the two flag payloads', () => {
  it('ticketCreatedPayload accepts start backlog|focus and its absence, refuses anything else', () => {
    const base = { typeId: 'task', projectId: PROJECT, parentId: null, title: 'x' };
    expect(ticketCreatedPayload.parse({ ...base, start: 'backlog' }).start).toBe('backlog');
    expect(ticketCreatedPayload.parse({ ...base, start: 'focus' }).start).toBe('focus');
    expect(ticketCreatedPayload.parse(base).start).toBeUndefined();
    expect(() => ticketCreatedPayload.parse({ ...base, start: 'parked' })).toThrow();
  });
  it('ticket.closed and ticket.reopened carry an empty, strict payload', () => {
    expect(ticketClosedPayload.parse({})).toEqual({});
    expect(() => ticketClosedPayload.parse({ reason: 'x' })).toThrow();
    expect(ticketReopenedPayload.parse({})).toEqual({});
  });
  it('both types are registered on the ticket entity at version 1', () => {
    expect(domainRegistry.get('ticket.closed')?.entityKind).toBe('ticket');
    expect(domainRegistry.get('ticket.reopened')?.version).toBe(1);
  });
});
```

(`PROJECT` is whatever ULID constant the file already uses; `domainRegistry.get` — read `registry.ts` for the real lookup name and use it.)

- [ ] **Step 2: RED** — `pnpm exec vitest run test/ticket-state.test.ts test/ticket-events.test.ts` → the new describes fail (unknown exports / `state.closed` undefined / `stateId` `todo` where `backlog` expected).

- [ ] **Step 3: Implement**

`entity-state.ts`: add to `TicketState`, after `transitions`:

```ts
  /**
   * The closed flag (backlog/closed spec §1.2, 2026-09-17): set by
   * `ticket.closed`, cleared by `ticket.reopened`, never touching `stateId`.
   * OPTIONAL here, and only here, because 441 `TicketState` literals in tests
   * across five packages predate it; every producer sets it (the reducer,
   * `rowToTicketState`, the replica) and every reader spells
   * `state.closed ?? null`. The wire types carry it required.
   */
  closed?: { actorId: string; at: string } | null;
```

`events/ticket-events.ts`: in `ticketCreatedPayload` add
```ts
  /**
   * Where the ticket is born (spec §1.3): `'backlog'` — the universal state —
   * or `'focus'` — the workflow's initial state. OPTIONAL, and ABSENT MEANS
   * FOCUS: that is what every v1 event meant, and an additive field must not
   * change the meaning of events written before it existed. The product's own
   * client always sends it.
   */
  start: z.enum(['backlog', 'focus']).optional(),
```
and after `ticketWorkflowReboundPayload` add:
```ts
/** `ticket.closed` (spec §1.2) — the envelope carries actor and time; the payload says nothing. */
export const ticketClosedPayload = z.object({}).strict();
/** `ticket.reopened` (spec §1.2) — the explicit reopen; same empty payload. */
export const ticketReopenedPayload = z.object({}).strict();
```

`vocabulary.ts`: register both (`type: 'ticket.closed'`, `version: 1`, `entityKind: 'ticket'`, `payloadSchema: ticketClosedPayload`; same for reopened), after the `ticket.workflow_rebound` registration; import the two schemas.

`ticket-state.ts`: `TICKET_EVENT_TYPES` gains `'ticket.closed'`, `'ticket.reopened'` after `'ticket.workflow_rebound'`; the docblock's "TEN of the THIRTEEN" becomes "TWELVE of the FIFTEEN" (same sentence otherwise). In the `ticket.created` branch replace
```ts
    const category = stateCategoryOf(wf, wf.initialStateId);
    if (!category) {
      throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${wf.initialStateId}"`);
    }
```
with
```ts
    // Spec §1.3: `start === 'backlog'` → the universal state; anything else —
    // `'focus'`, or the field absent on an event older than it — the
    // workflow's initial state, which is what every v1 event meant.
    const bornIn = p.start === 'backlog' ? BACKLOG_STATE_ID : wf.initialStateId;
    const category = stateCategoryOf(wf, bornIn);
    if (!category) {
      throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${bornIn}"`);
    }
```
and in the returned literal `stateId: bornIn,` plus `closed: null,` after `transitions: [],`. Add two cases to the `switch`:
```ts
    case 'ticket.closed': {
      ticketClosedPayload.parse(env.payload);
      return { ...state, closed: { actorId: env.actorId, at: env.serverTime } };
    }
    case 'ticket.reopened': {
      ticketReopenedPayload.parse(env.payload);
      return { ...state, closed: null };
    }
```
Import `BACKLOG_STATE_ID` from `./workflow.js` and the two payloads from `./events/ticket-events.js`. Export the two payload schemas from `index.ts` beside `ticketCreatedPayload`.

- [ ] **Step 4: GREEN + whole domain suite + typecheck + build** (`pnpm --filter @gisik-nokma/domain build`).

- [ ] **Step 5: Mutation** — change `p.start === 'backlog'` to `p.start !== 'focus'` → 13.565's "no start → focus" case fails (that is the additive-field rule's own guard); restore.

- [ ] **Step 6: Record and commit** — 13.565–13.567 lines; commit `packages/domain/**` + test-cases.

---

### Task 3: The engine — universal edges pass, four refusals

**Files:**
- Modify: `packages/rule-engine/src/refusal-rules.ts` (four ids)
- Create: `packages/rule-engine/src/checks/close.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (dispatch two cases)
- Modify: `packages/rule-engine/src/transition.ts` (closed check; `statesWithBacklog`/`transitionsWithBacklog`)
- Modify: `packages/rule-engine/src/index.ts` (export the two checks if the file exports checks)
- Tests: `packages/rule-engine/test/close.test.ts` (new), `packages/rule-engine/test/transition-backlog.test.ts` (new)

**Interfaces:**
- Produces: `REFUSAL_RULES.closeRequiresTerminal = 'close-requires-terminal'`, `.alreadyClosed = 'already-closed'`, `.notClosed = 'not-closed'`, `.closedTicket = 'closed-ticket'`; `checkTicketClosed(env, ctx)`, `checkTicketReopened(env, ctx)`; `evaluateTicketTransitioned` refuses `closed-ticket` before edge resolution and resolves edges over the universal sets.

- [ ] **Step 1: Write the failing tests**

`packages/rule-engine/test/close.test.ts` (uses `test-support.ts`'s `WS`, `PROJECT`, `TASK`, `WF`, `created`, `typeDefined` and `buildMemoryContext` — `WF`'s states are `todo/doing/done`, all reachable via `*` edges):

```ts
import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketClosed, checkTicketReopened } from '../src/checks/close.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

const T = '01J9GTKT000000000000000000';
const move = (to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { to } });
const close = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });
const reopen = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.reopened', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });
const ctx = (...after: EventEnvelope[]) =>
  buildMemoryContext([WF], [typeDefined(TASK), created(T, 'task', null, PROJECT), ...after]);

/** 13.568 — closing (spec §2). */
describe('13.568 checkTicketClosed', () => {
  it('accepts a close from a terminal state', async () => {
    expect(await checkTicketClosed(close(), ctx(move('done')))).toEqual({ refused: false });
  });
  it('refuses from a non-terminal state, naming the state', async () => {
    expect(await checkTicketClosed(close(), ctx(move('doing')))).toEqual({
      refused: true, rule: 'close-requires-terminal',
      reason: 'A ticket can only be closed from a terminal state; "Doing" is not one.',
    });
  });
  it('refuses a second close', async () => {
    expect(await checkTicketClosed(close(), ctx(move('done'), close()))).toEqual({
      refused: true, rule: 'already-closed', reason: 'This ticket is already closed.',
    });
  });
  it('is reachable through evaluateEvent', async () => {
    expect(await evaluateEvent(close(), ctx(move('doing')))).toMatchObject({ rule: 'close-requires-terminal' });
  });
});

/** 13.569 — reopening (spec §2). */
describe('13.569 checkTicketReopened', () => {
  it('accepts a reopen of a closed ticket and refuses one that is not closed', async () => {
    expect(await checkTicketReopened(reopen(), ctx(move('done'), close()))).toEqual({ refused: false });
    expect(await checkTicketReopened(reopen(), ctx(move('done')))).toEqual({
      refused: true, rule: 'not-closed', reason: 'This ticket is not closed.',
    });
  });
});

/** 13.570 — a closed ticket cannot move (spec §2: explicit reopen). */
describe('13.570 transitions are refused while closed', () => {
  it('refuses before any edge is looked at', async () => {
    expect(await evaluateEvent(move('doing'), ctx(move('done'), close()))).toEqual({
      refused: true, rule: 'closed-ticket', reason: 'This ticket is closed — reopen it first.',
    });
  });
  it('after a reopen the same move is judged by the workflow again', async () => {
    expect(await evaluateEvent(move('doing'), ctx(move('done'), close(), reopen()))).toEqual({ refused: false });
  });
});
```

`packages/rule-engine/test/transition-backlog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WS, typeDefined } from '../src/checks/test-support.js';

const T = '01J9GTKT000000000000000000';
/** A workflow with NO wildcard edges, so only declared and universal edges exist. */
const WF_STRICT: PublishedWorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Strict', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'doing', rules: [] }, { from: 'doing', to: 'done', rules: [] }],
};
const createdIn = (start: 'backlog' | 'focus'): EventEnvelope =>
  makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: T }, workspaceId: WS,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 't', start } });
const move = (to: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: { to } });
const ctx = (start: 'backlog' | 'focus', ...after: EventEnvelope[]) =>
  buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn(start), ...after]);

/** 13.571 — the universal edges are legal without being declared (spec §1.1/§2). */
describe('13.571 Start and Send to backlog pass the engine', () => {
  it('backlog → initial (Start) is accepted', async () => {
    expect(await evaluateEvent(move('todo'), ctx('backlog'))).toEqual({ refused: false });
  });
  it('backlog → a non-initial state is still illegal', async () => {
    expect(await evaluateEvent(move('doing'), ctx('backlog'))).toMatchObject({ rule: 'illegal-transition' });
  });
  it('a non-terminal state → backlog (Send to backlog) is accepted', async () => {
    expect(await evaluateEvent(move('backlog'), ctx('focus', move('doing')))).toEqual({ refused: false });
  });
  it('a terminal state → backlog is illegal: finished, not parked', async () => {
    expect(await evaluateEvent(move('backlog'), ctx('focus', move('doing'), move('done')))).toMatchObject({
      rule: 'illegal-transition',
    });
  });
  it('the parent-terminal invariant counts a backlog child as open', async () => {
    const C = '01J9GTKC000000000000000000';
    const childInBacklog = makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: C }, workspaceId: WS,
      payload: { typeId: 'task', projectId: PROJECT, parentId: T, title: 'c', start: 'backlog' } });
    const world = buildMemoryContext([WF_STRICT], [typeDefined(TASK), createdIn('focus'), move('doing'), childInBacklog]);
    expect(await evaluateEvent(move('done'), world)).toMatchObject({ rule: 'parent-terminal-with-open-children' });
  });
});
```

(If `test-support.ts`'s `TASK` type definition binds a workflow id other than `'wf-basic'`, name `WF_STRICT.id` to match it — read `typeDefined`.)

- [ ] **Step 2: RED** — `cd packages/rule-engine && pnpm exec vitest run test/close.test.ts test/transition-backlog.test.ts` → module `checks/close.js` missing; Start refused `unknown-state`.

- [ ] **Step 3: Implement**

`refusal-rules.ts`: add to `REFUSAL_RULES`:
```ts
  closeRequiresTerminal: 'close-requires-terminal',
  alreadyClosed: 'already-closed',
  notClosed: 'not-closed',
  closedTicket: 'closed-ticket',
```

`checks/close.ts`:
```ts
import type { EventEnvelope } from '@gisik-nokma/domain';
import { statesWithBacklog, ticketClosedPayload, ticketReopenedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { ACCEPT, refuse } from './refusals.js';

/**
 * The closed flag's two doors (backlog/closed spec §2, 2026-09-17). Closing is
 * only legal from a terminal state — the ticket's final state stays visible,
 * which is the owner's reason for a flag rather than a state — and reopening
 * is explicit: a closed ticket's transitions are refused in `transition.ts`
 * until `ticket.reopened` clears the flag. Same shape as every other check:
 * an `entity.kind` guard of its own, the ticket read through `getTicketState`,
 * the reason a whole sentence a person can act on.
 */
export async function checkTicketClosed(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.closed' || env.entity.kind !== 'ticket') return ACCEPT;
  const parsed = ticketClosedPayload.safeParse(env.payload);
  if (!parsed.success) return refuse(REFUSAL_RULES.malformedPayload, malformedPayloadDetail(parsed.error));
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event closes ticket ${env.entity.id}, but no such ticket is known.`);
  if ((ticket.closed ?? null) !== null) return refuse(REFUSAL_RULES.alreadyClosed, 'This ticket is already closed.');
  if (ticket.stateCategory !== 'terminal') {
    const def = await ctx.getWorkflowDef(env, ticket.workflowId);
    const stateName = def === null ? ticket.stateId
      : (statesWithBacklog(def).find((state) => state.id === ticket.stateId)?.name ?? ticket.stateId);
    return refuse(REFUSAL_RULES.closeRequiresTerminal,
      `A ticket can only be closed from a terminal state; "${stateName}" is not one.`);
  }
  return ACCEPT;
}

export async function checkTicketReopened(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.reopened' || env.entity.kind !== 'ticket') return ACCEPT;
  const parsed = ticketReopenedPayload.safeParse(env.payload);
  if (!parsed.success) return refuse(REFUSAL_RULES.malformedPayload, malformedPayloadDetail(parsed.error));
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event reopens ticket ${env.entity.id}, but no such ticket is known.`);
  if ((ticket.closed ?? null) === null) return refuse(REFUSAL_RULES.notClosed, 'This ticket is not closed.');
  return ACCEPT;
}
```
(Match `malformedPayloadDetail`'s real signature from `refusal-rules.ts`; if `refuse(rule, reason)` requires the rule to be in a `REFUSALS` table for the one-arg form, the two-arg form above is what is used everywhere here.)

`evaluate.ts`: add `case 'ticket.closed': return checkTicketClosed(env, ctx);` and `case 'ticket.reopened': return checkTicketReopened(env, ctx);` with the import.

`transition.ts`: (a) immediately after `const ticket = entity;` add
```ts
  // Explicit reopen (spec §2): a closed ticket has no legal move at all, so
  // this is decided before any edge is looked at.
  if ((ticket.closed ?? null) !== null) {
    return { refused: true, rule: REFUSAL_RULES.closedTicket, reason: 'This ticket is closed — reopen it first.' };
  }
```
(b) `const toState = latest.states.find(…)` → `statesWithBacklog(latest).find(…)`; (c) both `latest.transitions.find(…)` lookups → `transitionsWithBacklog(latest).find(…)`; (d) `fromName` lookup → over `statesWithBacklog(latest)`. Import both helpers from `@gisik-nokma/domain`. Amend the function's docblock with one paragraph: "Since 2026-09-17 the state and edge sets include the universal Backlog (spec §1.1) — Start and Send to backlog are legal without being declared, and the engine learns them from the same two helpers the client's `transitionOptions` reads."

- [ ] **Step 4: GREEN + whole rule-engine suite + typecheck + build.** Every existing case must stay green: the universal edges only ADD legal moves, and no existing fixture moves to `backlog`.

- [ ] **Step 5: Mutations** — (a) delete the closed check in `transition.ts` → 13.570's first case fails; (b) in `universalTransitions`' consumer nothing to mutate here — instead revert `statesWithBacklog(latest)` to `latest.states` for `toState` → 13.571's Send-to-backlog case fails with `unknown-state`. Restore both.

- [ ] **Step 6: Record and commit** — 13.568–13.571; `Features.md`: a ⚙️ bullet for the four refusals and the universal edges in the engine. Commit `packages/rule-engine/**`, test-cases, Features.md.

---

### Task 4: Projection columns, the row mapper, the shared card select

**Files:**
- Create: `apps/server/migrations/1789100000000_proj-tickets-closed.sql`
- Modify: `apps/server/src/projections/tickets.ts` (`upsertTicket` at `:182-215`, `rowToTicketState` at `:123-140`, `TicketRow` type)
- Modify: `apps/server/src/read/ticket-cards.ts` (`ProjTicketRow`, `PROJ_TICKET_COLUMNS`, `assembleTicketCards`)
- Modify: `packages/domain/src/read-models.ts:173-189` (`TicketCard.closed`)
- Modify: the replica bootstrap backfill list — find it with `grep -rn "ticket.workflow_rebound" apps/server/src` (the `sync-routes.ts` list `ticket-state.ts`'s docblock names) and add the two new types beside it
- Tests: `apps/server/test/projections/tickets-closed.test.ts` (new), `apps/server/test/read/ticket-cards.test.ts` (append)

**Interfaces:**
- Produces: columns `closed_at timestamptz NULL`, `closed_by text NULL`; `rowToTicketState(row).closed`; `PROJ_TICKET_COLUMNS` includes `t.closed_at, t.closed_by`; `TicketCard.closed: { actorId: string; at: string } | null` (required).

- [ ] **Step 1: Write the failing tests**

Read `apps/server/test/projections/proj-projects.test.ts` for the projection-test harness (a `createTestDatabase`, `applyCommitted` of a ledger, then a direct `SELECT`). Then:

```ts
// apps/server/test/projections/tickets-closed.test.ts
/** 13.572 — the two columns, written by the projection from the reducer's `closed` (spec §3.1). */
describe('13.572 proj_tickets carries closed_at / closed_by', () => {
  it('a created ticket has both NULL; a close fills both from the event; a reopen clears both', async () => {
    // seed: workspace, type, workflow WF (todo/doing/done via * edges), ticket created with start 'focus',
    // moved to done, closed, then reopened — one applyCommitted per step, reading the row after each.
    // Assert: after created → { closed_at: null, closed_by: null }; after closed → closed_by === actor,
    // closed_at.toISOString() === the close event's serverTime; after reopened → both null.
  });
  it('rowToTicketState maps the pair to `closed`, and null to null', async () => {
    // Read the row through the projection's own reader (import rowToTicketState) and assert
    // .closed equals { actorId, at } after a close and null before.
  });
});
```

Write those two `it`s in full against the harness the file you read uses (the seed steps are the same `makeCommitted` calls `routes/board.test.ts:101-127` shows, plus `ticket.created` with `start: 'focus'`, two `ticket.transitioned`, one `ticket.closed`, one `ticket.reopened`).

Append to `apps/server/test/read/ticket-cards.test.ts` (read its existing harness): `13.573` — a card assembled from a closed row carries `closed: { actorId, at }`; from an open row `closed: null`.

- [ ] **Step 2: RED** — the migration is missing so the projection `INSERT` has no such column; run the two files: `column "closed_at" does not exist` / `closed` undefined.

- [ ] **Step 3: Implement**

Migration (mirror the style of `1788700000000_proj-projects-archived.sql`, including the `COMMENT ON COLUMN` sentences this repo writes):
```sql
-- Backlog/closed spec §3.1 (2026-09-17): the closed flag, projected from
-- TicketState.closed. Both NULL for every ticket that is not closed — every
-- existing row, since nothing could have set them before this migration.
ALTER TABLE proj_tickets
  ADD COLUMN closed_at timestamptz NULL,
  ADD COLUMN closed_by text NULL;

-- The board, my-work and attention hot path: rows that are not closed.
CREATE INDEX proj_tickets_open_idx ON proj_tickets (workspace_id, project_id) WHERE closed_at IS NULL;

COMMENT ON COLUMN proj_tickets.closed_at IS 'When the ticket was closed — the ticket.closed event''s server time — or NULL. A closed ticket keeps its state_id/state_category: closed is a flag over a terminal state, never a state (owner decision 2026-09-17).';
COMMENT ON COLUMN proj_tickets.closed_by IS 'The actor of the ticket.closed event, or NULL. Cleared with closed_at by ticket.reopened.';
```
(Add the matching `down` if the migrations in this repo carry one — read the sibling file.)

`projections/tickets.ts`: `TicketRow` gains `closed_at: Date | null; closed_by: string | null;`; `rowToTicketState` returns `closed: row.closed_at === null || row.closed_by === null ? null : { actorId: row.closed_by, at: row.closed_at.toISOString() }`; `upsertTicket`'s column list, VALUES (`$14, $15`) and `ON CONFLICT … SET closed_at = EXCLUDED.closed_at, closed_by = EXCLUDED.closed_by`, with values `next.closed?.at ?? null`, `next.closed?.actorId ?? null`. Every `SELECT` in this file that feeds `rowToTicketState` must select the two columns (grep `state_category` in the file to find them).

`read/ticket-cards.ts`: `ProjTicketRow` gains the two fields; `PROJ_TICKET_COLUMNS` appends `', t.closed_at, t.closed_by'`; `assembleTicketCards` sets `closed: row.closed_at === null || row.closed_by === null ? null : { actorId: row.closed_by, at: row.closed_at.toISOString() }` on each card. `read-models.ts`: `TicketCard` gains `closed: { actorId: string; at: string } | null;` after `rollup` with a one-line docblock citing §3.3. The three `TicketCard` literals in server tests gain `closed: null`.

Backfill list: add `'ticket.closed'`, `'ticket.reopened'`.

- [ ] **Step 4: GREEN + whole `apps/server` suite** (`pnpm exec vitest run` from `apps/server`, Postgres running) + `pnpm run typecheck` in `apps/server` AND `packages/domain` build first.

- [ ] **Step 5: Mutation** — in `rowToTicketState` return `closed: null` unconditionally → 13.572's second case fails; restore.

- [ ] **Step 6: Record and commit** — 13.572–13.573; `Features.md` ⚙️ bullet for the projection columns. Commit migration, `apps/server/src/**`, `packages/domain/src/read-models.ts`, tests, test-cases, Features.md.

---

### Task 5: The readers — board excludes, list carries, my-work and attention skip, the wire filter

**Files:**
- Modify: `apps/server/src/routes/board.ts:91-97` (the `readBoard` SELECT's WHERE)
- Modify: `apps/server/src/routes/list.ts` (rows already carry `closed` via `TicketCard`; add the `closed` term through `compileFilterSpec`)
- Modify: `apps/server/src/read/compile-filter.ts:95-110` (`closed` clause)
- Modify: `packages/domain/src/filter-spec.ts:119-140` (`closed: z.boolean().optional()`)
- Modify: `apps/server/src/routes/my-work.ts` (both SELECTs' `where` arrays: `t.closed_at IS NULL`)
- Modify: `apps/server/src/routes/attention.ts:172-175` (`where`: `t.closed_at IS NULL`)
- Tests: `apps/server/test/routes/board.test.ts`, `list.test.ts`, `my-work.test.ts`, `attention.test.ts`, `apps/server/test/read/compile-filter.test.ts`, `packages/domain/test/filter-spec.test.ts`

**Interfaces:**
- Produces: board never returns a backlog or closed card and never a `backlog` straggler column; list returns them with `closed` set; `filterSpecSchema.closed?: boolean` → `t.closed_at IS NOT NULL` / `IS NULL`; my-work and attention omit closed tickets.

- [ ] **Step 1: Write the failing tests** (each in the existing file's harness; seed one ticket born `start: 'backlog'` and one moved to `done` then closed, beside the file's existing cards):

- `board.test.ts` — `13.574`: neither the backlog ticket nor the closed one appears in any column's `cards`, and no column has `stateId === 'backlog'` (the straggler path is closed); a done-but-NOT-closed ticket still sits in `done`.
- `list.test.ts` — `13.575`: both appear; the backlog row has `stateId: 'backlog'`, `stateName: 'Backlog'`, `stateCategory: 'open'`; the closed row has `closed: { actorId, at }`; `?closed=true` (or however the route serialises `filterSpecSchema` — read `listQueryString`'s counterpart in `list.ts`) returns only the closed row, `closed=false` excludes it.
- `my-work.test.ts` — `13.576`: a closed ticket assigned to the caller is NOT in any group; a backlog ticket assigned to them IS, in `open`.
- `attention.test.ts` — `13.577`: a closed ticket never produces an attention item.
- `compile-filter.test.ts` — `13.578`: `{ closed: true }` compiles to `t.closed_at IS NOT NULL`, `{ closed: false }` to `t.closed_at IS NULL`, absent → no clause.
- `filter-spec.test.ts` — `13.579`: `closed` accepted as boolean, refused as a string.

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement**

`filter-spec.ts`: `closed: z.boolean().optional(),` after `blocked` with a docblock: "The closed flag (backlog/closed spec §3.2): `true` = closed only, `false` = not closed, absent = all. A single value, so the client's `toServerFilterSpec` can send it as is."

`compile-filter.ts`: after the `blocked` block:
```ts
  if (spec.closed !== undefined) clauses.push(spec.closed ? 't.closed_at IS NOT NULL' : 't.closed_at IS NULL');
```

`board.ts` `readBoard` WHERE: add two conjuncts after the project clause:
```sql
        AND t.state_id <> ${params.add(BACKLOG_STATE_ID)}
        AND t.closed_at IS NULL
```
(import `BACKLOG_STATE_ID` from `@gisik-nokma/domain`; if the query builds parameters differently, follow the file). Amend `appendStragglerColumns`' docblock: "A `backlog` row can never reach here — `readBoard`'s WHERE excludes the universal state and closed rows before any bucketing (spec §3.2); this function's job is unchanged for every OTHER undeclared state."

`my-work.ts` and `attention.ts`: push `'t.closed_at IS NULL'` into each `where` array that selects tickets for the caller (read each; my-work has two ticket SELECTs at `:124` and `:230`). `my-work.ts`'s "refuses a fourth value" docblock stays true — backlog is `open`.

`list.ts`: the row shape already carries `closed` from Task 4; verify `stateName` for a backlog row resolves through `statesWithBacklog` wherever the route maps `state_id` to a name (grep `stateName` in `list.ts`/`read/list-cards.ts`) — replace the `def.states.find` with `statesWithBacklog(def).find`.

- [ ] **Step 4: GREEN + whole `apps/server` suite + typecheck.**

- [ ] **Step 5: Mutations** — remove `AND t.closed_at IS NULL` from `readBoard` → 13.574 fails; remove the `closed` clause from `compile-filter.ts` → 13.578 fails. Restore.

- [ ] **Step 6: Record and commit** — 13.574–13.579; `Features.md`: the Board bullet gains "never shows backlog or closed tickets (spec §3.2)", the List bullet "carries `closed`, filters on it". Commit.

---

### Task 6: The client vocabulary — rows, mappers, predicates, options, precheck, replica

**Files:**
- Modify: `packages/app-core/src/view-types.ts` (`ListRow.closed`, `FilterSpec.closed`)
- Modify: `packages/app-core/src/online/mappers.ts` (`mapListPage` row → `closed`; `toServerFilterSpec`/`toClientFilterSpec` `closed`)
- Modify: `packages/app-core/src/filter/matches-filter.ts`, `list-filter.ts` (`closed` axis; `ListFilterSpec` picks it; `BoardFilterSpec` does NOT)
- Modify: `packages/app-core/src/views/transition-dialog.tsx:41-61` (`transitionOptions` over the universal sets)
- Modify: `packages/app-core/src/precheck.ts` (the four refusals mirrored; `statesWithBacklog` where it resolves names)
- Modify: `packages/app-core/src/replica/replica-data-source.ts` (`getBoard` exclusion; `getTickets` rows' `closed`; outbox accepts the two types)
- Tests: `test/online/mappers.test.ts`, `test/filter/matches-filter.test.ts`, `test/filter/list-filter.test.ts`, `test/views/transition-dialog.test.ts`, `test/precheck.test.ts`, `test/replica/replica-data-source.test.ts`

**Interfaces:**
- Produces: `ListRow.closed: { actorId; at } | null` (required); `FilterSpec.closed?: boolean`; `matchesFilter`/`matchesListRow` honour it; `transitionOptions(def, 'backlog')` = `[Start]`, and from a non-terminal state the list ends with `{ toStateId: 'backlog', name: 'Backlog', rules: [] }`; `precheckEvent` answers the four refusals with the engine's ids; replica board excludes, rows carry.

- [ ] **Step 1: Write the failing tests** (each appended to the named file in its own idiom):

- `view-types`/`mappers.test.ts` — `13.580`: `mapListPage` maps a wire card's `closed` onto the row (present and null); `toServerFilterSpec({ closed: true })` → `{ closed: true }`; `toClientFilterSpec` round-trips it.
- `matches-filter.test.ts` — `13.581`: `{ closed: true }` matches only a state with `closed` set; `{ closed: false }` only one without; absent matches both; a `TicketState` fixture without the field (legacy) counts as not closed.
- `list-filter.test.ts` — extend the agreement corpus with `closed: true/false` cases over a row/state pair with `closed` set; `@ts-expect-error` that `BoardFilterSpec` rejects `closed`.
- `transition-dialog.test.ts` — `13.582`: `transitionOptions(WF_ERRAND, 'backlog')` is exactly `[{ toStateId: 'todo', name: 'To do', rules: [] }]`; `transitionOptions(WF_ERRAND, 'doing')` ends with the Backlog option and its rules are `[]`; `transitionOptions(WF_ERRAND, 'done')` contains no Backlog option.
- `precheck.test.ts` — `13.583`: a `ticket.closed` for a `doing` ticket previews `close-requires-terminal`; a transition on a closed ticket previews `closed-ticket`; a `ticket.reopened` on a closed ticket passes.
- `replica-data-source.test.ts` — `13.584`: after folding `created(start:'backlog')` the replica's `getBoard` shows no card for it and `getTickets` shows a row with `stateId 'backlog'`; after `ticket.closed` the board drops the card and the row carries `closed`.

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implement**

`view-types.ts`: `ListRow` gains `closed: { actorId: string; at: string } | null;` after `pending` (docblock: "REQUIRED here — the row is assembled by one mapper — while the domain `TicketState` keeps it optional; spec §1.2"); `FilterSpec` gains `closed?: boolean;` after `fields` (docblock: "`true` closed only, `false` not closed, absent all — NOT an id axis, no include/exclude halves; spec §4"). `BoardFilterSpec` unchanged (`Pick` does not name it); `ListFilterSpec`'s `Pick` adds `'closed'`.

`mappers.ts`: the list-row mapper reads `closed` off the wire card (`asRecord`-style, matching how it reads `stateProvenance`); `toServerFilterSpec`: `if (filter.closed !== undefined) spec['closed'] = filter.closed;`; `toClientFilterSpec`: the inverse.

`matches-filter.ts` and `list-filter.ts`: after the field clauses, before the exclude half:
```ts
  if (spec.closed !== undefined && ((state.closed ?? null) !== null) !== spec.closed) return false;
```
(for `ListRow`: `row.closed !== null`).

`transition-dialog.tsx` `transitionOptions`: iterate `transitionsWithBacklog(def)` and resolve states over `statesWithBacklog(def)`; the docblock gains: "Since 2026-09-17 the universal Backlog edges are offered like declared ones (spec §4) — Start from backlog, Send to backlog from any non-terminal state — read from the SAME helpers the engine reads, so this function still predicts the engine."

`precheck.ts`: where it dispatches by event type, add `ticket.closed`/`ticket.reopened` cases mirroring `checks/close.ts`'s conditions and ids (it already re-implements engine rules locally — follow that file's pattern rather than importing the engine); in its transition branch add the `closed-ticket` refusal before edge resolution and resolve states/edges over the universal helpers.

`replica-data-source.ts`: `getBoard` skips rows with `stateId === BACKLOG_STATE_ID` or `(closed ?? null) !== null`; `getTickets` rows set `closed: state.closed ?? null`; the outbox's accepted-type list (grep `'ticket.workflow_rebound'`) gains both types.

- [ ] **Step 4: GREEN + whole app-core suite + typecheck + build.**

- [ ] **Step 5: Mutations** — `transitionOptions` back to `def.transitions` → 13.582 fails; drop the `closed` clause in `matchesListRow` → the agreement cases fail. Restore.

- [ ] **Step 6: Record and commit** — 13.580–13.584.

---

### Task 7: The ticket sheet — badge, Close, Reopen, Move… disabled

**Files:**
- Modify: `packages/app-core/src/views/ticket-sheet.tsx` (the action row at `~:320-330`, the header)
- Test: `packages/app-core/test/views/ticket-sheet.test.tsx` (append)

**Interfaces:**
- Produces: `TicketSheet` renders `Closed by <name> on <date>` when `read.ticket.closed` is set; a `Close` button when `stateCategory === 'terminal'` and not closed; a `Reopen` button when closed; `Move…` `disabled` with the sentence `Closed — reopen it first` beside it while closed. Close/Reopen submit one event through `dataSource.ingest` and surface a refusal in the sheet's existing refusal slot.

- [ ] **Step 1: Write the failing tests** (read the file's `renderSheet`/stub idiom; `read.ticket` is a `TicketState`):
- `13.585` — a terminal, not-closed ticket shows `Close` and not `Reopen`; clicking it ingests exactly one `ticket.closed` with `payload {}` and the sheet reloads (`onChanged`/its equivalent called).
- `13.586` — a closed ticket shows the badge with the resolved name and the IST-formatted date, shows `Reopen` and not `Close`, `Move…` is `disabled`, and the sentence is on screen; clicking Reopen ingests one `ticket.reopened`.
- `13.587` — a non-terminal ticket shows neither button.
- `13.588` — a refused close (ingest answers `refused` with `close-requires-terminal`) renders the reason verbatim in the sheet's refusal slot.

- [ ] **Step 2: RED. Step 3: Implement** — a small `closeOrReopen(type)` beside `submitTransition` (same `make`/`ingest`/result handling, `mountedRef` guard if the sheet has one); the badge via `actorLabel` + the sheet's existing date formatter (`formatIstInstant` through `provenance.ts`); `Move…` gets `disabled={(read.ticket.closed ?? null) !== null}` and the sentence in a `<span className="gn-sheet__closed-note">`. CSS: `.gn-sheet__closed-note` and `.gn-sheet__closed-badge` in `ui.css` with tokens only (`--gn-text-muted` for the note; the badge reuses `.gn-chip` tone `terminal` if `Chip` supports it — read `chip.tsx`).

- [ ] **Step 4–6:** GREEN, suite, typecheck; mutation (remove the `disabled` → 13.586 fails); record 13.585–13.588; `Features.md` ✅ bullet "Close / Reopen from the ticket sheet". Commit.

---

### Task 8: The board — Close on cards in a terminal column

**Files:**
- Modify: `packages/app-core/src/views/board.tsx` (`MoveArrows`: a `Close` button when the column is terminal; `BoardGroupSection` passes `column.category`)
- Test: `packages/app-core/test/views/board-close.test.tsx` (new, sibling of `board-moves-ui.test.tsx`)

- [ ] **Step 1: Tests** — `13.589`: a card in `done` renders a `Close` button beside the arrows; clicking ingests one `ticket.closed` and calls `onMoved` (the board reloads and, the server having excluded it, the card is gone on the next read); a card in `doing` renders no Close. `13.590`: a refused close renders through the card's notice (`role="alert"`, `gn-refusal--server`, the reason verbatim); a transport failure through the amber `gn-refusal--transport` path — mirror `13.504`'s two-branch shape.
- [ ] **Step 2–6:** RED; implement a `closeCard()` beside `submitDirect` (same latch, same `finally`, same Ruling-27 split of refusal vs transport); `aria-label` `Close <title>`; CSS `.gn-board-card__close` reusing `.gn-board-card__move`'s metrics. GREEN, mutation (Close rendered regardless of category → the `doing` negative fails), record, `Features.md` ✅ "Close from a terminal board column". Commit.

---

### Task 9: New ticket — born in the backlog, "Start in focus" for a child of an in-focus parent

**Files:**
- Modify: `packages/app-core/src/views/new-ticket-dialog.tsx` (`NewTicketDraft.start`, the note, the checkbox; `parentCandidates` gain `inFocus`)
- Modify: `packages/app-core/src/views/create-ticket-flow.tsx:181-193` (`payload.start = draft.start`); `flows/guarded-child-event.ts` and the reopen prompt: a CLOSED terminal parent's reopen batch is `[ticket.reopened, parent transition, …]`
- Modify: `apps/web/…/page.tsx:562-563` (`parentCandidates` map gains `inFocus: row.stateId !== BACKLOG_STATE_ID && row.closed === null`)
- Tests: `test/views/new-ticket-dialog.test.tsx`, `test/views/create-ticket-flow.test.tsx`

- [ ] **Step 1: Tests** — `13.591`: the dialog shows `Starts in the backlog`; with no parent chosen the draft leaves with `start: 'backlog'` and no checkbox is rendered; choosing an in-focus parent renders `Start in focus` checked → `start: 'focus'`; unticking it → `'backlog'`; choosing a backlog parent renders no checkbox and `start: 'backlog'`. `13.592`: `CreateTicketFlow.create` submits `ticket.created` with `start` equal to the draft's — and a test that FAILS if `start` is ever omitted from the payload (assert `Object.keys(payload)` contains `'start'`). `13.593`: creating under a CLOSED terminal parent — the reopen prompt's confirm submits `ticket.reopened` for the parent FIRST, then the reopening transition, then the child, in one batch.
- [ ] **Step 2–6:** RED; implement; GREEN; mutation (drop `start` from the payload → 13.592 fails); record; `Features.md` ✅ "New tickets are born in the backlog; Start in focus". Commit `packages/app-core/**`, `apps/web/…/page.tsx`, tests.

---

### Task 10: The Backlog tab and Start

**Files:**
- Modify: `packages/app-core/src/views/ticket-list.tsx` (`rowAction?: (row: ListRow) => ReactNode` rendered in a trailing cell; a `Closed` chip in the state column when `row.closed !== null`; `stateName` for backlog rows is `Backlog` — already from the server)
- Create: `apps/web/src/backlog-start.ts` — `startTargetFor(row: ListRow, defs: Map<string, WorkflowDef>): string | null` (the workflow's `initialStateId`, or null while the def is unknown)
- Modify: `apps/web/…/page.tsx`: `view` union gains `'backlog'`; the tab list gains `['backlog', 'Backlog']` FIRST (backlog comes before the board in the lifecycle); `TAB_NOUN.backlog = 'backlog'`; a `backlogNarrowing` derived from `listNarrowing.rows.filter(r => r.stateId === BACKLOG_STATE_ID)` with its own `shown/total` (total = all backlog rows before the filter); the arm renders `TicketList` with `rows={backlogNarrowing.rows}`, `narrowing` word as the List's, `rowAction` = a `Start` button that submits `ticket.transitioned { to: initialStateId }` through a page-level `startFromBacklog(row)` using the same `moveOutcome`/`TransitionDialog` path the board uses (reuse `MoveArrows`'s dispatch by extracting its `attemptMove`+dialog into a hook, OR mount a `TransitionDialog` at page level for the gated case — choose the smaller diff and say which); empty copy `Nothing in the backlog — new tickets land here.`; the List tab's own arm EXCLUDES backlog rows? — NO: spec §5.5 says the List shows everything, so the List keeps them (with state `Backlog`).
- Tests: `test/views/ticket-list.test.tsx` (rowAction slot renders per row; Closed chip), `apps/web/test/backlog-tab.test.tsx` (new)

- [ ] **Step 1: Tests** — `13.594`: the fifth tab exists, labelled `Backlog`, first in the tablist; clicking it shows only backlog rows ("N of M shown" over the backlog set); the List tab still shows them too. `13.595`: `Start` on a row ingests `ticket.transitioned { to: 'todo' }` (the fixture workflow's initial state) and the row leaves the tab on reload; with a gated initial edge the dialog opens aimed at it. `13.596`: the empty copy when no backlog rows. `13.597` (`ticket-list.test.tsx`): a closed row shows the `Closed` chip; `rowAction` renders once per row.
- [ ] **Step 2–6:** RED; implement; GREEN; mutation (Start submits `to: row.stateId` → 13.595 fails); record; `Features.md` ✅ "Backlog tab with Start". Commit.

---

### Task 11: Filters — Closed control, State options from the definitions, Calendar/Timeline hide closed by default

**Files:**
- Modify: `apps/web/src/filter-cycle.ts` (`closedMode(filter): 'all' | 'only' | 'hidden'`, `nextClosedMode`, `withClosedMode(filter, mode)`)
- Modify: `apps/web/src/board-search-scope.ts` (`buildFilterChips`: chips `Closed: only` / `Closed: hidden` keyed `closed`, `onRemove` clears it)
- Modify: `apps/web/…/page.tsx`: a `Closed` section in the Filters sheet (one `TriStateChoice`-shaped control cycling All → Closed only → Not closed → All, `data-mode` `off|include|exclude` reused, label `Closed`); State options from the workflow definitions (`statesWithBacklog` over each group's def via `getWorkflowDef` — the page already reads defs for the board's moves; reuse that read); Calendar and Timeline arms use `closed: filter.closed ?? false` in their narrowing (the "hidden by default" rule) and the strip on those two tabs shows the `Closed: hidden` chip when the default is in force; `listFilterSpec` carries `closed`.
- Tests: `apps/web/test/filters-sheet.test.tsx`, `board-search-scope.test.ts`, `board-narrowing.test.tsx`, `filter-cycle.test.ts`

- [ ] **Step 1: Tests** — `13.598` (`filter-cycle`): the three modes map to `closed: undefined/true/false` and cycle. `13.599` (`board-search-scope`): the two chips and their removal. `13.600` (`filters-sheet`): the `Closed` control cycles with names `Closed` / `Closed, included` / `Closed, excluded`; `Closed only` on the List tab shows only the closed row; `Not closed` hides it; the State chips include `Backlog`. `13.601` (`board-narrowing`): on the Calendar tab a closed ticket with a due date is hidden by default and the strip shows `Closed: hidden`; setting the control to All shows it; the Timeline likewise.
- [ ] **Step 2–6:** RED; implement; GREEN; mutations (`closed ?? false` → `closed` on the Calendar arm → 13.601 fails; State options back to board columns → the `Backlog` chip case fails); record; `Features.md` ✅ "Closed filter; Backlog in State chips; Calendar/Timeline hide closed by default". Commit.

---

### Task 12: Final gate, catalogue checks, citation sweep, spec amendments

- [ ] Full gate under Node 22: `packages/domain`, `packages/rule-engine`, `packages/app-core`, `packages/ui` (token scan), `apps/web`, `apps/server` (with Postgres) — every `vitest run` and `typecheck`, numbers quoted with `node --version`.
- [ ] `node scripts/check-case-ids.mjs` (only `13.387`/`13.413`); `node scripts/check-case-citations.mjs` (file 13's uncited set stays exactly `13.401`/`13.476`/`13.477`).
- [ ] Citation sweep (Ruling 30's method: open the file at the pre-plan commit and at HEAD; never add an offset) for every source file this plan grew: `workflow.ts`, `ticket-state.ts`, `transition.ts`, `ticket-cards.ts`, `board.ts`, `mappers.ts`, `transition-dialog.tsx`, `ticket-sheet.tsx`, `board.tsx`, `page.tsx`, `ui.css`. Re-point only citations that were correct before; list the already-stale ones left alone.
- [ ] Append `## Amendments during execution (2026-09-17)` to the spec recording every controller ruling from the ledger, and a closing paragraph in the test-cases section: gate numbers + Node, the per-task mutation summary, the re-points, the §9 named-not-built items, and a pointer to the second-wave plan.
- [ ] Commit.

---

## Self-review

**Spec coverage.** §1.1 → T1; §1.2/§1.3 → T2; §1.4 → T1 (`foldStateIdForward`); §2 → T3 (+ T6 precheck mirror, T9 closed-parent batch); §3.1/§3.3 → T4; §3.2 → T5; §3.4 → T2's additive-field rule (nothing to do); §4 → T6 (+ T11 State options); §5.1 → T10; §5.2 → T8; §5.3 → T7; §5.4 → T9; §5.5 → T10 (Closed chip) + T11; §6 → T6 (replica) + T4 (backfill); §7 → T1 (validator; the builder surfaces issues generically); §10 testing → each task; §11 files → the table.

**Placeholder scan.** Tasks 7–11 give the test cases as numbered one-line contracts and name the code anchors rather than pasting full JSX — deliberate, because each edits a large existing component whose exact surrounding code the implementer must read; every case names its exact assertion targets and every mutation names the case it kills. No "TBD"/"add handling".

**Type consistency.** `closed: { actorId: string; at: string } | null` everywhere (optional only on `TicketState`); `BACKLOG_STATE_ID`/`statesWithBacklog`/`transitionsWithBacklog` named identically in T1, T3, T5, T6, T10, T11; `start?: 'backlog' | 'focus'` in T2 and T9; `FilterSpec.closed?: boolean` in T5 (wire), T6, T11; refusal ids match the Global Constraints in T3 and T6.

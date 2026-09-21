# Priority Built-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `priority` the fifth built-in ticket field — always present, born at P2, values P1/P2/P3 — and put it on every surface the owner named: the sheet (as the prototype's segmented control, beside a new start date row), the new-ticket dialog, the list (grouping, column, filter) and the board card.

**Architecture:** Creation writes the claim (approach A of the spec): `ticket.created` gains an optional `priority` whose absence means P2, and the reducer writes `fields.priority` on creation exactly as it writes `fields.title`. Every reader downstream — server card assembler, online mappers, offline replica, sheet — reads the claim and THROWS or refuses on its absence rather than defaulting, because an absent claim after this change means a projection that was not rebuilt. Existing tickets get their claim by replaying the ledger (`rebuildProjection('proj_tickets')`), never by migration.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), zod schemas in `packages/domain`, rule engine in `packages/rule-engine`, Fastify + Postgres server in `apps/server`, React views in `packages/app-core`, shared CSS in `packages/ui`, vitest everywhere, Node 22.

**Spec:** `docs/superpowers/specs/2026-09-22-priority-builtin-design.md` — read it first; every task below argues from it. **One deviation from the spec, recorded here:** the spec's "Sync and mappers" section lists the My Work row among the rows that gain `priority`. My Work was not among the surfaces the owner chose and nothing on that screen draws a priority, so `MyWorkRow` is left unchanged by this plan. Task 10 amends the spec sentence.

## Global Constraints

- **Never commit or push to `main`.** Work on a branch cut from `origin/main` (`rel/priority-builtin` unless the controller names another); one commit per task; PR `--base main`; the controller lands.
- **Node 22 for every gate** (`node --version` prints `v22.*` in the same shell as the run). Record `NODE=` beside every test summary you paste.
- **Build before suites:** `pnpm turbo run build` (or `pnpm --filter <pkg> build` for every package the suite imports by name) BEFORE running any package's vitest — tests import sibling packages through `dist`. A stale dist produces false green AND false red.
- **Never pipe a test run into `head` or `grep -m`.** Write to a log file: `pnpm --filter @gisik-nokma/domain test > /tmp/priority-domain.log 2>&1; tail -20 /tmp/priority-domain.log`. Use a lane-unique log name (include your worktree name).
- **`Features.md` and `test-cases/` change in the SAME commit as the code they describe.** New cases start `❌` and flip to `✅` in the commit that adds the citing test; every `✅` id must appear literally in a test file (the citation ratchet `pnpm check:citations` has baseline `0` uncited for `03`, `07`, `13-board-prototype-port` and `16` — keep it there).
- **Case-id blocks — take from yours, never from the tip.** §3 `3.962`–`3.981`; §7 `7.266`–`7.275`; §16 `16.100`–`16.109`; §13 block `13.1217`–`13.1256` (measured next free after B15's self-allocated `13.1207`–`13.1216`; the controller confirms it in the dispatch — if it hands you a different block, substitute it everywhere below). Never renumber an existing id.
- **Copy rules:** the three values are spelled `P1`, `P2`, `P3` and come from ONE origin (`PRIORITIES` in `packages/domain/src/ticket-types.ts`); no other file spells the list. Provenance lines on the sheet keep the existing wording `set by {actor} on {date}`.
- **Nothing invents a value.** No reader may fill in `P2` for an absent claim. The reducer applying `DEFAULT_PRIORITY` to a `ticket.created` event is the ONE place a default exists, and it is attributed to that event's actor and clocks.
- **Never `AskUserQuestion` in the lane topology** (the idle nudger's pasted Enter selects the first option). A question goes into your progress line for the controller.
- **Every measurement names its tree and its Node.** Paste the RED run's and the GREEN run's summary lines from the log file into the commit body.

---

## File map

| File | Responsibility in this change |
|---|---|
| `packages/domain/src/ticket-types.ts` | `BUILTIN_FIELD_IDS` gains `priority`; new `PRIORITIES`, `prioritySchema`, `Priority`, `DEFAULT_PRIORITY` |
| `packages/domain/src/events/ticket-events.ts` | `ticketCreatedPayload.priority` (optional, absent = P2); docblocks |
| `packages/domain/src/ticket-state.ts` | reducer writes `fields.priority` on `ticket.created` |
| `packages/domain/src/read-models.ts` | `PriorityClaim`; `TicketCard.priority` |
| `packages/domain/src/filter-spec.ts` | `GROUPINGS` gains `priority`; `filterSpecSchema.priority` |
| `packages/rule-engine/src/checks/fields.ts`, `checks/refusals.ts` | `priority` branch; `field.priority-required` |
| `apps/server/src/read/ticket-cards.ts` | `priorityOf(row)` — throws on absence |
| `apps/server/src/read/compile-filter.ts` | `priority` clause |
| `apps/server/src/tools/rebuild-projection.ts` (new), `apps/server/package.json` | `pnpm --filter @gisik-nokma/server rebuild:projection <name>` |
| `apps/server/src/seed/seed-dev-workspace.ts` | a few seeded tickets carry explicit priorities |
| `packages/app-core/src/view-types.ts` | `Priority` re-export; `BoardCard.priority`, `ListRow.priority`; `Grouping`, `ListColumnId`, `IdAxes.priorities` |
| `packages/app-core/src/online/mappers.ts` | `mapPriority`; two card sites; `GROUPINGS`, `LIST_COLUMN_IDS`; `toServerFilterSpec` |
| `packages/app-core/src/replica/replica-data-source.ts` | `priorityOf(state)`; two card sites |
| `packages/app-core/src/filter/list-filter.ts`, `filter/board-filter.ts` | `priorities` axis (include + exclude) |
| `packages/app-core/src/views/list-model.ts` | `priority` grouping; column label |
| `packages/app-core/src/views/ticket-list.tsx` | grouping option, column, cell |
| `packages/app-core/src/views/ticket-sheet.tsx` | segmented Priority editor; Start row; exclusion |
| `packages/app-core/src/views/new-ticket-dialog.tsx`, `create-ticket-flow.tsx` | priority control; payload |
| `packages/app-core/src/views/board.tsx`, `packages/ui/src/ui.css` | card badge |
| `packages/app-core/test/helpers/seed.ts` | seeds gain `priority` |
| `docs/manual.md` → `packages/app-core/src/help/content.generated.ts` | copy; regenerate |
| `Features.md`, `test-cases/{03,07,13-board-prototype-port,16}*.md` | per task, same commit |

---

## Task 1: Domain — the built-in, the payload, the reducer, the card, the filter spec

**Backend:** claude-sonnet (defines the invariant every later task leans on; §2b of the release plan routes domain-schema work off DeepSeek).

**Files:**
- Modify: `packages/domain/src/ticket-types.ts:8`, `:160-192`
- Modify: `packages/domain/src/events/ticket-events.ts:41-57`, `:63-67`
- Modify: `packages/domain/src/ticket-state.ts:160`
- Modify: `packages/domain/src/read-models.ts:100-107`, `:191`
- Modify: `packages/domain/src/filter-spec.ts:5`, `:120-175`
- Test: `packages/domain/test/ticket-types.test.ts`, `ticket-events.test.ts`, `ticket-state.test.ts`, `filter-spec.test.ts`
- Catalogue: `test-cases/03-foundation-ledger.md` (cases `3.962`–`3.967`), `test-cases/07-api-realtime-search.md` (case `7.266`), `Features.md` §3

**Interfaces — Produces:**
```ts
// packages/domain/src/ticket-types.ts
export const BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate', 'priority'] as const;
export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export const prioritySchema: z.ZodEnum<['P1', 'P2', 'P3']>;
export type Priority = 'P1' | 'P2' | 'P3';
export const DEFAULT_PRIORITY: Priority; // 'P2'
// packages/domain/src/read-models.ts
export type PriorityClaim = { value: Priority; actorId: string; clientTime: string; serverTime: string };
export type TicketCard = { /* … */ priority: PriorityClaim; /* … */ };
// packages/domain/src/filter-spec.ts
export const GROUPINGS = ['epic', 'status', 'assignee', 'type', 'priority', 'flat'] as const;
// filterSpecSchema gains: priority: prioritySchema.optional()
// ticketCreatedPayload gains: priority: prioritySchema.optional()
```

- [ ] **Step 1: Write the failing domain tests**

Append to `packages/domain/test/ticket-types.test.ts` inside the existing `describe` that holds `'refuses a custom field that shadows a built-in field id'`:

```ts
  it('3.962 refuses a custom field with id "priority" — priority is a built-in now', () => {
    expect(() =>
      ticketTypeDefSchema.parse({ ...base, fields: [{ id: 'priority', name: 'Priority', type: 'select', options: ['P1'] }] }),
    ).toThrow(/shadows a built-in field/);
  });

  it('3.963 the priority vocabulary has ONE origin: three values, P2 in the middle is the default', () => {
    expect(PRIORITIES).toEqual(['P1', 'P2', 'P3']);
    expect(DEFAULT_PRIORITY).toBe('P2');
    for (const value of PRIORITIES) expect(prioritySchema.parse(value)).toBe(value);
    expect(() => prioritySchema.parse('P0')).toThrow();
    expect(() => prioritySchema.parse('p1')).toThrow();
    expect(() => prioritySchema.parse(null)).toThrow();
  });
```
Add `PRIORITIES, DEFAULT_PRIORITY, prioritySchema` to that file's import from `'../src/ticket-types.js'`.

Append to `packages/domain/test/ticket-events.test.ts` inside `describe('13.567 start and the two flag payloads')` (reuse its `base`):

```ts
  it('3.964 ticketCreatedPayload accepts priority P1|P2|P3 and its absence, refuses anything else', () => {
    expect(ticketCreatedPayload.parse({ ...base, priority: 'P1' }).priority).toBe('P1');
    expect(ticketCreatedPayload.parse({ ...base, priority: 'P3' }).priority).toBe('P3');
    // Absent stays ABSENT at parse — the default is applied by the reducer against the
    // creation event, never written into the stored payload (spec, "Why creation writes the claim").
    expect(ticketCreatedPayload.parse(base).priority).toBeUndefined();
    expect(() => ticketCreatedPayload.parse({ ...base, priority: 'P4' })).toThrow();
    expect(() => ticketCreatedPayload.parse({ ...base, priority: null })).toThrow();
  });
```

Append to `packages/domain/test/ticket-state.test.ts` after `describe('13.565 …')`:

```ts
describe('3.965 ticket.created writes the priority claim — every ticket has one from birth', () => {
  it('no priority on the event (a v1 event) → P2, attributed to the CREATOR and the creation clocks', () => {
    const state = createdState();
    expect(state.fields.priority).toEqual({
      value: 'P2',
      actorId: 'user-kiro',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:00.100Z',
    });
  });
  it('an explicit priority on the event is the claim, same attribution', () => {
    const state = fold([createdWith({ priority: 'P1' })]);
    expect(state.fields.priority?.value).toBe('P1');
    expect(state.fields.priority?.actorId).toBe(createdWith({}).actorId);
  });
  it('CONTROL — the title claim is unchanged by the new member, so the two are written side by side', () => {
    const state = fold([createdWith({ priority: 'P3' })]);
    expect(Object.keys(state.fields).sort()).toEqual(['priority', 'title']);
  });
  it('3.966 a later field_set on priority replaces the birth claim and keeps the new actor', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'priority', value: 'P1' },
        actorId: 'user-anselma',
        clientTime: '2026-08-21T08:00:00.000Z',
        serverTime: '2026-08-21T08:00:00.900Z',
      }),
      deps,
    );
    expect(state.fields.priority).toEqual({
      value: 'P1',
      actorId: 'user-anselma',
      clientTime: '2026-08-21T08:00:00.000Z',
      serverTime: '2026-08-21T08:00:00.900Z',
    });
  });
});
```

In `packages/domain/test/filter-spec.test.ts` amend the `groupingSchema` block (lines 165–171): replace `expect(() => groupingSchema.parse('priority')).toThrow();` with `expect(groupingSchema.parse('priority')).toBe('priority');`, replace the `GROUPINGS` equality with `['epic', 'status', 'assignee', 'type', 'priority', 'flat']`, and add `expect(() => groupingSchema.parse('workflow')).toThrow();` as the refused control. Then append:

```ts
describe('7.266 filterSpecSchema.priority', () => {
  it('accepts one of the three levels and refuses anything else', () => {
    expect(filterSpecSchema.parse({ priority: 'P1' })).toEqual({ priority: 'P1' });
    expect(() => filterSpecSchema.parse({ priority: 'P9' })).toThrow();
    expect(() => filterSpecSchema.parse({ priority: ['P1'] })).toThrow();
  });
});
```

- [ ] **Step 2: Run the domain suite to verify it fails**

Run: `cd packages/domain && pnpm test > /tmp/priority-t1-domain-red.log 2>&1; tail -25 /tmp/priority-t1-domain-red.log; node --version`
Expected: FAIL — `PRIORITIES` is not exported; `state.fields.priority` is `undefined`; `groupingSchema.parse('priority')` throws.

- [ ] **Step 3: Implement the domain**

`packages/domain/src/ticket-types.ts` line 8:
```ts
export const BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate', 'priority'] as const;
```
After `export type DueDateValue = …` (line 192) add:
```ts
/**
 * Priority is a BUILT-IN with three properties the other four built-ins do not
 * share (owner ruling 2026-09-22, spec `docs/superpowers/specs/2026-09-22-priority-builtin-design.md`):
 * it is ALWAYS present (no never-claimed state, no clearing), it STARTS AT P2
 * (the reducer writes the claim on `ticket.created`, attributed to the creator),
 * and its value set is CLOSED. This is the ONE origin of the three spellings —
 * the engine, the filter spec, the sheet's control and the new-ticket dialog all
 * import from here and none restates the list.
 */
export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;
/** Where every ticket starts (owner: "everything starts at p2 the middle"). Applied by the REDUCER, never at parse. */
export const DEFAULT_PRIORITY: Priority = 'P2';
```

`packages/domain/src/events/ticket-events.ts` — add to `ticketCreatedPayload` after `start`:
```ts
  /**
   * The birth priority (spec 2026-09-22). OPTIONAL, and ABSENT MEANS `DEFAULT_PRIORITY`
   * (P2): every event written before this member existed meant P2, and an additive
   * field must not change the meaning of stored events — the same rule `start` above
   * follows. The default is applied by `applyTicketEvent`, NOT here: a parse-time
   * default would write `P2` into every stored payload as a claim its author never
   * made (see `ticket-types.ts`'s `required` docblock for the same argument). The
   * product's own client always sends it.
   */
  priority: prioritySchema.optional(),
```
Import `prioritySchema` from `'../ticket-types.js'`. In the `ticketFieldSetPayload` docblock (line 66) change `built-ins title/description/dueDate/startDate ride` to `built-ins title/description/dueDate/startDate/priority ride`.

`packages/domain/src/ticket-state.ts` line 160:
```ts
      fields: {
        title: claim(p.title, env),
        // The birth priority (spec 2026-09-22). `?? DEFAULT_PRIORITY` is the ONE place a
        // default exists in this product, and it is attributed to THIS event's actor
        // and clocks — creating the ticket at the default IS the claim. A v1 event
        // without the member replays to P2 under its creator's name, which is what
        // every reader downstream relies on (they throw on an absent claim).
        priority: claim(p.priority ?? DEFAULT_PRIORITY, env),
      },
```
Import `DEFAULT_PRIORITY` from `'./ticket-types.js'`.

`packages/domain/src/read-models.ts` — after `DueDateClaim` (line 107) add:
```ts
/**
 * A ticket's priority: the value plus who claimed it and when. NEVER nullable and
 * NEVER a three-state union like `TicketDueDate` — there is no never-claimed or
 * cleared state to represent, because `ticket.created` writes the claim
 * (`applyTicketEvent`) and the engine refuses `value: null` for this field.
 */
export type PriorityClaim = {
  value: Priority;
  actorId: string;
  clientTime: string;
  serverTime: string;
};
```
Add `priority: PriorityClaim;` to `TicketCard` directly after `dueDate: TicketDueDate;` and a docblock bullet `- \`priority\` — always a claim; an assembler that finds none THROWS (the projection was not rebuilt).` in the type's docblock list. Import `type Priority` from `'./ticket-types.js'`.

`packages/domain/src/filter-spec.ts`:
```ts
export const GROUPINGS = ['epic', 'status', 'assignee', 'type', 'priority', 'flat'] as const;
```
and in `filterSpecSchema` after `stateCategory`:
```ts
    /** One level (spec 2026-09-22). Singular like `stateId`, so `toServerFilterSpec` maps it the same way. */
    priority: prioritySchema.optional(),
```
Import `prioritySchema` from `'./ticket-types.js'`.

- [ ] **Step 4: Run the domain suite to verify it passes**

Run: `cd packages/domain && pnpm test > /tmp/priority-t1-domain-green.log 2>&1; tail -25 /tmp/priority-t1-domain-green.log; pnpm typecheck; node --version`
Expected: PASS, `Test Files … passed`, typecheck clean.

- [ ] **Step 5: Catalogue and Features**

`test-cases/03-foundation-ledger.md` — under the §3 heading that holds `3.960`/`3.961`, append a `### Priority is a built-in (spec 2026-09-22)` block with one line per case `3.962`–`3.966` as written in the test names above, each `✅` (the citing tests land in this commit). `test-cases/07-api-realtime-search.md` — append `- **7.266** ✅ \`filterSpecSchema.priority\` accepts one of P1/P2/P3 and refuses anything else.` `Features.md` §3 — add a bullet: `- ⚙️ **Priority is the fifth built-in field** — \`BUILTIN_FIELD_IDS\` … \`PRIORITIES\`/\`DEFAULT_PRIORITY\` (one origin) … \`ticket.created\` carries an optional \`priority\`, absent means P2, and the REDUCER writes the claim attributed to the creator; \`TicketCard.priority\` is never nullable. \`packages/domain/src/ticket-types.ts\`, \`events/ticket-events.ts\`, \`ticket-state.ts\`, \`read-models.ts\`, \`filter-spec.ts\``.

- [ ] **Step 6: Commit**

```bash
git add packages/domain test-cases/03-foundation-ledger.md test-cases/07-api-realtime-search.md Features.md
git commit -m "Priority is a built-in: schema, payload, reducer default P2, card claim, filter spec (3.962-3.966, 7.266)"
```
Paste the RED and GREEN summary lines and `NODE=v22.*` into the body.

---

## Task 2: Rule engine — refuse a null priority, refuse a value off the ladder

**Backend:** claude-sonnet (rule-engine work per §2b).

**Files:**
- Modify: `packages/rule-engine/src/checks/refusals.ts:80`
- Modify: `packages/rule-engine/src/checks/fields.ts:66-80` (docblock), `:140-146`
- Test: `packages/rule-engine/test/fields.test.ts`
- Catalogue: `test-cases/03-foundation-ledger.md` (`3.967`), `Features.md` §4

**Interfaces — Consumes:** `prioritySchema` from Task 1. **Produces:** refusal rule id `'field.priority-required'`.

- [ ] **Step 1: Write the failing engine tests**

Append to `packages/rule-engine/test/fields.test.ts` inside the `describe` that holds `'planted defect: clearing the title'`:

```ts
  it('3.967 priority: the three levels are accepted on ANY ticket type, null is refused as required, anything else is a mismatch', async () => {
    for (const level of ['P1', 'P2', 'P3']) {
      expect(await checkTicketFieldSet(fieldSet('priority', level), ctx()), level).toEqual({ refused: false });
    }
    // Built-ins are answered BEFORE the type is resolved: a ticket whose type is gone still takes a priority.
    expect(await checkTicketFieldSet(fieldSet('priority', 'P1'), ctxWithoutTheTicketsType())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('priority', null), ctx())).toEqual({
      refused: true,
      rule: 'field.priority-required',
      reason: 'A ticket always has a priority. Change it instead of clearing it.',
    });
    expect(await checkTicketFieldSet(fieldSet('priority', 'P4'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Priority" needs one of P1, P2 or P3.',
    });
    expect(await checkTicketFieldSet(fieldSet('priority', 2), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Priority" needs one of P1, P2 or P3.',
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain build && cd packages/rule-engine && pnpm test > /tmp/priority-t2-red.log 2>&1; tail -25 /tmp/priority-t2-red.log`
Expected: FAIL — `priority` falls through to `field.unknown` (the INVOICE type declares no such field).

- [ ] **Step 3: Implement**

`refusals.ts` after the `field.title-required` line:
```ts
  'field.priority-required': 'A ticket always has a priority. Change it instead of clearing it.',
```

`fields.ts` — after the `dueDate || startDate` branch (before `// Now, and only now, is the ticket's own TYPE the subject`):
```ts
  // The fifth built-in (spec 2026-09-22): ALWAYS present, so `null` is refused the
  // way a null title is, and the value is held to the ONE origin of the ladder.
  if (p.fieldId === 'priority') {
    if (value === null) return refuse('field.priority-required');
    return prioritySchema.safeParse(value).success
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal('Priority', `one of ${PRIORITIES.join(', ').replace(/, (P\d)$/, ' or $1')}`));
  }
```
Import `PRIORITIES, prioritySchema` from `'@gisik-nokma/domain'`. Check `fieldKindRefusal`'s output shape against the test's expected string `'"Priority" needs one of P1, P2 or P3.'` — read `refusals.ts`'s `fieldKindRefusal` and adjust the argument (not the test) so the sentence matches exactly. Update the docblock at `:74-76`: `the four built-ins` → `the five built-ins`, and add `priority` to the list.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/rule-engine && pnpm test > /tmp/priority-t2-green.log 2>&1; tail -25 /tmp/priority-t2-green.log; pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Catalogue and Features**

`test-cases/03-foundation-ledger.md`: `- **3.967** ✅ \`checkTicketFieldSet\` accepts P1/P2/P3 on any type, refuses \`null\` as \`field.priority-required\`, and anything else as a type mismatch naming the three levels.` `Features.md` §4: extend the `checkTicketFieldSet` bullet (search `field.title-required`) with one sentence: `priority` is the fifth built-in answered before the type, null refused as `field.priority-required`.

- [ ] **Step 6: Commit**

```bash
git add packages/rule-engine test-cases/03-foundation-ledger.md Features.md
git commit -m "Engine: priority is required and one of P1/P2/P3 on every ticket (3.967)"
```

---

## Task 3: Server — the card carries the claim, the filter compiles it, and a projection can be rebuilt from the CLI

**Backend:** deepseek.

**Files:**
- Modify: `apps/server/src/read/ticket-cards.ts:165-260`
- Modify: `apps/server/src/read/compile-filter.ts:98-105`
- Create: `apps/server/src/tools/rebuild-projection.ts`
- Modify: `apps/server/package.json` (scripts)
- Test: `apps/server/test/read/ticket-cards.test.ts`, `apps/server/test/read/compile-filter.test.ts`, `apps/server/test/tools/rebuild-projection.test.ts` (new)
- Catalogue: `test-cases/07-api-realtime-search.md` (`7.267`–`7.269`), `Features.md` §7 and §13

**Interfaces — Consumes:** `PriorityClaim`, `prioritySchema`, `TicketCard.priority` (Task 1). **Produces:** `pnpm --filter @gisik-nokma/server rebuild:projection proj_tickets`.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/read/ticket-cards.test.ts` — after the `7.76` case, in the same `describe`:

```ts
  /** 7.267 — every card carries a priority claim; a v1 ticket replays to P2 under its creator. */
  it('7.267 the priority claim is on every card: P2 attributed to the creator when the event named none, the set level otherwise', async () => {
    const bornId = newUlid();
    const raisedId = newUlid();
    await applyCommitted(db.pool, [
      created({ id: bornId, actorId: world.owner }),
      created({ id: raisedId, actorId: world.owner }),
      makeCommitted({
        workspaceId: world.workspaceId,
        actorId: world.member,
        clientTime: '2026-08-15T05:00:00.000Z',
        serverTime: '2026-08-15T05:00:02.000Z',
        entity: { kind: 'ticket', id: raisedId },
        type: 'ticket.field_set',
        payload: { fieldId: 'priority', value: 'P1' },
      }),
    ]);
    const rows = await fetchTicketRows(db.pool, [bornId, raisedId]);
    const cards = await assembleTicketCards(db.pool, world.owner, rows);
    const byId = new Map(cards.map((c) => [c.ticketId, c]));
    expect(byId.get(bornId)?.priority.value).toBe('P2');
    expect(byId.get(bornId)?.priority.actorId).toBe(world.owner);
    expect(byId.get(raisedId)?.priority).toEqual({
      value: 'P1',
      actorId: world.member,
      clientTime: '2026-08-15T05:00:00.000Z',
      serverTime: '2026-08-15T05:00:02.000Z',
    });
  });

  it('7.268 a row with NO priority claim THROWS — an absence means the projection was not rebuilt, and an assembler that filled in P2 would be the default the spec rejected', async () => {
    const staleId = newUlid();
    await applyCommitted(db.pool, [created({ id: staleId, actorId: world.owner })]);
    // Simulate a projection row written by the pre-change reducer.
    await db.pool.query(`UPDATE proj_tickets SET fields = fields - 'priority' WHERE ticket_id = $1`, [staleId]);
    const rows = await fetchTicketRows(db.pool, [staleId]);
    await expect(assembleTicketCards(db.pool, world.owner, rows)).rejects.toThrow(/no priority claim on ticket .* rebuild/);
  });
```
(`created` and `makeCommitted` are the helpers the file already imports; if `created` takes a different shape in this file, copy the call form the `7.76` case uses.)

`apps/server/test/read/compile-filter.test.ts` — in the first case add `priority: 'P1',` to the spec after `stateCategory: 'active',`, add `"(t.fields -> 'priority' ->> 'value') = $6",` to the expected clauses after `'t.state_category = $5'`, renumber the two due clauses to `$7`/`$8`, and add `'P1'` at the matching position in `params.toArray()`. Add the id in the test title: rename it to `'7.269 compiles each clause with parameters only — priority included'`.

Create `apps/server/test/tools/rebuild-projection.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { fetchTicketRows } from '../../src/read/ticket-cards.js';
import { applyCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

/**
 * 13.1217 — the deploy step the spec names: after the reducer learns to write the
 * birth priority, a live `proj_tickets` written by the OLD reducer lacks the claim,
 * and `rebuildProjection('proj_tickets')` is what puts it there. The stale row is
 * manufactured by stripping the key, because the old reducer no longer exists to
 * write one.
 */
describe('13.1217 rebuild:projection puts the birth priority on a stale proj_tickets row', () => {
  let db: TestDatabase;
  let world: ReadScenario;
  beforeAll(async () => {
    db = await createTestDatabase();
    world = await seedReadScenario(db.pool);
  });
  afterAll(async () => {
    await db.close();
  });

  it('a row without the claim gets it back from the ledger, attributed to its creator', async () => {
    const id = newUlid();
    await applyCommitted(db.pool, [world.created({ id, actorId: world.owner })]);
    await db.pool.query(`UPDATE proj_tickets SET fields = fields - 'priority' WHERE ticket_id = $1`, [id]);
    const before = await fetchTicketRows(db.pool, [id]);
    expect(before[0]?.fields['priority']).toBeUndefined(); // the stale state is real, not assumed

    await rebuildProjection('proj_tickets', { pool: db.pool, projections: buildProjectionRegistry() });

    const after = await fetchTicketRows(db.pool, [id]);
    expect(after[0]?.fields['priority']?.value).toBe('P2');
    expect(after[0]?.fields['priority']?.actorId).toBe(world.owner);
  });
});
```
Adjust `world.created(...)` to however `read-scenario.ts` exposes the creation helper (open the file; `ticket-cards.test.ts` line ~360 shows the call form).

- [ ] **Step 2: Run to verify RED**

Run: `pnpm turbo run build > /tmp/priority-t3-build.log 2>&1; tail -5 /tmp/priority-t3-build.log; cd apps/server && pnpm test -- test/read/ticket-cards.test.ts test/read/compile-filter.test.ts test/tools/rebuild-projection.test.ts > /tmp/priority-t3-red.log 2>&1; tail -30 /tmp/priority-t3-red.log`
Expected: FAIL — `card.priority` undefined; compile-filter clause list differs; rebuild test compiles (the projection already writes priority through the new reducer) — it may PASS already; that is fine and recorded.

- [ ] **Step 3: Implement**

`ticket-cards.ts` — add `priority: priorityOf(row),` after `dueDate: dueDateOf(row),` in the card literal, and after `dueDateOf`:
```ts
/**
 * ALWAYS a claim (spec 2026-09-22). An absent key does not mean "never claimed" here
 * as it does for `dueDate`: `applyTicketEvent` writes the birth priority on every
 * `ticket.created`, so a row without one was written by a reducer that predates the
 * field and has not been rebuilt — `pnpm --filter @gisik-nokma/server rebuild:projection proj_tickets`.
 * Filling in P2 would be approach B of the spec by the back door.
 */
function priorityOf(row: ProjTicketRow): PriorityClaim {
  const claim = row.fields['priority'];
  if (claim === undefined) {
    throw new Error(
      `assembleTicketCards: no priority claim on ticket ${row.ticket_id} — every ticket.created writes one since 2026-09-22, so proj_tickets predates the reducer; rebuild it (rebuild:projection proj_tickets)`,
    );
  }
  const parsed = prioritySchema.safeParse(claim.value);
  if (!parsed.success) {
    throw new Error(
      `assembleTicketCards: the priority claim on ticket ${row.ticket_id} is not one of ${PRIORITIES.join('/')} — the door refuses that (checkTicketFieldSet), so this event did not come through it`,
    );
  }
  return { value: parsed.data, actorId: claim.actorId, clientTime: claim.clientTime, serverTime: claim.serverTime };
}
```
Import `PRIORITIES, prioritySchema, type PriorityClaim` from `'@gisik-nokma/domain'`. Add a docblock bullet beside the `dueDate` one: `- **No priority claim** → throw; see \`priorityOf\`.`

`compile-filter.ts` after the `stateCategory` line:
```ts
  if (spec.priority !== undefined) clauses.push(`(t.fields -> 'priority' ->> 'value') = ${params.add(spec.priority)}`);
```

Create `apps/server/src/tools/rebuild-projection.ts`, modelled on `verify-projections.ts`'s `main`:
```ts
import { pathToFileURL } from 'node:url';
import { createPool } from '../db.js';
import { buildProjectionRegistry } from '../projections/index.js';
import { rebuildProjection } from '../projections/rebuild.js';

/**
 * `pnpm --filter @gisik-nokma/server rebuild:projection <name>` — reset ONE projection
 * table and replay the whole ledger into it, in one transaction (`rebuildProjection`).
 * First use: `proj_tickets` after the 2026-09-22 change that makes `ticket.created`
 * write a birth priority — live rows written by the older reducer lack the claim and
 * every card read throws until they are replayed. `verify:projections` is the
 * detector (it reports the missing claims as drift); this is the repair.
 */
async function main(): Promise<void> {
  const name = process.argv[2];
  const databaseUrl = process.env['DATABASE_URL'];
  if (!name) {
    console.error('usage: rebuild-projection <projection name, e.g. proj_tickets>');
    process.exit(2);
  }
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const pool = createPool(databaseUrl);
  try {
    const started = Date.now();
    await rebuildProjection(name, { pool, projections: buildProjectionRegistry() });
    console.log(`rebuild-projection: ${name} rebuilt from the ledger in ${Date.now() - started} ms`);
  } finally {
    await pool.end();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
```
`apps/server/package.json` scripts, after `verify:projections`: `"rebuild:projection": "tsx src/tools/rebuild-projection.ts",`. Run `pnpm check:runbook` afterwards — if it flags the new script as undocumented, add one line to the runbook it names.

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm turbo run build > /tmp/priority-t3-build2.log 2>&1; cd apps/server && pnpm test > /tmp/priority-t3-green.log 2>&1; tail -30 /tmp/priority-t3-green.log; pnpm typecheck; node --version`
Expected: PASS. If OTHER server tests now fail because a fixture builds a `TicketCard` literal without `priority`, add `priority: { value: 'P2', actorId: <the fixture's actor>, clientTime: <its clock>, serverTime: <its clock> }` to that fixture — never a default inside product code.

- [ ] **Step 5: Catalogue and Features**

`test-cases/07-api-realtime-search.md`: `7.267`, `7.268`, `7.269` ✅ as titled above. `test-cases/13-board-prototype-port.md`: `- **13.1217** ✅ \`rebuild:projection proj_tickets\` restores the birth priority on a row the old reducer wrote.` `Features.md` §7: extend the card assembler bullet (`assembleTicketCards`) — `priority` always a claim, absence throws naming the rebuild; extend the FilterSpec compiler bullet with the `priority` clause. §13: new bullet `⚙️ **\`rebuild:projection <name>\`** — \`apps/server/src/tools/rebuild-projection.ts\`; the repair \`verify:projections\` detects the need for.`

- [ ] **Step 6: Commit**

```bash
git add apps/server test-cases/07-api-realtime-search.md test-cases/13-board-prototype-port.md Features.md
git commit -m "Server: priority on every card (throws on absence), priority filter clause, rebuild:projection CLI (7.267-7.269, 13.1217)"
```

---

## Task 4: Seeds — a fresh database shows all three levels

**Backend:** deepseek.

**Files:**
- Modify: `apps/server/src/seed/seed-dev-workspace.ts:76-83`
- Test: `apps/server/test/seed/` (the existing dev-workspace seed test — open the directory and extend the file that asserts the seeded epics)
- Catalogue: `test-cases/13-board-prototype-port.md` (`13.1218`), `Features.md` §13 seed bullet

- [ ] **Step 1: Write the failing test**

In the seed test that runs `seedDevWorkspace` and reads back tickets, add:
```ts
  it('13.1218 the dev seed spreads the three priorities so a fresh database shows every level', async () => {
    const rows = await pool.query<{ p: string }>(
      `SELECT DISTINCT fields -> 'priority' ->> 'value' AS p FROM proj_tickets WHERE project_id = $1 ORDER BY p`,
      [projectId],
    );
    expect(rows.rows.map((r) => r.p)).toEqual(['P1', 'P2', 'P3']);
  });
```
Bind `pool` and `projectId` to whatever names that file already uses.

- [ ] **Step 2: Run RED** — `cd apps/server && pnpm test -- test/seed > /tmp/priority-t4-red.log 2>&1; tail -15 /tmp/priority-t4-red.log`. Expected: `['P2']`.

- [ ] **Step 3: Implement** — in `seed-dev-workspace.ts`'s loop, add to the `ticket.created` payload:
```ts
      // Spec 2026-09-22: the seed spreads the three levels so a fresh database shows
      // every one. Deterministic off the plan number, never random — the seed is a fixture.
      priority: (['P1', 'P2', 'P3'] as const)[doc.planNumber % 3],
```
Use `PRIORITIES[doc.planNumber % PRIORITIES.length]` with `PRIORITIES` imported from `@gisik-nokma/domain` rather than the literal array, so the one-origin rule holds. If `planNumber` is not numeric in that loop, derive the index from the loop counter.

- [ ] **Step 4: Run GREEN** — same command; expected PASS.

- [ ] **Step 5: Catalogue and Features** — `13.1218` ✅; extend the §13 `seed:dev` bullet with one sentence.

- [ ] **Step 6: Commit** — `git commit -m "Dev seed carries all three priorities (13.1218)"`.

---

## Task 5: app-core types, online mappers, offline replica

**Backend:** deepseek.

**Files:**
- Modify: `packages/app-core/src/view-types.ts:236-262` (BoardCard), `:300-308` (IdAxes), `:335-353` (Grouping, ListColumnId, ListRow)
- Modify: `packages/app-core/src/online/mappers.ts:300-303`, `:555-572`, `:1026-1080`, `:1473-1490`, `:1572-1590`
- Modify: `packages/app-core/src/replica/replica-data-source.ts:738-750`, `:881`, `:1085`
- Modify: `packages/app-core/test/helpers/seed.ts:70-118`
- Test: `packages/app-core/test/online/mappers.test.ts`, `packages/app-core/test/replica/replica-data-source.test.ts`
- Catalogue: `test-cases/03-foundation-ledger.md` (`3.968`–`3.971`), `Features.md` §3 / §12

**Interfaces — Produces:**
```ts
// view-types.ts
export type { Priority } from '@gisik-nokma/domain';
export type PriorityView = { value: Priority; claim: ClaimProvenance };
export type BoardCard = { /* … */ priority: PriorityView; /* … */ };
export type ListRow = { /* … */ priority: PriorityView; /* … */ };
export type Grouping = 'epic' | 'status' | 'assignee' | 'type' | 'priority' | 'flat';
export type ListColumnId = 'status' | 'assignee' | 'dueDate' | 'type' | 'progress' | 'priority' | `field:${string}`;
export type IdAxes = { /* … */ priorities?: Priority[] };
```

- [ ] **Step 1: Types and seeds first (these are compile-time)**

`view-types.ts`: add the exports above. Place `priority: PriorityView;` directly after `dueDate` in both `BoardCard` and `ListRow`, with the docblock `/** ALWAYS present (spec 2026-09-22): the mapper and the replica THROW rather than default. */`. Add `priorities?: Priority[];` to `IdAxes` after `stateCategories`.

`test/helpers/seed.ts`: add to `boardCardSeed` and `listRowSeed`, after `dueDate: null,`:
```ts
    // Spec 2026-09-22: every card carries a priority; the seed's is the birth default,
    // attributed to the same seeded claimant every other provenance here names.
    priority: { value: 'P2', claim: claim() },
```

- [ ] **Step 2: Write the failing mapper and replica tests**

`mappers.test.ts` — add `priority: { value: 'P2', actorId: ANSELMA, clientTime: '2026-08-19T09:58:12.000Z', serverTime: '2026-08-19T10:00:00.000Z' },` to `serverCard()` after `dueDate`. Then append to the `3.38 toServerFilterSpec` describe:
```ts
  it('3.968 priorities: one level narrows to the server\'s singular `priority`; two levels THROW like every other plural', () => {
    expect(toServerFilterSpec({ priorities: ['P1'] })).toEqual({ priority: 'P1' });
    expect(() => toServerFilterSpec({ priorities: ['P1', 'P2'] })).toThrow(
      /filter key priorities .* one priority and this filter names 2/s,
    );
    expect(toServerFilterSpec({ priorities: [] })).toEqual({});
  });
```
And a new describe (pick the existing list-card mapper's name from the import list — `mapListPage` — and the board mapper `mapBoardView`; mirror how an existing `3.4x` case builds their inputs):
```ts
describe('3.969 the priority claim crosses the wire as a claim, and its absence is a mapping error', () => {
  it('list card → ListRow.priority carries value and provenance (name resolved through the roster)', () => {
    const page = mapListPage(listPageFixtureWith(serverCard({ priority: { value: 'P1', actorId: ANSELMA, clientTime: 'c', serverTime: 's' } })), roster);
    expect(page.rows[0]?.priority).toEqual({ value: 'P1', claim: { actorId: ANSELMA, actorName: 'Anselma Marak', clientTime: 'c', serverTime: 's' } });
  });
  it('a card with no priority THROWS naming the path — never a silent P2', () => {
    const { priority: _dropped, ...without } = serverCard();
    expect(() => mapListPage(listPageFixtureWith(without as TicketCard), roster)).toThrow(/priority/);
  });
  it('a card whose priority is off the ladder THROWS', () => {
    expect(() =>
      mapListPage(listPageFixtureWith(serverCard({ priority: { value: 'P7' as 'P1', actorId: ANSELMA, clientTime: 'c', serverTime: 's' } })), roster),
    ).toThrow(/one of P1\/P2\/P3/);
  });
});
```
Replace `listPageFixtureWith`/`roster` with the file's own helper names (grep `mapListPage(` in that test for the shape). Also amend the `mapPreferences` case at line ~666: the refused grouping stays `'by-vibes'`; add a positive `grouping: { p: 'priority' }` arm proving the sixth key parses. Add to the `listColumns` positive case a `'priority'` column.

`replica-data-source.test.ts` — find the case that asserts `dueDate` on a replica list row or board card and add beside it:
```ts
    // 3.970 — the replica reads the birth claim the reducer wrote; a state with none is a thrown error, not P2.
    expect(row.priority).toEqual({ value: 'P2', claim: { actorId: USER_A, actorName: null, clientTime: expect.any(String), serverTime: expect.any(String) } });
```
and a case `3.971` that hands the replica a `TicketState` whose `fields` lack `priority` and asserts the read REJECTS with `/no priority claim/` (the replica has a `ReplicaGapError`/refusal shape — reuse whichever error the `dueDateOf`-adjacent readers throw; if the replica never throws on state shape today, assert `rejects.toThrow(/priority/)` on the query promise).

- [ ] **Step 3: Run RED**

Run: `pnpm turbo run build > /tmp/priority-t5-build.log 2>&1; cd packages/app-core && pnpm typecheck > /tmp/priority-t5-tc.log 2>&1; tail -40 /tmp/priority-t5-tc.log`
Expected: typecheck RED — every `BoardCard`/`ListRow` literal without `priority` is named. That list IS your worklist for Step 4; fix each site by reading the claim, never by defaulting.

- [ ] **Step 4: Implement**

`mappers.ts`:
- `GROUPINGS` (line 300): `['epic', 'status', 'assignee', 'type', 'priority', 'flat']`. `LIST_COLUMN_IDS` (line 303): add `'priority'`.
- After `mapDueDate` add:
```ts
/**
 * `TicketCard.priority` → `PriorityView`. ALWAYS present on the wire (spec 2026-09-22);
 * a missing or off-ladder value is a `MappingError`, because the only way the server
 * sends one is a `proj_tickets` that was never rebuilt — a defect to surface, not a
 * blank to fill.
 */
function mapPriority(raw: unknown, path: string, roster: ReadonlyMap<string, string>): PriorityView {
  const record = asRecord(raw, path);
  const value = asString(record['value'], `${path}.value`);
  if (!PRIORITIES.includes(value as Priority)) throw new MappingError(`${path}.value`, `one of ${PRIORITIES.join('/')}`);
  return { value: value as Priority, claim: mapProvenance(record, path, roster) };
}
```
  Call it at the board card site (`:566`, after `dueDate`) and the list card site (`:1582`): `priority: mapPriority(record['priority'], \`${path}.priority\`, roster),`. Import `PRIORITIES, type Priority` from `@gisik-nokma/domain` and `PriorityView` from `../view-types.js`.
- `toServerFilterSpec`: add `singular('priorities', filter.priorities, 'priority');` after the `stateCategories` line. In `toClientFilterSpec` (the reverse mapper above it) add the reverse: `if (record['priority'] !== undefined) spec.priorities = [asString(record['priority'], \`${path}.priority\`) as Priority];`.

`replica-data-source.ts` — after `dueDateOf`:
```ts
/**
 * The birth claim `applyTicketEvent` writes on every `ticket.created` (spec 2026-09-22).
 * A state without it is a replica that replayed with an older reducer — THROWN, not
 * defaulted, for the reason `online/mappers.ts`'s `mapPriority` gives.
 */
function priorityOf(state: TicketState): PriorityView {
  const claim = state.fields['priority'];
  if (claim === undefined || !PRIORITIES.includes(claim.value as Priority)) {
    throw new Error(`replica: no priority claim on ticket ${state.id} — the replica's reducer predates the field; re-bootstrap`);
  }
  return {
    value: claim.value as Priority,
    claim: { actorId: claim.actorId, actorName: null, clientTime: claim.clientTime, serverTime: claim.serverTime },
  };
}
```
Add `priority: priorityOf(state),` after both `dueDate: dueDateOf(state),` lines (`:881`, `:1085`).

Fix every other literal the typecheck named (tests included) with a real claim.

- [ ] **Step 5: Run GREEN**

Run: `cd packages/app-core && pnpm typecheck && pnpm test -- test/online test/replica > /tmp/priority-t5-green.log 2>&1; tail -30 /tmp/priority-t5-green.log`
Expected: PASS.

- [ ] **Step 6: Catalogue and Features** — `3.968`–`3.971` ✅ in `03-foundation-ledger.md`; `Features.md` §3 mappers bullet and §12 replica bullet each gain a sentence on `priority` (throws, never defaults).

- [ ] **Step 7: Commit** — `git commit -m "app-core: priority crosses the wire and the replica as a claim; plural→singular filter axis (3.968-3.971)"`.

---

## Task 6: List — grouping, column, filter axis

**Backend:** deepseek.

**Files:**
- Modify: `packages/app-core/src/filter/board-filter.ts:18-21`, `packages/app-core/src/filter/list-filter.ts:34-56`
- Modify: `packages/app-core/src/views/list-model.ts:88-110`, `:170-176`
- Modify: `packages/app-core/src/views/ticket-list.tsx:38-39`, `:1085-1124`
- Test: `packages/app-core/test/filter/list-filter.test.ts`, `packages/app-core/test/views/list-model.test.ts`, `packages/app-core/test/views/ticket-list.test.tsx`
- Catalogue: `test-cases/13-board-prototype-port.md` (`13.1219`–`13.1223`), `Features.md` §3 List bullet (line 60)

- [ ] **Step 1: Write the failing tests**

`list-filter.test.ts`: add `priority: { value: 'P2', claim: provenance },` to the `row` literal after `dueDate`, and append:
```ts
describe('13.1219 the priorities axis, both halves', () => {
  it('narrows to the listed levels and excludes the listed levels; empty lists touch nothing', () => {
    expect(matchesListRow(row, 'p1', { priorities: ['P2'] })).toBe(true);
    expect(matchesListRow(row, 'p1', { priorities: ['P1', 'P3'] })).toBe(false);
    expect(matchesListRow(row, 'p1', { priorities: [] })).toBe(true);
    expect(matchesListRow(row, 'p1', { exclude: { priorities: ['P2'] } })).toBe(false);
    expect(matchesListRow(row, 'p1', { exclude: { priorities: ['P1'] } })).toBe(true);
  });
});
```
`list-model.test.ts`: change `GROUPINGS` (line 50) to `['epic', 'status', 'assignee', 'type', 'priority', 'flat']` — the two PLANTED DEFECT cases then cover the new grouping for free; give two ROWS explicit priorities (`priority: { value: 'P1', claim: claim() }` on `t1`, `'P3'` on `t4`) and append:
```ts
  it('13.1220 grouping by priority yields sections P1, P2, P3 in THAT order, every row exactly once, and labels are the level', () => {
    const sections = groupRows(ROWS, 'priority', LABELS);
    expect(sections.map((s) => s.label)).toEqual(['P1', 'P2', 'P3']);
    expect(sections.flatMap((s) => s.rows).map((r) => r.ticketId).sort()).toEqual(ROWS.map((r) => r.ticketId).sort());
  });
  it('13.1220 CONTROL — a level nobody holds yields NO empty section (rows drive sections, not the ladder)', () => {
    const onlyP2 = ROWS.map((r) => ({ ...r, priority: { value: 'P2' as const, claim: claim() } }));
    expect(groupRows(onlyP2, 'priority', LABELS).map((s) => s.label)).toEqual(['P2']);
  });
  it('13.1221 columnLabel names the priority column', () => {
    expect(columnLabel('priority')).toBe('Priority');
  });
```
`ticket-list.test.tsx`: amend the `Group by` case (`:1225`): title `'… offers epic/status/assignee/type/priority/flat — and no seventh key'`, `toHaveLength(6)`, add `'priority'` to the loop; amend the two tray cases (`:1263`, `:1286`, `:1301`) from 5 to 6 with `['Priority', false]` in the table and `'priority'` in the all-columns `chose([...])`; the `:1585` length-5 assertion — read it and extend the same way. Add:
```ts
  it('13.1222 the priority column draws the level with its claimant, the same attribution shape as the due cell', () => {
    render(<ControlledList initial={chose(['priority'], 'flat')} rows={[listRowSeed({ title: 'Loud one', priority: { value: 'P1', claim: claim({ actorName: 'Kiro' }) } })]} />);
    const cell = screen.getByText(/^P1 — /);
    expect(cell.textContent).toBe("P1 — Kiro's claim");
  });
```
(Adapt to how `ControlledList` receives rows in that file.)

- [ ] **Step 2: Run RED** — `cd packages/app-core && pnpm test -- test/filter/list-filter test/views/list-model test/views/ticket-list > /tmp/priority-t6-red.log 2>&1; tail -30 /tmp/priority-t6-red.log`.

- [ ] **Step 3: Implement**

`board-filter.ts:18`: add `'priorities'` to the `Pick`. `list-filter.ts`: after the `stateCategories` narrow add `if (!narrowsTo(spec.priorities, row.priority.value)) return false;` and after the `stateCategories` exclude add `if (excludedBy(exclude.priorities, row.priority.value)) return false;`. Check `board-filter.ts`'s `matchesBoardCard` compiles — if it iterates `BoardIdAxes` keys, add the same two lines there over `card.priority.value`.

`list-model.ts` `groupRows`: add
```ts
      case 'priority':
        return [`priority:${row.priority.value}`, row.priority.value];
```
and after the `sections` loop, before `return`, order the priority sections by the ladder:
```ts
  if (axis === 'priority') {
    return PRIORITIES.flatMap((level) => sections.get(`priority:${level}`) ?? []);
  }
```
(import `PRIORITIES`). `BUILTIN_COLUMN_LABELS`: add `priority: 'Priority',`.

`ticket-list.tsx`: `GROUPING_OPTIONS` add `'priority'` before `'flat'`; `AVAILABLE_COLUMNS` add `'priority'` after `'dueDate'`; in the cell switch add before `case 'type'`:
```tsx
    case 'priority':
      // A claim, attributed like the due cell: `P1 — Kiro's claim`.
      return (
        <span className="gn-list__priority">
          {row.priority.value} — {actorLabel(row.priority.claim.actorId, row.priority.claim.actorName)}&apos;s claim
        </span>
      );
```

- [ ] **Step 4: Run GREEN** — same command plus `pnpm typecheck`; expected PASS.

- [ ] **Step 5: Catalogue and Features** — `13.1219`–`13.1222` ✅; `Features.md` line 60: "five groupings" → "six groupings (priority groups P1, P2, P3 in ladder order)", and the column list gains Priority. `docs/manual.md:729-730` (grouping and columns lists) gain `priority` — the regen is Task 10, so edit the manual here and leave the generated corpus to Task 10.

- [ ] **Step 6: Commit** — `git commit -m "List: group, column and filter by priority (13.1219-13.1222)"`.

---

## Task 7: Ticket sheet — the segmented Priority editor and the Start date row

**Backend:** deepseek.

**Files:**
- Modify: `packages/app-core/src/views/ticket-sheet.tsx:1495-1560` (mirror for start), `:1630-1693` (docblock, reads), `:2906-2930` (Priority row), after `:2996` (Start row), `:3083-3092` (exclusion)
- Modify: `packages/ui/src/ui.css:2137` (add `.gn-ticket-sheet__priority`)
- Test: `packages/app-core/test/views/ticket-sheet.test.tsx:2774-2920`
- Catalogue: `test-cases/16-remaining-doors.md` (`16.23`–`16.30` amended; `16.100`–`16.105` new), `Features.md` line 431 bullet

- [ ] **Step 1: Amend and add the sheet tests**

In `describe('G — Priority, Due and Type as rows')`:
- `16.23`: replace the `'No priority claimed'` assertion with: `expect(within(screen.getByTestId('field-priority')).getByRole('tablist', { name: 'Priority' })).toBeInTheDocument();` and add `expect(screen.getByTestId('field-start')).toBeInTheDocument(); expect(within(screen.getByTestId('field-start')).getByText('No date claimed')).toBeInTheDocument();`. Note `bare()` has NO priority claim — see the new `16.104` for what the row says in that case; `16.23` now asserts only that the control is drawn.
- `16.27`: retitle `'16.27 Priority renders the claim as the SELECTED segment with its claim line — it is a BUILT-IN now'`; assert `within(row).getByRole('tab', { name: 'P1' })` has `aria-selected="true"`, the other two `"false"`, and the claim line as before; delete the `'No priority claimed'` null assertion.
- `16.28`: also assert `screen.queryByTestId('field-startDate')).toBeNull()` and `screen.queryByTestId('field-priority-generic')` is not needed — the generic loop must not draw a second `priority`: `expect(screen.getAllByTestId('field-priority')).toHaveLength(1)`.
- `16.29`: retitle `'16.29 Priority and Due are EDITORS, Type is read-only'`; assert `field-priority` has three `role="tab"` buttons and `field-due` has an input; keep the read-only loop for `field-type` only.
Then add:
```ts
  it('16.100 clicking a different segment submits ONE ticket.field_set carrying that level', async () => {
    const source = renderSheet(ticketRead({ ticket: ticketStateSeed({ fields: { ...ticketRead().ticket.fields, priority: { value: 'P2', actorId: 'user_kiro', clientTime: '2026-08-18T08:06:00.000Z', serverTime: '2026-08-18T08:07:00.000Z' } } }) }));
    await settled();
    fireEvent.click(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P1' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.type).toBe('ticket.field_set');
    expect(source.ingested[0]![0]!.payload).toEqual({ fieldId: 'priority', value: 'P1' });
  });
  it('16.101 CONTROL — clicking the SELECTED segment submits nothing (there is nothing to clear to)', async () => {
    const source = renderSheet(ticketRead({ ticket: ticketStateSeed({ fields: { ...ticketRead().ticket.fields, priority: { value: 'P2', actorId: 'user_kiro', clientTime: '2026-08-18T08:06:00.000Z', serverTime: '2026-08-18T08:07:00.000Z' } } }) }));
    await settled();
    fireEvent.click(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P2' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(source.ingested).toHaveLength(0);
  });
  it('16.102 a REFUSED priority keeps the previous segment selected and prints the refusal beside the row', async () => {
    const read = ticketRead({ ticket: ticketStateSeed({ fields: { ...ticketRead().ticket.fields, priority: { value: 'P2', actorId: 'user_kiro', clientTime: 'c', serverTime: '2026-08-18T08:07:00.000Z' } } }) });
    const source = sheetSource(read);
    source.ingest = async () => [{ status: 'refused', rule: 'field.type-mismatch', reason: '"Priority" needs one of P1, P2 or P3.' } as IngestResult];
    renderSheet(read, source);
    await settled();
    fireEvent.click(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P3' }));
    expect(await screen.findByText('"Priority" needs one of P1, P2 or P3.')).toBeInTheDocument();
    expect(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P2' })).toHaveAttribute('aria-selected', 'true');
  });
  it('16.103 the Start row is a date editor like Due: a changed day submits field_set startDate, empty clears', async () => {
    const source = renderSheet(ticketRead());
    await settled();
    const input = screen.getByLabelText('Start date');
    fireEvent.change(input, { target: { value: '2026-09-01' } });
    fireEvent.blur(input);
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ fieldId: 'startDate', value: { date: '2026-09-01' } });
  });
  it('16.104 a ticket read with NO priority claim says the projection is stale — never "No priority claimed", never P2', async () => {
    renderSheet(bare());
    await settled();
    const row = screen.getByTestId('field-priority');
    expect(within(row).getByText(/carries no priority claim/)).toBeInTheDocument();
    expect(within(row).queryByText('No priority claimed')).toBeNull();
    for (const tab of within(row).getAllByRole('tab')) expect(tab).toHaveAttribute('aria-selected', 'false');
  });
  it('16.105 the Start row shows its claim line when claimed', async () => {
    renderSheet(ticketRead({ ticket: ticketStateSeed({ fields: { ...ticketRead().ticket.fields, startDate: { value: { date: '2026-08-20' }, actorId: 'user_anselma', clientTime: 'c', serverTime: '2026-08-18T08:05:00.000Z' } } }) }));
    await settled();
    const row = screen.getByTestId('field-start');
    expect(within(row).getByLabelText('Start date')).toHaveValue('2026-08-20');
    expect(within(row).getByText('set by Anselma Marak on 18 Aug 2026')).toBeInTheDocument();
  });
```
Check `IngestResult`'s refused shape in `@gisik-nokma/domain` and match it exactly in `16.102`.

- [ ] **Step 2: Run RED** — `cd packages/app-core && pnpm test -- test/views/ticket-sheet.test.tsx > /tmp/priority-t7-red.log 2>&1; tail -40 /tmp/priority-t7-red.log`.

- [ ] **Step 3: Implement**

Reads (`:1692-1693`):
```ts
  const dueDate = dateClaimOf({ state, pendingFieldIds: [] }, 'dueDate');
  const startDate = dateClaimOf({ state, pendingFieldIds: [] }, 'startDate');
  const priorityClaim = state.fields['priority'];
  // The SELECTED segment, or null when the read carries no claim (a stale projection —
  // see the row). Never `?? DEFAULT_PRIORITY`: the sheet is a reader.
  const priorityValue: Priority | null =
    priorityClaim !== undefined && prioritySchema.safeParse(priorityClaim.value).success
      ? (priorityClaim.value as Priority)
      : null;
```
Write `submitPriority` beside `submitDueDate`, same guards (`prioritySubmittingRef`, `prioritySaving`), payload `{ fieldId: 'priority', value: next }`, no-op when `next === priorityValue`, refusal handling identical to `submitDueDate`'s. Write `submitStartDate` by copying `submitDueDate` with `startDate`/`startDraft`/`startSaving`/`startSubmittingRef` — the shape is identical and a second copy is the price of two rows; note in its docblock that the two are twins on purpose.

Priority row (`:2911-2929`) becomes:
```tsx
            <div className="gn-ticket-sheet__field" data-testid="field-priority">
              <dt>Priority</dt>
              <dd>
                {/* The prototype's segmented control (`desktop.dc.html:1192-1198`), on the
                    SHARED `SegmentedControl`. Priority is a built-in that is ALWAYS present
                    (spec 2026-09-22), so there is no clear affordance: clicking the selected
                    segment does nothing. `value` is the claim or the FIRST option when the
                    read carries none — the component needs a tab stop — and the stale
                    sentence below says why no segment is selected in that case. */}
                <SegmentedControl
                  options={PRIORITIES.map((level) => ({ value: level, label: level }))}
                  value={priorityValue ?? ('' as Priority)}
                  onChange={(next) => { if (!prioritySaving && next !== priorityValue) void submitPriority(next); }}
                  aria-label="Priority"
                />
                {priorityClaim === undefined ? (
                  <span className="gn-ticket-sheet__refusal">
                    This ticket carries no priority claim — the server’s projection has not been rebuilt since priority became built-in.
                  </span>
                ) : (
                  <span className="gn-ticket-sheet__claim">{`set by ${nameOf(priorityClaim.actorId)} on ${formatDate(priorityClaim.serverTime)}`}</span>
                )}
              </dd>
            </div>
```
(`'' as Priority` matches no option, so `SegmentedControl` selects nothing and keeps the first tab focusable — its documented fallback.) Start row: copy the Due row block after it with `data-testid="field-start"`, `<dt>Start</dt>`, `aria-label="Start date"`, `startDraft`/`startDate`/`submitStartDate`, same absent copy `No date claimed`. Exclusion (`:3090`): add `|| fieldId === 'startDate'`. Rewrite the door G docblock (`:1630-1690`): Priority is a BUILT-IN with an editor; Type is the one read-only row; keep the E5-6 paragraph as history. Import `PRIORITIES, prioritySchema, type Priority` from `@gisik-nokma/domain`.

`ui.css` beside `:2137`: `.gn-ticket-sheet__field .gn-segmented { display: inline-flex; }` so the control does not stretch to the row width (the prototype's is `inline-flex`).

- [ ] **Step 4: Run GREEN** — same suite + `pnpm typecheck`; then the whole app-core suite to a log (`pnpm test > /tmp/priority-t7-all.log 2>&1; tail -20 …`).

- [ ] **Step 5: Catalogue and Features** — amend `16.23`, `16.27`, `16.28`, `16.29` prose in `16-remaining-doors.md` to what they now assert; add `16.100`–`16.105` ✅; rewrite the `Features.md` line 431 bullet: Priority is a built-in with the prototype's segmented editor; Start has a row; Type is the read-only one; door G's classification superseded.

- [ ] **Step 6: Commit** — `git commit -m "Sheet: Priority is the prototype's segmented editor; Start date row (16.23-16.29 amended, 16.100-16.105)"`.

---

## Task 8: New-ticket dialog — choose the birth priority, preselected P2

**Backend:** deepseek.

**Files:**
- Modify: `packages/app-core/src/views/new-ticket-dialog.tsx:46-63`, `:274-296`, `:331-345`
- Modify: `packages/app-core/src/views/create-ticket-flow.tsx:241-253`
- Test: `packages/app-core/test/views/new-ticket-dialog.test.tsx`, `packages/app-core/test/flows/` (the create flow test — grep `ticket.created` there)
- Catalogue: `test-cases/13-board-prototype-port.md` (`13.1224`–`13.1226`), `Features.md` line 106 bullet; `docs/manual.md:338-341`

- [ ] **Step 1: Tests** — every existing `onCreate` `toHaveBeenCalledWith({...})` in the dialog test gains `priority: 'P2'` (search `start: 'backlog'` / `start: 'focus'`). Add:
```ts
  it('13.1224 the dialog offers P1/P2/P3 as one segmented control preselected at P2', () => {
    render(<NewTicketDialog open typeOptions={TYPES} parentCandidates={[]} onCreate={vi.fn()} onClose={() => undefined} />);
    const control = screen.getByRole('tablist', { name: 'Priority' });
    expect(within(control).getAllByRole('tab').map((t) => t.textContent)).toEqual(['P1', 'P2', 'P3']);
    expect(within(control).getByRole('tab', { name: 'P2' })).toHaveAttribute('aria-selected', 'true');
  });
  it('13.1225 a chosen level leaves in the draft', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTicketDialog open typeOptions={TYPES} parentCandidates={[]} onCreate={onCreate} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the tent' } });
    await user.click(within(screen.getByRole('tablist', { name: 'Priority' })).getByRole('tab', { name: 'P1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ priority: 'P1' }));
  });
```
In the create-flow test, extend the assertion on the `ticket.created` payload with `priority: 'P2'` (the flow sends the draft's value; case `13.1226`).

- [ ] **Step 2: Run RED** — `cd packages/app-core && pnpm test -- test/views/new-ticket-dialog test/flows > /tmp/priority-t8-red.log 2>&1; tail -30 …`.

- [ ] **Step 3: Implement** — `NewTicketDraft` gains `priority: Priority;` with a docblock echoing `start`'s ("ALWAYS present here; the wire's absence-means-P2 exists for events older than the field, not for this client"). State: `const [priority, setPriority] = useState<Priority>(DEFAULT_PRIORITY);` reset to `DEFAULT_PRIORITY` in the same `!open`/open effect that resets the other fields. After the Type `<label>` add:
```tsx
      <div className="gn-new-ticket__field">
        <span>Priority</span>
        {/* The prototype's control (`desktop.dc.html:1592-1599`), preselected at the
            middle (owner: "everything starts at p2"). The default is a CHOICE this
            client sends explicitly — never left to the wire's absence rule. */}
        <SegmentedControl
          options={PRIORITIES.map((level) => ({ value: level, label: level }))}
          value={priority}
          onChange={setPriority}
          aria-label="Priority"
        />
      </div>
```
Add `priority,` to the `onCreate({...})` object. `create-ticket-flow.tsx`: add `priority: draft.priority,` to the payload with a one-line comment mirroring `start`'s. Import `DEFAULT_PRIORITY, PRIORITIES, type Priority` from `@gisik-nokma/domain`, `SegmentedControl` from `@gisik-nokma/ui`.

- [ ] **Step 4: Run GREEN** — same suites + typecheck.

- [ ] **Step 5: Catalogue, Features, manual** — `13.1224`–`13.1226` ✅; `Features.md` line 106 bullet gains a sentence; `docs/manual.md:338-341` list gains `- **Priority** — P1, P2 or P3; starts at P2.` and "three things" → "four things".

- [ ] **Step 6: Commit** — `git commit -m "New ticket: choose the birth priority, P2 preselected (13.1224-13.1226)"`.

---

## Task 9: Board card — the priority badge

**Backend:** deepseek.

**Files:**
- Modify: `packages/app-core/src/views/board.tsx:1138-1158`
- Modify: `packages/ui/src/ui.css:1164-1165`
- Test: `packages/app-core/test/views/board.test.tsx`
- Catalogue: `test-cases/13-board-prototype-port.md` (`13.1227`–`13.1228`), `Features.md` §3 Board bullet (line 53)

- [ ] **Step 1: Tests** — after the `13.1177` describe:
```ts
describe('13.1227 the board card draws the priority badge; P1 carries the danger tone', () => {
  const cardAt = (value: 'P1' | 'P2' | 'P3') => boardCardSeed({ priority: { value, claim: claim({ actorName: 'Kiro' }) } });
  it('13.1227 P1 is drawn in the danger tone with the claimant as its title', () => {
    render(<Board board={errandBoard([cardAt('P1')])} onOpenTicket={() => {}} />);
    const badge = screen.getByText('P1');
    expect(badge.className).toContain('gn-board-card__priority--p1');
    expect(badge).toHaveAttribute('title', "Kiro's claim");
  });
  it('13.1228 CONTROL — P2 and P3 are drawn without the tone, and the badge is on EVERY card (no absence arm exists)', () => {
    render(<Board board={errandBoard([cardAt('P2'), cardAt('P3')])} onOpenTicket={() => {}} />);
    expect(screen.getByText('P2').className).not.toContain('--p1');
    expect(screen.getByText('P3').className).not.toContain('--p1');
    expect(screen.getAllByText(/^P[123]$/)).toHaveLength(2);
  });
});
```
- [ ] **Step 2: RED** — `pnpm test -- test/views/board.test.tsx > /tmp/priority-t9-red.log 2>&1`.
- [ ] **Step 3: Implement** — in the meta `<div>`, before the due label:
```tsx
        <span
          className={card.priority.value === 'P1' ? 'gn-board-card__priority gn-board-card__priority--p1' : 'gn-board-card__priority'}
          title={`${actorLabel(card.priority.claim.actorId, card.priority.claim.actorName)}'s claim`}
        >
          {card.priority.value}
        </span>
```
`ui.css` after `:1165`:
```css
/* Spec 2026-09-22: every card carries a priority; P1 takes the same ink the late due
   label uses (measured pair, see above). P2 is the default and is drawn — it is a fact
   on every card — but not emphasised. */
.gn-board-card__priority { color: var(--gn-text-muted); font-size: 0.8rem; font-weight: 600; }
.gn-board-card__priority--p1 { color: var(--gn-danger); }
```
- [ ] **Step 4: GREEN** — same test + typecheck; then `pnpm --filter @gisik-nokma/web typecheck` and the web suite to a log (the web app renders these cards).
- [ ] **Step 5: Catalogue and Features** — `13.1227`–`13.1228` ✅; Board bullet gains a sentence.
- [ ] **Step 6: Commit** — `git commit -m "Board card: priority badge, P1 in the danger tone (13.1227-13.1228)"`.

---

## Task 10: Copy — the manual, the generated help corpus, the spec deviation

**Backend:** deepseek.

**Files:**
- Modify: `docs/manual.md:356-362` (and the Task 6/8 edits already made), regenerate `packages/app-core/src/help/content.generated.ts` via `pnpm help:generate`
- Modify: `docs/superpowers/specs/2026-09-22-priority-builtin-design.md` ("Sync and mappers" bullet — remove "and the My Work row", add one sentence recording the deviation)
- Test: `pnpm check:help` (the corpus must match the manual)

- [ ] **Step 1** — `docs/manual.md:356-362`: add `4. **Set its priority** — the **Priority** control, P1 / P2 / P3. Every job has one; new jobs start at P2. (§5)` and `5. **Set or clear its start date** — the **Start** row's date box, like Due.`; rewrite the "Everything else…" paragraph so `priority` leaves the read-only list and the "Four rows are real controls" sentence names six: title, Assignee, description, Priority, Start, Due.
- [ ] **Step 2** — `pnpm help:generate && pnpm check:help > /tmp/priority-t10.log 2>&1; tail -5 /tmp/priority-t10.log`. Expected: check passes. Run `cd packages/app-core && pnpm test -- test/help > /tmp/priority-t10-help.log 2>&1; tail -10 …` (the help tests read the corpus).
- [ ] **Step 3** — amend the spec sentence; grep the plan and spec for `My Work` to confirm the deviation reads consistently.
- [ ] **Step 4: Commit** — `git commit -m "Copy: manual and help corpus learn the priority and start editors; spec deviation recorded"`.

---

## Task 11: The gate, the drift measurement, and the rebuild — controller and owner steps

**Backend:** controller (Sonnet seat), with the OWNER's word for the one write.

**Files:** none new. Reads only until the owner approves the rebuild.

- [ ] **Step 1: Full gate on the branch tip** — `ctl checks` and `ctl gate <sha>` per `scripts/ctl/README.md`; paste `EXIT=0`, `Tasks: N successful`, `NODE=v22.*`.

- [ ] **Step 2: Dev-database read-only checks (port 54330, the DEV database — 54329 is the shared TEST Postgres)** — from the primary checkout with the dev stack's `DATABASE_URL`:
```bash
psql "$DEV_DATABASE_URL" -Atc "SELECT count(*) FROM events WHERE type = 'ticket-type.defined' AND payload::text LIKE '%\"id\": \"priority\"%'"
psql "$DEV_DATABASE_URL" -Atc "SELECT count(*) FROM proj_tickets WHERE NOT (fields ? 'priority')"
```
Report both counts with the tree and the time. **If the first is non-zero, STOP and put the count in front of the owner** (the spec's compatibility section): those types stop parsing after this change.

- [ ] **Step 3: Detector** — with the branch built, `DATABASE_URL=$DEV_DATABASE_URL pnpm --filter @gisik-nokma/server verify:projections > /tmp/priority-verify-before.log 2>&1; tail -12 …`. Expected: `DRIFT DETECTED — proj_tickets: N row(s) missing from live` where N equals the second count above. That agreement is the measurement; paste both.

- [ ] **Step 4: Owner approval, then repair** — the rebuild is a WRITE to the owner's dev database. Ask in the progress line; on the owner's yes: after `ctl rebuild` (which deploys the new reducer), run `DATABASE_URL=$DEV_DATABASE_URL pnpm --filter @gisik-nokma/server rebuild:projection proj_tickets`, then re-run the second SQL count (expected `0`) and `verify:projections` (expected `clean`). Paste all three.

- [ ] **Step 5: Land** — `ctl land <pr>` per the merge bar; anchor with the counts from Steps 2–4 in the cycle entry.

---

## Self-review

**Spec coverage.** Domain (Task 1) · engine (2) · server assembler, compiler, rebuild (3) · seeds (4) · mappers, replica, types (5) · list grouping/column/filter (6) · sheet editor + start row (7) · new-ticket dialog (8) · board badge (9) · manual/help/spec deviation (10) · compatibility check, detector, rebuild, deploy order (11). The spec's "history copy" line needs no task: `describeEvent` already prints `Set priority to P1` for a string value (`history-copy.ts:139`, verified). `MyWorkRow` is deliberately excluded (header note; Task 10).

**Type consistency.** `PriorityClaim` (domain, wire) vs `PriorityView` (`{ value, claim: ClaimProvenance }`, client) — two names for two shapes, used consistently: server and `TicketCard` use `PriorityClaim`; `BoardCard`/`ListRow`, `mapPriority`, `priorityOf(state)` use `PriorityView`. Refusal id `field.priority-required` in Tasks 2 and 7. Filter: client `priorities: Priority[]`, server `priority: Priority`, mapped by `singular(...)` in Task 5 and matched in Task 6. Case ids: 3.962–3.971, 7.266–7.269, 13.1217–13.1228, 16.100–16.105 — all inside the blocks in Global Constraints.

**Known soft spots for the executor.** Task 3's `created(...)` helper shape and Task 5's list-page fixture helper names are read from the test files, not copied here; Task 2's refusal sentence must match `fieldKindRefusal`'s template exactly (adjust the argument, not the test). Task 7 passes `'' as Priority` to `SegmentedControl` for the stale-projection state — its documented behaviour for a value matching no option is to select nothing and keep the first tab focusable.

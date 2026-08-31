# Task 7 report — field claim checks for `ticket.field_set`

Branch `exec/03-tickets-hierarchy`, on base `d3751c8`. Gate: `pnpm turbo run build test typecheck` →
**15/15 tasks successful**. No fixtures added; the count gate stays at **64** (`test/fixtures.test.ts:13-14`,
`ls packages/rule-engine/fixtures/*.json | wc -l` → 64).

---

## What was built

| File | Change |
|---|---|
| `packages/domain/src/events/ticket-events.ts` | `ticketFieldSetPayload.value` requires presence (the four-case matrix) |
| `packages/domain/test/ticket-events.test.ts` | `describe('ticket.field_set value is required')` — 4 assertions + the `parseEvent` inheritance |
| `packages/rule-engine/src/checks/fields.ts` | **new** — `checkTicketFieldSet` + `customFieldVerdict` with its `never` guard |
| `packages/rule-engine/src/evaluate.ts` | `case 'ticket.field_set'` |
| `packages/rule-engine/test/fields.test.ts` | **new** — 14 check assertions + 1 `evaluateEvent` dispatch assertion |
| `packages/rule-engine/test/ticket-type.test.ts` | the third dispatch describe (rider F3) |
| `packages/rule-engine/test/workflow-rebind.test.ts` | the premise line (rider F2) |
| `docs/superpowers/plans/2026-08-20-00-series-coordination.md` | Ruling P14 recorded; the "three assertions" sentence corrected |
| `Features.md`, `test-cases/05-tickets-hierarchy.md` | catalogue, same change set |

Test counts, per package, after: domain 233, rule-engine 226, server 102, app-core 5, ui 31.

---

## Deviations, each with its authorising row

| # | Deviation from the brief | Authority |
|---|---|---|
| D1 | Test lives at `packages/rule-engine/test/fields.test.ts`, not `src/checks/fields.test.ts` | **A1** — all three vitest configs collect only `test/**/*.test.ts`; a `.test.ts` under `src/` is never collected |
| D2 | `Promise<Accept \| Refusal>` from `../engine.js`, not `EngineVerdict` from `../evaluate` | **A7** — there is no `EngineVerdict` and no `engine-context.ts` in this repo |
| D3 | Imports `./context-helpers.js` and `./refusals.js` with ESM `.js` suffixes | **A7 / C-23** — shipped module names; there is no `./shared` |
| D4 | Added an `env.entity.kind !== 'ticket'` guard and `safeParse` → `malformed-payload`, neither in the brief's Step 3 | **A19** ("each new check ALSO carries its own `env.entity.kind` guard") + the shipped precedent `hierarchy.ts:48-71`, `workflow-rebind.ts:44-60`. `.parse` would throw, and `evaluateEvent`'s frozen signature is `Promise<Accept \| Refusal>` — a throw is neither, for exactly the callers with no door in front of them |
| D5 | `const value = p.value;` — the brief's `p.value ?? null` dropped | **Addendum 7 / 7a**. Post-fix the coalesce is a no-op, and keeping it would state the defect as the design. The comment above it says so |
| D6 | `default: { const unhandled: never = field.type; throw … }` added to `customFieldVerdict` | Self-consistency item 2, resolved by the table: `CUSTOM_FIELD_KINDS` is exactly the five (`ticket-types.ts:4`), so the switch **is** exhaustive today — the `never` guard keeps it so. The compile error is the net; the throw is unreachable |
| D7 | A `text`-kind custom field (`reference`) added to the `INVOICE` fixture type | The brief's type declares four kinds; `customFieldVerdict`'s `text` branch had no test and no mutation could red it. M15 now does |
| D8 | Test blocks: **15** in `fields.test.ts`, against the brief's stated 10 (8 literal `it` blocks) | **Addendum 3 / 3a** — resolve by literal block count; the plan's number is a claim about the file, never the reverse. Nothing was deleted to reach a total |
| D9 | Cases 5.44–5.47 claimed; 5.42's text amended | The catalogue file's own rule (line 5) plus the never-renumber constraint: 5.4–5.36 stay reserved for Task 14, and **5.12** stays Task 14's home for the plan-anticipated field refusals. 5.27 / 5.30 / 5.36 untouched. The scope note's "continue from 5.44" is updated to 5.48 |

### One judgement call, recorded rather than escalated

A title of nothing but whitespace (`'   '`) refuses **`field.type-mismatch`** (`"Title" needs text.`), not
`field.title-required`. That is what the brief's Step 3 code does; no brief test covered it, so it was an
unpinned branch and the `.trim()` could not fail. It is now pinned. The reasoning, written into the test:
read the reason aloud — what is missing IS the title's text, so the noun is right, whereas
`field.title-required`'s sentence ("Change the title instead of clearing it") is true of the actor who sent
`null` and would be the borrowed-subject defect P11/P12/P13 closed three times.

**A tension worth a later reader's attention, deliberately not fixed here:** `ticketCreatedPayload.title` is
`z.string().min(1)`, so `' '` is an acceptable title at CREATION and refused as a later change. Widening or
narrowing either is scope this task was not given.

---

## The four-case matrix — falsifiability evidence in full

This is the piece the brief singled out, so its proof is given in full rather than summarised.

**Shape.** Implemented as `.refine((value) => value !== undefined, '…')` on `value` — *not* by making the
field required — and pinned by **four separate assertions**, two refusals and two acceptances, so the
acceptances are deliberate rather than incidental. Register matched to the shipped precedent at
`packages/domain/src/envelope.ts:122-125`; the message names the consequence specific to this door:

```
'is required — a field claim with no value would record a clearing nobody made'
```

**Mutation M1 — revert to bare `z.unknown()`.**

```
$ pnpm --filter @gisik-nokma/domain exec vitest run test/ticket-events.test.ts
❯ test/ticket-events.test.ts (14 tests | 3 failed)
  × ticket.field_set value is required > planted defect: refuses an ABSENT value …
    → expected true to be false // Object.is equality
    ❯ test/ticket-events.test.ts:156:75
  × ticket.field_set value is required > planted defect: refuses an explicitly undefined value …
    → expected safeParse to fail, but it succeeded
    ❯ test/ticket-events.test.ts:164:12
  ✓ accepts value: null — the clearing claim is a claim, made by somebody, at a time
  ✓ accepts an empty-object value — an empty claim is still a claim
  × the door inherits it: parseEvent refuses a field_set carrying no value
    ❯ test/ticket-events.test.ts:33:21
```

**The ABSENT case fails specifically**, at its own assertion (`:156`), which is the shape the brief required —
a mutation killing only present-but-`undefined` would have proven a side effect of the fix, not the fix. The
two acceptances stayed green under the mutation, which is correct: they are not what the fix produces.

The same mutation, measured at the **rule-engine** door (the one the fixture suite and Plan 10's replica pass):

```
❯ test/fields.test.ts (15 tests | 1 failed)
  × checkTicketFieldSet > planted defect: a field_set carrying no value at all is refused, not folded into a clearing
    ❯ test/fields.test.ts:243:77
```

**Restoration** verified by reading the file (`sed -n '56,61p' packages/domain/src/events/ticket-events.ts`),
never by a shell `diff`:

```ts
export const ticketFieldSetPayload = z.object({
  fieldId: z.string().min(1),
  value: z
    .unknown()
    .refine((value) => value !== undefined, 'is required — a field claim with no value would record a clearing nobody made'),
});
```

**Pre-flight sweep before the schema moved** (mandated form, explicit file enumeration — `grep -r` over a
directory is unreliable here):

```
$ find packages apps -name '*.ts' -not -path '*node_modules*' -not -path '*dist*' | xargs grep -ln 'field_set'
packages/rule-engine/test/harness.test.ts
packages/domain/test/ticket-events.test.ts
packages/domain/test/ticket-state.test.ts
packages/domain/src/vocabulary.ts
packages/domain/src/ticket-state.ts
packages/rule-engine/src/fixtures/harness.ts
```

Every constructed payload in those files carries an explicit `value`. **No shipped test pinned the
fabrication**, so nothing had to be rewritten to accommodate the fix. The harness pair (`harness.ts:32,155`)
is untouched — it is T8's, per the fix-order floor; Addendum 8's refinement confirms a candidate-position
event is judged by the domain schema, so this task's proof does not depend on the harness at all.

---

## Every other mutation, with its red

All run as `pnpm --filter @gisik-nokma/rule-engine exec vitest run test/<file>`. Each reds **at its own
assertion**, never at setup or parse.

**Restoration evidence, stated exactly.** M1, M2, M18 and M19 were restored and then verified by *reading*
the restored file (`sed -n`, `grep -n`) — quoted above for M1. The M3–M17 loop restored by copying a
pre-mutation snapshot back on each iteration **without a per-mutation read-back**; its evidence is the END
STATE — the full suite green on the restored tree, and the committed diff (`2624e1a`) containing no mutant.
That is sufficient, but it is weaker than a per-mutation read and is written here as what happened rather
than as what would sound better. No shell `diff` was used anywhere.

| # | Mutation | Test that reds | Line |
|---|---|---|---|
| M2 | delete `case 'ticket.field_set'` from `evaluate.ts` | `evaluateEvent dispatches ticket.field_set` | `fields.test.ts:275` |
| M3 | `if (!ticket) return refuse('ticket.unknown')` → `ACCEPT` | field_set on a ticket that does not exist | `:184` |
| M4 | title `null` → `ACCEPT` instead of `field.title-required` | clearing the title **and** the dispatch assertion | `:141`, `:275` |
| M5 | drop `.trim().length > 0` from the title guard | a title of nothing but whitespace | `:176` |
| M6 | `isPlainObject` description guard → `ACCEPT` | non-text title / non-document description / timestamp due date | `:154` |
| M7 | `dueDateValueSchema` day guard → `ACCEPT` | the same, **and** the startDate case | `:159`, `:202` |
| M8 | `fieldName` ternary → always `'Due date'` | timestamp start date / bare string | `:202` |
| M9 | hoist the type lookup **above** the built-in branches | custom field on a ticket whose type is no longer defined | `:228` |
| M10 | `if (!field) return refuse('field.unknown')` → `ACCEPT` | a field the type never declared | `:99` |
| M11 | number kind → `ACCEPT` | text where a number belongs | `:107` |
| M12 | drop `options.includes(value)` | a select value outside its list | `:115` |
| M13 | person kind → `ACCEPT` | date/person/text mismatches | `:128` |
| M14 | drop `IST_DAY_REGEX.test(value)` | the same | `:123` |
| M15 | text kind → `ACCEPT` | the same | `:133` |
| M16 | `env.entity.kind !== 'ticket'` → `false` | field_set filed against a non-ticket | `:258` |
| M17 | drop the custom-field `value === null` clearing accept | accepts fitting values … and null to clear | `:86` |
| M18 | delete `case 'ticket-type.defined'` (rider F3's new describe, run against `ticket-type.test.ts` alone so the fixtures are not the witness) | `evaluateEvent dispatches ticket-type.defined` | `ticket-type.test.ts:168` |
| M19 | point rider F2's premise line at a workflow nobody defined | the P13 refusal test | `workflow-rebind.test.ts:131` |

**No mutation survived.** M9 is worth naming: it proves the check ORDER, not just a branch — hoisting the
type lookup above the built-ins reds the assertion that a title change on a type-less ticket is still
accepted, which is the half that makes "the built-ins belong to no type" a proof rather than a comment.

---

## The four additions

### 1. The `z.unknown()` presence hole — closed

Above. `packages/domain/src/events/ticket-events.ts:56-61`, cited from `checks/fields.ts`'s header and from
`test-cases` 5.44.

### 2. The dispatch

`case 'ticket.field_set'` added to `evaluate.ts:31-32`; the entering assertion is
`describe('evaluateEvent dispatches ticket.field_set')`, proven by M2. It refuses `field.title-required`
rather than accepting something, so a pass-through default cannot fake it.

### 3. Two riders on Task 6's work

**F2 — closed.** `test/workflow-rebind.test.ts:131` now asserts the premise itself:

```ts
expect(await ctx().getWorkflowDef(TASK.workflowId)).not.toBeNull();
```

The line above it (a *different* workflow accepted) is a neighbour of the premise, not the premise, and is
kept — it says the check works. M19 proves the new line is not vacuous. The comment records why the premise
is true by construction (`buildMemoryContext`'s reducer throws on a `ticket.created` whose type's workflow is
undefined, `ticket-state.ts:103-107`) and why that is a reason to assert it, not to skip it.

**F3 — closed both ways.** Verified against the shipped files rather than the commit message: `git show
7b21499 --stat` plus `find … | xargs grep -n evaluateEvent` shows Task 6 added **two** `evaluateEvent`
assertions (`reparent.test.ts:524`, `workflow-rebind.test.ts:206`) plus two `ticket-type.defined` fixtures,
which enter there via `fixtures.test.ts:19`. `test/ticket-type.test.ts` had no `evaluateEvent` entry at all.
Task 6's own commit message also says "three".

Both halves of the brief's option were taken: the **third describe was added** to `ticket-type.test.ts` (so
the dispatch is pinned where the check's own tests live, not one relocation away), and the coordination doc's
sentence was **corrected with accurate attribution** — it now says Task 6 added two plus two fixtures, and
that Task 7 added the third and a fourth. It does not retroactively credit Task 6 with three. `test-cases`
5.42 was amended to keep describing reality.

### 4. Ruling P14, recorded

Appended to `docs/superpowers/plans/2026-08-20-00-series-coordination.md` beside the Plan 3 rulings, **in
this commit**. Not implemented — the design and the test home are Task 12's, because no unit test can pin it
(`buildMemoryContext` has no workspace notion for workflows). Every `file:line` in the record was verified
against the shipped file, and **one inherited citation was wrong and is corrected in place**: Addendum 10
cites `apps/server/src/engine-context.ts:76-78` for the ticket-null branch; the branch is at `:74-76`
(`if (head === null || !isIdentityOnlyKind(kind)) return null;`) and `:76-78` is `return { kind, id }`. The
record says so rather than quietly renumbering.

---

## Two findings from the brief's own self-consistency row

- **Exhaustiveness (item 2)** — answered as the table directed: `CUSTOM_FIELD_KINDS` is exactly the five
  (`ticket-types.ts:4`), so the switch is exhaustive today; a `never` guard now makes a sixth kind a compile
  error instead of a silent fall-through.
- **The coverage hole (item 3)** — `refuse('ticket.unknown-type')` now has a test, and it is a
  **memory-context** test as ⚠️-4 requires. The world is staged by defining the type for the fold and then
  removing it from the context's own `ticketTypes` map: `applyTicketEvent` throws on a `ticket.created`
  whose type is unknown (`ticket-state.ts:97-99`), so the reducer cannot fold its way there, and the fixture
  harness's `getTicketTypeDef` **throws** by design naming Task 8 (Addendum 5), so a fixture would throw
  rather than refuse. **The harness throw was not touched.**
- **Item 1 (the count)** — resolved by literal count per Addendum 3: 15 blocks in `fields.test.ts` where the
  brief said 10 and 8 were written. More, never fewer.

---

## Conventions checked, not assumed

- Refusal copy asserted as **literal strings** — rule id and complete interpolated message — never via
  `REFUSALS` or `fieldKindRefusal`. Every `field.type-mismatch` `needsPhrase` variant is asserted as its
  interpolated result (`needs a number.`, `needs one of: Draft, Sent, Paid.`, `needs a person.`,
  `needs a date in YYYY-MM-DD form.`, `needs text.`, `needs a document.`,
  `needs a day in YYYY-MM-DD form (a note is optional).` for both day built-ins).
- Candidate payloads spell `fieldId` (domain schema); no prior-event payload was written, so the harness's
  `field` spelling is untouched. Ruling P8 / A16 intact.
- No local zod schema declared for a registered event; no `as` cast anywhere in the new code.
- `IST_DAY_REGEX` and `dueDateValueSchema` imported from `@gisik-nokma/domain`, never restated.
- No fixtures added; gate stays 64. Addendum 8's refinement *would* permit a candidate-position fixture for
  the presence matrix without waiting for T8's harness fix — recorded because it is the kind of thing a
  reviewer will ask — but the dispatch forbids adding fixtures, and the unit tests already fail where a
  fixture would.
- `reference/` untouched. No subagents dispatched.

---

## What I could not verify

1. **Ruling P14's live behaviour.** It is latent — the server's `getEntityState('ticket', …)` returns null
   today, so `ticket.unknown` fires before the workflow lookup. The accept-across-a-tenancy-boundary claim is
   established by reading the three files (migration PK, projection query, context pass-through) and by the
   absence of any workspace predicate on that path, **not** by running a foreign-workflow rebound end to end.
   That becomes runnable only once Task 12 lands, which is where the ruling puts it.
2. **Whether `ticket.unknown-type` is reachable on the real server path.** The test stages it by removing the
   type from the memory context's map. On the server, `proj_ticket_types` (Task 9) and `proj_tickets`
   (Task 10) are separate tables applied by the same registry, so a created ticket's type should always
   resolve. The branch is defensive rather than demonstrated-reachable; it is now tested, which is what the
   finding asked for, but I make no claim that a production ledger can produce the state.
3. **The `' '` title tension** (creation accepts it, a later change refuses it) is recorded above and not
   resolved — resolving it would move `ticketCreatedPayload`, which this task was not given.

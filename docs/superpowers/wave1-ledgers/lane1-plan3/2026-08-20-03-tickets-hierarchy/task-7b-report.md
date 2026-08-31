# Task 7b — batched corrections report

Branch `exec/03-tickets-hierarchy`, base `2624e1a`, commits **`2278e2a`** (one commit — the three items
interlock across shared files, so they are not independently bisectable) and **`9fe41aa`** (the
follow-up citation fix the wider sweep found). Three items, all
landed. Gate: `pnpm turbo run
build test typecheck` → **15 successful, 15 total**.

---

## Deviations from the brief (stated up front)

| # | Brief says | Repo says | What I did |
|---|---|---|---|
| D1 | Item 2 is "byte-identical at `hierarchy.ts:65` and `workflow-rebind.ts:54`" — **three** sites | The pattern `parsed.error.issues.map((issue) => issue.message).join('; ')` appears at **seven** production sites, in six files | Fixed all seven, through one shared helper. Argued below |
| D2 | "The next free id is **5.45**" | `test-cases/05-tickets-hierarchy.md` already holds 5.44–5.47 (minted by Task 7), and its own scope note says "New cases beyond that continue from **5.48**" | Minted **5.48, 5.49, 5.50**; bumped the scope note's next-free to 5.51. Addendum 3's ruling: the literal file wins, never renumber |
| D3 | Item 3 names **three** citations to re-tense | A fourth exists: `packages/domain/test/ticket-events.test.ts` (the presence-hole block comment) cites `p.value ?? null (src/ticket-state.ts:201)` as live | Re-tensed all four, plus a fifth dangling reference in `checks/fields.ts` |
| D4 | (unstated) | P15's comment added 27 lines to `events/ticket-events.ts`, item 3's comment added 10 to `ticket-state.ts`, and the `ZodError` import shifted `refusal-rules.ts` by 2 — drifting **ten** `file:line` citations elsewhere in the repo | Re-derived and repointed all ten; a second enumerated sweep over every touched file now comes back empty |

None of these changes what the brief asked for; each widens it to what shipped code actually contains.

---

## Item 1 — Ruling P15: a whitespace-only title is refused at creation

`packages/domain/src/events/ticket-events.ts` — `ticketCreatedPayload.title`:

```ts
  title: z
    .string()
    .min(1)
    .refine((value) => value.trim() !== '', 'must not be blank — a title of only spaces names nothing'),
```

**Construction and register matched to the sibling lane's precedent**, `displayName` in
`packages/domain/src/events/membership.ts` (`workspace.created` / `workspace.renamed` /
`project.created`), which is `z.string().min(1).refine((value) => value.trim() !== '', 'must not be
blank — a name of only spaces names nothing')`. Same chain, same message shape, the noun changed to
the one this schema is about. It refuses; it does not trim — the ledger stores the claim as it was
made, and rewriting `'  Reconcile the till  '` puts words in the actor's mouth.

**Not folded into the shared `displayName`.** That schema says "name", which is the wrong noun here,
it is not exported, and it belongs to the workspace/membership vocabulary. The *construction* is what
is shared, which is what "one answer rather than two" asks for. `envelope.ts` was not touched
(pre-flight Addendum 4: lane 1 is a pure consumer of that file).

Doc comment records the ruling, the sibling precedent, and the asymmetry it closes: the create door
was admitting precisely the state `checkTicketFieldSet` refuses as `field.type-mismatch`, so "the
title that cannot vanish" was an edit-time rule rather than an invariant.

### Tests — `packages/domain/test/ticket-events.test.ts`, `describe('ticket.created title must not be blank')`

Four corners plus the door:

1. empty title → refused, message `String must contain at least 1 character(s)` at path `['title']`
2. whitespace-only → refused, message `must not be blank — a title of only spaces names nothing`
3. padded real title → accepted **and stored verbatim**: `parse(...)` asserted `toEqual` with
   `title: '  Reconcile the till  '` (mirrors `membership.test.ts:56`)
4. ordinary title → accepted
5. `parseEvent` inherits it → `invalid-payload`

The whitespace-only case asserts `safeParse(...).success` is `false` *before* reaching the `issues()`
helper, matching the shipped sibling block at `:155` — so a mutation lands on an assertion, not on
the helper's throw.

### Mutation proof

Mutation: replace the whole `title` chain with `title: z.string().min(1),` (the shipped state).

```
$ npx vitest run   # packages/domain
 FAIL  test/ticket-events.test.ts > ticket.created title must not be blank > planted defect: refuses a title of only spaces — .min(1) alone admits it
     → expected true to be false // Object.is equality
 FAIL  test/ticket-events.test.ts > ticket.created title must not be blank > the door inherits it: parseEvent refuses a ticket.created whose title is only spaces
     → expected true to be false // Object.is equality
      Tests  2 failed | 236 passed (238)
```

**Specific, as required**: the empty-title case, the padded-verbatim case and the ordinary case all
stay GREEN — `''` still refuses on `.min(1)`, so only the whitespace-only assertion and its
door twin go red. A mutation that killed the empty case too would have proven `.min(1)`, not P15.
Restoration verified by reading the file and by `git diff` (never a shell `diff`).

---

## Item 2 — the refusal reason with no subject

### Argument for the shape chosen

**One shared helper, `malformedPayloadDetail(error: ZodError): string`, in
`packages/rule-engine/src/refusal-rules.ts`, rendering `at ${issue.path.join('.')}: ${issue.message}`
per issue, joined `'; '`, with the clause omitted when `path` is empty.**

- **Why the path clause and not something else.** `parse-event.ts:90-94` already renders the same zod
  issue correctly as `at ${issue.path.join('.')}`. Mirroring it keeps one style across the door and
  the engine — these are both user-facing refusal copy, unlike the harness's internal
  `${path}: ${message}` throw text, which is the other in-repo style and the wrong precedent to copy.
- **Why the path goes INSIDE the detail.** Two shipped fixtures assert `reasonStartsWith` a prefix
  ending at `malformed:` (`transition-refuses-malformed-payload.json`,
  `workflow-defined-refuses-malformed-payload.json`). Everything through that colon is byte-identical
  after this change. Moving the clause before the colon, as `parse-event.ts` literally does, would
  have broken both.
- **Why the empty-path fallback is not optional.** A payload that is not an object fails at the root
  with `path: []`; rendering the clause anyway produces `malformed: at : Expected object`, which is
  worse than the fragment it replaced.
- **Why every issue, not the first.** The seven sites always joined all issues. `parse-event.ts`
  takes only the first, but narrowing the engine's behaviour to match would be a change nobody asked
  for and would silently drop information from multi-issue refusals.
- **Why a helper, and why in `refusal-rules.ts`.** The brief's stated purpose is "so no future check
  copies the broken one". Seven corrected copies serve that no better than seven broken ones — the
  next check still copies a fragment. All seven call sites already import `refusal-rules.ts` for
  `REFUSAL_RULES.malformedPayload`, so the helper costs **zero new import edges** and introduces no
  layering oddity (`src/*` reaching into `src/checks/*`). One construction, one place to change it,
  and one mutation that proves every site routes through it.
- **`workflow-defined.ts:47` deliberately left alone** — those are `validateWorkflowDef`'s own
  issues, not zod issues; they carry their own subjects and have no path.

### The seven sites

| File | Event type | Was the detail wrong in a way a reader would notice? |
|---|---|---|
| `checks/hierarchy.ts:65` | `ticket.created` | Yes — `ticketCreatedPayload` has **two** ULID fields, and the reason was bare `must be a ULID` |
| `checks/hierarchy.ts:203` | `ticket.reparented` | Single field, so merely subject-less |
| `checks/fields.ts:104` | `ticket.field_set` | Yes — Task 7's refine produced a whole sentence with no noun |
| `checks/ticket-type.ts:37` | `ticket-type.defined` | Yes — `Number must be greater than or equal to 1` names no field |
| `checks/workflow-rebind.ts:54` | `ticket.workflow_rebound` | Yes — an empty `toStateId` said `String must contain at least 1 character(s)`; a reader guesses `toWorkflowId` first |
| `transition.ts:32` | `ticket.transitioned` | Plan 2's; same defect |
| `workflow-defined.ts:25` | `workflow.defined` | Plan 2's; same defect |

### Literal assertions moved

All five existing full-string assertions were updated, then **derived by running** rather than
transcribed — each was correct on the first run, which is itself the check that the derivation was
right (a wrong path would have failed):

| Test | New literal |
|---|---|
| `test/hierarchy.test.ts` | `This ticket.created event's payload is malformed: at parentId: must be a ULID` |
| `test/reparent.test.ts` | `This ticket.reparented event's payload is malformed: at newParentId: must be a ULID` |
| `test/ticket-type.test.ts` | `This ticket-type.defined event's payload is malformed: at rank: Number must be greater than or equal to 1` |
| `test/workflow-rebind.test.ts` | `This ticket.workflow_rebound event's payload is malformed: at toStateId: String must contain at least 1 character(s)` |
| `test/fields.test.ts` | `This ticket.field_set event's payload is malformed: at value: is required — a field claim with no value would record a clearing nobody made` |

### Three assertions added — `test/engine.test.ts`, `describe('a malformed payload names the field it is about')`

`transition.ts` and `workflow-defined.ts` had **no** full-literal assertion — only the two fixtures,
whose `reasonStartsWith` prefix stops before the detail. Extending the fix into them without a
witness would have shipped two unfalsifiable edits. So:

1. `ticket.transitioned` with `payload: { to: 'done', comment: { text: 5 } }` →
   `… malformed: at comment.text: Expected string, received number`. This is the **only** assertion
   in the repo that pins `path.join('.')` on a multi-segment path — change the join to a comma and it
   dies.
2. `workflow.defined` with `version: 0` → `… malformed: at version: Number must be greater than or
   equal to 1`.
3. `workflow.defined` with a **string** payload → `… malformed: Expected object, received string`.
   The only assertion pinning the empty-path omission.

No fixtures added; the count gate stays at 64, untouched.

### Mutation proof — one mutation, seven sites

Mutation A — drop the path clause from the helper (`.map((issue) => issue.message)`):

```
$ npx vitest run   # packages/rule-engine
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/engine.test.ts > a malformed payload names the field it is about > ticket.transitioned: a nested path is joined with dots
 FAIL  test/engine.test.ts > a malformed payload names the field it is about > workflow.defined: the version that cannot be zero says which field it is
 FAIL  test/fields.test.ts > checkTicketFieldSet > planted defect: a field_set carrying no value at all is refused, not folded into a clearing
 FAIL  test/hierarchy.test.ts > checkTicketCreated > planted defect: a malformed payload REFUSES rather than throwing out of the engine
 FAIL  test/reparent.test.ts > checkTicketReparented > planted defect: a malformed payload REFUSES rather than throwing out of the engine
 FAIL  test/ticket-type.test.ts > checkTicketTypeDefined > planted defect: a malformed payload REFUSES rather than throwing out of the engine
 FAIL  test/workflow-rebind.test.ts > checkTicketWorkflowRebound > planted defect: a malformed payload REFUSES rather than throwing out of the engine
      Tests  7 failed | 221 passed (228)
```

Seven failures for seven production sites, each at its own `toEqual`/`resolves.toEqual`, none at
setup or parse. Sample diff (`test/fields.test.ts`):

```
-   "reason": "This ticket.field_set event's payload is malformed: at value: is required — a field claim with no value would record a clearing nobody made",
+   "reason": "This ticket.field_set event's payload is malformed: is required — a field claim with no value would record a clearing nobody made",
```

Mutation B — drop only the empty-path guard (always render the clause):

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/engine.test.ts > a malformed payload names the field it is about > workflow.defined: a payload that is not an object at all names no field, because there is none
-   "reason": "This workflow.defined event's payload is malformed: Expected object, received string",
+   "reason": "This workflow.defined event's payload is malformed: at : Expected object, received string",
```

Exactly one failure, at its own assertion. Both restorations verified by reading the file and by
`git diff`; no shell `diff` was used anywhere in this task.

---

## Item 3 — the dead coalesce

`packages/domain/src/ticket-state.ts:211` is now `claim(p.value, env)`. The comment above it records
why the coalesce is gone rather than leaving the reader to wonder: with `value` required, the `parse`
two lines up throws on an absent or `undefined` value, `null ?? null` is identity, and
`claim(value: unknown, …)` never needed it for typing. Same reasoning Task 7 used to drop the
identical coalesce in `checks/fields.ts`.

**Verified by running**: `packages/domain` `test/ticket-state.test.ts` — Task 3's suite, which covers
this fold — **23 passed**, unchanged.

### Citations re-tensed

| Where | What changed |
|---|---|
| `packages/domain/src/events/ticket-events.ts` (the `ticketFieldSetPayload` doc comment) | "The reducer reads … so an omitted `value` **is** folded" → "USED TO read … **WAS** folded", plus a sentence saying the coalesce has since been dropped and pointing at `ticket-state.ts:211` |
| `packages/rule-engine/test/fields.test.ts` (the block comment) | "the reducer's `p.value ?? null`" → "the reducer's then-`p.value ?? null`", plus the same closing sentence |
| `test-cases/05-tickets-hierarchy.md` case 5.44 | dropped the live `ticket-state.ts:201` citation; added a cross-reference to the new case 5.50 |
| **`packages/domain/test/ticket-events.test.ts`** (not in the brief — D3) | same treatment |
| **`packages/rule-engine/src/checks/fields.ts:78-81`** (not in the brief) | already past-tense, but its `p.value ?? null` reference now dangled; noted that the coalesce was dropped too |

### Deliberately NOT changed

- **`packages/rule-engine/src/fixtures/harness.ts:308`**, `value: payload.value ?? null`. Character
  for character the same construction, but **still reachable**: the harness's own
  `ticketFieldSetFixturePayloadSchema.value` is still bare `z.unknown()`. Pre-flight Addendum 7a
  assigns that pair (`:32` and `:155`) to **Task 8**, before it authors fixtures that depend on the
  tightened behaviour. Dropping the coalesce here without the schema fix would turn a fabricated
  clearing into an `undefined` value written into fixture state — strictly worse.
- **`docs/superpowers/plans/*`** — plan text, shared across lanes, describing what was specified
  rather than what shipped. Not this task's to rewrite.

---

## `file:line` citations repointed (D4)

P15's comment moved everything below it in `events/ticket-events.ts`; item 3's comment moved
everything below it in `ticket-state.ts`. Nine citations elsewhere in the repo pointed into those
regions and were re-derived against the files as they now read:

| Citation | Was | Now | In |
|---|---|---|---|
| `events/ticket-events.ts` value field | `:56`, `:56-61` | `:91`, `:91-93` | `test/fields.test.ts`, `checks/fields.ts` |
| `events/ticket-events.ts` rebound payload | `:97-100` | `:158-161` | `test/workflow-rebind.test.ts`, `checks/workflow-rebind.ts` |
| `events/ticket-events.ts` stateMapping note | `:90-95` | `:151-156` | `ticket-state.ts`, `checks/refusals.ts` |
| `ticket-state.ts` field_set case | `:198-202`, `:201` | `:197-211`, `:211` | `checks/fields.ts` and the four re-tensed comments |
| `ticket-state.ts` rebound state check | `:219-222` | `:229-232` | `test/workflow-rebind.test.ts`, `checks/workflow-rebind.ts` |
| `ticket-state.ts` transition-log note | `:223-230` | `:233-240` | `checks/workflow-rebind.ts` |

Citations below the insertion points (`ticket-state.ts:94`, `:97-99`, `:103-107`) are unaffected and
were left alone.

**A second, wider sweep** was then run over EVERY file this change set touched — not only the two
that gained comments — because prepending the `ZodError` import shifted `refusal-rules.ts` by two
lines and `engine.test.ts` gained ~50 lines mid-file:

```
find packages apps test-cases Features.md README.md -type f \( -name '*.ts' -o -name '*.json' \
  -o -name '*.md' -o -name '*.tsx' \) -not -path '*/node_modules/*' -not -path '*/dist/*' \
  | xargs grep -n "refusal-rules.ts:[0-9]\|engine.test.ts:[0-9]\|checks/fields.ts:[0-9]\|\
fields.test.ts:[0-9]\|ticket-events.test.ts:[0-9]\|refusals.ts:[0-9]\|transition.ts:[0-9]\|\
workflow-defined.ts:[0-9]\|hierarchy.ts:[0-9]\|ticket-type.ts:[0-9]\|workflow-rebind.ts:[0-9]"
```

It found **one further drift**, fixed in the follow-up commit: `checks/refusals.ts:191` cited
`refusal-rules.ts:14` for the `parent-terminal-with-open-children` rule id, which the import
prepend moved to `:16` — the citation had come to point at `illegalTransition`. The four
`transition.ts:11-28` / `:41-42` citations were checked and are UNCHANGED: that file's diff is
2 insertions / 2 deletions, so no line moved. Nothing else in tracked, non-pinned files cites a line
in a file this change set touched. Pinned-in-time documents (`preflight-conflict-table.md`, the
coordination doc, the plan texts) cite a named commit and are deliberately not maintained here.

**So: ten drifted citations found and repointed, and the sweep now comes back empty.**

---

## Catalogue

`Features.md` §5 — two bullets edited, one added:

- **Ticket event vocabulary**: `ticket.created`'s title rule (P15's user-visible copy) folded into
  the existing bullet; the `ticket.field_set` clause now says the coalesce has been dropped.
- **New: "Malformed-payload refusals name their field"** (`packages/rule-engine/src/refusal-rules.ts`).

`test-cases/05-tickets-hierarchy.md` — **5.48** (P15), **5.49** (the subject-less detail, all seven
sites), **5.50** (the dead coalesce). Scope note's next-free bumped 5.48 → 5.51. Nothing renumbered;
5.4–5.36 untouched, and 5.27 / 5.30 / 5.36 unmoved.

---

## Test command and output

```
$ export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
$ pnpm turbo run build test typecheck      # from the repo root
 Tasks:    15 successful, 15 total
Cached:    1 cached, 15 total
  Time:    8.185s
```

Per package (`pnpm turbo run test --force`): `@gisik-nokma/domain` 238 passed (15 files),
`@gisik-nokma/rule-engine` 229 passed (11 files), `@gisik-nokma/server` 102 passed (17 files),
`@gisik-nokma/ui` 31 (3), `@gisik-nokma/app-core` 5 (1). Fixture count gate unchanged at 64; no
fixture files added or removed.

Note: `.superpowers/sdd/.gitignore` is `*`, so this report is NOT committed — same as `progress.md`.
It lives on disk only.

---

## What I could not verify

1. **No end-to-end proof that a blank title is refused through the SERVER's ingest path.** P15 is
   proven at the domain schema and through `parseEvent` (which is the door ingest calls), and the
   engine's own `checkTicketCreated` inherits it via `safeParse`. There is no `apps/server` test
   exercising a whitespace-title `ticket.created` against Postgres — Task 8 owns end-to-end fixtures
   and the brief forbids adding any here.
2. **`parseEvent`'s own message for a blank title is not pinned by a test** — but it IS verified by
   running. The door test asserts the code (`invalid-payload`), matching the shipped sibling
   assertion in the same file. The full string was then probed directly against the built package:

   ```
   $ node probe.mjs   # parseEvent(makeEnvelope({ type: 'ticket.created', …, title: '   ' }))
   {"ok":false,"code":"invalid-payload","message":"payload for 'ticket.created' v1 is invalid at title: must not be blank — a title of only spaces names nothing"}
   ```

   Verified, not guessed — but no assertion holds it, so a future edit to `parse-event.ts`'s
   construction would change it silently.
3. **Whether other lanes' in-flight work re-moves the nine repointed `file:line` citations.** They are
   correct against this branch at this commit; any concurrent edit above those lines in
   `events/ticket-events.ts` or `ticket-state.ts` will drift them again.
4. **`checks/fields.ts:78`'s claim that the presence refine is "this task"** — that text is Task 7's
   and still reads correctly; I only extended its adjacent sentence. I did not audit the rest of Task
   7's prose.

---

# Fix round 1 — three findings from the Task 7b review

Review outcome: Spec ✅ on all three items, quality approved, 3 Minor, nothing Critical or Important.
The 3→7 widening was ratified as **Ruling P16** (it edits two Plan 2 files; both shipped fixtures
still hold byte-for-byte, and the cross-lane controller is notified). Commit **`c94b103`**.

## M1 — a repointed citation named one thing and pointed at another

`packages/rule-engine/test/fields.test.ts:55` read *"Candidate payloads spell the key `fieldId`,
which is what the DOMAIN schema says (`events/ticket-events.ts:91`)"*. Line 91 is `value: z`.
Repointed to **`:90`**, which is `fieldId: z.string().min(1)` — the line the sentence is about.

**This is the same defect class the task existed to fix, introduced by the fix itself**, and the
mechanism is worth recording: my D4 sweep found two citations pointing into the `value` region of
`events/ticket-events.ts` and I collapsed them into one table row labelled "value field", giving
both the same new target. One of the two was never about `value`. A `grep`-shaped sweep finds
citations by the file they name; it cannot tell you what a citation is *for*, and the repair step is
where that has to be read rather than pattern-matched.

**Re-sweep over the files this round touched** (`engine.test.ts`, `fields.test.ts`,
`05-tickets-hierarchy.md`):

```
find packages apps test-cases Features.md README.md -type f \( -name '*.ts' -o -name '*.tsx' \
  -o -name '*.json' -o -name '*.md' \) -not -path '*/node_modules/*' -not -path '*/dist/*' \
  | xargs grep -n "engine\.test\.ts:[0-9]\|fields\.test\.ts:[0-9]\|05-tickets-hierarchy\.md:[0-9]\|\
refusal-rules\.ts:[0-9]\|ticket-events\.ts:[0-9]\|ticket-state\.ts:[0-9]"
```

**Nothing cites a line in any of the three.** So this round displaced no citation.

Learning from M1, I then **read each surviving citation against its target** rather than trusting
the earlier repointing — including the three I had previously dismissed as "below the insertion
point, unaffected". All twelve resolve:

| Citation | Target line(s) now hold |
|---|---|
| `ticket-state.ts:94` | `if (env.type === 'ticket.created') {` — the unconditional fold |
| `ticket-state.ts:97-99` | the unknown-ticket-type throw |
| `ticket-state.ts:103-107` | the undefined-workflow throw |
| `ticket-state.ts:197-211` | the whole `ticket.field_set` case |
| `ticket-state.ts:211` | `claim(p.value, env)` |
| `ticket-state.ts:229-232` | `stateCategoryOf` + the no-such-state throw |
| `ticket-state.ts:233-240` | the "transition log is NOT appended to" comment |
| `events/ticket-events.ts:90` | `fieldId: z.string().min(1),` |
| `events/ticket-events.ts:91-93` | the `value` field and its presence refine |
| `events/ticket-events.ts:151-156` | the `stateMapping`-cannot-help note |
| `events/ticket-events.ts:158-161` | `ticketWorkflowReboundPayload`'s two fields |
| `refusal-rules.ts:16` | `parentTerminal: 'parent-terminal-with-open-children'` |

## M2 — the `'; '` separator now has a witness

`packages/rule-engine/src/refusal-rules.ts`. Every one of the seven literal assertions fires exactly
one issue, and `['x'].join('; ') === ['x'].join('')`, so the separator was unfalsifiable in new
code — while the explicit precedent for pinning exactly this sits ~10 lines below in the same file
(`test/engine.test.ts`, "the structural refusal names every issue at once": *"Change the join and
this dies; delete this and the join is unpinned again."*).

Added to `describe('a malformed payload names the field it is about')`:

```ts
it('ticket.created: two issues are joined with a semicolon, each carrying its own path', …)
//   payload: { typeId: '', projectId: 'not-a-ulid', parentId: null, title: 'Two things wrong' }
//   reason: "This ticket.created event's payload is malformed: at typeId: String must contain at
//            least 1 character(s); at projectId: must be a ULID"
```

`ticketCreatedPayload` is the only payload in this suite that fires two independent issues from one
candidate. The literal was **derived by running** (a probe against the built domain package printing
the real issue list and the joined detail), not transcribed. It also proves the path clause is
**per-issue** rather than appended once — both fields are named, each beside its own message.

### Mutation proof

Mutation: `.join('; ')` → `.join(', ')` in the helper.

```
$ npx vitest run   # packages/rule-engine
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/engine.test.ts > a malformed payload names the field it is about > ticket.created: two issues are joined with a semicolon, each carrying its own path
   AssertionError: expected { refused: true, …(2) } to deeply equal { refused: true, …(2) }
       at …/packages/rule-engine/test/engine.test.ts:428:5
      Tests  1 failed | 229 passed (230)
```

Exactly one failure, and `engine.test.ts:428` is the `await expect(evaluateEvent(env, ctx))` line of
the new assertion itself — not setup, not parse. Vitest elides the long string diff behind `…(2)`,
so the produced string was observed directly instead: with the mutation still in place, the
rule-engine was built and `evaluateEvent` driven against the same envelope —

```
MUTATED PRODUCES: This ticket.created event's payload is malformed: at typeId: String must contain at least 1 character(s), at projectId: must be a ULID
```

— a comma where the assertion demands a semicolon. Restored, and the restoration verified two ways:
`git diff packages/rule-engine/src/refusal-rules.ts` reports **no change** against `2278e2a`, and
the helper body was read back. No shell `diff` was used.

## M3 — two trivia

- **(a)** Removed the double blank line between the new `describe` and the structural-refusal block
  (`test/engine.test.ts`). The gate has no lint step, so nothing else would have caught it.
- **(b)** `test-cases/05-tickets-hierarchy.md` case 5.50 said *"the three places that described the
  fold as live"* — the brief's stale count, carried into the catalogue. Corrected to *"the four
  comments … plus a fifth reference that had come to dangle"*, which is what D3 actually did.

## Review finding recorded in my favour

The report's unknown #2 (`parseEvent`'s blank-title message) was narrower than I stated: an
assertion does not belong there — the sibling lane pins nothing at its own door for the analogous
rule, this file's convention asserts the *code* rather than the message, and the construction is
already pinned at `test/parse-event.test.ts:61`. The probed string is derivable from
`parse-event.ts:91,95` plus P15's refine. **No longer an open gap.**

## Test command and output

```
$ export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
$ pnpm turbo run build test typecheck --force
 Tasks:    15 successful, 15 total
```

`@gisik-nokma/domain` 238 (15 files) · `@gisik-nokma/rule-engine` **230** (11 files, +1 this round) ·
`@gisik-nokma/server` 102 (17) · `@gisik-nokma/ui` 31 (3) · `@gisik-nokma/app-core` 5 (1). Fixture
count gate untouched at 64.

## Concerns after this round

None open. The one thing a later reader should know: **twelve `file:line` citations in this lane now
depend on line numbers in `ticket-state.ts`, `events/ticket-events.ts` and `refusal-rules.ts`.** Two
rounds of this task were spent repairing them after adding comments, and M1 showed a sweep that
finds them by filename still cannot tell you which construct each one means. Anything that inserts a
line into those three files owes the same read-each-one pass.

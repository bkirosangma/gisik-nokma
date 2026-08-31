# Task 8 report — end-to-end planted-defect fixtures, and the harness work every earlier task deferred here

Branch `exec/03-tickets-hierarchy`, base `2b3a51a`. Two commits:

- **`34547a8`** — harness presence fixes, fold extension, the migration they force, and the two one-line riders. Fixture gate unchanged at 70.
- **`487bd09`** — the fourteen end-to-end fixtures, gate 70 → 84, `Features.md` §5, `test-cases/05` 5.51–5.53, and the coordination-doc record.
- **`339f07d`** — one false counterfactual in a fixture `notes`, the runner-semantics property stated at the fold, and a correction to what commit `487bd09` claimed it verified. Fixture delta 0.

Gate: `pnpm turbo run build test typecheck` → **18/18 tasks successful**, run after each commit's content was complete. `packages/rule-engine` alone: **278 tests across 12 files**, counted from the run — of which 51 are in `harness.test.ts` (was 30) and 85 in `fixtures.test.ts` (was 71).

---

## 1. What was built

### 1a. The harness/domain PRESENCE audit (Addendum 8, Ruling P10) — four defects closed

All in `packages/rule-engine/src/fixtures/harness.ts`.

| Site | Was | Is |
|---|---|---|
| `partialEnvelopeSchema.payload` | `z.unknown()` | presence-refined, same construction and same message as `envelope.ts`'s `requiredPayload` |
| `ticketCreatedFixturePayloadSchema.parentId` | `z.string().nullable().optional()` | `z.string().nullable()` — required-and-nullable |
| same schema: `typeId`, `projectId`, `title` | absent entirely | added, **required** |
| `ticketFieldSetFixturePayloadSchema.value` | `z.unknown()` | presence-refined, same message as `ticketFieldSetPayload`'s |
| `ticketReparentedFixturePayloadSchema` | did not exist | added; `newParentId` required-and-nullable |

Plus the three consequences the schema changes carry into the fold:

- `?? null` dropped from the field-claim fold. It was character-for-character the production fabrication (`ticket-state.ts`'s former `p.value ?? null`) sitting inside the substrate that exists to catch it, so a fixture omitting `value` recorded a clearing nobody made and **agreed with the bug**.
- `projectId: 'prj_1'` and `typeId: 'task'` no longer constants — read from the payload. Rider F named this a trap for parented-create and cross-project fixtures; it is worse than a trap, since the candidate's `projectId` is a `ulidString` and every prior ticket sat in `prj_1`, so any parented create met `hierarchy.cross-project` for a project it never chose.
- The create fold records `fields: { title: <claim> }`, matching `applyTicketEvent`. Load-bearing, not cosmetic: both parent-terminal refusals read `parent.fields['title']`.

**`?? null` kept where rider C says to keep it** — `parentId` and `assigneeId` on the create fold. A ticket with no parent *is* a root ticket; one with no assignee *is* unassigned. The comment at that site now states the discriminator rather than leaving the two coalesces looking alike.

**Deliberate divergences left alone**, each with a comment saying why: `workflowId` required (harness-only affordance — no ticket-type projection stands behind this dialect); `stateId`/`stateCategory` planting overrides; `assigneeId` without `min(1)`; rebound ids without `min(1)`; short non-ULID ids; and the `field` / `fieldId` split (**Ruling P8** — the comment P8 requires is now at the schema).

### 1b. The fold extension (A14, rider G)

- `ticket-type.defined` folds through `ticketTypeDefSchema`, last-definition-wins, mirroring `memory-context.ts:132-137`.
- `ticket.reparented` folds `parentId` and nothing else, mirroring `applyTicketEvent`.
- `getTicketTypeDef` has a real body over the folded ladder. It no longer throws. `null` is the honest answer and means what it means on the server.
- The `default:` throw message names all seven types it now accepts.
- **`workflow.defined` deliberately NOT admitted** (rider G): carrying it without `foldTicketToWorkflowVersion`'s refresh-on-publish loop would split the harness from the memory context at exactly the seam Task 4 exists to weld. Stated in the fold's own doc comment.

### 1c. Fourteen fixtures

Thirteen from the brief plus `created-blank-title.json`. All flat in `packages/rule-engine/fixtures/`.

### 1d. The two one-line riders

- `rule-rdu-refuses-a-history-it-cannot-read.json`'s `notes` now say `refuses as \`workflow-state-mapping\``. Confirmed `unmapped-drop` appeared nowhere else by `find packages apps -type f \( -name '*.ts' -o -name '*.json' -o -name '*.sql' \) … | xargs grep -l`, with the positive control `workflow-state-mapping` from the same sweep returning five files. Tree swept: this working tree at `exec/03-tickets-hierarchy`.
- `engine.test.ts`: `can fire` → `fires`.

---

## 2. Deviations, each with its authorising row

| # | Deviation from the brief | Authority |
|---|---|---|
| D1 | **The fixture runner was NOT swapped onto `buildMemoryContext`.** `test/fixtures.test.ts:19` is byte-identical; only the count at `:14` moved. The harness was extended instead. | A14, C-14, BA-6, riders §A |
| D2 | `typeId`/`projectId`/`title` added **required**, not optional as A14's instruction column says. | Addendum 8's own table row ("A14 already requires T8 to add them; they must be **required**, not optional"), riders §B, Ruling P10 |
| D3 | **41 prior `ticket.created` events across 38 shipped fixtures, and six sites in `harness.test.ts`, were migrated** to carry the four keys. Forced by D2 — and by `parentId` alone, which no shipped fixture spelled. | consequence of D2; values chosen to equal the constants the fold used to invent, so the staged world moves in exactly one way (tickets gain a title claim) |
| D4 | Every `ticket.transitioned` payload spells **`to`**, not the brief's `toStateId`. | Verified-facts row: the payload field is `to`; `toStateId` is the transition LOG ENTRY's spelling and both are real |
| D5 | **`workspaceId` omitted entirely** from all fixture events. | Ruling P5, strengthened by Addendum 9a's second reason (after P12 an override also yields a legitimate-looking `hierarchy.unknown-parent`) |
| D6 | Prior `ticket.created` payloads carry `workflowId`; candidate ones do not. | A14 (the harness dialect is not the domain schema); the candidate is judged by `ticketCreatedPayload` at the real door |
| D7 | Candidate `ticket.field_set` spells `fieldId`; no prior field_set appears in these fixtures. | A16, C-30, Ruling P8 |
| D8 | The two parent-terminal fixtures assert **`rule` only**. | C-24(a), riders §F, `fixtureSchema`'s rule-only branch |
| D9 | **A fourteenth fixture** (`created-blank-title.json`) beyond the brief's thirteen, and **one assertion added to `packages/domain/test/ticket-events.test.ts`** — a file outside the brief's list. | riders §G (Ruling P15 residual: "You own the fixtures that could close both") |
| D10 | **`Features.md`'s Planted-defect fixture suite bullet corrected from 68 to 84.** It was already stale at 70 before this task. | workspace convention: no silent drift |
| D11 | The brief's commit message ("Thirteen end-to-end fixtures") was not used. | Ruling P6 — the count is fourteen, and it is counted |
| D12 | `expected.rule` for `parent-terminal-with-open-children` needed no post-hoc edit. | Verified-facts row: the id IS `parent-terminal-with-open-children` (`refusal-rules.ts:16`) |

**Not deviated from, and worth naming:** C-28's count conflict is moot — Task 6's two fixtures were already in the directory when this task counted, so the +14 delta is this commit's own and needs no reconciliation with T6's.

---

## 3. Mutation evidence

Every mutation was applied with a script, run, and restored; restorations verified by `git status`/`git diff`, never a shell `diff`. **Method note (see §5):** cross-package mutations were rebuilt before the run and again after the restore.

### 3a. The presence fixes and the fold extension — 12 mutations, `test/harness.test.ts`

| # | Mutation | Went red |
|---|---|---|
| M1 | envelope `payload` → bare `z.unknown()` | the two ABSENT/undefined assertions + the `paylod` typo test. **The two acceptances (`null`, `{}`) stayed green** — the mutation kills the absence half specifically, which is the shape Addendum 7a requires |
| M2 | field-claim `value` → bare `z.unknown()` | the two ABSENT/undefined assertions only; both acceptances green |
| M3 | `parentId` back to `.optional()` | the `parentId` row of the presence matrix, alone |
| M4–M6 | remove `typeId` / `projectId` / `title` from the schema, one at a time | that key's row each time; `title` additionally kills the whole-`fields` `toEqual` |
| M7 | `newParentId` → `.optional()` | the reparent presence assertion, alone |
| M8 | create fold back to `projectId: 'prj_1'`, `typeId: 'task'` | "says which project and which type it is in", alone |
| M9 | create fold drops the title claim | the whole-`fields` `toEqual`, alone |
| M10 | `getTicketTypeDef` answers `null` always | both type-fold assertions |
| M11 | `ticket-type.defined` first-definition-wins | the last-definition-wins assertion, alone |
| M12 | reparent fold assigns nothing | both reparent assertions |

**Reported, not hidden:** restoring `?? null` to the field-claim fold **cannot be made to fail** once `value` is required — `null ?? null` is identity and the absent case throws at `parse` before reaching the line. That is the identical argument `ticket-state.ts` records for dropping the production coalesce, and it means the *presence refine* is what carries the evidence; the coalesce removal rides on it. Stated here rather than left to look proven.

### 3b. The fourteen fixtures — one planted defect each, `test/fixtures.test.ts`

| Fixture(s) | Mutation | Result |
|---|---|---|
| `parent-terminal-with-open-children` | `transition.ts`: the open-child count never fires | red (with Plan 2's two invariant fixtures); the twin stayed green |
| `parent-terminal-all-children-done` | the invariant counts ALL children, terminal included | red (with Plan 2's twin); the refusing fixture stayed green |
| `created-rank-violation` + `created-rank-legal` | `hierarchy.ts`: create-path rank comparison inverted (`<=` → `>=`) | both red — one accepts where it must refuse, one refuses where it must accept |
| `created-deepest-rank-no-parent` | `>= DEEPEST_RANK` → `> DEEPEST_RANK` (the escape hatch the comment argues about) | red, alone |
| `created-rank-legal`, second guard | the deepest-rank rule escapes its root-only branch and fires on any create | red — *expected acceptance, got refusal [hierarchy.deepest-rank-parent-required]*, which is what makes the fixture's claim to guard TWO refusals a proven claim rather than a described one |
| `reparent-cycle-after-rank-redefinition` | the ancestor walk never recognises the ticket | red, **alone and with an ACCEPTANCE** — nothing else refuses this world, so the fixture pins the cycle check and not a rank |
| `reparent-legal-grandchild-up` | the walk refuses any parent that is not the ticket | red (with the two reparent terminal-parent fixtures) |
| `field-set-unknown-field` | `if (!field) return ACCEPT` | red, alone |
| `field-set-kind-mismatch` + `field-set-legal` | the number kind check accepts strings instead | both red |
| `created-under-terminal-parent` | create path stops recognising a terminal parent | red, alone |
| `reparent-live-under-terminal-parent` | reparent path stops recognising a terminal parent | red, alone |
| `reparent-terminal-under-terminal-parent` | the reparent path forgets that only LIVE work contradicts | red, alone |
| both terminal-parent refusals | harness create records no title claim | both red **at the reason**, showing `"01J9GPAR000000000000000000" is finished (Done)` — the sentence the server can never produce |
| `created-blank-title` | the blank-title refine removed from `ticketCreatedPayload` (**with a domain rebuild**) | red at its own outcome: *expected refusal [malformed-payload], got acceptance* |
| the new `parseEvent` message assertion | reword the refine's message | red (with the schema-level assertion) |
| same | `parse-event.ts`'s payload branch drops the path clause | red, alone |

Every refusal fixture fails **at its own expected outcome**, never at load, parse or setup. No fixture was found unfalsifiable.

---

## 4. The presence audit's results, as an audit

Addendum 8's table was inherited rather than re-derived, and every row was acted on or explicitly kept:

- **Closed:** `parentId` presence; `typeId`/`projectId`/`title` absence; `partialEnvelope.payload`; `ticketFieldSet.value`; `ticketReparented` absent entirely.
- **Kept as FORMAT divergence, with a comment:** `assigneeId` without `min(1)`; rebound ids without `min(1)`; loose string ids throughout.
- **Kept as harness-only affordance, with a comment:** `workflowId`; `workflowVersion`; create-payload `assigneeId`; `stateId`/`stateCategory`.
- **Kept as a deliberate split, with the comment Ruling P8 requires:** `field` vs `fieldId`.
- **`ticketTransitioned` `{ to: z.string() }` vs the domain's richer payload:** left alone. Addendum 8 rules it "not a divergence that bites" — non-strict, and the candidate is parsed by the domain schema.

One check the audit did not name, run anyway before the schema tightening: **no shipped fixture omits `payload`, and no shipped field_set omits `value`** — so those two fixes broke nothing, and the only migration the audit forced was the create payload's.

---

## 5. What I could not verify, and one method finding

**A cross-package mutation is inert until the package is rebuilt, and it fails in the direction that gets believed.** Deleting the blank-title refine in `packages/domain/src` left all 85 rule-engine fixtures green. Read naively that is a fixture agreeing without constraining, and the standing rule would have had me report it as unfalsifiable. The mutation was wrong: `@gisik-nokma/domain`'s `exports` points at `./dist/index.js`, so a package importing it by name reads built output. Rebuilt, the same mutation went red immediately. Recorded in the coordination doc as binding method, with the tell: **a survivor with no explanation is either an unconstrained path or a mutation that never ran, and those must be distinguished before either is reported.** Every mutation inside `packages/rule-engine/src` was same-package and needed no rebuild.

A second, smaller trap found the same way: the mutation script replaces the **first** occurrence, and `parse-event.ts` has two identical `const at = …` lines. The first attempt mutated the envelope branch, the suite stayed green, and that would have read as an unfalsifiable assertion. Anchors were lengthened to disambiguate. Every §3 mutation produced a failure specific enough to identify its own site, which is the corroboration that the other anchors landed where intended.

**One false prose claim was shipped in `487bd09` and repaired in the third commit — found on review, not by me.** `reparent-cycle-after-rank-redefinition.json`'s `notes` said *"Without the second definition this fixture would be caught by the rank check and would prove nothing about cycles."* That contradicts the shipped check order: the walk sits ABOVE rank, and `hierarchy.ts`'s own doc comment says a loop is named as a loop even when the rank is also violated. Probed both halves rather than reasoning about them a second time — without the re-definition the fixture still refuses `hierarchy.cycle`, and with the walk ALSO deleted it refuses `hierarchy.rank` (`"Phase" cannot go under "Step"`). So the re-definition's job is not to make the fixture refuse; it is to make the MUTATION produce a clean acceptance instead of swapping one refusal for another. The note now says that. I had run the with-re-definition half (F6's lone acceptance) and asserted the counterfactual half — precisely the failure the run-the-sentence rule exists to prevent, in the same lane that has now recorded it twice.

**A second sentence written and withdrawn before it shipped.** The runner-semantics comment first claimed that a runner evaluating priors *"would refuse at the cycle fixture's own second type definition"*. False — `phase` is not a built-in, so `checkTicketTypeDefined` accepts the re-rank. Measured the real answer instead by evaluating every prior of every fixture against the context built from its predecessors: a prior-evaluating runner refuses `malformed-payload` on nearly every shipped `ticket.created` prior, because the dialect is deliberately not the domain's. The comment now states the measurement.

**Not verified, stated as such:** that `ticketWorkflowReboundPayload`, `ticketFieldSetPayload` and `workflowDefinedPayload` can each fire two issues (the riders' justification for the `can fire` → `fires` repair). The repair removes a capability claim rather than making one, and the sentence that remains — "the one payload here that fires two" — is consistent with the comment's own neighbouring claim that every other assertion in the suite fires exactly one issue.

---

## 6. Count, catalogue, and what Task 14 inherits

**Fixture total: 84.** Counted at commit time from the directory, four independent ways (`ls | wc`, `find`, a node `readdirSync` filter, and `loadFixtures()` itself). **Correcting what commit `487bd09` claimed:** the tree was not clean at count time and could not have been — the fourteen fixtures being counted were the uncommitted objects. What was actually verified is the rider's real requirement: no `MERGE_HEAD`, `rebase-apply`, `rebase-merge` or `CHERRY_PICK_HEAD` marker present, so no operation was in flight and no half-applied state could be contributing files. Before: **70**. **Delta: +14**, stated in the commit message. The directory holds no non-`.json` files and no subdirectories, so the non-recursive scan and the count gate agree by construction.

**Catalogue split, deliberate.** The thirteen brief fixtures **claim no new case ids**: they prove scenarios Plan 3's own document already reserves inside 5.4–5.36, and minting new numbers for them would give Task 14 two catalogues for one behaviour. The scope note in `test-cases/05-tickets-hierarchy.md` now says this explicitly and points Task 14 at the filenames. Three genuinely new things take ids:

- **5.51** — the harness/domain presence audit, all four defects, with the four-assertion shape and the revert-to-`z.unknown()` mutation.
- **5.52** — the fold extension and `getTicketTypeDef`'s real body, including the title-as-field-claim consequence.
- **5.53** — Ruling P15's two residuals.

New cases beyond those continue from **5.54**. `5.4`–`5.36` untouched; `5.27`, `5.30`, `5.36` untouched; nothing renumbered. **`5.43` still carries its own instruction to be folded into `5.34` by Task 14** — not duplicated here under a third id.

`Features.md` §5 gains two bullets (the fixtures; the fold extension) and §4's fixture-suite bullet is corrected to 84 with the presence contract stated.

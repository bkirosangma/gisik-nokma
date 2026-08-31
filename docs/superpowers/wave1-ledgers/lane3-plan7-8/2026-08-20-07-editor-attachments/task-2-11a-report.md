# Task 2 + Task 11a (domain half) — implementation report

**Status: DONE_WITH_CONCERNS** (concerns are informational, not blockers — see §7)

Branch: `exec/07-editor-client` (the dispatch's git snapshot said `exec/07-editor-attachments`;
`git branch --show-current` in this worktree returns `exec/07-editor-client`, which is what
LANE-CONTEXT names. Nothing was done about it — flagged so the controller can reconcile.)

| | |
|---|---|
| Task 2 commit | `a8e8bc9` — *One definition of "embeddable image", and a walker that survives whatever a hostile document hands it* |
| Task 11a commit | `687aa44` — *Two statements of what a Drive reference is, pinned to each other so the second one cannot quietly stop meaning the first* |
| Monorepo | `pnpm turbo run build test typecheck` → **9 successful, 9 total** |
| Tests | **371** (domain 163 · rule-engine 115 · server 93) vs. pre-branch baseline **360** → **+11** |

The `.gitignore` staged change rode into `a8e8bc9` as instructed.

---

## 1. What shipped

### Task 2 — `packages/domain/src/doc-embeds.ts`
Verbatim from the brief: `EMBEDDABLE_IMAGE_MIME` (4 mimes, SVG absent), `isEmbeddableImageMime`,
`collectImageAttachmentIds`. Dependency-free — no zod, no sibling domain import. Matches
`doc-text.ts`'s conventions: total function, defensive `typeof` narrowing, no throw on junk.

Test: `packages/domain/test/doc-embeds.test.ts` — **6 cases**.

### Task 11a (DOMAIN HALF ONLY) — `packages/domain/src/attachment-kinds.ts`
Verbatim from the brief: `AttachmentKind`, `DriveReference`, `isDriveReference`,
`DRIVE_FILE_SCOPE`, `RULE_EVIDENCE_DRIVE_REFERENCE`, `EVIDENCE_DRIVE_REFERENCE_REASON`.
`isDriveReference` is byte-for-byte the brief's implementation — per A9 it stays a shape guard.

Test: `packages/domain/test/attachment-kinds.test.ts` — **5 cases** (the brief's 4 + the A10 pin).

### Barrel
Two separate lines appended at the tail of `packages/domain/src/index.ts`, one per commit, no
re-sort:
```
export * from './doc-embeds.js';        # in a8e8bc9
export * from './attachment-kinds.js';  # in 687aa44
```

---

## 2. Scope fence — honoured, and what is deferred

**Not created, not stubbed, no directories made:**
- `apps/server/src/gates/evidence-gate.ts` (task-11a Step 3 — full file replacement)
- `apps/server/test/gates/evidence-gate.test.ts` (Step 4 — the two appended gate cases)
- `apps/server/test/helpers/drive-reference.ts` (Step 4 — `seedDriveReference`)
- `apps/server/src/db/queryable.ts` (A15 — Plan 4's file; not invented)

Nothing under `apps/server/` was touched. `apps/server/src/gates/` does not exist and was not
created. The brief's Step 5 verification command (`pnpm --filter @gisik-nokma/server exec vitest
run test/gates/`) is therefore also deferred; the domain half of Step 5 ran and passed.

**Wave-2 successor needs to know:** the domain vocabulary the gate imports is now on the branch
under its final names, so Task 11's gate work is a pure add against `@gisik-nokma/domain` with no
further domain changes required.

---

## 3. Adaptations applied

**A8 — the "pending Plan 3 amendment" hedge.** Read before writing:
`packages/domain/src/vocabulary.ts:137-142` (the `attachment.added` registration) and
`packages/domain/src/events/ticket-events.ts:52-82` (`attachmentUploadedPayload`,
`attachmentDriveReferencePayload`, `attachmentAddedPayload`). The amendment has landed:
`attachment.added` is registered as a `z.discriminatedUnion('kind', [...])`, and the shipped
Drive field names match `DriveReference` exactly. **No hedge language exists in any file I
authored** — the brief's only "pending Plan 3 payload amendment" sentence lives in the
`seedDriveReference` doc comment, which is out of scope and was not written. The `attachment.added`
paragraph in commit `687aa44`'s message records this as a no-op finding rather than a change.

**A9 — the guard is deliberately weaker than the wire, and says so.** `isDriveReference` is
unchanged from the brief. Its doc comment names the four things the zod schema checks that the
guard cannot see (`webViewLink`/`iconLink` as real URLs, ULID `attachmentId`, ISO-8601 +
real-calendar `capturedAt`) and states plainly that passing the guard is **not** evidence a
payload would be accepted at the door. No comment claims wire validation.

**A10 — the drift pin.** Both required additions are in:

1. *Source comment.* The `DriveReference` doc comment carries a `TWO STATEMENTS OF ONE CONCEPT`
   paragraph naming `events/ticket-events.ts` as the wire half and this module as the structural
   half, and points at the pinning test.

2. *Pinning test* — `describe('the guard and the wire schema describe one concept')`. The expected
   key list is **derived, not retyped**: a fixture typed `Required<DriveReference>` supplies the
   guard-side names (so an optional field cannot silently escape the pin), and the assertion is
   ```ts
   expect(Object.keys(attachmentDriveReferencePayload.shape).sort()).toEqual(
     [...Object.keys(complete), 'kind', 'attachmentId'].sort(),
   );
   ```
   The 8 keys came from reading `packages/domain/src/events/ticket-events.ts`, not from the
   dispatch. The test also asserts the fixture passes `isDriveReference` and that
   `{kind:'drive-reference', attachmentId: newUlid(), ...complete}` parses under the shipped schema
   without throwing. Both directions are proven to bite in §5 (M8, M9).

**A15.** `Queryable` confirmed absent from the whole repo; the seed helper is deferred for that
reason as well as the wave-ordering one. Nothing was invented at that seam.

---

## 4. Falsifiability — module-not-found first runs

| Test file | Pre-implementation run | Result |
|---|---|---|
| `test/doc-embeds.test.ts` | `vitest run test/doc-embeds.test.ts` | **FAIL** — `Error: Failed to load url ../src/doc-embeds.js … Does the file exist?`, "Tests no tests" |
| `test/attachment-kinds.test.ts` | `vitest run test/attachment-kinds.test.ts` | **FAIL** — same class: module unresolvable, "Tests no tests" |

Module-not-found is weak evidence on a new module, so every refusal was additionally proven by
mutating the *shipped, committed* implementation. That is §5.

---

## 5. Planted-defect proofs (mutation runs)

Discipline used: commit the green version → mutate the source → run → record the exact failure →
`git checkout -- <file>` → prove restoration with **`git diff`** (never shell `diff`, per
LANE-CONTEXT). Every restoration below printed an empty `git diff --stat`. Final state of the
working tree after all mutants: `git status --porcelain` clean, and the full 9/9 turbo run in §6
was executed *after* the mutations, so the green also proves the restorations.

### Task 2 — `doc-embeds.ts`

| # | Mutant | Test that died | Failure recorded |
|---|---|---|---|
| M1 | `EMBEDDABLE_IMAGE_MIME.has(mime.trim().toLowerCase())` | *planted defect: refuses svg, pdf, video, and lookalikes* | `AssertionError: image/PNG must not be embeddable: expected true to be false` |
| M2 | dedupe dropped (`if (typeof attachmentId === 'string')`) | *finds top-level and nested image nodes, unique, in order* | `expected [ '01J9GIMA…', …(2) ] to deeply equal [ '01J9GIMA…', …(1) ]` |
| M3 | `String(attachmentId)` coercion behind a `!= null` check | *ignores non-image nodes and images without a string attachmentId* | **survived the brief's fixture** — see below; after strengthening: `expected [ '42' ] to deeply equal []` |
| M4 | `if (node === null \|\| typeof node !== 'object') return;` deleted | 3 walker tests incl. *never throws on junk input* | 3 failed / 3 passed |

**M3 is the one finding worth the controller's attention.** The brief's verbatim fixture for
"images without a string `attachmentId`" offers only `attachmentId: null`, `attrs: {}` and a
missing `attrs`. An implementation that coerced with `String()` behind a `!= null` guard skips all
three identically, so it passed **6/6**. The mutant was confirmed genuinely applied (source printed
back before the run) — this was a real hole, not a failed patch.

**Resolution:** one case ADDED to the existing document —
`{ type: 'image', attrs: { attachmentId: 42, wrap: 'block', alt: '' } }` — with a comment in the
test saying why it is there. **No value the brief specified was changed or removed**; this is an
addition only. The mutant now dies on `expected [ '42' ] to deeply equal []`. This landed by
`--amend` onto `a8e8bc9` (unpushed at the time), so the two-commits-one-per-task shape is intact,
and the commit message carries a `ONE CASE ADDED` paragraph explaining it.

### Task 11a — `attachment-kinds.ts` and the A10 pin

| # | Mutant | Test that died | Failure recorded |
|---|---|---|---|
| M5 | `iconLink` guard line deleted | *planted defect: an incomplete or mistyped reference is not a reference* | `{…"iconLink":7} must not pass: expected true to be false` |
| M6 | `isNonEmptyString` → `typeof value === 'string'` (empty allowed) | same | `{"driveFileId":"",…} must not pass: expected true to be false` |
| M7 | remedy sentence removed from `EVIDENCE_DRIVE_REFERENCE_REASON` | *pins the evidence refusal id and names the remedy in its reason* | `expected 'A Google Drive link cannot serve as e…' to contain 'Upload the file to this ticket'` |
| M8 | **WIRE side** rename: `webViewLink` → `viewLink` in `attachmentDriveReferencePayload` | *agrees with attachmentDriveReferencePayload field for field* | `expected [ 'attachmentId', 'capturedAt', …(6) ] to deeply equal [ … ]` |
| M9 | **GUARD side** rename: `DriveReference.webViewLink` → `viewLink` (+ the guard's lookup) | 2 tests, **plus typecheck** | `error TS2741: Property 'viewLink' is missing in type '{ iconLink: string; driveFileId: string; … webViewLink: string; capturedAt: string; }' but required in type 'Required<DriveReference>'` and 2 runtime failures |

M8/M9 are the A10 requirement discharged from **both** directions: a rename on the zod side breaks
at runtime, a rename on the type side breaks at compile time *and* at runtime. Drift is no longer
silent in either direction.

---

## 6. Verification tail

`export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && pnpm turbo run build test typecheck`
from the repo root:

```
@gisik-nokma/server:test:  ✓ test/entity-heads.test.ts (5 tests) 179ms
@gisik-nokma/server:test:  ✓ test/determinism.test.ts (3 tests) 1340ms
@gisik-nokma/server:test:    ✓ determinism (the rebuild-and-diff discipline, spec §3) > replaying the fixture ledger twice yields byte-identical projection rows, with the expected heads  886ms
@gisik-nokma/server:test:    ✓ determinism (the rebuild-and-diff discipline, spec §3) > arrival order changes nothing: a reversed-arrival ledger derives the same bytes  449ms
@gisik-nokma/server:test:
@gisik-nokma/server:test:  Test Files  14 passed (14)
@gisik-nokma/server:test:       Tests  93 passed (93)
@gisik-nokma/server:test:    Start at  19:21:02
@gisik-nokma/server:test:    Duration  1.94s (transform 551ms, setup 0ms, collect 3.37s, tests 8.54s, environment 1ms, prepare 1.14s)

 Tasks:    9 successful, 9 total
Cached:    0 cached, 9 total
  Time:    5.159s
```

Per-package counts (`pnpm turbo run test --force`):

```
@gisik-nokma/domain:test:       Tests  163 passed (163)
@gisik-nokma/rule-engine:test:  Tests  115 passed (115)
@gisik-nokma/server:test:       Tests   93 passed  (93)
```

**371 total. Baseline 360. +11 = 6 (doc-embeds) + 5 (attachment-kinds).** The domain package
count moved 152 → 163, and no pre-existing test changed.

---

## 7. Concerns for the controller

1. **The brief's Task 2 fixture under-tested its own claim** (M3, §5). Fixed by adding one case.
   If any other lane transcribes that same fixture from the plan text, it inherits the hole. Worth
   a note in the coordination doc: *a "not a string" test whose only non-strings are `null` and
   `undefined` does not test "not a string".*

2. **Domain case count is 5, not the brief's "4 tests"** for `attachment-kinds.test.ts` — the fifth
   is the A10 pin the dispatch mandated. Expect the count, not a defect.

3. **Branch-name discrepancy** between the dispatch's git snapshot (`exec/07-editor-attachments`)
   and the actual worktree branch (`exec/07-editor-client`, matching LANE-CONTEXT). Untouched.

4. **`Features.md` / `test-cases/` deliberately untouched**, per the dispatch — the catalogue is a
   separate closing change set. When it is written, the entries owed are the embeddable-image
   definition + doc walker, and the Drive-reference vocabulary + its refusal constant. The domain
   half of the evidence rule is landed but **the rule itself is not enforced anywhere yet**; the
   catalogue must not claim otherwise until Task 11's gate ships.

5. **`git status --porcelain` output is proxied** in this environment and prints `ok` for a clean
   tree rather than an empty string. Restoration proofs above rest on `git diff --stat` returning
   empty for each mutated file, which is the check LANE-CONTEXT prescribes.

---

# Fix round 1 — review findings addressed

**Status: DONE.** All five findings fixed. Commit **`b1ee381`** —
*Five checks that could not fail: the walker never proved the word "image", and the drift pin
never proved a field still existed*.

Files changed (three, all in `packages/domain`):

| File | What changed |
|---|---|
| `packages/domain/test/doc-embeds.test.ts` | findings 1 and 2 — one fixture rewrite (`IMG_C` added, a `fileChip` node carrying `attrs.attachmentId`, images swapped so encounter order ≠ sort order) |
| `packages/domain/test/attachment-kinds.test.ts` | findings 3 and 4 — two entries in the `broken` array; `REFERENCE` annotated `DriveReference`; the pin's own prose says what now holds it against removal |
| `packages/domain/src/attachment-kinds.ts` | finding 5 — the wire-adds list now names the `mimeType` regex |

**No test count moved: 163 domain cases before and after.** The fixtures got stricter, not more
numerous — which is the point of the round.

Note recorded in `b1ee381`'s message per the coordinator's instruction, since history was not
rewritten: **commit `a8e8bc9` also added `.superpowers/` to `.gitignore`** — the SDD ledger
directory, which must stay untracked — and its own message never says so. `git rebase -i` is
unavailable in this environment; the omission is documented rather than amended.

## Falsifiability — every fix proven by the mutant the reviewer named

Same discipline as the first round: commit the fix → mutate → run → record the exact failure →
`git checkout -- <file>` → prove restoration with `git diff` (never shell `diff`). Every
restoration below printed an empty `git diff --stat`; the final 9/9 turbo run was executed after
all mutations, so the green also proves the restorations. Working tree ends clean.

### Finding 1 — the `type === 'image'` discriminator
Mutant: `if (record.type === 'image') {` → `{` (the discriminator literally deleted, leaving a bare
block; the walker harvests `attrs.attachmentId` from any node).

```
   × collectImageAttachmentIds > finds top-level and nested image nodes, unique, in order 3ms
AssertionError: expected [ '01J9GIMC000000000000000000', …(2) ] to deeply equal [ '01J9GIMB000000000000000000', …(1) ]
      Tests  1 failed | 5 passed (6)
```

The `fileChip`'s id (`IMG_C`) leads the result — exactly the harvest the reviewer described.
Before the fix this mutant passed all seven cases.

### Finding 2 — first-seen order
Mutant: `return ids;` → `return ids.sort();`

```
   × collectImageAttachmentIds > finds top-level and nested image nodes, unique, in order 4ms
AssertionError: expected [ '01J9GIMA000000000000000000', …(1) ] to deeply equal [ '01J9GIMB000000000000000000', …(1) ]
      Tests  1 failed | 5 passed (6)
```

And the mutant the old fixture *did* kill still dies under the new one — dedupe dropped
(`if (typeof attachmentId === 'string') {`):

```
   × collectImageAttachmentIds > finds top-level and nested image nodes, unique, in order 3ms
AssertionError: expected [ '01J9GIMB000000000000000000', …(2) ] to deeply equal [ '01J9GIMB000000000000000000', …(1) ]
```

And the last-seen-order mutant (a repeated id moved to the end of the list rather than kept at
first sight) also still dies:

```
   × collectImageAttachmentIds > finds top-level and nested image nodes, unique, in order 4ms
AssertionError: expected [ '01J9GIMA000000000000000000', …(1) ] to deeply equal [ '01J9GIMB000000000000000000', …(1) ]
      Tests  1 failed | 5 passed (6)
```

So the swap strengthened the case without trading away either mutant the old fixture already
killed, as the coordinator required.

### Finding 3 — the two unkilled guard conjuncts
Mutant A: `isNonEmptyString(candidate['name']) &&` deleted.

```
AssertionError: {…,"name":"","mimeType":"application/pdf",…} must not pass: expected true to be false
      Tests  1 failed | 4 passed (5)
```

Mutant B: `isNonEmptyString(candidate['mimeType']) &&` deleted.

```
AssertionError: {…,"mimeType":42,…} must not pass: expected true to be false
      Tests  1 failed | 4 passed (5)
```

### Finding 4 — a guard-side field REMOVAL
Mutant: `name: string;` deleted from `DriveReference`.

*With* the fix (`const REFERENCE: DriveReference`):

```
test/attachment-kinds.test.ts(14,3): error TS2353: Object literal may only specify known properties, and 'name' does not exist in type 'DriveReference'.
```

*Without* it — the same removal, with the annotation stripped back to the pre-fix
`const REFERENCE = {` — to confirm the reviewer's claim rather than take it on trust:

```
typecheck errors: 0
      Tests  5 passed (5)
```

That is the finding demonstrated end to end: before this round, deleting a field from
`DriveReference` was invisible to both the compiler and the pin.

### Finding 5 — the incomplete wire-adds list
Documentation only; no mutant applies. `attachment-kinds.ts`'s `DriveReference` comment now reads
"…real URLs for `webViewLink`/`iconLink`, a `mimeType` matching the shared MIME regex, and an
ISO-8601 `capturedAt` that is a real calendar datetime."

## Verification

Command:

```
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && pnpm turbo run build test typecheck
```

Tail:

```
@gisik-nokma/server:test:  ✓ test/determinism.test.ts (3 tests) 1315ms
@gisik-nokma/server:test:    ✓ determinism (the rebuild-and-diff discipline, spec §3) > replaying the fixture ledger twice yields byte-identical projection rows, with the expected heads  859ms
@gisik-nokma/server:test:    ✓ determinism (the rebuild-and-diff discipline, spec §3) > arrival order changes nothing: a reversed-arrival ledger derives the same bytes  454ms
@gisik-nokma/server:test:
@gisik-nokma/server:test:  Test Files  14 passed (14)
@gisik-nokma/server:test:       Tests  93 passed (93)
@gisik-nokma/server:test:    Start at  19:33:59
@gisik-nokma/server:test:    Duration  1.88s (transform 651ms, setup 0ms, collect 3.45s, tests 8.08s, environment 1ms, prepare 1.07s)

 Tasks:    9 successful, 9 total
Cached:    0 cached, 9 total
  Time:    5.064s
```

Per-package counts (`pnpm turbo run test --force`):

```
@gisik-nokma/domain:test:       Tests  163 passed (163)
@gisik-nokma/rule-engine:test:  Tests  115 passed (115)
@gisik-nokma/server:test:       Tests   93 passed  (93)
```

**371 total — unchanged from the pre-review count, still +11 over the 360 baseline.** Nothing was
added or removed; five existing checks became falsifiable.

## Concerns after this round

None blocking. The scope fence is unchanged — nothing under `apps/server/` was touched, and
Task 11a's Steps 3–4 remain deferred to Wave 2. Concern 1 from the first round still stands and is
now reinforced by findings 1 and 2: **three separate fixture holes in one plan's verbatim test
text**, all of the same species — a fixture that agrees with the implementation without
constraining it. Any lane transcribing plan fixtures verbatim should mutate before trusting them.

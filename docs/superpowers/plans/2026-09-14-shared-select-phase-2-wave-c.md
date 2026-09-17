# Shared Select rollout — Phase 2 Wave C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 5 remaining native `<select>` sites in `packages/app-core/src/views` onto the shared `Select` component from `@gisik-nokma/ui` — no changes to `Select` itself. **This is the final wave of Phase 2.** After this wave, all 13 sites Phase 2's original audit catalogued are migrated, completing the full 15-site rollout Phase 1 started (Phase 1: 2 sites; Wave A: 3; Wave B: 5; Wave C: 5).

**Architecture:** Two of this wave's 5 sites (`new-ticket-dialog.tsx`'s Type and Parent selects) are **searchable** — the only searchable sites in Waves A/B/C. This is a real, verified difference from every other site this rollout has touched since Wave A: `SearchableSelect`'s trigger is a real `<input role="combobox">`, and `SearchableSelect` never renders react-aria's `HiddenSelect` (confirmed in `packages/ui/src/select/select.tsx` — `HiddenSelect` appears exactly once, inside `NonSearchableSelect`'s return only). This means the nested-label defect Waves A and B both had to fix (an enclosing `<label>` mislabeling `Select`'s internal hidden native `<select>`) **cannot occur for a searchable site** — there is no hidden select to mislabel. So this wave's 3 non-searchable sites (`transition-dialog.tsx`, `reopen-dialog.tsx`, `ticket-list.tsx`) follow Waves A/B's rule exactly (never wrap in `<label>`); the 2 searchable sites (`new-ticket-dialog.tsx`'s Type and Parent) **keep** their existing `<label>` wrapping, which is safe and preserves click-on-label-text for that mode — do not strip it from these two sites by reflexively applying the non-searchable rule.

**Tech Stack:** React 19, `@gisik-nokma/ui`'s `Select` (already built, already exported), Vitest + Testing Library + `userEvent`.

**Spec:** `docs/superpowers/specs/2026-09-14-shared-select-phase-2-design.md` (Phase 2 design spec). Waves A and B's plans (`docs/superpowers/plans/2026-09-14-shared-select-phase-2-wave-a.md`, `docs/superpowers/plans/2026-09-14-shared-select-phase-2-wave-b.md`) and their SDD ledgers are the source of every convention this plan reuses — read them if anything here is unclear rather than re-deriving it. Wave B's final whole-branch review (see its ledger's last entries) is where the searchable/non-searchable `<label>` rule above was corrected and verified against primary source — this plan applies that corrected understanding from the start rather than discovering it again.

## Global Constraints

- **Package manager is pnpm 9.15.0**; run workspace-scoped commands as `pnpm --filter @gisik-nokma/app-core <script>`.
- **Never pipe a test/build run into `head` or `grep -m N`.**
- **No new dependency.**
- **Never wrap a NON-searchable `Select` in an enclosing `<label>`** (3 sites here: transition-dialog, reopen-dialog, ticket-list). **DO keep the existing `<label>` wrapping for the 2 SEARCHABLE sites** (new-ticket-dialog's Type and Parent) — this is the one place in this rollout where the rule genuinely branches; get it right per-site, not as a blanket policy either way.
- **Never wrap ANY `Select` (searchable or not) in a `<p>`** — `HiddenSelect`'s internal `<div>` (non-searchable sites only) is illegal inside `<p>`'s phrasing-content model, a real SSR hydration defect Wave A had to fix. None of this wave's 5 sites currently use `<p>` as their select's direct wrapper (verified per-site below), but keep this in mind regardless.
- **Testing Library query discipline, established across Waves A/B**: a non-searchable `Select` trigger has role `button` (not `combobox`) and a concatenated accessible name (current value + `aria-label`) — every query against it must be a regex/substring match, never exact. A searchable `Select` trigger genuinely IS `role="combobox"` (a real `<input>`), so `getByLabelText`/`getByRole('combobox', ...)` continue to work there, but its options only render once the panel is open — the same "can't read `<option>` children while closed" fix applies to type-based option enumeration in tests, just not to the trigger's own role.
- **`toHaveValue` does not apply to a non-searchable `Select`'s `<button>` trigger** — use `toHaveTextContent` against the trigger instead, matching the `Select`'s actual rendered value text. (It DOES still work correctly on a searchable `Select`'s `<input>` trigger — do not blanket-replace it on the 2 searchable sites.)
- **This branch (`owner/workspace-edits`) carries substantial unrelated in-flight foreign work.** Stage by exact path only — never `git add -A`/`git add .` — `git status` before every commit.
- **This wave's final task ends with the Features.md update declaring the entire Phase 2 rollout complete** (not just "N more done" — this is the last wave). Do not let any earlier task touch this bullet; it is owned by the final task alone, so the wave-completion statement is written exactly once, from the true final state, not assembled piecemeal.
- Every task ends with `pnpm --filter @gisik-nokma/app-core test` and `pnpm --filter @gisik-nokma/app-core typecheck` passing before commit.

---

### Task 1: Migrate `transition-dialog.tsx`'s "Move to" select

**Files:**
- Modify: `packages/app-core/src/views/transition-dialog.tsx:183-195`
- Test: `packages/app-core/test/views/transition-dialog.test.tsx` (12 `selectOptions` call sites, all identical shape — grep confirms all 12 read `await user.selectOptions(screen.getByLabelText('Move to'), '<stateId>')`)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on.

**Why this site genuinely needs the `string | null` migration (unlike most of this rollout's non-searchable sites):** `toStateId` starts as `useState('')` with an explicit, always-visible `<option value="" disabled>Choose a state</option>` placeholder — this is a real "nothing chosen yet" state, not an always-populated enum. `Select`'s `value: string | null` + automatic placeholder-on-no-match replaces this exactly, but **the custom placeholder text ("Choose a state") must be passed explicitly via the `placeholder` prop** — do not let it silently fall back to `Select`'s generic default ("Select…"). This is a deliberate content decision, not an oversight: "Choose a state" is more specific to this exact control than the generic default, and no existing test currently asserts on it (confirmed: zero matches for "Choose a state" in the test file) — this task adds one, closing a real, previously-uncovered gap.

- [ ] **Step 1: Read the current file for exact context**

```bash
sed -n '181,196p' packages/app-core/src/views/transition-dialog.tsx
```

Current shape:

```tsx
      <label className="gn-transition__field">
        Move to
        <select value={toStateId} onChange={(event) => setToStateId(event.target.value)}>
          <option value="" disabled>
            Choose a state
          </option>
          {options.map((option) => (
            <option key={option.toStateId} value={option.toStateId}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
```

- [ ] **Step 2: Confirm the CSS this migration must preserve**

```bash
grep -n "\.gn-transition__field\b" packages/ui/src/ui.css
```

Expected: `.gn-transition__field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.7rem; }` — real, must move to the replacement `<div>`.

- [ ] **Step 3: Update the failing tests first**

All 12 call sites in `transition-dialog.test.tsx` follow the identical shape:

```tsx
// BEFORE (one representative example — read each of the 12 in its own surrounding test before editing; some tests call this more than once in sequence, e.g. picking 'waiting' then 'done' to prove a preview resets):
    await user.selectOptions(screen.getByLabelText('Move to'), 'done');
```

Becomes:

```tsx
// AFTER:
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }));
```

**The option's accessible name is the target STATE's display name, not its id** — verify this per call site against the test file's own fixture data (its workflow-definition builders) rather than assuming a 1:1 lowercase-id-to-name mapping; Wave B's own plan got this wrong once (used an id where a name was needed) and had to be corrected mid-execution — do not repeat that mistake here. Grep the test file's own workflow fixtures (`WF_*` constants or similar) for each `toStateId` value used across the 12 call sites (`done`, `waiting`, `doing`) and confirm the exact matching `name` before writing the option-name matcher for each.

If `screen.findByRole('listbox')` is already in scope (i.e. the panel from an earlier pick in the same test is still open from a prior interaction in that test — check each test's sequence), you may not need a fresh `await screen.findByRole('listbox')` before every click; read each test's actual flow rather than mechanically inserting an open-then-pick pair after every prior `selectOptions` call. A test that picks twice in sequence (`'waiting'` then `'done'`) needs the trigger re-clicked before the second pick, since selecting an option closes the panel — confirm this against `Select`'s own established close-on-select behavior (already proven in Phase 1/Wave A/B) rather than assuming.

Add one new test proving the "Choose a state" placeholder is preserved (the coverage gap this task's own investigation found). This file's `describe('3.72 TransitionDialog — prompts driven by the workflow definition', ...)` block (~line 165) already has the real setup helper — it's called `renderDialog()` (takes an optional partial-props override, returns the `onSubmit` mock), used by every test in that block. Add your new test inside that same `describe` block, using the same helper:

```tsx
  it('shows "Choose a state" as the trigger placeholder before any state is picked', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /Move to/ })).toHaveTextContent('Choose a state');
  });
```

(Match this file's own existing render-setup convention exactly — read 2-3 of its existing tests first to find the right helper/props shape; the snippet above is illustrative of the assertion, not a literal drop-in.)

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd /Users/kiro/my_projects/gisik-nokma
pnpm --filter @gisik-nokma/app-core exec vitest run transition-dialog.test.tsx > /tmp/wave-c-task1-red.log 2>&1
tail -150 /tmp/wave-c-task1-red.log
```

- [ ] **Step 5: Migrate the component**

Add `import { Select } from '@gisik-nokma/ui';`, replace the region from Step 1 with:

```tsx
      <div className="gn-transition__field">
        <span>Move to</span>
        <Select
          options={options.map((option) => ({ value: option.toStateId, label: option.name }))}
          value={toStateId === '' ? null : toStateId}
          onChange={setToStateId}
          placeholder="Choose a state"
          aria-label="Move to"
        />
      </div>
```

`toStateId === '' ? null : toStateId` (rather than a bare `toStateId || null`) is deliberate — `toStateId` is always a string here (never `undefined`), and this form is explicit about the one value being translated, matching this codebase's own stated preference for explicit translations at a boundary (see this file's own `TransitionSubmission` docblock reasoning about vocabulary translation happening in exactly one place).

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run transition-dialog.test.tsx > /tmp/wave-c-task1-green.log 2>&1
tail -150 /tmp/wave-c-task1-green.log
```

- [ ] **Step 7: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-c-task1-full-test.log 2>&1
tail -40 /tmp/wave-c-task1-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-c-task1-typecheck.log 2>&1
tail -40 /tmp/wave-c-task1-typecheck.log
```

- [ ] **Step 8: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 2 files:
- `packages/app-core/src/views/transition-dialog.tsx`
- `packages/app-core/test/views/transition-dialog.test.tsx`

```bash
git add packages/app-core/src/views/transition-dialog.tsx packages/app-core/test/views/transition-dialog.test.tsx
git commit -m "$(cat <<'EOF'
Migrate transition-dialog's Move-to select to the shared Select

Phase 2 Wave C, site 1/5. Genuinely needed the string->string|null
migration (a real "nothing chosen" state, unlike most of this
rollout's non-searchable sites) -- preserved the custom "Choose a
state" placeholder explicitly via Select's placeholder prop, and
added a test for it (a real, previously-uncovered gap this task's
own investigation found).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migrate `reopen-dialog.tsx`'s "Reopen to" select

**Files:**
- Modify: `packages/app-core/src/views/reopen-dialog.tsx:84-95`
- Test: `packages/app-core/test/views/reopen-flow.test.tsx` (4 call sites targeting THIS dialog: a raw `querySelectorAll('option')` DOM read at ~line 165-169, plus `selectOptions` calls at ~lines 171, 201, 227, 307, all `getByLabelText('Reopen to')`)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on.

**No `string | null` migration needed here** — unlike Task 1's site, `toStateId` defaults to `useState(reopenStates[0]?.id ?? '')`, and the select is only ever RENDERED when `reopenStates.length > 0` (the empty case renders a `<p>` explanation instead, no select at all) — so whenever this select exists on screen, `toStateId` is always a valid, already-selected state id from mount. This matches Wave A's members/page.tsx pattern (always-populated), not Task 1's genuine-unset pattern. Confirm this yourself by reading the full component (`reopen-dialog.tsx`) before assuming it — the point is to verify, not to trust this plan's own claim uncritically.

- [ ] **Step 1: Read the current file for exact context**

```bash
sed -n '84,95p' packages/app-core/src/views/reopen-dialog.tsx
```

Current shape:

```tsx
        <label className="gn-reopen__picker">
          Reopen to
          <select value={toStateId} onChange={(event) => setToStateId(event.target.value)}>
            {reopenStates.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </select>
        </label>
```

- [ ] **Step 2: Confirm the CSS this migration must preserve**

```bash
grep -n "\.gn-reopen__picker\b" packages/ui/src/ui.css
```

Expected: `.gn-reopen__picker { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.7rem 0; }` — real, must move to the replacement `<div>`.

- [ ] **Step 3: Update the failing tests first**

Read `packages/app-core/test/views/reopen-flow.test.tsx` around lines 160-230 and 300-310 in full before editing — these are the 4 call sites targeting `ReopenDialog` (a 5th call site in this same file, around line 124, targets a DIFFERENT dialog — `NewTicketDialog`, embedded in this same flow test as setup — that one belongs to Task 3, not this task; do not touch it here).

The raw DOM option-read (~line 165-169):

```tsx
// BEFORE:
    const picker = screen.getByLabelText('Reopen to');
    const optionValues = [...picker.querySelectorAll('option')].map((option) =>
      option.getAttribute('value'),
    );
    expect(optionValues.sort()).toEqual(['doing', 'todo']);
```

This queries the trigger element's own `<option>` DOM children directly — once migrated, `screen.getByLabelText('Reopen to')` returns `Select`'s `<button>` trigger, which has no `<option>` children of its own (the options live inside the portal-rendered listbox when open, or — for a non-searchable `Select` — also inside the always-present, `aria-hidden` `HiddenSelect` mirror). Change this to read from `HiddenSelect`'s mirror instead, which mirrors this file's approach in Wave B (confirmed there that `HiddenSelect` is fed from the same `buildCollection` source as the visible panel, so this remains a genuine, non-vacuous check):

```tsx
// AFTER:
    const picker = screen.getByLabelText('Reopen to');
    const optionValues = [...picker.querySelectorAll('option')].map((option) =>
      option.getAttribute('value'),
    );
    expect(optionValues.sort()).toEqual(['doing', 'todo']);
```

**This one may need NO change at all** — `HiddenSelect` renders its own real `<select>`/`<option>` elements, and `screen.getByLabelText('Reopen to')` might resolve to that hidden native select rather than the visible trigger button, in which case `querySelectorAll('option')` on it already works unmodified. Verify empirically which element `getByLabelText` actually returns post-migration (run the test, inspect, don't guess) before deciding whether this line needs editing — if `getByLabelText` returns the button (no `<option>` children), you'll need `within(picker.closest(...)).querySelectorAll(...)` or a `data-testid` scoped read instead; work out the correct query from what you actually observe, this brief cannot predict jsdom's exact resolution order for two elements sharing one accessible name.

The 4 `selectOptions` calls (representative example, apply to all 4 — read each one's exact surrounding test first):

```tsx
// BEFORE:
    await user.selectOptions(screen.getByLabelText('Reopen to'), 'doing');
```

```tsx
// AFTER:
    await user.click(screen.getByRole('button', { name: /Reopen to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Doing' }));
```

(Verify `'doing'`'s display name is genuinely `'Doing'` against this test file's own workflow fixtures before writing the matcher, the same discipline Task 1 used.)

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run reopen-flow.test.tsx > /tmp/wave-c-task2-red.log 2>&1
tail -150 /tmp/wave-c-task2-red.log
```

Expected: the 4 rewritten `ReopenDialog` interactions fail (native select gone); the 1 untouched `NewTicketDialog` interaction (line ~124) and its dependents may ALSO fail at this stage since `reopen-flow.test.tsx` likely exercises both dialogs across its test suite — that's expected and will be resolved by Task 3, not this task. Confirm the 4 `ReopenDialog`-specific failures are for the right reason (native select still absent a `button` role) and note which other failures exist so Task 3 isn't surprised by them.

- [ ] **Step 5: Migrate the component**

Add `import { Select } from '@gisik-nokma/ui';`, replace the region from Step 1 with:

```tsx
        <div className="gn-reopen__picker">
          <span>Reopen to</span>
          <Select
            options={reopenStates.map((state) => ({ value: state.id, label: state.name }))}
            value={toStateId}
            onChange={setToStateId}
            aria-label="Reopen to"
          />
        </div>
```

No `?? null` needed — `toStateId` is never actually unset when this renders (see the brief's own reasoning above).

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run reopen-flow.test.tsx > /tmp/wave-c-task2-green.log 2>&1
tail -150 /tmp/wave-c-task2-green.log
```

Expected: the 4 `ReopenDialog`-targeting tests now pass. The `NewTicketDialog`-dependent tests (via the shared line-124 setup helper) are Task 3's to fix — do not attempt to fix them here, and do not let their continued failure block this task's own commit, but DO report their exact count/names in your report so Task 3 has an accurate starting point.

- [ ] **Step 7: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-c-task2-full-test.log 2>&1
tail -60 /tmp/wave-c-task2-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-c-task2-typecheck.log 2>&1
tail -40 /tmp/wave-c-task2-typecheck.log
```

Expected: the full suite will NOT be fully green yet (the `NewTicketDialog`-dependent failures in this same test file are pre-existing at this point in the wave, not introduced by this task) — confirm via the reasoning above, not by treating a non-zero failure count as automatically this task's fault. Report the exact failing test names and confirm each one is a `NewTicketDialog` interaction, not a `ReopenDialog` one, before committing.

- [ ] **Step 8: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 2 files:
- `packages/app-core/src/views/reopen-dialog.tsx`
- `packages/app-core/test/views/reopen-flow.test.tsx`

```bash
git add packages/app-core/src/views/reopen-dialog.tsx packages/app-core/test/views/reopen-flow.test.tsx
git commit -m "$(cat <<'EOF'
Migrate reopen-dialog's Reopen-to select to the shared Select

Phase 2 Wave C, site 2/5. No string|null migration needed -- this
select is only ever rendered already-populated. reopen-flow.test.tsx
also exercises NewTicketDialog (Task 3's site) as flow setup; those
interactions are left failing here deliberately, for Task 3 to fix.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migrate `new-ticket-dialog.tsx`'s Type and Parent selects

**Files:**
- Modify: `packages/app-core/src/views/new-ticket-dialog.tsx:77-104`
- Test: `packages/app-core/test/views/new-ticket-dialog.test.tsx` (extensive — uses `fireEvent.change`, `.tagName` checks, and `getAllByRole('option')` reads that assume a native select's always-present children; NOT simple `selectOptions` calls, read carefully)
- Test: `packages/app-core/test/views/reopen-flow.test.tsx:123` (one `selectOptions` call against this same `NewTicketDialog`, left failing by Task 2 for this task to fix)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on.

**This is the most structurally different task in this wave — both sites are SEARCHABLE, and the Parent select has a genuinely unusual value contract.** Read this whole section before touching any code.

**Type select:** `typeId` defaults to `useState(typeOptions[0]?.id ?? '')` — always-populated from the first type option (matches Task 2's pattern), UNLESS `typeOptions` is empty (an edge case worth a quick check but not a blocker — if `typeOptions` is empty, `typeId` stays `''` and the Create button is already disabled via `typeId === ''`, so there is no valid state to reach where an empty `typeId` needs a real UI treatment beyond what already exists). No `string | null` migration needed.

**Parent select is genuinely different from every other site in this entire rollout.** Read `parentId`'s current handling closely: `useState('')`, and `''` is **not a placeholder for "nothing chosen"** — it is a real, permanently-selectable, meaningful option: `<option value="">None (project root)</option>`. The dialog's own docblock is explicit that `''` only gets translated to `null` at the SUBMIT boundary (`parentId: parentCandidatesUnavailable !== undefined || parentId === '' ? null : parentId`), specifically because `''` and `null` mean different things in different places — the DOM's own sentinel value versus the wire payload's `parentId: string | null` contract. **Do not apply this rollout's usual `value: X ?? null` pattern to Parent — that pattern is for sites where an empty/unset value should show a placeholder and match no option. Here, `''` must remain a real, matchable `SelectOption` (`{ value: '', label: 'None (project root)' }`), always selected and always visible as "None (project root)," never as a placeholder.** Add this synthetic option to the front of the mapped `parentCandidates` array; do not touch the existing submit-time `parentId === '' ? null : parentId` translation — it already does exactly the right thing and needs no change.

**A structural, load-bearing accessibility comment already exists in this file about the `parentCandidatesNarrowing` `<span>` living OUTSIDE the `<label>`** (search for "OUTSIDE the `<label>`" in the current file) — a sentence inside the label would corrupt the accessible name via native `<label>`-text association, measured to break case 12.388. Since you're keeping the `<label>` wrapping for this searchable site (per this plan's Architecture section), **preserve this exact outside-the-label placement unchanged** — do not move the narrowing `<span>` for any reason, and do not delete the explanatory comment, even though `Select`'s own `aria-label` prop makes the underlying mechanism (accessible name corruption) structurally impossible to trigger even if something were moved inside — the comment's reasoning remains valuable context for a future reader and the placement itself costs nothing to keep.

- [ ] **Step 1: Read the current file for exact context**

```bash
sed -n '71,104p' packages/app-core/src/views/new-ticket-dialog.tsx
```

Current shape (Type and Parent both, exactly as they stand — see the full file read at plan-writing time for the surrounding `Title` field and closing markup, unchanged by this task):

```tsx
      <label className="gn-new-ticket__field">
        Type
        <select value={typeId} onChange={(event) => setTypeId(event.target.value)}>
          {typeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label className="gn-new-ticket__field">
        Parent
        {parentCandidatesUnavailable === undefined ? (
          <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">None (project root)</option>
            {parentCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        ) : (
          <p role="status" className="gn-new-ticket__parent-unavailable">
            This ticket will be created at project root: the list of tickets that could be a
            parent cannot be shown. {parentCandidatesUnavailable}
          </p>
        )}
      </label>
```

- [ ] **Step 2: CSS check**

```bash
grep -n "\.gn-new-ticket__field\b" packages/ui/src/ui.css
```

Expected: `.gn-new-ticket__field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.7rem; }` — but since you are KEEPING the `<label>` wrapping for both searchable sites (unlike Tasks 1/2/4), this class stays exactly where it already is (on the `<label>`) — no CSS migration needed for this task at all.

- [ ] **Step 3: Rewrite the tests — read the whole file first, this one needs real judgment, not mechanical substitution**

`new-ticket-dialog.test.tsx` does NOT use `userEvent.selectOptions` — it uses `fireEvent.change`, direct `.tagName` assertions, and `getAllByRole('option')` reads. Read the entire file (it's not large) before editing anything. Key patterns you will find and how each one translates:

**Pattern A — enumerating Parent's option count** (appears at least 3 times, e.g. `expect(within(screen.getByLabelText('Parent')).getAllByRole('option')).toHaveLength(2);`): this reads `<option>` children directly off the trigger element. Since Parent is searchable, `getByLabelText('Parent')` resolves to the real `<input role="combobox">` — but its options still only exist in the DOM once the panel is open (searchable `Select` has no `HiddenSelect` mirror to fall back on, unlike the non-searchable sites in Tasks 1/2/4). Each of these assertions needs the panel opened first:

```tsx
// BEFORE:
    expect(within(screen.getByLabelText('Parent')).getAllByRole('option')).toHaveLength(2);
```

```tsx
// AFTER:
    await user.click(screen.getByLabelText('Parent'));
    expect(within(await screen.findByRole('listbox')).getAllByRole('option')).toHaveLength(2);
```

(This changes a synchronous test into one needing `async`/`await` and a `userEvent.setup()` instance — check whether the enclosing `it(...)` is already `async` with a `user` in scope; if not, you'll need to add both. `2` becomes `3` for any assertion counting Parent's options, since the synthetic `{ value: '', label: 'None (project root)' }` option is now a real, counted `SelectOption` alongside the fixture's `parentCandidates` — recompute each expected count against the actual fixture data used in that specific test, don't assume every "2" becomes "3" uniformly without checking.)

**Pattern B — `fireEvent.change` directly setting a value** (e.g. `fireEvent.change(screen.getByLabelText('Parent'), { target: { value: '01J9TICKET...' } })`): this dispatches a raw DOM `change` event with a `target.value`, which only makes sense against a real `<select>`/`<input>` element accepting that exact API. Against `Select`'s combobox `<input>`, this does not select an option the way a real user would — it would need to become a real interaction: open, then click the matching option. Rewrite as:

```tsx
// AFTER (adjust the option's accessible name to the real candidate title used in that specific test):
    await user.click(screen.getByLabelText('Parent'));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Rewire the shop sign' }));
```

**Pattern C — `.tagName` assertions** (e.g. `expect(screen.queryByLabelText('Parent')?.tagName).not.toBe('SELECT')`): this specifically checks the withheld-parent-list case, where `parentCandidatesUnavailable` is set and the picker is replaced by a `<p role="status">` message — this assertion's INTENT (confirm the picker is genuinely gone, not just visually hidden) survives the migration unchanged in spirit, but the exact check needs to change since neither the old picker NOR the new `Select` would ever literally be a `<SELECT>` tag once migrated (even the un-withheld case now renders an `<input>`, never a `<select>` tag). Rewrite to assert on what actually distinguishes "picker present" from "withheld": the presence/absence of the `role="status"` withheld-message text is already asserted separately in the same test (`screen.getByText(/the list of tickets that could be a parent cannot be shown/)`) — check whether that existing assertion alone already fully covers the intent once the `.tagName` check is removed, or whether a replacement check (e.g. `screen.queryByLabelText('Parent')` resolves to something that is not the combobox input, or simply `screen.queryByRole('combobox', { name: 'Parent' })` returns null) is still needed to keep the "the picker itself is truly gone" claim intact. Use your own judgment here and explain your reasoning in your report — this is exactly the kind of case where a mechanical find-and-replace would silently weaken coverage.

Read every remaining test in the file for the same three patterns and apply the correct translation to each — do not assume the file only contains exactly these three shapes; these are the ones found while writing this plan, not a guaranteed-exhaustive list.

**Also fix `reopen-flow.test.tsx:123-124`** (left failing by Task 2):

```tsx
// BEFORE:
async function createTicketUnderParent(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'New ticket' }));
  await user.type(screen.getByLabelText('Title'), 'Renew the trade licence');
  await user.selectOptions(screen.getByLabelText('Parent'), PARENT);
  await user.click(screen.getByRole('button', { name: 'Create' }));
}
```

```tsx
// AFTER:
async function createTicketUnderParent(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'New ticket' }));
  await user.type(screen.getByLabelText('Title'), 'Renew the trade licence');
  await user.click(screen.getByLabelText('Parent'));
  await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: PARENT_TITLE }));
  await user.click(screen.getByRole('button', { name: 'Create' }));
}
```

Where `PARENT_TITLE` is whatever the real candidate's `title` is in this file's own fixture (`PARENT` is currently the candidate's id, used with `selectOptions`'s by-value matching — find the matching `title` string in this file's own fixture data near the top, the same "id vs display value" check every other task in this wave has needed).

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run new-ticket-dialog.test.tsx reopen-flow.test.tsx > /tmp/wave-c-task3-red.log 2>&1
tail -200 /tmp/wave-c-task3-red.log
```

- [ ] **Step 5: Migrate the component**

Add `import { Select } from '@gisik-nokma/ui';`, replace the region from Step 1 with:

```tsx
      <label className="gn-new-ticket__field">
        Type
        <Select
          options={typeOptions.map((option) => ({ value: option.id, label: option.name }))}
          value={typeId === '' ? null : typeId}
          onChange={setTypeId}
          searchable
          aria-label="Type"
        />
      </label>
      <label className="gn-new-ticket__field">
        Parent
        {parentCandidatesUnavailable === undefined ? (
          <Select
            options={[
              { value: '', label: 'None (project root)' },
              ...parentCandidates.map((candidate) => ({ value: candidate.id, label: candidate.title })),
            ]}
            value={parentId}
            onChange={setParentId}
            searchable
            aria-label="Parent"
          />
        ) : (
          <p role="status" className="gn-new-ticket__parent-unavailable">
            This ticket will be created at project root: the list of tickets that could be a
            parent cannot be shown. {parentCandidatesUnavailable}
          </p>
        )}
      </label>
```

Note: `value={parentId}` for the Parent select is passed directly, never `?? null` — `parentId` is always either `''` (matching the synthetic "None (project root)" option) or a real candidate id, and both are valid, always-matching values. This is deliberate, per this task's own analysis above — do not "fix" it to match the `?? null` pattern used elsewhere in this rollout.

**The `searchable` prop is added to both** per the spec's classification — confirm this compiles and behaves as expected; if either site feels wrong as searchable once you see it rendered/tested (e.g. Type's options are always small and static, arguably not benefiting from search), that's a design question already settled by the spec and the earlier brainstorming session, not something to reverse in this task — implement as specified.

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run new-ticket-dialog.test.tsx reopen-flow.test.tsx > /tmp/wave-c-task3-green.log 2>&1
tail -200 /tmp/wave-c-task3-green.log
```

Expected: ALL of `reopen-flow.test.tsx` now passes (Task 2's deliberately-left-failing tests are resolved here).

- [ ] **Step 7: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-c-task3-full-test.log 2>&1
tail -60 /tmp/wave-c-task3-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-c-task3-typecheck.log 2>&1
tail -40 /tmp/wave-c-task3-typecheck.log
```

Expected: fully green now (both this task's and Task 2's work combined).

- [ ] **Step 8: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 3 files:
- `packages/app-core/src/views/new-ticket-dialog.tsx`
- `packages/app-core/test/views/new-ticket-dialog.test.tsx`
- `packages/app-core/test/views/reopen-flow.test.tsx`

```bash
git add packages/app-core/src/views/new-ticket-dialog.tsx packages/app-core/test/views/new-ticket-dialog.test.tsx packages/app-core/test/views/reopen-flow.test.tsx
git commit -m "$(cat <<'EOF'
Migrate new-ticket-dialog's Type and Parent selects to the shared Select

Phase 2 Wave C, sites 3-4/5. Both searchable -- kept the existing
<label> wrapping (safe and beneficial for searchable consumption,
per Wave B's corrected rule). Parent's '' value is a REAL, always-
selectable "None (project root)" option, not an unset placeholder --
added as a synthetic first SelectOption rather than treated with
this rollout's usual value-or-null pattern. Also fixes the one
NewTicketDialog interaction in reopen-flow.test.tsx left failing by
Task 2.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migrate `ticket-list.tsx`'s "Group by" select, and complete Phase 2

**Files:**
- Modify: `packages/app-core/src/views/ticket-list.tsx:186-204`
- Test: `packages/app-core/test/views/ticket-list.test.tsx` (4 call sites: 2 loop over `ALL_GROUPINGS` picking each in turn, 2 pick `'status'` directly; one assertion uses `toHaveValue`, needs fixing to `toHaveTextContent`)
- Modify: `Features.md` (final step of this task — the wave-completion update, see below)

**Interfaces:**
- Consumes: `Select` from `@gisik-nokma/ui`.
- Produces: nothing later tasks depend on — this is the last task of the last wave.

**No `string | null` migration** — `grouping` is always one of 5 valid `Grouping` values (`epic`/`status`/`assignee`/`type`/`flat`), never unset, matching Task 2's pattern.

- [ ] **Step 1: Read the current file for exact context**

```bash
sed -n '186,204p' packages/app-core/src/views/ticket-list.tsx
```

Current shape:

```tsx
        <label className="gn-list__control">
          Group by
          <select
            value={grouping}
            disabled={!prefsEditable}
            onChange={(event) =>
              onPrefsChange({
                ...prefs,
                grouping: { origin: 'stored', value: event.target.value as Grouping },
              })
            }
          >
            {GROUPING_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
```

- [ ] **Step 2: CSS check**

```bash
grep -n "\.gn-list__control\b" packages/ui/src/ui.css
```

Expected: `.gn-list__control { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--gn-text-muted); }` — real (note: `inline-flex`, not `flex` — different from every other site's wrapping class in this wave; preserve the exact value, don't normalize it to match the others), must move to the replacement `<div>`.

- [ ] **Step 3: Update the failing tests first**

```bash
grep -n "selectOptions\|toHaveValue" packages/app-core/test/views/ticket-list.test.tsx
```

The `toHaveValue` assertion (confirmed the only one in this file, and the only one across this entire wave's 4 test files):

```tsx
// BEFORE (inside a loop over ALL_GROUPINGS):
    for (const grouping of ALL_GROUPINGS) {
      await user.selectOptions(screen.getByLabelText('Group by'), grouping);
      expect(screen.getByLabelText('Group by')).toHaveValue(grouping);
      expect(summary(), `grouping=${grouping}`).toBe(baseline);
    }
```

```tsx
// AFTER:
    for (const grouping of ALL_GROUPINGS) {
      await user.click(screen.getByRole('button', { name: /Group by/ }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: grouping }));
      expect(screen.getByRole('button', { name: /Group by/ })).toHaveTextContent(grouping);
      expect(summary(), `grouping=${grouping}`).toBe(baseline);
    }
```

(`GROUPING_OPTIONS`'s values — `'epic'`/`'status'`/`'assignee'`/`'type'`/`'flat'` — are used directly as BOTH the `SelectOption`'s `value` AND `label` in the current native markup, i.e. `<option key={option} value={option}>{option}</option>` — confirm this stays true in your migrated `options={GROUPING_OPTIONS.map((option) => ({ value: option, label: option }))}` mapping, so the option-name matcher above (`{ name: grouping }`) is correct as an exact match, not needing a regex — this is one of the few sites in this whole rollout where id and display label are genuinely identical strings, so don't apply the "always use the display name, never the id" caution from Tasks 1-3 mechanically here; verify it's actually a non-issue in this specific case, which it is, since there IS no separate display name.)

Apply the same click-open/click-pick transformation to the other 2 direct `'status'`-picking call sites, reading each one's surrounding context first.

- [ ] **Step 4: Run the tests and confirm they fail for the right reason**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run ticket-list.test.tsx > /tmp/wave-c-task4-red.log 2>&1
tail -150 /tmp/wave-c-task4-red.log
```

- [ ] **Step 5: Migrate the component**

Add `import { Select } from '@gisik-nokma/ui';`, replace the region from Step 1 with:

```tsx
        <div className="gn-list__control">
          <span>Group by</span>
          <Select
            options={GROUPING_OPTIONS.map((option) => ({ value: option, label: option }))}
            value={grouping}
            disabled={!prefsEditable}
            onChange={(next) =>
              onPrefsChange({
                ...prefs,
                grouping: { origin: 'stored', value: next as Grouping },
              })
            }
            aria-label="Group by"
          />
        </div>
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @gisik-nokma/app-core exec vitest run ticket-list.test.tsx > /tmp/wave-c-task4-green.log 2>&1
tail -150 /tmp/wave-c-task4-green.log
```

- [ ] **Step 7: Full package test + typecheck**

```bash
pnpm --filter @gisik-nokma/app-core test > /tmp/wave-c-task4-full-test.log 2>&1
tail -60 /tmp/wave-c-task4-full-test.log
pnpm --filter @gisik-nokma/app-core typecheck > /tmp/wave-c-task4-typecheck.log 2>&1
tail -40 /tmp/wave-c-task4-typecheck.log
```

This is the last task of the last wave — also run the full repo-wide sweep for any remaining native `<select>` in scope for this rollout, confirming there are genuinely none left:

```bash
grep -rn "<select" packages/app-core/src packages/ui/src apps/web/app apps/web/src 2>/dev/null | grep -v "reference/\|\.test\.\|test/\|__tests__" | grep -vi "gn-select"
```

Expected: zero real `<select>` JSX matches (any hits should be comments/docblock prose only, the same false-positive shape Wave A's own audit already accounted for) — confirm this explicitly in your report; if you find a genuine, un-migrated site, STOP and report it as a real finding rather than silently completing the wave over a gap.

- [ ] **Step 8: Update `Features.md` — the wave-completion step**

This is the one place in this wave that declares the ENTIRE Phase 2 rollout (and with it, the full 15-site native-`<select>` audit Phase 1 started) complete. Read `Features.md`'s "Shared `Select` component" bullet in full (search for `**Shared \`Select\` component**`) — Wave B's own final-review fix already corrected this bullet's rollout-status sentence to describe Phase 1 + Wave A + Wave B + "5 remain for Wave C, not yet planned." Replace that sentence with one stating the rollout is now COMPLETE: all 13 Phase-2 sites migrated across 3 waves (3 + 5 + 5), plus Phase 1's original 2, for 15 sites total — cite this wave's own 5 files by path, matching the file's established register (dense, specific, citing paths) the same way Wave B's fix did for its own sites. Confirm the sentence you write is the true FINAL state — read the actual current bullet text fresh before editing (don't work from this plan's own paraphrase of it, which may have drifted since Wave B's fix landed).

Also check `test-cases/10-workflow-builder.md`'s Wave B section (added by Wave B's final-review fix) — decide whether this wave's own test-case citations belong in a NEW section (e.g. `## Views: shared Select migration (Phase 2 Wave C)`) or appended to the existing one, matching whatever convention is clearest given the file's actual current structure at the time you read it. Add entries for this wave's 4 tasks' worth of coverage (Task 1's placeholder test is a good candidate for its own citable case; the others can be combined or split following this file's own established granularity, the same judgment call Wave B's fix made for its own entries).

- [ ] **Step 9: `git status` and commit**

```bash
git status --short
```

Confirm exactly these 3 files:
- `packages/app-core/src/views/ticket-list.tsx`
- `packages/app-core/test/views/ticket-list.test.tsx`
- `Features.md`
- (plus `test-cases/10-workflow-builder.md` if Step 8's second half added entries there)

```bash
git add packages/app-core/src/views/ticket-list.tsx packages/app-core/test/views/ticket-list.test.tsx Features.md test-cases/10-workflow-builder.md
git commit -m "$(cat <<'EOF'
Migrate ticket-list's Group-by select; complete the Phase 2 rollout

Phase 2 Wave C, site 5/5 -- the final site of the final wave.
Confirmed via a repo-wide sweep that zero native <select> elements
remain in this rollout's scope. Features.md's Shared Select bullet
updated to state the full 15-site rollout (Phase 1's 2 + Phase 2's
13 across 3 waves) is complete.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Wave C completion — Phase 2 complete

After all 4 tasks are committed and reviewed clean, this SDD plan and the entire Phase 2 shared-Select rollout are done: every native `<select>` the original audit found (2 in Phase 1, 13 across Waves A/B/C) is migrated. There is no Wave D and no further phase planned in the current spec.

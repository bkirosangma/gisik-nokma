# Handoff — `task/board-workflow-collapsible` (WIP checkpoint, 2026-09-23)

Written at a machine-restart checkpoint, so it covers **only what a fresh lane could not reconstruct from
the diff**. The implementation is complete and green; two mutations are owed (below).

## Which of the three rulings are implemented

**All three are implemented and witnessed.** Summary of what each turned into:

1. **Single workflow → UNCOLLAPSED, including when empty** (and still collapsible by hand).
   `defaultCollapsed` is `board.groups.length > 1 && groupIsEmpty(group)`, so a lone group is never
   collapsed by the default; the heading's old `groups.length > 1` gate is GONE, so every group is named
   and has a control. Cases `13.1412`, `13.1413`, `13.1420`.
2. **The choice persists** — in `localStorage`, client side, per the correcting ruling. NOT the server:
   an earlier reading sent the work at `ProjectViewPrefs` and the server-owned `.strict()` document, and
   that was backed out **unstarted** (nothing under `apps/server` or `domain/preferences.ts` is touched in
   this branch — verified by `git diff --stat`). Store:
   `packages/app-core/src/preferences/workflow-collapse.ts`. `Board` gains one optional `currentUserId`
   prop; `page.tsx` passes `currentUserId` and nothing else changed there. Cases `13.1414` (four arms).
3. **A collapsed group that stops being empty auto-expands, and that expansion persists.** One-shot on two
   independent guards (what the last effect run saw, and the `true` the write leaves behind). Cases
   `13.1415` (including a write-count arm for the owner's named write-storm hazard), `13.1416`.

## The stored shape, and the distinction it has to make

```json
{ "userId": "<id>", "projects": { "<projectId>": { "<workflowId>@<workflowVersion>": true|false } } }
```

**Yes, it can distinguish *collapsed by the default* from *collapsed deliberately* — that is the whole
point of the shape.** It holds **only choices**:

- a group **absent** from the record has no choice recorded — its state is DERIVED (empty ⇒ collapsed on
  a multi-group board). This is the group the auto-expand rule MAY reopen.
- a group stored as `false` was collapsed **by a person**. The auto-expand rule must not touch it, and the
  `Object.hasOwn(groupChoices, key)` term is what enforces that.

A shape storing resolved states (one boolean per group, seeded at mount) would have erased the difference
and silently reopened a group a person had shut. Keyed by user (a shared laptop must not inherit the
previous person's collapse) and by project (two projects can hold the same workflow at the same version).
`''`, or an absent `currentUserId`, reads and writes nothing.

## What was measured that contradicted the brief or the rulings

1. **The brief's premise was false.** The request read as though the group were already collapsible and
   only its default needed changing. At `45091f08` it was neither: a bare `<h2 class="gn-board__workflow">`
   rendered ONLY when a board had more than one workflow group, and the columns always rendered. The block
   bought a new control, a new default and a new store.
2. **Ruling 2's mechanism was wrong**, per the correction: `localStorage`, not the server. The whole
   `ProjectViewPrefs` / zod-guard / `useTicketList` wiring it described does not exist in this branch.
3. **jsdom's `localStorage` cannot be instrumented at the instance level.** `vi.spyOn(window.localStorage,
   'setItem')` AND a plain `window.localStorage.setItem = fn` each recorded **0** calls while the write
   succeeded and read back — jsdom's `localStorage` is a Proxy answering a bound method from its internal
   store. A write-count case built on either would report "no write storm" over any number of writes.
   `vi.spyOn(Storage.prototype, 'setItem')` records it; that is what the case uses.
4. **`hidden` filters `getByRole` and NOTHING else in this environment** (probe: `{"roleVisible":true,
   "roleHidden":false,"testIdHidden":true,"textHidden":true}`). Every collapsed-group probe is therefore a
   role query; a `getByTestId`/`getByText` probe would pass over a rail that is still on screen.
5. **A docblock naming a source literal breaks the source-scanning case that reads it.** Writing
   `<h2 className="gn-board__workflow">` in prose reddened `heading-outline.test.ts` (its count is over the
   raw file, comments included). The prose was reworded, not the test.
6. **The heading's widened gate made one case elsewhere FALSE** — `apps/web/test/board-narrowing.test.tsx`
   `13.469` used the absence of a level-2 heading as its witness that a fixture carries one workflow. It
   was amended to a stronger witness (exactly one group heading, naming that workflow), and that is a
   behaviour change rather than a repair.
7. **One of MY OWN cases could not fail, and only a mutation found it.** `13.1416` as first written stayed
   green with the term it was supposed to witness removed — see "the case it REPAIRED" below. Worth
   carrying forward as a pattern rather than as an incident: a case whose fixture never reaches the state
   its assertion depends on is green for a reason that has nothing to do with the assertion.
8. **`13.1408` needs an INVERTING mutation, not a removing one.** It is the control arm of `13.1407` and is
   satisfied both before and after the feature, so every mutation that deletes the empty-group default
   leaves it green. A control arm's witness has to be built to point the other way.

## State of verification, stated precisely

Measured on **Node v22.22.2**, LOCAL runs (a dev PR into a release branch runs no CI — `ci.yml` filters
`pull_request` on the BASE):

- `pnpm turbo run build` → 11/11, `pnpm turbo run typecheck` → 17/17: run at the commit that added the
  tests, BEFORE the last two test-file additions (the `aria-controls` arm and the write-count arm).
- `packages/app-core` **2001 passed / 106 files**, `apps/web` **768 passed / 72 files**, `packages/ui`
  **432 passed / 10 files**: all at that same commit.
- The focused file `board-workflow-collapse.test.tsx` is **20/20** at the CURRENT head.
- **NOT re-run at the current head:** the three full suites and the typecheck. The changes since are
  test-file-only, so the source under test is unchanged — but that is an argument, not a measurement.

## The mutation round, finished — and the case it REPAIRED

Fifteen mutations were run against the committed tree, each restored in a `finally`. The measured table is
in `test-cases/13-owner-requests-and-backlog.md`; what belongs here is the one that mattered:

**The auto-expand rule's `Object.hasOwn(groupChoices, key)` term survived its first mutation — 20/20 green
with the term removed.** That term is the whole reason the stored shape exists (it is what stops the rule
undoing a person's own collapse), so a survivor there meant `13.1416` was **asserting the right property
about a scenario where the property is not load-bearing**: its fixture never let the group become EMPTY, so
the group never became *collapsed by the default*, the rule's `previous` guard alone kept it shut, and the
term was never reached. A control that cannot fail, one level up from the kind this project already
catalogues.

`13.1416` gained a second arm for the only sequence where the term decides anything — **collapse by hand →
empty out → refill** — and the mutation is now KILLED (`1 failed / 20 passed, 13.1416`). Every one of the
fifteen cases now has at least one killer, `13.1408` included: it needed a mutation that INVERTS the
default rather than removes it, since it is the control arm of `13.1407` and is true before and after the
feature.

## Owed, named rather than implied

1. **Nothing in the case block.** The two mutations the checkpoint deferred are run (both killed); the
   `13.1408` killer is added and measured.
2. **The three full suites and the build at the final head**: build and typecheck were re-run and are green;
   the suites' results are in the PR body.
3. **No browser measurement.** `13.1412`–`13.1420` are jsdom cases; nothing here was seen in a real
   browser, and the caret's paint and the rail's `display: none` are the two things a jsdom run cannot
   show. `13.1418` pins both as source, which is the honest half a suite can hold.
4. No PR was open at the time this line was written; it must target **`--base release/2026-09-23`**, never
   `main`.

The twelve measured mutations above were run by `scripts/zz-mutation-driver.py`, committed for the two
owed re-runs rather than deleted — it holds the exact anchors (including the two CORRECTED ones), applies
one mutation, runs the focused case file, parses the reddened case ids out of the FAIL lines after the
` > ` separator, and restores from the commit in a `finally`. It is machine-local (the repo root is
absolute) and wired into no `package.json` task; `zz-` marks it scratch. **It requires a clean, committed
tree** — its restore is `git checkout --`, which destroys uncommitted work silently.

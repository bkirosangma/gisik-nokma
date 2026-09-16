# Filters: exclude mode, reaching every tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every value in the project page's Filters sheet becomes tri-state (off → include → exclude → off), the filter vocabulary gains an `exclude` half, and the one page-level `filter` narrows all four tabs (Board, List, Calendar, Timeline) with a narrowing strip on each.

**Architecture:** One `IdAxes` vocabulary declared once in `view-types.ts` and used for both halves of `FilterSpec`. Three predicates — `matchesFilter` (TicketState), `matchesBoardCard` (BoardCard), new `matchesListRow` (ListRow) — share two base rules from `filter/id-axes.ts` and are held in agreement by tests. `page.tsx` narrows `list.rows` once and hands the narrowed rows to List/Calendar/Timeline; the existing strip renders per tab with per-tab counts. The Filters sheet's checkboxes and chips become one cycling `<button>` whose state lives in its accessible name. Everything stays client-side; `toServerFilterSpec` refuses a non-empty `exclude`.

**Tech Stack:** TypeScript, React 19, Next.js (`apps/web`), vitest + @testing-library (jsdom), plain CSS in `packages/ui/src/ui.css`, pnpm workspace with turbo.

**Spec:** `docs/superpowers/specs/2026-09-17-filter-exclude-all-tabs-design.md` — the plan argues from it; read both.

## Global Constraints

- **Branch:** work on `owner/workspace-edits` (the current branch). **Never commit or push to `main`.** Check `git branch --show-current` before every commit.
- **Node 22 for every test/typecheck run:** `source ~/.nvm/nvm.sh && nvm use 22` in the same shell (the machine defaults to Node 24, outside `"engines": ">=22.0.0 <23"`). State the Node version next to every gate result.
- **Never pipe a test run into `head`** (it orphans vitest workers — see the repo `CLAUDE.md`). Redirect to a file under the scratchpad and `grep`/`tail` it.
- **TDD, then mutation:** every predicate check gets a failing test first; after GREEN, delete the check, watch its case fail, restore from a scratchpad backup (`cp`, never `git checkout --`), and record the kill in the test-cases entry.
- **`Features.md` and `test-cases/13-deployment-dogfooding.md` in the SAME commit as the code they describe.** New case ids start at `13.538` and continue in order; never renumber. Run `node scripts/check-case-ids.mjs` after adding ids (the two pre-existing duplicates `13.387`/`13.413` are known).
- **Cite case ids in tests** as a comment or test name (`scripts/check-case-citations.mjs` ratchets uncited ✅ cases; `13.401`/`13.476`/`13.477`/`15.26` and files 03/10/11 are pre-existing regressions on this branch — do not fix, do not worsen).
- **Copy rules:** exclude chips read `Not assignee: …` / `Not type: …` / `Not state: …` / `Not category: …` / `Not project: N selected`. Accessible names for tri-state choices are `<name>`, `<name>, included`, `<name>, excluded`. Exclude is never danger red.
- **No `aria-pressed` on tri-state choices** (binary semantics would lie for three states).
- **Absent or empty list narrows nothing / excludes nothing** — the collapse-to-`undefined` convention (`toggledArray` in `page.tsx`) holds for both halves; an empty `exclude` object collapses to `undefined`.
- Existing docblock idiom: heavy, argued comments. Match the surrounding density; cite the spec section you implement.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/app-core/src/view-types.ts` | `IdAxes`, `FilterSpec` (gains `exclude`) — the ONE declaration site |
| `packages/app-core/src/filter/id-axes.ts` (new) | `narrowsTo`, `excludedBy`, `narrowsToAny`, `excludedByAny`, `claimedDueDay`, `claimText` — the base rules every predicate reads |
| `packages/app-core/src/filter/matches-filter.ts` | `matchesFilter` over `TicketState`, now honouring `exclude` |
| `packages/app-core/src/filter/board-filter.ts` | `BoardFilterSpec` (reshaped), `matchesBoardCard` honouring `exclude` |
| `packages/app-core/src/filter/list-filter.ts` (new) | `ListFilterSpec`, `matchesListRow` |
| `packages/app-core/src/online/mappers.ts` | `toServerFilterSpec` refuses `exclude` |
| `packages/app-core/src/index.ts` | exports `matchesListRow`, `ListFilterSpec` |
| `apps/web/src/filter-edits.ts` (new) | `withIdAxis` — set/clear one axis of one half, with the collapse rule |
| `apps/web/src/board-search-scope.ts` | `describeUnappliedBoardAxes` (exclude-aware), `describeUnappliedListAxes` (new), `buildFilterChips` (renamed, exclude chips), `shouldRenderNarrowingStrip` (renamed) |
| `apps/web/src/filter-cycle.ts` (new) | `ChoiceMode`, `choiceMode`, `nextMode`, `withCycledId` |
| `apps/web/src/tri-state-choice.tsx` (new) | `TriStateChoice` button + `ChoiceGlyph` |
| `apps/web/src/list-narrowing-word.ts` (new) | `listNarrowingWord(activeOnly, filterNarrows)` |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` | sheet controls, `boardFilter.exclude`, `listFilterSpec`, `listNarrowing`, strip on every tab, mirror note removed |
| `packages/ui/src/ui.css` | `.gn-visually-hidden`, `.gn-filters__choice[data-mode=…]`, `.gn-project__filter-chip--exclude` |
| Tests | `packages/app-core/test/filter/{id-axes,matches-filter,board-filter,list-filter}.test.ts`, `packages/app-core/test/online/mappers.test.ts`, `packages/ui/test/components.test.tsx`, `apps/web/test/{filter-edits,board-search-scope,filter-cycle,tri-state-choice,list-narrowing-word,filters-sheet,board-narrowing}.test.ts(x)` |

Run commands (from the package directory, Node 22 selected):

```bash
S=/private/tmp/claude-501/-Users-kiro-my-projects-gisik-nokma/3eba53cb-776b-4047-86d8-45d37cfb1d72/scratchpad
cd packages/app-core && pnpm exec vitest run test/filter/id-axes.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Tests |×|Error' $S/t.log
```

---

### Task 1: `IdAxes`, `FilterSpec.exclude`, and the base rules in `filter/id-axes.ts`

**Files:**
- Modify: `packages/app-core/src/view-types.ts:141-153` (the `FilterSpec` declaration)
- Create: `packages/app-core/src/filter/id-axes.ts`
- Test: `packages/app-core/test/filter/id-axes.test.ts` (new)

**Interfaces:**
- Produces: `IdAxes` type (exported through `export * from './view-types.js'` in `index.ts` — nothing to add there); `FilterSpec.exclude?: IdAxes`; `narrowsTo<T>(list: readonly T[] | undefined, value: T | null): boolean`; `excludedBy<T>(list, value): boolean`; `narrowsToAny<T>(list, values: readonly T[]): boolean`; `excludedByAny<T>(list, values): boolean`; `claimedDueDay(state: TicketState): string | null`; `claimText(value: unknown): string | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/app-core/test/filter/id-axes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '../../src/view-types.js';
import {
  claimText,
  excludedBy,
  excludedByAny,
  narrowsTo,
  narrowsToAny,
} from '../../src/filter/id-axes.js';

/**
 * 13.538 — the two base rules every filter predicate reads (exclude-mode
 * spec §2), declared once so `matchesFilter`, `matchesBoardCard` and
 * `matchesListRow` cannot drift on "does an absent list narrow?".
 */
describe('13.538 id-axes — the base rules, declared once', () => {
  it('narrowsTo: an absent or empty list narrows nothing; otherwise the value must be listed', () => {
    expect(narrowsTo(undefined, 'a')).toBe(true);
    expect(narrowsTo([], 'a')).toBe(true);
    expect(narrowsTo(['a', 'b'], 'a')).toBe(true);
    expect(narrowsTo(['a', 'b'], 'c')).toBe(false);
  });

  it('narrowsTo: a null value never matches a set list, and always passes an absent one', () => {
    expect(narrowsTo(['a'], null)).toBe(false);
    expect(narrowsTo(undefined, null)).toBe(true);
  });

  it('excludedBy: an absent or empty list excludes nothing; a listed value is out', () => {
    expect(excludedBy(undefined, 'a')).toBe(false);
    expect(excludedBy([], 'a')).toBe(false);
    expect(excludedBy(['a', 'b'], 'a')).toBe(true);
    expect(excludedBy(['a', 'b'], 'c')).toBe(false);
  });

  it('excludedBy: a null value is never excluded — unassigned work survives an assignee exclusion', () => {
    expect(excludedBy(['a'], null)).toBe(false);
  });

  it('the any-of forms, for an axis whose ticket-side value is itself a list (collaborators)', () => {
    expect(narrowsToAny(undefined, ['x'])).toBe(true);
    expect(narrowsToAny(['a'], ['x', 'a'])).toBe(true);
    expect(narrowsToAny(['a'], ['x'])).toBe(false);
    expect(narrowsToAny(['a'], [])).toBe(false);
    expect(excludedByAny(undefined, ['a'])).toBe(false);
    expect(excludedByAny(['a'], ['x', 'a'])).toBe(true);
    expect(excludedByAny(['a'], ['x'])).toBe(false);
    expect(excludedByAny(['a'], [])).toBe(false);
  });

  it('claimText renders a string, a finite number and a boolean as Postgres ->> would, and nothing else', () => {
    expect(claimText('4200')).toBe('4200');
    expect(claimText(2.5)).toBe('2.5');
    expect(claimText(true)).toBe('true');
    expect(claimText(null)).toBeNull();
    expect(claimText({ date: '2026-09-20' })).toBeNull();
    expect(claimText(Number.NaN)).toBeNull();
  });

  it('FilterSpec carries an exclude half of the same six id axes (a compile-time fact)', () => {
    const spec: FilterSpec = {
      assigneeIds: ['u1'],
      exclude: { assigneeIds: ['u2'], typeIds: ['bug'], stateCategories: ['terminal'] },
    };
    expect(spec.exclude?.assigneeIds).toEqual(['u2']);
    // @ts-expect-error `text` is not an id axis and has no exclude form (spec §1).
    const wrong: FilterSpec = { exclude: { text: 'x' } };
    expect(wrong).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/app-core && pnpm exec vitest run test/filter/id-axes.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Error|Tests ' $S/t.log`
Expected: EXIT=1, `Failed to resolve import "../../src/filter/id-axes.js"` (module missing).

- [ ] **Step 3: Declare `IdAxes` and `FilterSpec.exclude`**

In `packages/app-core/src/view-types.ts`, replace the `FilterSpec` declaration (currently lines 141-153):

```ts
/** Composable filters (spec §7 Search): every axis optional, all AND-combined. */
export type FilterSpec = {
  text?: string;
  assigneeIds?: string[];
  collaboratorIds?: string[];
  typeIds?: string[];
  stateIds?: string[];
  stateCategories?: StateCategory[];
  projectIds?: string[];
  dueBefore?: string; // claimed dates only, YYYY-MM-DD — nothing estimated
  dueAfter?: string;
  fields?: Record<string, string>;
};
```

with:

```ts
/**
 * The six id-shaped axes of a filter — every one a list, and an absent or
 * empty list narrows nothing. Declared ONCE and used twice (exclude-mode
 * spec §1, 2026-09-17): spread into `FilterSpec` as its include half, and as
 * the type of its `exclude` half — so the two halves cannot drift into two
 * vocabularies, the fork `matches-filter.ts`'s docblock forbids.
 */
export type IdAxes = {
  assigneeIds?: string[];
  collaboratorIds?: string[];
  typeIds?: string[];
  stateIds?: string[];
  stateCategories?: StateCategory[];
  projectIds?: string[];
};

/** Composable filters (spec §7 Search): every axis optional, all AND-combined. */
export type FilterSpec = IdAxes & {
  text?: string;
  dueBefore?: string; // claimed dates only, YYYY-MM-DD — nothing estimated
  dueAfter?: string;
  fields?: Record<string, string>;
  /**
   * The exclude half (exclude-mode spec §1): a ticket matching ANY listed
   * value on an axis is dropped. Evaluated after the include half — a ticket
   * must match one of the includes (when any are set) AND none of the
   * excludes. The Filters sheet's cycler never leaves one id in both halves;
   * the predicates do not need to care. `text`, the due bounds and `fields`
   * have no exclude form. CLIENT-SIDE ONLY: the wire's `filterSpecSchema`
   * has no negation term, and `toServerFilterSpec` refuses a non-empty
   * exclude rather than silently dropping it (`online/mappers.ts`).
   */
  exclude?: IdAxes;
};
```

- [ ] **Step 4: Create `filter/id-axes.ts`**

```ts
import type { TicketState } from '@gisik-nokma/domain';

/**
 * The base rules every filter predicate reads — `matchesFilter`
 * (`TicketState`), `matchesBoardCard` (`BoardCard`) and `matchesListRow`
 * (`ListRow`) — declared once (exclude-mode spec §2, 2026-09-17). Before this
 * module each predicate spelled "an absent or empty list does not narrow" by
 * hand, and the agreement tests were the only thing keeping three copies of
 * one rule in step. The exclude half doubles the number of places that rule
 * is needed; this is where it lives now. The agreement tests stay — they are
 * the proof, this is the mechanism.
 */

/** An absent or empty list does not narrow; otherwise the value must be listed. A null value never matches a set list. */
export function narrowsTo<T>(list: readonly T[] | undefined, value: T | null): boolean {
  if (list === undefined || list.length === 0) return true;
  return value !== null && list.includes(value);
}

/** An absent or empty list excludes nothing; otherwise a listed value is out. A null value is never out. */
export function excludedBy<T>(list: readonly T[] | undefined, value: T | null): boolean {
  if (list === undefined || list.length === 0) return false;
  return value !== null && list.includes(value);
}

/** `narrowsTo` for an axis whose ticket-side value is itself a list (collaborators): any listed value is enough. */
export function narrowsToAny<T>(list: readonly T[] | undefined, values: readonly T[]): boolean {
  if (list === undefined || list.length === 0) return true;
  return values.some((value) => list.includes(value));
}

/** `excludedBy` for a list-valued axis: any listed value puts the ticket out. */
export function excludedByAny<T>(list: readonly T[] | undefined, values: readonly T[]): boolean {
  if (list === undefined || list.length === 0) return false;
  return values.some((value) => list.includes(value));
}

/** The claimed due DAY, or null when nothing was claimed (or what was claimed is not a day). Moved here from `matches-filter.ts` unchanged. */
export function claimedDueDay(state: TicketState): string | null {
  const value = state.fields['dueDate']?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { date } = value as { date?: unknown };
  return typeof date === 'string' ? date : null;
}

/** What Postgres's `->>` would render for this claim value, or null where it yields SQL NULL. Moved here from `matches-filter.ts` unchanged. */
export function claimText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes, then typecheck**

Run: `pnpm exec vitest run test/filter/id-axes.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Tests ' $S/t.log` — Expected: EXIT=0, `Tests  7 passed (7)`.
Run: `pnpm run typecheck > $S/tc.log 2>&1; echo EXIT=$?` — Expected: EXIT=0 (`FilterSpec` as an intersection is structurally identical for every existing consumer).

- [ ] **Step 6: Record the case and commit**

Append to `test-cases/13-deployment-dogfooding.md` a new section heading `## Filters: exclude mode, reaching every tab (owner request, 2026-09-17)` with a two-sentence intro citing the spec, then:

```
- **13.538** ✅ `filter/id-axes.ts` — the two base rules (`narrowsTo`/`excludedBy`) and their any-of forms,
  plus `claimedDueDay`/`claimText` moved here unchanged; and `FilterSpec.exclude` typed as the same
  `IdAxes` the include half spreads in (a `@ts-expect-error` proves `text` has no exclude form).
```

```bash
git add packages/app-core/src/view-types.ts packages/app-core/src/filter/id-axes.ts packages/app-core/test/filter/id-axes.test.ts test-cases/13-deployment-dogfooding.md
git commit -m "Filter vocabulary: IdAxes declared once, FilterSpec gains an exclude half, base rules in id-axes.ts (13.538)"
```

---

### Task 2: `matchesFilter` honours `exclude`

**Files:**
- Modify: `packages/app-core/src/filter/matches-filter.ts`
- Test: `packages/app-core/test/filter/matches-filter.test.ts`

**Interfaces:**
- Consumes: `narrowsTo`, `narrowsToAny`, `excludedBy`, `excludedByAny`, `claimedDueDay`, `claimText` from `./id-axes.js`.
- Produces: `matchesFilter(state: TicketState, spec: FilterSpec): boolean` — signature unchanged, now evaluating `spec.exclude`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/app-core/test/filter/matches-filter.test.ts` (the `ticket()` fixture at the top of that file has `assigneeId: 'user_kiro'`, `collaboratorIds: ['user_anselma']`, `typeId: 'task'`, `stateId: 'doing'`, `stateCategory: 'active'`, `projectId: 'p1'`):

```ts
/**
 * 13.539 — the exclude half (exclude-mode spec §1-2): a ticket matching ANY
 * listed value on an axis is dropped, evaluated after the include half.
 */
describe('13.539 matchesFilter honours the exclude half on every id axis', () => {
  it('an empty exclude object, and empty exclude lists, exclude nothing', () => {
    expect(matchesFilter(ticket(), { exclude: {} })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { assigneeIds: [], typeIds: [] } })).toBe(true);
  });

  it('assignee — a listed assignee is out; unassigned work is never out', () => {
    expect(matchesFilter(ticket(), { exclude: { assigneeIds: ['user_kiro'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { assigneeIds: ['user_anselma'] } })).toBe(true);
    expect(matchesFilter(ticket({ assigneeId: null }), { exclude: { assigneeIds: ['user_kiro'] } })).toBe(true);
  });

  it('collaborator — ANY listed collaborator on the ticket puts it out', () => {
    expect(matchesFilter(ticket(), { exclude: { collaboratorIds: ['user_anselma'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { collaboratorIds: ['user_ghost'] } })).toBe(true);
  });

  it('type, state, state category and project', () => {
    expect(matchesFilter(ticket(), { exclude: { typeIds: ['task'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { typeIds: ['epic'] } })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { stateIds: ['doing'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { stateIds: ['done'] } })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { stateCategories: ['active'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { stateCategories: ['terminal'] } })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { projectIds: ['p1'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { projectIds: ['p2'] } })).toBe(true);
  });

  it('include AND exclude on one axis: must match an include and none of the excludes', () => {
    // "Uma, not Raj" — the ticket is Kiro's: included by the first, so kept.
    expect(
      matchesFilter(ticket(), { assigneeIds: ['user_kiro'], exclude: { assigneeIds: ['user_anselma'] } }),
    ).toBe(true);
    // Included AND excluded (the sheet never produces this; the predicate answers anyway): out.
    expect(
      matchesFilter(ticket(), { assigneeIds: ['user_kiro'], exclude: { assigneeIds: ['user_kiro'] } }),
    ).toBe(false);
  });

  it('exclude composes with the other axes — an excluded type is out even when everything else matches', () => {
    expect(
      matchesFilter(ticket(), { assigneeIds: ['user_kiro'], text: 'gst', exclude: { typeIds: ['task'] } }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run test/filter/matches-filter.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E '×|Tests ' $S/t.log`
Expected: EXIT=1; the five exclude cases fail with `expected true to be false` (the include-only predicate keeps everything); the empty-exclude case passes.

- [ ] **Step 3: Implement**

In `packages/app-core/src/filter/matches-filter.ts`, change the import block to:

```ts
import type { TicketState } from '@gisik-nokma/domain';
import type { FilterSpec } from '../view-types.js';
import {
  claimText,
  claimedDueDay,
  excludedBy,
  excludedByAny,
  narrowsTo,
  narrowsToAny,
} from './id-axes.js';
```

Replace the six include checks at the top of `matchesFilter` (from `if (spec.assigneeIds !== undefined …` through the `projectIds` check) with:

```ts
  // The include half — every rule below is `id-axes.ts`'s `narrowsTo`, read,
  // not restated (exclude-mode spec §2).
  if (!narrowsTo(spec.assigneeIds, state.assigneeId)) return false;
  if (!narrowsToAny(spec.collaboratorIds, state.collaboratorIds)) return false;
  if (!narrowsTo(spec.typeIds, state.typeId)) return false;
  if (!narrowsTo(spec.stateIds, state.stateId)) return false;
  if (!narrowsTo(spec.stateCategories, state.stateCategory)) return false;
  if (!narrowsTo(spec.projectIds, state.projectId)) return false;
```

Keep the `text`, due-bound and `fields` blocks exactly as they are. Immediately before the final `return true;` add:

```ts
  /**
   * The exclude half (exclude-mode spec §1-2), after every include check: a
   * ticket matching ANY listed value on an axis is out. `excludedBy` answers
   * `false` for an absent or empty list and for a null value, so unassigned
   * work survives an assignee exclusion — the mirror of `narrowsTo`'s "null
   * never matches a set list".
   */
  const exclude = spec.exclude ?? {};
  if (excludedBy(exclude.assigneeIds, state.assigneeId)) return false;
  if (excludedByAny(exclude.collaboratorIds, state.collaboratorIds)) return false;
  if (excludedBy(exclude.typeIds, state.typeId)) return false;
  if (excludedBy(exclude.stateIds, state.stateId)) return false;
  if (excludedBy(exclude.stateCategories, state.stateCategory)) return false;
  if (excludedBy(exclude.projectIds, state.projectId)) return false;
  return true;
```

Delete the local `claimedDueDay` and `claimText` functions at the bottom of the file (they now come from `./id-axes.js`). Add one sentence to the module docblock's "Every axis, because a hole here is silent" paragraph: "Since 2026-09-17 the six id axes are evaluated twice — include, then exclude — through `id-axes.ts`'s two base rules."

- [ ] **Step 4: Run to verify GREEN, then the whole filter directory**

Run: `pnpm exec vitest run test/filter/ > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Tests ' $S/t.log` — Expected: EXIT=0, all pass (the existing 11.7 cases prove the include refactor kept its answers).

- [ ] **Step 5: Mutation check**

`cp src/filter/matches-filter.ts $S/mf.bak`. Delete the line `if (excludedBy(exclude.typeIds, state.typeId)) return false;` → run → the "type, state, state category and project" case and the "composes" case must fail. `cp $S/mf.bak src/filter/matches-filter.ts`; `cmp` to confirm.

- [ ] **Step 6: Record and commit**

test-cases entry:

```
- **13.539** ✅ `matchesFilter` honours `exclude` on all six id axes, after the include half; empty
  exclude lists exclude nothing; unassigned work survives an assignee exclusion; include+exclude on one
  axis = must match an include and none of the excludes. Mutation (the `typeIds` exclude line deleted)
  kills the type case and the composition case.
```

```bash
git add packages/app-core/src/filter/matches-filter.ts packages/app-core/test/filter/matches-filter.test.ts test-cases/13-deployment-dogfooding.md
git commit -m "matchesFilter honours the exclude half on every id axis (13.539)"
```

---

### Task 3: `BoardFilterSpec` reshaped; `matchesBoardCard` honours `exclude`

**Files:**
- Modify: `packages/app-core/src/filter/board-filter.ts`
- Test: `packages/app-core/test/filter/board-filter.test.ts`

**Interfaces:**
- Consumes: `IdAxes`, `FilterSpec` from `../view-types.js`; `narrowsTo`, `excludedBy` from `./id-axes.js`.
- Produces: `type BoardIdAxes = Pick<IdAxes, 'assigneeIds' | 'typeIds' | 'stateIds' | 'stateCategories' | 'projectIds'>` (exported); `BoardFilterSpec = Pick<FilterSpec, 'text'> & BoardIdAxes & { exclude?: BoardIdAxes }`; `matchesBoardCard(card, column, projectId, spec)` unchanged signature.

- [ ] **Step 1: Write the failing tests**

In `packages/app-core/test/filter/board-filter.test.ts`, extend the `cases` array inside `13.433` with exclude cases (the `card` is assigned to `u1`, type `task`, in column `s-doing`/`active`, project `p1`):

```ts
    ['excluded assignee', { exclude: { assigneeIds: ['u1'] } }],
    ['excluded other assignee', { exclude: { assigneeIds: ['u2'] } }],
    ['excluded type', { exclude: { typeIds: ['task'] } }],
    ['excluded state', { exclude: { stateIds: ['s-doing'] } }],
    ['excluded category', { exclude: { stateCategories: ['active'] } }],
    ['excluded project', { exclude: { projectIds: ['p1'] } }],
    ['included and excluded on one axis', { assigneeIds: ['u1'], exclude: { assigneeIds: ['u1'] } }],
    ['included here, excluded elsewhere', { assigneeIds: ['u1'], exclude: { typeIds: ['bug'] } }],
```

Then add after the `13.434` describe:

```ts
describe('13.540 the exclude half is unrepresentable for the axis the board cannot answer', () => {
  it('rejects exclude.collaboratorIds at compile time — a BoardCard has no collaborators to exclude on', () => {
    // @ts-expect-error `collaboratorIds` is not in BoardIdAxes; `excludedBy` would answer
    // `false` (never out) and silently WIDEN the board past what the person asked for.
    const spec: BoardFilterSpec = { exclude: { collaboratorIds: ['u9'] } };
    expect(spec).toBeDefined();
  });
});

/** 13.541 — the corpus's exclude cases contain a rejection, so agreement on them is not vacuous. */
describe('13.541 the exclude corpus rejects something', () => {
  it('at least one exclude case is a rejection on the board side', () => {
    expect(matchesBoardCard(card, column, 'p1', { exclude: { typeIds: ['task'] } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run test/filter/board-filter.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E '×|Tests |error' $S/t.log`
Expected: EXIT=1 — the exclude agreement cases fail (`matchesFilter` now says `false`, `matchesBoardCard` still says `true`), and `13.541` fails. (`13.540` may report an unused `@ts-expect-error` under `typecheck`; that is expected until Step 3 — vitest itself does not typecheck.)

- [ ] **Step 3: Implement**

Replace the type and function in `packages/app-core/src/filter/board-filter.ts` (keep the module docblock, amending its first paragraph to say "derived from `IdAxes`/`FilterSpec` with `Pick` — for BOTH halves since 2026-09-17"):

```ts
import type { BoardCard, BoardColumn, FilterSpec, IdAxes } from '../view-types.js';
import { excludedBy, narrowsTo } from './id-axes.js';

/** The five id axes a `BoardCard` can answer — no collaborators (see the docblock above). */
export type BoardIdAxes = Pick<
  IdAxes,
  'assigneeIds' | 'typeIds' | 'stateIds' | 'stateCategories' | 'projectIds'
>;

/**
 * The axes a BOARD can answer, in BOTH halves. `exclude` is `BoardIdAxes` too:
 * an `exclude.collaboratorIds` handed to a card with no collaborators would
 * be `excludedBy(list, [])` — never out — and so would silently WIDEN the
 * board past what the person asked for, the mirror image of the fail-CLOSED
 * hazard the include half's docblock describes. Unrepresentable, so it is a
 * compile error instead; `page.tsx` drops it when it builds `boardFilter`
 * and `describeUnappliedBoardAxes` discloses it.
 */
export type BoardFilterSpec = Pick<FilterSpec, 'text'> & BoardIdAxes & { exclude?: BoardIdAxes };

export function matchesBoardCard(
  card: BoardCard,
  column: BoardColumn,
  projectId: string,
  spec: BoardFilterSpec,
): boolean {
  const assigneeId = card.assignee?.id ?? null;
  if (!narrowsTo(spec.assigneeIds, assigneeId)) return false;
  if (!narrowsTo(spec.typeIds, card.typeId)) return false;
  if (!narrowsTo(spec.stateIds, column.stateId)) return false;
  if (!narrowsTo(spec.stateCategories, column.category)) return false;
  if (!narrowsTo(spec.projectIds, projectId)) return false;
  if (spec.text !== undefined && spec.text.trim() !== '') {
    if (!card.title.toLowerCase().includes(spec.text.trim().toLowerCase())) return false;
  }
  const exclude = spec.exclude ?? {};
  if (excludedBy(exclude.assigneeIds, assigneeId)) return false;
  if (excludedBy(exclude.typeIds, card.typeId)) return false;
  if (excludedBy(exclude.stateIds, column.stateId)) return false;
  if (excludedBy(exclude.stateCategories, column.category)) return false;
  if (excludedBy(exclude.projectIds, projectId)) return false;
  return true;
}
```

- [ ] **Step 4: Run to verify GREEN, then typecheck (the `@ts-expect-error` lines must be USED)**

Run: `pnpm exec vitest run test/filter/ > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Tests ' $S/t.log` — Expected: EXIT=0.
Run: `pnpm run typecheck > $S/tc.log 2>&1; echo EXIT=$?` — Expected: EXIT=0.

- [ ] **Step 5: Mutation check**

Back up; delete `if (excludedBy(exclude.stateIds, column.stateId)) return false;` → the `excluded state` agreement case fails; restore; `cmp`.

- [ ] **Step 6: Record and commit**

```
- **13.540** ✅ `BoardFilterSpec.exclude` is `BoardIdAxes` — `exclude.collaboratorIds` is a compile error
  (it would silently WIDEN the board: `excludedBy(list, [])` is never out).
- **13.541** ✅ `13.433`'s agreement corpus extended with eight exclude cases and a rejection control;
  mutation (the `stateIds` exclude line deleted) kills the `excluded state` case.
```

```bash
git add packages/app-core/src/filter/board-filter.ts packages/app-core/test/filter/board-filter.test.ts test-cases/13-deployment-dogfooding.md
git commit -m "matchesBoardCard honours the exclude half; BoardFilterSpec picks both halves (13.540-13.541)"
```

---

### Task 4: `matchesListRow` and `ListFilterSpec`

**Files:**
- Create: `packages/app-core/src/filter/list-filter.ts`
- Modify: `packages/app-core/src/index.ts:153-158` (add the export beside `matchesBoardCard`)
- Test: `packages/app-core/test/filter/list-filter.test.ts` (new)

**Interfaces:**
- Consumes: `ListRow`, `FilterSpec`, `IdAxes` from `../view-types.js`; `BoardIdAxes` from `./board-filter.js`; `claimText`, `excludedBy`, `narrowsTo` from `./id-axes.js`.
- Produces: `type ListFilterSpec = Pick<FilterSpec, 'text' | 'dueBefore' | 'dueAfter' | 'fields'> & BoardIdAxes & { exclude?: BoardIdAxes }`; `matchesListRow(row: ListRow, projectId: string, spec: ListFilterSpec): boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/app-core/test/filter/list-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FieldClaim, TicketState } from '@gisik-nokma/domain';
import { matchesFilter } from '../../src/filter/matches-filter.js';
import { matchesListRow, type ListFilterSpec } from '../../src/filter/list-filter.js';
import type { ListRow } from '../../src/view-types.js';

function claim(value: unknown): FieldClaim {
  return { value, actorId: 'u1', clientTime: '', serverTime: '' };
}
const provenance = { actorId: 'u1', actorName: 'Ada', clientTime: '', serverTime: '' };

/** The same ticket as the list renders it — every axis a ListRow can answer is populated. */
const row: ListRow = {
  ticketId: 't1', title: 'Ship the board', typeId: 'task', typeRank: 3,
  parentId: null, epicId: null,
  stateId: 's-doing', stateName: 'Doing', stateCategory: 'active',
  stateProvenance: provenance,
  assignee: { id: 'u1', name: 'Ada' }, assignedProvenance: provenance,
  dueDate: { date: '2026-09-20', claim: provenance },
  fields: { title: claim('Ship the board'), amount: claim(4200), priority: claim('high') },
  rollup: null, hasRestrictedParent: false, pending: false,
};

/** …and as `matchesFilter` sees it. */
const equivalent: TicketState = {
  kind: 'ticket', id: 't1', workspaceId: 'w1', projectId: 'p1', typeId: 'task',
  parentId: null, workflowId: 'wf1', workflowVersion: 1,
  stateId: 's-doing', stateCategory: 'active',
  assigneeId: 'u1', collaboratorIds: [],
  fields: {
    title: claim('Ship the board'),
    dueDate: claim({ date: '2026-09-20' }),
    amount: claim(4200),
    priority: claim('high'),
  },
  transitions: [],
};

/**
 * 13.542 — the list predicate agrees with `matchesFilter` on every axis it
 * serves (exclude-mode spec §2), including the two the board cannot answer —
 * due bounds and field clauses — and the exclude half.
 */
describe('13.542 matchesListRow agrees with matchesFilter on every axis it serves', () => {
  const cases: Array<[string, ListFilterSpec]> = [
    ['empty spec', {}],
    ['matching assignee', { assigneeIds: ['u1'] }],
    ['non-matching assignee', { assigneeIds: ['u2'] }],
    ['matching type', { typeIds: ['task'] }],
    ['non-matching type', { typeIds: ['bug'] }],
    ['matching state', { stateIds: ['s-doing'] }],
    ['non-matching state', { stateIds: ['s-done'] }],
    ['matching category', { stateCategories: ['active'] }],
    ['non-matching category', { stateCategories: ['terminal'] }],
    ['matching project', { projectIds: ['p1'] }],
    ['non-matching project', { projectIds: ['p2'] }],
    ['matching text', { text: 'board' }],
    ['non-matching text', { text: 'zzz' }],
    ['dueBefore inclusive, on the day', { dueBefore: '2026-09-20' }],
    ['dueBefore, too early', { dueBefore: '2026-09-19' }],
    ['dueAfter inclusive, on the day', { dueAfter: '2026-09-20' }],
    ['dueAfter, too late', { dueAfter: '2026-09-21' }],
    ['field clause, string match', { fields: { priority: 'high' } }],
    ['field clause, number rendered as text', { fields: { amount: '4200' } }],
    ['field clause, mismatch', { fields: { priority: 'low' } }],
    ['field clause, unknown field', { fields: { nope: 'x' } }],
    ['excluded assignee', { exclude: { assigneeIds: ['u1'] } }],
    ['excluded other assignee', { exclude: { assigneeIds: ['u2'] } }],
    ['excluded type', { exclude: { typeIds: ['task'] } }],
    ['excluded state', { exclude: { stateIds: ['s-doing'] } }],
    ['excluded category', { exclude: { stateCategories: ['active'] } }],
    ['excluded project', { exclude: { projectIds: ['p1'] } }],
    ['included and excluded on one axis', { assigneeIds: ['u1'], exclude: { assigneeIds: ['u1'] } }],
  ];

  for (const [name, spec] of cases) {
    it(`${name}: both sides decide alike`, () => {
      expect(matchesListRow(row, 'p1', spec)).toBe(matchesFilter(equivalent, spec));
    });
  }

  it('the corpus contains a rejection, so agreement is not vacuous', () => {
    const anyRejected = cases.some(([, spec]) => !matchesListRow(row, 'p1', spec));
    expect(anyRejected, 'every case matched — the agreement proves nothing').toBe(true);
  });

  it('an undated row is excluded by a due bound, as the server would exclude SQL NULL', () => {
    const undated: ListRow = { ...row, dueDate: null };
    expect(matchesListRow(undated, 'p1', { dueBefore: '2026-12-31' })).toBe(false);
    expect(matchesListRow(undated, 'p1', { dueAfter: '2026-01-01' })).toBe(false);
    expect(matchesListRow(undated, 'p1', {})).toBe(true);
  });

  it('an unassigned row never matches an assignee include and is never out on an assignee exclude', () => {
    const unassigned: ListRow = { ...row, assignee: null };
    expect(matchesListRow(unassigned, 'p1', { assigneeIds: ['u1'] })).toBe(false);
    expect(matchesListRow(unassigned, 'p1', { exclude: { assigneeIds: ['u1'] } })).toBe(true);
  });
});

describe('13.543 the axis a ListRow cannot answer is unrepresentable in both halves', () => {
  it('rejects collaboratorIds at compile time', () => {
    // @ts-expect-error a ListRow carries no collaborators.
    const spec: ListFilterSpec = { collaboratorIds: ['u9'] };
    expect(spec).toBeDefined();
  });
  it('rejects exclude.collaboratorIds at compile time', () => {
    // @ts-expect-error same axis, exclude half.
    const spec: ListFilterSpec = { exclude: { collaboratorIds: ['u9'] } };
    expect(spec).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run test/filter/list-filter.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Error|Tests ' $S/t.log` — Expected: EXIT=1, `Failed to resolve import "../../src/filter/list-filter.js"`.

- [ ] **Step 3: Create `filter/list-filter.ts`**

```ts
import type { FilterSpec, ListRow } from '../view-types.js';
import type { BoardIdAxes } from './board-filter.js';
import { claimText, excludedBy, narrowsTo } from './id-axes.js';

/**
 * The axes a LIST ROW can answer (exclude-mode spec §2, 2026-09-17) — every
 * `FilterSpec` axis but collaborators, in both halves. `ListRow`
 * (`view-types.ts`) carries `assignee`, `typeId`, `stateId`, `stateCategory`,
 * `title`, a claimed `dueDate` and its `fields`, so unlike a `BoardCard` it
 * can answer the due bounds and the field clauses too; it carries no
 * collaborators, so that one axis is a compile error here, for the same
 * reason `board-filter.ts` gives: an unanswerable axis must not become a
 * wrong answer on screen. `page.tsx` drops it when it builds `listFilterSpec`
 * and `describeUnappliedListAxes` discloses it.
 *
 * `BoardIdAxes` is reused rather than re-declared: a list row answers
 * exactly the five id axes a board card does, and a second `Pick` naming the
 * same five would be one more list to keep in step.
 */
export type ListFilterSpec = Pick<FilterSpec, 'text' | 'dueBefore' | 'dueAfter' | 'fields'> &
  BoardIdAxes & { exclude?: BoardIdAxes };

/**
 * Semantics are `matchesFilter`'s, axis for axis — the same base rules from
 * `id-axes.ts`, the same titles-only text divergence, the same inclusive due
 * bounds with an undated row excluded (SQL NULL parity), the same `eq`-only
 * field clauses through `claimText`. `list-filter.test.ts` asserts the
 * agreement over one ticket rendered both ways rather than trusting this
 * note.
 */
export function matchesListRow(row: ListRow, projectId: string, spec: ListFilterSpec): boolean {
  const assigneeId = row.assignee?.id ?? null;
  if (!narrowsTo(spec.assigneeIds, assigneeId)) return false;
  if (!narrowsTo(spec.typeIds, row.typeId)) return false;
  if (!narrowsTo(spec.stateIds, row.stateId)) return false;
  if (!narrowsTo(spec.stateCategories, row.stateCategory)) return false;
  if (!narrowsTo(spec.projectIds, projectId)) return false;
  if (spec.text !== undefined && spec.text.trim() !== '') {
    if (!row.title.toLowerCase().includes(spec.text.trim().toLowerCase())) return false;
  }
  const dueDay = row.dueDate?.date ?? null;
  if (spec.dueBefore !== undefined && (dueDay === null || dueDay > spec.dueBefore)) return false;
  if (spec.dueAfter !== undefined && (dueDay === null || dueDay < spec.dueAfter)) return false;
  for (const [fieldId, wanted] of Object.entries(spec.fields ?? {})) {
    if (claimText(row.fields[fieldId]?.value) !== wanted) return false;
  }
  const exclude = spec.exclude ?? {};
  if (excludedBy(exclude.assigneeIds, assigneeId)) return false;
  if (excludedBy(exclude.typeIds, row.typeId)) return false;
  if (excludedBy(exclude.stateIds, row.stateId)) return false;
  if (excludedBy(exclude.stateCategories, row.stateCategory)) return false;
  if (excludedBy(exclude.projectIds, projectId)) return false;
  return true;
}
```

In `packages/app-core/src/index.ts`, directly after the line `export { matchesBoardCard, type BoardFilterSpec } from './filter/board-filter.js';` add:

```ts
// Exclude-mode spec §2 (2026-09-17): the list-row predicate, beside the board's.
export { matchesListRow, type ListFilterSpec } from './filter/list-filter.js';
```

- [ ] **Step 4: Run GREEN + typecheck**

Run: `pnpm exec vitest run test/filter/ > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Tests ' $S/t.log` — Expected: EXIT=0.
Run: `pnpm run typecheck > $S/tc.log 2>&1; echo EXIT=$?` — Expected: EXIT=0.

- [ ] **Step 5: Mutation checks (two)**

Back up. (a) Delete `if (spec.dueAfter !== undefined && …) return false;` → `dueAfter, too late` fails. Restore. (b) Delete `if (excludedBy(exclude.projectIds, projectId)) return false;` → `excluded project` fails. Restore; `cmp`.

- [ ] **Step 6: Record and commit**

```
- **13.542** ✅ `matchesListRow` agrees with `matchesFilter` over one ticket rendered as a `ListRow` on 28
  cases spanning every axis it serves — the five id axes, text, both due bounds (inclusive; undated
  excluded), field clauses (string, number-as-text, mismatch, unknown) and the exclude half — with a
  rejection control. Mutations: `dueAfter` line → its case fails; `projectIds` exclude line → its case fails.
- **13.543** ✅ `ListFilterSpec` rejects `collaboratorIds` in both halves at compile time.
```

```bash
git add packages/app-core/src/filter/list-filter.ts packages/app-core/src/index.ts packages/app-core/test/filter/list-filter.test.ts test-cases/13-deployment-dogfooding.md
git commit -m "matchesListRow: the list-row predicate, in agreement with matchesFilter on every axis it serves (13.542-13.543)"
```

---

### Task 5: `toServerFilterSpec` refuses a non-empty `exclude`

**Files:**
- Modify: `packages/app-core/src/online/mappers.ts:836-847` (`toServerFilterSpec`)
- Test: `packages/app-core/test/online/mappers.test.ts` (the `3.38` describe block, ~line 734)

**Interfaces:**
- Produces: unchanged signature; throws `UnexpressibleFilterError('exclude', …)` when any exclude axis is non-empty.

- [ ] **Step 1: Write the failing tests**

Inside the `describe('3.38 toServerFilterSpec — …')` block in `mappers.test.ts`, after the existing multi-assignee case, add:

```ts
  /** 13.544 — the wire has no negation term (exclude-mode spec §2); a dropped exclusion would answer a different question under the user's label. */
  it('13.544 THROWS on a non-empty exclude, naming the key and the axes', () => {
    expect(() =>
      toServerFilterSpec({ exclude: { assigneeIds: [ANSELMA], typeIds: ['bug'] } }),
    ).toThrow(UnexpressibleFilterError);
    expect(() => toServerFilterSpec({ exclude: { typeIds: ['bug'] } })).toThrow(
      /filter key exclude .*no negation term.*typeIds/,
    );
  });

  it('13.544 does NOT throw on an empty exclude object or on empty exclude lists — they exclude nothing', () => {
    expect(toServerFilterSpec({ text: 'gst', exclude: {} })).toEqual({ text: 'gst', fields: [] });
    expect(toServerFilterSpec({ text: 'gst', exclude: { typeIds: [] } })).toEqual({ text: 'gst', fields: [] });
  });
```

(If the existing one-element case's expected `fields` shape differs from `[]` for an absent `fields`, copy whatever that test expects for an absent `fields` — read the test at `~line 735-751` first and match it.)

- [ ] **Step 2: Run to verify RED**

Run: `pnpm exec vitest run test/online/mappers.test.ts -t '13.544' > $S/t.log 2>&1; echo EXIT=$?; grep -E '×|Tests ' $S/t.log` — Expected: EXIT=1; the THROWS case fails (nothing thrown), the empty case passes.

- [ ] **Step 3: Implement**

In `toServerFilterSpec`, immediately after `const spec: Record<string, unknown> = {};` add:

```ts
  // Exclude-mode spec §2 (2026-09-17): `filterSpecSchema` has no negation term,
  // so an exclude half cannot be sent. Refused, not dropped — the identical
  // reasoning as the plural refusal below. Empty lists and an empty object
  // exclude nothing and are not refused.
  const exclude = filter.exclude ?? {};
  const excludedAxes = (Object.keys(exclude) as (keyof IdAxes)[]).filter(
    (axis) => (exclude[axis]?.length ?? 0) > 0,
  );
  if (excludedAxes.length > 0) {
    throw new UnexpressibleFilterError(
      'exclude',
      `filterSpecSchema has no negation term, and this filter excludes on ${excludedAxes.join(', ')}`,
    );
  }
```

Add `IdAxes` to the `view-types` type import at the top of `mappers.ts` (find the existing `import type { … FilterSpec … } from '../view-types.js'` line and add `IdAxes`).

- [ ] **Step 4: Run GREEN + typecheck**

Run: `pnpm exec vitest run test/online/mappers.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Tests ' $S/t.log` — Expected: EXIT=0. `pnpm run typecheck` — EXIT=0.

- [ ] **Step 5: Record and commit**

```
- **13.544** ✅ `toServerFilterSpec` throws `UnexpressibleFilterError('exclude', …)` naming the axes on any
  non-empty exclude; an empty object or empty lists pass through unrefused.
```

```bash
git add packages/app-core/src/online/mappers.ts packages/app-core/test/online/mappers.test.ts test-cases/13-deployment-dogfooding.md
git commit -m "toServerFilterSpec refuses a non-empty exclude — the wire has no negation term (13.544)"
```

---

### Task 6: `filter-edits.ts`, exclude chips, list unapplied axes, the renamed gate

**Files:**
- Create: `apps/web/src/filter-edits.ts`
- Modify: `apps/web/src/board-search-scope.ts`
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — ONLY the import block (`:28-32`) and the three call sites of the renamed functions (`buildBoardFilterChips` at `~:622`, `shouldRenderBoardNarrowingStrip` at `~:1130`, plus the docblock mentions you touch)
- Tests: `apps/web/test/filter-edits.test.ts` (new), `apps/web/test/board-search-scope.test.ts`

**Interfaces:**
- Produces:
  - `withIdAxis<K extends keyof IdAxes>(filter: FilterSpec, half: 'include' | 'exclude', axis: K, values: IdAxes[K] | undefined): FilterSpec` — sets one axis of one half; `[]` collapses to `undefined`; an `exclude` object left with no defined axis collapses to `undefined`.
  - `buildFilterChips(spec: BoardFilterSpec, resolvers: BoardFilterChipResolvers, setFilter): BoardFilterChip[]` (renamed from `buildBoardFilterChips`), with `BoardFilterChip` gaining `mode: 'include' | 'exclude'`; exclude chips keyed `exclude.<axis>` and labelled `Not <axis word>: …`, emitted directly after their axis's include chip.
  - `describeUnappliedListAxes(filter: FilterSpec): string[]` — `['collaborator']` when either half sets collaborators, else `[]`.
  - `describeUnappliedBoardAxes` — also names `collaborator` for `exclude.collaboratorIds`.
  - `shouldRenderNarrowingStrip(params)` (renamed from `shouldRenderBoardNarrowingStrip`, same body).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/filter-edits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '@gisik-nokma/app-core';
import { withIdAxis } from '../src/filter-edits.js';

/** 13.545 — the one place either half of one axis is written, with the collapse rule (exclude-mode spec §4). */
describe('13.545 withIdAxis writes one axis of one half and collapses emptiness', () => {
  it('sets an include axis and leaves the rest of the filter untouched', () => {
    const next = withIdAxis({ text: 'gst', typeIds: ['task'] }, 'include', 'assigneeIds', ['u1']);
    expect(next).toEqual({ text: 'gst', typeIds: ['task'], assigneeIds: ['u1'] });
  });

  it('sets an exclude axis, creating the exclude half when absent', () => {
    expect(withIdAxis({ text: 'gst' }, 'exclude', 'assigneeIds', ['u2'])).toEqual({
      text: 'gst',
      exclude: { assigneeIds: ['u2'] },
    });
  });

  it('an empty list collapses to undefined on either half', () => {
    expect(withIdAxis({ assigneeIds: ['u1'] }, 'include', 'assigneeIds', [])).toEqual({ assigneeIds: undefined });
    expect(withIdAxis({ exclude: { assigneeIds: ['u2'], typeIds: ['bug'] } }, 'exclude', 'assigneeIds', [])).toEqual({
      exclude: { assigneeIds: undefined, typeIds: ['bug'] },
    });
  });

  it('an exclude half left with no defined axis collapses to undefined — indistinguishable from never touched', () => {
    expect(withIdAxis({ text: 'gst', exclude: { typeIds: ['bug'] } }, 'exclude', 'typeIds', undefined)).toEqual({
      text: 'gst',
      exclude: undefined,
    });
  });

  it('is pure — the input is not mutated', () => {
    const input: FilterSpec = { exclude: { typeIds: ['bug'] } };
    withIdAxis(input, 'exclude', 'typeIds', ['task']);
    expect(input).toEqual({ exclude: { typeIds: ['bug'] } });
  });
});
```

In `apps/web/test/board-search-scope.test.ts`: change the import to `buildFilterChips, describeUnappliedBoardAxes, describeUnappliedListAxes, shouldRenderNarrowingStrip` and replace every `buildBoardFilterChips(` with `buildFilterChips(` and every `shouldRenderBoardNarrowingStrip(` with `shouldRenderNarrowingStrip(`. Then append:

```ts
/** 13.546 — the exclude half's chips (exclude-mode spec §2/§4): one per axis set, "Not …", removable by half. */
describe('13.546 buildFilterChips emits a "Not …" chip for each exclude axis, beside its include chip', () => {
  it('labels and keys every exclude axis, directly after the same axis\'s include chip', () => {
    const chips = buildFilterChips(
      {
        assigneeIds: ['u1'],
        exclude: { assigneeIds: ['u_unknown'], typeIds: ['task'], stateIds: ['doing'], stateCategories: ['terminal'], projectIds: ['p_1', 'p_2'] },
      },
      RESOLVERS,
      vi.fn(),
    );
    expect(chips.map((chip) => chip.key)).toEqual([
      'assigneeIds',
      'exclude.assigneeIds',
      'exclude.typeIds',
      'exclude.stateIds',
      'exclude.stateCategories',
      'exclude.projectIds',
    ]);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Assignee: Ada',
      'Not assignee: u_unknown',
      'Not type: Task',
      'Not state: Doing',
      'Not category: Terminal',
      'Not project: 2 selected',
    ]);
    expect(chips.map((chip) => chip.mode)).toEqual(['include', 'exclude', 'exclude', 'exclude', 'exclude', 'exclude']);
  });

  it('an exclude chip\'s onRemove clears ONLY that exclude axis — the include half of the same axis survives', () => {
    const setFilter = vi.fn();
    const chips = buildFilterChips({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'], typeIds: ['task'] } }, RESOLVERS, setFilter);
    chips.find((chip) => chip.key === 'exclude.assigneeIds')?.onRemove();
    const updater = setFilter.mock.calls[0]?.[0] as (current: FilterSpec) => FilterSpec;
    expect(updater({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'], typeIds: ['task'] } })).toEqual({
      assigneeIds: ['u1'],
      exclude: { assigneeIds: undefined, typeIds: ['task'] },
    });
  });

  it('removing the last exclude axis collapses the exclude half to undefined', () => {
    const setFilter = vi.fn();
    const chips = buildFilterChips({ exclude: { typeIds: ['task'] } }, RESOLVERS, setFilter);
    chips[0]?.onRemove();
    const updater = setFilter.mock.calls[0]?.[0] as (current: FilterSpec) => FilterSpec;
    expect(updater({ text: 'x', exclude: { typeIds: ['task'] } })).toEqual({ text: 'x', exclude: undefined });
  });

  it('an include chip\'s onRemove leaves the exclude half of the same axis alone', () => {
    const setFilter = vi.fn();
    const chips = buildFilterChips({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'] } }, RESOLVERS, setFilter);
    chips.find((chip) => chip.key === 'assigneeIds')?.onRemove();
    const updater = setFilter.mock.calls[0]?.[0] as (current: FilterSpec) => FilterSpec;
    expect(updater({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'] } })).toEqual({
      assigneeIds: undefined,
      exclude: { assigneeIds: ['u2'] },
    });
  });

  it('empty exclude lists earn no chip', () => {
    expect(buildFilterChips({ exclude: { typeIds: [] } }, RESOLVERS, vi.fn())).toEqual([]);
  });
});

/** 13.547 — the axes each tab cannot evaluate, in both halves. */
describe('13.547 unapplied axes name the exclude half too, per tab', () => {
  it('the board discloses exclude.collaboratorIds as "collaborator", once, even when the include half sets it too', () => {
    expect(describeUnappliedBoardAxes({ exclude: { collaboratorIds: ['u9'] } })).toEqual(['collaborator']);
    expect(describeUnappliedBoardAxes({ collaboratorIds: ['u1'], exclude: { collaboratorIds: ['u9'] } })).toEqual(['collaborator']);
    expect(describeUnappliedBoardAxes({ exclude: { collaboratorIds: [] } })).toEqual([]);
  });

  it('the list discloses only collaborator — it answers due dates and fields itself', () => {
    expect(describeUnappliedListAxes({})).toEqual([]);
    expect(describeUnappliedListAxes({ collaboratorIds: ['u1'] })).toEqual(['collaborator']);
    expect(describeUnappliedListAxes({ exclude: { collaboratorIds: ['u9'] } })).toEqual(['collaborator']);
    expect(describeUnappliedListAxes({ dueBefore: '2026-09-30', fields: { priority: 'high' } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `cd apps/web && pnpm exec vitest run test/filter-edits.test.ts test/board-search-scope.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Error|×|Tests ' $S/t.log | head -12` — Expected: EXIT=1; `filter-edits` fails to resolve; `board-search-scope` fails on the renamed imports (`buildFilterChips is not a function` or a resolve error).

- [ ] **Step 3: Create `apps/web/src/filter-edits.ts`**

```ts
import type { FilterSpec, IdAxes } from '@gisik-nokma/app-core';

/**
 * THE ONE PLACE either half of one id axis is written (exclude-mode spec §4).
 * `board-search-scope.ts`'s chip removals and `filter-cycle.ts`'s cycler both
 * go through here, so the collapse rule lives once: an empty list collapses
 * to `undefined` (the `toggledArray` convention `page.tsx` set — a fully
 * deselected axis is indistinguishable from one never touched), and an
 * `exclude` object left with no defined axis collapses to `undefined` for the
 * same reason, so `{}` and `{ typeIds: undefined }` never linger as
 * false-positive "something is set" shapes for a chip builder or a clear-all
 * test to trip on.
 */
export function withIdAxis<K extends keyof IdAxes>(
  filter: FilterSpec,
  half: 'include' | 'exclude',
  axis: K,
  values: IdAxes[K] | undefined,
): FilterSpec {
  const value = values === undefined || values.length === 0 ? undefined : values;
  if (half === 'include') return { ...filter, [axis]: value };
  const exclude: IdAxes = { ...(filter.exclude ?? {}), [axis]: value };
  const anyDefined = (Object.keys(exclude) as (keyof IdAxes)[]).some((key) => exclude[key] !== undefined);
  return { ...filter, exclude: anyDefined ? exclude : undefined };
}
```

- [ ] **Step 4: Rework `apps/web/src/board-search-scope.ts`**

Change the import to `import type { BoardFilterSpec, FilterSpec, IdAxes } from '@gisik-nokma/app-core'; import { withIdAxis } from './filter-edits.js';`.

In `describeUnappliedBoardAxes`, replace the collaborator check with:

```ts
  if (collaboratorsSet(filter)) axes.push('collaborator');
```

and add, above it, the shared predicate plus the list variant:

```ts
/** Either half naming collaborators — the one axis neither a BoardCard nor a ListRow can answer. */
function collaboratorsSet(filter: FilterSpec): boolean {
  const include = filter.collaboratorIds ?? [];
  const exclude = filter.exclude?.collaboratorIds ?? [];
  return include.length > 0 || exclude.length > 0;
}

/**
 * The axes a LIST ROW cannot evaluate (exclude-mode spec §2): only
 * collaborators, in either half — `matchesListRow` answers due bounds and
 * field clauses itself, so unlike `describeUnappliedBoardAxes` there is
 * nothing else to disclose. Same fixed order discipline: one possible entry.
 */
export function describeUnappliedListAxes(filter: FilterSpec): string[] {
  return collaboratorsSet(filter) ? ['collaborator'] : [];
}
```

Change the chip type and builder:

```ts
export type BoardFilterChip = {
  key: string;
  label: string;
  /** Which half the chip names — the strip prefixes exclude chips with the ⊘ glyph (spec §4). */
  mode: 'include' | 'exclude';
  onRemove: () => void;
};
```

Rename `buildBoardFilterChips` → `buildFilterChips`, parameter `boardFilter` → `spec`, keep every existing include chip but give each `mode: 'include'`, and after EACH id-axis include chip push its exclude counterpart. Concretely, replace the body after `const clear = …` with:

```ts
  const clearExclude = (axis: keyof IdAxes) => () =>
    setFilter((current) => withIdAxis(current, 'exclude', axis, undefined));
  const exclude = spec.exclude ?? {};
  const has = (list: readonly unknown[] | undefined): list is readonly unknown[] & { length: number } =>
    list !== undefined && list.length > 0;

  const text = spec.text?.trim();
  if (text !== undefined && text !== '') {
    chips.push({ key: 'text', label: `Search: "${text}"`, mode: 'include', onRemove: clear({ text: undefined }) });
  }
  if (has(spec.assigneeIds)) {
    chips.push({ key: 'assigneeIds', label: `Assignee: ${spec.assigneeIds.map(resolvers.assigneeName).join(', ')}`, mode: 'include', onRemove: clear({ assigneeIds: undefined }) });
  }
  if (has(exclude.assigneeIds)) {
    chips.push({ key: 'exclude.assigneeIds', label: `Not assignee: ${exclude.assigneeIds.map(resolvers.assigneeName).join(', ')}`, mode: 'exclude', onRemove: clearExclude('assigneeIds') });
  }
  if (has(spec.typeIds)) {
    chips.push({ key: 'typeIds', label: `Type: ${spec.typeIds.map(resolvers.typeName).join(', ')}`, mode: 'include', onRemove: clear({ typeIds: undefined }) });
  }
  if (has(exclude.typeIds)) {
    chips.push({ key: 'exclude.typeIds', label: `Not type: ${exclude.typeIds.map(resolvers.typeName).join(', ')}`, mode: 'exclude', onRemove: clearExclude('typeIds') });
  }
  if (has(spec.stateIds)) {
    chips.push({ key: 'stateIds', label: `State: ${spec.stateIds.map(resolvers.stateName).join(', ')}`, mode: 'include', onRemove: clear({ stateIds: undefined }) });
  }
  if (has(exclude.stateIds)) {
    chips.push({ key: 'exclude.stateIds', label: `Not state: ${exclude.stateIds.map(resolvers.stateName).join(', ')}`, mode: 'exclude', onRemove: clearExclude('stateIds') });
  }
  if (has(spec.stateCategories)) {
    chips.push({ key: 'stateCategories', label: `Category: ${spec.stateCategories.map(capitalizeWord).join(', ')}`, mode: 'include', onRemove: clear({ stateCategories: undefined }) });
  }
  if (has(exclude.stateCategories)) {
    chips.push({ key: 'exclude.stateCategories', label: `Not category: ${exclude.stateCategories.map(capitalizeWord).join(', ')}`, mode: 'exclude', onRemove: clearExclude('stateCategories') });
  }
  if (has(spec.projectIds)) {
    chips.push({ key: 'projectIds', label: `Project: ${spec.projectIds.length} selected`, mode: 'include', onRemove: clear({ projectIds: undefined }) });
  }
  if (has(exclude.projectIds)) {
    chips.push({ key: 'exclude.projectIds', label: `Not project: ${exclude.projectIds.length} selected`, mode: 'exclude', onRemove: clearExclude('projectIds') });
  }
  return chips;
```

(If TypeScript refuses the `has` type guard on the typed lists, drop the guard and use the plain `list !== undefined && list.length > 0` conditions with the existing non-null reads, exactly as the file does today.)

Rename `shouldRenderBoardNarrowingStrip` → `shouldRenderNarrowingStrip`; amend its docblock: "evaluated PER TAB since 2026-09-17 — the board with `boardNarrowing`'s count, the other tabs with `listNarrowing`'s (exclude-mode spec §3)". Update the `buildBoardFilterChips` docblock's first sentence to name the exclude chips and its new name.

- [ ] **Step 5: Re-point `page.tsx`'s imports and call sites**

In the import block (`:28-32`) rename `buildBoardFilterChips` → `buildFilterChips`, `shouldRenderBoardNarrowingStrip` → `shouldRenderNarrowingStrip`; add `describeUnappliedListAxes` (unused until Task 10 — add it in Task 10 instead if the lint config flags unused imports; check `pnpm run lint` or the typecheck's `noUnusedLocals`). Rename the two call sites. Nothing else in `page.tsx` changes in this task.

- [ ] **Step 6: Run GREEN + typecheck across `apps/web`**

Run: `pnpm exec vitest run test/filter-edits.test.ts test/board-search-scope.test.ts test/board-narrowing.test.tsx test/filters-sheet.test.tsx > $S/t.log 2>&1; echo EXIT=$?; grep -E 'Tests ' $S/t.log` — Expected: EXIT=0 (the page tests must still pass: behaviour is unchanged, only names).
Run: `pnpm run typecheck > $S/tc.log 2>&1; echo EXIT=$?` — EXIT=0.

- [ ] **Step 7: Mutation check**

Back up `board-search-scope.ts`; change `clearExclude` to `setFilter((current) => ({ ...current, exclude: undefined }))` → the "clears ONLY that exclude axis" case fails; restore; `cmp`.

- [ ] **Step 8: Record and commit**

```
- **13.545** ✅ `withIdAxis` (`apps/web/src/filter-edits.ts`) — the one writer of either half of one axis:
  empty list → `undefined`, an exclude half with no defined axis → `undefined`; pure.
- **13.546** ✅ `buildFilterChips` (renamed from `buildBoardFilterChips`) emits `exclude.<axis>` chips
  labelled "Not assignee/type/state/category/project: …" directly after each axis's include chip, with
  `mode`; an exclude chip's × clears only that half (the include half survives, and vice versa); the last
  exclude axis removed collapses `exclude`; empty lists earn no chip. Mutation (clearExclude clearing the
  whole half) kills the only-that-axis case.
- **13.547** ✅ `describeUnappliedBoardAxes` names collaborator for `exclude.collaboratorIds` (once);
  `describeUnappliedListAxes` names collaborator only — due dates and fields are answered by the list.
```

```bash
git add apps/web/src/filter-edits.ts apps/web/src/board-search-scope.ts "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx" apps/web/test/filter-edits.test.ts apps/web/test/board-search-scope.test.ts test-cases/13-deployment-dogfooding.md
git commit -m "Exclude chips, list unapplied axes, withIdAxis; the strip gate and chip builder renamed for every tab (13.545-13.547)"
```

---

### Task 7: `filter-cycle.ts` — `choiceMode`, `nextMode`, `withCycledId`

**Files:**
- Create: `apps/web/src/filter-cycle.ts`
- Test: `apps/web/test/filter-cycle.test.ts` (new)

**Interfaces:**
- Consumes: `withIdAxis` from `./filter-edits.js`.
- Produces: `type ChoiceMode = 'off' | 'include' | 'exclude'`; `choiceMode<K extends keyof IdAxes>(filter: FilterSpec, axis: K, value: IdAxisValue<K>): ChoiceMode`; `nextMode(mode: ChoiceMode): ChoiceMode`; `withCycledId<K>(filter, axis, value): FilterSpec`; helper type `IdAxisValue<K> = NonNullable<IdAxes[K]>[number]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '@gisik-nokma/app-core';
import { choiceMode, nextMode, withCycledId } from '../src/filter-cycle.js';

/** 13.548 — the tri-state cycle (exclude-mode spec §4): off → include → exclude → off. */
describe('13.548 choiceMode and nextMode', () => {
  it('reads the mode of one value on one axis from either half', () => {
    const filter: FilterSpec = { assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'] } };
    expect(choiceMode(filter, 'assigneeIds', 'u1')).toBe('include');
    expect(choiceMode(filter, 'assigneeIds', 'u2')).toBe('exclude');
    expect(choiceMode(filter, 'assigneeIds', 'u3')).toBe('off');
    expect(choiceMode({}, 'stateCategories', 'active')).toBe('off');
  });

  it('cycles off → include → exclude → off', () => {
    expect(nextMode('off')).toBe('include');
    expect(nextMode('include')).toBe('exclude');
    expect(nextMode('exclude')).toBe('off');
  });
});

/** 13.549 — one click moves the value between halves and never leaves it in both. */
describe('13.549 withCycledId', () => {
  it('off → include: adds to the include list', () => {
    expect(withCycledId({}, 'typeIds', 'bug')).toEqual({ typeIds: ['bug'] });
  });

  it('include → exclude: removes from include, adds to exclude', () => {
    expect(withCycledId({ typeIds: ['task', 'bug'] }, 'typeIds', 'bug')).toEqual({
      typeIds: ['task'],
      exclude: { typeIds: ['bug'] },
    });
  });

  it('exclude → off: removes from exclude and collapses what empties', () => {
    expect(withCycledId({ exclude: { typeIds: ['bug'] } }, 'typeIds', 'bug')).toEqual({
      exclude: undefined,
    });
    expect(withCycledId({ typeIds: ['task'], exclude: { typeIds: ['bug'] } }, 'typeIds', 'bug')).toEqual({
      typeIds: ['task'],
      exclude: undefined,
    });
  });

  it('a value the caller left in BOTH halves is treated as include and moves to exclude alone', () => {
    // The sheet never produces this shape; the cycler repairs it rather than preserving it.
    expect(withCycledId({ typeIds: ['bug'], exclude: { typeIds: ['bug'] } }, 'typeIds', 'bug')).toEqual({
      typeIds: undefined,
      exclude: { typeIds: ['bug'] },
    });
  });

  it('never leaves a value in both halves, over a full cycle of three clicks', () => {
    let filter: FilterSpec = { assigneeIds: ['u1'] };
    for (let i = 0; i < 3; i += 1) {
      filter = withCycledId(filter, 'assigneeIds', 'u9');
      const inInclude = filter.assigneeIds?.includes('u9') ?? false;
      const inExclude = filter.exclude?.assigneeIds?.includes('u9') ?? false;
      expect(inInclude && inExclude).toBe(false);
      expect(filter.assigneeIds?.includes('u1')).toBe(true);
    }
    expect(choiceMode(filter, 'assigneeIds', 'u9')).toBe('off');
  });

  it('works for the StateCategory-typed axis', () => {
    expect(withCycledId({ stateCategories: ['active'] }, 'stateCategories', 'active')).toEqual({
      stateCategories: undefined,
      exclude: { stateCategories: ['active'] },
    });
  });
});
```

- [ ] **Step 2: Run to verify RED** — `pnpm exec vitest run test/filter-cycle.test.ts` → resolve error, EXIT=1.

- [ ] **Step 3: Create `apps/web/src/filter-cycle.ts`**

```ts
import type { FilterSpec, IdAxes } from '@gisik-nokma/app-core';
import { withIdAxis } from './filter-edits.js';

/** off → include → exclude → off — the owner's own cycle (exclude-mode spec §4). */
export type ChoiceMode = 'off' | 'include' | 'exclude';

/** The element type of one id axis's list — `string`, or `StateCategory` for `stateCategories`. */
export type IdAxisValue<K extends keyof IdAxes> = NonNullable<IdAxes[K]>[number];

function listOf<K extends keyof IdAxes>(half: IdAxes | undefined, axis: K): readonly IdAxisValue<K>[] {
  return (half?.[axis] ?? []) as readonly IdAxisValue<K>[];
}

/** Which half, if either, holds this value on this axis. Include wins if a caller ever left it in both. */
export function choiceMode<K extends keyof IdAxes>(filter: FilterSpec, axis: K, value: IdAxisValue<K>): ChoiceMode {
  if (listOf(filter, axis).includes(value)) return 'include';
  if (listOf(filter.exclude, axis).includes(value)) return 'exclude';
  return 'off';
}

export function nextMode(mode: ChoiceMode): ChoiceMode {
  if (mode === 'off') return 'include';
  if (mode === 'include') return 'exclude';
  return 'off';
}

/**
 * One click on one value: removed from BOTH halves first, then added to the
 * half the next mode names (or neither, for `off`). Two `withIdAxis` writes
 * so the collapse rule is never restated here. Removing from both halves —
 * rather than only from the half the current mode reports — is what makes
 * "never in both" true even for a shape this cycler did not produce.
 */
export function withCycledId<K extends keyof IdAxes>(filter: FilterSpec, axis: K, value: IdAxisValue<K>): FilterSpec {
  const next = nextMode(choiceMode(filter, axis, value));
  const without = (list: readonly IdAxisValue<K>[]) => list.filter((item) => item !== value) as IdAxes[K];
  let result = withIdAxis(filter, 'include', axis, without(listOf(filter, axis)));
  result = withIdAxis(result, 'exclude', axis, without(listOf(filter.exclude, axis)));
  if (next === 'include') {
    result = withIdAxis(result, 'include', axis, [...listOf(result, axis), value] as IdAxes[K]);
  } else if (next === 'exclude') {
    result = withIdAxis(result, 'exclude', axis, [...listOf(result.exclude, axis), value] as IdAxes[K]);
  }
  return result;
}
```

- [ ] **Step 4: Run GREEN + typecheck** — `pnpm exec vitest run test/filter-cycle.test.ts` EXIT=0; `pnpm run typecheck` EXIT=0. If the `as IdAxes[K]` casts fail typecheck, widen `listOf`'s return to `readonly string[]` for the string axes and handle `stateCategories` through the same generic — the tests pin the behaviour, the casts are the only latitude.

- [ ] **Step 5: Mutation check** — back up; in `withCycledId` change the second `withIdAxis(result, 'exclude', …without…)` removal to a no-op (`result = result;`) → the "left in BOTH halves" case fails (`typeIds` still listed in exclude AND … — read the failure to confirm it is that case). Restore; `cmp`.

- [ ] **Step 6: Record and commit**

```
- **13.548** ✅ `choiceMode` reads a value's half (include wins if both); `nextMode` cycles off → include →
  exclude → off.
- **13.549** ✅ `withCycledId` moves a value between halves through `withIdAxis`, collapses what empties,
  repairs a both-halves shape, and over a full three-click cycle never leaves a value in both halves;
  works on the `StateCategory`-typed axis. Mutation (exclude-half removal skipped) kills the repair case.
```

```bash
git add apps/web/src/filter-cycle.ts apps/web/test/filter-cycle.test.ts test-cases/13-deployment-dogfooding.md
git commit -m "filter-cycle: the tri-state cycler, never a value in both halves (13.548-13.549)"
```

---

### Task 8: `TriStateChoice` button, its glyphs, and the CSS

**Files:**
- Create: `apps/web/src/tri-state-choice.tsx`
- Modify: `packages/ui/src/ui.css` — append after the `.gn-filters__chip:focus-visible` rule (the file's current last rule, `~:3606-3609`)
- Tests: `apps/web/test/tri-state-choice.test.tsx` (new); `packages/ui/test/components.test.tsx` (append a CSS-binding case)

**Interfaces:**
- Consumes: `ChoiceMode` from `./filter-cycle.js`.
- Produces: `TriStateChoice({ mode, onCycle, children, className? })` rendering `<button type="button" class="gn-filters__choice [className]" data-mode={mode}>`; `ChoiceGlyph({ mode })` (exported — the strip reuses the exclude glyph in Task 10).
- CSS: `.gn-visually-hidden`; `.gn-filters__choice`, `.gn-filters__choice[data-mode='include']`, `.gn-filters__choice[data-mode='exclude'] .gn-filters__choice-label`, `.gn-filters__choice--row`, `.gn-filters__choice-glyph`; `.gn-project__filter-chip--exclude`.

- [ ] **Step 1: Write the failing component test**

Create `apps/web/test/tri-state-choice.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TriStateChoice } from '../src/tri-state-choice.js';

/**
 * 13.550 — the one control shape every value in the Filters sheet becomes
 * (exclude-mode spec §4). Three states, three signals, none carried by
 * colour alone; the state lives in the accessible NAME because `aria-pressed`
 * is binary and would lie for three.
 */
describe('13.550 TriStateChoice — state in the name, glyph on screen, no aria-pressed', () => {
  it('off: the name is the label alone', () => {
    render(<TriStateChoice mode="off" onCycle={() => {}}>Uma One</TriStateChoice>);
    const button = screen.getByRole('button', { name: 'Uma One' });
    expect(button).toHaveAttribute('data-mode', 'off');
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('include: the name says so', () => {
    render(<TriStateChoice mode="include" onCycle={() => {}}>Uma One</TriStateChoice>);
    expect(screen.getByRole('button', { name: 'Uma One, included' })).toHaveAttribute('data-mode', 'include');
  });

  it('exclude: the name says so, and the visible label is struck through by class, not by text', () => {
    render(<TriStateChoice mode="exclude" onCycle={() => {}}>Uma One</TriStateChoice>);
    const button = screen.getByRole('button', { name: 'Uma One, excluded' });
    expect(button).toHaveAttribute('data-mode', 'exclude');
    expect(button.querySelector('.gn-filters__choice-label')).toHaveTextContent('Uma One');
  });

  it('every glyph is decorative and drawn as SVG — no emoji, hidden from the accessible name', () => {
    for (const mode of ['off', 'include', 'exclude'] as const) {
      const { unmount } = render(<TriStateChoice mode={mode} onCycle={() => {}}>X</TriStateChoice>);
      const svg = screen.getByRole('button').querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });

  it('a click calls onCycle once; the button decides nothing itself', async () => {
    const onCycle = vi.fn();
    render(<TriStateChoice mode="off" onCycle={onCycle}>Bug</TriStateChoice>);
    await userEvent.click(screen.getByRole('button', { name: 'Bug' }));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it('accepts a variant class beside its own', () => {
    render(<TriStateChoice mode="off" onCycle={() => {}} className="gn-filters__choice--row">Bug</TriStateChoice>);
    expect(screen.getByRole('button')).toHaveClass('gn-filters__choice', 'gn-filters__choice--row');
  });
});
```

Append to `packages/ui/test/components.test.tsx` (same file as 13.513/13.523, using its `rule()` helper):

```ts
/**
 * Case 13.551 — exclude-mode spec §4 (2026-09-17). CSS binding for the
 * tri-state choice and the strip's exclude chip: the three states are told
 * apart by ground + glyph + strike, never by colour alone. Same shape as
 * `13.513`/`13.523`: proves the rules exist with the right bodies, not that
 * they are wired — `apps/web/test/tri-state-choice.test.tsx` proves the
 * `data-mode` attribute these selectors key off.
 */
describe('13.551 — tri-state choice rules, and the visually-hidden utility', () => {
  it('.gn-visually-hidden clips to nothing without display:none, so the text stays in the accessible name', () => {
    const body = rule('.gn-visually-hidden');
    expect(body).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).not.toMatch(/display:\s*none/);
  });
  it("include is the accent ground with accent text", () => {
    const body = rule(".gn-filters__choice[data-mode='include']");
    expect(body).toMatch(/background:\s*var\(--gn-accent\)/);
    expect(body).toMatch(/color:\s*var\(--gn-accent-text\)/);
  });
  it('exclude strikes the LABEL through and does not reach for the danger tone', () => {
    const body = rule(".gn-filters__choice[data-mode='exclude'] .gn-filters__choice-label");
    expect(body).toMatch(/text-decoration:\s*line-through/);
    expect(rule(".gn-filters__choice[data-mode='exclude']")).not.toMatch(/--gn-danger/);
  });
  it('the row variant keeps the 44px floor', () => {
    expect(rule('.gn-filters__choice--row')).toMatch(/min-height:\s*2\.75rem/);
  });
});
```

- [ ] **Step 2: Run both to verify RED**

`cd apps/web && pnpm exec vitest run test/tri-state-choice.test.tsx` → resolve error. `cd packages/ui && pnpm exec vitest run test/components.test.tsx -t 13.551` → `no rule for .gn-visually-hidden`.

- [ ] **Step 3: Create `apps/web/src/tri-state-choice.tsx`**

```tsx
import type { ReactNode } from 'react';
import type { ChoiceMode } from './filter-cycle.js';

/**
 * The glyph that carries the state alongside colour (ui-ux-pro-max: never
 * colour alone): an empty ring (off), a check (include), a circle-slash
 * (exclude). Inline SVG on `currentColor`, `aria-hidden` — the
 * `inbox/icons.tsx` idiom; decorative, because the state is already in the
 * button's accessible name. Exported so the strip's exclude chips (Task 10)
 * draw the SAME ⊘ rather than a second one.
 */
export function ChoiceGlyph({ mode }: { mode: ChoiceMode }) {
  return (
    <svg className="gn-filters__choice-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {mode === 'include' ? (
        <path d="M5 8.2 7.1 10.3 11.2 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {mode === 'exclude' ? (
        <path d="M4.2 11.8 11.8 4.2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export type TriStateChoiceProps = {
  mode: ChoiceMode;
  /** The button decides nothing: the caller cycles the filter (`withCycledId`) and re-renders with the new mode. */
  onCycle: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * ONE control shape for every value in the Filters sheet (exclude-mode spec
 * §4): a cycling `<button>`. No `aria-pressed` — binary semantics would lie
 * for three states — so the state lives in the accessible NAME through
 * visually-hidden text: "Uma One", "Uma One, included", "Uma One, excluded".
 * `data-mode` is the ONLY styling hook, keyed off the real state rather than
 * a parallel class.
 */
export function TriStateChoice({ mode, onCycle, children, className }: TriStateChoiceProps) {
  return (
    <button
      type="button"
      className={['gn-filters__choice', className].filter(Boolean).join(' ')}
      data-mode={mode}
      onClick={onCycle}
    >
      <ChoiceGlyph mode={mode} />
      <span className="gn-filters__choice-label">{children}</span>
      {mode === 'off' ? null : (
        <span className="gn-visually-hidden">{mode === 'include' ? ', included' : ', excluded'}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Append the CSS to `packages/ui/src/ui.css`**

After the final `.gn-filters__chip:focus-visible { … }` rule:

```css
/* Visually hidden, NOT display:none — the text stays in the accessible name
   (exclude-mode spec §4, 2026-09-17: the tri-state choice's ", included"/
   ", excluded" suffix). The standard clip pattern. */
.gn-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* The tri-state choice (exclude-mode spec §4) — the ONE control shape every
   value in the Filters sheet is now: off / include / exclude, told apart by
   ground + glyph + strike, never colour alone. Chip metrics are
   `.gn-filters__chip`'s own (radius 999px; 8px 12px; 13px); the row variant
   below takes `.gn-filters__person-row`'s. `data-mode` is the only hook. */
.gn-filters__choice {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  border-radius: 999px;
  padding: 0.5rem 0.75rem;
  font: inherit;
  font-size: 0.8125rem;
  background: var(--gn-fill-tertiary);
  color: var(--gn-text);
  cursor: pointer;
  text-align: left;
}
.gn-filters__choice:focus-visible {
  outline: 2px solid var(--gn-focus-ring);
  outline-offset: 1px;
}
.gn-filters__choice-glyph { flex: none; }
.gn-filters__choice[data-mode='include'] {
  background: var(--gn-accent);
  color: var(--gn-accent-text);
}
/* Exclude is a choice, not an error: the OFF ground, explicitly, and no
   danger tone anywhere in this rule (13.551 reads exactly this body). The
   strike is on the LABEL span, so the glyph and the hidden suffix stay
   legible. */
.gn-filters__choice[data-mode='exclude'] {
  background: var(--gn-fill-tertiary);
  color: var(--gn-text);
}
.gn-filters__choice[data-mode='exclude'] .gn-filters__choice-label {
  text-decoration: line-through;
  text-decoration-thickness: 0.09em;
}
.gn-filters__choice[data-mode='exclude'] .gn-filters__choice-glyph { color: var(--gn-text-muted); }
/* Person rows: the same button, the row's own metrics. */
.gn-filters__choice--row {
  width: 100%;
  gap: 0.625rem;
  min-height: 2.75rem;
  padding: 0 0.875rem;
  font-size: 1.0625rem;
  border-radius: 0.75rem;
  background: var(--gn-fill-quaternary);
  box-shadow: var(--gn-shadow-sunken);
}
.gn-filters__choice--row[data-mode='include'] {
  background: var(--gn-accent);
  box-shadow: none;
}
/* The strip's exclude chip carries the same ⊘ glyph before "Not …". */
.gn-project__filter-chip--exclude .gn-filters__choice-glyph { color: var(--gn-text-muted); }
```

- [ ] **Step 5: Run GREEN**

`cd apps/web && pnpm exec vitest run test/tri-state-choice.test.tsx` → EXIT=0, 6 passed. `cd packages/ui && pnpm exec vitest run > $S/ui.log 2>&1` → EXIT=0 (the token-discipline suite scans every client source tree — a new `var(--gn-…)` you did not spell as a token would fail here; every colour above is a token).

- [ ] **Step 6: Record and commit**

```
- **13.550** ✅ `TriStateChoice` — accessible names "X" / "X, included" / "X, excluded" via visually-hidden
  text, `data-mode` as the only hook, SVG glyphs `aria-hidden`, no `aria-pressed`, `onCycle` on click,
  variant class accepted.
- **13.551** ✅ CSS binding: `.gn-visually-hidden` clips without `display:none`; include = accent ground +
  accent text; exclude strikes the label and never names `--gn-danger`; the row variant keeps 2.75rem.
```

```bash
git add apps/web/src/tri-state-choice.tsx packages/ui/src/ui.css apps/web/test/tri-state-choice.test.tsx packages/ui/test/components.test.tsx test-cases/13-deployment-dogfooding.md
git commit -m "TriStateChoice: one cycling button for every Filters-sheet value, state in its name (13.550-13.551)"
```

---

### Task 9: The Filters sheet cycles; `boardFilter` carries `exclude`; "Clear all" clears it

**Files:**
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — `boardFilter` memo (`~:247-265`), `toggledArray`/`withToggledId` (`~:1455-1470`, delete), `FILTERS_SHEET_CLEARABLE_AXES` (`~:1486-1494`), `FiltersSheet`'s `personSection` and the Type/State/Category chip lists (`~:1678-1818`), the sheet docblock's "person row"/"category chip" paragraph.
- Test: `apps/web/test/filters-sheet.test.tsx`

**Interfaces:**
- Consumes: `TriStateChoice` from `../../../../../src/tri-state-choice.js`; `choiceMode`, `withCycledId` from `../../../../../src/filter-cycle.js`.
- Produces: `FILTERS_SHEET_CLEARABLE_AXES` now includes `'exclude'`; `boardFilter.exclude` carries the five board axes.

- [ ] **Step 1: Update the existing tests for the control change, then add the new cases**

In `apps/web/test/filters-sheet.test.tsx`:
- `openFiltersAndPickCollaborator` (`:140`) and the assignee click in `13.447` (`:194`), and the `checkbox` at `:304`: replace `getByRole('checkbox', { name })` with `getByRole('button', { name })` (the name matches the OFF state exactly; after a click the name gains `, included`, so queries that re-find the same control after clicking must use `{ name: /^Uma One/ }`).
- `13.448` (`:217`): replace `expect(bugChip).toHaveAttribute('aria-pressed', 'true')` with `expect(bugChip).toHaveAttribute('data-mode', 'include')` and make the chip query `getByRole('button', { name: /^Bug/ })`.
- `13.460`: extend the exact-set assertion to include `'exclude'` and add a unit assertion: `expect(clearFilterAxes({ text: 'x', exclude: { typeIds: ['bug'] }, dueBefore: '2026-01-01' })).toEqual({ text: undefined, assigneeIds: undefined, typeIds: undefined, stateIds: undefined, stateCategories: undefined, projectIds: undefined, collaboratorIds: undefined, exclude: undefined, dueBefore: '2026-01-01' })` (read the existing assertion's exact shape and extend it rather than replacing its style).

Append:

```tsx
/** 13.552 — the cycle, through the real sheet (exclude-mode spec §4). */
describe('13.552 a person row cycles off → included → excluded → off, in its accessible name', () => {
  it('three clicks walk the three names and return to the start', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });

    const row = within(group).getByRole('button', { name: 'Uma One' });
    expect(row).not.toHaveAttribute('aria-pressed');
    await userEvent.click(row);
    expect(within(group).getByRole('button', { name: 'Uma One, included' })).toHaveAttribute('data-mode', 'include');
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    expect(within(group).getByRole('button', { name: 'Uma One, excluded' })).toHaveAttribute('data-mode', 'exclude');
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, excluded' }));
    expect(within(group).getByRole('button', { name: 'Uma One' })).toHaveAttribute('data-mode', 'off');
  });
});

/** 13.553 — exclusion narrows the BOARD and is disclosed as "Not assignee". */
describe('13.553 excluding an assignee drops that card from the board and shows a "Not assignee" chip', () => {
  it('two clicks on Uma One leave only the unassigned card, under a "1 of 2 shown" strip', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-exclude.assigneeIds')).toHaveTextContent('Not assignee: Uma One');
    expect(screen.queryByTestId('board-filter-chip-assigneeIds')).not.toBeInTheDocument();
    expect(screen.getByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByText('Carve the new workflow')).not.toBeInTheDocument();
  });

  it("the exclude chip's × clears the exclusion and restores both cards", async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await userEvent.keyboard('{Escape}');
    await screen.findByText('1 of 2 shown');

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter — Not assignee: Uma One' }));

    expect(await screen.findByText('Carve the new workflow')).toBeInTheDocument();
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

/** 13.554 — a type chip excluded, the same way; and the category chips cycle too. */
describe('13.554 type and category chips cycle and exclude', () => {
  it('excluding the Bug type drops the bug card', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Type' });
    await userEvent.click(within(group).getByRole('button', { name: 'Bug' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Bug, included' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-exclude.typeIds')).toHaveTextContent('Not type: Bug');
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
  });

  it('a category chip reaches the excluded state', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Category' });
    await userEvent.click(within(group).getByRole('button', { name: 'Active' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Active, included' }));
    expect(within(group).getByRole('button', { name: 'Active, excluded' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // Both cards sit in the one `active` column, so excluding the category empties the board honestly.
    expect(await screen.findByText('0 of 2 shown')).toBeInTheDocument();
  });
});

/** 13.555 — "Clear all" clears the exclude half too, through the real button. */
describe('13.555 Clear all clears an exclusion', () => {
  it('after Clear all the excluded row reads off and both cards are back', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await screen.findByText('1 of 2 shown');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    expect(within(group).getByRole('button', { name: 'Uma One' })).toHaveAttribute('data-mode', 'off');
    expect(dialog).toBeInTheDocument(); // Clear all does not close (Ruling 12)
    expect(screen.queryByText('1 of 2 shown')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify RED**

`cd apps/web && pnpm exec vitest run test/filters-sheet.test.tsx > $S/t.log 2>&1; echo EXIT=$?; grep -E '×|Tests ' $S/t.log | head -20` — Expected: EXIT=1; the updated `13.447`/`13.448`/`13.451`/`13.452` fail (no button named "Uma One" — still a checkbox) and every new case fails.

- [ ] **Step 3: Implement in `page.tsx`**

(a) Imports: add
```ts
import { choiceMode, withCycledId } from '../../../../../src/filter-cycle.js';
import { TriStateChoice } from '../../../../../src/tri-state-choice.js';
```

(b) `boardFilter` memo (`~:247`): add `exclude` and its dependency:

```ts
  const boardFilter: BoardFilterSpec = useMemo(
    () => ({
      text: filter.text,
      assigneeIds: filter.assigneeIds,
      typeIds: filter.typeIds,
      stateIds: filter.stateIds,
      stateCategories: filter.stateCategories,
      projectIds: filter.projectIds,
      // The exclude half, the same five — `collaboratorIds` deliberately dropped
      // (`BoardFilterSpec.exclude` cannot carry it; `describeUnappliedBoardAxes`
      // discloses it). Exclude-mode spec §1/§3.
      exclude:
        filter.exclude === undefined
          ? undefined
          : {
              assigneeIds: filter.exclude.assigneeIds,
              typeIds: filter.exclude.typeIds,
              stateIds: filter.exclude.stateIds,
              stateCategories: filter.exclude.stateCategories,
              projectIds: filter.exclude.projectIds,
            },
    }),
    [
      filter.text,
      filter.assigneeIds,
      filter.typeIds,
      filter.stateIds,
      filter.stateCategories,
      filter.projectIds,
      filter.exclude,
    ],
  );
```

Also extend `boardUnappliedAxes`'s dependency list (`~:403`) with `filter.exclude`.

(c) Delete `toggledArray` and `withToggledId` (`~:1455-1470`) — `withCycledId` replaces both.

(d) `FILTERS_SHEET_CLEARABLE_AXES`: add `'exclude'` as the last entry and amend its docblock: "…plus `exclude` (exclude-mode spec §4, 2026-09-17): the whole exclude half, so 'Clear all' clears what the tri-state controls set in EITHER direction". `clearFilterAxes` needs no change — it iterates the list.

(e) `personSection`: replace the `<label className="gn-filters__person-row">…<input type="checkbox" …/>…</label>` with:

```tsx
            <TriStateChoice
              key={member.id}
              className="gn-filters__choice--row"
              mode={choiceMode(filter, key, member.id)}
              onCycle={() => setFilter((current) => withCycledId(current, key, member.id))}
            >
              <span aria-hidden="true">
                <Avatar name={member.name} size="small" />
              </span>
              <span>{member.name}</span>
            </TriStateChoice>
```

(keep the existing `aria-hidden` comment beside the avatar span).

(f) The Type, State and Category chip lists: replace each `<button type="button" className="gn-filters__chip" aria-pressed={selected} onClick={…}>{name}</button>` (and the `const selected = …` line above it) with:

```tsx
                    <TriStateChoice
                      key={type.id}
                      mode={choiceMode(filter, 'typeIds', type.id)}
                      onCycle={() => setFilter((current) => withCycledId(current, 'typeIds', type.id))}
                    >
                      {type.name}
                    </TriStateChoice>
```

— with `'stateIds'`/`state.id`/`state.name` for the State list and `'stateCategories'`/`category`/`STATE_CATEGORY_LABELS[category]` for Category.

(g) In the `FiltersSheet` docblock, replace the sentence describing "person row" checkbox lists and "category chip" multi-selects with: "Every value is ONE control, `TriStateChoice` (exclude-mode spec §4, 2026-09-17): off → include → exclude → off, cycled through `withCycledId` onto this same `filter`; the person rows keep their avatar and name inside that button."

- [ ] **Step 4: Run GREEN + typecheck; then the whole `apps/web` suite**

`pnpm exec vitest run test/filters-sheet.test.tsx` → EXIT=0. `pnpm run typecheck` → EXIT=0. `pnpm exec vitest run > $S/web.log 2>&1` → EXIT=0 (other files querying `checkbox` in the sheet — `board-narrowing.test.tsx`'s `openFiltersAndPickAssignee` at `:389` — must be updated to `getByRole('button', { name })` in this task too, since the control changed).

- [ ] **Step 5: Mutation check** — back up `page.tsx`; in the `boardFilter` memo replace the `exclude:` value with `undefined` → `13.553` and `13.554` fail (the board no longer narrows on exclude) while `13.552` still passes (the name cycles regardless — that asymmetry is the point: the sheet and the board are wired separately). Restore; `cmp`.

- [ ] **Step 6: Record, update `Features.md`, commit**

test-cases:

```
- **13.552** ✅ Through the real sheet, a person row's accessible name walks "Uma One" → "Uma One, included"
  → "Uma One, excluded" → "Uma One", `data-mode` following, no `aria-pressed`.
- **13.553** ✅ Excluding an assignee drops that card from the board under "1 of 2 shown" with a
  "Not assignee: Uma One" chip (and no include chip); the chip's × restores both cards and the strip goes.
  Mutation (`boardFilter.exclude` forced `undefined`) kills this and 13.554 while 13.552 stays green.
- **13.554** ✅ A type chip excludes (bug card gone, "Not type: Bug"); a category chip reaches the excluded
  state and empties the one-column board honestly ("0 of 2 shown").
- **13.555** ✅ "Clear all" clears an exclusion through the real button, without closing the sheet;
  `13.460` extended: `FILTERS_SHEET_CLEARABLE_AXES` names `exclude` and `clearFilterAxes` resets it.
- `13.447`/`13.448`/`13.451`/`13.452`/`13.460` updated for the control change (checkbox → button;
  `aria-pressed` → `data-mode`).
```

`Features.md`: in the Filters-sheet bullet (search for `Filters sheet` near the Task 5 entry), append one sentence: "**2026-09-17: every value is tri-state** — off → include → exclude → off (`TriStateChoice`, state in the accessible name, no `aria-pressed`), the filter vocabulary gained an `exclude` half (`IdAxes`, declared once), the board honours it (`matchesBoardCard`), the strip shows "Not …" chips removable by half, and Clear all clears both halves; cases `13.538`–`13.555`."

```bash
git add "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx" apps/web/test/filters-sheet.test.tsx apps/web/test/board-narrowing.test.tsx Features.md test-cases/13-deployment-dogfooding.md
git commit -m "Filters sheet: every value cycles off → include → exclude; the board honours exclude; Clear all clears both halves (13.552-13.555)"
```

---

### Task 10: The filter reaches List, Calendar and Timeline; the strip on every tab; the mirror note goes

**Files:**
- Create: `apps/web/src/list-narrowing-word.ts`
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — new `listFilterSpec`/`listNarrowing`/`listUnappliedAxes` memos beside `boardNarrowing` (`~:366-406`); `dateInputs` (`~:530-545`); the strip block (`~:1128-1200`); the mirror note block (`~:1203-1243`, delete); the `TicketList` mount (`~:1375-1395`).
- Tests: `apps/web/test/list-narrowing-word.test.ts` (new); `apps/web/test/board-narrowing.test.tsx` (13.439/13.444/13.517 flipped; new 13.557–13.561)

**Interfaces:**
- Consumes: `matchesListRow`, `ListFilterSpec` from `@gisik-nokma/app-core`; `describeUnappliedListAxes`, `shouldRenderNarrowingStrip` from `board-search-scope.js`; `ChoiceGlyph` from `tri-state-choice.js`.
- Produces: `listNarrowingWord(activeOnly: boolean, filterNarrows: boolean): string | undefined`.

- [ ] **Step 1: The pure word, RED then GREEN**

Test `apps/web/test/list-narrowing-word.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { listNarrowingWord } from '../src/list-narrowing-word.js';

/** 13.556 — the word `TicketList` renders as "narrowed to {word} — not the whole project" (exclude-mode spec §3). */
describe('13.556 listNarrowingWord names every narrowing in force', () => {
  it('neither → undefined, so the count reads as the project\'s own', () => {
    expect(listNarrowingWord(false, false)).toBeUndefined();
  });
  it('toggle only', () => {
    expect(listNarrowingWord(true, false)).toBe('tickets in progress');
  });
  it('filters only', () => {
    expect(listNarrowingWord(false, true)).toBe('your filters');
  });
  it('both, joined', () => {
    expect(listNarrowingWord(true, true)).toBe('tickets in progress and your filters');
  });
});
```

Implementation `apps/web/src/list-narrowing-word.ts`:

```ts
/**
 * The word `TicketList`'s summary row renders as "narrowed to {word} — not
 * the whole project" (`ticket-list.tsx`). Two narrowings can be in force at
 * once since the page filter reached the list (exclude-mode spec §3): the
 * server-side "active only" toggle and the client-side filter. Both are
 * named, joined, or neither — `undefined` keeps the unnarrowed count reading
 * as the project's own.
 */
export function listNarrowingWord(activeOnly: boolean, filterNarrows: boolean): string | undefined {
  const words: string[] = [];
  if (activeOnly) words.push('tickets in progress');
  if (filterNarrows) words.push('your filters');
  return words.length === 0 ? undefined : words.join(' and ');
}
```

Run RED (resolve error) → create → GREEN (4 passed).

- [ ] **Step 2: Flip and add the page tests (RED)**

In `apps/web/test/board-narrowing.test.tsx`:

Replace the `13.439` describe block (three cases) and `13.444` with:

```tsx
/**
 * 13.557 — the search box reaches the List tab (exclude-mode spec §3). The
 * mirror note that used to apologise for the opposite is GONE — asserted by
 * its old testid being absent even with a term present.
 */
describe('13.557 the search narrows the List tab, and the note that said otherwise is gone', () => {
  it('a term drops the non-matching row, shows the strip with the LIST\'s own count, and no mirror note', async () => {
    render(
      <Providers
        services={servedBoard(threeCards, [
          listRow({ ticketId: 'lt_1', title: 'Ship the board' }),
          listRow({ ticketId: 'lt_2', title: 'Restock the cold shelf' }),
        ])}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('Ship the board');

    await userEvent.type(await searchbox(), 'board');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument(); // the list has 2, the board 3
    expect(screen.queryByText('1 of 3 shown')).not.toBeInTheDocument();
    expect(screen.getByText('Ship the board')).toBeInTheDocument();
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-text')).toHaveTextContent('Search: "board"');
    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
    expect(screen.getByTestId('list-narrowing')).toHaveTextContent('narrowed to your filters');
  });

  it('13.558 the Calendar and Timeline tabs draw from the same narrowed rows', async () => {
    render(
      <Providers
        services={servedBoard(threeCards, [
          listRow({ ticketId: 'lt_1', title: 'Ship the board', dueDate: { date: '2026-09-18', claim: claim() } }),
          listRow({ ticketId: 'lt_2', title: 'Restock the cold shelf', dueDate: { date: '2026-09-18', claim: claim() } }),
        ])}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.type(await searchbox(), 'board');

    for (const tab of ['Calendar', 'Timeline']) {
      await userEvent.click(await screen.findByRole('tab', { name: tab }));
      expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
      expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
    }
  });

  it('13.559 clearing the term restores the row and removes the strip on the List tab', async () => {
    render(
      <Providers services={servedBoard(threeCards, [listRow({ ticketId: 'lt_1', title: 'Ship the board' }), listRow({ ticketId: 'lt_2', title: 'Restock the cold shelf' })])}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    const search = await searchbox();
    await userEvent.type(search, 'board');
    await screen.findByText('1 of 2 shown');

    await userEvent.clear(search);

    expect(await screen.findByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});
```

Replace `13.517`'s describe (which asserted the mirror note after an assignee pick) with a case that asserts the list NARROWS on the same pick — keep its `ROSTER` and `openFiltersAndPickAssignee` helpers (updating `checkbox` → `button` if Task 9 did not already):

```tsx
describe('13.517 (flipped 2026-09-17) an assignee picked in the Filters sheet narrows the List tab', () => {
  it('drops the row assigned to someone else and discloses through the strip, not a note', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getAttention: async () => [],
          getMembers: async () => ROSTER,
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [
              listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf', assignee: { id: 'u1', name: 'Uma One' } }),
              listRow({ ticketId: 'lt_2', title: 'A ticket nobody owns' }),
            ],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('A ticket nobody owns');

    await openFiltersAndPickAssignee('Uma One');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-assigneeIds')).toHaveTextContent('Uma One');
    expect(screen.queryByText('A ticket nobody owns')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
  });

  it('13.560 an EXCLUDED assignee drops the row assigned to them instead', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getAttention: async () => [],
          getMembers: async () => ROSTER,
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [
              listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf', assignee: { id: 'u1', name: 'Uma One' } }),
              listRow({ ticketId: 'lt_2', title: 'A ticket nobody owns' }),
            ],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('A ticket nobody owns');

    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-exclude.assigneeIds')).toHaveTextContent('Not assignee: Uma One');
    expect(screen.getByText('A ticket nobody owns')).toBeInTheDocument();
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
  });

  it('13.561 the create dialog\'s parent picker still offers the filtered-out ticket', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getAttention: async () => [],
          getMembers: async () => ROSTER,
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [
              listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf', assignee: { id: 'u1', name: 'Uma One' } }),
              listRow({ ticketId: 'lt_2', title: 'A ticket nobody owns' }),
            ],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await openFiltersAndPickAssignee('Uma One');
    // `threeCards` carries no assignee at all, so the BOARD narrows to none — the
    // pick is real and the list rows (one of which IS Uma's) are what the picker reads.
    await screen.findByText('0 of 3 shown');

    await userEvent.click(await screen.findByRole('button', { name: 'New ticket' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Parent' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('A ticket nobody owns');
    await userEvent.keyboard('{Escape}');
  });
});
```

(If the `New ticket` button or the `Parent` combobox needs `getPreferences`/`getTicketTypes` stubs to render — `project-create-gate.test.tsx:285-300` shows the exact stub set it uses — copy those into 13.561's `stubServices` call.)

Also `13.436` (board count vs list count) stays as is — it still holds on the Board tab.

Run: `pnpm exec vitest run test/board-narrowing.test.tsx test/list-narrowing-word.test.ts > $S/t.log 2>&1; echo EXIT=$?; grep -E '×|Tests ' $S/t.log | head -12` — Expected: EXIT=1; 13.557–13.561 and the flipped 13.517 fail (rows not narrowed, mirror note present, strip absent on List).

- [ ] **Step 3: Implement in `page.tsx`**

(a) Imports: add `matchesListRow, type ListFilterSpec` to the `@gisik-nokma/app-core` import; `describeUnappliedListAxes` to the `board-search-scope.js` import; `import { listNarrowingWord } from '../../../../../src/list-narrowing-word.js';` and `import { ChoiceGlyph } from '../../../../../src/tri-state-choice.js';` (merge with Task 9's import of that module).

(b) Directly after the `boardUnappliedAxes` memo, add:

```ts
  /**
   * THE LIST'S OWN ENUMERATION of `ListFilterSpec` axes from `filter`
   * (exclude-mode spec §3) — beside `boardFilter`'s, the same "one object
   * literal per view to update" discipline. `collaboratorIds` dropped from
   * both halves (`ListFilterSpec` cannot carry it; `listUnappliedAxes` below
   * discloses it); the due bounds and `fields` INCLUDED, because a list row
   * can answer them even though no control sets them yet.
   */
  const listFilterSpec: ListFilterSpec = useMemo(
    () => ({
      text: filter.text,
      assigneeIds: filter.assigneeIds,
      typeIds: filter.typeIds,
      stateIds: filter.stateIds,
      stateCategories: filter.stateCategories,
      projectIds: filter.projectIds,
      dueBefore: filter.dueBefore,
      dueAfter: filter.dueAfter,
      fields: filter.fields,
      exclude:
        filter.exclude === undefined
          ? undefined
          : {
              assigneeIds: filter.exclude.assigneeIds,
              typeIds: filter.exclude.typeIds,
              stateIds: filter.exclude.stateIds,
              stateCategories: filter.exclude.stateCategories,
              projectIds: filter.exclude.projectIds,
            },
    }),
    [filter],
  );

  /**
   * THE LIST NARROWING (exclude-mode spec §3): `list.rows` through
   * `matchesListRow` ONCE, and List, Calendar and Timeline all read
   * `listNarrowing.rows`. `null` while the list has not answered — the three
   * arms below already gate on `list.rows !== null`, and this mirrors it.
   * `parentCandidates` and `labels.epicTitle` keep reading `list.rows`
   * UNnarrowed on purpose: a parent picker that hid tickets because of a view
   * filter would be the "page asserts they do not exist" failure this shell
   * refuses, and an epic the filter dropped must still name itself above its
   * surviving children.
   */
  const listNarrowing = useMemo(() => {
    if (list.rows === null) return null;
    const rows = list.rows.filter((row) => matchesListRow(row, projectId, listFilterSpec));
    return { rows, shown: rows.length, total: list.rows.length };
  }, [list.rows, listFilterSpec, projectId]);

  const listUnappliedAxes = useMemo(() => describeUnappliedListAxes(filter), [filter.collaboratorIds, filter.exclude]);
```

(c) `dateInputs` (`~:530`): read `listNarrowing === null ? [] : listNarrowing.rows.map(…)` instead of `list.rows`, with `listNarrowing` in the dependency list.

(d) The strip block (`~:1128`): replace the gate expression and the interior so it renders on every tab:

```tsx
            {(() => {
              const narrowing = view === 'board' ? boardNarrowing : listNarrowing;
              const unapplied = view === 'board' ? boardUnappliedAxes : listUnappliedAxes;
              const chips = view === 'board' ? narrowingChips : activeFilterChips;
              if (
                narrowing === null ||
                !shouldRenderNarrowingStrip({
                  chipCount: activeFilterChips.length,
                  unappliedAxisCount: unapplied.length,
                  shown: narrowing.shown,
                  total: narrowing.total,
                })
              ) {
                return null;
              }
              return (
                <div className="gn-project__narrowing" data-testid="board-narrowing">
                  <span className="gn-project__count" data-testid="board-narrowing-count">
                    {narrowing.shown} of {narrowing.total} shown
                  </span>
                  {chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={chip.mode === 'exclude' ? 'gn-project__filter-chip gn-project__filter-chip--exclude' : 'gn-project__filter-chip'}
                      data-testid={`board-filter-chip-${chip.key}`}
                    >
                      {chip.mode === 'exclude' ? <ChoiceGlyph mode="exclude" /> : null}
                      {chip.label}
                      <button type="button" className="gn-project__filter-chip-remove" onClick={chip.onRemove} aria-label={`Remove filter — ${chip.label}`}>
                        ×
                      </button>
                    </span>
                  ))}
                  {unapplied.length > 0 ? (
                    <span className="gn-project__scope-note" data-testid="board-scope-note">
                      {/* keep the existing sentence and its docblock verbatim, reading `unapplied` instead of `boardUnappliedAxes` */}
                    </span>
                  ) : null}
                </div>
              );
            })()}
```

Preserve the existing docblocks above the strip (the disclosure-gate and location-clause arguments) — move them, do not delete them; amend the gate docblock with one paragraph: "PER TAB since 2026-09-17 (exclude-mode spec §3): Board reads `boardNarrowing`/`boardUnappliedAxes` and the picker's chip; the other three read `listNarrowing`/`listUnappliedAxes` and the filter chips alone — the workflow picker narrows groups the board renders and is meaningless elsewhere. One strip, rendered once with per-tab inputs, never two." Keep `data-testid="board-narrowing"` (the tests and the e2e specs already bind to it; renaming it is churn with no reader).

(e) Delete the mirror note block (`{view !== 'board' && (…) ? (<p … data-testid="search-not-applied-note">…</p>) : null}`) and its docblock in full.

(f) `TicketList` mount: replace `{...(activeOnly ? { narrowing: 'tickets in progress' } : {})}` and `rows={list.rows}` with:

```tsx
                {...(() => {
                  const word = listNarrowingWord(
                    activeOnly,
                    activeFilterChips.length > 0 || listUnappliedAxes.length > 0 || listNarrowing.shown !== listNarrowing.total,
                  );
                  return word === undefined ? {} : { narrowing: word };
                })()}
                rows={listNarrowing.rows}
```

(this arm is inside `list.rows !== null`, and `listNarrowing` is non-null exactly then — add `listNarrowing !== null` to that arm's condition so TypeScript narrows it).

- [ ] **Step 4: Run GREEN across `apps/web`, then typecheck**

`pnpm exec vitest run > $S/web.log 2>&1; echo EXIT=$?; grep -E 'Tests |×' $S/web.log | head` → EXIT=0. `pnpm run typecheck` → EXIT=0. Also `cd apps/web && grep -rn 'search-not-applied-note' app src test` → must print nothing.

- [ ] **Step 5: Mutation checks (two)** — back up `page.tsx`. (a) `dateInputs` back to `list.rows` → `13.558` fails. (b) `rows={list.rows}` on `TicketList` → `13.557` and `13.560` fail. Restore; `cmp`.

- [ ] **Step 6: Record, `Features.md`, commit**

test-cases:

```
- **13.556** ✅ `listNarrowingWord`: undefined / "tickets in progress" / "your filters" / both joined.
- **13.557** ✅ The search box narrows the List tab: the non-matching row drops, the strip shows the LIST's
  own count ("1 of 2 shown", never the board's 3), the text chip is there, the old mirror note's testid
  is absent, and `TicketList`'s summary reads "narrowed to your filters". Mutation (`rows={list.rows}`) kills it.
- **13.558** ✅ Calendar and Timeline draw from the same narrowed rows ("1 of 2 shown" on each; no mirror
  note). Mutation (`dateInputs` from `list.rows`) kills it.
- **13.559** ✅ Clearing the term restores the row and removes the strip on the List tab.
- **13.517** ✅ FLIPPED: an assignee picked in the sheet now NARROWS the list (the row assigned to someone
  else drops) and discloses through the strip; the note it used to assert is gone.
- **13.560** ✅ An EXCLUDED assignee drops the row assigned to them on the List tab, "Not assignee" chip shown.
- **13.561** ✅ The create dialog's parent picker still offers a ticket the filter dropped — `parentCandidates`
  reads the unnarrowed rows.
- `13.439`/`13.444` retired (their subject — the mirror note — no longer exists); their numbers stay unused.
```

`Features.md`: replace the mirror-note sentence in the board search bullet (search for "mirror note" / "Filters set here are not applied") with: "**2026-09-17: the filter reaches every tab.** `list.rows` is narrowed once through `matchesListRow` (`filter/list-filter.ts`) and List, Calendar and Timeline all read the narrowed rows; the strip renders on every tab with that tab's own count and unapplied axes (`shouldRenderNarrowingStrip`, per tab); the mirror note is gone because what it apologised for is no longer true; the create dialog's parent picker and `epicTitle` keep the unnarrowed rows. Client-side throughout — the wire has no negation term and every tab already holds the complete project (≤2000 rows); `toServerFilterSpec` refuses a non-empty exclude. Cases `13.556`–`13.561`." Also add a ⚙️ bullet beside `matchesBoardCard`'s (search for "matchesBoardCard" in Features.md) for `matchesListRow` + `id-axes.ts`, one to two lines, citing `13.538`–`13.544`.

```bash
git add apps/web/src/list-narrowing-word.ts "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx" apps/web/test/list-narrowing-word.test.ts apps/web/test/board-narrowing.test.tsx Features.md test-cases/13-deployment-dogfooding.md
git commit -m "The filter reaches List, Calendar and Timeline; the strip on every tab; the mirror note retired (13.556-13.561, 13.517 flipped)"
```

---

### Task 11: Final gate, citation sweep, catalogue checks

**Files:**
- Modify: `test-cases/13-deployment-dogfooding.md` (closing paragraph), any citation re-points found below.

- [ ] **Step 1: Full gate under Node 22**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && node --version
cd packages/app-core && pnpm exec vitest run > $S/g-ac.log 2>&1; echo app-core=$?; grep -E 'Tests ' $S/g-ac.log; pnpm run typecheck > $S/g-actc.log 2>&1; echo typecheck=$?
cd ../ui && pnpm exec vitest run > $S/g-ui.log 2>&1; echo ui=$?; grep -E 'Tests ' $S/g-ui.log
cd ../../apps/web && pnpm exec vitest run > $S/g-web.log 2>&1; echo web=$?; grep -E 'Tests ' $S/g-web.log; pnpm run typecheck > $S/g-webtc.log 2>&1; echo webtc=$?
cd ../../apps/server && pnpm run typecheck > $S/g-srv.log 2>&1; echo servertc=$?
```

Expected: every EXIT 0. Read each `Tests` line; write the numbers and the Node version into the closing paragraph.

- [ ] **Step 2: Catalogue checks**

`node scripts/check-case-ids.mjs` → only `13.387`/`13.413` duplicated. `node scripts/check-case-citations.mjs` → the `13-deployment-dogfooding.md` uncited set must be exactly `13.401`, `13.476`, `13.477` (pre-existing) — every new ✅ case is cited by id in a test.

- [ ] **Step 3: Citation sweep for displaced line numbers**

`git diff --stat 5c8d1bd6..HEAD` lists the touched source files. For each of `page.tsx`, `board-search-scope.ts`, `matches-filter.ts`, `board-filter.ts`, `mappers.ts`, `ui.css`, `view-types.ts`: `grep -rnoE '<basename>:[0-9]+(-[0-9]+)?' Features.md test-cases docs/superpowers/specs packages/*/src apps/web/src apps/web/app --include='*.md' --include='*.ts' --include='*.tsx' --include='*.css'`, and for each hit past the first line you inserted, open the file at HEAD~N (`git show 5c8d1bd6:<path> | sed -n Np`) to decide whether the citation was CORRECT before this plan; re-point only those, against the current tip, by opening the file — never by adding an offset (Ruling 30's method). Record the re-points in the closing paragraph; leave already-stale citations alone and say so.

- [ ] **Step 4: Closing paragraph and commit**

Append to the test-cases section: the gate numbers with Node version, the mutation summary (one line per task: which mutation killed which cases), the citation re-points, and the three "named, not built" items from spec §8 (server-side negation; filter state in the URL; date/field controls).

```bash
git add test-cases/13-deployment-dogfooding.md Features.md <any re-pointed files>
git commit -m "Exclude filter on every tab: final gate, catalogue checks, citation sweep"
```

---

## Self-review

**Spec coverage.** §1 data model → Task 1 (+ Task 3/4 per-view specs). §2 predicates → Tasks 2, 3, 4; base rules → Task 1; wire refusal → Task 5; disclosure helpers → Task 6. §3 page wiring → Task 10 (list narrowing, strip per tab, mirror note, parent picker, epicTitle unchanged, narrowing word). §4 controls → Tasks 7, 8, 9; chips with ⊘ → Tasks 6 (data) and 10 (render); Clear all → Task 9. §5 edge cases: unresolvable id → covered by the existing resolver fallback (13.442's own case) and 13.546's `u_unknown`; exclude-everything → 13.554's category case; toggle + exclude composition → the word (13.556) and 13.436 unchanged; text on all tabs → 13.557/13.558. §6 tests → each task. §7 files → the file table. §8 named-not-built → Task 11's closing paragraph.

**Placeholder scan.** No TBD/TODO. Two conditional instructions remain deliberate and bounded: Task 5 Step 1 ("match the existing test's absent-`fields` shape") and Task 10 Step 2 ("copy the create-gate stub set if the New-ticket button needs it") — both point at the exact file and lines to copy from.

**Type consistency.** `withIdAxis(filter, half, axis, values)` — used identically in Tasks 6 and 7. `buildFilterChips`/`shouldRenderNarrowingStrip`/`describeUnappliedListAxes` — named the same in Tasks 6, 9, 10. `BoardFilterChip.mode` — added in Task 6, read in Task 10. `ChoiceMode`/`choiceMode`/`withCycledId` — Task 7, consumed in Task 9. `ChoiceGlyph` — Task 8, consumed in Task 10. `ListFilterSpec`/`matchesListRow` — Task 4, consumed in Task 10. `BoardIdAxes` — Task 3, consumed in Task 4. `listNarrowingWord` — Task 10 only.

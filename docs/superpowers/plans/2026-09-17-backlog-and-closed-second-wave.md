# Backlog and Closed — Second Wave Implementation Plan (spec §8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec §8 on top of the landed core: a shared manual order for backlog tickets (drag and keyboard), an hourly auto-close of tickets that have sat in a terminal state for N days, and bulk close from a terminal board column or a List selection.

**Architecture:** Three additive features, each a ledger fact first. Ranking is one event (`ticket.ranked { rank }`) carrying a fractional string key from the domain's `rankBetween`, projected to `proj_tickets.rank` and sorted CLIENT-side on the Backlog tab (the list route keeps its `ticket_id` keyset order — see Global Constraints). Auto-close is a workspace setting (`autoCloseAfterDays`) plus a daemon job that selects candidates with the notification sweep's own "entered the current state at" LATERAL join and ingests plain `ticket.closed` events as a reserved system actor through the ingest door; `TicketState.reopenedAt` makes an explicit reopen win. Bulk close is one dialog component fed by two surfaces (a terminal column's header, the List's selection) emitting N plain `ticket.closed` in one ingest batch — no bulk event, no bulk endpoint.

**Tech Stack:** TypeScript monorepo — `packages/domain` (zod, reducer), `packages/rule-engine`, `apps/server` (Fastify, Postgres, node-pg-migrate SQL, the backup daemon), `packages/app-core` (React views, precheck, online mappers, replica), `packages/ui` (`Table`, `Dialog`, `ui.css` tokens), `apps/web` (Next.js project page, `/settings`), vitest, Node 22.

**Spec:** `docs/superpowers/specs/2026-09-17-backlog-and-closed-design.md` §8 (8.1–8.3), read with §1–§7 and its `## Amendments during execution (2026-09-17)` appendix (28 entries — the rulings that bind the landed core, e.g. Amendment 3 "a declared state mapped INTO backlog refuses", Ruling 27's refusal/transport split, Ruling 41 "Start submits directly").

## Global Constraints

- Branch/checkout: the owner's primary checkout on `owner/workspace-edits`; never `main`; nothing pushed; never start `next dev` (the owner's is on 3001). No separate worktree (core-plan ruling, carried).
- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`) before ANY test run including the first RED; every gate quotes `node --version`. Never pipe a test run into `head`. Never `git stash` / `git checkout --`; mutations restore via `cp` + `sha256sum`. `.superpowers/` is git-ignored — never `git add -f` under it.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` (section `## Backlog and closed (owner request, 2026-09-17)`, new sub-heading `### Second wave (spec §8)`) change in the same commit as the code; new case ids start at **13.613**; every ✅ case cites `path:line`; `node scripts/check-case-ids.mjs` may report only `13.387`/`13.413`; `node scripts/check-case-citations.mjs` must leave file 13's uncited set exactly `13.401`/`13.476`/`13.477`. Letter-suffixed ids are invisible to the citation script — hand-check them with `grep -rln` under `packages/*/test` and `apps/*/test`.
- Every new wire field is carried end to end in ONE task — server assembler → JSON → `packages/app-core/src/online/mappers.ts` — with a mapper test. The core plan's final review found the closed flag dead in production because every view test drove a fake data source; that must not recur.
- Copy, verbatim from spec §8: buttons `Move up` / `Move down` with `aria-label` `Move <title> up` / `Move <title> down`; the board header action `Close all (N)`; the List action `Close selected (N)`; the auto-close actor's display name `Auto-close`; the sheet's badge then reads `Closed by Auto-close on <date>`; the setting label `Auto-close after`, unit `days`, `Off` when null.
- Refusal id and reason, verbatim: `rank-requires-backlog` — `Only a backlog ticket can be ranked; this one is in "${stateName}".` (`stateName` from `statesWithBacklog(def)`, falling back to the id when the def is unknown, exactly as `close-requires-terminal` does in `packages/rule-engine/src/checks/close.ts`).
- Ranks: `rankBetween(before: string | null, after: string | null): string` yields a key strictly between its neighbours without renumbering anyone else; `null, null` → a first key; unranked tickets sort AFTER ranked ones, then by `ticketId` ascending (ULID = creation). A rank is meaningful only within one project.
- **Plan ruling R1 (deviates from §8.1's server sentence):** the list route's `ORDER BY t.ticket_id` and its keyset cursor (`t.ticket_id > $cursor`, `apps/server/src/routes/list.ts:143-153`) stay as they are — a `rank ASC NULLS LAST` order would break pagination, and the client already assembles the full list by looping the cursor (ruling P41). The server carries `rank` on every list row; ORDERING happens on the Backlog tab. Spec §8.1 is amended in Task 12.
- **Plan ruling R2:** ranking neighbours are computed from the Backlog tab's rank-sorted FLAT order (the source of truth), not from the displayed nesting — `nestRows` may show a backlog child under its backlog parent regardless of rank; the rank still changes as asked. Grouping/nesting are display-only.
- **Plan ruling R3:** the Start edge is ungated (Amendment/Ruling 41), so auto-close's `ticket.closed` needs no permission door — the daemon ingests with `ingestBatch` (door `null`, server origin), which is how seeds and invite acceptance already write.
- **Plan ruling R4:** `Dialog`'s dismiss control (`packages/ui/src/components/dialog.tsx:26`, `aria-label="Close"`) becomes `aria-label="Close dialog"` — Ruling 31's sibling: a bulk-close dialog whose confirm reads `Close N tickets` must not share an accessible name with its dismiss glyph.
- **Plan ruling R5:** the Settings surface for `autoCloseAfterDays` is a new `Workspace` tab on `/settings` (`apps/web/app/settings/page.tsx`, tabs today: `ticket-types` | `workflows`) holding the THREE `workspace.settings_set` knobs (`staleDays`, `dueSoonDays`, `autoCloseAfterDays`) — the two existing knobs have no UI today, and one form for one event is smaller than a knob alone. Admin-only, as `check-permission.ts:582` already enforces for the event.
- Domain-type optionality follows the core's rule: `TicketState.rank?` and `TicketState.reopenedAt?` are OPTIONAL on the domain type only (hundreds of test literals predate them; every producer sets them; readers spell `?? null`); required on `TicketCard`/`ListRow`.
- `BOOTSTRAP_BACKFILL_TYPES` and `ADMIN_ONLY_TYPES` unchanged (folded types; membership gate as for `ticket.closed` — core-plan rulings).

---

## File structure

| Package | Create | Modify |
|---|---|---|
| `packages/domain` | `src/rank.ts` (`rankBetween`, `isRankKey`, `compareByRank`), `src/system-actors.ts` | `src/entity-state.ts` (`rank?`, `reopenedAt?`), `src/events/ticket-events.ts` (`ticketRankedPayload`), `src/ticket-state.ts` (reducer cases; `TICKET_EVENT_TYPES`), `src/events/workspace-settings.ts` (`autoCloseAfterDays`), `src/read-models.ts` (`TicketCard.rank`), `src/index.ts` |
| `packages/rule-engine` | `src/checks/rank.ts` | `src/refusal-rules.ts` (`rankRequiresBacklog`), `src/evaluate.ts` |
> **CORRECTED 2026-09-18, after Task 7 merged.** This table originally numbered Task 7's migration
> `1789300000000` and Task 6's `1789400000000` — an ordering that contradicts the plan's own task order,
> since Task 6 executes first. `node-pg-migrate`'s `checkOrder` refuses a migration whose prefix is lower
> than one already applied, so on the owner's dev stack Task 7's column could never be added:
> *"Not run migration 1789300000000_proj-tickets-reopened-at is preceding already run migration
> 1789400000000_workspace-settings-auto-close."* A fresh database was unaffected — it applies both in
> ascending order — which is why the forced gate, migrating fresh test databases, stayed green while the
> live stack broke. Renamed above `1789400000000`; both references above are updated to the delivered name.

| `apps/server` | `migrations/1789200000000_proj-tickets-rank.sql`, `migrations/1789500000000_proj-tickets-reopened-at.sql`, `migrations/1789400000000_workspace-settings-auto-close.sql`, `src/auto-close/sweep.ts` | `src/projections/tickets.ts`, `src/read/ticket-cards.ts`, `src/projections/workspace-settings.ts`, `src/ops/backup-daemon-main.ts` |
| `packages/app-core` | `src/views/bulk-close-dialog.tsx`, `src/views/backlog-rank.ts` (pure order helpers) | `src/view-types.ts` (`ListRow.rank`, `WorkspaceSettings`), `src/online/mappers.ts`, `src/replica/replica-data-source.ts`, `src/precheck.ts` (`precheckTicketRanked`), `src/provenance.ts` (`actorLabel` knows system actors), `src/views/ticket-list.tsx` (`rowDrag`, `selection`), `src/views/board.tsx` (`Close all (N)`), `src/index.ts` |
| `packages/ui` | — | `src/components/table.tsx` (`rowProps`), `src/components/dialog.tsx` (R4), `src/ui.css` |
| `apps/web` | `src/backlog-rank-controls.tsx`, `src/workspace-settings-form.tsx` | `app/w/[workspaceId]/p/[projectId]/page.tsx` (Backlog sort + rank controls; List selection + bulk close), `app/settings/page.tsx` (Workspace tab) |

Tasks 1–5 ship ranking; 6–8 auto-close; 9–11 bulk close; 12 closes the plan.

---

### Task 1: Domain — rank keys, `ticket.ranked`, `TicketState.rank`

**Files:**
- Create: `packages/domain/src/rank.ts`
- Modify: `packages/domain/src/entity-state.ts:47` (after `closed?`), `packages/domain/src/events/ticket-events.ts:174` (after `ticketReopenedPayload`), `packages/domain/src/ticket-state.ts:73-86` (`TICKET_EVENT_TYPES`) and `:277-281` (after the `ticket.reopened` case), `packages/domain/src/index.ts` (export `./rank.js`)
- Test: `packages/domain/test/rank.test.ts` (new), `packages/domain/test/ticket-state.test.ts` (find the `ticket.reopened` case's describe and add beside it)

**Interfaces:**
- Produces: `rankBetween(before: string | null, after: string | null): string`; `isRankKey(value: unknown): value is string`; `compareByRank(a: { rank: string | null; ticketId: string }, b: same): number`; `ticketRankedPayload = z.object({ rank: z.string().regex(RANK_KEY_REGEX) }).strict()`; `TicketState.rank?: string | null`; reducer: `ticket.ranked` sets `rank: p.rank`; `ticket.created` sets `rank: null`; `TICKET_EVENT_TYPES` gains `'ticket.ranked'` after `'ticket.reopened'`.

- [ ] **Step 1: Write the failing tests** — `packages/domain/test/rank.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareByRank, isRankKey, rankBetween } from '../src/rank.js';

describe('13.613 rankBetween yields a key strictly between its neighbours without touching them', () => {
  it('first key: (null, null) is a valid key', () => {
    const k = rankBetween(null, null);
    expect(isRankKey(k)).toBe(true);
  });
  it('after: (k, null) > k', () => {
    const k = rankBetween(null, null);
    expect(rankBetween(k, null) > k).toBe(true);
  });
  it('before: (null, k) < k', () => {
    const k = rankBetween(null, null);
    expect(rankBetween(null, k) < k).toBe(true);
  });
  it('between: a < (a, b) < b, and repeated insertion between the same pair keeps working 200 times', () => {
    let a = rankBetween(null, null);
    const b = rankBetween(a, null);
    for (let i = 0; i < 200; i += 1) {
      const m = rankBetween(a, b);
      expect(m > a && m < b).toBe(true);
      a = m;
    }
  });
  it('refuses a === b and a > b', () => {
    const a = rankBetween(null, null);
    expect(() => rankBetween(a, a)).toThrow(/strictly/);
    const b = rankBetween(a, null);
    expect(() => rankBetween(b, a)).toThrow(/strictly/);
  });
  it('isRankKey refuses the empty string, spaces, and characters outside the alphabet', () => {
    expect(isRankKey('')).toBe(false);
    expect(isRankKey('a b')).toBe(false);
    expect(isRankKey('Ä')).toBe(false);
    expect(isRankKey(42)).toBe(false);
  });
});

describe('13.614 compareByRank: ranked first (by key), unranked after (by ticketId)', () => {
  const r = (rank: string | null, ticketId: string) => ({ rank, ticketId });
  it('ranked before unranked, whatever the ids say', () => {
    expect(compareByRank(r('n', '01ZZZ'), r(null, '01AAA'))).toBeLessThan(0);
  });
  it('two ranked: by key', () => {
    expect(compareByRank(r('a', '01ZZZ'), r('b', '01AAA'))).toBeLessThan(0);
  });
  it('two unranked: by ticketId ascending (ULID = creation order)', () => {
    expect(compareByRank(r(null, '01AAA'), r(null, '01BBB'))).toBeLessThan(0);
  });
  it('sort is stable for equal keys (falls back to ticketId)', () => {
    expect(compareByRank(r('a', '01AAA'), r('a', '01BBB'))).toBeLessThan(0);
  });
});
```

And in `packages/domain/test/ticket-state.test.ts`, beside the `ticket.reopened` case (grep `case 'ticket.reopened'` / `describe.*reopened`), using the file's own `apply`/`created` helpers (read the reopened case and mirror its envelope construction exactly):

```ts
describe('13.615 ticket.ranked sets rank; ticket.created starts it null', () => {
  it('a created ticket has rank null', () => {
    const state = /* the file's created-ticket helper */;
    expect(state.rank ?? null).toBeNull();
  });
  it('ticket.ranked { rank } sets it and touches nothing else', () => {
    const before = /* created backlog ticket */;
    const after = applyTicketEvent(before, /* envelope type 'ticket.ranked', payload { rank: 'n' } */, deps);
    expect(after.rank).toBe('n');
    expect({ ...after, rank: undefined }).toEqual({ ...before, rank: undefined });
  });
  it('a malformed rank (space) throws at parse, the reducer never applies it', () => {
    expect(() => applyTicketEvent(before, /* payload { rank: 'a b' } */, deps)).toThrow();
  });
});
```

- [ ] **Step 2: RED** — `cd packages/domain && pnpm exec vitest run test/rank.test.ts test/ticket-state.test.ts 2>&1 | tail -6` under Node 22. Expected: the rank file fails on import (`rank.js` missing); the state cases fail on `'ticket.ranked'` being unknown.

- [ ] **Step 3: Implement** — `packages/domain/src/rank.ts`:

```ts
/**
 * Order-preserving fractional string keys (backlog/closed spec §8.1).
 *
 * A rank is a non-empty string over the alphabet `0-9a-z` (36 symbols, so
 * plain string comparison IS the order). `rankBetween` returns a key strictly
 * between its neighbours by extending the shorter side, so inserting between
 * the same two keys forever only lengthens the key — nobody else is ever
 * renumbered, which is what makes a reorder exactly ONE `ticket.ranked`.
 * Keys never end in `0` (a trailing `0` would equal its prefix under the
 * "shorter is smaller" rule and leave no room below it).
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;
export const RANK_KEY_REGEX = /^[0-9a-z]+$/;
const MID = ALPHABET[Math.floor(BASE / 2)] as string; // 'i'

export function isRankKey(value: unknown): value is string {
  return typeof value === 'string' && RANK_KEY_REGEX.test(value) && !value.endsWith('0');
}

function digit(key: string, index: number): number {
  return index < key.length ? ALPHABET.indexOf(key[index] as string) : 0;
}

/**
 * Strictly between `before` and `after`; `null` means "no neighbour on that
 * side". Throws when `before >= after` — the caller's neighbours are wrong,
 * and a silent answer here would corrupt the shared order.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before === null && after === null) return MID;
  if (before !== null && after !== null && before >= after) {
    throw new Error(`rankBetween: neighbours must be strictly ordered (got "${before}" >= "${after}")`);
  }
  const lo = before ?? '';
  const hi = after ?? '';
  // Once `hi` has diverged upward from `lo` at some digit (gap exactly 1), it
  // no longer binds any later digit — the upper bound below that point is
  // BASE (open above). With no `after` at all it is open from the start.
  let hiOpen = after === null;
  let out = '';
  for (let i = 0; ; i += 1) {
    const l = digit(lo, i);
    const h = hiOpen ? BASE : digit(hi, i);
    if (h - l > 1) return out + ALPHABET[l + Math.floor((h - l) / 2)];
    out += ALPHABET[l];
    if (h - l === 1) hiOpen = true;
    // h === l: both share this digit; keep descending with `hi` still binding.
  }
}

export function compareByRank(
  a: { rank: string | null; ticketId: string },
  b: { rank: string | null; ticketId: string },
): number {
  if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  if (a.rank !== null && b.rank === null) return -1;
  if (a.rank === null && b.rank !== null) return 1;
  return a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0;
}
```

This algorithm was fuzzed by the plan's author (3,000 random insertions between random neighbours, every key valid and the sequence strictly sorted; keys stay ≤ 6 characters under random insertion and grow by one per repeated insertion between the same pair). The midpoint digit is always ≥ 1, so a returned key never ends in `0`. Ship it as written; 13.613 pins it.

Then: `entity-state.ts` — after `closed?`, with a docblock in the same voice ("OPTIONAL here, and only here, because … test literals predate it"):

```ts
  /** The backlog rank key (spec §8.1): set by `ticket.ranked`, `null` until then. Meaningful only within the ticket's project. */
  rank?: string | null;
```

`ticket-events.ts` — `export const ticketRankedPayload = z.object({ rank: z.string().regex(RANK_KEY_REGEX) }).strict();` (import `RANK_KEY_REGEX` from `../rank.js`); register the type in the events registry the way `ticket.closed` is (grep `'ticket.closed'` in the file and in `packages/domain/src/registry.ts` or wherever the type→schema map lives; mirror every line).

`ticket-state.ts` — `TICKET_EVENT_TYPES` gains `'ticket.ranked'`; creation sets `rank: null`; new case:

```ts
    case 'ticket.ranked': {
      // Backlog-only is the engine's door (checkTicketRanked); this fold only
      // replays what the engine accepted, per this function's header.
      const p = ticketRankedPayload.parse(env.payload);
      return { ...state, rank: p.rank };
    }
```

- [ ] **Step 4: GREEN** — the two files, then the whole `packages/domain` suite; `pnpm run typecheck` (`EXIT=0`).
- [ ] **Step 5: Mutation** — make `rankBetween(a, b)` return `a` → 13.613's "between" case fails; restore via cp/sha256.
- [ ] **Step 6: Record** 13.613–13.615 ✅ with citations under `### Second wave (spec §8)`; `Features.md`: ⚙️ bullet "Backlog rank keys (`rankBetween`) and `ticket.ranked`" under the domain section. Commit: `Second wave Task 1: rank keys, ticket.ranked, TicketState.rank`.

---

### Task 2: Engine + precheck — `rank-requires-backlog`

**Files:**
- Create: `packages/rule-engine/src/checks/rank.ts`
- Modify: `packages/rule-engine/src/refusal-rules.ts:28` (after `closedTicket`), `packages/rule-engine/src/evaluate.ts:46` (after the `ticket.reopened` arm), `packages/app-core/src/precheck.ts:112` (dispatch) and after `precheckTicketReopened` (`:342-360`)
- Test: `packages/rule-engine/test/close.test.ts`'s sibling — create `packages/rule-engine/test/rank.test.ts` modelled on it; `packages/app-core/test/precheck.test.ts` (13.583's describe is the model; the 13.604 agreement case gains the fifth reason)

**Interfaces:**
- Consumes: `ticketRankedPayload`, `BACKLOG_STATE_ID`, `statesWithBacklog` from `@gisik-nokma/domain`.
- Produces: `REFUSAL_RULES.rankRequiresBacklog = 'rank-requires-backlog'`; `checkTicketRanked(env, ctx)`; `precheckTicketRanked(submitted, cache)`.

- [ ] **Step 1: Tests** — `packages/rule-engine/test/rank.test.ts` (copy `close.test.ts`'s harness — the `ctx` builder with `getTicketState`/`getWorkflowDef` and the envelope helper):

```ts
describe('13.616 ticket.ranked is accepted only for a backlog ticket', () => {
  it('a backlog ticket with a valid key: accept', async () => {
    const r = await checkTicketRanked(envelope('ticket.ranked', { rank: 'i' }), ctxWith(backlogTicket));
    expect(r).toEqual({ refused: false });
  });
  it('a ticket in "To do": refused rank-requires-backlog with the state NAME', async () => {
    const r = await checkTicketRanked(envelope('ticket.ranked', { rank: 'i' }), ctxWith(todoTicket));
    expect(r).toEqual({ refused: true, rule: 'rank-requires-backlog', reason: 'Only a backlog ticket can be ranked; this one is in "To do".' });
  });
  it('unknown def: the reason falls back to the state id', async () => { /* getWorkflowDef → null; reason ends `in "todo".` */ });
  it('malformed key (space): malformed-payload, prefixed "This ticket.ranked event\'s payload is malformed:"', async () => { /* … */ });
  it('unknown ticket: unknown-ticket', async () => { /* … */ });
  it('a closed ticket cannot be in backlog, but a rank on a closed ticket is refused by the backlog check, not silently accepted', async () => { /* terminal closed ticket → rank-requires-backlog */ });
});
```

`packages/app-core/test/precheck.test.ts` — beside 13.583: `13.617` — `precheckEvent` on a `ticket.ranked` for a backlog ticket in the cache → `{ kind: 'would-commit' }` (or whatever 13.583 asserts for accept); for a `todo` ticket → the refusal with the identical reason; and extend 13.604's agreement table with `rank-requires-backlog` (drive both `evaluateEvent` and `precheckEvent`, assert byte-identical reasons).

- [ ] **Step 2: RED** under Node 22 (both packages).
- [ ] **Step 3: Implement** — `checks/rank.ts` mirrors `close.ts` line for line (kind guard, `safeParse` with `malformedPayloadDetail`, `getTicketState`, then `if (ticket.stateId !== BACKLOG_STATE_ID)` → resolve `stateName` via `statesWithBacklog(def)` → `refuse(REFUSAL_RULES.rankRequiresBacklog, \`Only a backlog ticket can be ranked; this one is in "${stateName}".\`)`). `evaluate.ts`: `case 'ticket.ranked': return checkTicketRanked(env, ctx);`. `precheck.ts`: `if (submitted.type === 'ticket.ranked') return precheckTicketRanked(submitted, cache);` and a `precheckTicketRanked` in the exact shape of `precheckTicketClosed` (`:315-341`) producing the same reason string — if Task 12 of the core exported reason constants, use them; if not (the core's Ruling 54 chose an agreement test), keep the literal and rely on 13.604's extension.
- [ ] **Step 4: GREEN**; whole `packages/rule-engine` and `packages/app-core` suites; both typechecks; `pnpm --filter @gisik-nokma/app-core build`.
- [ ] **Step 5: Mutation** — drop the backlog check → 13.616's "To do" case fails.
- [ ] **Step 6: Record** 13.616–13.617; `Features.md` ⚙️ "Engine: `rank-requires-backlog`" in the refusals bullet (and hedge the fixture-suite bullet as the core did: not yet in the fixture suite). Commit: `Second wave Task 2: rank-requires-backlog in the engine and the precheck`.

---

### Task 3: Server + wire — `proj_tickets.rank`, `ListRow.rank`/`TicketCard.rank`, the mapper, the replica

**Files:**
- Create: `apps/server/migrations/1789200000000_proj-tickets-rank.sql`
- Modify: `apps/server/src/projections/tickets.ts:151-155` (`rowToTicketState`), `:200-218` (the INSERT — `$16` and the ON CONFLICT list), `apps/server/src/read/ticket-cards.ts:38-41` (`PROJ_TICKET_COLUMNS` gains `t.rank`) and the assembler (`rank: row.rank`), `packages/domain/src/read-models.ts:196` (`TicketCard.rank: string | null` after `closed`), `packages/app-core/src/view-types.ts:230` (`ListRow.rank: string | null`), `packages/app-core/src/online/mappers.ts:1306` and `:1477` (`rank: mapRank(record['rank'], …)` beside `closed` — BOTH `mapListRow` and `mapTicketState`), `packages/app-core/src/replica/replica-data-source.ts:752` (`rank: state.rank ?? null`), `apps/server/src/sync/sync-routes.ts` docblock (13 event types)
- Test: `apps/server/test/projections/tickets-closed.test.ts` (the core's Task 4 file — add a sibling describe, or create `tickets-rank.test.ts` in its shape), `packages/app-core/test/online/mappers.test.ts` (grep `mapClosed`/`13.603` — add beside), `packages/app-core/test/replica/*.test.ts` where 13.584 lives

**Interfaces:**
- Produces: `rank: string | null` REQUIRED on `TicketCard` and `ListRow`; `mapRank(raw: unknown, path: string): string | null` (a string matching `RANK_KEY_REGEX` or `null`; anything else throws the mappers' usual shape error).

- [ ] **Step 1: Tests** — server: `13.618` a `ticket.ranked` ingested for a backlog ticket lands `rank = 'i'` on `proj_tickets`; a later `ticket.created` row starts `rank NULL`; the migration's Down drops the column (the core's `1789100000000` test shape). Mapper: `13.619` — `mapListRow` with `rank: 'i'` → `'i'`; `rank: null` → `null`; `rank: 'a b'` → throws naming `.rank`; and `mapTicketState` likewise (this is the wire round-trip case the Global Constraints demand — name it so in the docblock). Replica: `13.620` — the replica's `getTickets` row carries `rank` from the folded state.
- [ ] **Step 2: RED**. **Step 3: Implement** (migration Up: `ALTER TABLE proj_tickets ADD COLUMN rank text NULL;` with a `COMMENT ON COLUMN` in the core migration's voice; Down: drop). Every `ListRow`/`TicketCard` literal in tests across packages gains `rank: null` — `tsc` finds them; the core's Task 4 report lists the fixture files it touched for `closed` (`.superpowers/sdd/2026-09-17-backlog-and-closed-core/task-4-report.md`), the same set applies.
- [ ] **Step 4: GREEN** — `apps/server` (Postgres up: `dispatch-context.md:24` of the core plan's workspace names the URL), `packages/app-core`, `packages/domain` typecheck, `apps/web` typecheck + its suite (fixtures).
- [ ] **Step 5: Mutation** — drop `rank:` from `mapListRow` → 13.619 fails.
- [ ] **Step 6: Record** 13.618–13.620; `Features.md` ⚙️ "proj_tickets.rank; ListRow.rank". Commit: `Second wave Task 3: rank projected and carried on the wire`.

---

### Task 4: `Table`/`TicketList` — row drag plumbing and a tail drop zone

**Files:**
- Modify: `packages/ui/src/components/table.tsx:35-46` (`rowProps?: (row: Row) => HTMLAttributes<HTMLTableRowElement>` spread onto each `<tr>` AFTER the built-ins so `className` composes — read `:70-95`), `packages/app-core/src/views/ticket-list.tsx:70-112` (props) and `:455-480` (the table), `packages/ui/src/ui.css` (`.gn-list__row--dragging`, `.gn-list__tail-drop`, `.gn-list__row--drop-before` — token colours only)
- Test: `packages/ui/test/components.test.tsx` (Table `rowProps`), `packages/app-core/test/views/ticket-list.test.tsx`

**Interfaces:**
- Produces on `TicketList`: `rowDrag?: { onReorder: (movedTicketId: string, beforeTicketId: string | null) => void }`. When present: every `<tr>` is `draggable`, `dragstart` writes the row's `ticketId` into `dataTransfer` under `DRAG_TICKET_FORMAT` (exported from `board.tsx:179` — import it; do not redeclare), `dragover` calls `preventDefault()` and marks the row `gn-list__row--drop-before`, `drop` on a row calls `onReorder(dragged, row.ticketId)`, and a tail zone (`<div className="gn-list__tail-drop" aria-hidden="true">` after the table, only when `rowDrag` is set) accepts a drop as `onReorder(dragged, null)` = "place last". Handlers are registered on the row itself (React props), which is synchronous on paint — no registry needed; note 13.534's lesson in the docblock (a passive `useEffect` registry was the flake; row props are not one).
- `beforeTicketId === movedTicketId` is ignored (a no-op drop on itself).

- [ ] **Step 1: Tests** — `13.621` (`ticket-list.test.tsx`): with `rowDrag`, rows are `draggable`; a `dragstart` on row B then `drop` on row A calls `onReorder('B', 'A')`; a drop on the tail zone calls `onReorder('B', null)`; a drop on B itself calls nothing; WITHOUT `rowDrag` no row is draggable and no tail zone renders (`querySelector('.gn-list__tail-drop')` null). Drive `dragstart`/`dragover`/`drop` with `fireEvent` carrying a `dataTransfer` stub (`{ setData, getData, effectAllowed, dropEffect }`) — `board-moves-ui.test.tsx` has one; copy it. `13.621a` (`components.test.tsx`): `Table` spreads `rowProps` (a `data-x` attribute lands on the `<tr>`; a `className` in `rowProps` is APPENDED to `gn-table__row`).
- [ ] **Step 2: RED**. **Step 3: Implement**. **Step 4: GREEN** — `packages/ui` suite (token scan) and `packages/app-core` suite; typechecks; app-core build.
- [ ] **Step 5: Mutation** — drop the `preventDefault()` in `dragover` → the drop case in 13.621 fails (jsdom refuses the drop exactly as a browser does — if jsdom does NOT enforce it, say so in the report and instead mutate the `getData` read → the callback gets `''`).
- [ ] **Step 6: Record** 13.621, 13.621a; `Features.md` ⚙️ "TicketList row drag (`rowDrag`)". Commit: `Second wave Task 4: TicketList row drag plumbing and tail drop zone`.

---

### Task 5: Backlog tab — rank order, drag reorder, Move up / Move down

**Files:**
- Create: `packages/app-core/src/views/backlog-rank.ts` (pure: `sortByRank(rows)`, `neighboursFor(sorted, movedId, beforeId | null)` → `{ before: string | null; after: string | null }`, `moveTarget(sorted, movedId, 'up' | 'down')` → `beforeId | null | undefined` (undefined = already at the edge)), `apps/web/src/backlog-rank-controls.tsx`
- Modify: `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — the Backlog arm (`view === 'backlog'`, ~`:1749`): `rows={sortByRank(backlogNarrowing.rows)}`, `rowDrag` and the rank controls composed with `BacklogStartButton` in `rowAction`; an optimistic order override state `rankOverrides: Map<ticketId, rank>` applied before sorting and cleared on `list.reload()`
- Test: `packages/app-core/test/views/backlog-rank.test.ts` (new), `apps/web/test/backlog-tab.test.tsx` (extend)

**Interfaces:**
- Consumes: `rankBetween`, `compareByRank` (Task 1); `rowDrag` (Task 4); `make`/`dataSource.ingest` as `backlog-start-button.tsx` does (same latch, same `finally`, same Ruling-27 split: refused → `gn-refusal--server` with `Refused by the server — <rule>: <reason>`; silence → `The server did not answer this move.`; rejection → `We could not reach the server for this move — <message>`).
- Produces: `BacklogRankControls({ row, sorted, dataSource, workspaceId, currentUserId, onRanked, onOptimistic })` rendering two buttons `Move up` / `Move down` (`aria-label` `Move <title> up` / `Move <title> down`, the first disabled at the top, the second at the bottom) and the row's notice; the page's `onReorder(moved, before)` from `rowDrag` goes through the SAME `submitRank(moved, before)` function the buttons use.

- [ ] **Step 1: Tests** — `backlog-rank.test.ts` `13.622`: `sortByRank` orders ranked-then-unranked-by-id; `neighboursFor(sorted, 'C', 'A')` → `{ before: rank of the row above A (or null), after: A.rank }`; `neighboursFor(sorted, 'C', null)` → `{ before: last.rank, after: null }` (if the last row is unranked, `before` is the last RANKED row's key — unranked rows have no key to sit after; state this in the docblock); `moveTarget(sorted, first, 'up')` → `undefined`; `moveTarget(sorted, second, 'up')` → first's id; `moveTarget(sorted, last, 'down')` → `undefined`; `moveTarget(sorted, x, 'down')` → the id of the row two below x (place before it) or `null` when x is second-to-last (place last). `backlog-tab.test.tsx` `13.623`: rows render in rank order (fixture: ranks `'n'`, `null`, `'g'` → order `'g'`, `'n'`, unranked); `Move <title> down` on the first row ingests exactly one `ticket.ranked` whose `rank` is strictly between the current second and third keys (assert with `>`/`<` on the captured payload, not a literal), the row moves optimistically (its position in `getAllByRole('row')` changes before the stub answers) and `list.reload` follows; a refused answer snaps the order back and the notice shows the reason. `13.624`: a drag of row 3 dropped on row 1 ingests `ticket.ranked` with a key `< row 1's key`; a drop on the tail zone yields a key `> the last ranked key`. `13.625`: `Move up` on the first row and `Move down` on the last are `disabled`.
- [ ] **Step 2: RED**. **Step 3: Implement** — `submitRank`: compute `{ before, after }`, `rank = rankBetween(before, after)`, set the optimistic override, ingest `ticket.ranked { rank }`, on `committed` → `list.reload()` (the reload clears overrides), on refusal/transport → clear the override (snap back) + notice.
- [ ] **Step 4: GREEN** — `apps/web` whole suite + typecheck; `packages/app-core` suite (the helper file).
- [ ] **Step 5: Mutations** — `neighboursFor` returning `{ before: after, after: before }` → 13.622 fails; `submitRank` ingesting `rank: before ?? 'i'` → 13.623's between-assertion fails.
- [ ] **Step 6: Record** 13.622–13.625; `Features.md` ✅ "Backlog ranking: drag to reorder, Move up/down". Commit: `Second wave Task 5: Backlog tab rank order, drag reorder, Move up/down`.

---

### Task 6: `autoCloseAfterDays` — setting, projection, wire, and the Workspace settings tab

**Files:**
- Create: `apps/server/migrations/1789400000000_workspace-settings-auto-close.sql` (`ALTER TABLE proj_workspace_settings ADD COLUMN auto_close_after_days integer NULL;` + COMMENT; Down drops), `apps/web/src/workspace-settings-form.tsx`
- Modify: `packages/domain/src/events/workspace-settings.ts` (schema: `autoCloseAfterDays: z.number().int().min(1).max(365).nullable().optional()` — `null` = off; the `.refine` accepts a claim that sets only this field; `WorkspaceSettings.autoCloseAfterDays: number | null`; `DEFAULT_AUTO_CLOSE_AFTER_DAYS = null`), `apps/server/src/projections/workspace-settings.ts:66-80` (INSERT/COALESCE — note `COALESCE` cannot distinguish "set to null" from "not set": store a sentinel? NO — use a separate `auto_close_set boolean` column? NO — simplest honest shape: the projection writes `auto_close_after_days = CASE WHEN $n_present THEN $n ELSE proj.auto_close_after_days END` with a boolean parameter `autoCloseTouched = payload.autoCloseAfterDays !== undefined`; say so in the docblock) and `:112-140` (`getWorkspaceSettings` returns it), `packages/app-core/src/view-types.ts` / `online/mappers.ts` (`mapWorkspaceSettings` gains it; grep `staleDays` in mappers), `apps/web/app/settings/page.tsx:12-15,161-211` (`SettingsTab` gains `'workspace'`, a third sidebar link `Workspace`, the arm renders `WorkspaceSettingsForm`)
- Test: `packages/domain/test/*settings*.test.ts`, `apps/server/test/projections/workspace-settings.test.ts` (grep `stale_days`), `packages/app-core/test/online/mappers.test.ts`, `apps/web/test/settings-page.test.tsx`

**Interfaces:**
- Produces: `WorkspaceSettings.autoCloseAfterDays: number | null` end to end; the settings read the web app already performs for the attention strip carries it; `WorkspaceSettingsForm({ dataSource, workspaceId, settings, canEdit, onSaved })` renders three labelled number inputs (`Stale after` / `Due soon within` / `Auto-close after`, unit `days`; the auto-close input has an `Off` checkbox that sends `null`), one Save that ingests ONE `workspace.settings_set` carrying only the fields that changed; refusal in a `gn-refusal--server` notice; non-admins see the values read-only with the sentence `Only a workspace admin can change these.`

- [ ] **Step 1: Tests** — domain `13.626`: the schema accepts `{ autoCloseAfterDays: 30 }` alone, `{ autoCloseAfterDays: null }` alone, refuses `0` and `366` and a claim with no field. Projection `13.627`: a claim setting only `autoCloseAfterDays` leaves `stale_days` untouched; a later claim setting it to `null` clears it (the CASE shape — this is the assertion `COALESCE` would fail); `getWorkspaceSettings` returns `autoCloseAfterDays: null` for a workspace with no row. Mapper `13.628`: `mapWorkspaceSettings` carries `autoCloseAfterDays` (number and null). Web `13.629`: `/settings?tab=workspace` renders the three inputs with the current values; changing `Auto-close after` to `14` and saving ingests `workspace.settings_set { autoCloseAfterDays: 14 }` and nothing else; ticking `Off` sends `null`; a member sees the read-only sentence and no Save.
- [ ] **Step 2: RED**. **Step 3: Implement**. **Step 4: GREEN** — domain, server (Postgres), app-core, web suites + typechecks.
- [ ] **Step 5: Mutation** — projection: replace the CASE with `COALESCE` → 13.627's clear-to-null case fails.
- [ ] **Step 6: Record** 13.626–13.629; `Features.md` ✅ "Workspace settings tab: stale / due-soon / auto-close days". Commit: `Second wave Task 6: autoCloseAfterDays setting, projection, wire, Workspace settings tab`.

---

### Task 7: `reopenedAt`, the reserved auto-close actor, and its name

**Files:**
- Create: `packages/domain/src/system-actors.ts`, `apps/server/migrations/1789500000000_proj-tickets-reopened-at.sql`
- Modify: `packages/domain/src/entity-state.ts` (`reopenedAt?: string | null`), `packages/domain/src/ticket-state.ts` (`ticket.reopened` sets `reopenedAt: env.serverTime`; `ticket.transitioned` sets `reopenedAt: null`; `ticket.created` sets `null`), `apps/server/src/projections/tickets.ts` (`reopened_at`, `$17`), `apps/server/src/read/ticket-cards.ts` (`t.reopened_at` in `PROJ_TICKET_COLUMNS`; `rowToTicketState` carries it — the assembler's `TicketCard` does NOT: it is a sweep input, not a card field), `packages/app-core/src/online/mappers.ts` (`mapTicketState` reads `reopenedAt ?? null`), `packages/app-core/src/replica/replica-data-source.ts` (the folded state already carries it via the shared reducer — confirm, no change expected), `packages/app-core/src/provenance.ts:9-12` (`actorLabel` consults `SYSTEM_ACTOR_NAMES` before the roster), `packages/domain/src/index.ts`
- Test: `packages/domain/test/ticket-state.test.ts`, `apps/server/test/projections/tickets-closed.test.ts` (sibling describe), `packages/app-core/test/online/mappers.test.ts`, `packages/app-core/test/provenance.test.ts` (grep `actorLabel`), `packages/app-core/test/views/ticket-sheet.test.tsx` (13.585's neighbour)

**Interfaces:**
- Produces: `SYSTEM_ACTOR_AUTO_CLOSE = '00000000000000000000SYS0AC'` (matches `ULID_REGEX` `/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/` — 20 zeros + `SYS0AC`; the docblock says why it is reserved and that no user row ever carries it); `SYSTEM_ACTOR_NAMES: ReadonlyMap<string, string>` = `{ [SYSTEM_ACTOR_AUTO_CLOSE]: 'Auto-close' }`; `isSystemActor(id)`; `actorLabel(actorId, actorName)` returns the system name FIRST, then the roster name, then the id; `TicketState.reopenedAt?: string | null`; `proj_tickets.reopened_at timestamptz NULL`.

- [ ] **Step 1: Tests** — `13.630` (domain): `ticket.reopened` sets `reopenedAt` to the envelope's server time; a following `ticket.transitioned` (any target, including back into the same terminal state) clears it; `ticket.created` starts it null. `13.631` (server projection): `reopened_at` follows. `13.632` (mapper): `mapTicketState` carries `reopenedAt` (string and null). `13.633` (provenance): `actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, null)` → `'Auto-close'`; `actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, 'Someone')` → still `'Auto-close'` (the roster cannot rename a system actor); a real id with a roster name → the name. `13.634` (sheet): a ticket closed by `SYSTEM_ACTOR_AUTO_CLOSE` renders the badge `Closed by Auto-close on <date>` (13.585's fixture with the actor swapped; the date rendering exactly as 13.585/13.586 assert it).
- [ ] **Step 2: RED**. **Step 3: Implement**. **Step 4: GREEN** — domain, server, app-core suites + typechecks; app-core build; apps/web typecheck.
- [ ] **Step 5: Mutation** — remove the `reopenedAt: null` from the transitioned case → 13.630's clear case fails; remove the system-name lookup → 13.633 fails.
- [ ] **Step 6: Record** 13.630–13.634; `Features.md` ⚙️ "`reopenedAt`; reserved system actor `Auto-close`". Commit: `Second wave Task 7: reopenedAt, the Auto-close system actor, actorLabel`.

---

### Task 8: The auto-close sweep and its daemon job

**Files:**
- Create: `apps/server/src/auto-close/sweep.ts`
- Modify: `apps/server/src/ops/backup-daemon-main.ts:134-137` (env `AUTO_CLOSE_SWEEP_INTERVAL_MS`, default `'3600000'`, the same empty-string handling as `NOTIFICATION_SWEEP_INTERVAL_MS`) and `:185-206` (a fourth `ScheduledJob` `auto-close`), plus the daemon constructs `createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() })` exactly as `apps/server/src/seed/cli-seed-dev-workspace.ts:47` does
- Test: `apps/server/test/auto-close/sweep.test.ts` (new; model on `apps/server/test/notifications/sweep.test.ts` — Postgres, real ingest)

**Interfaces:**
- Consumes: `getWorkspaceSettings` (Task 6), `SYSTEM_ACTOR_AUTO_CLOSE` (Task 7), `isoDatePlusDays` (exported, `notifications/sweep.ts:98`) and `istDayOf`/`istDayBounds` (both exported from `@gisik-nokma/domain`, as `sweep.ts:1-8` imports them), `IngestService.ingestBatch`.
- Produces: `runAutoCloseSweep(deps: { pool: Queryable; ingest: Pick<IngestService, 'ingestBatch'>; now?: () => Date; log?: … }): Promise<AutoCloseReport>` with `AutoCloseReport = { workspacesOn: number; candidates: number; closed: number; refused: number }`.

- [ ] **Step 1: Tests** — `13.635`: workspace with `autoCloseAfterDays: 7`; ticket A entered `done` 8 IST days ago (drive time through `now` and the events' `server_time` — the notification sweep test shows how it backdates), ticket B entered `done` 3 days ago, ticket C in `doing` for 30 days, ticket D closed already, ticket E reopened (`reopened_at` set) 30 days ago and untouched: after the sweep only A is closed — `closed_by = SYSTEM_ACTOR_AUTO_CLOSE`, one `ticket.closed` event in the ledger with `actor_id` = the system actor and `origin = 'server'`; report `{ workspacesOn: 1, candidates: 1, closed: 1, refused: 0 }`. `13.636`: a workspace with the setting `null` contributes nothing (`workspacesOn: 0`). `13.637`: E transitioned again (back into `done`, 10 days ago) is closed on the next sweep — the transition re-armed the clock (its `reopened_at` is null again). `13.638`: the sweep goes through the engine — a candidate whose `ticket.closed` the engine refuses (construct one: make it non-terminal between selection and ingest by transitioning it in the test after the SELECT would have run — or simpler, assert that the sweep's ingest goes through `ingestBatch` by counting ledger rows rather than projection writes: the projection's `closed_at` is set ONLY because the event committed — delete the event row in a transaction and confirm the projection rebuild clears it; choose the honest one and say which) is counted in `refused` and left open. `13.639`: the daemon job's interval is validated by `requirePositiveIntervalMs` (`AUTO_CLOSE_SWEEP_INTERVAL_MS=0` throws with that name — the notification sweep has this test shape).
- [ ] **Step 2: RED**. **Step 3: Implement** — the SELECT mirrors `notifications/sweep.ts:227-243` with `t.state_category = 'terminal' AND t.closed_at IS NULL AND t.reopened_at IS NULL AND entered.server_time < $cutoff` where `cutoff = istDayBounds(isoDatePlusDays(todayIst, -N)).endUtc`; one `ticket.closed` per row built with `actorId: SYSTEM_ACTOR_AUTO_CLOSE, origin: 'server', payload: {}` in the envelope shape `invites/acceptance.ts:138-146` uses; ingested in batches of 100 via `ingestBatch`; results counted.
- [ ] **Step 4: GREEN** — `apps/server` suite (Postgres) + typecheck.
- [ ] **Step 5: Mutation** — drop `AND t.reopened_at IS NULL` → 13.635 closes E too and fails.
- [ ] **Step 6: Record** 13.635–13.639; `Features.md` ✅ "Auto-close after N days (daemon job `auto-close`, `AUTO_CLOSE_SWEEP_INTERVAL_MS`)". Commit: `Second wave Task 8: the auto-close sweep and its daemon job`.

---

### Task 9: `BulkCloseDialog` — one dialog, N `ticket.closed` in one batch

**Files:**
- Create: `packages/app-core/src/views/bulk-close-dialog.tsx`
- Modify: `packages/ui/src/components/dialog.tsx:26` (R4: `aria-label="Close dialog"`), `packages/ui/test/components.test.tsx` (its Dialog dismiss query), `packages/app-core/src/index.ts` (export)
- Test: `packages/app-core/test/views/bulk-close-dialog.test.tsx` (new; harness from `ticket-sheet.test.tsx` — `createFakeDataSource` with an `ingestScript` answering per event)

**Interfaces:**
- Produces: `BulkCloseDialog({ open, tickets: Array<{ ticketId: string; title: string }>, dataSource, workspaceId, currentUserId, onClose, onClosed: (closedIds: string[]) => void })`. Title `Close ${n} tickets` (singular `Close 1 ticket`); the body lists every title (`<ul>`); a confirm button `Close ${n} tickets` (same singular rule) and `Cancel`; confirming ingests ONE batch of N `ticket.closed` (`payload: {}`, one `make(...)` per ticket, in the listed order); `submitting` latch reset in `finally`; the results are read BY INDEX (the core's Ruling 37 shape): committed ids go to `onClosed`; refused ones stay listed under the heading `Could not close` with `<title> — <reason>` per row; a rejected promise or a short results array → `gn-refusal--transport` with `We could not reach the server for this close — <message>` / `The server did not answer this close.` and nothing reported closed. `Escape`/scrim close the dialog as `Dialog` already does.

- [ ] **Step 1: Tests** — `13.640`: three tickets; confirm → the fake's ingest receives ONE call with three `ticket.closed` envelopes in order, entities matching; `onClosed(['a','b','c'])`. `13.641`: the script refuses the second (`close-requires-terminal`, reason X) → `onClosed(['a','c'])`, the dialog stays open, `Could not close` lists `B — X`, the confirm button is gone (nothing left to try) — or reads `Close 0 tickets` disabled; pick the former and assert it. `13.642`: a rejected ingest → the amber notice, `onClosed` not called, confirm enabled again. `13.643` (`components.test.tsx`): the Dialog dismiss's accessible name is `Close dialog` and `getByRole('button', { name: 'Close' })` inside a dialog whose body has a `Close` button finds exactly one.
- [ ] **Step 2: RED**. **Step 3: Implement**. **Step 4: GREEN** — `packages/ui` and `packages/app-core` suites, typechecks, build; `apps/web` suite (any test querying the Dialog dismiss by `Close` must move to `Close dialog` — grep first).
- [ ] **Step 5: Mutation** — ingest one call per ticket instead of one batch → 13.640's single-call assertion fails.
- [ ] **Step 6: Record** 13.640–13.643; `Features.md` ⚙️ "`BulkCloseDialog`". Commit: `Second wave Task 9: BulkCloseDialog; Dialog dismiss is "Close dialog"`.

---

### Task 10: Board — `Close all (N)` on a terminal column

**Files:**
- Modify: `packages/app-core/src/views/board.tsx:361-420` (`BoardGroupSection` — the `<header className="gn-board__column-header">`: when the column's `category === 'terminal'`, `moves` is wired, and `column.cards.length > 0`, a `<button type="button" className="gn-board__column-action" aria-label={\`Close all ${n} in ${column.name}\`}>Close all ({n})</button>`; `Board` owns `bulkClose: { tickets } | null` state and renders `BulkCloseDialog` once, `onClosed` → `moves.onMoved()`), `packages/ui/src/ui.css` (`.gn-board__column-action` reusing `.gn-board-card__close`'s metrics)
- Test: `packages/app-core/test/views/board-close.test.tsx` (extend — Task 8 of the core is the model)

**Interfaces:**
- Consumes: `BulkCloseDialog` (Task 9); `BoardGroupSection` already receives `moves`-derived `arrows`/`onDropCard`; thread a `bulkCloseFor: ((column) => void) | null` the same way `onDropCard` is threaded (`null` on the `moves`-less path).

- [ ] **Step 1: Tests** — `13.644`: a `done` column with two cards shows `Close all (2)`; a `doing` column shows nothing; with `moves` absent nothing renders anywhere; clicking opens the dialog listing both titles; confirming ingests two `ticket.closed` in one call and `onMoved` is called once. `13.645`: an empty `done` column shows no button. `13.646`: a click on `Close all` never opens a ticket (the header is outside `BoardCardSlot`, but assert it: the open handler is not called).
- [ ] **Step 2: RED**. **Step 3: Implement**. **Step 4: GREEN** — app-core suite, typecheck, build; `packages/ui` suite (CSS).
- [ ] **Step 5: Mutation** — render the button regardless of category → 13.644's `doing` negative fails.
- [ ] **Step 6: Record** 13.644–13.646; `Features.md` ✅ "Close all (N) on a terminal board column". Commit: `Second wave Task 10: Close all (N) on terminal board columns`.

---

### Task 11: List — row checkboxes and `Close selected (N)`

**Files:**
- Modify: `packages/app-core/src/views/ticket-list.tsx` (`selection?: { selected: ReadonlySet<string>; onToggle: (ticketId: string) => void }` → a leading checkbox column (`<input type="checkbox" aria-label={\`Select ${row.title}\`}>`), and a `controls?: ReactNode` slot rendered in `.gn-list__controls` after the summary), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` (List arm only: `selectedIds` state, cleared on `list.reload`; `controls` = `<button type="button" disabled={!allTerminalOpen || n === 0}>Close selected ({n})</button>` where `allTerminalOpen` = every selected row has `stateCategory === 'terminal'` and `closed === null`; clicking opens `BulkCloseDialog` with the selected rows; `onClosed` → `list.reload()`; signed-in gate as the Backlog arm's `rowAction`), `packages/ui/src/ui.css` (`.gn-list__select` cell)
- Test: `packages/app-core/test/views/ticket-list.test.tsx`, `apps/web/test/backlog-tab.test.tsx`'s sibling — create `apps/web/test/list-bulk-close.test.tsx` modelled on it

**Interfaces:**
- Consumes: `BulkCloseDialog` (Task 9).
- Produces: the two `TicketList` props above; without `selection` no checkbox column renders (13.597's column-count invariant — the `<thead>`/`<tbody>` mismatch rule in the file's docblock — still holds: the checkbox column is added to `columns` the way `rowAction`'s is).

- [ ] **Step 1: Tests** — `13.647` (`ticket-list.test.tsx`): with `selection`, every row has a checkbox named `Select <title>`; toggling calls `onToggle(id)`; checked state follows `selected`; without `selection` no checkbox renders. `13.648` (`list-bulk-close.test.tsx`): fixture rows — two `done` open, one `done` closed, one `doing`; selecting the two open `done` rows enables `Close selected (2)`; adding the `doing` row disables it; adding the closed row disables it; with the two selected, clicking opens the dialog with their titles, confirming ingests two `ticket.closed` in one call, `list.reload` follows and the selection is empty afterwards. `13.649`: signed-out session → no checkboxes, no control.
- [ ] **Step 2: RED**. **Step 3: Implement**. **Step 4: GREEN** — app-core suite/typecheck/build; `packages/ui` suite; `apps/web` suite + typecheck.
- [ ] **Step 5: Mutation** — drop the `closed === null` term → 13.648's closed-row negative fails.
- [ ] **Step 6: Record** 13.647–13.649; `Features.md` ✅ "Close selected (N) from the List". Commit: `Second wave Task 11: List selection and Close selected (N)`.

---

### Task 12: Final gate, catalogue checks, citation sweep, spec amendments

- [ ] Sweep scope = `git diff --numstat <pre-plan commit>..HEAD -- '*.ts' '*.tsx' '*.css' '*.sql'` (not this file's table); Ruling 30's method (open at both commits, re-point by search, never by offset); print the file list and per-file counts.
- [ ] Hand-check every letter-suffixed id added by this plan (`13.621a`) with `grep -rln` under `packages/*/test` and `apps/*/test`.
- [ ] Full gate under Node 22 with `node --version` beside every number: `packages/domain`, `packages/rule-engine`, `packages/app-core`, `packages/ui`, `packages/mcp-server`, `apps/web`, `apps/server` (Postgres reachable; quote pass AND skip counts; skips must stay 5). Seven typechecks. `check-case-ids.mjs` (only `13.387`/`13.413`); `check-case-citations.mjs` (file 13's uncited set exactly `13.401`/`13.476`/`13.477` — quote the line).
- [ ] Spec: rewrite §8.1's server sentence IN PLACE per R1 ("the list route keeps its `ticket_id` order; the Backlog tab sorts by `rank`") with the "(amended <date>, see Amendments)" pointer; append `## Amendments during execution — second wave (<date>)` with one entry per ledger ruling (R1–R5 and every controller ruling recorded during execution) and a `### Follow-ons named during execution — second wave` list (at least: per-project `autoCloseAfterDays` override — §9; ranking under grouping/nesting is display-only — R2; the Board's `Close all` and the List's `Close selected` share one dialog but no keyboard shortcut; `ListRow.closed.actorName` is still the core's follow-on and now also names `Auto-close` correctly only through `actorLabel`).
- [ ] `Features.md`: every bullet this plan added is ✅/⚙️ as marked; the tabs bullet still names five tabs; the MCP bullet is unchanged (no new tools — spec §9).
- [ ] Catalogue closing paragraph under `### Second wave (spec §8)`: gate numbers + Node per package, the per-task mutation summary, the re-points, the follow-ons.
- [ ] Commit `Second wave Task 12: final gate, citation sweep, spec amendments`. Then the final whole-branch review (opus) with a seams list: rank keys across domain/projection/wire/replica; `reopenedAt` cleared on EVERY `ticket.transitioned` including migrations (`ticket.workflow_rebound` — should a rebind clear it? rule: no, it is not a person's move; state it); the sweep's IST cutoff vs `entered.server_time`; the system actor never reaching `users`/roster joins that would `NULL` out; one dialog, two surfaces, one batch; the Dialog dismiss rename's blast radius.

---

## Self-review

**Spec coverage.** §8.1 model → T1; engine → T2; server/wire → T3 (R1 moves ORDER to the client — amended in T12); UI (drag, keyboard, optimistic, snap back, sort) → T4+T5. §8.2 setting → T6; sweep + actor + `reopenedAt` → T7+T8; "the roster resolves it to the name" → T7's `actorLabel` (a domain-side name map, not a roster row — the roster is the members table and a system actor has no membership; recorded as a plan interpretation). §8.3 board → T10; list → T11; one path/one dialog/one batch → T9. §9 unchanged. §10 testing → each task's cases (13.613–13.649). §11 files → the table above, extended.

**Placeholder scan.** T1's `rankBetween` ships as written (fuzzed by the author; 13.613 pins it). T8's 13.638 offers two honest shapes and demands the implementer pick one and say which — a stated choice for a daemon test whose fixture depends on the sweep-test harness, not an omission. No "add handling" steps; every case names its assertions.

**Type consistency.** `rank: string | null` (domain optional, wire required) in T1/T3/T5; `reopenedAt: string | null` in T7/T8; `autoCloseAfterDays: number | null` in T6/T8; `SYSTEM_ACTOR_AUTO_CLOSE` in T7/T8; `BulkCloseDialog` props identical in T9/T10/T11; `rowDrag.onReorder(movedTicketId, beforeTicketId | null)` in T4/T5; `DRAG_TICKET_FORMAT` imported from `board.tsx` in T4, never redeclared.

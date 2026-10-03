# Typed ticket links (Knowledge Graph spec A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In the gisik orchestration, every task is ONE lane session. Follow `gisik-nokma-lanes/STEPS-common-2026-10-03.md`: numbered steps, each ending with a pushed commit + `CHECKPOINT task/<branch> <sha40> step <n>/<N>` + `HANDOFF-<branch>.md`; the sweep list + your own mutation pass before DONE.

**Goal:** three typed links between tickets (blocks, relates, duplicates), written as two ticket events on the source's stream, refused by seven rules, projected to `proj_ticket_links`, shown in a Links section on the ticket sheet (desktop and phone, optimistic, with Undo), narrated in History, and written and read by MCP (`link_tickets`, `get_ticket.links`).

**Architecture:**
- **Events.** `ticket.link_added` / `ticket.link_removed {kind, targetId}` on the SOURCE ticket's stream (spec §2.2). They fold into `TicketState.links` (outbound only), so every reader that already replays `TICKET_EVENT_TYPES` (the projection, the snapshot writer, the replica, the engine's memory context) carries links without a new code path.
- **Rules.** Rules 1–5 are one engine check (`packages/rule-engine/src/checks/links.ts`) that reads BOTH tickets' `links` through `EngineContext.getEntityState`. The client precheck runs the same engine on the cache. Rules 6–7 are one `canSee(target)` line in `checkVisibilityPermission`; `canSee(source)` is already there (`check-permission.ts:1639-1641`).
- **Reads.** `proj_ticket_links` (spec §2.5 DDL) is the queryable table, for this spec's two-direction reads and for spec C. Every read joins the other end through `visibleTicketsWhere` and `LIVE_TICKET_WHERE`, so a hidden or trashed end drops the row. No count is served.

**Tech stack:** TypeScript, zod 3, Postgres (node-pg-migrate SQL files), Fastify, React 19, vitest 3 (node + jsdom), better-sqlite3 (replica tests).

**Spec:** `docs/superpowers/specs/2026-10-03-typed-links-design.md`. Read it first; its section numbers (§) are cited below. Code was read at `origin/release/smoothness` (`dce9ca61`); every `file:line` below is from that tree. Re-read before editing, because release/knowledge-graph may have moved.

## Global Constraints

**Release and identity**
- **Release:** `release/knowledge-graph`, cut from `release/smoothness` after PR #952. Every task branch is cut from `origin/release/knowledge-graph`, and its PR has base `release/knowledge-graph`. Never `main`.
- **Catalogue:** Features.md §24 "Knowledge Graph" ↔ `test-cases/27-knowledge-graph.md`. Task 1 creates both, with the series block table. This plan owns `27.001`–`27.079`: T1 `27.001–27.019`, T2 `27.020–27.034`, T3 `27.035–27.049`, T4 `27.050–27.064`, T5 `27.065–27.079`. Unused ids stay free for that task's follow-ups.
- **Case lines are id lines:** `- ❌ **27.001 — …**`. Each starts ❌ and flips ✅ in the same commit as its test. Test names or comments carry the id. `pnpm check:citations` must pass.
- **Before allocating,** re-grep every live release tip for `27-knowledge-graph.md` and `## 24.` (`git for-each-ref refs/remotes/origin/release --format='%(refname:short)'`, then `git grep -l` on each). On 2026-10-03 none had either.
- **Ledger:** plan id `typed-links` (`scripts/check-task-ledger.mjs:263` strips the date). Rows are given at the end of this plan.

**Model facts, copied verbatim from the spec**
- Kinds: `blocks`, `relates`, `duplicates`.
- Payload: `{ kind: z.enum(['blocks','relates','duplicates']), targetId: ulidString }`, `.strict()`, version 1, `entityKind: 'ticket'`.
- `ticket.link_removed` goes on the SOURCE's stream "whoever removes it".
- `ENTITY_KINDS` does not change (`packages/domain/test/envelope.test.ts:310`).
- Readings (§2.1):

  | Kind | From the source | From the target |
  |---|---|---|
  | blocks | blocks | is blocked by |
  | relates | relates to | relates to |
  | duplicates | duplicates | is duplicated by |

- Rules (§2.3), with refusal ids chosen by this plan:

  | Rule | Refusal id |
  |---|---|
  | 1. no self-link | `link.self` |
  | 2. same workspace | `link.unknown-target` |
  | 2. target not deleted | `link.target-deleted` (a deleted source is the existing `deleted-ticket`) |
  | 3. no duplicate (relates in either direction) | `link.duplicate` |
  | 4/5. no direct reverse of blocks / duplicates | `link.reverse` |
  | (new) remove names a stored link | `link.absent` |
  | 6/7. can see the target | `permission.visibility` |

- Visibility (§2.4): a link is shown only to a viewer who can see BOTH ends. No "N hidden" count, anywhere.
- No notifications (§7). No card mark (§7). No cycle walk past two (§7).

**Copy rules (exact strings; no spaced em dash in any new string literal; the ui-copy scan sweeps `packages/domain/src` and `packages/mcp-server/src`)**
- Section heading `Links`, or `Links (N)` once loaded.
- Group headings `Blocks`, `Is blocked by`, `Relates to`, `Duplicates`, `Is duplicated by`.
- Buttons `Add link`, `Remove`. Select label `Link type`. Search label `Find a ticket`. Empty state `No links yet.`
- Toasts `Linked: <reading> <key or title>` and `Removed link: <reading> <key or title>`, with Undo on the removal toast.
- History `Linked: <reading> <KEY>` / `Removed link: <reading> <KEY>`. A hidden target reads `a ticket you can't see`; a payload this build cannot label reads `another ticket`.
- Engine reasons:
  - `link.self`: `A ticket cannot be linked to itself.`
  - `link.unknown-target`: `The other ticket does not exist in this workspace.`
  - `link.target-deleted`: `The other ticket is deleted. Restore it, or pick another ticket.`
  - `link.absent`: `This ticket holds no such link, so there is nothing to remove.`
  - `link.duplicate` / `link.reverse`: `"<from title>" already <reading> "<to title>".`
- Permission reason: `The other ticket does not exist in this workspace, or you cannot see it.`

**What must not change**
- `REFUSAL_RULES` (kebab ids, pinned exactly by `packages/rule-engine/test/engine.test.ts:671-702`). The new ids are dotted `REFUSALS` keys, like `hierarchy.parent-deleted`.
- `ENTITY_KINDS`. `BOOTSTRAP_BACKFILL_TYPES`' members (link events FOLD, like `ticket.closed`, so they are not backfilled; only its docblock arithmetic moves).
- Placement: the Notes section stays directly after Subtasks, because 18.241a asserts `.gn-ticket-sheet__subtasks + .gn-ticket-sheet__notes + .gn-comments`.
- The gate stays at **34 tasks**: no new package.

**Tests and tooling**
- **Node 22** for `pnpm install` in a worktree.
- **Never pipe a test or build run into `head`.** Use `| tail -N` or `> /tmp/x.log 2>&1`. vitest `--maxWorkers=2`.
- **Build before suites.** Web reads app-core's `dist`; the server reads domain, rule-engine and app-core `dist`.
- **App-core online/sync changes** (T4) ⇒ also run the server integration files (`apps/server` WHOLE).
- **ui.css changes** (T5) ⇒ run the ui, app-core and web suites WHOLE.
- **Every run quoted in a report is named LOCAL.** CI runs only on the release→main PR.
- **Controls live in the same `it()`** as the case they guard: each refusal test also proves the same call with one input changed is accepted.
- **A new event type ⇒ every vocabulary census in the same task** (T1), plus a census test that iterates the registry so a missing arm fails.
- **Features.md and test-cases** change in the same commit as the code.
- Name `frontend-design` in the T5 lane prompt.

## Review Focus

1. **Removing a link from the "wrong" end.** An incoming link removed from the target's sheet, and a `relates` stored as B→A removed from A, must file `ticket.link_removed` on the STORED source's stream, with the stored kind and target. Otherwise `link.absent` refuses it, or a link silently survives. Pinned by 27.042 (T3), 27.056 (T4) and 27.069 (T5).
2. **A link into a ticket the viewer cannot see** must be absent everywhere: the Links section, `ticketState.links` on the detail read, History (the target is withheld), `get_ticket`, and `get_ticket_history`. No count, no key, no title. Pinned by 27.050, 27.052, 27.053, 27.058 and 27.059 (T4).
3. **A purged ticket at either end.** The live table and a rebuild agree (`verifyProjections` is clean). A replayed `link_added` toward an erased id writes no row. A new link to an erased id is refused. Pinned by 27.023, 27.024 and 27.025 (T2).
4. **A refusal arriving after the optimistic row is drawn** (for example, the other user added the reverse a second earlier). The pending row disappears, nothing stays half-drawn, and the server's own sentence shows beside the Add control. Pinned by 27.067 (T5).
5. **A double click on Remove or Undo** files exactly one event. Pinned by 27.068 (T5).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/domain/src/events/ticket-events.ts` | `TICKET_LINK_KINDS`, `TicketLinkKind`, the two payloads, `TICKET_LINK_EVENT_TYPES`, `linkReading` | 1 |
| `packages/domain/src/registry.ts` | `registrations()` listing | 1 |
| `packages/domain/src/vocabulary.ts` | register both types | 1 |
| `packages/domain/src/entity-state.ts` | `TicketLink`, `TicketState.links?` | 1 |
| `packages/domain/src/ticket-state.ts` | `TICKET_EVENT_TYPES` +2, reducer arms, docblock count | 1 |
| `apps/server/src/sync/sync-routes.ts` | docblock arithmetic only (:45-92) | 1 |
| `apps/server/src/purge/check-purged.ts` | `payloadIds` link arm, exported | 1 |
| `apps/server/src/notifications/fanout.ts` | explicit no-op arm | 1 |
| `packages/app-core/src/views/history-copy.ts`, `view-types.ts` | sentences; `TicketHistoryEvent.linkTarget?` | 1 |
| `packages/mcp-server/src/tools/ticket-tools.ts` | `redactedPayload` link arm, exported | 1 (arm), 4 (tool) |
| `apps/server/test/census/ticket-vocabulary-census.test.ts` (new) | the registry census | 1 |
| `apps/server/migrations/1791400000000_proj-ticket-links.sql` (new) | table + `proj_tickets.links` column | 2 |
| `apps/server/src/projections/ticket-links.ts` (new) | `ticketLinksProjection` | 2 |
| `apps/server/src/projections/tickets.ts`, `projections/index.ts` | `links` column read/write; registration | 2 |
| `apps/server/src/purge/table-rules.ts`, `purge/erasure.ts` | erase rule + statement | 2 |
| `packages/rule-engine/src/checks/links.ts` (new), `checks/refusals.ts`, `evaluate.ts` | rules 1–5 + absent | 3 |
| `apps/server/src/permissions/check-permission.ts` | rule 6/7 | 3 |
| `packages/app-core/src/precheck.ts` | client rules 1–5 | 3 |
| `apps/server/src/read/ticket-links.ts` (new), `routes/ticket-links.ts` (new) | `GET …/tickets/:ticketId/links` | 4 |
| `apps/server/src/routes/tickets.ts`, `routes/ticket-history.ts` | filtered `ticketState.links`; `linkTarget` annotation | 4 |
| `packages/mcp-server/src/tools/ticket-tools.ts`, `read-tools.ts` | `link_tickets`; `get_ticket.links` | 4 |
| `packages/app-core/src/data-source.ts`, `online/*`, `replica/replica-data-source.ts` | `getTicketLinks`; mappers | 4 |
| `packages/app-core/src/views/ticket-links-section.tsx` (new), `ticket-sheet.tsx` | the Links section | 5 |
| `packages/ui/src/ui.css` | links block after the notes rules | 5 |
| `docs/manual.md` §5 | the Links paragraph | 5 |
| `Features.md` §24, `test-cases/27-knowledge-graph.md`, `test-cases/README.md`, `scripts/fixtures/check-case-citations-baseline.json` | catalogue | 1 opens; each task its own lines |

**Parallelism:**
- **T1 first.** Every other task consumes its types.
- **T2 then T3.** T3's server tests read `links` off `proj_tickets` (T2's column), and the engine needs the TARGET's state.
- **T4 after T2.** Its read parts (route, MCP `get_ticket`, replica) can run in parallel with T3. Its `link_tickets` refusal case (27.057) needs T3, so if T4 starts first, T4 lands after T3.
- **T5 after T3 and T4.**
- **Shared files:**
  - `ticket-tools.ts`: T1 touches `redactedPayload`, T4 adds the tool.
  - `test-cases/27-knowledge-graph.md` and Features §24: T1 seeds one anchor per task (step 1), and each task writes only below its own anchor.

---

### Task 1: The events, every census, and the catalogue opening (cases 27.001–27.019)

**Files:**
- Modify:
  - `packages/domain/src/events/ticket-events.ts` (append after `ticketReparentedPayload`, `:208`)
  - `packages/domain/src/registry.ts:36-61`
  - `packages/domain/src/vocabulary.ts`: the import block `:35-51`; the registrations after `ticket.restored` (`:260-265`)
  - `packages/domain/src/entity-state.ts:24-41` (`TicketState`)
  - `packages/domain/src/ticket-state.ts`: docblock `:60-83`, list `:84-100`, imports, switch arms before `comment.added` (`:456`)
  - `apps/server/src/sync/sync-routes.ts`: the docblock `:45-92` (the "twenty and fifteen" arithmetic, and the "Absence, named" paragraph `:84-92`)
  - `apps/server/src/purge/check-purged.ts:25-71` (`payloadIds`: add the arm, add `export`)
  - `apps/server/src/notifications/fanout.ts:351-401` (`onCommitted` chain)
  - `packages/app-core/src/view-types.ts:757-767` (`TicketHistoryEvent`)
  - `packages/app-core/src/views/history-copy.ts:109-240` (`describeEvent`)
  - `packages/mcp-server/src/tools/ticket-tools.ts:41-60` (`redactedPayload`: arm + `export`)
  - Tests:
    - `packages/domain/test/ticket-state.test.ts:710` (15 → 17)
    - `packages/app-core/test/views/history-copy.test.ts`: `:26` docblock, `:48` constant, `:69-99` `VALID_PAYLOAD`, `:125` (15 → 17)
- Create:
  - `packages/domain/test/ticket-link-events.test.ts` (copy `comment-events.test.ts`'s imports and `makeEnvelope` use)
  - `apps/server/test/census/ticket-vocabulary-census.test.ts`
  - `packages/mcp-server/test/redacted-payload.test.ts`
  - `test-cases/27-knowledge-graph.md`
- Catalogue: `Features.md` (new `## 24. Knowledge Graph` after §23, `:3727-3736`); `test-cases/README.md` (row after the `26-comments-and-markdown.md` row, `:31`); `scripts/fixtures/check-case-citations-baseline.json` (`"27-knowledge-graph.md": 0`).

**Interfaces:**
- **Produces** (from `@gisik-nokma/domain`):
  - `TICKET_LINK_KINDS = ['blocks', 'relates', 'duplicates'] as const`; `type TicketLinkKind`;
  - `ticketLinkAddedPayload`, `ticketLinkRemovedPayload` (zod, strict);
  - `TICKET_LINK_EVENT_TYPES = ['ticket.link_added', 'ticket.link_removed'] as const`; `isTicketLinkEvent(type: string): boolean`;
  - `linkReading(kind: TicketLinkKind, direction: 'out' | 'in'): string` (`blocks`/`is blocked by`, `relates to`/`relates to`, `duplicates`/`is duplicated by`);
  - `type TicketLink = { kind: TicketLinkKind; targetId: string }`; `TicketState.links?: TicketLink[]`, **absent when empty**;
  - `EventTypeRegistry.registrations(): readonly EventTypeRegistration[]`.
- **Produces** (server): `export function payloadIds(type, payload, depth?)` from `purge/check-purged.ts`.
- **Produces** (MCP): `export function redactedPayload(type, eventId, payload)`.
- **Produces** (app-core): `TicketHistoryEvent.linkTarget?: { key: string | null } | null`. Absent means unlabelled; `null` means the server withheld a hidden target; T4's history route fills it.

**Why `links` is absent when empty (and not `[]` at creation, as `rank: null` is).** `rank`, `reopenedAt` and `deleted` are written at creation, and `rowToTicketState` reads them unconditionally (`apps/server/src/projections/tickets.ts:196-218`), so the reducer's output and the row agree on shape. Links take the other consistent choice: absent on BOTH sides when empty.
- The reducer drops the key when the last link goes.
- `rowToTicketState` (T2) spreads the key only when the column's array is non-empty.

The dual-client rig's `toEqual` (`apps/server/test/dual-client/rig.ts:753`) therefore still holds, and no existing expected-state literal changes.

- [ ] **Step 1: Open the catalogue, seeded per task**

  `test-cases/27-knowledge-graph.md`:
  ```markdown
  # §27 — Knowledge Graph

  **Opened 2026-10-03 by the typed-links plan Task 1** (`docs/superpowers/plans/2026-10-03-typed-links.md`; spec `docs/superpowers/specs/2026-10-03-typed-links-design.md`, Knowledge Graph spec A). Mirrors `Features.md` §24. Ships on `release/knowledge-graph`.
  3-DIGIT PADDED `27.001`–`27.999`, blocks per SPEC (each plan splits its block per task in its own sub-section):

  | Block | Spec | Plan |
  |---|---|---|
  | 27.001–27.079 | A, typed links | `2026-10-03-typed-links.md`: T1 27.001–27.019 · T2 27.020–27.034 · T3 27.035–27.049 · T4 27.050–27.064 · T5 27.065–27.079 |
  | 27.100–27.179 | B, reference index and backlinks | `2026-10-03-reference-index.md` |
  | 27.200–27.349 | C, Knowledge Graph view | `2026-10-03-knowledge-graph-view.md` |
  | 27.400–27.549 | D, MCP graph query and semantic layer | `2026-10-03-mcp-graph-semantic-layer.md` |
  | 27.600–27.659 | E, Home | `2026-10-03-home.md` |

  Unused ids in a block stay free for that plan's follow-ups. Plans B–E each add their own `## 27.N` sub-section; merges are unions.

  Legend: ✅ covered by a test · ❌ not yet · 🟡 partial · 🧪 manual · 🚫 out of scope, with a reason.

  ## 27.1 Typed links (spec A)

  <!-- A T1 -->
  <!-- A T2 -->
  <!-- A T3 -->
  <!-- A T4 -->
  <!-- A T5 -->
  ```

  - **`Features.md`:** append `## 24. Knowledge Graph`, with the italic intro line in §23's style (`:3729`):
    *Typed links between tickets, a reference index, the Knowledge Graph view, MCP graph tools and Home. Specs `docs/superpowers/specs/2026-10-03-*-design.md` (A–E); mirrored by `test-cases/27-knowledge-graph.md`.*
    Below it, five anchor lines `<!-- A T1 bullet -->` … `<!-- A T5 bullet -->`.
  - **`test-cases/README.md`:** after the `26-…` row add:
    `` `27-knowledge-graph.md` (`Features.md` §24 — the Knowledge Graph series (typed links, references, the graph view, MCP graph tools, Home), **opened by the typed-links plan Task 1 on 2026-10-03** (`docs/superpowers/plans/2026-10-03-typed-links.md`; spec A `docs/superpowers/specs/2026-10-03-typed-links-design.md`); 3-DIGIT PADDED `27.001`–`27.999`, blocks per spec in the bucket file's own table. Ships on `release/knowledge-graph`). ``
    The em dash inside that row is Markdown prose, not a string literal, and matches the neighbouring rows.
  - **Baseline:** add `"27-knowledge-graph.md": 0` to `scripts/fixtures/check-case-citations-baseline.json`.
  - Run: `node scripts/check-case-ids.mjs && pnpm check:citations`. Expected: both pass.

  Commit: `typed-links T1: open Features §24 and test-cases/27 with the series block table`.

- [ ] **Step 2: Write the RED domain tests 27.001–27.003**

  Write the case lines under `<!-- A T1 -->`, all ❌:
  - `- ❌ **27.001 — `ticket.link_added` / `ticket.link_removed` accept `{kind, targetId}` for each of the three kinds, and refuse an unknown kind, an extra member and a non-ULID target;** control: the valid payload parses as an event on a ticket. Mutation: drop `.strict()` → the extra-member case passes the parse.`
  - `- ❌ **27.002 — both types are registered at version 1 against entity kind `ticket` only, and `registrations()` lists every registration exactly once;** control: `parseEvent` refuses a link event filed against a `note`.`
  - `- ❌ **27.003 — the reducer folds links:** `link_added` appends `{kind, targetId}` (a second identical add is a no-op), `link_removed` drops exactly that pair, and removing the last link leaves NO `links` key; control: `ticket.created` writes no `links` key, and a different kind to the same target is a second link. Mutation: write `links: []` on the last removal → the absent-key assertion fails.`

  `packages/domain/test/ticket-link-events.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    applyTicketEvent,
    domainRegistry,
    makeEnvelope,
    newUlid,
    parseEvent,
    TICKET_EVENT_TYPES,
    TICKET_LINK_KINDS,
    ticketLinkAddedPayload,
    ticketLinkRemovedPayload,
    type TicketState,
  } from '../src/index.js';

  const SOURCE = newUlid();
  const TARGET = newUlid();

  describe('27.001 link payloads', () => {
    it('27.001 accepts each kind; refuses an unknown kind, an extra member, a non-ULID target', () => {
      for (const schema of [ticketLinkAddedPayload, ticketLinkRemovedPayload]) {
        for (const kind of TICKET_LINK_KINDS) expect(schema.safeParse({ kind, targetId: TARGET }).success).toBe(true);
        expect(schema.safeParse({ kind: 'parent', targetId: TARGET }).success).toBe(false);
        expect(schema.safeParse({ kind: 'blocks', targetId: TARGET, note: 'x' }).success).toBe(false);
        expect(schema.safeParse({ kind: 'blocks', targetId: 'GN-142' }).success).toBe(false);
      }
      // control: the whole event parses on a ticket
      const { serverTime: _s, seq: _q, ...submitted } = makeEnvelope({
        type: 'ticket.link_added', entity: { kind: 'ticket', id: SOURCE }, payload: { kind: 'blocks', targetId: TARGET },
      });
      expect(() => parseEvent(submitted)).not.toThrow();
    });
  });

  describe('27.002 registration', () => {
    it('27.002 both types at v1 against ticket only; registrations() lists each once', () => {
      for (const type of ['ticket.link_added', 'ticket.link_removed']) {
        expect(domainRegistry.get(type, 1)?.entityKind).toBe('ticket');
        expect((TICKET_EVENT_TYPES as readonly string[]).includes(type)).toBe(true);
      }
      const keys = domainRegistry.registrations().map((r) => `${r.type}@${r.version}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toContain('ticket.link_added@1');
      // control: a note is refused at the door
      const { serverTime: _s, seq: _q, ...onNote } = makeEnvelope({
        type: 'ticket.link_added', entity: { kind: 'note', id: SOURCE }, payload: { kind: 'blocks', targetId: TARGET },
      });
      expect(() => parseEvent(onNote)).toThrow();
    });
  });
  ```
  - For 27.003, build `state` with the same `deps` + `ticket.created` fixture the `ticket.collaborator_added` cases in `ticket-state.test.ts` use (read that describe block and copy its `deps` and `created` helpers; do not invent a workflow).
  - Then fold `link(type, kind, target)` envelopes made with `makeEnvelope({ type, entity: { kind: 'ticket', id: <the created id> }, payload: { kind, targetId } })` and assert:
    ```ts
    expect('links' in born).toBe(false);                                   // control
    const a = applyTicketEvent(born, link('ticket.link_added', 'blocks', TARGET), deps);
    expect(a.links).toEqual([{ kind: 'blocks', targetId: TARGET }]);
    expect(applyTicketEvent(a, link('ticket.link_added', 'blocks', TARGET), deps)).toBe(a); // idempotent
    const b = applyTicketEvent(a, link('ticket.link_added', 'relates', TARGET), deps);
    expect(b.links).toHaveLength(2);                                        // control: another kind is another link
    const c = applyTicketEvent(b, link('ticket.link_removed', 'blocks', TARGET), deps);
    expect(c.links).toEqual([{ kind: 'relates', targetId: TARGET }]);
    const d = applyTicketEvent(c, link('ticket.link_removed', 'relates', TARGET), deps);
    expect('links' in d).toBe(false);
    ```

  Run: `pnpm --filter @gisik-nokma/domain exec vitest run test/ticket-link-events.test.ts --maxWorkers=2 > /tmp/kg-a1.log 2>&1; tail -30 /tmp/kg-a1.log`.
  Expected: FAIL (`ticketLinkAddedPayload` is not exported).

- [ ] **Step 3: Implement the domain**

  `events/ticket-events.ts`, after `ticketReparentedPayload` (copy the strictness of `ticketClosedPayload` and the `ulidString` import already in the file):
  ```ts
  /**
   * Typed ticket links (Knowledge Graph spec A §2.2). Both events go on the
   * SOURCE ticket's stream, whoever writes them, so a link has one history.
   * `relates` is stored as written; its "either direction" rule is the engine's
   * (`rule-engine/src/checks/links.ts`), not this schema's.
   */
  export const TICKET_LINK_KINDS = ['blocks', 'relates', 'duplicates'] as const;
  export type TicketLinkKind = (typeof TICKET_LINK_KINDS)[number];
  export const ticketLinkAddedPayload = z.object({ kind: z.enum(TICKET_LINK_KINDS), targetId: ulidString }).strict();
  export const ticketLinkRemovedPayload = z.object({ kind: z.enum(TICKET_LINK_KINDS), targetId: ulidString }).strict();
  export const TICKET_LINK_EVENT_TYPES = ['ticket.link_added', 'ticket.link_removed'] as const;
  export function isTicketLinkEvent(type: string): boolean {
    return (TICKET_LINK_EVENT_TYPES as readonly string[]).includes(type);
  }
  const READINGS: Record<TicketLinkKind, { out: string; in: string }> = {
    blocks: { out: 'blocks', in: 'is blocked by' },
    relates: { out: 'relates to', in: 'relates to' },
    duplicates: { out: 'duplicates', in: 'is duplicated by' },
  };
  /** How a link reads from one end (spec §2.1). One table for the engine's reasons, History, the app and MCP. */
  export function linkReading(kind: TicketLinkKind, direction: 'out' | 'in'): string {
    return READINGS[kind][direction];
  }
  ```

  `entity-state.ts`: add `import type { TicketLinkKind } from './events/ticket-events.js';` and:
  ```ts
  /** One OUTBOUND typed link (spec A §2.2). Inbound links live on the other ticket's state. */
  export type TicketLink = { kind: TicketLinkKind; targetId: string };
  ```
  Inside `TicketState`, after `deleted?`:
  ```ts
    /**
     * Outbound typed links, in the order added. ABSENT when there are none, on
     * the reducer and on `rowToTicketState` alike (typed-links plan T1/T2): the
     * reducer drops the key with the last link, so the two shapes agree.
     */
    links?: TicketLink[];
  ```

  `registry.ts`: add `registrations(): readonly EventTypeRegistration[];` to the type, and to the implementation:
  ```ts
      registrations() {
        return [...byKey.values()];
      },
  ```

  `vocabulary.ts`: import the two payloads in the `:35-51` block. After the `ticket.restored` registration (`:260-265`):
  ```ts
  domainRegistry.register({
    type: 'ticket.link_added',
    version: 1,
    entityKind: 'ticket',
    payloadSchema: ticketLinkAddedPayload,
  });

  domainRegistry.register({
    type: 'ticket.link_removed',
    version: 1,
    entityKind: 'ticket',
    payloadSchema: ticketLinkRemovedPayload,
  });
  ```

  `ticket-state.ts`:
  - Append `'ticket.link_added', 'ticket.link_removed'` to `TICKET_EVENT_TYPES` after `'ticket.restored'`.
  - In the docblock, change "FIFTEEN of the EIGHTEEN" to "SEVENTEEN of the TWENTY". Add one sentence: "The link pair (spec A) moved both numbers again: they fold into `links`."
  - Import the two payloads. Before the `comment.added` arm (`:456`) add:
  ```ts
      case 'ticket.link_added': {
        const p = ticketLinkAddedPayload.parse(env.payload);
        const links = state.links ?? [];
        if (links.some((l) => l.kind === p.kind && l.targetId === p.targetId)) return state;
        return { ...state, links: [...links, { kind: p.kind, targetId: p.targetId }] };
      }
      case 'ticket.link_removed': {
        const p = ticketLinkRemovedPayload.parse(env.payload);
        const rest = (state.links ?? []).filter((l) => !(l.kind === p.kind && l.targetId === p.targetId));
        if (rest.length > 0) return { ...state, links: rest };
        // Absent, never `[]`: the shape `rowToTicketState` reads back (T1 "Why links is absent").
        const { links: _dropped, ...without } = state;
        return without;
      }
  ```

  In `packages/domain/test/ticket-state.test.ts:710`, change `toHaveLength(15)` to `toHaveLength(17)`. Keep the surrounding loop at `:675-712`; it already iterates the registry's `entityKind`.

  Run the domain suite: `pnpm --filter @gisik-nokma/domain build && pnpm --filter @gisik-nokma/domain exec vitest run --maxWorkers=2 > /tmp/kg-a1.log 2>&1; tail -30 /tmp/kg-a1.log`.
  Expected: PASS, including 27.001–27.003.
  - A different pinned count failing here is a census this step missed. Fix it in this step and list it in the handoff.
  - Flip 27.001–27.003 to ✅.

  Commit.

- [ ] **Step 4: Every census arm, then the census tests (27.004–27.007)**

  Case lines:
  - `- ❌ **27.004 — THE CENSUS (server): every registration whose entity kind includes `ticket` is in `TICKET_EVENT_TYPES` or `BOOTSTRAP_BACKFILL_TYPES`, every `ticket.*` registration is in `TICKET_EVENT_TYPES`, and `payloadIds` names the target of both link types;** control: the same census over the registry plus a planted `ticket.planted_for_census` registration reports exactly that type. Mutation: remove `'ticket.link_removed'` from `TICKET_EVENT_TYPES` → red naming it.`
  - `- ❌ **27.005 — History narrates both link events from the source's side:** `Linked: blocks GN-142`, `Linked: relates to GN-120`, `Linked: duplicates GN-142`, `Removed link: blocks GN-142`; a withheld target reads `Linked: blocks a ticket you can't see`; an unlabelled payload reads `Linked: blocks another ticket`; 3.183's census covers 20 types (17 + 2 + 1). Control: an unknown type still falls back to the wire name. Mutation: return `event.type` for `ticket.link_removed` → 3.183 red.`
  - `- ❌ **27.006 — MCP `redactedPayload` keeps a link's kind and target, and turns a target the server withheld (`targetId: null`) into `target: "a ticket you can't see"`;** control: a `ticket.transitioned` comment is still stripped. Census: every registered type passes through `redactedPayload` without throwing. Mutation: return the payload unchanged for link types → the withheld case shows `targetId: null`.`
  - `- ❌ **27.007 — a committed link event notifies nobody;** control: in the same `it`, a `ticket.assigned` to another member who can see the ticket notifies them. Mutation: route link events into `handleAssigned` → a row appears.`

  **Arms:**

  1. **`check-purged.ts`:** change `function payloadIds` to `export function payloadIds`, and add before `case 'claim.contested'`:
     ```ts
         case 'ticket.link_added':
         case 'ticket.link_removed':
           // Spec A: the TARGET is the second ticket a link names; a purged one refuses the claim.
           add('ticket', payload['targetId']);
           break;
     ```
  2. **`fanout.ts`:** in `onCommitted`, add before the final `else if (env.type === 'claim.contested')`:
     ```ts
          } else if (env.type === 'ticket.link_added' || env.type === 'ticket.link_removed') {
            // Spec A §7: links notify nobody. An explicit arm so the census can see the decision.
     ```
     The arm body is empty. Keep the `} else if` chain shape.
  3. **`sync-routes.ts` docblock:**
     - Rewrite the arithmetic sentence to "twenty-two registrations against `ticket`, seventeen folded" (read `:45-92` and keep its voice).
     - Add: the link pair FOLDS (`TICKET_EVENT_TYPES`) and rides the snapshot, so it is deliberately not backfilled.
     - Replace the "Absence, named" paragraph's last two sentences: the census `apps/server/test/census/ticket-vocabulary-census.test.ts` (27.004) now fails when a ticket-entity type is in neither list. The list itself stays hand-written, for 12.94's reason.
  4. **`view-types.ts`:** add to `TicketHistoryEvent`:
     ```ts
       /**
        * Link events only (typed-links T4's history route): the other end's key,
        * `null` when the server withheld a target this viewer cannot see, absent
        * when this event was not labelled (any other type, or an older server).
        */
       linkTarget?: { key: string | null } | null;
     ```
  5. **`history-copy.ts`:** import `linkReading, TICKET_LINK_KINDS, type TicketLinkKind` from `@gisik-nokma/domain`, and before `case 'claim.contested'` add:
     ```ts
         case 'ticket.link_added':
         case 'ticket.link_removed': {
           const kind = str(payload, 'kind');
           if (kind === null || !(TICKET_LINK_KINDS as readonly string[]).includes(kind)) return event.type;
           const other =
             event.linkTarget === null ? "a ticket you can't see"
             : event.linkTarget?.key ?? 'another ticket';
           const verb = event.type === 'ticket.link_added' ? 'Linked' : 'Removed link';
           return `${verb}: ${linkReading(kind as TicketLinkKind, 'out')} ${other}`;
         }
     ```
     Only `kind` is read and checked, never the whole payload schema: T4's route sends `targetId: null` for a withheld target, which the strict schema refuses (and `.pick()` keeps zod's `strict` unknown-keys setting, so it would refuse every `targetId`).
  6. **`ticket-tools.ts`:** `export function redactedPayload`. As its first line:
     ```ts
     if (type === 'ticket.link_added' || type === 'ticket.link_removed') {
       return payload['targetId'] === null ? { kind: payload['kind'], target: "a ticket you can't see" } : payload;
     }
     ```

  **Tests:**
  - `packages/app-core/test/views/history-copy.test.ts`:
    - add `'ticket.link_added': { kind: 'blocks', targetId: '01J9GTKB000000000000000000' }` and `'ticket.link_removed': { kind: 'relates', targetId: '01J9GTKB000000000000000000' }` to `VALID_PAYLOAD`;
    - change `:125` to `toBe(17)`;
    - rename `REGISTRATIONS_ON_2026_09_21 = 18` to `REGISTRATIONS_ON_2026_10_03 = 20`, and fix the `:26` docblock arithmetic.
  - Add a `describe('27.005 …')` in the same file:
    ```ts
    const linkEvent = (type: string, kind: string, linkTarget?: { key: string | null } | null): TicketHistoryEvent => ({
      ...eventOf(type), payload: { kind, targetId: linkTarget === null ? null : '01J9GTKB000000000000000000' },
      ...(linkTarget === undefined ? {} : { linkTarget }),
    });
    it('27.005 link sentences, three kinds, both events, withheld and unlabelled targets', () => {
      expect(describeEvent(linkEvent('ticket.link_added', 'blocks', { key: 'GN-142' }))).toBe('Linked: blocks GN-142');
      expect(describeEvent(linkEvent('ticket.link_added', 'relates', { key: 'GN-120' }))).toBe('Linked: relates to GN-120');
      expect(describeEvent(linkEvent('ticket.link_added', 'duplicates', { key: 'GN-142' }))).toBe('Linked: duplicates GN-142');
      expect(describeEvent(linkEvent('ticket.link_removed', 'blocks', { key: 'GN-142' }))).toBe('Removed link: blocks GN-142');
      expect(describeEvent(linkEvent('ticket.link_added', 'blocks', null))).toBe("Linked: blocks a ticket you can't see");
      expect(describeEvent(linkEvent('ticket.link_added', 'blocks'))).toBe('Linked: blocks another ticket');
      // control: an unknown type still falls back
      expect(describeEvent({ ...eventOf('ticket.closed'), type: 'ticket.never_seen' })).toBe('ticket.never_seen');
    });
    ```
  - `apps/server/test/census/ticket-vocabulary-census.test.ts`:
    ```ts
    import { describe, expect, it } from 'vitest';
    import { domainRegistry, TICKET_EVENT_TYPES, type EventTypeRegistration } from '@gisik-nokma/domain';
    import { payloadIds } from '../../src/purge/check-purged.js';
    import { BOOTSTRAP_BACKFILL_TYPES } from '../../src/sync/sync-routes.js';

    /** 27.004: the census the sync-routes docblock named as missing. Reads the REGISTRY, never a retyped list. */
    const onTicket = (r: EventTypeRegistration) =>
      r.entityKind === 'ticket' || (Array.isArray(r.entityKind) && r.entityKind.includes('ticket'));

    function unaccounted(registrations: readonly EventTypeRegistration[]): string[] {
      const folded = new Set<string>(TICKET_EVENT_TYPES);
      const backfilled = new Set<string>(BOOTSTRAP_BACKFILL_TYPES);
      return registrations
        .filter((r) => onTicket(r) || r.type.startsWith('ticket.'))
        .filter((r) => !(folded.has(r.type) || (!r.type.startsWith('ticket.') && backfilled.has(r.type))))
        .map((r) => r.type);
    }

    describe('27.004 ticket vocabulary census', () => {
      it('27.004 every ticket-entity type is folded or backfilled; ticket.* always folds; payloadIds names link targets', () => {
        // control first: a planted registration is reported, so the census can fail
        const planted = { type: 'ticket.planted_for_census', version: 1, entityKind: 'ticket', payloadSchema: undefined as never } as EventTypeRegistration;
        expect(unaccounted([...domainRegistry.registrations(), planted])).toEqual(['ticket.planted_for_census']);
        expect(unaccounted(domainRegistry.registrations())).toEqual([]);
        for (const type of ['ticket.link_added', 'ticket.link_removed']) {
          expect(payloadIds(type, { kind: 'blocks', targetId: '01J9GTKB000000000000000000' })).toEqual([['ticket', '01J9GTKB000000000000000000']]);
        }
      });
    });
    ```
  - `packages/mcp-server/test/redacted-payload.test.ts` (27.006):
    ```ts
    import { describe, expect, it } from 'vitest';
    import { domainRegistry } from '@gisik-nokma/domain';
    import { redactedPayload } from '../src/tools/ticket-tools.js';

    describe('27.006 redactedPayload and links', () => {
      it('27.006 keeps a visible link, phrases a withheld one; control strips a transition comment; census never throws', () => {
        const T = '01J9GTKB000000000000000000';
        expect(redactedPayload('ticket.link_added', 'e1', { kind: 'blocks', targetId: T })).toEqual({ kind: 'blocks', targetId: T });
        expect(redactedPayload('ticket.link_removed', 'e1', { kind: 'relates', targetId: null })).toEqual({ kind: 'relates', target: "a ticket you can't see" });
        expect(redactedPayload('ticket.transitioned', 'e1', { to: 'done', comment: { text: 'x' } })).toEqual({ to: 'done' });
        for (const r of domainRegistry.registrations()) expect(() => redactedPayload(r.type, 'e1', {})).not.toThrow();
      });
    });
    ```
  - **27.007:** in `apps/server/test/notifications/fanout.test.ts`, add one `it` that reuses the file's `fanout()` helper, `visible` set and `listNotifications`, exactly as the file's existing `ticket.assigned` case calls them (read that case first and copy its envelope and read calls).
    - First, `onCommitted(makeEnvelope({ type: 'ticket.link_added', workspaceId: WS, actorId: KIRO, entity: { kind: 'ticket', id: TICKET }, payload: { kind: 'blocks', targetId: '01J9GTKB000000000000000000' } }))`. ANSELMA's inbox stays empty.
    - Control: a `ticket.assigned` to ANSELMA (visible) lands one row.

  Run (LOCAL):
  - build domain, then app-core;
  - `pnpm --filter @gisik-nokma/app-core exec vitest run test/views/history-copy.test.ts --maxWorkers=2`;
  - `pnpm --filter @gisik-nokma/mcp-server exec vitest run --maxWorkers=2`;
  - `pnpm --filter @gisik-nokma/server exec vitest run test/census test/notifications test/purge --maxWorkers=2`;
  - each `> /tmp/kg-a1-<pkg>.log 2>&1; tail -40`.

  Expected: PASS. Flip 27.004–27.007 ✅.

  Commit.

- [ ] **Step 5: Features bullet, sweeps, DONE**
  - **Features:** replace `<!-- A T1 bullet -->` with:
    `- ⚙️ **Typed ticket links: the events** (typed-links T1; `packages/domain/src/events/ticket-events.ts`, `vocabulary.ts`, `ticket-state.ts`) — `ticket.link_added` / `ticket.link_removed {kind: blocks|relates|duplicates, targetId}` on the source ticket's stream; they fold into `TicketState.links` (outbound, absent when empty). History narrates them, links notify nobody, a purged target refuses the claim, and a registry census (`apps/server/test/census/ticket-vocabulary-census.test.ts`) fails when a new ticket type reaches no reader. Cases 27.001–27.007.`
    This is Markdown prose in Features.md, so the em dash is allowed.
  - **Sweeps:** domain, rule-engine, app-core, mcp-server, sync-client WHOLE, and server WHOLE (the TICKET_EVENT_TYPES change reaches every replay reader).
  - **Checks:** `pnpm check:citations`, `pnpm check:tasks`, `node scripts/check-case-ids.mjs`.
  - **Mutations:** the ones named on 27.001, 27.003, 27.004, 27.005 and 27.006.

  Push. DONE.

  Between T1 and T3 the release branch accepts link events with no rules (the engine's default accepts, `evaluate.ts:76-77`). No door emits them until T4/T5, and nothing deploys before the release PR.

---

### Task 2: The projection, the `links` column, trash and purge (cases 27.020–27.034)

**Files:**
- Create:
  - `apps/server/migrations/1791400000000_proj-ticket-links.sql` (copy the `-- Up Migration` / `-- Down Migration` markers of `1791300000000_comment-edit-delete.sql`, the latest at `dce9ca61`; re-check that it is still the latest)
  - `apps/server/src/projections/ticket-links.ts` (copy `projections/ticket-comments.ts`'s shape: `{ name, tables, apply, reset }`)
  - `apps/server/test/projections/ticket-links.test.ts`
  - `apps/server/test/purge/purge-ticket-links.test.ts` (copy `purge-comment-edits.test.ts`'s `ticket.deleted` → `purge.marked` → `purgeItem` sequence and `world.ts` helpers)
- Modify:
  - `apps/server/src/projections/tickets.ts`: `TicketRow` (`:87-118`), `rowToTicketState` (`:152-218`), `upsertTicket` (`:284-359`, 19 → 20 columns)
  - `apps/server/src/projections/index.ts`: register `ticketLinksProjection` directly after `ticketsProjection` (`:91`)
  - `apps/server/src/purge/table-rules.ts` (`PURGE_TABLE_RULES`, `:47-178`)
  - `apps/server/src/purge/erasure.ts:77-94` (statements)

**Interfaces:**
- **Consumes:** T1's `TicketState.links`, `isTicketLinkEvent`, `ticketLinkAddedPayload`.
- **Produces:**
  - table `proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq)`, PK `(source_id, target_id, kind)`, indexed on `target_id` and `workspace_id`; `seq` is the event's `workspaceSeq`;
  - column `proj_tickets.links jsonb NOT NULL DEFAULT '[]'`;
  - `ticketLinksProjection: Projection` (name `proj_ticket_links`).

- [ ] **Step 1: Write the RED projection tests 27.020–27.022**

  Case lines:
  - `- ❌ **27.020 — `link_added` writes one `proj_ticket_links` row carrying the actor, server time, origin and workspace seq, and `link_removed` deletes it;** control: a second link of another kind between the same pair is a second row and survives the removal. Mutation: key the DELETE on `(source_id, target_id)` only → the control row disappears.`
  - `- ❌ **27.021 — `proj_tickets.links` reads back through `rowToTicketState` equal to the reducer's fold, and a ticket with no links has NO `links` key;** control: `getTicketStateFromDb` after add-then-remove has no key. Mutation: always spread `links` → the no-key assertion fails.`
  - `- ❌ **27.022 — moving either end to the trash keeps the row, and restoring keeps it;** control: the row is present before the delete. Mutation: delete rows on `ticket.deleted` → red.`

  `apps/server/test/projections/ticket-links.test.ts`. One database per file, as `seedNotesFixture` demands (`helpers/notes-fixture.ts:88`):
  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import { applyTicketEvent } from '@gisik-nokma/domain';
  import { applyCommitted, makeCommitted } from '../helpers/apply.js';
  import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
  import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';
  import { getTicketStateFromDb } from '../../src/projections/tickets.js';

  let db: TestDatabase;
  let f: NotesFixture;
  beforeAll(async () => { db = await createTestDatabase(); f = await seedNotesFixture(db.pool); });
  afterAll(async () => { await db.drop(); });

  const link = (type: 'ticket.link_added' | 'ticket.link_removed', source: string, kind: string, target: string) =>
    makeCommitted({ workspaceId: f.WS, actorId: f.ids.owner, entity: { kind: 'ticket', id: source }, type, payload: { kind, targetId: target } });
  const rows = async () =>
    (await db.pool.query('SELECT source_id, target_id, kind, created_by, origin, seq FROM proj_ticket_links ORDER BY kind')).rows;

  describe('27.020 proj_ticket_links', () => {
    it('27.020 add writes a provenance row; remove deletes exactly that kind', async () => {
      const added = link('ticket.link_added', f.TP, 'blocks', f.TE);
      await applyCommitted(db.pool, [added, link('ticket.link_added', f.TP, 'relates', f.TE)]);
      expect(await rows()).toEqual([
        { source_id: f.TP, target_id: f.TE, kind: 'blocks', created_by: f.ids.owner, origin: added.origin, seq: String(added.workspaceSeq) },
        { source_id: f.TP, target_id: f.TE, kind: 'relates', created_by: f.ids.owner, origin: added.origin, seq: expect.any(String) },
      ]);
      await applyCommitted(db.pool, [link('ticket.link_removed', f.TP, 'blocks', f.TE)]);
      expect((await rows()).map((r) => r.kind)).toEqual(['relates']); // control survives
    });
  });
  ```
  - `bigint` comes back from `pg` as a string, hence `String(...)`. If `makeCommitted` does not set `workspaceSeq` until `applyCommitted` assigns it, read the row's `seq` from `events` instead.
  - **27.021:** `getTicketStateFromDb(db.pool, f.TP)` (read its signature at `tickets.ts:245`). Its `links` equals `[{ kind: 'relates', targetId: f.TE }]`. Then remove `relates`, and assert `'links' in state` is `false`.
  - **27.022:** apply `makeCommitted({ …, entity: { kind: 'ticket', id: f.TE }, type: 'ticket.deleted', payload: {} })`. The row is still there. Then apply `ticket.restored`; still there. Control: the row is asserted present before the delete. Read `ticket-events.ts` for the delete/restore payload shapes before writing them.

  Run: `pnpm --filter @gisik-nokma/server exec vitest run test/projections/ticket-links.test.ts --maxWorkers=2 > /tmp/kg-a2.log 2>&1; tail -30 /tmp/kg-a2.log`.
  Expected: FAIL (`relation "proj_ticket_links" does not exist`).

- [ ] **Step 2: Migration, projection, column**

  `apps/server/migrations/1791400000000_proj-ticket-links.sql`:
  ```sql
  -- Up Migration
  -- Typed ticket links (Knowledge Graph spec A §2.5). One row per stored link,
  -- keyed by the SOURCE stream that holds its events. `relates` is stored as
  -- written; the engine refuses its reverse duplicate.
  CREATE TABLE proj_ticket_links (
    workspace_id text NOT NULL,
    source_id    text NOT NULL,
    target_id    text NOT NULL,
    kind         text NOT NULL CHECK (kind IN ('blocks','relates','duplicates')),
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL,
    origin       text NOT NULL,
    seq          bigint NOT NULL,
    PRIMARY KEY (source_id, target_id, kind)
  );
  CREATE INDEX proj_ticket_links_target_idx ON proj_ticket_links (target_id);
  CREATE INDEX proj_ticket_links_ws_idx ON proj_ticket_links (workspace_id);
  COMMENT ON COLUMN proj_ticket_links.seq IS 'The link_added event''s workspace_seq: the order links were made in, workspace-wide.';

  -- The source ticket's own folded copy (`TicketState.links`), so the engine
  -- reads both ends' links through `getEntityState` like every other fact.
  ALTER TABLE proj_tickets ADD COLUMN links jsonb NOT NULL DEFAULT '[]'::jsonb;

  -- Down Migration
  ALTER TABLE proj_tickets DROP COLUMN links;
  DROP TABLE proj_ticket_links;
  ```

  `apps/server/src/projections/ticket-links.ts`:
  ```ts
  import type { PoolClient } from 'pg';
  import { isTicketLinkEvent, ticketLinkAddedPayload, type LedgerEvent } from '@gisik-nokma/domain';
  import { purgedIdsAmong } from '../purge/purged-lookup.js';
  import type { Projection } from './registry.js';

  /**
   * `proj_ticket_links` (Knowledge Graph spec A §2.5). Registered directly after
   * `proj_tickets` (`index.ts`), whose fold holds the same links as
   * `TicketState.links`; this table is the queryable copy, read in both
   * directions by `read/ticket-links.ts` and by the graph (spec C).
   *
   * A link to an ERASED ticket is never written, live or on rebuild, because
   * the purge registry answers the same both ways: the rule
   * `projections/notes.ts:285-291` keeps for a note attached to an erased ticket.
   * Trash keeps the row (spec §2.5); reads hide a trashed end.
   */
  export const ticketLinksProjection: Projection = {
    name: 'proj_ticket_links',
    tables: ['proj_ticket_links'],

    async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
      if (!isTicketLinkEvent(event.type) || event.entity.kind !== 'ticket') return;
      const { kind, targetId } = ticketLinkAddedPayload.parse(event.payload);
      if (event.type === 'ticket.link_removed') {
        await tx.query('DELETE FROM proj_ticket_links WHERE source_id = $1 AND target_id = $2 AND kind = $3', [
          event.entity.id,
          targetId,
          kind,
        ]);
        return;
      }
      if ((await purgedIdsAmong(tx, 'ticket', [event.entity.id, targetId])).size > 0) return;
      await tx.query(
        `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_id, target_id, kind) DO NOTHING`,
        [event.workspaceId, event.entity.id, targetId, kind, event.actorId, event.serverTime, event.origin, event.workspaceSeq],
      );
    },

    async reset(tx: PoolClient): Promise<void> {
      await tx.query('TRUNCATE proj_ticket_links');
    },
  };
  ```
  - `ON CONFLICT DO NOTHING` mirrors the reducer's idempotent add. The engine refuses a duplicate before it reaches the ledger (T3).
  - Check `ticket-comments.ts`'s `reset` for the exact TRUNCATE form, and copy it.

  `projections/index.ts`: `import { ticketLinksProjection } from './ticket-links.js';` and `registry.register(ticketLinksProjection);` on the line after `ticketsProjection`'s registration (`:91`). Read the comment there on why the order is load-bearing, and add one line: "links read nothing from proj_tickets, but sit beside it so a reader of the registry finds the pair together".

  `projections/tickets.ts`:
  - **`TicketRow`:** add `links: TicketState['links'] & {}`, i.e. `{ kind: TicketLinkKind; targetId: string }[]`. Import the `TicketLink` type and write `links: TicketLink[]`.
  - **`rowToTicketState`:** at the end of the returned object, add
    ```ts
        // Absent when empty, the reducer's own shape (typed-links T1): the rig compares the two with toEqual.
        ...(row.links.length > 0 ? { links: row.links } : {}),
    ```
  - **`upsertTicket`:** add `links` as the 20th column in the INSERT list, `$20` in VALUES, `links = EXCLUDED.links` in ON CONFLICT, and the value `JSON.stringify(next.links ?? [])`, with a comment in the existing `?? null` style.
  - Check every `SELECT` that builds a `TicketRow` (grep `rowToTicketState(` and `FROM proj_tickets` in `apps/server/src`). If one lists columns instead of `*`, add `links`.

  Run `pnpm --filter @gisik-nokma/server exec node-pg-migrate …` the way `pnpm check:migrations` documents (read `package.json` scripts), then the test file again.
  Expected: PASS 27.020–27.022. Flip them ✅.

  Commit.

- [ ] **Step 3: Purge (27.023–27.026)**

  Case lines:
  - `- ❌ **27.023 — purging a ticket deletes every `proj_ticket_links` row that names it, as source or target;** control: a link between two surviving tickets is untouched. Mutation: delete by `source_id` only → the incoming row survives.`
  - `- ❌ **27.024 — after the purge, a rebuild equals the live tables (`verifyProjections` is clean), although the surviving source's ledger still holds its `link_added` toward the erased id;** control: before the `isErased` guard is honoured (mutation), the diff names `proj_ticket_links`.`
  - `- ❌ **27.025 — a `ticket.link_added` or `link_removed` naming a purged target is refused by `checkPurged`;** control: the same event naming a live ticket returns `null`.`
  - `- ❌ **27.026 — `PURGE_TABLE_RULES` covers `proj_ticket_links` as `erase` by `workspace_id`, `source_id`, `target_id`, and 19.081–19.083 stay green.**`

  `table-rules.ts`, alphabetical with its neighbours or after `proj_ticket_comments`, matching the file's order:
  ```ts
    proj_ticket_links: {
      rule: 'erase',
      by: ['workspace_id', 'source_id', 'target_id'],
      why: 'Typed links (spec A). A row naming an erased ticket at EITHER end goes with it; the projection never re-inserts one (purged registry).',
    },
  ```
  If 19.082's column check expects every `by` column to be in the shared id-column list (`:40-44`: `'parent_id', 'home_project_id', 'parent_ticket_id'`), add `'source_id'` and `'target_id'` to that list. Read the test before deciding.

  `erasure.ts`, after the `proj_ticket_comments` statement:
  ```ts
      ['DELETE FROM proj_ticket_links WHERE source_id = ANY($1::text[]) OR target_id = ANY($1::text[])', [T]],
  ```
  A workspace purge goes through `workspaceScopedTables()`. Confirm it derives from `by` containing `workspace_id`; if it is a literal list, add the table.

  **What stays, decided:** the surviving source's `proj_tickets.links` still holds the erased id. The ledger keeps its `link_added`, and a rebuild folds it again, so live and rebuild agree. Every read joins the other end through `proj_tickets` and `canSee`, which drop it (T4). A `link_removed` naming it is refused by `checkPurged`, which is acceptable: nothing can show the link to remove. Record this in the projection's docblock.

  `apps/server/test/purge/purge-ticket-links.test.ts`. Copy `purge-comment-edits.test.ts`'s setup and its `world.ts` helpers:
  - `seedWorkspace`;
  - `projectCreated(base, P, name, prefix)`;
  - `ticketCreated(base, T, P, title)` ×3 (A, B, C);
  - `ev(base, 'ticket', A, 'ticket.link_added', { kind: 'blocks', targetId: B })`;
  - `ev(base, 'ticket', B, 'ticket.link_added', { kind: 'relates', targetId: C })`;
  - `ev(base, 'ticket', A, 'ticket.link_added', { kind: 'duplicates', targetId: C })`.

  Then:
  ```ts
  it('27.023/27.024 purge B: rows naming B go, A→C stays, rebuild equals live', async () => {
    // … ticket.deleted + purge.marked for B, as purge-comment-edits.test.ts does
    await purgeItem(db.pool, { kind: 'ticket', id: B }, { projections: buildProjectionRegistry(), store: recordingStore(), now: await dueAt(db.pool, 'ticket', B) });
    const { rows } = await db.pool.query('SELECT source_id, target_id, kind FROM proj_ticket_links ORDER BY kind');
    expect(rows).toEqual([{ source_id: A, target_id: C, kind: 'duplicates' }]);           // control survives
    const verdict = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(verdict.clean, JSON.stringify(verdict.diffs)).toBe(true);
  });
  it('27.025 checkPurged refuses a link to the erased ticket; control: a live target passes', async () => {
    const env = (target: string) => makeEnvelope({ workspaceId: WS, entity: { kind: 'ticket', id: A }, type: 'ticket.link_added', payload: { kind: 'blocks', targetId: target } });
    expect(await checkPurged(db.pool, env(B))).not.toBeNull();
    expect(await checkPurged(db.pool, env(C))).toBeNull();
  });
  ```
  Read `verifyProjections`' return shape at `apps/server/src/tools/verify-projections.ts:34` before asserting. Add 27.026's assertion to `apps/server/test/purge/table-rules.test.ts`, next to 19.081.

  Run: the purge folder and projections folder, LOCAL.
  Expected: PASS. Flip 27.023–27.026 ✅.

  Commit.

- [ ] **Step 4: Features, sweeps, mutations, DONE**
  - **Features:** replace `<!-- A T2 bullet -->` with `- ⚙️ **Typed links: the table** (typed-links T2; migration `apps/server/migrations/1791400000000_proj-ticket-links.sql`, `apps/server/src/projections/ticket-links.ts`) — …`. Name: trash keeps, purge erases both ends, rebuild equals live, and `proj_tickets.links` mirrors the fold. Cases 27.020–27.026.
  - **Checks:** `pnpm check:migrations`, `pnpm check:citations`, `pnpm check:tasks`.
  - **Sweeps:** server WHOLE; app-core and sync-client WHOLE (the dual-client rig reads `rowToTicketState`).
  - **Mutations:** as named on each case.

  Push. DONE.

---

### Task 3: The rules, on the server and the client (cases 27.035–27.049)

**Files:**
- Create:
  - `packages/rule-engine/src/checks/links.ts` (copy `checks/rank.ts:37-64`: the entity-kind guard, `safeParse` + `malformedPayloadDetail`, `getTicketState`, `ACCEPT`/`refuse`)
  - `packages/rule-engine/test/links.test.ts` (copy `test/rank.test.ts`: `buildMemoryContext([WF], [typeDefined(TASK), …])`, `makeEnvelope`, `test-support.js` constants)
  - `apps/server/test/permissions/check-link-permission.test.ts` (copy `check-comment-authority.test.ts`'s `checkPermission(env, { db: db.pool, sessionUserId })`)
  - `packages/app-core/test/precheck-links.test.ts`
- Modify:
  - `packages/rule-engine/src/checks/refusals.ts` (`REFUSALS`, `:28` onward; a builder beside `rankRefusal`)
  - `packages/rule-engine/src/evaluate.ts:33-79` (import + two arms before `default`)
  - `packages/rule-engine/src/fixtures/harness.ts:400-556` (`applyPriorEvent`): an arm only if this task adds a JSON fixture. It does not, so leave the harness and say so in the handoff.
  - `apps/server/src/permissions/check-permission.ts:1639-1641` (after the `canSee(source)` refusal) and a new reason constant beside `TICKET_NOT_VISIBLE_REASON` (`:198`)
  - `packages/app-core/src/precheck.ts:183-190` (routing) and a new `precheckTicketLink` beside `precheckTicketRanked` (`:550-574`)

**Interfaces:**
- **Consumes:** T1's payloads and `linkReading`. T2's `links` on `proj_tickets`, read by `createEngineContext` (`apps/server/src/engine-context.ts:222`) through `rowToTicketState`.
- **Produces:**
  - `checkTicketLink(env, ctx): Promise<Accept | Refusal>`;
  - REFUSALS keys `link.self`, `link.unknown-target`, `link.target-deleted`, `link.duplicate`, `link.reverse`, `link.absent`;
  - `linkExistsRefusal(kind, fromTitle, toTitle): string`;
  - `LINK_TARGET_NOT_VISIBLE_REASON` (server).

- [ ] **Step 1: RED engine tests 27.035–27.042**

  Case lines (each with its control in the same `it`):
  - `- ❌ **27.035 — a self-link is refused `link.self` "A ticket cannot be linked to itself.";** control: the same call to another ticket is accepted.`
  - `- ❌ **27.036 — a target that does not exist, or lives in another workspace, is refused `link.unknown-target` with one sentence for both;** control: a same-workspace target is accepted.`
  - `- ❌ **27.037 — a trashed target is refused `link.target-deleted`; a trashed source is refused `deleted-ticket` (the live gate);** control: after `ticket.restored` the same link is accepted.`
  - `- ❌ **27.038 — `blocks` and `duplicates` refuse the same ordered pair twice (`link.duplicate`, naming both titles);** control: a different kind on the same pair is accepted.`
  - `- ❌ **27.039 — `relates` is refused if the pair holds it in EITHER direction;** control: `relates` to a third ticket is accepted.`
  - `- ❌ **27.040 — `blocks` refuses its direct reverse: with B blocks A stored, A blocks B is refused `link.reverse` ""B" already blocks "A".";** control: a three-ticket cycle (A blocks B, B blocks C, C blocks A) is accepted at every step.`
  - `- ❌ **27.041 — `duplicates` refuses its direct reverse the same way;** control: A duplicates B with nothing stored is accepted.`
  - `- ❌ **27.042 — `link_removed` must name a link stored on THIS stream: removing `relates` from the end that did not store it is refused `link.absent`;** control: the same removal on the storing stream is accepted.`

  `packages/rule-engine/test/links.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
  import { buildMemoryContext } from '../src/memory-context.js';
  import { evaluateEvent } from '../src/evaluate.js';
  import { OTHER_WS, PROJECT, PROJECT_B, TASK, WF, WS, createdIn, typeDefined } from '../src/checks/test-support.js';

  const A = '01J9GTKA100000000000000000';
  const B = '01J9GTKB100000000000000000';
  const C = '01J9GTKC100000000000000000';
  const FOREIGN = '01J9GTKF100000000000000000';

  /** A titled birth, like rank.test.ts's local `bornInBacklog`: the reasons name titles. */
  const born = (id: string, title: string, workspaceId = WS): EventEnvelope =>
    makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId,
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title } });
  const link = (source: string, kind: string, target: string, type = 'ticket.link_added'): EventEnvelope =>
    makeEnvelope({ type, entity: { kind: 'ticket', id: source }, workspaceId: WS, payload: { kind, targetId: target } });
  const del = (id: string) => makeEnvelope({ type: 'ticket.deleted', entity: { kind: 'ticket', id }, workspaceId: WS, payload: {} });
  const restore = (id: string) => makeEnvelope({ type: 'ticket.restored', entity: { kind: 'ticket', id }, workspaceId: WS, payload: {} });
  const world = (...after: EventEnvelope[]) =>
    buildMemoryContext([WF], [typeDefined(TASK), born(A, 'Ice maker'), born(B, 'Chiller'), born(C, 'Freezer'), ...after]);
  const ok = { refused: false };

  describe('27.035–27.042 typed-link rules', () => {
    it('27.035 self-link refused; control: another ticket accepted', async () => {
      expect(await evaluateEvent(link(A, 'blocks', A), world())).toEqual({ refused: true, rule: 'link.self', reason: 'A ticket cannot be linked to itself.' });
      expect(await evaluateEvent(link(A, 'blocks', B), world())).toEqual(ok);
    });
    it('27.036 unknown and foreign targets share one refusal; control: same workspace accepted', async () => {
      const foreignWorld = buildMemoryContext([WF], [typeDefined(TASK), born(A, 'Ice maker'), createdIn(OTHER_WS, FOREIGN, 'task', PROJECT_B), born(B, 'Chiller')]);
      const refusal = { refused: true, rule: 'link.unknown-target', reason: 'The other ticket does not exist in this workspace.' };
      expect(await evaluateEvent(link(A, 'relates', '01J9GTKZ000000000000000000'), world())).toEqual(refusal);
      expect(await evaluateEvent(link(A, 'relates', FOREIGN), foreignWorld)).toEqual(refusal);
      expect(await evaluateEvent(link(A, 'relates', B), foreignWorld)).toEqual(ok);
    });
    it('27.037 trashed target / source refused; control: restored accepted', async () => {
      expect(await evaluateEvent(link(A, 'blocks', B), world(del(B)))).toEqual({
        refused: true, rule: 'link.target-deleted', reason: 'The other ticket is deleted. Restore it, or pick another ticket.' });
      expect((await evaluateEvent(link(A, 'blocks', B), world(del(A)))).refused).toBe(true);
      expect(await evaluateEvent(link(A, 'blocks', B), world(del(B), restore(B)))).toEqual(ok);
    });
    it('27.038 ordered duplicate refused; control: another kind accepted', async () => {
      expect(await evaluateEvent(link(A, 'blocks', B), world(link(A, 'blocks', B)))).toEqual({
        refused: true, rule: 'link.duplicate', reason: '"Ice maker" already blocks "Chiller".' });
      expect(await evaluateEvent(link(A, 'duplicates', B), world(link(A, 'duplicates', B)))).toMatchObject({ rule: 'link.duplicate' });
      expect(await evaluateEvent(link(A, 'relates', B), world(link(A, 'blocks', B)))).toEqual(ok);
    });
    it('27.039 relates refused in either direction; control: a third ticket accepted', async () => {
      expect(await evaluateEvent(link(A, 'relates', B), world(link(B, 'relates', A)))).toEqual({
        refused: true, rule: 'link.duplicate', reason: '"Chiller" already relates to "Ice maker".' });
      expect(await evaluateEvent(link(A, 'relates', C), world(link(B, 'relates', A)))).toEqual(ok);
    });
    it('27.040 blocks reverse refused; control: a three-cycle is accepted', async () => {
      expect(await evaluateEvent(link(A, 'blocks', B), world(link(B, 'blocks', A)))).toEqual({
        refused: true, rule: 'link.reverse', reason: '"Chiller" already blocks "Ice maker".' });
      expect(await evaluateEvent(link(C, 'blocks', A), world(link(A, 'blocks', B), link(B, 'blocks', C)))).toEqual(ok);
    });
    it('27.041 duplicates reverse refused; control: nothing stored accepted', async () => {
      expect(await evaluateEvent(link(A, 'duplicates', B), world(link(B, 'duplicates', A)))).toEqual({
        refused: true, rule: 'link.reverse', reason: '"Chiller" already duplicates "Ice maker".' });
      expect(await evaluateEvent(link(A, 'duplicates', B), world())).toEqual(ok);
    });
    it('27.042 remove must name a link stored on this stream; control: the storing stream accepted', async () => {
      const stored = world(link(B, 'relates', A));
      expect(await evaluateEvent(link(A, 'relates', B, 'ticket.link_removed'), stored)).toEqual({
        refused: true, rule: 'link.absent', reason: 'This ticket holds no such link, so there is nothing to remove.' });
      expect(await evaluateEvent(link(B, 'relates', A, 'ticket.link_removed'), stored)).toEqual(ok);
    });
  });
  ```
  Read `test-support.ts` for `createdIn`'s argument order and `PROJECT_B`'s workspace before running. If `created`'s ticket type id is not `'task'`, use the id `TASK` declares.

  Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run test/links.test.ts --maxWorkers=2 > /tmp/kg-a3.log 2>&1; tail -40 /tmp/kg-a3.log`.
  Expected: FAIL (the default arm accepts everything).

- [ ] **Step 2: The engine check**

  `refusals.ts`. Add inside `REFUSALS`, after the `hierarchy.*` entries:
  ```ts
    /** Typed links (Knowledge Graph spec A §2.3, rule 1). */
    'link.self': 'A ticket cannot be linked to itself.',
    /**
     * Rule 2, and deliberately ONE sentence for "no such ticket" and "a ticket in
     * another workspace": the controller ruling P12 reasoning on
     * `hierarchy.unknown-parent` above, because `getTicketState` is global.
     */
    'link.unknown-target': 'The other ticket does not exist in this workspace.',
    'link.target-deleted': 'The other ticket is deleted. Restore it, or pick another ticket.',
    /** The two "already" refusals carry titles; their reason is built by `linkExistsRefusal`. */
    'link.duplicate': 'This link already exists.',
    'link.reverse': 'The reverse of this link already exists.',
    /** A removal that names a link this stream does not hold (typed-links plan T3; not in the spec's list). */
    'link.absent': 'This ticket holds no such link, so there is nothing to remove.',
  ```
  Beside `rankRefusal`:
  ```ts
  /** `"<from>" already <reading> "<to>".`: titles, because the engine holds no ticket keys. */
  export function linkExistsRefusal(kind: TicketLinkKind, fromTitle: string, toTitle: string): string {
    return `"${fromTitle}" already ${linkReading(kind, 'out')} "${toTitle}".`;
  }
  ```

  `checks/links.ts`:
  ```ts
  import type { EventEnvelope, TicketLinkKind, TicketState } from '@gisik-nokma/domain';
  import { ticketLinkAddedPayload } from '@gisik-nokma/domain';
  import type { Accept, EngineContext, Refusal } from '../engine.js';
  import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
  import { getTicketState } from './context-helpers.js';
  import { ACCEPT, linkExistsRefusal, refuse } from './refusals.js';

  const holds = (t: TicketState, kind: TicketLinkKind, targetId: string): boolean =>
    (t.links ?? []).some((l) => l.kind === kind && l.targetId === targetId);
  const titleOf = (t: TicketState): string => {
    const v = t.fields['title']?.value;
    return typeof v === 'string' && v !== '' ? v : t.id;
  };

  /**
   * Typed links, rules 1–5 (spec A §2.3) plus `link.absent`. Both tickets' links
   * come from `getEntityState`, which on the server is `proj_tickets.links`
   * (typed-links T2) and on the client the cache (`precheck.ts`). The rules
   * about WHO may link (6, 7) are the permission gate's, because they need
   * `canSee`, which this context does not carry.
   *
   * A deleted SOURCE never reaches here: `checkTicketLive` refuses it ahead of
   * the dispatch (`evaluate.ts`). The two event types share one payload shape,
   * so one schema parses both.
   */
  export async function checkTicketLink(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
    if (env.entity.kind !== 'ticket') {
      return refuse(REFUSAL_RULES.malformedPayload,
        `This ${env.type} event does not point at a ticket; it points at a ${env.entity.kind}.`);
    }
    const parsed = ticketLinkAddedPayload.safeParse(env.payload);
    if (!parsed.success) {
      return refuse(REFUSAL_RULES.malformedPayload,
        `This ${env.type} event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
    }
    const { kind, targetId } = parsed.data;
    const source = await getTicketState(ctx, env.entity.id);
    if (source === null) return refuse(REFUSAL_RULES.unknownTicket, `This event links ticket ${env.entity.id}, but no such ticket is known.`);
    if (env.type === 'ticket.link_removed') return holds(source, kind, targetId) ? ACCEPT : refuse('link.absent');

    if (targetId === source.id) return refuse('link.self');
    const target = await getTicketState(ctx, targetId);
    if (target === null || target.workspaceId !== env.workspaceId) return refuse('link.unknown-target');
    if ((target.deleted ?? null) !== null) return refuse('link.target-deleted');
    if (holds(source, kind, targetId)) return refuse('link.duplicate', linkExistsRefusal(kind, titleOf(source), titleOf(target)));
    if (holds(target, kind, source.id)) {
      // `relates` is unordered, so its stored reverse IS a duplicate (rule 3);
      // for blocks and duplicates it is the direct reverse (rules 4 and 5).
      return refuse(kind === 'relates' ? 'link.duplicate' : 'link.reverse', linkExistsRefusal(kind, titleOf(target), titleOf(source)));
    }
    return ACCEPT;
  }
  ```

  `evaluate.ts`: `import { checkTicketLink } from './checks/links.js';` and before `default:`
  ```ts
      // Typed links (spec A): rules 1–5 and `link.absent`. Workflow rules do not react to links.
      case 'ticket.link_added':
      case 'ticket.link_removed':
        return checkTicketLink(env, ctx);
  ```

  This is a real arm, not the spec's "no-op arm" (§2.6). The spec puts rules 1–5 in "the server's precheck", and the engine IS the server's precheck: one implementation, evaluated by ingest and by the client.

  Run the rule-engine suite WHOLE.
  Expected: PASS, including 27.035–27.042. `engine.test.ts:671-702` is unchanged, because no `REFUSAL_RULES` id was added. Flip 27.035–27.042 ✅.

  Commit.

- [ ] **Step 3: The permission gate (27.043–27.044)**

  Case lines:
  - `- ❌ **27.043 — a member who cannot see the TARGET is refused `permission.visibility` "The other ticket does not exist in this workspace, or you cannot see it." for both link events, and so is a target id that does not exist (one sentence, no oracle);** control: the same member linking two tickets they can see passes the gate.`
  - `- ❌ **27.044 — a member who cannot see the SOURCE is refused by the existing `canSee(source)` line before the target is asked;** control: the owner, who sees both, passes.`

  `check-permission.ts`:
  - Beside `TICKET_NOT_VISIBLE_REASON` (`:198`):
    ```ts
    /**
     * Typed links, rules 6 and 7 (spec A §2.3): the one sentence for a target
     * this person cannot see AND for one that does not exist, so the gate is no
     * existence oracle (`canSee` answers false for both, its own docblock).
     */
    export const LINK_TARGET_NOT_VISIBLE_REASON = 'The other ticket does not exist in this workspace, or you cannot see it.';
    ```
  - Directly after the `canSee(source)` refusal (`:1639-1641`):
    ```ts
      /**
       * Typed links (spec A, rules 6 and 7). Adding needs the right to edit the
       * source: for a ticket-stream event that right IS `canSee` (the line above,
       * the same gate `ticket.field_set` meets). Both events also need the target
       * to be visible. Rule 7's "either end" collapses to "both": a person who sees
       * only one end is never shown the link (§2.4), so there is nothing they
       * could be removing.
       */
      if (env.type === 'ticket.link_added' || env.type === 'ticket.link_removed') {
        const link = ticketLinkAddedPayload.safeParse(env.payload);
        if (link.success && link.data.targetId !== env.entity.id
            && !(await canSee(ctx.db, ctx.sessionUserId, link.data.targetId))) {
          return refuseWith(PERMISSION_VISIBILITY_RULE, LINK_TARGET_NOT_VISIBLE_REASON);
        }
      }
    ```
    Import `ticketLinkAddedPayload` from `@gisik-nokma/domain` with the file's other payload imports. A malformed payload falls through to the engine's `malformed-payload`.

  `apps/server/test/permissions/check-link-permission.test.ts`:
  - Use `buildReadTestApp(db)` for the world (`helpers/read-app.ts:209`). It gives `world.world.taskInEpicId` and `sharedTaskId` (the member sees both) and `hiddenTaskId` (`visibility.set` explicit `[owner]`, `helpers/read-scenario.ts:179-180`), plus `world.userIds.member` / `owner`.
  - Copy `check-comment-authority.test.ts` for `makeEnvelope` + `checkPermission(env, { db: db.pool, sessionUserId })`.

  ```ts
  it('27.043 hidden or unknown target refused with one sentence; control: two visible tickets pass', async () => {
    const env = (source: string, target: string, type = 'ticket.link_added') =>
      makeEnvelope({ type, workspaceId: WS, actorId: member, entity: { kind: 'ticket', id: source }, payload: { kind: 'blocks', targetId: target } });
    const refusal = { refused: true, rule: 'permission.visibility', reason: 'The other ticket does not exist in this workspace, or you cannot see it.' };
    expect(await checkPermission(env(inEpic, hidden), { db: db.pool, sessionUserId: member })).toMatchObject(refusal);
    expect(await checkPermission(env(inEpic, hidden, 'ticket.link_removed'), { db: db.pool, sessionUserId: member })).toMatchObject(refusal);
    expect(await checkPermission(env(inEpic, newUlid()), { db: db.pool, sessionUserId: member })).toMatchObject(refusal);
    expect(await checkPermission(env(inEpic, shared), { db: db.pool, sessionUserId: member })).toBeNull();
  });
  ```
  - Read `checkPermission`'s return type at `:1915-1998`. If it returns `Refusal | null` with a different field set, match it; the comment-authority test shows the form.
  - **27.044:** `env(hidden, shared)` as member is refused with `TICKET_NOT_VISIBLE_REASON`'s literal `'This ticket is not visible to you.'`. Control: the same as owner → `null`.

  Run: server `test/permissions`, LOCAL.
  Expected: PASS. Flip ✅.

  Commit.

- [ ] **Step 4: The client precheck (27.045)**

  Case line:
  - `- ❌ **27.045 — the client precheck predicts the engine's link refusals word for word (self, duplicate, relates-reverse, blocks-reverse, absent) from the cache, and answers `not-evaluated` when either ticket is not cached;** control: a fresh link between two cached tickets is `passed`.`

  `precheck.ts`:
  - Add routing after the `ticket.ranked` line (`:185`):
    ```ts
      if (submitted.type === 'ticket.link_added' || submitted.type === 'ticket.link_removed') {
        return precheckTicketLink(submitted, cache, deps);
      }
    ```
  - Add beside `precheckTicketRanked`:
    ```ts
    /**
     * Typed links (spec A): the SHARED engine, on the cache, and nothing typed
     * twice. Unlike `precheckTicketRanked`, there is no second literal to agree
     * with, because every reason is the engine's own (`checks/links.ts`). The
     * guard is the cache: both tickets must be held, or "I have never heard of
     * it" would read as `link.unknown-target`. The client's copy of `links` is
     * the server's, filtered to targets this viewer can see (typed-links T4);
     * the rules compare only the pair, and both ends of the pair are visible.
     */
    async function precheckTicketLink(submitted: SubmittedEvent, cache: ClientStateCache, deps: PrecheckDeps): Promise<PrecheckResult> {
      const parsed = ticketLinkAddedPayload.safeParse(submitted.payload);
      if (!parsed.success) return notEvaluated();
      if (cache.getTicket(submitted.entity.id) === undefined) return notEvaluated();
      if (submitted.type === 'ticket.link_added' && parsed.data.targetId !== submitted.entity.id
          && cache.getTicket(parsed.data.targetId) === undefined) return notEvaluated();
      const evaluate = deps.evaluate ?? evaluateEvent;
      const verdict = await evaluate(completeForPrecheck(submitted, deps.now), contextFromCache(cache));
      return verdict.refused ? { kind: 'refused', rule: verdict.rule, reason: verdict.reason } : { kind: 'passed' };
    }
    ```
  - Read the existing `precheck.test.ts` for how a `ClientStateCache` is built in tests (`createClientStateCache` or similar, in `src/cache.ts`), and seed it with `ticketStateSeed({ id, fields: { title: { value: 'Ice maker', … } }, links })` from `test/helpers/seed.ts`.
  - Write `packages/app-core/test/precheck-links.test.ts` with one `it` per refusal plus the not-cached and passed controls in the same `it`s. Assert the literal reasons copied from 27.035–27.042, never imported constants.

  Run: app-core `test/precheck-links.test.ts` and `test/precheck*.test.ts`, LOCAL.
  Expected: PASS. Flip 27.045 ✅.

  Commit.

- [ ] **Step 5: Features, sweeps, DONE**
  - **Features:** replace `<!-- A T3 bullet -->` with `- ⚙️ **Typed links: the rules** (typed-links T3; `packages/rule-engine/src/checks/links.ts`, `apps/server/src/permissions/check-permission.ts`, `packages/app-core/src/precheck.ts`) — …`. Name all seven rules plus `link.absent`, and the one-sentence visibility refusal. Cases 27.035–27.045.
  - **Sweeps:** rule-engine, app-core, sync-client WHOLE (`local-context.ts` runs the same engine offline), server WHOLE.
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 27.039 | drop the `holds(target, …)` branch |
    | 27.040 | refuse every `blocks` whose target holds any `blocks` (the cycle control goes red) |
    | 27.043 | remove the new `canSee` |
    | 27.045 | route links to `notEvaluated()` |

  Push. DONE.

---

### Task 4: Reads, History labels, MCP and the replica (cases 27.050–27.064)

**Files:**
- Create:
  - `apps/server/src/read/ticket-links.ts` (copy `read/notes.ts:115-155`: `SqlParams`, `LIVE_TICKET_WHERE`, `visibleTicketsWhere(eff, userId, params)`, keys via `keysForAncestors`)
  - `apps/server/src/routes/ticket-links.ts` (copy `routes/notes.ts:87-96`: `resolveEffectiveRole`)
  - `apps/server/test/routes/ticket-links.test.ts` (copy `test/routes/notes.test.ts:1-60`: `buildReadTestApp`, `world.authOf(role)`, `app.inject`)
- Modify:
  - **Server:**
    - `apps/server/src/app.ts` or wherever `registerNotesRoutes` is registered (grep): register the new route the same way.
    - `apps/server/src/routes/tickets.ts:700-710`: `ticketState: state` → filtered.
    - `apps/server/src/routes/ticket-history.ts`: `TicketHistoryEvent` (`:29-39`) gains `linkTarget?`; the handler (`:266-311`) labels link events.
  - **MCP:**
    - `packages/mcp-server/src/tools/ticket-tools.ts`: a `link_tickets` tool after `rank_ticket` (`:163-179`, its sibling); `historyLine` (`:62`) passes `linkTarget` through.
    - `packages/mcp-server/src/tools/read-tools.ts:149-171` (`get_ticket`).
    - `packages/mcp-server/test/fixtures/tool-names.ts` (the `// ticket begin (T9)` block, after `'rank_ticket'`).
    - `packages/mcp-server/test/register.test.ts:87-110` (14.555: the literal list + `toHaveLength(63)` → 64). Check 14.80/14.81 and the hosted 14.262 list the same way (grep `rank_ticket` in `packages/mcp-server/test` and `apps/server/test/mcp`).
    - `apps/server/test/mcp/mcp-tickets.test.ts:83-119` (14.458 door matrix: one `link_tickets` row).
  - **App-core:**
    - `packages/app-core/src/data-source.ts:387` (`DataSourceQuery.getTicketLinks`);
    - `packages/app-core/src/view-types.ts` (`TicketLinkView`);
    - `packages/app-core/src/online/mappers.ts`: `mapTicketState` (`:1956-2060`) carries `links`; new `mapTicketLinks` beside `mapNoteSummaries` (`:2833`); `mapHistory` (`:785-801`) reads `linkTarget`;
    - `packages/app-core/src/online/online-data-source.ts` (after `getNotesForTicket`, `:463-466`);
    - `packages/app-core/src/replica/replica-data-source.ts` (after `getNotesForTicket`, `:1291-1294`; reuse `confirmedById`, `:973`);
    - `packages/app-core/test/helpers/fake-data-source.ts` (default `getTicketLinks: async () => []`);
    - `apps/web/test/helpers/stub-services.ts:167` (`getTicketLinks: unstubbed('getTicketLinks')`).
  - **Sync / rig:** `apps/server/test/dual-client/scenarios.test.ts:192-203` (one scenario).

**Interfaces:**
- **Consumes:** T1 (`linkReading`, `TicketLinkKind`, `TicketHistoryEvent.linkTarget`, `redactedPayload`), T2 (`proj_ticket_links`), T3 (rules).
- **Produces:**
  - **Wire:** `GET /v1/workspaces/:workspaceId/tickets/:ticketId/links` → `{ links: TicketLinkWire[] }`, where `TicketLinkWire = { kind: TicketLinkKind; direction: 'out' | 'in'; ticket: { id: string; projectId: string; key: string | null; title: string; stateCategory: StateCategory } }`. It answers 404 `NOT_FOUND_BODY` when the viewer cannot see `:ticketId`.
  - **Server:** `listTicketLinks(db, eff, viewerId, workspaceId, ticketId): Promise<TicketLinkWire[]>`.
  - **App-core:** `TicketLinkView` in `view-types.ts`, REDECLARING `TicketLinkWire`'s shape (app-core cannot import from `apps/server`); `DataSourceQuery.getTicketLinks(workspaceId: string, ticketId: string): Promise<TicketLinkView[]>`; `mapTicketLinks(raw: unknown): TicketLinkView[]`.
  - **MCP:** `link_tickets { workspaceId, ticketId, targetId, kind, action: 'add' | 'remove' }`.

- [ ] **Step 1: RED server read tests 27.050–27.054**

  Case lines:
  - `- ❌ **27.050 — `GET …/tickets/:id/links` answers both directions (out: blocks; in: is blocked by) with the other end's key, title and status category; a member does not get the link whose other end is hidden from them, and the response carries no count or trace of it;** control: the owner gets it.`
  - `- ❌ **27.051 — a trashed other end drops the row; restoring it brings the row back;** control: the row is present before the trash.`
  - `- ❌ **27.052 — the ticket detail read's `ticketState.links` holds only targets this viewer can see, and has no key when none remain;** control: the owner's read holds both.`
  - `- ❌ **27.053 — History labels link events: `linkTarget: { key }` for a visible target; for a hidden one `linkTarget: null` AND `payload.targetId: null` (the id is withheld);** control: a non-link event carries no `linkTarget`, and its payload is untouched.`
  - `- ❌ **27.054 — a link removed from the TARGET's side is a `link_removed` on the SOURCE's history, with the remover as actor;** control: the target's own history holds no link event.`

  In `apps/server/test/routes/ticket-links.test.ts`:
  - **World:** `buildReadTestApp` (`S = world.world.taskInEpicId`, `SH = sharedTaskId`, `H = hiddenTaskId`; member sees S and SH, not H).
  - **Seed:** `applyCommitted(db.pool, [link(S,'blocks',SH), link(H,'relates',S), link(S,'duplicates',H)])`, where `link` is `makeCommitted({ workspaceId: WS, actorId: owner, entity: { kind: 'ticket', id: source }, type: 'ticket.link_added', payload: { kind, targetId } })`.

  ```ts
  it('27.050 both directions, hidden ends dropped with no trace; control: owner sees all', async () => {
    const get = (role: ReadRole) => app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${S}/links`, headers: world.authOf(role) });
    const member = (await get('member')).json() as { links: Array<{ kind: string; direction: string; ticket: { id: string } }> };
    expect(member.links.map((l) => [l.kind, l.direction, l.ticket.id])).toEqual([['blocks', 'out', SH]]);
    expect(JSON.stringify(member)).not.toContain(H);
    expect(Object.keys(member)).toEqual(['links']);
    const owner = (await get('owner')).json() as typeof member;
    expect(owner.links.map((l) => [l.kind, l.direction, l.ticket.id]).sort()).toEqual(
      [['blocks', 'out', SH], ['duplicates', 'out', H], ['relates', 'in', H]].sort());
  });
  ```
  - **The ticket shape:** add one assertion that the `blocks` row's `ticket` has `key` (a string matching `/-\d+$/`), `title` `'Renew the trade licence'` (`read-scenario.ts:177`) and a `stateCategory`.
  - **27.052:** `GET /v1/workspaces/${WS}/tickets/${S}` as member: `ticketState.links` equals `[{ kind: 'blocks', targetId: SH }]`. As owner: two entries.
  - **27.053:** `GET /v1/tickets/${S}/history` as member. The `duplicates` event has `linkTarget: null` and `payload: { kind: 'duplicates', targetId: null }`. The `blocks` event has `linkTarget: { key: <SH's key> }` and its payload whole. Control: the `ticket.created` event has no `linkTarget` key.
  - **27.054:** apply `makeCommitted({ …, actorId: member, entity: { kind: 'ticket', id: S }, type: 'ticket.link_removed', payload: { kind: 'blocks', targetId: SH } })` (the member removing from SH's sheet files on S). S's history has it with `actorId` member; SH's history has no `ticket.link_*` event.
  - Put 27.051 in the same file, with `ticket.deleted` / `ticket.restored` on SH.

  Run: server `test/routes/ticket-links.test.ts`, LOCAL.
  Expected: FAIL (404 route, no labels).

- [ ] **Step 2: Server reads**

  `apps/server/src/read/ticket-links.ts`:
  ```ts
  import type { StateCategory, TicketLinkKind } from '@gisik-nokma/domain';
  import type { Queryable } from '../db/queryable.js';
  import type { EffectiveRole } from '../permissions/effective-role.js';
  import { keysForAncestors } from './ancestry.js';
  import { SqlParams } from './sql-params.js';
  import { LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';

  export type TicketLinkWire = {
    kind: TicketLinkKind;
    direction: 'out' | 'in';
    ticket: { id: string; projectId: string; key: string | null; title: string; stateCategory: StateCategory };
  };

  /**
   * Both directions of one ticket's typed links, as `viewerId` may see them
   * (spec A §2.4): a row whose OTHER end is hidden or trashed is not returned,
   * and nothing counts it. The caller has already answered `canSee(ticketId)`.
   * The visibility predicate is the one every list uses (`visibleTicketsWhere`,
   * over `proj_visibility v` and `proj_tickets t`), so this read and the board
   * cannot disagree about what this person sees.
   */
  export async function listTicketLinks(
    db: Queryable, eff: EffectiveRole, viewerId: string, workspaceId: string, ticketId: string,
  ): Promise<TicketLinkWire[]> {
    const params = new SqlParams();
    const ws = params.add(workspaceId);
    const me = params.add(ticketId);
    const { rows } = await db.query<{ kind: TicketLinkKind; direction: 'out' | 'in'; ticket_id: string; project_id: string; title: string | null; state_category: StateCategory }>(
      `SELECT l.kind,
              CASE WHEN l.source_id = ${me} THEN 'out' ELSE 'in' END AS direction,
              t.ticket_id, t.project_id, t.fields -> 'title' ->> 'value' AS title, t.state_category
         FROM proj_ticket_links l
         JOIN proj_tickets t ON t.ticket_id = CASE WHEN l.source_id = ${me} THEN l.target_id ELSE l.source_id END
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE l.workspace_id = ${ws} AND (l.source_id = ${me} OR l.target_id = ${me})
          AND t.workspace_id = ${ws} AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, viewerId, params)}
        ORDER BY l.seq`,
      params.toArray(),
    );
    const keys = await keysForAncestors(db, workspaceId, rows.map((r) => ({ ticketId: r.ticket_id, projectId: r.project_id })));
    return rows.map((r) => ({
      kind: r.kind,
      direction: r.direction,
      ticket: { id: r.ticket_id, projectId: r.project_id, key: keys.get(r.ticket_id) ?? null, title: r.title ?? '', stateCategory: r.state_category },
    }));
  }
  ```

  `routes/ticket-links.ts`:
  ```ts
  import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
  import type { Queryable } from '../db/queryable.js';
  import { resolveEffectiveRole } from '../permissions/effective-role.js';
  import { listTicketLinks } from '../read/ticket-links.js';
  import { canSee } from '../visibility/can-see.js';
  import { NOT_FOUND_BODY } from './tickets.js';

  /** Spec A §3.1/§4: one ticket's links, both directions, visible ends only. A ticket you cannot see is a 404, byte-identical to one that does not exist. */
  export function registerTicketLinkRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
    app.get<{ Params: { workspaceId: string; ticketId: string } }>(
      '/v1/workspaces/:workspaceId/tickets/:ticketId/links',
      { preHandler: requireSession },
      async (request, reply) => {
        const userId = request.currentUserId;
        const { workspaceId, ticketId } = request.params;
        if (!(await canSee(deps.pool, userId, ticketId))) return reply.code(404).send(NOT_FOUND_BODY);
        const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
        return { links: await listTicketLinks(deps.pool, eff, userId, workspaceId, ticketId) };
      },
    );
  }
  ```
  Register it where `registerTicketHistoryRoute` is registered (grep `registerTicketHistoryRoute(` in `apps/server/src`).

  `routes/tickets.ts`, before the `return` at `:700`:
  ```ts
      // Spec A §2.4: the folded links are the engine's whole truth; a reader gets only the targets they can see.
      const seen = await Promise.all((state.links ?? []).map(async (l) => ((await canSee(deps.pool, request.currentUserId, l.targetId)) ? l : null)));
      const visibleLinks = seen.filter((l): l is NonNullable<typeof l> => l !== null);
      const { links: _all, ...stateWithoutLinks } = state;
      const servedState = visibleLinks.length > 0 ? { ...stateWithoutLinks, links: visibleLinks } : stateWithoutLinks;
  ```
  Then serve `ticketState: servedState` and `title: titleOf(state)`. Check that the file imports `canSee` (it does, for the route's own guard; re-read) and that the request user is named `request.currentUserId` there.

  `routes/ticket-history.ts`:
  - Add `linkTarget?: { key: string | null } | null;` to `TicketHistoryEvent`, with a docblock: "Link events only (spec A §2.4): the one derived field this route serves. A hidden target is withheld from the payload too, which is the spec's rule overriding 'every claim-bearing field goes out whole' for one id, the other end's."
  - After `rows.map(toHistoryEvent)`:
  ```ts
      const events = rows.map(toHistoryEvent);
      const linkTargets = [...new Set(events.filter((e) => isTicketLinkEvent(e.type))
        .map((e) => (e.payload as { targetId?: unknown }).targetId).filter((t): t is string => typeof t === 'string'))];
      if (linkTargets.length > 0) {
        const { rows: owners } = await deps.pool.query<{ ticket_id: string; workspace_id: string; project_id: string }>(
          'SELECT ticket_id, workspace_id, project_id FROM proj_tickets WHERE ticket_id = ANY($1::text[])', [linkTargets]);
        const visible = new Map<string, string | null>();
        for (const o of owners) {
          if (!(await canSee(deps.pool, request.currentUserId, o.ticket_id))) continue;
          const keys = await keysForAncestors(deps.pool, o.workspace_id, [{ ticketId: o.ticket_id, projectId: o.project_id }]);
          visible.set(o.ticket_id, keys.get(o.ticket_id) ?? null);
        }
        for (const e of events) {
          if (!isTicketLinkEvent(e.type)) continue;
          const p = e.payload as { kind: string; targetId: string };
          if (visible.has(p.targetId)) e.linkTarget = { key: visible.get(p.targetId)! };
          else { e.linkTarget = null; e.payload = { kind: p.kind, targetId: null }; }
        }
      }
      return { ticketId: id, events };
  ```
  A history page is at most `MAX_LIMIT` events, so the per-target loop is bounded.

  The drift test in `ticket-history.test.ts` compares only ordered event ids across the two routes, so it stays green. Re-run it.

  `mappers.ts`:
  - **`mapTicketState`:** add `links` when the wire has a non-empty array. Validate each entry with `asString` on `kind` and `targetId`. Keep the field absent otherwise, matching the domain.
  - **`mapHistory`:** add
    ```ts
        ...(event['linkTarget'] === undefined ? {} : {
          linkTarget: event['linkTarget'] === null ? null : { key: asStringOrNull(asRecord(event['linkTarget'], `${path}.linkTarget`)['key'], `${path}.linkTarget.key`) },
        }),
    ```
  - **`mapTicketLinks`:** a new mapper, field by field, in the `mapNoteSummaries` style (`:2833`): `asRecord(raw,'links')`, `asArray(record['links'],'links.links')`, `kind` checked against `TICKET_LINK_KINDS`, `direction` against `['out','in']`, otherwise `MappingError`.

  Run the server routes tests again.
  Expected: PASS 27.050–27.054. Flip ✅.

  Commit.

- [ ] **Step 3: App-core reads and the replica (27.061–27.064)**

  Case lines:
  - `- ❌ **27.061 — offline, the replica folds both link events and `getTicketLinks` answers both directions from confirmed state, skipping a missing or trashed other end, with `key: null`;** control: online, `getTicketLinks` maps the wire's key.`
  - `- ❌ **27.062 — the dual-client rig: after add, remove and a reverse `relates` refused at the server, the replica's TicketState equals the server's `rowToTicketState` (`toEqual`), links included.**`
  - `- ❌ **27.063 — `mapTicketState` carries `links`, `mapHistory` carries `linkTarget` (`null` and `{key}`), `mapTicketLinks` refuses an unknown kind or direction by name;** control: a wire with no `links` maps to a state with no key.`
  - `- ❌ **27.064 — a bootstrap snapshot of a linked ticket carries its `links`, and the link events are NOT in the backfill list (they fold);** control: a `comment.added` below the snapshot is backfilled, as 12.115 pins.`

  **Online** (`online-data-source.ts`, copy `:463-466`):
  ```ts
      getTicketLinks: async (workspaceId, ticketId) => {
        const raw = await http.get(`/v1/workspaces/${workspaceId}/tickets/${ticketId}/links`);
        return raw === null ? [] : mapTicketLinks(raw);
      },
  ```

  **Replica** (`replica-data-source.ts`, after `getNotesForTicket`):
  ```ts
      /**
       * Typed links offline (spec A): computed from confirmed state, both
       * directions. A ticket the server never sent this device is not in the
       * replica, which is this device's visibility; a trashed end is skipped
       * like the online read's `LIVE_TICKET_WHERE`. Keys are null offline, as
       * every replica-built key here is.
       */
      getTicketLinks: async (workspaceId, ticketId) => {
        const byId = await confirmedById(workspaceId);
        const me = byId.get(ticketId);
        if (me === undefined) return [];
        const view = (other: TicketState, kind: TicketLinkKind, direction: 'out' | 'in'): TicketLinkView => ({
          kind, direction,
          ticket: { id: other.id, projectId: other.projectId, key: null, title: String(other.fields['title']?.value ?? ''), stateCategory: other.stateCategory },
        });
        const live = (t: TicketState | undefined): t is TicketState => t !== undefined && (t.deleted ?? null) === null;
        const out = (me.links ?? []).flatMap((l) => { const o = byId.get(l.targetId); return live(o) ? [view(o, l.kind, 'out')] : []; });
        const incoming = [...byId.values()].flatMap((o) =>
          o.id === ticketId || !live(o) ? [] : (o.links ?? []).filter((l) => l.targetId === ticketId).map((l) => view(o, l.kind, 'in')));
        return [...out, ...incoming];
      },
  ```
  Read `confirmedById` (`:973-978`) to confirm it is in scope at this point of the factory.

  **Fake and stub:** add `getTicketLinks: async () => []` to `createFakeDataSource`'s defaults, and `getTicketLinks: unstubbed('getTicketLinks')` to `apps/web/test/helpers/stub-services.ts:167`.

  **Tests:**
  - **27.061:** add a describe to `packages/app-core/test/replica/replica-data-source.test.ts`, using that file's existing replica + bootstrap helpers (read its top). Seed tickets A, B, C, then A blocks B and C relates A. Assert A's links: `[['blocks','out',B], ['relates','in',C]]`. Then delete B: B drops.
  - **27.061 control:** in `packages/app-core/test/online/online-data-source.test.ts`, stub the http wire with one link carrying `key: 'GN-142'` and assert it maps.
  - **27.063:** `packages/app-core/test/online/mappers.test.ts`.
  - **27.062:** add one scenario to `apps/server/test/dual-client/scenarios.test.ts` beside `:192-203`, in that file's scenario shape:
    - client A links T1 blocks T2;
    - client B links T2 blocks T1 → refused `link.reverse`;
    - client A removes;
    - the rig's existing state comparison runs after each step.
  - **27.064:** in `apps/server/test/sync/snapshot-writer.test.ts`, the file folds via `TICKET_EVENT_TYPES` at `:194`. Add a `ticket.link_added` before the snapshot and assert that the snapshot's state has `links`. Assert `BOOTSTRAP_BACKFILL_TYPES` does not contain `'ticket.link_added'`. Control: the existing 12.115 case.

  Run (LOCAL):
  - build domain, rule-engine, app-core, sync-client;
  - app-core WHOLE and sync-client WHOLE;
  - server WHOLE (an app-core online change ⇒ server integration files).

  Expected: PASS. Flip 27.061–27.064 ✅.

  Commit.

- [ ] **Step 4: MCP (27.055–27.060)**

  Case lines:
  - `- ❌ **27.055 — `link_tickets` `action: 'add'` files ONE `ticket.link_added {kind, targetId}` on `ticketId`'s stream with `origin: 'mcp'` and the session's actor;** control: `kind: 'parent'` is refused by the input schema before anything is sent.`
  - `- ❌ **27.056 — `action: 'remove'` reads the ticket's links and files `link_removed` on the STORED source: an incoming `blocks` (stored on the other ticket) and a `relates` stored the other way both land on the other stream with `targetId` = this ticket;** control: an outgoing link is removed on this stream; a link that is not there is an error naming it and sends nothing.`
  - `- ❌ **27.057 — a refusal passes through in the house shape, `refused by link.reverse: "Chiller" already blocks "Ice maker".`** (fake session answers `refused`).`
  - `- ❌ **27.058 — `get_ticket` adds `links: [{kind, direction, ticket:{id, key, title}}]` from the links route, visible ends only, and drops `ticketState.links`;** control: a ticket with no links answers `links: []`.`
  - `- ❌ **27.059 — `get_ticket_history` shows a hidden link target as `target: "a ticket you can't see"` and never its id (end to end, through the server's history route).**`
  - `- ❌ **27.060 — the tool list is 64 with `link_tickets` after `rank_ticket` (14.555, 14.80/14.81, hosted 14.262 updated), and the door matrix (14.458) refuses a stranger and admits a member who sees both ends.**`

  `ticket-tools.ts`, after `rank_ticket` (copy its shape; `submitOne` from `./submit.js` for the single event):
  ```ts
      {
        name: 'link_tickets',
        description:
          'Add or remove a typed link between two tickets: kind "blocks" (ticketId blocks targetId), "relates" (either way) or "duplicates" ' +
          '(ticketId duplicates the original, targetId). action "add" or "remove". Removing works from either end. Every rule is the product\'s.',
        inputSchema: { workspaceId: id, ticketId: id, targetId: id, kind: z.enum(TICKET_LINK_KINDS), action: z.enum(['add', 'remove']) },
        handler: async (args) => {
          const a = z.object({ workspaceId: id, ticketId: id, targetId: id, kind: z.enum(TICKET_LINK_KINDS), action: z.enum(['add', 'remove']) }).parse(args);
          if (a.action === 'add') {
            return { result: await submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.link_added', { kind: a.kind, targetId: a.targetId })) };
          }
          // The stored source decides the stream (spec A §2.2): find the link as the app shows it.
          const out = (await session.get(`/v1/workspaces/${enc(a.workspaceId)}/tickets/${enc(a.ticketId)}/links`)) as { links: Array<{ kind: string; direction: 'out' | 'in'; ticket: { id: string } }> };
          const found = out.links.find((l) => l.kind === a.kind && l.ticket.id === a.targetId);
          if (found === undefined) throw new Error(`no "${a.kind}" link between ${a.ticketId} and ${a.targetId} that you can see`);
          const [source, target] = found.direction === 'out' ? [a.ticketId, a.targetId] : [a.targetId, a.ticketId];
          return { result: await submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'ticket', id: source }, 'ticket.link_removed', { kind: a.kind, targetId: target })) };
        },
      },
  ```
  - Import `TICKET_LINK_KINDS` from `@gisik-nokma/domain` and `submitOne` from `./submit.js`.
  - Wrap the `session.get` in the same 404 → `'ticket not found or not visible to you'` catch `readTicket` uses (`:22-29`).
  - **`historyLine`:** pass `linkTarget` through, so `get_ticket_history` lines keep the key: `...(e.linkTarget === undefined ? {} : { linkTarget: e.linkTarget })`. Widen its parameter type.
  - **`read-tools.ts` `get_ticket`:**
    - after reading `detail`, read `/v1/workspaces/…/tickets/…/links` through `readOrNotFound`;
    - return `links: out.links.map((l) => ({ kind: l.kind, direction: l.direction, ticket: { id: l.ticket.id, key: l.ticket.key, title: l.ticket.title } }))`;
    - strip `links` from the returned `ticketState` (one representation);
    - update its description: "…its parent, its rollup and its typed links (visible ends only)".

  **Tests:**
  - 27.055–27.058 in `packages/mcp-server/test/ticket-tools.test.ts` and `read-tools.test.ts`. Use the file's `fake(routes, result)` session and `tool(name, session)` helpers (`ticket-tools.test.ts:41-66`).
    - **27.056:** the routes map answers `/v1/workspaces/${WS}/tickets/${T}/links` with `{ links: [{ kind: 'blocks', direction: 'in', ticket: { id: B } }, { kind: 'relates', direction: 'in', ticket: { id: C } }, { kind: 'duplicates', direction: 'out', ticket: { id: X } }] }`. Assert `f.batches` entity ids and payloads for each removal.
    - **27.057:** `fake(ROUTES, { results: [{ status: 'refused', eventId: 'e', rule: 'link.reverse', reason: '"Chiller" already blocks "Ice maker".' }] })` → `rejects.toThrow('refused by link.reverse: "Chiller" already blocks "Ice maker".')`.
  - 27.059 and 27.060's door row in `apps/server/test/mcp/mcp-tickets.test.ts`. Use `buildDoorWorld` / `runDoorMatrix` with DoorRow `{ tool: 'link_tickets', args: { workspaceId, ticketId: <member-visible>, targetId: <member-visible>, kind: 'relates', action: 'add' }, stranger: true, allowed: { caller: 'member', eventType: 'ticket.link_added' } }`. Read `helpers/door-matrix.ts` for the row's exact field names first.
  - Update `tool-names.ts`, then 14.555's literal list (`register.test.ts:87-110`, `toHaveLength(64)`), then every other literal tool list the grep finds.

  Run (LOCAL): mcp-server WHOLE, then server `test/mcp`.
  Expected: PASS. Flip 27.055–27.060 ✅.

  Commit.

- [ ] **Step 5: Features, help, sweeps, DONE**
  - **Features:** replace `<!-- A T4 bullet -->` with `- ✅ **Typed links: reads, History and MCP** (typed-links T4; `apps/server/src/read/ticket-links.ts`, `routes/ticket-links.ts`, `routes/ticket-history.ts`, `packages/mcp-server/src/tools/ticket-tools.ts`, `read-tools.ts`, `packages/app-core/src/replica/replica-data-source.ts`) — …`. Name: both directions, visible ends only, no count; History withholds a hidden target; `link_tickets` add/remove from either end; `get_ticket.links`; offline reads. Cases 27.050–27.064.
  - **MCP help:** if `pnpm help:generate` lists MCP tools, regenerate, then `pnpm check:help`.
  - **Sweeps:** server WHOLE, app-core, sync-client, mcp-server, web WHOLE (stub-services changed).
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 27.050 | drop `visibleTicketsWhere` from the read |
    | 27.053 | keep `targetId` for a hidden target |
    | 27.056 | always file on `ticketId` |
    | 27.058 | spread `detail` unfiltered |

  Push. DONE.

---

### Task 5: The Links section, desktop and phone (cases 27.065–27.079)

**Lane prompt names `frontend-design`.**

**Files:**
- Create:
  - `packages/app-core/src/views/ticket-links-section.tsx` (copy `ticket-notes-section.tsx`: props shape, `make({...})` → `dataSource.ingest([event])` → result switch → `reload()`, `Popover`, `Toast` with `undo`)
  - `packages/app-core/test/views/ticket-links-section.test.tsx` (copy `ticket-notes-section.test.tsx`: `Harness` lifting `useLiveQuery`, `createFakeDataSource`, `IngestScript`, `MINIMAL_READ`; phone via `board-phone.test.tsx:29-40`'s `viewport({ phone })` matchMedia stub)
- Modify:
  - `packages/app-core/src/views/ticket-sheet.tsx`:
    - next to the notes query (`:1026-1028`), add the links query;
    - mount the section between `{phone ? descriptionSection : null}` (`:4197`) and the rollup progress line (`:4199`), so Subtasks → Notes → Comments stays adjacent (18.241a).
  - `packages/ui/src/ui.css`: a `/* Knowledge Graph A: ticket links */` block directly after the last `.gn-ticket-sheet__note-badges` rule (grep it). Not at end of file: plans B, C and E append there on the same release.
  - `docs/manual.md` §5 (tickets, `:503`): a "Linking tickets" paragraph.

**Interfaces:**
- **Consumes:**
  - `DataSourceQuery.getTicketLinks`, `TicketLinkView` (T4);
  - `linkReading`, `TicketLinkKind` (T1);
  - `precheckEvent` (T3 routes links);
  - `PrecheckResult`, `MakeSubmitted`, `LiveQueryResult`;
  - the sheet's `queryTickets` / `resolveTicketHref` props (`ticket-sheet.tsx:276-277`);
  - `usePhoneBoard` (true at `max-width: 40rem`);
  - from `@gisik-nokma/ui`: `Popover` (`triggerRef, open, onClose, 'aria-label'`), `Dialog` (`open, title, onClose, children, footer?`; a bottom sheet ≤40rem), `Select` (`options {value,label}[], value, onChange, 'aria-label'`), `Toast` (`open, message, undo?: {onUndo}, onDismiss`).
- **Produces:** `TicketLinksSection(props: TicketLinksSectionProps)` with props:
  - `dataSource`, `workspaceId`, `ticketId`, `canEdit`, `make`;
  - `links: LiveQueryResult<TicketLinkView[]>`;
  - `queryTickets?`, `resolveTicketHref?`, `onNavigate?`;
  - `precheck?: (event: SubmittedEvent) => Promise<PrecheckResult>`.

**The Add choices (a decision the spec left open).** The Select offers all five readings from THIS ticket. Each maps to a stream:

| Choice | Stream | Payload |
|---|---|---|
| Blocks | this | `{kind:'blocks', targetId: other}` |
| Is blocked by | other | `{kind:'blocks', targetId: this}` |
| Relates to | this | `{kind:'relates', targetId: other}` |
| Duplicates | this | `{kind:'duplicates', targetId: other}` |
| Is duplicated by | other | `{kind:'duplicates', targetId: this}` |

The permission gate is symmetric (both ends visible), so filing on the other stream is the same right.

- [ ] **Step 1: RED view tests 27.065–27.073**

  Case lines:
  - `- ❌ **27.065 — the Links section lists links grouped by their reading from this ticket (Blocks, Is blocked by, Relates to, Duplicates, Is duplicated by), each row the other ticket's status dot, key and title, a link to it and a Remove button; empty reads "No links yet.";** control: a group with no rows is not drawn.`
  - `- ❌ **27.066 — Add link: choose "Is blocked by", search, pick → a pending row appears at once in "Is blocked by" with `aria-busy="true"`, ONE `ticket.link_added` is filed on the OTHER ticket's stream with `targetId` = this ticket, and after commit the row is the reloaded one;** control: "Blocks" files on this ticket's stream.`
  - `- ❌ **27.067 — a refusal from the server removes the pending row and shows the server's sentence beside Add link (`role="alert"`); a precheck refusal shows the same without sending;** control: a commit shows no alert.`
  - `- ❌ **27.068 — Remove files ONE `ticket.link_removed` even on a double click, and shows "Removed link: blocks GN-142" with Undo; Undo files ONE `ticket.link_added` with the same stream and payload, even on a double click;** control: the row is gone from the reloaded list.`
  - `- ❌ **27.069 — removing an INCOMING row ("Is blocked by GN-133") files on GN-133's stream with `targetId` = this ticket;** control: removing an outgoing row files on this stream.`
  - `- ❌ **27.070 — on a phone (≤40rem) the picker opens as the bottom-sheet Dialog titled "Add link", and Add works the same;** control: on desktop it is the Popover.`
  - `- ❌ **27.071 — with `canEdit` false there is no Add link and no Remove;** control: with `canEdit` true both show.`
  - `- ❌ **27.072 — a failed links read shows "This ticket's links could not be read: … it may answer on a retry." and never "No links yet.";** control: a settled empty read shows "No links yet.".`
  - `- ❌ **27.073 — the picker never offers this ticket itself;** control: other results are offered.`

  Test skeleton (`ticket-links-section.test.tsx`):
  ```tsx
  import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
  import { userEvent } from '@testing-library/user-event';
  import { afterEach, describe, expect, it } from 'vitest';
  import { makeSubmittedFactory } from '../../src/submit.js';
  import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
  import { TICKET, WS } from '../helpers/seed.js';
  import { TicketLinksSection, type TicketLinksSectionProps } from '../../src/views/ticket-links-section.js';
  import { useLiveQuery } from '../../src/views/use-live-query.js';
  import type { TicketLinkView } from '../../src/view-types.js';

  const OTHER = '01J9GTKB000000000000000000';
  const row = (kind: TicketLinkView['kind'], direction: 'out' | 'in', key: string, id = OTHER): TicketLinkView => ({
    kind, direction, ticket: { id, projectId: 'p', key, title: `Title ${key}`, stateCategory: 'open' },
  });
  function Harness(props: Omit<TicketLinksSectionProps, 'links'>) {
    const links = useLiveQuery(props.dataSource, props.workspaceId, `${props.ticketId}:links`, () =>
      props.dataSource.query.getTicketLinks(props.workspaceId, props.ticketId));
    return <TicketLinksSection {...props} links={links} />;
  }
  const make = makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });
  const COMMIT: IngestScript = (events) => events.map((e) => ({ status: 'committed', eventId: e.id, seq: 1, serverTime: '2026-10-03T10:00:00.000Z' }));
  afterEach(() => cleanup());

  it('27.068 one remove per double click; Undo re-adds once', async () => {
    let stored = [row('blocks', 'out', 'GN-142')];
    const source = createFakeDataSource({ getTicketLinks: async () => stored }, (events) => { stored = []; return COMMIT(events); });
    render(<Harness dataSource={source} workspaceId={WS} ticketId={TICKET} canEdit make={make} />);
    const remove = await screen.findByRole('button', { name: 'Remove: blocks GN-142' });
    await userEvent.dblClick(remove);
    expect(source.ingested.flat().map((e) => [e.type, e.entity.id, e.payload])).toEqual([
      ['ticket.link_removed', TICKET, { kind: 'blocks', targetId: OTHER }],
    ]);
    await screen.findByText('Removed link: blocks GN-142');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Undo' }));
    expect(source.ingested.flat().filter((e) => e.type === 'ticket.link_added')).toHaveLength(1);
  });
  ```
  - Read `IngestResult` (`packages/domain/src/ingest-result.ts:22`) and the 18.24x notes ingest scripts for the exact committed shape, and match them.
  - Read the `Toast` component for its Undo button's accessible name (`undo.label ?? …`) before asserting `'Undo'`.
  - Write the other cases in the same shape:
    - **27.066:** `queryTickets: async () => [{ ticketId: OTHER, projectId: 'p', key: 'GN-133', title: 'Chiller' }]`. Pick "Is blocked by" in the Select (`getByLabelText('Link type')`), type in `Find a ticket`, click `GN-133 Chiller`. Assert the pending row's `aria-busy` BEFORE resolving a deferred ingest promise, then the payload and stream.
    - **27.067:** ingest answers `{ status: 'refused', eventId, rule: 'link.reverse', reason: '"Chiller" already blocks "Ice maker".' }`. The pending row is gone, and `getByRole('alert')` has that text. Precheck variant: pass `precheck: async () => ({ kind: 'refused', rule: 'link.self', reason: 'A ticket cannot be linked to itself.' })` and assert `source.ingested` stays empty.
    - **27.070:** `viewport({ phone: true })` as `board-phone.test.tsx:29-40` defines it, then `getByRole('dialog', { name: 'Add link' })`.

  Run: app-core `test/views/ticket-links-section.test.tsx`, LOCAL.
  Expected: FAIL (module not found).

- [ ] **Step 2: The component**

  `ticket-links-section.tsx`. Outline with the load-bearing code; the markup follows `ticket-notes-section.tsx`'s classes:
  ```tsx
  import { useRef, useState } from 'react';
  import { linkReading, type SubmittedEvent, type TicketLinkKind } from '@gisik-nokma/domain';
  import { Dialog, Popover, Select, Toast } from '@gisik-nokma/ui';
  import type { DataSource } from '../data-source.js';
  import type { PrecheckResult } from '../precheck.js';
  import type { MakeSubmitted } from '../submit.js';
  import type { TicketLinkView } from '../view-types.js';
  import type { LiveQueryResult } from './use-live-query.js';
  import { usePhoneBoard } from './use-phone-board.js';

  type Choice = 'blocks' | 'blocked-by' | 'relates' | 'duplicates' | 'duplicated-by';
  const CHOICES: { value: Choice; label: string; kind: TicketLinkKind; onOther: boolean }[] = [
    { value: 'blocks', label: 'Blocks', kind: 'blocks', onOther: false },
    { value: 'blocked-by', label: 'Is blocked by', kind: 'blocks', onOther: true },
    { value: 'relates', label: 'Relates to', kind: 'relates', onOther: false },
    { value: 'duplicates', label: 'Duplicates', kind: 'duplicates', onOther: false },
    { value: 'duplicated-by', label: 'Is duplicated by', kind: 'duplicates', onOther: true },
  ];
  /** The reading a row shows from THIS ticket, which is also its group heading (spec §3.1). */
  const readingOf = (l: { kind: TicketLinkKind; direction: 'out' | 'in' }) => linkReading(l.kind, l.direction);
  const GROUP_ORDER = ['blocks', 'is blocked by', 'relates to', 'duplicates', 'is duplicated by'];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  export type TicketLinksSectionProps = {
    dataSource: DataSource; workspaceId: string; ticketId: string; canEdit: boolean; make: MakeSubmitted;
    links: LiveQueryResult<TicketLinkView[]>;
    queryTickets?: (query: string) => Promise<Array<{ ticketId: string; projectId: string; key: string; title: string }>>;
    resolveTicketHref?: (ref: { ticketId: string; projectId: string }) => string | null;
    onNavigate?: (href: string) => void;
    precheck?: (event: SubmittedEvent) => Promise<PrecheckResult>;
  };

  /** The event a link row or a choice files, on the STORED source's stream (spec §2.2). */
  function eventFor(make: MakeSubmitted, workspaceId: string, thisId: string, otherId: string,
                    kind: TicketLinkKind, onOther: boolean, type: 'ticket.link_added' | 'ticket.link_removed') {
    const [source, target] = onOther ? [otherId, thisId] : [thisId, otherId];
    return make({ workspaceId, entity: { kind: 'ticket', id: source }, type, payload: { kind, targetId: target } });
  }
  ```
  Body essentials:
  - **State:**
    - `pending: TicketLinkView | null` (the optimistic row);
    - `refusal: string | null`;
    - `inFlight = useRef(new Set<string>())`, keyed `${type}:${kind}:${otherId}` (the double-click guard; a ref, because two clicks in one tick see the same state);
    - `toast: { label: string; undo: SubmittedEvent } | null`;
    - `choice: Choice` (default `'blocks'`);
    - `query: string`, `results`;
    - `pickerOpen`.
  - **`file(event, key)`:**
    1. If `inFlight` has the key, return.
    2. Add it, and run the precheck (when present): `refused` → `setRefusal(reason)` and return; otherwise send.
    3. `dataSource.ingest([event])` → result switch exactly as `ticket-notes-section.tsx`'s `detach`. `committed` → `links.reload()`; `refused` → `setRefusal(result.reason)`; `invalid` → `setRefusal(result.message)`; `undefined` → `'The server did not answer this change.'`.
    4. `finally`: delete the key and `setPending(null)` after the reload settles. Wait for `links.reload()` if it returns a promise; else clear on the next `links.data` change via `useEffect`.
  - **Add:** close the picker, `setPending({ kind, direction: onOther ? 'in' : 'out', ticket: { id, projectId, key, title, stateCategory: 'open' } })`, then `file(eventFor(..., 'ticket.link_added'))`. On commit, toast `Linked: ${readingOf(pending)} ${key}` (no Undo on add; Remove is the undo).
  - **Remove** (per row): `file(eventFor(make, ws, ticketId, row.ticket.id, row.kind, row.direction === 'in', 'ticket.link_removed'))`. On commit, toast `Removed link: ${readingOf(row)} ${row.ticket.key ?? row.ticket.title}`, with `undo` = the matching `link_added` event made fresh at click time, filed through `file` (the same guard).
  - **Rows:** `rows = [...(links.data ?? []), ...(pending ? [pending] : [])]`, grouped by `readingOf` in `GROUP_ORDER`. Each group is:
    ```tsx
    <section aria-label={cap(reading)} className="gn-ticket-sheet__link-group">
      <h4 className="gn-ticket-sheet__link-group-title">{cap(reading)}</h4>
      <ul>
        {group.map((l) => {
          const href = resolveTicketHref?.({ ticketId: l.ticket.id, projectId: l.ticket.projectId }) ?? null;
          const busy = l === pending;
          return (
            <li key={`${l.kind}:${l.direction}:${l.ticket.id}`} className="gn-ticket-sheet__link-row" aria-busy={busy}>
              <span className={`gn-ticket-sheet__link-dot gn-ticket-sheet__link-dot--${l.ticket.stateCategory}`} aria-hidden="true" />
              {href === null ? <span className="gn-ticket-sheet__link-key">{l.ticket.key ?? ''}</span>
                : <a href={href} className="gn-ticket-sheet__link-key" onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(href); } }}>{l.ticket.key ?? l.ticket.title}</a>}
              <span className="gn-ticket-sheet__link-title">{l.ticket.title}</span>
              {canEdit && !busy ? (
                <button type="button" className="gn-button gn-button--ghost gn-ticket-sheet__link-remove"
                  aria-label={`Remove: ${reading} ${l.ticket.key ?? l.ticket.title}`} onClick={() => void remove(l)}>Remove</button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
    ```
  - **Heading and states:** the heading is `Links` / `Links (N)`, the notes section's rule (`ticket-notes-section.tsx:86-88`). The failed read gets its `role="alert"` paragraph (27.072 text, with no spaced em dash). The empty state is `No links yet.`.
  - **Picker body** (shared by Popover and Dialog):
    ```tsx
    <Select aria-label="Link type" value={choice} onChange={(v) => setChoice(v as Choice)} options={CHOICES.map(({ value, label }) => ({ value, label }))} />
    <input type="search" aria-label="Find a ticket" value={query} onChange={(e) => void search(e.target.value)} className="gn-input" />
    <ul role="listbox" aria-label="Tickets">{results.filter((r) => r.ticketId !== ticketId).map((r) => (
      <li key={r.ticketId} role="option" aria-selected={false}>
        <button type="button" onClick={() => void add(r)}>{`${r.key} ${r.title}`}</button>
      </li>))}</ul>
    ```
    Read `Select`'s `onChange` signature in `packages/ui/src` before wiring; match it. `search(q)` sets `query` and awaits `queryTickets?.(q) ?? []`, dropping stale answers with a request counter.
  - **Wrapper:**
    ```tsx
    phone
      ? <Dialog open={pickerOpen} title="Add link" onClose={() => setPickerOpen(false)}>{picker}</Dialog>
      : <Popover triggerRef={addRef} open={pickerOpen} onClose={() => setPickerOpen(false)} aria-label="Add link">{picker}</Popover>
    ```
  - **Refusal:** `{refusal !== null ? <p role="alert" className="gn-ticket-sheet__links-refusal">{refusal}</p> : null}` directly under the Add link button (smoothness S5: beside the control). Cleared on the next Add.

  `ticket-sheet.tsx`:
  - Next to the notes query (`:1026-1028`):
    ```ts
      const links = useLiveQuery(dataSource, workspaceId, `${ticketId}:links`, () =>
        dataSource.query.getTicketLinks(workspaceId, ticketId),
      );
    ```
  - Between `:4197` and `:4199`:
    ```tsx
              {/* THE LINKS SECTION (Knowledge Graph spec A §3.1): under the fields, ABOVE progress,
                  subtasks and notes, because 18.241a pins Subtasks + Notes + Comments as adjacent. */}
              <TicketLinksSection
                dataSource={dataSource}
                workspaceId={workspaceId}
                ticketId={ticketId}
                canEdit={editorSlot !== undefined}
                make={make}
                links={links}
                {...(queryTickets === undefined ? {} : { queryTickets })}
                {...(resolveTicketHref === undefined ? {} : { resolveTicketHref })}
                onNavigate={onNavigate}
                {...(cache === undefined ? {} : { precheck: (event: SubmittedEvent) => precheckEvent(event, cache) })}
              />
    ```
    Confirm `queryTickets`, `resolveTicketHref` and `cache` are destructured in the component body (`:718` destructures `resolveTicketHref`; grep the others).

  `ui.css` block (tokens from the chip rule at `ui.css:248-250`):
  ```css
  /* Knowledge Graph A: ticket links */
  .gn-ticket-sheet__links { display: grid; gap: var(--gn-space-2, 0.5rem); }
  .gn-ticket-sheet__link-group-title { font-size: var(--gn-font-size-sm, 0.875rem); color: var(--gn-text-muted); margin: 0; }
  .gn-ticket-sheet__link-row { display: flex; align-items: center; gap: 0.5rem; min-height: 2.75rem; }
  .gn-ticket-sheet__link-row[aria-busy='true'] { opacity: 0.6; }
  .gn-ticket-sheet__link-dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; flex: none; }
  .gn-ticket-sheet__link-dot--open { background: var(--gn-category-open); }
  .gn-ticket-sheet__link-dot--active { background: var(--gn-category-active); }
  .gn-ticket-sheet__link-dot--terminal { background: var(--gn-category-terminal); }
  .gn-ticket-sheet__link-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ```
  Grep the real spacing, font and muted-text token names in `ui.css` and replace the fallbacks; never invent a token. The 44px row height is the phone touch target (`2.75rem`).

  Run the section tests and `ticket-notes-section.test.tsx` (18.241a), LOCAL.
  Expected: PASS 27.065–27.073 and 18.241a. Flip ✅.

  Commit.

- [ ] **Step 3: The sheet, both widths (27.074–27.076)**

  Case lines:
  - `- ❌ **27.074 — the ticket sheet shows the Links section between the fields and the subtasks, and Subtasks + Notes + Comments stay adjacent (18.241a);** control: `getTicketLinks` returning two links renders `Links (2)`.`
  - `- ❌ **27.075 — on the phone sheet (≤40rem) the section is present, its rows meet 44px, and Add link opens the bottom sheet;** control: desktop width renders the Popover.`
  - `- ❌ **27.076 — with a cache, the sheet's precheck refuses a link to a ticket that already blocks this one without filing anything.**`

  Add these to `packages/app-core/test/views/ticket-sheet*.test.tsx`, beside the notes-section sheet cases. Use `createFakeDataSource({ getTicket: async () => MINIMAL_READ, getTicketLinks: async () => [...] })`, and for 27.076 a `ClientStateCache` holding both tickets with `links`.

  Run: app-core WHOLE, ui WHOLE, web WHOLE (ui.css ⇒ all three), LOCAL.
  Expected: PASS. Flip ✅.

  Commit.

- [ ] **Step 4: Manual, browser check, Features, DONE**
  - **Manual:** `docs/manual.md` §5, a "Linking tickets" paragraph in the manual's voice (read the neighbours):
    - the five readings;
    - Add link from either side;
    - Remove and Undo;
    - links to tickets you cannot see are not shown;
    - linking does not close a duplicate.

    Run `pnpm help:generate && pnpm check:help`.
  - **Features:** replace `<!-- A T5 bullet -->` with `- ✅ **Link tickets from the ticket sheet** (typed-links T5; `packages/app-core/src/views/ticket-links-section.tsx`, `ticket-sheet.tsx`, `packages/ui/src/ui.css`) — …` with the user-visible behaviour. Cases 27.065–27.076.
  - **Browser** (dev stack built from the release branch, LOCAL): add, refuse a reverse, remove, Undo, at 1280px and 390px. Screenshots in the PR.
  - **Mutations:**

    | Case | Mutation |
    |---|---|
    | 27.066 | file "Is blocked by" on this ticket |
    | 27.067 | keep the pending row on refusal |
    | 27.068 | drop the `inFlight` guard |
    | 27.072 | render "No links yet." when `error` is set |

  - **Checks:** `pnpm check:citations`, `pnpm check:tasks`.

  Push. DONE + REVIEW (`NEEDS: browser`, desktop + 390px).

---

## Self-review (writing-plans §Self-Review, done 2026-10-03 against the spec)

**1. Spec coverage**

| Spec | Tasks |
|---|---|
| §2.1 kinds and readings | T1 (`linkReading`), T5 groups |
| §2.2 events, source stream | T1; T4 (MCP remove); T5 (`eventFor`) |
| §2.3 rules 1–5 | T3 engine + precheck |
| §2.3 rules 6–7 | T3 permission (7 collapses to "both visible"; see the gaps) |
| §2.3 refusal text house shape | T4 27.057 |
| §2.4 visibility | T4 27.050–27.053, 27.058–27.059 |
| §2.5 table, order after proj_tickets | T2 |
| §2.5 trash keeps, purge erases | T2 27.022–27.025 |
| §2.6 vocabulary.ts | T1 |
| §2.6 TICKET_EVENT_TYPES and reducer | T1 |
| §2.6 BOOTSTRAP_BACKFILL_TYPES | T1 docblock; 27.004 census; 27.064 |
| §2.6 evaluate.ts | T3 (a real arm); harness needs no arm (no JSON fixture added) |
| §2.6 precheck.ts | T3 |
| §2.6 check-permission | T3 |
| §2.6 history-copy | T1 |
| §2.6 redactedPayload | T1, with T4 end to end |
| §2.6 fanout | T1 |
| §2.6 check-purged | T1 arm, T2 case |
| §2.6 replica | T1 (folds via `FOLDING_TICKET_TYPES = TICKET_EVENT_TYPES`, `replica.ts:410`), T4 reads |
| §3.1 section, desktop and phone, optimism, Undo | T5 |
| §3.2 history | T1 + T4 |
| §4 `link_tickets`, `get_ticket.links`, tool-names | T4 |
| §5.2 cases 1–8 | T1 (1, 7), T3 (2), T2 (3), T4 (4, 5, 6), T5 (8) |
| §5.3 gate | unchanged (34) |

No gaps.

**2. Placeholders.** Each "read X first" names the file and line where the exact shape lives:
- `Toast`'s Undo name;
- `Select.onChange`;
- `checkPermission`'s return;
- `verifyProjections`' shape;
- the door-matrix row fields;
- CSS token names.

No TBD remains.

**3. Type consistency.** These names are used identically across tasks:
- `TicketLinkKind`, `TICKET_LINK_KINDS`, `linkReading(kind, direction)`, `TicketLink`, `TicketState.links?`;
- `TicketLinkWire` (server) and `TicketLinkView` (app-core): one shape, declared twice across the package boundary;
- `getTicketLinks(workspaceId, ticketId)`, `listTicketLinks(db, eff, viewerId, workspaceId, ticketId)`;
- `linkTarget?: { key: string | null } | null`;
- `checkTicketLink`, `linkExistsRefusal`;
- `LINK_TARGET_NOT_VISIBLE_REASON`, `ticketLinksProjection`, `payloadIds`, `redactedPayload`.

**4. Review focus.** Each line has its case in the owning task: 27.042/27.056/27.069; 27.050–27.053/27.058/27.059; 27.023–27.025; 27.067; 27.068.

## Execution handoff

Execution follows the gisik orchestration: the orchestrator dispatches each task to a lane as one fresh session, with reviewers and `ctl gate <sha> --base release/knowledge-graph`, landing into `release/knowledge-graph`.
- **Order:** T1 → T2 → (T3 ∥ T4's read steps) → T4 MCP → T5.
- **Pointers:** T5 carries `NEEDS: browser` and names `frontend-design`.
- **Reviewer focus:** the Review Focus lines.
- I recommend **subagent-driven**: five tasks with hard interface hand-offs (T1's types feed everything, T2's column feeds T3's engine reads), and a shipped mistake here leaks a hidden ticket's existence.

## Ledger rows

```
typed-links	1	todo	-	-	not started (events, every census, opens Features §24 + test-cases/27)
typed-links	2	todo	-	-	not started (waits for T1)
typed-links	3	todo	-	-	not started (waits for T2)
typed-links	4	todo	-	-	not started (waits for T2; MCP refusal case after T3)
typed-links	5	todo	-	-	not started (waits for T3 + T4)
```

## Planner rulings on the writer's findings (2026-10-03)

- **Raw `targetId` on the sync stream, bootstrap and `/events`** (`tickets.ts:714`): accepted as a known limit, the same as `parentId` today. An id alone is not shown anywhere a viewer reads, and §2.4's rule (no row, no count) holds in every UI and MCP read. Closing the id leak for links AND parents together is a separate task, not this release.
- **The target's own History does not show the link** (`ticket-history.ts:300-307` reads one stream): accepted. Spec A §5.2 case 5 is narrowed to the source's History. The target shows the link in its Links section ("is blocked by").
- **Every other writer decision stands:** dotted `link.*` refusal ids, `link.absent`, the rule-engine check, `link_tickets` taking `workspaceId`, Links above Subtasks (18.241a), and no bootstrap-backfill entry.

# Trash — Plan 1 of 4: Lifecycle Core (archive, delete, mark, the Deleted items read) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give workspaces an archive, give workspaces and projects a soft delete, let a person mark any soft-deleted workspace/project/ticket/note for permanent deletion (and unmark it), hide everything inside a deleted container from every read, and serve one read — `GET /v1/me/deleted-items` — listing what this person may restore or mark. **No row is erased by this plan**; the erasure is Plan 2.

**Architecture:** Eight new event types (`workspace.archived|restored`, `workspace.deleted|undeleted`, `project.deleted|undeleted`, `purge.marked|unmarked`) registered in `packages/domain`, folded by one new projection `proj_lifecycle` into a new `proj_workspaces` table and new columns on `proj_projects`, `proj_tickets`, `proj_notes`. The write door gains one new pass, `checkLifecycle`, for state refusals ("already deleted", "delete it first", "this workspace is deleted"); authority goes into the existing `checkRolePermission` / `checkNotePermission` / `checkVisibilityPermission`. Containment is enforced at two choke points: **a deleted workspace has no members as far as reads are concerned** (`resolveEffectiveRole`), and **`LIVE_TICKET_WHERE` also excludes tickets in a deleted project**.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), zod in `packages/domain`, Fastify + `pg` in `apps/server`, React in `packages/app-core`, vitest everywhere, Postgres 16 (test DB on port 54329).

**Spec:** `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md` (owner-approved 2026-09-23). This plan implements spec §4 in full, §6.3's read (not its screen), and T8/T9/T10. Read the spec's §2 decisions table and §3 before Task 1.

**The series.**

| Plan | Spec sections | Depends on | Case block |
|---|---|---|---|
| **1 Lifecycle core (this plan)** | §4, §6.3 read, T8–T10 | — | `19.001`–`19.080` |
| 2 Purge engine + backup retention | §5.1–§5.6, §5.8, §7 | 1 | `19.081`–`19.160` |
| 3 Replica + sync | §5.7, the replica half of §6.3 | 1, 2 | `19.161`–`19.200` |
| 4 UI: dialog, cards, Account → Deleted items | §6.1, §6.2, §6.3 screen | 1 (parallel with 2) | `19.201`–`19.260` |

Plans 2–4 are written when Plan 1 lands, against the tree as it then is.

## Global Constraints

- **Branch shape.** Cut `task/trash-1-lifecycle-core` from `origin/release/notes`. One commit per task. PR `--base release/notes` through `bash scripts/ctl/ctl pr open <branch> --repo <worktree> --base release/notes --title T --body FILE`. Never `--base main`. Never push to `main` or `release/notes`.
- **Node 22 for every run** (`node --version` prints `v22.*` in the same shell). Paste `NODE=` beside every summary line you report.
- **Build before suites:** `pnpm turbo run build` at the repo root before any package's vitest run (packages import siblings by name → `dist/`).
- **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism <files> > /tmp/trash1-<pkg>.log 2>&1; tail -20 /tmp/trash1-<pkg>.log`. **Never pipe a test run into `head`.** Never trust `$?` of a chain; read the summary line, and a log with no summary line is a crash, not a pass.
- **Server suites need the test Postgres:** `docker compose up -d postgres` (port 54329). Never touch 54330 (the dev DB).
- **Every case: RED first, a control in the same `it`, the named mutation applied after the commit and shown red, then restored** (commit BEFORE mutating; restore with `git checkout -- <file>` only after the commit). Paste the RED and GREEN summary lines into the commit body.
- **Case ids.** This plan opens `test-cases/19-trash.md` and owns block **`19.001`–`19.080`** (3-digit padded). Write each as a `- ❌ **19.0NN — …**` id LINE (one id per line; never in a table, a heading, backticks, or two per sentence — `scripts/check-case-ids.mjs` cannot see those). After adding cases, confirm the guard's count moved by EXACTLY the number you added. Flip `❌`→`✅` in the commit that adds the citing test; test names contain the id; `pnpm check:citations` stays green.
- **`Features.md`** gains `## 16. Archive, delete and purge` (after `## 15. Notes`, `Features.md:3152`) in Task 1; each later task adds its bullets there in the same commit as its code.
- **Migration numbers:** start at `1790500000000` and read `ls apps/server/migrations | tail -3` at commit time — two sibling lanes (starting-status, board-card badges) may add migrations; yours must sort after every migration on `origin/release/notes` when you commit. Projection tables `proj_` prefix, `jsonb` never `json`, deterministic, pass `verifyProjections`.
- **The purge delay is one constant:** `PURGE_DELAY_DAYS = 15` in `packages/domain/src/lifecycle.ts`. Nothing else may spell 15. The due instant is DERIVED (mark `server_time` + 15 days), never carried in a payload (spec §4).
- **Copy (exact strings, exported constants, tests pin the constant):**
  - `WORKSPACE_DELETED_REASON = 'This workspace is deleted. Restore it from Deleted items on your Account page first.'`
  - `PROJECT_DELETED_REASON = 'This project is deleted. Restore it from Deleted items on your Account page first.'`
  - `ALREADY_DELETED_REASON = (kind) => \`This ${kind} is already deleted.\``
  - `NOT_DELETED_REASON = (kind) => \`This ${kind} is not deleted.\``
  - `DELETE_FIRST_REASON = (kind) => \`Delete this ${kind} before marking it for permanent deletion.\``
  - `ALREADY_MARKED_REASON = (kind) => \`This ${kind} is already marked for permanent deletion.\``
  - `NOT_MARKED_REASON = (kind) => \`This ${kind} is not marked for permanent deletion.\``
  - `UNMARK_FIRST_REASON = (kind) => \`Unmark this ${kind} for permanent deletion before restoring it.\``
  - `PURGE_DUE_REASON = (kind) => \`This ${kind} is already being permanently deleted.\``
  - `WORKSPACE_OWNER_ONLY_REASON = 'Only the workspace owner can archive, delete or restore a workspace.'`
- **Never `AskUserQuestion`** in the lane topology. A question goes into your progress line for the controller.
- **Line numbers** in this plan were read at `origin/release/notes` `3377b10c`. Open the file; trust the symbol, not the number.

## Recorded deviation from the spec

- **Spec §4 "Containment" says "Marking a parent marks its whole subtree for the same `dueAt`."** This plan writes the mark on the parent's row ONLY and derives the rest: a contained child is hidden (Tasks 5–6), not separately listed or markable (Tasks 4, 7), and Plan 2's erasure set takes the whole subtree of a purged parent. The observable behaviour is the spec's; writing N child marks would add N rows that every undo must also clear, and a child marked by its parent could not be told apart from one marked on its own (the case spec §4's last sentence protects). Planner decision, 2026-09-23 — listed in the PR body.

## Review Focus

Inputs and conditions the spec implies that no task's happy path exercises, most likely first. Each has its test in the owning task.

1. **The owner restoring a deleted workspace.** Hiding a deleted workspace from reads must not also hide it from the write door, or the owner can never undelete it (and never mark it). → Task 5, case 19.041 (undelete accepted from the owner of a deleted workspace), 19.042 (every other event refused with `WORKSPACE_DELETED_REASON`).
2. **A ticket individually deleted, then its project deleted, then the project restored.** The ticket must stay deleted — project restore must not resurrect a ticket the person deleted on its own. → Task 6, case 19.055.
3. **A mark on an item whose container is deleted.** A ticket inside a deleted project is "deleted by containment" (spec §4): it must not be separately markable or listed. → Task 4, case 19.034; Task 7, case 19.065.
4. **Marking twice / unmarking when not marked / restoring while marked.** Each is a specific refusal, not a silent no-op. → Task 4, cases 19.030–19.033.
5. **A person who lost their role after deleting something.** Deleted items lists by CURRENT authority (T3), not by who deleted it. → Task 7, case 19.066.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `packages/domain/src/events/lifecycle-events.ts` (new) | eight empty `.strict()` payload schemas |
| `packages/domain/src/lifecycle.ts` (new) | `PURGE_DELAY_DAYS`, `purgeDueAt(markedAt)`, `LifecycleKind`, `LIFECYCLE_EVENT_TYPES` |
| `packages/domain/src/vocabulary.ts` | eight registrations |
| `packages/domain/src/read-models.ts` | `DeletedItem`, `DeletedItemsRead` |
| `packages/domain/src/index.ts` | exports |
| `apps/server/migrations/1790500000000_lifecycle.sql` (new) | `proj_workspaces`; lifecycle columns on `proj_projects`, `proj_tickets`, `proj_notes` |
| `apps/server/src/projections/lifecycle.ts` (new) | `lifecycleProjection` |
| `apps/server/src/projections/index.ts:64-185` | registration (after `notesProjection`, `:122`) |
| `apps/server/src/permissions/check-lifecycle.ts` (new) | `checkLifecycle` — state refusals and container gates |
| `apps/server/src/permissions/check-permission.ts` | authority for the new types; `checkLifecycle` in the chain; `includeDeleted` at the write door |
| `apps/server/src/permissions/effective-role.ts:100` | `resolveEffectiveRole(…, { includeDeleted })`; a deleted workspace has no members by default |
| `apps/server/src/read/visible-where.ts:200` | `LIVE_TICKET_WHERE` also excludes tickets in a deleted project |
| `apps/server/src/read/notes.ts` | notes in a deleted project hidden |
| `apps/server/src/read/visible-projects.ts:159` | deleted projects hidden |
| `apps/server/src/routes/workspaces.ts:177-289` | deleted workspaces hidden; `archived` served per workspace |
| `apps/server/src/read/deleted-items.ts` (new), `apps/server/src/routes/deleted-items.ts` (new) | `GET /v1/me/deleted-items` |
| `packages/app-core/src/view-types.ts:165` | `WorkspaceRef.archived` |
| `packages/app-core/src/data-source.ts:243` | `getDeletedItems()` |
| `packages/app-core/src/online/*`, `packages/app-core/src/replica/replica-data-source.ts` | the two twins |
| `test-cases/19-trash.md` (new), `test-cases/README.md`, `scripts/fixtures/check-case-citations-baseline.json` | the new bucket |

---

### Task 1: Open §19; the eight event types

**Files:**
- Create: `packages/domain/src/events/lifecycle-events.ts`, `packages/domain/src/lifecycle.ts`, `packages/domain/test/lifecycle-events.test.ts`, `test-cases/19-trash.md`
- Modify: `packages/domain/src/vocabulary.ts` (imports `:1-10`, registrations after the project pair `:410-422`), `packages/domain/src/index.ts`, `test-cases/README.md` (the bucket list, beside the `18-notes.md` entry at `:17`), `scripts/fixtures/check-case-citations-baseline.json` (add `"19-trash.md": 0` after `"18-notes.md": 0`, `:27`), `Features.md`

**Interfaces:**
- Produces: `workspaceArchivedPayload`, `workspaceRestoredPayload`, `workspaceDeletedPayload`, `workspaceUndeletedPayload`, `projectDeletedPayload`, `projectUndeletedPayload`, `purgeMarkedPayload`, `purgeUnmarkedPayload` (all `z.object({}).strict()`); `PURGE_DELAY_DAYS = 15`; `purgeDueAt(markedAt: string): string` (ISO in, ISO out); `type LifecycleKind = 'workspace' | 'project' | 'ticket' | 'note'`; `PURGEABLE_KINDS: readonly LifecycleKind[]`.

The registry already takes several kinds per registration (`packages/domain/src/registry.ts:4-34`), and `'workspace'` is already an entity kind (`packages/domain/src/envelope.ts:15-32`). `parse-event.ts` needs no edit (it reads the registry, `parse-event.ts:29-32`).

- [ ] **Step 1: Open the bucket.** Create `test-cases/19-trash.md` with the §18 file's header shape (`test-cases/18-notes.md:1-24`): title `# §19 — Archive, delete and purge`, the opening line naming this plan and the spec, the ID SHAPE paragraph, and the block table:

```markdown
| Plan | Block |
|---|---|
| 1 Lifecycle core | `19.001`–`19.080` |
| 2 Purge engine | `19.081`–`19.160` |
| 3 Replica + sync | `19.161`–`19.200` |
| 4 UI | `19.201`–`19.260` |
```

Then `## 19.1 Vocabulary` with:

```markdown
- ❌ **19.001 — each of the eight lifecycle types parses against its entity kind with `{}`;** control: the same type against a wrong kind is refused with `entity-kind-mismatch`. Mutation: register `project.deleted` with `entityKind: 'workspace'`.
- ❌ **19.002 — every lifecycle payload refuses a stranger's field** (`{ projectId: 'x' }`, `{ dueAt: '…' }` on `purge.marked`); control: `{}` accepted. Mutation: drop `.strict()` from `purgeMarkedPayload`.
- ❌ **19.003 — `purge.marked`/`purge.unmarked` parse against `workspace`, `project`, `ticket` and `note`, and are refused against `workflow`;** control: `note`. Mutation: omit `'note'` from the kinds.
- ❌ **19.004 — `purgeDueAt('2026-09-23T10:00:00.000Z')` is `'2026-10-08T10:00:00.000Z'`;** control: the result is `PURGE_DELAY_DAYS` days after the input to the millisecond. Mutation: `PURGE_DELAY_DAYS = 14`.
```

Add the README bucket line and the baseline entry.

- [ ] **Step 2: Write the failing tests** in `packages/domain/test/lifecycle-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent, PURGE_DELAY_DAYS, purgeDueAt } from '../src/index.js';

const base = (type: string, kind: string, payload: unknown = {}) => ({
  id: newUlid(), version: 1, origin: 'web', clientTime: '2026-09-23T10:00:00.000Z',
  serverTime: '2026-09-23T10:00:00.000Z', actorId: newUlid(), workspaceId: newUlid(),
  entity: { kind, id: newUlid() }, type, payload, seq: 1, workspaceSeq: 1,
});

const PAIRS: Array<[string, string]> = [
  ['workspace.archived', 'workspace'], ['workspace.restored', 'workspace'],
  ['workspace.deleted', 'workspace'], ['workspace.undeleted', 'workspace'],
  ['project.deleted', 'project'], ['project.undeleted', 'project'],
];

describe('19.001 each lifecycle type parses against its entity kind', () => {
  it.each(PAIRS)('%s against %s', (type, kind) => {
    expect(() => parseEvent(base(type, kind))).not.toThrow();
    const wrong = kind === 'workspace' ? 'project' : 'workspace';
    expect(() => parseEvent(base(type, wrong))).toThrow(/entity-kind|kind/);
  });
});

describe('19.002 every lifecycle payload refuses a stranger field', () => {
  it.each([...PAIRS, ['purge.marked', 'ticket'], ['purge.unmarked', 'ticket']] as Array<[string, string]>)(
    '%s', (type, kind) => {
      expect(() => parseEvent(base(type, kind, {}))).not.toThrow();
      expect(() => parseEvent(base(type, kind, { projectId: 'x' }))).toThrow();
      expect(() => parseEvent(base(type, kind, { dueAt: '2026-10-08T10:00:00.000Z' }))).toThrow();
    });
});

describe('19.003 purge.marked/unmarked are filed against the four purgeable kinds only', () => {
  it.each(['workspace', 'project', 'ticket', 'note'])('%s accepted', (kind) => {
    expect(() => parseEvent(base('purge.marked', kind))).not.toThrow();
    expect(() => parseEvent(base('purge.unmarked', kind))).not.toThrow();
  });
  it('workflow refused', () => {
    expect(() => parseEvent(base('purge.marked', 'workflow'))).toThrow();
  });
});

describe('19.004 purgeDueAt adds PURGE_DELAY_DAYS to the mark instant', () => {
  it('computes the due instant', () => {
    expect(purgeDueAt('2026-09-23T10:00:00.000Z')).toBe('2026-10-08T10:00:00.000Z');
    const ms = Date.parse(purgeDueAt('2026-01-01T00:00:00.000Z')) - Date.parse('2026-01-01T00:00:00.000Z');
    expect(ms).toBe(PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000);
  });
});
```

Open `packages/domain/test/note-events.test.ts` and `parse-event.test.ts` first and use their envelope builder if one exists rather than `base` above — the builder's field names are the truth; the shape above is what the builder must produce.

- [ ] **Step 3: Run to see it fail.** `pnpm turbo run build` then `cd packages/domain && pnpm exec vitest run --no-file-parallelism test/lifecycle-events.test.ts > /tmp/trash1-domain.log 2>&1; tail -20 /tmp/trash1-domain.log`. Expected: FAIL — `purgeDueAt` is not exported / `unknown event type 'workspace.archived'`.

- [ ] **Step 4: Implement.** `packages/domain/src/events/lifecycle-events.ts`:

```ts
import { z } from 'zod';

/**
 * The lifecycle vocabulary (trash series, Plan 1; spec
 * `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md` §4).
 *
 * Every payload is EMPTY and `.strict()` for the reason the project archive
 * pair gives (`membership.ts`, "The payloads are EMPTY"): the item is
 * `env.entity.id`, so a payload has nothing left to name, and `.strict()` turns
 * a payload naming somebody else's item into a refusal. For `purge.marked` it
 * does one more job: the purge date is DERIVED from the mark's `server_time`
 * (`purgeDueAt`), so a client that tries to supply its own `dueAt` is refused
 * here rather than believed.
 *
 * Undelete is spelled `*.undeleted` for projects and workspaces because
 * `project.restored` / `workspace.restored` already mean UN-ARCHIVE; the ticket
 * and note pairs keep their existing `*.restored` (spec §4).
 */
export const workspaceArchivedPayload = z.object({}).strict();
export const workspaceRestoredPayload = z.object({}).strict();
export const workspaceDeletedPayload = z.object({}).strict();
export const workspaceUndeletedPayload = z.object({}).strict();
export const projectDeletedPayload = z.object({}).strict();
export const projectUndeletedPayload = z.object({}).strict();
export const purgeMarkedPayload = z.object({}).strict();
export const purgeUnmarkedPayload = z.object({}).strict();
```

`packages/domain/src/lifecycle.ts`:

```ts
/** Days between a `purge.marked` and the purge (owner, 2026-09-23). The only place 15 is spelled. */
export const PURGE_DELAY_DAYS = 15;

export type LifecycleKind = 'workspace' | 'project' | 'ticket' | 'note';
export const PURGEABLE_KINDS: readonly LifecycleKind[] = ['workspace', 'project', 'ticket', 'note'];

/** The instant a mark made at `markedAt` falls due. Derived, never claimed (spec §4). */
export function purgeDueAt(markedAt: string): string {
  return new Date(Date.parse(markedAt) + PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export const LIFECYCLE_EVENT_TYPES = [
  'workspace.archived', 'workspace.restored', 'workspace.deleted', 'workspace.undeleted',
  'project.deleted', 'project.undeleted', 'purge.marked', 'purge.unmarked',
] as const;
```

In `vocabulary.ts`, after the `project.restored` registration (`:417-422`), register the eight in the same shape as `:410-415`:

```ts
domainRegistry.register({ type: 'workspace.archived', version: 1, entityKind: 'workspace', payloadSchema: workspaceArchivedPayload });
domainRegistry.register({ type: 'workspace.restored', version: 1, entityKind: 'workspace', payloadSchema: workspaceRestoredPayload });
domainRegistry.register({ type: 'workspace.deleted', version: 1, entityKind: 'workspace', payloadSchema: workspaceDeletedPayload });
domainRegistry.register({ type: 'workspace.undeleted', version: 1, entityKind: 'workspace', payloadSchema: workspaceUndeletedPayload });
domainRegistry.register({ type: 'project.deleted', version: 1, entityKind: 'project', payloadSchema: projectDeletedPayload });
domainRegistry.register({ type: 'project.undeleted', version: 1, entityKind: 'project', payloadSchema: projectUndeletedPayload });
domainRegistry.register({ type: 'purge.marked', version: 1, entityKind: ['workspace', 'project', 'ticket', 'note'], payloadSchema: purgeMarkedPayload });
domainRegistry.register({ type: 'purge.unmarked', version: 1, entityKind: ['workspace', 'project', 'ticket', 'note'], payloadSchema: purgeUnmarkedPayload });
```

(Format them as the file formats its registrations — one property per line.) Export both new modules from `index.ts`.

- [ ] **Step 5: Run to see it pass** (same command). Expected: 4 describes green. Then run the whole domain suite once — a registration can collide (`registry.ts:48-50` throws on a duplicate `type@version`).

- [ ] **Step 6: Features.md.** Add `## 16. Archive, delete and purge` after the §15 block with one ⚙️ bullet: the eight types, why payloads are empty and strict, why `*.undeleted`, and `PURGE_DELAY_DAYS` as the single constant (file paths).

- [ ] **Step 7: Commit** (`Trash 1/Task 1: lifecycle vocabulary, §19 bucket (19.001-19.004)`), then apply each named mutation, show red, restore.

---

### Task 2: The migration and the `proj_lifecycle` projection

**Files:**
- Create: `apps/server/migrations/1790500000000_lifecycle.sql`, `apps/server/src/projections/lifecycle.ts`, `apps/server/test/projections/lifecycle.test.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `notesProjection`, `:122`), `apps/server/src/projections/notes.ts` (write `deleted_at`/`deleted_by` beside `deleted`), `test-cases/19-trash.md`, `Features.md`

**Interfaces:**
- Consumes: Task 1's schemas.
- Produces (tables later tasks read):
  - `proj_workspaces(workspace_id text PK, archived boolean NOT NULL DEFAULT false, deleted_at timestamptz NULL, deleted_by text NULL, purge_marked_at timestamptz NULL, purge_marked_by text NULL)` — **a row exists only for a workspace that has had a lifecycle event**; absence means live, unarchived, unmarked. (No backfill: `verifyProjections` diffs live against a rebuild, and a rebuild would not create rows for workspaces with no lifecycle event either.) The workspace NAME is not here — it stays folded from the ledger (`apps/server/src/workspaces/workspace-name.ts:98-107`).
  - `proj_projects` + `deleted_at timestamptz NULL, deleted_by text NULL, purge_marked_at timestamptz NULL, purge_marked_by text NULL`
  - `proj_tickets` + `purge_marked_at timestamptz NULL, purge_marked_by text NULL` (it already has `deleted_at`/`deleted_by`, `migrations/1789800000000_proj-tickets-deleted.sql:14-16`)
  - `proj_notes` + `deleted_at timestamptz NULL, deleted_by text NULL, purge_marked_at timestamptz NULL, purge_marked_by text NULL` (it has `deleted boolean`, `migrations/1790100000000_proj-notes.sql:58`; keep it — `read/notes.ts:181-190` reads it)

Cases (`## 19.2 Projection`):

```markdown
- ❌ **19.010 — `workspace.archived` then `workspace.restored` writes `archived` true then false on a `proj_workspaces` row created by the first;** control: a workspace with no lifecycle event has no row. Mutation: insert a row on `workspace.created`.
- ❌ **19.011 — `workspace.deleted` writes `deleted_at` = the event's `server_time` and `deleted_by` = its actor; `workspace.undeleted` nulls both;** control: `archived` untouched. Mutation: write `client_time`.
- ❌ **19.012 — `project.deleted`/`project.undeleted` write and clear `proj_projects.deleted_at`/`deleted_by`;** control: `archived` untouched. Mutation: clear `archived` on undelete.
- ❌ **19.013 — `purge.marked` writes `purge_marked_at`/`purge_marked_by` on the row of its entity kind (all four tables); `purge.unmarked` nulls them;** control: the other three tables untouched. Mutation: route `note` to `proj_tickets`.
- ❌ **19.014 — `note.deleted` writes `proj_notes.deleted_at`/`deleted_by` beside `deleted = true`; `note.restored` nulls them;** control: `deleted` still flips. Mutation: leave `deleted_at` set on restore.
- ❌ **19.015 — after a mixed sequence of all eight types, `verifyProjections` reports no difference;** control: hand-writing one `proj_workspaces.archived` makes it report one. Mutation: make the projection read `now()` instead of `server_time`.
```

- [ ] **Step 1: Write the cases above into `test-cases/19-trash.md`.**
- [ ] **Step 2: Write the failing tests.** Model the harness on an existing projection test (`apps/server/test/projections/` — open the notes projection test and reuse its `applyAll` / seed helpers from `apps/server/test/helpers/seed.ts:80`). For 19.015 reuse `apps/server/test/verify-projections.test.ts`'s harness (it already drives `project.archived`). Assert rows with plain `SELECT`s:

```ts
const row = await pool.query(
  'SELECT archived, deleted_at, deleted_by, purge_marked_at, purge_marked_by FROM proj_workspaces WHERE workspace_id = $1',
  [workspaceId],
);
expect(row.rows[0]).toMatchObject({ archived: true, deleted_at: null });
```

- [ ] **Step 3: Run to see them fail** (`relation "proj_workspaces" does not exist`).
- [ ] **Step 4: The migration.**

```sql
-- Up Migration
-- Trash series, Plan 1 (spec docs/superpowers/specs/2026-09-23-trash-and-purge-design.md §4).
-- proj_workspaces holds a workspace's LIFECYCLE only. A row exists only once a lifecycle
-- event names the workspace: absence is "live, unarchived, unmarked", and no backfill is
-- written because a ledger rebuild would not write one either (verifyProjections diffs both ways).
CREATE TABLE proj_workspaces (
  workspace_id    text PRIMARY KEY,
  archived        boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz NULL,
  deleted_by      text NULL,
  purge_marked_at timestamptz NULL,
  purge_marked_by text NULL
);
ALTER TABLE proj_projects
  ADD COLUMN deleted_at timestamptz NULL, ADD COLUMN deleted_by text NULL,
  ADD COLUMN purge_marked_at timestamptz NULL, ADD COLUMN purge_marked_by text NULL;
ALTER TABLE proj_tickets
  ADD COLUMN purge_marked_at timestamptz NULL, ADD COLUMN purge_marked_by text NULL;
ALTER TABLE proj_notes
  ADD COLUMN deleted_at timestamptz NULL, ADD COLUMN deleted_by text NULL,
  ADD COLUMN purge_marked_at timestamptz NULL, ADD COLUMN purge_marked_by text NULL;
COMMENT ON COLUMN proj_projects.purge_marked_at IS 'The server_time of the latest purge.marked not undone by a purge.unmarked. The purge is due PURGE_DELAY_DAYS later (packages/domain/src/lifecycle.ts); the due instant is derived, never stored.';

-- Down Migration
ALTER TABLE proj_notes DROP COLUMN purge_marked_by, DROP COLUMN purge_marked_at, DROP COLUMN deleted_by, DROP COLUMN deleted_at;
ALTER TABLE proj_tickets DROP COLUMN purge_marked_by, DROP COLUMN purge_marked_at;
ALTER TABLE proj_projects DROP COLUMN purge_marked_by, DROP COLUMN purge_marked_at, DROP COLUMN deleted_by, DROP COLUMN deleted_at;
DROP TABLE proj_workspaces;
```

Open the most recent migration first and match its Up/Down marker spelling exactly.

- [ ] **Step 5: The projection** `apps/server/src/projections/lifecycle.ts`, shaped as `projProjects` (`proj-projects.ts:80-100`: parse the payload, then write):

```ts
import {
  projectDeletedPayload, projectUndeletedPayload, purgeMarkedPayload, purgeUnmarkedPayload,
  workspaceArchivedPayload, workspaceDeletedPayload, workspaceRestoredPayload, workspaceUndeletedPayload,
} from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

const PURGE_TABLE = { workspace: ['proj_workspaces', 'workspace_id'], project: ['proj_projects', 'project_id'],
  ticket: ['proj_tickets', 'ticket_id'], note: ['proj_notes', 'note_id'] } as const;

/**
 * The lifecycle fold (trash series, Plan 1). Registered AFTER `notesProjection`
 * so every row a mark can name already exists. Writes `server_time`, never
 * `now()`: a rebuild must reproduce the live row (19.015).
 */
export const lifecycleProjection: Projection = {
  name: 'proj_lifecycle',
  tables: ['proj_workspaces'],
  async apply(event, tx) {
    const at = event.serverTime;
    switch (event.type) {
      case 'workspace.archived':
      case 'workspace.restored':
        (event.type === 'workspace.archived' ? workspaceArchivedPayload : workspaceRestoredPayload).parse(event.payload);
        await tx.query(
          `INSERT INTO proj_workspaces (workspace_id, archived) VALUES ($1, $2)
           ON CONFLICT (workspace_id) DO UPDATE SET archived = EXCLUDED.archived`,
          [event.entity.id, event.type === 'workspace.archived']);
        return;
      case 'workspace.deleted':
      case 'workspace.undeleted': {
        (event.type === 'workspace.deleted' ? workspaceDeletedPayload : workspaceUndeletedPayload).parse(event.payload);
        const del = event.type === 'workspace.deleted';
        await tx.query(
          `INSERT INTO proj_workspaces (workspace_id, deleted_at, deleted_by) VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at, deleted_by = EXCLUDED.deleted_by`,
          [event.entity.id, del ? at : null, del ? event.actorId : null]);
        return;
      }
      case 'project.deleted':
      case 'project.undeleted': {
        (event.type === 'project.deleted' ? projectDeletedPayload : projectUndeletedPayload).parse(event.payload);
        const del = event.type === 'project.deleted';
        await tx.query(
          `UPDATE proj_projects SET deleted_at = $3, deleted_by = $4 WHERE project_id = $1 AND workspace_id = $2`,
          [event.entity.id, event.workspaceId, del ? at : null, del ? event.actorId : null]);
        return;
      }
      case 'purge.marked':
      case 'purge.unmarked': {
        (event.type === 'purge.marked' ? purgeMarkedPayload : purgeUnmarkedPayload).parse(event.payload);
        const kind = event.entity.kind as keyof typeof PURGE_TABLE;
        const [table, key] = PURGE_TABLE[kind];
        const mark = event.type === 'purge.marked';
        if (kind === 'workspace') {
          await tx.query(
            `INSERT INTO proj_workspaces (workspace_id, purge_marked_at, purge_marked_by) VALUES ($1, $2, $3)
             ON CONFLICT (workspace_id) DO UPDATE SET purge_marked_at = EXCLUDED.purge_marked_at, purge_marked_by = EXCLUDED.purge_marked_by`,
            [event.entity.id, mark ? at : null, mark ? event.actorId : null]);
        } else {
          await tx.query(`UPDATE ${table} SET purge_marked_at = $2, purge_marked_by = $3 WHERE ${key} = $1`,
            [event.entity.id, mark ? at : null, mark ? event.actorId : null]);
        }
        return;
      }
      default:
        return;
    }
  },
  async reset(tx) {
    await tx.query('TRUNCATE proj_workspaces');
  },
};
```

**Read `apps/server/src/projections/registry.ts` for the real `Projection` type** (field names of the event — `serverTime` vs `server_time`, `actorId` — and whether `reset` must also clear columns this projection writes on OTHER projections' tables; if a rebuild resets `proj_projects` wholesale via `projProjects.reset`, the added columns are cleared with it and replay refills them — confirm by reading, and say which in the commit body). The four `proj_*` columns on tables this projection does not own are the one unusual thing here: `tables` lists only `proj_workspaces`, so `verifyProjections` must still compare the added columns — read `apps/server/src/tools/verify-projections.ts` and state in the commit body how the columns on `proj_projects`/`proj_tickets`/`proj_notes` are covered (19.015 is the witness).

In `notes.ts`, where `note.deleted`/`note.restored` write `deleted` (the projection calls `applyNoteEvent`, `notes.ts:201`), also write `deleted_at = serverTime, deleted_by = actorId` on delete and NULL both on restore.

- [ ] **Step 6: Register** `lifecycleProjection` directly after `notesProjection` (`index.ts:122`) with a one-line comment giving the reason (every row a mark names exists by then).
- [ ] **Step 7: Run to see pass**; then the full server projection + verify-projections suites.
- [ ] **Step 8: Features.md** ⚙️ bullet: `proj_workspaces` (lifecycle only, row-on-first-event), the added columns, `server_time` discipline.
- [ ] **Step 9: Commit, mutate, restore.**

---

### Task 3: Authority — who may do each act (T3)

**Files:**
- Modify: `apps/server/src/permissions/check-permission.ts`, `test-cases/19-trash.md`, `Features.md`
- Test: `apps/server/test/permissions/check-lifecycle-authority.test.ts` (new; drive the real `POST /v1/events` door with the harness in `apps/server/test/routes/workspace-home-door.test.ts:60-135` — `signedIn`, `found`, `submitBatch`)

**Interfaces:**
- Consumes: Task 1 types; `resolveEffectiveRole` (`effective-role.ts:100`), `hasProjectAdminRights` (`effective-role.ts:145-151`).
- Produces: `WORKSPACE_OWNER_ONLY_REASON` (exported constant, copy above).

The rules (spec §4 "Authority"):

| Event | On | Who |
|---|---|---|
| `workspace.archived/restored/deleted/undeleted` | workspace | `role === 'owner'` |
| `purge.marked/unmarked` | workspace | `role === 'owner'` |
| `project.deleted/undeleted` | project | workspace admin or owner — add both to `ADMIN_ONLY_TYPES` (`check-permission.ts:338-371`) |
| `purge.marked/unmarked` | project | workspace admin or owner |
| `purge.marked/unmarked` | ticket | `hasProjectAdminRights(eff, ticket.projectId)` — the `ticket.deleted` rule, `check-permission.ts:1424-1432` |
| `purge.marked/unmarked` | note | the note-author rule — add both types to `NOTE_AUTHOR_EVENTS` (`:1161-1168`) |

Cases (`## 19.3 Authority`):

```markdown
- ❌ **19.020 — each workspace act (archive, restore, delete, undelete, mark, unmark) is refused for an admin with `WORKSPACE_OWNER_ONLY_REASON` and accepted for the owner;** control: the owner's acceptance in the same `it`. Mutation: allow `isWorkspaceAdmin`.
- ❌ **19.021 — `project.deleted` and a project mark are refused for a member (`permission.role`) and accepted for an admin;** control: admin. Mutation: remove `project.deleted` from `ADMIN_ONLY_TYPES`.
- ❌ **19.022 — a ticket mark is refused for a non-project-admin member and accepted for a project admin;** control: project admin. Mutation: skip the ticket arm for `purge.marked`.
- ❌ **19.023 — a note mark is refused for a member who is not the author, and accepted for the author, an admin who can read it, and the owner;** control: the author. Mutation: drop `purge.marked` from `NOTE_AUTHOR_EVENTS`.
```

- [ ] **Step 1: Cases into the bucket. Step 2: failing tests** (one `it` per case, refusal and control together; assert `result.status === 'refused'` and `result.reason === WORKSPACE_OWNER_ONLY_REASON` etc. — read the `IngestResult` shape from `@gisik-nokma/domain` for the exact fields). For the ticket/note arms, the item must be DELETED first or Task 4's state refusal would answer instead — until Task 4 exists the state check is absent, so write the fixture as it must be after Task 4 (delete, then mark) now.
- [ ] **Step 3: RED. Step 4: implement.**
  - Workspace acts: in `checkRolePermission`, beside `workspace.renamed` (`:790-792`), `if (WORKSPACE_OWNER_TYPES.has(env.type) || (env.entity.kind === 'workspace' && PURGE_TYPES.has(env.type))) { if (role !== 'owner') return refuse(WORKSPACE_OWNER_ONLY_REASON); }` — compare `role === 'owner'` inline; do not add an `isWorkspaceOwner` helper (`:710` records why none exists).
  - Project acts: add `project.deleted`, `project.undeleted` to `ADMIN_ONLY_TYPES`; for `purge.*` on a project, the same `isWorkspaceAdmin` test beside it.
  - Ticket marks: in `checkVisibilityPermission`, widen `:1424`'s condition to include `purge.marked`/`purge.unmarked` when `env.entity.kind === 'ticket'`, reusing `ticketDeleteAuthorityReason` with acts `'mark'`/`'unmark'` — read `:186-188` and extend its act union.
  - Note marks: add both to `NOTE_AUTHOR_EVENTS`.
  - `project.deleted`/`undeleted`/`purge.*` on a project must also pass `checkProjectExists`: add them to `projectsNamedBy`'s arms (`:853-860`).
- [ ] **Step 5: GREEN; run the whole `test/permissions` directory** (role-permission alone is 73 K of cases). **Step 6: Features.md. Step 7: commit, mutate, restore.**

---

### Task 4: `checkLifecycle` — state refusals

**Files:**
- Create: `apps/server/src/permissions/check-lifecycle.ts`, `apps/server/test/permissions/check-lifecycle.test.ts`
- Modify: `apps/server/src/permissions/check-permission.ts` (chain: after `checkProjectPrefixUnique`, before `checkVisibilityPermission`, `:1621-1626`), `test-cases/19-trash.md`, `Features.md`

**Interfaces:**
- Produces: `checkLifecycle(db: Queryable, env: EventEnvelope, now: Date): Promise<Refusal | null>`; `LIFECYCLE_RULE = 'lifecycle.state'`; the reason constants in Global Constraints (exported).

The state for each kind comes from the Task 2 columns (`proj_workspaces`, `proj_projects.deleted_at/purge_marked_at`, `proj_tickets.deleted_at/purge_marked_at`, `proj_notes.deleted/purge_marked_at`). A missing `proj_workspaces` row means live and unmarked.

Rules, in this order, for the envelope's own item:

| Type | Refuse when | Reason |
|---|---|---|
| `workspace.deleted`, `project.deleted` | already deleted | `ALREADY_DELETED_REASON(kind)` |
| `workspace.undeleted`, `project.undeleted`, `ticket.restored`, `note.restored` | not deleted | `NOT_DELETED_REASON(kind)` (ticket/note: only if the rule engine / reducer would not already say it — keep theirs; add only the marked rule below) |
| the four un-deletes | marked | `UNMARK_FIRST_REASON(kind)` |
| `purge.marked` | not deleted | `DELETE_FIRST_REASON(kind)` |
| `purge.marked` | already marked | `ALREADY_MARKED_REASON(kind)` |
| `purge.marked` on a ticket/note/project | its container (project or workspace) is deleted | `DELETE_FIRST_REASON` is wrong here — refuse with `PROJECT_DELETED_REASON` / `WORKSPACE_DELETED_REASON` (contained items are not separately markable, spec §4 "Containment") |
| `purge.unmarked` | not marked | `NOT_MARKED_REASON(kind)` |
| `purge.unmarked` | `purgeDueAt(purge_marked_at) <= now` | `PURGE_DUE_REASON(kind)` |

Cases (`## 19.4 State`):

```markdown
- ❌ **19.030 — deleting a deleted project or workspace is refused with `ALREADY_DELETED_REASON`;** control: the first delete accepted. Mutation: drop the arm.
- ❌ **19.031 — marking a live item is refused with `DELETE_FIRST_REASON`, for each of the four kinds;** control: marking after delete accepted. Mutation: skip the deleted test for notes.
- ❌ **19.032 — marking twice is refused with `ALREADY_MARKED_REASON`; unmarking an unmarked item with `NOT_MARKED_REASON`;** control: mark → unmark → mark accepted. Mutation: drop the already-marked arm.
- ❌ **19.033 — restoring/undeleting a marked item is refused with `UNMARK_FIRST_REASON`, for each kind;** control: unmark then restore accepted. Mutation: skip the marked arm for tickets.
- ❌ **19.034 — marking a ticket inside a deleted project is refused with `PROJECT_DELETED_REASON`;** control: the same ticket marked before the project was deleted stays marked (the column is not cleared). Mutation: skip the container arm.
- ❌ **19.035 — unmarking after the due instant is refused with `PURGE_DUE_REASON`;** control: one millisecond before, accepted. `now` is injected (the check takes `now: Date`; the door passes `new Date()`); the test calls `checkLifecycle` directly with a fixed `now` for this case. Mutation: compare with `<` instead of `<=`.
```

- [ ] Steps: cases → failing tests (19.030–19.034 through the door; 19.035 direct) → RED → implement → GREEN (+ whole `test/permissions`) → Features.md → commit → mutate → restore.

---

### Task 5: A deleted workspace — hidden from reads, recoverable at the door (T10)

**Files:**
- Modify: `apps/server/src/permissions/effective-role.ts:100` (option), `apps/server/src/permissions/check-permission.ts:1577` (write door passes `includeDeleted: true`), `apps/server/src/permissions/check-lifecycle.ts` (the workspace gate), `apps/server/src/routes/workspaces.ts:177-289`, `packages/app-core/src/view-types.ts:165` (`WorkspaceRef.archived`), the online mapper for `/v1/me/workspaces` (`packages/app-core/src/online/mappers.ts` — find the `WorkspaceRef` construction), `packages/app-core/src/replica/replica-data-source.ts` (its `getMyWorkspaces`), `test-cases/19-trash.md`, `Features.md`
- Test: `apps/server/test/routes/deleted-workspace.test.ts` (new)

**Interfaces:**
- Produces: `resolveEffectiveRole(db, userId, workspaceId, opts?: { includeDeleted?: boolean }): Promise<EffectiveRole>` — default `false`: a workspace with `proj_workspaces.deleted_at IS NOT NULL` resolves as a non-member (the same value a stranger gets). `WorkspaceRef.archived: boolean` (required — see below).

**The choke point, and why.** 39 of the server's 56 `/v1/…` paths are NOT `:workspaceId`-scoped (measured: `grep -rhoE "'/v1/[^' ]+'" apps/server/src | sort -u`), so a route hook cannot hide a deleted workspace. Every read decides membership through `resolveEffectiveRole` (27 call sites) or reads `proj_memberships` directly — the direct reads are `routes/workspaces.ts:179`, `read/workspace-counts.ts:160`, `routes/builder-reads.ts:257`, `engine-context.ts:418`, `tools/sweep-user-preferences.ts:206`. Making the resolver answer "not a member" for a deleted workspace hides it everywhere the resolver is asked; each direct read gets a one-line verdict in the commit body (filter it, or say why it is unreachable for a deleted workspace — `engine-context.ts` feeds the rule engine, which judges truth and must NOT filter).

**The write door must see through it**, or the owner can never undelete (Review Focus 1): `checkPermission` calls the resolver with `includeDeleted: true`, and `checkLifecycle` gains the gate: in a deleted workspace, refuse every event except `workspace.undeleted`, `purge.marked`, `purge.unmarked` whose entity is that workspace, with `WORKSPACE_DELETED_REASON`.

**`WorkspaceRef.archived`** is REQUIRED (not optional): a construction site that forgets it must fail to compile. The online mapper reads `archived` from the wire (`/v1/me/workspaces` serves it per workspace: `LEFT JOIN proj_workspaces` — absence = `false`). The replica has no lifecycle tables until Plan 3: its `getMyWorkspaces` answers `archived: false` with a one-line comment naming Plan 3 — a recorded gap, listed in the PR body. **Run `pnpm turbo run typecheck` across every package after adding the field** — fixtures construct `WorkspaceRef` in several packages (`apps/web`, `packages/app-core`), and `!== null` checks do not catch an omitted field at runtime.

Cases (`## 19.5 Deleted workspace`):

```markdown
- ❌ **19.040 — after `workspace.deleted`, a member's `GET /v1/me/workspaces` omits the workspace; `GET /v1/me/work`, `GET /v1/search`, a `:workspaceId` route and `GET /v1/tickets/:id/history` for a ticket in it answer what a non-member gets;** control: a second, live workspace of the same member is still served everywhere. Mutation: default `includeDeleted` to `true`.
- ❌ **19.041 — the owner's `workspace.undeleted`, `purge.marked` and `purge.unmarked` on the deleted workspace are accepted, and after the undelete every read in 19.040 serves it again;** control: an admin's undelete is refused (`WORKSPACE_OWNER_ONLY_REASON`). Mutation: resolve the write door without `includeDeleted`.
- ❌ **19.042 — any other event into a deleted workspace (a ticket field set, a note body set, `workspace.renamed`) is refused with `WORKSPACE_DELETED_REASON`;** control: the same event after undelete accepted. Mutation: exempt `ticket.field_set`.
- ❌ **19.043 — `GET /v1/me/workspaces` serves `archived: true` after `workspace.archived` and `false` after `workspace.restored`; an archived workspace is still served in full (T8: archive removes nobody's access);** control: a never-archived workspace serves `false`. Mutation: filter archived workspaces out.
- ❌ **19.044 — the online mapper maps `archived` onto `WorkspaceRef` and refuses a row without it;** control: `true` and `false` round-trip. Mutation: default a missing field to `false`.
- ❌ **19.045 — `GET /v1/stream` and `POST /v1/sync/bootstrap` for a member of a deleted workspace deliver nothing from it;** control: the live workspace still streams. Mutation: skip the resolver in the stream audience. (If either door does not ask the resolver, this case is where you find out — fix the door, and name it in the commit body.)
```

- [ ] Steps: cases → failing tests (door + reads; 19.044 in `packages/app-core/test/online/`) → RED → implement → GREEN (server: `test/routes`, `test/permissions`, `test/read`, `test/sync`, `test/stream`; app-core; web) → typecheck every package → Features.md → commit → mutate → restore.

---

### Task 6: A deleted project — hidden with its contents, writes refused (T10)

**Files:**
- Modify: `apps/server/src/read/visible-where.ts:200` (`LIVE_TICKET_WHERE`), the four longhand `deleted_at IS NULL` sites and `routes/my-work.ts`'s TypeScript application (see below), `apps/server/src/read/visible-projects.ts:159`, `apps/server/src/read/notes.ts:181-190,244`, `apps/server/src/permissions/check-lifecycle.ts` (project gate), `test-cases/19-trash.md`, `Features.md`
- Test: `apps/server/test/read/deleted-project.test.ts` (new)

**Interfaces:**
- Produces: `LIVE_TICKET_WHERE = "t.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL)"` (same name, same alias contract — `proj_tickets` joined as `t`).

**The coverage trap, measured.** The constant's own docblock (`visible-where.ts:122-199`) records that the rule is carried by the constant at its import sites (16 files import it: `grep -rln LIVE_TICKET_WHERE apps/server/src`) **plus 4 longhand predicates** (`git grep -nE 'deleted_at +IS +NULL' -- apps/server/src`) **plus one TypeScript application** (`routes/my-work.ts:364` at the time of writing), and one longhand site uses alias `k` (`routes/builder-reads.ts:504`). Changing the constant covers only the first group. Step 1 of this task is to run both greps, list every site in the commit body, and convert each longhand site to the constant (or to an equivalent spelled with its own alias) — a site you cannot convert gets a one-line reason. **Do NOT add the container clause to `projections/tickets.ts`'s `getTicketStateFromDb` / `getChildrenStatesFromDb` / `refreshTicketsForWorkflow`** — the docblock (`visible-where.ts:185-190`) says why: the engine must see the ticket to judge its undo.

**Project gate at the door** (`checkLifecycle`): refuse with `PROJECT_DELETED_REASON` any event whose project is deleted, where "its project" is: the entity for `project.*`; `payload.projectId` for `ticket.created`; the ticket's `projectId` for every other ticket event; `home_project_id` for a note event when non-empty. Exempt: `project.undeleted`, `purge.marked`, `purge.unmarked` on the project itself.

Cases (`## 19.6 Deleted project`):

```markdown
- ❌ **19.050 — after `project.deleted`, the project is absent from `GET /v1/me/workspaces`' projects (for owner and member alike) and its tickets from the board, list, search, my-work and workspace counts;** control: a sibling live project's tickets are still served on each. Mutation: revert `LIVE_TICKET_WHERE`.
- ❌ **19.051 — each converted longhand site excludes a deleted project's ticket** (one arm per site, named in the test by file); control: the live sibling. Mutation: revert one longhand site — its arm alone reddens.
- ❌ **19.052 — `routes/my-work.ts`'s TypeScript filter excludes a deleted project's ticket;** control: the sibling. Mutation: revert it.
- ❌ **19.053 — a project-scoped note in a deleted project is absent from the notes list and from a ticket's attached-notes read;** control: a workspace-scoped note is still served. Mutation: skip the notes clause.
- ❌ **19.054 — a ticket event and a project-scoped note event into a deleted project are refused with `PROJECT_DELETED_REASON`;** control: accepted after `project.undeleted`. Mutation: exempt `ticket.field_set`.
- ❌ **19.055 — a ticket deleted on its own, then its project deleted, then the project undeleted, is still deleted** (absent from the board; `deleted_at` unchanged); control: its sibling that was not deleted on its own is back. Mutation: have the projection null tickets' `deleted_at` on `project.undeleted`.
```

- [ ] Steps: greps and site list → cases → failing tests → RED → implement → GREEN (whole `apps/server` suite: this constant reaches 16 files) → Features.md → commit → mutate → restore.

---

### Task 7: `GET /v1/me/deleted-items`

**Files:**
- Create: `apps/server/src/read/deleted-items.ts`, `apps/server/src/routes/deleted-items.ts`, `apps/server/test/routes/deleted-items.test.ts`
- Modify: route registration (find where `routes/workspaces.ts` is registered in `apps/server/src/app.ts` and register beside it), `packages/domain/src/read-models.ts`, `test-cases/19-trash.md`, `Features.md`

**Interfaces:**
- Produces (in `read-models.ts`):

```ts
export type DeletedItem = {
  kind: 'workspace' | 'project' | 'ticket' | 'note';
  id: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectName: string | null;
  /** Workspace/project name, ticket `KEY title`, note title. */
  label: string;
  deletedBy: string;
  deletedAt: string;          // ISO
  purgeMarkedAt: string | null;
  purgeDueAt: string | null;  // purgeDueAt(purgeMarkedAt), computed by the server
  /** Live items inside a deleted workspace/project (projects + tickets + notes); 0 for tickets and notes. */
  containedCount: number;
};
export type DeletedItemsRead = { items: DeletedItem[] };
```

**Membership and authority** (T3 — by CURRENT authority, Review Focus 5):
- workspaces: memberships where `role = 'owner'` and `proj_workspaces.deleted_at IS NOT NULL` (resolve with `includeDeleted: true`);
- projects: deleted projects in LIVE workspaces where the caller is owner/admin;
- tickets: deleted tickets whose project and workspace are live, where `hasProjectAdminRights`;
- notes: `read/notes.ts`'s existing deleted list (`filter.deleted === true`, `:181-188`: owners and admins see all deleted notes they can read, others only their own) for each live workspace, excluding notes whose home project is deleted.
- An item inside a deleted container is NOT listed (spec §6.3: the parent's row carries `containedCount`).
- Order: `deletedAt` descending, then `id`.
- `workspaceName` from `workspaceNameFromLedger` (`workspaces/workspace-name.ts:46`); ticket label uses the ticket key reader (`read/ticket-numbers.ts`, the project's prefix).

Cases (`## 19.7 The Deleted items read`):

```markdown
- ❌ **19.060 — the owner sees a deleted workspace, an admin a deleted project, a project admin a deleted ticket, an author a deleted note — each with `deletedBy`, `deletedAt` and `purgeMarkedAt: null`;** control: a live item of each kind is absent. Mutation: drop the `deleted_at IS NOT NULL` filter for projects.
- ❌ **19.061 — a marked item carries `purgeMarkedAt` and `purgeDueAt = purgeDueAt(purgeMarkedAt)`;** control: unmarking returns both to null. Mutation: compute the due date from `deletedAt`.
- ❌ **19.062 — a member who is not a project admin does not see a deleted ticket; an admin does not see a deleted WORKSPACE;** control: the owner sees both. Mutation: list tickets by `canSee` instead of project-admin rights.
- ❌ **19.063 — the list is ordered by `deletedAt` descending;** control: three items deleted in known order. Mutation: ascending.
- ❌ **19.064 — a deleted project's row carries `containedCount` = its live tickets + project-scoped notes; a deleted workspace's = its projects + tickets + notes;** control: a ticket deleted on its own inside the project is not counted. Mutation: count deleted tickets too.
- ❌ **19.065 — a ticket inside a deleted project is not listed on its own;** control: after `project.undeleted` the individually-deleted ticket is listed again. Mutation: drop the container exclusion.
- ❌ **19.066 — an admin demoted to member no longer sees the deleted project they deleted;** control: the owner still does. Mutation: list by `deleted_by = caller`.
- ❌ **19.067 — a signed-out caller gets 401;** control: signed in, 200. Mutation: drop `requireSession`.
```

- [ ] Steps: cases → failing tests → RED → implement (SQL per kind, unioned in TypeScript; `requireSession` as `routes/workspaces.ts:177` uses it) → GREEN → Features.md → commit → mutate → restore.

---

### Task 8: The client contract — `getDeletedItems()`

**Files:**
- Modify: `packages/app-core/src/data-source.ts:243` (add beside `getMyWorkspaces`), `packages/app-core/src/online/online-data-source.ts` + its mapper, `packages/app-core/src/replica/replica-data-source.ts`, any fake `DataSource` in `packages/app-core/test` / `apps/web/test` (typecheck finds them), `test-cases/19-trash.md`, `Features.md`

**Interfaces:**
- Produces: `DataSourceQuery.getDeletedItems(): Promise<DeletedItem[]>`. Online: `GET /v1/me/deleted-items`, mapped field by field (refuse a row missing any field — the `WorkspaceRef` mapper's discipline, `view-types.ts:174-177`). Replica: throws `ReplicaGapError` (`replica-data-source.ts:89`) — Plan 3 fills it; the UI (Plan 4) renders a gap as "Deleted items needs a connection".

Cases (`## 19.8 Client contract`):

```markdown
- ❌ **19.070 — the online twin maps every `DeletedItem` field and refuses a row missing `purgeDueAt`;** control: a full row round-trips. Mutation: default a missing `purgeDueAt` to null.
- ❌ **19.071 — the replica twin rejects with `ReplicaGapError`;** control: `getMyWorkspaces` on the same replica resolves. Mutation: resolve `[]` (an empty list would tell a person they have nothing deleted, when nobody was asked).
```

- [ ] Steps: cases → failing tests → RED → implement → GREEN (app-core; web typecheck) → Features.md → commit → mutate → restore.

---

## Wrap-up (after Task 8)

- [ ] Whole-repo run, in order: `pnpm turbo run build`, `pnpm turbo run typecheck`, then each package's suite with the command in Global Constraints, then `pnpm check:citations` and `node scripts/check-case-ids.mjs`. Paste every summary line with `NODE=`.
- [ ] Re-read `Features.md` §16 against the code and every `test-cases/19-trash.md` line you flipped; confirm the id count moved by exactly the number of cases you added (`19.001`–`19.071` as pinned here: 4 + 6 + 4 + 6 + 6 + 6 + 8 + 2 = **42**).
- [ ] PR body: the recorded gaps — replica `WorkspaceRef.archived` is always `false` and `getDeletedItems` is a gap until Plan 3; no row is erased until Plan 2; no UI until Plan 4 — and each mutation with its red line.

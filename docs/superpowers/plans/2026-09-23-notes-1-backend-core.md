# Notes — Plan 1 of 6: Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `note` a real entity in the ledger — events, reducer, permissions, the reader predicate, projections, and the HTTP reads — so that a note can be created, edited, scoped, attached to tickets, commented on and read back through the API, with every read filtered by who may see it.

**Architecture:** A note is a new `ENTITY_KIND` whose nine events (`note.created` … `note.restored`) are folded by one pure reducer `applyNoteEvent` shared by the server projection and, later, the client replica. "Who may read a note" is one pure function `canReadNote` with an SQL twin `visibleNotesWhere`; both are asserted equal on one fixture, and every read, permission check and (in Plan 2) the sync stream calls one of them. Projections (`proj_notes`, `proj_note_attachments`, `proj_note_comments`) are pure functions of the events and pass the replay verifier.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), zod in `packages/domain`, Fastify + `pg` in `apps/server`, vitest everywhere, Postgres 16 (test DB on port 54329 via `docker-compose.yml`).

**Spec:** `docs/superpowers/specs/2026-09-23-notes-design.md` — the literal edition. This plan implements spec §2, §3, §4, §6 and the read-model half of §7.7. Read the spec's §0 (rules, glossary, decisions) before Task 1.

**The series.** Each plan ships working, tested software on its own and PRs into `release/notes`:

| Plan | Spec sections | Depends on |
|---|---|---|
| **1 Backend core (this plan)** | §2 §3 §4 §6 | — |
| 2 Sync: stream audience, purge/reach, replica tables, `ReplicaDataSource` | §5 | 1 |
| 3 Search: extensions, `proj_note_search`, lexemes, chunks, worker, route | §7 | 1 |
| 4 Editor port | §8 | — (parallel with 1–3) |
| 5 Notes page | §9 | 1, 2, 3, 4 |
| 6 Ticket Notes section, browser and performance cases | §10, §11.9–11.10 | 1, 2, 4 |

Plans 2–6 are written when Plan 1 lands, against the tree as it then is.

## Global Constraints

- **Branch shape.** Cut `task/notes-1-backend-core` from `origin/release/notes`. One commit per task. PR `--base release/notes` through `bash scripts/ctl/ctl pr open <branch> --repo <worktree> --base release/notes --title T --body FILE`. Never `--base main`. Never push to `main` or `release/notes`.
- **Node 22 for every run** (`node --version` prints `v22.*` in the same shell). Paste `NODE=` beside every summary line you report.
- **Build before suites:** `pnpm turbo run build` at the repo root before any package's vitest run. Packages import siblings by name → `dist/`.
- **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism > /tmp/notes1-<pkg>.log 2>&1; tail -20 /tmp/notes1-<pkg>.log`. **Never pipe a test run into `head`.** Never trust `$?` of a chain; read the summary line.
- **The server suite needs the test Postgres:** `docker compose up -d postgres` (port 54329). Never touch 54330 (the dev DB) except read-only.
- **Every case: RED first, a control in the same `it`, the named mutation applied after the commit and shown red, then restored.** Paste the RED and GREEN summary lines into the commit body.
- **Case ids.** This plan owns `test-cases/18-notes.md` block **`18.001`–`18.060`** (padded to three digits, the §17 ruling). Take from this block only. Cases start `❌`; flip to `✅` in the commit that adds the citing test; test names contain the id; `pnpm check:citations` must stay green.
- **`Features.md`** gains `## 15. Notes` (after `## 14. MCP server`) in Task 1, and each later task adds its bullets there in the same commit as its code.
- **Migration numbers exceed `1790000000000`.** Projection tables: `proj_` prefix, `jsonb` never `json`, deterministic, pass `verifyProjections`.
- **`packages/domain` never imports `packages/editor`** (`packages/editor/package.json:26` depends on domain, not the reverse).
- **Never `AskUserQuestion`** in the lane topology. A question goes into your progress line for the controller.
- **Line numbers** in this plan were read at `main` `59029e1c`. Open the file; trust the symbol, not the number.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `packages/domain/src/envelope.ts` | `ENTITY_KINDS` gains `'note'` |
| `packages/domain/src/registry.ts`, `src/parse-event.ts` | a registration may name several entity kinds |
| `packages/domain/src/events/note-events.ts` (new) | the nine payload schemas |
| `packages/domain/src/vocabulary.ts` | nine registrations; `comment.added` registered for `['ticket','note']` |
| `packages/domain/src/note-state.ts` (new) | `NoteScope`, `NoteState`, `EMPTY_NOTE_DOC`, `NOTE_EVENT_TYPES`, `applyNoteEvent` |
| `packages/domain/src/read-models.ts` | `NoteSummary`, `NoteDetail`, `NoteVersion`, `NoteComment` |
| `packages/domain/src/index.ts` | exports |
| `apps/server/migrations/1790100000000_proj-notes.sql` (new) | three tables |
| `apps/server/src/projections/notes.ts` (new) | `notesProjection`, `getNoteStateFromDb` |
| `apps/server/src/projections/ticket-comments.ts` | note branch → `proj_note_comments` |
| `apps/server/src/projections/index.ts:64-151` | registration order (notes after `projVisibility`, `:103`) |
| `apps/server/src/visibility/can-read-note.ts` (new) | `canReadNote`, `loadNoteForVisibility`, `canReadNoteById` |
| `apps/server/src/read/visible-where.ts` | `visibleNotesWhere` |
| `apps/server/src/permissions/check-permission.ts` | `checkNotePermission` in the chain |
| `apps/server/src/read/notes.ts` (new) | `listNotes`, `getNoteDetail`, `listNotesForTicket`, `listNoteComments`, `listNoteHistory`, `getNoteVersionBody` |
| `apps/server/src/routes/notes.ts` (new), `src/app.ts` | seven GET routes |
| `apps/server/src/routes/attachments.ts` + its repo/table | note branch for upload/download |
| `packages/app-core/src/data-source.ts`, `src/online/mappers.ts`, `src/online/online-data-source.ts`, `src/replica/replica-data-source.ts` | seven `DataSourceQuery` methods; online mappers; replica gap entries |
| `test-cases/18-notes.md` (new), `test-cases/README.md`, `Features.md` | cases and the feature catalogue |

---

### Task 1: Domain — entity kind, multi-kind registrations, note event schemas

**Files:**
- Modify: `packages/domain/src/envelope.ts:15-24` (`ENTITY_KINDS`)
- Modify: `packages/domain/src/registry.ts:4-8` (`EventTypeRegistration.entityKind`)
- Modify: `packages/domain/src/parse-event.ts:78-86` (kind check)
- Create: `packages/domain/src/events/note-events.ts`
- Modify: `packages/domain/src/vocabulary.ts` (after the `attachment.added` registration at `:231`; the `comment.added` registration at `:223-228`)
- Modify: `packages/domain/src/index.ts` (export the new file)
- Create: `test-cases/18-notes.md`; modify `test-cases/README.md`, `Features.md`
- Test: `packages/domain/test/note-events.test.ts`, `packages/domain/test/parse-event.test.ts` (extend if it exists, else create)

**Interfaces:**
- Produces: `ENTITY_KINDS` includes `'note'`; `EventTypeRegistration.entityKind?: EntityKind | readonly EntityKind[]`; exports `noteScopePayload`, `noteCreatedPayload`, `noteRenamedPayload`, `noteBodySetPayload`, `noteScopeSetPayload`, `noteMovedPayload`, `noteAttachedPayload`, `noteDetachedPayload`, `noteDeletedPayload`, `noteRestoredPayload`; nine registered types `note.*` (version 1); `comment.added` accepted against kind `note`.

- [ ] **Step 1: Create the cases file and the Features section**

Create `test-cases/18-notes.md`:

```markdown
# §18 — Notes

**Opened 2026-09-23 by Plan 1 of the notes series** (`docs/superpowers/plans/2026-09-23-notes-1-backend-core.md`;
spec `docs/superpowers/specs/2026-09-23-notes-design.md`).

## THE ID SHAPE

§18 is uniformly 3-digit padded: `18.001`–`18.999`, following §17's ruling. Blocks are allocated per plan
in the table below. Take from your block, never from the tip.

| Plan | Block |
|---|---|
| 1 Backend core | `18.001`–`18.060` |

## 18.1 Domain

- ❌ **18.001 — `note` is an entity kind.** `ENTITY_KINDS` contains `'note'` and `entitySchema` accepts `{ kind: 'note', id }`; control: `{ kind: 'notebook' }` is refused.
- ❌ **18.002 — `noteCreatedPayload` refusals.** Refuses: empty title; `inherit` without `attachTicketId`; `project` scope with `homeProjectId: ''`; `explicit` with empty `userIds`; `userIds` on a non-explicit mode. Accepts the minimal valid payload (control).
- ❌ **18.003 — `comment.added` parses against a `note` entity and against a `ticket` entity;** control: `note.renamed` against a `ticket` entity is refused with `entity-kind-mismatch`.
```

Add to `test-cases/README.md` a row for `18-notes.md` in the same shape as the row for `17-open-work.md`.

Add to `Features.md`, after the last line of `## 14. MCP server`:

```markdown
## 15. Notes

- ⚙️ **A note is an entity in the ledger** — nine `note.*` events (`packages/domain/src/events/note-events.ts`), folded by `applyNoteEvent` (`packages/domain/src/note-state.ts`); `comment.added` is filed against notes as well as tickets. Spec: `docs/superpowers/specs/2026-09-23-notes-design.md` §3.
```

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/note-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ENTITY_KINDS } from '../src/envelope.js';
import { noteCreatedPayload, noteScopeSetPayload } from '../src/events/note-events.js';
import { domainRegistry } from '../src/vocabulary.js';

const T = '01J9GTKA000000000000000000';

describe('18.001 note is an entity kind', () => {
  it('18.001 ENTITY_KINDS contains note and not a made-up kind', () => {
    expect(ENTITY_KINDS).toContain('note');
    expect(ENTITY_KINDS).not.toContain('notebook'); // control
  });
});

describe('18.002 noteCreatedPayload', () => {
  const minimal = { title: 'Cold room', homeProjectId: '', scope: { mode: 'private' as const } };
  it('18.002 accepts the minimal payload (control) and refuses each invalid shape', () => {
    expect(noteCreatedPayload.safeParse(minimal).success).toBe(true);
    expect(noteCreatedPayload.safeParse({ ...minimal, title: '' }).success).toBe(false);
    expect(noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'inherit' } }).success).toBe(false);
    expect(
      noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'inherit' }, attachTicketId: T }).success,
    ).toBe(true);
    expect(noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'project' } }).success).toBe(false);
    expect(
      noteCreatedPayload.safeParse({ ...minimal, homeProjectId: 'P1', scope: { mode: 'project' } }).success,
    ).toBe(true);
    expect(noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'explicit', userIds: [] } }).success).toBe(false);
    expect(noteScopeSetPayload.safeParse({ mode: 'workspace', userIds: ['u'] }).success).toBe(false);
  });
});

describe('18.003 registrations', () => {
  it('18.003 every note.* type is registered at version 1', () => {
    for (const type of [
      'note.created', 'note.renamed', 'note.body_set', 'note.scope_set', 'note.moved',
      'note.attached', 'note.detached', 'note.deleted', 'note.restored',
    ]) {
      expect(domainRegistry.get(type, 1)?.entityKind).toBe('note');
    }
    expect(domainRegistry.get('comment.added', 1)?.entityKind).toEqual(['ticket', 'note']);
  });
});
```

Extend `packages/domain/test/parse-event.test.ts` (create it if absent, importing whatever `parse-event.ts` exports — open the file and use its exported parse function name; the pattern below assumes `parseEvent(raw)` returning `{ ok, code }`):

```ts
it('18.003 comment.added parses against a note entity; note.renamed against a ticket is a kind mismatch', () => {
  const base = { id: '01J9GEV0000000000000000000', workspaceId: '01J9GWS0000000000000000000', version: 1,
    actorId: '01J9GACT000000000000000000', origin: 'web', clientTime: '2026-08-20T09:00:00.000Z' };
  expect(parseEvent({ ...base, entity: { kind: 'note', id: '01J9GNOT000000000000000000' }, type: 'comment.added',
    payload: { body: { type: 'doc' } } }).ok).toBe(true);
  expect(parseEvent({ ...base, entity: { kind: 'ticket', id: '01J9GTKA000000000000000000' }, type: 'comment.added',
    payload: { body: { type: 'doc' } } }).ok).toBe(true);
  const bad = parseEvent({ ...base, entity: { kind: 'ticket', id: '01J9GTKA000000000000000000' }, type: 'note.renamed',
    payload: { title: 'x' } });
  expect(bad.ok).toBe(false);
  expect((bad as { code: string }).code).toBe('entity-kind-mismatch');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/domain && pnpm exec vitest run --no-file-parallelism test/note-events.test.ts test/parse-event.test.ts > /tmp/notes1-domain.log 2>&1; tail -20 /tmp/notes1-domain.log`
Expected: FAIL — `Cannot find module '../src/events/note-events.js'` and `entityKind` mismatch.

- [ ] **Step 4: Implement**

`packages/domain/src/envelope.ts`: add `'note'` to the `ENTITY_KINDS` array (keep the existing order; append).

`packages/domain/src/registry.ts`:

```ts
export type EventTypeRegistration = {
  type: string;
  version: number;
  payloadSchema: z.ZodTypeAny;
  /** One kind, or the list of kinds this type may be filed against. Absent = any kind. */
  entityKind?: EventEnvelope['entity']['kind'] | readonly EventEnvelope['entity']['kind'][];
};
```

`packages/domain/src/parse-event.ts:79`, replace the mismatch test with:

```ts
  const allowedKinds =
    registration.entityKind === undefined
      ? undefined
      : Array.isArray(registration.entityKind)
        ? registration.entityKind
        : [registration.entityKind];
  if (allowedKinds !== undefined && !allowedKinds.includes(kind)) {
    return {
      ok: false,
      code: 'entity-kind-mismatch',
      message: `This ${type} event does not point at a ${allowedKinds.join(' or ')}; it points at a ${kind}.`,
      eventId: envelope.data.id,
    };
  }
```

`packages/domain/src/events/note-events.ts`: the schemas exactly as spec §3.2 (copy the block verbatim).

`packages/domain/src/vocabulary.ts`: change the `comment.added` registration's `entityKind: 'ticket'` to `entityKind: ['ticket', 'note']`; after the `attachment.added` registration add nine `domainRegistry.register({ type: 'note.created', version: 1, entityKind: 'note', payloadSchema: noteCreatedPayload })` blocks, one per type in spec §3.2's table.

`packages/domain/src/index.ts`: `export * from './events/note-events.js';`

- [ ] **Step 5: Run the tests to verify they pass, then the whole domain suite**

Run: `pnpm turbo run build --filter=@gisik-nokma/domain && cd packages/domain && pnpm exec vitest run --no-file-parallelism > /tmp/notes1-domain.log 2>&1; tail -20 /tmp/notes1-domain.log`
Expected: PASS, and the pre-existing suites still green (any test asserting the exact `ENTITY_KINDS` list or the `comment.added` registration shape must be updated in this commit, not skipped).

- [ ] **Step 6: Mutation, flip cases, commit**

Mutation: in `parse-event.ts` change `!allowedKinds.includes(kind)` to `false` → 18.003's mismatch assertion goes red. Restore. Flip `18.001`–`18.003` to `✅` in `test-cases/18-notes.md`.

```bash
git add packages/domain test-cases Features.md
git commit -m "Notes 1/Task 1: note entity kind, multi-kind registrations, note event schemas (18.001-18.003)"
```

---

### Task 2: Domain — `applyNoteEvent` reducer and `EMPTY_NOTE_DOC`

**Files:**
- Create: `packages/domain/src/note-state.ts`
- Modify: `packages/domain/src/index.ts`, `packages/domain/src/read-models.ts` (append the four read-model types from spec §2)
- Test: `packages/domain/test/note-state.test.ts`, `packages/editor/test/empty-doc-parity.test.ts`
- Docs: `test-cases/18-notes.md` (`18.004`–`18.014`), `Features.md`

**Interfaces:**
- Consumes: `noteCreatedPayload` etc. from Task 1; `EventEnvelope` from `envelope.ts`.
- Produces: `NOTE_SCOPE_MODES`, `NoteScopeMode`, `NoteScope`, `NoteState`, `EMPTY_NOTE_DOC`, `NOTE_EVENT_TYPES: readonly string[]`, `applyNoteEvent(state: NoteState | null, env: EventEnvelope): NoteState`, `NoteSummary`, `NoteDetail`, `NoteVersion`, `NoteComment`.

- [ ] **Step 1: Add the cases**

Append to `test-cases/18-notes.md` under `## 18.1 Domain`, all `❌`:

```markdown
- ❌ **18.004 — `note.created` builds the state:** author = actor, body = payload body, attached = `[attachTicketId]`, `scopeBeforeInherit = null`, `deleted = false`, `lastBodyEventId` = the event id. Mutation: drop `attachTicketId` handling.
- ❌ **18.005 — detach rule, remembered scope** (spec §3.4 example 1): final scope `project`. Mutation: return `private` unconditionally.
- ❌ **18.006 — detach rule, born in inherit** (spec §3.4 example 2): final scope `private`. Mutation: keep `inherit`.
- ❌ **18.007 — explicit remembered with its `userIds`:** `explicit [A,B]` → `inherit` → last detach → `explicit [A,B]`. Mutation: drop `userIds`.
- ❌ **18.008 — a detach that is not the last keeps `inherit`.** Mutation: revert on every detach.
- ❌ **18.009 — `scope_set` to a non-inherit mode clears `scopeBeforeInherit`.** Mutation: keep it.
- ❌ **18.010 — each refusal in spec §3.3 throws; a control valid event does not.** Mutation: remove one precondition.
- ❌ **18.011 — `note.attached` is idempotent.** Mutation: push the duplicate.
- ❌ **18.012 — `note.moved` to `''` under `project` scope throws.** Mutation: allow it.
- ❌ **18.013 — `EMPTY_NOTE_DOC` deep-equals `emptyDoc()` from `packages/editor`.** Mutation: change a key in either.
- ❌ **18.014 — every event sets `updatedAt` to the envelope's `serverTime` and `seq` to its `seq`.** Mutation: skip `updatedAt` on `note.renamed`.
```

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/note-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../src/envelope.js';
import { makeEnvelope } from '../src/testing.js';
import { applyNoteEvent, EMPTY_NOTE_DOC, type NoteState } from '../src/note-state.js';

const NOTE = '01J9GNOT000000000000000000';
const T1 = '01J9GTKA000000000000000001';
const T2 = '01J9GTKA000000000000000002';
const A = '01J9GUSA000000000000000000';
const B = '01J9GUSB000000000000000000';

let seq = 0;
function ev(type: string, payload: unknown, extra: Partial<EventEnvelope> = {}): EventEnvelope {
  seq += 1;
  return makeEnvelope({
    type, payload, seq,
    entity: { kind: 'note', id: NOTE },
    serverTime: `2026-09-23T10:00:${String(seq).padStart(2, '0')}.000Z`,
    ...extra,
  });
}
function fold(events: EventEnvelope[]): NoteState {
  let state: NoteState | null = null;
  for (const e of events) state = applyNoteEvent(state, e);
  if (state === null) throw new Error('no events');
  return state;
}
const created = (scope: unknown, extra: Record<string, unknown> = {}) =>
  ev('note.created', { title: 'Cold room', homeProjectId: 'P1', scope, ...extra });

describe('18.004 note.created', () => {
  it('18.004 builds the state from the payload and the envelope', () => {
    const e = created({ mode: 'inherit' }, { attachTicketId: T1, body: { type: 'doc', content: [] } });
    const s = fold([e]);
    expect(s.authorId).toBe(e.actorId);
    expect(s.body).toEqual({ type: 'doc', content: [] });
    expect(s.attachedTicketIds).toEqual([T1]);
    expect(s.scopeBeforeInherit).toBeNull();
    expect(s.deleted).toBe(false);
    expect(s.lastBodyEventId).toBe(e.id);
    expect(fold([created({ mode: 'private' })]).body).toEqual(EMPTY_NOTE_DOC); // control: no body → empty doc
  });
});

describe('18.005-18.009 the detach rule', () => {
  it('18.005 reverts to the remembered scope on the last detach', () => {
    const s = fold([
      created({ mode: 'project' }),
      ev('note.attached', { ticketId: T1 }),
      ev('note.scope_set', { mode: 'inherit' }),
      ev('note.attached', { ticketId: T2 }),
      ev('note.detached', { ticketId: T1 }),
      ev('note.detached', { ticketId: T2 }),
    ]);
    expect(s.scope).toEqual({ mode: 'project' });
    expect(s.scopeBeforeInherit).toBeNull();
  });
  it('18.006 born in inherit → private on the last detach', () => {
    const s = fold([created({ mode: 'inherit' }, { attachTicketId: T1 }), ev('note.detached', { ticketId: T1 })]);
    expect(s.scope).toEqual({ mode: 'private' });
  });
  it('18.007 explicit is remembered with its userIds', () => {
    const s = fold([
      created({ mode: 'explicit', userIds: [A, B] }),
      ev('note.attached', { ticketId: T1 }),
      ev('note.scope_set', { mode: 'inherit' }),
      ev('note.detached', { ticketId: T1 }),
    ]);
    expect(s.scope).toEqual({ mode: 'explicit', userIds: [A, B] });
  });
  it('18.008 a detach that is not the last keeps inherit', () => {
    const s = fold([
      created({ mode: 'inherit' }, { attachTicketId: T1 }),
      ev('note.attached', { ticketId: T2 }),
      ev('note.detached', { ticketId: T1 }),
    ]);
    expect(s.scope).toEqual({ mode: 'inherit' });
    expect(s.attachedTicketIds).toEqual([T2]);
  });
  it('18.009 scope_set to a non-inherit mode clears the memory', () => {
    const s = fold([
      created({ mode: 'project' }),
      ev('note.attached', { ticketId: T1 }),
      ev('note.scope_set', { mode: 'inherit' }),
      ev('note.scope_set', { mode: 'workspace' }),
    ]);
    expect(s.scopeBeforeInherit).toBeNull();
    expect(s.scope).toEqual({ mode: 'workspace' });
  });
});

describe('18.010-18.012 refusals and idempotence', () => {
  it('18.010 each precondition throws; a valid event does not (control)', () => {
    expect(() => fold([created({ mode: 'private' }), created({ mode: 'private' })])).toThrow(/note\.created/);
    expect(() => fold([created({ mode: 'private' }), ev('note.scope_set', { mode: 'inherit' })])).toThrow(/inherit/);
    expect(() => fold([ev('note.renamed', { title: 'x' })])).toThrow(/note\.renamed/);
    expect(() => fold([created({ mode: 'private' }), ev('note.deleted', {}), ev('note.renamed', { title: 'x' })])).toThrow(/deleted/);
    expect(() => fold([created({ mode: 'private' }), ev('note.restored', {})])).toThrow(/not deleted/);
    expect(fold([created({ mode: 'private' }), ev('note.renamed', { title: 'Freezer' })]).title).toBe('Freezer');
  });
  it('18.011 attach is idempotent', () => {
    const s = fold([created({ mode: 'private' }), ev('note.attached', { ticketId: T1 }), ev('note.attached', { ticketId: T1 })]);
    expect(s.attachedTicketIds).toEqual([T1]);
  });
  it('18.012 moved to workspace level under project scope throws', () => {
    expect(() => fold([created({ mode: 'project' }), ev('note.moved', { homeProjectId: '' })])).toThrow(/project/);
    expect(fold([created({ mode: 'private' }), ev('note.moved', { homeProjectId: '' })]).homeProjectId).toBe(''); // control
  });
});

describe('18.014 envelope fields', () => {
  it('18.014 updatedAt and seq follow the latest event', () => {
    const e2 = ev('note.renamed', { title: 'x' });
    const s = fold([created({ mode: 'private' }), e2]);
    expect(s.updatedAt).toBe(e2.serverTime);
    expect(s.seq).toBe(e2.seq);
  });
});
```

`packages/editor/test/empty-doc-parity.test.ts`:

```ts
import { expect, it } from 'vitest';
import { EMPTY_NOTE_DOC } from '@gisik-nokma/domain';
import { emptyDoc } from '../src/doc.js';

it('18.013 EMPTY_NOTE_DOC in domain equals emptyDoc() in editor', () => {
  expect(EMPTY_NOTE_DOC).toEqual(emptyDoc());
});
```

(Plan 4 raises `DOC_SCHEMA_VERSION` to 2; until then both say 1. Keep them equal.)

- [ ] **Step 3: Run to verify failure**

Run: `cd packages/domain && pnpm exec vitest run --no-file-parallelism test/note-state.test.ts > /tmp/notes1-domain.log 2>&1; tail -20 /tmp/notes1-domain.log`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `packages/domain/src/note-state.ts`**

```ts
import type { EventEnvelope } from './envelope.js';
import {
  noteAttachedPayload, noteBodySetPayload, noteCreatedPayload, noteDetachedPayload,
  noteMovedPayload, noteRenamedPayload, noteScopeSetPayload,
} from './events/note-events.js';

export const NOTE_SCOPE_MODES = ['private', 'workspace', 'project', 'inherit', 'explicit'] as const;
export type NoteScopeMode = (typeof NOTE_SCOPE_MODES)[number];
export type NoteScope =
  | { mode: 'private' } | { mode: 'workspace' } | { mode: 'project' } | { mode: 'inherit' }
  | { mode: 'explicit'; userIds: string[] };

/** The literal `emptyDoc()` in packages/editor returns; pinned equal by packages/editor/test/empty-doc-parity.test.ts. */
export const EMPTY_NOTE_DOC = {
  type: 'doc',
  attrs: { schemaVersion: 1 },
  content: [{ type: 'paragraph' }],
} as const;

export type NoteState = {
  noteId: string; workspaceId: string; authorId: string; title: string; body: unknown;
  homeProjectId: string; scope: NoteScope; scopeBeforeInherit: NoteScope | null;
  attachedTicketIds: string[]; deleted: boolean; createdAt: string; updatedAt: string;
  lastBodyEventId: string; seq: number;
};

export const NOTE_EVENT_TYPES = [
  'note.created', 'note.renamed', 'note.body_set', 'note.scope_set', 'note.moved',
  'note.attached', 'note.detached', 'note.deleted', 'note.restored', 'comment.added',
] as const;

function refuse(env: EventEnvelope, reason: string): never {
  throw new Error(`applyNoteEvent: ${env.type} refused — ${reason}`);
}

export function applyNoteEvent(state: NoteState | null, env: EventEnvelope): NoteState {
  if (env.type === 'note.created') {
    if (state !== null) refuse(env, 'note.created on an existing note');
    const p = noteCreatedPayload.parse(env.payload);
    return {
      noteId: env.entity.id, workspaceId: env.workspaceId, authorId: env.actorId, title: p.title,
      body: p.body ?? EMPTY_NOTE_DOC, homeProjectId: p.homeProjectId, scope: p.scope,
      scopeBeforeInherit: null,
      attachedTicketIds: p.attachTicketId === undefined ? [] : [p.attachTicketId],
      deleted: false, createdAt: env.serverTime, updatedAt: env.serverTime,
      lastBodyEventId: env.id, seq: env.seq,
    };
  }
  if (state === null) refuse(env, 'no note.created precedes it');
  const next: NoteState = { ...state, updatedAt: env.serverTime, seq: env.seq };
  if (env.type === 'note.restored') {
    if (!state.deleted) refuse(env, 'the note is not deleted');
    return { ...next, deleted: false };
  }
  if (state.deleted) refuse(env, 'the note is deleted');
  switch (env.type) {
    case 'note.renamed':
      return { ...next, title: noteRenamedPayload.parse(env.payload).title };
    case 'note.body_set':
      return { ...next, body: noteBodySetPayload.parse(env.payload).body, lastBodyEventId: env.id };
    case 'note.scope_set': {
      const scope = noteScopeSetPayload.parse(env.payload) as NoteScope;
      if (scope.mode === 'inherit' && state.attachedTicketIds.length === 0) refuse(env, 'inherit needs an attachment');
      if (scope.mode === 'project' && state.homeProjectId === '') refuse(env, 'project scope needs a project home');
      const scopeBeforeInherit =
        scope.mode === 'inherit' ? (state.scope.mode === 'inherit' ? state.scopeBeforeInherit : state.scope) : null;
      return { ...next, scope, scopeBeforeInherit };
    }
    case 'note.moved': {
      const { homeProjectId } = noteMovedPayload.parse(env.payload);
      if (homeProjectId === '' && state.scope.mode === 'project') refuse(env, 'project scope cannot move to workspace level');
      return { ...next, homeProjectId };
    }
    case 'note.attached': {
      const { ticketId } = noteAttachedPayload.parse(env.payload);
      if (state.attachedTicketIds.includes(ticketId)) return next;
      return { ...next, attachedTicketIds: [...state.attachedTicketIds, ticketId].sort() };
    }
    case 'note.detached': {
      const { ticketId } = noteDetachedPayload.parse(env.payload);
      const attachedTicketIds = state.attachedTicketIds.filter((id) => id !== ticketId);
      if (attachedTicketIds.length === 0 && state.scope.mode === 'inherit') {
        return { ...next, attachedTicketIds, scope: state.scopeBeforeInherit ?? { mode: 'private' }, scopeBeforeInherit: null };
      }
      return { ...next, attachedTicketIds };
    }
    case 'note.deleted':
      return { ...next, deleted: true };
    case 'comment.added':
      return next;
    default:
      return refuse(env, `unknown note event type`);
  }
}
```

Append to `packages/domain/src/read-models.ts` the `NoteSummary`, `NoteDetail`, `NoteVersion`, `NoteComment` types exactly as spec §2 (import `NoteScope` from `./note-state.js`). Add `export * from './note-state.js';` to `index.ts`.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm turbo run build --filter=@gisik-nokma/domain --filter=@gisik-nokma/editor && cd packages/domain && pnpm exec vitest run --no-file-parallelism > /tmp/notes1-domain.log 2>&1; tail -8 /tmp/notes1-domain.log; cd ../editor && pnpm exec vitest run --no-file-parallelism test/empty-doc-parity.test.ts > /tmp/notes1-editor.log 2>&1; tail -8 /tmp/notes1-editor.log`
Expected: PASS both.

- [ ] **Step 6: Mutations, flip, commit**

Apply and show red, one at a time, then restore: (18.005) replace `state.scopeBeforeInherit ?? { mode: 'private' }` with `{ mode: 'private' }`; (18.011) remove the `includes` guard; (18.013) change `schemaVersion: 1` to `2` in `EMPTY_NOTE_DOC`. Flip `18.004`–`18.014` to `✅`. Add to `Features.md` §15: `- ⚙️ **The detach rule is derived in the reducer** — the last detach of an inherit-scoped note reverts to the remembered scope or to private (\`applyNoteEvent\`, spec §3.3–3.4).`

```bash
git add packages/domain packages/editor/test/empty-doc-parity.test.ts test-cases Features.md
git commit -m "Notes 1/Task 2: applyNoteEvent reducer, EMPTY_NOTE_DOC, note read models (18.004-18.014)"
```

---

### Task 3: Server — migration, `proj_notes` projection, comments note branch

**Files:**
- Create: `apps/server/migrations/1790100000000_proj-notes.sql`
- Create: `apps/server/src/projections/notes.ts`
- Modify: `apps/server/src/projections/ticket-comments.ts:46-60`, `apps/server/src/projections/index.ts:64-151`
- Test: `apps/server/test/projections/proj-notes.test.ts`
- Docs: `test-cases/18-notes.md` (`18.015`–`18.019`), `Features.md`

**Interfaces:**
- Consumes: `applyNoteEvent`, `NoteState`, `NOTE_EVENT_TYPES` (Task 2); `Projection` (`apps/server/src/projections/registry.ts:44`); `LedgerEvent` from `@gisik-nokma/domain`.
- Produces: `notesProjection: Projection` (name `proj_notes`, tables `['proj_notes','proj_note_attachments']`); `getNoteStateFromDb(db: Queryable, noteId: string): Promise<NoteState | null>`; `proj_note_comments` rows for `comment.added` on notes.

- [ ] **Step 1: Cases**

```markdown
## 18.2 Server — storage

- ❌ **18.015 — `proj_notes` is a pure function of the events:** after applying the §3.4 example-1 sequence, the row has `scope_mode='project'`, `pre_inherit_mode IS NULL`, two attachment rows then none; `verifyProjections` reports clean. Mutation: write `scope_mode` from the payload instead of the reducer's state.
- ❌ **18.016 — `rebuildProjection('proj_notes')` reproduces identical rows** (reset + replay). Mutation: skip `reset`.
- ❌ **18.017 — `comment.added` on a note lands in `proj_note_comments`** with `note_id` = entity id and `comment_id` = event id; control: a ticket comment still lands in `proj_ticket_comments` only. Mutation: drop the note branch.
- ❌ **18.018 — `schema_version` is read from `body.attrs.schemaVersion`,** default 1 when absent. Mutation: hard-code 1.
- ❌ **18.019 — `getNoteStateFromDb` round-trips a state** through the row and back (`toEqual` the reducer's state). Mutation: drop `scopeBeforeInherit` from `rowToNoteState`.
```

- [ ] **Step 2: Failing tests** — `apps/server/test/projections/proj-notes.test.ts`

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyNoteEvent, newUlid, type NoteState } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getNoteStateFromDb } from '../../src/projections/notes.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });
beforeEach(async () => {
  resetEntitySeqs();
  await db.pool.query('TRUNCATE events, proj_notes, proj_note_attachments, proj_note_comments, proj_ticket_comments');
});

const WS = newUlid(); const NOTE = newUlid(); const T1 = newUlid(); const T2 = newUlid(); const ACTOR = newUlid();
const note = (type: string, payload: unknown) =>
  makeCommitted({ workspaceId: WS, entity: { kind: 'note', id: NOTE }, type, payload, actorId: ACTOR });

const EXAMPLE_1 = () => [
  note('note.created', { title: 'Cold room', homeProjectId: 'P1', scope: { mode: 'project' } }),
  note('note.attached', { ticketId: T1 }),
  note('note.scope_set', { mode: 'inherit' }),
  note('note.attached', { ticketId: T2 }),
  note('note.detached', { ticketId: T1 }),
  note('note.detached', { ticketId: T2 }),
];

describe('18.015 proj_notes', () => {
  it('18.015 folds the example-1 sequence and verifies clean', async () => {
    const events = EXAMPLE_1();
    await applyCommitted(db.pool, events.slice(0, 4));
    let att = await db.pool.query('SELECT ticket_id FROM proj_note_attachments WHERE note_id = $1 ORDER BY ticket_id', [NOTE]);
    expect(att.rows.map((r) => r.ticket_id).sort()).toEqual([T1, T2].sort());
    await applyCommitted(db.pool, events.slice(4));
    const row = (await db.pool.query('SELECT scope_mode, pre_inherit_mode FROM proj_notes WHERE note_id = $1', [NOTE])).rows[0];
    expect(row).toEqual({ scope_mode: 'project', pre_inherit_mode: null });
    att = await db.pool.query('SELECT ticket_id FROM proj_note_attachments WHERE note_id = $1', [NOTE]);
    expect(att.rowCount).toBe(0);
    const projections = buildProjectionRegistry();
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({ clean: true, diffs: [] });
  });
  it('18.016 rebuild reproduces the rows', async () => {
    await applyCommitted(db.pool, EXAMPLE_1());
    const before = (await db.pool.query('SELECT * FROM proj_notes ORDER BY note_id')).rows;
    const projections = buildProjectionRegistry();
    await rebuildProjection('proj_notes', { pool: db.pool, projections });
    const after = (await db.pool.query('SELECT * FROM proj_notes ORDER BY note_id')).rows;
    expect(after).toEqual(before);
  });
  it('18.018 schema_version comes from the body', async () => {
    await applyCommitted(db.pool, [
      note('note.created', { title: 'v', homeProjectId: '', scope: { mode: 'private' },
        body: { type: 'doc', attrs: { schemaVersion: 7 }, content: [] } }),
    ]);
    const row = (await db.pool.query('SELECT schema_version FROM proj_notes WHERE note_id = $1', [NOTE])).rows[0];
    expect(row.schema_version).toBe(7);
  });
  it('18.019 getNoteStateFromDb round-trips the reducer state', async () => {
    const events = EXAMPLE_1().slice(0, 3);
    await applyCommitted(db.pool, events);
    let expected: NoteState | null = null;
    for (const e of events) expected = applyNoteEvent(expected, e);
    expect(await getNoteStateFromDb(db.pool, NOTE)).toEqual(expected);
  });
});

describe('18.017 comment.added on a note', () => {
  it('18.017 lands in proj_note_comments; a ticket comment stays in proj_ticket_comments (control)', async () => {
    const c = makeCommitted({ workspaceId: WS, entity: { kind: 'note', id: NOTE }, type: 'comment.added',
      payload: { body: { type: 'doc' } }, actorId: ACTOR });
    await applyCommitted(db.pool, [note('note.created', { title: 'n', homeProjectId: '', scope: { mode: 'private' } }), c]);
    const rows = (await db.pool.query('SELECT comment_id, note_id FROM proj_note_comments')).rows;
    expect(rows).toEqual([{ comment_id: c.id, note_id: NOTE }]);
    expect((await db.pool.query('SELECT count(*)::int AS n FROM proj_ticket_comments')).rows[0].n).toBe(0);
  });
});
```

(`resetEntitySeqs` is exported from `helpers/apply.ts:51`; `makeCommitted` from `:79`; `applyCommitted` from `:146`. If `makeCommitted` does not accept a `note` kind because of a local type, widen that type — the domain's `EntityKind` now includes it.)

- [ ] **Step 3: Run to verify failure**

Run: `docker compose up -d postgres && cd apps/server && pnpm exec vitest run --no-file-parallelism test/projections/proj-notes.test.ts > /tmp/notes1-server.log 2>&1; tail -20 /tmp/notes1-server.log`
Expected: FAIL — relation `proj_notes` does not exist / module not found.

- [ ] **Step 4: Implement**

Migration `apps/server/migrations/1790100000000_proj-notes.sql`: the DDL from spec §6.1 verbatim, preceded by a header comment in the style of `1790000000000_proj-ticket-comments.sql:1-26` stating: one row per note; the whole row is written from `applyNoteEvent`'s state so the table is a pure function of the ledger; attachments are one row per link because the ticket sheet's badge query is a lookup by `ticket_id`; history has no table because the events table already holds every version.

`apps/server/src/projections/notes.ts`:

```ts
import type { PoolClient } from 'pg';
import { applyNoteEvent, NOTE_EVENT_TYPES, type LedgerEvent, type NoteScope, type NoteState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';

type NoteRow = {
  note_id: string; workspace_id: string; home_project_id: string; author_id: string; title: string;
  body: unknown; schema_version: number; scope_mode: NoteScope['mode']; scope_user_ids: string[];
  pre_inherit_mode: NoteScope['mode'] | null; pre_inherit_user_ids: string[]; deleted: boolean;
  created_at: Date; updated_at: Date; last_body_event_id: string; seq: string | number; workspace_seq: string | number;
};

function scopeOf(mode: NoteScope['mode'], userIds: string[]): NoteScope {
  return mode === 'explicit' ? { mode, userIds } : { mode };
}

export function rowToNoteState(row: NoteRow, attachedTicketIds: string[]): NoteState {
  return {
    noteId: row.note_id, workspaceId: row.workspace_id, authorId: row.author_id, title: row.title,
    body: row.body, homeProjectId: row.home_project_id,
    scope: scopeOf(row.scope_mode, row.scope_user_ids),
    scopeBeforeInherit: row.pre_inherit_mode === null ? null : scopeOf(row.pre_inherit_mode, row.pre_inherit_user_ids),
    attachedTicketIds, deleted: row.deleted,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    lastBodyEventId: row.last_body_event_id, seq: Number(row.seq),
  };
}

export async function getNoteStateFromDb(db: Queryable, noteId: string): Promise<NoteState | null> {
  const { rows } = await db.query<NoteRow>('SELECT * FROM proj_notes WHERE note_id = $1', [noteId]);
  const row = rows[0];
  if (row === undefined) return null;
  const att = await db.query<{ ticket_id: string }>(
    'SELECT ticket_id FROM proj_note_attachments WHERE note_id = $1 ORDER BY ticket_id', [noteId]);
  return rowToNoteState(row, att.rows.map((r) => r.ticket_id));
}

function schemaVersionOf(body: unknown): number {
  const attrs = (body as { attrs?: { schemaVersion?: unknown } } | null)?.attrs;
  return typeof attrs?.schemaVersion === 'number' ? attrs.schemaVersion : 1;
}

async function upsertNote(tx: PoolClient, next: NoteState, event: LedgerEvent): Promise<void> {
  const pre = next.scopeBeforeInherit;
  await tx.query(
    `INSERT INTO proj_notes
       (note_id, workspace_id, home_project_id, author_id, title, body, schema_version, scope_mode, scope_user_ids,
        pre_inherit_mode, pre_inherit_user_ids, deleted, created_at, updated_at, last_body_event_id, seq, workspace_seq)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (note_id) DO UPDATE SET
       home_project_id = EXCLUDED.home_project_id, title = EXCLUDED.title, body = EXCLUDED.body,
       schema_version = EXCLUDED.schema_version, scope_mode = EXCLUDED.scope_mode, scope_user_ids = EXCLUDED.scope_user_ids,
       pre_inherit_mode = EXCLUDED.pre_inherit_mode, pre_inherit_user_ids = EXCLUDED.pre_inherit_user_ids,
       deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, last_body_event_id = EXCLUDED.last_body_event_id,
       seq = EXCLUDED.seq, workspace_seq = EXCLUDED.workspace_seq`,
    [
      next.noteId, next.workspaceId, next.homeProjectId, next.authorId, next.title, JSON.stringify(next.body),
      schemaVersionOf(next.body), next.scope.mode, next.scope.mode === 'explicit' ? next.scope.userIds : [],
      pre === null ? null : pre.mode, pre !== null && pre.mode === 'explicit' ? pre.userIds : [],
      next.deleted, next.createdAt, next.updatedAt, next.lastBodyEventId, next.seq, event.workspaceSeq,
    ],
  );
}

export const notesProjection: Projection = {
  name: 'proj_notes',
  tables: ['proj_notes', 'proj_note_attachments'],
  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (event.entity.kind !== 'note' || !(NOTE_EVENT_TYPES as readonly string[]).includes(event.type)) return;
    if (event.type === 'comment.added') return; // proj_note_comments is the comments projection's
    const current = await getNoteStateFromDb(tx, event.entity.id);
    const next = applyNoteEvent(current, event);
    await upsertNote(tx, next, event);
    if (event.type === 'note.created' && next.attachedTicketIds.length === 1) {
      await insertAttachment(tx, next, next.attachedTicketIds[0]!, event);
    } else if (event.type === 'note.attached') {
      const ticketId = (event.payload as { ticketId: string }).ticketId;
      await insertAttachment(tx, next, ticketId, event);
    } else if (event.type === 'note.detached') {
      await tx.query('DELETE FROM proj_note_attachments WHERE note_id = $1 AND ticket_id = $2',
        [next.noteId, (event.payload as { ticketId: string }).ticketId]);
    }
  },
  async reset(tx: PoolClient): Promise<void> {
    await tx.query('TRUNCATE proj_notes, proj_note_attachments');
  },
};

async function insertAttachment(tx: PoolClient, next: NoteState, ticketId: string, event: LedgerEvent): Promise<void> {
  await tx.query(
    `INSERT INTO proj_note_attachments (note_id, ticket_id, workspace_id, attached_at, workspace_seq)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (note_id, ticket_id) DO NOTHING`,
    [next.noteId, ticketId, next.workspaceId, event.serverTime, event.workspaceSeq],
  );
}
```

`ticket-comments.ts`: replace the `if (event.entity.kind !== 'ticket') return;` with a branch — kind `ticket` keeps the existing insert; kind `note` runs the same `INSERT` into `proj_note_comments (comment_id, workspace_id, note_id, author_id, body, recorded_at, workspace_seq)`; any other kind returns. Add `'proj_note_comments'` to `tables` and to the `reset` truncate.

`projections/index.ts`: `registry.register(notesProjection);` **after** `registry.register(projVisibility)` (`:103`) and before `registry.register(projContested)`.

- [ ] **Step 5: Run to verify pass, then the whole server suite**

Run: `pnpm turbo run build && cd apps/server && pnpm exec vitest run --no-file-parallelism > /tmp/notes1-server.log 2>&1; tail -20 /tmp/notes1-server.log`
Expected: PASS. Any pre-existing test enumerating projection names or table lists must be updated in this commit.

- [ ] **Step 6: Mutations, flip, commit**

Show red: (18.015) in `upsertNote` write `(event.payload as any).mode ?? next.scope.mode` for `scope_mode`; (18.017) make the note branch `return`; (18.019) drop `scopeBeforeInherit` from `rowToNoteState`. Restore. Flip `18.015`–`18.019`. Features §15: `- ⚙️ **Notes are projected into \`proj_notes\`, \`proj_note_attachments\`, \`proj_note_comments\`** — whole-row writes from the reducer, verifier-clean, no history table (versions are read from \`events\`).`

```bash
git add apps/server test-cases Features.md
git commit -m "Notes 1/Task 3: proj_notes migration and projection, note comments branch (18.015-18.019)"
```

---

### Task 4: Server — `canReadNote` and `visibleNotesWhere`, asserted equal

**Files:**
- Create: `apps/server/src/visibility/can-read-note.ts`
- Modify: `apps/server/src/read/visible-where.ts` (add `visibleNotesWhere` beside `visibleTicketsWhere` at `:95`)
- Test: `apps/server/test/visibility/can-read-note.test.ts`
- Docs: `18.020`–`18.023`

**Interfaces:**
- Consumes: `EffectiveRole`, `resolveEffectiveRole` (`effective-role.ts:42`, `:100`); `ResolvedVisibility`, `canSeeResolved`, `getResolvedVisibility` (`can-see.ts:14`, `:118`, `:150`); `visibleTicketsWhere`, `explicitAudienceWhere`, `LIVE_TICKET_WHERE`, `SqlParams` (`visible-where.ts:95`, `:226`, `:200`; `sql-params.ts:16`); `getNoteStateFromDb` (Task 3).
- Produces:
  - `canReadNote(eff, userId, note: Pick<NoteState,'authorId'|'homeProjectId'|'scope'|'deleted'>, attachedVisibilities: ResolvedVisibility[]): boolean`
  - `loadNoteForVisibility(db, noteId): Promise<{ note: NoteState; attachedVisibilities: ResolvedVisibility[] } | null>` (attached visibilities of live tickets only)
  - `canReadNoteById(db, userId, noteId): Promise<boolean>`
  - `visibleNotesWhere(eff, userId, params: SqlParams): string` — a WHERE fragment over alias `n` (`proj_notes`).

- [ ] **Step 1: Cases**

```markdown
## 18.3 Server — who may read a note

- ❌ **18.020 — `canReadNote` implements spec §4.1** for every (scope × relationship) cell of the fixture: 5 notes × 7 users. Mutation: flip the `guest` arm of `workspace`.
- ❌ **18.021 — `visibleNotesWhere` returns exactly the notes `canReadNote` accepts,** asserted per user on the same fixture. Mutation: change the `project` arm to ignore project membership.
- ❌ **18.022 — an `inherit` note is readable through ANY one attached visible ticket** (union), and not readable when every attached ticket is invisible or deleted. Mutation: require all.
- ❌ **18.023 — the owner reads every note; the author reads their own private note; a non-member reads nothing.** Mutation: drop the author arm.
```

- [ ] **Step 2: Failing test** — `apps/server/test/visibility/can-read-note.test.ts`

Fixture, seeded with `applyCommitted` (Task 3's helper): one workspace; users `owner`, `admin`, `memberIn` (on project P), `memberOut` (not on P), `guestListed`, `guestUnlisted`, `author` (a member on P). Seed memberships with `membership.granted` and `project.member_added` events exactly as `apps/server/test/helpers/read-scenario.ts:120` (`seedReadScenario`) does — open it and copy its event shapes for workspace creation, project creation, memberships and one ticket per visibility mode. Tickets: `TP` (project-visible, in P), `TE` (explicit: `[guestListed]`). Notes (author = `author`, home = P): `nPrivate`, `nWorkspace`, `nProject`, `nExplicit` (`[guestListed]`), `nInherit` (attached to `TE` only).

```ts
type U = 'owner'|'admin'|'memberIn'|'memberOut'|'guestListed'|'guestUnlisted'|'author';
const EXPECTED: Record<string, Record<U, boolean>> = {
  nPrivate:   { owner: true, admin: false, memberIn: false, memberOut: false, guestListed: false, guestUnlisted: false, author: true },
  nWorkspace: { owner: true, admin: true,  memberIn: true,  memberOut: true,  guestListed: false, guestUnlisted: false, author: true },
  nProject:   { owner: true, admin: false, memberIn: true,  memberOut: false, guestListed: false, guestUnlisted: false, author: true },
  nExplicit:  { owner: true, admin: false, memberIn: false, memberOut: false, guestListed: true,  guestUnlisted: false, author: true },
  nInherit:   { owner: true, admin: false, memberIn: false, memberOut: false, guestListed: true,  guestUnlisted: false, author: true },
};
```

(`admin` on `nProject` is `false` because the admin in this fixture is NOT a member of P; add a second admin who is, if you want the `true` cell — the spec's rule is membership, not role.)

Tests:

```ts
it('18.020 canReadNote matches EXPECTED for every cell', async () => {
  for (const [noteKey, noteId] of Object.entries(NOTES)) for (const u of USERS) {
    const eff = await resolveEffectiveRole(db.pool, ids[u], WS);
    const loaded = await loadNoteForVisibility(db.pool, noteId);
    expect(loaded, noteKey).not.toBeNull();
    expect(canReadNote(eff, ids[u], loaded!.note, loaded!.attachedVisibilities), `${noteKey}/${u}`).toBe(EXPECTED[noteKey][u]);
  }
});
it('18.021 visibleNotesWhere agrees with canReadNote per user', async () => {
  for (const u of USERS) {
    const eff = await resolveEffectiveRole(db.pool, ids[u], WS);
    const params = new SqlParams();
    const where = visibleNotesWhere(eff, ids[u], params);
    const { rows } = await db.pool.query(`SELECT n.note_id FROM proj_notes n WHERE n.workspace_id = ${params.add(WS)} AND ${where}`, params.toArray());
    const got = new Set(rows.map((r) => r.note_id));
    const want = new Set(Object.entries(NOTES).filter(([k]) => EXPECTED[k][u]).map(([, id]) => id));
    expect(got, u).toEqual(want);
  }
});
it('18.022 inherit is a union over attached visible tickets', async () => {
  // attach nInherit to TP as well → memberIn now reads it; delete TP → memberIn loses it again; guestListed keeps it via TE
  await applyCommitted(db.pool, [noteEv(NOTES.nInherit, 'note.attached', { ticketId: TP })]);
  expect(await canReadNoteById(db.pool, ids.memberIn, NOTES.nInherit)).toBe(true);
  await applyCommitted(db.pool, [ticketDeleted(TP)]);
  expect(await canReadNoteById(db.pool, ids.memberIn, NOTES.nInherit)).toBe(false);
  expect(await canReadNoteById(db.pool, ids.guestListed, NOTES.nInherit)).toBe(true);
});
it('18.023 owner reads all, author reads own private, non-member reads nothing', async () => {
  const stranger = newUlid();
  expect(await canReadNoteById(db.pool, stranger, NOTES.nWorkspace)).toBe(false);
  expect(await canReadNoteById(db.pool, ids.owner, NOTES.nPrivate)).toBe(true);
  expect(await canReadNoteById(db.pool, ids.author, NOTES.nPrivate)).toBe(true);
});
```

Where `SqlParams` is imported from `../../src/read/sql-params.js`, `visibleNotesWhere` from `../../src/read/visible-where.js`, the three functions from `../../src/visibility/can-read-note.js`. `ticketDeleted(TP)` is a `ticket.deleted` event in the shape `read-scenario.ts` uses; `noteEv` is `makeCommitted` with kind `note`.

- [ ] **Step 3: Run to verify failure** — module not found.

- [ ] **Step 4: Implement**

`apps/server/src/visibility/can-read-note.ts`:

```ts
import type { NoteState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
import { getNoteStateFromDb } from '../projections/notes.js';
import { canSeeResolved, getResolvedVisibility, type ResolvedVisibility } from './can-see.js';
import { ticketIsLive } from '../read/live-ticket.js';

export function canReadNote(
  eff: EffectiveRole, userId: string,
  note: Pick<NoteState, 'authorId' | 'homeProjectId' | 'scope' | 'deleted'>,
  attachedVisibilities: ResolvedVisibility[],
): boolean {
  if (eff.workspaceRole === null) return false;
  if (note.authorId === userId) return true;
  if (eff.workspaceRole === 'owner') return true;
  switch (note.scope.mode) {
    case 'private': return false;
    case 'workspace': return eff.workspaceRole !== 'guest';
    case 'project': return eff.workspaceRole !== 'guest' && eff.projects.has(note.homeProjectId);
    case 'explicit': return note.scope.userIds.includes(userId);
    case 'inherit': return attachedVisibilities.some((v) => canSeeResolved(eff, userId, v));
  }
}

export async function loadNoteForVisibility(
  db: Queryable, noteId: string,
): Promise<{ note: NoteState; attachedVisibilities: ResolvedVisibility[] } | null> {
  const note = await getNoteStateFromDb(db, noteId);
  if (note === null) return null;
  const attachedVisibilities: ResolvedVisibility[] = [];
  for (const ticketId of note.attachedTicketIds) {
    if (!(await ticketIsLive(db, note.workspaceId, ticketId))) continue;
    const v = await getResolvedVisibility(db, ticketId);
    if (v !== null) attachedVisibilities.push(v);
  }
  return { note, attachedVisibilities };
}

export async function canReadNoteById(db: Queryable, userId: string, noteId: string): Promise<boolean> {
  const loaded = await loadNoteForVisibility(db, noteId);
  if (loaded === null) return false;
  const eff = await resolveEffectiveRole(db, userId, loaded.note.workspaceId);
  return canReadNote(eff, userId, loaded.note, loaded.attachedVisibilities);
}
```

(`ticketIsLive(db, workspaceId, ticketId)` is `apps/server/src/read/live-ticket.ts`; open it to confirm the argument order.)

`visible-where.ts`, after `visibleTicketsWhere`:

```ts
/** WHERE fragment over alias `n` (proj_notes). Must accept exactly the rows canReadNote accepts (18.021). */
export function visibleNotesWhere(eff: EffectiveRole, userId: string, params: SqlParams): string {
  if (eff.workspaceRole === null) return 'FALSE';
  if (eff.workspaceRole === 'owner') return 'TRUE';
  const user = params.add(userId);
  const isGuest = eff.workspaceRole === 'guest';
  const projects = params.add([...eff.projects.keys()]);
  const inheritArm = `(n.scope_mode = 'inherit' AND EXISTS (
      SELECT 1 FROM proj_note_attachments na
      JOIN proj_visibility v ON v.ticket_id = na.ticket_id
      JOIN proj_tickets t ON t.ticket_id = na.ticket_id
      WHERE na.note_id = n.note_id AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, userId, params)}))`;
  const arms = [
    `n.author_id = ${user}`,
    isGuest ? null : `n.scope_mode = 'workspace'`,
    isGuest ? null : `(n.scope_mode = 'project' AND n.home_project_id = ANY (${projects}::text[]))`,
    `(n.scope_mode = 'explicit' AND ${user} = ANY (n.scope_user_ids))`,
    inheritArm,
  ].filter((arm): arm is string => arm !== null);
  return `(${arms.join(' OR ')})`;
}
```

`LIVE_TICKET_WHERE` (`:200`) is `'t.deleted_at IS NULL'` and expects alias `t`; `visibleTicketsWhere` expects alias `v`. Both aliases are provided in the subquery above.

- [ ] **Step 5: Run to verify pass**, then the whole server suite.

- [ ] **Step 6: Mutations, flip, commit**

Show red: (18.020) `case 'workspace': return true;`; (18.021) drop `AND n.home_project_id = ANY (...)`; (18.022) `every` instead of `some`; (18.023) remove the author line. Restore. Flip `18.020`–`18.023`. Features §15: `- ⚙️ **One reader predicate, two spellings, asserted equal** — \`canReadNote\` and \`visibleNotesWhere\` (spec §4.1, §4.3).`

```bash
git add apps/server test-cases Features.md
git commit -m "Notes 1/Task 4: canReadNote and visibleNotesWhere, asserted equal on one fixture (18.020-18.023)"
```

---

### Task 5: Server — `checkNotePermission` in the submission chain

**Files:**
- Modify: `apps/server/src/permissions/check-permission.ts` (`checkPermission` at `:1345`; add `checkNotePermission` beside `checkVisibilityPermission` at `:1060`)
- Test: `apps/server/test/permissions/check-note-permission.test.ts`
- Docs: `18.024`–`18.027`

**Interfaces:**
- Consumes: `Refusal = { refused: true; rule; reason }` (built by `refuseWith(rule, reason)`, `:305`); `PERMISSION_ROLE_RULE`, `PERMISSION_VISIBILITY_RULE`; `VisibilityContext`; `canSee` (`can-see.ts:251`); `loadNoteForVisibility`, `canReadNote` (Task 4); `getNoteStateFromDb` (Task 3); `noteCreatedPayload`, `noteAttachedPayload`, `noteDetachedPayload`.
- Produces: `checkNotePermission(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null>`, called from `checkPermission` after `checkRolePermission` and before `checkVisibilityPermission`; rule id `NOTE_PERMISSION_RULE = 'permission.note'`.

- [ ] **Step 1: Cases**

```markdown
## 18.4 Server — who may write which note event

- ❌ **18.024 — the matrix of spec §4.2**: every note event × {author, reader-member, non-reader-member, guest-listed, admin-reader, admin-non-reader, owner} refuses or allows exactly as the table says. Mutation: flip one cell.
- ❌ **18.025 — `note.created` refuses a guest, refuses a project home the actor is not on, and requires ticket visibility for `attachTicketId`.** Control: a member on the project creates. Mutation: drop the project-membership check.
- ❌ **18.026 — `note.attached` requires BOTH reading the note AND seeing the ticket;** a reader who cannot see the ticket is refused, a ticket-viewer who cannot read the note is refused. Mutation: drop either half.
- ❌ **18.027 — refusals carry rule `permission.note` and a plain-language reason;** `note.created` by a guest carries `permission.role` (the role check fires first). Mutation: use the visibility rule id.
```

- [ ] **Step 2: Failing test** — build the same fixture as Task 4 (extract it into `apps/server/test/helpers/notes-fixture.ts` exporting `seedNotesFixture(pool) → { WS, P, ids, NOTES, TP, TE }` and have Task 4's test import it too). Then drive `checkPermission(env, { db: db.pool, sessionUserId })` (`:1345`) directly with envelopes built by `makeEnvelope` / `makeCommitted` (`origin: 'web'`, `actorId = sessionUserId`). Table-driven:

```ts
const cases: Array<{ type: string; payload: unknown; note: keyof typeof NOTES; allowed: U[] }> = [
  { type: 'note.renamed', payload: { title: 'x' }, note: 'nWorkspace', allowed: ['author', 'owner', 'admin'] }, // admin READS a workspace note → isAdminReader
  { type: 'note.renamed', payload: { title: 'x' }, note: 'nPrivate',   allowed: ['author', 'owner'] },
  { type: 'note.body_set', payload: { body: { type: 'doc' } }, note: 'nProject', allowed: ['author', 'owner'] }, // admin is not on P
  { type: 'note.scope_set', payload: { mode: 'workspace' }, note: 'nExplicit', allowed: ['author', 'owner'] },
  { type: 'note.deleted', payload: {}, note: 'nWorkspace', allowed: ['author', 'owner', 'admin'] },
  { type: 'comment.added', payload: { body: { type: 'doc' } }, note: 'nWorkspace', allowed: ['author', 'owner', 'admin', 'memberIn', 'memberOut'] },
  { type: 'comment.added', payload: { body: { type: 'doc' } }, note: 'nExplicit', allowed: ['author', 'owner', 'guestListed'] },
];
for (const c of cases) it(`18.024 ${c.type} on ${c.note}`, async () => {
  for (const u of USERS) {
    const env = makeEnvelope({ type: c.type, payload: c.payload, entity: { kind: 'note', id: NOTES[c.note] },
      workspaceId: WS, actorId: ids[u], origin: 'web' });
    const refusal = await checkPermission(env, { db: db.pool, sessionUserId: ids[u] });
    expect(refusal === null, `${c.type}/${c.note}/${u}`).toBe(c.allowed.includes(u));
  }
});
```

Plus 18.025 (`note.created` by `guestListed` → refused with rule `permission.role`; by `memberOut` with `homeProjectId: P` → refused `permission.note`; by `memberIn` with `attachTicketId: TE` → refused (cannot see TE); by `memberIn` with `attachTicketId: TP` → allowed), 18.026 (`note.attached { ticketId: TE }` on `nWorkspace` by `memberIn` → refused; on `nPrivate` by `guestListed` (sees TE, cannot read the note) → refused; on `nWorkspace` by `guestListed`… guest cannot read a workspace note → refused; on `nExplicit` by `guestListed` → allowed), 18.027 (assert `refusal.rule` values).

- [ ] **Step 3: Run to verify failure** — the matrix fails because no note check exists (every non-guest passes).

- [ ] **Step 4: Implement** in `check-permission.ts`:

```ts
export const NOTE_PERMISSION_RULE = 'permission.note';
const NOTE_NOT_READABLE_REASON = 'You cannot see this note.';
const NOTE_NOT_YOURS_REASON = 'Only the note’s author, an admin who can read it, or the workspace owner can change it.';
const NOTE_HOME_REASON = 'You are not a member of the project this note is filed under.';
const NOTE_TICKET_REASON = 'You cannot see the ticket this note would be attached to.';

const NOTE_AUTHOR_EVENTS = new Set(['note.renamed', 'note.body_set', 'note.scope_set', 'note.moved', 'note.deleted', 'note.restored']);

export async function checkNotePermission(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
  if (env.entity.kind !== 'note') return null;
  const role = ctx.eff.workspaceRole;
  if (env.type === 'note.created') {
    const p = noteCreatedPayload.parse(env.payload);
    if (p.homeProjectId !== '' && role !== 'owner' && !ctx.eff.projects.has(p.homeProjectId)) {
      return refuseWith(NOTE_PERMISSION_RULE, NOTE_HOME_REASON);
    }
    if (p.attachTicketId !== undefined && !(await canSee(ctx.db, ctx.sessionUserId, p.attachTicketId))) {
      return refuseWith(NOTE_PERMISSION_RULE, NOTE_TICKET_REASON);
    }
    return null;
  }
  const loaded = await loadNoteForVisibility(ctx.db, env.entity.id);
  if (loaded === null) return refuseWith(NOTE_PERMISSION_RULE, NOTE_NOT_READABLE_REASON);
  const readable = canReadNote(ctx.eff, ctx.sessionUserId, loaded.note, loaded.attachedVisibilities);
  if (!readable) return refuseWith(NOTE_PERMISSION_RULE, NOTE_NOT_READABLE_REASON);
  if (NOTE_AUTHOR_EVENTS.has(env.type)) {
    const isAuthor = loaded.note.authorId === ctx.sessionUserId;
    const isOwner = role === 'owner';
    const isAdminReader = role === 'admin'; // readable already established
    return isAuthor || isOwner || isAdminReader ? null : refuseWith(NOTE_PERMISSION_RULE, NOTE_NOT_YOURS_REASON);
  }
  if (env.type === 'note.attached' || env.type === 'note.detached') {
    const { ticketId } = (env.type === 'note.attached' ? noteAttachedPayload : noteDetachedPayload).parse(env.payload);
    if (!(await canSee(ctx.db, ctx.sessionUserId, ticketId))) return refuseWith(NOTE_PERMISSION_RULE, NOTE_TICKET_REASON);
    return null;
  }
  return null; // comment.added: readable is enough
}
```

Add `note.created` to the guest refusal in `checkRolePermission` (`:741`): `if ((env.type === 'ticket.created' || env.type === 'note.created') && role === 'guest') return refuse(...)` — with a reason string that names notes too. In `checkPermission` insert `const noteRefusal = await checkNotePermission(env, permissionContext); if (noteRefusal !== null) return noteRefusal;` right after the `roleRefusal` return.

`checkVisibilityPermission` already returns `null` for non-ticket kinds (`:1064`), so no change there.

- [ ] **Step 5: Run to verify pass**, then the whole server suite.

- [ ] **Step 6: Mutations, flip, commit** — (18.024) `isAdminReader = false`; (18.025) drop the home check; (18.026) drop the `canSee` in the attach branch; (18.027) use `PERMISSION_VISIBILITY_RULE`. Flip `18.024`–`18.027`. Features §15: `- ⚙️ **Note writes are gated by \`checkNotePermission\`** — author/admin-reader/owner edit; readers attach on tickets they can see; readers comment (spec §4.2; admins have no override beyond what they can read, per \`can-see.ts\`).`

```bash
git add apps/server test-cases Features.md
git commit -m "Notes 1/Task 5: checkNotePermission in the submission chain (18.024-18.027)"
```

---

### Task 6: Server — reads and routes

**Files:**
- Create: `apps/server/src/read/notes.ts`, `apps/server/src/routes/notes.ts`
- Modify: `apps/server/src/app.ts:828` (register beside `registerTicketRoutes`)
- Test: `apps/server/test/routes/notes.test.ts`
- Docs: `18.028`–`18.035`

**Interfaces:**
- Consumes: `visibleNotesWhere`, `visibleTicketsWhere`, `SqlParams`; `canReadNoteById`; `resolveEffectiveRole`; `NOT_FOUND_BODY` (`routes/tickets.ts:53`); `requireSession` passed by parameter as `registerTicketRoutes(app, deps, requireSession)` does (`:327-330`); `ticketKey` from `@gisik-nokma/domain` (imported at `routes/tickets.ts:2`) and `ticketNumber` (`read/ticket-numbers.ts`) for the `key` of an attached ticket — open `routes/tickets.ts`'s `titleOf` and key derivation and reuse the same helpers.
- Produces (in `read/notes.ts`, every function takes `(db: Queryable, eff: EffectiveRole, userId: string, …)`):
  - `listNotes(db, eff, userId, workspaceId, filter: { homeProjectId?: string; authorId?: string; scopeMode?: NoteScopeMode; deleted?: boolean }): Promise<NoteSummary[]>`
  - `getNoteDetail(db, eff, userId, noteId): Promise<NoteDetail | null>` (null when absent or unreadable)
  - `listNotesForTicket(db, eff, userId, workspaceId, ticketId): Promise<NoteSummary[]>`
  - `listNoteComments(db, noteId): Promise<NoteComment[]>` (caller checks readability)
  - `listNoteHistory(db, noteId): Promise<NoteVersion[]>`
  - `getNoteVersionBody(db, noteId, eventId): Promise<unknown | null>`
- Routes (all `GET`, `preHandler: requireSession`, JSON bodies `{ notes }`, `{ note }`, `{ comments }`, `{ versions }`, `{ body }`; 404 `NOT_FOUND_BODY` for unreadable and absent alike):
  - `/v1/workspaces/:workspaceId/notes?home=&author=&scope=&deleted=1`
  - `/v1/notes/:noteId`
  - `/v1/workspaces/:workspaceId/tickets/:ticketId/notes`
  - `/v1/notes/:noteId/comments`
  - `/v1/notes/:noteId/history`
  - `/v1/notes/:noteId/history/:eventId`

- [ ] **Step 1: Cases**

```markdown
## 18.5 Server — reads

- ❌ **18.028 — `GET …/notes` returns exactly the readable, non-deleted notes for each fixture user,** newest `updated_at` first. Mutation: drop `visibleNotesWhere`.
- ❌ **18.029 — `?home=`, `?author=`, `?scope=` filters narrow the list;** control: no filter returns the superset. Mutation: ignore `scope`.
- ❌ **18.030 — `?deleted=1` returns deleted notes only to the author, an admin-reader or the owner;** a member sees `[]`. Mutation: return them to any reader.
- ❌ **18.031 — `GET /v1/notes/:id` is 404 with the same body for an unreadable note and for a random id.** Mutation: 403 for unreadable.
- ❌ **18.032 — `GET …/tickets/:id/notes` omits notes the viewer cannot read** (D5): `guestListed` sees `nInherit` on `TE`; `memberIn` does not. Mutation: drop the predicate.
- ❌ **18.033 — `attachedTickets` in a summary omits tickets the viewer cannot see.** Mutation: drop `visibleTicketsWhere` from the join.
- ❌ **18.034 — history lists `note.created` and every `note.body_set` in order; the version body is that event's payload body.** Mutation: include `note.renamed`.
- ❌ **18.035 — comments are returned in `workspace_seq` order only to readers.** Mutation: skip the readability check.
```

- [ ] **Step 2: Failing test** — `apps/server/test/routes/notes.test.ts`. Use `buildReadTestApp(db)` (`helpers/read-app.ts:207`) for an app with signed-in roles and `world.authOf(role)` headers, then seed the notes fixture from Task 5's helper into `world.world.workspaceId` / `world.world.projectId` (adapt `seedNotesFixture` to accept an existing workspace and users: `owner`, `member`, `outsider`, `guest` from `ReadScenarioUsers`, plus the scenario's `sharedTaskId` (project-visible) and `guestTaskId` (explicit to guest) as `TP`/`TE`). Then:

```ts
it('18.028 lists the readable notes per role', async () => {
  for (const role of ['owner', 'member', 'outsider', 'guest'] as const) {
    const res = await world.app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/notes`, headers: world.authOf(role) });
    expect(res.statusCode).toBe(200);
    const ids = res.json().notes.map((n: { noteId: string }) => n.noteId).sort();
    expect(ids, role).toEqual(expectedFor(role).sort());
  }
});
it('18.031 unreadable and absent are the same 404', async () => {
  const a = await world.app.inject({ method: 'GET', url: `/v1/notes/${NOTES.nPrivate}`, headers: world.authOf('member') });
  const b = await world.app.inject({ method: 'GET', url: `/v1/notes/${newUlid()}`, headers: world.authOf('member') });
  expect([a.statusCode, b.statusCode]).toEqual([404, 404]);
  expect(a.body).toBe(b.body);
});
```

and one `it` per remaining case in the same style (18.029 query strings; 18.030 after a `note.deleted` event; 18.032 the ticket notes route; 18.033 attach `nWorkspace` to `TE` and assert `member`'s summary has `attachedTickets: []` while `guest`'s has one; 18.034 after two `note.body_set` events; 18.035 the comments route for `outsider` on `nProject` → 404).

- [ ] **Step 3: Run to verify failure** — 404 on every route (not registered).

- [ ] **Step 4: Implement**

`apps/server/src/read/notes.ts` — the SQL cores from spec §6.4. `listNotes`:

```ts
export async function listNotes(db: Queryable, eff: EffectiveRole, userId: string, workspaceId: string,
  filter: { homeProjectId?: string; authorId?: string; scopeMode?: NoteScopeMode; deleted?: boolean } = {},
): Promise<NoteSummary[]> {
  const params = new SqlParams();
  const clauses = [`n.workspace_id = ${params.add(workspaceId)}`, visibleNotesWhere(eff, userId, params)];
  if (filter.deleted === true) {
    const role = eff.workspaceRole;
    clauses.push('n.deleted = TRUE');
    if (role !== 'owner' && role !== 'admin') clauses.push(`n.author_id = ${params.add(userId)}`);
  } else {
    clauses.push('n.deleted = FALSE');
  }
  if (filter.homeProjectId !== undefined) clauses.push(`n.home_project_id = ${params.add(filter.homeProjectId)}`);
  if (filter.authorId !== undefined) clauses.push(`n.author_id = ${params.add(filter.authorId)}`);
  if (filter.scopeMode !== undefined) clauses.push(`n.scope_mode = ${params.add(filter.scopeMode)}`);
  const { rows } = await db.query<NoteRow>(
    `SELECT n.* FROM proj_notes n WHERE ${clauses.join(' AND ')} ORDER BY n.updated_at DESC, n.note_id`, params.toArray());
  return summariesOf(db, eff, userId, rows);
}
```

`summariesOf` loads, for the listed note ids, the attached tickets joined to `proj_tickets t` and `proj_visibility v` with `LIVE_TICKET_WHERE` and `visibleTicketsWhere(eff, userId, params)`, derives each ticket's `key` and `title` the way `routes/tickets.ts` does (open `titleOf` at `:29` and the key helper it uses), and maps rows to `NoteSummary` (`scope` via the same `scopeOf` as the projection — export it from `projections/notes.ts`). `getNoteDetail` = `listNotes`-style single row + `body` + `schema_version`, returning `null` when the predicate excludes it. `listNotesForTicket` adds `JOIN proj_note_attachments na ON na.note_id = n.note_id AND na.ticket_id = $ticket`. `listNoteHistory` and `getNoteVersionBody` query `events` as spec §6.4; `listNoteComments` mirrors `listTicketComments` (`read/ticket-comments.ts:102`) without the files resolution (Plan 4 adds files when images land in notes).

`apps/server/src/routes/notes.ts`: `export function registerNoteRoutes(app, deps: { pool }, requireSession)`; each handler resolves `eff = await resolveEffectiveRole(deps.pool, request.currentUserId, workspaceId)` (for `/v1/notes/:noteId` routes, first `getNoteStateFromDb` to learn the workspace; absent → 404) and returns `reply.code(404).send(NOT_FOUND_BODY)` whenever the read returns `null`/is unreadable. Register in `app.ts` next to `registerTicketRoutes(app, { pool: deps.pool }, requireSession)` (`:828`).

- [ ] **Step 5: Run to verify pass**, then the whole server suite.

- [ ] **Step 6: Mutations, flip, commit** — as listed per case. Flip `18.028`–`18.035`. Features §15: `- ✅ **Notes can be read back through the API** — list, one note, a ticket's notes, comments, history and a version, every read filtered by the reader predicate; an unreadable note is a 404 identical to an absent one (spec §6.4).`

```bash
git add apps/server test-cases Features.md
git commit -m "Notes 1/Task 6: note reads and routes, 404-for-unreadable (18.028-18.035)"
```

---

### Task 7: app-core — `DataSourceQuery` methods, online mappers, replica gaps

**Files:**
- Modify: `packages/app-core/src/data-source.ts:140-234` (`DataSourceQuery`), `packages/app-core/src/online/mappers.ts` (add `mapNoteSummaries`, `mapNoteDetail`, `mapNoteComments`, `mapNoteVersions`), `packages/app-core/src/online/online-data-source.ts:349` (beside `getTicketComments`), `packages/app-core/src/replica/replica-data-source.ts:591` and `:995` (gap entries), `packages/app-core/src/index.ts` (re-export the note read models from domain if `view-types.ts` is where view types are re-exported — open `:1-10`).
- Test: `packages/app-core/test/online/note-mappers.test.ts`
- Docs: `18.036`–`18.038`

**Interfaces:**
- Consumes: `NoteSummary`, `NoteDetail`, `NoteComment`, `NoteVersion`, `NoteScopeMode` (Task 2 via `@gisik-nokma/domain`); `http.get(path)` returning parsed JSON or `null` on 404; `HttpError`; `asRecord`, `asArray`, `asString`, `MappingError` (`mappers.ts`); `ReplicaGapError` and the `*_ABSENCES` pattern (`replica-data-source.ts:591-597`, `:995`).
- Produces on `DataSourceQuery`:
  - `getNotes(workspaceId: string, filter?: { homeProjectId?: string; authorId?: string; scopeMode?: NoteScopeMode }): Promise<NoteSummary[]>`
  - `getDeletedNotes(workspaceId: string): Promise<NoteSummary[]>`
  - `getNote(workspaceId: string, noteId: string): Promise<NoteDetail | null>`
  - `getNotesForTicket(workspaceId: string, ticketId: string): Promise<NoteSummary[]>`
  - `getNoteComments(workspaceId: string, noteId: string): Promise<NoteComment[]>`
  - `getNoteHistory(workspaceId: string, noteId: string): Promise<NoteVersion[]>`
  - `getNoteVersion(workspaceId: string, noteId: string, eventId: string): Promise<unknown | null>`

  (`searchNotes` is Plan 3's.) The replica implementation rejects each with `ReplicaGapError('<method>', NOTES_ABSENCES)` until Plan 2 fills it; `NOTES_ABSENCES` is a new constant in the style of `COMMENTS_ABSENCES` with the text "Notes are not held locally yet; Plan 2 of the notes series adds the replica tables."

- [ ] **Step 1: Cases**

```markdown
## 18.6 Client data layer

- ❌ **18.036 — `mapNoteSummaries` maps the server's `{ notes: [...] }` shape and refuses a row missing `noteId` with a `MappingError` naming the path.** Mutation: default `noteId` to `''`.
- ❌ **18.037 — `mapNoteDetail` carries `body` through untouched (as `unknown`) and `schemaVersion` as a number.** Mutation: `JSON.stringify` the body.
- ❌ **18.038 — every note method on the replica data source rejects with `ReplicaGapError`** naming the method; control: `getTicketSummary` (or another implemented read) resolves. Mutation: return `[]` from `getNotes`.
```

- [ ] **Step 2: Failing tests** — `packages/app-core/test/online/note-mappers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapNoteDetail, mapNoteSummaries, MappingError } from '../../src/online/mappers.js';

const summary = { noteId: 'n1', workspaceId: 'w', homeProjectId: 'p', authorId: 'u', title: 'T',
  scope: { mode: 'explicit', userIds: ['u2'] }, attachedTickets: [{ ticketId: 't', key: 'SHOP-1', title: 'Tk' }],
  deleted: false, createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:01.000Z' };

describe('18.036 mapNoteSummaries', () => {
  it('18.036 maps a valid row and refuses a row without noteId', () => {
    expect(mapNoteSummaries({ notes: [summary] })).toEqual([summary]);
    const { noteId: _drop, ...bad } = summary;
    expect(() => mapNoteSummaries({ notes: [bad] })).toThrow(MappingError);
    expect(() => mapNoteSummaries({ notes: [bad] })).toThrow(/notes\[0\]\.noteId/);
  });
});
describe('18.037 mapNoteDetail', () => {
  it('18.037 keeps body as-is and schemaVersion numeric', () => {
    const body = { type: 'doc', content: [{ type: 'paragraph' }] };
    const d = mapNoteDetail({ note: { ...summary, body, schemaVersion: 2 } });
    expect(d.body).toBe(body);
    expect(d.schemaVersion).toBe(2);
  });
});
```

And in the existing replica data-source test file (find the one asserting `ReplicaGapError` for `getTicketComments`; add beside it):

```ts
it('18.038 note reads are replica gaps until Plan 2', async () => {
  for (const m of ['getNotes', 'getDeletedNotes', 'getNote', 'getNotesForTicket', 'getNoteComments', 'getNoteHistory', 'getNoteVersion'] as const) {
    await expect((source as any)[m]('w', 'x', 'y')).rejects.toBeInstanceOf(ReplicaGapError);
  }
});
```

- [ ] **Step 3: Run to verify failure** — mappers not exported; TypeScript fails on the missing `DataSourceQuery` members.

- [ ] **Step 4: Implement** — add the seven members to `DataSourceQuery`; in `online-data-source.ts`:

```ts
getNotes: async (workspaceId, filter = {}) => {
  const q = new URLSearchParams();
  if (filter.homeProjectId !== undefined) q.set('home', filter.homeProjectId);
  if (filter.authorId !== undefined) q.set('author', filter.authorId);
  if (filter.scopeMode !== undefined) q.set('scope', filter.scopeMode);
  const suffix = q.size === 0 ? '' : `?${q.toString()}`;
  const raw = await http.get(`/v1/workspaces/${workspaceId}/notes${suffix}`);
  return raw === null ? [] : mapNoteSummaries(raw);
},
getDeletedNotes: async (workspaceId) => {
  const raw = await http.get(`/v1/workspaces/${workspaceId}/notes?deleted=1`);
  return raw === null ? [] : mapNoteSummaries(raw);
},
getNote: async (_workspaceId, noteId) => {
  const raw = await http.get(`/v1/notes/${noteId}`);
  return raw === null ? null : mapNoteDetail(raw);
},
getNotesForTicket: async (workspaceId, ticketId) => {
  const raw = await http.get(`/v1/workspaces/${workspaceId}/tickets/${ticketId}/notes`);
  return raw === null ? [] : mapNoteSummaries(raw);
},
getNoteComments: async (_workspaceId, noteId) => {
  const raw = await http.get(`/v1/notes/${noteId}/comments`);
  return raw === null ? [] : mapNoteComments(raw);
},
getNoteHistory: async (_workspaceId, noteId) => {
  const raw = await http.get(`/v1/notes/${noteId}/history`);
  return raw === null ? [] : mapNoteVersions(raw);
},
getNoteVersion: async (_workspaceId, noteId, eventId) => {
  const raw = await http.get(`/v1/notes/${noteId}/history/${eventId}`);
  return raw === null ? null : asRecord(raw, 'version')['body'];
},
```

Mappers in `mappers.ts` follow `mapTicketComments` (`:818`): `asRecord`/`asArray`/`asString` per field, `scope` validated as `mode ∈ NOTE_SCOPE_MODES` and `userIds` an array of strings only when `explicit`, `attachedTickets` mapped field by field, `body` passed through as `unknown`. Replica: add `NOTES_ABSENCES` and the seven `Promise.reject(new ReplicaGapError(...))` entries.

- [ ] **Step 5: Run to verify pass**: `pnpm turbo run build && cd packages/app-core && pnpm exec vitest run --no-file-parallelism > /tmp/notes1-appcore.log 2>&1; tail -20 /tmp/notes1-appcore.log`; then `pnpm typecheck` (turbo, every package) so every implementer of `DataSourceQuery` compiles — `apps/desktop` and `apps/mobile` construct data sources; if they implement the interface directly, they gain the same gap entries.

- [ ] **Step 6: Mutations, flip, commit** — (18.036) `noteId: asString(row['noteId'] ?? '', …)`; (18.037) `body: JSON.stringify(row['body'])`; (18.038) `getNotes: async () => []`. Flip `18.036`–`18.038`. Features §15: `- ⚙️ **The client data source exposes seven note reads** (\`getNotes\`, \`getDeletedNotes\`, \`getNote\`, \`getNotesForTicket\`, \`getNoteComments\`, \`getNoteHistory\`, \`getNoteVersion\`); the replica rejects them as gaps until Plan 2.`

```bash
git add packages/app-core apps/desktop apps/mobile test-cases Features.md
git commit -m "Notes 1/Task 7: DataSourceQuery note reads, online mappers, replica gaps (18.036-18.038)"
```

---

### Task 8: Server — file attachments' note branch

**Files:**
- Modify: `apps/server/src/routes/attachments.ts:302` (upload), `:532` (download); `apps/server/src/attachments/attachment-repo.ts` (owner columns); a new migration `apps/server/migrations/1790110000000_attachments-note-owner.sql`
- Test: `apps/server/test/attachments/note-owner.test.ts`
- Docs: `18.039`–`18.041`

**Interfaces:**
- Consumes: `canReadNoteById`, `getNoteStateFromDb`, `resolveEffectiveRole`; the existing attachments table (open the migration that created it and `attachment-repo.ts` **before** choosing the column: if the table has a `ticket_id NOT NULL`, the migration relaxes it to nullable and adds `note_id text NULL` with a `CHECK ((ticket_id IS NULL) <> (note_id IS NULL))`; if it already has an owner-kind column, add `'note'` to its check).
- Produces: upload accepts `noteId` instead of `ticketId` (exactly one); download authorises a note-owned attachment by `canReadNoteById`; `listAttachmentsByIds` (used by comment reads) accepts a note owner.

- [ ] **Step 1: Cases**

```markdown
## 18.7 Server — file attachments on notes

- ❌ **18.039 — upload with `noteId` succeeds for the author and is 403 for a non-author reader;** control: upload with `ticketId` is unchanged. Mutation: skip the author check.
- ❌ **18.040 — download of a note-owned attachment is 200 for a reader and 404 for a non-reader** (same body as an unknown id). Mutation: authorise by ticket only.
- ❌ **18.041 — a request naming both `ticketId` and `noteId`, or neither, is 400.** Mutation: prefer `ticketId` silently.
```

- [ ] **Step 2: Failing test** — reuse the notes fixture and the upload test helpers in `apps/server/test/attachments/` (open the existing upload test for the multipart shape and copy it). Three `it`s per the cases; for 18.040 compare the 404 body to the body for `GET /v1/attachments/<newUlid()>`.

- [ ] **Step 3: Run to verify failure** — upload with `noteId` is 400 today.

- [ ] **Step 4: Implement** — the migration per the table's actual shape; in the upload handler, after parsing the owner fields: exactly-one check → 400; for `noteId`: `const note = await getNoteStateFromDb(pool, noteId)`; 404 if null; `eff = resolveEffectiveRole(...)`; allowed when `note.authorId === userId || eff.workspaceRole === 'owner' || (eff.workspaceRole === 'admin' && await canReadNoteById(pool, userId, noteId))`, else 403. In the download handler, branch on the stored owner: ticket → existing `canSee`; note → `canReadNoteById`, 404 on false.

- [ ] **Step 5: Run to verify pass**, then the whole server suite.

- [ ] **Step 6: Mutations, flip, commit.** Features §15: `- ⚙️ **Files uploaded into a note are owned by the note** — upload needs author/admin-reader/owner, download needs a reader (spec §4.4).`

```bash
git add apps/server test-cases Features.md
git commit -m "Notes 1/Task 8: note-owned file attachments (18.039-18.041)"
```

---

### Task 9: Plan close — full gate, PR

- [ ] **Step 1:** `pnpm turbo run build && pnpm test > /tmp/notes1-all.log 2>&1; tail -40 /tmp/notes1-all.log` (turbo runs every package's vitest) — every package green; `pnpm typecheck` green; `pnpm check:citations`, `pnpm check:migrations`, `pnpm verify:projections` (against the test DB seeded by the projection tests, or the tool's own harness) green. Reap orphaned vitest workers at `ppid=1` only, if any.
- [ ] **Step 2:** Re-read `Features.md` §15 and `test-cases/18-notes.md` against the tree: every `✅` has a citing test (`grep -rn "18\.0[0-9][0-9]" apps packages --include=*.test.ts* | wc -l` ≥ 41).
- [ ] **Step 3:** Write the PR body to a lane-unique path (`/tmp/notes1-pr-<you>.md`): what landed (Tasks 1–8), the case block used, the suite summary lines with `NODE=`, the one open deviation (admins, spec §4.2), and that Plans 2–6 follow. End with the attribution line. Then: `bash scripts/ctl/ctl pr open task/notes-1-backend-core --repo <worktree> --base release/notes --title "Notes 1/6: backend core — entity, permissions, projections, reads" --body /tmp/notes1-pr-<you>.md`. Confirm `gh pr view --json headRefOid` equals `git rev-parse HEAD`.

---

## Self-review against the spec

- **§2 types** → Task 2 (state, scope, read models). **§3.1–3.4** → Tasks 1–2. **§3.5** (`docToPlainText` for new nodes) → deferred to Plan 4 with the nodes themselves; stated in the file map's absence on purpose. **§4.1–4.3** → Tasks 4–5. **§4.4** → Task 8. **§5** → Plan 2. **§6.1–6.3** → Task 3. **§6.4** → Tasks 6–7 (`searchNotes` → Plan 3). **§7** → Plan 3. **§8** → Plan 4. **§9** → Plan 5. **§10** → Plan 6. **§11.1–11.6** → Tasks 2–8 (11.4 sync → Plan 2).
- **Names used across tasks:** `applyNoteEvent`, `NoteState`, `EMPTY_NOTE_DOC` (T2) ← T3, T4; `getNoteStateFromDb`, `notesProjection` (T3) ← T4, T5, T6, T8; `canReadNote`, `loadNoteForVisibility`, `canReadNoteById` (T4) ← T5, T6, T8; `visibleNotesWhere` (T4) ← T6; `NoteSummary` etc. (T2) ← T6, T7. Consistent.
- **Deviation carried from the spec:** admins edit only notes they can read (`isAdminReader`), flagged for the owner in the PR body.

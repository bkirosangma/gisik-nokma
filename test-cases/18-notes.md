# §18 — Notes

**Opened 2026-09-23 by Plan 1 of the notes series** (`docs/superpowers/plans/2026-09-23-notes-1-backend-core.md`;
spec `docs/superpowers/specs/2026-09-23-notes-design.md`).

## THE ID SHAPE

§18 is uniformly 3-digit padded: `18.001`–`18.999`, following §17's ruling. Blocks are allocated per plan
in the table below. Take from your block, never from the tip.

| Plan | Block |
|---|---|
| 1 Backend core | `18.001`–`18.060` |

**Write cases as `- ❌ **18.001 — …**` id LINES.** The guard (`scripts/check-case-ids.mjs`) counts id LINES and
nothing else; four spellings are invisible to it (a markdown **table row**, a **`##` heading**, a **backticked**
id inside the bold, and **two ids in one sentence**). After adding cases, confirm the count moved by EXACTLY
the number you added — an unchanged count has reported a clean sweep over cases it never saw.

## 18.1 Domain

- ✅ **18.001 — `note` is an entity kind.** `ENTITY_KINDS` contains `'note'` and `entitySchema` accepts `{ kind: 'note', id }`; control: `{ kind: 'notebook' }` is refused.
- ✅ **18.002 — `noteCreatedPayload` refusals.** Refuses: empty title; `inherit` without `attachTicketId`; `project` scope with `homeProjectId: ''`; `explicit` with empty `userIds`; `userIds` on a non-explicit mode. Accepts the minimal valid payload (control).
- ✅ **18.003 — `comment.added` parses against a `note` entity and against a `ticket` entity;** control: `note.renamed` against a `ticket` entity is refused with `entity-kind-mismatch`.

- ✅ **18.004 — `note.created` builds the state:** author = actor, body = payload body, attached = `[attachTicketId]`, `scopeBeforeInherit = null`, `deleted = false`, `lastBodyEventId` = the event id. Mutation: drop `attachTicketId` handling.
- ✅ **18.005 — detach rule, remembered scope** (spec §3.4 example 1): final scope `project`. Mutation: return `private` unconditionally.
- ✅ **18.006 — detach rule, born in inherit** (spec §3.4 example 2): final scope `private`. Mutation: keep `inherit`.
- ✅ **18.007 — explicit remembered with its `userIds`:** `explicit [A,B]` → `inherit` → last detach → `explicit [A,B]`. Mutation: drop `userIds`.
- ✅ **18.008 — a detach that is not the last keeps `inherit`.** Mutation: revert on every detach.
- ✅ **18.009 — `scope_set` to a non-inherit mode clears `scopeBeforeInherit`.** Mutation: keep it.
- ✅ **18.010 — each refusal in spec §3.3 throws; a control valid event does not.** Mutation: remove one precondition.
- ✅ **18.011 — `note.attached` is idempotent.** Mutation: push the duplicate.
- ✅ **18.012 — `note.moved` to `''` under `project` scope throws.** Mutation: allow it.
- ✅ **18.013 — `EMPTY_NOTE_DOC` deep-equals `emptyDoc()` from `packages/editor`.** Mutation: change a key in either.
- ✅ **18.014 — every event sets `updatedAt` to the envelope's `serverTime` and `seq` to its `seq`.** Mutation: skip `updatedAt` on `note.renamed`.

## 18.2 Server — storage

- ✅ **18.015 — `proj_notes` is a pure function of the events:** after applying the §3.4 example-1 sequence, the row has `scope_mode='project'`, `pre_inherit_mode IS NULL`, two attachment rows then none; `verifyProjections` reports clean. Mutation: write `scope_mode` from the payload instead of the reducer's state.
- ✅ **18.016 — `rebuildProjection('proj_notes')` reproduces identical rows** (reset + replay). Mutation: skip `reset`.
- ✅ **18.017 — `comment.added` on a note lands in `proj_note_comments`** with `note_id` = entity id and `comment_id` = event id; control: a ticket comment still lands in `proj_ticket_comments` only. Mutation: drop the note branch.
- ✅ **18.018 — `schema_version` is read from `body.attrs.schemaVersion`,** default 1 when absent. Mutation: hard-code 1.
- ✅ **18.019 — `getNoteStateFromDb` round-trips a state** through the row and back (`toEqual` the reducer's state). Mutation: drop `scopeBeforeInherit` from `rowToNoteState`.

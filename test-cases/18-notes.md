# §18 — Notes

**Opened 2026-09-23 by Plan 1 of the notes series** (`docs/superpowers/plans/2026-09-23-notes-1-backend-core.md`;
spec `docs/superpowers/specs/2026-09-23-notes-design.md`).

## THE ID SHAPE

§18 is uniformly 3-digit padded: `18.001`–`18.999`, following §17's ruling. Blocks are allocated per plan
in the table below. Take from your block, never from the tip.

| Plan | Block |
|---|---|
| 1 Backend core | `18.001`–`18.060` — **minted: `18.001`–`18.042`**, so the next plan takes the table's next row or continues at `18.043` if it is drawn from this block |
| 2 Sync | `18.061`–`18.120` |

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

## 18.3 Server — who may read a note

- ✅ **18.020 — `canReadNote` implements spec §4.1** for every (scope × relationship) cell of the fixture: 5 notes × 7 users. Mutation: flip the `guest` arm of `workspace`.
- ✅ **18.021 — `visibleNotesWhere` returns exactly the notes `canReadNote` accepts,** asserted per user on the same fixture. Mutation: change the `project` arm to ignore project membership.
- ✅ **18.022 — an `inherit` note is readable through ANY one attached visible ticket** (union), and not readable when every attached ticket is invisible or deleted. Mutation: require all.
- ✅ **18.023 — the owner reads every note; the author reads their own private note; a non-member reads nothing.** Mutation: drop the author arm.

## 18.4 Server — who may write which note event

- ✅ **18.024 — the matrix of spec §4.2**: every note event × {author, reader-member, non-reader-member, guest-listed, admin-reader, admin-non-reader, owner} refuses or allows exactly as the table says. Mutation: flip one cell.
- ✅ **18.025 — `note.created` refuses a guest, refuses a project home the actor is not on, and requires ticket visibility for `attachTicketId`.** Control: a member on the project creates. Mutation: drop the project-membership check.
- ✅ **18.026 — `note.attached` requires BOTH reading the note AND seeing the ticket;** a reader who cannot see the ticket is refused, a ticket-viewer who cannot read the note is refused. Mutation: drop either half.
- ✅ **18.027 — refusals carry rule `permission.note` and a plain-language reason;** `note.created` by a guest carries `permission.role` (the role check fires first). Mutation: use the visibility rule id.

## 18.5 Server — reads

- ✅ **18.028 — `GET …/notes` returns exactly the readable, non-deleted notes for each fixture user,** newest `updated_at` first. Mutation: drop `visibleNotesWhere`.
- ✅ **18.029 — `?home=`, `?author=`, `?scope=` filters narrow the list;** control: no filter returns the superset. Mutation: ignore `scope`.
- ✅ **18.030 — `?deleted=1` returns deleted notes only to the author, an admin-reader or the owner;** a member sees `[]`. Mutation: return them to any reader.
- ✅ **18.031 — `GET /v1/notes/:id` is 404 with the same body for an unreadable note and for a random id.** Mutation: 403 for unreadable.
- ✅ **18.032 — `GET …/tickets/:id/notes` omits notes the viewer cannot read** (D5): `guestListed` sees `nInherit` on `TE`; `memberIn` does not. Mutation: drop the predicate.
- ✅ **18.033 — `attachedTickets` in a summary omits tickets the viewer cannot see.** Mutation: drop `visibleTicketsWhere` from the join.
- ✅ **18.034 — history lists `note.created` and every `note.body_set` in order; the version body is that event's payload body.** Mutation: include `note.renamed`.
- ✅ **18.035 — comments are returned in `workspace_seq` order only to readers.** Mutation: skip the readability check.

## 18.6 Client data layer

- ✅ **18.036 — `mapNoteSummaries` maps the server's `{ notes: [...] }` shape and refuses a row missing `noteId` with a `MappingError` naming the path.** Mutation: default `noteId` to `''`.
- ✅ **18.037 — `mapNoteDetail` carries `body` through untouched (as `unknown`) and `schemaVersion` as a number.** Mutation: `JSON.stringify` the body.
- ✅ **18.038 — every note method on the replica data source NOW ANSWERS** (Plan 2 landed the tables and the implementations), and `REPLICA_GAPS` no longer lists any of the seven; controls: `getTicketSummary` still resolves, and `search` still refuses — so "the note reads were implemented" is distinguishable from "the gap machinery was switched off". *(Was Plan 1's "rejects with `ReplicaGapError` until Plan 2"; inverted rather than deleted, per the same rule `client-contract.test.ts` used for `scope-revoked` — a divergence that closed can silently re-open.)* Mutation: list a note read in `REPLICA_GAPS` again.

## 18.7 Server — file attachments on notes

- ✅ **18.039 — upload with `noteId` succeeds for the author and is 403 for a non-author reader;** control: upload with `ticketId` is unchanged. Mutation: skip the author check.
- ✅ **18.040 — download of a note-owned attachment is 200 for a reader and 404 for a non-reader** (same body as an unknown id). Mutation: authorise by ticket only.
- ✅ **18.041 — a request naming both `ticketId` and `noteId`, or neither, is 400.** Mutation: prefer `ticketId` silently.
- ✅ **18.042 — `note.created` refuses a `homeProjectId` no project was founded under, even for the owner and even when the actor holds a forged membership on it** (spec §3.3's existence precondition); control: a real project is accepted. Mutation: drop the `note.created` case from `projectsNamedBy`.

## 18.8 Sync — server

- ✅ **18.061 — `audienceClassOf('note')` is `'note'` and every switch over `AudienceClass` compiles with the arm** (the build is the test); control: `'invite'` is still `'admin'`. Mutation: return `'withheld'`.
- ✅ **18.062 — a note event reaches a reader and not a non-reader:** on the notes fixture, `visibleEventsFor` for `memberIn` yields the `note.created` of `nWorkspace` and not of `nPrivate`; for `author` both. Mutation: drop the `canReadNote` guard.
- ✅ **18.063 — a grant trigger precedes its event with a `reach-granted` notice carrying `notes: [{ id, headSeq }]`:** after `note.scope_set` widens `nPrivate` to `workspace`, `memberIn`'s drain yields `{ kind: 'reach-granted', notes: [{ id: nPrivate, headSeq: <that event's workspace_seq> }] }` immediately before the `note.scope_set` envelope; control: a `note.renamed` (not a trigger) yields no notice. Mutation: remove `note.scope_set` from `NOTE_GRANT_TRIGGERS`.
- ✅ **18.064 — the notice is emitted once per drain** (`backfilled`): two triggers on the same note in one drain produce one notice. Mutation: skip the `backfilled` check.
- ✅ **18.065 — the hub forwards `notes` on the `reach-granted` frame unchanged.** Mutation: drop the field in `drain`.
- ✅ **18.066 — a `comment.added` filed against a note follows the note's audience, not the ticket rule.** Mutation: route note comments through the ticket branch.
- ✅ **18.067 — a ticket grant trigger also announces inherit notes attached to that ticket (and to its `audienceDependents`) that the user can now read:** `visibility.set` on `TE` to `workspace` makes `memberIn` read `nInherit`; the drain yields a `reach-granted` whose `notes` contains `nInherit` before the `visibility.set` envelope. Mutation: skip `notesAttachedTo`.
- ✅ **18.068 — a ticket the user still cannot see grants nothing for its notes** (control in the same `it`): `visibility.set` on `TE` to `explicit [guestListed]` again yields no note notice for `memberIn`. Mutation: drop the `canReadNote` filter inside `noteGrantNoticeFor`.
- ✅ **18.069 — a project-scope or explicit note attached to the ticket is NOT announced by a ticket trigger** (it does not depend on the ticket). Mutation: drop the `scope_mode = 'inherit'` clause.
- ✅ **18.070 — `heldNoteIds` are answered by `canReadNoteById`:** presenting `[nPrivate, nWorkspace]` as `memberIn` returns `restrictedNotes: [{ id: nPrivate }]`; control: `heldIds` still answers tickets. Mutation: answer notes with `canSee`.
- ✅ **18.071 — an unknown note id is restricted.** Mutation: skip unknown ids.
- ✅ **18.072 — a body without `heldNoteIds` is still valid and returns `restrictedNotes: []`** (old clients). Mutation: make the field required.
- ✅ **18.073 — the note events route returns the note's full ledger in `seq` order to a reader and 404 to a non-reader** (same body as an unknown id). Mutation: skip the readability check.
- ✅ **18.074 — the workspace bootstrap carries the events of every readable note and none of an unreadable one.** Mutation: include all notes.
- ✅ **18.075 — the route's `LedgerEventView` shape equals the one `GET /v1/tickets/:id/events` (or the existing ticket bootstrap) returns** — same field names, so the client's one parser reads both. Mutation: rename `workspace_seq`.

## 18.9 Sync — client

- ✅ **18.076 — `migrateLocal` on a version-1 database adds `notes` and `note_comments` and leaves every existing table's columns unchanged** (`PRAGMA table_info` before/after equal for `tickets`). Mutation: add a column to `tickets`.
- ✅ **18.077 — applying a note's events folds a `notes` row equal to `applyNoteEvent`'s state** (the §3.4 example-1 sequence → scope `project`, attachments `[]`). Mutation: fold from the last event only.
- ✅ **18.078 — `comment.added` on a note lands in `note_comments` and does not touch `notes.seq`;** control: a ticket comment does not touch `note_comments`. Mutation: fold comments into the note row.
- ✅ **18.079 — `purgeEntity(noteId)` removes the note's `events`, `notes` row and `note_comments`, and leaves the outbox** (the existing rule). Mutation: skip `note_comments`.
- ✅ **18.080 — `revokeScope` (workspace) removes only that workspace's notes.** Mutation: delete unscoped.
- ✅ **18.081 — `loadNoteEvents` is idempotent:** loading the same events twice leaves one row per event and the same `notes` row. Mutation: `INSERT` without `OR IGNORE`.
- ✅ **18.082 — `listNotesForTicket` returns the notes whose `attached_ticket_ids` JSON contains the ticket.** Mutation: match on `home_project_id`.
- ✅ **18.083 — a `reach-granted` with `notes` queues a note pull when the local head is behind, and not when it is current.** Mutation: always queue.
- ✅ **18.084 — `drainPendingPulls` pulls a queued note through `bootstrapNote`, loads its events, clears the entry, and fires `onPullApplied({ kind: 'note', id })`.** Mutation: skip the listener.
- ✅ **18.085 — a 404 on a note pull drops the entry if unchanged, as for tickets.** Mutation: retry forever.
- ✅ **18.086 — `runReconcile` presents every held note id and purges each `restrictedNotes` entry;** control: ticket purges unchanged. Mutation: present tickets only.
- ✅ **18.087 — an in-process fake transport records exactly one `bootstrapNote` call for a note a single notice names twice, and none on a catch-up after it is satisfied.** Mutation: `addPendingPulls` appends instead of superseding. *(Re-scoped from "per catch-up": `applyOne` drains after EVERY `reach-granted` frame by design, so two notices naming two different heads legitimately cost two pulls. Recorded in the SDD ledger.)*
- ✅ **18.088 — the seven note reads answer from the replica** on a seeded fixture (`createReplica` + `loadBootstrap` + `loadNoteEvents`), with `NoteSummary`/`NoteDetail` shapes equal to the online mapper's for the same events. Mutation: drop `attachedTickets`.
- ✅ **18.089 — `attachedTickets` omits a ticket the replica does not hold.** Mutation: emit the id with an empty key.
- ✅ **18.090 — `getNoteHistory` lists `note.created` and each `note.body_set`, in order; `getNoteVersion` returns that body.** Mutation: include `note.renamed`.
- ✅ **18.091 — `subscribe` forwards `onPullApplied` as a `refresh` frame; control: `event` frames still pass.** Mutation: swallow it.
- ✅ **18.092 — `useLiveQuery` refetches on a `refresh` frame** (mutation: ignore it) **and still ignores `caught-up`** (control).
- ✅ **18.093 — reach lost by scope change:** A (author) creates a workspace note; B syncs and holds it; A sets it private; after B's next catch-up + reconcile, B's replica has no `notes` row, no `note_comments`, no `events` for it. Mutation: skip reconcile.
- ✅ **18.094 — reach lost by the last detach:** an inherit note attached only to a ticket B can see; A detaches it; B's replica drops the note after reconcile (it reverted to private). Mutation: keep it.
- ✅ **18.095 — reach gained by scope change:** A's private note with three body saves; A widens to workspace; B's replica holds the note's whole ledger (`note.created` + three `note.body_set`, plus the widening itself) after the pull. Mutation: skip the pull.
- ✅ **18.096 — the ticket cascade:** an inherit note attached to ticket T that only A can see; A sets T's visibility to workspace; B's replica gains the note; A sets T back to explicit `[A]`; after reconcile B's replica drops it. Mutation: skip `notesAttachedTo`.
- ✅ **18.097 — restore re-delivers:** A deletes, B's replica marks `deleted` (the event arrives); A restores; B's row is live again. Mutation: the reducer's restore arm keeps `deleted` (so the row stays deleted). *(The plan's named mutation — dropping `note.restored` from `NOTE_GRANT_TRIGGERS` — was run and SURVIVED, because a device that never lost the note receives the restore on the ordinary stream. See the SDD ledger for why the scenario the plan asks for is not constructible.)*

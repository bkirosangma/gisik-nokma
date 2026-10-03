# MCP sweep 2: capabilities the app has and the MCP lacks — design

**Date:** 2026-10-03.

| | |
|---|---|
| **Status** | Owner-reviewed 2026-10-03. The owner answered "yes" to the five capabilities, deferred two more (§10), and ruled on the open questions (ruling 11 and the planner defaults, §13). Every requirement below is drafted from the code; what is still open is in §13. |
| **Base** | `origin/release/knowledge-graph` @ `4cc486ca`, where every citation was read. The plan re-reads each one. |
| **Target** | A NEW release branch after the Knowledge Graph release (not that one). One release branch at a time, so this spec lands as a docs file in `release/knowledge-graph` and the code waits for the next release branch, which the owner cuts. |
| **Depends on** | Nothing. It is independent of the drafts spec and the workflow/timeline spec, and of the Knowledge Graph series (specs A–E). It shares test pins with them (§8.5). |
| **Owner rulings** | The five capabilities (§2); `assignee_email` "WITH a confirmation step" (§7); ruling 11: `assignee_email` on `create_ticket` too, `close_tickets` previews first, the confirmation says when a person is ADDED AS A GUEST, and `list_saved_filters` (§6.6); contests and `update_profile` deferred (§10); rule D2, restated in the Knowledge Graph series: every MCP write is visible in the app, attributed, and removable by a member (§9). |
| **Catalogue** | `test-cases/14-mcp-server.md`, **14.600–14.659** (§12.1). `Features.md` §14. |

## 1. What exists today

**The registry.** `allTools` (`packages/mcp-server/src/tools/register.ts:27`) concatenates twelve factories into **63 tools**. Their names and order are pinned in `packages/mcp-server/test/fixtures/tool-names.ts` and again, spelled out, in `register.test.ts:87-108` (`toHaveLength(63)`, case 14.555). Both doors (stdio and the hosted `/mcp`) register through it. A tool is `ToolDefinition { name; description; inputSchema (a zod raw shape); handler }` (`read-tools.ts:8-13`).

**Writes** go through `envelopeFor` (`submit.ts:62-83`: actor is the session user, `origin: 'mcp'`) and then `submitOne` (`:20-36`) or `submitBatch` (`:46-56`). Both throw a refusal in the server's own words (`refused by <rule>: <reason>`). `submitBatch` throws at the FIRST refused result, after the earlier events have already committed (§5.2).

**Confirmation.** Admin and high-impact tools answer a preview unless a parameter equals a value read at call time (`preview.ts:17-25`, `confirmOrPreview`; `directory.ts:10-12` says why nothing is cached). The preview is a successful answer: `{ preview: true, wouldChange, counts, nothingChanged: true, confirm }`.

**Reads** call the product's own HTTP routes, so the product's visibility rules apply unchanged; a 404 becomes the uniform "… not found or not visible to you" (`reads.ts:5-13`).

**The five capabilities today:**

| Capability | In the app | In the MCP |
|---|---|---|
| A ticket's attached notes | The ticket sheet's Notes section (`packages/app-core/src/views/ticket-notes-section.tsx:37`), fed by `GET /v1/workspaces/:ws/tickets/:id/notes` (`apps/server/src/routes/notes.ts:87-96`) | `get_ticket` (`read-tools.ts:149-171`) returns the server's ticket detail and the description as Markdown. No notes. `get_note` shows the reverse (`attachedTickets`). |
| Restore a note version | History panel, **Restore** (`apps/web/src/notes/history-panel.tsx:164-174`) → `note.body_set` (`note-document.tsx:836-848`) | `get_note_history` lists versions, and a version's body as **Markdown** (`note-tools.ts:194-209`). Nothing writes it back. |
| Bulk close | `BulkCloseDialog` (`packages/app-core/src/views/bulk-close-dialog.tsx:126-286`); List "Bulk close" then "Confirm close (N)" (`Features.md:75`) | `close_ticket`, one ticket (`ticket-tools.ts:105-117`). |
| Notification preferences | Account → Notifications (`packages/app-core/src/account/notifications-section.tsx:60-93`), `GET/PUT /v1/me/notification-preferences` (`routes/notification-preferences.ts:25-56`) | `list_notifications`, `mark_notifications_read` only (`discovery-tools.ts:65-77`, `:79`). |
| Saved filters | The project page's saved views, kept in the per-user preferences document (`GET/PUT /v1/me/preferences?workspaceId=`, `apps/server/src/routes/preferences.ts:96-139`; `savedFilters` up to 50, `packages/domain/src/preferences.ts:112-118`) | Nothing. `list_tickets` takes a `filter` (`read-tools.ts:21`) but the saved ones cannot be read. |
| Assign by email | The "Assign someone outside this workspace…" arm: `OutsiderFinder` (`views/outsider-finder.tsx:36-120`) → `POST …/people-lookup`, then `POST …/assign-outsider` for a person outside (`routes/people.ts:112-221`; `views/ticket-sheet.tsx:1482-1499`, `:3172-3179`) | `assign_ticket` takes a userId only (`write-tools.ts:134-155`), and so does `create_ticket` (`:25-91`, `"me"` or an id). |

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| S2-1 | The changes: `get_ticket` gains `notes`; new `restore_note_version`; new `close_tickets`; new `get_notification_preferences` and `set_notification_preferences`; `assign_ticket` and `create_ticket` gain `assignee_email` with a two-call confirmation; new `list_saved_filters` (ruling 11d). | Owner, 2026-10-03: "yes"; ruling 11. |
| S2-2 | Deferred, out of scope: contests, `update_profile` (§10). | Owner. |
| S2-3 | Notification preferences are TWO tools, a read and a write, as the house keeps reads and writes apart (`list_*` / `update_*`). | Planner's call; the owner said "get/set". |
| S2-4 | `restore_note_version` writes the stored document verbatim and never goes through Markdown. | Planner's call (§4.1). |
| S2-5 | `close_tickets` PREVIEWS first through `confirmOrPreview`, with the ticket count as the confirm value (`confirm_count`). It is capped at 100 tickets, reports each ticket's outcome, and a close is undone by `reopen_ticket`. | Owner, ruling 11b (was Q2). |
| S2-6 | The `assignee_email` confirmation is stateless: a second call with `confirm_assignee` set to the resolved person's userId, re-resolved at call time. No token store. | Planner's call (§7.3). |
| S2-7 | Resolution by email uses the app's own lookup route, not the roster. | Follows from §7.1. |
| S2-8 | `create_ticket` takes `assignee_email` with the same two-call confirmation; call 1 creates nothing. | Owner, ruling 11a (was Q1). |
| S2-10 | The confirmation text says in so many words when the person will be ADDED AS A GUEST (§7.3, AE-17). | Owner, ruling 11c. |
| S2-11 | `list_saved_filters` is read-only and returns the saved filters only, not list columns or grouping. | Owner, ruling 11d; scope is the planner's. |
| S2-9 | Argument names: `assignee_email` as the owner wrote it; `confirm_assignee` follows `confirm_name`. Every other argument is camelCase, as in the house. | Owner's word and house style. |

## 3. `get_ticket` returns the ticket's attached notes

### 3.1 What it wraps

`GET /v1/workspaces/:workspaceId/tickets/:ticketId/notes` (`routes/notes.ts:87-96`) answers `listNotesForTicket` (`apps/server/src/read/notes.ts:247-270`): the notes attached to the ticket that THIS viewer may read, not deleted, whose home project is live. It is the query behind the sheet's Notes section. Its docblock records the owner's decision D5: a note the viewer cannot read is simply ABSENT, with no locked badge and no count of hidden notes (`read/notes.ts:242-246`).

This is the **attached** relation (`note.attached`, `proj_note_attachments`). It is not the structured references of the reference index (Knowledge Graph spec B) and not the typed links of spec A; those arrive as `linkedFrom` and `links` and are specified there.

### 3.2 Schema

Input is unchanged: `{ workspaceId, ticketId }`.

Output gains two members, beside the existing ones (`ticket`, `ticketState`, `title`, `stateProvenance`, `assignedProvenance`, `parent`, `rollup`, `key`, `epic`, `description`; none is named `notes`, `tickets.ts:700-710`):

```ts
notes:      { noteId: string; title: string; authorId: string; updatedAt: string }[]  // newest-updated first, at most 50
notesTotal: number                                                                    // readable attached notes; may exceed notes.length
```

The projection is a trim of `NoteSummary` (`packages/domain/src/read-models.ts:883-894`). A caller who wants the body, scope or filing calls `get_note`. The names `notes` and `notesTotal` are distinct from spec A's `links` and spec B's `linkedFrom`, so the three specs add members to the same reply without a collision.

### 3.3 Requirements

- **GT-1.** `get_ticket` calls the notes route only AFTER the ticket read succeeded. A ticket the caller cannot see answers `ticket not found or not visible to you` and the notes route is never called (the notes route does not itself check the ticket, `routes/notes.ts:90-94`; the ticket route does, `tickets.ts:372-374`).
- **GT-2.** `notes` equals what the notes route returns for the same viewer, trimmed as in §3.2 and cut at 50. `notesTotal` is the route's length.
- **GT-3.** Authz is the route's: an attached note the viewer cannot read is absent from `notes` and from `notesTotal`. There is no "N hidden" member.
- **GT-4.** A deleted note is absent; after `restore_note` it is back (the route filters `n.deleted = FALSE`, `read/notes.ts:258`).
- **GT-5.** A failure of the notes read (anything but success) fails the whole call. It never returns the ticket with `notes: []`, because an empty list would read as "no notes".
- **GT-6.** The tool description says what `notes` is (attached notes the caller can read) and that the full note comes from `get_note`.

### 3.4 Events

None (a read).

## 4. `restore_note_version(noteId, versionId)`

### 4.1 What it wraps

The History panel's Restore: it reads one version's stored body and writes `note.body_set { body }` with that body (`history-panel.tsx:164-174` → `note-document.tsx:838-846`). A version is a ledger event (`note.created` or `note.body_set`); `versionId` is its event id, as listed by `GET /v1/notes/:id/history` (`routes/notes.ts:117-130`, `read/notes.ts:324-343`) and read by `GET /v1/notes/:id/history/:eventId` (`routes/notes.ts:189-204`, `read/notes.ts:355-370`).

**The body is copied, never converted.** `get_note_history` with a `versionId` answers Markdown, and Markdown drops what it cannot carry (`note-tools.ts:203`, `lossy`). Writing that back would lose it. This tool reads the raw `{ body }` from the history route and submits it as it is.

### 4.2 Schema (house style: `note-tools.ts`)

```ts
inputSchema: { noteId: id, versionId: id }
// reply
{ noteId, restoredFrom: versionId, restored: true,  ...committedResult }
{ noteId, restoredFrom: versionId, restored: false, reason: 'already the current body' }
```

`versionId` comes from `get_note_history`. The description says so, and says the body is restored exactly (no Markdown involved).

### 4.3 Authz

The same as the app, through the server's gate. `note.body_set` is in `NOTE_AUTHOR_EVENTS` (`permissions/check-permission.ts:1479-1493`), so only the note's author, an admin who can read it, or the workspace owner may restore (`:1569-1575`); the refusal is `permission.note`, "Only the note's author, an admin who can read it, or the workspace owner can change it." (`:1464-1465`), passed on verbatim by `submitOne`. The app's own button follows the same rule (`note-document.tsx:528-531`). A note the caller cannot read, and a `versionId` that is not a version of it, answer the uniform `note not found or not visible to you` / `note version not found or not visible to you` (the existing wording, `note-tools.ts:17`, `:205`).

### 4.4 Events

Exactly one: `note.body_set { body }` on the note's stream, via `envelopeFor` (actor = the session user, `origin: 'mcp'`). No rename, scope or move event. The restore appears in the note's History as the newest version, because `listNoteHistory` lists every `note.body_set` (`read/notes.ts:324-343`). The version it replaced stays in History, so a restore is itself undone by restoring that version.

Side effects the server already has, which the tool does not suppress:
- the mention fan-out compares the new body with the previous version and notifies only mentions the restore ADDS (`notifications/fanout.ts:221-232`, `:370-379`); restoring an old version can therefore notify people it mentions;
- the search index and embeddings re-run (`search/nudge.ts:40`).

### 4.5 Requirements

- **RV-1.** The submitted `body` is deep-equal to the version's stored `payload.body`, including content Markdown cannot carry (a highlight or colour mark). The control, in the same `it`, is `update_note` with the version's Markdown, which loses it.
- **RV-2.** `versionId` must be one of the note's listed versions (`/history`). Any other id, including the id of a `note.renamed` event, answers the uniform version-not-found, and nothing is written.
- **RV-3.** A listed version that was born without a body (`note.created` with no `body`) is restored as `EMPTY_NOTE_DOC` (`packages/domain/src/note-state.ts:64-68`), the document the reducer folds in for it (`:139`). The history-body route answers 404 for such a version, because `getNoteVersionBody` returns `null` (`read/notes.ts:369`, `routes/notes.ts:200-201`); the tool tells the two cases apart by the version being in the list (RV-2). The app does not handle this case (Q4).
- **RV-4.** If the version's body equals the note's current body, nothing is written and the reply is `restored: false`. (Both sides are `jsonb`, `proj_notes.body` (`migrations/1790100000000_proj-notes.sql:52`) and `payload -> 'body'` (`read/notes.ts:361`), so their key order agrees; the test pins it.)
- **RV-5.** A deleted note is refused before any write, with a sentence naming `restore_note`. The reducer refuses every note event but `note.restored` on a deleted note (`note-state.ts:153-159`), and the app makes a deleted note read-only for everyone (`note-document.tsx:532-540`).
- **RV-6.** A refusal is the gate's own words. The role matrix is tested through the hosted door: author, admin who can read, and owner succeed; a plain member who is not the author is refused with the verbatim `permission.note` sentence.
- **RV-7.** The batch is one event. The title, scope, filing and attachments of the note are unchanged.

## 5. `close_tickets(workspaceId, ticketIds)`

### 5.1 What it wraps

`BulkCloseDialog`'s write: N plain `ticket.closed` events, one per ticket, in ONE ingest batch, with the answer read BY INDEX (`bulk-close-dialog.tsx:189-231`; backlog/closed spec §8.3: "one per ticket; there is no 'bulk' event type and no server-side bulk endpoint", `docs/superpowers/specs/2026-09-17-backlog-and-closed-design.md:478-480`). The engine decides each one on its own: `checkTicketClosed` refuses a ticket that is already closed (`already-closed`), not in a terminal state (`close-requires-terminal`) or with open children (`parent-terminal`) (`packages/rule-engine/src/checks/close.ts:46-78`).

### 5.2 Why it cannot use `submitBatch`

`POST /v1/events` takes at most `MAX_BATCH_SIZE = 100` events (`routes/events.ts:4`, schema `:94`) and commits each event in its own transaction: a refusal in the middle of a batch "leaves its committed neighbours committed and lets the events after it be judged on their own" (`ingest/ingest-service.ts:331-340`). `submitBatch` throws at the first refusal (`submit.ts:46-56`), so a bulk close built on it would report an error while the other tickets had closed. The tool needs a by-index reader (PL-2) that returns every outcome, as the dialog does.

### 5.3 Schema

```ts
inputSchema: { workspaceId: id, ticketIds: z.array(id).min(1).max(100),
               confirm_count: z.union([z.string(), z.number().int()]).optional() }
// without the exact count: a PREVIEW, nothing sent (§5.7)
// with it, the reply (never an error for a per-ticket refusal)
{
  closed:  number,
  refused: number,
  results: Array<
    | { ticketId, status: 'closed',  eventId, seq }
    | { ticketId, status: 'refused', rule, reason }       // the server's words, unchanged
    | { ticketId, status: 'invalid', code, message }
  >                                                       // same order as ticketIds
}
```

There is no `comment` parameter (the dialog has none; `close_ticket` keeps its own).

### 5.7 The preview (ruling 11b)

The app confirms in a dialog that lists every title and closes only on "Close N tickets" (`bulk-close-dialog.tsx:244-283`). The tool does the same in two calls, through `confirmOrPreview` (`preview.ts:17-25`) with the count as the confirm value: the expected string is `String(ticketIds.length)`, compared exactly (`"03"`, `"3 "` and `3.5` are not `3`), and the `confirm` sentence reads `confirm_count must be "3"` (the parameter name is PL-3's fourth argument).

```ts
{ preview: true,
  wouldChange: 'Closes 3 tickets: CCSO-4 "Fix login", CCSO-9 "Rate limits", and one you cannot see (01J…). The server decides each close; a ticket that is not in a terminal state, or has open children, will be refused and left open.',
  counts: { tickets: 3 }, nothingChanged: true, confirm: 'confirm_count must be "3"' }
```

The titles are read with `readTicket` (`ticket-tools.ts:22-29`), at most 100 reads; an id the caller cannot read, or that does not exist, is listed by id as "one you cannot see" in the same words. The preview does not decide who will close (the engine does, per ticket) and says so. The count binds the SIZE of the batch, not its members: call 2 carries the same `ticketIds`, and a different list of the same length is a new batch the caller chose.

### 5.4 Authz

The server's, per ticket, exactly as for `close_ticket`: the permission gate's visibility check first (`check-permission.ts:1640-1641`, "This ticket is not visible to you.", which a ticket that does not exist gets too, so there is no existence oracle), then the engine's close rules. The tool adds no authority.

### 5.5 Events

One `ticket.closed {}` per ticket (`ticket-events.ts:288`), `origin: 'mcp'`, actor = the session user, in the order of `ticketIds`.

### 5.6 Requirements

- **CT-1.** `ticketIds` has 1–100 distinct, non-empty ids. Zero, 101, a duplicate or an empty string is refused BEFORE any request. The boundary 100 succeeds.
- **CT-2.** With the exact count, one `POST /v1/events` carries the N events, in order, with an empty payload and `origin: 'mcp'`.
- **CT-3.** Partial outcomes are reported, not thrown. With three tickets where the middle one is not terminal, the reply has `closed: 2`, `refused: 1`, the refusal carries the rule id and sentence the single `close_ticket` call gets for the same ticket, and the first and third tickets ARE closed on the server (read back). The control, in the same `it`: `close_ticket` on the middle ticket refuses with the same words.
- **CT-4.** A parent and its terminal children in one batch all close, in either order (the engine reads the children's state category, not their `closed` flag, `close.ts:71-72`).
- **CT-5.** A ticket that is not visible and one that does not exist get the same refusal.
- **CT-6.** A results array that is short or holed is reported as silence: nothing is claimed closed, and the error says the outcome is unknown and to re-read with `list_tickets` (the dialog's rule, `bulk-close-dialog.tsx:203-207`). A rejected transport call is the same.
- **CT-7.** Each closed ticket's History shows the close as the assistant's (`origin: 'mcp'`), and `reopen_ticket` undoes it.
- **CT-8.** Each outcome is read by index from the same array the events were built from, never matched by searching the answer.
- **CT-9.** (ruling 11b) Without `confirm_count`, or with a value that is not exactly `String(N)` (`"2"`, `"03"`, `"3 "`, `3.5`, a count for another batch size), the tool answers the preview and sends NOTHING (no `postEvents` call). The control, in the same `it`: the exact count closes.
- **CT-10.** The preview names every ticket by key and title (read with `readTicket`), lists an unreadable id and a nonexistent id in the same words, carries `counts: { tickets: N }`, and states that the engine decides each close.
- **CT-11.** The preview is not a promise: a non-terminal ticket appears in the preview and is then refused at the close with the engine's sentence (CT-3).

## 6. Preferences: `get_notification_preferences`, `set_notification_preferences` and `list_saved_filters`

### 6.1 What they wrap

`GET` and `PUT /v1/me/notification-preferences` (`routes/notification-preferences.ts:30-55`), the route behind Account → Notifications.
- **The document** is `{ mutedKinds: NotificationKind[] }`, strict (`packages/domain/src/notification-preferences.ts:38-42`). `NOTIFICATION_KINDS` is `assignment`, `mention`, `contested-claim`, `date-approaching`, `stale-ticket` (`packages/domain/src/notifications.ts:28-34`). A MUTE list: empty and "never saved" are the same state (`store.ts:24-35`).
- **What muting does:** it hides a kind from the Inbox list and the unread count. It never stops the row being written; the filter is on the read side (domain docblock `:27-36`; `notifications/store.ts:74-86`, `:124`). So `list_notifications` through the MCP also omits muted kinds, because it reads the same route.
- **The PUT replaces the whole document** (`store.ts:37-55`), and the app toggles by read, flip, PUT (`apps/web/app/account/page.tsx:232-239`). Between a person's own devices the last writer wins.
- **Scope:** global, per person. The route has no workspace and no way to name another user (`routes/notification-preferences.ts:21-23`). An MCP token is its user, with no scopes (`2026-10-02-mcp-everything-design.md` §7).

### 6.2 Schema

```ts
// get_notification_preferences: no input
{ mutedKinds: NotificationKind[],
  kinds: { kind: NotificationKind, muted: boolean }[] }     // every member of NOTIFICATION_KINDS

// set_notification_preferences
inputSchema: { mute: z.array(z.enum(NOTIFICATION_KINDS)).optional(),
               unmute: z.array(z.enum(NOTIFICATION_KINDS)).optional() }
// reply: the stored document, plus whether anything changed
{ mutedKinds: NotificationKind[], changed: boolean }
```

`set` takes deltas, not a whole list, so an assistant cannot wipe a mute it did not mean to touch. The handler reads the document, applies `mute` then `unmute`, and PUTs the whole result (the route's contract). A kind appearing in both lists is refused.

The tool descriptions name each kind in plain words, taken from the app's labels (`notifications-section.tsx:4-10`). The words are copied, so a census test pins that every member of `NOTIFICATION_KINDS` appears in the description (NP-6), and a kind added later fails it.

### 6.3 Authz

The route's: a session is the whole door (`routes/notification-preferences.ts:17-19`). Nothing else applies.

### 6.4 Events

None. This is a per-person setting row (`user_notification_preferences`), not a ledger event (§9, Q7).

### 6.5 Requirements

- **NP-1.** `get` for a person with no row answers `mutedKinds: []` and `kinds` with `muted: false` for all five.
- **NP-2.** `set { mute: ['mention'] }` sends `PUT { mutedKinds: ['mention'] }` and answers the stored document; a following `get` equals it.
- **NP-3.** Read-modify-write: from `['mention']`, `mute ['assignment']` sends `['mention','assignment']`; then `unmute ['mention']` sends `['assignment']`. No duplicates. A call that changes nothing sends no PUT and answers `changed: false`.
- **NP-4.** Refused before any request: both lists empty or absent, a kind in both, an unknown kind.
- **NP-5.** Effect, through the hosted door: after muting `mention`, `list_notifications` omits mention rows and the unread count excludes them; after unmuting they are back (the rows were never deleted).
- **NP-6.** The two descriptions together name every member of `NOTIFICATION_KINDS` (the test iterates the array, so it fails when a kind is added).
- **NP-7.** Isolation: user A's `set` leaves user B's document unchanged, and no argument names a user.
- **NP-8.** `set` reaches `PUT /v1/me/notification-preferences` through `Session.put` on both doors: the stdio client (against a stub server) and the hosted in-process door (PL-1).

### 6.6 `list_saved_filters(workspaceId)` (ruling 11d)

**What it wraps.** `GET /v1/me/preferences?workspaceId=` (`routes/preferences.ts:96-111`), the per-user, per-workspace view-preferences document the project page reads. Its `savedFilters` is up to 50 named filters, each `{ id, name, filterSpec }` (`packages/domain/src/preferences.ts:27-31`, `:112-118`). Preferences are rows, not ledger events (`routes/preferences.ts:16-25`). `filterSpec` is `filterSpecSchema` minus its plural list keys (`savedFilterSpecSchema`, `packages/domain/src/filter-spec.ts:227-230`), so it is a valid `filter` for `list_tickets` and `search` (`read-tools.ts:21`). MCP-everything left saved views out because this route was not mounted; it is mounted now (`apps/server/src/app.ts:1052`).

**Schema.**

```ts
inputSchema: { workspaceId: id }
// reply
{ workspaceId, savedFilters: { id: string; name: string; filter: FilterSpec }[] }   // stored order, at most 50
```

`filter` is the stored `filterSpec` unchanged, under the name `list_tickets` uses. `listColumns` and `grouping` are not returned (S2-11). The description says to pass `filter` to `list_tickets` as it is.

**Authz.** The route's: any member of the workspace, a guest included (no role gate, `routes/preferences.ts:66-70`); a stranger and a missing workspace get the same 404, answered as `workspace not found or not visible to you`. The subject is the session; no argument can name another user (`:27-37`).

**Events.** None. Read only, so D2 does not apply.

**Requirements.**
- **SF-1.** The reply lists the caller's saved filters for that workspace in stored order, each with `id`, `name` and `filter`. A person who has saved none gets `[]`.
- **SF-2.** Each `filter` is accepted by `filterSpecSchema` and by `list_tickets` as its `filter` argument, and equals the stored `filterSpec` (a saved filter containing `assigneeId` and `closed: false` round-trips).
- **SF-3.** Isolation: user B's saved filters never appear for user A in the same workspace, and the schema has no user argument.
- **SF-4.** A guest member gets their own filters; a stranger and an unknown workspace get `workspace not found or not visible to you`. The tool sends no `PUT`.

## 7. `assign_ticket` and `create_ticket` take `assignee_email`, with a confirmation

### 7.1 What it wraps

The app ALREADY assigns by email. Owner ruling 5 (2026-09-29): "have them type up their email, and only show if a user matching that email is found" (`routes/people.ts:31-33`). The flow:

1. **Find.** `POST /v1/workspaces/:id/people-lookup { email }` answers `{ user: { userId, name, email, inWorkspace } | null }` (`people.ts:112-135`). The match is EXACT (`lower(email) = lower(trim($1))`), **verified accounts only**, never a synthetic phone address, and **two case-variant accounts answer `null`** rather than a guess (`:47-67`). A guest caller, a non-member and a stranger all get the same 404 (`:130-132`). The route is rate-limited per IP in the invite bucket because it is an address oracle (`app.ts:691-705`).
2. **Show.** The finder shows `Name (email)` and one of two sentences: "`<name>` is already in this workspace." or "They will join this workspace as a guest and see only this ticket." (`outsider-finder.tsx:109-117`; `people/copy.ts:12`, `:18`). A miss shows "No user with that email." (`copy.ts:11`).
3. **Assign.** The person presses Assign (`outsider-finder.tsx:113`). A person already in the workspace gets an ordinary `ticket.assigned`; a person outside goes through `POST /v1/workspaces/:id/assign-outsider { userId, event }` (`ticket-sheet.tsx:1496-1499`, `:3179`), which grants a **guest** membership and then submits the caller's own `ticket.assigned`, compensating with a revoke if that is refused (`people.ts:137-221`).

The same two doors serve a ticket's BIRTH: `assign-outsider` accepts a `ticket.created` claim naming the person (`people.ts:161`), and the New ticket dialog's Assignee picker uses it (`views/new-ticket-dialog.tsx`; the gate's birth-assignee rule is `check-permission.ts:1335-1368`). That is why `create_ticket` can take the same parameter (ruling 11a).

The roster is not used: `list_members` shows unverified emails and withholds guests from non-admins (`builder-reads.ts:248-284`, `ROSTER_VISIBLE_CLAUSE`), so a roster match would resolve different people than the app does.

### 7.2 Schema

`assign_ticket` today is `{ workspaceId, ticketId, assigneeId: string | null }` (`write-tools.ts:134-155`). It becomes:

```ts
inputSchema: {
  workspaceId: id, ticketId: id,
  assigneeId:       id.nullable().optional(),   // as before; null unassigns
  assignee_email:   z.string().min(1).optional(),
  confirm_assignee: z.string().optional(),
}
```

Exactly one of `assigneeId` (a string or `null`) and `assignee_email` must be given. Existing callers, which always pass `assigneeId`, are unchanged. `confirm_assignee` is valid only with `assignee_email`. (Names: S2-9.)

`create_ticket` gains the same two members, `assignee_email` and `confirm_assignee`, beside its existing `assigneeId` (`"me"` or an id, `write-tools.ts:17`, `:83`); at most one of `assigneeId` and `assignee_email` may be given (here neither is allowed, since a ticket may be born unassigned). Its other arguments and checks are unchanged, and the existing argument checks (`stateId` with `start: "backlog"`, `write-tools.ts:55-57`) run BEFORE call 1.

### 7.3 The confirmation, precisely

It is a **two-call, stateless** confirmation that reuses the house preview (`preview.ts:17-25`), with its parameter name made a fourth argument (default `confirm_name`, so every existing caller is unchanged, PL-3).

**Call 1: `assign_ticket { workspaceId, ticketId, assignee_email }`.** No `confirm_assignee`. The tool:
1. reads the ticket (`readTicket`, `ticket-tools.ts:22-29`); a 404 answers `ticket not found or not visible to you` and NO lookup is made (the lookup is skipped for a ticket the caller cannot see);
2. calls `people-lookup`;
3. returns a preview and writes nothing:

```ts
{
  preview: true,
  wouldChange: 'Assigns CCSO-4 "Fix login" to Asha Rao (asha@example.com). <sentence>',   // <sentence>: see below
  person: { userId, name, email, inWorkspace },
  joinsAsGuest: boolean,                       // = !inWorkspace
  counts: {},
  nothingChanged: true,
  confirm: 'confirm_assignee must be "<userId>"',
}
```

**The sentence (ruling 11c).** For a person already in the workspace it is the app's, verbatim: "`<name>` is already in this workspace." (`people/copy.ts:18`). For a person outside it has TWO parts, in this order: first, in so many words, "`<name>` is not in this workspace and WILL BE ADDED AS A GUEST." (the capitals are in the text, so the effect cannot be read past); then the app's own sentence, verbatim: "They will join this workspace as a guest and see only this ticket." (`copy.ts:12`). The in-workspace preview contains no "guest" at all. `joinsAsGuest` carries the same fact for a program.

**Call 2: the same arguments plus `confirm_assignee: "<userId>"`.** The tool looks the email up AGAIN (nothing from call 1 is remembered; `directory.ts:10-12`'s rule), and:
- if the lookup finds nobody, it answers the miss sentence and its hint (AE-9) and writes nothing;
- if `confirm_assignee` is anything but the userId the email resolves to NOW, character for character (a name, the email, a trailing space, the wrong case, or a userId that was right at call 1 and is not any more), it answers a fresh PREVIEW of the person the email resolves to now and writes nothing (`confirmOrPreview`'s exact comparison). The tool cannot tell a wrong id from a changed resolution, and does not try: either way the person shown is the one who would be assigned;
- if it matches and `inWorkspace`, it submits `ticket.assigned { assigneeId }` through the event door;
- if it matches and not `inWorkspace`, it posts `{ userId, event }` to `assign-outsider` with the same envelope (`origin: 'mcp'`).

**`create_ticket`, the same flow (ruling 11a).** Call 1 (`assignee_email`, no `confirm_assignee`) reads nothing about a ticket, because none exists: it runs the argument checks, calls `people-lookup` for `workspaceId`, and answers the preview below. It creates NOTHING: no `ticket.created`, no `assign-outsider`, no `newUlid()` spent (the ticket id is made at call 2). Call 2 (`confirm_assignee` = the userId) re-resolves, applies the same three branches as above, and then builds `ticket.created { …, assigneeId: <userId> }`: in the workspace through `/v1/events`, outside through `assign-outsider` with that event. The reply is the existing `{ ticketId, …committed }`.

```ts
wouldChange: 'Creates "Fix login" in <project name> (<workspace name>) and assigns it to Asha Rao (asha@example.com). <sentence>'
```

The project and workspace names come from `readDirectory` (`directory.ts:32-34`), read at call time. `<sentence>` is the one above, so an outsider gets "WILL BE ADDED AS A GUEST" here too.

**Why the userId and not the email.** The caller already holds the email, so echoing it proves nothing. The userId exists only in the preview, so the assistant must have received it, and the preview sentence is what a person reads. The userId is also unique where a display name is not.

### 7.4 Authz

The app's, by construction, because the tool calls the same routes:
- **Who may look up:** a non-guest member (`people.ts:127-132`). A guest or stranger gets `workspace not found or not visible to you` (the route's 404, the existing wording).
- **Who may assign:** whoever the gate lets send `ticket.assigned` for that ticket. The named person must hold a role in the workspace (`permission.role`, "That person is not in this workspace.", `check-permission.ts:208`, `:1672-1683`). `assign-outsider` runs the gate dry first, grants only when that sentence is the single obstacle (`people.ts:175-182`), and rolls the grant back if the ticket claim is then refused (`:210-218`).
- **The outsider arm needs the caller to be a member** (`:154-156`).
- **`create_ticket`** adds the gate's and the engine's birth rules (project membership, type, workflow); a refusal after the grant is compensated by the same revoke (`people.ts:210-218`).

### 7.5 Events

- In workspace: one `ticket.assigned { assigneeId }` (`origin: 'mcp'`); for `create_ticket`, one `ticket.created` carrying `assigneeId`.
- Outsider: `membership.granted { userId, role: 'guest' }` on the membership stream, then `ticket.assigned` (or `ticket.created`). The grant is written by the server with `actorId` = the caller and **`origin: 'server'`** (`people.ts:185-200`, the invitation-acceptance precedent), so the ledger shows the guest being added as the caller's act but not as the assistant's (Q5). On a refusal the server writes `membership.revoked` (`:214`).

### 7.6 Requirements

- **AE-1.** `assigneeId` alone behaves exactly as today, including `null`. (Every existing `assign_ticket` test still passes.)
- **AE-2.** Both `assigneeId` and `assignee_email`, or neither, is refused before any request, with a sentence that names the options. `confirm_assignee` without `assignee_email` is refused.
- **AE-3.** Call 1 for a person in the workspace returns the preview with `inWorkspace: true`, `joinsAsGuest: false`, and the "already in this workspace" sentence. Requests made: the ticket read and ONE `people-lookup`. No event and no `assign-outsider`.
- **AE-4.** Call 1 for a person outside returns `joinsAsGuest: true` and the guest sentence, byte-identical to the app's `OUTSIDER_JOINS_AS_GUEST`. A roster read afterwards shows no new membership.
- **AE-5.** Call 2 with the resolved userId for a person in the workspace sends one `ticket.assigned` through `/v1/events`, `origin: 'mcp'`, and does not call `assign-outsider`.
- **AE-6.** Call 2 for a person outside calls `assign-outsider` once with `{ userId, event }`; afterwards the person is a guest and the ticket's assignee; the ledger holds `membership.granted` (`origin: 'server'`, actor the caller) then `ticket.assigned` (`origin: 'mcp'`).
- **AE-7.** A wrong `confirm_assignee` (another userId, the email, the name, the userId with a trailing space, the wrong case) answers the preview of the person the email resolves to and writes nothing. The control, in the same `it`: the exact userId writes.
- **AE-8.** Re-resolution: if between the calls the email resolves to someone else, call 2 answers a preview naming the NEW person and writes nothing; if it resolves to nobody, call 2 answers the miss sentence (AE-9) and writes nothing. (The stub lookup returns person A at call 1 and person B at call 2.)
- **AE-9.** No match answers `No user with that email.` (`copy.ts:11`) followed by one hint: someone you can already see is assigned with `assigneeId` from `list_members`. Four inputs get this same answer and the tool never distinguishes them: an unknown address, an unverified account, a synthetic phone address, and an address held by two case-variant accounts (`people.ts:44-56`).
- **AE-10.** A guest caller and a stranger get `workspace not found or not visible to you`.
- **AE-11.** A ticket the caller cannot see answers `ticket not found or not visible to you` and no `people-lookup` request is made.
- **AE-12.** A refusal after confirmation is the server's words, `refused by <rule>: <reason>`. For the outsider arm the refusal arrives wrapped, as `{ result: { status, rule, reason } }` with HTTP 422 (`people.ts:172`, `:179-182`, `:219`); the tool unwraps it as the app's gateway does (`packages/app-core/src/online/people.ts:48-63`), so the assistant never sees `answered 422: {…}` (PL-4). After a refused outsider assignment no guest membership remains.
- **AE-13.** A 429 from the lookup answers a sentence saying lookups are rate-limited and to wait (PL-5). The preview step spends the same budget as the app's Find button.
- **AE-14.** The email is trimmed and case-folded by the route; `" Asha@X.COM "` resolves to the same person as `asha@x.com`. `confirm_assignee` is a userId, so case never matters there.
- **AE-15.** The assignment appears in the ticket's History with `origin: 'mcp'`; `assign_ticket { assigneeId: null }` removes it. The guest membership stays (it is not undone by unassigning, as in the app, §9).
- **AE-16.** The two product sentences used in the preview and the miss are byte-identical to `copy.ts:11-12` and `:18-20`; a test compares them, so a rewording in the app fails the MCP test.
- **AE-17.** (ruling 11c) The preview's `wouldChange` contains `ADDED AS A GUEST` if and only if the person is not in the workspace, in both tools; for an outsider it also contains the app's guest sentence, and for a member it contains no "guest". The test asserts both directions in the same `it`.

### 7.7 `create_ticket` requirements (ruling 11a)

AE-3 to AE-9, AE-12, AE-14 and AE-17 run for BOTH tools (one parametrised test each); the ones below are specific to a birth.

- **CE-1.** `assigneeId` with `assignee_email` is refused before any request; `confirm_assignee` without `assignee_email` is refused; `assigneeId` alone and neither behave exactly as today. The existing `stateId` / `start` check still runs first.
- **CE-2.** Call 1 creates nothing: the recorded requests contain one `people-lookup` and no `postEvents` and no `assign-outsider`, and a ticket list of the project is unchanged afterwards. The control, in the same `it`: call 2 with the userId creates the ticket.
- **CE-3.** Call 2 creates the ticket with `assigneeId` = the resolved userId: for a person in the workspace one `ticket.created` through `/v1/events` (`origin: 'mcp'`); for an outsider one `assign-outsider` call whose `event` is that `ticket.created`, after which the person is a guest and the ticket's assignee. The reply carries `ticketId`.
- **CE-4.** A refusal after confirmation (an unknown `typeId`, a project the caller is not in) is the server's words, nothing is created, and no guest membership remains (the compensation, `people.ts:210-218`).

## 8. Shared plumbing

### 8.1 PL-1: `Session.put`

Notification preferences are written with `PUT`. `Session` (`session.ts:6-18`) and `GisikClient` (`http-client.ts:24-29`) have `get`, `post`, `postEvents`, `getBytes`, `postMultipart` and no `put`. A `put(path, body)` is added at every place that builds a session:
- `http-client.ts` (the client, beside `post`, `:95-105`);
- `session.ts` (`createSession`, `:67-74`);
- `lazy-session.ts` (the deferred wrapper, `:68-82`);
- `apps/server/src/mcp/in-process-fetch.ts` (`hostedSession`, `:50-64`, and the `method` cast to `'GET' | 'POST'` at `:24`, widened);
- `packages/mcp-server/test/fixtures/fake-session.ts` and every test that builds a `Session` or `GisikClient` literal (the plan greps for them; each fails typecheck until it has `put`).

The CSRF control already covers `PUT` and exempts bearer requests (`http/http-origin.ts:256`, `:26`), and the HTTP-origin control is not a concern for a bearer token.

### 8.2 PL-2: a by-index reader

A helper beside `submitBatch` (`submit.ts`) that returns every result of one `POST /v1/events`, index-aligned, without throwing on a refused or invalid result. It throws only when the answer is short or holed (CT-6). `submitBatch` is NOT changed (§13, Q3).

### 8.3 PL-3: `confirmOrPreview` takes the parameter name

An optional fourth argument, default `'confirm_name'`, used in the `confirm` sentence (`preview.ts:24`). It carries `confirm_assignee` (§7) and `confirm_count` (§5.7). Every existing caller is unchanged; a test pins the default and both custom spellings.

### 8.4 PL-4 and PL-5: response mapping

- `postJson` (`submit.ts:93-106`) reads a refusal from the TOP level of a 422 body (`b['status']`). `assign-outsider` nests it under `result`. A sibling mapper unwraps `result` for that route and leaves `postJson` as it is.
- A 429 from `people-lookup` is mapped to a sentence (the generic `HttpError` message is only "answered 429", and an assistant is shown the message and nothing else, `submit.ts:85-92`).

### 8.5 PL-6: the registry pins

This spec adds **five** tools (`restore_note_version`, `close_tickets`, `get_notification_preferences`, `set_notification_preferences`, `list_saved_filters`), so on this base the registry grows from 63 to **68**. (`assign_ticket` and `create_ticket` change shape but are not new.) Other specs add tools too (spec A's `link_tickets`, the drafts and graph tools, spec D's), so the count is not final: the plan re-counts at landing and the pin edit is a known merge point between those specs.

Files that change, with the placement:
- `packages/mcp-server/test/fixtures/tool-names.ts`: `restore_note_version` in the `note` block, `close_tickets` in the `ticket` block, the two preference tools and `list_saved_filters` in the `discovery` block (the inbox tools live there, `discovery-tools.ts:65-79`). Each lane edits only between its own `begin` / `end` comments.
- `packages/mcp-server/test/fixtures/tool-sweep.ts`: a valid-arguments entry per new tool (the 14.88 sweep drives every handler).
- `packages/mcp-server/test/register.test.ts:87-108`: the spelled-out list and `toHaveLength`.
- `packages/mcp-server/test/exports.test.ts` (reads `TOOL_NAMES`).
- `packages/mcp-server/src/tools/register.ts`: no change, since the tools sit in existing factories.

## 9. Rule D2, tool by tool

D2 (restated in the Knowledge Graph series, spec D): every MCP write is visible in the app, attributed, and removable by a member. This spec changes no app screen; each write shows on a surface that exists today.

| Tool | Visible in the app | Attributed | Removable |
|---|---|---|---|
| `get_ticket` notes | read only | n/a | n/a |
| `restore_note_version` | a new row in the note's History panel (`history-panel.tsx:127-136`) and the new body | the actor in the ledger; the panel shows the name, not "via Claude" (Q9) | restore the previous version |
| `close_tickets` | the tickets leave the board/list; History | per ticket, `origin: 'mcp'` | `reopen_ticket`, or Reopen in the app |
| `list_saved_filters` | read only | n/a | n/a |
| `set_notification_preferences` | the switches on Account → Notifications | **no event, no origin** | flip the switch back |
| `assign_ticket` / `create_ticket` by email | assignee and History (the new ticket); for an outsider, the guest in Members | the assignment is `origin: 'mcp'`; the guest grant is `origin: 'server'` | unassign removes the assignment only; removing the guest is a separate member-removal act under that act's own rule (`manage_members`), unchanged by this spec |

Two rows fall short of the letter of D2 and are listed for the owner: the preference write has no attribution at all (it is a setting, and the app keeps no history of it either), and the guest grant is not marked as the assistant's. Both match what the app itself does (Q5, Q7).

## 10. Out of scope

- **Contests** (`claim.contested`, `claim.contested_resolved`): deferred by the owner.
- **`update_profile`** (display name): deferred by the owner.
- Already excluded by M-E3 and not reopened here: permanent delete / purge (`purge.marked`, `purge.unmarked`, `POST /v1/purged-lookup`), passkeys, devices, MCP tokens and connections.
- Writing saved filters, and list columns and grouping in either direction (§11).
- Fixing the app's Restore on a born-empty version (a follow-up defect, Q4).
- A `comment` on `close_tickets`.
- Any change to `submitBatch`, `update_ticket` or `close_ticket` (Q3).
- Any server route: every tool here uses a route that exists today.

## 11. Candidates for the owner (NOT requirements)

Capabilities the app has that the MCP lacks. Method: the server's routes (every `app.get/post/put/patch/delete` under `apps/server/src`) and the event vocabulary (`packages/domain/src/vocabulary.ts`) were checked against the 63 tools, and `Features.md` §§20–25 against the sweep's base (`63a9c26a`). Finding: since that base the vocabulary gained only `comment.edited` and `comment.deleted` (the sweep itself added them, and both are covered), the routes gained none, and the features that shipped (phone layouts, neo, smoothness, the workflow canvas) are interface changes with no new capability. So the list below is gaps the 2026-10-02 sweep did not take up, not new ones. The owner picks; none of these is in this spec. Ruling 11 moved two earlier candidates into scope: reading saved filters (§6.6) and `assignee_email` on `create_ticket` (§7). What remains of the saved-views idea, a writer and list columns / grouping, is not listed as a candidate; it can be asked for later.

| # | Candidate | App side | Note |
|---|---|---|---|
| C1 | **List pending invitations** (`manage_members` action `list_invites`) | `GET /v1/workspaces/:id/invites` (`routes/invites.ts`) | The MCP reads it only inside `revoke_invite` (`member-admin-tools.ts:37-45`, `:113`); `manage_members` has no list action (`:72`). Admin-only (a 403 for others). |
| C2 | **The board as the app draws it** (`get_board`) | `GET /v1/projects/:projectId/board` (`routes/board.ts:381`) | `list_tickets groupBy: status` approximates it. Worth it only when WIP limits land (spec `2026-09-29-board-wip-limits-and-swimlanes-design.md`; `wipLimit` is not in `workflow.ts` yet). |
| C3 | State occupancy and ticket counts by type (admin reads) | `GET …/workflows/:id/state-occupancy`, `…/ticket-counts-by-type` (`builder-reads.ts`) | Used inside previews today (14.531-14.532); a stand-alone read is low value. |
| C4 | Unread count | `GET /v1/me/notifications/unread-count` (`notifications.ts:140`) | `list_notifications unreadOnly` gives it. Skip. |
| C5 | Raw event reads | `GET …/tickets/:id/events` (`tickets.ts:714`), `GET /v1/notes/:id/events` (`notes.ts:166`) | They carry comment and description bodies; `get_ticket_history` redacts them on purpose (`ticket-tools.ts:40-60`). Recommend NOT adding. |
| C6 | Reopen in bulk, bulk transition | none in the app | Not a gap. |

**Specified elsewhere, so not to be duplicated:** typed links (`link_tickets`, `links` on `get_ticket`, spec A), `linkedFrom` on `get_ticket` and `get_note` (spec B), `home` on `get_workspace` (spec E), the graph and concept tools (spec D), and the drafts and flow tools (their own specs).

## 12. Testing and proof

### 12.1 Case block

`test-cases/14-mcp-server.md` is the file; `Features.md` §14 gains the bullets.

- **Method.** Every live tip was grepped on 2026-10-03: `git branch -r | grep -E 'origin/(release|task)/'`, 367 refs. The highest case id actually written is **14.555**. But MCP-everything reserves **14.360–14.599** in the header at `14-mcp-server.md:833`, `:835` (T14's 14.570–14.579 and spare 14.580–14.599 are not written yet). A search of all 367 tips for 14.6xx–14.9xx across `apps`, `packages`, `test-cases`, `docs` and `Features.md` (server and web tests included) found no use of the ids (one false hit, 9 999 ms in `25-smoothness.md`).
- **Reserved: 14.600–14.659** (60 ids). The plan re-greps every live tip before allocating.

| Ids | Content |
|---|---|
| 14.600–14.604 | Plumbing: `put` in every session (and a census that finds every `Session` literal), the by-index reader, `confirmOrPreview`'s parameter name (`confirm_assignee`, `confirm_count`), `result` unwrapping, 429 mapping |
| 14.605–14.609 | §3, `get_ticket` notes: GT-1; GT-2 with GT-6; GT-3; GT-4; GT-5 |
| 14.610–14.616 | §4, `restore_note_version`: RV-1 … RV-7, one each |
| 14.617–14.626 | §5, `close_tickets`: CT-1 … CT-6, CT-7 with CT-8, CT-9, CT-10, CT-11 (ten cases) |
| 14.627–14.633 | §6.1–6.5, notification preferences: NP-1; NP-2 with NP-8; NP-3 … NP-7 (seven cases) |
| 14.634–14.637 | §6.6, `list_saved_filters`: SF-1, SF-2, SF-3, SF-4 |
| 14.638–14.656 | §7, `assignee_email` on both tools (19 cases): AE-1 with AE-2; AE-3; AE-4; AE-5; AE-6; AE-7; AE-8; AE-9; AE-10 with AE-11; AE-12; AE-13; AE-14; AE-15; AE-16; AE-17; CE-1; CE-2; CE-3; CE-4. AE-3 … AE-9, AE-12, AE-14 and AE-17 are parametrised over `assign_ticket` and `create_ticket` |
| 14.657–14.659 | Registry pins (68 on this base), manual §16 and README, the round trip through the hosted `/mcp` |

All cases start at ❌ and flip in the same commit as the covering test. Each test names its id.

### 12.2 Order (RED first)

1. **Plumbing** (`put`, by-index reader, preview parameter, mappers). Each with its control: `submitBatch` still throws on the same input; `confirmOrPreview` default unchanged.
2. **`get_ticket` notes.** Visibility control in the same `it`: the author sees the note, a reader who cannot read it sees neither it nor a count.
3. **`restore_note_version`.** The lossless case with its `update_note` control; the born-empty case with its has-body control; the role matrix through the hosted door.
4. **`close_tickets`.** The preview-sends-nothing case with its exact-count control (assert the recorded requests); the partial case with its `close_ticket` control; the boundary 100/101.
5. **Notification preferences.** The read-modify-write and the effect on `list_notifications`.
5b. **`list_saved_filters`.** The round trip through `list_tickets`, and isolation between two users.
6. **`assignee_email`.** Both tools: the preview-writes-nothing case (assert the recorded requests; for `create_ticket`, also that no ticket exists), the "ADDED AS A GUEST" text in both directions, each wrong-confirm spelling, the outsider arm end to end with its compensation, the unwrapping.
7. **Registry and catalogue.** `tool-names.ts`, `tool-sweep.ts`, `register.test.ts` (the 14.88 sweep drives every new handler), `Features.md`, the manual and help.
8. **Real client, before release.** A hosted `/mcp` session: `get_ticket` shows a ticket's notes; restore a version; close three tickets with one not terminal (preview, then the count); mute and unmute a kind; read a saved filter and use it; assign by email and create a ticket for an outsider, preview then confirm.

### 12.3 Documents that change in the same change set

- **`Features.md` §14:** one bullet per capability under a new marker (`<!-- mcp-sweep-2 bullets -->`) after the MCP-everything bullets (`:3441-3450`), each with the cases and file paths. The "sixty-three" in the stdio bullet (`:3403`) is re-counted.
- **`test-cases/14-mcp-server.md`:** a new section `14.15 MCP sweep 2` with the block header.
- **`docs/manual.md` §16**, regenerated into `packages/app-core/src/help/content.generated.ts`: lists the new abilities and the assign-by-email confirmation in plain words (the 14.553 precedent). A tool the manual does not name is a failed case (14.658).
- **`packages/mcp-server/README.md`**: the tool list.

## 13. Questions: resolved, and what is still open

The owner ruled on 2026-10-03 (ruling 11, and the planner's defaults for the rest). The question numbers stay, because the text above cites them.

| Q | Question | Resolution |
|---|---|---|
| Q1 | `assignee_email` on `create_ticket`? | **Yes** (ruling 11a). Call 1 creates nothing. §7, CE-1 … CE-4. |
| Q2 | Should `close_tickets` preview? | **Yes** (ruling 11b), through `confirmOrPreview` with the count as the confirm value. §5.7, CT-9 … CT-11. |
| Q3 | `update_ticket` (`ticket-tools.ts:102`) and `close_ticket` with a comment (`:113-115`) use `submitBatch`, which throws at the first refusal after earlier events committed (`ingest-service.ts:331-340`). | **Not fixed here.** §10. |
| Q4 | The app's Restore on a born-empty version passes `null` (`history-panel.tsx:103-106`, `:169`), `note-document.tsx:838` writes `body: null`, and `noteBodySetPayload` requires a document (`note-events.ts:87`). | **The tool restores the empty document** (RV-3). The app defect is filed as a follow-up. |
| Q5 | The guest grant is `origin: 'server'` (`people.ts:185-200`). | **Accepted.** §9. |
| Q6 | The lookup needs a verified email (`people.ts:50-53`); the roster shows unverified ones (`builder-reads.ts:259-282`). | **Accepted, with the hint** (AE-9). |
| Q7 | The preference write has no attribution (`store.ts:44-55`). | **Accepted as a personal setting.** §9. |
| Q8 | Each call 1 is an address oracle sharing the per-IP invite budget (`app.ts:691-705`). | **The plan's first task measures the limit** (O1). |
| Q9 | Note History shows no origin (`history-panel.tsx:135`). | **Out of scope.** |

**Still open.**

- **O1. The lookup budget.** The plan's first task measures the invite bucket's limit and how many preview calls an assistant can make before it exhausts it for the person (through the hosted door the budget is keyed to the outer caller, `in-process-fetch.ts:7-13`). If an ordinary session can burn the budget that the same person's invitations need, the owner decides whether this tool gets a tighter cap or its own bucket. Nothing in this spec blocks on it.

## 14. Files (expected)

- `packages/mcp-server/src/tools/read-tools.ts` (`get_ticket`), `ticket-tools.ts` (`close_tickets`), `note-tools.ts` (`restore_note_version`), `discovery-tools.ts` (notification preferences, `list_saved_filters`), `write-tools.ts` (`assign_ticket`, `create_ticket`), `preview.ts`, `submit.ts`.
- `packages/mcp-server/src/session.ts`, `lazy-session.ts`, `http-client.ts`; `apps/server/src/mcp/in-process-fetch.ts`.
- `packages/mcp-server/test/*` (one file per tool family, `fixtures/tool-names.ts`, `fixtures/tool-sweep.ts`, `fixtures/fake-session.ts`, `register.test.ts`, `exports.test.ts`), and a hosted-door test beside `apps/server/test/mcp/`.
- `Features.md` §14, `test-cases/14-mcp-server.md`, `docs/manual.md` §16 and its generated help, `packages/mcp-server/README.md`.
- No server route, no migration, no domain event, no new event type.

## 15. Risks

- **A confirmation that proves nothing.** If `confirm_assignee` were the email, or a flag, an assistant could confirm in the same breath. AE-7 and AE-8 pin the userId and the re-resolution; the preview-writes-nothing case asserts the recorded requests, not the reply.
- **A grant by accident.** The outsider arm adds a guest, now from two tools. The preview says "ADDED AS A GUEST" in so many words and carries the app's own sentence (AE-17); AE-6, AE-12 and CE-4 test the grant and its compensation.
- **A preview that costs 100 reads.** `close_tickets` names every ticket (CT-10), so a full batch reads 100 tickets before it closes any. Accepted: the app's dialog lists every title too, and the reads are the caller's own.
- **A silent partial commit.** `close_tickets` is built on the by-index reader because the batch commits per event (CT-3 tests it against the server, not a stub).
- **A lossy restore.** Anyone who "simplifies" `restore_note_version` to reuse `update_note` would drop content. RV-1 has the control.
- **A tool the pins miss.** The registry fixtures are the one place a tool can vanish silently (`register.ts` docblock); PL-6 and the sweep entries cover it, and the count is re-taken at landing because several specs edit the same lines.
- **Concurrent edits.** A restore overwrites a note being edited at the same moment. There is no base-version check, and the app has none either: last writer wins.
- **A stale copy of the app's words.** AE-16 and NP-6 compare to the app's strings and kinds so a change in either place fails a test.

# Gisik Nokma — product design

**Date:** 2026-08-20
**Status:** awaiting review (design agreed section-by-section in the brainstorm session; this document records it)
**Lineage:** generalises the convenience-corner tracker (`reference/convenience-corner-tracker/`, upstream `24e2240`) — a board for one repository and one user — into a product. The base's ideas are inherited deliberately, not accidentally; where one could not survive the generalisation, the honest degradation is named.

Gisik Nokma (Garo: *gisik* mind/memory, *nokma* the custodian who holds things in trust) is **the keeper of memory: project management software whose board structurally cannot lie about the work.**

## Decisions

Every foundational question was asked and answered rather than assumed.

| Question | Decision |
|---|---|
| Primary audience | **Non-technical operators** — people who will never open a text editor or a repo |
| Shape of the product | General-purpose, **multi-project**, an Asana/Jira hybrid |
| Hierarchy | project → epic → story → task → sub-task, Jira-flexible (tasks directly under epics or at project root) |
| Ticket types | Built-ins plus **custom reusable ticket types** with modest typed custom fields |
| Workflows | **User-defined**, attached to ticket types, authored in a Jira-style visual builder plus a template gallery |
| Where honesty comes from | **Provenance floor** (every change is a dated, attributed claim) + **workflow-declared rules that are enforced** (refusals) |
| Parent/child truth | Parents authored + **refusal on contradiction**; derived child progress always displayed |
| Hosting | **Hosted service**; offline capability in the mobile and desktop apps; web online-only |
| Architecture | **Event-sourced core with a shared TypeScript rule engine** (approach A; CRUD-with-audit-log and local-first CRDTs considered and declined) |
| Clients | Next.js/React web · React Native mobile · Tauri desktop · shared component/domain packages |
| Delivery | **Single build — no multiphase delivery** |
| Dogfooding | Convenience-corner operations **and** Gisik Nokma's own development |
| Source posture | **Closed source** |
| Sign-in | Phone OTP · email magic link · **Google OAuth** · passkeys; no passwords |

## 1. System overview and the honesty contract

One TypeScript/Node server; three clients sharing common packages. In the base, git files owned the facts and the board could only point attention at them. Here, **the event ledger owns the facts**: every change — a status move, an assignment, a due date, a comment — is an immutable event recording who claimed what, when, from where. Tickets, boards, calendars and histories are projections computed from the ledger. Nobody edits state; everybody appends claims; views are generated. "The view is generated; attention is authored" survives intact — authored things are events, generated things are projections.

**The honesty contract** — invariants the whole system enforces, none of them optional:

1. **Provenance floor.** Every visible state traces to the dated, attributed claim that produced it, and the UI never launders a claim into an anonymous fact. "Done" always unfolds to "marked done by X on date".
2. **Refusals over intentions.** Workflow definitions may declare rules; the rule engine refuses violating events at the door, identically on client and server, with the reason named in the user's language rather than a bare rejection.
3. **Parents cannot outrun children.** A terminal-state claim on a parent with open children is refused. Derived child progress renders beside every authored parent state.
4. **Nothing is invented.** No estimated dates, no fabricated progress. An undated item is absent from the calendar; a deadline renders as the claim it is — attributed, never presented as system truth.
5. **Offline edits are claims in transit.** A synced-in event that a rule now refuses becomes a visible *contested claim* — never a silent drop, never a silent acceptance.
6. **Every refusal is proven against planted defects** before it is trusted — the base's testing discipline, carried over whole.

## 2. Domain model

**Workspace** is the top container (one shop, one team, one company). Users belong to workspaces; projects live in a workspace; tickets live in projects.

**Tickets** are one thing with a *type*. Built-in types: epic, story, task, sub-task. **Custom ticket types** are user-defined: a name, an icon, a hierarchy rank, an attached workflow, and optional custom fields drawn from a small typed set — text, number, date, select, person. Types are reusable across the workspace. Hierarchy is Jira-flexible within sanity rules: tasks may sit directly under epics or at project root; sub-tasks require a parent; a child's type must rank below its parent's (no epics under stories).

**People on a ticket:** one assignee, any number of collaborators. **Visibility** per ticket: workspace, project members, or an explicit list — defaulting to *inherit from parent* down the hierarchy.

**Everything mutable is a claim.** A due date is "X claims this is needed by D" and renders with its author. Status is the workflow position with its provenance. Description edits are versioned events.

**The editor.** Descriptions and comments use a WYSIWYG editor in the mould of the knowledge-base document editor (same Tiptap v3 family and conventions, including deterministic markdown serialisation): when a typed reserved character would trigger formatting, the editor surfaces an inline **escape-character suggestion**, so literal text is always reachable and nothing silently becomes markup. Documents are stored as structured content inside events; description edits stay versioned claims. One document schema across all three clients; the editor component is shared web code — native in Next.js and Tauri, embedded via webview in React Native, which is the honest mobile path for a Tiptap-family editor.

**Attachments.** Only **images** may embed inline in descriptions and comments, with wrapping options: inline with text-wrap left or right, or full-width block. Documents, videos and every other file type are list-style attachments only — never inline. Files live in object storage; events carry references. Every uploaded file is hashed (SHA-256) as it arrives and the hash is kept with it, so that a claim can point at a file that is verifiably the one attached rather than merely a file that is present. An **uploaded** attachment on a transition carrying a `require-evidence` rule (§4) serves as its evidence.

**Google Drive files may be attached as references.** They are picked through Google's own file picker under the per-file `drive.file` scope, on the Google sign-in the workspace already uses, and what is stored is a pointer — the file's id, the name and type it had when picked, its view link, and the moment of capture. The bytes are never copied. Because the product cannot vouch for content it does not hold, and a Drive file can be edited, renamed, moved, re-permissioned or deleted after it is attached, three rules follow. A Drive reference can never satisfy `require-evidence`: evidence must be an uploaded file, and a transition naming a reference as its evidence is refused with a reason that says why and what to do instead. A reference renders as an external pointer bearing its last-seen name and its capture date, visibly distinct from a file the board holds; if the link later stops answering, that is shown as unknown — never as absent, never as fine. And a reference is never inline-embeddable: inline embedding stays uploads-only and images-only, so a picked Drive image joins the attachment list, not the document.

**Workflows** attach to ticket types — a workspace default per type, overridable per project. A ticket's status is always a state of its attached workflow; statuses are never free text.

## 3. The event ledger and projections

**The ledger** is an append-only log per workspace, stored in Postgres. An event carries: a client-generated ULID; the workspace and entity it touches; the event type and payload; the **actor**; the **origin device**; the **client wall-clock time** (the user's claim about when) and the **server receive time** (the system's fact about when) — both kept, because both are true in different senses, and conflating them is a small lie; and a per-entity sequence number the server assigns at ingest.

**Event types** are a closed, versioned vocabulary — `ticket.created`, `ticket.transitioned`, `ticket.assigned`, `ticket.field_set`, `ticket.reparented`, `comment.added`, `attachment.added`, `workflow.defined`, `visibility.set`, and kin. Unknown types are refused at ingest: the ledger accepts only what it can later replay.

**Projections** are server-maintained read models in ordinary Postgres tables — current ticket state, board columns, list groupings, per-project activity, the attention strip, calendar spans, the search index — rebuilt deterministically from the ledger and rebuildable from scratch. A scheduled verifier re-derives projections and diffs them against the ledger to prove none has drifted: the freshness gate reborn. Clients read projections, never raw ledger — except the history view, which *is* the ledger, filtered.

**Realtime:** the server pushes new events over WebSocket to subscribed clients; offline apps catch up from their last sequence number on reconnect.

**Schema evolution:** events are never rewritten. New needs get new event versions, and projections handle all versions forever. Snapshots bound replay cost per entity.

## 4. Workflow engine and builder

**A workflow definition is data, not code:** named **states**, each tagged with a category — *open*, *active*, or *terminal* — plus **transitions** (from-state → to-state, or "from any") and **rules** attached to transitions. Categories are what the rest of the system reads: rollup progress counts terminal children; the attention strip watches active states; "open children" means non-terminal. Every workflow must have at least one terminal state, and the builder refuses to publish one with an unreachable state or an unenterable terminal state.

**The rule vocabulary** is closed and versioned — no user code, so refusals stay provable:

- **restrict-to** — only the assignee, a role, or named people may perform the transition
- **require-comment** — the transition must carry a comment
- **require-evidence** — the transition must carry an *uploaded* attachment (never a Drive reference, per §2: the board can only vouch for a file it holds)
- **require-field** — a named field must be set before the transition (e.g. a due date before entering an active state)
- **require-different-user** — four-eyes: the actor must differ from whoever performed a named earlier transition

Rules refuse with the reason named. **Two invariants sit above all workflows and cannot be authored away:** provenance on everything, and the parent-terminal-with-open-children refusal.

**The builder** is a Jira-style canvas: states as nodes, transitions as drawn arrows, rules picked from the vocabulary on each transition, live validation, publish when clean. **Templates** — simple Kanban, errand-with-waits, approval chain, and kin — are ordinary pre-authored workflows, cloned and edited like any other. There is no AI drafting of workflows; that was considered and declined.

**Changing a live workflow:** definitions are themselves events (`workflow.defined` v1, v2, …). A new version applies to all tickets of its type — and if it removes or renames states, the builder demands a state mapping at publish time and refuses to strand any in-flight ticket without one.

## 5. Sync, offline, and contested claims

**The apps (mobile, desktop) hold a visibility-scoped replica:** projections and recent ledger history for exactly what that user may see, plus an **outbox**. An offline edit runs through the same rule engine against the local replica — instant, honest feedback — then enters the outbox and applies to local projections rendered as a **claim in transit**: visually distinct, never shown as settled fact. The board cannot lie about what has actually been accepted.

**Sync up:** outbox events go to the server in order; the server's rule engine re-validates each against authoritative state.

- **Accepted** → sequenced, broadcast; the client's pending mark clears.
- **Refused** (a rule or the world changed while the client was offline) → a **contested claim**: the event attaches visibly to its ticket with what was claimed, by whom, when, and the named rule it now violates, and surfaces in the claimant's attention strip. Resolution is human: redo it legally, convert it to a comment, or discard — and the discard is itself a recorded event. Nothing silently vanishes; nothing silently lands.

**Concurrent non-rule conflicts** (two people set the same field while apart): the server sequences both; the later claim wins the projection and the earlier remains in history. Provenance means losing a race never means being erased.

**Sync down:** clients catch up from their last sequence number over the same WebSocket. Visibility changes propagate; revocation purges the item from the replica on next sync.

**The web client** is online-only — the same rule engine runs for instant feedback, but every action round-trips.

**Clocks:** client wall time is recorded as the claim it is; ingest flags gross skew against server time, keeping both.

## 6. Permissions, visibility, and auth

**Workspace roles:** owner, admin, member, guest. Admins manage ticket types, workflows, projects and people; members work; **guests** are external collaborators — the accountant, the supplier — who see only tickets explicitly shared with them. Projects carry their own member list with a project-admin flag.

**Enforcement is server-side on every read and every sync-down.** A replica only ever contains what its user may see, so a stolen phone leaks nothing beyond its owner's own view. Visibility changes are events (`visibility.set`), attributed like everything else. Editing visibility takes project-admin rights or ticket creatorship.

**Visibility never makes the board lie:**

- Derived parent progress is computed server-side over *all* children. A viewer who cannot see two of them reads "5 of 8 done · 2 restricted" — true counts, restriction named, nothing pretended absent.
- A visible child under a restricted parent shows a "restricted parent" placeholder — existence, no title — rather than posing as parentless. Within a workspace, the existence-leak is the honest trade; full concealment was considered and declined.
- Provenance is never redacted from someone who can see the ticket: if you can see the state, you can see who claimed it and when.

**Auth is phone-first for the audience:** phone OTP, email magic link, **Google OAuth**, and passkeys once a device has a session. No passwords. Invites travel as links or QR from an admin. OTP delivery in India runs through a DLT-registered SMS provider — a known errand class; the convenience-corner tracker already tracks its twin.

## 7. Views, search, testing, and dogfooding

### Views

- **Board** — columns are exactly the attached workflow's states, never invented. Cards carry provenance on hover/tap, pending-claim badges, and derived progress on parents.
- **List** — Asana-shaped: information **columns customizable per user** (status, assignee, dates, type, custom fields, progress — chosen and ordered freely); **nested ticket rows** with expand/collapse down the hierarchy; a **"Recently assigned" section pinned at the top**; **switchable grouping** — by epic, by status, by assignee, by type, or flat. Column and grouping choices are per-user, per-project view preferences, not data: they can change how truth is arranged, never what it is.
- **Calendar** and **Timeline** — bars and markers drawn *only* from claimed dates. An undated ticket is absent; a date renders attributed ("needed by 30 Aug — Kiro's claim"); nothing estimates, extrapolates or back-fills.
- **My Work** — cross-project: assigned to me, my claims in transit, my contested claims.
- **Attention strip** — computed, never authored, shown above Board and My Work: blocked items, tickets sitting in an active state past a workspace-set staleness threshold, approaching claimed dates, contested claims.

### Search and filtering

Server-side full-text search across titles, descriptions and comments, maintained as a projection. Composable filters — assignee, collaborator, type, state, state category, project, claimed dates, custom fields — combine with text search; scope is per-project or cross-project from My Work. Per-user **saved filters**. Offline apps search their local replica and say so ("searching offline copy").

### Reporting and notifications

Reporting v1 is derived counts and the ledger itself — activity, history. No velocity, no burndown forecasts, nothing the record does not contain. Notifications — assignment, @mention, contested claim, attention events — push on the apps, inbox everywhere.

### Testing discipline

Inherited whole from the base:

- Every refusal in the rule vocabulary is **proven against planted defects** before it is trusted. One shared fixture suite runs against the rule engine in client and server builds, so the two can never quietly disagree.
- Projection determinism is tested by **rebuild-and-diff**.
- Sync gets a **scripted dual-client harness**: two replicas diverge offline, sync, and the outcome — including every contested claim — is asserted exactly.
- Each client gets end-to-end smoke flows.
- `Features.md` and `test-cases/` move in the same change set as the work, per the workspace convention.

### Dogfooding

Two proving grounds, both real:

1. **A Convenience Corner workspace** holding the shop's actual errands — registrations, filings, questions to counterparties — on the errand-with-waits template, with the accountant as a guest.
2. **A Gisik Nokma workspace** managing the product's own build as soon as the product can hold it.

## Out of scope

- AI-assisted workflow drafting (considered, declined — the builder and templates are the whole authoring story)
- Velocity, burndown, or any forecast reporting (contradicts "nothing is invented")
- Offline capability in the web client
- A native (non-webview) rich-text editor on React Native
- Full concealment of restricted parents (the placeholder existence-leak is the accepted trade)
- Promoting a Google Drive reference into an uploaded copy (a reference stays a reference; whoever needs a file as evidence uploads it)
- Open-sourcing, in any form (closed source is decided)
- Branding and wordmark — a later design session, not this spec
- Hosting provider, region, and pricing — implementation-plan decisions, constrained by the audience (India-reachable, phone-first) but not settled here

## Constraints carried from the base

`reference/` stays frozen; corrections happen upstream and are re-snapshotted with a new commit reference. `Features.md` and `test-cases/` stay in sync with reality in the same change set. Checks are proven against planted defects before they are trusted. Commits are prose that says what was found and why it matters. One PR per change, branched off `main`, merged only with explicit approval.

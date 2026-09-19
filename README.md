# Gisik Nokma

*The keeper of memory.* From Garo: **gisik**, mind or memory; **nokma**, the custodian who holds
things in trust.

Gisik Nokma is a work tracker for small teams who are not software teams. A design studio of five. A
plumbing business with an office helper and two people on the road. A shop with twenty-three errands
running at once. It keeps track of jobs, who is doing what stage of them, and what happened to them —
and it is unusually careful about the difference between something it knows and something it is
guessing.

## The one idea worth knowing

**Nothing in Gisik Nokma is presented as a plain fact floating on the screen.** Every value carries
who said it and when. A due date does not say "30 August"; it says 30 August, and whose claim that is.
A card does not just say which column it is in; it will tell you who moved it there and on what day.

That sounds fussy until the first time it matters — when two people remember a deadline differently,
or when somebody wants to know who marked a job finished. Then it is the whole point.

The same instinct runs through the rest of it. If a job has eight sub-jobs and two of them are hidden
from you, it says **"5 of 8 done · 2 restricted"** rather than quietly showing you a smaller, tidier,
wrong number. If a calendar month is empty, it tells you *which kind* of empty, and it claims only the
two kinds it can tell apart: nothing has a claimed date, or every claim in it is behind a date field
you switched off in the legend. A month your filter emptied gets the first sentence, not a third —
once the grid is drawn, a claim the filter removed and a claim nobody made look the same. A file linked
from Google Drive is always described as **unknown**, never "still fine", because the product genuinely
does not know.

If you have spent twenty years with spreadsheets that lie to you confidently, this will feel unusual.
It would rather tell you it does not know.

## Who it is for

People who run the work, not people who run software. There is deliberately no burndown chart, no
velocity score, no sprint report, and there is a check in the product that stops those from being
added. It will show you what people claimed and when. It will not forecast anything or score anyone's
speed.

## What it can do today

- **Sign in without a password** — a link to your email, your Google account, or your device's
  fingerprint/face unlock. There is no password anywhere in the product.
- **Set up your business** — create a workspace, invite people into it with one of three roles, and
  design your own set of stages for work to move through, with rules on the moves between them.
- **Follow work** — a backlog of work that has not started, and of work sent back to it, then a
  board, a table, a month calendar and a week-by-week timeline of one project's work. What needs your
  attention is on **My Work**, not on a project's tabs.
- **Move work along** — open a job, press Move, pick the next stage. Your rules decide what is
  offered and what it asks for first.
- **Control who sees what** — per job, down to a named list of people, with sub-jobs inheriting from
  the job above unless they say otherwise.
- **Keep a complete history** — every change to every job, in order, with who and when, and *two*
  clocks: what the person's device thought the time was, and what the system recorded.
- **Work with no signal** — on the phone and desktop apps, which each keep a copy on the device.
  Changes queue up and go when you reconnect.

## What it cannot do yet

This is the part a marketing page would leave out. Read it before you decide anything.

- **You cannot create a project.** There is no button anywhere in the product that makes one. A brand
  new workspace comes with stages, job types and you as its owner — and nowhere to put a job. Until
  this is built, projects have to be put there for you.
- **You cannot assign a job to anybody on the phone or desktop apps.** The website can, from the job
  sheet's **Assignee** picker — which also offers **Unassigned**, so an assignment can be cleared as
  well as set. The board shows who a job is on, the Inbox tells you when you have been assigned
  something, and the table can group by person.
- **You cannot set a due date.** The calendar, the timeline and the whole "due soon" list are built
  around claimed dates, and there is no control that claims one.
- **There is no comment thread on the web.** The description *is* writable — the writing box handles
  formatting and mentions and is connected to the job screen, though a file dropped into it is refused
  rather than quietly lost. A comment is different: the writing box takes a description and not a
  comment, and a Move's *required* comment is recorded on the Move. A comment can still reach you — an
  Inbox row quotes the opening of the comment or description that mentioned you, and that is the whole
  of it. The phone app has a Comment button on a job and the website does not.
- **No screen on the web or the desktop searches inside a job's description or its comments.** The
  full-text search that does exists — the phone app's offline search reads comment bodies, and an MCP
  client's `search_tickets` reads titles, descriptions and comments. What the web itself offers is a
  **Search the board** box on a project's board, which matches the titles of the cards already loaded
  there, and the help's own search over this manual and the FAQ.
- **Nothing links to the settings screens.** The stage builder and the job-type editor — the screens
  that make the product yours — can only be reached by typing their address into the browser.
- **Notifications never leave the app.** No email, no text message, no push. The only email Gisik
  Nokma sends is your sign-in link. If nobody opens the Inbox, nobody finds out about anything.
- **Sign-in by phone number does not work.** There is no SMS channel at all — sending a code to an
  Indian number needs a DLT-registered sender and template, which is a registration rather than a
  setting — so the sign-in screen offers **no Phone tab**. There is nothing to press that then fails.
  Use **Email link**, Google or a passkey.

There is also one thing that surprises everybody, and it is a decision rather than a gap: **the whole
product runs on Indian time, for everybody, everywhere.** A day starts at midnight in India, not
midnight where you are. In London the product's "today" flips over at about half past six in the
evening; in Los Angeles, late morning. Every due date and every "today" means India's day. The
reasoning is that everyone reading the same record sees the same day for the same moment. It is
defensible and it will still catch you out.

## Where to go next

- **[Instruction manual](docs/manual.md)** — the walkthrough. Start here if you are setting the
  product up or using it for the first time. It assumes nothing.
- **[FAQ](docs/faq.md)** — "can I do X", edge cases, and what to do when something looks wrong.
- **[Coverage map](docs/product-coverage-map.md)** — how those two documents were checked against
  `Features.md`, feature by feature, including what they deliberately leave out and why.

Both were written by working through the actual screens and writing down what is there, including the
parts that are not. Where an answer is "no, it doesn't do that", they say so rather than sending you
hunting for a button that was never built. The gap list above is not an apology; it is the same
honesty the product applies to its own data, applied to itself.

---

# For developers

## Workspace layout

pnpm workspaces + Turborepo (Node 22, TypeScript strict, ESM, Vitest):

| Package | What it is |
|---|---|
| `packages/domain` | Shared types and zod schemas: the event envelope, entity kinds, id helpers, the versioned event-type registry. |
| `packages/rule-engine` | Pure validation, no I/O: `evaluateEvent` returns Accept or a Refusal that names its rule. |
| `packages/app-core` | Client-side core shared by every app — view models, the offline `DataSource` contract, and the `./online` subpath that is the one module allowed to speak HTTP or WebSocket. |
| `packages/sync-client` | The offline replica and the sync protocol the native apps run on. |
| `packages/ui` | Shared components and design tokens. |
| `packages/editor` | The rich-text/mention editor. |
| `packages/mcp-server` | An MCP server, over stdio, that lets an assistant read and change a board **as you** — the same visibility and workflow rules, the same refusals, and every write it makes carries `origin: 'mcp'` so a machine's claim is distinguishable from yours. |
| `apps/server` | Fastify server; the append-only Postgres event ledger and its projections; migrations via node-pg-migrate. |
| `apps/web` | The Next.js 15 App Router shell. |
| `apps/mobile` | Expo/React Native. |
| `apps/desktop` | Tauri + Vite. |

## Getting it running

```
docker compose up -d          # Postgres 16 on port 54329
pnpm install
pnpm turbo run build test
```

The gate is `pnpm turbo run build test typecheck`, plus six repository-check jobs in
`.github/workflows/ci.yml` — `check:env`, `check:runbook`, `check:citations`, `check:help`,
`check:tasks` and `check:migrations`.

**If `pnpm install` exits 1 with no output at all, check `node -v` first.** `engine-strict=true` makes
the declared Node range binding, and pnpm's refusal under a wrong version is completely silent — the
natural readings ("the lockfile is broken", "the registry is down") are wrong every time. `.nvmrc`
says 22; `nvm use` is the fix.

## Conventions

- `Features.md` is the catalogue of every feature and sub-system, and `test-cases/` the catalogue of
  every scenario worth covering. Both stay in sync with the code **in the same change set**, never in
  a follow-up.
- **Never pipe a test or build run into `head`** (or `grep -m N`). It closes the pipe, the runner's
  parent dies on EPIPE, and its workers are orphaned at `ppid=1` spinning at about a core each — this
  cost the machine a forced restart on 2026-09-04. Use `| tail -N`, or redirect to a file and read it.

## The base

`reference/convenience-corner-tracker/` is a verbatim snapshot of the project tracker built inside the
[convenience-corner](https://github.com/bkirosangma/convenience-corner) repository (snapshot at commit
`24e2240`, 2026-08-19). Open `reference/convenience-corner-tracker/tracker.html` in a browser — it runs
standalone from a `file:` URL with its snapshot data, four views included (Focus, Board, Backlog,
Calendar).

The generator (`reference/convenience-corner-tracker/tools/build_tracker.py`) is included as
reference, with its tests beside it (`tools/test_build_tracker.py`, 73 of them); it reads that
repository's origin files (README roadmap, `test-cases/`, `operations/`, `tokens.json`) and will not
run here. That is expected — the snapshot is provenance, not a dev environment.

`reference/design-docs/` holds the three documents that designed the base: the tracker itself, the
calendar view, and the calendar's implementation plan.

**`reference/` is frozen.** It is never edited here — corrections happen upstream and get re-snapshotted
with a new commit reference.

## What the base proved

These are the ideas the product generalises, and they are still the ideas it is built on:

1. **Origins own facts; the board owns attention.** Task state lives in the files that own the work;
   the board may only say *later / next / in-progress / blocked* about them. `done` is not a legal
   value on the board — completion is recorded at the origin, so the board cannot claim finished work
   that isn't.
2. **The view is generated; attention is authored.** A deterministic generator joins the origins with
   one small authored file, and a freshness gate (`--check`) refuses a stale view.
3. **Refusals over good intentions.** The generator rejects unknown ids, flags on done items,
   contradictions between authored claims (a due date past the record's own needed-by week), and
   half-recorded facts.
4. **No invented data, anywhere.** The calendar renders only real dates — authored plans, actual
   record spans, derived waits — and an undated item is absent, not estimated. Deadline markers are
   labelled as the record's *claim*, never as "due".
5. **Checks are proven against planted defects** before they are trusted.

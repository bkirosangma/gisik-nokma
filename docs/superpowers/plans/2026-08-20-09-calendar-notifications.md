# Calendar, Timeline & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Time-honest views (month Calendar, week-column Timeline) drawn only from claimed dates, plus a server-side notification engine (assignment, @mention, contested claim, attention transitions) with per-user storage, an inbox everywhere, saved filters, and a reporting scope guard — nothing invented, everything attributed.

**Architecture:** Client side, two pure view-models in `packages/app-core` fold `TicketState` date claims (`startDate`/`dueDate` `FieldClaim`s) into calendar weeks and timeline bars — a bar exists only when both claims exist; everything else is a marker or a side-list entry, never invented geometry. Server side, a fan-out listener on Plan 1's `onEventCommitted` hook plus a deterministic, idempotent sweep job write per-user rows into a `notifications` table (server-owned rows, NOT ledger events — a notification is a message to a person, not a fact about the work), delivered through a `NotificationTransport` seam whose only v1 implementation is in-app. The `startDate` built-in a Timeline bar needs is **Plan 3's** (its own text ships the field beside `dueDate`, sharing the one `dueDateValueSchema`; the orchestrator records this as Plan 3's startDate amendment); this plan verifies it landed, pins the day-claim shape its readers assume, and adds the two shared fixtures that run a built-in day claim end to end.

**Tech Stack:** TypeScript strict / Node 22 / pnpm 9 / Turborepo; Fastify 5 + Postgres 16 (`pg`, node-pg-migrate) on the server; zod validation; `ulidx` ids; React 18 function components in `packages/app-core` (tested with Vitest + jsdom + @testing-library/react); Next.js 15 shell (`apps/web`, Plan 6's) for web wiring.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — §7 (Views: Calendar and Timeline; Reporting and notifications; Search and filtering), honesty invariant 4 ("Nothing is invented"), invariant 1 (provenance floor). Series contract: `docs/superpowers/plans/2026-08-20-00-series-coordination.md` (amendments 9–17 bind this plan). Precedent: `reference/design-docs/2026-08-19-tracker-calendar-design.md` (read-only) — the base calendar's "dated items only / an undated item is absent, not estimated" discipline, generalised here.

**Series position:** Plan 9 of 11. Runs after Plans 1–5, in parallel with Plans 6/7/8. **Consumes** — from Plan 1: `EventEnvelope`, `SubmittedEvent`, `newUlid`, `IngestService.onEventCommitted(listener): () => void` (fires only after a live commit, never on projection rebuild — which is exactly why notifications built on it can never double on replay), `createTestDatabase()`, and the IST day helpers `IST_TIME_ZONE` / `IST_OFFSET_MINUTES` / `IST_DAY_REGEX` / `istDayOf(instant)` / `istDayBounds(day)` (Plan 1 Task 4a, `packages/domain/src/ist-day.ts` — dependency-free, so app-core imports it as freely as the server does). From Plan 2: `WorkflowDef` (with `initialStateId`, amendment 3; optional `blocked` on states, amendment 9), `StateCategory`, `getWorkflowDefFromProjection(db, workflowId, version?)`, the fixture harness in `packages/rule-engine/src/fixtures/harness.ts`. From Plan 3: `BUILTIN_FIELD_IDS` (four elements — `'title', 'description', 'dueDate', 'startDate'`; Plan 3's own text, verified by Task 1 Step 1), `dueDateValueSchema` (the ONE day-claim schema BOTH built-ins use — there is no separate start-date schema, by Plan 3's deliberate design), `TicketState`, `FieldClaim`, `applyTicketEvent`, `makeEnvelope`, `checkTicketFieldSet` + `refuse`/`fieldKindRefusal`, `getTicketStateFromDb(db, workspaceId, ticketId)`, the `proj_tickets` table. From Plan 4: `Queryable`, `canSee(db, userId, ticketId)`, `Auth`/`createAuth`, `makeRequireSession`, `registerAuthRoutes`, `signInWithPhone`, `LogOtpSender`. **From Plan 5 (`2026-08-20-05-api-realtime-search.md`, its Tasks 3–4) — the single origin of both attention thresholds, which this plan's sweep now reads instead of carrying its own copies:** the `workspace.settings_set` v1 event (payload `{staleDays?, dueSoonDays?}`, partial-update, owner/admin only), `DEFAULT_STALE_DAYS = 7` / `DEFAULT_DUE_SOON_DAYS = 7` and `type WorkspaceSettings = { staleDays; dueSoonDays; provenance }` from `packages/domain/src/events/workspace-settings.ts`, the `proj_workspace_settings` projection and its reader `getWorkspaceSettings(db: Queryable, workspaceId: string): Promise<WorkspaceSettings>` from `apps/server/src/projections/workspace-settings.ts`, and the `makeCommitted`/`applyCommitted`/`resetEntitySeqs` test helpers from `apps/server/test/helpers/apply.ts` (Plan 5 Task 4) that this plan's sweep tests seed settings with. **This plan declares no threshold constant of its own, under any name.** From the amendments (Plans 5/6/7/10 written in parallel — pinned shapes, assumptions flagged in Open questions): `DataSource` (am. 10), `packages/ui` tokens (am. 11), the mention node `{userId}` and `docToPlainText` (am. 12), `/v1/me/preferences` (am. 14), `claim.contested` (am. 16). **Produces** (exact signatures in task Interfaces blocks): `extractMentionedUserIds`; the notification vocabulary (`NotificationKind`, strict payload schemas, `Notification`); the `notifications` table + store; `NotificationTransport` + `createInAppTransport`; `createNotificationFanout`; `runNotificationSweep`; `GET /v1/me/notifications`, `GET /v1/me/notifications/unread-count`, `POST /v1/me/notifications/:id/read`; `CalendarView`, `TimelineView`, `InboxView`, `UnreadBadge`, `SavedFiltersMenu` and their pure view-models.

## Global Constraints

Copied from the series contract and the spec; every task's requirements implicitly include this section.

- MONOREPO: pnpm workspaces + Turborepo, TypeScript strict, Node 22 LTS (`>=22.0.0 <23`), pnpm 9. Package scope is `@gisik-nokma/*` (coordination decision 1).
- TESTING: Vitest. Every honesty guarantee is proven against a planted defect before it is trusted (spec invariant 6).
- IDS: ULID via `ulidx`.
- EVENT ENVELOPE (exact, from `@gisik-nokma/domain`): `{ id, workspaceId, entity: { kind: 'workspace'|'project'|'ticket'|'workflow'|'ticket-type'|'membership', id }, type, version, payload, actorId, origin: 'web'|'mobile'|'desktop'|'server', clientTime, serverTime, seq }`.
- TIME IS `Asia/Kolkata` (owner decision, 2026-08-20 — coordination doc, "Owner decision: time is Asia/Kolkata"). Binding on this plan, which is the plan most exposed to it:
  - **A day starts at IST midnight.** `dueDate`/`startDate` are day claims (`YYYY-MM-DD`), so "which calendar cell does this claim fall in", "due today", "overdue", "how long has this been in flight", and the window a notification sweep calls *today* all turn on where the day starts. It starts at IST midnight — never the server's locale, never the viewer's device.
  - **The helpers are Plan 1's, and this plan rolls none of its own.** `istDayOf(instant): string` converts an absolute instant to its IST day; `istDayBounds(day): { startUtc, endUtc }` gives the **half-open** `[startUtc, endUtc)` UTC interval for one IST day, compared as `>= startUtc AND < endUtc`. `IST_DAY_REGEX` is the one statement of the `YYYY-MM-DD` shape; `IST_TIME_ZONE` is the one origin of the string `'Asia/Kolkata'`. All four live in `packages/domain/src/ist-day.ts`, which pulls in **no dependencies at all** — no zod, no date library, no timezone database — precisely so every consumer (server, web, replica) can import the same code.
  - **Day-vs-day comparisons compare `YYYY-MM-DD` strings** (both sides already IST, both already lexicographically ordered). **Day-vs-instant comparisons use `istDayBounds`**, half-open. Nothing calls `Date.parse` on a day claim, and nothing does raw millisecond division to count days.
  - **Rendering:** any timestamp a view shows is formatted with `IST_TIME_ZONE` imported from the domain — never the literal string `'Asia/Kolkata'` written into view code, never the device's locale.
  - Both ledger clocks are `timestamptz` absolute instants (Plan 1 Task 6), so a claim submitted as `…+05:30` reads back through `rowToEnvelope` as the equivalent `…Z`. The claimed instant and the received instant remain two separate facts; only the device's offset *label* is gone.
- Spec invariant 4, verbatim: "**Nothing is invented.** No estimated dates, no fabricated progress. An undated item is absent from the calendar; a deadline renders as the claim it is — attributed, never presented as system truth."
- Spec §7 Calendar/Timeline, verbatim: "bars and markers drawn *only* from claimed dates. An undated ticket is absent; a date renders attributed ('needed by 30 Aug — Kiro's claim'); nothing estimates, extrapolates or back-fills."
- Spec §7 Reporting, verbatim: "Reporting v1 is derived counts and the ledger itself — activity, history. No velocity, no burndown forecasts, nothing the record does not contain."
- Amendment 14: preferences (saved filters among them) are server-owned per-user rows, not ledger events — "view preferences arrange truth; they are not history." Notifications get the same treatment for the same reason: they are messages to a person, not facts about the work; the facts they point at stay in the ledger.
- Amendment 11: `packages/ui/src/tokens.ts` is the one colour origin — no colour literal anywhere else in any client.
- DATABASE: `snake_case` tables and columns (workspace coding standards); migrations via node-pg-migrate in `apps/server/migrations/`.
- `reference/` stays frozen. `Features.md` and `test-cases/` move in the same change set as the work. Commits are prose that says what was found and why it matters. One PR per change, branched off `main`, merged only with explicit approval.
- ESM with NodeNext resolution: relative imports carry `.js` suffixes in `packages/domain`, `packages/rule-engine`, `apps/server` (Plan 1's convention). `packages/app-core` compiles for bundlers (Plan 6's convention); its relative imports are suffix-free. If the scaffold you find differs, follow what is there.

## Parallel-write posture (read before executing anything)

Plans 5–11 were written in parallel against the coordination amendments. Two consequences for the executor:

1. **Locate before you create.** Several files this plan touches may already exist by execution time (Plan 6's `packages/app-core` scaffold, Plan 7's `docToPlainText`, Plan 6's `FilterSpec`). Steps that might collide open with a **Guard** line telling you exactly what to `grep`/`ls` for and what to do in each case. Adapt import specifiers and file paths to what you find; never change pinned behavior or names from the amendments.
2. **The amendments win.** Where this plan's assumption disagrees with a sibling plan's landed code AND with the coordination doc, the coordination doc wins; where the coordination doc is silent, the landed code wins and the divergence goes to the orchestrator (Open questions lists the known ones).

## File Structure

```
packages/domain/
  src/ist-day.ts                    # READ ONLY (Plan 1's Task 4a) — IST_TIME_ZONE, IST_DAY_REGEX, istDayOf, istDayBounds
  src/ticket-types.ts               # READ ONLY (Plan 3's) — BUILTIN_FIELD_IDS + dueDateValueSchema already carry startDate
  src/doc-text.ts                   # NEW (GUARDED — skip if Plan 7 landed it) — docToPlainText (amendment 12)
  src/doc-mentions.ts               # NEW — extractMentionedUserIds JSON-walker
  src/notifications.ts              # NEW — NotificationKind, strict payload schemas, Notification, parseNotification
  src/index.ts                      # MODIFY — re-export the new modules
  src/ticket-types.test.ts          # MODIFY (Plan 3's) — APPEND Plan 9's day-claim consumption pin (adds nothing Plan 3 already pins)
  src/doc-text.test.ts              # NEW (guarded with doc-text.ts)
  src/doc-mentions.test.ts          # NEW
  src/notifications.test.ts         # NEW

packages/rule-engine/
  src/checks/fields.ts              # READ ONLY (Plan 3's) — the merged dueDate||startDate branch already exists
  src/checks/fields.test.ts         # READ ONLY (Plan 3's) — its startDate cases already pin the refusal strings
  fixtures/field-set-refuses-a-malformed-start-date.json   # NEW — a built-in day claim through the shared runner (Plan 3's field-set-* trio is custom-field ground only)
  fixtures/field-set-accepts-a-start-date-claim.json       # NEW — accepting twin

apps/server/
  migrations/<timestamp>_notifications.sql                 # NEW — notifications table
  src/notifications/store.ts        # NEW — insert (dedupe), list (cursor), markRead, unreadCount
  src/notifications/transport.ts    # NEW — NotificationTransport, createInAppTransport, deliverToAll
  src/notifications/fanout.ts       # NEW — createNotificationFanout (assignment/mention/contested)
  src/notifications/sweep.ts        # NEW — runNotificationSweep (date-approaching, stale-ticket); windows resolved per workspace from Plan 5's getWorkspaceSettings
  src/projections/workspace-settings.ts  # READ ONLY (Plan 5's Task 4) — proj_workspace_settings + getWorkspaceSettings, the one origin of staleDays/dueSoonDays
  src/tools/sweep-notifications.ts  # NEW — CLI entry for the periodic job
  src/routes/notifications.ts       # NEW — /v1/me/notifications routes
  src/index.ts                      # MODIFY (Plan 1's, locate by grep) — wire fan-out onto onEventCommitted
  package.json                      # MODIFY — "sweep:notifications" script
  test/notifications/store.test.ts  # NEW
  test/notifications/fanout.test.ts # NEW
  test/notifications/sweep.test.ts  # NEW
  test/routes/notifications.test.ts # NEW

packages/app-core/                  # Plan 6 owns the real scaffold; Task 8 Step 0 creates a minimal one iff absent
  src/claims/dates.ts               # NEW — DAY_MS, dateMs, isoDate, addDays, mondayOnOrBefore, monthGridWeeks
  src/claims/ticket-dates.ts        # NEW — TicketDatesInput, DateClaimView, dateClaimOf, titleOf
  src/claims/claim-labels.ts        # NEW — formatClaimDate, dueClaimLabel, startClaimLabel, barProvenance, copy constants
  src/hierarchy/epic-ancestor.ts    # NEW — epicAncestorOf
  src/filter/filter-spec.ts         # NEW (GUARDED — consume Plan 6's if landed) — FilterSpec, matchesFilter
  src/calendar/calendar-model.ts    # NEW — buildCalendarModel (pure)
  src/calendar/CalendarView.tsx     # NEW — month grid component
  src/timeline/timeline-model.ts    # NEW — buildTimelineModel (pure)
  src/timeline/TimelineView.tsx     # NEW — week-column component
  src/inbox/gateway.ts              # NEW — NotificationsGateway interface
  src/inbox/format.ts               # NEW — notificationHeadline/notificationBody (per-kind copy)
  src/inbox/icons.tsx               # NEW — per-kind inline SVG glyphs (currentColor only)
  src/inbox/UnreadBadge.tsx         # NEW
  src/inbox/InboxView.tsx           # NEW
  src/preferences/preferences-gateway.ts  # NEW (GUARDED) — PreferencesGateway interface
  src/filters/saved-filters.ts      # NEW — SavedFilter, parse/load/save/delete
  src/filters/SavedFiltersMenu.tsx  # NEW
  src/index.ts                      # NEW or MODIFY — exports
  test/reporting-scope-guard.test.ts # NEW — forbidden-vocabulary scan
  (each src module gains a sibling .test.ts/.test.tsx)

apps/web/                           # Plan 6's shell — Task 14 has an explicit precondition on its existence
  src/lib/notifications-gateway.ts  # NEW — HTTP implementation of NotificationsGateway
  app/inbox/page.tsx                # NEW — inbox route
  (nav layout)                      # MODIFY (locate by grep) — UnreadBadge in the shell nav

Features.md                         # MODIFY — §11 "Calendar, timeline & notifications" (same change set)
test-cases/11-calendar-notifications.md  # NEW — cases 11.x
```

**In scope by owner sign-off (2026-08-20), so nobody trims it back out:** custom `date`-kind fields render as claims on the Calendar and the Timeline — attributed, absent when unclaimed, labelled with the field's own name, and never forming a bar (Open questions 15 carries the full ruling; Tasks 8–11 implement it).

**Out of scope, stated so nobody adds it:** timeline dependencies/critical-path (not in spec); drag-to-reschedule (the page renders; events author — the base's split, kept); spans drawn between a custom date field and anything else (a bar needs the `startDate`/`dueDate` pair — see above); custom date fields in the attention sweep (Task 6 watches `dueDate` alone, deliberately); velocity/burndown/forecast anywhere (spec Out of scope, guarded by Task 15's scan); web push and native push transports (Plans 10/11 — the seam ships here); notification e-mail digests.

---

### Task 1: Verify Plan 3's `startDate` built-in, and pin the day-claim shape the views read

A Timeline bar needs a start, and invariant 4 forbids inventing one (back-filling "start = due minus a guess" is exactly the estimated date the spec bans). So the start is what the due already is: a claim — `{date, note?}` set via `ticket.field_set`, carrying per-field `FieldClaim` provenance like every other field.

**Plan 3 owns that field and already ships it** — read `docs/superpowers/plans/2026-08-20-03-tickets-hierarchy.md` (its Task 7, `checkTicketFieldSet`) if you want the source. `BUILTIN_FIELD_IDS` is four elements; `checkTicketFieldSet` accepts and refuses `startDate` on ONE branch merged with `dueDate`, reusing ONE schema — `dueDateValueSchema` — because the two day claims have an identical shape and a second copy is a second thing to drift. Plan 3's own suite pins both the legal and the malformed case, including the refusal string `"Start date" needs a day in YYYY-MM-DD form (a note is optional).`

So this task **defines nothing**. It does three things this plan genuinely needs before Tasks 8–11 read those claims:

1. **Verifies** the built-in landed, and stops the plan rather than silently building on a three-element constant.
2. **Pins the reader contract** — the day-claim shape `dateClaimOf` (Task 8) destructures, held against the built-in's own schema in one place, so a future widening fails here instead of inside a Timeline bar.
3. **Adds the two shared fixtures** that run a built-in day claim end to end through the fixture runner in every build. Plan 3's `field-set-*` fixture trio (`field-set-unknown-field`, `field-set-kind-mismatch`, `field-set-legal`) is entirely custom-field ground — no fixture in the series exercises `dueDate` or `startDate` through the real engine, so these two are new coverage, not a second copy of Plan 3's.

**Files:**
- Read only: `packages/domain/src/ticket-types.ts`, `packages/rule-engine/src/checks/fields.ts`, `packages/rule-engine/src/checks/fields.test.ts` (all Plan 3's — this task must not change any of them)
- Modify: `packages/domain/src/ticket-types.test.ts` (Plan 3's — APPEND Plan 9's consumption pin; change none of Plan 3's existing assertions)
- Create: `packages/rule-engine/fixtures/field-set-refuses-a-malformed-start-date.json`
- Create: `packages/rule-engine/fixtures/field-set-accepts-a-start-date-claim.json`

**Interfaces:**
- Consumes: `BUILTIN_FIELD_IDS`, `dueDateValueSchema` (Plan 3, `@gisik-nokma/domain`) — `startDate` is already in the first and validated by the second; `IST_DAY_REGEX` (Plan 1 Task 4a, same package) — the one statement of the `YYYY-MM-DD` day shape, which the pin holds Plan 3's schema against; `checkTicketFieldSet` + the `field.type-mismatch` refusal string (Plan 3, `packages/rule-engine/src/checks/`); the fixture harness (Plan 2, `packages/rule-engine/src/fixtures/harness.ts` — `fixtureSchema`, `loadFixtures`, `completeEnvelope`, `buildInMemoryContext`, `assertFixtureOutcome`).
- Produces (cross-plan API): **none — no new export, no new schema, no new constant, and no second day regex.** What this task leaves behind:
  - A pinned reader contract in `ticket-types.test.ts`: the day-claim value shape is `{ date: 'YYYY-MM-DD', note?: string }`, one schema for both built-ins, and it accepts exactly the days `IST_DAY_REGEX` accepts — the same regex `app-core`'s reader imports.
  - Two shared fixtures every build's fixture runner executes.
- **Pinned for the rest of this plan:** wherever P9 code or prose validates or types a start-date value, the name is Plan 3's — `dueDateValueSchema` / `DueDateValue`. This plan introduces no start-date-specific schema or type under any name; a start date is a due date's shape wearing a different field id.

- [ ] **Step 1: Verify Plan 3's `startDate` built-in actually landed**

This is a precondition, not a change. Run each grep and compare against the expected output:

```bash
grep -n "BUILTIN_FIELD_IDS = " packages/domain/src/ticket-types.ts
grep -n "dueDateValueSchema" packages/domain/src/ticket-types.ts
grep -n "startDate" packages/rule-engine/src/checks/fields.ts
```

Expected, respectively:
- `export const BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate'] as const;` — **four** elements, in that order.
- `export const dueDateValueSchema = z.object({ … })` and `export type DueDateValue = …` — and **no** second day schema in the file (`grep -cE "startDate[A-Za-z]*(Schema|Value)" packages/domain/src/ticket-types.ts` → `0`; a hit here means someone re-added the duplicate day schema this plan deliberately does not create).
- one merged branch: `if (p.fieldId === 'dueDate' || p.fieldId === 'startDate') {` with `const fieldName = p.fieldId === 'dueDate' ? 'Due date' : 'Start date';` and `dueDateValueSchema.safeParse(value)`.

If any of the three greps disagrees, **STOP**: Plan 3's `startDate` work has not landed (or has been reverted), and every later task in this plan reads a claim that cannot be set. Hand it to the orchestrator; do not add the field here — a second definition is exactly the drift Plan 3's single branch was written to prevent.

- [ ] **Step 2: Run Plan 3's suites unchanged — the built-in is already proven**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-types.test.ts`
Expected: PASS, including Plan 3's `expect(BUILTIN_FIELD_IDS).toEqual(['title', 'description', 'dueDate', 'startDate'])`.

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/fields.test.ts`
Expected: PASS, including Plan 3's two `startDate` cases — the accepting one (`{date}`, `{date, note}`, and `null` to clear) and the planted-defect one that pins `'"Start date" needs a day in YYYY-MM-DD form (a note is optional).'` for both a timestamp and a bare string.

Nothing in this task is expected to fail against a landed Plan 3. If either suite is red before you touch anything, that is Plan 3's regression, not this plan's work — report it and stop.

- [ ] **Step 3: Append Plan 9's day-claim consumption pin to the domain tests**

Guard: Plan 3 colocates tests in `src/`; if by execution time they live under `test/`, edit the file there — `ls packages/domain/src/*.test.ts packages/domain/test/*.test.ts` to locate.

This pin belongs to Plan 9, not Plan 3: it asserts the thing *this plan's readers* assume, which Plan 3 has no reason to guarantee. There is exactly ONE statement of the day shape in the product — `IST_DAY_REGEX`, in Plan 1's `packages/domain/src/ist-day.ts` — and this pin holds Plan 3's `dueDateValueSchema` against it.

An earlier draft of this task declared a local `DATE_ONLY` literal here and another in `packages/app-core`, on the reasoning that app-core does not depend on zod and so could not import the schema. That reasoning is void: **`ist-day.ts` is dependency-free** — no zod, no date library, no timezone database — so app-core imports `IST_DAY_REGEX` as cleanly as the server does, and the duplicate literals are gone. One origin, three consumers.

Append to `packages/domain/src/ticket-types.test.ts` — **append only; change none of Plan 3's existing assertions**:

```ts
/**
 * Plan 9 consumption pin. The Calendar and Timeline read startDate and dueDate
 * through app-core's dateClaimOf, which destructures { date, note? } and
 * validates the day with IST_DAY_REGEX — the SAME regex, imported from the
 * same dependency-free module, not a second literal that could drift. This is
 * the one place the built-in's schema is held against that origin: if the
 * schema ever widens — a datetime, a range, or a second schema for startDate —
 * it fails here, loudly, instead of silently inside a bar someone trusts.
 *
 * It guards; it does not drive. It passes the moment Plan 3's startDate
 * built-in is in place. To watch it bite, loosen the schema's regex to allow a datetime
 * and re-run: the second case fails.
 */
describe('the day-claim shape Plan 9 reads', () => {
  it('asks for two day built-ins, and both are built-ins', () => {
    expect(BUILTIN_FIELD_IDS).toEqual(expect.arrayContaining(['startDate', 'dueDate']));
  });

  it('validates both of them with ONE schema — startDate has none of its own', () => {
    expect(dueDateValueSchema.parse({ date: '2026-09-01' })).toEqual({ date: '2026-09-01' });
    expect(Object.keys(ticketTypesModule).filter((name) => /^startDateValue/.test(name))).toEqual([]);
  });

  it('accepts exactly the days the reader accepts, and refuses exactly the ones it refuses', () => {
    for (const day of ['2026-09-01', '2026-12-31', '2027-01-01']) {
      expect(dueDateValueSchema.safeParse({ date: day }).success).toBe(IST_DAY_REGEX.test(day));
    }
    for (const notADay of ['2026-09-01T10:00:00Z', '01/09/2026', '2026-9-1', '']) {
      expect(dueDateValueSchema.safeParse({ date: notADay }).success).toBe(IST_DAY_REGEX.test(notADay));
    }
  });

  it('a day claim is a day, never an instant — the reader never has to guess which it got', () => {
    // istDayOf refuses a date-only string and istDayBounds refuses an instant:
    // the two shapes are not interchangeable, and Plan 1 proves it. The claim
    // side is the day side, always.
    expect(IST_DAY_REGEX.test('2026-09-01')).toBe(true);
    expect(IST_DAY_REGEX.test('2026-09-01T00:00:00.000Z')).toBe(false);
    expect(istDayBounds('2026-09-01')).toEqual({
      startUtc: '2026-08-31T18:30:00.000Z',
      endUtc: '2026-09-01T18:30:00.000Z',
    });
  });

  it('carries an optional note the reader passes through, and nothing else', () => {
    expect(dueDateValueSchema.parse({ date: '2026-09-01', note: 'after the bank account opens' })).toEqual({
      date: '2026-09-01',
      note: 'after the bank account opens',
    });
    expect(dueDateValueSchema.safeParse('2026-09-01').success).toBe(false); // a bare string is not a claim
  });
});
```

Add to the file's imports whatever is not already there:

```ts
import * as ticketTypesModule from './ticket-types.js';
import { BUILTIN_FIELD_IDS, dueDateValueSchema } from './ticket-types.js';
import { IST_DAY_REGEX, istDayBounds } from './ist-day.js';
```

(`packages/domain` is Plan 1's NodeNext package — relative imports carry the `.js` suffix. If the file you find imports without suffixes, match what is there.)

- [ ] **Step 4: Run the pin**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-types.test.ts`
Expected: PASS — Plan 3's cases and the five new ones. The pin guards rather than drives, so it is green immediately; that is the point of a guard, and the doc comment says so.

Then find every remaining statement of the day shape. Search for the **whole anchored literal**, not a fragment — `Date`'s instant shape (`ISO_DATETIME_REGEX` in `packages/domain/src/envelope.ts`) legitimately begins `/^\d{4}-\d{2}-\d{2}T…`, and it is the one origin of the *instant* shape exactly as `ist-day.ts` is the one origin of the *day* shape. The trailing `$/` is what tells them apart:

```bash
grep -rnF '/^\d{4}-\d{2}-\d{2}$/' packages/domain/src packages/app-core/src apps/server/src 2>/dev/null
```

Expected hits — exactly one, and nothing else:
1. `packages/domain/src/ist-day.ts` — the `IST_DAY_REGEX` declaration. This one stays; it is the origin.

Plan 3's two former re-declarations are gone: its 2026-08-20 amendment made `dueDateValueSchema` (`packages/domain/src/ticket-types.ts`) and the engine's `date`-kind check (`packages/rule-engine/src/checks/fields.ts`) both import `IST_DAY_REGEX` instead of stating the literal. Any *second* hit is therefore a genuine re-declaration introduced since: delete it and import `IST_DAY_REGEX`.

- [ ] **Step 5: Add the two shared fixtures**

**Guard (harness shape):** open `packages/rule-engine/src/fixtures/harness.ts` and read `fixtureSchema` before writing these files. Two things to match, and nothing else:
1. **The workflow-definitions key.** Plan 2 defined `workflowDefs` (array); Plan 3's runner snippet said `workflowDef` singular — mid-reconciliation. The JSON below uses `workflowDefs`; if the landed schema says otherwise, rename the key.
2. **Whether a refusal `expected` may name the `rule` alone.** Plan 2's `fixtureSchema` union spells refusals as `{refused, rule, reason}` or `{refused, rule, reasonStartsWith}`; Plan 3 nonetheless ships `parent-terminal-with-open-children.json` with `rule` alone, so the landed schema may already have a rule-only branch. If it does not, add `"reason": "\"Start date\" needs a day in YYYY-MM-DD form (a note is optional)."` to the refusal fixture below — the literal Plan 3 owns and already pins in `fields.test.ts`.

The abbreviated envelopes below are deliberate and legal: Plan 2's `partialEnvelopeSchema` makes `id`, `workspaceId`, `version`, `origin`, both times and `seq` optional, and `completeEnvelope` fills them (`ws_1`, `user_a`, `server`, `2026-08-20T00:00:00.000Z`, `fx_evt_<n>`, `seq` = position).

`packages/rule-engine/fixtures/field-set-refuses-a-malformed-start-date.json`:

```json
{
  "name": "a malformed start date is refused with the field named",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "*", "to": "doing", "rules": [] },
        { "from": "*", "to": "done", "rules": [] }
      ]
    }
  ],
  "priorEvents": [
    {
      "type": "ticket-type.defined",
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf_basic", "fields": [] }
    },
    {
      "type": "ticket.created",
      "entity": { "kind": "ticket", "id": "t1" },
      "payload": { "typeId": "task", "projectId": "p1", "parentId": null, "title": "Renew the DLT registration" }
    }
  ],
  "candidateEvent": {
    "type": "ticket.field_set",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "fieldId": "startDate", "value": { "date": "2026-09-01T10:00:00Z" } }
  },
  "expected": { "refused": true, "rule": "field.type-mismatch" }
}
```

(The `reason` string is owned by Plan 3's `fieldKindRefusal`; per Plan 3's comparison discipline a fixture names the literal reason only when its plan owns the string, so this one pins the `rule` alone — the exact reason is already pinned by Plan 3's `fields.test.ts`. If the landed `fixtureSchema` demands a reason, the Guard above says which literal to add.)

`packages/rule-engine/fixtures/field-set-accepts-a-start-date-claim.json` — the accepting twin: same world, a well-formed claim.

```json
{
  "name": "a start date is a claim like a due date — {date, note?} accepted",
  "workflowDefs": [
    {
      "id": "wf_basic", "version": 1, "name": "Basic", "initialStateId": "todo",
      "states": [
        { "id": "todo", "name": "To do", "category": "open" },
        { "id": "doing", "name": "Doing", "category": "active" },
        { "id": "done", "name": "Done", "category": "terminal" }
      ],
      "transitions": [
        { "from": "*", "to": "doing", "rules": [] },
        { "from": "*", "to": "done", "rules": [] }
      ]
    }
  ],
  "priorEvents": [
    {
      "type": "ticket-type.defined",
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf_basic", "fields": [] }
    },
    {
      "type": "ticket.created",
      "entity": { "kind": "ticket", "id": "t1" },
      "payload": { "typeId": "task", "projectId": "p1", "parentId": null, "title": "Renew the DLT registration" }
    }
  ],
  "candidateEvent": {
    "type": "ticket.field_set",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "fieldId": "startDate", "value": { "date": "2026-09-01", "note": "after the bank account opens" } }
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 6: Run the fixture runner**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts`
Expected: PASS, fixture count up by 2 (the runner iterates every `fixtures/*.json`; if it pins an exact count, bump it). A schema-validation error here means the Guard in Step 5 was not applied — fix the fixture, never the harness.

- [ ] **Step 7: Prove the two fixtures bite**

A fixture that cannot fail guards nothing (spec invariant 6). Prove these two do, with ONE temporary edit that you restore in the same step:

1. In `packages/rule-engine/src/checks/fields.ts`, temporarily delete ` || p.fieldId === 'startDate'` from the merged day-claim branch condition.
2. Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts`
   Expected: FAIL, both new fixtures — the value now falls through to the custom-field lookup, so the refusal fixture gets `field.unknown` instead of `field.type-mismatch`, and the accepting fixture is refused rather than accepted. (Plan 3's `fields.test.ts` fails too, for the same reason — that is Plan 3's own guard biting, and confirms the mutation took.)
3. Restore the condition exactly.
4. Run: `git diff --exit-code packages/rule-engine/src/checks/fields.ts`
   Expected: no output, exit 0. **Do not proceed until this is clean** — this task must leave Plan 3's source byte-identical.
5. Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts src/checks/fields.test.ts`
   Expected: PASS.

- [ ] **Step 8: Run both packages' full suites and typecheck**

Run: `pnpm --filter @gisik-nokma/domain --filter @gisik-nokma/rule-engine test && pnpm --filter @gisik-nokma/domain --filter @gisik-nokma/rule-engine typecheck`
Expected: PASS — this task adds a test file's worth of assertions and two fixtures, and changes no behavior anywhere.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/ticket-types.test.ts packages/rule-engine/fixtures/field-set-refuses-a-malformed-start-date.json packages/rule-engine/fixtures/field-set-accepts-a-start-date-claim.json
git commit -m "the start date the timeline draws from is Plan 3's built-in, consumed not redefined: one schema for both day claims, a pin holding the reader's shape against it, and two shared fixtures that run a built-in day claim through the real engine in every build"
```

---

### Task 2: Mention and plain-text walkers in `@gisik-nokma/domain`

Notifications must find `@mentions` inside editor documents and show a text excerpt — without depending on Tiptap. Amendment 12 pins both facts: the mention node is structured `{userId}`, and domain owns a dependency-free `docToPlainText(doc: unknown): string`. Plan 7 (parallel) also creates `docToPlainText`; the guard below makes whichever plan lands first the creator.

**Files:**
- Create (guarded): `packages/domain/src/doc-text.ts`
- Create (guarded): `packages/domain/src/doc-text.test.ts`
- Create: `packages/domain/src/doc-mentions.ts`
- Create: `packages/domain/src/doc-mentions.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: nothing beyond zod-free TypeScript — both walkers are dependency-free by amendment 12.
- Produces (cross-plan API, `@gisik-nokma/domain`):
  - `docToPlainText(doc: unknown): string` — every ProseMirror-JSON text node in document order, single-space joined, whitespace collapsed; malformed input yields `''`, never a throw.
  - `extractMentionedUserIds(doc: unknown): string[]` — unique userIds of every `{type:'mention', attrs:{userId}}` node, in first-appearance order; malformed input yields `[]`.

- [ ] **Step 1: Guard — does `docToPlainText` already exist?**

Run: `grep -rn "docToPlainText" packages/domain/src`
- **Found** (Plan 7 landed first): skip Steps 2–3's `doc-text.ts` creation; import theirs in Step 4's test only to confirm the pinned signature, and continue with the mention walker.
- **Not found**: create it here exactly as below (Plan 7's executor will find yours via the same guard).

- [ ] **Step 2: Write the failing tests**

`packages/domain/src/doc-text.test.ts` (only if creating):

```ts
import { describe, expect, it } from 'vitest';
import { docToPlainText } from './doc-text.js';

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Ask the accountant ' },
      { type: 'mention', attrs: { userId: 'user_anselma' } },
      { type: 'text', text: 'about the filing.' },
    ] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Before Friday.' }] },
  ],
};

describe('docToPlainText', () => {
  it('concatenates text nodes in order, one space between blocks', () => {
    expect(docToPlainText(doc)).toBe('Ask the accountant about the filing. Before Friday.');
  });

  it('yields the empty string for malformed input — a walker never throws over a claim', () => {
    expect(docToPlainText(null)).toBe('');
    expect(docToPlainText(42)).toBe('');
    expect(docToPlainText({ content: 'not-an-array' })).toBe('');
  });
});
```

`packages/domain/src/doc-mentions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractMentionedUserIds } from './doc-mentions.js';

describe('extractMentionedUserIds', () => {
  it('finds mention nodes at any depth, unique, in first-appearance order', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'mention', attrs: { userId: 'user_kiro' } },
          { type: 'text', text: ' and ' },
          { type: 'mention', attrs: { userId: 'user_anselma' } },
        ] },
        { type: 'blockquote', content: [
          { type: 'paragraph', content: [{ type: 'mention', attrs: { userId: 'user_kiro' } }] },
        ] },
      ],
    };
    expect(extractMentionedUserIds(doc)).toEqual(['user_kiro', 'user_anselma']);
  });

  it('ignores nodes that merely look mention-ish', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'mention' },
        { type: 'mention', attrs: {} },
        { type: 'mention', attrs: { userId: 42 } },
        { type: 'mention', attrs: { userId: '' } },
        { type: 'text', text: '@not_a_mention_node' },
      ],
    };
    expect(extractMentionedUserIds(doc)).toEqual([]);
  });

  it('yields [] for malformed input', () => {
    expect(extractMentionedUserIds(undefined)).toEqual([]);
    expect(extractMentionedUserIds('a string')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/doc-text.test.ts src/doc-mentions.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement both walkers**

`packages/domain/src/doc-text.ts` (only if the Step 1 guard said create):

```ts
/**
 * Dependency-free ProseMirror-JSON walker (series amendment 12). Concatenates
 * every text node in document order; joining with a space keeps words from
 * fusing across block boundaries. Malformed input yields '' — a walker used
 * for search and notifications must never throw over someone's claim.
 */
export function docToPlainText(doc: unknown): string {
  const parts: string[] = [];
  walkText(doc, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function walkText(node: unknown, parts: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) walkText(child, parts);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  if (typeof record.text === 'string') parts.push(record.text);
  walkText(record.content, parts);
}
```

`packages/domain/src/doc-mentions.ts`:

```ts
/**
 * Finds the structured mention nodes (amendment 12: { type: 'mention',
 * attrs: { userId } }) anywhere in an editor document. Anything that does
 * not carry a non-empty string userId is not a mention — no guessing, no
 * text-scanning for '@': only the structured claim counts.
 */
export function extractMentionedUserIds(doc: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  walkMentions(doc, found, seen);
  return found;
}

function walkMentions(node: unknown, found: string[], seen: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) walkMentions(child, found, seen);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  if (record.type === 'mention' && typeof record.attrs === 'object' && record.attrs !== null) {
    const userId = (record.attrs as Record<string, unknown>).userId;
    if (typeof userId === 'string' && userId.length > 0 && !seen.has(userId)) {
      seen.add(userId);
      found.push(userId);
    }
  }
  walkMentions(record.content, found, seen);
}
```

Add to `packages/domain/src/index.ts`:

```ts
export * from './doc-text.js';
export * from './doc-mentions.js';
```

(If the guard found Plan 7's `docToPlainText`, add only the `doc-mentions.js` line and whatever export line theirs already has stays.)

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/doc-text.test.ts src/doc-mentions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/doc-text.ts packages/domain/src/doc-text.test.ts packages/domain/src/doc-mentions.ts packages/domain/src/doc-mentions.test.ts packages/domain/src/index.ts
git commit -m "domain doc walkers: mentions and plain text extracted from editor JSON without the editor — only the structured mention node counts, no @-guessing"
```

---

### Task 3: The notification vocabulary in `@gisik-nokma/domain`

Five kinds, one strict zod schema each. Strictness is the honesty mechanism: a payload is the claim's provenance and nothing else — there is structurally no field where system-invented urgency ("HIGH PRIORITY", a computed severity) could live, and the planted defect proves it. The types live in domain because both the server (writer) and every client's inbox (reader) speak them.

**Files:**
- Create: `packages/domain/src/notifications.ts`
- Create: `packages/domain/src/notifications.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: zod (already a domain dependency).
- Produces (cross-plan API, `@gisik-nokma/domain` — Plans 10/11's push transports and every inbox consume these exact names):
  - `NOTIFICATION_KINDS = ['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket'] as const`, `type NotificationKind`
  - `dateClaimProvenanceSchema`/`DateClaimProvenance` — `{ date, note?, actorId, clientTime, serverTime }`, the `FieldClaim` copied verbatim with its value flattened
  - Per-kind strict payload schemas: `assignmentNotificationPayloadSchema` (`{ticketId, ticketTitle, assignedBy, eventId, clientTime, serverTime}`), `mentionNotificationPayloadSchema` (`{ticketId, ticketTitle, mentionedBy, eventId, source: 'comment'|'description', excerpt, clientTime, serverTime}`), `contestedClaimNotificationPayloadSchema` (`{ticketId, rule, reason, claim: {eventId, type, actorId, clientTime}, contestEventId, serverTime}`), `dateApproachingNotificationPayloadSchema` (`{ticketId, ticketTitle, field: 'dueDate', claim: DateClaimProvenance}`), `staleTicketNotificationPayloadSchema` (`{ticketId, ticketTitle, stateId, stateName: string|null, enteredAt, enteredBy}`)
  - `notificationPayloadSchemaByKind` (const map), `type NotificationPayload` (the union)
  - `type Notification = { id, userId, workspaceId, kind, dedupeKey, payload, read, createdAt }` and `parseNotification(value: unknown): Notification` (validates the payload against its kind's schema; throws on mismatch)

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/notifications.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_KINDS,
  assignmentNotificationPayloadSchema,
  dateApproachingNotificationPayloadSchema,
  notificationPayloadSchemaByKind,
  parseNotification,
} from './notifications.js';

const approachingPayload = {
  ticketId: 't1',
  ticketTitle: 'Renew the DLT registration',
  field: 'dueDate',
  claim: {
    date: '2026-08-30',
    note: 'GST filing',
    actorId: 'user_kiro',
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  },
} as const;

describe('notification vocabulary', () => {
  it('has exactly the five kinds', () => {
    expect(NOTIFICATION_KINDS).toEqual(['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket']);
  });

  it('every kind has a payload schema', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(notificationPayloadSchemaByKind[kind]).toBeDefined();
    }
  });

  it('a date-approaching payload is the claim with its provenance, verbatim', () => {
    expect(dateApproachingNotificationPayloadSchema.parse(approachingPayload)).toEqual(approachingPayload);
  });

  it('cannot carry system-invented urgency — unknown keys refuse (planted defect)', () => {
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, urgency: 'high' }).success).toBe(false);
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, priority: 1 }).success).toBe(false);
    expect(
      assignmentNotificationPayloadSchema.safeParse({
        ticketId: 't1',
        ticketTitle: 'X',
        assignedBy: 'user_a',
        eventId: 'e1',
        clientTime: '2026-08-19T10:00:00.000Z',
        serverTime: '2026-08-19T10:00:01.000Z',
        severity: 'critical',
      }).success,
    ).toBe(false);
  });

  it('a claim without provenance refuses — attribution is not optional', () => {
    const { actorId: _dropped, ...claimWithoutActor } = approachingPayload.claim;
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, claim: claimWithoutActor }).success).toBe(false);
  });

  it('parseNotification validates the payload against its kind', () => {
    const row = {
      id: '01J9GN0T000000000000000001',
      userId: 'user_kiro',
      workspaceId: 'ws_1',
      kind: 'date-approaching',
      dedupeKey: 'date-approaching:t1:2026-08-30',
      payload: approachingPayload,
      read: false,
      createdAt: '2026-08-23T05:00:00.000Z',
    };
    expect(parseNotification(row)).toEqual(row);
    expect(() => parseNotification({ ...row, kind: 'assignment' })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/notifications.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

`packages/domain/src/notifications.ts`:

```ts
import { z } from 'zod';
import { IST_DAY_REGEX } from './ist-day.js';

/**
 * Notifications are server-owned per-user rows, NOT ledger events (series
 * amendment 14's reasoning, applied): a notification is a message to a
 * person; the fact it points at stays in the ledger. Every payload is
 * .strict() — it carries the originating claim's provenance verbatim and
 * has no field where invented urgency could live.
 *
 * The day shape comes from Plan 1's IST_DAY_REGEX, never a local literal:
 * a notification about a claimed day must agree, character for character,
 * with the day the claim was validated as and the day the calendar places it
 * in. Three copies of one regex is three chances to disagree.
 */
export const NOTIFICATION_KINDS = ['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const nonEmpty = z.string().min(1);

/** A date claim's provenance — the FieldClaim flattened, never summarised. */
export const dateClaimProvenanceSchema = z
  .object({
    date: z.string().regex(IST_DAY_REGEX, 'a claimed date is a day in YYYY-MM-DD form'),
    note: z.string().optional(),
    actorId: nonEmpty,
    clientTime: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type DateClaimProvenance = z.infer<typeof dateClaimProvenanceSchema>;

export const assignmentNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    assignedBy: nonEmpty,
    eventId: nonEmpty,
    clientTime: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type AssignmentNotificationPayload = z.infer<typeof assignmentNotificationPayloadSchema>;

export const mentionNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    mentionedBy: nonEmpty,
    eventId: nonEmpty,
    source: z.enum(['comment', 'description']),
    excerpt: z.string(),
    clientTime: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type MentionNotificationPayload = z.infer<typeof mentionNotificationPayloadSchema>;

export const contestedClaimNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    rule: nonEmpty,
    reason: nonEmpty,
    claim: z.object({ eventId: nonEmpty, type: nonEmpty, actorId: nonEmpty, clientTime: nonEmpty }).strict(),
    contestEventId: nonEmpty,
    serverTime: nonEmpty,
  })
  .strict();
export type ContestedClaimNotificationPayload = z.infer<typeof contestedClaimNotificationPayloadSchema>;

export const dateApproachingNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    field: z.literal('dueDate'),
    claim: dateClaimProvenanceSchema,
  })
  .strict();
export type DateApproachingNotificationPayload = z.infer<typeof dateApproachingNotificationPayloadSchema>;

export const staleTicketNotificationPayloadSchema = z
  .object({
    ticketId: nonEmpty,
    ticketTitle: z.string(),
    stateId: nonEmpty,
    stateName: z.string().nullable(),
    enteredAt: nonEmpty,
    enteredBy: nonEmpty,
  })
  .strict();
export type StaleTicketNotificationPayload = z.infer<typeof staleTicketNotificationPayloadSchema>;

export const notificationPayloadSchemaByKind = {
  assignment: assignmentNotificationPayloadSchema,
  mention: mentionNotificationPayloadSchema,
  'contested-claim': contestedClaimNotificationPayloadSchema,
  'date-approaching': dateApproachingNotificationPayloadSchema,
  'stale-ticket': staleTicketNotificationPayloadSchema,
} as const;

export type NotificationPayload =
  | AssignmentNotificationPayload
  | MentionNotificationPayload
  | ContestedClaimNotificationPayload
  | DateApproachingNotificationPayload
  | StaleTicketNotificationPayload;

export type Notification = {
  id: string;
  userId: string;
  workspaceId: string;
  kind: NotificationKind;
  dedupeKey: string;
  payload: NotificationPayload;
  read: boolean;
  createdAt: string;
};

const notificationBaseSchema = z
  .object({
    id: nonEmpty,
    userId: nonEmpty,
    workspaceId: nonEmpty,
    kind: z.enum(NOTIFICATION_KINDS),
    dedupeKey: nonEmpty,
    payload: z.unknown(),
    read: z.boolean(),
    createdAt: nonEmpty,
  })
  .strict();

/** Boundary parser: validates the payload against its kind's schema. */
export function parseNotification(value: unknown): Notification {
  const base = notificationBaseSchema.parse(value);
  const payload = notificationPayloadSchemaByKind[base.kind].parse(base.payload) as NotificationPayload;
  return { ...base, payload };
}
```

Add to `packages/domain/src/index.ts`:

```ts
export * from './notifications.js';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/notifications.ts packages/domain/src/notifications.test.ts packages/domain/src/index.ts
git commit -m "notification vocabulary: five kinds, strict payloads — a notification carries its claim's provenance verbatim and has no field where invented urgency could live"
```

---

### Task 4: The `notifications` table and store

Per-user rows keyed twice: by `id` (a ULID — time-ordered, so `ORDER BY id DESC` is newest-first and the cursor is just the last id seen) and by `(user_id, dedupe_key)` unique — the idempotence backbone every writer leans on. **This table is deliberately NOT a projection**: it is never registered in `buildProjectionRegistry`, the verifier never re-derives it, and replaying the ledger must never re-create rows (a notification re-materialising as unread after a rebuild would be the system inventing a second nag out of one fact). The writers guarantee that: the fan-out hangs off `onEventCommitted`, which fires only on live commits, and the sweep is dedupe-keyed.

**Files:**
- Create: `apps/server/migrations/<timestamp>_notifications.sql` (via node-pg-migrate, Step 1)
- Create: `apps/server/src/notifications/store.ts`
- Create: `apps/server/test/notifications/store.test.ts`

**Interfaces:**
- Consumes: `Queryable` (Plan 4, `apps/server/src/db/queryable.ts`); `Notification`, `parseNotification` (`@gisik-nokma/domain`, Task 3); `createTestDatabase` (Plan 1, `apps/server/test/helpers/db.ts` — **Guard:** `grep -rn "createTestDatabase\|migrateTestDb" apps/server/test/helpers` and use whichever per-suite-database helper reconciliation kept; the tests below assume `createTestDatabase(): Promise<TestDatabase>` with `{ pool, drop() }`).
- Produces (Tasks 5–7 and Plan 10/11 transports consume):
  - Table `notifications`: `id text PK`, `user_id text`, `workspace_id text`, `kind text` (CHECK in the five kinds), `dedupe_key text`, `payload jsonb`, `read boolean default false`, `created_at timestamptz default now()`; `UNIQUE (user_id, dedupe_key)` named `notifications_user_dedupe_unique`; indexes `(user_id, id DESC)` and partial `(user_id) WHERE read = false`.
  - `insertNotification(db: Queryable, notification: Notification): Promise<'inserted' | 'duplicate'>`
  - `type NotificationPage = { notifications: Notification[]; nextCursor: string | null }`
  - `listNotifications(db: Queryable, userId: string, opts: { cursor?: string | null; limit?: number; workspaceId?: string | null }): Promise<NotificationPage>` — newest first; `nextCursor` null on the last page; limit clamped to 1..100, default 30.
  - `markNotificationRead(db: Queryable, userId: string, id: string): Promise<boolean>` — true iff a row of THIS user matched (idempotent: marking an already-read row is still true; another user's row is false).
  - `unreadNotificationCount(db: Queryable, userId: string): Promise<number>`

- [ ] **Step 1: Generate and fill the migration**

Run: `pnpm --filter @gisik-nokma/server exec node-pg-migrate create notifications --migration-file-language sql --migrations-dir migrations`
Expected: creates `apps/server/migrations/<timestamp>_notifications.sql`. (If reconciliation standardised on JS migrations — check what `apps/server/migrations/` holds — write the same DDL through `pgm.createTable` instead; columns and constraint names are the contract, not the file dialect.)

Up SQL:

```sql
CREATE TABLE notifications (
  id           text NOT NULL PRIMARY KEY,
  user_id      text NOT NULL,
  workspace_id text NOT NULL,
  kind         text NOT NULL,
  dedupe_key   text NOT NULL,
  payload      jsonb NOT NULL,
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_user_dedupe_unique UNIQUE (user_id, dedupe_key),
  CONSTRAINT notifications_kind_check CHECK (kind IN ('assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket'))
);

CREATE INDEX notifications_user_id_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read = false;
```

Down SQL (under the Down marker):

```sql
DROP TABLE notifications;
```

Run: `pnpm --filter @gisik-nokma/server run migrate` (against the dev database from Plan 1's docker compose) to confirm it applies cleanly.

- [ ] **Step 2: Write the failing store tests**

`apps/server/test/notifications/store.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Notification } from '@gisik-nokma/domain';
import {
  insertNotification,
  listNotifications,
  markNotificationRead,
  unreadNotificationCount,
} from '../../src/notifications/store.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
});

let counter = 0;

/** ULID-shaped, strictly increasing ids so ORDER BY id DESC is deterministic. */
function nextId(): string {
  counter += 1;
  return `01J9GN0T00000000000000${String(counter).padStart(4, '0')}`.slice(0, 26);
}

function sample(overrides: Partial<Notification> = {}): Notification {
  return {
    id: nextId(),
    userId: 'user_kiro',
    workspaceId: 'ws_1',
    kind: 'date-approaching',
    dedupeKey: `date-approaching:t1:2026-08-3${counter}`,
    payload: {
      ticketId: 't1',
      ticketTitle: 'Renew the DLT registration',
      field: 'dueDate',
      claim: {
        date: '2026-08-30',
        actorId: 'user_kiro',
        clientTime: '2026-08-19T10:00:00.000Z',
        serverTime: '2026-08-19T10:00:01.000Z',
      },
    },
    read: false,
    createdAt: '2026-08-23T05:00:00.000Z',
    ...overrides,
  };
}

describe('insertNotification', () => {
  it('inserts a row and reports inserted', async () => {
    expect(await insertNotification(db.pool, sample())).toBe('inserted');
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(1);
  });

  it('is idempotent per (user, dedupeKey): a second insert is a duplicate, one row stands (planted defect)', async () => {
    const first = sample({ dedupeKey: 'date-approaching:t1:2026-08-30' });
    const again = sample({ dedupeKey: 'date-approaching:t1:2026-08-30' }); // fresh id, same key
    expect(await insertNotification(db.pool, first)).toBe('inserted');
    expect(await insertNotification(db.pool, again)).toBe('duplicate');
    const rows = await db.pool.query('SELECT id FROM notifications WHERE user_id = $1', ['user_kiro']);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(first.id);
  });

  it('the same dedupeKey for a different user is its own row', async () => {
    await insertNotification(db.pool, sample({ dedupeKey: 'k' }));
    expect(await insertNotification(db.pool, sample({ userId: 'user_anselma', dedupeKey: 'k' }))).toBe('inserted');
  });
});

describe('listNotifications', () => {
  it('pages newest-first by id with a cursor', async () => {
    const a = sample();
    const b = sample();
    const c = sample();
    for (const n of [a, b, c]) await insertNotification(db.pool, n);

    const page1 = await listNotifications(db.pool, 'user_kiro', { limit: 2 });
    expect(page1.notifications.map((n) => n.id)).toEqual([c.id, b.id]);
    expect(page1.nextCursor).toBe(b.id);

    const page2 = await listNotifications(db.pool, 'user_kiro', { limit: 2, cursor: page1.nextCursor });
    expect(page2.notifications.map((n) => n.id)).toEqual([a.id]);
    expect(page2.nextCursor).toBeNull();
  });

  it("never returns another user's rows and can scope to a workspace", async () => {
    await insertNotification(db.pool, sample({ userId: 'user_anselma' }));
    await insertNotification(db.pool, sample({ workspaceId: 'ws_2' }));
    const mine = await listNotifications(db.pool, 'user_kiro', {});
    expect(mine.notifications).toHaveLength(1);
    expect(mine.notifications[0].workspaceId).toBe('ws_2');
    const scoped = await listNotifications(db.pool, 'user_kiro', { workspaceId: 'ws_1' });
    expect(scoped.notifications).toHaveLength(0);
  });
});

describe('markNotificationRead / unreadNotificationCount', () => {
  it("marks own rows, idempotently; another user's row is untouchable", async () => {
    const n = sample();
    await insertNotification(db.pool, n);
    expect(await markNotificationRead(db.pool, 'user_anselma', n.id)).toBe(false);
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(1);
    expect(await markNotificationRead(db.pool, 'user_kiro', n.id)).toBe(true);
    expect(await markNotificationRead(db.pool, 'user_kiro', n.id)).toBe(true); // idempotent
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/notifications/store.test.ts`
Expected: FAIL — `src/notifications/store.ts` does not exist.

- [ ] **Step 4: Implement the store**

`apps/server/src/notifications/store.ts`:

```ts
import { parseNotification, type Notification } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

type NotificationRowRecord = {
  id: string;
  user_id: string;
  workspace_id: string;
  kind: string;
  dedupe_key: string;
  payload: unknown;
  read: boolean;
  created_at: Date;
};

function rowToNotification(row: NotificationRowRecord): Notification {
  // parseNotification is the boundary check: a row that fails its kind's
  // schema is corrupt and must fail loudly, not render as a half-message.
  return parseNotification({
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    read: row.read,
    createdAt: row.created_at.toISOString(),
  });
}

export async function insertNotification(db: Queryable, notification: Notification): Promise<'inserted' | 'duplicate'> {
  const result = await db.query(
    `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT ON CONSTRAINT notifications_user_dedupe_unique DO NOTHING`,
    [
      notification.id,
      notification.userId,
      notification.workspaceId,
      notification.kind,
      notification.dedupeKey,
      JSON.stringify(notification.payload),
      notification.read,
      notification.createdAt,
    ],
  );
  return result.rowCount === 1 ? 'inserted' : 'duplicate';
}

export type NotificationPage = { notifications: Notification[]; nextCursor: string | null };

export async function listNotifications(
  db: Queryable,
  userId: string,
  opts: { cursor?: string | null; limit?: number; workspaceId?: string | null },
): Promise<NotificationPage> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const params: unknown[] = [userId];
  let where = 'user_id = $1';
  if (opts.cursor) {
    params.push(opts.cursor);
    where += ` AND id < $${params.length}`;
  }
  if (opts.workspaceId) {
    params.push(opts.workspaceId);
    where += ` AND workspace_id = $${params.length}`;
  }
  params.push(limit + 1); // fetch one extra to learn whether a next page exists
  const result = await db.query(
    `SELECT id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at
       FROM notifications
      WHERE ${where}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows as NotificationRowRecord[];
  const page = rows.slice(0, limit);
  return {
    notifications: page.map(rowToNotification),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}

export async function markNotificationRead(db: Queryable, userId: string, id: string): Promise<boolean> {
  const result = await db.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function unreadNotificationCount(db: Queryable, userId: string): Promise<number> {
  const result = await db.query('SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = false', [
    userId,
  ]);
  return (result.rows[0] as { unread: number }).unread;
}
```

(If Plan 4's `Queryable` lives at a different path, `grep -rn "export type Queryable" apps/server/src` and adjust the import.)

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/notifications/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/migrations apps/server/src/notifications/store.ts apps/server/test/notifications/store.test.ts
git commit -m "notifications table + store: per-user rows outside the projection registry — a rebuilt ledger must never re-invent a nag, so writers dedupe on (user, key) and nothing replays"
```

---

### Task 5: `NotificationTransport`, the in-app transport, and the committed-event fan-out

The seam Plans 10/11 plug push into, plus the first three notification sources: `ticket.assigned` → the assignee, mention nodes in `comment.added`/description edits → the mentioned, `claim.contested` (amendment 16, Plan 10 emits it) → the original claimant. Delivery is at-least-once per `(userId, dedupeKey)` — the interface says so, the in-app implementation proves it via the store's unique key. A visibility gate keeps a notification from becoming the leak the ticket itself would refuse: no `canSee`, no message (contested claims excepted — the payload is the claimant's own refused event echoed back, and contains no title).

**Files:**
- Create: `apps/server/src/notifications/transport.ts`
- Create: `apps/server/src/notifications/fanout.ts`
- Modify: `apps/server/src/index.ts` (Plan 1's boot — locate by grep, Step 7)
- Create: `apps/server/test/notifications/fanout.test.ts`

**Interfaces:**
- Consumes: `insertNotification` (Task 4); `Notification`, `newUlid`, `docToPlainText`, `extractMentionedUserIds`, `makeEnvelope` (test), `EventEnvelope` (`@gisik-nokma/domain`); `getTicketStateFromDb` (Plan 3, `apps/server/src/projections/tickets.ts`); `canSee` (Plan 4 — **Guard:** `grep -rn "export async function canSee" apps/server/src` for the path); `IngestService.onEventCommitted` (Plan 1).
- Produces (cross-plan API — Plan 10's web-push and Plan 11's native-push transports implement the interface; Task 6's sweep reuses `deliverToAll`):
  - `interface NotificationTransport { readonly name: string; deliver(userId: string, notification: Notification): Promise<void> }` — **contract:** deliver may be called more than once per `(userId, notification.dedupeKey)` (retries, sweep re-runs); implementations must be idempotent on that pair. `notification.id` differs between calls; the dedupe key does not.
  - `createInAppTransport(pool: Pool): NotificationTransport` — deliver = `insertNotification`; the unique constraint provides the idempotence.
  - `deliverToAll(transports: NotificationTransport[], notification: Notification, log: (message: string, error?: unknown) => void): Promise<void>` — every transport tried, failures logged and isolated, never thrown.
  - `type CanSeeFn = (db: Pool, userId: string, ticketId: string) => Promise<boolean>`
  - `type FanoutDeps = { pool: Pool; transports: NotificationTransport[]; canSeeTicket?: CanSeeFn; now?: () => Date; log?: (message: string, error?: unknown) => void }`
  - `type NotificationFanout = { onCommitted(event: EventEnvelope): Promise<void> }`; `createNotificationFanout(deps: FanoutDeps): NotificationFanout` — `onCommitted` never rejects (errors are logged; a notification failure must never look like an ingest failure).
  - Dedupe-key grammar (exact): `assignment:<eventId>` · `mention:<eventId>:<userId>` · `contested-claim:<eventId>`.

- [ ] **Step 1: Write the transport**

`apps/server/src/notifications/transport.ts`:

```ts
import type { Pool } from 'pg';
import type { Notification } from '@gisik-nokma/domain';
import { insertNotification } from './store.js';

/**
 * A delivery channel. deliver() is at-least-once per (userId,
 * notification.dedupeKey): the fan-out may retry and the sweep re-runs, so
 * implementations MUST be idempotent on that pair — notification.id will
 * differ between attempts, the dedupe key will not. The in-app transport
 * gets this from the notifications table's unique constraint; push
 * transports (Plans 10/11) must keep the same contract.
 */
export interface NotificationTransport {
  readonly name: string;
  deliver(userId: string, notification: Notification): Promise<void>;
}

/** In-app delivery IS the stored row: the inbox reads the table. */
export function createInAppTransport(pool: Pool): NotificationTransport {
  return {
    name: 'in-app',
    async deliver(_userId, notification) {
      await insertNotification(pool, notification);
    },
  };
}

/** Every transport gets its chance; one failing channel never starves another. */
export async function deliverToAll(
  transports: NotificationTransport[],
  notification: Notification,
  log: (message: string, error?: unknown) => void,
): Promise<void> {
  for (const transport of transports) {
    try {
      await transport.deliver(notification.userId, notification);
    } catch (error) {
      log(`notification transport ${transport.name} failed for ${notification.dedupeKey}`, error);
    }
  }
}
```

- [ ] **Step 2: Write the failing fan-out tests**

`apps/server/test/notifications/fanout.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { createNotificationFanout } from '../../src/notifications/fanout.js';
import { createInAppTransport, type NotificationTransport } from '../../src/notifications/transport.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const KIRO = '01J9GUKR000000000000000000';
const ANSELMA = '01J9GUAN000000000000000000';

const visible = new Set<string>();
const canSeeTicket = async (_db: unknown, userId: string, ticketId: string) => visible.has(`${userId}:${ticketId}`);

function fanout(transports?: NotificationTransport[], log?: (m: string, e?: unknown) => void) {
  return createNotificationFanout({
    pool: db.pool,
    transports: transports ?? [createInAppTransport(db.pool)],
    canSeeTicket: canSeeTicket as never,
    now: () => new Date('2026-08-23T05:00:00.000Z'),
    log: log ?? (() => {}),
  });
}

async function seedTicket(ticketId: string, assigneeId: string | null, title: string): Promise<void> {
  await db.pool.query(
    `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, state_id, state_category, assignee_id, collaborator_ids, fields)
     VALUES ($1, $2, $3, 'task', NULL, 'wf-basic', 'doing', 'active', $4, '[]', $5)`,
    [
      ticketId,
      WS,
      PROJECT,
      assigneeId,
      JSON.stringify({
        title: { value: title, actorId: KIRO, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
      }),
    ],
  );
}

async function rowsFor(userId: string) {
  const result = await db.pool.query(
    'SELECT kind, dedupe_key, payload FROM notifications WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  return result.rows as Array<{ kind: string; dedupe_key: string; payload: Record<string, unknown> }>;
}

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
  await db.pool.query('DELETE FROM proj_tickets');
  visible.clear();
  visible.add(`${ANSELMA}:${TICKET}`);
  visible.add(`${KIRO}:${TICKET}`);
});

function assigned(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.assigned',
    entity: { kind: 'ticket', id: TICKET },
    workspaceId: WS,
    actorId: KIRO,
    payload: { assigneeId: ANSELMA },
    ...overrides,
  });
}

describe('ticket.assigned', () => {
  it("notifies the assignee with the event's provenance", async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const env = assigned();
    await fanout().onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('assignment');
    expect(rows[0].dedupe_key).toBe(`assignment:${env.id}`);
    expect(rows[0].payload).toEqual({
      ticketId: TICKET,
      ticketTitle: 'Renew the DLT registration',
      assignedBy: KIRO,
      eventId: env.id,
      clientTime: env.clientTime,
      serverTime: env.serverTime,
    });
  });

  it('self-assignment tells nobody', async () => {
    await seedTicket(TICKET, KIRO, 'Renew the DLT registration');
    await fanout().onCommitted(assigned({ payload: { assigneeId: KIRO } }));
    expect(await rowsFor(KIRO)).toHaveLength(0);
  });

  it('unassignment (null) tells nobody', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    await fanout().onCommitted(assigned({ payload: { assigneeId: null } }));
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
  });

  it('an assignee who cannot see the ticket gets nothing — the notification is not a side door (planted defect)', async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    visible.delete(`${ANSELMA}:${TICKET}`);
    await fanout().onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
  });

  it('delivering the same committed event twice yields one row (at-least-once safe, planted defect)', async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const env = assigned();
    await fanout().onCommitted(env);
    await fanout().onCommitted(env);
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });
});

describe('mentions', () => {
  const body = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [
        { type: 'mention', attrs: { userId: ANSELMA } },
        { type: 'text', text: ' please check the GST filing' },
        { type: 'mention', attrs: { userId: KIRO } },
      ] },
    ],
  };

  it('notifies each mentioned user except the author, with an excerpt', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    const env = makeEnvelope({
      type: 'comment.added',
      entity: { kind: 'ticket', id: TICKET },
      workspaceId: WS,
      actorId: KIRO,
      payload: { body },
    });
    await fanout().onCommitted(env);
    expect(await rowsFor(KIRO)).toHaveLength(0); // the author mentioned themselves — nothing to tell
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('mention');
    expect(rows[0].dedupe_key).toBe(`mention:${env.id}:${ANSELMA}`);
    expect(rows[0].payload.source).toBe('comment');
    expect(rows[0].payload.mentionedBy).toBe(KIRO);
    expect(rows[0].payload.excerpt).toBe('please check the GST filing');
  });

  it('a description edit carries mentions too, as source description', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    const env = makeEnvelope({
      type: 'ticket.field_set',
      entity: { kind: 'ticket', id: TICKET },
      workspaceId: WS,
      actorId: KIRO,
      payload: { fieldId: 'description', value: body },
    });
    await fanout().onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.source).toBe('description');
  });

  it('a mentioned user who cannot see the ticket gets nothing (planted defect)', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    visible.delete(`${ANSELMA}:${TICKET}`);
    await fanout().onCommitted(
      makeEnvelope({ type: 'comment.added', entity: { kind: 'ticket', id: TICKET }, workspaceId: WS, actorId: KIRO, payload: { body } }),
    );
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
  });

  it('a dueDate field_set is not a mention source', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    await fanout().onCommitted(
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: KIRO,
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } },
      }),
    );
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
  });
});

describe('claim.contested (amendment 16 — Plan 10 emits; the payload shape is an Open-questions pin)', () => {
  it("notifies the original claimant with rule, reason, and their own claim's provenance", async () => {
    const env = makeEnvelope({
      type: 'claim.contested',
      entity: { kind: 'ticket', id: TICKET },
      workspaceId: WS,
      actorId: ANSELMA,
      payload: {
        originalEvent: {
          id: '01J9GEVT000000000000000001',
          type: 'ticket.transitioned',
          actorId: ANSELMA,
          clientTime: '2026-08-22T18:00:00.000Z',
        },
        rule: 'require-evidence',
        reason: 'This move must carry an attachment as evidence, and none was provided.',
      },
    });
    await fanout().onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('contested-claim');
    expect(rows[0].dedupe_key).toBe(`contested-claim:${env.id}`);
    expect(rows[0].payload).toEqual({
      ticketId: TICKET,
      rule: 'require-evidence',
      reason: 'This move must carry an attachment as evidence, and none was provided.',
      claim: {
        eventId: '01J9GEVT000000000000000001',
        type: 'ticket.transitioned',
        actorId: ANSELMA,
        clientTime: '2026-08-22T18:00:00.000Z',
      },
      contestEventId: env.id,
      serverTime: env.serverTime,
    });
  });
});

describe('resilience', () => {
  it('a failing transport is logged and isolated; the in-app row still lands; onCommitted resolves', async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const logged: string[] = [];
    const broken: NotificationTransport = {
      name: 'broken-push',
      deliver: async () => {
        throw new Error('socket closed');
      },
    };
    await fanout([broken, createInAppTransport(db.pool)], (m) => logged.push(m)).onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
    expect(logged.some((m) => m.includes('broken-push'))).toBe(true);
  });

  it('an event type the fan-out does not know is silently no work', async () => {
    await fanout().onCommitted(
      makeEnvelope({ type: 'workspace.renamed', entity: { kind: 'workspace', id: WS }, workspaceId: WS, actorId: KIRO, payload: { name: 'X' } }),
    );
    const total = await db.pool.query('SELECT count(*)::int AS n FROM notifications');
    expect((total.rows[0] as { n: number }).n).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/notifications/fanout.test.ts`
Expected: FAIL — `src/notifications/fanout.ts` does not exist.

- [ ] **Step 4: Implement the fan-out**

`apps/server/src/notifications/fanout.ts`:

```ts
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  docToPlainText,
  extractMentionedUserIds,
  newUlid,
  type EventEnvelope,
  type Notification,
  type NotificationKind,
  type NotificationPayload,
} from '@gisik-nokma/domain';
import { getTicketStateFromDb } from '../projections/tickets.js';
import { canSee } from '../visibility/can-see.js';
import { deliverToAll, type NotificationTransport } from './transport.js';

const assignedPayloadSchema = z.object({ assigneeId: z.string().nullable() }).passthrough();
const commentPayloadSchema = z.object({ body: z.record(z.string(), z.unknown()) }).passthrough();
const fieldSetPayloadSchema = z.object({ fieldId: z.string(), value: z.unknown() }).passthrough();
/** Amendment 16 pins the event; this shape is the Open-questions pin for Plan 10. */
const contestedPayloadSchema = z
  .object({
    originalEvent: z
      .object({ id: z.string().min(1), type: z.string().min(1), actorId: z.string().min(1), clientTime: z.string().min(1) })
      .passthrough(),
    rule: z.string().min(1),
    reason: z.string().min(1),
  })
  .passthrough();

export type CanSeeFn = (db: Pool, userId: string, ticketId: string) => Promise<boolean>;

export type FanoutDeps = {
  pool: Pool;
  transports: NotificationTransport[];
  canSeeTicket?: CanSeeFn;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

export type NotificationFanout = { onCommitted(event: EventEnvelope): Promise<void> };

const EXCERPT_LENGTH = 140;

export function createNotificationFanout(deps: FanoutDeps): NotificationFanout {
  const canSeeTicket: CanSeeFn = deps.canSeeTicket ?? ((db, userId, ticketId) => canSee(db, userId, ticketId));
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));

  function compose(kind: NotificationKind, userId: string, workspaceId: string, dedupeKey: string, payload: NotificationPayload): Notification {
    return { id: newUlid(), userId, workspaceId, kind, dedupeKey, payload, read: false, createdAt: now().toISOString() };
  }

  async function titleOf(workspaceId: string, ticketId: string): Promise<string> {
    const state = await getTicketStateFromDb(deps.pool, workspaceId, ticketId);
    const value = state?.fields.title?.value;
    return typeof value === 'string' ? value : '';
  }

  async function handleAssigned(env: EventEnvelope): Promise<void> {
    const parsed = assignedPayloadSchema.safeParse(env.payload);
    if (!parsed.success) return;
    const assigneeId = parsed.data.assigneeId;
    if (assigneeId === null || assigneeId === env.actorId) return; // unassignment; self-assignment — nothing to tell
    if (!(await canSeeTicket(deps.pool, assigneeId, env.entity.id))) return; // a notification must not out-leak the ticket
    await deliverToAll(
      deps.transports,
      compose('assignment', assigneeId, env.workspaceId, `assignment:${env.id}`, {
        ticketId: env.entity.id,
        ticketTitle: await titleOf(env.workspaceId, env.entity.id),
        assignedBy: env.actorId,
        eventId: env.id,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      }),
      log,
    );
  }

  async function handleMentions(env: EventEnvelope, doc: unknown, source: 'comment' | 'description'): Promise<void> {
    const mentioned = extractMentionedUserIds(doc);
    if (mentioned.length === 0) return;
    const excerpt = docToPlainText(doc).slice(0, EXCERPT_LENGTH);
    const ticketTitle = await titleOf(env.workspaceId, env.entity.id);
    for (const userId of mentioned) {
      if (userId === env.actorId) continue;
      if (!(await canSeeTicket(deps.pool, userId, env.entity.id))) continue;
      await deliverToAll(
        deps.transports,
        compose('mention', userId, env.workspaceId, `mention:${env.id}:${userId}`, {
          ticketId: env.entity.id,
          ticketTitle,
          mentionedBy: env.actorId,
          eventId: env.id,
          source,
          excerpt,
          clientTime: env.clientTime,
          serverTime: env.serverTime,
        }),
        log,
      );
    }
  }

  async function handleContested(env: EventEnvelope): Promise<void> {
    const parsed = contestedPayloadSchema.safeParse(env.payload);
    if (!parsed.success) {
      log(`claim.contested payload did not match the pinned shape for event ${env.id} — no notification sent`);
      return;
    }
    const original = parsed.data.originalEvent;
    // No canSee gate: the payload is the claimant's own refused event echoed
    // back (rule + reason + their claim's provenance) and carries no title.
    await deliverToAll(
      deps.transports,
      compose('contested-claim', original.actorId, env.workspaceId, `contested-claim:${env.id}`, {
        ticketId: env.entity.id,
        rule: parsed.data.rule,
        reason: parsed.data.reason,
        claim: { eventId: original.id, type: original.type, actorId: original.actorId, clientTime: original.clientTime },
        contestEventId: env.id,
        serverTime: env.serverTime,
      }),
      log,
    );
  }

  return {
    async onCommitted(env: EventEnvelope): Promise<void> {
      try {
        if (env.type === 'ticket.assigned') {
          await handleAssigned(env);
        } else if (env.type === 'comment.added') {
          const parsed = commentPayloadSchema.safeParse(env.payload);
          if (parsed.success) await handleMentions(env, parsed.data.body, 'comment');
        } else if (env.type === 'ticket.field_set') {
          const parsed = fieldSetPayloadSchema.safeParse(env.payload);
          if (parsed.success && parsed.data.fieldId === 'description' && parsed.data.value !== null && parsed.data.value !== undefined) {
            await handleMentions(env, parsed.data.value, 'description');
          }
        } else if (env.type === 'claim.contested') {
          await handleContested(env);
        }
      } catch (error) {
        // A notification failure must never surface as an ingest failure.
        log(`notification fan-out failed for event ${env.id}`, error);
      }
    },
  };
}
```

(If Plan 4 landed `canSee` elsewhere than `src/visibility/can-see.ts`, fix the one import; the `CanSeeFn` indirection exists so tests never need the visibility tables.)

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/notifications/fanout.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the fan-out into server boot**

Locate the boot file: `grep -n "createIngestService\|onEventCommitted" apps/server/src/index.ts` (Plan 1 constructs `ingest` there; Plan 5 may have moved construction — follow the grep). After the `ingest` service is created and `pool` exists, add:

```ts
import { createNotificationFanout } from './notifications/fanout.js';
import { createInAppTransport } from './notifications/transport.js';
```

```ts
const notificationFanout = createNotificationFanout({ pool, transports: [createInAppTransport(pool)] });
ingest.onEventCommitted((event) => {
  void notificationFanout.onCommitted(event); // fire-and-forget: onCommitted logs its own failures
});
```

Plan 1's `CommittedEventListener` hands the listener a `LedgerEvent = EventEnvelope & { workspaceSeq: number }` — the frozen envelope plus the server-assigned per-workspace stream cursor (coordination §18). `onCommitted(event: EventEnvelope)` accepts it unchanged: `LedgerEvent` is a structural extension, so this compiles with no cast. The fan-out reads only envelope fields and deliberately ignores `workspaceSeq` — a notification is addressed to a person, not resumed from a cursor. Plan 5's WebSocket fan-out is the listener that needs the cursor; this one does not.

- [ ] **Step 7: Typecheck and run the server suite**

Run: `pnpm --filter @gisik-nokma/server typecheck && pnpm --filter @gisik-nokma/server test`
Expected: PASS — boot wiring compiles; nothing else regressed.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/notifications/transport.ts apps/server/src/notifications/fanout.ts apps/server/src/index.ts apps/server/test/notifications/fanout.test.ts
git commit -m "notification fan-out on committed events: assignee, mentioned, contested claimant — gated by canSee so a notification can never out-leak its ticket, idempotent per (user, dedupe key)"
```

---

### Task 6: The attention sweep — date-approaching and stale-ticket, deterministic and idempotent

Attention *transitions* need a clock, and events don't tick: a periodic job scans the projections and notifies claims entering the workspace warning window and active states crossing the staleness threshold. Determinism: given the same tables and the same injected `now`, the sweep computes the same candidate set and the same dedupe keys — so running it twice notifies once (the planted defect). It reads `proj_tickets` (claims) and the `events` ledger (when the current state was entered — derived, never stored anew), and its payloads carry the claim's provenance verbatim. Plan 5's attention endpoint computes the *read-time* strip; this sweep only turns threshold *crossings* into inbox rows — same semantics, different tense.

**Both windows are the workspace's own settings, and this sweep owns neither of them.** The thresholds live in exactly one place in the product: Plan 5's `workspace.settings_set` claim, projected into `proj_workspace_settings` and read back by `getWorkspaceSettings(db, workspaceId)` with `DEFAULT_STALE_DAYS`/`DEFAULT_DUE_SOON_DAYS` applied (both 7, owner-approved). The sweep resolves them and maps them onto its own vocabulary, explicitly and in one function:

- the sweep's **approaching window** *is* the workspace's **`dueSoonDays`** — "a claim is due soon" is one question, asked at read time by the strip and on a schedule by the sweep;
- the sweep's **staleness threshold** *is* the workspace's **`staleDays`** — "this has sat too long" is likewise one question.

`SweepWindows` survives as the *resolved* shape those two settings are read into; it is no longer a place where numbers are written down. There is no threshold constant in this plan under any name, no `windows` dependency to inject, and no way for a caller to hand the sweep a threshold the workspace did not claim — because a second way to set the number is a second number, and a board that flags a ticket stale while the inbox stays quiet is exactly the drift this product exists to remove. An admin who moves `staleDays` moves the strip and the sweep in the same act; the planted defect in Step 1 is what proves it.

**Settings are resolved once per workspace, before that workspace's rows are queried.** The sweep is server-wide (the CLI has one `DATABASE_URL` and no workspace argument), so it enumerates the workspaces that actually have tickets, reads each one's settings exactly once, and runs that workspace's two scoped queries with that workspace's horizon and cut-off. Reading settings per candidate row would be a query per ticket for a value that cannot change mid-run; reading them once globally would be worse than slow — it would be *wrong*, silently applying one workspace's thresholds to every other workspace on the server. The structure makes both mistakes unreachable: by the time a row is in hand its windows are already fixed, and they were fixed from its own workspace's claim.

**The sweep's "today" is an IST day, and this is the one thing about it that must not be improvised.** A sweep is a *periodic* job: whatever schedule Plan 11 gives it, some run will land near midnight, and a run at 18:29Z and a run at 18:31Z on the same UTC date sit on opposite sides of an IST day boundary. Three consequences, all handled here:

- The **warning horizon** (`dueSoonDays` ahead) is measured from `istDayOf(now)`, not from a UTC slice of the timestamp. A UTC slice does not roll over until 05:30 IST, so for five and a half hours every night it would compute yesterday's horizon and hold back a warning that is due — a day late, silently, for exactly the tickets whose claims just entered the window.
- The **staleness window** (`staleDays` back) is a day count, so it is computed with day helpers and compared **half-open** against `server_time`: `entered.server_time < istDayBounds(todayIst − staleDays).endUtc`. Raw millisecond subtraction from `now` would make "N days" mean "N×86 400 000 ms from whenever the cron happened to fire", which drifts with the schedule rather than with the calendar the user reads — and it would disagree with the attention strip's day count for the same setting on the same afternoon.
- **Idempotence survives the boundary.** The dedupe keys embed dates (`date-approaching:<ticketId>:<claimedDate>`, `stale-ticket:<ticketId>:<stateId>:<enteredAtIso>`) and the guarantee this task already tests — run it twice, notify once — only holds if consecutive runs derive the same day from the same facts. A sweep whose day boundary moved underneath it would let one claim notify twice across midnight. Step 1's IST-boundary block is the planted defect for exactly that.

The `dueDate` comparison itself stays a day-vs-day string comparison (`claimedDate <= horizon`): a claim **is** a day, both sides are already IST, and `YYYY-MM-DD` sorts lexicographically. `istDayBounds` is for the one comparison in this task that puts a day against an *instant* column — the staleness window. Nothing here parses a day claim as a timestamp.

**Files:**
- Create: `apps/server/src/notifications/sweep.ts`
- Create: `apps/server/src/tools/sweep-notifications.ts`
- Modify: `apps/server/package.json` (script)
- Create: `apps/server/test/notifications/sweep.test.ts`

**Interfaces:**
- Consumes: `proj_tickets` (Plan 3), the `events` table (Plan 1), `getWorkflowDefFromProjection` (Plan 2, `apps/server/src/projections/workflows.ts`), `Queryable` (Plan 4), `deliverToAll`/`NotificationTransport`/`CanSeeFn` (Task 5), `newUlid`/`Notification`/`istDayOf`/`istDayBounds` (`@gisik-nokma/domain`), **and the whole of Plan 5's workspace-settings surface (`2026-08-20-05-api-realtime-search.md`, Tasks 3–4): `getWorkspaceSettings(db: Queryable, workspaceId: string): Promise<WorkspaceSettings>` from `apps/server/src/projections/workspace-settings.ts`, backed by the `proj_workspace_settings` projection and the `workspace.settings_set` v1 event, with `DEFAULT_STALE_DAYS`/`DEFAULT_DUE_SOON_DAYS` (both 7) applied inside the reader.** The tests additionally consume Plan 5's `makeCommitted`/`applyCommitted`/`resetEntitySeqs` (`apps/server/test/helpers/apply.ts`, Plan 5 Task 4) to seed settings the way Plan 5's own suites do.
- Produces (Plan 11 schedules the CLI; the windows themselves are Plan 5's settings, produced by nothing here):
  - `type SweepWindows = { approachingWindowDays: number; stalenessThresholdDays: number }` — the **resolved** shape only. It is what a workspace's settings have been read into for one sweep run; no value is ever written down at this type, and no default lives at it.
  - `resolveSweepWindows(db: Queryable, workspaceId: string): Promise<SweepWindows>` — the whole mapping, stated once: `approachingWindowDays = settings.dueSoonDays`, `stalenessThresholdDays = settings.staleDays`, where `settings = await getWorkspaceSettings(db, workspaceId)`. **The sweep's "approaching" window IS the workspace's `dueSoonDays`; the sweep's "staleness" threshold IS the workspace's `staleDays`.** Unclaimed workspaces get `DEFAULT_DUE_SOON_DAYS`/`DEFAULT_STALE_DAYS` because the reader applies them — not because this file restates them.
  - `type SweepDeps = { pool: Pool; transports: NotificationTransport[]; canSeeTicket?: CanSeeFn; now?: () => Date; log?: (message: string, error?: unknown) => void }` — **no `windows` key.** There is deliberately no injection seam for thresholds: an override parameter is a second source of the number, and this task exists to end the second source. A test that needs particular windows claims them with a `workspace.settings_set` event, exactly as an admin would.
  - `type SweepReport = { dueCandidates: number; staleCandidates: number; delivered: number }` (operational logging only — idempotence is proven by row counts, not by the report)
  - `runNotificationSweep(deps: SweepDeps): Promise<SweepReport>` — iterates the workspaces that have tickets, resolving each workspace's windows **exactly once**, before running that workspace's scoped due and stale queries.
  - Dedupe-key grammar (exact): `date-approaching:<ticketId>:<claimedDate>` · `stale-ticket:<ticketId>:<stateId>:<enteredAtIso>`
  - `isoDatePlusDays(isoDay: string, days: number): string` — day-string arithmetic over `YYYY-MM-DD`, no timezone involved on either side (it shifts a *calendar day*, it does not convert an instant). Accepts negative `days`. The instant→day step is `istDayOf`'s alone.
  - **Day-boundary contract:** `todayIst = istDayOf(now.toISOString())` — computed once for the whole run, so every workspace in one sweep answers the same "today"; the approaching horizon is `isoDatePlusDays(todayIst, approachingWindowDays)`; the staleness cut-off is `istDayBounds(isoDatePlusDays(todayIst, -stalenessThresholdDays)).endUtc`, compared with a strict `<` because `istDayBounds` is half-open. Nothing in this file slices a timestamp string for a day, and nothing divides milliseconds to count days.
  - CLI: `pnpm --filter @gisik-nokma/server run sweep:notifications` — reads `DATABASE_URL`, prints the report, exit 0; scheduling is Plan 11's concern.
  - Targeting rules (exact): date-approaching goes to the assignee, or to the claim's author when unassigned (the person who made the claim owns the caring); stale-ticket goes to the assignee only — an unassigned stale ticket is the read-time attention strip's job, not a nag with no addressee. Terminal tickets never notify (done work has no approaching deadline). Both targets pass the `canSee` gate.

- [ ] **Step 1: Write the failing sweep tests**

**Guard (locate before you write).** This suite seeds workspace settings through Plan 5's helpers rather than a hand-rolled INSERT, so that the sweep and the attention strip exercise the *same* mechanism — event → `workspaceSettingsProjection` → `proj_workspace_settings` → `getWorkspaceSettings`. Run `ls apps/server/test/helpers/apply.ts` and `grep -n "export function makeCommitted\|export async function applyCommitted\|export function resetEntitySeqs" apps/server/test/helpers/apply.ts`. If they are there (Plan 5 Task 4 landed), import them as written below. If Plan 5 has not landed yet, **stop and take it to the orchestrator** — this task now depends on Plan 5's settings surface and cannot be executed against a checkout that lacks it; do not substitute a local constant "for now", because that constant is the defect this task removes. If the helpers landed under different names or a different path (Open questions 14's helper drift), adapt the import specifier only — never the mechanism.

`apps/server/test/notifications/sweep.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DUE_SOON_DAYS, DEFAULT_STALE_DAYS } from '@gisik-nokma/domain';
import { isoDatePlusDays, resolveSweepWindows, runNotificationSweep } from '../../src/notifications/sweep.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
// Plan 5 Task 4's shared seeders: an event goes into the ledger AND through
// every registered projection, one transaction per event, exactly as ingest
// would. Settings are seeded HERE the way Plan 5's own attention tests seed
// them, so neither suite can pass against a mechanism the other does not use.
import { applyCommitted, makeCommitted } from '../helpers/apply.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const WS = '01J9GWS0000000000000000000';
const OTHER_WS = '01J9GWS2000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const KIRO = '01J9GUKR000000000000000000';
const ANSELMA = '01J9GUAN000000000000000000';

/**
 * Frozen clock: 23 Aug 2026, 05:00 UTC — 10:30 IST, mid-morning of IST day
 * 2026-08-23. A `DEFAULT_DUE_SOON_DAYS` window from that IST day reaches 30 Aug.
 */
const NOW_INSTANT = '2026-08-23T05:00:00.000Z';

const seeEverything = async () => true;

/**
 * The sweep at an arbitrary instant — the IST-boundary block drives it directly.
 * Note what is NOT here: a `windows` argument. The sweep has no threshold
 * parameter to pass, by design; a test that wants different windows claims them
 * with `seedWorkspaceSettings` below, the way an admin would.
 */
function sweepAt(instant: string) {
  return runNotificationSweep({
    pool: db.pool,
    transports: [createInAppTransport(db.pool)],
    canSeeTicket: seeEverything as never,
    now: () => new Date(instant),
    log: () => {},
  });
}

function sweep() {
  return sweepAt(NOW_INSTANT);
}

type SeedTicket = {
  ticketId: string;
  workspaceId?: string;
  stateId?: string;
  stateCategory?: 'open' | 'active' | 'terminal';
  assigneeId?: string | null;
  dueDate?: { date: string; note?: string } | null;
  title?: string;
};

async function seedTicket(t: SeedTicket): Promise<void> {
  const fields: Record<string, unknown> = {
    title: {
      value: t.title ?? 'Renew the DLT registration',
      actorId: KIRO,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
  };
  if (t.dueDate) {
    fields.dueDate = {
      value: t.dueDate,
      actorId: KIRO,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    };
  }
  await db.pool.query(
    `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, state_id, state_category, assignee_id, collaborator_ids, fields)
     VALUES ($1, $2, $3, 'task', NULL, 'wf-basic', $4, $5, $6, '[]', $7)`,
    [t.ticketId, t.workspaceId ?? WS, PROJECT, t.stateId ?? 'doing', t.stateCategory ?? 'active', t.assigneeId ?? null, JSON.stringify(fields)],
  );
}

let seq = 0;

/**
 * Claim workspace settings the way an owner or admin would: a real
 * `workspace.settings_set` v1 event, through Plan 5's `applyCommitted`, which
 * runs it past every registered projection — so `proj_workspace_settings` ends
 * up holding exactly what a production claim would leave there, and
 * `getWorkspaceSettings` reads it back the same way the attention strip does.
 *
 * The explicit `seq`/`workspaceSeq` come from THIS suite's global counter
 * (`seedEnteredState` feeds from it too). `makeCommitted` would otherwise
 * allocate from its own module-level maps starting at 1 and collide with the
 * hand-seeded ledger rows on `UNIQUE (workspace_id, workspace_seq)`. One
 * counter, monotonic, shared — the same discipline `seedEnteredState`
 * documents below.
 */
async function seedWorkspaceSettings(
  payload: { staleDays?: number; dueSoonDays?: number },
  options: { workspaceId?: string; actorId?: string } = {},
): Promise<void> {
  const workspaceId = options.workspaceId ?? WS;
  seq += 1;
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      payload,
      actorId: options.actorId ?? KIRO,
      seq,
      workspaceSeq: seq,
    }),
  ]);
}

/**
 * Append a state-entering event straight into the ledger (append-only: inserts
 * are legal). The column list is Plan 1's: `events` carries BOTH counters —
 * `seq` (per entity, UNIQUE (entity_kind, entity_id, seq)) and `workspace_seq`
 * (per workspace, NOT NULL, UNIQUE (workspace_id, workspace_seq); coordination
 * §18). Real ingest assigns them inside the transaction under the workspace
 * advisory lock taken BEFORE the per-entity lock; a test seeder does not race
 * anyone, so it does what Plan 1's own `insertEventSql(id, seq, workspaceSeq =
 * seq)` helper does by default: one suite-global counter feeds both. It is
 * monotonic, every row here belongs to WS, and every ticket id is distinct, so
 * both unique constraints hold — and a ticket's later event always carries the
 * higher `seq`, which is what the sweep's per-entity `ORDER BY e.seq DESC`
 * reads.
 */
async function seedEnteredState(
  ticketId: string,
  serverTime: string,
  actorId: string,
  workspaceId: string = WS,
): Promise<void> {
  seq += 1;
  const id = `01J9GEVT00000000000000${String(seq).padStart(4, '0')}`.slice(0, 26);
  await db.pool.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, 'ticket', $3, 'ticket.transitioned', 1, $4, $5, 'web', $6, $7, $8, $9)`,
    [id, workspaceId, ticketId, JSON.stringify({ toStateId: 'doing' }), actorId, serverTime, serverTime, seq, seq],
  );
}

let ticketCounter = 0;

/** Fresh ULID-shaped ticket ids per test: the append-only events table cannot be truncated. */
function freshTicketId(): string {
  ticketCounter += 1;
  return `01J9GTKT00000000000000${String(ticketCounter).padStart(4, '0')}`.slice(0, 26);
}

async function notificationRows(kind?: string) {
  const result = kind
    ? await db.pool.query('SELECT user_id, kind, dedupe_key, payload FROM notifications WHERE kind = $1 ORDER BY id', [kind])
    : await db.pool.query('SELECT user_id, kind, dedupe_key, payload FROM notifications ORDER BY id');
  return result.rows as Array<{ user_id: string; kind: string; dedupe_key: string; payload: Record<string, unknown> }>;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.pool.query('DELETE FROM notifications');
  await db.pool.query('DELETE FROM proj_tickets');
  // Each test starts from an unclaimed workspace, so "the default" in these
  // tests always means the settings defaults the reader applies — never a
  // number this file remembers.
  await db.pool.query('DELETE FROM proj_workspace_settings');
});

describe('isoDatePlusDays', () => {
  it('adds across month boundaries', () => {
    expect(isoDatePlusDays('2026-08-23', 7)).toBe('2026-08-30');
    expect(isoDatePlusDays('2026-08-30', 7)).toBe('2026-09-06');
  });

  it('subtracts too — the staleness cut-off walks backwards from today', () => {
    expect(isoDatePlusDays('2026-08-23', -10)).toBe('2026-08-13');
    expect(isoDatePlusDays('2026-09-06', -7)).toBe('2026-08-30');
    expect(isoDatePlusDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('date-approaching', () => {
  it('notifies the assignee when a claimed date enters the window, with the claim verbatim', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA, dueDate: { date: '2026-08-30', note: 'GST filing' } });
    await sweep();
    const rows = await notificationRows('date-approaching');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(ANSELMA);
    expect(rows[0].dedupe_key).toBe(`date-approaching:${ticketId}:2026-08-30`);
    expect(rows[0].payload.claim).toEqual({
      date: '2026-08-30',
      note: 'GST filing',
      actorId: KIRO,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    });
  });

  it('running the sweep twice notifies once (planted defect: idempotence)', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await sweep();
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(1);
  });

  it('an undated ticket produces nothing — there is no date to approach (planted defect: the invented date is impossible)', async () => {
    await seedTicket({ ticketId: freshTicketId(), assigneeId: ANSELMA, dueDate: null });
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(0);
  });

  it('a claim beyond the window is not yet news', async () => {
    await seedTicket({ ticketId: freshTicketId(), assigneeId: ANSELMA, dueDate: { date: '2026-09-15' } });
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(0);
  });

  it('an already-passed claimed date still notifies once — overdue is inside the window, not past it', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA, dueDate: { date: '2026-08-20' } });
    await sweep();
    const rows = await notificationRows('date-approaching');
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupe_key).toBe(`date-approaching:${ticketId}:2026-08-20`);
  });

  it('a terminal ticket never notifies — done work has no approaching deadline', async () => {
    await seedTicket({ ticketId: freshTicketId(), stateCategory: 'terminal', stateId: 'done', assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(0);
  });

  it("an unassigned ticket notifies the claim's author — the person who claimed the date owns the caring", async () => {
    await seedTicket({ ticketId: freshTicketId(), assigneeId: null, dueDate: { date: '2026-08-30' } });
    await sweep();
    const rows = await notificationRows('date-approaching');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(KIRO);
  });
});

describe('stale-ticket', () => {
  it('notifies the assignee when an active state outlives the threshold, attributing who moved it there', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO); // IST day 2026-08-01, 22 IST days back — past the unclaimed workspace's DEFAULT_STALE_DAYS
    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(ANSELMA);
    expect(rows[0].dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-01T09:00:00.000Z`);
    expect(rows[0].payload).toEqual({
      ticketId,
      ticketTitle: 'Renew the DLT registration',
      stateId: 'doing',
      stateName: null, // no workflow.defined row seeded — name honestly unresolvable, id always present
      enteredAt: '2026-08-01T09:00:00.000Z',
      enteredBy: KIRO,
    });
  });

  it('a fresh active ticket is not stale', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-20T09:00:00.000Z', KIRO); // 3 days
    await sweep();
    expect(await notificationRows('stale-ticket')).toHaveLength(0);
  });

  it('an unassigned stale ticket sends nothing — the read-time attention strip owns it', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: null });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO);
    await sweep();
    expect(await notificationRows('stale-ticket')).toHaveLength(0);
  });

  it('re-running after the notification does not re-nag; a NEW entry into the same state may', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO);
    await sweep();
    await sweep();
    expect(await notificationRows('stale-ticket')).toHaveLength(1);
    // The ticket leaves and re-enters doing much earlier; the latest entering event wins.
    await seedEnteredState(ticketId, '2026-08-05T09:00:00.000Z', ANSELMA);
    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(2);
    expect(rows[1].dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-05T09:00:00.000Z`);
  });
});

describe('the sweep window is an IST day, and a sweep across IST midnight proves it', () => {
  /**
   * PLANTED DEFECT — the day boundary.
   *
   * 18:29:59Z is 23:59:59 IST on 2026-08-23; 18:30:00Z is 00:00:00 IST on
   * 2026-08-24. Same UTC date, different IST days. A sweep that took its
   * "today" from a UTC slice of the timestamp (`now.toISOString().slice(0,10)`)
   * would answer '2026-08-23' at BOTH instants, because a UTC day does not roll
   * until 05:30 IST. Two things then go wrong, and this block catches both:
   *
   *  1. The 31 Aug claim — which enters the 7-day window the moment the IST day
   *     becomes the 24th — would stay silent all night and only be noticed
   *     after 05:30 IST. A day late, silently, for exactly the claims that just
   *     became due-soon.
   *  2. The 30 Aug claim, already inside the window at both instants, must
   *     notify EXACTLY ONCE across the pair. Its dedupe key embeds the claimed
   *     day, so this holds as long as consecutive runs derive their days from
   *     the same facts. It is the idempotence guarantee above, restated at the
   *     one moment a shifting boundary could break it.
   *
   * To watch it bite: replace `istDayOf(createdAt)` in sweep.ts with
   * `createdAt.slice(0, 10)` and re-run — the 31 Aug expectation fails.
   */
  const BEFORE_IST_MIDNIGHT = '2026-08-23T18:29:00.000Z'; // 23:59 IST, 23 Aug
  const AFTER_IST_MIDNIGHT = '2026-08-23T18:31:00.000Z'; // 00:01 IST, 24 Aug

  it('one claim, two sweeps either side of IST midnight, exactly one notification — and the next IST day brings its own', async () => {
    const inWindowBoth = freshTicketId();
    const entersOnTheNextIstDay = freshTicketId();
    // 30 Aug is 7 days from IST-day 23 Aug: inside the window at both instants.
    await seedTicket({ ticketId: inWindowBoth, assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    // 31 Aug is 8 days from IST-day 23 Aug and 7 from IST-day 24 Aug: it enters
    // the window precisely when the IST day turns over, and not before.
    await seedTicket({ ticketId: entersOnTheNextIstDay, assigneeId: ANSELMA, dueDate: { date: '2026-08-31' } });

    await sweepAt(BEFORE_IST_MIDNIGHT);
    const afterFirst = await notificationRows('date-approaching');
    expect(afterFirst.map((row) => row.dedupe_key)).toEqual([`date-approaching:${inWindowBoth}:2026-08-30`]);

    await sweepAt(AFTER_IST_MIDNIGHT);
    const afterSecond = await notificationRows('date-approaching');
    // The 30 Aug claim did NOT notify a second time — the boundary moved, the key did not.
    expect(afterSecond.filter((row) => row.dedupe_key === `date-approaching:${inWindowBoth}:2026-08-30`)).toHaveLength(1);
    // The 31 Aug claim got its own notification, on the IST day it became news.
    expect(afterSecond.filter((row) => row.dedupe_key === `date-approaching:${entersOnTheNextIstDay}:2026-08-31`)).toHaveLength(1);
    expect(afterSecond).toHaveLength(2);
  });

  it('PLANTED DEFECT: the staleness cut-off is an IST day count, not a millisecond subtraction from the cron clock', async () => {
    // Nothing is claimed for this workspace, so the threshold is the settings
    // default — DEFAULT_STALE_DAYS, which the owner approved at 7. The sweep
    // runs at 00:01 IST on 24 Aug, so today is IST day 2026-08-24 and the
    // cut-off day is 2026-08-17, whose half-open bounds END at
    // 2026-08-17T18:30:00.000Z. The ticket entered at 2026-08-17T09:00:00.000Z
    // — 14:30 IST on IST day 2026-08-17 — which is exactly DEFAULT_STALE_DAYS
    // IST days back, so it IS stale.
    //
    // A raw `now.getTime() - staleDays * 86_400_000` would put the cut-off at
    // 2026-08-16T18:31:00.000Z and call this ticket fresh, because 6 days
    // 23 hours 29 minutes is not 7 × 24 h. A day count is a statement about
    // the calendar the user reads, not about the second the scheduler happened
    // to fire — and under the raw subtraction the answer would move every time
    // cron drifts. This block is about the BOUNDARY, not about the number: it
    // deliberately runs on the unclaimed default so the day arithmetic is the
    // only thing under test.
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-17T09:00:00.000Z', KIRO);
    await sweepAt(AFTER_IST_MIDNIGHT);
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-17T09:00:00.000Z`);
  });
});

describe('the sweep windows ARE the workspace settings — one origin, not two', () => {
  it('an unclaimed workspace sweeps on the settings defaults — the same two the attention strip shows', async () => {
    const windows = await resolveSweepWindows(db.pool, WS);
    // The mapping, asserted rather than described: approaching IS dueSoonDays,
    // staleness IS staleDays. No number is written down on either side of this
    // expectation — both come from the domain module Plan 5 owns.
    expect(windows).toEqual({
      approachingWindowDays: DEFAULT_DUE_SOON_DAYS,
      stalenessThresholdDays: DEFAULT_STALE_DAYS,
    });
  });

  it('a claimed workspace resolves to what the admin claimed, mapped concept for concept', async () => {
    await seedWorkspaceSettings({ staleDays: 3, dueSoonDays: 21 });
    expect(await resolveSweepWindows(db.pool, WS)).toEqual({
      approachingWindowDays: 21,
      stalenessThresholdDays: 3,
    });
  });

  /**
   * PLANTED DEFECT — the two-sources-of-truth defect this task exists to close.
   *
   * An admin narrows the workspace's staleness threshold to 3 days. A ticket
   * that has sat in an active state for 5 IST days is now stale BY THE
   * WORKSPACE'S OWN DEFINITION, and the sweep must say so.
   *
   * This test fails against every implementation that keeps its own number:
   *   - a private staleness constant in the sweep (the fortnight-long default
   *     this task deleted) → cut-off day 2026-08-09, the ticket reads fresh,
   *     no row;
   *   - the settings DEFAULT applied without reading the claim → cut-off day
   *     2026-08-16, the ticket reads fresh, no row.
   * It passes only if the sweep read `staleDays` out of proj_workspace_settings
   * for THIS workspace. That is the whole point: the board flags a ticket stale
   * and the inbox says so on the same day, because there is one number.
   */
  it('PLANTED DEFECT: an admin who narrows staleDays makes the sweep nag sooner — the threshold is the workspace\'s claim, never a constant in the sweep', async () => {
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    // 5 IST days before IST day 2026-08-23: fresh under any default, stale
    // under the claimed 3.
    await seedEnteredState(ticketId, '2026-08-18T09:00:00.000Z', KIRO);

    await sweep();
    expect(await notificationRows('stale-ticket')).toHaveLength(0); // unclaimed: the default holds it back

    await seedWorkspaceSettings({ staleDays: 3 }, { actorId: KIRO });
    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(ANSELMA);
    expect(rows[0].dedupe_key).toBe(`stale-ticket:${ticketId}:doing:2026-08-18T09:00:00.000Z`);
  });

  it('PLANTED DEFECT: an admin who widens staleDays silences a ticket the default would have flagged — the setting moves the sweep in both directions', async () => {
    await seedWorkspaceSettings({ staleDays: 30 });
    const ticketId = freshTicketId();
    await seedTicket({ ticketId, assigneeId: ANSELMA });
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO); // 22 IST days: stale under the default, fresh under 30
    await sweep();
    expect(await notificationRows('stale-ticket')).toHaveLength(0);
  });

  it('the approaching window is the workspace\'s dueSoonDays — narrowing it holds back a claim the default would have warned about', async () => {
    await seedWorkspaceSettings({ dueSoonDays: 2 });
    await seedTicket({ ticketId: freshTicketId(), assigneeId: ANSELMA, dueDate: { date: '2026-08-30' } });
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(0); // horizon 2026-08-25, the claim is beyond it

    await seedWorkspaceSettings({ dueSoonDays: 21 });
    await sweep();
    expect(await notificationRows('date-approaching')).toHaveLength(1); // horizon 2026-09-13, the claim is inside it
  });

  it('PLANTED DEFECT: each workspace gets ITS OWN settings — one server-wide sweep is not one workspace\'s thresholds applied to everyone', async () => {
    await seedWorkspaceSettings({ staleDays: 3 }, { workspaceId: WS });
    await seedWorkspaceSettings({ staleDays: 30 }, { workspaceId: OTHER_WS });

    const nagged = freshTicketId();
    const spared = freshTicketId();
    await seedTicket({ ticketId: nagged, workspaceId: WS, assigneeId: ANSELMA });
    await seedTicket({ ticketId: spared, workspaceId: OTHER_WS, assigneeId: ANSELMA });
    // The SAME entry instant in both workspaces — 22 IST days back. Stale under
    // WS's claimed 3, fresh under OTHER_WS's claimed 30. A sweep that read
    // settings once and reused them would get exactly one of these wrong.
    await seedEnteredState(nagged, '2026-08-01T09:00:00.000Z', KIRO, WS);
    await seedEnteredState(spared, '2026-08-01T09:00:00.000Z', KIRO, OTHER_WS);

    await sweep();
    const rows = await notificationRows('stale-ticket');
    expect(rows.map((row) => row.dedupe_key)).toEqual([
      `stale-ticket:${nagged}:doing:2026-08-01T09:00:00.000Z`,
    ]);
  });

  it('settings are read once per workspace, not once per ticket — a sweep must not query them per row', async () => {
    await seedWorkspaceSettings({ staleDays: 3 }, { workspaceId: WS });
    await seedWorkspaceSettings({ staleDays: 3 }, { workspaceId: OTHER_WS });
    for (const workspaceId of [WS, OTHER_WS]) {
      for (let i = 0; i < 3; i += 1) {
        const ticketId = freshTicketId();
        await seedTicket({ ticketId, workspaceId, assigneeId: ANSELMA, dueDate: { date: '2026-08-25' } });
        await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO, workspaceId);
      }
    }

    // Spy AFTER seeding: applyCommitted's projection write touches
    // proj_workspace_settings too, and counting it would flatter the result.
    const querySpy = vi.spyOn(db.pool, 'query');
    await sweep();
    const settingsReads = querySpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('proj_workspace_settings'),
    );
    // Two workspaces, six tickets, twelve notifications — and exactly two reads
    // of the thresholds. Per-ticket resolution would show six.
    expect(settingsReads).toHaveLength(2);
    expect(await notificationRows()).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/notifications/sweep.test.ts`
Expected: FAIL — `src/notifications/sweep.ts` does not exist.

- [ ] **Step 3: Implement the sweep**

`apps/server/src/notifications/sweep.ts`:

```ts
import type { Pool } from 'pg';
import { dateClaimProvenanceSchema, istDayBounds, istDayOf, newUlid, type Notification } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';
import { getWorkspaceSettings } from '../projections/workspace-settings.js';
import { canSee } from '../visibility/can-see.js';
import { deliverToAll, type NotificationTransport } from './transport.js';
import type { CanSeeFn } from './fanout.js';

/**
 * The two windows one sweep run uses for one workspace, already RESOLVED.
 *
 * This type is a shape, not a place where numbers live. Both values come from
 * the workspace's settings and from nowhere else; there is no default at this
 * type, and deliberately no threshold constant anywhere in this file. Spec
 * §7 calls both thresholds workspace-set, and they are: Plan 5's
 * `workspace.settings_set` claim is the single origin, projected into
 * `proj_workspace_settings` and read back by `getWorkspaceSettings`.
 */
export type SweepWindows = { approachingWindowDays: number; stalenessThresholdDays: number };

/**
 * The mapping between the sweep's vocabulary and the workspace's settings,
 * written down exactly once:
 *
 *   approaching window  ←  dueSoonDays
 *   staleness threshold ←  staleDays
 *
 * They are the same two questions the read-time attention strip asks ("is this
 * due soon?", "has this sat too long?"), so they must be the same two numbers.
 * When they were two sets of numbers, a board could flag a ticket stale while
 * the sweep stayed silent for another week, and an admin moving the setting
 * moved one of them — the exact drift this product exists to remove.
 *
 * `getWorkspaceSettings` applies `DEFAULT_STALE_DAYS`/`DEFAULT_DUE_SOON_DAYS`
 * for a workspace that never claimed either, so an unclaimed workspace and the
 * attention strip agree by construction rather than by coincidence.
 */
export async function resolveSweepWindows(db: Queryable, workspaceId: string): Promise<SweepWindows> {
  const settings = await getWorkspaceSettings(db, workspaceId);
  return {
    approachingWindowDays: settings.dueSoonDays,
    stalenessThresholdDays: settings.staleDays,
  };
}

/**
 * Note the absence of a `windows` key. There is no threshold to inject: an
 * override parameter would be a second way to set the number, and a second way
 * to set the number is a second number. Tests that need particular windows
 * claim them with a `workspace.settings_set` event, the way an admin does.
 */
export type SweepDeps = {
  pool: Pool;
  transports: NotificationTransport[];
  canSeeTicket?: CanSeeFn;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

export type SweepReport = { dueCandidates: number; staleCandidates: number; delivered: number };

/**
 * Calendar-day arithmetic over `YYYY-MM-DD`. Both sides are day claims, so no
 * timezone enters here at all: it shifts a day label, it never converts an
 * instant. `Date.UTC` is the arithmetic device, not a statement about UTC — the
 * value goes in as a day and comes out as a day. The instant→day step belongs
 * to `istDayOf` and to nothing else in this file. Negative `days` walks
 * backwards, which is how the staleness cut-off is found.
 */
export function isoDatePlusDays(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = String(shifted.getUTCFullYear()).padStart(4, '0');
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type DueRow = {
  ticket_id: string;
  workspace_id: string;
  assignee_id: string | null;
  title: string | null;
  due_claim: unknown;
};

type StaleRow = {
  ticket_id: string;
  workspace_id: string;
  assignee_id: string | null;
  state_id: string;
  workflow_id: string;
  title: string | null;
  entered_at: Date;
  entered_by: string;
};

export async function runNotificationSweep(deps: SweepDeps): Promise<SweepReport> {
  const canSeeTicket: CanSeeFn = deps.canSeeTicket ?? ((db, userId, ticketId) => canSee(db, userId, ticketId));
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
  const createdAt = now.toISOString();
  // The sweep's "today" is an IST day (owner decision: time is Asia/Kolkata).
  // NOT `createdAt.slice(0, 10)` — a UTC slice does not roll over until 05:30
  // IST, so between IST midnight and 05:30 every night it would compute
  // yesterday's horizon and hold back warnings that are due. istDayOf is the
  // one instant→day conversion in this file, and it runs ONCE for the whole
  // run, so every workspace in one sweep answers the same "today".
  const todayIst = istDayOf(createdAt);
  const report: SweepReport = { dueCandidates: 0, staleCandidates: 0, delivered: 0 };

  // The sweep is server-wide — the CLI has one DATABASE_URL and no workspace
  // argument — but the thresholds are PER WORKSPACE. So the run is a loop over
  // workspaces, and each workspace's settings are read exactly ONCE, before any
  // of its rows are looked at.
  //
  // Both nearby mistakes are structurally unreachable from here. Resolving
  // inside the row loops would be a settings query per ticket for a value that
  // cannot change mid-run — a per-row round trip that grows with the board.
  // Resolving once for the server would be worse than slow: it would apply one
  // workspace's claim to every other workspace's tickets, quietly nagging one
  // team on another team's threshold. A workspace with no tickets has nothing
  // to sweep and never appears.
  const workspaces = await deps.pool.query(
    `SELECT DISTINCT workspace_id FROM proj_tickets ORDER BY workspace_id`,
  );

  for (const { workspace_id: workspaceId } of workspaces.rows as Array<{ workspace_id: string }>) {
    // ONE settings read per workspace. `resolveSweepWindows` is the only place
    // in this file that knows which setting means which window.
    const windows = await resolveSweepWindows(deps.pool, workspaceId);
    const horizon = isoDatePlusDays(todayIst, windows.approachingWindowDays);

    // --- date-approaching: every non-terminal ticket in THIS workspace whose
    // CLAIMED date is on or before this workspace's horizon. The date is read
    // from the claim; nothing is computed onto tickets that carry no claim
    // (invariant 4).
    //
    // Day against day: a dueDate claim IS a day, the horizon IS a day, both are
    // IST, and `YYYY-MM-DD` sorts lexicographically — so this is a string
    // comparison and correctly so. Parsing the claim as a timestamp to compare
    // it against an instant would invent a time of day nobody claimed.
    const due = await deps.pool.query(
      `SELECT ticket_id, workspace_id, assignee_id,
              fields -> 'title' ->> 'value' AS title,
              fields -> 'dueDate' AS due_claim
         FROM proj_tickets
        WHERE workspace_id = $1
          AND state_category <> 'terminal'
          AND fields -> 'dueDate' -> 'value' ->> 'date' <= $2`,
      [workspaceId, horizon],
    );

    for (const row of due.rows as DueRow[]) {
      report.dueCandidates += 1;
      const claimRecord = row.due_claim as { value?: { date?: string; note?: string }; actorId?: string; clientTime?: string; serverTime?: string } | null;
      const flattened = {
        date: claimRecord?.value?.date ?? '',
        ...(claimRecord?.value?.note !== undefined ? { note: claimRecord.value.note } : {}),
        actorId: claimRecord?.actorId ?? '',
        clientTime: claimRecord?.clientTime ?? '',
        serverTime: claimRecord?.serverTime ?? '',
      };
      const claim = dateClaimProvenanceSchema.safeParse(flattened);
      if (!claim.success) {
        log(`sweep: dueDate claim on ${row.ticket_id} is not a well-formed FieldClaim — skipped, not guessed`);
        continue;
      }
      const target = row.assignee_id ?? claim.data.actorId;
      if (!(await canSeeTicket(deps.pool, target, row.ticket_id))) continue;
      const notification: Notification = {
        id: newUlid(),
        userId: target,
        workspaceId: row.workspace_id,
        kind: 'date-approaching',
        dedupeKey: `date-approaching:${row.ticket_id}:${claim.data.date}`,
        payload: { ticketId: row.ticket_id, ticketTitle: row.title ?? '', field: 'dueDate', claim: claim.data },
        read: false,
        createdAt,
      };
      await deliverToAll(deps.transports, notification, log);
      report.delivered += 1;
    }

    // --- stale-ticket: active tickets in THIS workspace whose latest
    // state-entering event is older than this workspace's threshold. "When did
    // it enter?" is derived from the ledger every run — never stored as a
    // second copy that could drift.
    //
    // The ORDER BY below is `seq`, and deliberately so: scoped by
    // (entity_kind, entity_id) this is ONE ticket's history, and per-entity
    // history is exactly what `seq` orders (Plan 1's readEntityEvents). It is
    // NOT a cursor. A workspace STREAM resumes by `workspace_seq` instead
    // (coordination §18) — this sweep never resumes a stream; it asks each
    // ticket, independently, "what was the last thing that happened to you?"
    //
    // Day against INSTANT: `server_time` is a timestamptz, the threshold is a
    // day count. So the cut-off day is walked back in day-space and then turned
    // into an instant by istDayBounds, whose interval is HALF-OPEN — the
    // comparison is a strict `<` against `endUtc`, meaning "entered on or
    // before the cut-off day". `now.getTime() - days * 86_400_000` is what this
    // replaced: it makes a day count mean that many twenty-four-hour spans from
    // whenever the scheduler fired, which drifts with the cron and not with the
    // calendar the assignee reads — and would answer differently from the
    // attention strip reading the very same `staleDays`.
    const stalenessCutoffDay = isoDatePlusDays(todayIst, -windows.stalenessThresholdDays);
    const staleBefore = istDayBounds(stalenessCutoffDay).endUtc;
    const stale = await deps.pool.query(
      `SELECT t.ticket_id, t.workspace_id, t.assignee_id, t.state_id, t.workflow_id,
              t.fields -> 'title' ->> 'value' AS title,
              entered.server_time AS entered_at, entered.actor_id AS entered_by
         FROM proj_tickets t
         JOIN LATERAL (
               SELECT e.server_time, e.actor_id
                 FROM events e
                WHERE e.entity_kind = 'ticket' AND e.entity_id = t.ticket_id
                  AND e.type IN ('ticket.created', 'ticket.transitioned')
                ORDER BY e.seq DESC
                LIMIT 1
             ) entered ON true
        WHERE t.workspace_id = $1
          AND t.state_category = 'active'
          AND entered.server_time < $2`,
      [workspaceId, staleBefore],
    );

    for (const row of stale.rows as StaleRow[]) {
      report.staleCandidates += 1;
      if (row.assignee_id === null) continue; // no addressee — the attention strip owns it at read time
      if (!(await canSeeTicket(deps.pool, row.assignee_id, row.ticket_id))) continue;
      const def = await getWorkflowDefFromProjection(deps.pool, row.workflow_id);
      const stateName = def?.states.find((state) => state.id === row.state_id)?.name ?? null;
      const enteredAt = row.entered_at.toISOString();
      const notification: Notification = {
        id: newUlid(),
        userId: row.assignee_id,
        workspaceId: row.workspace_id,
        kind: 'stale-ticket',
        dedupeKey: `stale-ticket:${row.ticket_id}:${row.state_id}:${enteredAt}`,
        payload: {
          ticketId: row.ticket_id,
          ticketTitle: row.title ?? '',
          stateId: row.state_id,
          stateName,
          enteredAt,
          enteredBy: row.entered_by,
        },
        read: false,
        createdAt,
      };
      await deliverToAll(deps.transports, notification, log);
      report.delivered += 1;
    }
  }

  return report;
}
```

(Two import paths to confirm rather than assume, both consumed from other plans. `getWorkspaceSettings` is Plan 5 Task 4's — `grep -rn "export async function getWorkspaceSettings" apps/server/src` and import from where it actually landed; if the grep finds nothing, Plan 5 has not merged and this task cannot proceed, so hand it to the orchestrator rather than inventing a threshold. `Queryable` is Plan 4's — the same `grep -rn "export type Queryable" apps/server/src` hedge Task 4 already carries.)

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/notifications/sweep.test.ts`
Expected: PASS — including the IST-boundary block and the settings block. Before trusting any of it, watch all four planted defects fail for the right reason, one at a time, restoring after each:

- swap `istDayOf(createdAt)` for `createdAt.slice(0, 10)` → the 31 Aug claim never arrives;
- swap the cut-off for `new Date(now.getTime() - windows.stalenessThresholdDays * 86_400_000).toISOString()` → the ticket sitting exactly `DEFAULT_STALE_DAYS` IST days in its state reads as fresh;
- **replace `resolveSweepWindows`'s body with a hard-coded pair — a week-long approaching window and a fortnight-long staleness threshold, the constants this task deleted** → *"an admin who narrows staleDays makes the sweep nag sooner"* fails (the 5-day ticket reads fresh against 14), *"an admin who widens staleDays silences a ticket"* fails (the 22-day ticket nags anyway), and the per-workspace test fails on both rows. This is the two-sources-of-truth defect, and it is the reason the settings block exists;
- **hoist the `resolveSweepWindows` call out of the workspace loop** so one workspace's windows serve the whole run → the per-workspace test fails: `OTHER_WS`'s ticket is nagged on `WS`'s threshold. Move it into the row loop instead and the read-count test fails at six reads instead of two.

- [ ] **Step 5: Add the CLI entry and script**

`apps/server/src/tools/sweep-notifications.ts`:

```ts
import { Pool } from 'pg';
import { runNotificationSweep } from '../notifications/sweep.js';
import { createInAppTransport } from '../notifications/transport.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const report = await runNotificationSweep({ pool, transports: [createInAppTransport(pool)] });
    console.log(
      `sweep: ${report.dueCandidates} due candidates, ${report.staleCandidates} stale candidates, ${report.delivered} delivered`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('sweep failed', error);
  process.exit(1);
});
```

In `apps/server/package.json` `"scripts"`, add:

```json
"sweep:notifications": "tsx src/tools/sweep-notifications.ts"
```

Run against the dev database to confirm it executes: `DATABASE_URL='postgres://gisik:gisik@localhost:54329/gisik_nokma' pnpm --filter @gisik-nokma/server run sweep:notifications`
Expected: a `sweep: … delivered` line, exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/notifications/sweep.ts apps/server/src/tools/sweep-notifications.ts apps/server/package.json apps/server/test/notifications/sweep.test.ts
git commit -m "attention sweep: claims entering the window and states outliving the threshold become inbox rows — same tables, same IST day, same keys, so twice never nags twice, midnight included

Both windows are the workspace's own settings, read per workspace from
Plan 5's getWorkspaceSettings: the approaching window IS dueSoonDays and
the staleness threshold IS staleDays. The sweep's old private constants
are gone along with the windows injection seam — a second way to set the
number was a second number, and it let a board flag a ticket stale a
week before the inbox said anything. The planted defects prove
it in both directions: an admin who narrows staleDays makes the sweep
nag sooner, one who widens it goes quiet, and two workspaces on one
server keep their own thresholds — resolved once each, never per row."
```

---

### Task 7: The notification API — `/v1/me/notifications`

Three routes under the amendments' `/v1` prefix (Plan 4's ticket reads sit under `/api` — divergence flagged in Open questions), all session-gated with Plan 4's `makeRequireSession`. Rows are the user's own by construction (`user_id = currentUserId` in every query); another user's notification id is indistinguishable from a missing one (404), the same probe-resistance Plan 4's ticket reads chose.

**Files:**
- Create: `apps/server/src/routes/notifications.ts`
- Modify: the route-registration site (locate: `grep -rn "registerTicketRoutes\|registerAuthRoutes" apps/server/src` — register beside them)
- Create: `apps/server/test/routes/notifications.test.ts`

**Interfaces:**
- Consumes: `listNotifications`, `markNotificationRead`, `unreadNotificationCount` (Task 4); `makeRequireSession`, `Auth`, `createAuth`, `registerAuthRoutes`, `LogOtpSender`, `signInWithPhone` (Plan 4); `insertNotification` (test seeding).
- Produces (Plans 6/10/11 inboxes consume):
  - `registerNotificationRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void`
  - `GET /v1/me/notifications?cursor=<id>&limit=<n>&workspaceId=<id>` → 200 `{ notifications: Notification[], nextCursor: string | null }` (camelCase JSON, newest first)
  - `GET /v1/me/notifications/unread-count` → 200 `{ unread: number }`
  - `POST /v1/me/notifications/:id/read` → 204 (idempotent); 404 `{ error: 'not_found' }` for a row that is not yours or does not exist
  - All three → 401 without a session.

- [ ] **Step 1: Write the failing route tests**

`apps/server/test/routes/notifications.test.ts` (mirrors Plan 4's route-test pattern: a Fastify instance with auth routes plus the routes under test; sessions via `signInWithPhone`. **Guard:** read `apps/server/test/auth/sign-in-flows.test.ts` first and copy its exact `createAuth(...)` construction — the `AuthDeps` keys are Plan 4's; the assertions below are what this task pins):

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type Notification } from '@gisik-nokma/domain';
import { createAuth, type Auth } from '../../src/auth/auth.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { insertNotification } from '../../src/notifications/store.js';
import { registerNotificationRoutes } from '../../src/routes/notifications.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let auth: Auth;
let sender: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  sender = new LogOtpSender();
  auth = createAuth({ pool: db.pool, otpSender: sender }); // Guard: match Plan 4's actual AuthDeps
  app = Fastify();
  registerAuthRoutes(app, auth);
  registerNotificationRoutes(app, { pool: db.pool, auth });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
});

function sample(userId: string, overrides: Partial<Notification> = {}): Notification {
  const id = newUlid();
  return {
    id,
    userId,
    workspaceId: '01J9GWS0000000000000000000',
    kind: 'assignment',
    dedupeKey: `assignment:${id}`,
    payload: {
      ticketId: '01J9GTKA000000000000000000',
      ticketTitle: 'Renew the DLT registration',
      assignedBy: '01J9GUKR000000000000000000',
      eventId: id,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
    read: false,
    createdAt: '2026-08-23T05:00:00.000Z',
    ...overrides,
  };
}

describe('GET /v1/me/notifications', () => {
  it('401s without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications' });
    expect(response.statusCode).toBe(401);
  });

  it('returns only my rows, newest first, with a working cursor', async () => {
    const token = await signInWithPhone(app, sender, '+919999000001');
    const me = await currentUserId(token);
    const other = await signInWithPhone(app, sender, '+919999000002');
    const otherId = await currentUserId(other);

    const a = sample(me);
    const b = sample(me);
    await insertNotification(db.pool, a);
    await insertNotification(db.pool, b);
    await insertNotification(db.pool, sample(otherId));

    const page1 = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?limit=1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json() as { notifications: Notification[]; nextCursor: string | null };
    expect(body1.notifications).toHaveLength(1);
    expect(body1.notifications[0].userId).toBe(me);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/me/notifications?limit=1&cursor=${body1.nextCursor}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body2 = page2.json() as { notifications: Notification[]; nextCursor: string | null };
    expect(body2.notifications).toHaveLength(1);
    expect(body2.notifications[0].id).not.toBe(body1.notifications[0].id);
    expect(body2.nextCursor).toBeNull();
  });
});

describe('GET /v1/me/notifications/unread-count', () => {
  it('counts my unread rows only', async () => {
    const token = await signInWithPhone(app, sender, '+919999000003');
    const me = await currentUserId(token);
    await insertNotification(db.pool, sample(me));
    await insertNotification(db.pool, sample(me, { read: true }));
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications/unread-count',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.json()).toEqual({ unread: 1 });
  });
});

describe('POST /v1/me/notifications/:id/read', () => {
  it("marks my row (204, idempotent); someone else's row 404s — indistinguishable from missing (planted defect)", async () => {
    const token = await signInWithPhone(app, sender, '+919999000004');
    const me = await currentUserId(token);
    const other = await signInWithPhone(app, sender, '+919999000005');
    const otherId = await currentUserId(other);

    const mine = sample(me);
    const theirs = sample(otherId);
    await insertNotification(db.pool, mine);
    await insertNotification(db.pool, theirs);

    const ok = await app.inject({ method: 'POST', url: `/v1/me/notifications/${mine.id}/read`, headers: { authorization: `Bearer ${token}` } });
    expect(ok.statusCode).toBe(204);
    const again = await app.inject({ method: 'POST', url: `/v1/me/notifications/${mine.id}/read`, headers: { authorization: `Bearer ${token}` } });
    expect(again.statusCode).toBe(204);

    const foreign = await app.inject({ method: 'POST', url: `/v1/me/notifications/${theirs.id}/read`, headers: { authorization: `Bearer ${token}` } });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: 'not_found' });
    const untouched = await db.pool.query('SELECT read FROM notifications WHERE id = $1', [theirs.id]);
    expect(untouched.rows[0].read).toBe(false);
  });
});

/** Resolve the session's user id the same way Plan 4's route tests do. Guard: copy their exact helper if one exists. */
async function currentUserId(token: string): Promise<string> {
  const response = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { authorization: `Bearer ${token}` } });
  return (response.json() as { user: { id: string } }).user.id;
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/notifications.test.ts`
Expected: FAIL — `src/routes/notifications.ts` does not exist.

- [ ] **Step 3: Implement the routes**

`apps/server/src/routes/notifications.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { makeRequireSession } from '../auth/session.js'; // Guard: Plan 4's export site — grep "makeRequireSession"
import type { Auth } from '../auth/auth.js';
import { listNotifications, markNotificationRead, unreadNotificationCount } from '../notifications/store.js';

export function registerNotificationRoutes(app: FastifyInstance, deps: { pool: Pool; auth: Auth }): void {
  const requireSession = makeRequireSession(deps.auth);

  app.get('/v1/me/notifications', { preHandler: requireSession }, async (request) => {
    const query = request.query as { cursor?: string; limit?: string; workspaceId?: string };
    const parsedLimit = Number(query.limit);
    return listNotifications(deps.pool, request.currentUserId, {
      cursor: query.cursor ?? null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      workspaceId: query.workspaceId ?? null,
    });
  });

  app.get('/v1/me/notifications/unread-count', { preHandler: requireSession }, async (request) => {
    return { unread: await unreadNotificationCount(deps.pool, request.currentUserId) };
  });

  app.post('/v1/me/notifications/:id/read', { preHandler: requireSession }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const marked = await markNotificationRead(deps.pool, request.currentUserId, id);
    if (!marked) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.code(204).send();
  });
}
```

Register it where the other route registrations live (the grep from **Files**), passing the boot's `pool` and `auth`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/routes/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole server suite and typecheck**

Run: `pnpm --filter @gisik-nokma/server test && pnpm --filter @gisik-nokma/server typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/notifications.ts apps/server/test/routes/notifications.test.ts apps/server/src
git commit -m "notification routes: cursor inbox, unread count, mark-read — your rows by construction, and someone else's id reads as not_found, never as forbidden"
```

---

### Task 8: The calendar view-model — pure, and honest by construction

Everything the month grid shows is computed here, in a pure function over `TicketState[]` — no React, no DataSource, no clock reads (the month and `today` are inputs). The honesty invariants become theorems of this function: there is no code path that produces an item without a claim, and the planted-defect tests prove the three required guarantees — the undated ticket is absent (an all-undated board is an empty month that says why, echoing the reference calendar's "an undated item is absent, not estimated"), the invented date is impossible (every rendered date exists verbatim among the planted claims), and the attributed label is exact (`needed by 30 Aug — Kiro's claim`). A start-after-due contradiction renders as two attributed markers, never as a bar: negative geometry would be invented geometry.

**Custom `date`-kind fields render here too (owner sign-off 2026-08-20, v1 scope).** A workspace that defines "Filed on" or "Inspection date" on a ticket type has claimed dates the calendar must not silently swallow. They enter on *identical* honesty terms: each renders as a marker attributed to its claimant with that claim's own timestamps, absent when unclaimed, and **labelled with the field's own name** — never a generic word like "date", because the name is the only thing that says what the day means. Two hard limits, both load-bearing: **(1) a bar still requires a `startDate` + `dueDate` pair.** No span is ever drawn between a custom date and anything else — pairing two arbitrary claims into geometry would invent a duration nobody claimed, which is exactly what invariant 4 forbids. Custom date claims are markers, full stop. **(2) A custom date claim carries no note.** Plan 3's kind check accepts a bare `'YYYY-MM-DD'` string for `type: 'date'` fields (unlike the day-claim built-ins' `{date, note?}`), so the tooltip is the label — there is nothing else to quote, and nothing is invented to fill the gap.

**Identical terms means identical code.** A custom date claim is validated by the same `IST_DAY_REGEX`, placed in its cell by the same `istDayOf`-derived day, and rendered against the same IST clock as `dueDate` and `startDate`. It is not "a lesser date with looser rules": the only differences are the ones Plan 3's schema actually creates (a bare string rather than `{date, note?}`) and the two limits above. Nothing about a custom field gets its own day arithmetic — a "Filed on" claim that landed in a different cell from a `dueDate` claim on the same day would be the product disagreeing with itself in public.

**Files:**
- Create (guarded, Step 0): `packages/app-core/package.json`, `packages/app-core/tsconfig.json`, `packages/app-core/vitest.config.ts`, `packages/app-core/src/index.ts`; `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/tokens.ts`, `packages/ui/src/index.ts`
- Create: `packages/app-core/src/claims/dates.ts`
- Create: `packages/app-core/src/claims/ticket-dates.ts`
- Create: `packages/app-core/src/claims/claim-labels.ts`
- Create: `packages/app-core/src/hierarchy/epic-ancestor.ts`
- Create (guarded): `packages/app-core/src/filter/filter-spec.ts`
- Create: `packages/app-core/src/calendar/calendar-model.ts`
- Test: `packages/app-core/src/claims/dates.test.ts`, `packages/app-core/src/claims/claim-labels.test.ts`, `packages/app-core/src/calendar/calendar-model.test.ts`

**Interfaces:**
- Consumes: `TicketState`, `FieldClaim`, `StateCategory`, `CustomFieldDef`, `IST_DAY_REGEX`, `istDayOf` (`@gisik-nokma/domain`). `ist-day.ts` is dependency-free — no zod, no date library — so app-core imports it without taking on anything, and the day shape has one origin instead of a copy per package.
- **Where the day helpers apply here, and where they deliberately do not.** Everything in `dates.ts` is *day-string calendar arithmetic*: it takes `YYYY-MM-DD` in and gives `YYYY-MM-DD` out, so no timezone is involved and `istDayOf` has nothing to convert. That code stays exactly as it is. `istDayOf` is for the one direction that IS a timezone question — an absolute instant to the day it falls in — and it is what the mounting shell calls to produce the `today`/`anchor` props these views take (`istDayOf(new Date().toISOString())`, never `new Date().toLocaleDateString()` and never a device-local slice). `IST_DAY_REGEX` replaces the local day literal the readers used to declare.
- Produces (Tasks 9–11 and Plan 6's shells consume; amendment 10 makes app-core the shared home):
  - `DAY_MS`, `dateMs(isoDate): number`, `isoDate(ms): string`, `addDays(isoDay, days): string`, `mondayOnOrBefore(isoDay): string`, `monthGridWeeks(year, month): string[][]` (Monday-start weeks covering the month, padded with adjacent-month days) — all day-in/day-out, no instant ever enters them
  - `type DateClaimView = { date, note?, actorId, clientTime, serverTime, pending }`; `type CustomDateField = { id: string; name: string }`; `type TicketDatesInput = { state: TicketState; pendingFieldIds: readonly string[]; customDateFields?: readonly CustomDateField[] }`; `dateClaimOf(input, 'startDate'|'dueDate'): DateClaimView | null`; `titleOf(state): string`
  - `type CustomDateClaimView = { fieldId, fieldName, date, actorId, clientTime, serverTime, pending }`; `customDateClaimsOf(input: TicketDatesInput): CustomDateClaimView[]` — one entry per *claimed* custom `date`-kind field, in the type's declared field order; an unclaimed or malformed field yields nothing at all
  - `formatClaimDate('2026-08-30') === '30 Aug'`; `type UserNameFn = (userId: string) => string`; `dueClaimLabel`, `startClaimLabel`, `claimTooltip`, `barProvenance`, `contradictionCopy` (all `(claims, userName) => string`); `customClaimLabel(claim: CustomDateClaimView, userName): string` — `` `Filed on: 30 Aug — Kiro's claim` ``, the field's own name verbatim; `CALENDAR_EMPTY_MONTH_COPY`, `TIMELINE_SIDE_LIST_COPY` (exact strings below)
  - `epicAncestorOf(byId: Map<string, TicketState>, ticketId: string): string | null`
  - `type FilterSpec = { text?, assigneeIds?, collaboratorIds?, typeIds?, stateIds?, stateCategories?, projectIds? }`; `matchesFilter(state: TicketState, spec: FilterSpec): boolean` (guarded — Plan 6's wins if landed)
  - `type CalendarMonth = { year, month }`; `type CalendarItem` (marker | bar union below — the marker member's `marker` is `'due' | 'start' | 'custom'`, and it carries `fieldId`/`fieldName`, `null` for the two built-ins); `type CalendarWeek = { days: string[]; items: CalendarItem[] }`; `type CalendarCustomFieldTally = { fieldId: string; fieldName: string; count: number }`; `type CalendarModel = { month, weeks, hasItems, emptyCopy: string | null; customDateFields: CalendarCustomFieldTally[] }` — the roster is the legend's source, tallied over the fields that actually placed a claim in this month and computed BEFORE legend hiding, so hiding a field never erases its own switch; `buildCalendarModel(inputs: TicketDatesInput[], opts: CalendarMonth & { userName: UserNameFn; filter?: FilterSpec; laneEpicId?: string | null; hiddenCustomFieldIds?: readonly string[] }): CalendarModel`

**Where `customDateFields` comes from (the one adapter site).** `TicketDatesInput` already documents itself as the shape the mounting shell maps the DataSource's read result into; `customDateFields` joins it there — the shell resolves the ticket's `TicketTypeDef` and passes the `fields` entries whose `type` is `'date'`, as `{id, name}`. It is optional and defaults to none, so a shell that has not yet wired the type roster degrades to exactly today's behaviour (built-ins only) rather than to a wrong answer. app-core never fetches type definitions itself — a view-model that reached for data would stop being pure.

- [ ] **Step 0: Guard — scaffold `packages/app-core` and `packages/ui` only if absent**

Run: `ls packages/app-core/package.json packages/ui/src/tokens.ts 2>/dev/null`

**Both exist** (Plan 6 landed first): skip the scaffolds; check `packages/ui/src/tokens.ts` for the token names used below (`color.surface`, `color.ink`, `color.inkMuted`, `color.line`, `color.accent`, `color.todayRing`, `color.pendingHatch`, `color.barActive`, `color.barTerminal`, `color.marker`, `color.customMarker`, `color.contested`, `color.unreadDot`, `space.xs/sm/md/lg`, `radius.sm/md`, `font.body`) and ADD any missing key to `tokens.ts` (the one colour origin — never inline a literal instead). Also confirm the vitest environment is jsdom-capable; if not, add the config below.

**Absent** (this plan runs first): create the minimal scaffolds — Plan 6's executor will find them via its own guard and extend rather than recreate.

`packages/app-core/package.json`:

```json
{
  "name": "@gisik-nokma/app-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "dependencies": {
    "@gisik-nokma/domain": "workspace:*",
    "@gisik-nokma/ui": "workspace:*"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "jsdom": "^25.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.6.3",
    "vitest": "^3.1.0"
  }
}
```

`packages/app-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "types": ["react"]
  },
  "include": ["src", "test"]
}
```

`packages/app-core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
  },
});
```

`packages/app-core/vitest.setup.ts` (the jest-dom matchers — `toBeInTheDocument`, `toHaveAttribute`, `toBeDisabled` — that the component tests below use):

```ts
import '@testing-library/jest-dom/vitest';
```

`packages/app-core/src/index.ts` starts empty except a comment (`// exports accumulate as modules land`) and gains export lines as tasks add modules.

`packages/ui/package.json`:

```json
{
  "name": "@gisik-nokma/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

`packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["src"]
}
```

`packages/ui/src/tokens.ts` (amendment 11: the ONE colour origin — every colour any client renders comes from here):

```ts
export const tokens = {
  color: {
    surface: '#ffffff',
    ink: '#1a1a24',
    inkMuted: '#6b6b76',
    line: '#e3e3ea',
    accent: '#2f6fed',
    accentInk: '#ffffff',
    todayRing: '#2f6fed',
    pendingHatch: '#b9c6e8',
    barOpen: '#d7dbe7',
    barActive: '#9db4e6',
    barTerminal: '#b9d8c2',
    marker: '#8a5cd6',
    customMarker: '#2f7d6b',
    contested: '#d6675c',
    unreadDot: '#d6675c',
  },
  space: { xs: '4px', sm: '8px', md: '16px', lg: '24px' },
  radius: { sm: '4px', md: '8px' },
  font: { body: 'system-ui, sans-serif' },
} as const;

export type Tokens = typeof tokens;
```

`packages/ui/src/index.ts`:

```ts
export { tokens, type Tokens } from './tokens.js';
```

Then run `pnpm install` at the repo root.

- [ ] **Step 1: Write the failing date/label tests**

`packages/app-core/src/claims/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays, mondayOnOrBefore, monthGridWeeks } from './dates';

describe('monthGridWeeks', () => {
  it('covers August 2026 in Monday-start weeks, padded to full rows', () => {
    const weeks = monthGridWeeks(2026, 8);
    expect(weeks[0][0]).toBe('2026-07-27'); // 1 Aug 2026 is a Saturday
    expect(weeks[0][5]).toBe('2026-08-01');
    expect(weeks).toHaveLength(6); // 31 Aug is a Monday and opens a sixth row
    expect(weeks[5][0]).toBe('2026-08-31');
    expect(weeks[5][6]).toBe('2026-09-06');
    for (const week of weeks) expect(week).toHaveLength(7);
  });
});

describe('helpers', () => {
  it('addDays crosses months', () => {
    expect(addDays('2026-08-30', 7)).toBe('2026-09-06');
  });
  it('mondayOnOrBefore is identity on Mondays', () => {
    expect(mondayOnOrBefore('2026-08-31')).toBe('2026-08-31');
    expect(mondayOnOrBefore('2026-08-23')).toBe('2026-08-17'); // a Sunday folds back six days
  });
});
```

`packages/app-core/src/claims/claim-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CALENDAR_EMPTY_MONTH_COPY,
  barProvenance,
  claimTooltip,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  formatClaimDate,
  startClaimLabel,
} from './claim-labels';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string) => names[id] ?? id;

describe("attributed labels (spec §7's exact shape — planted-defect: the label is exact)", () => {
  it('formats the claimed day', () => {
    expect(formatClaimDate('2026-08-30')).toBe('30 Aug');
    expect(formatClaimDate('2026-01-05')).toBe('5 Jan');
  });

  it("a due claim renders as the spec's example, verbatim", () => {
    expect(dueClaimLabel({ date: '2026-08-30', actorId: 'user_kiro' }, userName)).toBe("needed by 30 Aug — Kiro's claim");
  });

  it('a start claim is attributed the same way', () => {
    expect(startClaimLabel({ date: '2026-09-01', actorId: 'user_anselma' }, userName)).toBe("starts 1 Sep — Anselma's claim");
  });

  it("the tooltip carries the claim's note, quoted — never paraphrased", () => {
    expect(claimTooltip("needed by 30 Aug — Kiro's claim", { date: '2026-08-30', actorId: 'user_kiro', note: 'GST filing' })).toBe(
      `needed by 30 Aug — Kiro's claim · "GST filing"`,
    );
  });

  it("a custom date claim wears the FIELD'S OWN NAME — never a generic word", () => {
    expect(
      customClaimLabel(
        {
          fieldId: 'filed-on',
          fieldName: 'Filed on',
          date: '2026-08-30',
          actorId: 'user_kiro',
          clientTime: '2026-08-19T10:00:00.000Z',
          serverTime: '2026-08-19T10:00:01.000Z',
          pending: false,
        },
        userName,
      ),
    ).toBe("Filed on: 30 Aug — Kiro's claim");
  });

  it('bar provenance names both claims and both authors', () => {
    expect(
      barProvenance(
        { date: '2026-08-24', actorId: 'user_anselma' },
        { date: '2026-08-30', actorId: 'user_kiro' },
        userName,
      ),
    ).toBe("starts 24 Aug — Anselma's claim · needed by 30 Aug — Kiro's claim");
  });

  it('a start-after-due contradiction is shown, not resolved', () => {
    expect(contradictionCopy({ date: '2026-08-30', actorId: 'user_kiro' }, { date: '2026-08-24', actorId: 'user_kiro' })).toBe(
      'start 30 Aug is after needed-by 24 Aug — both claims shown, no bar drawn',
    );
  });

  it('the empty month says why it is empty', () => {
    expect(CALENDAR_EMPTY_MONTH_COPY).toBe(
      'No claimed dates fall in this month. Undated work is absent, not estimated — the calendar draws only what someone claimed.',
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/claims`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement dates, ticket-dates, and labels**

`packages/app-core/src/claims/dates.ts`:

```ts
/**
 * Day-string calendar arithmetic: `YYYY-MM-DD` in, `YYYY-MM-DD` out.
 *
 * NOTHING here converts an instant to a day, and nothing here is a statement
 * about UTC. `Date.UTC`/`getUTC*` are used as fixed-offset arithmetic — a way
 * to add seven days to a calendar label without a leap-year table — and the
 * value that goes in is already the day someone claimed. That is why these
 * functions need no timezone: the timezone question was answered before the
 * day reached them.
 *
 * The one place that question IS answered is `istDayOf` in
 * `@gisik-nokma/domain` (owner decision: a day starts at IST midnight). Every
 * instant→day step — the shell computing `today`, the timeline's `anchor`, the
 * inbox rendering a stored `enteredAt` — goes through it. If you find yourself
 * wanting to pass a timestamp into `dateMs` or `isoDate`, call `istDayOf`
 * first: these take days, and a truncated timestamp is not one.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

export function dateMs(isoDay: string): number {
  const [year, month, day] = isoDay.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Inverse of `dateMs` — for day-arithmetic results only, never for a clock reading. */
export function isoDate(ms: number): string {
  const at = new Date(ms);
  const year = String(at.getUTCFullYear()).padStart(4, '0');
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(isoDay: string, days: number): string {
  return isoDate(dateMs(isoDay) + days * DAY_MS);
}

export function mondayOnOrBefore(isoDay: string): string {
  const ms = dateMs(isoDay);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return isoDate(ms - sinceMonday * DAY_MS);
}

/** Monday-start weeks covering the month, padded with adjacent-month days. */
export function monthGridWeeks(year: number, month: number): string[][] {
  const firstIso = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastMs = Date.UTC(year, month, 0); // day 0 of the next month
  const weeks: string[][] = [];
  for (let weekStart = dateMs(mondayOnOrBefore(firstIso)); weekStart <= lastMs; weekStart += 7 * DAY_MS) {
    const days: string[] = [];
    for (let offset = 0; offset < 7; offset += 1) days.push(isoDate(weekStart + offset * DAY_MS));
    weeks.push(days);
  }
  return weeks;
}
```

`packages/app-core/src/claims/ticket-dates.ts`:

```ts
import { IST_DAY_REGEX, type TicketState } from '@gisik-nokma/domain';

/** A date claim as a view renders it: the FieldClaim flattened, plus the in-transit flag. */
export type DateClaimView = {
  date: string;
  note?: string;
  actorId: string;
  clientTime: string;
  serverTime: string;
  pending: boolean;
};

/** A custom `date`-kind field, reduced to what a view needs: which, and called what. */
export type CustomDateField = { id: string; name: string };

/** A claimed custom date. No `note`: Plan 3's kind check accepts a bare 'YYYY-MM-DD' string. */
export type CustomDateClaimView = {
  fieldId: string;
  fieldName: string;
  date: string;
  actorId: string;
  clientTime: string;
  serverTime: string;
  pending: boolean;
};

/**
 * What the views take from the DataSource: head state, which fields'
 * latest claims are still in transit (outbox-applied, not yet accepted),
 * and the ticket type's custom `date`-kind fields as {id, name}.
 * The adapter in src/data maps the DataSource's actual query result to this
 * shape — one site to adjust when Plan 6/10's exact result type lands, and
 * the one place that resolves a TicketTypeDef into `customDateFields`.
 * Optional: a shell that has not wired the type roster yet renders the two
 * built-ins only — narrower than the truth, never wrong about it.
 */
export type TicketDatesInput = {
  state: TicketState;
  pendingFieldIds: readonly string[];
  customDateFields?: readonly CustomDateField[];
};

/**
 * The day shape has ONE origin: IST_DAY_REGEX in @gisik-nokma/domain's
 * ist-day.ts. An earlier draft re-declared it here as a local literal, because
 * app-core does not depend on zod and the built-in's schema does. That reason
 * is gone: ist-day.ts is dependency-free — no zod, no date library, no
 * timezone database — so importing it costs nothing and removes the last place
 * two statements of "what a day claim is" could drift apart. The domain pin in
 * Task 1 holds Plan 3's schema against this same regex.
 */

/** The claim, or null. There is NO other source of dates — absence is absence. */
export function dateClaimOf(input: TicketDatesInput, fieldId: 'startDate' | 'dueDate'): DateClaimView | null {
  const claim = input.state.fields[fieldId];
  if (!claim || claim.value === null || claim.value === undefined) return null;
  const value = claim.value as Record<string, unknown>;
  if (typeof value !== 'object' || typeof value.date !== 'string' || !IST_DAY_REGEX.test(value.date)) return null;
  return {
    date: value.date,
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
    actorId: claim.actorId,
    clientTime: claim.clientTime,
    serverTime: claim.serverTime,
    pending: input.pendingFieldIds.includes(fieldId),
  };
}

/**
 * Every CLAIMED custom date field, in the type's declared field order.
 * Unclaimed is absent — there is no branch that emits an entry for a field
 * nobody filled in, and none that guesses a value from a neighbouring one.
 * A malformed stored value is skipped rather than coerced: rendering a
 * half-parsed day would be inventing one.
 */
export function customDateClaimsOf(input: TicketDatesInput): CustomDateClaimView[] {
  const claims: CustomDateClaimView[] = [];
  for (const field of input.customDateFields ?? []) {
    const claim = input.state.fields[field.id];
    if (!claim || claim.value === null || claim.value === undefined) continue;
    if (typeof claim.value !== 'string' || !IST_DAY_REGEX.test(claim.value)) continue;
    claims.push({
      fieldId: field.id,
      fieldName: field.name,
      date: claim.value,
      actorId: claim.actorId,
      clientTime: claim.clientTime,
      serverTime: claim.serverTime,
      pending: input.pendingFieldIds.includes(field.id),
    });
  }
  return claims;
}

export function titleOf(state: TicketState): string {
  const value = state.fields.title?.value;
  return typeof value === 'string' ? value : '';
}
```

`packages/app-core/src/claims/claim-labels.ts`:

```ts
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatClaimDate(isoDay: string): string {
  const [, month, day] = isoDay.split('-');
  return `${Number(day)} ${MONTH_SHORT[Number(month) - 1]}`;
}

export type AttributedDate = { date: string; actorId: string; note?: string };
export type UserNameFn = (userId: string) => string;

/** Spec §7's exact shape: "needed by 30 Aug — Kiro's claim". */
export function dueClaimLabel(claim: AttributedDate, userName: UserNameFn): string {
  return `needed by ${formatClaimDate(claim.date)} — ${userName(claim.actorId)}'s claim`;
}

export function startClaimLabel(claim: AttributedDate, userName: UserNameFn): string {
  return `starts ${formatClaimDate(claim.date)} — ${userName(claim.actorId)}'s claim`;
}

/**
 * A custom date claim, labelled with the FIELD'S OWN NAME (owner sign-off
 * 2026-08-20). "Filed on: 30 Aug — Kiro's claim". The name is user-authored
 * and arbitrary, so it is placed verbatim ahead of a colon rather than
 * inflected into a sentence: we cannot know whether "Inspection date" wants
 * "on", "by" or nothing, and guessing grammar around someone's own words is
 * the same failure as guessing their dates. The colon carries the relation;
 * the name carries the meaning.
 */
export function customClaimLabel(claim: { fieldName: string; date: string; actorId: string }, userName: UserNameFn): string {
  return `${claim.fieldName}: ${formatClaimDate(claim.date)} — ${userName(claim.actorId)}'s claim`;
}

/** The note travels quoted, never paraphrased. */
export function claimTooltip(label: string, claim: AttributedDate): string {
  return claim.note === undefined ? label : `${label} · "${claim.note}"`;
}

export function barProvenance(start: AttributedDate, due: AttributedDate, userName: UserNameFn): string {
  return `${startClaimLabel(start, userName)} · ${dueClaimLabel(due, userName)}`;
}

export function contradictionCopy(start: AttributedDate, due: AttributedDate): string {
  return `start ${formatClaimDate(start.date)} is after needed-by ${formatClaimDate(due.date)} — both claims shown, no bar drawn`;
}

/** The reference calendar's honesty note, generalised (its design doc: "an undated item is absent, not estimated"). */
export const CALENDAR_EMPTY_MONTH_COPY =
  'No claimed dates fall in this month. Undated work is absent, not estimated — the calendar draws only what someone claimed.';

export const TIMELINE_SIDE_LIST_COPY =
  'No bar is invented: work appears here until it carries both a claimed start and a claimed needed-by.';
```

- [ ] **Step 4: Run the date/label tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/claims`
Expected: PASS.

- [ ] **Step 5: Add the hierarchy helper and (guarded) the filter module**

`packages/app-core/src/hierarchy/epic-ancestor.ts`:

```ts
import type { TicketState } from '@gisik-nokma/domain';

/**
 * The nearest ancestor (or self) of built-in type 'epic', from the loaded
 * ticket set. Grouping is arrangement, not data: a missing ancestor is null
 * (the "No epic" lane), never a guess. Cycle-safe because reparent refusals
 * can lag in a replica.
 */
export function epicAncestorOf(byId: Map<string, TicketState>, ticketId: string): string | null {
  let current = byId.get(ticketId);
  const seen = new Set<string>();
  while (current) {
    if (current.typeId === 'epic') return current.id;
    if (current.parentId === null || seen.has(current.id)) return null;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return null;
}
```

**Guard for the filter module:** run `grep -rn "FilterSpec" packages/app-core/src packages/domain/src`. If Plan 6 landed a `FilterSpec`/`matchesFilter`, import theirs everywhere this plan says `../filter/filter-spec` and skip this file. Otherwise create `packages/app-core/src/filter/filter-spec.ts`:

```ts
import type { StateCategory, TicketState } from '@gisik-nokma/domain';

/**
 * Client-side filter vocabulary (spec §7: assignee, collaborator, type,
 * state, state category, project — text here matches titles only; full-text
 * over descriptions/comments is the server's search projection).
 */
export type FilterSpec = {
  text?: string;
  assigneeIds?: string[];
  collaboratorIds?: string[];
  typeIds?: string[];
  stateIds?: string[];
  stateCategories?: StateCategory[];
  projectIds?: string[];
};

export function matchesFilter(state: TicketState, spec: FilterSpec): boolean {
  if (spec.assigneeIds && spec.assigneeIds.length > 0) {
    if (state.assigneeId === null || !spec.assigneeIds.includes(state.assigneeId)) return false;
  }
  if (spec.collaboratorIds && spec.collaboratorIds.length > 0) {
    if (!spec.collaboratorIds.some((id) => state.collaboratorIds.includes(id))) return false;
  }
  if (spec.typeIds && spec.typeIds.length > 0 && !spec.typeIds.includes(state.typeId)) return false;
  if (spec.stateIds && spec.stateIds.length > 0 && !spec.stateIds.includes(state.stateId)) return false;
  if (spec.stateCategories && spec.stateCategories.length > 0 && !spec.stateCategories.includes(state.stateCategory)) return false;
  if (spec.projectIds && spec.projectIds.length > 0 && !spec.projectIds.includes(state.projectId)) return false;
  if (spec.text && spec.text.trim() !== '') {
    const needle = spec.text.trim().toLowerCase();
    const title = String(state.fields.title?.value ?? '').toLowerCase();
    if (!title.includes(needle)) return false;
  }
  return true;
}
```

- [ ] **Step 6: Write the failing calendar-model tests**

`packages/app-core/src/calendar/calendar-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { CALENDAR_EMPTY_MONTH_COPY } from '../claims/claim-labels';
import type { TicketDatesInput } from '../claims/ticket-dates';
import { buildCalendarModel, type CalendarItem } from './calendar-model';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string) => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

function ticket(
  overrides: Partial<TicketState> = {},
  pendingFieldIds: string[] = [],
  customDateFields: readonly { id: string; name: string }[] = [],
): TicketDatesInput {
  counter += 1;
  const base: TicketState = {
    id: `t${counter}`,
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: claimField(`Ticket ${counter}`) },
    transitions: [],
    // If the landed TicketState carries more required fields (e.g. a
    // workflowVersion), extend THIS builder — it is the single site.
  } as TicketState;
  return {
    state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } },
    pendingFieldIds,
    customDateFields,
  };
}

function allItems(model: ReturnType<typeof buildCalendarModel>): CalendarItem[] {
  return model.weeks.flatMap((week) => week.items);
}

const AUG = { year: 2026, month: 8 };

describe('the undated ticket is ABSENT (planted defect — invariant 4)', () => {
  it('a board of undated tickets renders an empty month that says why', () => {
    const model = buildCalendarModel([ticket(), ticket(), ticket()], { ...AUG, userName });
    expect(allItems(model)).toHaveLength(0);
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
  });
});

describe('the invented date is IMPOSSIBLE (planted defect — invariant 4)', () => {
  it('every rendered date exists verbatim among the planted claims', () => {
    const inputs = [
      ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-30' }) } }),
      ticket({ fields: { title: claimField('Start only'), startDate: claimField({ date: '2026-08-12' }) } }),
      ticket({
        fields: {
          title: claimField('Both'),
          startDate: claimField({ date: '2026-08-24', note: 'after the bank account opens' }, 'user_anselma'),
          dueDate: claimField({ date: '2026-08-30' }),
        },
      }),
      ticket(), // undated — must contribute nothing
    ];
    const planted = new Set(['2026-08-30', '2026-08-12', '2026-08-24']);
    const model = buildCalendarModel(inputs, { ...AUG, userName });
    const rendered = allItems(model).flatMap((item) => (item.kind === 'bar' ? [item.start, item.end] : [item.date]));
    expect(rendered.length).toBeGreaterThan(0);
    for (const date of rendered) expect(planted.has(date)).toBe(true);
  });

  it('a single-claim ticket is a marker, never a bar', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-30' }) } })],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('marker');
  });

  it('start after due yields two attributed markers and NO bar — the contradiction is shown, not resolved', () => {
    const model = buildCalendarModel(
      [
        ticket({
          fields: {
            title: claimField('Contradictory'),
            startDate: claimField({ date: '2026-08-30' }),
            dueDate: claimField({ date: '2026-08-24' }, 'user_anselma'),
          },
        }),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items.every((item) => item.kind === 'marker')).toBe(true);
    const markers = new Set(items.map((item) => (item.kind === 'marker' ? item.marker : '')));
    expect(markers).toEqual(new Set(['start', 'due']));
  });
});

describe('the attributed label is EXACT (planted defect — spec §7)', () => {
  it("a due marker carries the spec's example label, verbatim", () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('DLT'), dueDate: claimField({ date: '2026-08-30' }, 'user_kiro') } })],
      { ...AUG, userName },
    );
    const [item] = allItems(model);
    expect(item.kind).toBe('marker');
    if (item.kind === 'marker') {
      expect(item.label).toBe("needed by 30 Aug — Kiro's claim");
    }
  });
});

describe('custom date-kind fields are claims like any other (owner sign-off 2026-08-20)', () => {
  const FILED_ON = [{ id: 'filed-on', name: 'Filed on' }];
  const INSPECTION = [{ id: 'inspection', name: 'Inspection date' }];

  it("PLANTED DEFECT: a custom date claim renders with its OWN field name and its OWN author", () => {
    const model = buildCalendarModel(
      [
        ticket(
          { fields: { title: claimField('GST return'), 'filed-on': claimField('2026-08-30', 'user_anselma') } },
          [],
          FILED_ON,
        ),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.kind).toBe('marker');
    if (item.kind !== 'marker') throw new Error('expected a marker');
    // The generic-word defect: labelling this "needed by …" or "date 30 Aug"
    // loses the only thing that says what the day MEANS.
    expect(item.label).toBe("Filed on: 30 Aug — Anselma's claim");
    expect(item.marker).toBe('custom');
    expect(item.fieldId).toBe('filed-on');
    expect(item.fieldName).toBe('Filed on');
    expect(item.claim.actorId).toBe('user_anselma');
    expect(item.date).toBe('2026-08-30');
    // and the roster the legend reads names it too
    expect(model.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 1 }]);
  });

  it('PLANTED DEFECT: an UNCLAIMED custom date field puts nothing on the calendar', () => {
    // The field is defined on the type; nobody filled it in. A defect that
    // emitted a placeholder marker (or borrowed the due date for it) shows up
    // here as an item where there must be none.
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('Never filed') } }, [], FILED_ON)],
      { ...AUG, userName },
    );
    expect(allItems(model)).toHaveLength(0);
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
    expect(model.customDateFields).toEqual([]); // an unclaimed field earns no legend entry either
  });

  it('NO span is invented between a custom date and a built-in day claim', () => {
    const model = buildCalendarModel(
      [
        ticket(
          {
            fields: {
              title: claimField('Inspection then due'),
              inspection: claimField('2026-08-12'),
              dueDate: claimField({ date: '2026-08-30' }),
            },
          },
          [],
          INSPECTION,
        ),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items.every((item) => item.kind === 'marker')).toBe(true);
    expect(items).toHaveLength(2); // two markers, never one bar spanning 12→30 Aug
  });

  it('a bar STILL requires the start+due pair, and custom claims ride alongside it as markers', () => {
    const model = buildCalendarModel(
      [
        ticket(
          {
            fields: {
              title: claimField('Fully dated'),
              startDate: claimField({ date: '2026-08-24' }),
              dueDate: claimField({ date: '2026-08-28' }),
              'filed-on': claimField('2026-08-26'),
            },
          },
          [],
          FILED_ON,
        ),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items.filter((item) => item.kind === 'bar')).toHaveLength(1);
    expect(items.filter((item) => item.kind === 'marker' && item.marker === 'custom')).toHaveLength(1);
  });

  it('the legend switch hides a field without erasing its own switch — arrangement, not data', () => {
    const inputs = [
      ticket({ fields: { title: claimField('One'), 'filed-on': claimField('2026-08-11') } }, [], FILED_ON),
      ticket({ fields: { title: claimField('Two'), 'filed-on': claimField('2026-08-18') } }, [], FILED_ON),
    ];
    const shown = buildCalendarModel(inputs, { ...AUG, userName });
    expect(allItems(shown)).toHaveLength(2);
    expect(shown.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 2 }]);

    const hidden = buildCalendarModel(inputs, { ...AUG, userName, hiddenCustomFieldIds: ['filed-on'] });
    expect(allItems(hidden)).toHaveLength(0);
    // the tally is computed before hiding, so the switch is still there to flip back
    expect(hidden.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 2 }]);
  });

  it('a pending custom claim stays visibly in transit', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('In flight'), 'filed-on': claimField('2026-08-11') } }, ['filed-on'], FILED_ON)],
      { ...AUG, userName },
    );
    const [item] = allItems(model);
    if (item.kind !== 'marker') throw new Error('expected a marker');
    expect(item.claim.pending).toBe(true);
  });
});

describe('bars, weeks, filters, pending', () => {
  it('a start→due pair renders one bar per week row it crosses, clamped to the row', () => {
    const model = buildCalendarModel(
      [
        ticket({
          fields: {
            title: claimField('Spans two weeks'),
            startDate: claimField({ date: '2026-08-20' }),
            dueDate: claimField({ date: '2026-08-25' }),
          },
        }),
      ],
      { ...AUG, userName },
    );
    // 20 Aug (Thu) sits in the 17–23 row; 25 Aug (Tue) in the 24–30 row.
    const rows = model.weeks.filter((week) => week.items.length > 0).map((week) => week.days[0]);
    expect(rows).toEqual(['2026-08-17', '2026-08-24']);
  });

  it('the lane and assignee filters narrow what renders; filtering is arrangement, not data', () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('The epic') } });
    const inLane = ticket({
      parentId: 'epic1',
      assigneeId: 'user_anselma',
      fields: { title: claimField('In lane'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const outOfLane = ticket({ fields: { title: claimField('Out of lane'), dueDate: claimField({ date: '2026-08-28' }) } });
    const laneModel = buildCalendarModel([epic, inLane, outOfLane], { ...AUG, userName, laneEpicId: 'epic1' });
    expect(allItems(laneModel)).toHaveLength(1);
    const assigneeModel = buildCalendarModel([epic, inLane, outOfLane], {
      ...AUG,
      userName,
      filter: { assigneeIds: ['user_anselma'] },
    });
    expect(allItems(assigneeModel)).toHaveLength(1);
  });

  it('a pending claim stays visibly in transit through the model', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('Pending'), dueDate: claimField({ date: '2026-08-28' }) } }, ['dueDate'])],
      { ...AUG, userName },
    );
    const [item] = allItems(model);
    if (item.kind === 'marker') {
      expect(item.claim.pending).toBe(true);
    } else {
      throw new Error('expected a marker');
    }
  });
});
```

- [ ] **Step 7: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/calendar/calendar-model.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 8: Implement the calendar model**

`packages/app-core/src/calendar/calendar-model.ts`:

```ts
import type { TicketState } from '@gisik-nokma/domain';
import { monthGridWeeks } from '../claims/dates';
import {
  CALENDAR_EMPTY_MONTH_COPY,
  barProvenance,
  claimTooltip,
  customClaimLabel,
  dueClaimLabel,
  startClaimLabel,
  type UserNameFn,
} from '../claims/claim-labels';
import {
  customDateClaimsOf,
  dateClaimOf,
  titleOf,
  type CustomDateClaimView,
  type DateClaimView,
  type TicketDatesInput,
} from '../claims/ticket-dates';
import { epicAncestorOf } from '../hierarchy/epic-ancestor';
import { matchesFilter, type FilterSpec } from '../filter/filter-spec';

export type CalendarMonth = { year: number; month: number };

export type CalendarItem =
  | {
      kind: 'marker';
      ticketId: string;
      title: string;
      date: string;
      /** 'custom' is a claimed custom `date`-kind field (owner sign-off 2026-08-20). */
      marker: 'due' | 'start' | 'custom';
      /** The field's own id/name when marker === 'custom'; null for the two built-ins. */
      fieldId: string | null;
      fieldName: string | null;
      claim: DateClaimView | CustomDateClaimView;
      label: string;
      tooltip: string;
    }
  | {
      kind: 'bar';
      ticketId: string;
      title: string;
      start: string;
      end: string;
      startClaim: DateClaimView;
      dueClaim: DateClaimView;
      pending: boolean;
      provenance: string;
    };

export type CalendarWeek = { days: string[]; items: CalendarItem[] };

/** One legend row: a custom date field that actually placed a claim this month. */
export type CalendarCustomFieldTally = { fieldId: string; fieldName: string; count: number };

export type CalendarModel = {
  month: CalendarMonth;
  weeks: CalendarWeek[];
  hasItems: boolean;
  emptyCopy: string | null;
  /**
   * The legend's source, tallied over claims that land inside this month's
   * grid and computed BEFORE `hiddenCustomFieldIds` is applied — hiding a
   * field must not erase the switch that unhides it. A field nobody claimed
   * is absent entirely: the legend describes the grid, not the schema.
   */
  customDateFields: CalendarCustomFieldTally[];
};

export type CalendarModelOptions = CalendarMonth & {
  userName: UserNameFn;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  /** View state from the legend switches. Arrangement, never data. */
  hiddenCustomFieldIds?: readonly string[];
};

function markerRank(item: CalendarItem): string {
  if (item.kind === 'bar') return '';
  return item.marker === 'custom' ? `custom:${item.fieldId ?? ''}` : item.marker;
}

function itemOrder(a: CalendarItem, b: CalendarItem): number {
  if (a.kind !== b.kind) return a.kind === 'bar' ? -1 : 1; // bars first
  const aDate = a.kind === 'bar' ? a.start : a.date;
  const bDate = b.kind === 'bar' ? b.start : b.date;
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  if (a.ticketId !== b.ticketId) return a.ticketId < b.ticketId ? -1 : 1;
  // two claims, same ticket, same day: order by which claim, so the grid is stable
  const aRank = markerRank(a);
  const bRank = markerRank(b);
  return aRank < bRank ? -1 : aRank > bRank ? 1 : 0;
}

/**
 * Pure: tickets in, month grid out. Every item traces to a claim — there is
 * no branch that fabricates a date (invariant 4). Contradictory claims
 * (start after due) render as two attributed markers, never as a bar:
 * negative geometry would be invented geometry.
 *
 * Custom `date`-kind fields (owner sign-off 2026-08-20) join as markers on
 * the same terms, labelled with their own field names. THEY NEVER FORM
 * BARS: a bar requires the `startDate` + `dueDate` pair and nothing else,
 * because a span between two unrelated claims is a duration nobody claimed.
 * There is deliberately no code path below that pairs a custom date with
 * anything.
 */
export function buildCalendarModel(inputs: TicketDatesInput[], opts: CalendarModelOptions): CalendarModel {
  const byId = new Map<string, TicketState>(inputs.map((input) => [input.state.id, input.state]));
  const visible = inputs.filter((input) => {
    if (opts.filter && !matchesFilter(input.state, opts.filter)) return false;
    if (opts.laneEpicId != null && epicAncestorOf(byId, input.state.id) !== opts.laneEpicId) return false;
    return true;
  });

  const items: CalendarItem[] = [];
  const customItems: CalendarItem[] = [];
  for (const input of visible) {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;

    // Custom date claims are independent of the start/due story — they are
    // collected first and unconditionally, so no `continue` below can drop
    // them, and no pairing logic can reach them.
    for (const claim of customDateClaimsOf(input)) {
      const label = customClaimLabel(claim, opts.userName);
      customItems.push({
        kind: 'marker',
        ticketId,
        title,
        date: claim.date,
        marker: 'custom',
        fieldId: claim.fieldId,
        fieldName: claim.fieldName,
        claim,
        label,
        // A custom date claim carries no note (Plan 3 takes a bare
        // 'YYYY-MM-DD'), so the tooltip is the label — nothing to quote.
        tooltip: label,
      });
    }

    if (start && due && start.date <= due.date) {
      items.push({
        kind: 'bar',
        ticketId,
        title,
        start: start.date,
        end: due.date,
        startClaim: start,
        dueClaim: due,
        pending: start.pending || due.pending,
        provenance: barProvenance(start, due, opts.userName),
      });
      continue;
    }
    if (due) {
      const label = dueClaimLabel(due, opts.userName);
      items.push({ kind: 'marker', ticketId, title, date: due.date, marker: 'due', fieldId: null, fieldName: null, claim: due, label, tooltip: claimTooltip(label, due) });
    }
    if (start) {
      const label = startClaimLabel(start, opts.userName);
      items.push({ kind: 'marker', ticketId, title, date: start.date, marker: 'start', fieldId: null, fieldName: null, claim: start, label, tooltip: claimTooltip(label, start) });
    }
    // No claims → nothing. The undated ticket is absent, not estimated.
  }

  const gridWeeks = monthGridWeeks(opts.year, opts.month);
  const gridFirst = gridWeeks[0][0];
  const gridLast = gridWeeks[gridWeeks.length - 1][6];

  // The legend describes what this grid actually shows, so its bounds are
  // the grid's — not the calendar month's. A switch always corresponds to
  // something on screen, and everything on screen has a switch.
  const tally = new Map<string, CalendarCustomFieldTally>();
  for (const item of customItems) {
    if (item.kind !== 'marker' || item.fieldId === null) continue;
    if (item.date < gridFirst || item.date > gridLast) continue;
    const existing = tally.get(item.fieldId);
    if (existing) existing.count += 1;
    else tally.set(item.fieldId, { fieldId: item.fieldId, fieldName: item.fieldName ?? item.fieldId, count: 1 });
  }
  const customDateFields = [...tally.values()].sort((a, b) => (a.fieldName < b.fieldName ? -1 : a.fieldName > b.fieldName ? 1 : 0));

  const hidden = new Set(opts.hiddenCustomFieldIds ?? []);
  const shown = [...items, ...customItems.filter((item) => item.kind !== 'marker' || item.fieldId === null || !hidden.has(item.fieldId))];

  const weeks: CalendarWeek[] = gridWeeks.map((days) => {
    const first = days[0];
    const last = days[6];
    const inWeek = shown
      .filter((item) => (item.kind === 'bar' ? item.start <= last && item.end >= first : item.date >= first && item.date <= last))
      .sort(itemOrder);
    return { days, items: inWeek };
  });

  const hasItems = weeks.some((week) => week.items.length > 0);
  return {
    month: { year: opts.year, month: opts.month },
    weeks,
    hasItems,
    emptyCopy: hasItems ? null : CALENDAR_EMPTY_MONTH_COPY,
    customDateFields,
  };
}
```

Add to `packages/app-core/src/index.ts`:

```ts
export * from './claims/dates';
export * from './claims/ticket-dates';
export * from './claims/claim-labels';
export * from './hierarchy/epic-ancestor';
export * from './filter/filter-spec';
export * from './calendar/calendar-model';
```

- [ ] **Step 9: Run all Task 8 tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/app-core test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/app-core packages/ui pnpm-lock.yaml
git commit -m "calendar view-model: a pure fold from claims to weeks — no branch can invent a date, an all-undated board is an empty month that says why, and the label is the spec's exact attributed shape"
```

---

### Task 9: `CalendarView` — the month grid component

A React DOM component over Task 8's model (web + desktop render it directly; mobile reuses the view-model under native navigation, amendment 17). All state is view state: which month, which weeks are expanded, which custom date fields are switched off. Colours come only from `@gisik-nokma/ui` tokens. `today` is a prop, injected — the component never reads the clock, so tests are deterministic and the today-ring is provable.

**`today` is an IST day, and the shell is the only place that decides so.** The mounting shell passes `istDayOf(new Date().toISOString())` — the device supplies the *instant*, which is a fact it does own, and the domain helper turns it into the day. Never `toLocaleDateString()`, never `toISOString().slice(0, 10)`: the first rings a collaborator's own timezone and the second rings yesterday for five and a half hours every night. Because `today` and the model's day cells are both IST day strings, the ring is a plain `===` comparison and stays one.

**The custom-date legend (the readability affordance, and why it is the smallest honest one).** A workspace can define many `date`-kind fields; a month where four of them all claimed days is unreadable, and unreadable is its own kind of dishonest. The affordance is a legend: one row per custom date field that actually placed a claim in this grid, showing the field's own name and how many claims it placed, each row a checkbox that hides or shows that field's markers. It is the smallest honest design available because (a) it invents nothing — the roster comes from claims that exist, so an unclaimed field never appears and a field's name is never paraphrased; (b) it needs no server round-trip, no schema read, and no stored preference, so it cannot go stale or disagree with the ledger; (c) it is symmetrical with the per-week `+n more` fold already here — pure view state, reset by nothing but the user; and (d) hiding is visibly reversible, because the tally is computed before hiding, so a switched-off field keeps its own switch and its own count. Rejected as bigger without being more honest: a saved per-user preference (Task 13's machinery for a decision that lasts one glance), a server-side field filter (turns arrangement into a query), and colour-coding without switches (readable for three fields, worse than nothing for eight).

**Files:**
- Create: `packages/app-core/src/calendar/CalendarView.tsx`
- Test: `packages/app-core/src/calendar/CalendarView.test.tsx`
- Modify: `packages/app-core/src/index.ts`

**Interfaces:**
- Consumes: `buildCalendarModel`, `CalendarMonth`, `CalendarItem` (Task 8); `TicketDatesInput`, `UserNameFn`, `FilterSpec`; `tokens` (`@gisik-nokma/ui`).
- Produces (Plan 6 mounts it; Plan 10's replica shell mounts the same component):
  - `type CalendarViewProps = { tickets: TicketDatesInput[]; today: string; userName: UserNameFn; onOpenTicket: (ticketId: string) => void; filter?: FilterSpec; laneEpicId?: string | null; initialMonth?: CalendarMonth }`
  - `CalendarView(props: CalendarViewProps): JSX.Element` — month nav (‹ Today ›), today ring (`aria-current="date"` + `data-today`), per-week overflow (`+n more` expands on click, `show fewer` collapses), every item is a button that calls `onOpenTicket`, provenance in the `title` attribute (hover/tap), pending items carry `data-pending="true"` and the pending token colour.
  - Custom date markers carry `data-field-id="<the field's own id>"` and render in `tokens.color.customMarker`; the legend is a `<fieldset aria-label="Claimed date fields">` of checkboxes, one per entry in `model.customDateFields`, labelled `"<Field name> (<count>)"`, all checked by default, and rendered only when there is at least one entry — an empty legend is chrome, and chrome that says nothing is noise.
  - `MAX_VISIBLE_PER_WEEK = 4`.

- [ ] **Step 1: Write the failing component tests**

`packages/app-core/src/calendar/CalendarView.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { CALENDAR_EMPTY_MONTH_COPY } from '../claims/claim-labels';
import type { TicketDatesInput } from '../claims/ticket-dates';
import { CalendarView } from './CalendarView';

const names: Record<string, string> = { user_kiro: 'Kiro' };
const userName = (id: string) => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

function ticket(
  overrides: Partial<TicketState> = {},
  pendingFieldIds: string[] = [],
  customDateFields: readonly { id: string; name: string }[] = [],
): TicketDatesInput {
  counter += 1;
  const base: TicketState = {
    id: `t${counter}`,
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: claimField(`Ticket ${counter}`) },
    transitions: [],
  } as TicketState;
  return {
    state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } },
    pendingFieldIds,
    customDateFields,
  };
}

const TODAY = '2026-08-23';

function renderCalendar(tickets: TicketDatesInput[], onOpenTicket = vi.fn()) {
  render(<CalendarView tickets={tickets} today={TODAY} userName={userName} onOpenTicket={onOpenTicket} />);
  return onOpenTicket;
}

describe('CalendarView', () => {
  it('renders the attributed marker and opens the ticket on click', () => {
    const input = ticket({ fields: { title: claimField('DLT'), dueDate: claimField({ date: '2026-08-30' }) } });
    const onOpenTicket = renderCalendar([input]);
    const marker = screen.getByRole('button', { name: /needed by 30 Aug — Kiro's claim/ });
    fireEvent.click(marker);
    expect(onOpenTicket).toHaveBeenCalledWith(input.state.id);
  });

  it('a board of undated tickets shows the honesty note (planted defect)', () => {
    renderCalendar([ticket(), ticket()]);
    expect(screen.getByRole('note')).toHaveTextContent(CALENDAR_EMPTY_MONTH_COPY);
    expect(screen.queryAllByRole('button', { name: /claim/ })).toHaveLength(0);
  });

  it('today wears the ring', () => {
    renderCalendar([ticket()]);
    const todayCell = document.querySelector('[aria-current="date"]');
    expect(todayCell).not.toBeNull();
    expect(todayCell).toHaveAttribute('data-day', TODAY);
  });

  it('per-week overflow collapses to +n more and expands on click', () => {
    const inputs = [1, 2, 3, 4, 5].map((day) =>
      ticket({ fields: { title: claimField(`Item ${day}`), dueDate: claimField({ date: '2026-08-28' }) } }),
    );
    renderCalendar(inputs);
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'show fewer' }));
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(4);
  });

  it('a pending claim is marked in transit', () => {
    renderCalendar([ticket({ fields: { title: claimField('Pending'), dueDate: claimField({ date: '2026-08-28' }) } }, ['dueDate'])]);
    const marker = screen.getByRole('button', { name: /needed by 28 Aug/ });
    expect(marker).toHaveAttribute('data-pending', 'true');
  });

  it('month navigation moves and Today returns', () => {
    renderCalendar([ticket()]);
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
  });

  it("a custom date claim renders under its own field name and opens its ticket", () => {
    const input = ticket(
      { fields: { title: claimField('GST return'), 'filed-on': claimField('2026-08-30') } },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const onOpenTicket = renderCalendar([input]);
    const marker = screen.getByRole('button', { name: /Filed on: 30 Aug — Kiro's claim/ });
    expect(marker).toHaveAttribute('data-field-id', 'filed-on');
    fireEvent.click(marker);
    expect(onOpenTicket).toHaveBeenCalledWith(input.state.id);
  });

  it('the legend lists each claimed date field by its own name and switches it off and back on', () => {
    const fields = [{ id: 'filed-on', name: 'Filed on' }];
    renderCalendar([
      ticket({ fields: { title: claimField('One'), 'filed-on': claimField('2026-08-11') } }, [], fields),
      ticket({ fields: { title: claimField('Two'), 'filed-on': claimField('2026-08-18') } }, [], fields),
    ]);
    const legend = screen.getByRole('group', { name: 'Claimed date fields' });
    const toggle = within(legend).getByRole('checkbox', { name: 'Filed on (2)' });
    expect(toggle).toBeChecked();
    expect(screen.getAllByRole('button', { name: /Filed on:/ })).toHaveLength(2);

    fireEvent.click(toggle);
    expect(screen.queryAllByRole('button', { name: /Filed on:/ })).toHaveLength(0);
    // the switch survives its own use — hiding is visibly reversible
    expect(within(legend).getByRole('checkbox', { name: 'Filed on (2)' })).not.toBeChecked();

    fireEvent.click(toggle);
    expect(screen.getAllByRole('button', { name: /Filed on:/ })).toHaveLength(2);
  });

  it('a month with no custom date claims renders no legend — empty chrome is noise', () => {
    renderCalendar([ticket({ fields: { title: claimField('Plain'), dueDate: claimField({ date: '2026-08-28' }) } })]);
    expect(screen.queryByRole('group', { name: 'Claimed date fields' })).toBeNull();
  });
});
```

The jest-dom matchers (`toHaveTextContent`, `toHaveAttribute`, …) come from Task 8 Step 0's `vitest.setup.ts`; if Plan 6's scaffold won the guard and lacks that setup, add the dependency, the setup file, and the `setupFiles` line exactly as Task 8 Step 0 specifies.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/calendar/CalendarView.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

`packages/app-core/src/calendar/CalendarView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { tokens } from '@gisik-nokma/ui';
import { CALENDAR_EMPTY_MONTH_COPY, type UserNameFn } from '../claims/claim-labels';
import type { TicketDatesInput } from '../claims/ticket-dates';
import type { FilterSpec } from '../filter/filter-spec';
import { buildCalendarModel, type CalendarItem, type CalendarMonth } from './calendar-model';

export type CalendarViewProps = {
  tickets: TicketDatesInput[];
  /**
   * The IST day, injected by the shell as `istDayOf(new Date().toISOString())`
   * — the component never reads the clock and never asks the device what day
   * it is. A day starts at IST midnight (owner decision), so a device-local
   * or UTC-sliced value would ring the wrong cell.
   */
  today: string;
  userName: UserNameFn;
  onOpenTicket: (ticketId: string) => void;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  initialMonth?: CalendarMonth;
};

export const MAX_VISIBLE_PER_WEEK = 4;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthOf(isoDay: string): CalendarMonth {
  const [year, month] = isoDay.split('-').map(Number);
  return { year, month };
}

function previousMonth(m: CalendarMonth): CalendarMonth {
  return m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 };
}

function nextMonth(m: CalendarMonth): CalendarMonth {
  return m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 };
}

function monthKey(m: CalendarMonth): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`;
}

function barColumns(item: Extract<CalendarItem, { kind: 'bar' }>, days: string[]): string {
  const startIndex = item.start < days[0] ? 0 : days.indexOf(item.start);
  const endIndex = item.end > days[6] ? 6 : days.indexOf(item.end);
  return `${startIndex + 1} / ${endIndex + 2}`;
}

function markerColumn(date: string, days: string[]): string {
  const index = days.indexOf(date);
  return `${index + 1} / ${index + 2}`;
}

const itemButtonStyle = {
  width: '100%',
  textAlign: 'left' as const,
  border: 'none',
  cursor: 'pointer',
  borderRadius: tokens.radius.sm,
  padding: `2px ${tokens.space.xs}`,
  font: 'inherit',
};

export function CalendarView(props: CalendarViewProps) {
  const [month, setMonth] = useState<CalendarMonth>(props.initialMonth ?? monthOf(props.today));
  const [expandedWeeks, setExpandedWeeks] = useState<ReadonlySet<number>>(new Set());
  // Legend switches: pure view state, like expandedWeeks. Nothing is stored,
  // nothing is fetched — a decision that lasts one glance is not a preference.
  const [hiddenFields, setHiddenFields] = useState<ReadonlySet<string>>(new Set());

  const hiddenCustomFieldIds = useMemo(() => [...hiddenFields], [hiddenFields]);

  const model = useMemo(
    () =>
      buildCalendarModel(props.tickets, {
        ...month,
        userName: props.userName,
        filter: props.filter,
        laneEpicId: props.laneEpicId,
        hiddenCustomFieldIds,
      }),
    [props.tickets, props.userName, props.filter, props.laneEpicId, month, hiddenCustomFieldIds],
  );

  function moveTo(next: CalendarMonth): void {
    setMonth(next);
    setExpandedWeeks(new Set());
  }

  function toggleWeek(index: number): void {
    setExpandedWeeks((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function toggleField(fieldId: string): void {
    setHiddenFields((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }

  return (
    <div style={{ fontFamily: tokens.font.body, color: tokens.color.ink, background: tokens.color.surface }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: tokens.space.sm, padding: tokens.space.sm }}>
        <button type="button" aria-label="Previous month" onClick={() => moveTo(previousMonth(month))}>‹</button>
        <button type="button" onClick={() => moveTo(monthOf(props.today))}>Today</button>
        <button type="button" aria-label="Next month" onClick={() => moveTo(nextMonth(month))}>›</button>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{MONTH_NAMES[month.month - 1]} {month.year}</h2>
      </header>
      {!model.hasItems && model.emptyCopy !== null && (
        <p role="note" style={{ padding: tokens.space.md, color: tokens.color.inkMuted }}>{model.emptyCopy}</p>
      )}
      {model.customDateFields.length > 0 && (
        <fieldset
          aria-label="Claimed date fields"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: tokens.space.md,
            margin: `0 ${tokens.space.sm} ${tokens.space.sm}`,
            padding: tokens.space.xs,
            border: `1px solid ${tokens.color.line}`,
            borderRadius: tokens.radius.sm,
          }}
        >
          {model.customDateFields.map((field) => (
            <label
              key={field.fieldId}
              style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.space.xs, color: tokens.color.customMarker }}
            >
              <input
                type="checkbox"
                checked={!hiddenFields.has(field.fieldId)}
                onChange={() => toggleField(field.fieldId)}
              />
              {/* The field's own name, never a generic word — and the count,
                  so a switched-off field still says how much it is hiding. */}
              {field.fieldName} ({field.count})
            </label>
          ))}
        </fieldset>
      )}
      {model.weeks.map((week, weekIndex) => {
        const expanded = expandedWeeks.has(weekIndex);
        const visibleItems = expanded ? week.items : week.items.slice(0, MAX_VISIBLE_PER_WEEK);
        const hidden = week.items.length - visibleItems.length;
        return (
          <section key={week.days[0]} data-week={week.days[0]}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderTop: `1px solid ${tokens.color.line}` }}>
              {week.days.map((day) => (
                <div
                  key={day}
                  data-day={day}
                  data-today={day === props.today || undefined}
                  aria-current={day === props.today ? 'date' : undefined}
                  style={{
                    padding: tokens.space.xs,
                    minHeight: '2rem',
                    outline: day === props.today ? `2px solid ${tokens.color.todayRing}` : 'none',
                    outlineOffset: '-2px',
                    borderRadius: tokens.radius.sm,
                    color: day.slice(0, 7) === monthKey(month) ? tokens.color.ink : tokens.color.inkMuted,
                  }}
                >
                  {Number(day.slice(8))}
                </div>
              ))}
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: `0 0 ${tokens.space.xs}`,
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '2px',
              }}
            >
              {visibleItems.map((item) =>
                item.kind === 'bar' ? (
                  <li key={`bar:${item.ticketId}`} style={{ gridColumn: barColumns(item, week.days) }}>
                    <button
                      type="button"
                      data-pending={item.pending || undefined}
                      title={item.provenance}
                      onClick={() => props.onOpenTicket(item.ticketId)}
                      style={{
                        ...itemButtonStyle,
                        background: item.pending ? tokens.color.pendingHatch : tokens.color.barActive,
                        color: tokens.color.ink,
                      }}
                    >
                      {item.title}
                    </button>
                  </li>
                ) : (
                  <li
                    key={`${item.marker}:${item.fieldId ?? ''}:${item.ticketId}`}
                    style={{ gridColumn: markerColumn(item.date, week.days) }}
                  >
                    <button
                      type="button"
                      data-pending={item.claim.pending || undefined}
                      data-field-id={item.fieldId ?? undefined}
                      title={item.tooltip}
                      onClick={() => props.onOpenTicket(item.ticketId)}
                      style={{
                        ...itemButtonStyle,
                        background: 'transparent',
                        color: item.claim.pending
                          ? tokens.color.inkMuted
                          : item.marker === 'custom'
                            ? tokens.color.customMarker
                            : tokens.color.marker,
                      }}
                    >
                      ◆ {item.label}
                    </button>
                  </li>
                ),
              )}
            </ul>
            {hidden > 0 && (
              <button type="button" onClick={() => toggleWeek(weekIndex)} style={{ margin: `0 0 ${tokens.space.xs}` }}>
                +{hidden} more
              </button>
            )}
            {expanded && week.items.length > MAX_VISIBLE_PER_WEEK && (
              <button type="button" onClick={() => toggleWeek(weekIndex)} style={{ margin: `0 0 ${tokens.space.xs}` }}>
                show fewer
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

Add to `packages/app-core/src/index.ts`:

```ts
export * from './calendar/CalendarView';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/calendar/CalendarView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/calendar/CalendarView.tsx packages/app-core/src/calendar/CalendarView.test.tsx packages/app-core/src/index.ts packages/app-core/package.json packages/app-core/vitest.config.ts pnpm-lock.yaml
git commit -m "CalendarView: month grid over the pure model — today is a prop, provenance rides the hover, overflow folds to +n, and the empty month explains itself"
```

---

### Task 10: The timeline view-model — bars only when both claims exist

Week-column Gantt-lite, from the same `TicketDatesInput`s. The rule the whole task exists to enforce: **a bar requires BOTH a claimed start and a claimed due.** Everything else goes to the "undated or partially dated" side list with an attributed note — including the start-after-due contradiction, which is displayed as a contradiction, never resolved into geometry. Grouping is by epic ancestor (arrangement, not data). No dependencies, no critical path — out of spec.

**Custom `date`-kind fields on the timeline (owner sign-off 2026-08-20).** They ride along on the ticket — attributed, labelled with the field's own name — and they change **nothing** about geometry or side-list membership. Both halves of that are deliberate. Geometry: a custom date never starts, ends, or extends a bar; the only pair that draws one is `startDate` + `dueDate`. Membership: which side of the timeline a ticket lands on is decided by that pair alone, exactly as before — a ticket carrying only a "Filed on" claim still has no span to draw and still belongs in the side list. The one thing that must change is the *wording*: telling a ticket with a claimed "Filed on" date that it has "no claimed dates" would be false, so that case gets `NO_DAY_CLAIMS_NOTE` ("no claimed start or needed-by") while the genuinely bare ticket keeps `NO_DATES_NOTE` verbatim. There is no legend here: the timeline shows at most a handful of claims per row, in a row that is already labelled with its ticket, so marker density — the problem the calendar's legend solves — does not arise.

**Files:**
- Create: `packages/app-core/src/timeline/timeline-model.ts`
- Test: `packages/app-core/src/timeline/timeline-model.test.ts`
- Modify: `packages/app-core/src/index.ts`

**Interfaces:**
- Consumes: `dateClaimOf`, `customDateClaimsOf`, `titleOf`, `TicketDatesInput`, `DateClaimView`, `CustomDateClaimView` (Task 8); `addDays`, `dateMs`, `mondayOnOrBefore`, `DAY_MS`; `barProvenance`, `contradictionCopy`, `customClaimLabel`, `dueClaimLabel`, `startClaimLabel`, `formatClaimDate`, `TIMELINE_SIDE_LIST_COPY`, `UserNameFn`; `epicAncestorOf`; `matchesFilter`/`FilterSpec`.
- Produces (Task 11 renders it; mobile view-models reuse it):
  - `type TimelineWeekCol = { start: string; label: string }` — label `W 17 Aug` (formatClaimDate of the Monday)
  - `type TimelineBarSpan = { fromWeek: number; toWeek: number; clippedStart: boolean; clippedEnd: boolean }`
  - `type TimelineCustomClaim = { claim: CustomDateClaimView; label: string }` — the structured claim plus its attributed rendering (`"Filed on: 30 Aug — Kiro's claim"`), the same pairing the calendar's items use
  - `type TimelineRow = { ticketId: string; title: string; bar: TimelineBarSpan; startClaim: DateClaimView; dueClaim: DateClaimView; pending: boolean; provenance: string; customClaims: TimelineCustomClaim[] }`
  - `type TimelineSideEntry = { ticketId: string; title: string; reason: 'no-dates' | 'start-only' | 'due-only' | 'start-after-due'; startClaim: DateClaimView | null; dueClaim: DateClaimView | null; note: string; customClaims: TimelineCustomClaim[] }`
  - `type TimelineGroup = { epicId: string | null; epicTitle: string; rows: TimelineRow[] }`
  - `type TimelineModel = { weeks: TimelineWeekCol[]; groups: TimelineGroup[]; sideList: TimelineSideEntry[]; sideListCopy: string }`
  - `buildTimelineModel(inputs: TicketDatesInput[], opts: { anchor: string; weeksCount?: number; userName: UserNameFn; filter?: FilterSpec; laneEpicId?: string | null }): TimelineModel` — default 8 weeks starting the Monday on/before `anchor`; a fully-dated ticket wholly outside the window appears nowhere (navigation reaches it — it is scheduled, just not here); side-list membership is about missing claims, not about the window.
  - **`anchor` is an IST day** — the shell passes `istDayOf(new Date().toISOString())` for "now", exactly as `CalendarView` gets `today`, and the Earlier/Later buttons walk it in day-space from there. Every day column is therefore an IST day, and a claim's column is decided by the same day the calendar would put it in. A timeline whose columns started somewhere other than IST midnight would place the same claim in a different week from the calendar's cell — one product, two answers, which is the failure this decision exists to prevent.
  - `NO_DATES_NOTE = 'no claimed dates'` (the side list's copy for fully undated work); `NO_DAY_CLAIMS_NOTE = 'no claimed start or needed-by'` (the same slot when the ticket *does* carry custom date claims — the note narrows to what is actually missing rather than claiming the ticket is dateless).
  - Custom date claims never affect `reason`, `bar`, or window membership; they hang off the row or the side entry that the `startDate`/`dueDate` pair already decided.

- [ ] **Step 1: Write the failing model tests**

`packages/app-core/src/timeline/timeline-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { TIMELINE_SIDE_LIST_COPY } from '../claims/claim-labels';
import type { TicketDatesInput } from '../claims/ticket-dates';
import { NO_DATES_NOTE, NO_DAY_CLAIMS_NOTE, buildTimelineModel } from './timeline-model';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string) => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

function ticket(
  overrides: Partial<TicketState> = {},
  pendingFieldIds: string[] = [],
  customDateFields: readonly { id: string; name: string }[] = [],
): TicketDatesInput {
  counter += 1;
  const base: TicketState = {
    id: `t${counter}`,
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: claimField(`Ticket ${counter}`) },
    transitions: [],
  } as TicketState;
  return {
    state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } },
    pendingFieldIds,
    customDateFields,
  };
}

const ANCHOR = '2026-08-23'; // Sunday → window opens Monday 17 Aug; 8 weeks reach 11 Oct

function model(inputs: TicketDatesInput[], extra: Partial<Parameters<typeof buildTimelineModel>[1]> = {}) {
  return buildTimelineModel(inputs, { anchor: ANCHOR, userName, ...extra });
}

function allRows(m: ReturnType<typeof buildTimelineModel>) {
  return m.groups.flatMap((group) => group.rows);
}

describe('bars require BOTH claims (planted defects — invariant 4)', () => {
  it('a due-only ticket is a side-list entry with its attributed claim, never a bar', () => {
    const m = model([ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) } })]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList).toHaveLength(1);
    expect(m.sideList[0].reason).toBe('due-only');
    expect(m.sideList[0].note).toBe("needed by 28 Aug — Kiro's claim");
  });

  it('a start-only ticket sits beside it', () => {
    const m = model([ticket({ fields: { title: claimField('Start only'), startDate: claimField({ date: '2026-08-24' }, 'user_anselma') } })]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList[0].reason).toBe('start-only');
    expect(m.sideList[0].note).toBe("starts 24 Aug — Anselma's claim");
  });

  it('an undated ticket is named as such — present as work, absent as geometry', () => {
    const m = model([ticket()]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList[0].reason).toBe('no-dates');
    expect(m.sideList[0].note).toBe(NO_DATES_NOTE);
    expect(m.sideListCopy).toBe(TIMELINE_SIDE_LIST_COPY);
  });

  it('start after due is shown as the contradiction it is — no bar, both claims named', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('Contradictory'),
          startDate: claimField({ date: '2026-08-30' }),
          dueDate: claimField({ date: '2026-08-24' }, 'user_anselma'),
        },
      }),
    ]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList[0].reason).toBe('start-after-due');
    expect(m.sideList[0].note).toBe('start 30 Aug is after needed-by 24 Aug — both claims shown, no bar drawn');
  });
});

describe('bars, window, clamping', () => {
  it('a both-claims ticket becomes one bar with exact week indices and provenance', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('Real work'),
          startDate: claimField({ date: '2026-08-24' }, 'user_anselma'),
          dueDate: claimField({ date: '2026-09-04' }),
        },
      }),
    ]);
    const rows = allRows(m);
    expect(rows).toHaveLength(1);
    expect(rows[0].bar).toEqual({ fromWeek: 1, toWeek: 2, clippedStart: false, clippedEnd: false }); // weeks: 17 Aug=0, 24 Aug=1, 31 Aug=2
    expect(rows[0].provenance).toBe("starts 24 Aug — Anselma's claim · needed by 4 Sep — Kiro's claim");
  });

  it('a bar reaching outside the window is clipped and says so', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('Long haul'),
          startDate: claimField({ date: '2026-08-01' }),
          dueDate: claimField({ date: '2026-08-26' }),
        },
      }),
    ]);
    const [row] = allRows(m);
    expect(row.bar.fromWeek).toBe(0);
    expect(row.bar.clippedStart).toBe(true);
    expect(row.bar.clippedEnd).toBe(false);
  });

  it('a fully-dated ticket wholly outside the window appears nowhere — scheduled, just not here', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('Next quarter'),
          startDate: claimField({ date: '2026-11-02' }),
          dueDate: claimField({ date: '2026-11-20' }),
        },
      }),
    ]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList).toHaveLength(0);
  });

  it('the window is 8 Monday-start weeks with W-labels', () => {
    const m = model([]);
    expect(m.weeks).toHaveLength(8);
    expect(m.weeks[0]).toEqual({ start: '2026-08-17', label: 'W 17 Aug' });
    expect(m.weeks[7].start).toBe('2026-10-05');
  });
});

describe('grouping and filters', () => {
  it('groups rows under their epic ancestor; epicless work lands in "No epic", last', () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('Registrations') } });
    const inEpic = ticket({
      parentId: 'epic1',
      fields: { title: claimField('DLT'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const loose = ticket({
      fields: { title: claimField('Loose'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const m = model([epic, inEpic, loose]);
    expect(m.groups.map((group) => group.epicTitle)).toEqual(['Registrations', 'No epic']);
    expect(m.groups[0].rows[0].ticketId).toBe(inEpic.state.id);
    expect(m.groups[1].rows[0].ticketId).toBe(loose.state.id);
    expect(m.sideList).toHaveLength(0); // the undated epic is a lane, not missing work
  });

  it('custom date claims ride the row and change NO geometry (owner sign-off 2026-08-20)', () => {
    const withCustom = ticket(
      {
        fields: {
          title: claimField('Fully dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
          'filed-on': claimField('2026-08-26', 'user_anselma'),
        },
      },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const [row] = allRows(model([withCustom]));
    expect(row.customClaims.map((entry) => entry.label)).toEqual(["Filed on: 26 Aug — Anselma's claim"]);
    expect(row.customClaims[0].claim.fieldId).toBe('filed-on');
    // the bar is still exactly the start→due span: 24 Aug and 28 Aug are both
    // in the 24–30 week, so one column, untouched by the 26 Aug claim
    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: false });
    expect(row.provenance).toBe("starts 24 Aug — Kiro's claim · needed by 28 Aug — Kiro's claim");
  });

  it('a custom date claim does NOT rescue a ticket from the side list — but the note stops lying', () => {
    const onlyCustom = ticket(
      { fields: { title: claimField('Filed, not scheduled'), 'filed-on': claimField('2026-08-26') } },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const bare = ticket({ fields: { title: claimField('Nothing claimed') } });
    const m = model([onlyCustom, bare]);
    expect(allRows(m)).toHaveLength(0); // no pair, no bar — membership logic unchanged

    const filed = m.sideList.find((entry) => entry.ticketId === onlyCustom.state.id)!;
    expect(filed.reason).toBe('no-dates');
    expect(filed.note).toBe(NO_DAY_CLAIMS_NOTE); // NOT "no claimed dates" — it has one
    expect(filed.customClaims.map((entry) => entry.label)).toEqual(["Filed on: 26 Aug — Kiro's claim"]);

    const nothing = m.sideList.find((entry) => entry.ticketId === bare.state.id)!;
    expect(nothing.note).toBe(NO_DATES_NOTE);
    expect(nothing.customClaims).toEqual([]);
  });

  it('filters narrow rows and side list alike; pending claims stay visibly in transit', () => {
    const mine = ticket(
      {
        assigneeId: 'user_anselma',
        fields: { title: claimField('Mine'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) },
      },
      ['dueDate'],
    );
    const other = ticket({ fields: { title: claimField('Other'), dueDate: claimField({ date: '2026-08-28' }) } });
    const m = model([mine, other], { filter: { assigneeIds: ['user_anselma'] } });
    expect(allRows(m)).toHaveLength(1);
    expect(allRows(m)[0].pending).toBe(true);
    expect(m.sideList).toHaveLength(0); // 'Other' filtered out before the side list
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/timeline/timeline-model.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the model**

`packages/app-core/src/timeline/timeline-model.ts`:

```ts
import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_SIDE_LIST_COPY,
  barProvenance,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  formatClaimDate,
  startClaimLabel,
  type UserNameFn,
} from '../claims/claim-labels';
import { DAY_MS, addDays, dateMs, mondayOnOrBefore } from '../claims/dates';
import {
  customDateClaimsOf,
  dateClaimOf,
  titleOf,
  type CustomDateClaimView,
  type DateClaimView,
  type TicketDatesInput,
} from '../claims/ticket-dates';
import { matchesFilter, type FilterSpec } from '../filter/filter-spec';
import { epicAncestorOf } from '../hierarchy/epic-ancestor';

export type TimelineWeekCol = { start: string; label: string };
export type TimelineBarSpan = { fromWeek: number; toWeek: number; clippedStart: boolean; clippedEnd: boolean };

/** A claimed custom date field with its attributed rendering. Never geometry. */
export type TimelineCustomClaim = { claim: CustomDateClaimView; label: string };

export type TimelineRow = {
  ticketId: string;
  title: string;
  bar: TimelineBarSpan;
  startClaim: DateClaimView;
  dueClaim: DateClaimView;
  pending: boolean;
  provenance: string;
  customClaims: TimelineCustomClaim[];
};

export type TimelineSideEntry = {
  ticketId: string;
  title: string;
  reason: 'no-dates' | 'start-only' | 'due-only' | 'start-after-due';
  startClaim: DateClaimView | null;
  dueClaim: DateClaimView | null;
  note: string;
  customClaims: TimelineCustomClaim[];
};

export type TimelineGroup = { epicId: string | null; epicTitle: string; rows: TimelineRow[] };

export type TimelineModel = {
  weeks: TimelineWeekCol[];
  groups: TimelineGroup[];
  sideList: TimelineSideEntry[];
  sideListCopy: string;
};

export const NO_DATES_NOTE = 'no claimed dates';

/**
 * The same side-list slot for a ticket that DOES carry custom date claims
 * but no start/needed-by pair. Saying "no claimed dates" there would be
 * false — the note narrows to exactly what is missing.
 */
export const NO_DAY_CLAIMS_NOTE = 'no claimed start or needed-by';

const DEFAULT_WEEKS = 8;
const NO_EPIC_TITLE = 'No epic';

/**
 * Gantt-lite over claims. THE rule: a bar requires BOTH a claimed start and
 * a claimed due. A single claim is a side-list entry with the claim named;
 * no claim is a side-list entry saying so; start-after-due is displayed as
 * the contradiction it is — geometry is never invented to resolve it.
 * No dependencies, no critical path: out of spec.
 */
export function buildTimelineModel(
  inputs: TicketDatesInput[],
  opts: { anchor: string; weeksCount?: number; userName: UserNameFn; filter?: FilterSpec; laneEpicId?: string | null },
): TimelineModel {
  const weeksCount = opts.weeksCount ?? DEFAULT_WEEKS;
  const windowStart = mondayOnOrBefore(opts.anchor);
  const weeks: TimelineWeekCol[] = [];
  for (let index = 0; index < weeksCount; index += 1) {
    const start = addDays(windowStart, index * 7);
    weeks.push({ start, label: `W ${formatClaimDate(start)}` });
  }
  const windowEnd = addDays(weeks[weeks.length - 1].start, 6);

  const byId = new Map<string, TicketState>(inputs.map((input) => [input.state.id, input.state]));
  const visible = inputs.filter((input) => {
    if (opts.filter && !matchesFilter(input.state, opts.filter)) return false;
    if (opts.laneEpicId != null && epicAncestorOf(byId, input.state.id) !== opts.laneEpicId) return false;
    return true;
  });

  function weekIndexOf(isoDay: string): number {
    return Math.floor((dateMs(isoDay) - dateMs(windowStart)) / (7 * DAY_MS));
  }

  const rowsWithEpic: Array<{ epicId: string | null; row: TimelineRow }> = [];
  const sideList: TimelineSideEntry[] = [];

  for (const input of visible) {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;
    if (input.state.typeId === 'epic' && !start && !due) continue; // an undated epic is a lane, not missing work

    // Custom date claims are carried, never consulted: nothing below branches
    // on them except the side-list WORDING. They cannot make a bar, move a
    // bar, or move a ticket between the rows and the side list.
    const customClaims: TimelineCustomClaim[] = customDateClaimsOf(input).map((claim) => ({
      claim,
      label: customClaimLabel(claim, opts.userName),
    }));

    if (start && due && start.date <= due.date) {
      if (due.date < windowStart || start.date > windowEnd) continue; // scheduled, just not in this window
      const clippedStart = start.date < windowStart;
      const clippedEnd = due.date > windowEnd;
      rowsWithEpic.push({
        epicId: epicAncestorOf(byId, ticketId),
        row: {
          ticketId,
          title,
          bar: {
            fromWeek: clippedStart ? 0 : weekIndexOf(start.date),
            toWeek: clippedEnd ? weeksCount - 1 : weekIndexOf(due.date),
            clippedStart,
            clippedEnd,
          },
          startClaim: start,
          dueClaim: due,
          pending: start.pending || due.pending,
          provenance: barProvenance(start, due, opts.userName),
          customClaims,
        },
      });
      continue;
    }

    if (start && due) {
      sideList.push({ ticketId, title, reason: 'start-after-due', startClaim: start, dueClaim: due, note: contradictionCopy(start, due), customClaims });
    } else if (due) {
      sideList.push({ ticketId, title, reason: 'due-only', startClaim: null, dueClaim: due, note: dueClaimLabel(due, opts.userName), customClaims });
    } else if (start) {
      sideList.push({ ticketId, title, reason: 'start-only', startClaim: start, dueClaim: null, note: startClaimLabel(start, opts.userName), customClaims });
    } else {
      sideList.push({
        ticketId,
        title,
        reason: 'no-dates',
        startClaim: null,
        dueClaim: null,
        note: customClaims.length > 0 ? NO_DAY_CLAIMS_NOTE : NO_DATES_NOTE,
        customClaims,
      });
    }
  }

  const groupsById = new Map<string | null, TimelineGroup>();
  for (const { epicId, row } of rowsWithEpic) {
    const existing = groupsById.get(epicId);
    if (existing) {
      existing.rows.push(row);
    } else {
      const epicTitle = epicId === null ? NO_EPIC_TITLE : titleOf(byId.get(epicId) as TicketState) || NO_EPIC_TITLE;
      groupsById.set(epicId, { epicId, epicTitle, rows: [row] });
    }
  }
  for (const group of groupsById.values()) {
    group.rows.sort((a, b) => (a.startClaim.date < b.startClaim.date ? -1 : a.startClaim.date > b.startClaim.date ? 1 : a.ticketId < b.ticketId ? -1 : 1));
  }
  const groups = [...groupsById.values()].sort((a, b) => {
    if (a.epicId === null) return 1;
    if (b.epicId === null) return -1;
    return a.epicTitle < b.epicTitle ? -1 : a.epicTitle > b.epicTitle ? 1 : 0;
  });

  return { weeks, groups, sideList, sideListCopy: TIMELINE_SIDE_LIST_COPY };
}
```

Add to `packages/app-core/src/index.ts`:

```ts
export * from './timeline/timeline-model';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/timeline/timeline-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/timeline/timeline-model.ts packages/app-core/src/timeline/timeline-model.test.ts packages/app-core/src/index.ts
git commit -m "timeline view-model: a bar needs both claims — single claims and contradictions go to the side list with their authors named, and no geometry is ever invented"
```

---

### Task 11: `TimelineView` — the week-column component

Renders Task 10's model: a title column plus week columns, group headings, bars as buttons with provenance on hover, and the side list as a visible `aside` — partially dated work is not an error state tucked away; it is honest information.

**Files:**
- Create: `packages/app-core/src/timeline/TimelineView.tsx`
- Test: `packages/app-core/src/timeline/TimelineView.test.tsx`
- Modify: `packages/app-core/src/index.ts`

**Interfaces:**
- Consumes: `buildTimelineModel` and its types (Task 10); `addDays` (Task 8); `tokens`; `TicketDatesInput`, `UserNameFn`, `FilterSpec`.
- Produces:
  - `type TimelineViewProps = { tickets: TicketDatesInput[]; today: string; userName: UserNameFn; onOpenTicket: (ticketId: string) => void; filter?: FilterSpec; laneEpicId?: string | null; weeksCount?: number }`
  - `TimelineView(props: TimelineViewProps): JSX.Element` — window nav (‹ Earlier / Today / Later ›, shifting 4 weeks), bars carry `data-pending` and `title={provenance}`, clipped edges carry `data-clipped-start`/`data-clipped-end`, side list under `aria-label="Undated or partially dated"`.
  - Custom date claims render on the ticket's own row (and on its side-list entry) as a muted `<ul data-custom-claims>` of their attributed labels, each `<li data-field-id="…">` — in the title column, beside the ticket, not in the week grid, because they are facts about the ticket and not spans across weeks. They also join the bar button's `title` attribute after the bar provenance, so a hover reports every claim the row carries.

- [ ] **Step 1: Write the failing component tests**

`packages/app-core/src/timeline/TimelineView.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import type { TicketDatesInput } from '../claims/ticket-dates';
import { TimelineView } from './TimelineView';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string) => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

function ticket(
  overrides: Partial<TicketState> = {},
  pendingFieldIds: string[] = [],
  customDateFields: readonly { id: string; name: string }[] = [],
): TicketDatesInput {
  counter += 1;
  const base: TicketState = {
    id: `t${counter}`,
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: claimField(`Ticket ${counter}`) },
    transitions: [],
  } as TicketState;
  return {
    state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } },
    pendingFieldIds,
    customDateFields,
  };
}

const TODAY = '2026-08-23';

describe('TimelineView', () => {
  it('renders a bar only for both-claims work; the rest sits in the visible side list (planted defect)', () => {
    const dated = ticket({
      fields: { title: claimField('Dated'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const dueOnly = ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) } });
    const onOpenTicket = vi.fn();
    render(<TimelineView tickets={[dated, dueOnly]} today={TODAY} userName={userName} onOpenTicket={onOpenTicket} />);

    const bar = screen.getByRole('button', { name: 'Dated' });
    expect(bar).toHaveAttribute('title', "starts 24 Aug — Kiro's claim · needed by 28 Aug — Kiro's claim");
    fireEvent.click(bar);
    expect(onOpenTicket).toHaveBeenCalledWith(dated.state.id);

    const side = screen.getByRole('complementary', { name: 'Undated or partially dated' });
    expect(within(side).getByText('Due only')).toBeInTheDocument();
    expect(within(side).getByText("needed by 28 Aug — Kiro's claim")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Due only' })).not.toBeNull(); // side entries open the ticket too
  });

  it('groups under epic headings', () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('Registrations') } });
    const child = ticket({
      parentId: 'epic1',
      fields: { title: claimField('DLT'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) },
    });
    render(<TimelineView tickets={[epic, child]} today={TODAY} userName={userName} onOpenTicket={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
  });

  it('pending bars are marked in transit', () => {
    const pending = ticket(
      { fields: { title: claimField('Pending'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) } },
      ['startDate'],
    );
    render(<TimelineView tickets={[pending]} today={TODAY} userName={userName} onOpenTicket={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pending' })).toHaveAttribute('data-pending', 'true');
  });

  it("a custom date claim shows on the ticket's row under its own field name, and on the hover", () => {
    const dated = ticket(
      {
        fields: {
          title: claimField('Dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
          'filed-on': claimField('2026-08-26', 'user_anselma'),
        },
      },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    render(<TimelineView tickets={[dated]} today={TODAY} userName={userName} onOpenTicket={vi.fn()} />);
    const claim = screen.getByText("Filed on: 26 Aug — Anselma's claim");
    expect(claim).toHaveAttribute('data-field-id', 'filed-on');
    expect(screen.getByRole('button', { name: 'Dated' })).toHaveAttribute(
      'title',
      "starts 24 Aug — Kiro's claim · needed by 28 Aug — Kiro's claim · Filed on: 26 Aug — Anselma's claim",
    );
  });

  it('a side-list entry carries its custom claims, and its note stops claiming the ticket is dateless', () => {
    const filedOnly = ticket(
      { fields: { title: claimField('Filed, not scheduled'), 'filed-on': claimField('2026-08-26') } },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    render(<TimelineView tickets={[filedOnly]} today={TODAY} userName={userName} onOpenTicket={vi.fn()} />);
    const side = screen.getByRole('complementary', { name: 'Undated or partially dated' });
    expect(within(side).getByText('no claimed start or needed-by')).toBeInTheDocument();
    expect(within(side).getByText("Filed on: 26 Aug — Kiro's claim")).toBeInTheDocument();
  });

  it('the window shifts Earlier/Later and Today returns', () => {
    render(<TimelineView tickets={[]} today={TODAY} userName={userName} onOpenTicket={vi.fn()} />);
    expect(screen.getByText('W 17 Aug')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText('W 17 Aug')).toBeNull();
    expect(screen.getByText('W 14 Sep')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByText('W 17 Aug')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/timeline/TimelineView.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

`packages/app-core/src/timeline/TimelineView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { tokens } from '@gisik-nokma/ui';
import type { UserNameFn } from '../claims/claim-labels';
import { addDays, mondayOnOrBefore } from '../claims/dates';
import type { TicketDatesInput } from '../claims/ticket-dates';
import type { FilterSpec } from '../filter/filter-spec';
import { buildTimelineModel, type TimelineCustomClaim } from './timeline-model';

export type TimelineViewProps = {
  tickets: TicketDatesInput[];
  /**
   * The IST day, injected by the shell as `istDayOf(new Date().toISOString())`
   * — same value the Calendar's `today` prop carries, so both views agree on
   * which day it is and place the same claim in the same day. The week columns
   * are derived from it in day-space; nothing here reads a clock.
   */
  today: string;
  userName: UserNameFn;
  onOpenTicket: (ticketId: string) => void;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  weeksCount?: number;
};

const SHIFT_DAYS = 28; // Earlier/Later move four weeks

/**
 * A ticket's custom date claims, beside the ticket rather than across the
 * weeks — they are facts about the work, not spans of it. Each label is the
 * model's attributed rendering, printed verbatim.
 */
function CustomClaimList(props: { claims: TimelineCustomClaim[] }) {
  return (
    <ul
      data-custom-claims=""
      style={{ listStyle: 'none', margin: 0, padding: 0, color: tokens.color.customMarker, fontSize: '0.8rem' }}
    >
      {props.claims.map((entry) => (
        <li key={entry.claim.fieldId} data-field-id={entry.claim.fieldId} data-pending={entry.claim.pending || undefined}>
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

export function TimelineView(props: TimelineViewProps) {
  const [anchor, setAnchor] = useState<string>(mondayOnOrBefore(props.today));

  const model = useMemo(
    () =>
      buildTimelineModel(props.tickets, {
        anchor,
        weeksCount: props.weeksCount,
        userName: props.userName,
        filter: props.filter,
        laneEpicId: props.laneEpicId,
      }),
    [props.tickets, props.userName, props.filter, props.laneEpicId, props.weeksCount, anchor],
  );

  const gridTemplateColumns = `12rem repeat(${model.weeks.length}, 1fr)`;

  return (
    <div style={{ fontFamily: tokens.font.body, color: tokens.color.ink, background: tokens.color.surface }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: tokens.space.sm, padding: tokens.space.sm }}>
        <button type="button" onClick={() => setAnchor(addDays(anchor, -SHIFT_DAYS))}>Earlier</button>
        <button type="button" onClick={() => setAnchor(mondayOnOrBefore(props.today))}>Today</button>
        <button type="button" onClick={() => setAnchor(addDays(anchor, SHIFT_DAYS))}>Later</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns, borderBottom: `1px solid ${tokens.color.line}` }}>
        <div />
        {model.weeks.map((week) => (
          <div key={week.start} style={{ padding: tokens.space.xs, color: tokens.color.inkMuted, fontSize: '0.85rem' }}>
            {week.label}
          </div>
        ))}
      </div>
      {model.groups.map((group) => (
        <section key={group.epicId ?? 'no-epic'}>
          <h3 style={{ margin: 0, padding: tokens.space.xs, fontSize: '0.9rem' }}>{group.epicTitle}</h3>
          {group.rows.map((row) => (
            <div key={row.ticketId} style={{ display: 'grid', gridTemplateColumns, alignItems: 'center' }}>
              <div style={{ padding: tokens.space.xs, overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</div>
                {row.customClaims.length > 0 && <CustomClaimList claims={row.customClaims} />}
              </div>
              <button
                type="button"
                data-pending={row.pending || undefined}
                data-clipped-start={row.bar.clippedStart || undefined}
                data-clipped-end={row.bar.clippedEnd || undefined}
                title={[row.provenance, ...row.customClaims.map((entry) => entry.label)].join(' · ')}
                onClick={() => props.onOpenTicket(row.ticketId)}
                style={{
                  gridColumn: `${row.bar.fromWeek + 2} / ${row.bar.toWeek + 3}`,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: tokens.radius.sm,
                  margin: '2px 0',
                  padding: `2px ${tokens.space.xs}`,
                  textAlign: 'left',
                  font: 'inherit',
                  background: row.pending ? tokens.color.pendingHatch : tokens.color.barActive,
                  color: tokens.color.ink,
                }}
              >
                {row.title}
              </button>
            </div>
          ))}
        </section>
      ))}
      <aside aria-label="Undated or partially dated" style={{ padding: tokens.space.sm, borderTop: `1px solid ${tokens.color.line}` }}>
        <p style={{ margin: 0, color: tokens.color.inkMuted }}>{model.sideListCopy}</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {model.sideList.map((entry) => (
            <li key={entry.ticketId} style={{ padding: `${tokens.space.xs} 0` }}>
              <button
                type="button"
                onClick={() => props.onOpenTicket(entry.ticketId)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', color: tokens.color.ink, padding: 0 }}
              >
                {entry.title}
              </button>
              <span style={{ color: tokens.color.inkMuted, marginLeft: tokens.space.sm }}>{entry.note}</span>
              {entry.customClaims.length > 0 && <CustomClaimList claims={entry.customClaims} />}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
```

Add to `packages/app-core/src/index.ts`:

```ts
export * from './timeline/TimelineView';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/timeline/TimelineView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/timeline/TimelineView.tsx packages/app-core/src/timeline/TimelineView.test.tsx packages/app-core/src/index.ts
git commit -m "TimelineView: week columns with the side list in plain sight — partially dated work is information, not an error to hide"
```

---

### Task 12: The inbox — gateway interface, per-kind icons, `UnreadBadge`, `InboxView`

The inbox is presentational: it renders `Notification[]` and calls back. Data access hides behind a `NotificationsGateway` interface (online implementation in Task 14; Plan 10's replica gets its own). Headlines are the claims' own attributed wording — the date-approaching headline IS `dueClaimLabel`, the same function the calendar uses, so the exact label is pinned once and consumed twice. A contested claim's body is the rule engine's reason verbatim, never paraphrased.

**Files:**
- Create: `packages/app-core/src/inbox/gateway.ts`
- Create: `packages/app-core/src/inbox/format.ts`
- Create: `packages/app-core/src/inbox/icons.tsx`
- Create: `packages/app-core/src/inbox/UnreadBadge.tsx`
- Create: `packages/app-core/src/inbox/InboxView.tsx`
- Test: `packages/app-core/src/inbox/format.test.ts`, `packages/app-core/src/inbox/InboxView.test.tsx`
- Modify: `packages/app-core/src/index.ts`

**Interfaces:**
- Consumes: `Notification`, payload types (`@gisik-nokma/domain`, Task 3); `dueClaimLabel`, `formatClaimDate`, `UserNameFn` (Task 8); `tokens`.
- Produces (Task 14 and Plan 10/11 shells consume):
  - `type NotificationsPage = { notifications: Notification[]; nextCursor: string | null }`
  - `interface NotificationsGateway { list(cursor?: string | null): Promise<NotificationsPage>; unreadCount(): Promise<number>; markRead(id: string): Promise<void> }`
  - `notificationHeadline(notification, userName): string`, `notificationBody(notification): string`, `notificationTicketId(notification): string`
  - `NotificationIcon({ kind }): JSX.Element` — inline SVG, `currentColor` only (token discipline holds: no colour literals)
  - `UnreadBadge({ count }): JSX.Element | null` — hidden at 0, caps at `99+`
  - `type InboxViewProps = { notifications: Notification[]; userName: UserNameFn; onOpen: (notification: Notification) => void; onMarkRead: (id: string) => void; onLoadMore?: (() => void) | null }`; `InboxView(props)` — clicking an item marks it read and opens it; unread items carry `data-unread="true"`.

- [ ] **Step 1: Write the failing format tests**

`packages/app-core/src/inbox/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Notification } from '@gisik-nokma/domain';
import { notificationBody, notificationHeadline, notificationTicketId } from './format';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string) => names[id] ?? id;

function base(kind: Notification['kind'], payload: Notification['payload']): Notification {
  return {
    id: '01J9GN0T000000000000000001',
    userId: 'user_anselma',
    workspaceId: 'ws_1',
    kind,
    dedupeKey: `${kind}:x`,
    payload,
    read: false,
    createdAt: '2026-08-23T05:00:00.000Z',
  };
}

describe('notification copy is the claim, attributed — never invented urgency', () => {
  it('date-approaching headline is the exact attributed label (planted defect)', () => {
    const n = base('date-approaching', {
      ticketId: 't1',
      ticketTitle: 'Renew the DLT registration',
      field: 'dueDate',
      claim: { date: '2026-08-30', actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
    });
    expect(notificationHeadline(n, userName)).toBe("needed by 30 Aug — Kiro's claim");
    expect(notificationBody(n)).toBe('Renew the DLT registration');
  });

  it('assignment and mention name the actor', () => {
    const assignment = base('assignment', {
      ticketId: 't1', ticketTitle: 'DLT', assignedBy: 'user_kiro', eventId: 'e1',
      clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z',
    });
    expect(notificationHeadline(assignment, userName)).toBe('Kiro assigned this to you');
    const mention = base('mention', {
      ticketId: 't1', ticketTitle: 'DLT', mentionedBy: 'user_kiro', eventId: 'e1', source: 'comment',
      excerpt: 'please check the GST filing', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z',
    });
    expect(notificationHeadline(mention, userName)).toBe('Kiro mentioned you');
    expect(notificationBody(mention)).toBe('please check the GST filing');
  });

  it('a contested claim names the rule; the body is the refusal reason verbatim', () => {
    const n = base('contested-claim', {
      ticketId: 't1',
      rule: 'require-evidence',
      reason: 'This move must carry an attachment as evidence, and none was provided.',
      claim: { eventId: 'e0', type: 'ticket.transitioned', actorId: 'user_anselma', clientTime: '2026-08-22T18:00:00.000Z' },
      contestEventId: 'e1',
      serverTime: '2026-08-23T05:00:00.000Z',
    });
    expect(notificationHeadline(n, userName)).toBe('Your claim was contested — require-evidence');
    expect(notificationBody(n)).toBe('This move must carry an attachment as evidence, and none was provided.');
    expect(notificationTicketId(n)).toBe('t1');
  });

  it('a stale ticket says since when and who moved it there', () => {
    const n = base('stale-ticket', {
      ticketId: 't1', ticketTitle: 'DLT', stateId: 'doing', stateName: 'Doing',
      enteredAt: '2026-08-01T09:00:00.000Z', enteredBy: 'user_kiro',
    });
    expect(notificationHeadline(n, userName)).toBe('In Doing since 1 Aug — moved there by Kiro');
    const nameless = base('stale-ticket', { ...(n.payload as object), stateName: null } as Notification['payload']);
    expect(notificationHeadline(nameless, userName)).toBe('In doing since 1 Aug — moved there by Kiro');
  });

  it('planted defect: "since" is the IST day of the stored instant, not a UTC slice of it', () => {
    // 2026-08-01T19:00:00.000Z is 00:30 IST on 2 Aug. Slicing the string says
    // "1 Aug"; istDayOf says 2 Aug, which is the day the ticket's own history
    // shows, and the day the calendar would place it in.
    const crossing = base('stale-ticket', {
      ticketId: 't1', ticketTitle: 'DLT', stateId: 'doing', stateName: 'Doing',
      enteredAt: '2026-08-01T19:00:00.000Z', enteredBy: 'user_kiro',
    });
    expect(notificationHeadline(crossing, userName)).toBe('In Doing since 2 Aug — moved there by Kiro');
    // And the last instant that is still 1 Aug in IST stays 1 Aug.
    const stillFirst = base('stale-ticket', {
      ticketId: 't1', ticketTitle: 'DLT', stateId: 'doing', stateName: 'Doing',
      enteredAt: '2026-08-01T18:29:59.999Z', enteredBy: 'user_kiro',
    });
    expect(notificationHeadline(stillFirst, userName)).toBe('In Doing since 1 Aug — moved there by Kiro');
  });
});
```

- [ ] **Step 2: Run to verify they fail, then implement format, icons, badge**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/inbox/format.test.ts` — expected FAIL (module missing). Then:

`packages/app-core/src/inbox/format.ts`:

```ts
import { istDayOf } from '@gisik-nokma/domain';
import type {
  AssignmentNotificationPayload,
  ContestedClaimNotificationPayload,
  DateApproachingNotificationPayload,
  MentionNotificationPayload,
  Notification,
  StaleTicketNotificationPayload,
} from '@gisik-nokma/domain';
import { dueClaimLabel, formatClaimDate, type UserNameFn } from '../claims/claim-labels';

/**
 * Headlines are the claims' own attributed wording. There is no urgency
 * vocabulary here because there is no urgency field to read (Task 3's
 * strict schemas) — the copy CANNOT say "URGENT", only what someone claimed.
 *
 * One payload field is an INSTANT rather than a day claim: stale-ticket's
 * `enteredAt`, which is the ledger's `server_time`. It goes through istDayOf,
 * never through a string slice — `2026-08-01T19:00:00.000Z` is 2 Aug in IST,
 * and "since 1 Aug" would be the inbox quietly disagreeing with the ticket
 * history sitting beside it.
 */
export function notificationHeadline(notification: Notification, userName: UserNameFn): string {
  switch (notification.kind) {
    case 'assignment': {
      const payload = notification.payload as AssignmentNotificationPayload;
      return `${userName(payload.assignedBy)} assigned this to you`;
    }
    case 'mention': {
      const payload = notification.payload as MentionNotificationPayload;
      return `${userName(payload.mentionedBy)} mentioned you`;
    }
    case 'contested-claim': {
      const payload = notification.payload as ContestedClaimNotificationPayload;
      return `Your claim was contested — ${payload.rule}`;
    }
    case 'date-approaching': {
      const payload = notification.payload as DateApproachingNotificationPayload;
      return dueClaimLabel(payload.claim, userName);
    }
    case 'stale-ticket': {
      const payload = notification.payload as StaleTicketNotificationPayload;
      return `In ${payload.stateName ?? payload.stateId} since ${formatClaimDate(istDayOf(payload.enteredAt))} — moved there by ${userName(payload.enteredBy)}`;
    }
  }
}

export function notificationBody(notification: Notification): string {
  switch (notification.kind) {
    case 'assignment':
      return (notification.payload as AssignmentNotificationPayload).ticketTitle;
    case 'mention':
      return (notification.payload as MentionNotificationPayload).excerpt;
    case 'contested-claim':
      return (notification.payload as ContestedClaimNotificationPayload).reason;
    case 'date-approaching':
      return (notification.payload as DateApproachingNotificationPayload).ticketTitle;
    case 'stale-ticket':
      return (notification.payload as StaleTicketNotificationPayload).ticketTitle;
  }
}

/** Every kind's payload names its ticket — the deep-link target. */
export function notificationTicketId(notification: Notification): string {
  return (notification.payload as { ticketId: string }).ticketId;
}
```

`packages/app-core/src/inbox/gateway.ts`:

```ts
import type { Notification } from '@gisik-nokma/domain';

export type NotificationsPage = { notifications: Notification[]; nextCursor: string | null };

/** Implemented over HTTP by the web shell (Task 14) and over the replica by Plan 10. */
export interface NotificationsGateway {
  list(cursor?: string | null): Promise<NotificationsPage>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
}
```

`packages/app-core/src/inbox/icons.tsx` (stroke icons, `currentColor` only — the surrounding text colour, itself a token, is the only colour source):

```tsx
import type { NotificationKind } from '@gisik-nokma/domain';

const PATHS: Record<NotificationKind, JSX.Element> = {
  assignment: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  mention: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </>
  ),
  'contested-claim': (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  'date-approaching': (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  'stale-ticket': (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
};

export function NotificationIcon({ kind }: { kind: NotificationKind }) {
  return (
    <svg
      data-kind={kind}
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[kind]}
    </svg>
  );
}
```

`packages/app-core/src/inbox/UnreadBadge.tsx`:

```tsx
import { tokens } from '@gisik-nokma/ui';

export type UnreadBadgeProps = { count: number };

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count === 0) return null;
  return (
    <span
      aria-label={`${count} unread notifications`}
      style={{
        background: tokens.color.unreadDot,
        color: tokens.color.accentInk,
        borderRadius: '999px',
        padding: `0 ${tokens.space.xs}`,
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
```

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/inbox/format.test.ts` — expected PASS.

- [ ] **Step 3: Write the failing InboxView tests**

`packages/app-core/src/inbox/InboxView.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '@gisik-nokma/domain';
import { InboxView } from './InboxView';

const names: Record<string, string> = { user_kiro: 'Kiro' };
const userName = (id: string) => names[id] ?? id;

let counter = 0;

function notification(overrides: Partial<Notification> = {}): Notification {
  counter += 1;
  return {
    id: `01J9GN0T00000000000000${String(counter).padStart(4, '0')}`.slice(0, 26),
    userId: 'user_anselma',
    workspaceId: 'ws_1',
    kind: 'date-approaching',
    dedupeKey: `k${counter}`,
    payload: {
      ticketId: 't1',
      ticketTitle: 'Renew the DLT registration',
      field: 'dueDate',
      claim: { date: '2026-08-30', actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
    },
    read: false,
    createdAt: '2026-08-23T05:00:00.000Z',
    ...overrides,
  };
}

describe('InboxView', () => {
  it('renders the attributed headline with its kind icon and unread mark; clicking marks read and opens', () => {
    const n = notification();
    const onOpen = vi.fn();
    const onMarkRead = vi.fn();
    render(<InboxView notifications={[n]} userName={userName} onOpen={onOpen} onMarkRead={onMarkRead} />);

    const item = screen.getByRole('button', { name: /needed by 30 Aug — Kiro's claim/ });
    expect(item).toHaveAttribute('data-unread', 'true');
    expect(document.querySelector('svg[data-kind="date-approaching"]')).not.toBeNull();

    fireEvent.click(item);
    expect(onMarkRead).toHaveBeenCalledWith(n.id);
    expect(onOpen).toHaveBeenCalledWith(n);
  });

  it('a read notification is not marked again on click, and carries no unread mark', () => {
    const n = notification({ read: true });
    const onMarkRead = vi.fn();
    render(<InboxView notifications={[n]} userName={userName} onOpen={vi.fn()} onMarkRead={onMarkRead} />);
    const item = screen.getByRole('button', { name: /needed by 30 Aug/ });
    expect(item).not.toHaveAttribute('data-unread');
    fireEvent.click(item);
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it('offers Load more only when a next page exists', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <InboxView notifications={[notification()]} userName={userName} onOpen={vi.fn()} onMarkRead={vi.fn()} onLoadMore={onLoadMore} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalled();
    rerender(<InboxView notifications={[notification()]} userName={userName} onOpen={vi.fn()} onMarkRead={vi.fn()} onLoadMore={null} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify they fail, then implement `InboxView`**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/inbox/InboxView.test.tsx` — expected FAIL. Then:

`packages/app-core/src/inbox/InboxView.tsx`:

```tsx
import type { Notification } from '@gisik-nokma/domain';
import { tokens } from '@gisik-nokma/ui';
import type { UserNameFn } from '../claims/claim-labels';
import { notificationBody, notificationHeadline } from './format';
import { NotificationIcon } from './icons';

export type InboxViewProps = {
  notifications: Notification[];
  userName: UserNameFn;
  onOpen: (notification: Notification) => void;
  onMarkRead: (id: string) => void;
  onLoadMore?: (() => void) | null;
};

export function InboxView(props: InboxViewProps) {
  return (
    <div style={{ fontFamily: tokens.font.body, color: tokens.color.ink, background: tokens.color.surface }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {props.notifications.map((notification) => (
          <li key={notification.id} style={{ borderBottom: `1px solid ${tokens.color.line}` }}>
            <button
              type="button"
              data-unread={!notification.read || undefined}
              onClick={() => {
                if (!notification.read) props.onMarkRead(notification.id);
                props.onOpen(notification);
              }}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: tokens.space.sm,
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                padding: tokens.space.sm,
              }}
            >
              <span style={{ color: notification.read ? tokens.color.inkMuted : tokens.color.accent }}>
                <NotificationIcon kind={notification.kind} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: notification.read ? 400 : 600 }}>
                  {notificationHeadline(notification, props.userName)}
                </span>
                <span style={{ display: 'block', color: tokens.color.inkMuted }}>{notificationBody(notification)}</span>
              </span>
              {!notification.read && (
                <span
                  aria-hidden="true"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '999px',
                    background: tokens.color.unreadDot,
                    alignSelf: 'center',
                  }}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
      {props.onLoadMore && (
        <button type="button" onClick={props.onLoadMore} style={{ margin: tokens.space.sm }}>
          Load more
        </button>
      )}
    </div>
  );
}
```

Add to `packages/app-core/src/index.ts`:

```ts
export * from './inbox/gateway';
export * from './inbox/format';
export * from './inbox/icons';
export * from './inbox/UnreadBadge';
export * from './inbox/InboxView';
```

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/inbox` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/inbox packages/app-core/src/index.ts
git commit -m "inbox: headlines are the claims' own words — the date headline is the calendar's exact label, the contested body is the refusal reason verbatim, and there is no urgency copy because there is no urgency field"
```

---

### Task 13: Saved filters — named FilterSpecs behind the preferences gateway

Amendment 14: preferences are server-owned per-user rows. A saved filter is a named `FilterSpec` under the `savedFilters` preference key. **Applying one is a view act, never a data act** — the menu component structurally cannot touch a DataSource, and the required test documents it: applying calls `onApply` and nothing else; no ingest, no preference write.

**Files:**
- Create (guarded): `packages/app-core/src/preferences/preferences-gateway.ts`
- Create: `packages/app-core/src/filters/saved-filters.ts`
- Create: `packages/app-core/src/filters/SavedFiltersMenu.tsx`
- Test: `packages/app-core/src/filters/saved-filters.test.ts`, `packages/app-core/src/filters/SavedFiltersMenu.test.tsx`
- Modify: `packages/app-core/src/index.ts`

**Interfaces:**
- Consumes: `FilterSpec` (Task 8); `newUlid` (`@gisik-nokma/domain`); `tokens`.
- Produces (Board/List/Calendar mount the menu; Plan 6's online shell implements the gateway over `GET /v1/me/preferences` + `PUT /v1/me/preferences/:key` — assumed shape, Open questions; Plan 10's replica implements it over local storage):
  - `interface PreferencesGateway { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }` (**Guard:** `grep -rn "PreferencesGateway\|preferences" packages/app-core/src` first — if Plan 6 landed an equivalent, consume theirs and skip the file)
  - `type SavedFilter = { id: string; name: string; spec: FilterSpec }`; `SAVED_FILTERS_PREFERENCE_KEY = 'savedFilters'`
  - `parseSavedFilters(value: unknown): SavedFilter[]` (tolerant: malformed entries dropped, never a throw — a corrupt preference must not take the view down)
  - `loadSavedFilters(prefs): Promise<SavedFilter[]>`, `saveFilter(prefs, existing, name, spec): Promise<SavedFilter[]>`, `deleteSavedFilter(prefs, existing, id): Promise<SavedFilter[]>`
  - `type SavedFiltersMenuProps = { filters: SavedFilter[]; currentSpec: FilterSpec; onApply: (spec: FilterSpec) => void; onSaveCurrent: (name: string) => void; onDelete: (id: string) => void }`; `SavedFiltersMenu(props)`

- [ ] **Step 1: Write the failing tests**

`packages/app-core/src/filters/saved-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PreferencesGateway } from '../preferences/preferences-gateway';
import { SAVED_FILTERS_PREFERENCE_KEY, deleteSavedFilter, loadSavedFilters, parseSavedFilters, saveFilter } from './saved-filters';

function memoryPrefs(initial: Record<string, unknown> = {}): PreferencesGateway & { store: Record<string, unknown> } {
  const store = { ...initial };
  return {
    store,
    async get(key) {
      return store[key];
    },
    async set(key, value) {
      store[key] = value;
    },
  };
}

describe('saved filters', () => {
  it('round-trips save → load → delete through the preferences gateway', async () => {
    const prefs = memoryPrefs();
    const afterSave = await saveFilter(prefs, [], 'My open work', { assigneeIds: ['user_kiro'], stateCategories: ['open', 'active'] });
    expect(afterSave).toHaveLength(1);
    expect(afterSave[0].name).toBe('My open work');

    const loaded = await loadSavedFilters(prefs);
    expect(loaded).toEqual(afterSave);

    const afterDelete = await deleteSavedFilter(prefs, loaded, loaded[0].id);
    expect(afterDelete).toEqual([]);
    expect(prefs.store[SAVED_FILTERS_PREFERENCE_KEY]).toEqual([]);
  });

  it('parseSavedFilters drops malformed entries instead of throwing — a corrupt preference cannot take the view down', () => {
    expect(parseSavedFilters(undefined)).toEqual([]);
    expect(parseSavedFilters('junk')).toEqual([]);
    expect(
      parseSavedFilters([
        { id: 'f1', name: 'Good', spec: { assigneeIds: ['u1'] } },
        { id: 42, name: 'Bad id', spec: {} },
        { name: 'No id', spec: {} },
        null,
      ]),
    ).toEqual([{ id: 'f1', name: 'Good', spec: { assigneeIds: ['u1'] } }]);
  });
});
```

`packages/app-core/src/filters/SavedFiltersMenu.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SavedFiltersMenu } from './SavedFiltersMenu';

const filters = [
  { id: 'f1', name: 'My open work', spec: { assigneeIds: ['user_kiro'] } },
  { id: 'f2', name: 'Blocked anywhere', spec: { stateCategories: ['active' as const] } },
];

describe('SavedFiltersMenu', () => {
  it('applying a saved filter is a VIEW act, never a data act (planted defect — amendment 14)', () => {
    const onApply = vi.fn();
    const ingest = vi.fn(); // stands in for DataSource.ingest — the menu has no path to it
    const prefsSet = vi.fn(); // stands in for PreferencesGateway.set
    render(
      <SavedFiltersMenu filters={filters} currentSpec={{}} onApply={onApply} onSaveCurrent={vi.fn()} onDelete={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'My open work' }));
    expect(onApply).toHaveBeenCalledWith(filters[0].spec);
    expect(ingest).not.toHaveBeenCalled();
    expect(prefsSet).not.toHaveBeenCalled();
  });

  it('saving needs a name and hands it up', () => {
    const onSaveCurrent = vi.fn();
    render(<SavedFiltersMenu filters={[]} currentSpec={{ text: 'gst' }} onApply={vi.fn()} onSaveCurrent={onSaveCurrent} onDelete={vi.fn()} />);
    const saveButton = screen.getByRole('button', { name: 'Save current filter' });
    expect(saveButton).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter name' }), { target: { value: 'GST things' } });
    fireEvent.click(saveButton);
    expect(onSaveCurrent).toHaveBeenCalledWith('GST things');
  });

  it('deleting hands up the id', () => {
    const onDelete = vi.fn();
    render(<SavedFiltersMenu filters={filters} currentSpec={{}} onApply={vi.fn()} onSaveCurrent={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete My open work' }));
    expect(onDelete).toHaveBeenCalledWith('f1');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/filters`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement gateway, store functions, and menu**

`packages/app-core/src/preferences/preferences-gateway.ts` (only if the guard found none):

```ts
/**
 * Server-owned per-user preferences (amendment 14): Plan 6's online shell
 * implements this over /v1/me/preferences; Plan 10's replica over local
 * storage. View preferences arrange truth; they are not history.
 */
export interface PreferencesGateway {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}
```

`packages/app-core/src/filters/saved-filters.ts`:

```ts
import { newUlid } from '@gisik-nokma/domain';
import type { FilterSpec } from '../filter/filter-spec';
import type { PreferencesGateway } from '../preferences/preferences-gateway';

export type SavedFilter = { id: string; name: string; spec: FilterSpec };

export const SAVED_FILTERS_PREFERENCE_KEY = 'savedFilters';

/** Tolerant: malformed entries are dropped, never thrown over. */
export function parseSavedFilters(value: unknown): SavedFilter[] {
  if (!Array.isArray(value)) return [];
  const filters: SavedFilter[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    if (typeof record.spec !== 'object' || record.spec === null) continue;
    filters.push({ id: record.id, name: record.name, spec: record.spec as FilterSpec });
  }
  return filters;
}

export async function loadSavedFilters(prefs: PreferencesGateway): Promise<SavedFilter[]> {
  return parseSavedFilters(await prefs.get(SAVED_FILTERS_PREFERENCE_KEY));
}

export async function saveFilter(
  prefs: PreferencesGateway,
  existing: SavedFilter[],
  name: string,
  spec: FilterSpec,
): Promise<SavedFilter[]> {
  const next = [...existing, { id: newUlid(), name, spec }];
  await prefs.set(SAVED_FILTERS_PREFERENCE_KEY, next);
  return next;
}

export async function deleteSavedFilter(prefs: PreferencesGateway, existing: SavedFilter[], id: string): Promise<SavedFilter[]> {
  const next = existing.filter((filter) => filter.id !== id);
  await prefs.set(SAVED_FILTERS_PREFERENCE_KEY, next);
  return next;
}
```

`packages/app-core/src/filters/SavedFiltersMenu.tsx`:

```tsx
import { useState } from 'react';
import { tokens } from '@gisik-nokma/ui';
import type { FilterSpec } from '../filter/filter-spec';
import type { SavedFilter } from './saved-filters';

export type SavedFiltersMenuProps = {
  filters: SavedFilter[];
  currentSpec: FilterSpec;
  onApply: (spec: FilterSpec) => void;
  onSaveCurrent: (name: string) => void;
  onDelete: (id: string) => void;
};

/**
 * Presentational on purpose: this component has no DataSource and no
 * gateway. Applying a filter can only ever call onApply — arranging the
 * view, never touching data (amendment 14).
 */
export function SavedFiltersMenu(props: SavedFiltersMenuProps) {
  const [name, setName] = useState('');

  return (
    <div style={{ fontFamily: tokens.font.body, color: tokens.color.ink, padding: tokens.space.sm }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {props.filters.map((filter) => (
          <li key={filter.id} style={{ display: 'flex', gap: tokens.space.sm, alignItems: 'center', padding: `${tokens.space.xs} 0` }}>
            <button
              type="button"
              onClick={() => props.onApply(filter.spec)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', color: tokens.color.accent, padding: 0 }}
            >
              {filter.name}
            </button>
            <button
              type="button"
              aria-label={`Delete ${filter.name}`}
              onClick={() => props.onDelete(filter.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: tokens.color.inkMuted }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: tokens.space.sm, marginTop: tokens.space.sm }}>
        <input
          type="text"
          aria-label="Filter name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name this filter"
        />
        <button
          type="button"
          disabled={name.trim() === ''}
          onClick={() => {
            props.onSaveCurrent(name.trim());
            setName('');
          }}
        >
          Save current filter
        </button>
      </div>
    </div>
  );
}
```

Add to `packages/app-core/src/index.ts`:

```ts
export * from './preferences/preferences-gateway';
export * from './filters/saved-filters';
export * from './filters/SavedFiltersMenu';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/filters`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/preferences packages/app-core/src/filters packages/app-core/src/index.ts
git commit -m "saved filters: named FilterSpecs behind the preferences gateway — applying one is provably a view act, because the menu has no data surface to touch"
```

---

### Task 14: Web inbox wiring — HTTP gateway, `/inbox` page, nav badge

**Precondition:** Plan 6's `apps/web` Next.js shell exists (`ls apps/web/package.json`). The parallel wave normally merges Plan 6 first; if it has not, execute every other task, leave this one unchecked, and record the handoff for the orchestrator (Open questions 9). The logic this task wires — store, routes, `InboxView`, formatting — is already fully tested; this task is deliberately thin wiring, verified by typecheck plus a dev-server walk-through, with end-to-end smoke landing in Plan 6's flow suite.

**Coordination with Plan 6 Task 14 Step 5b — check before you touch the shell, because either plan can carry the calendar mount.** Plan 6's Step 5b mounts this plan's `CalendarView` and `TimelineView` on the project page, gated on their existing; Plan 6's own precondition says that if they were absent it *skips* the step and hands the mount to this task. The two orders therefore need different work from you, and doing both is a double mount:

```bash
grep -n "CalendarView\|istToday()" "apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx"
```

(Quote the path — the brackets are Next.js route segments, not globs.)

- **Hits (`CalendarView` in the `@gisik-nokma/app-core` import and the line `const today = istToday();`)** — Plan 6 Step 5b already landed the mount. This task then **verifies rather than re-adds**: confirm the four-way `board | list | calendar | timeline` tab chain renders and that `today` comes from `istToday()` and nothing else, and add no second mount, no second tab, no second day source. The Steps below stay as written — they only wire the inbox, which Step 5b does not touch.
- **No hits, and Plan 6's Task 14 commit records the Step 5b skip** — the mount falls here. Follow Plan 6 Task 14 Step 5b's own steps verbatim (its import list, the widened `view` state, the two tab buttons, `const today = istToday();`, and the four-way chain), taking `istToday` from `apps/web/src/ist-today.ts` — Plan 6 Step 5a lands that helper unconditionally, precisely so this order works. Do not restate the mount here and do not write a second adapter or a second day source; Plan 6's step is the one description of that wiring, exactly as this plan's Task 8 is the one description of `toTicketDatesInput`.

Everything below concerns the inbox only, and is the same in both orders — except that the nav layout is the file both plans modify, so re-read it before editing rather than assuming the shape Plan 6's Step 5 left.

**Files:**
- Create: `apps/web/src/lib/notifications-gateway.ts` (if the shell keeps code under a different root — e.g. `lib/` without `src/` — mirror its convention; `ls apps/web` first)
- Create: `apps/web/app/inbox/page.tsx`
- Modify: the shell's nav layout (locate: `grep -rln "nav" apps/web/app` — the layout Plan 6's Board/List links live in)
- Create: `apps/web/src/components/InboxNavLink.tsx`

**Interfaces:**
- Consumes: `NotificationsGateway`, `NotificationsPage`, `InboxView`, `UnreadBadge`, `notificationTicketId` (`@gisik-nokma/app-core`); `parseNotification`, `Notification` (`@gisik-nokma/domain`); Task 7's routes; Plan 6's session/base-URL conventions (**Guard:** read how Plan 6's shell calls the API — same-origin with cookie session is assumed below; match what its DataSource does).
- Produces:
  - `createHttpNotificationsGateway(baseUrl?: string): NotificationsGateway`
  - `/inbox` page rendering `InboxView` with mark-read + deep links
  - `InboxNavLink` — nav entry with the unread badge, refreshed every 60s.

- [ ] **Step 1: Implement the HTTP gateway**

`apps/web/src/lib/notifications-gateway.ts`:

```ts
import type { NotificationsGateway, NotificationsPage } from '@gisik-nokma/app-core';
import { parseNotification } from '@gisik-nokma/domain';

export function createHttpNotificationsGateway(baseUrl = ''): NotificationsGateway {
  async function request(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`${baseUrl}${path}`, { credentials: 'include', ...init });
    if (!response.ok) {
      throw new Error(`notifications request failed: ${response.status}`);
    }
    return response;
  }

  return {
    async list(cursor?: string | null): Promise<NotificationsPage> {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const body = (await (await request(`/v1/me/notifications${query}`)).json()) as {
        notifications: unknown[];
        nextCursor: string | null;
      };
      return { notifications: body.notifications.map(parseNotification), nextCursor: body.nextCursor };
    },
    async unreadCount(): Promise<number> {
      const body = (await (await request('/v1/me/notifications/unread-count')).json()) as { unread: number };
      return body.unread;
    },
    async markRead(id: string): Promise<void> {
      await request(`/v1/me/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
    },
  };
}
```

(If Plan 6's shell reaches the API through a rewrite/proxy or an absolute `API_URL`, pass that as `baseUrl` exactly where the shell's DataSource does.)

- [ ] **Step 2: Implement the inbox page**

`apps/web/app/inbox/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InboxView, notificationTicketId } from '@gisik-nokma/app-core';
import type { Notification } from '@gisik-nokma/domain';
import { createHttpNotificationsGateway } from '../../src/lib/notifications-gateway';

export default function InboxPage() {
  const router = useRouter();
  const gateway = useMemo(() => createHttpNotificationsGateway(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const loadFirstPage = useCallback(async () => {
    try {
      const page = await gateway.list();
      setNotifications(page.notifications);
      setNextCursor(page.nextCursor);
    } catch {
      setFailed(true);
    }
  }, [gateway]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function loadMore(): Promise<void> {
    if (nextCursor === null) return;
    const page = await gateway.list(nextCursor);
    setNotifications((current) => [...current, ...page.notifications]);
    setNextCursor(page.nextCursor);
  }

  function markRead(id: string): void {
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read: true } : n)));
    void gateway.markRead(id).catch(() => loadFirstPage()); // on failure, reload truth rather than pretend
  }

  function open(notification: Notification): void {
    // Guard: match Plan 6's ticket route — the same path its Board cards
    // push. Adjust this one line if the shell routes tickets differently.
    router.push(`/tickets/${notificationTicketId(notification)}`);
  }

  if (failed) {
    return <p role="alert">Could not load your inbox. Are you signed in?</p>;
  }

  // Display names come from Plan 6's member directory once it exists; until
  // then the actor id renders — attributed, if unpolished (Open questions).
  return (
    <InboxView
      notifications={notifications}
      userName={(id) => id}
      onOpen={open}
      onMarkRead={markRead}
      onLoadMore={nextCursor === null ? null : loadMore}
    />
  );
}
```

(**Guard:** if Plan 6's shell exposes a member-directory hook — `grep -rn "useWorkspaceMembers\|memberName\|userName" apps/web/src apps/web/app` — pass its resolver as `userName` instead of the id-echo.)

- [ ] **Step 3: Implement and mount the nav link**

`apps/web/src/components/InboxNavLink.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UnreadBadge } from '@gisik-nokma/app-core';
import { createHttpNotificationsGateway } from '../lib/notifications-gateway';

const REFRESH_MS = 60_000;

export function InboxNavLink() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const gateway = createHttpNotificationsGateway();
    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const count = await gateway.unreadCount();
        if (!cancelled) setUnread(count);
      } catch {
        // signed out or offline: the badge keeps its last honest value
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <Link href="/inbox">
      Inbox <UnreadBadge count={unread} />
    </Link>
  );
}
```

Mount `<InboxNavLink />` in the shell nav beside the existing view links (the layout file from the **Files** grep).

- [ ] **Step 4: Verify by typecheck and a dev walk-through**

Run: `pnpm --filter web typecheck` (adapt to the shell's package name — `grep '"name"' apps/web/package.json`).
Expected: clean.

Then, with the dev database and server running (Plan 1's smoke steps) plus `pnpm --filter web dev`: sign in, open `/inbox` — the list renders (empty is fine); insert a row via the sweep or a `ticket.assigned` event and confirm the badge and list update within a minute, clicking marks read and navigates. This is a wiring check; the logic under it is unit-tested in Tasks 4–12, and cross-client e2e smoke belongs to Plan 6's flow suite.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/notifications-gateway.ts apps/web/app/inbox/page.tsx apps/web/src/components/InboxNavLink.tsx apps/web/app
git commit -m "web inbox: thin wiring over tested parts — HTTP gateway, /inbox page, nav badge that keeps its last honest value when signed out"
```

---

### Task 15: Reporting scope guard, `Features.md` §11, `test-cases/11-calendar-notifications.md`, full verification

Spec §7: "Reporting v1 is derived counts and the ledger itself … No velocity, no burndown forecasts, nothing the record does not contain" — restated here as an executable guard, the base's override-scan discipline applied to vocabulary: no source file in any client or server tree may speak the estimation words. The same walker carries a second scan, for the same reason in a different register: the zone string `'Asia/Kolkata'` and the day regex may exist in exactly one file each (`packages/domain/src/ist-day.ts`), because a second copy of either is a second answer to "when does a day start", and this plan is where two answers would show up as two different calendar cells. Then the workspace bookkeeping in the same change set, and the whole plan's verification pass.

**Files:**
- Create: `packages/app-core/test/reporting-scope-guard.test.ts`
- Modify: `Features.md` (repo root — append §11)
- Create: `test-cases/11-calendar-notifications.md`

**Interfaces:**
- Consumes: `NOTIFICATION_KINDS`, `notificationPayloadSchemaByKind`, `IST_TIME_ZONE` (`@gisik-nokma/domain`); the source trees of Tasks 1–14.
- Produces: the executable scope guard (estimation vocabulary + single-origin time scan); `Features.md` §11; test-cases bucket 11 (cases 11.1–11.44; 11.36–11.41 cover the custom `date`-kind fields the owner brought into v1 on 2026-08-20; 11.42–11.44 cover the IST day boundary). This plan claims **only** §11 and the `11.x` case numbers.

- [ ] **Step 1: Write the scope-guard test (it should PASS immediately — it guards, it does not drive)**

`packages/app-core/test/reporting-scope-guard.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IST_TIME_ZONE, NOTIFICATION_KINDS, notificationPayloadSchemaByKind } from '@gisik-nokma/domain';

const HERE = new URL('.', import.meta.url).pathname;
const REPO_ROOT = resolve(HERE, '../../..');
// Every source tree that can answer "when does a day start" — the rule engine
// included, because the engine is where a day claim is ACCEPTED. Plan 3's
// `checks/fields.ts` declared a standalone day regex there until the 2026-08-20
// amendment; a root list that omits it is a guard that states an invariant it
// does not enforce.
const SCANNED_ROOTS = [
  'packages/app-core/src',
  'packages/domain/src',
  'packages/rule-engine/src',
  'packages/ui/src',
  'apps/server/src',
];
const FORBIDDEN = /\b(velocity|burndown|forecast)\b/i;

/**
 * The one file allowed to state the zone and the day shape (Plan 1, Task 4a).
 * The two constants below are SEARCH NEEDLES, not validators — this file
 * matches text, it never tests a date. The zone needle is built from
 * IST_TIME_ZONE so the scan cannot drift from the constant it is protecting.
 *
 * The day needle is the WHOLE anchored literal, deliberately. `envelope.ts`'s
 * ISO_DATETIME_REGEX legitimately begins /^\d{4}-\d{2}-\d{2}T… — it is the one
 * origin of the INSTANT shape, exactly as ist-day.ts is the one origin of the
 * DAY shape — and a fragment needle would flag it and invite someone to delete
 * the wrong thing. The trailing `$/` is what separates a day from an instant,
 * here and in the product.
 */
const TIME_ORIGIN = 'packages/domain/src/ist-day.ts';
const ZONE_LITERAL = `'${IST_TIME_ZONE}'`;
const DAY_REGEX_LITERAL = String.raw`/^\d{4}-\d{2}-\d{2}$/`;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe('reporting v1 scope guard (spec §7: nothing the record does not contain)', () => {
  it('no client or server source speaks the estimation vocabulary', () => {
    const offenders: string[] = [];
    for (const root of SCANNED_ROOTS) {
      let files: string[] = [];
      try {
        files = walk(join(REPO_ROOT, root));
      } catch {
        continue; // a package that does not exist yet is trivially clean
      }
      for (const file of files) {
        const lines = readFileSync(file, 'utf8').split('\n');
        const hit = lines.findIndex((line) => FORBIDDEN.test(line));
        if (hit !== -1) offenders.push(`${file}:${hit + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the notification vocabulary is closed over exactly the five kinds — no room for a computed-urgency kind to creep in', () => {
    expect(Object.keys(notificationPayloadSchemaByKind).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });
});

describe('time has one origin (owner decision: time is Asia/Kolkata)', () => {
  function scan(needle: string): string[] {
    const offenders: string[] = [];
    for (const root of SCANNED_ROOTS) {
      let files: string[] = [];
      try {
        files = walk(join(REPO_ROOT, root));
      } catch {
        continue;
      }
      for (const file of files) {
        if (file.endsWith(TIME_ORIGIN)) continue; // the declaration site itself
        const lines = readFileSync(file, 'utf8').split('\n');
        const hit = lines.findIndex((line) => line.includes(needle));
        if (hit !== -1) offenders.push(`${file}:${hit + 1}`);
      }
    }
    return offenders;
  }

  it('no file but ist-day.ts writes the zone as a literal — views import IST_TIME_ZONE', () => {
    // A hard-coded zone is a second answer to "which clock is this?", and the
    // day it disagrees about is the day a deadline moves.
    expect(scan(ZONE_LITERAL)).toEqual([]);
  });

  it('no file but ist-day.ts re-declares the day shape — everyone imports IST_DAY_REGEX', () => {
    // Three copies of one regex is three chances for the calendar, the schema
    // and the notification to disagree about what a day claim looks like.
    expect(scan(DAY_REGEX_LITERAL)).toEqual([]);
  });

  it('the zone string every view formats with comes from the domain, and is the real IANA name', () => {
    expect(IST_TIME_ZONE).toBe('Asia/Kolkata');
  });
});
```

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/reporting-scope-guard.test.ts`
Expected: PASS. If the vocabulary scan fails, the offender is real — rename the identifier or copy; never widen the regex's allowances. If a time scan fails, delete the duplicate and import from `@gisik-nokma/domain`; never add the offending file to an allow-list, because the allow-list would be the drift.

**No expected failures remain.** Plan 3 used to state the day shape twice with its own literals — `dueDateValueSchema` in `packages/domain/src/ticket-types.ts` and the engine's `date`-kind check in `packages/rule-engine/src/checks/fields.ts`, both predating Plan 1's `ist-day.ts`. Its 2026-08-20 amendment made both import `IST_DAY_REGEX`; the change is behaviour-preserving and Plan 3's own day tests prove it. So this scan should be clean on the first run, and the rule-engine root above is what keeps the second of those two honest. If you nonetheless see a hit in either file, the amendment did not land in your checkout: **hand it to the orchestrator rather than editing another plan's surface from inside this one**, and leave this task's step unchecked with the reason recorded. Everything in this plan already imports the one regex.

- [ ] **Step 2: Append §11 to `Features.md`**

Append after §10 (Plan 8's section; if the numbering you find differs, take the next free section number and rename the test-cases file and case ids to match — coordination decision 2 makes §11/11.x this plan's default claim):

```markdown
## 11. Calendar, timeline & notifications

- ⚙️ **Day-claim consumption contract** — the Calendar and Timeline read the `startDate` and `dueDate` built-ins (owned by the tickets section — do NOT add a second bullet for the field here) through one shared claim shape `{date, note?}`; a domain pin holds the readers' day regex against the built-in's own schema, and two shared rule-engine fixtures run a built-in day claim end to end in every build. `packages/domain/src/ticket-types.test.ts`, `packages/rule-engine/fixtures/field-set-*-start-date-*.json`
- ✅ **Calendar view** — month grid drawn only from claimed dates: attributed markers ("needed by 30 Aug — Kiro's claim"), start→due bars when both claims exist, undated tickets absent, an all-undated board renders an empty month that says why; month nav + today ring; per-week "+n more" overflow; click opens the ticket. `packages/app-core/src/calendar/`
- ✅ **Custom date fields on Calendar and Timeline** — any custom `date`-kind field renders as a claim on the same honesty terms as the built-ins: attributed to its claimant, absent when unclaimed, and labelled with the field's own name ("Filed on: 30 Aug — Kiro's claim"). Markers only — a bar still requires the startDate + dueDate pair, so no span is ever invented between arbitrary claims. `packages/app-core/src/claims/ticket-dates.ts`, `packages/app-core/src/calendar/`, `packages/app-core/src/timeline/`
- ✅ **Claimed-date-field legend** — one switch per custom date field that actually claimed a day in the visible month, named and counted; hiding is view state, reversible, and never touches what matches. `packages/app-core/src/calendar/CalendarView.tsx`
- ✅ **Timeline view** — week-column Gantt-lite: bars only for tickets with BOTH startDate and dueDate claims; single-claim, undated, and start-after-due work sits in a visible side list with attributed notes (a ticket carrying only custom date claims says "no claimed start or needed-by", not "no claimed dates"); epic grouping; no dependencies, no critical path. `packages/app-core/src/timeline/`
- ✅ **Filters on both views** — FilterSpec (assignee, type, state, category, project, title text) plus an epic lane; in-transit claims render distinctly (`data-pending`) with provenance on hover. `packages/app-core/src/filter/`, `packages/app-core/src/claims/`
- ⚙️ **Notification fan-out** — on committed events: `ticket.assigned` → assignee, structured `@mention` nodes in comments/descriptions → the mentioned, `claim.contested` → the original claimant; canSee-gated so a notification never out-leaks its ticket; idempotent per (user, dedupe key). `apps/server/src/notifications/fanout.ts`
- ⚙️ **Attention sweep** — deterministic, idempotent job: dueDate claims entering the warning window and active states outliving the staleness threshold become inbox rows carrying the claim's provenance verbatim; running twice notifies once, including across midnight. Both windows are the workspace's own settings, resolved once per workspace from `getWorkspaceSettings` — the sweep's "approaching" window is `dueSoonDays` and its staleness threshold is `staleDays`, the same two the attention strip reads, so an admin who moves one moves the board and the inbox together and the sweep holds no threshold of its own. `apps/server/src/notifications/sweep.ts`
- ⚙️ **IST day boundaries everywhere a day is decided** — calendar cell assignment, timeline day columns, the today ring, the sweep's warning horizon and staleness window, and the inbox's "since" all resolve a day through the domain's `istDayOf`/`istDayBounds`; day-vs-instant comparisons are half-open `[startUtc, endUtc)`. Rendered clocks use `IST_TIME_ZONE` from the domain, never a literal and never the device. `packages/app-core/src/claims/`, `apps/server/src/notifications/sweep.ts`, `packages/app-core/src/inbox/format.ts`
- ⚙️ **Notification storage + API** — per-user `notifications` rows (server-owned, NOT ledger events, NOT a projection — replay can never re-invent a nag); `GET /v1/me/notifications` (cursor), unread count, mark-read; strict payload schemas with no field for invented urgency. `apps/server/src/notifications/store.ts`, `apps/server/src/routes/notifications.ts`
- ⚙️ **NotificationTransport seam** — at-least-once per (user, dedupeKey); in-app transport ships here, web push (Plan 10) and native push (Plan 11) implement the same interface. `apps/server/src/notifications/transport.ts`
- ✅ **Inbox** — notification list with per-kind icons, deep links, unread badge, mark-read; headlines are the claims' own attributed wording. `packages/app-core/src/inbox/`, `apps/web/app/inbox/`
- ✅ **Saved filters** — named FilterSpecs stored via `/v1/me/preferences`; applying one is a view act, never a data act. `packages/app-core/src/filters/`
- ⚙️ **Reporting scope guard** — an executable scan keeps velocity/burndown/forecast vocabulary out of every client and server source tree, and keeps the zone string and the day regex to their single origin in the domain. `packages/app-core/test/reporting-scope-guard.test.ts`
```

- [ ] **Step 3: Write `test-cases/11-calendar-notifications.md`**

```markdown
# 11 — Calendar, timeline & notifications

Scope contract for Features.md §11. Status legend: ✅ covered by an automated test · 🧪 manual · ❌ not yet covered · 🚫 consciously out of scope.

## Calendar

- **11.1** ✅ A board of undated tickets renders an empty month with the honesty copy ("undated work is absent, not estimated") — planted defect for invariant 4. (`calendar-model.test.ts`, `CalendarView.test.tsx`)
- **11.2** ✅ Every rendered calendar date exists verbatim among the planted claims — the invented date is impossible. (`calendar-model.test.ts`)
- **11.3** ✅ A single-claim ticket renders as a marker, never a bar. (`calendar-model.test.ts`)
- **11.4** ✅ Start-after-due renders as two attributed markers and no bar — the contradiction is shown, not resolved. (`calendar-model.test.ts`)
- **11.5** ✅ A due marker's label is exactly "needed by 30 Aug — Kiro's claim" (spec §7's example, verbatim). (`claim-labels.test.ts`, `calendar-model.test.ts`)
- **11.6** ✅ A start→due bar renders once per week row it crosses, clamped to the row. (`calendar-model.test.ts`)
- **11.7** ✅ Lane (epic) and assignee filters narrow what renders; filtering is arrangement, not data. (`calendar-model.test.ts`)
- **11.8** ✅ A pending (in-transit) claim stays visibly pending through model and component (`data-pending`). (`calendar-model.test.ts`, `CalendarView.test.tsx`)
- **11.9** ✅ Today wears the ring (`aria-current="date"`), driven by the injected `today` prop. (`CalendarView.test.tsx`)
- **11.10** ✅ Per-week overflow folds to "+n more" and expands/collapses on click. (`CalendarView.test.tsx`)
- **11.11** ✅ Month navigation moves; Today returns to the current month. (`CalendarView.test.tsx`)
- **11.12** ✅ Clicking any marker or bar opens the ticket. (`CalendarView.test.tsx`)

## Timeline

- **11.13** ✅ Due-only and start-only tickets sit in the side list with their attributed claim named — never as bars. (`timeline-model.test.ts`)
- **11.14** ✅ An undated ticket appears in the side list as "no claimed dates" — present as work, absent as geometry. (`timeline-model.test.ts`)
- **11.15** ✅ Start-after-due lands in the side list with the exact contradiction copy. (`timeline-model.test.ts`)
- **11.16** ✅ A both-claims ticket becomes one bar with exact week indices and both-author provenance. (`timeline-model.test.ts`, `TimelineView.test.tsx`)
- **11.17** ✅ Bars reaching outside the window are clipped and flagged; fully out-of-window dated work appears nowhere. (`timeline-model.test.ts`)
- **11.18** ✅ Rows group under epic ancestors; epicless work lands in "No epic", last. (`timeline-model.test.ts`, `TimelineView.test.tsx`)
- **11.19** ✅ The window is Monday-start weeks with W-labels; Earlier/Later shift it and Today returns. (`timeline-model.test.ts`, `TimelineView.test.tsx`)
- **11.20** 🚫 Dependencies / critical path — out of spec by design (spec §7, this plan's scope guard).

## Day claims (the `startDate`/`dueDate` built-ins — owned by the tickets plan, consumed here)

- **11.21** ✅ The day-claim shape the views read is held against the built-in's own schema: one schema serves both day built-ins (a `startDateValue*` export would fail the pin), it accepts exactly the days the domain's single `IST_DAY_REGEX` accepts — the same regex app-core's reader imports, not a copy — and refuses exactly the ones it refuses, carries the optional note through, and stays a day rather than an instant. Guards the readers; the field itself is pinned by the tickets plan. (`ticket-types.test.ts`)
- **11.22** ✅ A built-in day claim runs end to end through the shared fixture runner in every build — a malformed start date refused `field.type-mismatch`, a well-formed `{date, note?}` accepted; both proven to bite by temporarily dropping `startDate` from the engine's merged day branch. (`fixtures/field-set-*start-date*.json`)

## Notification engine

- **11.23** ✅ `ticket.assigned` notifies the assignee with the event's provenance; self-assignment and unassignment tell nobody. (`fanout.test.ts`)
- **11.24** ✅ A target who cannot see the ticket gets nothing — assignment and mention alike; the notification is not a side door (planted defect). (`fanout.test.ts`)
- **11.25** ✅ Mentions notify each structured-mention user except the author, from comments and description edits, with a plain-text excerpt. (`fanout.test.ts`)
- **11.26** ✅ `claim.contested` notifies the original claimant with rule, reason, and their own claim's provenance. (`fanout.test.ts`)
- **11.27** ✅ Delivering the same committed event twice yields one row; a failing transport is logged and isolated. (`fanout.test.ts`)
- **11.28** ✅ The sweep notifies a claim entering the window exactly once — run twice, one row (planted defect); undated, beyond-window, and terminal tickets produce nothing; unassigned dated work notifies the claim's author; stale active states notify the assignee with who-moved-it attribution; unassigned stale work stays with the read-time attention strip. (`sweep.test.ts`)
- **11.29** ✅ Payload schemas are strict — an `urgency`/`severity`/`priority` key cannot exist (planted defect); the kind map is closed over exactly five kinds. (`notifications.test.ts`, `reporting-scope-guard.test.ts`)

## Notification API + inbox

- **11.30** ✅ `GET /v1/me/notifications` pages my rows newest-first by cursor; unread-count counts mine; mark-read is idempotent and someone else's row 404s indistinguishably from missing; all 401 without a session. (`routes/notifications.test.ts`)
- **11.31** ✅ The inbox headline for a date notification is the calendar's exact attributed label; contested bodies are the refusal reason verbatim; per-kind icons; clicking marks read and deep-links. (`format.test.ts`, `InboxView.test.tsx`)
- **11.32** 🧪 Web wiring: `/inbox` renders, badge refreshes, click navigates — dev-server walk-through (Task 14); automated e2e lands with Plan 6's flow suite.

## Saved filters & reporting guard

- **11.33** ✅ Saved filters round-trip through the preferences gateway; malformed stored entries are dropped, never thrown over. (`saved-filters.test.ts`)
- **11.34** ✅ Applying a saved filter is a view act, never a data act — no ingest, no preference write (planted defect for amendment 14). (`SavedFiltersMenu.test.tsx`)
- **11.35** ✅ No client or server source file speaks velocity/burndown/forecast — the executable restatement of "nothing the record does not contain". (`reporting-scope-guard.test.ts`)

## Custom date-kind fields (owner sign-off 2026-08-20 — in v1)

- **11.36** ✅ Planted defect: a claimed custom date field renders with its OWN field name and its OWN author ("Filed on: 30 Aug — Anselma's claim"), marked `custom` and carrying the field id, in the model and on the rendered marker (`data-field-id`). (`claim-labels.test.ts`, `calendar-model.test.ts`, `CalendarView.test.tsx`)
- **11.37** ✅ Planted defect: a custom date field that is DEFINED but unclaimed puts nothing on the calendar — no marker, no legend entry, and an otherwise-undated board still renders the empty-month copy. (`calendar-model.test.ts`)
- **11.38** ✅ No span is invented from a custom date: a custom claim plus a due claim renders two markers and no bar, and a fully dated ticket's bar is unchanged by a custom claim sitting inside it. (`calendar-model.test.ts`, `timeline-model.test.ts`)
- **11.39** ✅ The claimed-date-field legend lists each field by its own name and count, switches its markers off and back on, keeps its own switch while hidden, and is absent entirely when no custom date was claimed. (`calendar-model.test.ts`, `CalendarView.test.tsx`)
- **11.40** ✅ Timeline: custom claims ride the ticket's row and its side-list entry with their attributed labels and join the bar's hover provenance; side-list membership is decided by the startDate/dueDate pair alone and is unchanged by them. (`timeline-model.test.ts`, `TimelineView.test.tsx`)
- **11.41** ✅ A ticket carrying only custom date claims is told what it actually lacks — "no claimed start or needed-by" — while a genuinely bare ticket keeps "no claimed dates" verbatim. (`timeline-model.test.ts`, `TimelineView.test.tsx`)

## IST day boundaries (owner decision 2026-08-20 — time is Asia/Kolkata)

- **11.42** ✅ Planted defect: the sweep's "today" is an IST day. Two runs either side of IST midnight on one UTC date (18:29Z and 18:31Z) notify a claim already inside the window exactly once, while a claim that only enters the window on the next IST day gets its own notification on that day — the warning a UTC-sliced horizon would hold back until 05:30 IST. (`sweep.test.ts`)
- **11.43** ✅ Planted defect: the staleness threshold is a day count in IST, not a millisecond subtraction from the scheduler's clock — a ticket exactly `DEFAULT_STALE_DAYS` IST days into its state is stale, compared half-open against `istDayBounds(...).endUtc`; `isoDatePlusDays` walks days forward and backward with no timezone in it. (`sweep.test.ts`)
- **11.44** ✅ Planted defect: the inbox's "since" is the IST day of the stored instant — `2026-08-01T19:00:00Z` reads as 2 Aug, `18:29:59.999Z` still reads as 1 Aug — and the scope guard proves the zone string and the day regex exist in exactly one source file each, so no view can answer "which day is this?" differently from the domain. (`format.test.ts`, `reporting-scope-guard.test.ts`)

## Attention thresholds (one origin — the workspace's settings)

- **11.45** ✅ The sweep's windows resolve from the workspace's settings and nowhere else: an unclaimed workspace maps to `DEFAULT_DUE_SOON_DAYS`/`DEFAULT_STALE_DAYS` exactly as the attention strip does, and a claimed one maps concept for concept — approaching window ← `dueSoonDays`, staleness threshold ← `staleDays`. No threshold constant exists in the sweep to assert against. (`sweep.test.ts`)
- **11.46** ✅ Planted defect: an admin who narrows `staleDays` makes the sweep nag sooner, and one who widens it goes quiet — the same ticket, the same clock, the threshold read from `proj_workspace_settings` each run. Fails against any private constant in the sweep (the deleted fortnight-long default) and against the settings default applied without reading the claim; this is the two-sources-of-truth defect that let a board flag a ticket stale while the inbox waited another week. (`sweep.test.ts`)
- **11.47** ✅ Planted defect: on a server-wide sweep each workspace keeps its OWN thresholds — two workspaces, the same entry instant, opposite verdicts — and the settings are read exactly once per workspace, never once globally (wrong) and never once per ticket (a per-row query). (`sweep.test.ts`)
```

- [ ] **Step 4: Full verification pass**

```bash
pnpm --filter @gisik-nokma/domain --filter @gisik-nokma/rule-engine --filter @gisik-nokma/app-core test
pnpm --filter @gisik-nokma/server test
pnpm turbo run typecheck
grep -rn "TODO\|TBD\|not implemented" packages/app-core/src apps/server/src/notifications apps/server/src/routes/notifications.ts || echo "clean"
```

Expected: every suite green; typecheck silent; the grep prints `clean`. Do not proceed to the PR while any of these fails.

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/test/reporting-scope-guard.test.ts Features.md test-cases/11-calendar-notifications.md
git commit -m "scope guard + bookkeeping: the no-forecast rule becomes an executable scan, and Features.md/test-cases record what §11 actually is — in the same change set as the work"
```

---

## Open questions

Flagged, never silently resolved. None blocks execution; each names the assumption taken and who reconciles it.

1. **`startDate` is Plan 3's — SETTLED, no longer a touchpoint.** This plan originally proposed adding the field to Plan 3's surfaces; the orchestrator folded that into Plan 3 itself (recorded against Plan 3's contract as its startDate amendment; the label carries no marker in Plan 3's text — Task 1 Step 1's greps are the check that matters), so Plan 3 now ships `BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate']`, a `checkTicketFieldSet` branch merged as `p.fieldId === 'dueDate' || p.fieldId === 'startDate'`, and the failing-test-first pair behind it. Critically, Plan 3 reuses ONE schema — `dueDateValueSchema` — for both day claims, deliberately, so the two shapes cannot drift apart. **Plan 9 defines nothing here and consumes all of it**: Task 1 verifies the built-in landed (and STOPS if it did not), pins the shape its readers assume, and adds the two shared fixtures that run a built-in day claim through the real engine — ground Plan 3's custom-field `field-set-*` fixtures do not cover. No start-date-specific schema or type exists anywhere in this plan, under any name; a start date is a due date's shape wearing a different field id. Nothing left for the orchestrator to reconcile.
2. **`claim.contested` payload shape (Plan 10 reconciliation).** Amendment 16 pins the event ("payload = the original event, rule, reason") but not field names. Taken: `{ originalEvent: { id, type, actorId, clientTime, … }, rule, reason }`, parsed tolerantly (`passthrough`; mismatch → logged, skipped, never thrown). Plan 10 owns the registration; if it spells the payload differently, only `contestedPayloadSchema` in `fanout.ts` adapts.
3. **Route prefix drift: `/v1` vs `/api`.** The amendments pin `/v1/*` (events, stream, preferences, sync, attachments) and this plan follows them (`/v1/me/notifications`); Plan 4 registered its reads under `/api/workspaces/…` and auth under `/api/auth/*`. Taken: amendments win for MY routes; Plan 4's paths are consumed as found. The orchestrator should reconcile the series to one prefix.
4. **Preferences API shape (Plan 5 owns).** Amendment 14 pins rows + `/v1/me/preferences` but not verbs. Assumed by Task 13's consumers: `GET /v1/me/preferences` → `{ preferences: Record<string, unknown> }`, `PUT /v1/me/preferences/:key` body `{ value }`. Isolated behind `PreferencesGateway`, so only Plan 6's implementation adapts.
5. **DataSource query surface (Plans 6/10 own).** Amendment 10 pins `{ ingest, query, subscribe }` but "query: typed read functions" is unspecified. This plan's views therefore take `TicketDatesInput = { state: TicketState; pendingFieldIds }` as props; the mapping from the DataSource's actual query result (assumed something like `query.ticketsForProject(workspaceId, projectId)` returning head states plus pending marks) lives in the mounting shell — one adapter site, documented in `ticket-dates.ts`. If the landed pending shape is per-ticket rather than per-field, the adapter widens it to `pendingFieldIds` (worst case: every field of a pending ticket).
6. **`FilterSpec` ownership.** Guarded creation in `packages/app-core/src/filter/filter-spec.ts` if Plan 6 has not landed one; if both plans execute their guards incorrectly and two definitions exist, reconcile to one module (the shapes are structurally compatible by construction — mine is the spec §7 field list).
7. **`docToPlainText` double-definition risk (Plan 7).** Amendment 12 pins home and signature; both plans carry a create-if-absent guard. Whoever lands second consumes. If both created it (merge race), keep Plan 7's and delete mine — the signature is identical.
8. **`packages/app-core` / `packages/ui` scaffolds (Plan 6 owns the real ones).** Task 8 Step 0 creates minimal scaffolds only if absent, including seed `tokens.ts` values. When Plan 6 lands its scaffold/token set, its values win; any token key this plan added that Plan 6 lacks is carried into Plan 6's `tokens.ts` (one colour origin holds).
9. **Task 14 precondition.** If `apps/web` does not exist when this plan executes, Task 14 is left unchecked and handed to the orchestrator to run after Plan 6 merges. Everything it wires is already tested beneath it.
10. **Sweep windows vs workspace settings — SETTLED (2026-08-20) by unification: the single origin is Plan 5's `workspace.settings_set` claim, projected into `proj_workspace_settings` and read through `getWorkspaceSettings`.** Spec §7 calls the staleness threshold (and by symmetry the warning window) workspace-set, and now it is — once, for both consumers. This plan previously carried its own exported sweep-window constants — a week-long approaching window and a fortnight-long staleness threshold — behind a `SweepDeps.windows` injection seam; that was a second copy of a fact Plan 5 already owned, with a *different* staleness number and no admin able to move it. A board flagging a ticket stale after a week while the sweep waited a fortnight before telling anyone is precisely the defect class this product was founded to remove, so it is removed here rather than deferred:
    - **The mapping, in full:** the sweep's approaching window **is** the workspace's `dueSoonDays`; the sweep's staleness threshold **is** the workspace's `staleDays`. Both are the owner-approved 7/7 by default, applied inside `getWorkspaceSettings` — this plan restates neither number anywhere.
    - **What survives and what is gone.** `SweepWindows` survives as the *resolved* shape, one workspace's settings read into the sweep's vocabulary by `resolveSweepWindows(db, workspaceId)`. The exported default pair is gone, and so is `SweepDeps.windows` — deliberately, because an override parameter is a second way to set the number and therefore a second number. Tests that need particular windows claim them with a `workspace.settings_set` event through Plan 5's `applyCommitted`, the same mechanism Plan 5's own attention tests use, so neither suite can pass against a path the other does not exercise.
    - **Per workspace, once.** The sweep is server-wide; settings are per workspace. It enumerates the workspaces holding tickets, resolves each one's windows exactly once, and runs that workspace's scoped queries — never per row (a query per ticket for a value that cannot change mid-run) and never once globally (one workspace's thresholds silently applied to every other). Cases 11.45–11.47 hold all of this, 11.46 being the planted defect that fails against the deleted constants.
    - **The day boundary was the other half of the same reconciliation, and it is closed too:** both sides count IST days through Plan 1's `istDayOf`/`istDayBounds`, compared half-open (Task 6 here; Plan 5's Task 12 there, with its own boundary defects). Same numbers, same helpers, same origin — the strip and the inbox can no longer disagree about a ticket on the same afternoon.
    - **Nothing outstanding for the orchestrator.** No Plan 5 change was required: its settings already carry both concepts the sweep needs. The one behaviour change is the sanctioned one — staleness moves from this plan's deleted private fortnight to the workspace's `staleDays` (`DEFAULT_STALE_DAYS` until an admin claims otherwise).
11. **Notification rows are not retroactively redacted.** A stored notification keeps its `ticketTitle` even if visibility is later revoked (the deep link then 404s via `canSee`). A point-in-time message honestly reflects what the recipient was entitled to see when it was sent; scrubbing history-of-messages is an owner decision, not assumed here.
12. **Silent mention-gate.** A mention of a user who cannot see the ticket produces nothing, and the mentioner is not told. Honest (no leak, no invented delivery), but the editor could warn at mention time — a Plan 6/7 UX consideration, flagged.
13. **Fixture-schema drift (two axes).** (a) Plan 2's `fixtureSchema` says `workflowDefs` (array); Plan 3's runner snippet used singular. (b) Plan 2's `expected` union spells refusals as `{refused, rule, reason}` or `{refused, rule, reasonStartsWith}`, yet Plan 3 ships `parent-terminal-with-open-children.json` naming the `rule` alone — so either the landed schema grew a rule-only branch or Plan 3's fixture needs a reason. Task 1 Step 5 carries a guard for both, and names the literal reason to add if the schema demands one. Reconciliation is Plans 2/3's; this plan only matches what it finds.
14. **Test-helper drift (Plans 1/3/4).** `createTestDatabase` vs `testPool`/`wipe` vs `migrateTestDb`/`truncateAll` — this plan's server tests assume Plan 1's `createTestDatabase` (per-suite database; also sidesteps the append-only events table's truncate guard) with a locate-first guard. Reconciliation may standardise; adapt imports only.
15. **Custom `date`-kind fields on Calendar/Timeline — SETTLED (owner sign-off 2026-08-20): IN v1.** This was flagged as a v2 candidate on the reading that spec §7's "claimed dates" *arguably* includes custom date fields; the owner ruled that it does, and they are now in scope. They render on exactly the honesty terms the built-ins do: attributed to their claimant with that claim's own timestamps, never estimated, absent when unclaimed, and labelled with **the field's own name** — `"Filed on: 30 Aug — Kiro's claim"`, never a generic word, because the name is the only thing that says what the day means. Three limits are pinned in the code rather than left to judgement: **(a) no span is ever drawn from a custom date** — a bar still requires the `startDate` + `dueDate` pair, since pairing arbitrary claims would invent a duration nobody claimed (Task 8's model collects custom claims before, and independently of, the pairing branch, so no code path can reach one); **(b) the timeline's side-list membership is unchanged** — it is decided by that pair alone, and only the *wording* narrows (`NO_DAY_CLAIMS_NOTE` instead of `NO_DATES_NOTE`) when a ticket does carry custom claims, because telling it that it has "no claimed dates" would be false; **(c) a custom date claim carries no note** (Plan 3 accepts a bare `'YYYY-MM-DD'` for `type: 'date'`), so the tooltip is the label and nothing is invented to fill the gap. Readability, where a workspace defines many date fields, is a calendar legend of per-field switches — pure view state, sourced from claims that exist, justified in full in Task 9. Cases 11.36–11.41 cover it, including the two planted defects the sign-off named. The one thing this does NOT change: no date field, custom or built-in, feeds the attention sweep — Task 6 still watches `dueDate` alone, because a sweep over arbitrary fields would nag about days nobody asked to be reminded of.
16. **`stateName` in stale notifications resolves via the LATEST workflow version** (`getWorkflowDefFromProjection` without a version). A renamed state shows its current name; the `stateId` always travels alongside. Pinning the version the ticket actually sits on would need `workflowVersion` in `proj_tickets` — not added here.

17. **Where a day starts — SETTLED (owner decision 2026-08-20): IST midnight, and this plan uses Plan 1's helpers rather than any of its own.** This was previously undefined across the series, and this is the plan it would have bitten hardest: "which cell does this claim fall in", "due today", "overdue", which week column a bar starts in, and what a notification sweep means by *today* are all the same question. It is answered once, in `packages/domain/src/ist-day.ts` (Plan 1 Task 4a), and consumed here:
    - **Calendar cells and timeline columns.** The grid arithmetic (`monthGridWeeks`, `addDays`, `mondayOnOrBefore`, `dateMs`/`isoDate`) is unchanged and stays unchanged: it is day-string calendar arithmetic — `YYYY-MM-DD` in, `YYYY-MM-DD` out — with no instant anywhere in it and therefore no timezone question to answer. What changed is the *entry point*: the `today`/`anchor` props are `istDayOf(new Date().toISOString())`, computed by the mounting shell, never a device-local or UTC-sliced day. This is a reconciliation, not a replacement — the two kinds of date code were doing different jobs and now say so in their doc comments.
    - **The day shape.** `IST_DAY_REGEX` replaces the three local `/^\d{4}-\d{2}-\d{2}$/` literals this plan used to declare (Task 1's pin, Task 3's `notifications.ts`, Task 8's `ticket-dates.ts`). The reason the app-core copy existed — "app-core does not depend on zod" — was never a reason not to import the regex: `ist-day.ts` is **dependency-free**, which is exactly why Plan 1 wrote it that way, and why Plan 10's offline replica can import the same file.
    - **The sweep.** `istDayOf` for the warning horizon, `istDayBounds` half-open for the staleness cut-off, with planted defects for both (cases 11.42, 11.43). This is the one place the decision changes *behaviour* rather than provenance.
    - **Rendering.** Every clock a view shows formats with `IST_TIME_ZONE` imported from the domain; the inbox's `enteredAt` goes through `istDayOf`. An executable scan in Task 15 keeps the zone string and the day regex to one file each.
    - **The three items this question carried to the orchestrator are all discharged (2026-08-20); nothing about the day boundary is outstanding.** (a) Plan 3's day regex is now a shared import, in both places it was declared — `dueDateValueSchema` in `packages/domain/src/ticket-types.ts` and the engine's `date`-kind check in `packages/rule-engine/src/checks/fields.ts` both `import { IST_DAY_REGEX }` rather than restating the literal, and Task 15's scan now walks `packages/rule-engine/src` so the second one cannot quietly come back. (b) Plan 6's shell wires the decision: `istToday()` in `apps/web/src/ist-today.ts` is the one place the client turns the device's instant into a day, it feeds the `today` prop of both views (its Task 14 Steps 5a/5b), and every instant it shows a person goes through the domain's `formatIstInstant` with `IST_CLOCK_NOTE` naming the clock. (c) Plan 5's attention endpoint counts the same days this plan's sweep does — `istDayOf`/`istDayBounds`, compared half-open, with the boundary cases pinned as planted defects — so the strip and the inbox can no longer disagree about a ticket on the same afternoon.
    - The one thing this question used to carry forward — the attention windows' *values* having two sources — is closed as well, though not here: Open questions 10 now records the unification, with this plan's private defaults deleted and both windows read from Plan 5's workspace settings. **Question 17 itself is settled, and so is the value question it pointed at.**

## Self-review (writing-plans skill checklist)

**1. Spec coverage (§7 Calendar/Timeline, notifications, reporting + invariant 4):**
- "bars and markers drawn only from claimed dates" → Tasks 8/10 models; planted defects 11.1–11.4, 11.13–11.15.
- "An undated ticket is absent" → calendar: absent + empty-month copy (11.1); timeline: side list, never geometry (11.14).
- "a date renders attributed ('needed by 30 Aug — Kiro's claim')" → the exact string is pinned three times: `claim-labels.test.ts`, `calendar-model.test.ts`, inbox `format.test.ts`.
- "nothing estimates, extrapolates or back-fills" → no model code path fabricates a date (verbatim-claims planted defect 11.2); start-after-due shown, not resolved; Task 15's vocabulary scan.
- Notifications ("assignment, @mention, contested claim, attention events — push on the apps, inbox everywhere") → Tasks 3–7 + 12/14; push transports are the seam (Plans 10/11), inbox ships here.
- §7's workspace-set attention thresholds → Task 6 reads both from Plan 5's `workspace.settings_set` claim via `getWorkspaceSettings` (approaching ← `dueSoonDays`, staleness ← `staleDays`), resolved once per workspace; this plan declares no threshold constant, so the sweep and the attention strip cannot disagree about the same ticket (Open questions 10; planted defects 11.46/11.47).
- Reporting v1 ("derived counts and the ledger… nothing the record does not contain") → Task 15 guard; no reporting surface added anywhere in this plan.
- Invariant 4 planted defects demanded by the assignment — undated absent, invented date impossible, attributed label exact — are cases 11.1, 11.2, 11.5; sweep idempotence is 11.28.
- §7 saved filters → Task 13; per-user, view-act-only proven (11.34).
- Custom `date`-kind fields render as claims on both views (owner sign-off 2026-08-20, Open questions 15) → Tasks 8–11; the field's own name is pinned in `claim-labels.test.ts` and asserted through model and component; planted defects 11.36 (own name + own author) and 11.37 (unclaimed ⇒ nothing). The bar rule survives intact: 11.38 proves no span is invented between a custom date and a built-in day claim.
- Gaps consciously out: velocity/burndown/forecast (guarded), dependencies/critical path (11.20), drag-to-reschedule, push delivery (Plans 10/11). Custom date fields moved OUT of this list on the owner's sign-off; the attention sweep still watches `dueDate` alone, deliberately (Open questions 15).
- Owner decision "time is Asia/Kolkata" (Open questions 17) → Global Constraints' TIME bullet, then Tasks 1/3/8 (one day regex), 6 (IST horizon + half-open staleness window, planted defects 11.42/11.43), 9/10/11 (IST `today`/`anchor`), 12 (IST `enteredAt`, planted defect 11.44), 15 (single-origin scan). No surface in this plan decides a day for itself.

**2. Placeholder scan:** no TBD/TODO/"implement later"/"add validation"/"similar to Task N" anywhere; every code step carries the actual code; every test step carries the actual tests; the two guarded creations (`docToPlainText`, scaffolds) carry full content for the create branch and an exact consume instruction for the other. Task 14 is thin by design and says why, with concrete verification steps.

**3. Type consistency (checked across tasks):** `Notification` shape identical in Tasks 3/4/5/6/7/12/14; dedupe-key grammar identical in Tasks 5/6 (`assignment:` / `mention:` / `contested-claim:` / `date-approaching:` / `stale-ticket:`); `NotificationTransport.deliver(userId, notification)` identical in 5/6; `TicketDatesInput`/`DateClaimView` identical in 8/9/10/11; `FilterSpec` consumed from one module in 8/9/10/13; `dueClaimLabel` defined once (Task 8) and consumed in 8/10/12; `insertNotification(db, notification)` identical in 4/5(transport)/7(test seeding); `CanSeeFn` defined in Task 5, reused in Task 6; `SweepWindows` (Task 6) is a *resolved* shape only — its two values are `WorkspaceSettings.dueSoonDays`/`.staleDays` read through Plan 5's `getWorkspaceSettings(db, workspaceId)`, mapped in the single function `resolveSweepWindows`, so no threshold constant, default, or injection parameter exists anywhere in this plan under any name (both the old exported default pair and `SweepDeps.windows` are deliberately absent); `NO_DATES_NOTE`, `CALENDAR_EMPTY_MONTH_COPY`, `TIMELINE_SIDE_LIST_COPY` defined once, asserted where consumed. Route paths in Task 14's gateway match Task 7's registrations verbatim. Day claims: `startDate` and `dueDate` are validated and typed by Plan 3's single `dueDateValueSchema`/`DueDateValue` everywhere this plan names them (Task 1 pins it; Tasks 8–11 read the shape through `dateClaimOf`) — this plan adds no second day schema under any name. Custom `date`-kind fields are a *different* shape by Plan 3's own design (a bare `'YYYY-MM-DD'` string, validated by `customFieldVerdict`'s `date` branch, no note); this plan defines no schema for them either — `customDateClaimsOf` is a reader that skips anything not matching the same `DATE_ONLY` regex, and `CustomDateClaimView`/`customClaimLabel` are defined once in Task 8 and consumed verbatim by 9/10/11. Ledger writes: the only direct `INSERT INTO events` in this plan (Task 6's `seedEnteredState`) carries Plan 1's full thirteen-column list including `workspace_seq`, and both its time columns take ISO 8601 `Z` instants (both columns are `timestamptz` since Plan 1 Task 6 — a text `client_time` is gone, so a readback is Z-normalised); the only `ORDER BY seq` (Task 6's stale LATERAL) is per-entity history, not a workspace cursor, and says so in place. Time: `IST_DAY_REGEX` is the only day-shape statement anywhere in this plan (Tasks 1, 3, 8 all import it; Task 15 scans for a second copy), `istDayOf` is the only instant→day conversion (Task 6's `todayIst`, Task 12's `enteredAt`, and the `today`/`anchor` props the shells compute), `istDayBounds` appears once (Task 6's staleness cut-off, half-open with a strict `<`), and `IST_TIME_ZONE` is the only origin of the zone string — no view code writes `'Asia/Kolkata'`. `isoDatePlusDays` (Task 6, server) and `addDays` (Task 8, app-core) are deliberately separate day-arithmetic helpers in separate packages — the server never imports app-core — and both are day-in/day-out with identical semantics, pinned by tests on each side.







# Calendar, Timeline & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Time-honest views (month Calendar, week-column Timeline) drawn only from claimed dates, plus a server-side notification engine (assignment, @mention, contested claim, attention transitions) with per-user storage, an inbox everywhere, saved filters, and a reporting scope guard — nothing invented, everything attributed.

**Architecture:** Client side, two pure view-models in `packages/app-core` fold `TicketState` date claims (`startDate`/`dueDate` `FieldClaim`s) into calendar weeks and timeline bars — a bar exists only when both claims exist; everything else is a marker or a side-list entry, never invented geometry. Server side, a fan-out listener on Plan 1's `onEventCommitted` hook plus a deterministic, idempotent sweep job write per-user rows into a `notifications` table (server-owned rows, NOT ledger events — a notification is a message to a person, not a fact about the work), delivered through a `NotificationTransport` seam whose only v1 implementation is in-app. A small additive change registers `startDate` beside Plan 3's built-in fields so a Timeline bar can have a claimed start.

**Tech Stack:** TypeScript strict / Node 22 / pnpm 9 / Turborepo; Fastify 5 + Postgres 16 (`pg`, node-pg-migrate) on the server; zod validation; `ulidx` ids; React 18 function components in `packages/app-core` (tested with Vitest + jsdom + @testing-library/react); Next.js 15 shell (`apps/web`, Plan 6's) for web wiring.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — §7 (Views: Calendar and Timeline; Reporting and notifications; Search and filtering), honesty invariant 4 ("Nothing is invented"), invariant 1 (provenance floor). Series contract: `docs/superpowers/plans/2026-08-20-00-series-coordination.md` (amendments 9–17 bind this plan). Precedent: `reference/design-docs/2026-08-19-tracker-calendar-design.md` (read-only) — the base calendar's "dated items only / an undated item is absent, not estimated" discipline, generalised here.

**Series position:** Plan 9 of 11. Runs after Plans 1–5, in parallel with Plans 6/7/8. **Consumes** — from Plan 1: `EventEnvelope`, `SubmittedEvent`, `newUlid`, `IngestService.onEventCommitted(listener): () => void` (fires only after a live commit, never on projection rebuild — which is exactly why notifications built on it can never double on replay), `createTestDatabase()`. From Plan 2: `WorkflowDef` (with `initialStateId`, amendment 3; optional `blocked` on states, amendment 9), `StateCategory`, `getWorkflowDefFromProjection(db, workflowId, version?)`, the fixture harness in `packages/rule-engine/src/fixtures/harness.ts`. From Plan 3: `BUILTIN_FIELD_IDS`, `dueDateValueSchema`, `TicketState`, `FieldClaim`, `applyTicketEvent`, `makeEnvelope`, `checkTicketFieldSet` + `refuse`/`fieldKindRefusal`, `getTicketStateFromDb(db, workspaceId, ticketId)`, the `proj_tickets` table. From Plan 4: `Queryable`, `canSee(db, userId, ticketId)`, `Auth`/`createAuth`, `makeRequireSession`, `registerAuthRoutes`, `signInWithPhone`, `LogOtpSender`. From the amendments (Plans 5/6/7/10 written in parallel — pinned shapes, assumptions flagged in Open questions): `DataSource` (am. 10), `packages/ui` tokens (am. 11), the mention node `{userId}` and `docToPlainText` (am. 12), `/v1/me/preferences` (am. 14), `claim.contested` (am. 16). **Produces** (exact signatures in task Interfaces blocks): the `startDate` built-in field; `extractMentionedUserIds`; the notification vocabulary (`NotificationKind`, strict payload schemas, `Notification`); the `notifications` table + store; `NotificationTransport` + `createInAppTransport`; `createNotificationFanout`; `runNotificationSweep`; `GET /v1/me/notifications`, `GET /v1/me/notifications/unread-count`, `POST /v1/me/notifications/:id/read`; `CalendarView`, `TimelineView`, `InboxView`, `UnreadBadge`, `SavedFiltersMenu` and their pure view-models.

## Global Constraints

Copied from the series contract and the spec; every task's requirements implicitly include this section.

- MONOREPO: pnpm workspaces + Turborepo, TypeScript strict, Node 22 LTS (`>=22.0.0 <23`), pnpm 9. Package scope is `@gisik-nokma/*` (coordination decision 1).
- TESTING: Vitest. Every honesty guarantee is proven against a planted defect before it is trusted (spec invariant 6).
- IDS: ULID via `ulidx`.
- EVENT ENVELOPE (exact, from `@gisik-nokma/domain`): `{ id, workspaceId, entity: { kind: 'workspace'|'project'|'ticket'|'workflow'|'ticket-type'|'membership', id }, type, version, payload, actorId, origin: 'web'|'mobile'|'desktop'|'server', clientTime, serverTime, seq }`.
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
  src/ticket-types.ts               # MODIFY (Plan 3's) — BUILTIN_FIELD_IDS gains 'startDate'; startDateValueSchema
  src/doc-text.ts                   # NEW (GUARDED — skip if Plan 7 landed it) — docToPlainText (amendment 12)
  src/doc-mentions.ts               # NEW — extractMentionedUserIds JSON-walker
  src/notifications.ts              # NEW — NotificationKind, strict payload schemas, Notification, parseNotification
  src/index.ts                      # MODIFY — re-export the new modules
  src/ticket-types.test.ts          # MODIFY (Plan 3's) — extend the BUILTIN_FIELD_IDS pin; startDate schema tests
  src/doc-text.test.ts              # NEW (guarded with doc-text.ts)
  src/doc-mentions.test.ts          # NEW
  src/notifications.test.ts         # NEW

packages/rule-engine/
  src/checks/fields.ts              # MODIFY (Plan 3's) — startDate branch beside dueDate
  src/checks/fields.test.ts         # MODIFY — startDate accept/refuse/clear tests
  fixtures/field-set-refuses-a-malformed-start-date.json   # NEW — planted defect
  fixtures/field-set-accepts-a-start-date-claim.json       # NEW — accepting twin

apps/server/
  migrations/<timestamp>_notifications.sql                 # NEW — notifications table
  src/notifications/store.ts        # NEW — insert (dedupe), list (cursor), markRead, unreadCount
  src/notifications/transport.ts    # NEW — NotificationTransport, createInAppTransport, deliverToAll
  src/notifications/fanout.ts       # NEW — createNotificationFanout (assignment/mention/contested)
  src/notifications/sweep.ts        # NEW — runNotificationSweep (date-approaching, stale-ticket)
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

**Out of scope, stated so nobody adds it:** timeline dependencies/critical-path (not in spec); drag-to-reschedule (the page renders; events author — the base's split, kept); custom `date`-kind fields on the Calendar/Timeline (dueDate/startDate only in v1 — flagged in Open questions); velocity/burndown/forecast anywhere (spec Out of scope, guarded by Task 15's scan); web push and native push transports (Plans 10/11 — the seam ships here); notification e-mail digests.

---

### Task 1: `startDate` joins the built-in field vocabulary

A Timeline bar needs a start, and invariant 4 forbids inventing one (back-filling "start = due minus a guess" is exactly the estimated date the spec bans). So the start becomes what the due already is: a claim — `{date, note?}` set via `ticket.field_set`, carrying per-field `FieldClaim` provenance like every other field. This is an additive touch on two Plan 3 surfaces (`BUILTIN_FIELD_IDS`, `checkTicketFieldSet`) — flagged in Open questions as a Plan 3 touchpoint for the orchestrator.

**Files:**
- Modify: `packages/domain/src/ticket-types.ts` (Plan 3's — `BUILTIN_FIELD_IDS`, add `startDateValueSchema`)
- Modify: `packages/domain/src/ticket-types.test.ts` (Plan 3's pin of the old list — extend it)
- Modify: `packages/rule-engine/src/checks/fields.ts` (Plan 3's — `startDate` branch beside `dueDate`)
- Modify: `packages/rule-engine/src/checks/fields.test.ts`
- Create: `packages/rule-engine/fixtures/field-set-refuses-a-malformed-start-date.json`
- Create: `packages/rule-engine/fixtures/field-set-accepts-a-start-date-claim.json`

**Interfaces:**
- Consumes: `BUILTIN_FIELD_IDS`, `dueDateValueSchema` (Plan 3, `@gisik-nokma/domain`); `checkTicketFieldSet`, `refuse`, `fieldKindRefusal`, `ACCEPT` (Plan 3, `packages/rule-engine/src/checks/`); the fixture harness (Plan 2, `packages/rule-engine/src/fixtures/harness.ts`).
- Produces (cross-plan API):
  - `BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate'] as const` — the shadow guard in `ticketTypeDefSchema` now also refuses custom fields named `startDate`, for free.
  - `startDateValueSchema` — `{ date: 'YYYY-MM-DD', note?: string }` — and `type StartDateValue`.
  - `checkTicketFieldSet` accepts/refuses `startDate` values exactly as it does `dueDate` (`null` clears; malformed refuses `field.type-mismatch` naming "Start date").
  - Two shared fixtures every build's fixture runner executes.

- [ ] **Step 1: Extend the failing domain tests**

In `packages/domain/src/ticket-types.test.ts` (Plan 3 colocates tests in `src/`; if by execution time they live under `test/`, edit the file there — `ls packages/domain/src/*.test.ts packages/domain/test/*.test.ts` to locate), change Plan 3's pin of the built-in list and add the schema suite:

```ts
// CHANGE the existing assertion (Plan 3 pinned the pre-startDate list):
expect(BUILTIN_FIELD_IDS).toEqual(['title', 'description', 'dueDate', 'startDate']);
```

Append to the same file:

```ts
describe('startDateValueSchema', () => {
  it('accepts a bare day', () => {
    expect(startDateValueSchema.parse({ date: '2026-09-01' })).toEqual({ date: '2026-09-01' });
  });

  it('accepts a day with a note — the claim can say why', () => {
    expect(startDateValueSchema.parse({ date: '2026-09-01', note: 'after the bank account opens' })).toEqual({
      date: '2026-09-01',
      note: 'after the bank account opens',
    });
  });

  it('refuses a datetime — a start is a day someone claimed, not a timestamp', () => {
    expect(() => startDateValueSchema.parse({ date: '2026-09-01T10:00:00Z' })).toThrow();
  });

  it('refuses a bare string — the claim shape is {date, note?}', () => {
    expect(() => startDateValueSchema.parse('2026-09-01')).toThrow();
  });
});

describe('startDate is shadow-guarded like every built-in', () => {
  it('refuses a custom field named startDate', () => {
    const base = { id: 'errand', name: 'Errand', icon: 'cart', rank: 3, workflowId: 'wf_1' };
    expect(() =>
      ticketTypeDefSchema.parse({ ...base, fields: [{ id: 'startDate', name: 'Start', type: 'date' }] }),
    ).toThrow(/shadows a built-in field/);
  });
});
```

Add `startDateValueSchema` and `ticketTypeDefSchema` to the file's existing import from `./ticket-types`.

- [ ] **Step 2: Run the domain tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-types.test.ts`
Expected: FAIL — `startDateValueSchema` is not exported, and the `BUILTIN_FIELD_IDS` assertion fails against the three-element list.

- [ ] **Step 3: Implement the domain change**

In `packages/domain/src/ticket-types.ts`, change the constant and append the schema after `dueDateValueSchema`:

```ts
export const BUILTIN_FIELD_IDS = ['title', 'description', 'dueDate', 'startDate'] as const;
```

```ts
/**
 * A start date is a claim exactly like a due date: { date, note? }, rendered
 * with its author. It exists so a Timeline bar can have a claimed start —
 * a bar's start is never derived, estimated, or back-filled (invariant 4).
 */
export const startDateValueSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a start date is a day in YYYY-MM-DD form'),
  note: z.string().optional(),
});
export type StartDateValue = z.infer<typeof startDateValueSchema>;
```

`BuiltinFieldId` widens automatically. If `packages/domain/src/index.ts` re-exports `ticket-types` selectively rather than with `export *`, add `startDateValueSchema` and `StartDateValue` to the export list.

- [ ] **Step 4: Run the domain tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing engine tests**

Append to `packages/rule-engine/src/checks/fields.test.ts` (inside the existing describe block, reusing its `fieldSet`/`ctx` helpers — read the file first and match their exact call shape):

```ts
it('accepts a start-date claim with a note', async () => {
  expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01', note: 'after the bank account opens' }), ctx())).toEqual({ refused: false });
});

it('accepts clearing a start date — an attributed un-claim', async () => {
  expect(await checkTicketFieldSet(fieldSet('startDate', null), ctx())).toEqual({ refused: false });
});

it('refuses a malformed start date with the field named', async () => {
  expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01T10:00:00Z' }), ctx())).toEqual(
    refuse('field.type-mismatch', fieldKindRefusal('Start date', 'a day in YYYY-MM-DD form (a note is optional)')),
  );
});

it('refuses a bare-string start date — the claim shape is {date, note?}', async () => {
  expect(await checkTicketFieldSet(fieldSet('startDate', '2026-09-01'), ctx())).toEqual(
    refuse('field.type-mismatch', fieldKindRefusal('Start date', 'a day in YYYY-MM-DD form (a note is optional)')),
  );
});
```

Add `refuse` and `fieldKindRefusal` to the test file's imports from `./refusals` if not already imported.

- [ ] **Step 6: Run the engine tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/fields.test.ts`
Expected: FAIL — with no `startDate` branch, the value falls through to the custom-field lookup and refuses `field.unknown` (or Plan 3's equivalent), not the expected verdicts.

- [ ] **Step 7: Implement the engine branch**

In `packages/rule-engine/src/checks/fields.ts`, add `startDateValueSchema` to the `@gisik-nokma/domain` import, and insert directly after the `dueDate` branch of `checkTicketFieldSet`:

```ts
  if (p.fieldId === 'startDate') {
    if (value === null) return ACCEPT;
    return startDateValueSchema.safeParse(value).success
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal('Start date', 'a day in YYYY-MM-DD form (a note is optional)'));
  }
```

- [ ] **Step 8: Run the engine tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/fields.test.ts`
Expected: PASS.

- [ ] **Step 9: Add the shared planted-defect fixtures**

**Guard:** open `packages/rule-engine/src/fixtures/harness.ts` and check `fixtureSchema`'s key for workflow definitions (Plan 2 defined `workflowDefs` as an array; Plan 3's runner snippet said `workflowDef` singular — mid-reconciliation). The JSON below uses `workflowDefs`; if the landed schema says otherwise, rename the key, nothing else.

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

(The `reason` string is owned by Plan 3's `fieldKindRefusal`; per Plan 3's comparison discipline a fixture names the literal reason only when its plan owns the string, so this one pins the `rule` alone — the exact reason is already pinned by Step 5's Vitest test.)

`packages/rule-engine/fixtures/field-set-accepts-a-start-date-claim.json` — identical `workflowDefs` and `priorEvents`, then:

```json
  "candidateEvent": {
    "type": "ticket.field_set",
    "entity": { "kind": "ticket", "id": "t1" },
    "actorId": "user_a",
    "payload": { "fieldId": "startDate", "value": { "date": "2026-09-01", "note": "after the bank account opens" } }
  },
  "expected": { "refused": false }
```

with `"name": "a start date is a claim like a due date — {date, note?} accepted"`.

- [ ] **Step 10: Run the fixture runner to verify the new fixtures execute and pass**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts`
Expected: PASS, fixture count up by 2 (the runner iterates every `fixtures/*.json`; if it pins an exact count, bump it).

- [ ] **Step 11: Run both packages' full suites and typecheck**

Run: `pnpm --filter @gisik-nokma/domain --filter @gisik-nokma/rule-engine test && pnpm --filter @gisik-nokma/domain --filter @gisik-nokma/rule-engine typecheck`
Expected: PASS — nothing outside the two touched surfaces changes behavior.

- [ ] **Step 12: Commit**

```bash
git add packages/domain/src/ticket-types.ts packages/domain/src/ticket-types.test.ts packages/rule-engine/src/checks/fields.ts packages/rule-engine/src/checks/fields.test.ts packages/rule-engine/fixtures/field-set-refuses-a-malformed-start-date.json packages/rule-engine/fixtures/field-set-accepts-a-start-date-claim.json
git commit -m "startDate joins the built-in fields: a timeline bar needs a start, and a start is a claim someone makes — never a value the system back-fills"
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

/**
 * Notifications are server-owned per-user rows, NOT ledger events (series
 * amendment 14's reasoning, applied): a notification is a message to a
 * person; the fact it points at stays in the ledger. Every payload is
 * .strict() — it carries the originating claim's provenance verbatim and
 * has no field where invented urgency could live.
 */
export const NOTIFICATION_KINDS = ['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const nonEmpty = z.string().min(1);

/** A date claim's provenance — the FieldClaim flattened, never summarised. */
export const dateClaimProvenanceSchema = z
  .object({
    date: z.string().regex(DATE_ONLY, 'a claimed date is a day in YYYY-MM-DD form'),
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

**Files:**
- Create: `apps/server/src/notifications/sweep.ts`
- Create: `apps/server/src/tools/sweep-notifications.ts`
- Modify: `apps/server/package.json` (script)
- Create: `apps/server/test/notifications/sweep.test.ts`

**Interfaces:**
- Consumes: `proj_tickets` (Plan 3), the `events` table (Plan 1), `getWorkflowDefFromProjection` (Plan 2, `apps/server/src/projections/workflows.ts`), `deliverToAll`/`NotificationTransport`/`CanSeeFn` (Task 5), `newUlid`/`Notification` (`@gisik-nokma/domain`).
- Produces (Plan 11 schedules the CLI; Plan 5's attention endpoint shares the windows type — Open questions):
  - `type SweepWindows = { approachingWindowDays: number; stalenessThresholdDays: number }`
  - `DEFAULT_SWEEP_WINDOWS: SweepWindows = { approachingWindowDays: 7, stalenessThresholdDays: 14 }`
  - `type SweepDeps = { pool: Pool; transports: NotificationTransport[]; windows?: SweepWindows; canSeeTicket?: CanSeeFn; now?: () => Date; log?: (message: string, error?: unknown) => void }`
  - `type SweepReport = { dueCandidates: number; staleCandidates: number; delivered: number }` (operational logging only — idempotence is proven by row counts, not by the report)
  - `runNotificationSweep(deps: SweepDeps): Promise<SweepReport>`
  - Dedupe-key grammar (exact): `date-approaching:<ticketId>:<claimedDate>` · `stale-ticket:<ticketId>:<stateId>:<enteredAtIso>`
  - `isoDatePlusDays(isoDay: string, days: number): string`
  - CLI: `pnpm --filter @gisik-nokma/server run sweep:notifications` — reads `DATABASE_URL`, prints the report, exit 0; scheduling is Plan 11's concern.
  - Targeting rules (exact): date-approaching goes to the assignee, or to the claim's author when unassigned (the person who made the claim owns the caring); stale-ticket goes to the assignee only — an unassigned stale ticket is the read-time attention strip's job, not a nag with no addressee. Terminal tickets never notify (done work has no approaching deadline). Both targets pass the `canSee` gate.

- [ ] **Step 1: Write the failing sweep tests**

`apps/server/test/notifications/sweep.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SWEEP_WINDOWS, isoDatePlusDays, runNotificationSweep } from '../../src/notifications/sweep.js';
import { createInAppTransport } from '../../src/notifications/transport.js';
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
const KIRO = '01J9GUKR000000000000000000';
const ANSELMA = '01J9GUAN000000000000000000';

/** Frozen clock: 23 Aug 2026, 05:00 UTC. Window of 7 days reaches 30 Aug. */
const NOW = () => new Date('2026-08-23T05:00:00.000Z');

const seeEverything = async () => true;

function sweep() {
  return runNotificationSweep({
    pool: db.pool,
    transports: [createInAppTransport(db.pool)],
    canSeeTicket: seeEverything as never,
    now: NOW,
    log: () => {},
  });
}

type SeedTicket = {
  ticketId: string;
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
    [t.ticketId, WS, PROJECT, t.stateId ?? 'doing', t.stateCategory ?? 'active', t.assigneeId ?? null, JSON.stringify(fields)],
  );
}

let seq = 0;

/** Append a state-entering event straight into the ledger (append-only: inserts are legal). */
async function seedEnteredState(ticketId: string, serverTime: string, actorId: string): Promise<void> {
  seq += 1;
  const id = `01J9GEVT00000000000000${String(seq).padStart(4, '0')}`.slice(0, 26);
  await db.pool.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq)
     VALUES ($1, $2, 'ticket', $3, 'ticket.transitioned', 1, $4, $5, 'web', $6, $7, $8)`,
    [id, WS, ticketId, JSON.stringify({ toStateId: 'doing' }), actorId, serverTime, serverTime, seq],
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
  await db.pool.query('DELETE FROM notifications');
  await db.pool.query('DELETE FROM proj_tickets');
});

describe('isoDatePlusDays', () => {
  it('adds across month boundaries', () => {
    expect(isoDatePlusDays('2026-08-23', 7)).toBe('2026-08-30');
    expect(isoDatePlusDays('2026-08-30', 7)).toBe('2026-09-06');
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
    await seedEnteredState(ticketId, '2026-08-01T09:00:00.000Z', KIRO); // 22 days before NOW > 14-day threshold
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

describe('defaults', () => {
  it('the default windows are 7 days approaching, 14 days staleness', () => {
    expect(DEFAULT_SWEEP_WINDOWS).toEqual({ approachingWindowDays: 7, stalenessThresholdDays: 14 });
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
import { dateClaimProvenanceSchema, newUlid, type Notification } from '@gisik-nokma/domain';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';
import { canSee } from '../visibility/can-see.js';
import { deliverToAll, type NotificationTransport } from './transport.js';
import type { CanSeeFn } from './fanout.js';

export type SweepWindows = { approachingWindowDays: number; stalenessThresholdDays: number };

/**
 * Spec §7 calls both thresholds workspace-set; until Plan 5's attention
 * endpoint lands the one source for per-workspace values, the sweep runs on
 * these defaults and the `windows` dep is the seam (Open questions).
 */
export const DEFAULT_SWEEP_WINDOWS: SweepWindows = { approachingWindowDays: 7, stalenessThresholdDays: 14 };

export type SweepDeps = {
  pool: Pool;
  transports: NotificationTransport[];
  windows?: SweepWindows;
  canSeeTicket?: CanSeeFn;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

export type SweepReport = { dueCandidates: number; staleCandidates: number; delivered: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDatePlusDays(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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
  const windows = deps.windows ?? DEFAULT_SWEEP_WINDOWS;
  const canSeeTicket: CanSeeFn = deps.canSeeTicket ?? ((db, userId, ticketId) => canSee(db, userId, ticketId));
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
  const createdAt = now.toISOString();
  const horizon = isoDatePlusDays(createdAt.slice(0, 10), windows.approachingWindowDays);
  const report: SweepReport = { dueCandidates: 0, staleCandidates: 0, delivered: 0 };

  // --- date-approaching: every non-terminal ticket whose CLAIMED date is on
  // or before the horizon. The date is read from the claim; nothing is
  // computed onto tickets that carry no claim (invariant 4).
  const due = await deps.pool.query(
    `SELECT ticket_id, workspace_id, assignee_id,
            fields -> 'title' ->> 'value' AS title,
            fields -> 'dueDate' AS due_claim
       FROM proj_tickets
      WHERE state_category <> 'terminal'
        AND fields -> 'dueDate' -> 'value' ->> 'date' <= $1`,
    [horizon],
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

  // --- stale-ticket: active tickets whose latest state-entering event is
  // older than the threshold. "When did it enter?" is derived from the
  // ledger every run — never stored as a second copy that could drift.
  const staleBefore = new Date(now.getTime() - windows.stalenessThresholdDays * DAY_MS);
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
      WHERE t.state_category = 'active'
        AND entered.server_time <= $1`,
    [staleBefore.toISOString()],
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

  return report;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/notifications/sweep.test.ts`
Expected: PASS.

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
git commit -m "attention sweep: claims entering the window and states outliving the threshold become inbox rows — same tables, same clock, same keys, so twice never nags twice"
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
- Consumes: `TicketState`, `FieldClaim`, `StateCategory` (`@gisik-nokma/domain`).
- Produces (Tasks 9–11 and Plan 6's shells consume; amendment 10 makes app-core the shared home):
  - `DAY_MS`, `dateMs(isoDate): number`, `isoDate(ms): string`, `addDays(isoDay, days): string`, `mondayOnOrBefore(isoDay): string`, `monthGridWeeks(year, month): string[][]` (Monday-start weeks covering the month, padded with adjacent-month days)
  - `type DateClaimView = { date, note?, actorId, clientTime, serverTime, pending }`; `type TicketDatesInput = { state: TicketState; pendingFieldIds: readonly string[] }`; `dateClaimOf(input, 'startDate'|'dueDate'): DateClaimView | null`; `titleOf(state): string`
  - `formatClaimDate('2026-08-30') === '30 Aug'`; `type UserNameFn = (userId: string) => string`; `dueClaimLabel`, `startClaimLabel`, `claimTooltip`, `barProvenance`, `contradictionCopy` (all `(claims, userName) => string`); `CALENDAR_EMPTY_MONTH_COPY`, `TIMELINE_SIDE_LIST_COPY` (exact strings below)
  - `epicAncestorOf(byId: Map<string, TicketState>, ticketId: string): string | null`
  - `type FilterSpec = { text?, assigneeIds?, collaboratorIds?, typeIds?, stateIds?, stateCategories?, projectIds? }`; `matchesFilter(state: TicketState, spec: FilterSpec): boolean` (guarded — Plan 6's wins if landed)
  - `type CalendarMonth = { year, month }`; `type CalendarItem` (marker | bar union below); `type CalendarWeek = { days: string[]; items: CalendarItem[] }`; `type CalendarModel = { month, weeks, hasItems, emptyCopy: string | null }`; `buildCalendarModel(inputs: TicketDatesInput[], opts: CalendarMonth & { userName: UserNameFn; filter?: FilterSpec; laneEpicId?: string | null }): CalendarModel`

- [ ] **Step 0: Guard — scaffold `packages/app-core` and `packages/ui` only if absent**

Run: `ls packages/app-core/package.json packages/ui/src/tokens.ts 2>/dev/null`

**Both exist** (Plan 6 landed first): skip the scaffolds; check `packages/ui/src/tokens.ts` for the token names used below (`color.surface`, `color.ink`, `color.inkMuted`, `color.line`, `color.accent`, `color.todayRing`, `color.pendingHatch`, `color.barActive`, `color.barTerminal`, `color.marker`, `color.contested`, `color.unreadDot`, `space.xs/sm/md/lg`, `radius.sm/md`, `font.body`) and ADD any missing key to `tokens.ts` (the one colour origin — never inline a literal instead). Also confirm the vitest environment is jsdom-capable; if not, add the config below.

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
export const DAY_MS = 24 * 60 * 60 * 1000;

export function dateMs(isoDay: string): number {
  const [year, month, day] = isoDay.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
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
import type { TicketState } from '@gisik-nokma/domain';

/** A date claim as a view renders it: the FieldClaim flattened, plus the in-transit flag. */
export type DateClaimView = {
  date: string;
  note?: string;
  actorId: string;
  clientTime: string;
  serverTime: string;
  pending: boolean;
};

/**
 * What the views take from the DataSource: head state plus which fields'
 * latest claims are still in transit (outbox-applied, not yet accepted).
 * The adapter in src/data maps the DataSource's actual query result to this
 * shape — one site to adjust when Plan 6/10's exact result type lands.
 */
export type TicketDatesInput = {
  state: TicketState;
  pendingFieldIds: readonly string[];
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The claim, or null. There is NO other source of dates — absence is absence. */
export function dateClaimOf(input: TicketDatesInput, fieldId: 'startDate' | 'dueDate'): DateClaimView | null {
  const claim = input.state.fields[fieldId];
  if (!claim || claim.value === null || claim.value === undefined) return null;
  const value = claim.value as Record<string, unknown>;
  if (typeof value !== 'object' || typeof value.date !== 'string' || !DATE_ONLY.test(value.date)) return null;
  return {
    date: value.date,
    ...(typeof value.note === 'string' ? { note: value.note } : {}),
    actorId: claim.actorId,
    clientTime: claim.clientTime,
    serverTime: claim.serverTime,
    pending: input.pendingFieldIds.includes(fieldId),
  };
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

function ticket(overrides: Partial<TicketState> = {}, pendingFieldIds: string[] = []): TicketDatesInput {
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
  return { state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } }, pendingFieldIds };
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
  dueClaimLabel,
  startClaimLabel,
  type UserNameFn,
} from '../claims/claim-labels';
import { dateClaimOf, titleOf, type DateClaimView, type TicketDatesInput } from '../claims/ticket-dates';
import { epicAncestorOf } from '../hierarchy/epic-ancestor';
import { matchesFilter, type FilterSpec } from '../filter/filter-spec';

export type CalendarMonth = { year: number; month: number };

export type CalendarItem =
  | {
      kind: 'marker';
      ticketId: string;
      title: string;
      date: string;
      marker: 'due' | 'start';
      claim: DateClaimView;
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

export type CalendarModel = {
  month: CalendarMonth;
  weeks: CalendarWeek[];
  hasItems: boolean;
  emptyCopy: string | null;
};

export type CalendarModelOptions = CalendarMonth & {
  userName: UserNameFn;
  filter?: FilterSpec;
  laneEpicId?: string | null;
};

function itemOrder(a: CalendarItem, b: CalendarItem): number {
  if (a.kind !== b.kind) return a.kind === 'bar' ? -1 : 1; // bars first
  const aDate = a.kind === 'bar' ? a.start : a.date;
  const bDate = b.kind === 'bar' ? b.start : b.date;
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  return a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0;
}

/**
 * Pure: tickets in, month grid out. Every item traces to a claim — there is
 * no branch that fabricates a date (invariant 4). Contradictory claims
 * (start after due) render as two attributed markers, never as a bar:
 * negative geometry would be invented geometry.
 */
export function buildCalendarModel(inputs: TicketDatesInput[], opts: CalendarModelOptions): CalendarModel {
  const byId = new Map<string, TicketState>(inputs.map((input) => [input.state.id, input.state]));
  const visible = inputs.filter((input) => {
    if (opts.filter && !matchesFilter(input.state, opts.filter)) return false;
    if (opts.laneEpicId != null && epicAncestorOf(byId, input.state.id) !== opts.laneEpicId) return false;
    return true;
  });

  const items: CalendarItem[] = [];
  for (const input of visible) {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;
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
      items.push({ kind: 'marker', ticketId, title, date: due.date, marker: 'due', claim: due, label, tooltip: claimTooltip(label, due) });
    }
    if (start) {
      const label = startClaimLabel(start, opts.userName);
      items.push({ kind: 'marker', ticketId, title, date: start.date, marker: 'start', claim: start, label, tooltip: claimTooltip(label, start) });
    }
    // No claims → nothing. The undated ticket is absent, not estimated.
  }

  const weeks: CalendarWeek[] = monthGridWeeks(opts.year, opts.month).map((days) => {
    const first = days[0];
    const last = days[6];
    const inWeek = items
      .filter((item) => (item.kind === 'bar' ? item.start <= last && item.end >= first : item.date >= first && item.date <= last))
      .sort(itemOrder);
    return { days, items: inWeek };
  });

  const hasItems = weeks.some((week) => week.items.length > 0);
  return { month: { year: opts.year, month: opts.month }, weeks, hasItems, emptyCopy: hasItems ? null : CALENDAR_EMPTY_MONTH_COPY };
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

A React DOM component over Task 8's model (web + desktop render it directly; mobile reuses the view-model under native navigation, amendment 17). All state is view state: which month, which weeks are expanded. Colours come only from `@gisik-nokma/ui` tokens. `today` is a prop, injected — the component never reads the clock, so tests are deterministic and the today-ring is provable.

**Files:**
- Create: `packages/app-core/src/calendar/CalendarView.tsx`
- Test: `packages/app-core/src/calendar/CalendarView.test.tsx`
- Modify: `packages/app-core/src/index.ts`

**Interfaces:**
- Consumes: `buildCalendarModel`, `CalendarMonth`, `CalendarItem` (Task 8); `TicketDatesInput`, `UserNameFn`, `FilterSpec`; `tokens` (`@gisik-nokma/ui`).
- Produces (Plan 6 mounts it; Plan 10's replica shell mounts the same component):
  - `type CalendarViewProps = { tickets: TicketDatesInput[]; today: string; userName: UserNameFn; onOpenTicket: (ticketId: string) => void; filter?: FilterSpec; laneEpicId?: string | null; initialMonth?: CalendarMonth }`
  - `CalendarView(props: CalendarViewProps): JSX.Element` — month nav (‹ Today ›), today ring (`aria-current="date"` + `data-today`), per-week overflow (`+n more` expands on click, `show fewer` collapses), every item is a button that calls `onOpenTicket`, provenance in the `title` attribute (hover/tap), pending items carry `data-pending="true"` and the pending token colour.
  - `MAX_VISIBLE_PER_WEEK = 4`.

- [ ] **Step 1: Write the failing component tests**

`packages/app-core/src/calendar/CalendarView.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
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

function ticket(overrides: Partial<TicketState> = {}, pendingFieldIds: string[] = []): TicketDatesInput {
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
  return { state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } }, pendingFieldIds };
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
  /** ISO day, injected by the shell — the component never reads the clock. */
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

  const model = useMemo(
    () =>
      buildCalendarModel(props.tickets, {
        ...month,
        userName: props.userName,
        filter: props.filter,
        laneEpicId: props.laneEpicId,
      }),
    [props.tickets, props.userName, props.filter, props.laneEpicId, month],
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
                  <li key={`${item.marker}:${item.ticketId}`} style={{ gridColumn: markerColumn(item.date, week.days) }}>
                    <button
                      type="button"
                      data-pending={item.claim.pending || undefined}
                      title={item.tooltip}
                      onClick={() => props.onOpenTicket(item.ticketId)}
                      style={{
                        ...itemButtonStyle,
                        background: 'transparent',
                        color: item.claim.pending ? tokens.color.inkMuted : tokens.color.marker,
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

**Files:**
- Create: `packages/app-core/src/timeline/timeline-model.ts`
- Test: `packages/app-core/src/timeline/timeline-model.test.ts`
- Modify: `packages/app-core/src/index.ts`

**Interfaces:**
- Consumes: `dateClaimOf`, `titleOf`, `TicketDatesInput`, `DateClaimView` (Task 8); `addDays`, `dateMs`, `mondayOnOrBefore`, `DAY_MS`; `barProvenance`, `contradictionCopy`, `dueClaimLabel`, `startClaimLabel`, `formatClaimDate`, `TIMELINE_SIDE_LIST_COPY`, `UserNameFn`; `epicAncestorOf`; `matchesFilter`/`FilterSpec`.
- Produces (Task 11 renders it; mobile view-models reuse it):
  - `type TimelineWeekCol = { start: string; label: string }` — label `W 17 Aug` (formatClaimDate of the Monday)
  - `type TimelineBarSpan = { fromWeek: number; toWeek: number; clippedStart: boolean; clippedEnd: boolean }`
  - `type TimelineRow = { ticketId: string; title: string; bar: TimelineBarSpan; startClaim: DateClaimView; dueClaim: DateClaimView; pending: boolean; provenance: string }`
  - `type TimelineSideEntry = { ticketId: string; title: string; reason: 'no-dates' | 'start-only' | 'due-only' | 'start-after-due'; startClaim: DateClaimView | null; dueClaim: DateClaimView | null; note: string }`
  - `type TimelineGroup = { epicId: string | null; epicTitle: string; rows: TimelineRow[] }`
  - `type TimelineModel = { weeks: TimelineWeekCol[]; groups: TimelineGroup[]; sideList: TimelineSideEntry[]; sideListCopy: string }`
  - `buildTimelineModel(inputs: TicketDatesInput[], opts: { anchor: string; weeksCount?: number; userName: UserNameFn; filter?: FilterSpec; laneEpicId?: string | null }): TimelineModel` — default 8 weeks starting the Monday on/before `anchor`; a fully-dated ticket wholly outside the window appears nowhere (navigation reaches it — it is scheduled, just not here); side-list membership is about missing claims, not about the window.
  - `NO_DATES_NOTE = 'no claimed dates'` (the side list's copy for fully undated work).

- [ ] **Step 1: Write the failing model tests**

`packages/app-core/src/timeline/timeline-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { TIMELINE_SIDE_LIST_COPY } from '../claims/claim-labels';
import type { TicketDatesInput } from '../claims/ticket-dates';
import { NO_DATES_NOTE, buildTimelineModel } from './timeline-model';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string) => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

function ticket(overrides: Partial<TicketState> = {}, pendingFieldIds: string[] = []): TicketDatesInput {
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
  return { state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } }, pendingFieldIds };
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
  dueClaimLabel,
  formatClaimDate,
  startClaimLabel,
  type UserNameFn,
} from '../claims/claim-labels';
import { DAY_MS, addDays, dateMs, mondayOnOrBefore } from '../claims/dates';
import { dateClaimOf, titleOf, type DateClaimView, type TicketDatesInput } from '../claims/ticket-dates';
import { matchesFilter, type FilterSpec } from '../filter/filter-spec';
import { epicAncestorOf } from '../hierarchy/epic-ancestor';

export type TimelineWeekCol = { start: string; label: string };
export type TimelineBarSpan = { fromWeek: number; toWeek: number; clippedStart: boolean; clippedEnd: boolean };

export type TimelineRow = {
  ticketId: string;
  title: string;
  bar: TimelineBarSpan;
  startClaim: DateClaimView;
  dueClaim: DateClaimView;
  pending: boolean;
  provenance: string;
};

export type TimelineSideEntry = {
  ticketId: string;
  title: string;
  reason: 'no-dates' | 'start-only' | 'due-only' | 'start-after-due';
  startClaim: DateClaimView | null;
  dueClaim: DateClaimView | null;
  note: string;
};

export type TimelineGroup = { epicId: string | null; epicTitle: string; rows: TimelineRow[] };

export type TimelineModel = {
  weeks: TimelineWeekCol[];
  groups: TimelineGroup[];
  sideList: TimelineSideEntry[];
  sideListCopy: string;
};

export const NO_DATES_NOTE = 'no claimed dates';

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
        },
      });
      continue;
    }

    if (start && due) {
      sideList.push({ ticketId, title, reason: 'start-after-due', startClaim: start, dueClaim: due, note: contradictionCopy(start, due) });
    } else if (due) {
      sideList.push({ ticketId, title, reason: 'due-only', startClaim: null, dueClaim: due, note: dueClaimLabel(due, opts.userName) });
    } else if (start) {
      sideList.push({ ticketId, title, reason: 'start-only', startClaim: start, dueClaim: null, note: startClaimLabel(start, opts.userName) });
    } else {
      sideList.push({ ticketId, title, reason: 'no-dates', startClaim: null, dueClaim: null, note: NO_DATES_NOTE });
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

function ticket(overrides: Partial<TicketState> = {}, pendingFieldIds: string[] = []): TicketDatesInput {
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
  return { state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } }, pendingFieldIds };
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
import { buildTimelineModel } from './timeline-model';

export type TimelineViewProps = {
  tickets: TicketDatesInput[];
  /** ISO day, injected by the shell. */
  today: string;
  userName: UserNameFn;
  onOpenTicket: (ticketId: string) => void;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  weeksCount?: number;
};

const SHIFT_DAYS = 28; // Earlier/Later move four weeks

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
              <div style={{ padding: tokens.space.xs, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.title}
              </div>
              <button
                type="button"
                data-pending={row.pending || undefined}
                data-clipped-start={row.bar.clippedStart || undefined}
                data-clipped-end={row.bar.clippedEnd || undefined}
                title={row.provenance}
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
});
```

- [ ] **Step 2: Run to verify they fail, then implement format, icons, badge**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run src/inbox/format.test.ts` — expected FAIL (module missing). Then:

`packages/app-core/src/inbox/format.ts`:

```ts
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
      return `In ${payload.stateName ?? payload.stateId} since ${formatClaimDate(payload.enteredAt.slice(0, 10))} — moved there by ${userName(payload.enteredBy)}`;
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

Spec §7: "Reporting v1 is derived counts and the ledger itself … No velocity, no burndown forecasts, nothing the record does not contain" — restated here as an executable guard, the base's override-scan discipline applied to vocabulary: no source file in any client or server tree may speak the estimation words. Then the workspace bookkeeping in the same change set, and the whole plan's verification pass.

**Files:**
- Create: `packages/app-core/test/reporting-scope-guard.test.ts`
- Modify: `Features.md` (repo root — append §11)
- Create: `test-cases/11-calendar-notifications.md`

**Interfaces:**
- Consumes: `NOTIFICATION_KINDS`, `notificationPayloadSchemaByKind` (`@gisik-nokma/domain`); the source trees of Tasks 1–14.
- Produces: the executable scope guard; `Features.md` §11; test-cases bucket 11 (cases 11.1–11.35). This plan claims **only** §11 and the `11.x` case numbers.

- [ ] **Step 1: Write the scope-guard test (it should PASS immediately — it guards, it does not drive)**

`packages/app-core/test/reporting-scope-guard.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS, notificationPayloadSchemaByKind } from '@gisik-nokma/domain';

const HERE = new URL('.', import.meta.url).pathname;
const REPO_ROOT = resolve(HERE, '../../..');
const SCANNED_ROOTS = ['packages/app-core/src', 'packages/domain/src', 'packages/ui/src', 'apps/server/src'];
const FORBIDDEN = /\b(velocity|burndown|forecast)\b/i;

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
```

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/reporting-scope-guard.test.ts`
Expected: PASS. If the vocabulary scan fails, the offender is real — rename the identifier or copy; never widen the regex's allowances.

- [ ] **Step 2: Append §11 to `Features.md`**

Append after §10 (Plan 8's section; if the numbering you find differs, take the next free section number and rename the test-cases file and case ids to match — coordination decision 2 makes §11/11.x this plan's default claim):

```markdown
## 11. Calendar, timeline & notifications

- ✅ **startDate built-in field** — a claim `{date, note?}` beside title/description/dueDate, set via `ticket.field_set` with full per-field provenance; exists so a Timeline bar can have a claimed start — never a derived one. `packages/domain/src/ticket-types.ts`
- ✅ **Calendar view** — month grid drawn only from claimed dates: attributed markers ("needed by 30 Aug — Kiro's claim"), start→due bars when both claims exist, undated tickets absent, an all-undated board renders an empty month that says why; month nav + today ring; per-week "+n more" overflow; click opens the ticket. `packages/app-core/src/calendar/`
- ✅ **Timeline view** — week-column Gantt-lite: bars only for tickets with BOTH startDate and dueDate claims; single-claim, undated, and start-after-due work sits in a visible side list with attributed notes; epic grouping; no dependencies, no critical path. `packages/app-core/src/timeline/`
- ✅ **Filters on both views** — FilterSpec (assignee, type, state, category, project, title text) plus an epic lane; in-transit claims render distinctly (`data-pending`) with provenance on hover. `packages/app-core/src/filter/`, `packages/app-core/src/claims/`
- ⚙️ **Notification fan-out** — on committed events: `ticket.assigned` → assignee, structured `@mention` nodes in comments/descriptions → the mentioned, `claim.contested` → the original claimant; canSee-gated so a notification never out-leaks its ticket; idempotent per (user, dedupe key). `apps/server/src/notifications/fanout.ts`
- ⚙️ **Attention sweep** — deterministic, idempotent job: dueDate claims entering the warning window and active states outliving the staleness threshold become inbox rows carrying the claim's provenance verbatim; running twice notifies once. `apps/server/src/notifications/sweep.ts`
- ⚙️ **Notification storage + API** — per-user `notifications` rows (server-owned, NOT ledger events, NOT a projection — replay can never re-invent a nag); `GET /v1/me/notifications` (cursor), unread count, mark-read; strict payload schemas with no field for invented urgency. `apps/server/src/notifications/store.ts`, `apps/server/src/routes/notifications.ts`
- ⚙️ **NotificationTransport seam** — at-least-once per (user, dedupeKey); in-app transport ships here, web push (Plan 10) and native push (Plan 11) implement the same interface. `apps/server/src/notifications/transport.ts`
- ✅ **Inbox** — notification list with per-kind icons, deep links, unread badge, mark-read; headlines are the claims' own attributed wording. `packages/app-core/src/inbox/`, `apps/web/app/inbox/`
- ✅ **Saved filters** — named FilterSpecs stored via `/v1/me/preferences`; applying one is a view act, never a data act. `packages/app-core/src/filters/`
- ⚙️ **Reporting scope guard** — an executable scan keeps velocity/burndown/forecast vocabulary out of every client and server source tree. `packages/app-core/test/reporting-scope-guard.test.ts`
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

## startDate field

- **11.21** ✅ `startDate` joins `BUILTIN_FIELD_IDS`; the value schema accepts `{date, note?}` and refuses datetimes and bare strings; custom fields named `startDate` are shadow-refused. (`ticket-types.test.ts`)
- **11.22** ✅ The engine accepts a startDate claim and its clearing, refuses malformed values with "Start date" named — plus the two shared fixtures every build runs. (`fields.test.ts`, `fixtures/field-set-*start-date*.json`)

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

1. **`startDate` is a Plan 3 touchpoint (orchestrator note, per assignment).** Task 1 edits Plan 3's surfaces additively: `BUILTIN_FIELD_IDS` (+ its pinned test assertion), `checkTicketFieldSet`, and adds `startDateValueSchema` beside `dueDateValueSchema`. Justification: a Timeline bar needs a start, and a start must be a claim, never an estimate (invariant 4). The orchestrator should record the amendment against Plan 3's contract so its executor is not surprised by the four-element constant.
2. **`claim.contested` payload shape (Plan 10 reconciliation).** Amendment 16 pins the event ("payload = the original event, rule, reason") but not field names. Taken: `{ originalEvent: { id, type, actorId, clientTime, … }, rule, reason }`, parsed tolerantly (`passthrough`; mismatch → logged, skipped, never thrown). Plan 10 owns the registration; if it spells the payload differently, only `contestedPayloadSchema` in `fanout.ts` adapts.
3. **Route prefix drift: `/v1` vs `/api`.** The amendments pin `/v1/*` (events, stream, preferences, sync, attachments) and this plan follows them (`/v1/me/notifications`); Plan 4 registered its reads under `/api/workspaces/…` and auth under `/api/auth/*`. Taken: amendments win for MY routes; Plan 4's paths are consumed as found. The orchestrator should reconcile the series to one prefix.
4. **Preferences API shape (Plan 5 owns).** Amendment 14 pins rows + `/v1/me/preferences` but not verbs. Assumed by Task 13's consumers: `GET /v1/me/preferences` → `{ preferences: Record<string, unknown> }`, `PUT /v1/me/preferences/:key` body `{ value }`. Isolated behind `PreferencesGateway`, so only Plan 6's implementation adapts.
5. **DataSource query surface (Plans 6/10 own).** Amendment 10 pins `{ ingest, query, subscribe }` but "query: typed read functions" is unspecified. This plan's views therefore take `TicketDatesInput = { state: TicketState; pendingFieldIds }` as props; the mapping from the DataSource's actual query result (assumed something like `query.ticketsForProject(workspaceId, projectId)` returning head states plus pending marks) lives in the mounting shell — one adapter site, documented in `ticket-dates.ts`. If the landed pending shape is per-ticket rather than per-field, the adapter widens it to `pendingFieldIds` (worst case: every field of a pending ticket).
6. **`FilterSpec` ownership.** Guarded creation in `packages/app-core/src/filter/filter-spec.ts` if Plan 6 has not landed one; if both plans execute their guards incorrectly and two definitions exist, reconcile to one module (the shapes are structurally compatible by construction — mine is the spec §7 field list).
7. **`docToPlainText` double-definition risk (Plan 7).** Amendment 12 pins home and signature; both plans carry a create-if-absent guard. Whoever lands second consumes. If both created it (merge race), keep Plan 7's and delete mine — the signature is identical.
8. **`packages/app-core` / `packages/ui` scaffolds (Plan 6 owns the real ones).** Task 8 Step 0 creates minimal scaffolds only if absent, including seed `tokens.ts` values. When Plan 6 lands its scaffold/token set, its values win; any token key this plan added that Plan 6 lacks is carried into Plan 6's `tokens.ts` (one colour origin holds).
9. **Task 14 precondition.** If `apps/web` does not exist when this plan executes, Task 14 is left unchecked and handed to the orchestrator to run after Plan 6 merges. Everything it wires is already tested beneath it.
10. **Sweep windows vs workspace settings (Plan 5 + owner).** Spec §7 calls the staleness threshold (and by symmetry the warning window) workspace-set. Taken: exported defaults (7 days approaching / 14 days staleness) injected via `SweepDeps.windows` — the DI seam is ready for wherever Plan 5's attention endpoint puts per-workspace values. Sweep and attention endpoint MUST eventually read one source; flagged for that reconciliation.
11. **Notification rows are not retroactively redacted.** A stored notification keeps its `ticketTitle` even if visibility is later revoked (the deep link then 404s via `canSee`). A point-in-time message honestly reflects what the recipient was entitled to see when it was sent; scrubbing history-of-messages is an owner decision, not assumed here.
12. **Silent mention-gate.** A mention of a user who cannot see the ticket produces nothing, and the mentioner is not told. Honest (no leak, no invented delivery), but the editor could warn at mention time — a Plan 6/7 UX consideration, flagged.
13. **Fixture-schema key drift.** Plan 2's `fixtureSchema` says `workflowDefs` (array); Plan 3's runner snippet used singular. Task 1 Step 9 carries a guard to match the landed harness.
14. **Test-helper drift (Plans 1/3/4).** `createTestDatabase` vs `testPool`/`wipe` vs `migrateTestDb`/`truncateAll` — this plan's server tests assume Plan 1's `createTestDatabase` (per-suite database; also sidesteps the append-only events table's truncate guard) with a locate-first guard. Reconciliation may standardise; adapt imports only.
15. **Custom `date`-kind fields on Calendar/Timeline.** Out of scope in v1 (only `startDate`/`dueDate` render). Spec §7's "claimed dates" arguably includes custom date fields — flagged as a v2 candidate for the owner, not silently included.
16. **`stateName` in stale notifications resolves via the LATEST workflow version** (`getWorkflowDefFromProjection` without a version). A renamed state shows its current name; the `stateId` always travels alongside. Pinning the version the ticket actually sits on would need `workflowVersion` in `proj_tickets` — not added here.

## Self-review (writing-plans skill checklist)

**1. Spec coverage (§7 Calendar/Timeline, notifications, reporting + invariant 4):**
- "bars and markers drawn only from claimed dates" → Tasks 8/10 models; planted defects 11.1–11.4, 11.13–11.15.
- "An undated ticket is absent" → calendar: absent + empty-month copy (11.1); timeline: side list, never geometry (11.14).
- "a date renders attributed ('needed by 30 Aug — Kiro's claim')" → the exact string is pinned three times: `claim-labels.test.ts`, `calendar-model.test.ts`, inbox `format.test.ts`.
- "nothing estimates, extrapolates or back-fills" → no model code path fabricates a date (verbatim-claims planted defect 11.2); start-after-due shown, not resolved; Task 15's vocabulary scan.
- Notifications ("assignment, @mention, contested claim, attention events — push on the apps, inbox everywhere") → Tasks 3–7 + 12/14; push transports are the seam (Plans 10/11), inbox ships here.
- Reporting v1 ("derived counts and the ledger… nothing the record does not contain") → Task 15 guard; no reporting surface added anywhere in this plan.
- Invariant 4 planted defects demanded by the assignment — undated absent, invented date impossible, attributed label exact — are cases 11.1, 11.2, 11.5; sweep idempotence is 11.28.
- §7 saved filters → Task 13; per-user, view-act-only proven (11.34).
- Gaps consciously out: velocity/burndown/forecast (guarded), dependencies/critical path (11.20), drag-to-reschedule, custom date fields (Open questions 15), push delivery (Plans 10/11).

**2. Placeholder scan:** no TBD/TODO/"implement later"/"add validation"/"similar to Task N" anywhere; every code step carries the actual code; every test step carries the actual tests; the two guarded creations (`docToPlainText`, scaffolds) carry full content for the create branch and an exact consume instruction for the other. Task 14 is thin by design and says why, with concrete verification steps.

**3. Type consistency (checked across tasks):** `Notification` shape identical in Tasks 3/4/5/6/7/12/14; dedupe-key grammar identical in Tasks 5/6 (`assignment:` / `mention:` / `contested-claim:` / `date-approaching:` / `stale-ticket:`); `NotificationTransport.deliver(userId, notification)` identical in 5/6; `TicketDatesInput`/`DateClaimView` identical in 8/9/10/11; `FilterSpec` consumed from one module in 8/9/10/13; `dueClaimLabel` defined once (Task 8) and consumed in 8/10/12; `insertNotification(db, notification)` identical in 4/5(transport)/7(test seeding); `CanSeeFn` defined in Task 5, reused in Task 6; `NO_DATES_NOTE`, `CALENDAR_EMPTY_MONTH_COPY`, `TIMELINE_SIDE_LIST_COPY` defined once, asserted where consumed. Route paths in Task 14's gateway match Task 7's registrations verbatim.







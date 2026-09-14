# Account and Help screens — design spec

**Status:** approved by owner (shape), ready for self-review then `writing-plans`.
**Date:** 2026-09-14

## Purpose

Port the prototype's Account and Help screens (`Gisik Nokma - Desktop.dc.html`) into the real app.
Help already exists and is content-complete (`HelpBrowser`, a generated manual + FAQ, full-text
search) — this is a restyle, already scoped as **Task 10** in
`docs/superpowers/plans/2026-09-08-hig-per-screen.md` but never executed. Account is a deliberate
stub (Task 18) naming three absent pieces by name: Passkeys, notification preferences,
sessions/devices. This spec builds all three, plus consolidates two pieces that already work
elsewhere (the Style and Theme toggles), into one coherent screen — taking over **Task 12**'s scope
in full (owner decision).

## Context — why this isn't a from-scratch build

- **Help's content decisions are already made.** Task 10 carries a controller ruling: the
  prototype's own manual/FAQ prose is rejected (*"Working offline" prose is illustrative and not
  shipped — do not add it*); only its CSS container styling is adopted, and case 13.316 already
  pins the shipped section names as unchanged.
- **Task 12 already specified Passkeys in detail** — files, behavior, and a hard security
  constraint on `/sign-in`'s rate-limit exposure. That work is paused mid-flight on a separate
  worktree (`~/my_projects/gisik-nokma-exec`, branch `exec/task12-passkeys`, gate green / stack
  suite red by construction, no PR). This branch (`owner/workspace-edits`) already shares two of
  Task 12's load-bearing files per the most recent commit on `main`. Per owner decision, this spec
  absorbs Task 12's scope; the paused worktree is left untouched and treated as superseded.
- **Two "invented-data" traps from the project's own audit discipline apply directly here:**
  the prototype's session device labels (`"iPhone · Shillong"`, `"mac-01"`) are fabricated flavor
  text with no backing data, and its "Email and in-app" notification columns plus "Weekly digest"
  row have no delivery mechanism behind them — only in-app Inbox notifications are real
  (`packages/domain/src/notifications.ts`: `assignment`, `mention`, `contested-claim`,
  `date-approaching`, `stale-ticket`). Both traps are designed around below rather than shipped.

## Non-goals

- No new email-delivery infrastructure (notification emails, digest emails). Only magic-link SMTP
  exists today (`apps/server/src/auth/smtp-magic-link-sender.ts`); this spec does not extend it.
- No editable email address. Better-auth's email is a verified identity; changing it safely needs
  a verification round-trip this spec does not build. Email is a read-only display.
- No passkey rename/edit (`updatePasskey` exists in the client library and stays unwired — matches
  Task 12's own exclusion) and no cross-device/QR passkey flow.
- No workspace creation, deletion, or membership changes from `/account` — those stay
  workspace-scoped at `/w/[workspaceId]/settings/*`, the boundary Task 18's docblock already drew.
- No changes to `Select`'s API, or to `HelpBrowser`'s content, copy, or section names.

## Design

### 1. Help — CSS restyle (executes Task 10)

Adopt the prototype's `.gn-help*` container styling (~38 rules: search input, document tabs,
sidebar table of contents, results list/cards) onto the existing `HelpBrowser`
(`packages/app-core/src/help/help-browser.tsx`) and its stylesheet. No JSX structural changes
beyond what's needed to carry the new classes; no content, copy, or section-name changes. Lands
once in the shared styling, not per-app, since `apps/web` and `apps/desktop` both render this
component.

### 2. Account — architecture

Rewrite `apps/web/app/account/page.tsx` as a thin shell — `AppNav`, a page title, five section
components composed in the prototype's order. Each section is a framework-free view under
`packages/app-core/src/account/*.tsx`, matching the pattern `HelpBrowser` already establishes
(reusable by `apps/desktop` later). `StyleToggle` (already rendered on `/account` today) and
`ThemeToggle` (currently rendered in `AppNav`, `app-nav.tsx:163`) both move into the new
Appearance section.

### 3. Profile

Name, editable via better-auth's core `updateUser`. Email, read-only display (see Non-goals).

### 4. Appearance

One card holding the Style (hig/minimal/neo) and Theme (light/dark) selects, relocated from their
current homes. No new capability — this is a move, not new work.

### 5. Notifications

One row per real `NotificationKind` (`assignment`, `mention`, `contested-claim`,
`date-approaching`, `stale-ticket`), on/off, default all-on — preserving today's actual behavior,
confirmed unfiltered by reading `packages/app-core/src/inbox/icons.tsx` / `format.ts`. Stored as a
new field on the existing server-owned `UserPreferences` row
(`packages/app-core/src/view-types.ts`, currently `{version, projects, savedFilters}` — confirmed
no notification field exists yet). A toggled-off kind still generates its notification row
server-side (nothing is lost if re-enabled); the toggle only controls what the Inbox shows and
counts as unread — preferences arrange truth, they don't change it, the same rule `ProjectViewPrefs`
already follows.

### 6. Your workspaces

Compact list from the data `/workspaces` already reads (`WorkspaceRef`: `id`, `name`, `role`,
`memberCount | null`, project counts). `role` is real and already served by
`GET /v1/me/workspaces` but currently undisplayed anywhere (`view-types.ts:52`). No invented
fields — mirrors the Workspaces-screen audit's own "real backing data, only the display was
missing" treatment of the same field.

### 7. Sign-in & devices

**Sessions** — list via better-auth's core `listSessions`, revoke via `revokeSession` (both base
routes, confirmed present in the installed `better-auth@1.7.2` without any extra plugin). Labels:
created / last-active timestamps always shown; a coarse browser/OS guess from the session's stored
`userAgent` only when confidently matched against a short, explicit list of well-known substrings,
falling back to `"Unknown device"` rather than fabricating specificity. No new dependency for
user-agent parsing.

**Passkeys** — absorbs Task 12's spec in full: list/add/delete via the already-wired
`passkeyClient` (`addPasskey`, `listUserPasskeys`, `deletePasskey`); empty state
`"You have no passkeys yet."`; add takes a user-supplied label (default: browser/OS name); delete
is one control per row; every server or authenticator refusal renders verbatim in a `role="alert"`.
Inherits Task 12's security constraint verbatim: **an anonymous `/sign-in` page load must charge
the shared auth rate-limit bucket zero times.** Satisfied by firing the conditional-mediation
WebAuthn request only on user interaction with the email field, never on mount (Task 12's own
resolved choice between its two candidate fixes). `docs/manual.md` and `docs/faq.md` still assert
"Sign in with a passkey" in a way that was made false when passkey sign-in's entry point was
pulled; this work restores the entry point and makes that copy true again, regenerating
`packages/app-core/src/help/content.generated.ts` via `scripts/help-content.mjs`.

## Testing

- Standard repo discipline: TDD, mutation-tested, one named case per behavior, added to the live
  catalogue (`test-cases/13-deployment-dogfooding.md` for Account/sign-in cases,
  `test-cases/15-in-app-help.md` for the Help restyle) with `Features.md` updated in the same
  change set.
- **Case-id numbers are not pinned here.** Task 12 reserved `13.327`–`13.333` but never wrote them
  (confirmed by grep against the live catalogue) — recount live against the catalogue at
  plan/implementation time regardless, per the repo's own standing rule that a written number goes
  stale the moment another branch mints from the same block.
- The stack-suite passkey witness Task 12 already designed carries over unchanged: a virtual
  authenticator over CDP registers a passkey on `/account`, signs out, and signs back in through
  `/sign-in`'s conditional UI with no magic link involved. It is the only test that proves the
  passkey story is real rather than merely wired, and the rate-limit-neutral property
  (`N` anonymous `/sign-in` loads then one real magic-link POST must not 429) is a second,
  independent case.
- Representative mutations: drop the `role="alert"` on a passkey refusal → red; hard-code a
  session's device label → red; toggle a notification kind off and assert the unread count stops
  incrementing for it → red if the filter is a no-op.

## Open questions for the implementation plan (not blocking this spec)

- Sequencing/waves — one plan for all five sections, or split (e.g. Help + Profile/Appearance/
  Workspaces as a lower-risk wave, Notifications next, Sessions + Passkeys last given its larger
  security surface). Left to `writing-plans`.
- Whether a later, explicitly-scoped follow-up should add verified email change — flagged, not
  decided.
- The exact short list of user-agent substrings that count as "confidently parseable" for a device
  label — an implementation detail, not a design decision.
- Whether toggling a notification kind off should also suppress the server-side write, instead of
  this spec's default (still write, only hide from the Inbox/unread count). Leaning toward "still
  write" per the arrange-not-change-truth principle already established for view preferences, but
  worth the plan author confirming against how `SavedFilter`/`ProjectViewPrefs` resolved the same
  question.

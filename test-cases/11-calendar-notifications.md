# 11. Calendar, timeline & notifications — test cases

Mirrors `Features.md` §11. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering convention.** Plan 9 Task 15's own plan text reserved 11.1–11.47 at a coarse
one-id-per-AREA scheme. Measured on this branch, every task since instead used one id per TEST,
finer than the plan's own scheme — the same supersession `09-editor-attachments.md` records for
§9's 9.1–9.34 (Plan 7 precedent). The permanently-unused ranges and the reason for each are recorded
in their own section near the bottom of this file; read it before assuming a gap is a mistake.

**Ordering.** Ids are grouped by subject area (Calendar model, Timeline model, Calendar view, …)
rather than kept in one strict ascending run, because several late-numbered ids
(11.158–11.159, 11.169, 11.172–11.177) were added by later fix rounds to areas opened much earlier
in the file. Each such id is placed with the area it actually tests, not at its numeric position —
grouping by subject was judged more useful to a reader than a single ascending column. Within each
heading, ids run ascending.

## Calendar model & claims (`packages/app-core`)
Day-claim reading, bars, filters, custom date-kind fields, and the model's independence from any
computed "now".
- **11.1** ✅ An undated ticket never appears on the calendar grid, and an empty month names why it is empty rather than rendering blank — (`calendar-model.test.ts`, `claim-labels.test.ts`)
- **11.2** ✅ Day-claim reading refuses anything that is not a real calendar day — an invented/impossible date, a malformed built-in day claim, or a value that merely sorts into the month — placing nothing on the grid rather than a half-parsed guess — (`calendar-model.test.ts`, `ticket-dates.test.ts`)
- **11.3** ✅ A single-claim ticket renders as a marker, never a bar — (`calendar-model.test.ts`)
- **11.4** ✅ A start-after-due contradiction shows as two attributed markers and no bar — the contradiction is shown, not resolved — (`calendar-model.test.ts`, `claim-labels.test.ts`)
- **11.5** ✅ Attributed date labels are exact and never invented: a claim's note reaches the tooltip quoted, a malformed day renders verbatim rather than as a plausible label, and an unknown actor is named by raw id, never anonymised — (`calendar-model.test.ts`, `claim-labels.test.ts`)
- **11.6** ✅ A same-day start/due pair is a one-day bar, not a contradiction; a start→due bar appears in every week row it crosses without being clamped into the grid, a claim outside the rendered grid appears nowhere, row order is total and stable (bars first, then day/ticket/claim, ties broken by ticket id), and the supporting month-grid/day-arithmetic helpers refuse what they cannot mean — (`calendar-model.test.ts`, `dates.test.ts`)
- **11.7** ✅ Lane and assignee filters narrow what renders without touching data; a lane keyed on a workspace's own rank-1 type uses the shell's predicate; a due-bound filter matches the server's inclusive semantics and excludes undated work; a field-clause filter narrows on the claimed value; and `matchesFilter` honours every axis the landed FilterSpec declares — (`calendar-model.test.ts`, `matches-filter.test.ts`)
- **11.8** ✅ A pending custom claim stays visibly in transit through the model, following the field id — (`calendar-model.test.ts`, `ticket-dates.test.ts`)
- **11.18** ✅ The epic ancestor used for grouping is arrangement, never a guess — (`epic-ancestor.test.ts`)
- **11.36** ✅ Custom date-kind fields are claims like any other (owner sign-off 2026-08-20): a custom date claim renders with its own field name and its own author, and carries no note so its tooltip is exactly its label — (`calendar-model.test.ts`, `claim-labels.test.ts`, `ticket-dates.test.ts`)
- **11.37** ✅ An unclaimed custom date field puts nothing on the calendar, a malformed stored custom value is skipped rather than half-parsed onto a day, and a value that is not a DAY is skipped even if it would sort into the month — (`calendar-model.test.ts`, `ticket-dates.test.ts`)
- **11.38** ✅ No span is invented between a custom date and a built-in day claim; a bar still requires the start+due pair, with custom claims riding alongside as markers; a custom field id that shadows a built-in cannot place one claim on the grid twice — (`calendar-model.test.ts`)
- **11.39** ✅ The legend switch hides a field's markers without erasing the field's own switch, and the legend is sorted by field name and bounded by the grid, not by the roster — (`calendar-model.test.ts`)
- **11.48** ✅ The calendar view-model reads no clock — proved by varying the zone — and the scanner proving this is itself proven against planted defects before being trusted — (`clock-free.test.ts`)
- **11.49** ✅ An all-hidden month says the field is HIDDEN, not that nothing was claimed, and hiding a field that claimed nothing in this grid leaves the honest empty-month copy alone — a different sentence from the plain empty case — (`calendar-model.test.ts`, `claim-labels.test.ts`)
- **11.50** ✅ Three empty months read as three different sentences — plain, filtered, and lane-narrowed each get their own — (`calendar-model.test.ts`)
- **11.51** ✅ The grid's edges are covered: padding days are real cells, and every bound is closed — (`calendar-model.test.ts`)

## Timeline model (`packages/app-core`)
- **11.52** ✅ A bar requires BOTH the start and due claims (planted defects, invariant 4) — (`timeline-model.test.ts`)
- **11.53** ✅ The side-list heading is true of every entry rendered under it — (`timeline-model.test.ts`)
- **11.54** ✅ A claimed day that is not a real day is named, and blanks nothing — (`timeline-model.test.ts`)
- **11.55** ✅ The rendered window is correct at both of its ends, and one day either side of them — (`timeline-model.test.ts`)
- **11.56** ✅ Bars carry exact week indices and both of their authors — (`timeline-model.test.ts`)
- **11.57** ✅ Grouping by epic ancestor is arrangement, never data — (`timeline-model.test.ts`)
- **11.58** ✅ Custom date claims ride along on the timeline and change no geometry (owner sign-off 2026-08-20) — (`timeline-model.test.ts`)
- **11.59** ✅ Filters narrow both the row set and the side list together — (`timeline-model.test.ts`)
- **11.60** ✅ The timeline view-model reads no clock either — (`clock-free.test.ts`)

## Calendar view — React component (`packages/app-core`)
- **11.61** ✅ A marker is a claim, attributed, and opens its ticket on click; four empty timelines get four distinct sentences that tell them apart — (`calendar-view.test.tsx`, `timeline-model.test.ts`)
- **11.62** ✅ A bar is drawn only from a claimed pair and spans exactly the days claimed for it; the undated-epic skip fires only when the epic truly has nothing to say — (`calendar-view.test.tsx`, `timeline-model.test.ts`)
- **11.63** ✅ The three empty-month sentences render verbatim in the view, not just the model — (`calendar-view.test.tsx`)
- **11.64** ✅ "Today" is a prop — the ring never asks the device what day it is — (`calendar-view.test.tsx`)
- **11.65** ✅ Per-week overflow folds, and folding is reversible — (`calendar-view.test.tsx`)
- **11.66** ✅ A claim still in transit says so — (`calendar-view.test.tsx`)
- **11.67** ✅ Month navigation moves the grid, and Today returns it to the day that was handed in — (`calendar-view.test.tsx`)
- **11.68** ✅ A custom date claim renders under its own field name — (`calendar-view.test.tsx`)
- **11.69** ✅ The legend is the readability affordance, and hiding through it is visibly reversible — (`calendar-view.test.tsx`)
- **11.70** ✅ A day that is not a day is never placed on a day that is — (`calendar-view.test.tsx`)
- **11.71** ✅ The grid states which days belong to the month it is headed by — (`calendar-view.test.tsx`)
- **11.72** ✅ Whatever the mounting shell hands the grid is what the grid actually uses — (`calendar-view.test.tsx`)
- **11.158** ✅ A workspace's own rank-1 type heads the lane in the calendar view, not just the built-in `'epic'` — (`calendar-view.test.tsx`)

## Timeline view — React component (`packages/app-core`)
- **11.73** ✅ A bar is drawn only from a claimed pair, with the rest sitting beside the grid — never in both places at once — (`timeline-view.test.tsx`)
- **11.74** ✅ The window moves four weeks at a time, and Today follows the prop rather than the mount — (`timeline-view.test.tsx`)
- **11.75** ✅ Three empty timelines render as three different sentences, verbatim — (`timeline-view.test.tsx`)
- **11.76** ✅ The side list renders only when it has entries, under the heading the model chose — (`timeline-view.test.tsx`)
- **11.77** ✅ All FIVE side-list reasons render, each saying which one it is — (`timeline-view.test.tsx`)
- **11.78** ✅ A claim still in transit says so, and a settled one does not — (`timeline-view.test.tsx`)
- **11.79** ✅ A bar occupies exactly the columns it was claimed for, and names which end the window cut off — (`timeline-view.test.tsx`)
- **11.80** ✅ Custom date claims sit beside the ticket rather than across the weeks, and still join the hover — (`timeline-view.test.tsx`)
- **11.81** ✅ Rows group under the epic that owns them, and under "No epic" when none does — (`timeline-view.test.tsx`)
- **11.82** ✅ The window width shown is the model's own, stated once — (`timeline-view.test.tsx`)
- **11.159** ✅ A workspace's own rank-1 type heads the timeline lane too, and is kept out of the side list — (`timeline-view.test.tsx`)

## Notification formatting & icons (`packages/app-core`)
- **11.83** ✅ Every notification kind is spoken for by the formatter — a sixth kind would arrive mute — (`format.test.ts`)
- **11.84** ✅ The headline states the claim, attributed — never invented urgency — (`format.test.ts`)
- **11.85** ✅ PLANTED DEFECT: "since" is the IST day of the instant, not a UTC slice — (`format.test.ts`)
- **11.86** ✅ The body is the sender's own words, unparaphrased and unredacted — (`format.test.ts`)
- **11.87** ✅ All five notification kinds reach an icon, and no two kinds reach the same one — (`icons.test.tsx`)

## Inbox core components (`packages/app-core`)
- **11.88** ✅ The unread badge is silent when there is nothing to say, treats its cap as a boundary witnessed on both sides, and carries an accessible name that agrees with itself about the count — an accessible NAME, not merely an attribute nobody must expose — (`unread-badge.test.tsx`)
- **11.89** ✅ A row renders the notification whole — (`inbox-view.test.tsx`)
- **11.90** ✅ The delivered letter renders in full, every row, with no filter and no re-check — (`inbox-view.test.tsx`)
- **11.91** ✅ "Load more" exists exactly when there is more to load — (`inbox-view.test.tsx`)
- **11.92** ✅ The copy shown on screen is `format.ts`'s, passed through unaltered — (`inbox-view.test.tsx`)
- **11.93** ✅ The mark-read guard applies per ROW, not per list — (`inbox-view.test.tsx`)
- **11.94** ✅ The gateway contract carries the store's paging without loss, exposes `unreadCount` as the viewer's total (moved by `markRead`), can express the server refusing rather than only serving, and the fake mirrors the real route's cursor spelling, including the empty case — (`gateway.test.ts`)
- **11.95** ✅ The inbox's CSS-binding scanners are proven against planted input before being trusted, every class the inbox renders is a class `ui.css` styles (and the reverse), and the unread signals reach an actual CSS rule, not just an attribute — (`inbox-css-binding.test.tsx`)

## Saved filters — schema, store, gateway (`packages/app-core`)
- **11.96** ✅ `parseSavedFilters` is tolerant per entry and strict within one — (`saved-filters.test.ts`)
- **11.97** ✅ Parsing keeps `filterSpec`, and drops both the plan's `spec` key and the client's plural `assigneeIds` — (`saved-filters.test.ts`)
- **11.98** ✅ An entry carrying an unknown key is dropped, because the schema door is `.strict()` — (`saved-filters.test.ts`)
- **11.99** ✅ `MAX_SAVED_FILTERS` is the bound the shipped write door actually enforces — (`saved-filters.test.ts`)
- **11.100** ✅ `loadSavedFilters` reads the stored document and salvages what it can — (`saved-filters.test.ts`)
- **11.101** ✅ A gateway that REJECTS rejects here too — a dead transport is not treated as an empty list — (`saved-filters.test.ts`)
- **11.102** ✅ `saveFilter` writes back the document it read, with only `savedFilters` changed — (`saved-filters.test.ts`)
- **11.103** ✅ `EMPTY_PREFERENCES` is never mutated — the never-saved answer is shared and frozen — (`saved-filters.test.ts`)
- **11.104** ✅ `saveFilter` refuses rather than writing something it did not fully read first — (`saved-filters.test.ts`)
- **11.105** ✅ A NUL byte in the filter name is refused, because Postgres `jsonb` cannot carry it — (`saved-filters.test.ts`)
- **11.106** ✅ The client's plural spelling is refused at the write door too (ruling P26) — (`saved-filters.test.ts`)
- **11.107** ✅ The 51st saved filter is refused, and the 50th is not — (`saved-filters.test.ts`)
- **11.108** ✅ `deleteSavedFilter` removes the targeted entry — (`saved-filters.test.ts`)
- **11.109** ✅ An id that matches nothing writes NOTHING — (`saved-filters.test.ts`)
- **11.110** ✅ Duplicate ids are accepted by the schema, and delete removes every match — (`saved-filters.test.ts`)
- **11.111** ✅ Save → load → delete round-trips correctly through one gateway — (`saved-filters.test.ts`)
- **11.122** ✅ An absent preferences document reads as `[]` and refuses every write — (`saved-filters.test.ts`)

## Saved filters menu — React component (`packages/app-core`)
- **11.112** ✅ Applying a saved filter is a view act, never a data act — (`saved-filters-menu.test.tsx`)
- **11.113** ✅ The module has no data surface of its own to touch — its whole world is four props — (`saved-filters-menu.test.tsx`)
- **11.114** ✅ Saving requires a name and hands it up to the caller — (`saved-filters-menu.test.tsx`)
- **11.115** ✅ The name input carries no `maxLength` — the name bound is stated once, in the schema — (`saved-filters-menu.test.tsx`)
- **11.116** ✅ Deleting hands the id up to the caller — (`saved-filters-menu.test.tsx`)
- **11.117** ✅ The empty arm renders correctly when there are no saved filters — (`saved-filters-menu.test.tsx`)
- **11.118** ✅ The menu's CSS-binding scanners are proven against planted input before being trusted, and every class the menu renders is a class `ui.css` styles (and the reverse) — (`saved-filters-css-binding.test.tsx`)
- **11.119** ✅ The disabled state reaches an actual CSS rule, which class-equality checks alone cannot see — (`saved-filters-css-binding.test.tsx`)
- **11.120** ✅ The block names no colour of its own and adds no role — (`saved-filters-css-binding.test.tsx`)
- **11.121** ✅ Every control a person can tab to is covered by the focus-ring rule, and the reverse — (`saved-filters-css-binding.test.tsx`)

## Notification gateway (`packages/app-core`)

*Moved 2026-09-07 from `apps/web/src/notifications-gateway.ts` to
`packages/app-core/src/online/notifications.ts`, beside the three sibling HTTP gateways whose pattern its
docblock already named. The cases did not change; the file they live in did. The ticket-locator cases
that shared the old file are split out below, because `createHttpTicketLocator` did NOT move.*
- **11.130** ✅ Asks for the first page with no query string, and parses every row through the domain schema — (`packages/app-core/test/online/notifications.test.ts`)
- **11.131** ✅ Sends the paging cursor back encoded, and only when there is one — (`packages/app-core/test/online/notifications.test.ts`)
- **11.132** ✅ Treats `null` and `undefined` as the same first-page request — (`packages/app-core/test/online/notifications.test.ts`)
- **11.133** ✅ Carries `nextCursor` through verbatim — the one paging fact the fake could not lose — (`packages/app-core/test/online/notifications.test.ts`)
- **11.134** ✅ Refuses a page whose payload does not match its declared kind, rather than handing it to the view — (`packages/app-core/test/online/notifications.test.ts`)
- **11.135** ✅ Reads the unread total off the route that actually serves it — (`packages/app-core/test/online/notifications.test.ts`)
- **11.136** ✅ Turns a 401 on either read into an `HttpError` that still names the status — (`packages/app-core/test/online/notifications.test.ts`)
- **11.137** ✅ `markRead` POSTs to the row and accepts the route's empty 204 — (`packages/app-core/test/online/notifications.test.ts`)
- **11.138** ✅ `markRead` THROWS on the route's 404 — the seam where a stub gateway used to be looser — (`packages/app-core/test/online/notifications.test.ts`)
- **11.139** ✅ Names the path when a GET answers the transport's `null` instead of a page — (`packages/app-core/test/online/notifications.test.ts`)
- **11.175** ✅ Names the path when the list route answers a 200 of the wrong shape — (`packages/app-core/test/online/notifications.test.ts`)
- **11.176** ✅ Does the same for the unread-count route, rather than badging `undefined` — (`packages/app-core/test/online/notifications.test.ts`)

## Ticket locator (`apps/web`)

*Split out of the gateway file 2026-09-07: `ticketSheetPath` builds this shell's own
`/w/:ws/p/:project?ticket=:id` URL shape, which means nothing to the replica or to another client, so
it stayed in `apps/web` when the gateway left.*
- **11.140** ✅ Reads `project_id` off the `proj_visibility` row the route serves — (`apps/web/test/ticket-location.test.ts`)
- **11.141** ✅ Answers `null` for the route's one 404, without deciding which of its two causes it was — (`apps/web/test/ticket-location.test.ts`)
- **11.142** ✅ Answers `null` rather than building `/w/ws/p/?ticket=` when the row carries no project — (`apps/web/test/ticket-location.test.ts`)
- **11.143** ✅ Lets a 401 through as a session event rather than flattening it to `null` — (`apps/web/test/ticket-location.test.ts`)

## Inbox page (`apps/web`)
- **11.144** ✅ Says "Loading…" while the first page is in flight, NOT that the inbox is empty — (`inbox-page.test.tsx`)
- **11.145** ✅ Names an empty inbox instead of rendering a blank box — (`inbox-page.test.tsx`)
- **11.146** ✅ Renders every row the gateway answered, and marks an unread one read on click — (`inbox-page.test.tsx`)
- **11.147** ✅ Reloads the truth when `markRead` is refused, instead of leaving an invented read flag — (`inbox-page.test.tsx`)
- **11.148** ✅ Appends the next page rather than replacing the rows already on screen — (`inbox-page.test.tsx`)
- **11.149** ✅ Renders a refusal with the server's own words when the list read fails — (`inbox-page.test.tsx`)
- **11.150** ✅ Sends a 401 to sign-in rather than treating an ended session as a plain refusal — (`inbox-page.test.tsx`)
- **11.151** ✅ Says the ticket cannot be opened, and keeps the message, when the locator answers `null` — (`inbox-page.test.tsx`)
- **11.172** ✅ Keeps the rows already on screen when the next page fails, and offers a retry — (`inbox-page.test.tsx`)
- **11.173** ✅ Clears the "cannot be opened" notice when the next open attempt succeeds — (`inbox-page.test.tsx`)
- **11.177** ✅ Drops the paging failure notice when a reload replaces the rows it described — (`inbox-page.test.tsx`)

## Inbox nav link (`apps/web`)
- **11.152** ✅ Reads the unread total once on mount and renders it with its real accessible name — (`inbox-nav-link.test.tsx`)
- **11.153** ✅ Does NOT poll for a signed-out viewer — a request that can only 401, forever — (`inbox-nav-link.test.tsx`)
- **11.154** ✅ Does not read while the session is still in flight, and reads as soon as it lands — (`inbox-nav-link.test.tsx`)
- **11.155** ✅ Refreshes on the plan's one-minute cadence — (`inbox-nav-link.test.tsx`)
- **11.156** ✅ Keeps the last known count when a refresh fails, rather than resetting to none — (`inbox-nav-link.test.tsx`)
- **11.157** ✅ Stops its refresh timer on unmount — (`inbox-nav-link.test.tsx`)
- **11.169** ✅ Clears the badge when the session ends in place, rather than showing the last count — (`inbox-nav-link.test.tsx`)
- **11.174** ✅ Draws no badge before the first answer arrives — an absence claims nothing, a `0` would not — (`inbox-nav-link.test.tsx`)

## Web shell wiring (`apps/web`)
- **11.170** ✅ Hangs the Inbox link — the only door to `/inbox` anywhere in the product — (`app-nav.test.tsx`)
- **11.171** ✅ Carries "Workspaces" always, and "My Work" only inside a workspace — (`app-nav.test.tsx`)
- **11.185** ✅ The nav's link set is CLOSED: the hrefs are exactly `/workspaces`, `/w/<id>/my-work`
  and `/inbox`, so a fourth door cannot be added silently. Distinct from 11.170/11.171, which assert
  presence and are therefore blind to an addition — measured by wiring a `settings/workflows` link
  into `AppNav`: both stayed green and only this case went red. It is the tripwire on the UNOWNED gap
  the coordination doc records, that nothing in `apps/web` links to Plan 8's six authoring routes —
  (`app-nav.test.tsx`)

## Project calendar/timeline mount (`apps/web`)
- **11.186** ✅ The Calendar tab says "Loading…" and draws NO grid before the list read answers — the
  loading window, distinct from the refusal window 11.161 pins. Measured first: deleting
  `list.rows !== null` from the calendar arm leaves all 134 web tests green, and what it renders is
  the sentence this product exists not to say — "Undated work is absent, not estimated" — asserted
  from a read that has not come back — (`project-calendar-timeline.test.tsx`)
- **11.187** ✅ The Timeline tab does the same, as its own case: the guard is per-arm, and each
  deletion is killed only by its own witness — (`project-calendar-timeline.test.tsx`)
- **11.160** ✅ Offers all four tabs, with Board selected by default and each tab selectable alone — (`project-calendar-timeline.test.tsx`)
- **11.161** ✅ The Calendar tab names its own refusal instead of drawing an empty month — (`project-calendar-timeline.test.tsx`)
- **11.162** ✅ The Timeline tab does the same, naming itself rather than the ticket list — (`project-calendar-timeline.test.tsx`)
- **11.163** ✅ Draws a served claim, attributed with the roster's name rather than the raw id — (`project-calendar-timeline.test.tsx`)
- **11.164** ✅ The today-ring uses the IST day, even at the instant the two zone spellings would disagree — (`project-calendar-timeline.test.tsx`)
- **11.165** ✅ Heads the timeline lane with a rank-1 "Initiative" type rather than "No epic" — (`project-calendar-timeline.test.tsx`)
- **11.166** ✅ Renders a custom date claim under its own field name — (`project-calendar-timeline.test.tsx`)
- **11.167** ✅ Leaves the Board and List arms exactly as they were — refusals, not spinners — (`project-calendar-timeline.test.tsx`)
- **11.168** ✅ Still draws the claim when `getMembers` refuses, attributed to the raw actor id — (`project-calendar-timeline.test.tsx`)

## Reporting scope guard (`packages/app-core`)
Spec §7's ban on estimation vocabulary, and the single-origin rule for IST day/zone literals,
enforced as executable source scans. **11.178 and 11.179 are CONTROLS on the scan mechanism
itself** — they prove the two needles match at their own declaration site and that every scanned
root actually yields files — not product scenarios. Do not delete them as noise; without them an
empty scan result would be indistinguishable from a stale or vacuous scanner.
- **11.178** ✅ CONTROL: both needles match at the declaration site, so an empty scan result means real absence, not a stale needle — (`reporting-scope-guard.test.ts`)
- **11.179** ✅ CONTROL: every scanned root actually yields source files — a root that silently walked up empty would make its scan vacuous — (`reporting-scope-guard.test.ts`)
- **11.180** ✅ No source file in any scanned client or server tree speaks the estimation vocabulary (velocity/burndown/forecast) — (`reporting-scope-guard.test.ts`)
- **11.181** ✅ The notification vocabulary is closed over exactly the five shipped kinds — no room for a computed-urgency kind to creep in unnoticed — (`reporting-scope-guard.test.ts`)
- **11.182** ✅ No file but `ist-day.ts` writes the IANA zone as a literal — every view imports `IST_TIME_ZONE` instead — (`reporting-scope-guard.test.ts`)
- **11.183** ✅ No file but `ist-day.ts` re-declares the day shape — everyone imports `IST_DAY_REGEX` instead — (`reporting-scope-guard.test.ts`)
- **11.184** ✅ The zone string every view actually formats with comes from the domain package, and is the real IANA name — (`reporting-scope-guard.test.ts`)
- **11.188** ✅ CONTROL: the estimation needle still matches the words it names — bare and camelCase —
  and does not match ordinary source. Added because this describe's title promised "the control for
  every null above" and the estimation scan had none; and because writing it exposed that the plan's
  `\b`-anchored pattern could not see `velocityChart` at all, which is why the needle is now a
  substring match — (`reporting-scope-guard.test.ts`)

## Notification consumer round trip — real client, real route, real database (`apps/server`)

*Plan 9's consumer-side residual, closed 2026-09-07. Every case above this section measures the adapter
against bodies a test wrote by hand; these six measure it against bodies the ROUTE served out of Postgres.
The distinction is the whole point — a hand-copied body cannot notice the route changing, and 12.325 had
pinned this contract's producer end while stating that its consumer was out of reach.*

- **11.190** ✅ Parses a page the route actually served — the domain parser meets a row no test wrote by hand — (`notifications-consumer-roundtrip.test.ts`)
- **11.191** ✅ Reports NO cursor when the page is the last one, rather than the id of its final row — (`notifications-consumer-roundtrip.test.ts`)
- **11.192** ✅ Walks a real multi-page cursor to exhaustion, and `nextCursor` IS the last row of the page — the keyset value the fake could only copy — (`notifications-consumer-roundtrip.test.ts`)
- **11.193** ✅ Reads the unread total off the real store, counting neither read rows nor another user's — (`notifications-consumer-roundtrip.test.ts`)
- **11.194** ✅ `markRead` actually marks it: the count the client re-reads moves, and a second mark is still idempotent — (`notifications-consumer-roundtrip.test.ts`)
- **11.195** ✅ `markRead` THROWS on another user's row, and that row is still unread when measured at the store — (`notifications-consumer-roundtrip.test.ts`)

## Permanently unused id ranges

Two disjoint ranges below 11.189 will never be filled, for two different reasons. Neither is a gap
to backfill — see `test-cases/README.md`'s §9 precedent (Plan 7, 9.1–9.34) for the same pattern.

- **11.9–11.17, 11.19–11.35, 11.40–11.47** — Plan 9 Task 15's own plan text reserved this range
  at a coarse one-id-per-AREA scheme. This branch instead executed a finer one-id-per-TEST scheme
  throughout the plan, so these numbers were superseded before a single case was ever written
  against them. Filling them now would put two ids on the same test files at two different
  granularities — the exact defect the finer convention exists to avoid.
- **11.123–11.129** — a renumber gap left by Task 14's own fix/renumber round on this branch. The
  rule against renumbering existing ids (`test-cases/README.md`) means a range vacated by a
  renumber stays vacated rather than being reused by a later, unrelated case.

**New cases continue from 11.195.**

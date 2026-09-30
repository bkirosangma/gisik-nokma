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
- **11.50** ✅ The empty month NAMES THE NARROWING, and the legend's exhaustive sentence is gated — a filtered month and a lane-narrowed month reach the sentence that names the filter (`CALENDAR_EMPTY_MONTH_COPY`), while `CALENDAR_ALL_HIDDEN_COPY`'s "EVERY claimed date" gate survives the deletion of the per-cause sentence, so a filter the MODEL saw plus the legend cannot reach it. ⚠ **The gate is blind to the page's UPSTREAM pruning** — the page's filter and its closed-hidden-by-default rule remove rows before the model sees them, so the exhaustive sentence IS reachable while false today. Recorded with the owner as its owner at `calendar-model.ts`'s precedence note; it is **not** a property this case witnesses. **⚠ AMENDED 2026-09-20 (owner ruling, item 9: "the message should name the filter"):** this case read "Three empty months read as three different sentences"; the third sentence was deleted in the same change (item 10), so the count is now TWO and the filtered/lane-narrowed pair share the naming sentence. The gate is the half that did not move — (`calendar-model.test.ts`, `claim-labels.test.ts` 16.45)
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
- **11.61** ✅ A marker is a claim, attributed, and opens its ticket on click; the empty timeline NAMES the narrowing it can no longer identify. **⚠ AMENDED 2026-09-20 — THIS CASE LOST GROUND AND THE LOSS IS RECORDED RATHER THAN QUIETLY RESCOPED.** It read "four empty timelines get four distinct sentences that tell them apart", and the distinct-count assertion measured **3**. With `TIMELINE_NARROWED_COPY` deleted (owner ruling, item 10) the count is **2**: a filter that matched nobody, an unmatched lane, and a workless workspace are ONE model again — the exact collapse this case was written to end. What replaces the lost distinction is that the surviving sentence names the filter. The `narrowedAway` guard survives and still keeps the window sentence away, so the window miss is still its own — (`calendar-view.test.tsx`, `timeline-model.test.ts`)
- **11.62** ✅ A bar is drawn only from a claimed pair and spans exactly the days claimed for it; the undated-epic skip fires only when the epic truly has nothing to say — (`calendar-view.test.tsx`, `timeline-model.test.ts`)
- **11.63** ✅ The empty-month sentences render verbatim in the view, not just the model — **TWO of them since 2026-09-20** (the third was deleted; see 11.50) — (`calendar-view.test.tsx`)
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
- **11.211** ✅ Ruling R4 (2026-09-16), the legend merge: the legend has exactly one checkbox per custom field — never fewer (a lost toggle) and never more (a read-only row disguised as a checkbox) — `Due date`/`In transit` render as read-only swatch-and-label rows and are provably not among the checkboxes, and both stay gated behind the SAME `model.customDateFields.length` guard 11.69 already pins, so they are never a reason to show the legend on their own — (`calendar-view.test.tsx`)
- **11.212** ❌ Board prototype port Task 10: the calendar view restyles to the spec's Calendar metrics table (`docs/superpowers/specs/2026-09-16-board-prototype-port-design.md:349-363`) — nav/Today buttons, month title, legend card, a new weekday-head row, the day grid's tray ground with card/fill4 cells, a 24px today ring on the day number (replacing the prior whole-cell outline), and the accent-ground event pill generalised from bars-only to every non-custom item. ONE declared exception: the custom-field marker (`.gn-calendar__item--custom`) keeps its plain-text treatment and does not become a tinted pill — no `--gn-tint-purple` role exists or is added, per the spec's own measured refusal. Verified by `packages/ui/test/token-discipline.test.ts` (no colour literals) and `packages/ui/test/tokens.test.ts` (every `var(--gn-…)` referenced names an already-declared role — no new role was needed) staying green, plus `packages/ui/test/in-transit.test.ts`'s `.gn-calendar__item--pending` assertion, which this task left untouched, still passing — (`ui.css`, `calendar-view.tsx`) — uncited on 2026-09-18: no test found; was ✅ on owner/workspace-edits 3104eae2. Nothing asserts the calendar’s restyled metric set; the verification the case itself named was three unrelated suites "staying green", which is the shape case 11.213 was retired for.
- **11.214** ✅ Board prototype port Task 10, RULING 24 correction (coordinator, 2026-09-16): `.gn-calendar__items` declares `background: var(--gn-surface)`, not the calendar grid's tray — the REAL gate for the follow-up round's contrast fix, reading the actual `ui.css` the same way `packages/ui/test/in-transit.test.ts`'s existing checks already do. **Replaces case 11.213, retired**: 11.213 (`packages/ui/test/tokens.test.ts`) computed `contrastRatio(customMarker, surface)` from `tokens.ts` role lookups alone, framed as new coverage on the false premise that no `CONTRAST_PAIRS` row already named that pairing — one has, since commit `e09666ce` (Plan 9, 2026-09-04), already exercised across every style/theme by the pre-existing "declared contrast pairs meet their minimums" loop. 11.213 never read `ui.css` and so could not have caught the regression it claimed to guard: deleting `.gn-calendar__items`'s `background: var(--gn-surface)` declaration left 11.213, and the whole suite, green. This case is that CSS-reading gate, proven to guard by deliberately deleting the declaration, confirming the test reddens, and restoring it byte-identical — (`packages/ui/test/in-transit.test.ts`)
- **11.221** ✅ E4-28 (batch B15): every day cell carries its own full date as `aria-label` — an outside-month cell (e.g. the trailing July 31 in August's first row) is labelled by ITS OWN month, not the grid header's, proven by querying `[data-day]` rather than the rendered digit (August also has a 31st, so a text query on "31" would be ambiguous) — (`calendar-view.test.tsx`)
- **11.222** ✅ E4-28 (batch B15): a bar's date span is linked as an `aria-describedby` DESCRIPTION, not folded into its accessible NAME — the name stays exactly the ticket title (the pre-existing `getByRole('button', { name: 'Span' })` query this case reruns still resolves it), and the linked description is the same string the `title` attribute already carried, not a second invented one. A marker carries no such link: `item.label` already names its own date, so nothing is added there — (`calendar-view.test.tsx`)
- **11.224** ✅ P20 (batch B15): the month grid carries the APG calendar-grid pattern's four roles on the structure that already exists — `role="grid"` on `.gn-calendar__grid`, `role="row"` on the weekday head AND on each week, `role="columnheader"` (with `aria-label` naming the full weekday, e.g. "Monday") on the seven labels, `role="gridcell"` on each day. Scoped to `.gn-calendar__days` when counting gridcells, since `.gn-calendar__items` sits inside the same `[role="row"]` section and an unscoped count would pass on the wrong seven divs — (`calendar-view.test.tsx`)

## Timeline view — React component (`packages/app-core`)
- **11.73** ✅ A bar is drawn only from a claimed pair, with the rest sitting beside the grid — never in both places at once — (`timeline-view.test.tsx`)
- **11.74** ✅ The window moves four weeks at a time, and Today follows the prop rather than the mount — (`timeline-view.test.tsx`)
- **11.75** ✅ The empty timelines render the model's own sentences, verbatim, **and the timeline's copy names only controls the TIMELINE has.** The second half is a separate assertion pinning a property the first cannot: `TimelineViewProps` has no hidden-field prop and `buildTimelineModel` has no `hiddenCustomFieldIds`, so the legend switch the CALENDAR's copy names does not exist on this surface. A first draft of the 2026-09-20 change copied that clause across "for symmetry", naming a control no reader here can reach — **the same defect the owner deleted the lane sentence for, one screen over.** Asserted on the WORD (`/legend/i`), so it fails at the clause and not at a comma; mutation-witnessed by re-adding the clause, which reddens **this assertion alone** — (`timeline-view.test.tsx`). **⚠ AMENDED 2026-09-20:** this read "Three empty timelines render as three different sentences"; the narrowing sentence was deleted (owner ruling, item 10), so a filter-emptied chart and an empty one are now the SAME sentence — the naming is what survives the distinction, and the window miss is still its own arm. See 11.61 for the measured collapse.
- **11.76** ✅ The side list renders only when it has entries, under the heading the model chose — (`timeline-view.test.tsx`)
- **11.77** ✅ All FIVE side-list reasons render, each saying which one it is — (`timeline-view.test.tsx`)
- **11.78** ✅ A claim still in transit says so, and a settled one does not — (`timeline-view.test.tsx`)
- **11.79** ✅ A bar occupies exactly the columns it was claimed for, and names which end the window cut off — (`timeline-view.test.tsx`)
- **11.80** ✅ Custom date claims sit beside the ticket rather than across the weeks, and still join the hover — (`timeline-view.test.tsx`)
- **11.81** ✅ Rows group under the epic that owns them, and under "No epic" when none does — (`timeline-view.test.tsx`)
- **11.82** ✅ The window width shown is the model's own, stated once — (`timeline-view.test.tsx`)
- **11.159** ✅ A workspace's own rank-1 type heads the timeline lane too, and is kept out of the side list — (`timeline-view.test.tsx`)
- **11.223** ✅ E4-28 (batch B15), the timeline's own half of 11.222: a bar's date span is linked as an `aria-describedby` DESCRIPTION, not folded into its accessible NAME — the name stays exactly the ticket title, and the linked description is the same string the `title` attribute already carried, composed from the model's own `barProvenance`, never hand-typed — (`timeline-view.test.tsx`)

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
- **11.185** ✅ The nav's link set is CLOSED at each shape it can take, so a sixth door cannot be added
  silently. Distinct from 11.170/11.171, which assert presence and are therefore blind to an addition —
  measured by wiring a `settings/workflows` link into `AppNav`: both stayed green and only this case
  went red. It is the tripwire on the UNOWNED gap the coordination doc records, that nothing in
  `apps/web` links to Plan 8's six authoring routes. **AMENDED 2026-09-09 (Task 18): three doors became
  five.** `/help` and `/account` joined the nav from the owner's `/workspaces` reference; this case
  reddened by name, which is the tripwire working, and the expected set was widened in the SAME change
  set that added the links — never in a follow-up, which is the failure mode the case exists to
  prevent. **AMENDED AGAIN 2026-09-09 (Round 19b): the nav became CONTEXTUAL, so "the link set" is no
  longer one array — it is three, one per shape the route can put `AppNav` in.** Without a workspace:
  exactly `/workspaces`, `/inbox`, `/help`, `/account`. With one and no project: the served workspace
  name and `/w/<id>/my-work` join after `/workspaces`, and `/w/<id>/members` +
  `/w/<id>/settings/ticket-types` join before `/help` — eight links, Board absent. With one AND a
  project: `/w/<id>/p/<pid>` (Board) joins too, between the workspace name and My Work — nine links.
  Each arm is its own `it()`, asserted in order, so a link added to any one shape reddens that shape's
  arm by name — the same discipline the single-array version kept, extended to three shapes instead of
  one. **AMENDED AGAIN, same day (Round 19c, owner: "move members into settings and settings should
  always be visible on the nav bar"): `Settings` LEFT the workspace-scoped group; `Members` did NOT.**
  An earlier draft of this change also dropped `Members`, on the theory that "move members into
  settings" meant folding it under Settings' nav slot — the owner's own reference screenshots (design
  mockups, same feedback round) contradicted that by keeping `Members` as its own top-level link
  beside `Settings`, so it was restored, unchanged from before this round. What DID move is `Settings`:
  it now points at a new global `/settings` (`app/settings/page.tsx`) instead of `/w/<id>/settings/
  ticket-types`, carrying the workspace forward as `?workspaceId=` rather than a path segment when one
  is in scope — a workspace-TYPED href cannot be unconditional, since this shell remembers no "current
  workspace" outside a route or query param, but a query-carrying one can be. The three shapes are now:
  without a workspace, `/workspaces`, `/inbox`, `/settings`, `/help`, `/account` — five, one more than
  before (`Settings` joined the always tier). With one and no project: the served name, `/w/<id>/
  my-work` and `/w/<id>/members` join after `/workspaces`, and `/settings?workspaceId=<id>` sits where
  the old workspace-scoped `Settings` link did — eight links, same count as before this round, Board
  absent. With one AND a project: Board joins too — nine links, same count as before.** **AMENDED AGAIN
  2026-09-16 (Round 21, owner: "move back the nav bar settings to only be visible once a workspace is
  opened... and move inbox to just before help"): `Settings` REJOINED the workspace-scoped group, and
  `Inbox` moved to the bar's end.** Both reverse-or-move a link inside arms this case already owned, so
  all three expected arrays changed in the same change set that changed the component — the discipline
  this case exists to enforce, applied to itself. The shapes are now: without a workspace,
  `/workspaces`, `/inbox`, `/help`, `/account` — FOUR, back to the pre-19c count, `/settings` having
  left the always tier. With one and no project: the served name, `/w/<id>/my-work`, `/w/<id>/members`
  and `/settings?workspaceId=<id>` join, with `/inbox` now sitting AFTER them, just before `/help` —
  eight links, unchanged in count. With one AND a project: Board joins too — nine, unchanged in count.
  **Two of the three arms would have stayed green on the Inbox move alone had they been unordered
  sets**, which is why they are asserted in order; the adjacency itself is pinned separately by 13.414,
  because an ordered whole-array assertion still passes if Inbox and Help move together within it.
  **AMENDED AGAIN 2026-09-16 (Round 23, owner: "the board on the nav bar doesn't work. lets remove
  it"): there are now TWO nav shapes, not three, and the third arm proves it.** Board is gone — it could
  only ever render when the route already carried a project, which is exactly when the reader was
  already standing on that board, so it was a link to the current page in every state it could reach.
  `AppNav`'s `projectId` prop went with it, Board being its only consumer, so the third arm expresses
  "a project is in the route" through `currentPath` alone. **The arm is KEPT rather than deleted, and
  its job is now the inverse of what it was:** it used to prove a project ADDS Board, and now proves a
  project adds NOTHING, with an expected array deliberately identical to the second arm's. That is not
  a redundant duplicate — the nav still reads `usePathname()`, so a board route remains a distinct
  input, and a future project-conditional link would redden this arm while leaving the second green,
  which is what names the fault. Two explicit negatives sit beside the array (nothing points at
  `/w/ws_1/p/p_1`; no link is named `Board`) so a failure says what came back rather than only that an
  array grew. The shapes are now: without a workspace, four links; with one, eight; with one AND a
  project, the same eight. **AMENDED AGAIN 2026-09-23 (Plan 5 of the notes series): `/notes` joined
  every arm, immediately LEFT of `/inbox` in the nav's corner — the owner's placement, spec §9.1. The
  four arms reddened by name when the link landed, which is the tripwire working, and all four
  expected arrays were widened in the SAME change set that added the link.** Two things about the
  prose ABOVE that amendment are worth stating rather than leaving for a reader to trip over: the
  counts it gives ("four links" without a workspace) are from BEFORE Round 24 moved `/help` and
  `/account` into `AccountMenu`, so the arrays in `app-nav.test.tsx` — not the sentences here — are
  the authority today (without a workspace they are `/workspaces`, `/notes`, `/inbox`); and the new
  link is a prefix match (`/notes/<id>` keeps it current), which is a ROUTE rule and not a link-set
  one, so it is 18.182's subject rather than this case's. — (`app-nav.test.tsx`)

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
- **13.1179** ✅ **The today-ring is RE-DERIVED when the page is shown again (ruling E5-43, 2026-09-21)** — 11.164 pins which day the shell computes; this pins WHEN it computes it at all, which is the half the `RECORDED, NOT FIXED` note at the project page deferred to "whoever next opens this page's date wiring". `today` is state now, re-read on `visibilitychange` and on `focus`, so a tab left open across IST midnight catches up the moment it is looked at again. **The clock is advanced across the SAME boundary 11.164 uses — `2026-08-20T18:30:00.000Z` is exactly IST midnight — and the expected value is `istToday`'s own answer for the instant, never a hand-typed day**, so a fix that added a second reading of the same wrong rule satisfies neither case. Two positives (one per listener, because a browser is not obliged to fire either alone: a window that was never hidden comes back by FOCUS, a hidden tab by `visibilitychange`) and **one CONTROL that carries the discrimination**: the same render with the clock advanced and NO event must leave the ring on yesterday, because that IS the defect. Without it both positives would pass against `today` as a plain `const` — the paired positive/negative shape `13.515`/`13.516` use. **Mutation-witnessed with two distinct signatures:** removing the `visibilitychange` listener reddens the visibility case alone (`Tests 1 failed | 2 passed`), and reverting `today` to a plain `const` reddens both positives while the control correctly stays green (`Tests 2 failed | 1 passed`) — the control green under the defect is exactly what makes it a control rather than a third positive. — (`apps/web/test/project-calendar-timeline.test.tsx`)
- **11.165** ✅ Heads the timeline lane with a rank-1 "Initiative" type rather than "No epic" — (`project-calendar-timeline.test.tsx`)
- **11.166** ✅ Renders a custom date claim under its own field name — (`project-calendar-timeline.test.tsx`)
- **11.167** ✅ Leaves the Board and List arms exactly as they were — refusals, not spinners — (`project-calendar-timeline.test.tsx`)
- **11.168** ✅ Still draws the claim when `getMembers` refuses, attributed to `Unknown person`, not the raw actor id (amended by 6.254, R3 N4) — (`project-calendar-timeline.test.tsx`)

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

## Notification preferences — global, per-kind mute list (`apps/server`, `packages/domain`)

*Account/help-screens plan, Task 5. A `mutedKinds` list, global (no `workspaceId` — the Inbox itself is a
global route) and stored in a NEW table (`user_notification_preferences`), never as a fourth key on
`PreferencesDoc`/`user_preferences` — see `packages/domain/src/notification-preferences.ts` for why that
table's `(user_id, workspace_id)` key and its 30-day sweep-on-revocation make it the wrong home. Muting
hides a kind from what is READ; it never stops the row from being WRITTEN.*
- **11.197** ✅ `notificationPreferencesSchema` accepts the empty (everything-on) default and any real subset of the five kinds, refuses an unknown kind, and refuses an unknown top-level key (`.strict()`) — `EMPTY_NOTIFICATION_PREFERENCES` is exactly the empty-list answer — (`packages/domain/test/notification-preferences.test.ts`)
- **11.198** ✅ The store answers the empty default for a user with no row, round-trips a written preference, upsert-REPLACES rather than merges on a second write, keeps two users' rows independent, and the database's own `CHECK` refuses a kind outside the five (positive control: a valid kind inserts fine) — (`apps/server/test/notification-preferences/store.test.ts`)
- **11.199** ✅ `GET`/`PUT /v1/me/notification-preferences`: 401 with no session on both verbs and nothing stored; `GET` answers the empty default for a fresh user; `PUT` then `GET` round-trips and the `PUT` answers what it stored; an unknown kind and an unknown top-level key are both refused `400 {error:'invalid_notification_preferences'}` with nothing partial landed; and one user's write never touches another's row (positive control: the writer's own row did move) — (`apps/server/test/routes/notification-preferences.test.ts`)
- **11.200** ✅ The read-side filter: `unreadNotificationCount` and `listNotifications` both exclude a muted kind's rows entirely — not merely marking them read — while an unmuted kind's row in the SAME fixture stays visible (the positive control against a query that silently returned nothing at all); an empty muted list changes nothing, the default; and `/v1/me/notifications` and its `/unread-count` sibling actually look the caller's stored preference up and pass it through — the wiring witness that `notifications.test.ts`'s own docblock says a route-registration test alone cannot give, since a store-level pass here is silent about whether the ROUTE ever calls `getNotificationPreferences` at all — (`apps/server/test/notifications/store.test.ts`, `apps/server/test/routes/notifications.test.ts`)

*Task 6, same plan — the client half: the HTTP gateway over the route above, and the `/account`
Notifications section it feeds. Driven against the REAL `createHttpClient` over a scripted `fetch`,
matching `notifications.test.ts`'s own argument against a hand-written `HttpClient` stub.*
- **11.201** ✅ `createHttpNotificationPreferencesGateway`'s `load()` GETs `/v1/me/notification-preferences` with no query string and parses the result through the domain's own schema — (`packages/app-core/test/online/notification-preferences.test.ts`)
- **11.202** ✅ `save()` PUTs the whole document to the same path — asserted against the actual PARSED body `scriptedHttp` captured, not merely a `hadBody: true` flag, so a mutation sending `{}`, a hardcoded document, or a renamed key reddens this rather than passing unnoticed (coordinator review, 2026-09-15) — (`packages/app-core/test/online/notification-preferences.test.ts`)
- **11.203** ✅ `load()` refuses a body naming a kind outside the five, rather than handing it to the view — (`packages/app-core/test/online/notification-preferences.test.ts`)
- **11.204** ✅ `load()` names the door on a 404 rather than handing zod a bare `null` to parse — this route is session-gated and answers 401 to a stranger, never 404, so a 404 here means the request never reached the route at all — (`packages/app-core/test/online/notification-preferences.test.ts`)
- **11.205** ✅ `NotificationsSection` renders one checked-by-default row per real kind, five rows — no invented "email" column, no "weekly digest" row, since neither exists server-side — (`packages/app-core/test/account/notifications-section.test.tsx`)
- **11.206** ✅ A muted kind renders unchecked, and only that one — (`packages/app-core/test/account/notifications-section.test.tsx`)
- **11.207** ✅ Clicking a row calls `onToggle` with that kind and does not flip local state itself — the component is controlled, owning no state of its own — (`packages/app-core/test/account/notifications-section.test.tsx`)
- **11.208** ✅ The wiring witness: `/account` reads real preferences through `useAppServices().notificationPreferences` and renders the muted row unchecked — proof the seam carries a real answer through, which the page's own un-stubbed-rejects-to-disabled fallback (every other case in this file, since ruling E5-13, `mount()`'s own default resolves it instead) cannot show — (`apps/web/test/account-page.test.tsx`)
- **11.209** ✅ Toggling an unmuted row on `/account` flips it and calls `notificationPreferences.save()` with the expected next `mutedKinds` — the ONLY state update on the success path, so the flip standing is `toggleKind`'s own optimistic `setPrefs`, not an accident of the mock (coordinator review, 2026-09-15: `toggleKind`'s optimistic-flip-then-revert had zero coverage before this and 11.210) — (`apps/web/test/account-page.test.tsx`)
- **11.210** ✅ A refused save reverts the optimistic flip once the reload settles — `load()` is called a second time (the `.catch()`'s reload firing, not the DOM settling on its own) and the row is drawn from that reloaded answer, so the optimistic mute does not stick — the same mechanism `/inbox`'s own `markRead` catch uses (case 11.147) — (`apps/web/test/account-page.test.tsx`)
- **11.215** ✅ RULING E5-13, CRITICAL — a failed preferences read on `/account` disables every Notifications row and states the refusal, and a click while disabled never reaches `notificationPreferences.save()` — before this ruling the failed read guessed `{ mutedKinds: [] }` and one toggle would PUT it as the whole document, silently overwriting whatever was actually stored — (`apps/web/test/account-page.test.tsx`)
- **11.216** ✅ `NotificationsSection`'s own half of E5-13: an `error` prop renders a `role="alert"` refusal and disables every checkbox, independent of the caller — (`packages/app-core/test/account/notifications-section.test.tsx`)
- **11.217** ✅ RULING E2-24(a)'s component half — a `saveError` prop states a refused-save outcome as its own `role="alert"` WITHOUT disabling the rows, distinct from `error` (11.216, a read failure): the data is still current once a successful revert settles — (`packages/app-core/test/account/notifications-section.test.tsx`)
- **11.218** ✅ RULING E2-24(a)'s page half — a refused save on `/account` states the outcome ("Your change could not be saved. It has been reverted.") rather than only reverting the optimistic flip silently, which is all 11.210 had ever asserted before this ruling — (`apps/web/test/account-page.test.tsx`)
- **11.219** ✅ RULING E2-24(a)'s compounding-failure case — a refused save whose REVERT read also fails falls back to the disabled `prefsError` state (11.215's own treatment) rather than leaving the optimistic, wrong flip standing with no trace at all, which is what the revert `.load()`'s missing rejection handler used to do — (`apps/web/test/account-page.test.tsx`)
- **11.220** ✅ RULING E2-24(b) — a sign-out refusal on `/account` (**Amended 2026-10-01 by the devices plan:** the row action is now "Sign out this device" — `POST /v1/me/devices/:key/sign-out` — and "Sign out all other devices"; the refusal/re-read contract below is unchanged) renders verbatim in a `role="alert"` (the same one-prop shape `PasskeysSection`'s add/remove `error` already carries) and the device list is NOT re-read, since the sign-out never actually succeeded — before this ruling the result was read and discarded entirely, so the session simply failed to leave the list with nothing on screen to say why — (`packages/app-core/test/account/sessions-section.test.tsx`, `apps/web/test/account-page.test.tsx`)

## Notify on create (access plan, W4)

The New ticket dialog puts the assignee on `ticket.created`; the fan-out now reads it as an assignment (owner ruling 2026-09-29).

- ✅ **11.225 — a `ticket.created` carrying `assigneeId` (not the actor) delivers ONE `assignment` notification to that person, with the ticket's title and the creator as `assignedBy`, keyed `assignment:<event id>`;** control: a `ticket.created` with no `assigneeId` delivers nothing. Mutation: delete the `ticket.created` branch from `onCommitted`.
- ✅ **11.226 — the creator assigning themselves at birth, and `assigneeId: null`, deliver nothing;** control: the same event with another person does. Mutation: route `ticket.created` around `handleAssigned`'s self/null guard (call `deliverToAll` directly).
- ✅ **11.227 — the same committed `ticket.created` delivered twice yields ONE row;** control: a different `ticket.created` for the same person is a second row. Mutation: key the dedupe on `newUlid()` instead of `env.id`.

## Permanently unused id ranges

Three disjoint ranges/ids will never be filled, for three different reasons. Neither is a gap
to backfill — see `test-cases/README.md`'s §9 precedent (Plan 7, 9.1–9.34) for the same pattern.

- **11.9–11.17, 11.19–11.35, 11.40–11.47** — Plan 9 Task 15's own plan text reserved this range
  at a coarse one-id-per-AREA scheme. This branch instead executed a finer one-id-per-TEST scheme
  throughout the plan, so these numbers were superseded before a single case was ever written
  against them. Filling them now would put two ids on the same test files at two different
  granularities — the exact defect the finer convention exists to avoid.
- **11.123–11.129** — a renumber gap left by Task 14's own fix/renumber round on this branch. The
  rule against renumbering existing ids (`test-cases/README.md`) means a range vacated by a
  renumber stays vacated rather than being reused by a later, unrelated case.
- **11.213** — RETIRED, RULING 24 (coordinator review, 2026-09-16), same day it was minted. It was
  written for a `packages/ui/test/tokens.test.ts` block that duplicated a pre-existing
  `CONTRAST_PAIRS` row (`{ fg: 'customMarker', bg: 'surface', minimum: 4.5 }`, `tokens.ts`, live
  since commit `e09666ce`) while its own docblock claimed the pairing was previously uncovered —
  and, because it computed the contrast from `tokens.ts` role lookups alone, it never read `ui.css`
  and so could not have caught the CSS regression it was written to guard (proof: deleting the
  declaration it depended on left 11.213, and the whole suite, green). The block was deleted rather
  than corrected in place, and the real gate — reading the actual stylesheet — landed as a NEW id,
  **11.214**, at `packages/ui/test/in-transit.test.ts`, per the same "a vacated id stays vacated"
  discipline the `11.123–11.129` entry above already states. `11.213` names no test in this
  codebase as of this commit.

- **11.196** ✅ The reporting scope guard's ONE exclusion, compensated: the in-app help content may say "burndown"/"velocity" — because the FAQ entry that raises them answers *"There are none, and that is a deliberate decision"* — and the case asserts the exclusion is not vacuous, that every hit is prose rather than code, and that the denial is still there — (`packages/app-core/test/reporting-scope-guard.test.ts`)

**New cases continue from 11.221.** (11.215–11.216 minted 2026-09-21/22, ruling E5-13 — the
notification-preferences failed-read fix, at the page and component levels respectively. 11.217–11.220
minted 2026-09-21/22, ruling E2-24 — the save-refusal and revoke-refusal fixes across Notifications
and Sessions.)  
*(11.210 was IN USE, at the Notification preferences section above (account/help-screens plan, Task 5's
server half 11.197–11.200, Task 6's client half 11.201–11.210 — the last two, 11.209–11.210, added on
2026-09-15 coordinator review to close a coverage gap in `toggleKind`'s optimistic-flip-then-revert
logic that 11.201–11.208 left unexercised). Board prototype port Task 10 (2026-09-16) then minted
11.211–11.212 at the Calendar view section above (the R4 legend merge and the metrics restyle).
`11.213`, minted the same day for a contrast gate that turned out to duplicate existing coverage
and never actually read `ui.css`, was RETIRED same-day (Ruling 24, coordinator review) — see
*Permanently unused id ranges* below — and its real replacement landed as `11.214`, a NEW id, per
this file's own "a vacated id stays vacated" rule. Each advance was verified against the real sweep
(`node scripts/check-case-ids.mjs`) before this pointer moved, not against this prose, which the
file's own convention (below) warns is exactly the kind of line that can drift. This pointer means the
NEXT FREE id —
that is the convention this file was created with (`e09666c`: pointer 11.189, highest entry 11.188).
#293 set it equal to the highest id instead of one past it, and #304 then minted exactly the id the
pointer named; no duplicate resulted only because #304 advanced the pointer to its own new maximum,
carrying the fault forward. Restored to max+1 there, and kept at max+1 here. Nothing validates this
line, so it is checked by reading.)*

### Round 24 (2026-09-16) — five cases re-aimed, none minted here

**No new ids in §11.** The account-menu and inbox-icon work minted `13.416`–`13.422` in
`13-deployment-dogfooding.md`; the cases below are existing ones whose ASSERTION SURFACE moved because
the nav stopped rendering `UnreadBadge`.

Owner: *"make inbox an icon. with an indicator (green dot?) if there is an unread event."* Ruled: the
dot is the visible signal and **the count moves into the link's accessible name** (`"Inbox, 3 unread
notifications"`; a bare `"Inbox"` at zero). `UnreadBadge` itself is untouched and still renders the
number on `/inbox`, so its own cases are unaffected.

Case **11.152** now makes the same claim, read off the link's accessible name instead of the badge's
`role="img"`, plus the dot's presence — (`apps/web/test/inbox-nav-link.test.tsx`). Case **11.153** is
unchanged in substance; the "no badge drawn" half now reads as a bare `"Inbox"` name and an absent dot —
an absence still claims nothing, which was always the point. Case **11.155** makes the same cadence
claim, with the count read from the accessible name. Case **11.156** still measures exactly what it did:
the count after a FAILED refresh. A reset to 0 would now drop the dot and rename the link to a bare
`"Inbox"` — telling the reader there is nothing waiting, on the strength of a request that failed — so
the case asserts both. Case **11.169** clears the count when the session ends in place, and asserts BOTH
the name and the dot deliberately: a dot that vanished while the name still read "3 unread" would leave
the previous session's count being announced to whoever is looking now, which is the exact defect this
case exists for, and a dot-only assertion would pass on it. Case **11.185**'s three closed link sets each
lost `/help` and `/account`, which are now menu items — an `<a role="menuitem">` carries the menuitem
role, not `link`, so `getAllByRole('link')` cannot see them by design even with the menu open. Their
reachability is pinned separately at **13.417**, which is what keeps this shortening honest: a shorter
expected list is also what deleting the links would produce.

**Block `11.225`–`11.234` is ALLOCATED to the access-and-invites plan (`docs/superpowers/plans/2026-09-29-workspace-access-and-invites.md`, 2026-09-29).** Measured across all remote branches: §11's tip is `11.224`.

## Actor names on the inbox, the project calendar and the ticket sheet (`fix/names-nav-focus`, 2026-09-29) — block `11.240`–`11.249`

*Ids `11.245`–`11.249` are unused. Sits after the access plan's block `11.225`–`11.234`.*

- ✅ **11.240 — an assignment row on `/inbox` names the assigner from the roster or the names-only read; a person NEITHER names reads `Unknown person`, not the id (amended by 6.254, R3 N4).** (`apps/web/test/inbox-page.test.tsx`)
- ✅ **11.241 — a refused roster and names read (a guest viewer) reads `Unknown person`, not the id, and the page still draws (amended by 6.254, R3 N4).** (`apps/web/test/inbox-page.test.tsx`)
- ✅ **11.242 — each workspace on the inbox is read once, for its own rows.** (`apps/web/test/inbox-page.test.tsx`)
- ✅ **11.243 — a claim made by a person the roster omits (a guest, for a member) is attributed on the project calendar/timeline by the names-only read, not the raw id.** (`apps/web/test/project-calendar-timeline.test.tsx`)
- ✅ **11.244 — the ticket sheet names the people the roster omits on claims and the assignee from the names-only read; the roster keeps priority.** (`packages/app-core/test/views/ticket-sheet.test.tsx`)


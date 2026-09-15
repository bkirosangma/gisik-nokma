# 15. In-app manual & FAQ

The manual and FAQ as a **feature of the product**, not files in a repository — reachable from the web
app, the desktop app and the phone app, with no session, no network and no workspace required.

**Legend:** ✅ covered by a test · ❌ not yet · 🚫 out of scope, with a reason.

*Numbering starts at 15.1. §14 is reserved for the MCP server
(`docs/superpowers/plans/2026-09-07-mcp-server.md` Task 11), which is planned and not yet built.*

## The shared content model (`packages/app-core`)

*The markdown is parsed ONCE at build time into a closed set of block kinds. React Native cannot render
HTML, so the web's renderer can never be the phone's — parsing once is what stops three renderers from
becoming three parsers that disagree about one sentence. These cases run against the REAL generated
content rather than a fixture, because a fixture would only prove the code works on a document written
to make it work.*

- **15.1** ✅ Both documents are present, with sections and entries, and no entry has an empty id or title — (`packages/app-core/test/help/search.test.ts`)
- **15.2** ✅ Entry ids are unique within a document, so a deep link is unambiguous — (`packages/app-core/test/help/search.test.ts`)
- **15.3** ✅ The CORRECTED due-date passage survives the parse — the coverage map's own near-miss, pinned, because a build-time transform is where a carefully corrected sentence could quietly lose its correction — (`packages/app-core/test/help/search.test.ts`)
- **15.4** ✅ Emphasis survives rather than flattening to plain text; the documents mark their load-bearing claims with it — (`packages/app-core/test/help/search.test.ts`)
- **15.5** ✅ Numbered steps parse as an ORDERED list and bullets do not, both present — a hard-coded flag would make one count zero — (`packages/app-core/test/help/search.test.ts`)

## Search (`packages/app-core`)

*Currently the only search a web user can reach at all — the product has none of its own.*

- **15.6** ✅ Conjunctive and order-independent: "due date" and "date due" return the same set, and one absent term kills the query rather than falling back to OR — (`packages/app-core/test/help/search.test.ts`)
- **15.7** ✅ A title hit outranks a body mention — (`packages/app-core/test/help/search.test.ts`)
- **15.8** ✅ Says WHICH KIND of nothing it found: an empty query and a real miss are different, and the miss reports how many entries were searched, because "nothing matched" and "nothing was searched" are different failures — (`packages/app-core/test/help/search.test.ts`)
- **15.9** ✅ The excerpt shows why the entry matched, rather than being decoration — (`packages/app-core/test/help/search.test.ts`)
- **15.10** ✅ Stable: the same query twice returns the same order — (`packages/app-core/test/help/search.test.ts`)
- **15.11** ✅ `findHelpEntry` resolves a deep link, and refuses the same id under the wrong document — (`packages/app-core/test/help/search.test.ts`)
- **15.12** ✅ `spansToText` joins without inventing whitespace, so a bold word does not gain spaces — (`packages/app-core/test/help/search.test.ts`)

## The freshness gate (`scripts/help-content.mjs`)

*A generated artifact with no check against its source goes stale silently — users reading an old manual
while `docs/manual.md` says something else, with no symptom until somebody follows an instruction that
stopped being true. The parser also self-tests against planted defects before `--check` certifies
anything: a parser reporting "224 entries" tells you it ran, not that it was right.*

- **15.13** 🚫 The parser's own cases live in `scripts/help-content.mjs`'s self-test (10 cases, 4 of them planted defects) and run on every `pnpm check:help`, rather than as vitest cases — the same shape `check-runbook-commands.mjs` uses, and for the same reason: the gate must refuse to certify content when its own instrument is broken.

## The three surfaces

- **15.14** ❌ Web `/help` renders the browser and its search — *no test yet; the shared model and search are covered above, and the DOM rendering is not. NARROWED 2026-09-15: the HEADING-STRUCTURE half of the DOM render is now covered by 15.18; what remains uncovered here is the search box and results rendering.*
- **15.15** ❌ Desktop reaches the same component, including from the signed-out branch.
- **15.16** ❌ Mobile's React Native screen renders the same parsed content.
- **15.17** ✅ **The desktop window DEFINES the design tokens it draws with, rather than only referencing
  them.** `apps/desktop/src/theme.test.ts` calls `installTheme` and asserts what it appended: one
  stylesheet carrying every role in `TOKEN_ROLES`, plus the dark theme and the OS-preference default.
  Found by pre-launch item 6 — `ui.css` has 321 `var(--gn-…)` usages and **zero** definitions, and until
  this landed only `apps/web/app/layout.tsx:32` ever emitted `themeStylesheet()`, so the desktop help
  browser rendered on browser defaults. Confirmed in the shipped artifact before it was fixed:
  `apps/desktop/dist/assets/index-*.css` carried 24 distinct `var(--gn-…)` usages and no definitions,
  the 24 serving as the positive control for the zero.
  *Why the two existing guards could not see it: `tokens.test.ts` proves every `var()` NAMES a declared
  role and `token-discipline.test.ts` proves no colour literal escapes `tokens.ts` — both are claims
  about the TypeScript and the CSS text, and neither says any stylesheet defining those variables is
  ever installed in a given app, which is a property of an entry point.*
  *Mutation: drop one role from what `installTheme` installs (`--gn-surface-sunken`) → red, and the
  failure names its own site — `expected [ 'surfaceSunken' ] to deeply equal []`. Restored and verified
  by SHA-256 against `HEAD`, not by a shell `diff`.*

- **15.18** ✅ **`/help` renders exactly one level-1 heading, so the hierarchy does not start at `h2`.**
  Before 2026-09-15 the page rendered NO `h1` at all — measured live in a real browser — so its first
  heading was an `h2` from the document body. `packages/app-core/test/help/help-browser.test.tsx` is the
  FIRST render test for this component; until it existed this directory held only `search.test.ts`, which
  drives `searchHelp` as a pure function, so nothing in the tree asserted anything about what the
  component puts on the page and the missing `h1` went unnoticed through the whole Help restyle.
  Asserted at `level: 1` and not by text alone, because the defect it guards is a heading at the WRONG
  LEVEL, which a text-only query cannot see; a second case asserts the document body still contributes
  `level: 2` headings, as the positive control that "the hierarchy started at level 2" was a statement
  about this page rather than about an empty render.
  *Mutation-witnessed: rendering the title as an `h2` reddens it, and the failure names its own site —
  `Unable to find an accessible element with the role "heading" and name "Help"` at `EXIT=1`. Restored
  via an editor round-trip, never `git checkout`.*
  *Deliberately narrow — it pins heading STRUCTURE, not content: the manual and FAQ are generated from
  `docs/manual.md` / `docs/faq.md`, and a test asserting their prose would fight every edit to those
  documents, which is the coupling the generator exists to avoid.*
  *NOT covered by any test, and named rather than implied: the `h1`'s own type (34px/700/−0.4px). It is
  CSS, it was verified by live measurement and screenshot against the reference, and it has no
  assertion — the same honest gap 15.14–15.16 record.*
  *Superseded detail: this case originally also named the flattened `.gn-help__toc` as an untested CSS
  change. `.gn-help__toc` no longer exists — the topic sidebar replaced it later the same day, and every
  anchor it pointed at is still rendered and still reachable. See 15.22.* —
  (`packages/app-core/test/help/help-browser.test.tsx`)

## The topic sidebar (`packages/app-core`)

*Added 2026-09-15 with the newer desktop prototype's Help design. The shipped content model is
`document → section → entry` with no group layer, so the sidebar's five manual groups are DECLARED in
`packages/app-core/src/help/groups.ts` — a hand-maintained map, whose only real failure mode is drifting
from documents somebody else edits. These cases are what makes the drift loud. They run against the REAL
generated content for the reason 15.1–15.5 give: a fixture would prove the code works on a document
written to make it work.*

- **15.19** ✅ **The manual's groups partition its sections in the document's own order, exactly.**
  ONE assertion — concatenate every group's `sectionIds` and compare to `document.sections` as a
  SEQUENCE — because that catches four defects a count or a set comparison would each miss part of: a
  section named in no group, one named in two, a stray id left behind by a renamed heading, and a group
  whose sections are not neighbours in the document.
  *The ordering half is not theoretical: the first draft of the map filed `§10 — Who can see what` with
  "Workspaces and people", four chapters from its place in the document, and this case reddened on
  exactly that. A set-partition check would have passed it. It matters because the sidebar reads the
  group order and the `Next` pager reads the document's, so a non-contiguous group makes a reader
  following the sidebar and a reader following `Next` visit the same sections in different sequences.*
  *A positive control runs THROUGH THE SAME COMPARISON, not a hand-rolled substitute — this repo's
  recorded failure shape is a control that does not traverse the measurement's own path — mutating the
  real group list three ways (drop, duplicate, reverse) and asserting each is rejected.*
  *A third case pins that the FAQ declares NO groups, so that decision has to be made again on purpose:
  its 13 sections are already topic names, and a group layer over them would restate the first index.* —
  (`packages/app-core/test/help/groups.test.ts`)
- **15.20** ✅ **Every section is reachable from the sidebar, grouped or not — structurally, not because
  a test passes.** `helpNav` appends any section no group claims as a trailing unnamed run, so a section
  that falls out of the map renders untidily at the foot of the sidebar instead of vanishing from the
  navigation while still existing in the document. That is the plan's own binding rule in navigation
  form — *"keep and restyle, never delete"*. 15.19 then asserts the run is empty, which makes the
  untidiness loud in CI rather than only visible to whoever scrolls.
  *Three cases: a grouped document covered exactly once per section; a document declaring no groups
  becoming one flat run through the SAME code path (which is why the sidebar needs no FAQ special case);
  and a synthetic stray section, because an untested safety net is a claim rather than a net.*
  *Mutation-witnessed: making `helpNav` filter strays away instead of appending them reddens two of the
  three at `EXIT=1`. Sources restored and verified by SHA-256, never `git checkout`.* —
  (`packages/app-core/test/help/groups.test.ts`)
- **15.21** ✅ The eyebrow and pager helpers read the document rather than a second hand-kept list:
  `helpGroupTitle` names the owning group and returns `null` where none is declared, and
  `helpNextSection` follows `document.sections` and stops at the last one — so the pager keeps working
  for an ungrouped document and for a drifted section, and is never drawn pointing nowhere. —
  (`packages/app-core/test/help/groups.test.ts`)
- **15.22** ✅ **The sidebar renders one collapsible group per declared group, each naming its own
  count, and groups start OPEN.** Both halves of the collapse are asserted: a test of the click alone
  would pass against a sidebar that started collapsed, which is the state this deliberately does not
  have — every section behind a click would make it a worse index than the flat row of links it
  replaced. Also pinned: the FAQ tab shows a flat list with no toggles at all (asserted by the absence
  of buttons AND the presence of its 13 links, since absence alone is also satisfied by an empty
  sidebar).
  **The document SWITCH is pinned by two further cases, and one of them replaces an assertion that
  said the opposite.** It is now the shared `SegmentedControl` in the sidebar, labelled `Manual` and
  `FAQ` — the reference's own words (`helpTabs: [{ k: "manual", l: "Manual" }, { k: "faq", l: "FAQ" }]`
  in its source). Until 2026-09-15 a case asserted the tabs carried the documents' FULL titles, because
  the copy rule keeps shipped wording where the prototype's is merely different; **the owner lifted that
  ruling for this control in as many words** — *"forget the ruling on the information losing. make the
  manual/faq switch like in the attached file"* — so the assertion is INVERTED rather than relaxed: the
  long titles must be ABSENT from the switch, since a test that merely looked for "Manual" would pass
  against a control showing both. Queried through `role: 'tab'` inside `role: 'tablist'`, which is what
  `SegmentedControl` renders, so the case also pins that this is the shared component and not a fifth
  hand-rolled segmented row. A second case pins the COUNT against `HELP_CONTENT.length` — a switch with
  the right two labels and a missing third document is the defect the labels case cannot see.
  *Mutation-witnessed: restoring `label: doc.title` reddens three cases at `EXIT=1` — the labels case,
  and the two that reach the FAQ by clicking a tab named `FAQ`. Source restored and verified by
  SHA-256.*
  *Every query is scoped through `getByRole('navigation', { name: 'Topics' })`, and that is not
  tidiness: each section's `Next` pager carries the NEXT SECTION'S OWN TITLE, so an unscoped
  `getByRole('link', { name: '§1 — Signing in' })` matches two elements, and a test that resolved the
  ambiguity by taking the first match would pass with the sidebar deleted.*
  *Mutation-witnessed: defaulting groups to closed reddens three of the four at `EXIT=1`.* —
  (`packages/app-core/test/help/help-browser.test.tsx`)
- **15.23** ✅ Each section carries an eyebrow naming its document and group (`MANUAL · GETTING
  STARTED`), and a document with no groups shows the label alone rather than a dangling separator —
  which is what a naive template renders and what a test asserting only "contains FAQ" would let
  through. Queried by the sentence-case text because the uppercasing is `text-transform` in CSS, which
  is the point of doing it there: the DOM keeps a string a screen reader reads as a word.
  *Mutation-witnessed: emptying the eyebrow reddens both cases at `EXIT=1`.* —
  (`packages/app-core/test/help/help-browser.test.tsx`)
- **15.25** ✅ **The active row follows the READER, not the last thing clicked.** Two mechanisms, both
  covered: a scroll spy over the rendered sections (the real answer to the owner's *"since it's a single
  page document, highlight the section that is currently displayed in the reading pane"*), and the URL
  fragment, which covers the frame before the spy's first callback and any environment without
  `IntersectionObserver`.
  *The fragment half runs as itself in jsdom, including the case that makes the search and the sidebar
  agree: a search result links to an ENTRY, so the marker resolves entry → owning section, or the
  sidebar would mark nothing while the reader sat in a section it could have named.*
  *The spy half runs against a STUBBED observer, which is not a compromise — what could be wrong there
  is the SELECTION RULE, and a stub drives it directly. Three drives: §6 alone in the band; §5 joining
  while §6 is still in it (the EARLIEST in document order must win, so the highlight advances only once
  the outgoing section's tail leaves the band — a rule picking the last would flicker across every
  boundary, and both rules look identical in a single-section test); then §5 leaving. A positive control
  asserts the observer actually observed the real section elements, so an empty highlight would mean the
  rule said nothing rather than that the wiring never ran.*
  *Mutation-witnessed: flipping `<` to `>` in the earliest-wins comparison reddens it at `EXIT=1`.
  Source restored and verified by SHA-256.*
  *NOT asserted, and named: the `rootMargin` geometry, and the empty-band geometric fallback. jsdom
  gives every element a zero rect, so `top <= 0` is true of every section there and a test would pin an
  artifact of the environment rather than the rule. Both were verified by scrolling a real browser —
  see the measured sequence below.* — (`packages/app-core/test/help/help-browser.test.tsx`)
- **15.24** ✅ One `Next` pager per section EXCEPT THE LAST, pointing at the next section's anchor and
  named with its title. Asserted as a COUNT against the real document rather than by finding one pager
  and calling it proved, because the off-by-one is the whole defect class: a pager on the last section
  would point nowhere, and a missing one mid-document would strand a reader.
  *Mutation-witnessed: suppressing the pager reddens it at `EXIT=1`.* —
  (`packages/app-core/test/help/help-browser.test.tsx`)
- **15.26** ✅ **The third dim text role clears 4.5:1 on every surface, in every style AND theme** —
  `textSubtle`, added 2026-09-15 so `/help`'s furniture (eyebrows, group counts, the caret, the pager
  label) can sit a step below `textMuted` the way the owner's prototype's `--label3` does. Covered by
  the existing `'declared contrast pairs meet their minimums'` loop, which is why THREE rows were
  declared (`surface`, `surfaceRaised`, `surfaceSunken`) and not the one `/help` uses: the loop only
  checks what the array declares, so an undeclared co-occurring pair is unchecked by construction.
  *The reference's own `--label3` is NOT what shipped, and the numbers are why: composited over the
  four light surfaces it measures **3.00 / 3.10 / 2.87 / 2.96** — under 4.5 everywhere and under even
  3.0 on two, so no honest `minimum` existed to declare for it. The shipped values are derived at this
  palette's own (higher) baseline — `#5e5e62` light / `#a0a0a5` dark, binding constraint `surfaceSunken`
  at **4.61** and **4.54**, with one step dimmer failing outright (`#606064` → 4.47, `#9e9ea3` → 4.43).
  `grayAccessible` was unusable for the same reason its own docblock already gave: it is the status-dot
  grey and fails text at **3.73** on `warmSunken`.*
  *ONE SITE NO `CONTRAST_PAIRS` ROW CAN REACH, measured separately rather than assumed: the group
  count is 12px text inside `.gn-help__group-toggle`, which on `:hover` lays `--gn-fill-quaternary`
  over the surface — and the fills are ALPHA, which that array forbids naming (a row would compute the
  fill's own colour against a ground it is blended INTO). Composited by hand across all six
  style×theme combinations, `textSubtle` on the hover ground measures **4.80 / 5.31 (hig, minimal) and
  4.78 / 5.05 (neo)** — worst **4.78**, still clear of 4.5 and still above the 4.61 `surfaceSunken`
  figure that binds the derivation, so no site moves back to `textMuted`. The same composite confirms
  the premise the search-field fix rests on: in LIGHT theme `fillQuaternary` is a DARK tint
  (`#efe7df` → `#e3ddd8`), so the field reads as a well under `hig`/`minimal` — the combination where
  both shadow roles are `none` and the hex is the only cue.*
  — (`packages/ui/test/tokens.test.ts`)
- **15.27** ❌ **The Help screen's surfaces, type scale and geometry match the prototype** — the
  search field and the results tray are RECESSED, not raised; the blockquote and the empty state are
  the same tray card; body copy is 17px/22px; the reading column runs on one 20px rhythm. Unasserted
  for the reason 15.14–15.16 already record: this is CSS, and nothing in the suite reads a computed
  style on this screen.
  *Measured live rather than left unstated. The two surface INVERSIONS this closed were real defects,
  not restyles: `.gn-help__search-input` drew on `--gn-surface-raised` `#fbf7f3`, which is LIGHTER than
  the `#efe7df` page behind it, while wearing a sunken shadow that said the opposite; `.gn-help__results`
  sat on raised + a real `0 1px 3px` drop shadow. Both now read as wells. It matters most under
  `minimal`, where BOTH shadow roles resolve to `none` and the hex was the only cue left — pointing the
  wrong way; under `neo` light all three surface roles collapse to one hex, so the old rule was merely
  invisible there rather than wrong. Type: body/list/quote/table 17px/22px set PER ELEMENT and not on a
  container — this file is rem-based and `rem` is root-relative, so a `font-size` on `.gn-help__column`
  would rescale nothing inside it. The two search-result lines are deliberately SMALLER (13px where,
  15px snippet), which is the reference's own value and not an oversight. TWO LITERALS WERE DECLINED in
  favour of the token: the field's `10px` and the quote's `12px` radii read `var(--gn-radius-control)` /
  `var(--gn-radius-card)` instead, because a length literal would desync these two boxes from ruling
  #386's radius scale under `neo` (14px/20px) to buy 2px and 4px — recorded as a deviation rather than
  taken silently.* — (no test; owner: whoever next touches the help surfaces, with 15.14–15.16)

*NOT covered by any test, and named rather than implied: the sidebar's CSS — its 274px width, the
sticky behaviour, the stacking breakpoint below 48rem, the active row's VISUAL treatment (15.25 asserts
the `aria-current` attribute; nothing asserts the fill, the weight or the depressed shadow), the
eyebrow/pager type, and the switch's geometry. All were verified by live measurement in a real browser
across both apps and all six style×theme combinations, and none has an assertion — the same honest gap
15.14–15.16 record. `/help` is in none of the e2e-stack ratchet baselines, so nothing there could have
caught a regression either.*
*Measured values, so a later reader can tell a regression from a redesign. Active row: `--gn-accent` +
`--gn-accent-text` at 600, contrast **5.26:1 light / 7.48:1 dark** against a 4.5 floor — up from the
4.54:1 the earlier `--gn-text-accent`-on-`--gn-fill-tertiary` wash gave. Inactive rows
`--gn-text-muted` at 15px/400, 8.71:1 at worst. Rows 34px tall (WCAG 2.5.8 floor is 24px), 15px text
(this repo's enforced floor is 12px). `--gn-shadow-sunken` on the active row verified PRESENT under
`neo` both themes and `none` under `hig`/`minimal` — the depressed reading the owner asked for, in the
only style that has a real inset shadow. Scroll spy measured at five positions: exactly one row marked
at every one, the first section at the top of the document, and the first section again on return.
The switch against the reference's own inline
styles: tray `padding: 2px` / `gap: 2px` exact, segments `flex: 1` at 118px in a 242px tray, 15.2px
against its 15px, weights 600 selected / 500 unselected exact, side by side. ONE deliberate divergence
— segment height 44px against the reference's 36px, because `ui.css` records that 40px reddened the
tap-target ratchet on `/sign-in` the moment anything first rendered `SegmentedControl`. Switch text
contrast is 12.87:1 at worst across all six combinations.*
*Two classes were RETIRED with this change and are named because other records still mention them:
`.gn-help__tabs` no longer exists, and `.gn-help__tab` was renamed `.gn-help__toggle` — it had one
remaining user, `apps/desktop/src/app.tsx`'s "Manual & FAQ" / "Back" button, which was never a tab.
`.gn-help__tabs` was also one of two discriminators `apps/web/e2e-viewport/responsive.spec.ts` reads to
prove the 40rem breakpoint fired; that spec guards its assertion with `if (… !== null)`, so leaving it
aimed at a deleted selector would have turned a firing check into a silently SKIPPED one. The
discriminator moved to `.gn-help__h2`'s font-size, the other declaration already in the same media
query. Cases 13.266–13.267 and the mutation record at 13.x name the old class as history.*

*15.14–15.16 are honest ❌ rather than quiet omissions. What they would cover is the drawing, not the content or the search; both of those are pinned above, and the two DOM surfaces share one component so there is one thing to test rather than two. Owner: whoever next touches the help surfaces — most naturally alongside pre-launch checklist items 6 and 7, which will exercise these screens in a real viewport anyway.*

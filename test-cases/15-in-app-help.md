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

*Until the notes release (2026-09-23) this was the only search a web user could reach at all — the
product had none of its own. The product now has two: the Notes page's own search, and the deep
ticket-search engine, reachable only through the `:ticket` picker in a comment or a note (manual §15,
FAQ "Finding things"). Neither is this one — this section covers the help browser's search over the
manual and FAQ text, not either of those.*

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
anything: a parser reporting a plausible entry count tells you it ran, not that it was right.*

- **15.13** 🚫 The parser's own cases live in `scripts/help-content.mjs`'s self-test — its own case count, with each planted defect named — and run on every `pnpm check:help`, rather than as vitest cases — the same shape `check-runbook-commands.mjs` uses, and for the same reason: the gate must refuse to certify content when its own instrument is broken. **Both sentences here named counts until F8 (2026-09-21)** — the self-test's case count and planted-defect count, and a quoted example of the entry count — and both had drifted from what the runner actually prints. **The numbers are gone rather than corrected**, and they are named here only by what they counted, not by their old values: a count written down beside no instrument goes stale again the next time a case or an entry is added, and a comment that quotes an old count to explain its removal leaves the stale literal in the file for the next sweep to find. The figure is printed by the runner on every `pnpm check:help`, which is where it stays true.

- **15.35** ✅ **Every string the help puts in double quotes is checked against the PRODUCT, ratcheted against a measured baseline — the gate now carries an assertion about the build, not only about itself.** Until F2 (2026-09-21) `pnpm check:help` verified that the generated module matched its sources and **could not fail on whether either document was true of the build**, which is the mechanism F1's eight rows passed through. **226 quoted-string occurrences (171 distinct) are now looked for in the source under `apps/` + `packages/` on every run**; a string that is absent and NOT declared in `scripts/help-quoted-strings-absent.json` fails the gate, naming the document and the string. **The universe is double quotes, not backticks**: the remedy words it as "every back-ticked control name", and `manual.md` holds eight backticks in total and three distinct tokens (`2026-08-30`, `Mark N read`, `/settings`) — a rule built on them would have a population of three. `scripts/help-content.mjs`, `scripts/help-quoted-strings-absent.json`
  *⚠ **WHY A RATCHET AND NOT THE OBVIOUS RULE, MEASURED BEFORE IT WAS WRITTEN.** "Every quoted string must exist in the product" is **false of this corpus**: **59 of the 171 distinct strings are legitimately absent** — the manual's worked examples, its illustrative labels (`3 of 5 done`), its paraphrases of what a screen says. The obvious rule would have put 59 false failures on the gate, which is how a check earns the right to be ignored. So the baseline IS the measurement — the absent strings recorded as *absent*, not as "not a product string", so a reviewer can challenge any one of them — and it fails in BOTH directions, like the case-citation ratchet: a new undeclared absence, and a baselined absence the product now contains (a rotted entry, which is how such a list becomes a blanket permission).*
  *⚠ **AND THE HAYSTACK DELIBERATELY EXCLUDES ONE FILE, WHICH IS THE MOST IMPORTANT LINE IN THIS CHANGE.** `packages/app-core/src/help/content.generated.ts` is a copy of the corpus. With it in the haystack, every string the manual quotes is found in the product — inside the manual's own generated copy — and **the check cannot fail for any string the corpus contains**. That was the first version of this check: a quoted string no product file contains was appended to `manual.md`, the generated copy was regenerated to satisfy the freshness half, and the gate printed `EXIT=0`. The haystack is every file under `apps/` and `packages/` EXCEPT that one — which means it INCLUDES this rule's own test file, so a docblock or fixture that quotes one of the absent strings is read as the product saying it and reports the entry as rotted; a first draft of `corpus-vs-product.test.ts` did exactly that for three strings.*
  *⚠ **WHAT IT DOES NOT CATCH, MEASURED AGAINST THE ROWS THE FINDING NAMES RATHER THAN ASSERTED.** It would **not** have caught F1. Run against the pre-F1 manual (`e33b7b8a^`) with today's product: **zero** absent spans that were not already absent — because F1's drift was BOLD names and prose about where a control sits (*"use the **Sign out** button on the right of the bar"*), and `Sign out` still exists in the product, one menu deeper. **A string can be present and the sentence about it still false**; that gap stays open and is named here rather than implied by a green gate. The route half of the remedy was measured too and is nearly vacuous: the whole corpus mentions exactly **one** route token (`/settings`).*
  *Mutations, RUN in both directions and each restored: a quoted string no product file contains, appended to `manual.md` and regenerated so the freshness half is satisfied, fails the gate naming `docs/manual.md` and the string; and `export const PROBE = "…"` added to `apps/web/src/app-nav.tsx` for a string the baseline declares absent fails it on the rotted-entry branch, naming that one string. Both give `EXIT=0` again on restore. `packages/app-core/test/help/corpus-vs-product.test.ts` pins the rule's semantics in the package's own runner; the end-to-end sweep stays in the gate, because reading all of `apps/` + `packages/` inside a package unit suite is a repo-wide concern.*

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
  *ONE SITE NO `CONTRAST_PAIRS` ROW COULD REACH, measured separately rather than assumed: the group
  count was 12px text inside `.gn-help__group-toggle`, which on `:hover` laid `--gn-fill-quaternary`
  over the surface — and the fills are ALPHA, which that array forbids naming (a row would compute the
  fill's own colour against a ground it is blended INTO). Composited by hand across all six
  style×theme combinations, `textSubtle` on the hover ground measured **4.80 / 5.31 (hig, minimal) and
  4.78 / 5.05 (neo)** — worst **4.78**, clear of 4.5.*
  ***SUPERSEDED the same day, and in the direction that costs this case nothing: the sidebar's hover
  ground is `--gn-surface-sunken` now, and the ink over it `--gn-text-muted`** (owner: "lets move the
  styling towards the guide"). Both are solid, so the composite that needed a hand measurement is a
  DECLARED row — `{ fg: 'textMuted', bg: 'surfaceSunken', minimum: 4.5 }` (`tokens.ts:893`) — verified
  by the loop above in both themes. The hand figures are kept rather than deleted because they are
  what licensed the alpha hover while it shipped, and because `textSubtle` still holds two sites in
  the document column that this move did not touch.*
  *The old composite's OTHER finding still stands and is still load-bearing elsewhere: in LIGHT theme
  `fillQuaternary` is a DARK tint (`#efe7df` → `#e3ddd8`), which is the premise the search-field fix
  rests on — that field reads as a well under `hig`/`minimal`, the combination where both shadow roles
  are `none` and the hex is the only cue.*
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
- **15.28** ✅ **The typefaces are emitted, and emitted ONCE** — `themeStylesheet()` carries
  `--gn-font-sans` and `--gn-font-mono` under a bare `:root`, so they apply with neither the style nor
  the theme axis marked — the state the desktop shell is permanently in, having no toggle for either.
  *The COUNT is the load-bearing half and the reason this is not a plain `toContain`: fonts vary with
  neither axis, which is exactly why they live outside `declarationsFor`. Moving them inside it would
  satisfy a containment check perfectly while emitting six copies, one edit away from diverging.
  Mutation-witnessed: emitting them per style×theme reddens this on the count, naming the mistake
  rather than "something changed".* — (`packages/ui/test/tokens.test.ts`)
- **15.29** ✅ **Inline code in the shared stylesheet is set in the mono stack** — `.gn-help__code`
  reads `var(--gn-font-mono)`. *Asserted because `--gn-font-mono` has exactly ONE consumer and it is
  in `ui.css`: `--gn-font-sans` is reached from each app's own base rule and would fail loudly
  elsewhere, but deleting `font-family` from this one rule would silently return inline code to
  whatever monospace the browser defaults to, with every other test green. Before this it HAD no
  family — the same "no rule set a font" defect as the body stack, one element down.* —
  (`packages/ui/test/tokens.test.ts`)
- **15.30** ✅ **The desktop window renders in the product's typeface** — `installTheme` appends a
  second `<style data-gn-base>` setting `body { font-family: var(--gn-font-sans); -webkit-font-smoothing: antialiased }`.
  *It did not, and this is the identical defect to 15.17 one property along: `ui.css` declares no
  `font-family` and `index.html` no `<style>`, so the only stack the product named lived in
  `apps/web/app/globals.css`, which this app never loads — every glyph in the window was the browser's
  default SERIF while `apps/web` rendered the same `HelpBrowser` in the system sans. The case asserts
  BOTH halves — that the rule REFERENCES the variable and that the same install DEFINES it — because
  either alone cannot fail usefully: a `body` rule pointing at an undefined custom property is invalid
  at computed-value time and drops straight back to the serif, which is the failure that looks most
  like success. A second element rather than appending to `data-gn-tokens`, so that element stays
  `themeStylesheet()` verbatim and 15.17's equality assertion keeps meaning what it says.* —
  (`apps/desktop/src/theme.test.ts`)
- **15.31** ✅ **`body` is painting in the ORIGIN's stack, not merely in the same font as itself** —
  the viewport sweep carries `body`'s computed `font-family` out and the spec checks it begins with
  `fontStackOf('sans')`'s first family.
  *This closes a FALSE-GREEN in the `uaFont` check beside it (13.266), which is an EQUALITY against
  `body` and therefore says nothing about what `body` resolved to. Since the font port that value is
  `var(--gn-font-sans)`: if the variable stops being emitted or is renamed, the declaration is invalid
  at computed-value time, `body` falls to the UA serif, every inheriting element falls with it, and
  `uaFont` goes EMPTY — green, with the product's typeface gone from every screen. The expectation is
  derived from `tokens.ts` rather than copied as a literal, and compares the FIRST family only, which
  is immune to the quote and whitespace normalisation `getComputedStyle` applies to a stack;
  `-apple-system` appears in no browser default, so no fallback satisfies it by accident.*
  *DELIBERATELY NOT PORTED, recorded here so the decision is visible rather than lost: the prototype's
  `font-size:17px; line-height:22px` on that same `body` rule. `rem` resolves against `html`, so
  adopting it would rescale only text that inherits a size and leave every `rem`-sized rule anchored at
  16 — a type scale split down the middle, across screens the request never named. Same reasoning
  limits `input, textarea, select` to `font-family: inherit` where the prototype writes the `font`
  shorthand: the family is the font port and moves no box; the shorthand carries SIZE and would shift
  text under two ratcheted baselines. If the owner wants the 17px scale, it is a deliberate change to
  the root and belongs in its own pass with the baselines re-measured.* —
  (`apps/web/e2e-viewport/responsive.spec.ts`)
- **15.32** ❌ **The desktop window sets its own `background` and `color` on `body`** — it does not.
  `apps/web/app/globals.css` gives web `background: var(--gn-surface); color: var(--gn-text)`; the
  desktop shell has no counterpart, so `body` there is the browser's white-and-black beneath whatever
  the components paint. *Found while fixing the typeface half of the same absence (15.30) and left
  undone deliberately: it is a colour question with a contrast argument attached, and that change was
  about fonts. Named rather than quietly folded in.* — (no test; owner: whoever next touches
  `apps/desktop/src/theme.ts`)
- **15.34** ❌ **The Help search field shows no border of the browser's own** — `.gn-help__search-input`
  never declared `border`, so an `<input>` kept Chrome's UA default and rendered with
  `2px inset rgb(118, 118, 118)`, measured on the live page. An `inset` border paints its right and
  bottom edges LIGHT and its top and left DARK, which is the asymmetric rim the owner saw and reported
  as *"a border on the right and bottom sides. i want it to be like the rest of the input boxes."*
  *THE DEFECT WAS A MISSING DECLARATION, which is why nothing found it earlier and why no grep could
  have: there was no wrong value written anywhere to match. It is the same UA-default trap
  `.gn-help__group-toggle` already carries a note about one control away (`border: none` there, against
  the UA's `2px outset` on a `<button>`), and the same shape as the font absences 15.28–15.33 recorded —
  an element relying on a browser default that nobody chose. The colour was not even a token: `rgb(118,
  118, 118)` appears nowhere in `tokens.ts`.*
  *The fix is `.gn-field__input`'s treatment verbatim, which is what "like the rest of the input boxes"
  names — `1px solid var(--gn-border)` on `hig`/`minimal`, and `border: none` with
  `background: var(--gn-surface-sunken)` + `box-shadow: var(--gn-shadow-sunken)` under `neo` (13.339's
  owner ruling). Only width, the 44px floor, padding and the reference's 17px type stay local. Note the
  background moved too: it was `--gn-fill-quaternary` in every style, and is now the field's own split.*
  *Unasserted for the reason 15.14–15.16 and 15.27 already record — nothing in the suite reads a
  computed style on this screen. Verified in the running dev server at 1512px, `neo`/dark, by reading
  the computed `border` before and after.* — (no test; owner: whoever next touches the help surfaces,
  with 15.27)
- **15.33** ❌ **The ticket editor's `<code>` and `<pre>` render in the product's monospace** — they do
  not, and this is where "everywhere" stops. StarterKit is configured with only `document`, `link` and
  `underline` switched off, so the `code` mark and the `codeBlock` node are both live (that file's own
  census counts their input and paste rules), while `packages/editor/src/styles/editor.css` declares
  no `font-family` at all — every code span and code block in a ticket is on whatever monospace the
  browser picked.
  *NOT fixed here, and the reason is structural rather than an oversight. That stylesheet's header
  states the boundary: `packages/editor` must not depend on `packages/ui`, so it draws every edge with
  `currentColor` rather than a token. There is no `currentColor` for a typeface. And `editor.css` is
  imported by exactly ONE module — `src/webview/entry.tsx`, the React Native WebView entry — which
  installs no token stylesheet, so a `var(--gn-font-mono)` written there would resolve to nothing
  today: with a `monospace` fallback it is a no-op that contradicts the file's own header, and without
  one it is WORSE than the status quo, because a custom property that fails to resolve makes
  `font-family` invalid at computed-value time and the code would inherit the SANS from its ancestor
  instead of the UA's monospace. Fixing it properly means deciding how that webview gets the design
  tokens at all — the same question `apps/desktop` answered with `installTheme` (15.17, 15.30) — and
  that is a larger change than a font port.* — (no test; owner: whoever next gives the editor webview
  its tokens)

*NOT covered by any test, and named rather than implied: the sidebar's CSS — its width, the
sticky behaviour (now inset 1.5rem from the viewport top rather than flush), the stacking breakpoint
below 48rem, the active row's VISUAL treatment (15.25 asserts the `aria-current` attribute; nothing
asserts the fill or the weight), the
eyebrow/pager type, and the switch's geometry. All were verified by live measurement in a real browser
across both apps and all six style×theme combinations, and none has an assertion — the same honest gap
15.14–15.16 record. `/help` is in none of the e2e-stack ratchet baselines, so nothing there could have
caught a regression either.*
*Measured values, so a later reader can tell a regression from a redesign. Active row: `--gn-accent` +
`--gn-accent-text` at 600, contrast **5.26:1 light / 7.48:1 dark** against a 4.5 floor — up from the
4.54:1 the earlier `--gn-text-accent`-on-`--gn-fill-tertiary` wash gave. Inactive rows
`--gn-text` at 15px/400 — **15.43:1 at worst idle and 11.82:1 over the `--gn-surface-sunken` hover**,
re-measured across all six style×theme combinations after the 2026-09-15 move toward the guide (it was
`--gn-text-muted` at 8.71:1). Sidebar furniture — eyebrow, group counts, caret — is `--gn-text-muted`
now rather than `--gn-text-subtle`, **7.81:1 at worst** (`hig`/light on `surfaceSunken`). Rows ~33px
tall from `0.4rem` padding on a 1.35 line box, replacing a 34px `min-height` (WCAG 2.5.8's floor is
24px), 15px text (this repo's enforced floor is 12px). `--gn-shadow-sunken` on the active row was
verified PRESENT under `neo` both themes and `none` under `hig`/`minimal` — **that declaration is
GONE** with the same move, so the active row is now fill plus 600 weight in all three styles; the
reading is kept because it is what the depressed look cost and what removing it gave back.
Scroll spy measured at five positions: exactly one row marked
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

## Notes manual & FAQ sections (owner request, 2026-09-23) — block `15.36`–`15.50`

*Allocated 2026-09-23 by the controller against `origin/release/notes` `4d12ae02` (table tip `15.35`),
for `task/help-notes`: the manual's new "§15 — Notes" section, the FAQ's new "Notes" section, the
correction of the FAQ's now-false "Finding things" claims, and (addendum, owner "yes pls") documenting
starting-status and board-card-badges in the existing sections. Cases file: this one.

- **15.36** ✅ The generated corpus carries the manual's "§15 — Notes" section (last in document order,
  its nine subsections) and the FAQ's "Notes" section (8–12 real questions) — against the real generated
  content, not a fixture — (`packages/app-core/test/help/notes-sections.test.ts`)
- **15.37** ✅ Every quoted UI string the help-notes task wrote — the notes sections (Units 1–2) AND, from
  Unit 4, the starting-status/board-badge passages it touched in §5, §8, §11 and two FAQ sections — is
  real product copy or a legitimate declared-absent worked example, checked with `check:help`'s own
  `compareAbsent` ratchet against the real `help-quoted-strings-absent.json`, not a stricter ad hoc rule
  (an earlier draft's blanket "must be in product" flagged eight pre-existing, already-baselined spans
  in the touched-but-not-authored parts of those entries as false failures). Strings are read out of the
  already-parsed content at runtime, never typed as literals in the test file itself — the file lives
  under `packages/`, inside the real gate's own haystack, and one draft of this docblock's own prose
  proved the trap by quoting a baselined example and rotting the baseline the moment the file existed.
  Mutation: alter one checked quote to an invented string → red, naming the string; verified and
  reverted 2026-09-23 — (`packages/app-core/test/help/notes-sections-quoted-strings.test.ts`)
- **15.3** (pre-existing case, re-witnessed) — the due-date correction case now pins the RE-corrected,
  scoped sentence ("This particular box will not get you a due date") rather than the wider claim Unit
  4d's `docs/manual.md` edit replaced, plus a guard against the wider claim returning — updated in the
  same commit as the manual edit it tracks (`packages/app-core/test/help/search.test.ts`).

Minted: 15.36–15.37. 15.38–15.50 remain for any further cases this lane needs.

*15.14–15.16 are honest ❌ rather than quiet omissions. What they would cover is the drawing, not the content or the search; both of those are pinned above, and the two DOM surfaces share one component so there is one thing to test rather than two. Owner: whoever next touches the help surfaces — most naturally alongside pre-launch checklist items 6 and 7, which will exercise these screens in a real viewport anyway.*

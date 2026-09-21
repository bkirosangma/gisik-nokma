# 13. The neomorphism amendment and the workspace screens — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## Task 14 of the neomorphism amendment (2026-09-09) — the style axis, the toggle, and the shared pieces

Block `13.337`–`13.347`. `packages/ui/src/tokens.ts` gains a `StyleName` axis (`hig`|`minimal`|`neo`)
beside `ThemeName`, plus `radiusOf`/`shadowValueOf` (roles `card`/`control` and `raised`/`sunken`/`overlay` —
**a fourth shadow role, `sunken-compact`, joined 2026-09-16 (block `13.411`), and a fifth, `selected`,
joined the same day (block `13.412`); see those blocks below rather than treating
this historical sentence as the current roster**);
`StyleToggle` (`apps/web/src/style-toggle.tsx`) ships beside `ThemeToggle`, neo default. That half
committed separately (`8e6c6d31`); this section is the CSS restyle of the nine shared class families
(`.gn-segmented*`, `.gn-field*`, `.gn-button*`, `.gn-refusal*`, `.gn-page-header*`, `.gn-card`,
`.gn-chip*`, `.gn-sheet*`, `.gn-avatar*` in `packages/ui/src/ui.css`; `.gn-shell__refusal`/`.gn-shell__expired`
in `apps/web/app/globals.css`) onto the two new variable families, plus the owner's pure-neo field
ruling and the positive/negative controls the amendment's rule (a)–(c) need.

**Judgment calls, recorded rather than made silently.** `.gn-workspace-list .gn-card` and
`.gn-card.gn-invite` (`globals.css:65,92`) keep their literal `12px` rather than moving to
`var(--gn-radius-card)` — they are a page-specific BUMP over the base radius (`.gn-card` was 8px, these
were 12px), and folding them in would make both rules no-ops identical to the base, losing the
double-class specificity fix `.gn-card.gn-invite` exists for (see that line's own docblock). **Flagged
for the owner: under `neo` this literal (12px) is now SMALLER than the restyled base `.gn-card`'s own
radius (20px)**, inverting the original "these are deliberately bigger" intent — Task 15 owns these
routes and is the natural place to resolve it. `.gn-founding` (`globals.css:71-79`, in the same line
range but a different class) is OUT OF SCOPE for the same reason: it is `/workspaces`' own surface, not
one of the nine enumerated families, and Task 15 owns that route.

**Two scale calls the brief's own text didn't settle, made by analogy rather than found in writing.**
The brief's Goal paragraph names `.gn-card`/`.gn-sheet`/`.gn-page-header` card-scale and
`.gn-button`/`.gn-field__input`/`.gn-chip`/`.gn-segmented__item` control-scale, but says nothing about
`.gn-refusal`/`.gn-shell__refusal`/`.gn-shell__expired`. Mapped to `var(--gn-radius-control)` by analogy
(a small inline banner reads closer to a control than a card) — **this VISIBLY changes the refusal/expired
panels' radius, 6px/6.4px → 8px under `hig`/`minimal` and → 14px under `neo`** (the shipped default), on
exactly the kind of surface this repo escalates reviewers for. `.gn-page-header__icon` → `var(--gn-radius-card)`
(14px → 16px `hig`/`minimal`, → 20px `neo`) DOES follow the brief's explicit text (page-header is listed
card-scale) and is recorded here only for completeness, not as a call.

- **13.337** ✅ Every token role (colour, radius, shadow) has a value for every (style × theme) and
  reaches `themeStylesheet()`'s own output under the right `[data-style]`/`[data-theme]` selector.
  *Mutation-witnessed: dropping `'neo'` from the style loop reddens this case by name (plus the
  OS-dark-arm test and 13.347, both checking the same removed selector from a different angle) — 225/228
  pass, 3 fail, all naming `neo`. Restored via `Edit`, checksum-verified byte-identical to the
  pre-mutation file.* — (`packages/ui/test/tokens.test.ts`)
- **13.338** ✅ Every shadow layer colour is an 8-digit alpha primitive, and no `CONTRAST_PAIRS` row
  names one — the same false-green `relativeLuminance`-ignores-alpha hazard the fill ladder's own
  docblock warns against, now checked across all three styles. — (`packages/ui/test/tokens.test.ts`)
- **13.339** ✅ Under `data-style="neo"` the empty `.gn-field__input` renders sunken and borderless —
  `border: none`, `background: var(--gn-surface-sunken)`, `box-shadow: var(--gn-shadow-sunken)` — while
  `hig`/`minimal` keep 13.291's bordered look unchanged, asserted from the SAME `rule()` helper 13.289–13.291
  use. **OWNER-ACCEPTED WAIVER (Task 14 AMENDMENT rule (a), 2026-09-09, "pure neo look"): the sunken
  shadow edge measures 1.24 (light) / 1.16 (dark), both below the 3:1 WCAG 1.4.11 floor — accepted
  knowingly, not hidden.** A positive control guards `rule()`'s substring matching: the neo selector and
  the base selector must read back DIFFERENT bodies. *Mutation-witnessed: giving the neo override a
  border reddens this case alone (227/228 pass). Restored, checksum-verified.* — (`packages/ui/test/components.test.tsx`)
- **13.340** ✅ No `[data-style="…"]` block anywhere in `ui.css` touches `.gn-button` — a positive scan
  (at least one `[data-style]` block must exist, so "found none" cannot pass by finding nothing), which
  makes 13.289's unconditional assertion the WHOLE story for every style: ghost/secondary controls keep
  fill-plus-accent-label identification in `hig`, `minimal` AND `neo` alike, never a style-specific
  override stripping it back to a boundary. — (`packages/ui/test/components.test.tsx`)
- **13.341** ✅ Dark theme, per style: `surface`↔`surfaceRaised`, `surface`↔`surfaceSunken` and
  `surfaceRaised`↔`surfaceSunken` each separate by fill at or above a LITERAL floor (never derived from
  the same `colorOf` call the assertion reads) — for `hig`/`minimal` only. **UPDATED 2026-09-10, owner:
  "revert to prototype's exact dark hex and fix the accent colour ratio instead" (the dark+neo input box
  read visibly lighter/flatter than the prototype's own screenshot).** `neo` previously carried its own
  narrower `1.20` floor here — `tokens.ts`'s `neoNavyRaised` docblock recorded a genuine collision at the
  time: lightening `neoNavy` far enough to clear hig/minimal's `1.214` floor pushed the THEN-bare `accent`
  role below the 4.5 `CONTRAST_PAIRS` guarantee it carried as text against `surfaceRaised`. **That
  collision stopped binding the same day it was written**: a same-day change split `accent` into a
  fill-only role and `textAccent` (the role actually derived to read as text), so `CONTRAST_PAIRS` no
  longer names bare `accent` on `surfaceRaised`/`surface` at all. With `neoNavyRaised`/`neoNavySunken`
  reverted to `neoNavy`, `neo` is now EXEMPT from this separation floor in dark, the same way it was always
  exempt in light (`neoPaper`, one shared hex) — a new positive case in the same describe block asserts
  `surfaceRaised`/`surfaceSunken` equal `surface` exactly for `neo`/dark. Verified empirically before the
  revert: every `CONTRAST_PAIRS` row for `neo`/dark still passes, with MORE margin, because darker
  backgrounds only help the light-toned foregrounds in play. — (`packages/ui/test/tokens.test.ts`)
- **13.342** ✅ The accessible-name ratchet (13.285–13.287) does not fall on any route and rises by
  EXACTLY the `StyleToggle`'s contribution on every signed-in route: `ariaLabel` +1, `role` +4,
  `ariaSelected` +3, `ariaDescribedby` +0 (one `tablist` + three `tab`s), measured live against the
  rebuilt dev stack on all six `stack-phone-390` keys and hand-verified identical across every one of
  them before being written back (`apps/web/e2e-stack/accessible-names-baseline.json`). The signed-out
  ratchet (`apps/web/e2e-viewport/accessible-names-baseline.json`) is UNCHANGED, byte-for-byte — verified
  by diff before AND after the live run — because `AppNav` (and therefore `StyleToggle`) never renders on
  `/help`, `/privacy`, `/terms`, `/sign-in` or the 404 (grepped: no signed-out route imports `AppNav`).
  Both suites pass with no seeding variable set. — (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-viewport/responsive.spec.ts`)
- **13.343** 🟡 **FINDING, not a pass on the plan's own terms — reported rather than forced.** The
  amendment expected `apps/web/e2e-stack/non-text-contrast-roster.json` to grow by exactly one sanctioned
  entry (the neo field input's sunken shadow edge, 1.24/1.16, citing 13.339's waiver). Measured against
  the rebuilt stack: **the roster does NOT grow — it stays at the same 6 classes, `belowCount: 0`** (only
  ratios/backdrop shifted, e.g. `input`/`select` 4.07→3.62, backdrop `rgb(242,242,247)`→`rgb(237,228,219)`
  — `border`/`borderStrong` do not vary by style, so the shift is the BACKDROP's: the adopted palette
  (Task 13) landing in the image, composed with `neo` being the DEFAULT style, which is this task's own
  doing — `rgb(237,228,219)` is `neoPaper`, not `warmPaper`). Two independent reasons, both checked rather than assumed: (1)
  `sweepBorders` (`e2e-stack/helpers/non-text-contrast.ts`) reads only `border-{side}-width/style/color` —
  it has no box-shadow compositing at all, so an element with `border: none` is invisible to it regardless
  of what its `box-shadow` does; (2) `.gn-field__input` renders only on `/workspaces` (the founding form)
  and `/sign-in` (three fields) — NEITHER is among the five routes this sweep visits
  (`/my-work`, `/p/:projectId`, `/members`, `/settings/ticket-types`, `/settings/workflows`). The waiver
  citation therefore lives only in `ui.css`'s docblock and 13.339's test comment, not in the roster file —
  **rule (a)'s waiver-SCOPE assumption (that this specific instrument would see it) was wrong; the
  ruling's SUBSTANCE (the owner accepted the sub-3:1 edge) is unaffected.** The roster file itself is
  updated to the freshly measured (unchanged-membership) state; no entry was invented to match the
  plan's prediction. **Owner/controller: decide whether this needs its own instrument, an explicit
  roster-exemption line, or stands as documented and sufficient.** — (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-stack/helpers/non-text-contrast.ts`)
- **13.344** ✅ (retitled a FOURTH time, 2026-09-15: back to `SegmentedControl`, on an owner
  reference image for the Appearance card. The full identity chain is `SegmentedControl` → plain
  `<select>` → shared `Select` → `SegmentedControl`; Phase 2 Wave A's invariant that no native
  `<select>` remains in scope is untouched, since a segmented picker is not a native select — this
  control simply stopped being a `Select` call site.) `StyleToggle` renders one labelled control —
  a `role="tablist"` named `Style` holding 3 `role="tab"` entries, **`Apple HIG`/`Minimal`/
  `Neomorphic`** (the labels changed with the reference, from `HIG`/`Minimal`/`Neu`) — with
  `data-style` landing on `document.documentElement` when a choice is made, and a line beneath the
  control naming the selected style. That description line has its own case: it must TRACK the
  selection, asserted by switching and reading again, because fixed copy would satisfy any
  single-state assertion. Mutation: drop the control's `aria-label` → RED (the lookup is by that
  name); hard-code the description → RED on the second read. —
  (`apps/web/test/style-toggle.test.tsx`)
- **13.345** ✅ With nothing stored, the applied `data-style` is `neo` — witnessed as
  `aria-selected="true"` on the `Neomorphic` tab (retitled 2026-09-15 with the return to
  `SegmentedControl`; previously the `Select` trigger's own visible label text, and before that a
  native `<select>`'s `value`). *Mutation-witnessed here:
  defaulting the component's initial state to `hig` reddens this case (plus 13.344's broader render
  check, which also asserts the default) — 2/4 fail in `style-toggle.test.tsx`. Restored, checksum-verified.* — (`apps/web/test/style-toggle.test.tsx`)
- **13.346** ✅ A stored style choice survives a reload — asserted the same way `ThemeToggle`'s
  persistence is, a fresh mount restoring from `localStorage` rather than drifting from what
  `layout.tsx`'s pre-paint script already applied; witnessed via the selected `role="tab"`
  (retitled 2026-09-15 with the return to `SegmentedControl`; previously the shared `Select`
  trigger's own visible label text, and before that a native `<select>`'s `value`). —
  (`apps/web/test/style-toggle.test.tsx`)
- **13.347** ✅ The positive control the axis needs: switching style changes a WITNESSED rendered value,
  not two numbers that merely differ in memory. `hig` and `neo`'s `raised` box-shadow both appear in
  `themeStylesheet()`'s own output under their own declaration (reusing 13.337's machinery) and the two
  values differ. *Mutation-witnessed with its OWN, narrower mutation than 13.337's (equalising ONLY
  `neo.light.raised` to `hig.light.raised`, not removing the whole style): reddens this case ALONE,
  227/228 pass. Restored, checksum-verified.* — (`packages/ui/test/tokens.test.ts`)

> **Live-suite method, recorded because it is not obvious from the baseline JSON diffs alone.** Both
> `accessible-names-baseline.json` files were backed up to a scratch directory before any live run. The
> stack baseline's six keys were verified to hand-derive the identical per-route delta
> (`+1/+4/+3/+0`/`ariaLabel`/`role`/`ariaSelected`/`ariaDescribedby`) by clearing the file to `{}` and
> re-running with `UPDATE_ACCESSIBLE_BASELINE=1` (which writes ABSENT keys only, so a cleared file
> re-records every key from the live DOM rather than from a guess), then diffing the fresh numbers
> against the backup — a stronger proof than trusting a `>=` check that cannot print what it actually
> measured. The viewport baseline was left untouched and diffed byte-identical before/after. The dev
> stack was rebuilt from this branch's working tree (`docker compose -f docker-compose.dev.yml up -d
> --build --wait web`) before either suite ran, so the measurements are against Task 14's actual CSS, not
> a stale image.

## Task 15 of the neomorphism amendment (2026-09-09) — sign-in, workspaces and invite restyled in neo

Block `13.348`–`13.357`. The amendment reserved `13.348`–`13.356` for this task; the plan's own case list
(§ "Task 15", `docs/superpowers/plans/2026-09-08-hig-per-screen.md`) uses `13.348`–`13.354`. `13.355` and
`13.356` close the two judgment calls Task 14's own section (above) flagged and explicitly declined to
resolve, naming Task 15 as the owner of both. `13.357` — one past the reserved block, the amendment's own
"next free" pointer — is the additions table's one owner-approved invented row (role labels on workspace
cards), requested and used provisionally per this file's standing convention: serial mode has one executor
and therefore no other claimant, and an unmerged id can still be renumbered. ~~**The next free BLOCK is now
`13.358`** (this PR carries the header, per the standing §12/§13 rule that the first PR minting from a
block does so) — recount the maximum in use against `origin/main` before trusting this pointer.~~
~~**`13.358`–`13.365` is CONSUMED by Round 2d, the owner's `/sign-in` neo design feedback (controller,
2026-09-09) — see that section at the foot of this file. The next free BLOCK is now `13.366`,
controller-allocated ON REQUEST ONLY**~~ — `13.358`–`13.365` is consumed by Round 2d as stated, and
**`13.366`–`13.389` is ALLOCATED to the owner's `/workspaces` cluster, Tasks 16–19 of the neomorphism
amendment (controller, 2026-09-09): `13.366`–`13.372` minted by Task 16 (this PR), `13.373`–`13.378`
reserved for Task 17, `13.379`–`13.383` for Task 18, `13.384`–`13.389` for Task 19. The next free BLOCK
is `13.390`, controller-allocated ON REQUEST ONLY** — recount the maximum in use against `origin/main`
before trusting this pointer, same caveat as every prior one in this paragraph. **Recounted at
`1417580` for Task 16's PR: the maximum id in use was `13.365`, and `13.366` appeared only in the pointer
prose above. Recounted again at `02641cb` for TASK 17's PR: the maximum in use was `13.372`, and every id
from `13.373` to `13.389` occurred ONLY in reservation prose — this file's paragraph here, the plan's Task
17 line, and the two lane state files — file-by-file, four hits for `13.373` and four for `13.378`, none of
them a case. Both documented traps reproduced again: the ordinal sweep still reports `13.3333` as its
maximum, and it also surfaces `13.9999` and a `13.632866`-shaped hit, none of which are case ids.** Both documented traps were reproduced rather than avoided by memory — a bare
`13\.[0-9]+` sweep still reports `13.3333` (the user-agent font size cases 13.266–13.267 are about) as
its maximum under an ordinal sort, and a float sort still puts `13.99` above `13.365`.

**`13.390`–`13.399` is CONSUMED by Round 19b, the owner's feedback on the workspace screens (controller,
2026-09-09) — see "Round 19b" at the foot of this file. The next free BLOCK is now `13.400`,
controller-allocated ON REQUEST ONLY** — recount the maximum in use against `origin/main` before
trusting this pointer, same caveat as every prior one in this paragraph. **Recounted at `b47f0253`
(this branch's own merge-base) before minting: the maximum id in use was `13.389`; `13.390` occurred
only in this pointer's own prose, reproducing the documented trap once more.**

**CORRECTED 2026-09-15 — the pointer above was already stale.** `13.400`–`13.402` were minted the same
day as owner-direct commits on `owner/workspace-edits` (the segmented-control sunken-selection restyle,
13.400–13.401, and the floating app bar, 13.402) without going through this paragraph's own
controller-allocation ritual — an owner editing the primary checkout does not queue behind it. Recounted
at HEAD (`d904efab`, this branch's own tip before Task 10) before minting: the maximum id in use was
`13.402`. **The workspaces-prototype-port plan's Task 10 (catalogue consolidation, 2026-09-15) mints
`13.403`–`13.410`** for the eight test-cases debts its own task brief names by description — two
uncased composite-contrast blocks in `packages/ui/test/tokens.test.ts`, the `projectLine` boundary unit
tests, the summary-line refusal/empty-read cases, the rendered project-line truncation case, and three
whole new test files (`workspace-restricted-spacing.test.ts`, `workspace-list-role-pin.test.ts`, and the
Task 8 fix-round-1 block in `workspaces-invitation-banner.test.tsx`) — see each entry below for the exact
mapping.

**CORRECTED 2026-09-16 — recounted before minting, per this paragraph's own ritual.** A coordinator
review of the `sunken-compact` shadow-role fix (owner round 3) stated the next free id as `13.412`; a
repo-wide grep for every `13.4\d\d` occurrence at this branch's HEAD found the true maximum IN USE was
still `13.410` (the `13.411` hit was this pointer's own prose, reproducing the exact trap this file's
"CORRECTED 2026-09-15" paragraph above already documented once). **`13.411` is minted below** for the
`sunken-compact` role and its `.gn-chip`/`.ticket-type-list__badge` call sites. **`13.412` is minted below**
for the `selected` shadow role. **`13.413` is minted at the foot of this file** for Round 20, the
workspace-home prototype port. **The next free BLOCK is now `13.416`.**

**What did NOT need new CSS.** Task 14 already made the shared component classes this route reuses
(`.gn-card`, `.gn-field`, `.gn-button`, `.gn-segmented`, `.gn-page-header`) variable-driven, and `neo` is
the toggle's default — so `/sign-in`, `/workspaces` and `/invite/<token>` already rendered in neo the
moment Task 14 merged, with no page-specific rule to write. **What DID need fixing were two radius
inversions Task 14's cascade change exposed** (13.355) and a real, previously-undocumented specificity
landmine 13.355 found while auditing the first two: `.gn-sign-in`'s own literal `border-radius: 16px` ties
`.gn-card`'s token-driven radius at identical specificity and wins ONLY because `layout.tsx` imports
`globals.css` after `ui.css` — the exact hazard `.gn-card.gn-invite`'s (now-removed) doubled class used to
guard against, on a selector nobody had audited for it. No markup changed on `/sign-in` or `/invite/<token>`
at all; `/workspaces` gained one new element (the role label, 13.357).

- **13.348** ✅ `/sign-in` still renders every method the server offers and no control it refuses (13.292's
  property) — unaffected by a CSS-only restyle with zero markup changes to this page in this task.
  Continuously asserted by the pre-existing suite. — (`apps/web/e2e-viewport/responsive.spec.ts`,
  `apps/web/test/sign-in.test.tsx`)
- **13.349** ✅ `/workspaces`' three-state machine (13.298–13.300: loading / refusal / empty, and the 401
  settle on `/sign-in`) is unchanged — the only markup edit this task made to this page is additive (the
  13.357 role label, inside the populated-list branch), and deletes no state. Continuously asserted by the
  pre-existing suite. — (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/test/workspaces-cards.test.tsx`,
  `apps/web/test/founding.test.tsx`)
- **13.350** ✅ Accessible-name floors on `/sign-in` and `/workspaces` do not fall — both already carry a
  one-way ratchet (`apps/web/e2e-viewport/accessible-names.ts`'s `RATCHETED` baseline; `/sign-in` in the
  signed-out suite, `/workspaces` in the signed-in stack suite since Task 4) and both suites stayed green
  through this task with baselines unchanged (the 13.357 role label is a `<p>`, which carries no
  accessible name of its own to ratchet). `/invite/<token>`'s floor was and remains a KNOWN RESIDUAL GAP
  in the signed-in ratchet (no standing invite token in the stack seed, recorded at
  `apps/web/e2e-stack/viewport.spec.ts:375` since Task 4) — untouched by this task, and its markup is
  byte-identical (13.353), so nothing here could have moved it either way.
  — (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-stack/viewport.spec.ts`)
- **13.351** ✅ Tap-target and type-scale ratchets do not fall on `/sign-in` or `/workspaces` — both
  routes' baselines are unchanged by this task (both suites re-run green, no `UPDATE_*_BASELINE` set).
  — (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-stack/viewport.spec.ts`)
- **13.352** ✅ The Back control on `/privacy` and `/terms` survives — this task touches neither
  `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx` nor `apps/web/src/back-button.tsx` at
  all (verified: `git diff 73e189de.. -- apps/web/app/privacy apps/web/app/terms apps/web/src/back-button.tsx`
  is empty), and both routes remain inside the signed-out accessible-name sweep that would catch a
  regression there. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.353** ✅ `apps/web/app/invite/[token]/page.tsx` markup is byte-identical — no hunk touches this
  file in this task (verified the same way as 13.352). The invite surface's neo look is entirely CSS over
  existing markup, continuing the Task 4a precedent. — (`git diff` against this task's own commits)
- **13.354** ✅ The stack suite signs in through the restyled `/sign-in` and reaches `/workspaces` — **6/6**,
  witnessed live against the web image rebuilt from this task's frozen head (`docker compose -f
  docker-compose.dev.yml build web && up -d --wait web`). See the live-run note below.
  — (`apps/web/e2e-stack/smoke.spec.ts`, `apps/web/e2e-stack/viewport.spec.ts`)
- **13.355** ✅ No page-specific literal `border-radius` competes with `.gn-card`'s own
  `--gn-radius-card` token on `.gn-workspace-list .gn-card`, `.gn-card.gn-invite` (rule deleted) or
  `.gn-sign-in` (property removed) — a SOURCE scan, because the fix is the absence of a competing
  declaration. `.gn-founding` is excluded on purpose: it is not a `.gn-card` sibling, and Task 15 gave it
  `var(--gn-radius-card)` explicitly rather than deleting a rule. *Mutation-witnessed live against the
  real file (not only the in-memory self-test): reintroducing `.gn-card.gn-invite { border-radius: 12px; }`
  reddens this case's `.gn-card.gn-invite` assertion ALONE, 3 pass / 1 fail; restored via
  `git checkout HEAD --`, re-verified 4/4 green.* — (`apps/web/test/neo-card-radius.test.ts`)
- **13.356** ✅ The non-text-contrast sweep (case 13.283) now visits `/sign-in` and `/workspaces` — the two
  routes `.gn-field__input` actually renders on, and therefore the two routes case 13.339's neo pure-look
  waiver actually lives on, which the sweep never looked at before (Task 14's own 13.343 finding: neither
  route "is among the five routes this sweep visits"). The sweep still cannot compute a `box-shadow`'s
  contrast ratio (`sweepBorders` composites `border-{side}-*` only, by design), so this does not become a
  fifth measured route in the ordinary sense: a live DOM check on each route confirms the field genuinely
  has `border: none` and a non-`none` `box-shadow` (grounding the waiver's premise against THIS tree
  rather than trusting Task 13's report unverified), and Task 13's own measured numbers (1.24 light / 1.16
  dark) are then recorded as a SANCTIONED entry in the persisted roster — appended after `below` is
  computed, so it can never trip the zero-below-3 assertion, since that assertion is about what this
  instrument measured and this number is cited, not remeasured. **Witnessed live**, against the rebuilt
  image: both DOM checks passed (`border: none` and a real `box-shadow` on `/sign-in` and `/workspaces`),
  the roster now sweeps 7 routes (19 elements examined, unchanged — no bordered element exists on either
  new route), `belowCount: 0`, and `non-text-contrast-roster.json`'s `sanctionedWaivers` carries exactly
  the entry above. — (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-stack/helpers/non-text-contrast.ts`)
- **13.357** ✅ `WorkspaceRef` gains `role`; `mapWorkspaceRefs` reads it (`GET /v1/me/workspaces` has
  disclosed `role` since the route first answered, per its own docblock — only the client-side read was
  missing) and each `/workspaces` card renders its own caller role. The additions table's one
  owner-approved invented row on this screen; the other seven I-rows the audit found (member counts,
  avatars, chips, the invitation banner, Help/Account nav) stay unbuilt because no data exists for them.
  *Mutation-witnessed live against the real file: removing the rendered `<p className="gn-workspace-list__role">`
  line reddens exactly the 13.357 assertion in `workspaces-cards.test.tsx`, leaving 3.153/3.154 green;
  restored via `git checkout HEAD --`, re-verified 3/3 green.* *(Historical: 3.154 was later removed —
  see `test-cases/03-foundation-ledger.md`'s 🚫 entry, workspaces-prototype-port Task 10, 2026-09-15 —
  because the per-project rows its testid keyed no longer render. This mutation record is unaffected;
  it reports what the tree looked like at the time.)* A second refusal at the mapper level pins
  the same property one layer down: a body with no `role` key throws `MappingError` rather than
  defaulting one. — (`apps/web/test/workspaces-cards.test.tsx`,
  `packages/app-core/test/online/mappers.test.ts`)

> **Live-run note (13.354, 13.356).** The web image was rebuilt from this task's frozen head
> (`docker compose -f docker-compose.dev.yml build web`), the container recreated
> (`up -d --wait web`), and both suites run against it. `test:e2e:stack`: 6/6 (smoke ×2, the
> signed-in no-sideways-scroll check, the 12px label-text floor across 7 routes, the non-text-contrast
> sweep with its 1 sanctioned waiver, and the guest partial-workspace visibility case). `test:e2e:viewport`:
> 28/28 passed, 2 skipped (the two viewport-comparison cases this suite always skips outside its own
> three-viewport matrix run). Neither `accessible-names-baseline.json` file changed
> (`git status` clean on both after the run — `UPDATE_ACCESSIBLE_BASELINE` was never set), so "baselines
> only upward" holds trivially: nothing moved. `non-text-contrast-roster.json` is the one file the run
> changed, and its diff is committed alongside this catalogue entry.

## Round 2d of the neomorphism amendment (2026-09-09) — sign-in neo design feedback

Block `13.358`–`13.365`. The owner's post-Task-15 review found `/sign-in` did not fully match the neo
design reference (`design-system/interactive/desktop.dc.html`'s signin screen and `:root`/
`body[data-style="neo"]` token blocks) on eight points; this round closes all eight. **The largest single
finding widens the change beyond `/sign-in` itself:** `tokens.ts` already declared `{ fg: 'accent',
bg: 'surface'/'surfaceRaised', minimum: 4.5 }`, and the owner's neo-round accent hexes
(the light one, `#7FA9E4` in dark) measured 4.19–4.30 as TEXT on those same backgrounds — below that floor, though
comfortably above it as a FILL (5.25+ against `accentText`). A new role, `textAccent` — the
`text`/`textMuted`/`textInverted` family, and explicitly NOT `accentText` (its opposite: colour ON an
accent-filled surface, not accent-hued text ON a neutral one) — carries the guarantee instead, derived to
clear 4.5 against every surface/raised background in every style, the `.gn-button--ghost`
fillTertiary-composited background, AND `surfaceSunken` (beyond what the two declared rows strictly
require, at zero extra cost — see `tokens.ts`'s `textAccentLight`/`textAccentDark` docblocks for the exact
derivation and margins). `blue600`/`blue300` are retired in place to the new hexes (`focusRing`/
`categoryActive` share them and are re-verified at their own 3:1 floor). A new pairless `brand` role
(`brandOrange` `#ee7733`) fills the sign-in icon tile with the prototype's one fixed hue, exempted from a
`CONTRAST_PAIRS` row with the measured number recorded rather than hidden (2.69 light, `textInverted` on
`brand` — below even 3:1, for a purely decorative `aria-hidden="true"` glyph the export itself renders the
same way).

- **13.358** ✅ The `brand` role: one primitive (`brandOrange`), both themes, no `STYLE_COLOR_OVERRIDES`
  entry — `themeStylesheet()` emits the identical literal `--gn-brand: #ee7733;` under both `:root` and
  `[data-theme="dark"]`, pinned as a hardcoded string rather than derived from the same function under
  test. `.gn-page-header__icon` fills with `var(--gn-brand)` and labels with the existing `textInverted`
  role (not a new one) rather than `accent`/`accentText`. *Mutation-witnessed: planting a wrong
  `brandOrange` hex reddens exactly the three `brand`-suite cases (200/203 pass); restored,
  re-verified 203/203 green.* — (`packages/ui/test/tokens.test.ts`)
- **13.359** ✅ The text ladder (`text`/`textMuted`) on `/sign-in` — unchanged values, confirmed still
  wired: `.gn-sign-in__hint`/`.gn-sign-in__legal` and `.gn-page-header__tagline` read `--gn-text-muted`,
  a SOURCE scan rather than a rendered one (jsdom applies no stylesheet — see 13.362's own docblock for
  why that gap matters here too). — (`apps/web/test/sign-in-neo-restyle.test.ts`)
- **13.360** ✅ `textAccent`'s derivation and the two renamed `CONTRAST_PAIRS` rows (`accent` →
  `textAccent` on `surface`/`surfaceRaised`), plus the retired accent hex measured in both directions: it
  no longer clears 4.5 as text on a bare light surface, and dark clears the two declared rows unaided.
  **UPDATED 2026-09-10 (see 13.341's own update, same day): the third check — `accent` against
  `neoNavySunken` specifically — used to fail at 4.11, which was WHY `.gn-help__result-title` (rendered on
  `surfaceSunken`) moved to `textAccent` rather than staying on `accent`. Reverting `neoNavySunken` to
  `neoNavy` flips that ONE assertion: `accent` now clears 4.5 there too (≈6.39), a changed FACT rather
  than a claim this case still needs to hold the old way.** `accent` still carries no formal guarantee on
  a sunken background — nothing derives it to — so `.gn-help__result-title` stays on `textAccent`
  regardless. `accentText` on the new `accent` still clears 4.5 in both themes, unnudged (dispatch item
  10, verified rather than assumed).
  *Mutation-witnessed: reverting `textAccentLight` to an intermediate value that clears the two declared
  rows but not the ghost-button composite reddens exactly three cases (200/203 pass) — the pinned-hex
  case, the composite/sunken case, and 13.284's own label-contrast case one describe block up, which is
  the live CSS site this derivation exists to protect; restored, re-verified 203/203 green.* — (`packages/ui/test/tokens.test.ts`)
- **13.361** ✅ Sign-in markup/CSS fidelity to the export. **Dispatch item 4 (card width/padding, field/
  button/segment geometry) needed no fix, confirmed rather than assumed**: card `26rem`/`1.5rem` padding
  already equal the export's `416px`/`24px`; `.gn-field__input`/`.gn-button` `2.75rem` min-height already
  equals the export's `44px`; neo's control radius (`14px`) already equals the export's `--ctlR`; the
  primary button's full width comes for free from `.gn-sign-in__method`'s `flex-direction:column`
  (default `align-items:stretch`). Task 14/15 already landed this; nothing here reopens it. What DID need
  fixing, four small items: (1) `.gn-sign-in__mark`
  widens to `min-width:56px` (was 44px) and, under `[data-style="neo"]` only, takes a raised
  neumorphic-square treatment (`background:var(--gn-surface)`, `box-shadow:var(--gn-shadow-raised)`) —
  `hig`/`minimal` keep the flat ghost fill unchanged, matching the export's own hig rendering of this
  screen; (2) the email input gains the export's `placeholder="you@example.com"` verbatim, an ADDITION
  since the shipped field had none; (3) the footer's Terms/Privacy links underline on hover and
  focus-visible — a deliberate departure from the export's colour-and-opacity-only affordance
  (`a:hover,a:focus-visible{text-decoration:none;opacity:.68}`), because WCAG's "more than colour alone"
  is not satisfied by an opacity shift on the same hue — and pick up the branded `--gn-focus-ring` outline
  they previously lacked; (4) `.gn-notfound__link`, which SELECTOR-OVERRIDES the global `a` rule at equal
  specificity, is moved to `--gn-text-accent` alongside it — fixing only the global rule would have left
  this one page's recovery links on the retired, now text-unsafe `--gn-accent`. *Mutation-witnessed:
  reverting `.gn-notfound__link`'s `color` to `var(--gn-accent)` reddens exactly one case in this file
  (8/9 pass); restored, re-verified 9/9 green.* — (`apps/web/test/sign-in-neo-restyle.test.ts`,
  `apps/web/test/sign-in.test.tsx`)
- **13.362** ✅ The derived segmented control, witnessed live under `data-style="neo"` — a standalone
  Playwright case (not inside the signed-out `UNAUTHED_ROUTES` sweep, so it cannot move that sweep's
  accessible-names baseline) drives `/v1/auth/methods` to `phone:true`, confirms the page actually
  rendered under `neo` (positive control), renders the control with both tabs and correct
  `aria-selected`, then reads BOTH the declared value (`--gn-fill-tertiary` on the root resolves to
  `neo`'s own hex, `#b0988429`, not `hig`/`minimal`'s) and the RENDERED one (the selected tab's own
  `box-shadow`, distinguished from `hig`'s by shape — two layers, a 16px blur — not mere non-`none`-ness,
  since `hig`'s own raised shadow is also non-`none`). This does not reopen the phone-tab removal
  decision (2c's ruling stands, reaffirmed by the owner 2026-09-09): `phone` availability is still fully
  DERIVED from the (here, stubbed) `/v1/auth/methods` response — this case changes only what the stub
  answers, not the page's own gating logic — and it is a style witness only, run against a fresh browser
  context where nothing is stored. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.363** ✅ The accessible-name floor on `/sign-in` does not fall — no role or label changed in this
  round (the only markup edit is the email placeholder, which carries no accessible name of its own), and
  13.362's phone:true witness runs OUTSIDE the `UNAUTHED_ROUTES` sweep specifically so it cannot move the
  baseline that ratchet reads. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.364** ✅ Both viewport suites (`test:e2e:stack`, `test:e2e:viewport`) pass against the dev stack
  rebuilt from this round's frozen head, `--env-file` included so Google sign-in stays configured (Task
  14's rebuild dropped it; not repeated here). See the live-run note below. — (`apps/web/e2e-stack/viewport.spec.ts`,
  `apps/web/e2e-viewport/responsive.spec.ts`)
- **13.365** ✅ The non-text-contrast roster does not grow — a straightforward re-assertion, not a new
  waiver: this round adds no new sub-3:1 pairing the roster's own instrument can see (`sweepBorders` reads
  only `border-{side}-*`, and none of this round's changes touch a border). **This is narrower than "no
  new sub-3:1 pairing exists" — case 13.358 records one this instrument cannot see**: the page-header
  icon's `textInverted`-on-`brand` measures 2.69 in light, an exempted decorative-glyph pairing with no
  `CONTRAST_PAIRS` row and no box/border for the roster to sweep. Recorded as an open item with an owner
  (this catalogue entry), not silently absorbed into "the roster is unchanged". See the live-run note
  below for the measured roster diff.

> **Live-run note (13.364, 13.365).** The dev stack was rebuilt with `docker compose --env-file
> /Users/kiro/my_projects/gisik-nokma/.env -f docker-compose.dev.yml up -d --build --wait web` (the
> `--env-file` form, per this round's own dispatch — Task 14's plain `up -d --build --wait web` had
> dropped Google sign-in's env vars). `curl -s localhost:3000/v1/auth/methods` confirmed
> `{"google":true,"apple":false,"phone":false}` before either suite ran. `test:e2e:viewport`: **31
> passed, 2 skipped** (the two viewport-comparison cases this suite always skips outside its own
> three-viewport matrix run), including 13.362 on all three viewport projects. The suite's own console
> output confirms the derived hexes live in a real browser: `.gn-button--primary` (white on the new
> accent) measures **5.26:1** — matching the computed 5.258 — and `.gn-help__toc-link`/
> `.gn-notfound__link`/`.gn-legal__back` (all now `textAccent`) measure **5.31:1** and **4.75:1** on
> their respective backgrounds, `rgb(50,93,151)` being `#325d97` (`textAccentLight`) rendered. `failures=0`
> on every route's contrast sweep. `test:e2e:stack`: **6/6** (both smoke cases, the signed-in
> no-sideways-scroll check, the 12px label-text floor across 7 routes, the non-text-contrast sweep, the
> guest partial-workspace visibility case). The non-text-contrast sweep's own summary line: **"0 of 6
> distinct bordered classes below 3:1 (19 bordered elements examined across 7 routes; ... 1 sanctioned
> waiver(s) recorded separately)"**. `non-text-contrast-roster.json` is written UNCONDITIONALLY by every
> run of this sweep (`viewport.spec.ts`'s own `writeFileSync`, not gated behind an `UPDATE_*` flag the
> way the three baseline files below are) — so a clean `git status` on it after this run is a direct
> byte-for-byte match against whatever this branch already had committed (Task 15's last write, since
> nothing has touched this file since), not merely "the printed shape looks the same". That is the
> evidence for 13.365's "the roster does not grow": this round's live measurement reproduced the
> committed file exactly, ratios and border/backdrop strings included (rounded to 2 decimals by the
> sweep itself — a sub-hundredth drift in an unrounded ratio would not show here, which is a real but
> immaterial limit on what "byte-identical" can claim for a membership/count property).
> `git status` on both `accessible-names-baseline.json` files and both `tap-baseline.json`/
> `type-scale-baseline.json` files was ALSO clean after both suites ran — those four are gated behind
> `UPDATE_*` flags that were never set, so a clean status there means "no operator asked to move the
> baseline", the weaker but still relevant claim for 13.363 (no floor moved) that this run neither needed
> nor attempted a baseline update.


## Task 16 of the neomorphism amendment (2026-09-09) — `/v1/me/workspaces` real counts, archived, visibility-scoped

Block `13.366`–`13.372`. The owner's `/workspaces` reference shows member counts, per-project ticket and
blocked chips, archived projects, and a GUEST card carrying no numbers at all. This task is **server-first**
— the card that renders any of it is Task 18. What it builds: `memberCount` per workspace and
`{ticketCount, blockedCount, archived}` per project on `GET /v1/me/workspaces`, a new `proj_projects.archived`
column folded from a new `project.archived`/`project.restored` event pair, and the mapper that reads them.

**The premise this task was dispatched on was already stale and is recorded as corrected rather than acted
on:** the owner brief's *"`getMyWorkspaces` REFUSES whole"* was true in the Plan 5/6 era and was closed by
rulings P32/P38. The route SERVES `{workspaceId, name, role, projects}` today. There was no refusal to fix;
the gap was the counts.

**The one rule under all seven cases: every number is the CALLER'S number, and a number the caller may not
count is ABSENT rather than zero.** Three ways these checks could have passed for the wrong reason, each
closed by the fixture rather than by an argument:

1. *A visibility-scoped count and a whole-table count are the same number when every fixture ticket is
   visible to everybody.* 13.368 seeds a ticket in the member's own project with an explicit audience
   naming only the owner, and asserts the member's count is STRICTLY LESS than the raw `proj_tickets`
   count while the owner's EQUALS it.
2. *A blocked count and a ticket count are the same number when every seeded ticket is blocked.* 13.369's
   project holds one blocked and two unblocked tickets, both unblocked ones in an `active` state — which
   also pins that `blocked` is not derived from `category === 'active'`.
3. *`absent` and `0` are the same to any assertion written `toBe(0)` or `?? 0`.* 13.366 and 13.372 assert
   on KEY PRESENCE (`'memberCount' in entry`), each against a positive control in the same run.

- **13.366** ✅ A guest is served no count at all — `memberCount` and both per-project count keys are
  ABSENT from the wire, not 0 — while name, role and the visibility-scoped project list are unchanged.
  Two shapes, because the withholding has to hold in both: a guest on NO project (whose project list is
  empty anyway, so the counts have nowhere to appear) and a guest who DOES hold a project-scope row and is
  therefore told that project's name and its `archived` flag and still no counts. The positive control is a
  member of the same workspace, in the same run, who has the keys — without it, a route that had stopped
  serving counts to everybody would pass. Mutation witness: permitting the guest branch in
  `visibleMemberCount` / `visibleProjectCounts` reddens this case and nothing else.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.367** ✅ `memberCount` equals exactly what `readMembers` would list for the same caller, asserted
  class by class (owner 4, admin 4, member 3 over a fixture of owner+admin+member+guest), and a guest
  resolves `null`. The cross-check is the point: the count and the directory are two expressions of one
  rule — a plain member's roster hides the guest, so a naive `COUNT(*)` would have told them the withheld
  person exists. Either half alone passes for the wrong reason (three constants notice no roster drift; an
  agreement check alone agrees vacuously on two implementations wrong in the same direction), so both run.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.368** ✅ `ticketCount` counts what THIS caller may see: strictly less than the raw `proj_tickets`
  count for a member outside a ticket's audience, and equal to it for the owner — the owner half being what
  proves the `proj_visibility` INNER JOIN drops nothing, so the smaller number is a SCOPE and not a bug.
  A sibling asserts an explicit `0` (key PRESENT) for a project a caller can name and has no visible work
  in, which is a claim they are entitled to and a different answer from "restricted". **A third case, added
  after an opus review found the SURVIVOR the first seven mutations missed**: neutralising the query's
  `v.workspace_id = $n` left every case green, because the route reads `counts.get()` only for the ids
  `visibleProjects` returned and `project_id` is a global primary key — from a client's side the tenancy
  clause is invisible. The world that can see it is the INTERNAL door's, where no existence check runs: a
  ticket committed under workspace B can carry workspace A's `project_id`. The case seeds exactly that, and
  asserts the raw table holds TWO rows for the id while A's owner counts ONE — so the `1` cannot be read as
  "the fixture only made one". Mutation-witnessed: the clause's removal now reddens this case ALONE.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.369** ✅ `blockedCount` counts tickets in a state its own workflow flags `blocked: true` and nothing
  else: three tickets, one blocked, two in a different `active` state, and the two numbers must differ.
  The definition is `BLOCKED_STATES_CTE`, imported from `read/compile-filter.ts` rather than restated, so
  the card counts by the same expression as the board, the list and the attention strip.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.370** ✅ `archived` is a fold of the new event pair, and only an owner or admin may claim it. The
  REFUSAL is asserted FIRST, so the later success cannot be mistaken for a gate that never ran: a plain
  member who is ON the project is refused, the flag is unmoved, and the project is still served to them
  unarchived. Then an owner archives (flag true, served true, and the member — whose access archiving does
  not touch — is served true as well), and `project.restored` returns it to false. A second case pins the
  two refusals the event pair inherits: an archive naming a project nobody founded is told the project does
  not exist (both types are in `projectsNamedBy`), and an empty `.strict()` payload refuses a body that
  names a project rather than ignoring it. **All three refusals name their RULE, not only their status** —
  `permission.role`, `project.unknown` (where `permission.role` would mean the existence check stopped
  running first, since that caller IS an admin) and `invalid`; a refusal for some other reason would satisfy
  a bare `status: 'refused'` while proving nothing about the gate the case is named for. **A note lives at
  the payload case because it will mislead the next person**: mutating `.strict()` in
  `packages/domain/src` proves nothing here — `@gisik-nokma/domain` exports `./dist/index.js` and
  `apps/server` has no src alias, so the server loads the BUILT artifact. Measured: the src edit leaves
  9/9 green, the same edit in `dist` reddens this case alone.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.371** ✅ The shape the directory already served is unchanged for a member — the whole entry asserted
  with `toEqual`, so a future change that quietly dropped `role` or renamed `workspaceId` fails here, and
  so that the additions are pinned as ADDITIONS. — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.372** ✅ `mapWorkspaceRefs` keeps WITHHELD and a counted zero apart: an absent count maps to `null`
  and a present `0` maps to `0`, both in one body, so neither the `?? 0` bug nor its mirror (a truthiness
  check collapsing a real zero to withheld) survives. A count that is present and not a number — `null`,
  a string, a boolean — is a `MappingError` rather than a second spelling of withheld, because guessing
  which of the two claims a server meant is the invention this mapper exists to refuse. `archived` is
  REQUIRED, with a positive control on the same body. — (`packages/app-core/test/online/mappers.test.ts`)

> **One thing this task does NOT build, escalated rather than decided.** The task text asks for a
> "visible/restricted count" of the projects a caller may not name, so Task 18 can render *"1 project ·
> name restricted"*. `mapWorkspaceRefs`' own docblock forbids exactly that — *"there is deliberately no
> 'and N more', because the COUNT would itself be the disclosure the rule withholds"* — and the task text's
> own "escalate before a new rule" clause fires on the conflict. The field is strictly additive and its
> absence blocks nothing in this PR; the question, with three options and the asymmetry that decides them,
> is at `docs/lanes/owner-question-restricted-project-count.md`. **Task 18's card string has no data source
> until it is answered.**


## Task 17 of the neomorphism amendment (2026-09-09) — caller-scoped invitations, and Decline

Block `13.373`–`13.378`. The invite surface Plan 4 Task 14 shipped is **admin-and-token shaped**, measured
before a line was written: an admin mints, an admin lists their own workspace's pending ones, and anybody
holding a link can read it and accept it. Two things were therefore missing and this task builds both — a
**caller-scoped read**, so a person who lost the email can still discover they were invited, and **Decline**,
which existed nowhere in the product: the only exits from `pending` were an acceptance or an admin's
revocation, so saying no was not expressible.

**The dispatch said Accept must reuse `/v1/invites/:token/accept` and not be reimplemented. It cannot be
called from a banner, and the reason is a measured property of the design rather than an oversight:**
`invite_tokens` stores `sha256(token)` and the raw token exists in exactly one place for exactly one moment
— the body of the 201 that minted it. A caller-scoped list has no token to serve and could not be given one
without changing how invitations are stored. So the flow is not reimplemented, it is SHARED:
`apps/server/src/invites/acceptance.ts` holds the whole acceptance sequence once, moved verbatim with its
reasoning, and the two doors differ only in the proof they demand — **possession of the link**, or **a
verified email equal to the address the invitation names**. The second is strictly the NARROWER (a forwarded
link admits somebody the invitation never named; a verified address cannot), which is why adding it widens
nothing. `INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON` is untouched and stays exactly as strong: it refuses
CLIENT-SUBMITTED `invite.accepted`, and both doors append through the server's internal door.

**Four ways these checks could have passed for the wrong reason, each closed by a fixture rather than an
argument:**

1. *An empty invitations list is what BOTH "correctly scoped" and "this caller has no verified address" look
   like from outside.* Every caller here signs in through `signInWithEmail`, a new helper that follows a real
   magic link and **asserts `emailVerified` on the session it returns** — `signInWithPhone` cannot produce a
   verified address at all, because better-auth's phone plugin mints a synthetic
   `@phone.gisik-nokma.invalid` and never sets the flag. Without that assertion a library change would turn
   every case in the block green for the wrong reason at once.
2. *A scope filter and no filter agree when only one invitation exists.* 13.373 mints two from ONE workspace
   to TWO addresses, so the rows differ in exactly the field under test and in nothing else.
3. *`status = 'pending'` alone is not "still live".* The claim is in the projection and the clock is in the
   credential store, and they disagree: 13.374 checks all four dead shapes — accepted, declined, revoked,
   and **lapsed-but-still-pending** — each against a live invitation in the same response.
4. *A table holding no row of the new shape diffs clean for the same reason an empty one does.* This is Task
   16's `proj_projects` trap in its own house. `proj_invites`' verify case held only `pending` and
   `accepted` rows, so it was extended with a DECLINED one: without it the rebuild's fold of
   `invite.declined` is never exercised, and — because `verify-projections` builds its shadow tables with
   `LIKE public.<table> INCLUDING ALL` — the widened `status` CHECK is never asked to admit `'declined'` in
   the shadow schema. A migration that widened only the live table would throw there and nowhere else.

**Named absences, recorded rather than papered over** (`apps/server/src/routes/my-invitations.ts` carries
them in full): phone-channel invitations do not surface here, because this read is email-scoped by the
task's own words; a phone-only account has no verified address and is answered an empty list, which is the
truth about it and not a failure; and `"user"."email"` is UNIQUE **case-sensitively**, so two accounts
differing only in case are constructible and would both match one invitation under the case-insensitive
comparison this uses — closing that means a citext or a normalising constraint on better-auth's own schema.
*Owner for the first: whoever next takes the invitations surface. For the third: whoever next touches the
auth tables.*

- **13.373** ✅ Only the invitations addressed to the CALLER surface, matched case-insensitively — two
  invitations from one workspace to two addresses, each caller served exactly their own, and the mixed-case
  address proves the comparison rather than assuming it (`seed/users.ts` already matches addresses that
  way). The ACTIONS carry the same scope as the list, asserted in the same case: a decline of somebody
  else's invitation is 404 with the frozen body and leaves it `pending` — an inviteId is a ULID any member
  can read out of their own workspace's history, so a list-only assertion would leave that open.
  **Mutation, and what it actually did:** dropping the address predicate reddens this case — and four
  others in the same file, because the suite shares one database per file and an unscoped read then
  serves every caller every invitation any case ever minted. Reported as measured rather than as the
  "reddens alone" this entry first claimed: the mutation is specific enough to identify its site (the
  message names the address scope) but it is not isolated, and saying otherwise would misdescribe what a
  future reader will see.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.374** ✅ An accepted, declined, revoked or lapsed invitation does not surface, while a fifth to the
  same address still does. All five are asserted LIVE first, so the final `[live]` is a filter working
  rather than a route that never served anything. The lapsed one is aged by moving
  `invite_tokens.expires_at` into the past — the only hand-written row in the file, written to the
  CREDENTIAL store because `expires_at` genuinely lives there (a projection reads no clock), and its
  projection row is asserted still `pending` so the case cannot be satisfied by the status check alone.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.375** ✅ A caller with no VERIFIED address is answered an empty list, while the very same invitation
  reaches a caller who has verified that address. The two responses differ in exactly one property, so a
  read that dropped `"emailVerified"` from its `WHERE` reddens this and nothing else — the escalation that
  guards against is that anyone may sign up claiming an address and only its holder can prove it. The
  phone account's synthetic `@phone.gisik-nokma.invalid` address and its `false` flag are READ from the
  table rather than assumed, because the case's whole claim is about that column.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.376** ✅ Declining is a real, attributed, terminal claim made by the server for the person the
  invitation names **and by nobody else** — one rule, measured on both sides in one case. The positive half
  asserts four things, because a decline doing only three would be a different feature: the EVENT is in the
  ledger under the decliner's name (not the admin's) with envelope-origin `server`, the PROJECTION moved to
  `declined`, the invitation left the caller's list, and the emailed LINK stops opening — without that last
  one a person could decline and still be admitted by the link they already had. The negative half submits
  the same claim through the client door as the workspace OWNER, the role that reaches the check with every
  earlier guard passed, and nothing lands. Mutations it reddens: make the decline a no-op; delete the
  `invite.declined` branch from `checkRolePermission`.
  **What it does NOT detect, corrected after a reviewer found this entry claiming otherwise eight lines
  from 13.377's measurement of the opposite:** dropping the token spend from the decline handler. Every
  assertion here survives it — `openableInvite` refuses on `status` before it consults the credential, so
  the link 404s once the projection reads `declined` whether or not the row was spent, and `pendingFor`'s
  own status filter answers the rest. That property belongs to 13.377's race, and even there it reddens
  probabilistically rather than certainly.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.377** ✅ Accepting from the caller-scoped door joins the workspace at the invited role, read back
  through `GET /v1/me/workspaces` rather than out of the table, and **spends the link with it**. Then a
  RACE, twelve trials, firing all three doors at one invitation at once — accept by link, accept from the
  banner, decline from the banner — asserting exactly one wins and that the ledger holds one terminal
  event rather than two.
  **The race is here because the sequential assertions could not see what the spend does.** Deleting the
  spend from either caller-scoped handler left every sequential check green, measured: `openableInvite`
  refuses on `status` before it reaches the credential, so the link stops opening the moment the
  projection moves whether or not the row was spent. The spend guards the CONCURRENT window and only a
  race can see it — the same reason case 6.129 needed one, after three parallel acceptances of one token
  committed in 24 of 25 trials. **And the race had to be three-way**: a pair of link-accept and
  banner-decline never runs the banner ACCEPT handler, so deleting THAT spend survived the pair.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.378** ✅ The banner renders the offer as a sentence with the role as a sentence too (never the raw
  enum), the dates in the PRODUCT's timezone, and Accept/Decline whose accessible names carry the workspace
  — TWO invitations in the fixture, four buttons, four different accessible names, and the PLURAL heading a
  singular fixture never reached. The second invitation carries the two names the server can honestly not
  supply, and one of them is not hypothetical: **`invitedByName: ''`**, because better-auth's
  `"user"."name"` is `NOT NULL` with no non-blank constraint and the dev workspace's own owner carries the
  empty string. Found by probing the real stack, where the banner rendered *" invited you to Convenience
  Corner as a member."* — `?? 'Someone'` does not catch a value that is neither null nor a name. Mutation:
  drop the blank guard from `named()` and this reddens. It renders **nothing at all** when none is
  waiting, which is the same claim from the side that
  matters: a banner rendering its heading unconditionally would pass every assertion about the full case.
  The expiry fixture is deliberately on the far side of the date line (`19:30Z` on the 20th renders *20
  Sept* in the `Pacific/Niue` the case renders under and *21 Sept* in the product's `Asia/Kolkata`), so a component formatting in
  the machine's zone reddens this; a same-day instant could never do that, and neither could an unvaried
  render on a gate machine that is already `Asia/Kolkata`. **The zone has to span the AWAITS and not just
  the `render()` call** — the banner renders twice, formats no date on the first pass, and produces the
  dates on the microtask after the read resolves, so a zone restored at the end of `render()` is already
  back to IST by then and the mutation survives. Measured, both ways round. Accept navigates into the workspace; Decline is witnessed as a
  RE-READ (the stub answers differently the second time and the call count is asserted), because a page that
  edited its own copy would be asserting an outcome instead of reading one. A failed invitations read leaves
  the founding form standing and says so in one muted line — not a `<ShellRefusal>`, and carrying no
  `role="status"`: in that scenario the workspace read SUCCEEDED, so the page's only live region
  (`ShellRefusal`'s) never rendered and the case asserts **zero**. The assertion's point is that this line
  does not add a SECOND one over the top of the page's own refusal when both reads fail.
  — (`apps/web/test/workspaces-invitation-banner.test.tsx`)

## Task 18 — the neo workspace card, Help/Account nav, and the option-2 restricted count (2026-09-09)

**Case ids `13.379`–`13.383`, the block allocated to Task 18** by the controller's 2026-09-09
`13.366`–`13.389` cluster allocation above. **Recounted at `11af5bc` before minting: the maximum id in
use in this file was `13.378`**, Task 17's last, and every id from `13.379` to `13.390`
occurred ONLY in reservation prose — this file's allocation paragraph, the plan's Task 18/19 lines, and
the two lane state files. Checked id by id with `grep -rn` across the whole tree, not by an ordinal sweep:
both documented traps reproduced again, `13\.[0-9]+` still reporting `13.3333` as its maximum and a float
sort still putting `13.99` above `13.378`, so the pattern used was `\b13\.3[0-9][0-9]\b`. The next free
BLOCK is still **`13.390`**, controller-allocated ON REQUEST ONLY — unchanged by this PR, which consumed
its own five and no more.

**The owner ruling this cluster carries.** 2026-09-09, verbatim: *"go with 2: Count only projects the
guest already has sight into."* The escalation is `docs/lanes/owner-question-restricted-project-count.md`,
now RESOLVED. Option 3 — count every project the caller cannot name — is refused as a plain existence
leak. The `mapWorkspaceRefs` comment forbidding any such count ("the COUNT would itself be the disclosure
the rule withholds") is AMENDED in the same change set, quoting the sentence it replaces.

- **13.379** ✅ **UPDATED same day, Round 19c** (see 13.390 below). The card renders every element from
  data the route served, and every input to every displayed number is a DIFFERENT number, so a card
  reading one field off another cannot pass: member count 5, three projects at 9/4/7 tickets and 3/1/2
  blocked, restricted count 2. The monogram carries the workspace's own name as its accessible name and
  `CC` as its text; the chips read `14 active` (`20 − 6`) and `6 blocked`; the per-project counts are
  asserted INSIDE their own rows, so a card printing one project's number on another's reddens. **Archived
  is a COUNT, not a disclosure** (Round 19c replaced the toggle-and-reveal pattern, since the revealed rows
  used to carry the one nested `<button>`/project-`<a>` pair that capped the door at the card's head): the
  archived project's own row is simply absent from the live list, and its only trace is a `1 archived`
  chip alongside the member/active/blocked chips — asserted present here and, in the negative-control case
  below, asserted absent at zero rather than printing `0 archived`. The restricted line is one text node
  (`2 projects · name restricted`), which a three-interpolation version fails. **Negative controls, because
  zero is where this card lies most easily:** a card with nothing restricted renders no line at all
  (*"0 projects · name restricted"* would appear on every owner's card, where the count is zero by
  construction), a card with nothing archived renders no chip mentioning it, and both singulars — `1
  member`, `1 project · name restricted` — are asserted on cards that have one, so the plurals above are a
  choice rather than the only string the code can produce. Mutations, each red at its own site: drop the
  `− blocked` subtraction from the active chip; stop splitting archived out of the live list; loosen
  `count <= 0` to `count < 0` so the line prints at zero. **And the TINT, which the rest of this case does
  not reach**: `getByLabelText` finds the avatar by
  the workspace NAME and asserts its INITIALS, both functions of the name — so keying the tint on the name
  instead of the id survives every other assertion here. Measured, not supposed: that mutation was run and
  passed 235/235 in `packages/ui` and every case in this file. Two cards with IDENTICAL names and
  different ids now assert different tint classes (nothing refuses a duplicate workspace name, and
  `initialsOf` gives both the same two letters), and a re-mount under a changed name asserts the SAME
  class — a colour someone has learned must survive a rename. The exact index is deliberately not
  asserted; that would pin the hash rather than the property. Positive control: both avatars carry a tint
  class at all, so the inequality cannot pass on two undefineds.
  — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.380** ✅ A guest card shows ONE `Restricted` chip and no number outside the owner-ruled restricted sentence (whole-branch review, Minor 2: retitled from "no number anywhere", which the card's own *"1 project · name restricted"* falsified — the test strips that exact sentence before its digit scan). The point of the case is
  the absence, not the presence: a card printing the chip AND a zero passes *"'Restricted' is present"*
  and fails this. `0` is a claim — *"no work you can see"* — and it is exactly the claim the server
  declined to make by omitting the key (`13.366` on the route side). The numbers are queried away
  individually, by shape, so a failure says which one leaked. What the guest IS still told is asserted in
  the same run: the project's NAME (rulings P32/P38 withhold names, not this), and
  *"1 project · name restricted"* — the string the whole owner ruling exists to make renderable.
  Mutation: print `${memberCount ?? 0} members` beside the chip → RED.
  — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.381** ✅ The role sentence and every gated affordance read ONE value. The fixture is deliberately
  one the shipped server never sends — **`role: 'guest'` WITH the counts present** — because it is the
  only body that separates the two possible implementations: reading `role` (what ships) renders
  `Restricted`; reading `memberCount === null` (the second source that suggests itself, and which agrees
  on every REAL guest response) renders `7 members` and two chip numbers. A case built from a realistic
  guest body cannot tell them apart, which is why this one is unrealistic on purpose. Measured both ways:
  the second-source mutation reddens this case and NOT `13.380`, and `13.380`'s own mutation reddens both
  — so the one-source property lives here and nowhere else. The unknown-role half is the same value read
  again: `WorkspaceRef.role` is a `string` on the wire (the server sends `proj_memberships.role`
  verbatim), so a role this build has never heard of is reachable, and the two answers pull opposite ways
  on purpose — the sentence stays a sentence (*"Your role here is auditor."*), the counts are WITHHELD,
  because being wrong in that direction is recoverable and being wrong in the other is not.
  — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.382** ✅ `nameRestrictedProjectCount` counts what the caller already holds, never what the
  workspace contains. Three things could each make this pass while the wrong number is served, and each
  has its own assertion. **(1) Option 2 and option 3 agree whenever every project in the fixture is
  ticket-visible** — a workspace with one nameable and one unnameable project gives `1` under both rules,
  so a fixture like that certifies nothing. A THIRD project exists that the caller can neither name nor
  see a ticket in (its only ticket is explicit to the owner): option 2 counts 1, option 3 counts 2, and
  the count-all mutation reddens with *"expected 2 to be 1"*. **(2) A guest guard copied from
  `visibleMemberCount` withholds this one**, and every member-written fixture stays green while the number
  is missing from the exact card the owner's reference draws it on — so the guest is asserted in the same
  workspace, key PRESENT, value positive, beside `memberCount`'s key being ABSENT on the same object.
  **(3) The tenancy clause is observable at THIS door**, unlike `visibleProjectCounts`', whose own note
  records its mutation surviving because the route reads that map only for ids `visibleProjects` returned;
  this count is over exactly the ids it did NOT return, so a foreign workspace-mode ticket lands straight
  in it. A second workspace the caller has no membership in seeds one, with a positive control that the
  foreign row really is `resolved_mode = 'workspace'` — the kind the member's predicate matches — or the
  assertion would prove only that the fixture was inert. **The tenancy mutation had to be written twice**:
  deleting the clause outright leaves `params.add(workspaceId)` bound with no `$n` to reference it and
  Postgres answers *"bind message supplies 2 parameters"* — a 500, which reddens 22 cases and measures
  nothing about the count. Replaced with a tautology (`(v.workspace_id = $1 OR TRUE)`), which keeps the
  parameter bound and produces the wrong NUMBER: *"expected 7 to be 1"*. The owner's own answer is `0` by
  construction (every project nameable, so the subtraction empties), asserted because it is what proves
  the number is a DIFFERENCE and not a count of unnameable things.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.383** ✅ The accessible-name floor RISES with the card's new controls and falls nowhere, and the
  other two signed-in ratchets do not move. Measured on the real deployed stack, not predicted:
  `stack-phone-390|/workspaces` goes `ariaLabel` **2 → 3** — the `Avatar`'s own `aria-label`, one per
  card — with `role`, `ariaSelected` and `ariaDescribedby` unchanged. **The five other signed-in routes
  rose on `rawMatches` by exactly +2 each and on NO ratcheted attribute**, and that is the interesting
  half: `/help` and `/account` are plain `<a href>` elements, an implicit role is not a `role`
  ATTRIBUTE, and `sweepAccessibleNames` counts attributes — so the nav additions contribute nothing to
  the floor. The +2 is the control proving the sweep saw them at all; without it, "no ratcheted change"
  and "the sweep never reached the new links" are the same reading. **The rise was recorded in the only
  way this file permits one** — the keys deleted and re-recorded under `UPDATE_ACCESSIBLE_BASELINE=1`,
  since `recordAccessibleBaseline` writes ABSENT keys only — and it was safe to re-record all six
  because the run immediately BEFORE asserted every old baseline and passed 6/6, so nothing could be
  lowered under cover of the update. Verified again with a THIRD run against the new file, no update
  flag, asserting: 6/6. **Type-scale is unmoved and the reason is arithmetic**: the card's two new muted
  rules are `0.8rem` = 12.8px, above the 12px floor, and the sweep's own smallest on `/workspaces` is
  12.8px on `span.gn-avatar.gn-avatar--medium.gn-avatar--tint-2` — which is also the run's independent
  confirmation that the deterministic tint really reaches the deployed DOM. **The non-text-contrast
  roster does not grow**: 6 distinct bordered classes, 0 below 3:1, 19 elements across 7 routes,
  positive control 16.72 — byte-identical to the file on `main`. `e2e-viewport`, the signed-out twin,
  is 31/31 with its baselines untouched, which is correct rather than lucky: its `UNAUTHED_ROUTES`
  render no `AppNav`, and both of its `/workspaces` blocks stub `{workspaces: []}` and a 401, so
  neither renders a card. **One control in this case is NOT exercised and it is named rather than
  implied**: the seeded Convenience Corner world has no archived project, so the archive disclosure
  never renders on the stack and its `aria-label` is not in the risen floor, nor is `button` added to
  `/workspaces`' roster row. That control is witnessed by 13.379 in jsdom instead. Closing it needs a
  seeded archived project — owner: whoever next extends the CC seed, plausibly Task 19, which builds
  archive/restore.
  — (`apps/web/e2e-stack/viewport.spec.ts`)

## Task 19 — the workspace home, a new route `app/w/[workspaceId]/page.tsx` (2026-09-09)

**Case ids `13.384`–`13.389`, the block allocated to Task 19** by the controller's 2026-09-09
`13.366`–`13.389` cluster allocation above. **Recounted at `4924dc1` before minting: the maximum id in
use in this file was `13.383`**, Task 18's last, and every id from `13.384` to `13.390` occurred ONLY in
reservation prose — this file's allocation paragraph, the plan's Task 19 line, and the two lane state
files. Checked id by id with `grep -rn` across the whole tree rather than by an ordinal sweep, because
both documented traps reproduce: `13\.[0-9]+` still reports `13.3333` as its maximum and a float sort
still puts `13.99` above `13.383`. `13.386`, `13.387` and `13.388` appeared **nowhere at all** before this
PR; `13.384`/`13.385`/`13.389` appeared only in the prose named above. The next free BLOCK is still
**`13.390`**, controller-allocated ON REQUEST ONLY — unchanged by this PR, which consumed its own six and
no more.

**What the route is.** Until this commit `/w/<workspaceId>` was not a page: a workspace was reachable only
through a project link, and that path rendered the 404. The e2e sweep's own comment said so in as many
words and is corrected in the same change set — the standing rule that a claim about the tree stops being
true the moment the tree changes.

- **13.384** ✅ The home lists THIS CALLER'S projects with THIS CALLER'S counts, and a withheld count is
  rendered as nothing rather than as zero. Every displayed number in the fixture is DIFFERENT from every
  other and each is asserted INSIDE its own row (`within(row)`), with the sibling's number asserted absent
  from it — so a page printing one project's count on every row fails, where a bare
  `getByText('9 tickets')` would pass. **Zero blocked prints no chip at all**: `0 blocked` is a true
  number and a useless one, and the row carrying it is the row a reader scans past. **Archived is marked
  AND hidden**: the archived project is absent from the default list, the disclosure's accessible name
  carries the workspace (two workspaces would otherwise present two identically-named buttons),
  `aria-expanded` is asserted in both states, and the revealed row carries an `Archived` chip — marking
  without hiding, or hiding without marking, each fails half of this. The restricted line is ONE text node,
  which a three-interpolation version fails. **The withheld half is asserted BY SHAPE** — a guest's row
  must contain no digit at all — because `toBe(0)` and `toBeUndefined()` both pass against a page that
  printed `0 tickets`, which is exactly the claim the server declined to make by omitting the key. Its
  POSITIVE CONTROL runs in the same test, same component, same one-project fixture with only the role and
  the served keys changed: without it, a page that had stopped rendering counts for EVERYBODY would pass
  the withholding assertion and the case would certify nothing. **Two mutations measured.** Rendering a
  withheld count as `count ?? 0` reddens the withholding half ALONE — 1 failed / 201 passed across
  `apps/web`. Removing the archived split (`live = workspace.projects`) reddens FOUR cases here, and that
  breadth is recorded as a limit rather than as strength: three of the four fail because they click a
  disclosure the mutation deletes, so it is a shape gate and not a site-specific measurement. The
  site-specific evidence for the archived split is this case's own assertion pair — absent from the
  default list, present with an `Archived` chip behind the toggle.
  — (`apps/web/test/workspace-home.test.tsx`)
- **13.385** ✅ Every admin affordance is gated on the caller's served role, and the case is the PAIRING.
  Asserting only that an admin has an Archive button passes against a page that shows it to everybody;
  asserting only that a member lacks one passes against a page that shows it to nobody. So all four roles
  are driven against the SAME fixture and each of the three affordances — archive, restore, new-project —
  is checked present on `owner`/`admin` and absent on `member`/`guest`. **Both non-admin roles are driven
  because they fail differently**: a gate written `role !== 'member'` admits a guest, and one written
  `role === 'owner'` locks out an admin. Every role is also asserted to get the LIST and the LINKS, so a
  page that refused the whole screen to a member would redden here rather than passing the four absence
  assertions by accident. **Mutation measured: widening the client gate (`mayAdminister` returning true
  for `member`) reddens THIS case and nothing else.** The server half is 13.388's, deliberately — the two
  halves of *"hiding a control is not enforcement"* fail at their own sites, and a mutation that reddened
  both would tell you nothing about which one is load-bearing. The measurement: **1 failed / 201 passed**
  across the whole of `apps/web` — the complete blast radius, since `src/workspace-viewer.ts` has no
  consumer outside this app — failing as *"member must not be offered “Archive Shop operations”: expected
  <button …> to be null"*, which names its own site.
  — (`apps/web/test/workspace-home.test.tsx`)
- **13.386** ✅ The screen follows the DOOR'S answer, in both directions. **Committed arm:** archiving
  takes a project out of the default list and restoring brings it back, and the movement comes from the
  RE-READ — the stub serves a different directory on the second and third calls, so a client that moved
  the row in its own copy of the list fails, which a case with a fixed stub could not detect. The
  submitted claim is asserted too, because "the row moved" is satisfied by any event at all: exactly ONE
  event, `project.archived`, filed against `{kind:'project', id:'p1'}` in this workspace, actor the
  signed-in user, envelope-origin `web`. The restore submits `project.restored` and the disclosure then
  disappears with nothing behind it. **Refused arm:** the door's own `rule: reason` reaches the screen and
  the row does not move. This is the arm that matters — a `.then()` that reloaded unconditionally passes
  the committed arm and shows a non-admin a screen indistinguishable from success, on the surface whose
  whole subject is who may do what. **Mutation measured:** dropping the re-read after a commit (an early
  `return` where the reload is) reddens this case ALONE, 1 failed / 201 passed.
  — (`apps/web/test/workspace-home.test.tsx`)
- **13.387** ✅ The five doors out of the page resolve to routes that exist, asserted as five LITERAL
  paths. **Three are workspace-scoped and two are not**: `/mcp/tokens` is a global route that takes no
  `workspaceId`, so a page building its hrefs from one `/w/${id}/` prefix would emit
  `/w/<id>/mcp/tokens`, which resolves to nothing — **and a test building its expectations the same way
  would agree with the bug.** That is the whole reason the paths are literals, and the negative naming the
  defect (`MCP tokens` must NOT point at a workspace-scoped MCP route) is asserted directly. The link
  count is asserted too, so a sixth link cannot appear unnamed. **Mutation measured:** building the MCP
  href as `/w/<workspaceId>/mcp/tokens` — the exact defect the case is named for — reddens this case
  ALONE, 1 failed / 201 passed. **UPDATED same day (Round 19e, owner: "the ticket type edit is opening in
  a separate route... repoint it"):** `Ticket types` is now the SECOND non-`/w/<id>/…` door, targeting
  `/settings?workspaceId=<id>&tab=ticket-types` — the bare `/w/<id>/settings/ticket-types` list it used to
  point at has no sidebar, and its own Edit button opened the ticket-type editor as a third, separate
  route, which is the exact bug just closed on `/settings` (§10's ticket-type-editor-inlining entry). The
  header's own `Settings` button carried the same stale href and is repointed to
  `/settings?workspaceId=<id>` the same way. `Workflows` is unchanged — its own editor (the builder) was
  never inlined into `/settings`, so repointing its list here would be cosmetic, not a fix.
  — (`apps/web/test/workspace-home.test.tsx`)
  **SUPERSEDED by 13.673 (2026-09-18):** the text above is the five-door description; the live behaviour
  is 13.673's.
- **13.388** ✅ The DOOR decides, not the page — driven with no UI in the picture at all. A `member` and a
  `guest` each submit `project.created`, `project.archived` and `project.restored` at the real client door
  and are refused; the RULE and the REASON are asserted, not merely "not committed", because a refusal
  under some other rule would mean the three types are turned away for something unrelated to the role and
  the case would be certifying the wrong door. Nothing lands: the owner's own read afterwards shows the
  project still unarchived and the list unchanged, so a refusal that still wrote — the answer saying no
  while the world says yes — reddens. **The positive control is an `admin` at the same door in the same
  workspace with the same types**, without which every assertion above would also pass against a door that
  refused these types from everybody, and the page would be hiding controls that could never have worked.
  **WHAT THIS CASE DOES NOT OWN, established by mutation rather than by reading — and a third `it` was
  DELETED when the measurement came back.** Removing `'project.archived'` from `ADMIN_ONLY_TYPES` reddens
  this case AND pre-existing **13.370**, which already drives an owner's archive/restore round trip and a
  plain member's refusal; a case restating that here was written, measured redundant, and removed rather
  than kept to inflate a count. Removing `case 'project.member_added'` from `projectsNamedBy` reddens this
  case AND **two** cases in `test/permissions/check-project-exists.test.ts`, one of them **6.81** — *"a
  project founded EARLIER IN THE SAME BATCH is found by the check"* — which already drives the forward
  pair and the reversed control through `ingestClientBatch` with the same argument. **So the in-batch
  ordering guarantee is 6.81's property and this case does not establish it**; the reversed batch here is
  a FIXTURE, not the claim, and the case was re-aimed and renamed once that was measured. Advertising
  novelty a case does not have is worse than no case — it is a second green tick over one property.
  **What it DOES own beyond 13.370 and 6.81:** three event types rather than one and two non-admin roles
  rather than one — the page offers three controls and hides them from both; and **the visibility
  consequence that makes the founding form's second event non-optional.** 6.81 never reads
  `/v1/me/workspaces` and its actor is the workspace OWNER, whom `visibleProjects` exempts from its
  filter. Here the founder is a workspace ADMIN at the HTTP door, so the filter applies: the project whose
  `project.member_added` landed is named back to them and the one whose roster event was refused is NOT —
  though it exists and they founded it — with the workspace owner told BOTH as the control proving the
  second project is withheld rather than missing. That is the failure a one-event founding form ships, and
  nothing else in the repo would have caught it.
  — (`apps/server/test/routes/workspace-home-door.test.ts`)
- **13.389** ✅ `/w/<workspaceId>` joins the three signed-in ratchets as a seventh route, and its FIRST
  run is given teeth it would not otherwise have. `recordAccessibleBaseline` writes ABSENT keys only, so a
  route joining the sweep records its floor and asserts nothing against it on that run — *"the floor did
  not fall"* is vacuously true for a floor written from the same numbers it is compared against, and a new
  route's first pass is green by construction. So this route carries **`MUST_NAME`**, the accessible-name
  twin of the existing `MUST_EXAMINE`, asserted on every run including the first: the `Workspace sections`
  navigation, an `Archive <project>` button, and the `Ticket types` link must each be visible before any
  count taken on the page is believed. A count of 3 for a page that rendered a 404 and a count of 3 for a
  page that rendered its controls are the same number, which is the failure the sibling map already
  exists for. **Named absence, carried forward from 13.383 and NOT closed here:** the seeded stack world
  has no archived project, so the archive DISCLOSURE renders on neither `/workspaces` nor this route and
  its `aria-label` is in neither floor; that control is witnessed by 13.384 in jsdom instead. Task 19
  builds archive/restore and was named as the plausible closer — it declines, because seeding one would
  raise `/workspaces`' floor and force the delete-and-re-record dance on a baseline this task otherwise
  does not touch, which is a change with its own risk and no case here asking for it. **Owner unchanged:
  whoever next extends the CC seed.**
  — (`apps/web/e2e-stack/viewport.spec.ts`)

## Round 19b — owner feedback on the workspace screens (Task 19's cluster, revisited)

Three owner words drove this block: *"the workspace card should be clickable ... the navigation bar ...
the create workspace card shouldnt be that big."* The controller's reading of the owner's reference image
(neo, dark) elaborated four items from those three sentences; cases 13.390–13.399 are the client-only
result. No server change — `WorkspaceRef`/`ProjectRef` are unchanged, every number rendered is one Task
16/18 already served.

- **13.390** ✅ **UPDATED same day, Round 19c (owner: "the entire workspace card should be clickable ...
  everything else on the card should just be info, nothing clickable").** The `/workspaces` card's WHOLE
  content — not just the head — is a door to `/w/<id>`: `aria-label` set to EXACTLY the workspace's name,
  which overrides the content-derived name a bare anchor would compute from the avatar's own label, the
  heading, the role sentence, every project name/count and the restricted line, all now sitting inside it.
  Two elements legitimately share that accessible name (the door and the avatar), which is not an error
  but did require three pre-existing `getByLabelText` sites to disambiguate with `{ selector: '.gn-avatar'
  }`. The per-project link, the archived toggle and "My Work" are not merely moved inside the door —
  they are GONE from the card (project names are plain text; archived survives as a count chip) — so this
  case now asserts the direct, stronger shape its Round 19b version could only approximate: exactly one
  link and zero buttons anywhere in the card (`getAllByRole('link')` length 1, `queryAllByRole('button')`
  length 0), rather than proving absence indirectly by showing other controls still reachable at their own
  top-level role. Nothing removed is unreachable: `/w/<id>`, one click through this same door, already
  carries all three (Task 19, Round 19b). —
  (`workspaces-cards.test.tsx`)
- **13.391** ✅ The nav is CONTEXTUAL, transcribing the prototype's `navItems` FILTER rather than its
  picture: without a workspace in the route, only the `always` items render plus a scope note; with one,
  the served workspace name, My Work and Members join. **UPDATED same day (Round 19c, owner: "move
  members into settings and settings should always be visible on the nav bar"): the always tier grew
  from four items to five, and Members stayed put.** An earlier draft of this case (and the nav change
  it covers) also dropped `Members` from the workspace-scoped group, on the theory that "into settings"
  meant folding it there; the owner's own reference screenshots (design mockups, same feedback round)
  keep `Members` as its own top-level link beside `Settings`, so that draft was reverted — `Members` is
  UNCHANGED from before this round, still `!noWorkspace`-gated at `/w/<id>/members`. What DID move is
  `Settings`: it used to join Members and My Work only when a workspace was in the route, pointed at
  `/w/<id>/settings/ticket-types`; it now renders UNCONDITIONALLY (Workspaces, Inbox, Members,
  **Settings**, Help, Account, with Members present only inside a workspace), pointed at a new global
  `/settings` (`app/settings/page.tsx`) that carries the workspace forward as `?workspaceId=` rather than
  a path segment, because this shell remembers no "current workspace" outside a route or query param for
  an unconditional link to target — a query-carrying one still can. **Board is a second, narrower filter
  this product has and the prototype does not**: it renders only when the route ALSO carries a project,
  applying the prototype's own "a link appears only when its target exists" rule one level down (a
  workspace has no single board; a project does). The three shapes are three separate `it()`s (11.185,
  same file) rather than one array, and the Board-only-with-a-project rule is what that split exists to
  keep mutation-witnessable at all: widening the condition to drop the project check reddens the "with a
  workspace, no project" arm alone, because it is the one shape whose expected set has no Board entry
  while a workspace is present. The workspace-name item OMITS while its read is pending or fails — never
  the raw id — because `getMyWorkspaces` was one of this product's refusing reads (**⚠ CORRECTED 2026-09-20: rulings P32/P38 served it and the register emptied on 2026-09-19; the name is now unavailable only when it is genuinely missing, which makes this fallback more load-bearing rather than less**) and a name that might be
  wrong is worse than a name not yet shown. **KNOWN FAILURE (whole-branch review, deferred item 11,
  recorded 2026-09-16): this case is currently RED at `app-nav.test.tsx:238` (the "no workspace selected"
  scope-note assertion). It predates the workspaces-prototype-port branch — the last commit to touch nav
  behaviour is the owner's own `d904efab` — and is deliberately NOT fixed here: repointing a nav
  scope-note assertion is scope creep inside a `/workspaces` styling fix wave, and the spec already pushed
  this to a separate pass. Recorded so the ✅ above is not read as "passing" — it means "covered," and one
  uniformly-ignored red is how a whole gate becomes background noise.** —
  (`app-nav.test.tsx`)
- **13.392** ✅ Every literal nav target is checked against the app directory itself, not only against
  what the component renders: a table of `[href, page.tsx path]` pairs (nine, after Round 19c swapped
  `/w/<id>/settings/ticket-types` for `/settings?workspaceId=<id>` and kept `/w/<id>/members`), each
  existence-checked with `node:fs`, and the nav's own rendered href set checked both for coverage (every
  table entry appears) and for closure (every rendered href is in the table) — so a href this table
  forgot would fail loudly rather than silently passing because nobody asked. —
  (`app-nav.test.tsx`)
- **13.393** ✅ The current nav item carries `aria-current="page"`, and it is asserted the ONLY one that
  does — a page with two "current" items is a page that has not said which one is true. The sign-out
  control's VISIBLE label shrank to "Sign out" (the monogram beside it carries the rest of the reference's
  design), and its ACCESSIBLE name is asserted to still be the full "Sign out {name}" sentence via
  `aria-label` — a floor this shell ratchets elsewhere and must not fall here. The active style reuses
  `--gn-fill-tertiary`/`--gn-text-accent`, the SAME pair `.gn-button` (ghost, the product's most common
  control) already renders everywhere — no new `CONTRAST_PAIRS` row is needed because no new pair reaches
  the screen; the pairing's own measured margin (4.539, `packages/ui/src/tokens.ts`'s `textAccentLight`
  docblock) already covers it in every style and theme. —
  (`app-nav.test.tsx`)
- **13.394** ✅ Two founding-form class families, not one — `.gn-workspace-founding` (a bare column,
  max-width 420px, no card) for `/workspaces`' "New workspace" block, and `.gn-project-founding` (a
  raised card, an inline field+button row) for the home's "New project" row. Both asserted by className
  on the real `<form>` element, positively (carries its own class) and negatively (does not carry the
  other's) — a shared class regressing back to one family would redden both halves at once. Owner's
  words, verbatim, on the first: *"shouldn't be that big."* —
  (`founding.test.tsx`, `workspace-home.test.tsx`)
- **13.395** ✅ The home's header: the 56px/radius-14 monogram tints from the workspace ID — asserted by
  computing `tintIndexOf` on the id AND on the name directly (rather than comparing two renders, which
  this page's fixed route param cannot produce) and requiring the rendered class to match the id-keyed
  index and NOT the name-keyed one, with a positive control that the fixture's id and name do not
  coincidentally hash to the same tint. The meta line — *"N members · M active projects · you're an
  X"* — reads only SERVED numbers (`memberCount`; `live.length`, this caller's own non-archived list)
  and a role CLAUSE from the SAME `viewerOf` call the `/workspaces` card's sentence reads, so the two
  cannot disagree about the same person. **The member-count gate is `viewer.countsWithheld`, NOT
  `memberCount === null` — a SONNET REVIEW of the opened PR caught the first draft reading the second,
  the exact anti-pattern case 13.381 exists on the sibling `/workspaces` card to forbid.** `=== null`
  agrees with the role gate on every body the shipped server actually sends and disagrees only on a
  malformed or unrecognised-role one — precisely the divergence `viewerOf` exists to settle once. Fixed
  before merge; a second case drives the discriminating fixture (`role: 'guest'` served WITH a
  `memberCount`, which the server never sends) through both the header and 13.398's Members note in one
  body, and dies if either reverts to reading the number. A guest's line carries no member-count prefix
  at all, never a `0`. —
  (`workspace-home.test.tsx`)
- **13.396** ✅ An archived project still opens through the **same door a live one gets** — never "Open
  read-only" — at its own href; archiving is a workspace decision (Task 16), not a permission, and the
  board underneath stays writable, so the prototype's read-only label would be a false claim about this
  product's own rule. Archive/Restore reads the same `isAdmin` value 13.388's server-side door answers
  independently — this case does not re-derive a second opinion, it drives the pairing 13.385 already
  owns. **Round 20 rewrote the ASSERTION, not the claim:** the "Open board" button this used to name no
  longer exists (the owner ruled the card's body into the door — 13.413), so the case now reaches the
  door by its accessible name, and asserts that name CARRIES "archived". That half has teeth:
  `aria-label` overrides everything inside the anchor, so the visible Archived chip is invisible to
  assistive tech and a non-admin gets no Archive/Restore button to infer the state from — a door named
  plainly "Old signage" would leave an archived project indistinguishable from a live one for exactly
  the callers who cannot see the chip. A LIVE project in the same render is asserted named WITHOUT the
  suffix, as the positive control against a page that appended it to everything. —
  (`workspace-home.test.tsx`)
- **13.397** ✅ The home's archived-disclosure control is ABSENT, not merely collapsed, when nothing is
  archived — the SAME rule Task 18/19 already shipped on the `/workspaces` card, restated here because
  this round moved the control's POSITION (into the "Projects" heading row, at its end) without touching
  the rule: a control that reveals nothing lies about the shape of the data. —
  (`workspace-home.test.tsx`)
- **13.398** ✅ The five door cards carry NOTES now, verbatim from the prototype's own `wsLinks` — except
  the Members note, whose *"{N} people · roles and pending invitations."* only prints a number when
  `memberCount` is served; a guest (withheld) gets the sentence with the prefix OMITTED, never a `0`, the
  same rule the header's meta line and the `/workspaces` card both keep. Targets are UNCHANGED from Task
  19 (13.387's own literals) — only the notes are new, transcribed rather than invented. —
  (`workspace-home.test.tsx`)
- **13.399** ✅ The accessible-name floor rises and never falls across this round's changes to the four
  existing signed-in ratchet routes plus the seventh (13.389's), and the non-text-contrast roster does
  not grow — measured live against the rebuilt dev stack, `e2e-stack` (6/6) and `e2e-viewport` (31/31,
  2 skipped), owner and guest, neither baseline JSON touched. **A REAL regression was caught by this
  measurement, not merely by the suite existing.** The first draft of the five door-card notes (item 4's
  last bullet) let each note join its link's accessible name by ordinary content concatenation —
  `/w/<workspaceId>`'s own MUST_NAME probe (13.389's witness on this exact route) names a link
  `/^Ticket types$/`, exactly, and the widened name *"Ticket types Fields and the workflow each type
  follows."* no longer matched. Caught within the hour of the live rebuild, not in review. Fixed with
  `aria-label` (pins each door's accessible name to its label) plus `aria-describedby` (links the note
  as a DESCRIPTION — the correct ARIA shape for a control with a name and a supplementary note, and
  still announced by most assistive tech, after the name rather than folded into it); re-measured green.
  Archive/restore driven through the real page on the live world (owner), left exactly as found
  (`archived = f`, read back from the database); the guest's restricted view and the non-admin refusal
  note both verified live. —
  (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-viewport/responsive.spec.ts`)
- **pending-13.4xx** ✅ `/account`'s page shell (account/help screens plan, Task 2) — `AccountPage`
  became a `'use client'` shell composing `AppNav` and the page's `<h1>Account</h1>` title, and gained
  its first real content section, Appearance, wrapping the already-tested `StyleToggle`/`ThemeToggle`
  pair (`ThemeToggle` moved off `AppNav` into this new section in the same task). **Task 3 adds two
  more cases to this same pending block:** the Profile section shows the signed-in caller's current
  `name` and `email`, edits and saves the name through `authClient.updateUser({ name })` (verified
  against the installed `better-auth@1.7.2` client's generated types, not assumed), and a save that
  comes back with an `error` renders that door's `message` verbatim in a `role="alert"` rather than a
  paraphrase. **Task 4 adds one more case to this same pending block:** the Your workspaces section
  lists every workspace `dataSource.query.getMyWorkspaces()` answers, each row showing its real `role`
  (verbatim from `proj_memberships.role`) and `projects.length` as "N project"/"N projects" — no
  invented fields; two workspaces with different roles and project counts (one with a project, one
  without) render correctly and independently in the same list. A failed read is out of scope for this
  case — it collapses to the same empty render an honestly-empty answer produces (disclosed in
  `Features.md`'s bullet, not asserted here). **Task 7 adds three more cases to this same pending
  block:** the Sessions half of the new Sign-in and devices section lists every session
  `authClient.listSessions()` answers with an HONEST device label — a short, explicit substring match
  against `userAgent` (`Chrome`/`Safari`/`Firefox` × `Mac`/`Windows`/`iPhone`/`iPad`/`Android`) producing
  e.g. "Chrome on Mac", never a fabricated specific like "iPhone · Shillong", and falling back to
  "Unknown device" for anything that doesn't match or for a `null`/absent `userAgent`; the current
  session (matched by token against `authClient.useSession()`'s own `session.token`) renders no revoke
  control at all, while every other listed session gets one; and clicking that control's "Sign out"
  calls `authClient.revokeSession({ token })` with the clicked row's own token and re-lists afterward,
  proven at the page level with two sessions (one current, one not) and a real revoke click. **A real
  shape mismatch was found and fixed, not merely assumed away:** the plan's own verification step
  assumed `listSessions()` answers `createdAt`/`updatedAt` as strings; the installed
  `better-auth@1.7.2` client types them `Date` (its fetch client revives ISO strings back into `Date`
  instances on the way in), so the adapter converts explicitly rather than passing either straight
  through as a `string`. **Task 8 adds nine more cases to this same pending block**, the Passkeys half
  of the same Sign-in and devices section plus the `/sign-in` entry point it makes honest:
  (a) `PasskeysSection` shows the named empty state ("You have no passkeys yet.") with nothing
  registered, and no `role="alert"` at all when there is no refusal — the negative half, without which
  the refusal case is satisfied by a component that renders an empty alert unconditionally;
  (b) each listed credential carries a delete control whose ACCESSIBLE name is its own
  (`Delete passkey {name}`), driven with TWO rows and the SECOND clicked, because a single-row fixture
  passes against a component wired to `passkeys[0]`;
  (c) adding submits the typed name and then CLEARS the field, so a second click cannot silently
  re-submit the first name;
  (d) at the page level, the empty state → add → the row appearing comes from a RE-READ that answers
  differently the second time (`listUserPasskeys` called twice), which is what distinguishes the
  server confirming the credential from the page appending the name it was given;
  (e) deleting calls `authClient.passkey.deletePasskey({ id })` with the clicked row's own id and
  re-reads, the row leaving and its sibling staying;
  (f) a refused add renders better-auth's message verbatim in a `role="alert"` AND does not re-read
  (the call count discriminates the refusal branch from the success branch), and a refusal carrying NO
  message still surfaces rather than reading as success — `error?.message ?? null` would collapse a
  message-less refusal to "no error", and a silent no-op after a WebAuthn ceremony is
  indistinguishable from the passkey having been saved;
  (g) an ANONYMOUS `/account` load makes NO passkey request at all — the rate-limit gate, since
  `GET /passkey/list-user-passkeys` is charged to the shared `auth:` bucket and sits behind session
  middleware (measured as a real 401 in `apps/server/test/auth/sign-in-flows.test.ts`, not asserted in
  prose), so an anonymous read would spend everyone's sign-in budget on a request that cannot succeed.
  **Mutation-checked:** deleting the `user !== null` guard reddens this case and only this case;
  (h) the SERVER half of both paths, from the other side of a seam neither web suite can cross:
  `GET /api/auth/passkey/list-user-passkeys` answers `200 []` for a signed-in caller and `401` for an
  anonymous one, and `POST /api/auth/passkey/delete-passkey` reaches better-auth's handler —
  **asserted by BODY (`code: 'PASSKEY_NOT_FOUND'`), not by status, and the first version of that
  assertion was WRONG and went red: `not.toBe(404)` cannot work, because 404 is ALSO better-auth's own
  answer for an id the caller does not own, so a missing route and a working handler are identical in
  status and opposite in meaning** (the same discipline 13.273 uses to tell two limiters apart);
  (i) `/sign-in`'s restored "Sign in with a passkey" button — present under every social answer
  including the dev stack's neither-provider one (it needs no provider, so it is NOT gated on
  `GET /v1/auth/methods`, and it lives outside `.gn-sign-in__marks`), never called on mount, and called
  exactly once with `{ autoFill: false }` on click. The argument is asserted rather than the call,
  because `{ autoFill: true }` would satisfy "was called" while being precisely the
  conditional-mediation request that must not ship.
  The SERVER-side companion to (i) lives in this file's own "One limiter on `/api/auth/*`" family
  rather than here: ten `GET /api/auth/passkey/generate-authenticate-options` probes exhaust
  production's real `RATE_LIMIT_AUTH_MAX` of 10 and the eleventh genuine `POST /sign-in/magic-link` is
  refused **by our limiter, identified by body**, against a zero-probe control through the identical
  pipeline that must NOT be refused; a third case pins that the probe charges the general `auth:`
  bucket and never the tighter `signin:` one (`/passkey/*` is absent from `SIGN_IN_PREFIXES`), and a
  fourth that one deliberate click costs one unit and leaves the magic link available.
  **Both directions mutation-checked:** adding `/passkey` to `SIGN_IN_PREFIXES` reddens the bucket
  case alone; pointing the probe at a non-auth path reddens the exhaustion case alone.
  **WITNESSED END TO END 2026-09-18 (Step 5b) — this paragraph used to read "NOT WITNESSED END TO
  END", and the history is kept because a named-but-unrun witness is the only reason nobody could
  see it.** `apps/web/e2e-stack/passkey-registration.spec.ts` (register a credential over a CDP
  virtual authenticator on `/account`, sign out, then sign in with it on `/sign-in`, no magic link in
  the second half) was written and typechecked — `tsconfig.e2e.json` includes `e2e-stack/**`, so it
  could not rot silently — and was **never executed**, because the suite died inside `globalSetup`
  before any spec ran. Two defects, both in the seed step and both fixed in
  `e2e-stack/helpers/seed-shape.ts`: `MODULE_NOT_FOUND` for a `dist` the hot image does not have, then
  `ENOENT` for `board.data.js` after pnpm moved the cwd to the package directory. The run line:
  `✓ 1 e2e-stack/passkey-registration.spec.ts:75:1 › register a passkey on /account, then sign in with
  it — no magic link in the second half (19.6s)`.
  **What the green establishes, precisely:** the WebAuthn ceremony runs — `addPasskey` produces a
  credential the server stores and re-lists, and `signIn.passkey` authenticates with it, with no
  inbox purge and no email field touched in the second half. So the runtime URL better-auth's
  generated client builds for `listUserPasskeys` is now observed. **What it does NOT:** the spec reads
  the delete control's accessible name but never clicks it, so `deletePasskey`'s runtime URL remains
  unobserved end to end — the same gap this paragraph recorded, now covering one method instead of
  two. The member NAMES are still settled by `typecheck` (with a negative control) and the PATHS by (h).
  **The Account STYLING port adds four more cases to this same pending block** (owner, 2026-09-15:
  "take the styling of the account page and fix the styling in the code", then "it still doesn't match
  the Style"). **THE REFERENCE IS THE DESKTOP PROTOTYPE'S `isAccount` SCREEN**
  (`design-system/interactive/desktop.dc.html:1471-1529`), the file this plan's own spec names; the
  first cut styled against the MOBILE canvas's "Account" screen, which is the phone's More TAB, and
  that is what "doesn't match" meant. (a) `/account` renders as a centred 680px column of cards with
  `<h1>Your account</h1>` and a lead sentence, cards at 20px padding, headings at 20px/25px/600, and
  **transparent** rows separated by the card gap — measured live at 680px, not asserted. The cards
  run in the SPEC'S ORDER, which is the prototype's — Profile, Appearance, Notifications, Your
  workspaces, Sign-in and devices, Passkeys — replacing the order they happened to land in as Tasks
  2-8 each appended its own; §2's "composed in the prototype's order" had not actually been met.
  Passkeys stays adjacent to Sessions because §7 covers both as one concern; rendering them as ONE
  card is the remaining divergence from §7 and is not done here. **(f) The APPEARANCE card is rebuilt
  to its own owner reference image** (2026-09-15) — the one card with no prototype counterpart, since
  it is this page's own section per spec §4 — as two labelled `SegmentedControl`s in place of a
  `Select` trigger and an icon-only cycle button: Style (`Apple HIG`/`Minimal`/`Neomorphic`) with a
  description line that must TRACK the selection, Theme (`System`/`Light`/`Dark`), and a closing
  footnote. Cases 13.344-13.346 and 3.83 are retitled for the new control shapes rather than
  renumbered, and both component suites were rewritten to assert the SAME properties through the new
  shape. **`system` is kept as a third Theme segment against the reference image's two, pinned by its
  own case** — it is the default state and the only route back to the device preference. The
  accessible-name ratchet was CHECKED, not assumed: the signed-out baseline holds no `/account` entry,
  the stack baseline is `{}`, and the assertion is a `toBeGreaterThanOrEqual` floor that this change
  raises (`role`, `ariaSelected`) while holding `ariaLabel` level at two. (b)
  Notifications rows carry a switch built by restyling the real `<input type="checkbox">`, so
  `getByLabelText(...).not.toBeChecked()` still drives it — the control is unchanged, only its paint
  is. (c) Each workspace row is a real `<a href="/w/{id}">` named `Open <name>` exactly once, the one
  piece of new BEHAVIOUR in the port; asserted as a LINK WITH AN HREF rather than as a click, because
  a `<div onClick>` that passed a click test would still be the defect this shape exists to prevent,
  and the accessible name is pinned because `Avatar` labels itself with the same workspace name. (d)
  Sign-in and devices renders a HEDGED empty state ("No signed-in devices to show.") instead of the
  bare heading it showed before — the wording is the assertion, since the page collapses a failed read
  to `[]` and a message claiming "you have no other devices" would assert what an empty array does not
  establish. A fifth case pins the append-only footnote.
  **(e) The per-device Sign out button stays SOLID, refusing the prototype's tint on a MEASUREMENT.**
  Measured in a real browser across all six theme x style combinations: `danger` on `surfaceSunken`
  is 3.84:1 and `danger` on `surfaceRaised` is 4.29:1 (light/`neo`), both under the 4.5 a 0.9375rem
  label owes, against `dangerText on danger` at 5.0511:1 — the only one of the three `CONTRAST_PAIRS`
  declares and gates. A tinted class was written and then DELETED on that reading, which is the case
  worth recording: the prototype is the reference for shape, not an override on accessibility. The
  same sweep found TWO PRE-EXISTING failures outside this change set and left them alone —
  `.ticket-type-editor__issues` at the same 3.84 and `.gn-contest-banner__action--discard` at 4.29
  under light/`neo`, both product-wide palette decisions.
  **WHAT IS AND IS NOT OBSERVED BY A TEST, stated because a styling change invites the assumption that
  green means it looks right:** (c) and (d) and the footnote ARE covered —
  `apps/web/test/account-page.test.tsx` (16) and `packages/app-core/test/account/*` (14) are green,
  and the two new `SessionsSection` cases plus the new workspace-door case are what took app-core
  1181→1183 and web 262→263. `packages/ui/test/token-discipline.test.ts` proves the block writes no
  colour literal, and that instrument was POSITIVE-CONTROLLED for this change rather than trusted — a
  planted `#ff0000` took it red naming `apps/web/app/globals.css` and the exact line. NOTHING asserts
  the RENDERED geometry of (a) or the switch paint of (b): no unit test reads these rules, and
  `apps/web/e2e-stack/helpers/non-text-contrast.ts` does not sweep `/account`. Both were instead
  verified by SCREENSHOT against a static render of the prototype's own markup and tokens, in light/
  `hig` and dark/`neo`, which is how the `neo` row-invisibility defect in the intermediate cut was
  caught at all. A rendered sweep of `/account` is the test these two still want. ❌ — **and that ❌
  sits inside this block's ✅ deliberately, not by oversight:** the behavioural half of this port is
  test-observed, the geometric half is screenshot-observed only, and flipping the block either way
  would misreport one of them. The mixed marker is the honest reading until a rendered sweep exists.
  **RULING E2-23 (closed), added to this same pending block:** a failed passkey LIST read used to
  collapse to `setPasskeys([])`, and `PasskeysSection` then asserted "You have no passkeys yet." over a
  read that never confirmed that — the one silent-omission collapse on this page that fed a false
  ASSERTION rather than an honestly-hedged one. `PasskeysSection` now takes a `listFailed` flag,
  independent of the `error` prop above (an add/remove refusal): it renders "Your passkeys could not be
  loaded." instead of the named empty state, but ONLY when there is nothing else to show — a caller
  still holding a real, previously-read list keeps rendering it even if a later poll fails. Four cases:
  the component states the refusal instead of the empty claim; a real list survives an unrelated later
  `listFailed`; the page wires a rejected `listUserPasskeys()` through to the refusal; the negative
  control (no alert, no refusal, when there is no failure) is the pre-existing case above, unchanged —
  (`packages/app-core/test/account/passkeys-section.test.tsx`, `apps/web/test/account-page.test.tsx`).
  **RULING E5-19 (closed), added to this same pending block:** "Save name" had no success arm at all —
  a save, and (independently) a message-less refusal, both painted identically to a save that had simply
  not been clicked yet, the button stopping "Saving…" with nothing else on screen. Two fixes: `saveName`
  now tells "no error" apart from "an error object with no `message`" (`result.error?.message ?? null`
  previously collapsed both to the same `null` a real success returns), falling back to a stated sentence
  for the latter; and `ProfileSection` gained a `role="status"` "Name saved" on success, cleared the
  moment the field is edited again so a stale confirmation cannot describe a value no longer on screen.
  Three cases: the success message; the message-less-refusal fallback (asserted NOT to also render the
  status role); and the edit-clears-the-confirmation arm — (`apps/web/test/account-page.test.tsx`).
  **Not yet ID-allocated**: this file's own header requires the next free block
  (after 13.399) to be requested from the controller before minting, and this task has no channel to
  request one — the same gap `apps/web/test/app-nav.test.tsx`'s own `pending-13.4xx` describe block
  already carries for its three cases (`/help` and `/account` mounting `AppNav`), unresolved before
  Task 2, unresolved after Task 2, unresolved after Task 3, unresolved after Task 4, and still
  unresolved after Task 7. Rename every case in this block to real case ids, in order, once a block is
  requested. —
  (`apps/web/test/account-page.test.tsx`, `apps/web/src/account/profile-section.tsx`,
  `apps/web/src/account/workspaces-section.tsx`, `apps/web/src/account/account-clients.ts`,
  `packages/app-core/src/account/sessions-section.tsx`,
  `packages/app-core/test/account/sessions-section.test.tsx`,
  `packages/app-core/src/account/passkeys-section.tsx`,
  `packages/app-core/test/account/passkeys-section.test.tsx`,
  `apps/web/test/sign-in.test.tsx`, `apps/web/app/sign-in/page.tsx`,
  `apps/server/test/auth/sign-in-flows.test.ts`,
  `apps/server/test/http/security-middleware.test.ts`,
  `apps/web/e2e-stack/passkey-registration.spec.ts`,
  `apps/web/app/globals.css`, `packages/ui/test/token-discipline.test.ts`,
  `apps/web/app/account/page.tsx`, `packages/app-core/src/account/notifications-section.tsx`,
  `design-system/interactive/desktop.dc.html`)

- **13.330** ✅ **A passkey is registered on `/account` over a CDP virtual authenticator and then
  signs in — with no magic link in the second half.** `apps/web/e2e-stack/passkey-registration.spec.ts`
  (the spec's own docblock carries the run line; first live green 2026-09-18, Step 5b). The second half
  purges no inbox, fetches no link and fills no email field, so landing off `/sign-in` is reachable only
  by a completed WebAuthn authentication; the row is identified by a per-run-unique label rather than an
  empty-list precondition, so residue from an earlier run cannot make the registration look like it
  worked. **This is the case the paragraph above used to record as "NOT WITNESSED END TO END."**
  *RECORDED EXCEPTION, and it is one — read this before minting the next account case.* This id is
  taken from **Task 12's** reservation `13.327`–`13.333`, which Task 12 never wrote; **Task 12 was then
  superseded entirely** by the account/help-screens plan (`docs/superpowers/plans/2026-09-15-account-help-screens.md`,
  "Do not touch `~/my_projects/gisik-nokma-exec` or the `exec/task12-passkeys` branch"), whose cases live
  under the placeholder **`pending-13.4xx`** above. That block's own closing note says *"Rename every case
  in this block to real case ids, in order, once a block is requested"* — so a single minted id here is
  a **deliberate exception to that note**, taken on `CTL-DISPATCH-2026-09-18-step5b-stack-suite-hot.md`'s
  explicit naming of `13.330`, and only because the dispatch's premise ("read which case ids it cites")
  was false: the spec cited none, and the reservation it was described from is superseded. The
  Block-`13.4xx` rename, when it happens, is unaffected — it starts at `13.400`, and `13.330` is outside
  it. The ten sibling account cases still carry no real id and still cite nothing.
  *Mutation, named rather than run:* 13.330's own second half is the falsifier — deleting the
  `signIn.passkey` call makes the `waitForURL` off `/sign-in` time out. It was not run as a mutation in
  this step because the suite is red for four unrelated reasons (see the PR body), and a mutation whose
  control is already red measures nothing.*

- **13.400** ❌ **The selected segment is PRESSED under `neo`, lifted under `hig`, flat under `minimal`**
  — `[data-style="neo"] .gn-segmented__item--on` overrides the base rule's `var(--gn-shadow-raised)`
  with `var(--gn-shadow-sunken)`. Owner, 2026-09-15: *"in the prototype it was sunken style. i want it
  to follow that."*
  *THE REFERENCE HAS FIVE VALUES FOR THIS CONTROL, NOT ONE, and they split on the style axis. Read off
  `--segOnShadow` in `design-system/interactive/desktop.dc.html` rather than eyeballed from a
  screenshot: `0 3px 8px rgba(39,58,99,.16), 0 3px 1px rgba(39,58,99,.06)` (hig light),
  `0 3px 8px rgba(6,10,22,.66)` (hig dark), `none` (minimal), and two `inset 3px 3px 6px … , inset
  -3px -3px 6px …` pairs (neo light, neo dark). So the base rule was ALREADY right for two styles of
  three — `--gn-shadow-raised` resolves to `none` under `minimal` — and only `neo` was inverted. That
  is why it read as simply backwards rather than as a per-style nuance: `neo` is the shipped default,
  so the one wrong arm was the one everybody saw. One `[data-style]` override reproduces all five from
  the two existing shadow roles; no new role, no literal, and `hig`/`minimal` untouched — the same
  shape as 13.339's `[data-style="neo"] .gn-field__input` rule directly above it in `ui.css`.*
  *THE BACKGROUND MOVED TOO, and only because a failing assertion forced the value to be looked up
  rather than assumed. The first draft kept the base rule's `var(--gn-surface-raised)`, reasoning that
  `neo` collapses its surfaces anyway. It does not collapse them in LIGHT: `surfaceRaised` is `#fbf7f3`
  there against `surfaceSunken`'s `#f1eae3`, so the pressed segment sat a shade too high in exactly the
  theme this suite runs in. The reference settles it — its own `--segOnBg` under `neo` is `#F1EAE3`
  light and `#1B2340` dark, which are byte-for-byte
  `colorOf('light'|'dark', 'surfaceSunken', 'neo')`. So the neo override carries
  `background: var(--gn-surface-sunken)` as well as the shadow: sunken ground, sunken shadow, the same
  pairing `.gn-field__input` (13.339) and `.gn-help__search-input` (15.34) take under `neo`.*
  ***CORRECTION, and it is the useful part of this entry.** The first version of this case said the
  change was "unasserted — nothing in the suite reads a computed style on this component," and the
  commit (810d8470) repeated it as "no gate can move on this and none did." **Both were false.**
  `13.362` reads the selected tab's rendered `box-shadow` in a real Chromium page and pins its
  geometry; it reddened on all three viewports on the very next run — 3 failed became 6. The reasoning
  behind the wrong claim was sound as far as it went (`box-shadow` is outside layout, so no ratchet
  could move) and it was still wrong, because it answered "which RATCHETS can see this" when the
  question was "what asserts this". A ratchet is not the only kind of gate. The suite caught it before
  anything shipped further, which is exactly what 13.362's docblock argues for witnessing a rendered
  value instead of trusting the source.*
  *So this case IS covered: `13.362` now asserts the `inset` keyword and both `4px 4px 9px` /
  `-4px -4px 9px` offsets, and asserts the old `7px 7px 16px` raised geometry is GONE — without that
  last line a rule emitting both would satisfy the others. The discrimination is sharper than the
  version it replaced: `hig` and `minimal` both resolve `sunken` to `none`, so these offsets can only
  appear under `neo`.* — (`apps/web/e2e-viewport/responsive.spec.ts`, case 13.362)
  ***SUPERSEDED, owner round 5 (2026-09-16, case 13.412).** The two-role approximation this entry
  documents (`raised` for `hig`, `sunken` for `neo`) is replaced by a dedicated fifth `ShadowRole`,
  `selected`, that reproduces all five prototype values exactly — including `neo`'s own 3px/3px/6px
  geometry, which `sunken`'s 4px/4px/9px never matched precisely. `13.362`'s pinned offsets moved with
  it (`4px 4px 9px` → `3px 3px 6px`); see 13.412 for the new arithmetic and mutation evidence. The
  background half of this entry is UNCHANGED — `background: var(--gn-surface-sunken)` still stands,
  since a shadow role carries no background of its own.*

- **13.401** ✅ **The segmented track paints no background of its own** — `.gn-segmented` dropped
  `background: var(--gn-fill-tertiary)`. Owner, 2026-09-15: *"the background also needs to be removed
  from the tablist."*
  *It follows from 13.400 rather than being a separate taste call: once the selected segment is a WELL
  pressed into the page, a tint behind the whole control gives the well a second ground to compose
  against, and the reference's own neo values compose against the page. The unselected segment is now
  bare page with no fill of its own — the "normal" half of the owner's description. Geometry
  (`gap`/`padding`/`--gn-radius-control`) is kept deliberately: with no fill, spacing is the only
  thing left holding the two segments apart.*
  *Asserted, and the assertion had to MOVE to stay honest: 13.362 used to read `--gn-fill-tertiary`
  off the root as its declared-value control, naming it "the segmented track background". That would
  have gone on passing forever while describing a property this component no longer has — green about
  a thing that stopped existing. It reads `--gn-surface-sunken` now (what the pressed segment actually
  composes against) and adds a direct reading of the track's own computed `backgroundColor`, which is
  `rgba(0, 0, 0, 0)`.* — (`apps/web/e2e-viewport/responsive.spec.ts`, case 13.362)

- **13.402** ❌ **The app bar floats, and everything that must clear it does** — `.gn-nav` is
  `position: sticky; top: 0; z-index: 20` with a declared `background`. Owner, 2026-09-15: *"make the
  top nav bar always be floating on the top."* It reverses this rule's own recorded decision — the
  comment used to end "the bar sits in normal document flow (not `position: sticky`/`fixed`)" — which
  is rewritten rather than left contradicting the CSS under it.
  *`sticky`, NOT `fixed`: sticky stays in flow, so the bar still occupies its own height and nothing
  below needs a compensating top margin — and that margin would have been a second copy of the bar's
  height to keep in sync with it.*
  *TWO CONSEQUENCES THE REQUEST DOES NOT NAME, both found by looking rather than by reasoning.*
  *(1) THE BAR HAD NO BACKGROUND. It only ever looked solid because `body` paints the same
  `--gn-surface` behind it; measured as `rgba(0, 0, 0, 0)`. Transparent is invisible until something
  scrolls under it, and then the page's text runs straight through the bar. Declared now at
  `var(--gn-surface)`, which keeps the resting appearance byte-identical.*
  *(2) EVERY ANCHOR LANDED BEHIND IT. A fragment navigation scrolls its target to the top of the
  viewport, which is now under a 69.6px bar. Measured before the fix: clicking "§4 — Getting your
  people in" put its heading at `top: 0.04px` with `scroll-margin-top: 0px` — the heading you asked
  for was the only thing you could not see, on every topic link and every search result in `/help`.
  `.gn-help__section`/`.gn-help__entry` now carry `scroll-margin-top`; re-measured at 86px against a
  70px bar, clear with 16px of air.*
  *`--app-nav-offset: 4.35rem` is not a magic number: `.gn-nav__links` is a 2.75rem control row and
  `.gn-nav__inner` adds 0.8rem of padding twice, which is the 69.6px the browser reports, identical at
  768px and 1512px — the whole range in which anything else here is sticky. It is DELIBERATELY not a
  `--gn-` token: `tokens.test.ts` requires every `var(--gn-…)` in `ui.css` to name a declared role, and
  this is one shell's layout fact rather than a design value. `apps/desktop` renders no nav, resolves
  the `0px` fallback, and reproduces its previous behaviour exactly.*
  *WHERE THE NUMBER IS AN UNDERSTATEMENT, recorded rather than left to be discovered: `.gn-nav__links`
  wraps, so the bar grows on narrow viewports — **measured at 190px on a signed-in workspace route at
  500px wide**, three rows of links. No single value can cover that, because the height depends on how
  many links the ROUTE contributes and on the signed-in name's width, neither of which CSS can see, so
  a media query would only trade one wrong value for another. Both consequences are bounded and both
  were checked: `.gn-help__sidebar` is `position: static` below 48rem and cannot collide at all, and a
  fragment lands ~86px down, correct wherever the bar does not wrap and merely short of it on a
  wrapped phone bar — the heading is then a short scroll away rather than lost. Exactness here needs
  the bar measured at runtime into the variable, which is a script, not a stylesheet.*
  *The one property a spec DOES assert about this element was re-checked directly, since it covers
  signed-in routes the viewport suite never visits: `e2e-stack/viewport.spec.ts` measures `.gn-nav`
  for horizontal overflow (item 7's own defect — it escaped the viewport by 10px at 390px). Measured
  live on a signed-in `/members` at the narrowest width this browser allows: **0 escaping elements,
  `scrollWidth === clientWidth`**, bar sticky and wrapped to 190px. `position: sticky` does not alter
  horizontal layout, so this was expected — but it is the assertion that exists, so it was read rather
  than reasoned about.*
  *`z-index: 20` is chosen against what is already in the tree, not picked: `.gn-select__panel` and
  `.mention-popup` are 30, `.gn-dialog__scrim`/`.gn-sheet__scrim` are 40. A dropdown opening near the
  top must render OVER the bar and a modal scrim must cover it; a bar outranking either would clip the
  menu it belongs to.*
  *Unasserted — this is CSS positioning, and nothing in the suite reads a computed style on the shell.
  **Stated carefully this time:** 13.400's first draft made the same claim about the segmented control
  and was WRONG (13.362 reads that one), so this was checked rather than assumed — no spec in
  `e2e-viewport` or `e2e-stack` queries `.gn-nav`'s position, background or z-index. What the suite
  DOES cover is that nothing regressed: overflow 0 at all three viewports, tap-target counts unmoved
  at 25/23/25, 3 failed / 28 passed unchanged. Verified by direct measurement in the running dev
  server — bar pinned at `top: 0` while scrolled 1400px, sidebar at 93.6px, anchors at 86px.* —
  (no test; owner: whoever next asserts computed style on the shell)

## The workspaces-prototype-port plan — Task 10, catalogue consolidation (2026-09-15)

Nine tasks (1–9) ported the owner's `desktop.dc.html` prototype onto `/workspaces`: tokens, shared
`ui.css` metrics, page shell/title/summary, grid and card geometry, card head/meta line, the project
line's truncation, the invitation banner, and the founding form. Two of those tasks left tests
deliberately uncased — Task 1's and Task 3's own reports name the reason: an implementer mid-plan has no
visibility into numbers concurrent work may claim, so minting was deferred to this consolidation task.
Five more new test files/cases were built and flagged as owed here by the tasks that wrote them (Task 2,
Task 4, Task 7 ×3, Task 8). Block `13.403`–`13.410`, minted per the corrected pointer above.

- **13.403** ✅ **`tintWarning` composites legibly on every surface it can reach** — the invitation
  banner's alpha wash cannot carry a `CONTRAST_PAIRS` row (`tokens.ts:228` forbids naming an alpha
  primitive there, since `relativeLuminance` ignores alpha and such a row would measure the tint's own
  colour rather than what it blends into), so the obligation is measured against the COMPOSITE instead,
  the same shape the pre-existing `fillTertiary` check uses. All twelve numbers (3 styles × 2 themes × 2
  foregrounds, `text` and `textMuted`) clear 4.5 with margin, tightest at neo/light's `textMuted`, 7.434 —
  65% above the floor. Carries the anti-vacuous control (`expect(washed).not.toBe(surface)`) so a
  fully-transparent tint cannot pass by degenerating to text-on-bare-surface. — (`packages/ui/test/tokens.test.ts`)
- **13.404** ✅ **The chip label composites legibly on `fillTertiary`, over every ground it can reach** —
  closes a gap the two pre-existing `fillTertiary` checks left open: both measure `textAccent`, not the
  chip's own `color: var(--gn-text)`, and both composite over `surface`, not `surfaceRaised` — the chip's
  actual ground, since it sits on `.gn-card`. All six style/theme combinations clear 4.5 with wide margin
  (minimum 10.49), checked over both `surfaceRaised` and `surface`. Same anti-vacuous-control shape as
  13.403. — (`packages/ui/test/tokens.test.ts`)
- **13.405** ✅ **`projectLine`'s truncation boundary: at the cap, over the cap, and the withheld
  suffix** — joined names exactly at `PROJECT_LINE_CAP` (3) take no suffix at all, the boundary a
  cap-off-by-one implementation gets wrong; one name past it truncates and COUNTS the remainder
  (`· +1 more`); and when `countsWithheld` is true the suffix drops the number (`· and more`) rather than
  leaking one to a guest — 13.380's own property ("no number anywhere") applied to a second surface. Six
  cases total (`projectLine`), plus three for the sibling `projectCountLine` (singular, plural, and
  **says "No projects yet" at zero** — E5-36, 2026-09-21). That third one used to be "renders nothing at
  zero, the same withholding rule `restrictedLine` keeps", borrowed from a rule whose reason does not
  reach it: `restrictedLine`'s zero rule is about a person with nothing withheld being told about
  withholding, and `projectCountLine` carries no withholding. What `null` bought was a founder's fresh
  card — avatar, name, chips, "You're an owner here." — with no mention of projects and no pointer to the
  New-project form that `docs/manual.md:174` sends an owner to. A withheld viewer is unaffected because
  the caller gates the line on `!viewer.countsWithheld`, so the rule now lives where it was doing work. —
  (`apps/web/test/workspace-viewer.test.ts`)
- **13.406** ✅ **The `/workspaces` page-head summary is gated on `workspaces !== null &&
  workspaces.length > 0`, both halves independently proven** — a REFUSED read is `null` exactly like an
  in-flight one, so `!== null` must be checked and must short-circuit BEFORE `.length`, or a refusal
  prints "0 workspaces you belong to." (a count of a list nobody managed to read); fix round 1 added the
  `length > 0` half, since a SUCCESSFUL empty read is a real counted zero and the summary would sit
  redundantly atop the page's own "No workspaces yet…" sentence. Both halves mutation-witnessed live: an
  ungated summary reddens the refusal case alone (`PASS 14 FAIL 1`) and, after the `length > 0` term was
  added, reddens BOTH the refusal and the empty-read case together (`PASS 14 FAIL 2`) — confirming
  neither term is redundant with the other. — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.407** ✅ **The card itself truncates a wide workspace's project line, not only `projectLine`'s own
  unit tests** — "names three projects and counts the rest, so a wide workspace does not grow the card,"
  pinning `PROJECT_LINE_CAP` where it actually renders. The fixture was extended past the brief's own
  version (one project, which never reaches the truncating branch: `hidden = 1 − 3 = −2`, an unobservable
  no-op) to four, so `hidden = 1` and the branch genuinely matters; mutation-witnessed live (`projectLine`
  forced to always take the numeric branch, ignoring `countsWithheld`) reddens this case alone, caught
  first by the positive safe-string assertion and independently, with that assertion disabled, by a
  card-wide digit scan that strips the one digit-bearing string the card IS allowed to show and asserts no
  digit survives the strip. — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.408** ✅ **The cross-page spacing pin for `.gn-workspace-card__restricted`, at its two call
  sites** — `/workspaces` (inside the door's flex column, where `gap` supplies the offset and the shared
  rule correctly carries `margin: 0`) and the workspace-home header (a direct `<Card>` child outside any
  flex-gap container, needing its own `margin-top: 0.55rem` via a second class,
  `.gn-workspace-home__restricted`, since no stable sibling exists there to hang a combinator off). Four
  source-scan cases: the shared rule still declares `margin: 0`; the override declares
  `margin-top: 0.55rem`; the override's line index sits textually AFTER the shared rule's (the tie-break
  both equal-specificity rules rely on); and a mutation witness that swaps the two rules' lines in a copy
  of the source and re-runs the same ordering computation, confirming it flips to `false` on the swapped
  text rather than merely being trusted to. — (`apps/web/test/workspace-restricted-spacing.test.ts`)
- **13.409** ✅ **`.gn-workspace-list__role`'s two cross-page borrowers are pinned back to their
  pre-port size** — Task 6 resized the shared rule (`0.8rem` → `0.9375rem`, plus a new `line-height`) for
  the `/workspaces` card's own sake, which silently also grew the class's two OTHER call sites: `/settings`'s
  workspace-name subtitle and the workspace-home header's meta line. Both are pinned back via a dedicated
  `.gn-workspace-list__role--pinned` modifier class (`font-size: 0.8rem; line-height: inherit` — `inherit`
  reproduces the pre-Task-6 rule's own unset `line-height`, verified via `git show` rather than guessed)
  added directly in JSX at both call sites. Three source-scan cases (the pin rule exists and declares
  `0.8rem`; the namesake bare-class rule is untouched at `0.9375rem`; a mutation witness deleting the pin
  rule's text confirms the scan then finds nothing), plus rendered-DOM assertions confirming the modifier
  class actually reaches the element at both call sites — mutation-witnessed live: removing the class from
  either JSX call site reddens exactly that page's own case. — (`apps/web/test/workspace-list-role-pin.test.ts`,
  `apps/web/test/workspace-home.test.tsx`, `apps/web/test/settings-page.test.tsx`)
- **13.410** ✅ **The invitation banner's restyle is pinned at both the CSS and the rendered-DOM level,
  not only its behaviour** — the four pre-existing cases in this file are behaviour-only (heading text,
  per-invitation sentences, accept/decline, the one-line failure message), and none pinned the tint
  background, the absent shadow/edge, or the icon's `aria-hidden` state, so the whole Task 8 restyle could
  be reverted with the suite staying green. Four new cases: `.gn-invitations` fills with
  `var(--gn-tint-warning)`; carries no `box-shadow` (the raised-card treatment is gone); carries no
  `border-inline-start` (the accent edge is gone); and the rendered banner root carries the class with its
  icon `aria-hidden`. Both the CSS-level and render-level halves are separately mutation-witnessed live
  against the real source (planting `box-shadow` back into the rule reddens exactly the box-shadow case;
  removing `aria-hidden` from the JSX reddens exactly the render-level case), each reverted immediately
  after capture. — (`apps/web/test/workspaces-invitation-banner.test.tsx`)

## Owner round 3 fix round 1 (2026-09-16) — the fourth shadow role, `sunken-compact`

Block `13.411`, minted per this file's own recount ritual (see the "CORRECTED 2026-09-16" note above
`13.400`'s block) — the true maximum id in use at HEAD was `13.410`, not `13.411` as a coordinator review
first stated.

- **13.411** ✅ **A fourth `ShadowRole`, `sunken-compact`, and every place it had to reach** — owner round
  3: "check the prototype for the shadows of the sunken badges. looks like too much shadow for a small
  badge." `[data-style="neo"] .gn-chip` and `[data-style="neo"] .ticket-type-list__badge` were both carved
  with `--gn-shadow-sunken` (`inset 4px 4px 9px`, the SAME treatment `.gn-field__input`/
  `.ticket-type-list__row` correctly use) where the prototype's own `--chipShadow`
  (`design-system/interactive/desktop.dc.html:59` light, `:71` dark) defines a smaller `inset 2px 2px 4px`
  step reserved for badge/chip-scale elements; `--fieldShadow`/`--trayShadow` (`:61`/`:62`) stay the 4px/9px
  step. Three of the four prototype layer colours are byte-identical to existing primitives
  (`shadowNeoRaisedDarkLight`, `shadowNeoHighlightLight`, `shadowNeoSunkenHighlightDark` — verified by
  converting each `rgba()` to this file's 8-digit-hex convention and diffing, not assumed); the dark
  theme's first layer needed one new primitive, `shadowNeoSunkenCompactDarkDark` (`rgba(0,0,0,0.55)` →
  `#0000008c`, distinct from `sunken`'s own `rgba(0,0,0,0.6)`). `hig`/`minimal` are `[]` for the new role in
  both themes, matching the prototype's `--chipShadow:none`. Pinned assertions: `shadowValueOf`'s exact
  return string for `neo`/light and `neo`/dark (not merely that it contains `inset` or differs from
  `sunken` — a same-shape-wrong-colour regression would survive a looser check); `hig`'s value is `'none'`.
  A SEPARATE case (this same block) closes the emission gap the coordinator review's F5 named:
  `SHADOW_ROLES` (`tokens.ts`, the array `themeStylesheet()` actually emits from) and this file's own
  `SHADOW_ROLE_NAMES` used to be two hand-maintained, unlinked arrays — a role dropped from the emission
  array alone would leave every prior case green while the var vanished from the browser. `SHADOW_ROLES` is
  now exported and `SHADOW_ROLE_NAMES` re-exports it directly (cannot diverge at the source), AND a new
  case asserts, against a deliberately-hardcoded literal role list (NOT derived from either array, so it
  cannot silently shrink with a regression), that every declared shadow role's exact declaration string
  reaches `themeStylesheet()`'s output for every style×theme. Mutation performed and reverted live, not
  merely claimed: temporarily dropping `'sunken-compact'` from `SHADOW_ROLES` reddened this case
  (`AssertionError: hig/light/sunken-compact — expected declaration "--gn-shadow-sunken-compact: none;" in
  themeStylesheet()'s output`), confirming it actually catches the regression it exists for. Every other
  remaining `--gn-shadow-sunken` call site in `ui.css` (`.fields-editor__row`, `.ticket-type-list__row`,
  `.gn-help__search-input`, `.gn-help__results`, `.gn-help__none`, `.gn-help__toggle:hover`,
  `.gn-help__quote`, `.gn-field__input`) was individually reviewed and confirmed field/tray-scale, correctly
  left on `sunken` — enumerated one by one, not summarised as a group, since a group summary
  ("fields, trays, rows") is what let `.ticket-type-list__badge` go unnoticed in the first pass.
  `[data-style="neo"] .gn-segmented__item--on` (`ui.css:2474`) is flagged as needing its OWN, third
  geometry (the prototype's `--segOnShadow`, `inset 3px 3px 6px`) rather than either existing step, and is
  deliberately left untouched — a separate scope decision for the owner, out of this block. —
  (`packages/ui/test/tokens.test.ts`)

### Round 20 — the workspace-home prototype port (`/w/[workspaceId]`)

Block `13.413`, the next free one this file's own pointer recorded after `13.411` and `13.412` were
minted for the shadow-role work. **The next free BLOCK is now `13.416`.** Round 20 ports the desktop prototype's `isWorkspace`
screen onto the page Task 19 built: the project list becomes a GRID of per-project cards, the "Projects"
heading and its toggle leave the `<Card>` that used to wrap them, the archived list merges into the one
grid, the toggle takes the reference's own label, and the five door-cards move BELOW the projects and the
founding form. Five prototype elements were deliberately NOT transcribed, each for a reason that already
exists in this repo: a project `desc` (no such field is served), "Open read-only" (13.396 forbids it),
"0 archived · show" (13.397 forbids it), "Ask to be named" rows (rulings P32/P38 serve a COUNT, not
rows), and "Delete this workspace" (the prototype's own handler refuses it as irreversible).

**The bottom "Workspace" card is NOT ported, and that is a measured omission rather than an oversight.**
Its rename field is gated on admin, but `apps/server/src/permissions/check-permission.ts:349-358` records
that `workspace.renamed` is not in `ADMIN_ONLY_TYPES`, that a workspace GUEST is admitted for it today,
and that "which roles may rename a workspace is a product decision no plan in this series has taken".
Shipping an admin-gated field would therefore render a permission rule the product has not decided —
unlike every other admin affordance on this page, whose hiding is a DISPLAY of a real server gate, there
is no gate behind this one to display. **Owner: whoever next takes the rename-permission decision.**

- **13.413** ✅ **Each project card is ONE door, and the admin control is not inside it.** Round 20's owner
  ruling reverses Round 19b's separate "Open board" button: the card's informational body (name, archived
  badge, counts) is a single `<Link>` to that project's board. Three things are pinned, and each fails a
  different plausible implementation. **One link per card**, and no "Open board" anywhere on the page —
  the ruling REMOVES that button rather than leaving it beside the new door, because a card that was a
  link and also held an "Open board" button would be the two-doors-to-one-target failure Round 19b named,
  arrived at from the other side; an implementation that merely wrapped the existing row in a link passes
  every other assertion here and fails this. **Archive/Restore is not a descendant of the anchor** —
  `<a>` may not contain `<button>`, a nested one is invalid HTML that renders anyway, and jsdom does not
  complain, so containment is asserted directly (`door.contains(button)` false, `button.closest('a')`
  null). **The archived card is revealed IN PLACE**, keeping the served order, which is what the page's
  single `filter(p => showArchived || !p.archived)` preserves and what `[...live, ...archived]` — the
  obvious way to build one list from the two bindings already in scope — would break by sinking every
  archived project to the end. **That third assertion needed its OWN fixture and the shared one would
  have made it vacuous:** `workspaceAs` serves p1, p2, p3 with p3 archived, already last, so both
  expressions yield the identical order and the check could not have failed against the implementation it
  exists to rule out. The case's fixture puts the archived project in the MIDDLE — the only arrangement
  where the two disagree — and asserts the collapsed order first as a positive control, so a failure is
  about the disclosure rather than about the grid never having been ordered at all. —
  (`workspace-home.test.tsx`)
  **SUPERSEDED by 13.674 (2026-09-18):** reversed — archived cards sort to the END.

### Round 21 — owner corrections to the workspace-home port

Block `13.414`–`13.415`, the next free ids this file's own pointer recorded after Round 20 minted
`13.413`. **The next free BLOCK is now `13.416`.** Seven owner corrections, of which three touch cases:
archived projects sort to the END of the disclosed grid (reversing 13.413), MCP tokens moves off the
workspace home and out of `/settings` to `/account` (revising 13.387, minting 13.415), and the nav's
Settings link goes back behind a workspace while Inbox moves to just before Help (minting 13.414 and
amending 11.185's three arms). The other four are CSS-only and mint nothing: the projects grid becomes
three fixed columns on `/workspaces`' own breakpoints, Archive/Restore gains a hover, the archived
dimming moves from the card onto its door, and the four section cards trade a background swap for the
same brightness pair.

- **13.674** ✅ **REVERSED, not deleted** — the archived cards now sort to the END of the disclosed grid
  (owner: "always sort the archived projects to the end"), where Round 20 asserted the served order.
  `[...live, ...archived]` was the implementation Round 20 named as the thing to rule out; it is the
  requirement now, and the single filter it replaced is what this case rules out. **The cost Round 20
  argued from was ACCEPTED, not refuted:** a disclosed project does move twice on one click (in, and
  down); the owner weighed that against grouping retired work and chose the grouping. The other two
  assertions in this case (exactly one link per card; Archive/Restore not nested in the anchor) are
  untouched. **Round 20's fixture is what made this a one-line flip** — it puts the archived project in
  the MIDDLE, the only arrangement where the two expressions disagree, so it discriminates in EITHER
  direction; had the case been written against the shared `workspaceAs` fixture (p3 archived, already
  last) it would have been vacuous before and after, and the reversal would have been invisible. —
  (`workspace-home.test.tsx`)
- **13.672** ✅ **REVISED from five doors to four.** `/mcp/tokens` left this nav for `/account`, and its
  absence is now asserted by name rather than left to the length check, so restoring the link reddens the
  case with a sentence instead of "expected 5 to be 4". The case's ARGUMENT survives the removal, which
  is why the literals stay: `/mcp/tokens` was the obvious non-`/w/<id>/…` door, but Ticket types is still
  one (`/settings?workspaceId=<id>&tab=…`, workspace as a query param), so a builder-based rewrite would
  now emit `/w/<id>/settings?…` and break that door instead — the same defect, one door over. The
  negative assertion was repointed accordingly. Its other half is 13.415. — (`workspace-home.test.tsx`)
- **13.414** ✅ Inbox renders IMMEDIATELY before Help (owner: "move inbox to just before help"). Nothing
  else in the suite pinned nav ORDER — 11.170/11.171 assert presence, and 11.185's arms assert the full
  ordered set but would keep passing if this pair moved together within it. Asserted over the DOM's own
  order (`compareDocumentPosition`) plus an adjacency check on the rendered link list, so a link inserted
  between them fails rather than passing the looser "somewhere after". — (`app-nav.test.tsx`)
- **13.415** ✅ `/account` mounts the "Connected assistants" section, at heading level 2. **The other half
  of 13.387's removal**, and the reason it is a separate case: an absence asserted alone is satisfied by
  deleting the feature outright, so one case proves the link left the workspace and this one proves the
  screen arrived. **`level: 2` is load-bearing, not decoration** — `McpTokensScreen` defaults to `h1`,
  right for the standalone `/mcp/tokens` page and wrong here, where `/account`'s own `<h1>Your account</h1>`
  already owns level 1; mounting it with the default would pass a name-only query and fail this one. —
  (`account-page.test.tsx`)

**13.391 went GREEN in this round, having been red since `762b1c8d`, and it was not fixed — it became
true.** That commit moved Settings to the always tier, which made the scope note's sentence ("pick one to
reach its board, members and settings") false while a Settings link sat plainly in the bar; the note was
commented out and the case left failing. Round 21's ruling put Settings back behind a workspace, so all
three nouns the sentence names are workspace-conditional again — verified against the component rather
than assumed (Board needs `projectId`, Members and Settings need `!noWorkspace`) — and the note renders
again. The assertion was not touched. Its sibling case in the same describe was rewritten: Settings is
now asserted as workspace-conditional, and it pins the href that must NOT come back with the revert
(`/w/<id>/settings/ticket-types`, the sidebar-less page whose Edit button opened a third route), because
the obvious way to "move it back" is to restore the old target along with the old condition.

### Round 22 — five more owner corrections to the workspace home

**No new ids: the next free BLOCK is still `13.416`.** Four of the five corrections landed; the fifth
was put to the owner and DECLINED (below), so nothing shipped for it. Only 13.387 changed, and only in its expected set — the other three
shipped items are CSS-only and mint nothing, the same treatment Round 21's four CSS-only items got.

- **13.673** ✅ **REVISED AGAIN — Workflows joined Ticket types as a query-scoped door**
  (`/settings?workspaceId=<id>&tab=workflows`), so the split is now two path-segment doors and two
  query-scoped ones rather than three and one. Owner: "clicking workflows from the project screen opens
  up a separate page. it should open up the workflows tab in the settings page." Round 19e had left it
  pointed at the bare route, reasoning the move closed no defect the way ticket types' did; the merit it
  missed is that the bare page has NO SIDEBAR, so following the card dropped you out of the settings
  shell with no way back. The case's argument is untouched and now has two doors supporting it instead
  of one. — (`workspace-home.test.tsx`)

**A false claim was removed from 13.673's docblock (13.387's live revision, re-minted above) in the same edit, and it is worth recording because
it is the kind that reads as measured.** The docblock asserted "The paths are also checked against the
app directory itself, in the same run: a link is only proven live by a `page.tsx` existing at the route
it names." A grep for `existsSync` across `apps/web/test` finds exactly one such check — 13.392's, in
`app-nav.test.tsx`, over the NAV's targets. These four doors are not nav targets and no filesystem
assertion has ever covered them. The sentence invited a reader to trust that a typo'd href here would be
caught by something other than the literal expected in the case itself, which was never true. Three of
the four targets happen to coincide with routes 13.392 does check, so the real gap is narrow — but the
claim was wrong about this case, and a wrong claim about coverage is worse than no claim.

**SUPERSEDED THE SAME DAY BY ROUND 23 — read that section first: the Board item is GONE, not merely
conditional.** What follows is the Round 22 ruling as taken, kept because its reasoning is what rules
out the implementation somebody will otherwise reach for.

**RULED, 2026-09-16 — "once inside a workspace, the board nav bar item should be always
visible" is NOT adopted; Board stays conditional on a project being in the route.** The owner was given
the three options below and chose to leave the behaviour as it is, so `app-nav.tsx` is unchanged by this
round and the prototype's `navDef` divergence on Board is now a DECIDED difference rather than an
untranscribed one. Anyone reading that docblock's "a workspace with no project in scope has no true
Board target" should treat it as standing product policy, re-affirmed here, not as a gap awaiting work.
The reasoning that made the question worth asking is kept below, because it is what rules out the
implementation somebody will otherwise reach for next time.

Board renders only when the route carries a project, because the only board route in
the product is `/w/<id>/p/<pid>`: there is one board per PROJECT, not one per workspace. Making the item
unconditional therefore needs a target, and the obvious one — the workspace's first served project — was
REJECTED rather than shipped. It would send two people with the same workspace to different boards
depending on server ordering, move under one person when a project is founded or archived, and
manufacture the "current project" `app-nav.tsx`'s own docblock records this shell as refusing to
remember outside the URL. It would also still need a fallback when a workspace has no projects, so the
item would remain conditional and the instruction would go unmet anyway. The prototype's `navDef` is not
evidence for it either: its `go("board")` works because its state holds one implicit current project,
which is a state model this product does not have. The two alternatives put to the owner were a
`/w/<id>/board` route rendering a picker, and pointing Board at `/w/<id>` when no project is in scope
(which would put two nav items on one target while you are on that page — the two-doors-to-one-target
shape this repo has ruled against twice). **Both were declined in favour of the current behaviour: the
nav does not offer a link that cannot resolve, which is the prototype's own stated filter rule, and
that rule wins over its Board row's particular placement.**

### Round 23 — the Board nav item is removed

**No new ids: the next free BLOCK is still `13.416`.** Owner, hours after the Round 22 ruling above:
"the board on the nav bar doesn't work. lets remove it." It is gone, along with `AppNav`'s `projectId`
prop, whose only consumer it was.

**It could not have worked, and that is the finding worth keeping.** Round 22 asked the narrower
question — should the item be visible without a project — and answering "leave it conditional" left in
place something nobody had stated plainly: this product has one board per PROJECT, so Board's only
possible target was `/w/<id>/p/<pid>`, so it could render only when the route already carried a
project, which is exactly when the reader is already standing on that board. **The item was a link to
the current page in every state it could reach, and `aria-current` resolved to `"page"` every time it
appeared.** No regression made it useless; it had no useful state. The Round 22 options remain the only
ways it could return, and both still need a decision nobody has taken.

Three cases moved, none minted. Case **11.185**'s third arm — "WITH a workspace AND a project" — was
kept, with its job changed: it used to prove a project in the route ADDS Board, and now proves a project
in the route adds NOTHING. Its expected array is now deliberately identical to the second arm's, because
the two nav shapes have collapsed into one. That is not a redundant arm: the nav still reads
`usePathname()`, so a board route remains a distinct input, and a future project-conditional link would
redden this arm while leaving the second green — which is what would name the fault. Two explicit
negatives were added beside the array (`not.toContain('/w/ws_1/p/p_1')`, and no link named `Board`) so a
failure says what came back rather than only that an array grew. The arm's own docblock, which used to
describe the Board mutation witness, was rewritten rather than left describing a link that no longer
exists. Case **13.392** lost `/w/ws_1/p/p_1` from the route table. The case checks routes the nav
RENDERS, and the board route is no longer one — it still exists and is still reached from the workspace
home's project cards. The table is bidirectional (rendered hrefs are subtracted from it), so a stale row
would have failed loudly as "nav does not render it" rather than rotting quietly. Case **13.391** is
untouched and still green, but was re-verified rather than assumed: its scope note says "pick one to
reach its board, members and settings", and this round removed the bar's only Board link. The sentence
describes what picking a workspace GETS you, not what the bar renders — a board is one click from the
workspace home's project grid — so it stays true. It would become false only if boards stopped being
reachable from a workspace at all. This was checked because the case was made green one round earlier on
precisely that sentence's accuracy, and a claim that was true when written is exactly the kind that goes
stale without anyone looking.

### Round 24 — the account menu, and the inbox becomes an icon

**Block `13.416`–`13.423` minted here; the next free BLOCK is `13.424`.** Owner, two instructions in one
message: *"Current Signout button: make it into a round profile pic like thing, that opens up a context
menu on click. signout option will be moved to the bottom of that menu. along with the help and account
item from the nav bar"* and *"make inbox an icon. with an indicator (green dot?) if there is an unread
event. place it on the left of the round profile pic like thing."*

**This is the first surface on this branch with no prototype to transcribe.** Every other port here
could point at `desktop.dc.html`. Its nav is a flat `navDef` list (`:2277`) with no avatar, no menu and
no popover anywhere in the file, so the menu follows the prototype's CONTROL metrics while the behaviour
is the product's own. A later round that "restores prototype fidelity" here would be restoring something
that never existed.

**Two owner rulings taken before implementation, both on questions the instruction left open:**

1. **The unread count.** A dot can only say "some", and the badge it replaces said "3". Ruled: dot for
   the visible signal, **count in the accessible name**. Dropping the number would have removed it for
   exactly the readers least able to go looking, and would leave unread state signalled by COLOUR ALONE
   (WCAG 1.4.1). `UnreadBadge` is untouched and still renders the number on `/inbox` itself.
2. **The menu's header.** Ruled: **name and email**. The control being replaced was `Sign out {name}`,
   whose accessible name carried the signed-in identity on every page; a monogram carries none, two
   people with the same initial rendering identically. `useCurrentUser` gained `email` to serve it.

**A regression caught during implementation, recorded because the test that would have caught it was
already there and green.** The first cut had `AccountMenu` return `null` when signed out — correct in
itself, it has no name, no email and nothing to sign out of — which silently deleted the only route to
`/help` from the signed-out shell, on a page explicitly reachable signed out. Help and Account therefore
**stay bar links when there is no session**, and the pre-existing case "AppNav renders its always-items
with NO session at all" passes unmodified, which is the evidence the fallback is right rather than
merely present.

**13.414 is SUPERSEDED, and its subject is gone rather than its claim being false.** Help is no longer a
link in this bar, so "renders Inbox immediately before Help" is not wrong — it is unaskable. It is
replaced by 13.416, which pins the same KIND of claim (adjacency in the bar's tail) at the arrangement
that now exists, so the ordering tripwire Round 21 bought is not lost in the move. Case **13.414** is
superseded by Round 24 — not renumbered, not reused.

- **13.416** ✅ The inbox icon renders immediately left of the account-menu trigger, asserted over
  `compareDocumentPosition` plus sibling adjacency so an element inserted between them fails.
  — (`apps/web/test/app-nav.test.tsx`)
- **13.417** ✅ The menu holds Help and Account, both reachable once opened, both with their real hrefs;
  and the menu is CLOSED on mount with `aria-expanded="false"`. **This case is what makes 11.185's
  shortened link list safe to assert** — that list got shorter by two entries, which is also exactly
  what DELETING the links would produce, so without this the suite would agree with that bug.
  — (`apps/web/test/app-nav.test.tsx`)
- **13.418** ✅ Sign out is the LAST menu item and keeps the accessible name `Sign out {name}`. Two
  claims in one case because they fail together: the owner asked for it at the bottom, and the shell
  ratchets an accessible-name floor on that string which `e2e-stack/passkey-registration.spec.ts` also
  addresses the control by. — (`apps/web/test/app-nav.test.tsx`)
- **13.419** ✅ The menu heads with the signed-in name and email, the identity the replaced control used
  to carry. **RULING E5-37 (closed), same case's own contract extended, no new id (§13's numeric space
  is contested across concurrent batches tonight — controller allocation, 2026-09-21 21:0x — so this
  ruling holds none there):** `useCurrentUser`'s `name: user.name ?? user.id` never caught an EMPTY
  string, and better-auth's magic-link population creates every email sign-up with `name: ''`. Two new
  arms on the SAME describe block: the trigger's accessible name and the menu header both fall back to
  the EMAIL for a `name === ''` user, and both fall back further to the raw id when even the email is
  empty — the same `name → email → id` order `members/page.tsx`'s `memberLabel` already uses. —
  (`apps/web/test/app-nav.test.tsx`, `apps/web/src/providers.tsx`)
- **13.420** ✅ Escape closes the menu AND returns focus to the trigger. The focus half is the
  load-bearing one: closing without it strands focus at the document root, so a keyboard user who opens
  the menu and changes their mind must tab from the top of the page. A case asserting only that the menu
  had gone would pass on that bug. — (`apps/web/test/app-nav.test.tsx`)
- **13.421** ✅ The dot appears only when unread > 0, and the count is in the link's accessible name at
  both states. Asserting only "a dot appears" would pass on an implementation that dropped the number,
  which is the change this case exists to forbid. — (`apps/web/test/app-nav.test.tsx`)
- **13.422** ✅ "1 unread notification" is singular. — (`apps/web/test/app-nav.test.tsx`)
- **13.423** ✅ Opening the menu focuses the first item, and ArrowDown/ArrowUp walk the items, wrapping
  at both ends. **Recorded late — the test landed in Round 24's commit while this file carried `13.423`
  only as the next-free pointer, so for one commit the case existed in code and nowhere in the
  catalogue.** That is the drift `Features.md`'s "same change set, never a follow-up" rule exists to
  prevent, and it is written down rather than quietly backfilled. The case is also **13.420's
  precondition**: until focus moved into the menu on open, "Escape returns focus to the trigger" was
  vacuous, because focus had never left. — (`apps/web/test/app-nav.test.tsx`)
- **13.1050** ✅ A client-side navigation TELLS assistive technology which page it landed on. Before this,
  a route change in this single-page app was completely silent: focus stayed on the nav link that was
  just activated, the title did not change (that is P12, a separate ruling for a separate batch), and
  nothing was announced. **The measured mechanism is narrower than "the framework ships no announcer"** — the App
  Router does mount one (`next/dist/client/components/app-router-announcer.js`, mounted unconditionally
  at `next/dist/client/components/app-router.js:423`); it renders a visually-hidden `role="alert"` region,
  reads `document.title`, falls back to `document.querySelector('h1')` **only when the title is empty**,
  and speaks when that value differs from the last one it read. `app/layout.tsx:8` sets one static
  `metadata.title`, so the value never differs and the `h1` fallback is unreachable — mounted, and
  permanently silent. **The remedy is therefore deliberately NOT a second unconditional announcer**, which
  would restore the announcement today and double every one of them the day per-route titles land: the new
  `RouteAnnouncer` is written to be exactly COMPLEMENTARY to the framework's condition — silent when the
  title changed or is empty (the framework has already spoken), and announcing the new page's own `<h1>`
  when the title is non-empty and unchanged (the only case the framework cannot speak to). Four assertions,
  each with a control: nothing is announced on the first render, because a screen reader announces the
  loaded document itself; a route change announces the page it
  ARRIVED at and not the one it left; it stays silent when the title changed, with a control proving the
  page really did change underneath it; and the live region is rendered unconditionally and empty on every
  page, because a region that mounts together with its text is not reliably spoken. Mutation-witnessed:
  suppressing the announcement reddens only the second; removing the title guard reddens only the third;
  mounting the region only when it has text reddens four. — (`apps/web/test/route-announcer.test.tsx`)

  *Id note: `13.1047`–`13.1049` were skipped deliberately — they are reserved and unused in executor 1's
  allocated block `13.1034`–`13.1049` (`13-deployment-dogfooding.md:140-142`,
  `13-owner-requests-and-backlog.md:2185`). `13.1051` was then minted later in the same batch (P9, in
  `13-hig-per-screen.md`) and `13.1052` by P8 (`13-board-prototype-port.md`), so the next free id in this
  space is `13.1053`.*

**Five existing cases in `inbox-nav-link.test.tsx` were re-aimed, not weakened.** 11.152, 11.155, 11.156,
11.169 and the load-window case all asserted the count through `UnreadBadge`'s `role="img"`, which the
nav no longer renders. Each now asserts the same count through the link's accessible name, plus the
dot's presence or absence — so 11.156 ("keeps the last count when a refresh fails") and 11.169 ("clears
the count when the session ends in place") still measure exactly what they always did. 11.169 asserts
BOTH the name and the dot deliberately: a dot that disappeared while the name still read "3 unread"
would leave the previous session's count being announced to whoever is looking now, which is the defect
that case exists for.

### Round 25 — the nav remembers the last workspace you opened

**Block `13.424`–`13.427` minted here; the next free BLOCK is `13.428`.** Owner: *"keep the last opened
workspace in local storage, and based on that, the workspace scoped navbar items should be made visible.
so that just moving to a separate page (inbox, help, account, etc) does not automatically hide them."*

`use-last-workspace.ts` (NEW) holds the memory, following the `gn-style`/`gn-theme` convention already in
this shell. `AppNav` takes the route's workspace when there is one and the remembered one otherwise.

**The rule the bar has held since Round 19b is UNCHANGED: a link renders only when its target exists.**
What changed is where the workspace comes from. That matters because a remembered id is a *guess about
the past* — it may name a workspace you have since been removed from, or one that was deleted — so the
two sources are NOT treated alike:

- A **routed** workspace renders its links immediately. Standing on `/w/<id>/members` is proof.
- A **remembered** one renders them only once `useWorkspaceName` resolves a name from
  `getMyWorkspaces()`. Rounds 22 and 23 deleted the Board item for offering a link that could not
  resolve; this is the same hazard arriving from storage instead of from a route. No second request and
  no second definition of "reachable" — it reuses the read the bar already makes.

**Two assertions in 13.391 changed, and neither was relaxed to fit the code.**

1. The scope note's query moved from `getByText` to `findByText`. It is now gated on a POSITIVE "storage
   read, nothing remembered for this person" rather than on the synchronous "no workspace", because the
   synchronous form would flash *"No workspace selected"* at every viewer who HAS a remembered workspace,
   on every global page they open. The sentence is one tick later and never false.
2. "No workspace in the ROUTE, no Settings link at all" became "no workspace REACHABLE — none routed and
   none remembered — no Settings link." The old wording is precisely what the owner's instruction
   revokes. **13.424 is the counterpart that keeps this honest**: without it, the "no Settings" assertion
   could be satisfied by a nav that had simply stopped remembering anything at all.

**A stated cost, rather than a hidden one.** When a workspace IS remembered but its name never resolves,
neither the scoped links nor the scope note render. The alternative — clearing the memory when the name
fails — would destroy a valid workspace on a TRANSIENT `getMyWorkspaces` failure, throwing away real
state to recover a hint. `Workspaces` remains one click away and is the real route out.

Case **13.423** belongs in this list too, recorded late in Round 24 — see that section.

- **13.424** ✅ On a global page (`/inbox`) with a workspace remembered and resolvable, the name, My
  Work, Members and Settings all render with their real hrefs, none carries `aria-current`, and the
  scope note is absent. The owner's instruction, asserted directly.
  — (`apps/web/test/app-nav.test.tsx`)
- **13.425** ✅ A workspace remembered for a DIFFERENT user is ignored: the scope note renders and the
  other person's workspace NAME appears nowhere. `localStorage` outlives a session, so an unkeyed memory
  would render the previous viewer's workspace in the next viewer's chrome — the defect 11.169 exists
  for, one surface over. The assertion is on the name, because the name is the part that leaks.
  **Mutation-witnessed:** deleting the `storedUserId !== userId` guard reddens this case and nothing
  else. — (`apps/web/test/app-nav.test.tsx`)
- **13.426** ✅ A remembered workspace that no longer resolves offers no scoped links. The fixture is a
  SUCCESSFUL read that does not contain it (`workspacesOf([])`) — what being removed looks like — rather
  than a rejecting stub, which would prove something weaker since a refusal also yields a null name. The
  inbox link is asserted first as a settled-render witness, so "no My Work" is a decision and not a
  snapshot taken too early. **Mutation-witnessed:** treating a remembered id as authoritative reddens
  this case and nothing else. — (`apps/web/test/app-nav.test.tsx`)
- **13.427** ✅ Opening a workspace records `{userId, workspaceId}` under `gn-last-workspace`. Asserted
  through the STORAGE KEY, not through a later render: a later render would also pass if the value were
  held only in React state, which would not survive the page navigation this whole feature exists for.
  — (`apps/web/test/app-nav.test.tsx`)

**Test isolation, added here because the nav now WRITES.** jsdom keeps one `localStorage` for the whole
module, so a case rendering `<AppNav workspaceId="ws_1" />` left the key behind for every case after it —
order-dependence that shows up as a suite going red when one test is renamed. `app-nav.test.tsx` now
clears storage and reseeds the mock session in `beforeEach`.

### Round 26 — the nav stops jittering on page changes

**Block `13.428`–`13.429` minted here; the next free BLOCK is `13.430`.** Owner: *"the nav bar item
jitters on changing pages. the workspace scoped items briefly disappears and reappears. make it so that
it is smooth and the jitter does not happen."*

**The mount is the bug.** `Providers` lives in the root layout and persists across client-side
navigation, but `AppNav` is rendered by each PAGE (`app/inbox/page.tsx:210` and fourteen siblings), so
every navigation unmounts and remounts it. Its state therefore reset to "nothing known yet" on every page
change: `useLastWorkspace` restarted at `unknown` and `useWorkspaceName` at `null`, so the
workspace-scoped links vanished for the tick it took to re-read storage and re-fetch the name, then came
back. Round 25 made this loud by putting four links behind that state; **the workspace-NAME half of it
predates Round 25 entirely** and flickered even when navigating between two pages of the same workspace,
where it was one item and easier to miss.

Fixed by holding both answers in MODULE scope, which survives the remount, and initialising `useState`
from them. The first load of a session still resolves asynchronously — nothing is known yet, and
painting links from no information would be inventing state.

**Two things the fix must not do, each with its own case and each mutation-witnessed:**

- It must not **resurrect a workspace you have lost**. The cache is read on every remount, so an entry
  left behind after the product learns the workspace is gone would put the name back one navigation
  later — 13.426's defect displaced in time rather than fixed. A successful read that does not contain
  the workspace therefore EVICTS; only a rejected read (transient) leaves the entry alone.
- It must not **leak across viewers**. Neither cache passes through `readFor`'s user guard — the
  remembered-workspace cache is checked before it, the name cache is keyed by workspace id alone — so
  both are dropped when the observed user id changes. Signing out and back in as someone else is a
  client-side navigation, which does NOT reset module state.

- **13.428** ✅ After a navigation, the workspace name, My Work, Members and Settings are present in the
  FIRST committed render, and the scope note never flashes in their place. **The case mounts twice and
  asserts synchronously, and both are load-bearing**: every other case in this file mounts once and so
  could not see a remount defect at all, and any `findBy*` here would wait exactly long enough to hide
  the flicker it exists to catch. **Mutation-witnessed:** restoring either hook's cold start reddens this
  case and nothing else. — (`apps/web/test/app-nav.test.tsx`)
- **13.429** ✅ A workspace that has become unreachable does not reappear on the next navigation, proving
  the eviction above. — (`apps/web/test/app-nav.test.tsx`)

**A mutation that was thrown away rather than believed.** The first attempt at witnessing 13.428 replaced
the `useState` initialiser with `() => { status: 'unknown' }` — a block body returning `undefined`, not
the object literal intended. It reddened 22 cases, which looks like a strong witness and is worthless:
the code under test was malformed rather than reverted. A mutation must be the code that plausibly
SHIPS, and a failure count far larger than expected is a reason to re-read the mutant, not to record a
result.

### Round 27 — the project/board page's desktop-prototype-port begins: page chrome (`/w/[workspaceId]/p/[projectId]`)

**Block `13.430` minted here; the next free BLOCK is `13.431`.** Task 2 of
`docs/superpowers/plans/2026-09-16-board-prototype-port.md` (Task 1 was STRUCK — see the plan's
Progress log — so this is the port's first landed code). Restyles the page's existing chrome rather
than rebuilding it: `role="tablist"`/`role="tab"`/`aria-selected` are unchanged throughout.

**The tab rail becomes the shared segmented control.** The container's class moves from the
page-local `.gn-view-tabs` to `.gn-segmented`, and each tab button gains `.gn-segmented__item` plus
`.gn-segmented__item--on` when selected — the same classes `/sign-in`, `/account` and `/help` already
share (`packages/ui/src/ui.css`). `.gn-view-tabs` now survives nowhere in the product;
`apps/web/app/globals.css`'s own docblock had already recorded it as surviving "only on the project
page", and its three now-dead rules are left in place rather than deleted — out of this task's file
scope (`page.tsx` and `ui.css` only) and reported rather than silently removed.

**The New-ticket control moves out of the tablist into a new `.gn-project__header` row.** It used to
render as the tablist's fifth child — a plain `<button>` (or a `<p role="status">` while gated) sitting
inside a `role="tablist"` beside four `role="tab"` children, an ARIA defect the 2px-gap segmented track
would only have made more visible. `.gn-project__header` is the container Task 4 (search), Task 5
(Filters) and Task 8 (the workflow `<select>`) add their own controls to; New ticket is the one already
built, so it moves in now. No test scopes a `New ticket` query from the tablist container — both
`page-refusals.test.tsx` and `project-create-gate.test.tsx` query `screen` (or `within(dialog)`)
directly — so the move changes no test's reach.

**`.gn-project`, `.gn-project__breadcrumb`, `.gn-project__title` and `.gn-project__summary` are
declared in `ui.css` per the spec's Page-chrome metrics table, and are UNCONSUMED here.** This page
reads no project name anywhere: `BoardView` is `{projectId, groups}` (`view-types.ts:139`), and
`DataSourceQuery` has thirteen methods, none named `getProject`/`getProjects` — only
`getMyWorkspaces()` carries project names, and only on the workspace-home page
(`apps/web/app/w/[workspaceId]/page.tsx`), not here. Grepped across every task in the port's plan:
no task ever references `.gn-project__breadcrumb`/`__title`/`__summary` outside this one CSS-declaring
step. Recorded rather than guessed at — a future task (not yet in this plan) owes the read before
these three rules render anything real; `.gn-project` itself IS consumed, as the page's own content
wrapper (`padding`/`column`/`gap`, nested inside the existing `.gn-shell__main`, not merged onto it —
the two files' rules would otherwise cascade-order against each other).

- **13.430** ✅ The selected tab, and only it, carries `gn-segmented__item--on`, driven from the same
  boolean that sets `aria-selected` rather than two comparisons kept in agreement by hand.
  — (`apps/web/test/project-calendar-timeline.test.tsx`)

**Task 2 fix round 1 (coordinator Rulings 5 and 6, same day) — the two findings above were correct,
and both are now closed rather than merely flagged.**

**Block `13.431`–`13.432` minted here; the next free BLOCK is `13.433`.** Ruling 5: `.gn-project`
drops its horizontal `padding` entirely (it kept only `flex-direction`/`gap`/bottom `padding`) — the
brief's literal `padding: 0 2rem 1.5rem` stacked additively on top of `.gn-shell`'s own
`padding: 0 1.25rem 3rem` (`apps/web/app/globals.css:101`), landing this page's content at 52px from
the viewport edge (20px + 32px) rather than the prototype's own 32px. `.gn-workspaces`
(`globals.css:210`) already answers this exact shape for a sibling page — it keeps ONLY what
`.gn-shell` does not already provide — and `.gn-project` now follows the same rule, with the
residual 20px-vs-32px gap recorded in a comment on the rule rather than closed: closing it would mean
moving `.gn-shell` itself, shifting every route in the product for one page's inset.

Ruling 6: the CSS gap was real, but the DATA gap was not — `ProjectRef.name`
(`packages/app-core/src/view-types.ts:15-23`) already travels on `WorkspaceRef.projects`, served by
the SAME `getMyWorkspaces()` read `apps/web/src/use-workspace-name.ts` already makes for this page's
own `<AppNav>` link. Added `apps/web/src/use-project-name.ts`, mirroring `use-workspace-name.ts`'s
shape and its "omission, never the id" contract exactly, but WITHOUT that hook's module-scoped name
cache: `AppNav` remounts on every client-side navigation (Round 26's whole reason for caching), while
this hook mounts once per page load, so there is nothing a cache would buy here and the asymmetry is
recorded as a decision in the new hook's own docblock. `page.tsx` now renders the workspace name in
`.gn-project__breadcrumb` and the project name in `<h1 className="gn-project__title">`, each
independently omitted (not the raw id, not a placeholder) while its own hook holds `null`. Neither
reserves layout space while absent — no fixed-height wrapper sits around either — so
`.gn-project__header` is exactly as tall as whichever of its children have resolved and grows once a
name mounts, rather than holding blank space that a name later fills. `.gn-project__summary` (the
`N of M shown` line) is UNCHANGED from Round 27: still declared, still unconsumed, left for the task
that adds the count rather than filled with an invented number.

- **13.431** ✅ A resolved `getMyWorkspaces` read names both the breadcrumb (the workspace) and the
  title (the project), each independently, disambiguated from `<AppNav>`'s own workspace-name link by
  scoping to `.gn-project__breadcrumb`. — (`apps/web/test/project-page-chrome.test.tsx`)
- **13.432** ✅ While `getMyWorkspaces` has not answered (left unstubbed — pending or refused, the same
  state either way to the caller), neither the breadcrumb nor the title element exists at all, and
  specifically the raw workspace/project ids are absent from the document — the failure this pair
  exists to catch is the id standing in for the name nobody could confirm.
  — (`apps/web/test/project-page-chrome.test.tsx`)

No new token roles: Task 1 was struck, so every `var(--gn-…)` referenced above (`--gn-text-muted`)
was already declared before this change — the same role `.gn-field__label` already reads in the same
file. `packages/ui/test/tokens.test.ts`'s role-existence guard and `token-discipline.test.ts`'s
no-literal-colours guard both pass unchanged.

**Task 2 fix round 2 (coordinator review of fix round 1) — one Critical, one Important, one
amendment to the coordinator's own Ruling 5.**

**Critical, no new case (the existing 11.160/13.430 tab-role/class assertions and 13.431/13.432's
own name assertions already cover the corrected markup — the defect was purely structural
placement, not a missing behaviour).** `.gn-project__header` had been holding the breadcrumb, the
`<h1>` AND `createRegion` as three children of one `flex; align-items: center; flex-wrap: wrap`
row — the 34px/700 title sat vertically centred beside the 13px breadcrumb and the New-ticket
button. The metrics table's separate "Breadcrumb 13/18" / "Title 34/41" / "Header row top margin
24px" entries describe three STACKED children of `.gn-project`'s own column, not one line, and
Tasks 4/5/8 would each have landed their own control on that same crowded line. Restructured:
breadcrumb and `<h1>` are now direct children of `.gn-project`, spaced by its 14px `gap`;
`.gn-project__header` holds only `createRegion` and keeps its own `margin-top: 1.5rem`. The ARIA
fix (`createRegion` out of `role="tablist"`) is unchanged.

**Ruling 8 (amending Ruling 5) — `.gn-project` drops its bottom padding too.** Round 1 kept it,
reasoning `.gn-shell`'s bottom padding didn't "double as this row's tighter one" — wrong: `.gn-shell`
already supplies 48px bottom, so the kept 24px stacked to 72px against the prototype's 24px alone,
the same additive defect Ruling 5 removed on the horizontal axis. `.gn-workspaces`, round 1's own
cited precedent, adds no bottom padding either. `.gn-project` now sets no `padding` property at
all; the residual gap (20px-vs-32px sides, 48px-vs-24px bottom) is recorded in the rule's own
comment on both axes, not closed — closing either moves `.gn-shell` for every route.

**Important — 13.432 was order-dependent.** `project-page-chrome.test.tsx` never cleared
`useWorkspaceName`'s module-scoped `nameCache`, which 13.431 (run first) populates for `WORKSPACE`.
13.432's assertions were still correct — they would have caught a real `?? id` regression — but its
*initial* render painted the stale cached name rather than starting cold, so the case was not
exercising the state its own description names when run after 13.431, and could have walked a
different path standalone or under `--shuffle`. Fixed the way `app-nav.test.tsx` already does for
the identical cache: `clearWorkspaceNameCache()` in `beforeEach`. **Confirmed by running 13.432
alone** (`vitest run -t 13.432`), the check that actually proves the order-dependence is gone
rather than merely re-passing the full file in its usual order.

Neither case ID changes: 13.431 and 13.432 still name the same two behaviours, now proven true
independent of run order and with the DOM shape the metrics table actually describes.


## The ticket sheet's scrim and entrance, matched to the prototype's MOTION (executor 2, 2026-09-19) — case `13.961`

**The owner:** *"gn-sheet__scrim. the surface that shows when you open a ticket. check with the
prototype and match it."*

**THE COLOUR WAS NOT THE MISMATCH, and that is worth stating first because it is where the work is not.**
All four style × theme combinations already matched the prototype exactly — `--gn-surface-overlay`'s four
primitives against the prototype's `--overlay`, read from both sides and again rendered (hig light
`0.341`/`0.34`, hig dark `0.620`/`0.62`, neo light `0.451`/`0.45`, neo dark `0.600`/`0.6`). **One trap cost
an eyeball error before it was measured: the prototype's default body state is `data-style="hig"` while the
running app is `neo`**, so the two scrims LOOK different — cool blue against warm tan — while both being
correct. A style difference is not a defect, and "fixing" it would have broken a value that was already
right.

**THE MISMATCH WAS MOTION. The prototype animates; the product did not.** `.gn-sheet__scrim` computed to
`animation: none 0s`, `.gn-sheet` had no animation at all, and `gnSlide` appeared nowhere in
`packages/ui/src` or `apps/web/app` — the sheet snapped open.

- ✅ **13.961 — the scrim fades and the panel slides, at the prototype's own timings and behind the
  repo's own reduced-motion idiom.** `packages/ui/test/sheet-motion.test.ts`.
  **The values are the prototype's, unchanged** (`desktop.dc.html@6d7b67c0a52c`): `gnFade .2s ease` on the
  scrim (`@keyframes` at `:96`; carried by all four of its scrims — `:1384`, `:1436`, `:1570` and the
  ticket sheet's own `sheetScrimStyle` at `:3396`) and `gnSlide .26s cubic-bezier(.32,.72,0,1)` over a
  `translateX(28px)` on the panel (`:95`). **The 28px is checked against OUR width rather than copied
  blind**: the prototype's sheet is `min(660px,100%)` (`:3399`) and this one is `min(40rem, 94vw)` = 640px
  — twenty pixels apart, not a difference a travel distance can be wrong for — and both panels sit against
  the same right edge, so a positive `translateX` is a slide IN on both sides rather than the wrong way on
  one.
  **ALL THREE PANELS ARE GUARDED**, each by a `@media (prefers-reduced-motion: reduce)` block setting
  `animation: none` on its own selector. A reader who asked for less motion gets none of this. *(The count
  is stated as it is: this shape — `animation: none` — was used **once** in this stylesheet before this
  change, by `.gn-help`; the file's other guards cover `transition`. An earlier version of this entry said
  "three times" and was wrong.)*
  **The scrim's fade is on the SHARED `.gn-dialog__scrim, .gn-sheet__scrim` rule, AND THE PROTOTYPE DOES
  DECIDE IT — the first version of this entry said the opposite and was wrong.** It claimed *"all four of
  its scrims are side panels and it draws no centred dialog anywhere"*. A grep for the scrims'
  `background:var(--overlay)` returns four hits, and **three** are side panels: the fourth,
  `desktop.dc.html:1570`, is the scrim of a **CENTRED** dialog whose container (`:1569`) is
  `align-items:center;justify-content:center` and whose panel (`:1571`) carries
  `animation:gnRise .24s cubic-bezier(.32,.72,0,1)`. `mobile.dc.html:1206-1208` draws the same pair.
  ***The grep was run; the step that would have falsified the reading — checking each hit's CONTAINER
  rather than the hit itself — was not.*** So `.gn-dialog` now RISES on the reference's own values, its
  panel guard lands with it, and the justification for animating the shared scrim rule is the reference
  rather than our own structure alone. Leaving the dialog unanimated would also have shipped a modal whose
  scrim faded while its panel snapped — an inconsistency this change would have introduced rather than
  found.
  **`ui.css`'s `gnFade` comment was corrected in the same change**, as its own reasoning required: it said
  the keyframes lived at the foot of the Help section *"rather than in a shared block"* because `gnFade`
  was **the only animation in this stylesheet**. Adding `gnSlide` made that false, so both keyframes moved
  to a shared block at the head of the file and the sentence now says why.
  **NO UNIT TEST CAN SEE ANY OF THIS** — jsdom has no layout engine and no animation timeline — so the case
  is a **source scan over the declared values**, in the idiom `13.893` established, and its docblock states
  its own blind spots. **The motion itself was watched in a REAL browser**: Chromium via Playwright,
  driving the same bytes of `ui.css` with the `Sheet` component's own markup — eleven checks, including a
  mid-animation transform, a settled `transform: none`, the scrim's `0 → 1` opacity, and
  `prefers-reduced-motion: reduce` **emulated at the engine level** (both animations read `none`). A
  screenshot at t=130ms shows the scrim mid-fade and the panel mid-slide at its 640px width.
  **FIVE MUTATIONS, four of which are named here and one of which is a lesson.** Removing the scrim's
  animation, removing the panel's animation, changing the panel's timing, and changing the keyframe's
  `translateX(28px)` → `14px` each redden this case. **The FIRST attempt at the fourth mutated nothing**:
  the pattern matched the first `translateX(28px)` in the file, which is inside this change's own prose
  comment QUOTING the value, so the keyframe was untouched and the case correctly stayed green. *A
  mutation result of `passed` is not evidence unless the mutation is confirmed to have fired* — the same
  distinction this catalogue records for survivors at `13.744`.
  **And the case's own first draft was broken in a way that made three of its five assertions pass for the
  wrong element:** the block scanner captured a rule's preceding doc comment as part of its "selector", so
  the two commented rules this case is about were invisible and the only block that matched was the
  reduced-motion guard's. Comments are stripped before any scan now, and the reason is in the file.
  (`packages/ui/src/ui.css`, `packages/ui/test/sheet-motion.test.ts`)

### What is NOT covered, named rather than implied

- **The prototype's "Full screen" mode is a named GAP, not built.** Its ticket sheet carries
  `sheetFullLabel` (`:1119`) whose mode turns the scrim into `var(--surface)` — a solid surface — and makes
  the panel full-bleed (`width:100%;height:100%`, body `max-width:860px` centred). **This product has no
  full-screen ticket mode at all.** That is a feature, not a scrim value, and the owner asked about the
  scrim; recorded with the prototype's lines so the next reader does not have to re-derive it.
- ~~**The prototype draws a third keyframe, `gnRise`** (`:97`, `translateY(14px)`), which this stylesheet
  does not define and nothing uses.~~ **STRUCK — this bullet was wrong, and it was wrong in the same way as
  the paragraph above it.** `gnRise` IS used here now: it is the **centred dialog's** entrance
  (`desktop.dc.html:1571`), so it was never an idle third keyframe awaiting a consumer — it was the one key
  for the modal shape this change had mis-read as absent. The bullet is struck rather than deleted so a
  reader who remembers reading it can see what it became, and the error is named in `ui.css`'s own SHARED
  KEYFRAMES block where the keyframe now lives.
- **No `e2e-viewport` case covers this route.** The real-browser evidence above is a Playwright harness
  against the stylesheet and the component's markup, **not** the running app's `/p/:projectId?ticket=<id>`
  route; the viewport suite does not visit it, and this case does not claim otherwise.

## The rename ruling (2026-09-19) — cases `13.962`–`13.965`

**Minted at `13.962`, past the global high-water mark rather than inside Task 19's allocated block.**
That block's next free id is `13.390`, and this file records it as *"controller-allocated ON REQUEST
ONLY"*; this task was not given it. `13.962` is the next free number in the catalogue and cannot
collide with an allocation. Recounted before minting, id by id, not by an ordinal sweep.

**The ruling.** `workspace.renamed` has been in the vocabulary since Plan 1 and had **no client UI at
all**. Until 2026-09-19 the server asked **nobody** who may emit it: it is not in `ADMIN_ONLY_TYPES`,
it is not membership or roster management, and check 1 examines ticket entities only — so **a workspace
GUEST was admitted**, measured at Task 9, recorded as an open absence in `check-permission.ts`, and
pinned by a case in `check-visibility-permission.test.ts` that asserted the guest was let through.
**The owner ruled that a member's or a guest's rename must be refused.** The refusal NAMES THE ACT —
`WORKSPACE_RENAME_REASON`, *"Only a workspace owner or admin can rename a workspace"* — rather than
producing the generic admin-only sentence, which is the same reason `workspace.settings_set` is its own
case beside it. A consequence worth stating because it was not obvious when the absence was written:
**with this closed, no non-ticket event type is ungated any more.**

- **13.962** ✅ The rename control is offered to an **owner** and an **admin**, and to **nobody else** —
  the pairing is this file's own rule, because *"a control asserted PRESENT for an admin proves nothing
  about a member"*. Both halves run on the same fixture: the control is absent for a `member` and for a
  `guest`, **and the workspace NAME still renders for them**, so the case asserts the control's absence
  rather than the workspace being hidden. — (`apps/web/test/workspace-home.test.tsx`)
- **13.963** ✅ Saving submits **`workspace.renamed`** through the ordinary ingest door, and the case
  asserts the **event, the entity and the payload** — `{ kind: 'workspace', id }` and `{ name }` — not
  merely that something was sent. The entity matters: `workspaces/workspace-name.ts` folds
  `workspace.created`/`workspace.renamed` to decide the directory's answer, so an event filed against
  anything else renames nothing. — (`apps/web/test/workspace-home.test.tsx`)
  *Planted defect, run: removing the `onSubmit(...)` call from the handler reddens **13.963 alone** —
  1 failed / 24 passed, `expected +0 to be 1`. Not a 500: the form still rendered and the button still
  worked, so the red names the missing submission rather than a broken page.*
- **13.964** ✅ A **blank** name is never sent — and the whitespace case too, which is the one
  `displayName`'s refine names in its own words (*"a name of only spaces names nothing"*). Both halves:
  the button is disabled **and** nothing was sent, because a form that disabled the button but still
  submitted on Enter would pass the first assertion alone. — (`apps/web/test/workspace-home.test.tsx`)
- **13.965** ✅ The control's accessible name carries the **workspace** (`Rename Convenience Corner`),
  so the page is not a column of identically-named buttons — the rule the archive control already
  keeps. — (`apps/web/test/workspace-home.test.tsx`)
- **The server half is pinned in the permissions suite**, and its case was **inverted by this ruling
  rather than deleted**: it used to assert that a member was ADMITTED for `workspace.renamed`, and it
  now asserts the refusal **by constant**, alongside two new cases — a guest refused (the case the
  absence was originally measured on) and **an admin admitted, the control the two refusals need**,
  without which a gate that refused everyone would pass both. —
  (`apps/server/test/permissions/check-visibility-permission.test.ts`)

> **A note on the Round 21 header instruction, which this control sits beside.** That instruction
> removed the **Members** and **Settings** buttons from the workspace home's header, and its reason is
> recorded in the page's own comment: each destination was already reachable elsewhere on the page.
> **A rename duplicates nothing** — it had no route in the product at all — so the control does not
> re-open it. The header comment's closing sentence (*"the header is now the monogram and the titles,
> nothing else"*) is **amended rather than deleted**, and remains true of the two buttons it removed.

## The rename moves onto the NAME itself (executor 2, 2026-09-19) — case `13.969`

**The owner, verbatim:** *"have the rename be there right on the header. THE CLICK TO RENAME."* The ruling
picked this reading from a list of four, and named the trap it must not fall into in the same breath.

**Id `13.969`, minted at the tip and FLAGGED FOR THE CONTROLLER.** The allocated-block rule (the door-build
queue's addendum 1) says a block, not a tip; **this task was dispatched without one**, and `13.966`–`13.968`
were consumed by the renumber that fixed the red main, so the next free id in the remaining space was taken.
The space is nearly gone — `13.994` is the highest in use — and **this lane asks for a block before its next
task**, which is the description field.

### What changed, and what deliberately did not

- **The workspace NAME in the header is now the control.** It is a **real `<button>` inside the `<h1>`** —
  not a bare button replacing the heading, and **not an `h1` carrying an `onClick`**. Both of those are
  wrong for a stated reason: the first costs the page its only first-level heading, and the second is
  reachable by pointer only — not focusable, not in the tab order, and announced as a heading rather than as
  something that does anything. **The property being preserved is one the previous control already had**
  (it was focusable and it moved focus into the input), so this is a preservation rather than a new claim.
- **The separate `Rename` button is GONE.** The name does the job, so there is no longer a second control in
  this header — which is the strongest available form of the argument that comment was already making.
- **Escape cancels**, and **Enter commits** (a form with a submit button does that natively). The handler is
  on the `<form>` rather than the input, because focus may be on Save or Cancel by the time a reader changes
  their mind.
- **The accessible name still carries the WORKSPACE** (`Rename Convenience Corner`), unchanged, for the
  reason the removed button's own comment gave.
- **UNCHANGED, and worth saying because they are the parts that matter:** the authority (owner + admin,
  server-enforced by `WORKSPACE_RENAME_REASON`) and the door (`workspace.renamed` through the ordinary
  ingest). `mayAdminister` is still the same expression as the server's `isWorkspaceAdmin`, so the two
  cannot drift.

### The comment, re-aimed in the same change set

The header comment's operative clause read *"the `Rename` control **beside the titles**"* — which named a
separate button standing next to the name, and therefore **named a thing the page no longer had the moment
the name became the control**. It is re-aimed at the new shape and **the Round 21 argument is kept intact**:
this is still a workspace ACT and not a navigation affordance, and the reason it does not re-open that
ruling is unchanged.

### The cases, and why the four that already existed were not enough

**`13.962`–`13.965` all still hold of the new shape** — they query `button[name^="Rename "]`, which the
name-control carries — and **not one of them would notice the shape changing**, because every property they
assert is also true of a separate button labelled `Rename` standing beside the title. `13.969` is the three
arms that discriminate:

1. **the visible text IS the name** — a control labelled `Rename` passes all four and fails this;
2. **it is focusable** — `.focus()` and `document.activeElement`, which an `h1` with an `onClick` fails;
3. **exactly ONE rename control exists**, and no bare `Rename` survives — the old shape had two.

plus **Escape cancels**, which nothing above covered (13.963 covers commit, 13.964 the blank guard).

**Mutation-witnessed three times, each killing the case:** the control's visible text changed to `Rename`
(arm 1) · the `<button>` swapped for a `<span>` carrying the same `onClick` — *the trap the ruling names*
(arm 2) · the Escape handler neutered (arm 4). Each run printed the file's sha before and after.

### A REGRESSION THIS CHANGE INTRODUCED AND THE PEER'S CASES CAUGHT

The restructure that moved the form into the heading's slot **deleted the header's meta line** — the
`N active projects · you're a …` paragraph — because it sat between the two anchors the edit spanned. It was
**`13.395`** (`the header reads only served numbers`) that failed, not any rename case, and it failed with
`Unable to find an element with the text: 1 active project · you're a guest`. **A case about a neighbouring
line is what caught an edit that was about a different one**, and it is recorded because the sweep that
would have missed it is a sweep of the files the change was *about*.

### What is NOT covered

- **The browser verification is recorded in the PR body, not here.** jsdom cannot show that the name still
  READS as a control when pointed at — the hover colour and the focus ring are CSS, and the suite loads no
  stylesheet. The `:hover` affordance in particular is a judgement about how a control should look, and no
  assertion here or anywhere makes it.
- **No accessible-name baseline was re-run.** The control's accessible name is UNCHANGED in count and in
  string on this route (one `Rename <workspace>` before, one after — the second button never carried one),
  so the ratchet should not move; that is a prediction, not a measurement.

## The level-1 heading names the PAGE, not the action (exec4 E4-5, 2026-09-21) — case `13.995`

- **13.995** ✅ The workspace home's level-1 heading NAMES THE PAGE rather than the action: the `h1` takes
  its accessible name from the `<span>` holding the visible workspace name via `aria-labelledby`, so a real
  browser renders `heading "Convenience Corner" level="1"` with `button "Rename Convenience Corner"` still
  its own node — where before it rendered `heading "Rename Convenience Corner" level="1"`, the heading
  inheriting the rename button's label. The control's own `aria-label` is untouched, and the owner's
  2026-09-19 shape (ONE control, inside the `h1`, its visible text the name) is intact. Mutation-witnessed:
  removing the attribute reddens exactly this case and leaves the other thirty-two green
  (`Tests 1 failed | 32 passed (33)`). ⚠ The suite arm asserts the MECHANISM, not the outcome — jsdom's
  name computation answers `Convenience Corner` for the defective shape too, so the outcome is witnessed by
  the browser reading below. (`apps/web/test/workspace-home.test.tsx`)

**Id `13.995`**, minted above the section's previous high-water mark of `13.994` (`13.999` in this file is a
false hit from a `13.9999` in prose, not a case). The lane's request for an allocated block, recorded under
`13.969`, is still open — this task was dispatched without one too.

**E4-5's measured defect.** In a real browser, `<h1 class="gn-page-title"><button aria-label="Rename
Convenience Corner">Convenience Corner</button></h1>` renders as `heading "Rename Convenience Corner"
level="1"` — the button's label is inherited by the heading, so the page's level-1 heading names an ACTION.
Every other route's heading names its page (`/workspaces` → `Workspaces — …`, the board → `Shop
operations`). Headings are the primary navigation structure for a screen-reader user; filed IMPORTANT.

**The fix, and the remedy it does NOT take.** `13.969`'s own record says the *"accessible name still carries
the WORKSPACE (`Rename Convenience Corner`), unchanged"* — that sentence is about the CONTROL and it stands.
E4-5 is about the HEADING, which nothing ruled on. The finding's own remedy — a plain `<h1>` beside an
adjacent rename button — **would reverse the owner's 2026-09-19 shape ruling** and break `13.969` arms 1 and
3, so it was not taken. Instead the `h1` carries `aria-labelledby` pointing at the `<span>` that holds the
visible name: the heading names the page, and the button's own `aria-label` is untouched. The finding's
objection to naming the heading directly (`<h1 aria-label="…">` *"hides the button's purpose"*) does not
reach this mechanism — that is why it is the one used.

**MEASURED, both shapes, in Chrome** (`take_snapshot verbose`, real accessible-name computation):

- BEFORE — `heading "Rename Convenience Corner" level="1"`, reproducing the finding's line 40.
- AFTER — `heading "Convenience Corner" level="1"` with `button "Rename Convenience Corner"` still its own
  node. The heading names the page; the control keeps its purpose; still ONE element, so `13.969` holds.

⚠ **jsdom cannot witness this defect, and the case does not pretend it can.** `@testing-library`'s
accessible-name computation answers `Convenience Corner` for the DEFECTIVE shape too — measured against an
isolated `<h1><button aria-label="Rename X">X</button></h1>`, where it reports `Name "Convenience Corner"`
for the h1 and `Name "Rename Convenience Corner"` for the button. `dom-accessibility-api` diverges from
Chrome on a labelled descendant of a name-from-content element. So the outcome assertion in the case is
**green before and after**, and is kept only because it pins the shape the browser measurement depends on.
The witness is the `aria-labelledby`-resolves-to-the-visible-name arm, and it is **mutation-witnessed**:
removing the attribute reddens exactly this case (`Tests 1 failed | 32 passed (33)`) while the other
thirty-two stay green.

**The browser reading is taken on the SHAPES as standalone HTML, not on the app's own render** — the app
reading is the reviewer's painted measurement, which agrees with the BEFORE shape. What this case pins in
the suite is the mechanism; the outcome witness lives in that browser reading and in
`page.tsx`'s `RENAME_NAME_ID` docblock.

## The project description (door A, 2026-09-19) — cases `13.976`–`13.987`

**The door.** The workspace home's project card carries a description. The prototype has one —
`{ name: "Delivery", desc: "Sprint work for the rollout" }` (`desktop.dc.html:2160-2172`) — drawn
READ-ONLY at `:264` as a muted 15px line **inside the card's own click target**, between the name row and
the chips. **Nothing lets a person author one:** the prototype's `addProject` takes a name only and
hard-codes `desc: "No tickets yet"`.

**The owner's ruling, verbatim:** *"New-project form gains an optional description input: go with this."*
So the description rides `project.created` — no new event, no second door — and the New-project form
gains the input. `projectCreatedPayload` is `.strict()`, so the payload, the projection, the read, the
route and the render all moved in one change set.

**The column, and the decision inside it.** `proj_projects.description` is `text NULL`. NULL is the
ABSENCE of a claim — "nobody has described this project" — where `''` would be the CLAIM "this project
has no description". It is the same distinction `ProjectRef.ticketCount` draws with `null`, and the
reason the projection writes `payload.description ?? null` rather than `?? ''`. **`13.978` is the case
that holds that line**, and its mutation witness is `?? null` → `?? ''`.

**⚠ The half-witnessed contract is CLOSED, not promised.** The queue's own text warns that *"every
`ProjectRef` construction site must carry it or the field arrives `undefined` on some route"*.
Enumerated rather than spot-checked: **two production sites** — `apps/server/src/routes/workspaces.ts`
(the wire object) and `packages/app-core/src/online/mappers.ts` (the client type's one construction
site). Every other hit in the tree is a consumer, and `packages/mcp-server/src/tools/read-tools.ts`
builds its own inline `{projectId, name}[]`, which is a different type. Rather than trusting two sites to
stay in step: **the route ALWAYS sends the key** (`string | null`, never omitted) **and the mapper
REFUSES a row that omits it**, so a third site that forgot the field fails loudly at the mapper instead
of arriving `undefined` and rendering as a correct-looking card with no description. `13.981` witnesses
the route's half; `13.983` witnesses the mapper's.

- **13.976** ✅ `projectCreatedPayload` accepts an optional `description`; a payload **without** one parses unchanged (the compatibility half) and genuinely lacks the key, asserted with `in`.
- **13.977** ✅ Refuses `''`, refuses a description of only spaces, refuses over 500; accepts exactly 500; **does not trim** one that has content.
- **13.978** ✅ The projection stores a served description verbatim, and writes **NULL — not `''`** — where the event made no claim.
- **13.979** ✅ `visibleProjects` carries the description; an undescribed project reads NULL, never `''`.
- **13.980** ✅ The description is scoped **exactly as the NAME is** — a viewer outside the project is served no row, so no description; the viewer ON the project gets both.
- **13.981** ✅ Every project row on `GET /v1/me/workspaces` carries `description` as an **always-present key**, `null` for a project nobody described.
- **13.982** ✅ The mapper passes a string through and turns `null` into an **ABSENT key** — not `''`, not `null`.
- **13.983** ✅ The mapper **refuses** a project row that omits the key, naming its path *and* the guard's own sentence.
- **13.984** ✅ The project card draws the description **inside its own door**.
- **13.985** ✅ A project nobody described draws **no element at all** — not an empty one.
- **13.986** ✅ The New-project form sends the description as typed, and **omits the key** when the box is left untouched (so an optional field left alone is never refused).
- **13.987** ✅ End to end through the REAL door: a description authored over the wire reaches the exact served body — the full `project.created` → projection → read → route path in one assertion.

**Mutation witnesses, run and recorded rather than predicted.** `13.978` — changing the projection's
`?? null` to `?? ''` reddens **13.978 alone** (`expected '' to be null`), the other 7 in that file green.
`13.983` — replacing the presence guard with the `withheldOrNumber` shape (an absent key read as "not
described") reddens **13.983 alone** (`expected function to throw an error, but it didn't`), 77 green.

### What is NOT covered

- **The CSS is verified in the PR body, not here.** jsdom loads no stylesheet, so no assertion here can
  show that the description's muted 15px/20px line, its wrap, or its placement between the name and the
  chips RENDERS as the prototype draws it. The class and its containment in the door are asserted;
  the appearance is a judgement no test in this repo makes.
- **The accessible-name ratchet was not moved by this change** — the card's `aria-label` is untouched and
  the new form input is labelled by association, not by `aria-label`. That is a prediction about the
  sweep, and the sweep is its own check.
- **The 500-character bound is asserted at the schema, not at the input.** The form carries no
  `maxLength` (deliberately, matching the name field), so an over-long description is refused by the
  domain on submission rather than prevented while typing. No case drives that path from the browser.

## The inbox's single-row read and its Undo, which failed in silence — cases `13.1108`–`13.1109` (E5-10, 2026-09-21)

**The defect, in the file's own words, twice.** `markRead(id)` flipped the row optimistically and then
`void gateway.markRead(id).catch(() => loadFirstPage())` — a reload and NO sentence. `undoMarkAllRead()`
had the same. The BULK path sixty lines up classifies its failure and renders it, and its docblock
records why it does: *"The first version of this catch reloaded and said NOTHING: a reader over the bound
saw a click do nothing and the list snap back, with no sentence anywhere."* **The single-row and undo
paths were still that first version** — the defect the bulk arm's own note says it fixed, standing in the
two arms beside it.

The Undo's is the worse of the two: the reader has just been TOLD by the toast that those notifications
are unread again, and a failed undo leaves the screen contradicting a sentence the page has already
withdrawn.

- **13.1108** ✅ A refused single-row mark-read SAYS SO, and a failure that never reached a server says
  THAT instead — never a refusal. **The row splits by KIND where the bulk arm splits by STATUS**: the
  bulk route's 400 is its bound, a number only a bulk request can exceed, while the single-row route's
  only status is the 404 that both "not yours" and "does not exist" share — so an `HttpError` of any
  status is the server adjudicating and anything else never reached one. —
  (`apps/web/test/inbox-bulk.test.tsx`)
- **13.1109** ✅ A refused Undo says so, beside the toast, rather than silently leaving the rows read.
  Its own slot, not the bulk one: the two are said in different places, and this sentence has to outlive
  the toast the Undo just closed. — (`apps/web/test/inbox-bulk.test.tsx`)

**Three constants, not the bulk pair reused.** `ROW_REFUSED_COPY` / `ROW_UNREACHED_COPY` /
`UNDO_FAILED_COPY` — the bulk sentences say *"Those notifications"*, and a plural said about one row is a
second false statement laid on top of the missing one.

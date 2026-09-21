# 13. The test-citation check and the pre-launch checklist — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## The test-cases <-> test citation check (Lane F Pass 1)

Ruling P33 and the coordination doc's own record (2026-08-31, "Recorded with owners, not fixed" and
"What a catalogue entry is actually worth") name the gap this closes: no test in the repo cites a
catalogue case id, so the `✅` markers this whole series has been writing are one-directional — a test
can be deleted and its case keeps its checkmark. `scripts/check-case-citations.mjs`, its own ungated CI
job, `pnpm check:citations`.

**Measured before choosing a mode, per the owner's instruction, because the honest number decides the
shape:** 1525 checked ids repo-wide, 710 cited (the id string appears somewhere under a test/e2e
directory), 815 not (a first pass, before an opus review round, under-measured this at 1470/663/807 —
a real extraction bug silently dropped every range-form `✅` line, e.g. `- **3.89–3.94** ✅ ...`, from
the check entirely; case 13.204 below is the fixed claim). Too large to backfill in this errand, so the
check runs as a RATCHET rather than a
hard requirement: `scripts/fixtures/check-case-citations-baseline.json` commits one uncited-count ceiling
per `test-cases/NN-*.md` file, and the check requires the CURRENT real count to equal that ceiling
exactly — not merely be under it. An exact-match ratchet, not an upper bound, on purpose: a ceiling
nobody has to tighten when things improve stops meaning anything, and checking per file rather than a
repo-wide sum means a real regression on one bucket cannot hide behind unrelated improvement on another.

- 13.204 ✅ every id-line shape this repo's `test-cases/` files actually use is extracted correctly, and
  every non-checked shape is correctly left alone — a self-test fixture
  (`scripts/fixtures/check-case-citations-fixture.md`) plants one of each: bare-trailing (`- 90.1 ✅
  ...`), bold-trailing (`- **90.2** ✅ ...`), marker-first bold (`- ✅ **90.3 — ...`), marker-first bare
  (`- ✅ 90.4 ...`), and a RANGE (`- **90.6–90.8** ✅ ...`, expanding to three ids) as the seven ids that
  MUST be extracted; four lines using every other real status marker (🧪/❌/🟡/🚫), a renumbering
  ("absorbed into") line, and a mid-sentence prose citation as lines that must NOT be. **The range shape
  was NOT in the original fixture, and its absence was a real, live bug an opus review round found**:
  `- **3.89–3.94** ✅ ...` (the actual shape `03-foundation-ledger.md` uses ten times) extracted only the
  leading id and silently discarded the other five per line — not reported as malformed, just gone — so
  50 real, already-cited `✅` ids across that one file were invisible to the ratchet from the day this
  check shipped until the fix. Range extraction is now covered by this same self-test, and a
  cross-section range (`90.30–91.2`, which cannot be a real range) is asserted malformed rather than
  silently expanded or truncated. Run before this errand's own sweep, printed and asserted against these
  exact ids. `scripts/check-case-citations.mjs`
- 13.205 ✅ a malformed id is reported, never silently misfiled: `13.2.1` is not an N.M id, but the
  extraction regex's `(\d+\.\d+)` greedily matches its first two segments ("13.2") — without a guard, a
  three-part number would silently become a shorter real-looking id rather than what it actually is,
  which is a typo. The fixture plants `90.5.1` and the self-test asserts it is reported as malformed and
  contributes to neither the checked-id list nor any uncited count. `scripts/check-case-citations.mjs`
- 13.209 ✅ a citation match requires the id to be the WHOLE number, not a prefix of a longer decimal —
  **found live, by review, not planted in advance**: `isCited` originally excluded only a following
  digit, so a dependency version string like `"zod 3.25.76"` satisfied id `3.25` with no real citation
  anywhere, and `3.30`/`5.12` were satisfied the same way by `@tiptap/core@3.30.5` and `fastify 5.12.1`
  in real test files. The provable consequence: a routine dependency bump could flip a genuinely-deleted
  citation to look present, or an unrelated version-string coincidence could mask a real regression —
  either way the check's own failure message ("a citing test was likely deleted") would be actively
  wrong. Fixed by also excluding a further digit immediately after a following `.`; a genuine
  sentence-ending citation (`case 5.18.`, period then non-digit) still matches, asserted as its own
  self-test case so the fix cannot later over-correct into rejecting ordinary prose.
  `scripts/check-case-citations.mjs`
- 13.206 🧪 deleting the LAST test that cites a checked case reddens the check, naming the exact case —
  reproduced against real files, not only the self-test's synthetic fixtures. Case 11.1 is cited in
  exactly two places (`calendar-model.test.ts`'s `describe`, `claim-labels.test.ts`'s `it`); with both
  citation strings removed, `11-calendar-notifications.md`'s uncited count moved from 0 to 1 (its
  committed baseline is 0, the file being fully cited today), and the check failed naming `11.1`
  specifically and the file's baseline vs. actual numbers. Restored via `git status --short` confirming
  byte-identical content, then re-run clean. **🧪, not ✅, deliberately: this was a one-time hand mutation
  against real files, not a standing automated test this repo re-runs** — the general property (an
  increase is caught) IS automated, at 13.207 below, via the self-test's synthetic `checkRatchet` inputs;
  this case is the corroborating real-world instance, not a citable repeatable check, so it earns no
  citation and is excluded from this file's own citation ratchet by construction (only ✅ ids count).
  `packages/app-core/test/calendar/calendar-model.test.ts`, `packages/app-core/test/claims/claim-labels.test.ts`
- 13.207 ✅ the ratchet's other three shapes, proven directly against the pure `checkRatchet` function
  with synthetic inputs (the same shape `check-runbook-commands.mjs`'s own self-test uses for its
  matchers): an increase (actual 5 vs. baseline 3) is caught, reason `increased`; a STALE ceiling (actual
  2 vs. baseline 5 — the baseline is looser than reality, which this ratchet treats as equally wrong,
  not merely permissive) is caught, reason `stale`; an exact match (4 vs. 4) passes with no violation; a
  file with no committed baseline entry at all is caught, reason `missing-baseline`. `scripts/check-case-
  citations.mjs`
- 13.208 ✅ `check-citations` is its own CI job, unconditional — no `needs: scope` and no docs-only `if:`
  gate, the same shape `check-runbook` was rewritten into after review found it silently skipped on a
  runbook-only diff (`check-env`'s original bug, the exact hazard this errand exists to name one level
  up). Added to `gate`'s `needs` list. Verified with `actionlint .github/workflows/ci.yml`, exit 0.
  `.github/workflows/ci.yml`

**Backfill is real, per-file work — carried, not attempted here, owner named per file rather than one
vague "whoever":** `09-editor-attachments.md` (219 uncited, 0 cited — this lane's own attachment/backup
work is a large share of it, so first claim if this lane runs again) and `10-workflow-builder.md` (66
uncited, 0 cited) have never had a single citation attempted; `05-tickets-hierarchy.md` (68 of 73
uncited), `06-auth-visibility.md` (63 of 111), `04-workflow-engine.md` (45 of 52) and
`03-foundation-ledger.md` (45 of 154 — total corrected from an earlier 104 by the range-extraction fix
above, which recovers 50 real ids this file always had) are mostly uncited with a small existing
precedent to extend; `07-api-realtime-search.md` (78 of 229) and `12-offline-sync-apps.md` (78 of 314)
are already majority-cited and need the remaining minority closed; `13-deployment-dogfooding.md` carries
153 of 160 uncited, up from 148 by this section's own five ✅ cases (13.204, 13.205, 13.207, 13.208,
13.209) — **NOT cited,
by an honest structural gap rather than neglect**: `check-case-citations.mjs`, like its siblings
`check-case-ids.mjs` and `check-runbook-commands.mjs`, is a self-testing script with no companion
`.test.ts` file (checked: neither of those two siblings has one either, confirmed by grep), and the
citation corpus this very check scans is test/e2e directories only, by the controller's own explicit
spec — `scripts/*.mjs` is deliberately outside it. There is no test file these four cases COULD cite
without either widening that scope unilaterally or inventing an unprecedented companion test file for a
script whose entire established family never has one. Recorded here rather than silently baselined away:
the ratchet for this file is bumped to 152 to reflect it, named as its own kind of gap rather than folded
into the ordinary backfill debt above. Owner for all of the above, absent a
more specific claim: whoever next does substantial work on that bucket's tests, per the standing
same-change-set rule — cite while touching, rather than as a separate sweep. `11-calendar-notifications.md`
needs no owner: it is fully cited today (0 of 147 uncited) and stays that way structurally as long as new
cases there are cited when written.


## Pre-launch checklist — HTTPS enforcement (owner-assigned, 2026-09-07)

*Checklist item 5 asked which layer's job "force HTTPS" is. Measured against `deploy/do/app.yaml`, it
splits three ways: the HTTP→HTTPS **redirect** is App Platform's router (an in-app one would be
unreachable code), the **`Secure` cookie flag** was already correct and is pinned elsewhere by
`sign-in-flows.test.ts`, and **HSTS was genuinely missing** with no layer supplying it. These cases cover
the part that was the app's job. Both hosts are covered because HSTS is scoped per host —
`pm.artsourced.in` and `pm-api.artsourced.in` are siblings, and the API sending it says nothing about the
web app. Full findings: `docs/pre-launch-checklist.md`.*

- **13.242** ✅ `hstsHeaderFor` answers the header for `https` and nothing for http, undefined, `HTTPS` or `https:` — not a prefix match — (`apps/server/test/http/hsts.test.ts`)
- **13.243** ✅ The value is a year with `includeSubDomains`, and `preload` is asserted ABSENT so adding it must redden a test — (`apps/server/test/http/hsts.test.ts`)
- **13.244** ✅ Present on a real https request including on the 401 an unauthenticated caller gets — a first visit meets a refusal more often than a 200 — (`apps/server/test/http/hsts.test.ts`)
- **13.245** ✅ Present on an unmatched route's 404, for the same reason — (`apps/server/test/http/hsts.test.ts`)
- **13.246** ✅ Absent over plain http, AND absent when `x-forwarded-proto: https` is forged against an app with `trustProxy: false` — otherwise the control would be caller-controlled — (`apps/server/test/http/hsts.test.ts`)
- **13.247** ✅ The web shell sends it when `SERVER_ORIGIN` is https, a year long and without `preload` — (`apps/web/test/next-config.test.ts`)
- **13.248** ✅ The web shell sends nothing when `SERVER_ORIGIN` is http — RFC 6797 §7.2 forbids it and local dev is http — (`apps/web/test/next-config.test.ts`)

## Pre-launch checklist — the frontend-secrets audit (owner-assigned, 2026-09-07)

*Checklist item 4. No secret value ships in any client bundle — swept at the ARTIFACT level (50 files,
1.4 MB of built `.next/static`), not from source, with positive controls printed beside every zero. Two
`check:env` blind spots were found and closed: it scanned one of the three shipping clients, and its
detector knew only `process.env` while `apps/desktop` reads `import.meta.env`. Fixing the first revealed
the second. No new cases here — the property is enforced by `check:env` itself, which now fails on an
undocumented client-inlined variable; `docs/pre-launch-checklist.md` records the audit and the one risk
left open for the owner (`EXPO_PUBLIC_DEV_TOKEN` is a real bearer token inlined into any build made with
it set, and nothing prevents a release build from carrying it).*


## Pre-launch checklist — the 404 and the two legal pages (owner-assigned, 2026-09-07)

*Checklist items 1–3. The 404's design comes from the product's own principle: a generic "page not
found" asserts one cause for a situation with several, which is the tidier-wrong-answer this product
refuses everywhere else. One of the causes is a SECURITY property — the API answers the same 404 for
"does not exist" and "not yours", so a caller cannot probe for which records exist — so the page names
all three and says it will not guess.*

- **13.249** ✅ Names all three causes together and refuses to say which happened — asserting one would pass against the generic 404 this replaces — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.250** ✅ Offers a way out; an error without a recovery path is half a message — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.251** ✅ Both legal pages carry bracketed placeholders rather than invented party details — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.252** ✅ The "not reviewed by a lawyer" marker is in the SOURCE and absent from the RENDER — both ends asserted against both files, because asserting either alone passes against the opposite failure — **and, added by E5-38, the opposite end as well: a reader-facing DRAFT NOTICE must BE in the render.** The two halves are deliberately kept in one case because they are one boundary — what stays in the comment versus what a reader is told. E5-38's ruling is that the sign-in screen binds a person's agreement to both documents while they still print bracketed placeholders, so each page owes the reader a sentence saying it is a draft; the marker stays internal, unchanged. Falsified: replacing `Draft notice.` in one page reddens this case alone, `AssertionError: app/terms/page.tsx must tell the reader it is a draft: expected … to contain 'Draft notice.'` — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.253** ✅ The terms state the four things the product does not promise, so a later legal cleanup cannot quietly remove them — (`apps/web/test/not-found-and-legal.test.tsx`)

### Checklist items 6–7 — colour contrast and responsive (2026-09-07)

*Minted from this lane's own `13.241` block, which items 1–3 opened and used through `13.253`; `13.254`
is the next free id IN THAT BLOCK, not derived from the file's maximum.*

- **13.254** ✅ **The signed-in shell does not scroll sideways at 390px.** `apps/web/e2e-stack/viewport.spec.ts`
  — signs in through the real door, reaches a **workspace-scoped** page, and asserts both
  `scrollWidth <= clientWidth + 1` and that no element's rect crosses the right edge.
  *Why it lives in `e2e-stack` and not in the new `e2e-viewport` suite: the defect was on the
  AUTHENTICATED pages. `.gn-nav` overflowed by 10px on `/my-work`, `/members`, both settings pages and
  the board, and on none of the five signed-out routes — `AppNav` is the row that overflowed and
  signed-out pages do not render it, so the unauthed suite would have stayed green through the entire
  bug. Signing in and stopping at `/workspaces` would not have caught it either: measured, that page did
  not overflow while `/my-work` did, because `AppNav` renders a longer row once a workspace is in scope.*
  *The overflow was DATA-dependent — the row's last child is `Sign out {user.name}` — which is why the
  fix is `flex-wrap: wrap` rather than a width. Verified causally before it was written: injecting the
  rule took all five routes 10 → 0 while a negative control (an irrelevant declaration on the same
  selector) left all five at 10, and the nav was measured to WRAP (88px → 104px, every child inside)
  rather than clip.*
  *The instrument asserts itself first: `window.innerWidth` is read back inside the page, because this
  repo has a recorded failure where a resize reported success while the page stayed 1512px wide.*
- **13.255** ✅ **The signed-out surface holds its layout at 390, 768 and 1512, and the three are
  measurably DIFFERENT.** `apps/web/e2e-viewport/responsive.spec.ts` over
  `apps/web/playwright.viewport.config.ts` — five routes × three real device viewports, each asserting
  the configured viewport AND the in-page `innerWidth` before measuring anything. The cross-width case is
  the load-bearing one: a suite that passes identically at all three widths has proven nothing about
  responsiveness. *Found a real defect on first run: `p.gn-legal__meta` rendered at 15.2px on `/privacy`
  and `/terms` — the same 0.95rem body-copy floor items 1–3 had already fixed on the 404's aside, missed
  there because that pass measured one page at desktop width.*
  *Tap targets ratchet rather than assert a floor (`e2e-viewport/tap-target-baseline.json`): the reading
  is real but it does not move with the viewport, so it is a type-and-spacing decision recorded for the
  owner in the pre-launch checklist, not a responsive defect. The count may fall, never rise.*
  *A MISSING baseline entry FAILS rather than seeding itself, and that guard exists because the first
  version did seed itself — an adversarial review caught that a fresh clone or CI checkout with no
  baseline would record whatever was broken that day and report full green with zero enforcement, on
  every first run. Recording is now `UPDATE_TAP_BASELINE=1`, an explicit act. Proven by hiding the
  committed file and running: EXIT 1, one error per route naming the key and its observed count;
  restored by SHA-256 against `HEAD` and re-run green.*

## Type scale at 390px (owner-assigned, 2026-09-08)

*The other half of the ruling whose tap-target half shipped in #328. The finding was recorded in
`docs/pre-launch-checklist.md` — "small text is real but mostly legitimate labels
(`gn-board-card__provenance` at 12.5px x25, chips at 12.8px)" — and the first thing this pass
established is that **nothing could measure it.** `responsive.spec.ts` has swept body copy against a
16px floor since item 7, but its population is `p, li, dd, dt, td, figcaption, label`, and every
element that sentence names is a `span` or a `div`. The reading came from one manual measurement and
had no guard, which is the state the tap-target note was in while the code drifted under it.*

*THE FLOOR IS 12px AND IT IS NOT A WCAG NUMBER — stated because the tap-target ratchet next door cites
2.5.5 and 2.5.8 and the symmetry invites a false citation. No WCAG success criterion sets a minimum
font size: 1.4.4 is resize-to-200%, 1.4.12 is text spacing; iOS HIG's 11pt and Material's 12sp are
native-platform guidance. 12px is the bottom rung of this product's own scale — seventeen rules sit at
exactly `0.75rem` — and the checklist itself judged the 12.5px and 12.8px labels legitimate.*

- **13.264** ✅ **Label text on the signed-out surface holds the 12px floor, ratcheted per route.**
  `apps/web/e2e-viewport/responsive.spec.ts` over the shared sweep in `e2e-viewport/type-scale.ts` (a
  plain module, not a spec — importing a sweep FROM a spec makes Playwright load that spec's `test()`
  registrations into the other config, which cost a round on the tap-target pass). Measured: `/help`
  examined 317 label elements, `/privacy` 21, `/terms` 14, the 404 seven, and **every one renders at
  exactly 16px**. `/sign-in` matched 5 and examined 0 — all five carry no direct text — which is why
  the hard control is on `rawMatches` and not on `examined`. —
  (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-viewport/type-scale-baseline.json`)
  *The selector control is HARD and runs before the ratchet: the population includes `div`, so a
  rendered document cannot honestly report 0 matches. A sweep whose selector stopped matching finds
  zero offenders and reads as the best possible result.*
  *The disjointness that justifies two sweeps instead of one is MEASURED, not asserted in prose:
  anything matching both this selector and `measureBodyText`'s lands in `bodyOwned` and reddens by
  name. Two selectors in two files are free to drift into each other; a comment would not notice.*
  *Mutation: point the label selector at a tag that does not exist → `rawMatches` 0 → fails.*
  *Mutation: add `p` to the label selector → `bodyOwned` non-empty → fails naming the overlap.*
  *Mutation RUN, not reasoned: `.gn-help__toc-link` 1rem → 0.7rem. Result `smallest = 11.2px on
  a.gn-help__toc-link, under-12px=16`, the ratchet failing against baseline 0 and naming the offenders;
  restored from a copy made before the edit (never from `HEAD`) and re-run green, 6 passed.*

> ### That mutation went red through the WRONG check the first time, and that is how a hole was found
>
> Run before `a` was in the population, the same plant went **red — through the TAP-TARGET ratchet**,
> because the links also lost height, while this sweep reported `under-12px=0` on the same page in the
> same run. Written down uninspected it would have read as proof.
>
> `a` was in NEITHER population: not here, and not in `measureBodyText`'s `p, li, dd, dt, td,
> figcaption, label`. **Every link and every button in the product had no font-size floor of any
> kind**, and the mutation designed to test this check could not be seen by it — this repo's recorded
> shape of a control that does not traverse the same path as the measurement.
>
> `a`, `button`, `summary` and `th` are now in the population: `/help` goes from 317 examined to 341,
> still zero offenders. Headings stay out, matching the body sweep's stated reasoning. **The lesson is
> not "the mutation worked" — it is that a red result must be read for WHICH check produced it.**

- **13.265** ✅ **Label text on the signed-in surface holds the 12px floor, over five routes.**
  `apps/web/e2e-stack/viewport.spec.ts`, signing in through the real door and reading every id out of
  the seeded world rather than hardcoding one. **The route list is the whole case.** `/my-work` and the
  board were the obvious two — the checklist's own reading is about the board — and measured first they
  BOTH came back with zero under the floor (smallest 12.8px, the chips; board histogram
  `{12.8px: 24, 13.6px: 6, 16px: 6}`). A sweep of just those two would have ratcheted 0 and 0, reported
  green, and been blind to every rule this change fixes. Adding `/members`,
  `/settings/ticket-types` and `/settings/workflows` found the defect: **four
  `span.ticket-type-list__badge` at 11.2px**, before → after **4 → 0**. —
  (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-stack/type-scale-baseline.json`)
  *A ratchet on the pages a finding NAMED is not a ratchet on the pages the defect is ON. Zero
  offenders on two routes is evidence about two routes.*
  *WIDENING THE POPULATION FOUND THE CHECKLIST'S OWN NAMED ELEMENT.* Once `a`/`button` joined the
  sweep, the board went from 36 examined to 104 and reported
  `smallest = 12.48px on button.gn-board-card__provenance`, x26 — the very thing the checklist
  recorded as "`gn-board-card__provenance` at 12.5px x25" and which had been invisible to every sweep
  because it is a `<button>`. It sits ABOVE the 12px floor, so it is not an offender and the
  checklist's judgment stands; it is now measured on every run instead of once by hand.
  *Also newly visible: `13.3333px` on buttons such as `button.workflow-list__new` — the user-agent
  default where a control does not set `font: inherit`. Above the floor, so recorded rather than
  changed.*
  *ONE OF THE FIVE FIXED RULES IS WITNESSED, AND THE OTHER FOUR WERE CHASED UNTIL THEY WERE MEASURED
  RATHER THAN ASSUMED.* `.ticket-type-list__badge` is witnessed (4 → 0) and now also carries a
  **`MUST_EXAMINE` coverage assertion**: the route must examine an element with that class, so a 0 for
  a rule that stopped rendering reddens instead of passing. A ratchet at 0 for an absent rule looks
  exactly like a ratchet at 0 for a healthy one, and that was the gap.
  *`.gn-transition-edge__label` — TRIED AND MEASURED UNWITNESSABLE. Its route
  (`/settings/workflows/<id>`) was added, reached by clicking (the list navigates by `router.push`;
  there is no `<a href>`), and reported `{labelsInDom: 0, rulesInDom: 0, flowNodes: 0, flowEdges: 0}`
  with the page a shell of five nav elements. The canvas renders nothing at all at 390px in the seeded
  world. The route was REMOVED rather than kept as a green row meaning nothing — and it was the
  `MUST_EXAMINE` assertion that said so, in one line naming the selector.*
  *`.gn-avatar--small` — UNWITNESSABLE, for a reason read out of the seed rather than guessed: it
  renders only when a card has an assignee, and the Convenience Corner seed **assigns nothing** (zero
  `assign` mentions across `apps/server/src/seed`). It is a `<span>` with direct text, so this sweep
  would report it at 10.4px the moment one exists.*
  *`.escape-chip__hint` and `.upload-chips__chip` are editor chrome inside a ticket's description
  editor; no route here reaches them. All four are fixed and unproven, owner recorded.*
  *`/members` examines ZERO elements today — its roster rows are `li`/`p`, which belong to the body
  sweep's population rather than this one. Its 0 baseline is still a live guard (new label text there
  would be examined and would redden) but it proves nothing now, and it does NOT cover
  `.gn-avatar--small`, which is why it was added. Recorded rather than quietly dropped.*
  *Two route guesses cost a run each and are recorded in the spec so the third person does not pay
  again: `/my-work` carries no project link (it links to ticket surfaces), and `/w/<id>` is not a page
  at all — there is no `app/w/[workspaceId]/page.tsx`, so it renders the 404, a document with a nav and
  prose that would have swept cleanly while measuring nothing. The project links are on `/workspaces`,
  the same page the workspace id came from.*
  *Mutation: revert `.ticket-type-list__badge` to `0.7rem` → 13.265 fails naming four offenders.*
  *Mutation RUN on the coverage assertion itself: point `MUST_EXAMINE` at a class nothing renders →
  `EXIT 1`, "examined no element matching `.ticket-type-list__badge-THAT-DOES-NOT-RENDER`". Restored
  from a copy taken before the edit and re-run green. The assertion had already fired once for real,
  on the workflow-editor route, which is how that route was found to be an empty shell.*

> ### The enumeration that found the offenders was wrong the first time, in the shape this repo collects
>
> The first sweep for sub-floor declarations used a digit pattern — `0\.(6[0-9]|7[0-4])[0-9]*rem` —
> whose alternation requires TWO digits after the point, so it **cannot match `0.7rem`**. It reported
> three offenders, missed two, and reported them in the confident shape of a complete answer. It was
> caught only because an earlier value histogram over the same file, taken a different way, had already
> counted `0.7rem` twice.
>
> Redone by parsing each value and converting to px, the set across all three shipped stylesheets is
> exactly five: `.escape-chip__hint` 10.00px (with `opacity: 0.7` on top of it), `.gn-avatar--small`
> 10.40px, `.upload-chips__chip` 11.00px, `.gn-transition-edge__label` and `.ticket-type-list__badge`
> 11.20px. All five now at `0.75rem`.
>
> The re-scan reports nothing under 12px, and prints a POSITIVE CONTROL from the same run so the
> emptiness is a reading rather than a broken scan: at a 12.5px threshold the same scan reports 22
> declarations in `ui.css`, which reconciles exactly — 20 at 12px plus the two `0.78rem` (12.48px)
> rules.
>
> The after-reading reconciles the same way rather than just reporting a smaller number:
> `/settings/ticket-types` went from `{11.2px: 4, 12px: 10, 14.4px: 5}` to `{12px: 14, 14.4px: 5}` —
> the four badges moved onto the 12px rung, 10 + 4 = 14, and nothing else changed.
>
> The image was confirmed to CARRY the fix before the 0 was believed: `docker exec` grep of the built
> stylesheet reports `font-size:.75rem` on all three `ui.css` rules. A 0 from an unchanged image and a
> 0 from a fixed one print identically, and the recorded trap on the previous pass was a measurement
> taken against an image that predated the change.

## Controls render in the product's font, not the browser's (owner-assigned, 2026-09-08)

*The owner ruled on 2026-09-08 to apply `font: inherit` against `docs/pre-launch-checklist.md`'s
`NEW, 2026-09-08` bullet: 22 unclassed `button` + 2 `.ticket-type-list__new` + 2 `.workflow-list__new`,
all at exactly 13.3333px on the signed-in surface at 390px. The ruling was widened to the signed-out
surface on a measurement taken before the rule was written (see 13.266).*

*IDS ARE PROVISIONAL. §13's header requires block allocation by the controller ON REQUEST and says
never to mint from the maximum. The controller was asked and was mid-incident on a production
sign-in-redirect bug; 13.266–13.267 are the recounted next-free (maximum in use against `origin/main`
is 13.265, and both are free repo-wide) and are to be renumbered if the controller assigns otherwise.
**Recount trap for whoever does this next: `grep -oE '13\.[0-9]+'` matches `13.3333px` and reports a
maximum of `13.3333` — the id pattern collides with the pixel value this very section is about.***

- **13.266** ✅ **No control on the signed-out surface is painted in the browser's font.**
  `apps/web/e2e-viewport/responsive.spec.ts` asserts `measureTypeScale`'s `uaFont` is empty on all five
  routes at all three widths — every examined element's computed `font-family` equals the one `body`
  resolves to. Before → after on `/sign-in`: `{13.3333px: 2, 16px: 3}` → `{16px: 5}`, the two
  `<button role="tab">` in `.gn-view-tabs` (which sets `min-height` and `padding-inline` and no font). —
  (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-viewport/type-scale.ts`,
  `apps/web/app/globals.css`)
  *Mutation RUN, not reasoned: delete `button { font: inherit }` from `globals.css` → **EXIT 1, 6
  failed** — `/sign-in` AND `/help` at all three widths, each naming its own selectors. Restored with
  `git checkout --` from a commit made BEFORE the mutation (never from an uncommitted tree) and re-run
  green: 19 passed, EXIT 0.*
  *SELECTOR RENAMED 2026-09-15, finding unchanged: `.gn-help__tab` no longer exists — `/help`'s
  document switch became the shared `SegmentedControl`, and the class's one remaining user,
  `apps/desktop`'s help toggle, is now `.gn-help__toggle`. The record below is kept verbatim because it
  documents how the defect was FOUND; only the name it was found under has moved. See 15.22.*
  *THE MUTATION FOUND A SITE NO SIZE INSTRUMENT COULD HAVE: `button.gn-help__tab` was rendering at
  **16px in Arial**. `ui.css:1321` sets `font-size: 1rem` and no `font-family`, so its SIZE was already
  correct and the defect was invisible to the 12px floor, to the size histogram, and to the raised-floor
  enumeration that found the original 26. **This is the case for reading font-FAMILY rather than
  asserting the `13.3333px` bucket is absent** — the bucket form would have passed here, and would pass
  again the day a UA constant changes.*
  *`font: inherit` is the SHORTHAND and carries `font-weight` and `line-height` too, so the row was
  read for those and not just for size: `.gn-help__tab[aria-pressed='true']`'s deliberate
  `font-weight: 600` SURVIVES (0,2,0 beats 0,0,1), measured 600/400 before and after. Boxes: help tabs
  unchanged at 366x44; sign-in tabs 67x44 → 74x44 and 85x44 → 96x44 — wider, never shorter, because
  `min-height: 2.75rem` holds the height. Tap-target offender counts are byte-identical before and
  after on every signed-out route (10/16/16 on `/help`, 0 elsewhere), so no ratchet moved.*
- **13.267** ✅ **The same guard on the signed-in surface, over the five stack routes.**
  `apps/web/e2e-stack/viewport.spec.ts` asserts `uaFont` is empty on all five. **RUN after the rebuild
  window opened: 1 passed, EXIT 0, zero font-family offenders and ZERO `13.3333px` readings anywhere on
  the signed-in surface** — the 26 controls this ruling is about. —
  (`apps/web/e2e-stack/viewport.spec.ts`)
  *The container was confirmed to CARRY the fix before the zero was believed, because a 0 from an
  unchanged image and a 0 from a fixed one print identically: the served stylesheet contains
  `button{font:inherit}`, fetched over HTTP from the running container.*
  *POSITIVE CONTROL ON THE NULL: all five routes printed a histogram, so the zero is a reading rather
  than a sweep that never ran. That control earned itself twice in this task — an earlier attempt
  addressed the test by LINE NUMBER (`viewport.spec.ts:220`), the line had moved, and playwright ran
  **nothing** in 20ms while the greps for `13.3333` and for offenders both returned a clean-looking 0.
  A second attempt died in `globalSetup` and printed the same reassuring zeros. **Neither zero meant
  anything, and neither was distinguishable from success without the control.** Address a test by
  TITLE, not by a line number that any edit above it invalidates.*
  *SCOPE, MEASURED ON THIS SURFACE TOO: the board still reads `{12.48px: 26, 12.8px: 24, 13.6px: 6,
  16px: 48}` — `.gn-board-card__provenance` unmoved at 12.48px x26. The element selector loses to every
  class rule, which is the ruling's "and no further" as a measurement rather than a promise.*


## One limiter on `/api/auth/*`, and it is ours (controller ruling, 2026-09-08)

*better-auth's own limiter could not tell clients apart — `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`
(`dist/api/rate-limiter/index.mjs:245`) with `getIP()` falsy is **one shared bucket per path, for
everybody**. `auth.ts` now sets `rateLimit: { enabled: false }`; our limiter, which keys per client
address under `TRUST_PROXY`, becomes the single authority. `RATE_LIMIT_AUTH_MAX` is untouched — it was
never the binding constraint, and now it is the control everyone already believed it was.*

- **13.273** ✅ **better-auth's limiter does not answer on `/api/auth/*`, and the refusal that does
  arrive is OURS — identified by BODY, not by status.** Seven requests at `authMax: 6`: the **sixth**,
  which is past better-auth's own `max: 5` for the magic-link path, must not carry
  `Too many requests. Please try again later.`; the **seventh** must be `429` with
  `{"error":"rate_limited","retryAfterSeconds":60}`; and a second address must not be refused at all. —
  (`apps/server/test/http/security-middleware.test.ts`, `apps/server/src/auth/auth.ts`)
  *A bare 429 cannot tell the two limiters apart, which is exactly what kept this invisible. The body is
  the discriminator that found the bug, inverted into the guard.*
  *Mutation RUN: `rateLimit: { enabled: true }` → **EXIT 1**, the sixth request refused with
  better-auth's own body quoted back in the failure message. Restored, re-run green, 58 passed.*
  *⚠ **THE MUTATION IS `enabled: true`, NOT DELETING THE LINE**, and the first version of this case got
  that wrong and passed 59/59 against its own defect. better-auth's default is
  `enabled: options.rateLimit?.enabled ?? isProduction` (`dist/context/create-context.mjs:171`) and
  vitest sets `NODE_ENV=test`, so deleting the line leaves the limiter OFF and the mutation mutates
  nothing. **That NODE_ENV-dependent default is also why no server test ever exercised this, and why it
  shipped unseen** — the same objection `auth.ts` already records against `skipOriginCheck`.*
  *⚠ **WHAT THIS CASE CANNOT PROVE, and the reason is worth more than the case.** It does NOT reproduce
  the shared bucket. `app.inject` clients are only distinguishable by `X-Forwarded-For`, and an
  `X-Forwarded-For` is also enough for better-auth's `getIP()` to RESOLVE — at which point better-auth
  separates clients too and the defect vanishes from the harness. **The property that makes two clients
  distinguishable here is the same property whose absence causes the bug.** Measured, not assumed: with
  the limiter re-enabled, a second client's first request came back `500`, its own budget, not `429`.
  The shared-bucket claim rests on the dev-stack measurement in `docs/pre-launch-checklist.md`.*
- **13.274** 🧪 **The "could not determine a client IP" warning is GONE from the running server, and the
  fix is witnessed by BEHAVIOUR as well as by absence.** Rebuild the server container, then send eight
  magic-link requests. — (`apps/server/src/auth/auth.ts`, manual against the dev stack)
  *Measured 2026-09-08. **Before:** the warning appeared **2 times** in the running server's log (once
  per process start — it is gated by `ipWarningLogged`), and the sixth send was better-auth's `429`.
  **After:** **8/8 sends returned `200`** and the warning appears **0** times.*
  *POSITIVE CONTROLS on the null, because an absence proves nothing on its own: the same run reports 39
  log lines, 16 `incoming request` lines and 8 `sign-in/magic-link` lines. **A first attempt at this
  check reported 0 warning hits AND 0 for a line known to be present** — the proxied-pipe silent-empty
  mode — and without the control it would have been filed as "already gone".*
  *🧪 rather than ✅ because it needs a container rebuild and a real process start; `onRequestRateLimit`
  returns at its first line under `enabled: false`, so the warning cannot fire, and 13.273 is the
  automated half of the same claim.*

## The magic link lands on the app, not the API (owner-dispatched P1, 2026-09-08)

*The owner signed in by hand on 2026-09-08 and the link dead-ended on a JSON 404.
`apps/web/app/sign-in/page.tsx` handed better-auth a RELATIVE `callbackURL`, which the browser resolves
at the moment the token is verified — and at that moment it is on the API origin, because that is where
the emailed link points. Measured on the dev stack: `:3001/workspaces` → **200**, `:3000/workspaces` →
**404**. Not a dev-stack artefact: `deploy/do/app.yaml` puts production on two sibling subdomains
(`pm.artsourced.in`, `pm-api.artsourced.in`), the same split, so every magic-link sign-in in production
ended on raw JSON at the API host — the first thing a new user would ever have seen.*

*The dispatch named the magic link. **`signIn.social` had the identical shape** and is fixed in the same
change; two call sites, one bug.*

- **13.268** ✅ **An ABSOLUTE `callbackURL` on `WEB_ORIGIN` is accepted (200).** The value the shipped
  page now sends. Requirement 1 said verify rather than assume: the behaviour was first read out of
  better-auth's `origin-check.mjs` (`isTrustedOrigin(url, { allowRelativePaths: true })`) and then
  measured, because reading is not measuring. — (`apps/server/test/auth/trusted-origins.test.ts`)
  *Mutation: drop `trustedOrigins` from `createAuth` → the absolute callback is refused and the
  client-side fix would trade a 404 for a 403 rather than working.*
- **13.269** ✅ **An absolute `callbackURL` on an UNTRUSTED origin is refused `403
  INVALID_CALLBACK_URL`.** — (`apps/server/test/auth/trusted-origins.test.ts`)
  *The refusal side of 13.268, and not optional: **"the absolute URL is accepted" is equally true of a
  server that validates nothing at all.** A bound asserted on one side of its line is the failure this
  very file already records for `sign-in-flows.test.ts`.*
- **13.270** ✅ **Following the magic link LANDS THE BROWSER ON THE WEB APP** — origin asserted, not
  merely "the path no longer says /sign-in". — (`apps/web/e2e-stack/helpers/sign-in.ts`)
  *RUN after the rebuild: every stack test that signs in goes through this assertion, and the three
  that reached it passed (`smoke.spec.ts` x2, `viewport.spec.ts:66`). The container was confirmed to
  carry the fix first — the served sign-in chunk contains `location.origin`, fetched over HTTP.*
  *MUTATION RUN, and it needed no rebuild, which is the trick worth keeping: **the emitted link carries
  `callbackURL` in its own query**, so rewriting it to the pre-fix relative value in the helper puts the
  server in exactly the state it was in before the fix, from the test process. Result: **EXIT 1**, and
  the assertion named the site — `after following the magic link the browser is on
  http://localhost:3000/workspaces, not the web app at http://localhost:3001`, `Received:
  "http://localhost:3000"`. Restored and re-run green.*
  ***THE OLD ASSERTION WOULD HAVE PASSED THAT EXACT RUN.*** The mutated landing path is `/workspaces`,
  which contains no `/sign-in`. So this is not merely "the new check fails when the code is broken" —
  it is the direct demonstration that the check it replaced could not distinguish the defect from
  success. Requirement 4 of the dispatch, satisfied against the property that mattered.*
  *THE ASSERTION IT REPLACES IS A CHECK THAT COULD NOT FAIL, and it is why this defect reached the
  owner's hands: `waitForURL((url) => !url.pathname.includes('/sign-in'))` **is satisfied by a JSON
  404.** It asserted the user LEFT the sign-in page and never that they ARRIVED anywhere.*
  *WHY NOTHING DOWNSTREAM NOTICED, which is the part worth carrying: on localhost the web and API
  ports **share cookies**, so the session was genuinely set and every later test navigated explicitly
  and passed. **The property that made the suite green is the same property that concealed the
  defect** — which is exactly why the new assertion is on ORIGIN and not on "some page loaded".*
  *⚠ A LOCALHOST GREEN DOES NOT PROVE THIS, stated in those words per the dispatch's requirement 3.
  The dev stack is two PORTS on one host; production is two SUBDOMAINS. The test proves the browser
  ends on `WEB` rather than `SERVER`, which is the defect's actual signature and does discriminate.
  It does NOT exercise cross-subdomain cookie behaviour, and nothing in this repo can today.*
- **13.271** ✅ **The page sends an ABSOLUTE `callbackURL`, for BOTH the magic link and Google.**
  Pinned as the literal resolved URL rather than rebuilt from `window.location.origin`, which would
  restate the implementation and pass for a relative value too. — (`apps/web/test/sign-in.test.tsx`)
  *Mutation RUN: revert both call sites to `callbackURL: next` → **EXIT 1, 6 failed**, the magic-link
  and Google cases naming the relative value. Restored from a commit made before the mutation.*
- **13.272** ✅ **`?next=` is constrained to a same-site PATH, so it cannot steer the authenticated
  callback off-site.** Four hostile shapes: protocol-relative `//evil.example`, absolute
  `https://evil.example`, backslash-authority `/\evil.example`, and schemeless junk. —
  (`apps/web/test/sign-in.test.tsx`)
  *This guard is load-bearing BECAUSE of 13.271. A bare `next` was already reaching `router.push`,
  where `//evil.example` navigates off-site; making the callback absolute would additionally have fed
  `new URL()` an attacker's absolute URL, turning a client-side redirect into an authenticated one.
  better-auth refuses to send a token there (13.269 proves it) — but a hole this file opens should not
  be closed by a library's check.*
  *⚠ AN ASSERTION THAT COULD NOT FAIL WAS FOUND INSIDE THIS CASE BY MUTATION, AND FIXED. The first
  version asserted only the callback's ORIGIN. Removing the guard killed three of the four rows —
  `not-a-path` stayed green, because `new URL('not-a-path', origin)` resolves SAME-ORIGIN. One row that
  could not fail, hiding inside a set that could, and invisible while the suite was green. The
  assertion now pins the whole resolved URL, and the re-run of the same mutation kills **4 of 4**.*

## Security headers beyond HSTS (owner-assigned, 2026-09-08)

*Before this the whole product sent exactly ONE security header — `hsts.ts`'s `Strict-Transport-Security`.
A sweep of `apps/server/src` and `apps/web/next.config.ts` for `helmet`, `Content-Security-Policy`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` returned nothing
else. The gap had been carried as open in the executor handoff for days. The owner ruled on 2026-09-08:
close the unambiguous part, defer CSP.*

- **13.256** ✅ The three ride on an ordinary answered request. — (`apps/server/test/http/security-headers.test.ts`)
- **13.257** ✅ …and on a **404 and an unauthenticated 401** too. That is why the hook is a root
  `onRequest` and not an `onSend`: a browser's first meeting with an unfamiliar host is often an error
  reply, and a header that appeared only on 2xx would be absent exactly then. —
  (`apps/server/test/http/security-headers.test.ts`)
- **13.258** ✅ They do **not depend on the `options.security` block being configured** — the same three,
  byte for byte, from an app built with it and one built without. `buildTestApp` passes no security
  options and roughly sixty other call sites do the same, so a header registered inside that block is a
  control that exists only in the configuration nobody exercises. —
  (`apps/server/test/http/security-headers.test.ts`)
  *Mutation: move the hook inside the block → 13.258 fails.*
- **13.259** ✅ Each VALUE is pinned, not merely "three headers are present": `nosniff`, `DENY` (not
  `SAMEORIGIN` — nothing this server returns is a document meant to be framed by anything, itself
  included), `no-referrer`. And **CSP and Permissions-Policy are asserted ABSENT**, so adding either is a
  deliberate act that reddens a test rather than a quiet drift. —
  (`apps/server/test/http/security-headers.test.ts`)
  *Mutations: weaken `DENY` to `SAMEORIGIN` → fails. Add a CSP to the set → fails.*
- **13.260** ✅ The web app sends all three over **http AND https**, both inputs in one case — either
  alone passes for a function that gates everything on the protocol, which is exactly the shape this
  replaced. `referrer-policy` is `strict-origin-when-cross-origin` here and `no-referrer` on the API,
  deliberately: this is a document origin and that one is never a page a browser navigates FROM. —
  (`apps/web/test/next-config.test.ts`)
  *Mutation: restore the `if (!https) return []` gate → 13.260 fails.*
- **13.261** ✅ The web app sends **no `Content-Security-Policy` and no `Permissions-Policy`** — deferred
  by the owner, and pinned so adding one is deliberate. A CSP for this app is a real design problem
  (webpack rather than Turbopack, `output: 'standalone'`, a rewrite-based same-origin proxy) whose
  failure mode is breaking in production only. — (`apps/web/test/next-config.test.ts`)
  *Mutation: add a CSP to `headers()` → fails.*

- **13.263** ✅ The web app does **not advertise its framework** — `poweredByHeader: false`. Found by
  CURLING THE RUNNING CONTAINER, not by reading the source: the sweep that produced the rest of this
  section looked for headers that were MISSING and had no way to notice one that was present and
  unwanted. `/sign-in` answered with `X-Powered-By: Next.js` and nothing in this repo had recorded it.
  Not a vulnerability and removing it is not a defence — anyone can fingerprint Next.js from `/_next/`
  asset paths in the HTML — but it is a header the product never chose to send, naming its framework to
  every client for no benefit to any of them, and the cost of not sending it is one line. —
  (`apps/web/test/next-config.test.ts`)
  *Mutation: set it back to `true` → 13.263 fails.*

> ### 13.248 was a weaker claim wearing a stronger sentence
>
> It read *"sends NOTHING for an http `SERVER_ORIGIN`"* and asserted `toEqual([])`. That passes just as
> happily if `headers()` is deleted outright, so what it actually measured was "the function returns an
> empty array", not "HSTS is withheld over http". Landing three headers that legitimately ship over http
> forced the distinction. It now names the header that must be absent and asserts the others are there,
> which fails if the protocol gate is removed AND if the function stops being wired.


## Tap targets, measured and moved (owner-assigned, 2026-09-08)

*Pre-launch item 6/7 recorded tap targets as "reported, not fixed — an owner call about the design".
Assigned 2026-09-08. No new case ids: the viewport suite's ratchet (13.254–13.255) already IS the test,
and minting cases that restate a committed baseline would be numbering the same evidence twice. What
changed is the baseline, and this is the reading behind it.*

| route × viewport | before | after |
|---|---|---|
| `/sign-in` × phone-390 · tablet-768 · desktop-1512 | 6 each | **0 each** |
| `/help` × phone-390 | 10 | 10 |
| `/help` × tablet-768 · desktop-1512 | 16 each | 16 each |
| **total** | **60** | **42** — 18 removed |

**Three fixes, each traced to a measurement rather than a guess:**

- `.gn-button` was **`340x38`** — six pixels short of 44, *everywhere it is used*, which made the shared
  button the single largest source of offenders in the product. `display: inline-flex` is the
  load-bearing half: a button whose height was padding plus one line of text ignores `min-height`
  otherwise.
- `.gn-view-tabs button` was **`55x21`**. The same class carries the board's view tabs, which the
  pre-launch review measured at `52x21` — one rule, both surfaces.
- `.gn-sign-in__method label input` was **`340x21`**. Unclassed `<input>`s inside their labels, so the
  label is the only handle. `font-size: 1rem` went with the height: under 16px iOS Safari zooms the
  viewport on focus.

**`/help` does not move, and that is a decision rather than a leftover.** Its offenders are
`a.gn-help__toc-link`, raised from **23px to 24px** — WCAG **2.5.8**'s floor, which they now meet. The
suite enforces **2.5.5**'s enhanced 44px, and a nineteen-entry table of contents at 44px each is 836px
tall on a 390px phone. Dense in-list links stay at 24; standalone controls use 44. The ratchet holds the
count so it can fall again but never rise.

### The signed-in shell had no tap-target guard at all

The pre-launch review measured 48 interactive elements under 24×24 on the board and recorded them as
"reported, not fixed". **Nothing pinned them.** `e2e-stack/viewport.spec.ts` measured OVERFLOW only, and
the unauthed suite cannot see these pages — so the one place those counts existed was a prose note in a
checklist, which no run can contradict. It now carries the same sweep, the same 44px threshold and the
same ratchet, against `e2e-stack/tap-target-baseline.json`.

| signed-in `/my-work` at 390px | offenders | smallest examined |
|---|---|---|
| with `.gn-button` fixed (first reading) | 9 | `89x23` — the nav's links |
| after `.gn-nav a, .gn-nav button` → 44px | 7 | `249x23` — `button.gn-attention__title` |
| after the nav MIN-WIDTH and the title buttons → 24px | **6** | `249x24` |

**Forcing the ratchet to 0 to print all seven, instead of re-reading the smallest, is what finished
this.** The list was not what the previous fix assumed:

```
 39x44  a.gn-nav__inbox "Inbox"          <- tall enough, six pixels too NARROW
249x23  button.gn-attention__title  (x4)
249x23  button.gn-my-work__title    (x2)
```

`.gn-nav a, .gn-nav button` had only `min-height`. **A tap target is a box**, a short word is a narrow
target, and re-reading the COUNT would never have shown it — the count was 7 either way. Same shape as
the `340x38` miss earlier in this section, one axis over.

The six title buttons went to 24px, WCAG 2.5.8's floor, and deliberately not 2.5.5's 44: they are bare
text buttons sharing a baseline with a chip and a reason on the same row (`.gn-attention__item` is
`align-items: baseline`), and 44px would break that alignment and turn a compact strip into a list of
slabs. `inline-flex` is the load-bearing half — `padding: 0` means the button's height IS its line box,
so `min-height` alone does nothing to it.

The sweep is IMPORTED from `e2e-viewport/tap-targets.ts`, a plain module. The first attempt imported it
from `responsive.spec.ts` and **Playwright loaded that spec's `test()` registrations into the stack
config** — six `project "" has no entry in VIEWPORTS` failures from an import that typechecked and read
as harmless. A spec is not a library. The move was verified not to shift any number: the unauthed suite
re-ran 19 passed with byte-identical readings.

**The remaining 7 are dense in-list controls** — attention-row titles at `249x23`, the same shape as
`/help`'s TOC links. By the rule this change follows they should go to 24px (2.5.8) rather than 44px.
**Not shipped, deliberately:** the compose `web` container serves a pre-built image, so verifying one
more CSS rule costs a full rebuild — and this session has already had one of those die on `ENOSPC`
mid-run. An unverified CSS change is exactly what the two process notes below are about. The number is
recorded so the next person starts from a reading rather than a guess.

> ### Two process notes from this run
>
> **A `python3` `.replace()` with no assertion is a silent no-op.** The first attempt at the
> `.gn-button` fix matched against whitespace-collapsed text that only existed in my own earlier
> `print`, so nothing was edited — and the re-measurement, unchanged at `340x38`, is what said so before
> the assertion did. Every edit in this change asserts its anchor is present first.
>
> **`UPDATE_TAP_BASELINE=1` does not lower a number.** `recordTapBaseline` writes only ABSENT keys, on
> purpose, so a branch that made things worse cannot re-baseline itself upward — the file's own docblock
> says falling numbers are re-recorded by deleting it. Two runs reported "0 removed" before that was
> read rather than assumed.

### Two floors, not one — the checker catches up to the rule (owner ruling, 2026-09-20)

*Owner, verbatim: **"let the checker accept 24 for in-list controls, keep 44 for standalone buttons."**
The rule was not new. `packages/ui/src/ui.css` argues the 24px floor in its own words at four separate
sites, and the sweep was counting all four as violations of a threshold the product had deliberately
declined — `.gn-attention__title` ("Dense in-list controls get 24, standalone controls get 44"),
`.gn-help__nav-link` ("WCAG 2.5.8's 24px floor for an in-list control still clears"), `.gn-help__group-toggle`
("above WCAG 2.5.8's 24px floor for an in-list control, below the 44px this file gives STANDALONE
controls") and `.gn-help__pager-link` ("sits in running text rather than on its own, so the 24px in-list
floor is the applicable one"). This change makes the CHECKER agree with a decision the product had
already taken; it invents no threshold.*

- **13.990** ✅ **A control the table classifies in-list is judged against 24px; EVERY other control is still judged against 44px.** `DENSE_FLOOR_PX` = 24 and `STANDALONE_FLOOR_PX` = 44 in `apps/web/e2e-viewport/tap-targets.ts`, with the classification in the declared `DENSE_IN_LIST` table, and the two constants plus the table's integrity pinned on the GATE by the same file's test — (`apps/web/test/tap-target-density.test.ts`)
  *Why DECLARED and not derived from the DOM, which is the load-bearing half. Three structural predicates were tried against this product's real markup and each is wrong in the dangerous direction: "inside a `<ul>`/`<ol>`" would have re-judged `.gn-board-card__move` (44px, living inside `ul.gn-board__cards`) at 24, i.e. a blanket 24 wearing a structural costume; "a direct child of an `<li>`" misses two of the four (`.gn-help__group-toggle` is in a `<div>`, `.gn-help__pager-link` is an inline link in a `<p>`); and "one of ≥2 sibling controls of the same class" would have caught a board card's own arrow pair, which must stay 44. No structural predicate separates those four from the controls that must keep 44, because the distinction is a product decision and not a shape — so the class is declared and the SIZE stays measured.*
  *Mutation, RUN not reasoned: `STANDALONE_FLOOR_PX` 44 → 24 — the blanket-24 this change exists to prevent — reddens 13.990 by name. The complementary mutation, a standalone control forced to a 24px height, reddens the viewport suite itself; both are recorded in the PR body.*
- **13.991** ✅ **A `DENSE_IN_LIST` entry whose container RENDERS while its control selector matches nothing is reported, not silently ignored.** The stale-entry guard, asserted in BOTH viewport suites and checked for presence by the unit test — (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-stack/viewport.spec.ts`, `apps/web/test/tap-target-density.test.ts`) **⚠ ITS POPULATION IS THE ROUTE LIST — E4-12, 2026-09-21.** The signed-in half of this guard was in place while the suite measured ONE route: `measureTapTargets` was called once, inside the `/my-work` case, and `e2e-stack/tap-target-baseline.json` held a single key, so its `offenders=6` read as a number about the product when it was a number about a page. The call now sits inside the route loop and keys its baseline on `route.key`, and a source-structure case in `apps/web/test/tap-target-density.test.ts` fails if it leaves the loop or the route list is gutted — which is the half a `vitest` run can hold with no browser. **The six new per-route baselines are deliberately NOT recorded:** this file's own 13.992 paragraph records why (a stack count taken from a lane worktree is not a measurement of this tree — `:3001` belongs to another lane), so a first stack run stops on the first new key and prints the `UPDATE_TAP_BASELINE=1` instruction. **A run required, not a number invented.** **⚠ AND THE POPULATION'S MEMBERSHIP GAINED THE LISTBOX PATTERN — P11, 2026-09-21.** `Select` portals its panel to `document.body` and its rows are `<li role="option">` inside a `<ul role="listbox">`; **neither role was an arm of the selector**, in any of the four sweep modules, so the product's most-migrated shared control contributed nothing to any sweep's denominator while `ui.css` fully styles `.gn-select__panel` and `.gn-select__option`. The arms are now an EXPORTED list, `TAP_TARGET_ARMS`, and `apps/web/test/tap-target-density.test.ts` builds the elements the component builds and asserts in jsdom that an option row and a listbox match the arms, with a plain `<li>` as the negative control — the half a `vitest` run can hold, mutated by deleting the two arms. **⚠ ONE ROW WAS ALREADY REACHED, AND THIS CASE SAYS SO RATHER THAN CLAIMING MORE**: React Aria's `useOption` gives the FOCUSED option a roving `tabindex="0"`, so it matched through the `[tabindex]:not([tabindex="-1"])` arm already, and a panel that HAD opened would have judged exactly one option per listbox, at the standalone floor and out of context. The finding's other half — a spec that opens a panel BEFORE sweeping, because the panel renders only while open — is not in this change: the only route in the signed-in sweep carrying a `Select` on the page is the project page in its **List view**, and reaching a view is a tab click, which is what P34's `reach` hooks are for. **Stated as an open half, not implied by a green gate.**
  *A declared table is only safe while a dead entry is visible. A renamed control goes on being judged at 44, which reddens LOUDLY and is the safe direction — but its ENTRY dies silently, the table still reads as though it were doing work, and the next person to add a dense control copies a selector that matches nothing. `measureTapTargets` is the only thing that knows which containers actually rendered, so this is the only place the two can be told apart. Both halves of the trigger are load-bearing and both were a false red first: a container that did not render (the attention strip returns `null` on an empty list) is not evidence, and neither is a container that rendered EMPTY (`.gn-help__group-items` is an unconditional `<ul>`).*
  *Mutation, RUN: `.gn-help__pager-link` deleted from `ui.css` reddens 13.991 naming that selector as no longer a rule head. The extractor strips CSS comments first, because `ui.css` is mostly prose that quotes its own selectors — without the strip, a deleted rule still discussed in a docblock would pass.*
- **13.992** ✅ **The `/help` tap-target ratchet was re-baselined DOWN, and the sweep that had been red on `main` is green.** Measured at `99f2a780`, before this change, on an unmodified tree and reproduced on two independent runs: **25 / 23 / 25** offenders at 390 / 768 / 1512 against recorded baselines of **10 / 16 / 16** — every offender an in-list control the CSS had already given the 24px floor (5 × `button.gn-help__group-toggle` at 36px, 10 × `a.gn-help__nav-link` at 33px, 10 × `a.gn-help__pager-link` at 24px at 390px). After the split those three routes read **0** and the baselines were re-recorded to it — (`apps/web/e2e-viewport/tap-target-baseline.json`)
  *⚠ **The finding this case exists to record: NEITHER viewport suite WAS on any gate.** `pnpm turbo run build test typecheck` defines no task that reaches them, and `.github/workflows/ci.yml` ran `test:e2e:stack` only — the string `viewport` did not occur in that file, measured with a positive control in the same invocation. So the ratchet rose 10 → 25 and sat red on `main`, seen by nobody, for as long as the topic sidebar has existed. **A ratchet with no runner is a note, not a check.***
  *✅ **TAKEN 2026-09-20 — case 16.59 — and this paragraph is CORRECTED rather than left standing.** `.github/workflows/ci.yml` now carries a `viewport` job that runs `test:e2e:viewport`, and `gate` waits on it, so the suite that produced every number above runs on the merge gate. **A catalogue asserting the absence in the present tense, in the same tree that carries the fix, is worse than one saying nothing**: a reader either re-does the wiring or concludes the suite is still unchecked, and an agent sweeping for open `Owner:` items picks up a job that is already done. This paragraph read as a live hand-off for exactly as long as the fix existed — an independent review found it, not the sweep that made the fix.*
  *The re-baseline is the FALLING direction only, which is the direction `recordTapBaseline` blesses — a rise fails before it can be recorded, so observation can only ever lower a ceiling. No floor is hand-lowered anywhere in this change; the standalone floor is still 44 and 13.990 pins it. The signed-in baseline (`/my-work`, 6) was NOT re-measured: `e2e-stack` runs against the live stack on `:3001`, which is another lane's worktree, so a count taken here would not be a measurement of this tree — it is left at 6, untouched rather than loosened.*

## The ledger guard for a PR that never merged (2026-09-08)

*`mcp-server/12` read `in-flight  324  -` while the work had landed through **#329**. Merging #323
deleted `exec/111`, which was #324's base, so GitHub auto-closed #324 as closed-not-merged — the same
mechanic that had already closed #313/#315/#317/#319 that night. The row survived saying "in flight,
see #324", pointing whoever restarts from this file at a closed PR for work that shipped hours earlier.*

- **13.262** 🚫 The guard's own cases live in `scripts/check-task-ledger.mjs`'s **self-test** (four
  inputs with known answers, run before the real sweep) rather than as vitest cases — the same shape
  `check-runbook-commands.mjs`, `check-case-ids.mjs` and `check-case-citations.mjs` use, and for the
  same reason: a gate must refuse to certify anything when its own instrument is broken, and a matcher
  that silently matched nothing would report "no bad citations" on every run. The four: a row citing a
  never-merged PR → 1; a row citing a **merged** PR with a non-`done` status → 0 (without this the
  guard is "any non-done row fails", a different check wearing this one's name); a row with no PR at
  all → 0; one offender among three sound rows → 1.
  *Controlled: replacing the matcher's predicate with `false` makes `pnpm check:tasks` exit 1 naming
  two of the four before the ledger is read. Controlled again against reality: pointing
  `mcp-server/12` back at `#324` fails with `LEDGER ROWS CITING A PR THAT NEVER MERGED`, naming the
  row, its `file:line`, its status and that PR's title.*

> ### Why nothing already here could see it
>
> `done` rows are validated by sha reachability against `origin/main`. A **non-`done` row requires no
> evidence BY DESIGN** — that is the entire point of the status split, and the reason `claimed` exists.
> So a wrong status carrying a stale PR number is invisible to every other check in the file, and the
> ledger is the restart surface: the one artefact a controller reads to find out what is still owed.
>
> It is a hard failure rather than a printed note, unlike the reverse-drift list beside it. An unciteed
> merged PR is often a docs or ruling PR that legitimately closes no task, and this repo has many. A row
> citing a PR that never merged is always one of exactly two real problems: the row is stale, or the
> work is not on `main` at all.


## The sign-in bucket (2026-09-08) — the follow-up the better-auth ruling recorded

*Block note: `13.275` is the last id of the executor's `13.266`–`13.275` allocation; `13.276`–`13.280`
are taken from the next block, **requested from the controller and used provisionally** rather than
waited on — serial mode has one executor and therefore no other claimant, and an unmerged id can still
be renumbered. **The next free BLOCK is now `13.280`, controller-allocated ON REQUEST ONLY.** Recount
the maximum in use against `origin/main` before trusting that pointer; this file records twice that a
next-free pointer is a cache which goes stale silently, and this line is one more of them.*

- **13.275** ✅ A sign-in path is refused at its own, tighter ceiling while the SAME client's
  `/api/auth/get-session` — one request later, out of a 100-request general budget that three requests
  could not have exhausted — is still served. The load-bearing case. Both buckets answer with the same
  body, so unlike 13.273 the body cannot say which limiter refused; the discriminator is the **ordinal,
  with its positive control in the same pair**. `authMax: 100` against `signInMax: 2` is a STRUCTURAL
  separation, not a comment: were the two equal the general bucket would refuse at the same ordinal and
  the case would pass with the sign-in bucket deleted.
  *Controlled: a matcher hard-wired to `false` reddens this and 12 others.*
- **13.276** ✅ A sign-in request is charged to the general auth bucket **as well**, not instead of it —
  two sign-ins against `authMax: 2` leave `get-session` refused. The anti-**loosening** guard, and the
  case that goes red if someone "simplifies" the hook into charging one bucket or the other: that
  refactor reads as a tidy-up and would hand a client `authMax + signInMax` requests against the mount
  where it gets `authMax` today, reversing the third ground of the ruling that authorised the bucket.
  *Controlled: making the bucket replace rather than add reddens this and 13.273.*
- **13.277** ✅ Every alternative spelling of a sign-in path that still reaches the vendor handler is
  matched — query string, trailing slash, doubled slash, dot segment, mixed case, percent-encoding, and
  a malformed escape *inside* a sign-in path — while the paths better-auth never tightened are not:
  `get-session`, `sign-out`, `/phone-number/*`, the mount root, and a path outside the mount. **The
  negative rows are half the case**: a matcher returning `true` unconditionally satisfies every positive
  row, and `get-session` is the row that refuses it — sweeping the highest-frequency signed-in path into
  a half-size budget would be a self-inflicted outage, not a tightening.
  *Controlled four ways, each killing its own row and no other: deleting the dot-segment resolution, the
  doubled-slash collapse, the lowercase, or the decoded candidate. No normalisation here is dead code.*
  *One row asserted the wrong thing when written and the run is what caught it — `/api/auth/%zz` was
  expected to match on the theory that an unparseable target should get the tighter bucket. `new URL()`
  does not throw on a bad escape; only `decodeURIComponent` does. The expectation was wrong, not the
  code.*
- **13.278** ✅ A **doubled-slash** spelling is charged to the sign-in bucket at the wire, through the
  real hook rather than the matcher alone.
  *Scoped deliberately, and the dot segment is NOT what it asserts. Measured with a probe recording
  `request.url` at `onRequest` on both transports: `app.inject` resolves `/api/auth/x/../sign-in/...`
  to `/api/auth/sign-in/...` before any hook runs, while a **real socket delivers it verbatim and it
  still routes to `/api/auth/*`**. So the production hazard is real and the injection harness is blind
  to it by construction — a case asserting it here PASSED with the matcher's URL resolution deleted,
  i.e. a check that cannot fail for the reason its name gives. It was rewritten around the doubled
  slash, which the probe shows `inject` delivers verbatim, rather than kept as a green tick meaning
  nothing — the same call 13.273's author made in #347.*
- **13.279** ✅ `signInMaxFor` is half the auth budget — **5** at the shipped `RATE_LIMIT_AUTH_MAX=10`,
  30 at the dev stack's 60 — never 0, and **strictly** smaller than `authMax` for every budget above 1,
  with `authMax: 1` asserted as the one named exception. Both invariants are load-bearing: a bucket of 0
  refuses the FIRST request, and a bucket that equals `authMax` refuses at the same ordinal as the
  general one and so changes no verdict.
  *Controlled: returning `authMax` unchanged reddens it.*
  *Two corrections from review, both in this one case. Its NAME was "returns better-auth's magic-link
  max at the shipped default" — **a false claim pinned where it reads as measured.** 5 is the same
  integer, but better-auth keyed per (ip, PATH), so each leg of a sign-in cycle had its own 5; this is
  one bucket across the family and a cycle costs two of it, i.e. 2 complete cycles per window against
  better-auth's 5. And the bound was `toBeLessThanOrEqual(authMax)`, which **admitted the single value
  (`authMax: 1`) at which the docblock's own stated failure — inertness — actually occurs**: a gate
  closing one end of a range, the exact shape this file catalogues.*
- **13.280** ✅ `retry-after` is a **lower** bound when the two buckets' windows opened at different
  instants: a caller refused by `auth:` is charged to `signin:` anyway, so `signin:`'s window opens
  later and outlives it. Measured at production-shaped config — told **1 second**, refused for **59
  more** — and the case asserts exactly that, `[1,1,1,1,1]` then a 429 carrying 59.
  *Pinned rather than fixed, and pinned rather than left as prose. It is a HINT being short, never a
  bound admitting too much: the early caller gets another 429 with a fresh figure. The correct fix
  needs each bucket's window END, which `RateLimitVerdict` does not carry, and widening that contract
  touches all five buckets to sharpen an advisory header. **Owner: whoever next changes
  `RateLimitVerdict`** — and this case is what that change flips.*
  *Found in review against a comment in `app.ts` that asserted the OPPOSITE as an invariant the code
  upheld. The `Math.max` it pointed at covers only the both-refuse-the-same-request shape.*



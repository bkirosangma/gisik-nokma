# Pre-launch checklist

Owner-assigned, 2026-09-07. Seven items. This file records **what was measured**, not what was
assumed — several items turned out to be already handled, already handled *elsewhere*, or handled by
something that could not have been noticed from the source alone.

| # | Item | Status |
|---|---|---|
| 1 | Custom 404 page | ✅ **built** |
| 2 | Privacy policy page | ✅ **built, unreviewed boilerplate** |
| 3 | Terms & conditions page | ✅ **built, unreviewed boilerplate** |
| 4 | No secrets stored in the frontend | ✅ **audited; two gate blind spots found and closed** |
| 5 | Force HTTPS | ✅ **answered: mostly the platform's job; HSTS was the app's and was missing** |
| 6 | Colour contrast | ✅ **measured on the real stack. TEXT contrast: zero failures in 60 page-loads, two enforcement gaps closed. NON-TEXT contrast: 17 of 24 bordered classes below 3:1 — recorded for the owner, see the box** |
| 7 | Mobile-friendly / responsive | ✅ **measured at real viewports; two defects found and fixed, and a committed suite that would catch either again** |

---

## Item 4 — no secrets stored in the frontend

**Verdict: no secret value ships in any client bundle. Two gate blind spots were letting that go
unenforced, and both are now closed.**

### What was checked, and how

A source grep is not an audit, so this went to the artifact:

- **The built web bundle**, not the source — 50 files, 1.4 MB of `apps/web/.next/static/**/*.js`, swept
  for server-only identifiers (`DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, `SMTP_URL`, `PGPASSWORD`, the
  `OBJECT_STORE_S3_*` credential pair) and for secret-shaped literals (`sk-`/`AKIA`/`ghp_`/`xox`-prefixed
  keys, PEM private-key headers, JWT-shaped triples). **Zero.** The sweep printed a positive control from
  the same run (`/v1/` × 33, `NEXT_PUBLIC_SERVER_URL` × 1) so the zeros are readings, not an empty scan.
- **A false positive worth recording**, because the label was mine and it was wrong: the scan flagged
  `BETTER_AUTH_SECRET` and `AUTH_SECRET` present in the bundle and printed "LEAK". Reading the
  surrounding bytes settled it — it is better-auth's own env-accessor shim,
  `Object.freeze({ get BETTER_AUTH_SECRET(){ return a("BETTER_AUTH_SECRET") }, … })`, a frozen object of
  lazy getters **with no defaults**, which resolve to `undefined` in a browser. Those are property
  *names*, not values. **A name-based bundle scan cannot distinguish a leaked secret from a library
  asking for one; only reading the context can.**
- **Cross-boundary imports:** no file under `apps/web`, `apps/mobile`, `apps/desktop`, `packages/app-core`
  or `packages/ui` imports from `apps/server` or `@gisik-nokma/server`. Carried a positive control (41
  `@gisik-nokma/app-core` imports in `apps/web`) so the empty result proves the search works.
- **Hardcoded secrets in client source:** zero, with a negative control.
- **`NEXT_PUBLIC_*` inventory:** exactly one — `NEXT_PUBLIC_SERVER_URL`, an origin, safe to be public by
  nature and documented as such in `deploy/do/app.yaml`.

### The two findings

**4a. `check:env` scanned one of the three shipping clients.** `ROOTS` was
`['apps/server/src', 'apps/web', 'packages']` — `apps/mobile` and `apps/desktop` were never walked. The
gate's own comment already argued the case for including them, having been widened to `apps/web` earlier
for exactly this reason: *"a NEXT_PUBLIC_ variable baked into the browser bundle from a page could ship
undocumented."* Expo inlines every `EXPO_PUBLIC_*` and Vite every `VITE_*` in precisely the same way.
Four variables were being read by shipping code and documented nowhere, while the gate reported ok.

**4b. A second blind spot underneath the first: the detector only knew `process.env`.** Widening `ROOTS`
alone still missed `VITE_API_BASE`, because `apps/desktop/src/app.tsx` reads
`import.meta.env.VITE_API_BASE` and never writes the string `process.env` at all. Measured: with the
roots widened the gate found **three** undocumented vars; with the `import.meta.env` detector added,
**four**. Fixing one blind spot revealed the other, and stopping at the first would have looked like
success.

**Both closed**, and all four variables are now documented in `.env.example` under a block that states
the property that makes them dangerous: `EXPO_PUBLIC_*` and `VITE_*` are **substituted into the artifact
at build time**, so the value is published the moment a build is made with it set.

### One risk recorded, not fixed — for the owner

`EXPO_PUBLIC_DEV_TOKEN` (`apps/mobile/src/app.tsx:14`) is a **real bearer token inlined into the bundle
if set**. It defaults to `''`, the app is harmless without it, and its name is honest — it is described in
the source as *"interim session plumbing until Plan 6's session handling is the reference for this app"*.

**What is missing is any mechanism preventing a release build from carrying it.** Set it in a build that
reaches a store or a tester and a working credential is published in plain text, with nothing in the
running app indicating that it happened. The remedy is a build-time refusal (fail the release build when
`EXPO_PUBLIC_DEV_TOKEN` is non-empty), which is a change to `apps/mobile`'s build configuration and is
**out of this checklist item's scope**. Recorded with an owner rather than fixed quietly.

---

## Item 5 — force HTTPS

**The item asked which layer's job this is. The answer is that it splits three ways, and only one third
was missing.**

Measured against `deploy/do/app.yaml`, the only file that knows the provider (DigitalOcean App Platform,
region `blr`, `pm.artsourced.in` for the web app and `pm-api.artsourced.in` for the API):

| Control | Whose job | State before | Action |
|---|---|---|---|
| HTTP→HTTPS **redirect** | **The platform's.** App Platform's router terminates TLS and redirects before a request reaches this process. | Handled | **None. An in-app redirect would be unreachable code** — and a security control that cannot fire reads to a later auditor exactly like one that does. |
| **`Secure` cookie flag** | The app's, already done | Handled | **None.** better-auth derives it from `BETTER_AUTH_URL`'s protocol (`https://pm-api.artsourced.in` in the deploy spec), and `sign-in-flows.test.ts` pins the behaviour over http and https as two different cookie *names*. `auth/auth.ts` is the single authority; restating it would be a second statement of one fact. |
| **HSTS** | **The app's** | **MISSING — no `Strict-Transport-Security` anywhere in the repo** | **Added**, on both hosts. |

**Why HSTS matters separately from the redirect, since the two are easy to conflate:** a redirect protects
the request it redirects. HSTS protects the *next* one, by telling the browser never to attempt plain HTTP
against this host again. Without it every fresh visit opens with one interceptable cleartext request — the
window `sslstrip` exists for — and the redirect arrives too late to close it.

**Both hosts send it, because HSTS is scoped per host.** `pm.artsourced.in` and `pm-api.artsourced.in` are
sibling names; the API sending the header says nothing about the web app. `apps/server/src/http/hsts.ts`
covers the API; `apps/web/next.config.ts`'s `headers()` covers the shell.

**Value: `max-age=31536000; includeSubDomains`. `preload` is deliberately absent** — it is a one-way door
(inclusion in a list compiled into browser binaries, removal measured in months, and it implies the whole
zone), and that is an owner's decision about a domain this product does not solely own. Both test suites
assert its **absence**, so adding it later must be a deliberate act that reddens a test.

**It refuses to send over plain HTTP.** RFC 6797 §7.2 is a MUST NOT, and the practical reason is sharper
than the standard: emitting it in dev would train every developer's browser to refuse `http://localhost`
— a self-inflicted outage that survives uninstalling the app.

> ### ⚠ Open for the owner
> **`preload`** — not sent. Sending it is a commitment for `artsourced.in` that is slow and painful to
> reverse. Worth an explicit decision rather than a default.
>
> **Other security headers are NOT in this item's scope and were not added.** There is no `helmet`, no
> `X-Content-Type-Options`, no `X-Frame-Options`, no CSP anywhere in the repo. Item 5 named HTTPS, so
> that is what was done. Recorded here so the absence is a known absence.
>
> **Nothing is deployed.** `deploy/do/app.yaml` says so itself: *"NOT APPLIED TO ANY LIVE APP. This is a
> written spec only."* Every statement above about what the platform does is a statement about what that
> spec describes, not about an observed running system.

---

## Items 1–3 — the 404 and the two legal pages

**Built.** The 404's design is not decorative: a generic *"page not found"* asserts one cause for a
situation with three, which is the tidier-wrong-answer this product refuses everywhere else. And one of
those causes is a **security property** — `routes/notifications.ts` and Plan 4's ticket reads both answer
the *same* 404 for "does not exist" and "not yours", precisely so a caller cannot probe for which records
exist. So the page names all three causes, says it will not guess between them, and explains why.

The legal pages are **unreviewed boilerplate** and say so **in a code comment, never on the rendered
page** — the owner's instruction, and both halves are now enforced by a test (13.252) that asserts the
marker is in the source *and* absent from the render. Asserting either alone would pass against the
opposite failure.

### Verified in a real browser, and one thing that could NOT be

Rendered at `localhost:3007` and measured rather than eyeballed:

- **Contrast, computed from the live DOM** against the actual resolved background: worst ratio **5.6**
  against a 4.5 requirement; title 15.94, body 6.17. All pass.
- **Touch targets:** both recovery links measure exactly **44×44**.
- **No horizontal overflow** at the tested width.
- **One real finding, fixed:** the closing aside measured **15.2px**, under the 16px floor for body text
  on a phone — and it is the paragraph telling a locked-out reader who can help them, so exactly the
  wrong text to shrink. Now `1rem`.

> ### ⚠ The mobile viewport check did NOT happen, and item 7 must not inherit the assumption
> `resize_window` reported success at 390×844 and the page kept reporting `innerWidth: 1512`; the
> screenshot afterwards was byte-identical to the desktop one. **So every measurement above is a
> DESKTOP measurement**, and nothing here has verified the `max-width: 40rem` rules.
>
> That is recorded rather than glossed because the checklist's own wording for item 7 is *"actually
> check in a real viewport, not just visually inspect the code"* — and a resize that reports success
> while changing nothing is precisely how that instruction gets satisfied on paper. **Item 7 should use
> Playwright.**
>
> **CORRECTION (item 7, 2026-09-07): the second half of that sentence was false, and it was false in
> both places it was written** — here and in `docs/lanes/executor-state.md`. It read *"which this repo
> already has configured with real device viewports (`apps/web/playwright.stack.config.ts`)"*. It has
> not. Measured across both configs and every spec: zero occurrences of `devices`, `projects`,
> `viewport`, or `setViewportSize`, against a positive control of 4 `defineConfig`/`use:` hits in the
> same files. **Nothing in this repo had ever exercised a non-default Playwright viewport.** Playwright
> itself was ready — `@playwright/test` 1.62.1 installed, with a working chromium — so the conclusion
> "use Playwright" survived; the claim that the instrument already existed did not, and a stale claim
> that an instrument exists is exactly how the next session skips building it.
>
> **A correction to that correction, since a directory listing is not a working browser.** An earlier
> draft of this box said "chromium and webkit binaries present". The listing does show `webkit-2272`,
> but Playwright 1.62.1 wants `webkit-2336`, and `webkit.launch()` fails with *"Executable doesn't
> exist at …/webkit-2336/pw_run.sh"*. **Webkit does not run on this machine today.** All three viewport
> projects are chromium — which is independently the right call, because a cross-width comparison across
> two engines cannot attribute a difference to the width. Recorded because "the binary is present" and
> "the browser launches" are different claims and only the second one matters.

## Items 6 and 7 — done, 2026-09-07

**Both were measured against the real seeded stack in a real browser at real viewports, not read off the
source.** The full dev stack was brought up (`docker-compose.dev.yml`: postgres, minio, mailpit, server,
web), seeded with the Convenience Corner world (123 tickets, a guest with per-ticket visibility), and
signed into through the shipped magic-link UI. That matters because **the interesting colours only exist
on the authenticated surface** — the status chips carrying `blocked`, `pending`, `open`, `active` and
`terminal` render on a populated board and nowhere else, so an audit of the public pages would have
measured the palette's easy half and reported it as the whole.

**Coverage: 60 page-loads.** 12 routes × 3 viewports (390 / 768 / 1512) in light, plus 12 × 2 in dark.
Every measurement asserts `window.innerWidth` **inside the page** before measuring anything, because the
failure this item exists to avoid is an instrument that reports success while changing nothing. The dark
pass likewise asserts the theme took effect — `getComputedStyle(document.body).backgroundColor` resolved
to `rgb(27, 26, 23)`, which is `coal`, the dark `surface` token — rather than assuming `colorScheme`
applied.

### Item 7 — one defect, one cause, and it is data-dependent

At **390×844 every page that renders `AppNav` overflowed horizontally by 10px**: `/my-work`, `/members`,
both settings pages and the board. **Every page that does not render it overflowed by none**: `/help`,
`/privacy`, `/terms`, `/sign-in`, the 404. At 768 and 1512, nothing overflowed anywhere. That split is
what turned a symptom into a cause.

The offender is a single element — `button.gn-button--ghost` inside `.gn-nav`, measured running
**338.9 → 400.1 in a 390px viewport**. `.gn-nav` was a no-wrap flex row and its last child is
`Sign out {user.name}`, **so the overflow is a function of the signed-in user's name**: 10px was the
seeded owner's, and a longer name pushes further. That is why the fix is `flex-wrap: wrap` and not a
width guess — and every other flex row of this shape in the two stylesheets already sets it.

**Verified causally rather than by eye.** Injecting `.gn-nav{flex-wrap:wrap}` into the live page took all
five routes from 10 to 0; a **negative control** — an irrelevant declaration on the same selector — left
all five at 10. Without that control the "after" reading measures page settling, not the rule.

**The three breakpoints, all confirmed firing.** The checklist previously mentioned only `max-width: 40rem`;
there are two thresholds, and the three viewports discriminate all three states:

| measured property | 390 | 768 | 1512 |
|---|---|---|---|
| `.gn-help__tabs` / `.gn-notfound__actions` flex-direction (40rem = 640px) | `column` | `row` | `row` |
| `.gn-shell` padding-left (60rem = 960px) | 12px | 12px | 20px |

### Item 6 — the text palette is sound; the NON-TEXT palette is not, and nothing was watching either

**Zero TEXT contrast failures across all 60 page-loads**, computed from the live DOM with the used
foreground colour composited over the **effective** background — every layer walked up the ancestor
chain, alpha composited, rather than the element's own possibly-transparent `background-color`.

> **That instrument measured text and only text, and the unqualified sentence it first replaced —
> "zero contrast failures" — was the wrong claim.** Non-text contrast (WCAG 1.4.11: borders, focus
> rings, anything that identifies a control) was outside what it walked. When a second pass did measure
> it, **17 of 24 distinct bordered classes fall below 3:1 in BOTH themes.** See the owner box at the end
> of this section. A scoped result reported without its scope is how a real gap gets signed off.

The text palette is genuinely well built. Two things were nonetheless wrong there, and neither was a
colour that fails today:

**6a. `CONTRAST_PAIRS` declared 8 pairs; 18 more actually co-occur on screen.** That array's own docblock
calls a colour with no guarantee *"the one thing this file exists to make impossible"* — and nothing
checked that a pair which co-occurs had ever been declared, so it was entirely possible. All 18 measure
above their minimum in both themes today (tightest: `accent on surface` at 5.33 against 4.5), so this
closes the hole **before** a palette edit finds it rather than fixing a break. The status roles are pinned
at **3**, not relaxed to it: they reach the screen as `.gn-chip__dot`'s background, a non-text component
WCAG 1.4.11 holds to 3:1, and all seven measure above 5.0 regardless. Test count 21 → 57. A mutation
(`sand`, used only by `surfaceSunken`) reddens exactly `light: text on surfaceSunken ≥ 4.5` and nothing
else — the new assertions are load-bearing, not decorative.

**6b. `apps/desktop` was shipping with every design token undefined.** `ui.css` references the tokens and
defines none of them (321 `var(--gn-…)` usages, zero declarations, no `:root`); the definitions come from
`themeStylesheet()`, which only `apps/web/app/layout.tsx:32` ever called. Confirmed in the built artifact:
`apps/desktop/dist/assets/index-*.css` carries 24 distinct `var(--gn-…)` usages and zero definitions, with
the 24 as the positive control. **Nothing caught it because both existing guards are claims about text** —
that every `var()` names a declared role, and that no colour literal is written outside `tokens.ts`.
Neither says a stylesheet defining those variables is ever installed in a given app, which is a property
of an entry point. Fixed by `installTheme(document)`, tested as case 15.17.

> ### ⚠ Open for the owner — non-text contrast, product-wide. NOT fixed here, and deliberately so.
>
> **17 of 24 distinct bordered classes render below WCAG 1.4.11's 3:1, in both themes.** Measured on the
> live authenticated stack across five routes, with a positive control in the same run: the primary
> `button` reads **19.43** (light) / **18.26** (dark), so the instrument distinguishes red from green.
>
> Ranked by how defensible the finding is, not by ratio:
>
> | what | light | dark | standing |
> |---|---|---|---|
> | `.gn-button--ghost` | **2.49** | **2.30** | **Least contestable.** A control whose fill is 1.09 against the page, so the border is the *only* thing identifying it. Includes the nav's own Sign out button. |
> | `td`, `th`, `ticket-type-list__row`, `gn-board__column` | 1.34–1.61 | 1.34–1.61 | Defensible: table and column structure is information, not decoration. |
> | `.gn-card`, `.gn-chip` | 1.45 | 1.34–1.61 | **Concede if pressed** — decorative containers arguably do not invoke 1.4.11 at all. |
>
> **Why this is recorded rather than fixed, in three parts.** (1) The remedy is to darken the `line` and
> `lineStrong` primitives, which changes every card, chip, table cell and column in the product, in both
> themes — a design decision with product-wide blast radius, and the owner's to make. (2) These pairs
> **cannot be added to `CONTRAST_PAIRS` first**: enforcement and remedy would have to be the same commit,
> because declaring them reddens the gate immediately. (3) The `surfaceOverlay` pairs need a
> compositing-aware `relativeLuminance` before they can be enforced *at all* — see the note below.
>
> **Named owner: whoever next takes a design pass over `packages/ui`.** Nothing is blocked by it; items 6
> and 7 are complete without it.
>
> #### How this was nearly missed, which is the part worth keeping
>
> The contrast calculator used through item 6 was validated with a known-failing pair: `line #d9d6cf` on
> `paper #f7f6f3` = **1.34**, chosen because it was obviously too low to be real. **It is real.** That is
> the exact pair `.gn-card`, `.gn-chip`, `td`, `th` and `.gn-board__column` render every day, and the
> same 1.34 appears twice in the table above. A number picked as a synthetic floor turned out to be a
> shipped colour, and the first pass read right past it because the instrument that produced the
> confident "zero failures" only ever walked text. **The control was sound; the scope it certified was
> narrower than the sentence it was used to support.**
>
> #### The existing contrast function cannot be used for `surfaceOverlay`, and would print a false red
>
> `relativeLuminance()` in `tokens.test.ts:24` ignores alpha *by documented design*. `surfaceOverlay` is
> the one alpha role (`scrimLight #1c1b1866`, `scrimDark #000000a6`). Slicing the alpha off `#1c1b1866`
> yields `#1c1b18` — which is literally the `ink` primitive that `text` resolves to — so `text` on
> `surfaceOverlay` computes **1.00** and would report a catastrophic failure. Composited correctly it is
> **6.43** light / **16.43** dark: a comfortable pass. **Had item 6 simply declared that pair, the gate
> would have gone red on a colour that is fine.** It runs the other way too: `border` on `surfaceOverlay`
> reads 11.87 naively and **1.85** composited — a false *green*, which is the more dangerous direction.
>
> This is not a duplicate implementation to reconcile: the token-level function is correct for opaque
> pairs and documents its own limit, while the live-DOM walker must composite to say anything at all.
> Enforcing any overlay pair means teaching the token function a backdrop first, because a scrim's
> contrast is a property of what is behind it.

### What was NOT measured, stated so it is a known absence

- **NEW, 2026-09-08 — `/invite/<token>` HAS NO ACCESSIBLE-NAME FLOOR UNDER IT. Owner: whoever gives
  the stack seed a standing invite token** — Task 4's successor at the invite surface, or Task 10 if
  it lands first. Task 4 restyled `/workspaces` and `/invite/[token]` together and could only put a
  ratchet under the first of them. The reason is structural, not laziness: the signed-in sweep visits
  fixed paths, and a token-less visit to `/invite/<token>` renders the **dead-link branch** — so
  adding the route to the loop would record a baseline for the wrong screen and then defend it
  forever, which is worse than no baseline, because a ratchet at 0 over a screen nobody reaches
  reports green and reads as coverage. Closing it needs a seeded, non-expiring invite token in the
  stack fixture; then the route joins `routes` in `apps/web/e2e-stack/viewport.spec.ts` beside
  `/workspaces`.
  **What DOES guard the invite surface today, so the gap is not overstated:** twelve jsdom cases in
  `apps/web/test/invite-page.test.tsx` (3.118–3.123) covering the live link, the dead link, the
  session-loading and signed-out branches and both acceptance-refusal shapes, plus case **13.300**,
  which drives the real page in a real browser behind a stubbed summary. What is absent is
  specifically the **one-way accessible-name floor** — the instrument that catches a future restyle
  silently dropping an `aria-label` or a `role`, which no assertion above is shaped to notice.
  *How this was found is the part worth keeping:* Task 4's dispatch asserted that the signed-in
  ratchet already watched these routes. It did not — the baseline file held five keys and neither of
  Task 4's two routes was among them. The claim was written from the plan's promise rather than from
  `accessible-names-baseline.json`, and **a ratchet whose keys nobody has read is indistinguishable
  from one that covers everything.**

- **NEW, 2026-09-08 — PASSKEY REGISTRATION DOES NOT EXIST. Owner: Task 12 of the HIG per-screen plan,
  scheduled after the owner's second look at sign-in.** `/sign-in` shipped a `Sign in with a passkey`
  button that **could not work for any user anywhere**. Not a configuration gap like Google's — a
  missing feature: the only `addPasskey` occurrences in the tree are inside better-auth's own bundled
  client, so there is no flow by which a person can ever register one. The server side is correct and
  always was (`auth.ts`, `rpID: new URL(baseUrl).hostname`; the passkey plugin is mounted), which is
  exactly what made the gap invisible — every piece was present except the one that lets a credential
  come into existence.
  **What 2b did:** removed the dead button, and kept `autocomplete="username webauthn"` on the email
  field. **The conditional-mediation REQUEST the dispatch specified is deferred to Task 12, on a
  measurement** — `signInPasskey` issues `GET /passkey/generate-authenticate-options` as its first
  statement, which is charged against the shared `auth:` bucket (`RATE_LIMIT_AUTH_MAX` = 10/60s in
  `deploy/do/app.yaml`). Review drove ten probes through the assembled app and the eleventh real
  `POST /sign-in/magic-link` answered **429**, against a zero-probe control that answered 500 and not
  429; and `apps/server/src/http/rate-limit.ts` records as measured that a web container proxies every
  browser into ONE client key, so that budget is shared across users. **A request that spends a shared
  sign-in budget on a flow with zero possible successes is the same defect this round removes, one
  layer down.** Turning mediation on belongs in the change set that makes a passkey obtainable.
  *(Refuted limb, recorded so nobody builds against it: the challenge rows are NOT unbounded —
  `findVerificationValue` sweeps expired rows globally on every call, `disableCleanup` is unset, and
  phone-OTP verification calls it. No cleanup job is owed.)*
  **STATE OF THE FEATURE, PLAINLY: passkey sign-in has NO ENTRY POINT on the sign-in screen as of
  this change — no button, and no autofill offer either.** The `autocomplete="username webauthn"`
  token is present and inert; it does nothing until something issues a conditional-mediation request.
  **Task 12 restores the entry point together with registration**, which is the only pairing that makes
  sense: an offer to use a passkey has no population it can serve until a user can register one. The
  narrowing was accepted by the controller on the measured 429 rather than taken unilaterally.
  **That makes the sign-in screen honest; it does not close the gap.** Until Task 12 lands, no user of
  this product can hold a passkey, and the method is unavailable however well it is wired.
  *Recorded here rather than left to the absence of a button, because an unrecorded deferral is defect
  class 4 from Plan 1 — and because the button's removal is exactly the change that would otherwise
  make the gap harder to notice, not easier.*


- **`apps/mobile` was not rendered.** It is React Native; no browser viewport applies. Its colours were
  read statically and its pairs are included in 6a. One thing found there and **not** fixed:
  `help-screen.tsx:59` resolved every token through `colorOf('light', role)`, so the mobile help screen
  was hardcoded to the light theme and a dark-mode phone got light colours. **CLOSED 2026-09-08** on the
  owner's assignment: the screen reads `useColorScheme()` and `app.json` declares
  `userInterfaceStyle: automatic`, without which the OS never reports dark and the hook answers light
  forever. The deferral reason recorded here — that theming one screen would leave the board and ticket
  screens inconsistent — was measured and found false: those two declare no colours at all. Cases
  12.394–12.396.
  `help-screen.tsx:59` resolves every token through `colorOf('light', role)`, so **the mobile help screen
  is hardcoded to the light theme** and a dark-mode phone gets light colours. That is a theme-support gap
  rather than a contrast failure — the light palette is internally consistent, so nothing fails a ratio —
  and fixing it means deciding how the native app learns the OS preference. **Recorded for the owner, not
  fixed**, because it is a design decision rather than a defect with one obvious remedy.
- **Tap targets: PARTLY CLOSED 2026-09-08** (owner-assigned). The shared `.gn-button` (`340x38`), the
  view tabs (`55x21`) and the sign-in inputs (`340x21`) now meet 44px, taking the signed-out ratchet
  from **60 offenders to 42** and `/sign-in` to **0** on all three viewports. `/help`'s table-of-contents
  links went 23px → 24px — WCAG 2.5.8's floor — and deliberately not to 44px, because nineteen entries
  at 44px is 836px tall on a phone. The signed-in shell now has a ratchet too — it had **none**, since
  `e2e-stack/viewport.spec.ts` measured overflow only. `/my-work` at 390px: **9 offenders, then 7**
  after the nav links went to 44px. The remaining 7 are attention-row titles at `249x23` — dense
  in-list controls that should go to 24px by the same rule as `/help`'s TOC, left unshipped because
  verifying one more CSS rule against the pre-built container costs a full rebuild. Original note
  kept below.
- **Type scale: CLOSED 2026-09-08** (owner-assigned, the other half of the tap-target ruling). The
  first thing this pass established is that **nothing in the repo could measure the finding below.**
  `responsive.spec.ts` has swept body copy against a 16px floor since item 7, but its population is
  `p, li, dd, dt, td, figcaption, label` — and `gn-board-card__provenance` and the chips, the two
  things the paragraph below names, are a `span` and a `span`. The reading was a manual measurement
  taken once, with no guard, which is exactly the state the tap-target note was in.
  `apps/web/e2e-viewport/type-scale.ts` now sweeps that population in BOTH suites, ratcheted per route.
  **The floor is 12px and it is not a WCAG number** — no success criterion sets a minimum font size
  (1.4.4 is resize-to-200%, 1.4.12 is text spacing; iOS HIG's 11pt and Material's 12sp are native
  guidance). It is the bottom rung of this product's own scale, seventeen rules at `0.75rem`, which is
  also why the paragraph below is NOT overridden: the 12.5px and 12.8px labels it calls legitimate sit
  ABOVE the floor and were left alone. Five declarations sat below it, each a one-off stray:
  `.escape-chip__hint` 10.0px (and `opacity: 0.7` on top), `.gn-avatar--small` 10.4px,
  `.upload-chips__chip` 11.0px, `.gn-transition-edge__label` and `.ticket-type-list__badge` 11.2px.
  All five now at `0.75rem`. **One is witnessed, four are not** — only `.ticket-type-list__badge` renders on a swept route (**4 → 0** on `/settings/ticket-types`). The
  others are on the workflow editor canvas, inside a ticket description editor, or on a card with an
  assignee, and no seeded card has one (zero `assign` mentions across `apps/server/src/seed`). The
  workflow editor route was ADDED to witness `.gn-transition-edge__label` and then removed: it
  measured `{labelsInDom: 0, flowNodes: 0, flowEdges: 0}` — the canvas renders nothing at 390px —
  and a route sweeping five nav links is a green row meaning nothing. Owner for the four: whoever
  next seeds an assigned card or sweeps the two editor surfaces.
  **The checklist's own named element is now guarded.** Widening the population to `a`/`button`
  took the board from 36 examined to 104 and surfaced `button.gn-board-card__provenance` at 12.48px
  x26 — the "12.5px x25" in the paragraph below, invisible to every sweep until now because it is a
  `<button>`. Above the floor, so the judgment below stands; it is simply measured now.
  **The route list is the part worth inheriting.** `/my-work` and the board — the pages this very
  paragraph names — both measured ZERO under the floor. A sweep of only those two would have ratcheted
  0 and 0, reported green, and been blind to every rule the change fixes. A ratchet on the pages a
- **NEW, 2026-09-08: ONE CLIENT CAN EXHAUST THE MAGIC-LINK BUDGET FOR EVERY USER — measured, cause not
  pinned, reported not fixed.** Found while measuring item B's rate-limit question, and it supersedes
  that question rather than answering it.

  **The 429s that break the e2e suite are not ours.** The two limiters answer differently, and the
  bodies settle it: ours is `{"error":"rate_limited","retryAfterSeconds":N}`
  (`apps/server/src/app.ts:545`), better-auth's is
  `{"message":"Too many requests. Please try again later."}`
  (`better-auth/dist/api/rate-limiter/index.mjs:65`). **Every 429 observed was the latter, byte for
  byte.** `apps/server/src/auth/auth.ts` has **no `rateLimit` key at all**, so better-auth's limiter
  runs at its defaults and nothing in `.env` reaches it. **`RATE_LIMIT_AUTH_MAX` is not the binding
  constraint and raising it would fix nothing.**

  **THE CONTROL IS THE WHOLE FINDING — without it this is just "the suite is flaky".** Two clients with
  genuinely different source addresses, both hitting the server **directly, no proxy**:

  | client | address | spend before | result |
  |---|---|---|---|
  | A | `192.168.65.1` | 5 × 200 | **429** on its 6th |
  | B | `127.0.0.1` | **none** | **429 on its very first request** |

  Both addresses and the ordering are in the server's own log. **A client that had spent nothing was
  refused because a different client had spent.** The budget is shared across clients.

  **Measured limits: 5 sends per ~60s window, globally.** Fire until refused from a clean window → the
  6th is refused; poll after the refusal → allowed again at ~60s.

  **Why it matters beyond the test suite.** The running server is `NODE_ENV=production` and
  `deploy/do/app.yaml` deploys production too, so this plausibly holds in the real deployment: any one
  person retrying sign-in locks out every other user, and it is a trivial unauthenticated
  denial-of-service on the **first screen a new user ever sees**.

  **THE CAUSE IS PINNED (2026-09-08, after this entry was first written).**
  `better-auth@1.7.2/dist/api/rate-limiter/index.mjs`:

      const ip = getIP(req, ctx.options);                          // :239 — returns falsy here
      const key = createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path); // :245
      const NO_TRUSTED_IP_KEY = "no-trusted-ip";                    // :233

  **When the IP cannot be resolved the key falls back to a literal constant — one shared bucket per
  path, for everybody.** The fallback is unconditional on IP resolution failing, which is why the
  two-client control showed sharing *with no proxy in the path*. My earlier "the Next proxy collapses
  the addresses" reading is refuted by the same line: the proxy is irrelevant.

  **AND THE LIBRARY SAID SO, IN THIS SERVER'S OWN LOG.** Line :241 logs *"Rate limiting could not
  determine a client IP and is falling back to a single shared per-path bucket."* It is gated by
  `ipWarningLogged`, so it prints **once per process** — into startup noise, never repeated. *A
  once-per-process warning is a finding with a half-life.*

  **⚠ THE NUMBERS: 5 per 60s, and NOT the 3-per-10s the generic rule would suggest.** `/sign-in*` does
  carry a default special rule of `window: 10, max: 3` (`:302-308`) — **but a plugin rule overrides it**
  (`:251-257`), and `magic-link/index.mjs:197-203` declares `pathMatcher` `/sign-in/magic-link`,
  `window: opts.rateLimit?.window || 60`, `max: opts.rateLimit?.max || 5`. **The magic-link path is
  governed by the plugin's 5-per-60s, not the generic 3-per-10s**, which is exactly what the black-box
  measurement found. Reading one rule table and stopping would have produced a confident wrong number;
  the measurement and the source agree only after the override is followed.

  *(The `phone-number` plugin declares its own too: `/phone-number`, 60s, max 10.)*

  **⚠ STILL NOT ESTABLISHED: this was measured on the DEV STACK ONLY**, not against the real
  deployment.

  **This CORRECTS an earlier reading of my own.** I first reported the cause as `next.config.ts:94`
  proxying `/api/auth/*` and collapsing every client onto the proxy's address. **The control above
  refutes that**: clients are not separated even with no proxy in the path, so removing the proxy would
  fix nothing. The narrower story was wrong, and it was wrong in the direction of looking solved.

  **✅ FIXED 2026-09-08 — controller ruling, delegated by the owner: `rateLimit: { enabled: false }` in
  `auth.ts`.** better-auth's limiter is disabled outright and OUR limiter, which keys per client address
  under `TRUST_PROXY`, is the single authority on `/api/auth/*`. Witnessed on this stack: **8/8
  magic-link sends now return `200`** where the sixth was previously better-auth's `429`, and the
  IP-fallback warning is **gone (0 hits, against 39 log lines and 16 requests as the positive control)**.
  Cases **13.273** (automated, mutation-witnessed) and **13.274** (the manual stack witness).
  **`RATE_LIMIT_AUTH_MAX` was NOT touched** — it was never the binding constraint.

  **The named loss, recorded rather than discovered later:** better-auth's per-path tightening on the
  magic-link route goes away; ours is a flat budget across the whole mount. A sign-in-specific bucket in
  our limiter would restore parity and is an **owned follow-up, deliberately not built** in that change.

  ~~**The remedy is an owner decision about an auth-path security control**, not an executor's: configure
  better-auth's own `rateLimit` (`enabled`/`window`/`max`, or `customRules` per path). **Mint case
  `13.273` when that is ruled on** — no case id is minted here because there is no guard yet, and a
  green case over an unfixed finding is exactly the shape this catalogue keeps recording.
  finding NAMED is not a ratchet on the pages the defect is ON. Cases 13.264–13.265.
- **NEW, 2026-09-08: twenty-six controls render at the BROWSER'S default font, not the product's —
  reported, not fixed, because it is an owner call about the design.** Found by the type-scale sweep
  above, which measures computed sizes and so can see what no stylesheet says. Enumerated on the
  signed-in surface at 390px by temporarily raising the sweep's floor to 16px:

  | selector | size | count |
  |---|---|---|
  | `button` (unclassed) | 13.33px | 22 |
  | `button.ticket-type-list__new` | 13.33px | 2 |
  | `button.workflow-list__new` | 13.33px | 2 |

  **13.33px is not a size anyone chose.** It is what a `<button>` renders at when no rule sets `font`,
  and it is the ONLY value in the 12–16px band that is not a deliberate product size — every other
  reading there resolves to a `rem` rule in `ui.css` (`0.75`, `0.78`, `0.8`, `0.85`, `0.9`). Verified:
  neither `.ticket-type-list__new` nor `.workflow-list__new` carries any `font` declaration, while the
  repo's own shared control `.gn-button` opens with `font: inherit`. So this is a departure from a
  pattern this codebase already established, not a competing choice.

  **~~Why it is not fixed here.~~ FIXED 2026-09-08 — the owner ruled "apply it", having been shown and
  accepted that it visibly resizes the twenty-six.** `button { font: inherit; }` in
  `apps/web/app/globals.css`. The remedy was never in doubt; the acceptance was the only thing holding
  it, and the earlier "take it" ruling (given against the 12.5px labels below) correctly could not be
  stretched to cover a finding that did not exist when it was made.

  **The count was 26 when this bullet was written and it is 30. Both later sites were found by
  measuring before writing the rule, and neither was reachable from this bullet's method:**

  | surface | site | before | why this enumeration missed it |
  |---|---|---|---|
  | signed-in ×5 routes | 22 `button` + 2 `.ticket-type-list__new` + 2 `.workflow-list__new` | 13.3333px | — (this bullet's own 26) |
  | `/sign-in` ×3 widths | 2 `<button role="tab">` in `.gn-view-tabs` | 13.3333px | the raised-floor run was **signed-in only** |
  | `/help` ×3 widths | 2 `button.gn-help__tab` | **16px, Arial** | **no size instrument could see it** |

  **The `/help` pair is the finding worth carrying.** `ui.css:1321` sets `font-size: 1rem` and no
  `font-family`, so those controls were already the *right size* in the *wrong font*. Raising the floor
  to 16px — the exact technique that produced this bullet — cannot surface a 16px reading. They were
  found only by a mutation run against a guard that reads font-FAMILY, and they are the reason that
  guard is not simply an assertion that the `13.3333px` bucket is absent: that form would have passed
  over them, and would pass again the day a UA constant changes.

  **30 is a floor, not a total.** Ten of the product's nineteen routes are swept by neither suite, and
  unstyled controls on them (calendar, timeline, contest banner, the workflow-builder inspectors,
  editor chrome) are corrected by the same rule and are not measurable by either instrument.

  **~~It is under a ratchet either way.~~ It is under a ratchet of its own now**, which it was not
  before: these sat ABOVE the 12px floor, so 13.264–13.265 were green throughout the entire defect and
  could never have caught it. Cases **13.266–13.267** guard the font-family property directly.
- **Tap targets and text size are reported, not fixed.** On the board at 390px, 48 interactive elements
  measure under 24×24 — but almost all are *wide and 21–23px tall* (e.g. `249×23` attention titles,
  `52×21` view tabs), missing WCAG 2.5.8's 24px by one to three pixels rather than being small targets,
  plus one genuine `13×13` input. Only 2 of the 50 fall between 24 and 44. Small text is real but mostly legitimate labels
  (`gn-board-card__provenance` at 12.5px ×25, chips at 12.8px); the counts are identical at 768 and 1512,
  so it is a type-scale question, not a responsive one. Both are **owner calls about the design**, not
  contrast or overflow defects, and neither was in items 6/7's wording.
- The overflow fix is verified against the live page and by the committed viewport suite; the running
  container serves a pre-built image, so it was not re-verified by rebuilding that image.

---

## Items 6, 7 — why they were deferred (original note, kept)

**Deferred to last by an approved reorder**, so they run once over the whole surface. Between them and
now, the in-app manual/FAQ surface adds a browsable documentation surface across three clients; auditing
before that exists means auditing a surface about to grow by a third, then auditing it again. Running them
last also makes the accessibility treatment one decision applied uniformly rather than something new pages
inherit unevenly.

The cost, stated so it stays a choice: if 6/7 turn up a systemic problem — a token, a base component — the
new pages will have been built on it. Judged cheap here because `packages/ui` owns the tokens in one place.

Both route through the `ui-ux-pro-max` skill per the workspace's standing instruction. **Item 7 needs
Playwright, not the browser automation tool** — see the box above for why.

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
| 6 | Colour contrast | ✅ **measured on the real stack; no live defect, two real gaps closed** |
| 7 | Mobile-friendly / responsive | ✅ **measured at real viewports; one systematic overflow found and fixed** |

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
> itself was ready — `@playwright/test` installed, chromium and webkit binaries present — so the
> conclusion "use Playwright" survived; the claim that the instrument already existed did not, and a
> stale claim that an instrument exists is exactly how the next session skips building it.

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

### Item 6 — no live defect anywhere, and two real gaps that had nothing watching them

**Zero contrast failures across all 60 page-loads**, computed from the live DOM with the used foreground
colour composited over the **effective** background — every layer walked up the ancestor chain, alpha
composited, rather than the element's own possibly-transparent `background-color`. The palette is
genuinely well built. Two things were nonetheless wrong, and neither was a colour that fails today:

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
of an entry point. Fixed by `installTheme(document)`, tested as case 15.257.

### What was NOT measured, stated so it is a known absence

- **`apps/mobile` was not rendered.** It is React Native; no browser viewport applies. Its colours were
  read statically and its pairs are included in 6a. One thing found there and **not** fixed:
  `help-screen.tsx:59` resolves every token through `colorOf('light', role)`, so **the mobile help screen
  is hardcoded to the light theme** and a dark-mode phone gets light colours. That is a theme-support gap
  rather than a contrast failure — the light palette is internally consistent, so nothing fails a ratio —
  and fixing it means deciding how the native app learns the OS preference. **Recorded for the owner, not
  fixed**, because it is a design decision rather than a defect with one obvious remedy.
- **Tap targets and text size are reported, not fixed.** On the board at 390px, 48 interactive elements
  measure under 24×24 — but almost all are *wide and 23px tall* (e.g. 249×23), failing WCAG 2.5.8's 24px
  by a single pixel, plus one genuine 13×13 input. Small text is real but mostly legitimate labels
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

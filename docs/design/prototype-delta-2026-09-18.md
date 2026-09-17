# Prototype delta — the 2026-09-18 export against the product

**What this is.** The owner's 2026-09-18 prototype export was unpacked over the committed prototype in
PR #419. That refresh changed the *design target* for every screen the product has, so this document
answers, screen by screen: which product screen corresponds to which prototype block, what the refresh
actually changed in that block, what the product renders differently today, and therefore what — if
anything — is left to port.

It is **read-only on product code and CSS**. Nothing here is a fix; every finding is a quoted fragment
pair or a cited product line.

**Sources.**

| | |
|---|---|
| NEW prototype (the target) | `design-system/interactive/desktop.dc.html`, blob `6d7b67c0a52c…` — landed by `227434a5`, present at `3831bb49` |
| OLD prototype (pre-refresh) | same path at `b6d76a90`, blob `c9f852a2c243…` |
| Product | `apps/web/app/**` (routes), `packages/app-core/src/**` (views), `packages/ui/src/ui.css` (the `[data-style="neo"]` tokens) |
| Export provenance | `design-system/interactive/PROVENANCE.md` — bundle sha256 `bf64cc446880…` |

**Byte-integrity of the thing being audited.** `git show 6d7b67c0a52c` hashes to
`2cda054b4320ebb6b379d290a6e8dba69ac45cd1eabe0da100b5425e45b6d90c` — **exactly the sha256
`PROVENANCE.md` records** for the file its unpacker wrote from the owner's export. So the block ranges and
every quoted fragment below are tied to the recorded artefact, not merely to whatever the working tree
held. All 25 block ranges in the delta table were re-derived from these two blobs, not from the checkout.

**Citation convention.** Prototype citations are written `desktop.dc.html@<blob-sha12>:<line>`, never
bare, so they survive the next refresh. Resolve one with
`git show 6d7b67c0a52c > /tmp/new.dc.html` (or `c9f852a2c243` for the old file). Task/product citations
are `path:line` at the branch tip.

---

## The method, and the control that makes it trustworthy

The two exports were emitted by **different bundlers**, so a raw line diff between them is mostly
spelling. The newer runtime:

| form | old | new |
|---|---|---|
| raw element | `<table>` | `<sc-raw-table>` |
| event attribute | `onClick` | `sc-camel-on-click` |
| named entity | `&mdash;`, `&rsaquo;`, `&uarr;`, `&middot;`, `&rsquo;` | `—`, `›`, `↑`, `·`, `’` |
| void element | `<input … />` | `<input … >` |

Every block was extracted whole (opening `<sc-if>` to its matching `</sc-if>` at equal indent), the four
rewrites above were undone **on both sides**, and the normalised texts were diffed.

**The control.** Five blocks are called *unchanged* by the PR #419 Part 0b table — `isListView`,
`isMyWork`, `isWorkflows`, `isLegal`, `isMobileDevice`. Under the normaliser **all five must diff empty,
and all five do**. A normaliser that hid real edits would have to still show those five clean, and one
that was too weak would show churn in them — so the control moves in both directions.

**What the control caught, on the third pass — and what it does not overturn.** The first normaliser
undid only the two tag/attribute rewrites and reported **16 blocks "CHANGED at equal size"**, which is
the Part 0b table's own count. Inspecting them showed every one differing *only* in named entities and
the self-closing slash: `Nothing was deleted &mdash; this filter…` → `Nothing was deleted — this
filter…`, `&lsaquo;` → `‹`, `&rsaquo;` → `›`, `<input … />` → `<input … >`. Undo those two as well and
**14 of the 16 collapse to identical**; the real count is **six**. Cross-checked the hard way: under the
*least* tolerant normalisation (tag + attribute rewrites only, no entity tolerance) the four largest
"changed" blocks — `isSettingsShell`, `isMcpTokens`, `isBuilder`, `isTypeEditor` — show 22, 4, 4 and 12
changed lines, and **every single one is an entity or a self-closing slash**. Not one is a content change.

> **Credit where it is due, because the framing matters.** The Part 0b table
> (`docs/lanes/executor-state.md:216`, "Prototype delta 2026-09-18") did not claim sixteen screens need
> work, and it was not careless: it normalised the three rewrites it had mapped, and it closed with the
> caveat that *"a residual 'CHANGED' on a size-identical block could be a fourth mechanical rewrite I did
> not map rather than a design change"* — adding that the table is **"a porting seed, not a changelog."**
> **This document supplies that fourth rewrite** (named entities + the dropped self-closing slash) and
> therefore *resolves* the table's stated open caveat rather than overturning its verdicts. The table got
> `isSignIn`, the `isMembers` split, `isAccount` +22 and `isHelp` +28 right. What changes is the answer to
> its own hedge: of the sixteen it flagged, **fourteen were the fourth rewrite**. The table named five of
> my six (the `isSignIn` mark, the `isMembers` split, the new `isInviteAdmin`, `isAccount` +22, `isHelp`
> +28) — the one it missed is **`isWork`**, whose two literal-to-binding edits sit inside a size-identical
> block and are exactly the case that caveat anticipated.

---

## The delta — all 25 blocks

| # | block | NEW `@6d7b67c0a52c` | OLD `@c9f852a2c243` | content delta |
|---|---|---|---|---|
| 1 | `isMobileDevice` | 103–105 | 99–101 | none — identical |
| 2 | **`isSignIn`** | 120–178 | 116–174 | **changed** — Google mark `img` → inline `svg` |
| 3 | `isWorkspaces` | 180–235 | 176–231 | none — identical |
| 4 | `isWorkspace` | 237–316 | 233–312 | none — identical |
| 5 | **`isWork`** | 318–552 | 314–548 | **changed** — two literals became bindings |
| 6 | `isBoardView` | 358–403 | 354–399 | none — identical |
| 7 | `isListView` | 405–479 | 401–475 | none — identical (ported in #419) |
| 8 | `isCalendarView` | 481–508 | 477–504 | none — identical |
| 9 | `isTimelineView` | 510–542 | 506–538 | none — identical |
| 10 | `isMyWork` | 554–605 | 550–601 | none — identical |
| 11 | `isInbox` | 607–649 | 603–645 | none — identical |
| 12 | **`isMembers`** | 651–798 | 647–783 | **changed** — role cell made conditional; invite panel gated |
| 13 | **`isInviteAdmin`** | 722–796 | — | **new block** |
| 14 | `isSettingsShell` | 800–1011 | 785–996 | none — identical |
| 15 | `isTypes` | 817–839 | 802–824 | none — identical |
| 16 | `isWorkflows` | 841–869 | 826–854 | none — identical |
| 17 | `isTypeEditor` | 871–957 | 856–942 | none — identical |
| 18 | `isMcpTokens` | 959–1006 | 944–991 | none — identical |
| 19 | `isBuilder` | 1013–1093 | 998–1078 | none — identical |
| 20 | **`isAccount`** | 1486–1566 | 1471–1529 | **changed** — `+22` lines: a new Appearance card |
| 21 | **`isHelp`** | 1638–1718 | 1601–1653 | **changed** — restructured: sidebar, topics tree, Next |
| 22 | `isLegal` | 1720–1755 | 1655–1690 | none — identical |
| 23 | `isInvite` | 1757–1795 | 1692–1730 | none — identical |
| 24 | `isMcpAuth` | 1797–1842 | 1732–1777 | none — identical |
| 25 | `isNotFound` | 1844–1862 | 1779–1797 | none — identical |

### What each of the six changed, in its own words

Quoted old → new, both sides cited. `⟦…⟧` marks elision. **The new-side quotes are the bundle's own
spelling, verbatim** — so `sc-camel-view-box` and `sc-raw-select` appear below exactly as they do in the
file, and every quoted line can be grepped at the cited line. (The *normalisation* described above is
what the comparison ran on; it is not what is quoted here.)

**2 · `isSignIn`** — `desktop.dc.html@c9f852a2c243:161` → `@6d7b67c0a52c:165`

```
- <img src="./apps/web/public/google-mark.svg" alt="" width="18" height="18">
+ <svg xmlns="http://www.w3.org/2000/svg" sc-camel-view-box="0 0 48 48" width="18" height="18"
+      aria-hidden="true" style="flex:none"><path fill="#4285F4" d="M45.12 24.5c0-1.56…">⟦4 paths⟧</svg>
```

The old mark was an `<img>` pointing at `./apps/web/public/google-mark.svg` — **a path the bundle does
not carry**, so the old copy was only complete beside a file the export does not supply. The refresh
inlines the same four-path mark, which is what `PROVENANCE.md` cites as the reason `--mobile-entry 1`
was chosen for `mobile.dc.html`: the two exports made the same change to their own `isSignIn`.

**5 · `isWork`** — `@c9f852a2c243:319` and `:341` → `@6d7b67c0a52c:323` and `:345`

```
- <h1 …>Sprint 14</h1>
+ <h1 …>{{ projectTitle }}</h1>

- <p …>Workflow &middot; <a href="#" onClick="{{ goWorkflows }}"><strong …>Delivery v4</strong></a> · {{ shownCount }}</p>
+ <p …>Workflow · <a href="#" sc-camel-on-click="{{ goWorkflows }}"><strong …>{{ wfPick }}</strong></a> · {{ shownCount }}</p>
```

The refresh *added bindings* where the old export hardcoded copy — it now shows that the project title
and the workflow name are data. The `<select value="{{ wfPick }}">` at `@6d7b67c0a52c:328` is **not** new
(it is `@c9f852a2c243:324` unchanged); only the two literals moved.

**12 · `isMembers`** — `@6d7b67c0a52c:679` and `:687`, plus the gate at `:718`/`:722`

```
- <select value="{{ m.role }}" onChange="{{ m.setRole }}" …>⟦Owner/Admin/Member/Guest⟧</select>
+ <sc-if value="{{ m.canEditRole }}">                        ⟦@6d7b67c0a52c:679⟧
+   <select value="{{ m.role }}" onChange="{{ m.setRole }}" …>⟦Owner/Admin/Member/Guest⟧</select>
+ </sc-if>
+ <sc-if value="{{ m.cannotEditRole }}">                     ⟦@6d7b67c0a52c:687⟧
+   <span …>{{ m.role }}</span>
+ </sc-if>
```

and, above the invitation panel:

```
+ <sc-if value="{{ inviteAdminOnly }}">                      ⟦@6d7b67c0a52c:718⟧
+   <p …>{{ inviteAdminOnly }}</p>
+ </sc-if>
+ <sc-if value="{{ isInviteAdmin }}">                        ⟦@6d7b67c0a52c:722⟧
```

`isInviteAdmin` (`:722`) is what makes `isInviteAdmin` (`@6d7b67c0a52c:722-796`) a *sub-block of
`isMembers`* rather than a screen of its own — the invitation panel is nested inside the members screen,
reaching its 796 close and then closing `isMembers` at 798.

**13 · `isInviteAdmin`** — new block, `@6d7b67c0a52c:722-796`. An invitation panel: heading, the
"to this workspace only" note, `{{ inviteRows }}` with per-row `{{ i.revoke }}`, a `{{ noInvites }}`
empty state, and an invite form (`{{ inviteEmail }}`, `{{ inviteChannel }}`).

**20 · `isAccount`** — `+22` lines inserted at `@6d7b67c0a52c:1503-1525`. A new **Appearance** card:
`<h2 …>Appearance</h2>` at `:1507`, a `{{ acctStyles }}` segmented control (`:1511`), `{{ acctStyleNote }}`,
a `{{ acctThemes }}` segmented control, and the note at `:1525` — *"Appearance is per device, not per
workspace — nobody else sees your choice."*

**21 · `isHelp`** — an `<aside>` opened at `@6d7b67c0a52c:1640` and closed at `:1669` carries the new
navigation:

```
- <div style="flex:1;min-height:0;display:flex;justify-content:center;padding:0 32px 32px;…">
+ <div style="flex:1;min-height:0;display:flex;align-items:stretch;…">
+   <aside style="width:274px;flex:none;…">⟦tabs + a "Topics" accordion over {{ helpGroups }} (:1648)⟧</aside>
+   <div style="flex:1;min-width:0;min-height:0;overflow:auto;…">
```

with the two old navigation blocks removed from the body — the `{{ helpTabs }}` segmented control
(`@c9f852a2c243:1633`) and the `{{ helpToc }}` nav (`@c9f852a2c243:1639`) — a `{{ helpSectionGroup }}`
eyebrow added above the section title (`@6d7b67c0a52c:1702`), and a "Next" footer added:

```
+ <sc-if value="{{ helpNext }}">                             ⟦@6d7b67c0a52c:1709-1712⟧
+   <div …><span …>Next</span><a href="#" onClick="{{ helpNextGo }}" …>{{ helpNextLabel }}</a></div>
+ </sc-if>
```

**`style-hover` is NOT confined to `isHelp`.** It appears three times in the whole file — `:110` (the
**navigation bar**, inside `hasNav`), `:1650` and `:1660` (help) — and the old export has **none**. So the
refresh introduced a hover spelling that did not exist before, and one of the three sites sits outside all
25 screen blocks. Said plainly because the tempting summary — "only `isHelp` uses it" — is false.

---

## The largest change in this refresh is not in any of the 25 blocks: the token layer moved

Every per-screen framing above — including the Part 0b table's — misses this. The refresh rewrote the
`<style>` block at the top of the export (`@6d7b67c0a52c:13-98`), and those variables are what every
screen renders through. Five distinct movements:

| # | what | old (`@c9f852a2c243`) | new (`@6d7b67c0a52c`) |
|---|---|---|---|
| T1 | light accent | `--accentPick:#3A6DB0` (`:17`) | `--accentPick:#33629F` (`:18`) |
| T2 | `--accent` alias | `:root` (`:17`) | moved to `body{--accent:var(--accentPick,#33629F)…}` (`:83`) |
| T3 | light tints | `0.13 / 0.20 / 0.12 / 0.13 / 0.13` (`:20-22`) | `0.07 / 0.10 / 0.07 / 0.07 / 0.07` (`:21-23`) |
| T3 | dark tints | `0.14 / 0.14 / 0.13 / 0.14 / 0.13` (`:40-42`) | `0.10 / 0.10 / 0.10 / 0.10 / 0.10` (`:41-43`) |
| T4 | `--tintAccent` | `rgba(58,109,176,0.14)` — literal | `color-mix(in srgb, var(--accent) 7%, transparent)` — **derived** |
| T5 | neo light selector | `body[data-style="neo"]` (`:53`) | `body[data-theme="light"][data-style="neo"]` (`:54`) |
| T5 | neo light surfaces | `#EDE4DB` (`:54-60`) | `#F1EAE3` (`:55-63`) |
| T5 | neo light semantics | *(unset — inherited the `:root` values)* | `--danger:#9E2A20`, `--warning:#8C4708`, `--pink:#9A3054`, `--success:#25644A`, `--purple:#413F7C` (`:57-58`) |

**Checked with a second, unrelated instrument.** Rather than a line diff, the two `<style>` blocks were
parsed into `{(selector, variable): value}` maps and the maps compared. It reproduces every row above and
finds nothing further — 136 declarations old, 142 new, **69 of them differing**, and every one accounted
for by T1–T5. It also settles two things the line diff left implicit: the **neo-dark** block
(`body[data-theme="dark"][data-style="neo"]`) is **untouched**, so only the light-neo arm moved; and the
light-neo block did not lose its shadows, radii or fills — those declarations were *relocated* to the new
selector with identical values (`--cardR:20px`, `--chipPad:5px 12px`, both neumorphic shadow pairs). What
actually changed in it is the surface hex and the five new semantic colours.

Three consequences worth naming:

- **T3 halves every tint.** Every danger/warning/success wash in the product — chips, pills, banners,
  the invitation banner's warning surface — is drawn from these. A halved alpha is a visible change on
  every screen at once, which is precisely why a per-screen audit cannot see it.
- **T5's selector change is behavioural, not cosmetic — and it does NOT port as written.** In the
  export, `body[data-style="neo"]` matched whenever the style was neo, whatever the theme; the new
  `body[data-theme="light"][data-style="neo"]` matches **only when `data-theme` is exactly `"light"`**.
  The product runs the opposite convention: light is the **absence** of the attribute. Its theme stamp
  sets `dataset.theme` only when a stored value is present —
  `if(stored==='light'||stored==='dark'){document.documentElement.dataset.theme=stored;}`,
  with nothing written otherwise (`apps/web/app/layout.tsx:25`) — and its token emitter is built on that:
  dark is `[data-style="X"][data-theme="dark"]` plus
  `@media (prefers-color-scheme: dark){ [data-style="X"]:not([data-theme="light"]) }`
  (`packages/ui/src/tokens.ts:1304-1312`), a pair whose emission order the file calls
  *"load-bearing, not cosmetic"* (`:1281`). **So adopting the prototype's selector verbatim would drop
  the entire light-neo token set for every user who has never chosen a theme — which is the default
  state.** The prototype's *intent* (make the light-neo block explicit) is already served on the product
  side by a different, documented mechanism; this is a place where the port must **not** be literal.
- **T4 makes `--tintAccent` depend on `--accent`.** Anything that overrides `--accent` now moves
  `--tintAccent` with it; the old literal did not track.

### And the product is on the old values

| prototype token | product equivalent | product value | refreshed prototype |
|---|---|---|---|
| `--accentPick` | `blue600` — `packages/ui/src/tokens.ts:95` | `#3a6db0` | `#33629F` |
| neo light surface | `neoPaper` — `packages/ui/src/tokens.ts:151` | `#ede4db` | `#F1EAE3` |
| light `--tintWarning` | `tintWarmWarning` — `packages/ui/src/tokens.ts:281` | `#f07c3433` (α 0.20) | α 0.10 |
| dark `--tintWarning` | `tintNavyWarning` — `packages/ui/src/tokens.ts:282` | `#f7a96124` (α 0.141) | α 0.10 |

Corroborated where a test pins it: `apps/web/e2e-viewport/responsive.spec.ts:1939` asserts the neo
`surfaceSunken` is `#ede4db` and `packages/ui/src/ui.css:3440` says the same in prose. So the drift is not
inferred from a missing grep — the product states its own value, and it is the pre-refresh one.

**This is a `wire-gap` in kind, not a `port`.** `packages/ui/src/tokens.ts` is not a stylesheet: it is a
palette of base hues (`:95`, `:144-153`) plus a derivation engine with declarative `CONTRAST_PAIRS`
rows and docblocks recording which roles were *derived* rather than taken from the export
(`textAccentLight` `:378`, `textAccentDark` `:402`). Moving `blue600` or `neoPaper` re-derives every
dependent role and must re-clear the contrast floors. **The honest unit of work is "re-run the token
derivation", not "change two hexes"** — and it is the one item in this audit that touches every screen
in the product.


---

## Per screen: block → route → product gap → verdict

*(sections are assembled in the delta table's block order; batch A below covers blocks 2, 3, 4, 23, 24)*

### `isSignIn` — `desktop.dc.html@6d7b67c0a52c:120-178`
**Product route(s) + files.** `/sign-in` → `apps/web/app/sign-in/page.tsx:18` (boundary) + `:153` (`SignInForm`).
**Prototype delta (old→new).** The one change, confirmed independently of the mechanical pass:
- `desktop.dc.html@c9f852a2c243:161` — `<img src="./apps/web/public/google-mark.svg" alt="" width="18" height="18">`
- `desktop.dc.html@6d7b67c0a52c:165` — `<svg xmlns="http://www.w3.org/2000/svg" sc-camel-view-box="0 0 48 48" width="18" height="18" aria-hidden="true" style="flex:none"><path fill="#4285F4" d="M45.12 24.5…">…</svg>`

  **The new element's four `d` values and viewBox are byte-identical to the asset the product already ships** (`apps/web/public/google-mark.svg:2-5`) — the same file the old `<img>` pointed at. The refresh changed the prototype's *authoring form*, not the rendered mark.
**Product gap (new prototype → product).**
- *structure:* `matches` — the product renders the same four paths from the same asset: `apps/web/app/sign-in/page.tsx:462` (`<img src="/google-mark.svg" alt="" width={18} height={18} />`). The product **cannot adopt the inline form in place**: `apps/web/app` is a scanned root (`packages/ui/test/helpers/colour-scan.ts:CLIENT_SOURCE_ROOTS`) and the asset's own docblock records the measurement — `findColourLiterals(..., 'script')` reports `["#4285F4"]` for the exact string `<path fill="#4285F4" …/>` (`apps/web/public/google-mark.svg:7-12`, restated at `apps/web/app/sign-in/page.tsx:135-138`).
- *strings:* `matches` for the hint — `apps/web/app/sign-in/page.tsx:377` is verbatim `desktop.dc.html@6d7b67c0a52c:158`.
- *tokens:* `matches` by translation — `--brand`/`--onColor` → `--gn-brand`/`--gn-text-inverted` (`packages/ui/src/ui.css:3588-3590`); `--cardBg`/`--cardR`/`--cardShadow` → `--gn-surface-raised`/`--gn-radius-card`/`--gn-shadow-raised` (`packages/ui/src/ui.css:160-165`); `min-width:56px;min-height:44px` → `min-width: 3.5rem; min-height: 2.75rem` (`apps/web/app/globals.css:1831`). Apple's mark matches shape-for-shape: `apps/web/app/sign-in/page.tsx:147` `viewBox="0 0 24 24" fill="currentColor"` = `desktop.dc.html@6d7b67c0a52c:168`.
- Standing **pre-refresh** divergences, not caused by this refresh: no `linkSent` success block (prototype `:137-147`) — the product renders one line, `Check your inbox — the link signs you in.` (`apps/web/app/sign-in/page.tsx:373`); no "Open the link"/"Use a different address" (0 hits); the error is a card-foot `role="alert"` (`:484-488`) not an inline field line (prototype `:155-157`); the product adds a full phone form (`:303-351`) where the prototype's Phone tab only fires `phoneRefused` (`:128`); the product adds a passkey button (`:429`).
**Port verdict.** `none` — the refresh's only delta is a mark the product already draws identically from the same asset. Nothing here is portable.

### `isWorkspaces` — `desktop.dc.html@6d7b67c0a52c:180-235`
**Product route(s) + files.** `/workspaces` → `apps/web/app/workspaces/page.tsx:22`; card `:246-329`; invitation banner `:411-560`; founding form `:584-636`.
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites`.
**Product gap (new prototype → product).**
- *structure:* `matches` — card as one door (`apps/web/app/workspaces/page.tsx:268-272`), avatar `:277`, name `:279`, chips `:291`, role sentence `:297`, project line + chevron `:304-319` (path `m9 6 6 6-6 6` = prototype `:203`); banner `:482-503` = prototype `:210-218`; founding form `:609-628` = prototype `:225-232`.
- *strings:* three divergences. (a) the card meta line is the project count alone — `projectCountLine(live.length)` (`apps/web/app/workspaces/page.tsx:286`) versus `"N members · M projects"` (`desktop.dc.html@6d7b67c0a52c:2734`), argued at `apps/web/app/workspaces/page.tsx:280-284` ("the members chip below already says the member count … would say it twice on one card"). (b) chips differ: product `N members` / `N active` / `N blocked` / `N archived` (`:174-183`) vs prototype `N tickets` (accent) / `N blocked` (danger) / `Restricted` (`:2727-2729`). (c) the summary loses the prototype's full stop — `:66` ends `… you belong to` vs prototype `… you belong to.` (`:2719`).
- *tokens:* `matches` — `--tintWarning` → `background: var(--gn-tint-warning)` (`apps/web/app/globals.css:1315`); `var(--warning)` → `color: var(--gn-warning)` (`:1327`); chip dots → `--gn-category-*`/`--gn-blocked`/`--gn-restricted` (`packages/ui/src/ui.css:152-158`).
**Port verdict.** `held` — no refresh delta; the meta-line and chip compositions are already-decided product deviations with their reasoning in the file.

### `isWorkspace` — `desktop.dc.html@6d7b67c0a52c:237-316`
**Product route(s) + files.** `/w/[workspaceId]` → `apps/web/app/w/[workspaceId]/page.tsx:170`; `WorkspaceHome` `:589-767`; `ProjectCard` `:364-430`; `WorkspaceLinks` `:517-587`.
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites`.
**Product gap (new prototype → product).**
- *structure:* four absences. (a) the header's `Members`/`Settings` buttons (prototype `:246-249`) are gone, documented at `apps/web/app/w/[workspaceId]/page.tsx:663-669`; header now `:651-670`. (b) `ProjectCard` renders no description and no chips — the prototype's `{{ p.desc }}`/`p.chips` (`:283-285`) have no source: `ProjectRef` carries `{id,name,archived,ticketCount,blockedCount}` only (`packages/app-core/src/view-types.ts:15-23`) — **WIRE GAP: project description and per-project chips**. (c) the card's `{{ p.openLabel }}` door button (`:288`) is removed (`apps/web/app/w/[workspaceId]/page.tsx:326-336`); only `Archive`/`Restore` survives (`:411-426`). (d) the whole `Workspace` card — rename field, role note, `Delete this workspace` (prototype `:301-314`) — has no counterpart: `Delete this workspace` / `deleteWs` / `renameWs` over `apps/web/app`, `apps/web/src`, `packages/app-core/src` = 0 hits. Rename ships as `workspace.renamed` (`packages/domain/src/vocabulary.ts:65`) but is UI-only; **WIRE GAP: no delete event exists** (`workspace.deleted` = 0 hits in `packages/domain/src`, `apps/server/src`).
- *strings:* the links nav is four, not five — prototype `wsLinks` lists `MCP tokens` (`:2711`), removed at `apps/web/app/w/[workspaceId]/page.tsx:576-584`; first label differs, prototype `"My work"` (`:2707`) vs product `My Work` (`:538`). The archived control's visible text matches (`:699`); the archived-empty case renders nothing (`:692`, prototype `:254`).
- *tokens:* `matches` — `--cardBg`/`--cardShadow`/`--cardR` → `--gn-surface-raised`/`--gn-shadow-raised`/`--gn-radius-card` (`packages/ui/src/ui.css:160-165`); `{{ wsAvatarStyle }}` → `.gn-avatar--large` 3.5rem/0.875rem (`:184`); `--label2` → `--gn-text-muted` (`apps/web/app/globals.css:1205`).
**Port verdict.** `wire-gap` — the rename card and Members/Settings buttons are bounded UI, but the project description/chips and workspace delete have no wire at all.

### `isInvite` — `desktop.dc.html@6d7b67c0a52c:1757-1795`
**Product route(s) + files.** `/invite/[token]` → `apps/web/app/invite/[token]/page.tsx:47`.
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites`.
**Product gap (new prototype → product).**
- *structure:* almost the whole screen. The prototype is a centred 520px column with an icon tile (`:1761-1765`), a summary card of four label/value rows (`:1770-1776`), a "What a member can do" tray (`:1777-1780`) and a Decline/Accept pair (`:1781-1784`). The product is one `Card` with a heading and one paragraph (`apps/web/app/invite/[token]/page.tsx:88-124`): no icon, no summary rows, no tray, and **no Decline** — declining exists only on the other page (`apps/web/app/workspaces/page.tsx:539-546`).
- *strings:* heading `Join Garo Hills Logistics` (`desktop.dc.html@6d7b67c0a52c:1769`) vs `Gisik Nokma` (`apps/web/app/invite/[token]/page.tsx:89`); body `Anjali invited you to a workspace on Gisik Nokma.` (`:1770`) vs `You are invited to join <strong>{workspaceName}</strong> as {role}.` (`:100-102`); accept `Accept invitation` (`:1784`) vs `Join {invite.workspaceName}` (`:114`); the signed-in-as line (`:1792`) has no counterpart (0 hits).
- *tokens:* `matches` where they overlap — `--cardBg/--cardR/--cardShadow` → `--gn-surface-raised`/`--gn-radius-card`/`--gn-shadow-raised` (`packages/ui/src/ui.css:160-165`); `--accent`/`--onColor` → `--gn-accent`/`--gn-text-inverted` (`:33-40`); `--warning` on the expiry row → `--gn-warning` (`:1331`). The prototype's `--trayBg` tray and `--fill1` inviter avatar have no consumer here (`--fill4` → `--gn-fill-quaternary`, `apps/web/app/globals.css:1211`).
- **WIRE GAP:** the token read carries three fields — `{workspaceId, workspaceName, role}` (`packages/app-core/src/online/invites.ts:3-7`). Missing: inviter name and address, member count, invitation expiry. (Inviter name and expiry exist on the *other* read, `PendingInvitation` at `packages/app-core/src/online/my-invitations.ts:14-22`, but that is the caller-scoped list behind `/workspaces`, not the token read.)
**Port verdict.** `wire-gap` — the prototype draws four data rows the invite-token payload does not carry.

### `isMcpAuth` — `desktop.dc.html@6d7b67c0a52c:1797-1842`
**Product route(s) + files.** `/mcp/authorize` → `apps/web/app/mcp/authorize/page.tsx:206` (boundary) + `:67` (`AuthorizeScreen`).
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites`.
**Product gap (new prototype → product).**
- *structure:* the two tiles and the `↔` glyph (`:1801-1805`) are absent — the product is a heading plus one `Card` (`apps/web/app/mcp/authorize/page.tsx:114-197`). The scope list (`:1815-1825`) has no counterpart (`mcpScopes` = 0 hits). The prototype **displays** the code with a `New code` button (`:1828-1833`); the product **asks the person to type** it (`:154-178`). The prototype has a `Deny` button (`:1837`); the product has no deny path at all. The prototype's revoke footer link (`:1839`) has no counterpart — revoke is a separate route (`apps/web/app/mcp/tokens/page.tsx:4`) and this page links to nothing. The product has three branches the prototype does not draw: `loading`, `signed-out`, `approved` (`:118-139`).
- *strings:* `Let Claude Desktop use Gisik Nokma?` (`desktop.dc.html@6d7b67c0a52c:1808`) vs `Connect an assistant` (`apps/web/app/mcp/authorize/page.tsx:115`); `It will act as Anjali Kharkongor in Meghalaya Rollout.` (`:1809`) vs `An assistant that acts as <strong>as {actingAs(session.user.name)}</strong>, with exactly your permissions.` (`:147-152`). The product's per-code refusals (`:94-106`) have no prototype analogue.
- *tokens:* `matches` for the consent surface — `--trayBg` maps to the product's chosen `--gn-surface-sunken`, argued at `apps/web/app/mcp/authorize/page.tsx:37-42`; the code field's monospace/spacing maps to `.gn-mcp-authorize__input` (`apps/web/app/globals.css:2140`).
- **WIRE GAP:** the device-code mint returns exactly `{deviceCode, userCode, verificationUri, expiresInSec, pollIntervalSec}` (`apps/server/src/routes/mcp-device.ts:65-74`) — no scopes, no client name, no workspace, and no way for the approving page to read the grant's `userCode`. The registered routes are `code` (`:60`), `approve` (`:78`) and `token` (`:105`); **there is no deny route**, so the prototype's Deny button is unsatisfiable on this wire.
**Port verdict.** `wire-gap` — scopes, client identity, the displayed code and deny all need server contract changes before any of this block can be drawn.

---

## The queue

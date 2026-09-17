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
`git show 6d7b67c0a52c > /tmp/new.dc.html` (or `c9f852a2c243` for the old file). Task and product
citations are `path:line` at the branch tip.

---

## The queue

**Row 0 is the one item that is not a screen and not optional.** The refresh moved the design tokens
under all 25 blocks (§ *The largest change*), so it precedes everything else: porting a screen to the new
prototype while the tokens stay old ports it to a target that no longer exists.

Ordering below is biggest-owner-visible-change first, with the **Members family and `isInviteAdmin` last**
— they sit under the owner hold on the sign-in look unless the owner lifts it. `isListView` is marked
🟢 **done** (#419).

**Read the verdicts with one fact in hand: on at least two screens the export is catching up to the
product, not ahead of it.** `/account` was ported on **2026-09-15** (`3bb823dc`, *"/account: port the
screen from the DESKTOP prototype, not the mobile one"*) and `/help` on **2026-09-15** (`7cce93e2`,
*"/help takes the prototype's surfaces, its 17px body and its third text dimness"*) — **three days before
this export was made.** So when the 2026-09-18 `isAccount` card and `isHelp` sidebar are checked against
the product, they match: the owner refreshed the prototype from work that had already shipped. That
inverts the dispatch's premise for those screens (*"every screen the product has is to be brought to the
refreshed prototype"*) — here the prototype was brought to the product. It also means **a "CHANGED"
verdict in the delta table is not by itself evidence of outstanding work**; it is evidence that the two
artefacts differ, and the direction has to be established per screen.

| # | screen | verdict | size | product files | proposed order |
|---|---|---|---|---|---|
| — | **TOKENS (every screen)** | **wire-gap** | **L** | `packages/ui/src/tokens.ts` (`:95`, `:151`, `:281`, `:282`); emitter `themeStylesheet()` `:1292-1315` | **1** |
| 20 | `isAccount` | **none** | — | `apps/web/src/account/appearance-section.tsx:24-35` | already ships (`3bb823dc`, 2026-09-15) |
| 21 | `isHelp` | **none** | — | `packages/app-core/src/help/help-browser.tsx:463, 511-579` | already ships (`7cce93e2`, 2026-09-15) |
| 12 | `isMembers` | **held** | L | `packages/app-core/src/online/mappers.ts:405-408` drops `role` | owner hold; needs wire first |
| 13 | `isInviteAdmin` | **held** | S | `apps/web/app/w/[workspaceId]/members/page.tsx:202-210` | owner hold; panel exists, gate does not |
| 9 | `isTimelineView` | *pending* | | | |
| 10 | `isMyWork` | *pending* | | | |
| 11 | `isInbox` | *pending* | | | |
| 14 | `isSettingsShell` | *pending* | | | |
| 15 | `isTypes` | *pending* | | | |
| 16 | `isWorkflows` | *pending* | | | |
| 17 | `isTypeEditor` | *pending* | | | |
| 18 | `isMcpTokens` | *pending* | | | |
| 19 | `isBuilder` | *pending* | | | |
| 22 | `isLegal` | *pending* | | | |
| 25 | `isNotFound` | *pending* | | | |
| 23 | `isInvite` | wire-gap | M | `apps/web/app/invite/[token]/page.tsx`; `packages/app-core/src/online/invites.ts:3-7` | |
| 24 | `isMcpAuth` | wire-gap | L | `apps/web/app/mcp/authorize/page.tsx`; `apps/server/src/routes/mcp-device.ts:60,78,105` | |
| 4 | `isWorkspace` | wire-gap | M | `apps/web/app/w/[workspaceId]/page.tsx`; `packages/app-core/src/view-types.ts:15-23` | |
| 3 | `isWorkspaces` | held | — | `apps/web/app/workspaces/page.tsx` | |
| 5 | `isWork` | held | — | `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1202` | |
| 1 | `isMobileDevice` | none | — | responsive shell, three media queries | |
| 2 | `isSignIn` | none | — | `apps/web/app/sign-in/page.tsx:462` | |
| 6 | `isBoardView` | none | — | `packages/app-core/src/views/board.tsx` | |
| 7 | `isListView` | 🟢 **done** (#419) | — | `packages/app-core/src/views/ticket-list.tsx` | |
| 8 | `isCalendarView` | none | — | `packages/app-core/src/calendar/calendar-view.tsx` | |

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
| boolean attribute | `data-dc-script` | `data-dc-script=""` |

The fifth row was found last, while checking that a component *outside* the 25 blocks (the `hasToast`
overlay, `@6d7b67c0a52c:1864`) had not been missed — it is byte-identical apart from that one attribute
form, which is why it took a direct block-to-block diff to see. **The six-block result above is stable
with it normalised**: re-running with all five rewrites gives `isSignIn` 2, `isWork` 4, `isMembers` 23,
`isInviteAdmin` new, `isAccount` 22, `isHelp` 54 — still six of 25.

Every block was extracted whole (opening `<sc-if>` to its matching `</sc-if>` at equal indent), the five
rewrites above were undone **on both sides**, and the normalised texts were diffed.

**Completeness — nothing was left unexamined.** A per-block diff can only speak for the blocks it was
given, and the 25-screen framing is itself a choice, so the whole file was also diffed once and every
changed line attributed to a region. The result is a total partition: `STYLE` 40 lines, `isHelp` 54,
`isMembers` 23, `isAccount` 22, `isWork` 4, `isSignIn` 2, the shell's one nav line 2, and the
data/script tail 428 — **and no other region has a single changed line.** The three largest buckets are
the three this document already analyses (the token layer, the data-layer additions, `isHelp`). Two
caveats, stated so the numbers are not read as more than they are: the region counts come from a
*whole-file* diff and so carry alignment artifacts wherever blocks shifted (the data tail's 428 includes
the relocations the per-block pass resolves properly), and the tail's real additions are enumerated in
`isAccount`/`isHelp`/the token section rather than counted here. **This is what establishes that a
component outside the 25 blocks — the `hasToast` overlay at `:1864-1875`, present in both exports and
byte-identical but for the fifth rewrite — was not silently skipped.**

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

*(sections are assembled in the delta table's block order; batch A covers blocks 2, 3, 4, 23, 24 and batch B blocks 1, 5, 6, 7, 8)*

### `isSignIn` — `desktop.dc.html@6d7b67c0a52c:120-178`
**Product route(s) + files.** `/sign-in` → `apps/web/app/sign-in/page.tsx:18` (boundary) + `:153` (`SignInForm`).
**Prototype delta (old→new).** The one change, confirmed independently of the mechanical pass:
- `desktop.dc.html@c9f852a2c243:161` — `<img src="./apps/web/public/google-mark.svg" alt="" width="18" height="18">`
- `desktop.dc.html@6d7b67c0a52c:165` — `<svg xmlns="http://www.w3.org/2000/svg" sc-camel-view-box="0 0 48 48" width="18" height="18" aria-hidden="true" style="flex:none"><path fill="#4285F4" d="M45.12 24.5…">…</svg>`

  **The new element's four `d` values and viewBox are byte-identical to the asset the product already ships** (`apps/web/public/google-mark.svg:2-5`) — the same file the old `<img>` pointed at. The refresh changed the prototype's *authoring form*, not the rendered mark.
**Product gap (new prototype → product).**
- *structure:* `matches` — the product renders the same four paths from the same asset: `apps/web/app/sign-in/page.tsx:462` (`<img src="/google-mark.svg" alt="" width={18} height={18} />`). The product **cannot adopt the inline form in place**: `apps/web/app` is a scanned root (`packages/ui/test/helpers/colour-scan.ts:CLIENT_SOURCE_ROOTS`) and the asset's own docblock records the measurement — `findColourLiterals(..., 'script')` reports `["#4285F4"]` for the exact string `<path fill="#4285F4" …/>` (`apps/web/public/google-mark.svg:7-12`, restated at `apps/web/app/sign-in/page.tsx:135-138`).
- *strings:* `matches` for the hint — `apps/web/app/sign-in/page.tsx:377` renders identical text to `desktop.dc.html@6d7b67c0a52c:158` (*"We'll email you a link that signs you in. It expires in 15 minutes."*). Identical **as rendered**, not byte-for-byte as source: the product writes the apostrophe `&rsquo;`, the prototype the literal `’`.
- *tokens:* `matches` by translation — `--brand`/`--onColor` → `--gn-brand`/`--gn-text-inverted` (`packages/ui/src/ui.css:3587-3588`); `--cardBg`/`--cardR`/`--cardShadow` → `--gn-surface-raised`/`--gn-radius-card`/`--gn-shadow-raised` (`packages/ui/src/ui.css:160-165`); `min-width:56px;min-height:44px` → `min-width: 3.5rem; min-height: 2.75rem` (`apps/web/app/globals.css:1831`). Apple's mark matches shape-for-shape: `apps/web/app/sign-in/page.tsx:147` `viewBox="0 0 24 24" fill="currentColor"` = `desktop.dc.html@6d7b67c0a52c:168`.
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

### `isMobileDevice` — `desktop.dc.html@6d7b67c0a52c:103-105`
**Product route(s) + files.** `NO PRODUCT COUNTERPART` for a distinct mobile screen. The product has one responsive shell at the same route the other four blocks live on — `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` — narrowing in place via `@media (max-width: 60rem)` (`apps/web/app/globals.css:190`), `@media (max-width: 47.9375rem)` (`packages/ui/src/ui.css:3190`) and `@media (max-width: 40rem)` (`packages/ui/src/ui.css:3350`), measured at 390/768/1512 in `apps/web/e2e-viewport/responsive.spec.ts:23`.
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites` (the `sc-if` + `<dc-import>` markup is the same on both sides; only the OLD 99 / NEW 103 offset above it).
**Product gap (new prototype → product).** The prototype swaps the ENTIRE desktop document for a `<dc-import name="Gisik Nokma - Mobile">` when `isMobileDevice` is true (`:104`). The product never branches on device — one DOM, narrowed by the three media queries above. That is a recorded product strategy, not a refresh item. No strings, no tokens.
**Port verdict.** `none`.

### `isWork` — `desktop.dc.html@6d7b67c0a52c:318-552`
**Product route(s) + files.** `/w/[workspaceId]/p/[projectId]` — `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`; all four nested views below render inside it. Title class `.gn-project__title` at `packages/ui/src/ui.css:3658`.
**Prototype delta (old→new).** CONFIRMED, both fragments, exactly as recorded above: OLD `:319` `Sprint 14` → NEW `:323` `{{ projectTitle }}`, and OLD `:341` `Delivery v4` → NEW `:345` `{{ wfPick }}`. The `<select>` is **not** new: OLD `:324` `<select value="{{ wfPick }}" …>` → NEW `:328` `<sc-raw-select value="{{ wfPick }}" sc-camel-on-change="{{ setWfPick }}" …>` — same binding, same `sc-for list="{{ wfOptions }}"`, only the form rewrites.
**Product gap (new prototype → product).**
- *structure:* title row `matches` — prototype `:323` → `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1202` (`{projectName !== null ? <h1 className="gn-project__title">{projectName}</h1> : null}`); crumb `:320` → `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1199-1201`.
- *structure:* the `Workflow · <name> · <count>` meta line is **not present** — `grep` for `Workflow ·` over `apps/web/app`, `packages/app-core/src`, `packages/ui/src` = 0 hits. Its two facts exist only as a `<select>` gated on more than one workflow (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1297-1311`) and a count inside the narrowing strip, which renders only when narrowed (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1545`). The prototype's unnarrowed arm (`desktop.dc.html@6d7b67c0a52c:2767`, `all.length + " tickets"`) has no counterpart, nor does the `goWorkflows` link (`:345`).
- *strings:* `{projectTitle}` = `projectName` (`:2762`) → `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:1202` `matches`. `{wfPick}`'s default `"Delivery v4"` (`:2783`) has no product equivalent — the product defaults to `'all'` by **Ruling 20(b)** (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:377`, `:912`).
- *tokens:* `matches` — the inline `font-size:34px;line-height:41px;font-weight:700;letter-spacing:-0.4px` ≡ `.gn-project__title` `{ font-size: 2.125rem; line-height: 2.5625rem; font-weight: 700; letter-spacing: -0.025rem; }` (`packages/ui/src/ui.css:3658`); `--label2` → `--gn-text-muted` on the crumb.
**Port verdict.** `held` — both binding substitutions are already live in the product; the unported meta line is a recorded ruling, not a refresh item.

### `isBoardView` — `desktop.dc.html@6d7b67c0a52c:358-403`
**Product route(s) + files.** `packages/app-core/src/views/board.tsx` (`Board`, `BoardGroupSection`, `BoardCardView`, `MoveArrows`); rendered by `page.tsx` (board arm); styles `.gn-board__*` at `packages/ui/src/ui.css:310-440`.
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites`.
**Product gap (new prototype → product).**
- *structure:* column header is a **pre-existing ruled deviation** — the prototype renders `{{ col.name }}` as a 17px `<p>` (`:366`) with a separate `col.blockedChip` pill; the product renders `<Chip tone={column.blocked ? 'blocked' : column.category}>{column.name}</Chip>` plus a count (`packages/app-core/src/views/board.tsx:414-416`), **Ruling 14** recorded at `packages/ui/src/ui.css:359-367`, blocked state riding **Ruling 16**'s tone (`ui.css:357-364`).
- *structure:* empty column `matches` in substance — prototype `:381-388` → `packages/app-core/src/views/board.tsx:473-475` (`EMPTY_COLUMN_COPY` at `packages/app-core/src/views/board.tsx:168` + `<Button onClick={onCreateTicket}>Add a ticket</Button>`).
- *structure:* the prototype's `{{ t.chips }}` (`:375`) and `{{ t.meta }}` (`:377`) have **no wire fields** — **WIRE GAP**: `BoardCard` (`packages/app-core/src/view-types.ts:106-116`) is `{ticketId, title, typeId, assignee, stateProvenance, cause, rollup, pending}` with no `chips` array and no `meta` string. The product substitutes real per-card chips and `formatRollup` progress (`packages/app-core/src/views/board.tsx:743-771`).
- *structure:* extra product element — `MoveArrows` renders a `Close` button for terminal columns (`packages/app-core/src/views/board.tsx:1420-1451`), a recorded §5.2 addition.
- *strings:* `matches` — `'Add a ticket'` `:387` → `packages/app-core/src/views/board.tsx:475`; empty copy `{{ col.emptyText }}` → `packages/app-core/src/views/board.tsx:168`/`:473`.
- *tokens:* `matches` — `.gn-board__column` `--gn-surface-sunken` + `--gn-shadow-sunken` + `--gn-radius-card` (`ui.css:326` ff.) against `trayBg`/`trayShadow`/`cardR`; count `ui.css:392`; empty circle `ui.css:397-436`.
**Port verdict.** `none` — no refresh delta; the three visible deltas are ruled pre-existing deviations plus one wire gap.

### `isListView` — `desktop.dc.html@6d7b67c0a52c:405-479`
**Product route(s) + files.** `packages/app-core/src/views/ticket-list.tsx` (`TicketList`, `ListTable`, `ListCell`) via `page.tsx`'s list arm; styles `.gn-list__*` at `packages/ui/src/ui.css:652-963`. Ported by `1a403378` (PR #419, merged `63ffe930`).
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites`.
**Product gap (new prototype → product).**
- *structure:* controls row `matches` — `{{ listCount }}` `:413` → `packages/app-core/src/views/ticket-list.tsx:248` `data-testid="list-summary"`; Group by `:414-419` → `packages/app-core/src/views/ticket-list.tsx:280-291` (`Select aria-label="Group by"`); `{{ columnsCaret }} Columns` `:421` → `:296` `.gn-list__columns-toggle` (caret in CSS; accessible name stays "Columns").
- *structure:* columns tray, container, band and rows all `match` — `{{ columnToggles }}` `:415-418` → `packages/app-core/src/views/ticket-list.tsx:353`; container `:425-427` → `.gn-list__table-wrap` (`ui.css:995-1000`, `.gn-list__table { min-width: 51.25rem; }`); thead `:449` → `ListTable` (`packages/app-core/src/views/ticket-list.tsx:620-660`); depth indent → `packages/app-core/src/views/ticket-list.tsx:529` `paddingLeft: ${16 + node.depth * 22}px`.
- *structure:* **the no-results block is NOT present** — prototype `:471-477` (`{{ noResults }}`, off `:2932`) renders "Nothing matches those filters" / "…are hidden. Nothing was deleted." / "Clear the filters"; `grep` for all three over the product = 0 hits. This part was outside PR #419's "controls and row table" scope.
- *structure:* **header sorting is NOT ported** — `{{ listHeaders }}` carries a per-key `sort` and draws `↑`/`↓` (`:2809`); `grep -iE "sort|aria-sort"` over `ticket-list.tsx` and `packages/ui/src/components/table.tsx` finds neither a handler nor `aria-sort`.
- *strings:* `matches` — `:413` binding `:2805` `"N ticket(s) · M done"` → `packages/app-core/src/views/ticket-list.tsx:248` region.
- *tokens:* `matches` — `cardBg`/`cardShadow`/`cardR` → `--gn-surface-raised`/`--gn-shadow-raised`/`--gn-radius-card` (`ui.css:995-1000`); `label2`→`--gn-text-muted`, `trayBg`→`--gn-surface-sunken`, `fill4`→`--gn-fill-quaternary`.
- **WIRE GAP:** the prototype's Group-by offers `workflow` and its columns include `Workflow`/`Priority`; the product's `GROUPING_OPTIONS` (`packages/app-core/src/views/ticket-list.tsx:31`) is `['epic','status','assignee','type','flat']` and `AVAILABLE_COLUMNS` (`:32`) is `['status','assignee','dueDate','type','progress']` — 5 of 8. `ListRow` carries no `workflowId` and no `priority`.
**Port verdict.** `none` (already matches). Residue — no-results block, header sorting — is unported but out of the refresh's scope.

### `isCalendarView` — `desktop.dc.html@6d7b67c0a52c:481-508`
**Product route(s) + files.** `packages/app-core/src/calendar/calendar-view.tsx` via `page.tsx`'s calendar arm; styles `.gn-calendar__*` at `packages/ui/src/ui.css:1822-1990`.
**Prototype delta (old→new).** `none — identical after normalising the bundler form rewrites`.
**Product gap (new prototype → product).**
- *structure:* header DOM order differs — prototype `:484-487` is prev `‹` → month → next `›` → Today; product `packages/app-core/src/calendar/calendar-view.tsx:265-288` is prev `:268` → **Today** `:277` → next `:282` → `<h2 class="gn-calendar__month">` `:288`. **Pre-existing** — set by board-prototype-port Task 10, docblock at `:269-272`.
- *structure:* legend — prototype `:489-495` is unconditional with three swatches; product gates it on `model.customDateFields.length > 0` (**Ruling R4**) and renders real named field rows `{field.fieldName} ({field.count})` (`:318`, `--custom` swatch `:328`) plus the two read-only built-ins (`:350`, `:357`). The prototype's generic "Workspace date field" is replaced by named fields — **the product carries strictly more data than the prototype**, so this is not a gap.
- *structure:* extra product element — `+n more` / `show fewer` week folding (`MAX_VISIBLE_PER_WEEK = 4`), not in the prototype.
- *strings:* `matches` — `‹`/`›`/`Today`/`Due date`/`In transit`. The month is an `<h2>` in the product (`:288`) vs a `<p>` in the prototype — a heading-level fix, not a string change.
- *tokens:* `matches` — `--trayBg` grid → `.gn-calendar__grid` `--gn-surface-sunken` + `--gn-radius-card`; nav, weekday heads, today button and the 14×9 radius-3 legend swatch all map (`.gn-calendar__legend-swatch`, `--accent` / `--pending` dashed / `--custom`).
**Port verdict.** `none`.

### `isMembers` — `desktop.dc.html@6d7b67c0a52c:651-798`
**Product route(s) + files.** `/w/[workspaceId]/members` → `apps/web/app/w/[workspaceId]/members/page.tsx:174-213` (the whole screen; roster `:183-190`, gate `:192-211`). No `app-core` view — the page is self-contained.
**Prototype delta (old→new).**
- Role cell, OLD `c9f852a2c243:674-681` → NEW `6d7b67c0a52c:679-689`. OLD `:675` is one bare `<select>`; NEW `:679` wraps it in `<sc-if value="{{ m.canEditRole }}">` (select at NEW `:680`) and NEW `:687` adds `<sc-if value="{{ m.cannotEditRole }}">` → NEW `:688` `<span …>{{ m.role }}</span>`. **Both branches are new**; the old export had no chip and no gate.
- New notice: NEW `:718` `<sc-if value="{{ inviteAdminOnly }}">` → NEW `:719` `<p …>{{ inviteAdminOnly }}</p>`.
- Invite panel relocated: OLD `:709` was an unconditional child of the members column; NEW `:722` `<sc-if value="{{ isInviteAdmin }}">` now wraps it, panel grid at NEW `:723`.
**Product gap (new prototype → product).**
- The **whole roster table is absent**. The product renders names only — `members/page.tsx:185-187` `<li key={member.id} className="gn-members__row">{member.name}</li>` under `<h1 className="gn-page-title">People</h1>` (`:176`).
- **WIRE GAP for `m.role`:** the server carries it (`apps/server/src/routes/builder-reads.ts:247` `SELECT m.user_id, u."name" AS display_name, m.role`; `:259` `role: row.role`) but **the mapper drops it** — `packages/app-core/src/online/mappers.ts:405-408` returns only `{ id: userId, name: displayName }`, and `packages/app-core/src/view-types.ts:3` is `export type Actor = { id: string; name: string };`. So `m.role`, `m.assigned`, `m.seen`, `m.scopeLabel` and the `m.canEditRole`/`m.cannotEditRole` pair are unavailable to the UI. The last two are *derived* in the prototype (`desktop.dc.html@6d7b67c0a52c:3061` `canEditRole: myRoleIsAdmin, cannotEditRole: !myRoleIsAdmin`) and no product read exposes the caller's own role either.
- `memberSummary` (`:655`, data `:3032`) and the ticket-only block (`:700-717`) have no product counterpart. `inviteAdminOnly`'s sentence **does** match verbatim (prototype data `:3057` vs `members/page.tsx:97`), but the product renders it only in the member branch (`:200`, `<p className="gn-members__not-admin">`).
- **The whole `gn-members` family is unstyled, not just that one class — swept, with a control.** A repo-wide `git grep` for `gn-members` returns exactly three hits, all in `apps/web/app/w/[workspaceId]/members/page.tsx`: `:183` (`<ul className="gn-members">`), `:185` (`<li className="gn-members__row">`) and `:200` (`<p className="gn-members__not-admin">`). **There is no rule for any of the three** in `apps/web/app/globals.css` or `packages/ui/src/ui.css`. The control that makes this a swept null rather than a failed grep: the same search finds styled siblings elsewhere in the repo, and this page's own `<h1 className="gn-page-title">` (`:176`) *is* styled — `.gn-page-title` at `apps/web/app/globals.css:127` — so the instrument reaches CSS files, and this family is simply absent from them. The roster list and its rows therefore render with user-agent defaults; only the shared classes around them carry any styling.
- On *"may I change this person's role?"*: the product has **no per-member role control and no per-member role data**. The only role question it asks is the caller's own, asked of the invite door — `members/page.tsx:85-107` (`invitesAdmin.listPending`, 403 → `{kind:'member'}`, anything else → `{kind:'failed'}`), with `:33-35` naming why. The invite panel **does exist here** (`:203-204`), gated by that 403 rather than by `isInviteAdmin`.
**Port verdict.** `held` — under the owner hold, and not a bounded UI change anyway: the role cell needs a wire field the mapper drops.

### `isInviteAdmin` — `desktop.dc.html@6d7b67c0a52c:722-796`
**Product route(s) + files.** Same route and file — `apps/web/app/w/[workspaceId]/members/page.tsx:202-210` (`MintForm` `:236-350`, `PendingList` `:361-387`). Not a route of its own, matching the prototype's nesting (block closes `:796`, `isMembers` `:798`).
**Prototype delta (old→new).** Not a delta — a **new block**. The old export has no `isInviteAdmin` at all; its panel sat unconditionally inside `isMembers` at OLD `:709-780`. Gate at NEW `:722`; the same panel body reappears one level deeper at NEW `:723-795`. Data: NEW `:3056` `isInviteAdmin: myRoleIsAdmin`, NEW `:3057` `inviteAdminOnly: myRoleIsAdmin ? "" : "Only a workspace owner or admin can see or manage this workspace's invitations."` — both new (OLD `:2885` has only `inviteHeading`).
**Product gap (new prototype → product).** Structure broadly matches on different strings and classes. Heading: NEW `:747` `Invite someone` vs `members/page.tsx:277` `Invite somebody`. Empty state: NEW `:741` `No invitations are outstanding.` matches verbatim `members/page.tsx:369`. `Withdraw`: NEW `:736` vs `:382` — matches. Expiry/`meta` line: the prototype's two arms (data `:3098`) match verbatim at `members/page.tsx:379-380`, but the product renders `formatDateTime(row.expiresAt)` rather than the prototype's pre-formatted string (one clock, IST). Channel and role pickers match; guest hides the project field in both (prototype `inviteTakesProjects` `:765` vs `members/page.tsx:311`). The product adds a withdraw-refusal path, a minted-link card and `COPY_IT_NOW` (`:22`, `:328`). **No wire gap for this block** — every field it reads is on `PendingInvite`/`MintedInvite` (`packages/app-core/src/online/invites.ts`). The gate is a **ruling, not a gap**: the product asks the door's 403 instead of reading a role (`members/page.tsx:28-54`).
**Port verdict.** `held` — the owner hold names `isInviteAdmin` explicitly, the panel already exists, and the delta is the *gate*, which `members/page.tsx:33-35` says cannot be sourced on this branch.

### `isAccount` — `desktop.dc.html@6d7b67c0a52c:1486-1566`
**Product route(s) + files.** `/account` → `apps/web/app/account/page.tsx:234-308`; the Appearance card is `apps/web/src/account/appearance-section.tsx:24-35`, composed at `account/page.tsx:265`.
**Prototype delta (old→new).** The `+22` lines are a new card between the Profile and Notifications cards: NEW `:1506` card `<div …>`, NEW `:1507` `<h2 …>Appearance</h2>`, NEW `:1511` `<sc-for list="{{ acctStyles }}" as="o" hint-placeholder-count="3">` → NEW `:1512` `<span sc-camel-on-click="{{ o.set }}" …>`, NEW `:1515` `{{ acctStyleNote }}`, NEW `:1520` `<sc-for list="{{ acctThemes }}" … hint-placeholder-count="2">` → NEW `:1521`, NEW `:1525` the per-device footnote. Data: NEW `:3507-3508` `acctStyles` (`hig`/`minimal`/`neo`), NEW `:3520` `acctThemes` (`light`/`dark`). **None of these strings appears anywhere in the old export.**
**Where the toggles live.** They live **only** under the Appearance card on `/account` — so yes, the Account screen exposes them. `account/page.tsx:265` renders `<AppearanceSection />` unconditionally; `apps/web/src/account/appearance-section.tsx:28-29` composes `<StyleToggle />` and `<ThemeToggle />`; the docblock at `:7-8` records the move (*"`ThemeToggle` moved here from `AppNav` (Step 4)"*). `packages/ui/src/tokens.ts:1278` names the contract — set on `document.documentElement`, never `<body>`.
**Product gap (new prototype → product).** Card title, order, control shape, style labels and the footnote: **matches**. The footnote is verbatim (NEW `:1525` vs `apps/web/src/account/appearance-section.tsx:30-32`); style labels match `apps/web/src/style-toggle.tsx:12-14`; group labels `Style`/`Theme` match `apps/web/src/style-toggle.tsx:73` / `apps/web/src/theme-toggle.tsx:63`. Two divergences, **both pre-existing rulings, not refresh items**: the theme control ships **three** segments (`System|Light|Dark`, `apps/web/src/theme-toggle.tsx:29-33`) against the prototype's two, with its reasoning and a stated one-line revert at `apps/web/src/theme-toggle.tsx:8-27`; and two of the three style notes are worded differently (`apps/web/src/style-toggle.tsx:27-29`, whose own docblock `:17-25` records they were checked against `tokens.ts`, with `apps/web/src/account/appearance-section.tsx:13-16` noting the card *"has no counterpart in the desktop prototype's own `isAccount` screen"*). Tokens: the prototype drives both axes off `document.body.dataset` (`:3513`, `:3524`); the product off `document.documentElement.dataset` (`apps/web/src/style-toggle.tsx:67`, `apps/web/src/theme-toggle.tsx:53-57`) — the product's choice is the documented one.
**Port verdict.** `none` — the card already ships, landed **2026-09-15** (`3bb823dc`, *"/account: port the screen from the DESKTOP prototype, not the mobile one"*), **three days BEFORE this export**, and matches it on title, order, shape, labels and footnote.

### `isHelp` — `desktop.dc.html@6d7b67c0a52c:1638-1718`
**Product route(s) + files.** `/help` → `apps/web/app/help/page.tsx:16-23` (`<HelpBrowser />` at `:20`); the screen is `packages/app-core/src/help/help-browser.tsx` — sidebar `:448-582`, column `:618-694`.
**Prototype delta (old→new).** Four structural moves, all quoted:
- Layout inversion: OLD `:1602` centered `flex:1…justify-content:center` → NEW `:1639` `align-items:stretch`, with `<aside style="width:274px;…">` opened at NEW `:1640` and closed NEW `:1669`, and the column re-wrapped at NEW `:1670`.
- Tabs move into the aside: OLD `:1633` body-level `display:inline-flex;align-self:flex-start;…` → NEW `:1641` inside the aside; the `{{ helpTabs }}` loop survives at NEW `:1642`.
- TOC **removed**: OLD `:1639` `<nav style="display:flex;flex-wrap:wrap;gap:7px 20px">` and OLD `:1640` `<sc-for list="{{ helpToc }}" …>` have no NEW counterpart (`helpToc` survives only in the OLD data layer at `c9f852a2c243:3640`).
- Group accordion added: NEW `:1646` `<p …>Topics</p>`, NEW `:1648` `<sc-for list="{{ helpGroups }}" as="g" hint-placeholder-count="5">`. Eyebrow added at NEW `:1702` (`{{ helpSectionGroup }}`, data `:3894-3897`). Next footer added at NEW `:1709` (`<sc-if value="{{ helpNext }}">` → NEW `:1711` label, NEW `:1712` link; data `:3898-3906`).
- `style-hover` introduced here: NEW `:1650` (group toggle), NEW `:1660` (nav item) — **zero occurrences in the old export**, the third at NEW `:110` outside this block.
**Product gap (new prototype → product).** **All four structural items already ship**, landed **2026-09-15** (`7cce93e2`, *"/help takes the prototype's surfaces, its 17px body and its third text dimness"*) — three days before the export:
- aside `matches` — `packages/app-core/src/help/help-browser.tsx:463` `<aside className="gn-help__sidebar">`, styled `packages/ui/src/ui.css:2958`;
- tabs-in-aside `matches` — `packages/app-core/src/help/help-browser.tsx:494-502` `<SegmentedControl />` as the aside's first child, with the prototype's own `helpTabs` quoted as source at `:474`;
- group accordion `matches` — `packages/app-core/src/help/help-browser.tsx:511-579` (caret `:550-563`, count `:565`);
- TOC removal `matches` — recorded at `packages/app-core/src/help/help-browser.tsx:680-691`;
- eyebrow `matches` — `packages/app-core/src/help/help-browser.tsx:167-169`; Next pager `matches` — `packages/app-core/src/help/help-browser.tsx:189-196`, styled `ui.css:3307-3330`;
- `style-hover` `matches` — the two sites are live hover rules: `ui.css:3069` (prototype `:1650`) and `ui.css:3166` (prototype `:1660`).
- Two divergences, both pre-existing rulings: the prototype draws ONE section at a time where the product renders the whole document (`packages/app-core/src/help/help-browser.tsx:419-426`, *"the one item of its design deliberately not adopted"*); and the search placeholder differs (`packages/app-core/src/help/help-browser.tsx:658` vs the prototype's unchanged `e.g. contested claim`, OLD `:1608` = NEW `:1676`, **unchanged across the refresh**). **No wire gap** — every new binding is derived from the prototype's own static content, which the product carries as `HELP_CONTENT` (`packages/app-core/src/help/help-browser.tsx:8`, `:146`).
**Port verdict.** `none` — the 2026-09-18 export describes what `/help` already renders.

---

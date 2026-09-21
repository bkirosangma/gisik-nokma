# REVIEW ROUND 2 — EXECUTOR 4: UI (rendering layer + accessibility)

**Lane:** exec 4 (Opus) · branch `exec4/review-ui`, cut from `origin/main = a7b6292b78c50208e8055c9f8639b1e8dcf4caa0` · **started 2026-09-21 09:42:01 IST** (T0 = 09:41:50 IST per `controller-state.md`; phase 1 closes 15:41:50 IST).
**Method:** enumerate → cover → state coverage including what was **not** reached. No fix branch, no fix commit, no PR.
**Prototype authority:** the staged export at `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/`, shas re-measured by me at start (`shasum -a 256`): `Gisik Nokma - Desktop.dc.html` = `3d142d464a070b33…`, `Gisik Nokma - Mobile.dc.html` = `14ca5b8d89ab2f2b…`, bundle `Gisik Nokma Desktop.html` = `bf64cc446880281f…`. **The repo's `design-system/interactive/desktop.dc.html` is NOT used as a comparison surface.**
**Round-1 report in scope for dedup:** `docs/lanes/review-ui-exec1.md` (18 findings `I1–I5`, `P1–P13`, all ACCEPTED in `docs/lanes/review-compiled-controller.md`). Re-finding any of them scores 0; every finding below states what it adds over the landed one where there is overlap.

---

## 0. THE ONE-LINE ANSWER

**The floors this product wrote for itself hold exactly where an instrument watches and fail where none does.** Twenty of the twenty-three findings below are painted measurements of THIS tree's signed-in routes on `:3041` — the half round 1 stated it could not reach — and they cluster on the surfaces no sweep visits: the open ticket sheet (a doubled breadcrumb on 23 of 26 seeded tickets, a 21-px close glyph, a nameless editor, a clipped description at phone width), the board's cards (24 disclosure buttons at 21 px), the dialogs (a bare UA input as the primary Title field), the shared `Select` (keyboard focus stranded on `<body>` after every use; no focus ring on its searchable form), the builder (two `<main>`s, a 415-px page on a 390-px phone), the phone-width shell (a 310-px nav), and the one edge class the brief calls the most expensive — a `404` ticket paints *Loading…* forever. Text contrast, by contrast, is clean everywhere I measured — 26 route×theme passes, one third-party watermark failing — because a contrast instrument existed and was run at least once.

---

## 1. ENUMERATION — the universe, before any finding

Counted at `a7b6292b` with `/usr/bin/find`, excluding `node_modules`, `.next`, `dist`, `reference/`, `graphify-out/`.

| area | members | how counted |
|---|---|---|
| `packages/ui/src` | **16** (13 `.tsx`/`.ts` — 11 components + `select/select.tsx` + `select/select-icons.tsx` + `index.ts` + `tokens.ts`; 1 `ui.css` of **5948** lines) | `find packages/ui/src -type f` |
| `packages/ui/test` | **10** | `find packages/ui/test -type f` |
| `apps/web/app` route modules | **25** `.tsx` (24 `page.tsx`/`not-found.tsx` + `layout.tsx`) + `globals.css` (**2886** lines) | `find apps/web/app -name '*.tsx'` |
| `apps/web/src` | **38** (21 `.tsx`, 17 `.ts`) | same |
| `apps/web/test` | **60** files (39 `*.test.tsx`) | same |
| `packages/app-core/src/views` | **23** (15 `.tsx`, 8 `.ts`) | same |
| `packages/app-core/src` non-view `.tsx` | **41** — `account/` 3, `calendar/` 1, `contests/` 1, `help/` 1, `history/` 1, `inbox/` 3, `preferences/` 1, `sync/` 1, `timeline/` 1, `workflow-builder/ticket-types/` 6, `workflow-builder/ui/` 22 | `find packages/app-core/src -name '*.tsx' -not -path '*/views/*'` |
| `packages/editor/src` | **25** (8 `.tsx`, 16 `.ts`, `styles/editor.css` of **257** lines) | same |
| `apps/mobile/src` | **14** (3 screens, editor webview, push, storage; 4 tests) | same |
| `apps/desktop/src` + `index.html` | **8** + 1 | same |
| stylesheets (whole product) | **3** — `ui.css`, `globals.css`, `editor.css` | `find . -name '*.css'` with the exclusions above |
| suites | `e2e-viewport/` **8** · `e2e-stack/` **17** · `e2e/` **2** · `*.test.tsx` repo-wide **94** | same |
| prototype | 5 `.html` + 3 spec `.md` (`help-topics-pane.md` `a60f8bc5`, `workspaces-gap.md` `1ae709c4`, `github.md` `18d4820f`) | the staged export |
| case ids | **2606 ids / 25 files** at this tree (`node scripts/check-case-ids.mjs` → `ok (2606 unique ids, highest 17.006)`; the brief's 2601 is five behind) | the repo's own guard |

**Case-id concern (my subset of the 2606):** the UI-bearing files — `13-hig-per-screen.md` (27), `13-neomorphism-and-workspace-screens.md` (116), `13-board-prototype-port.md` (85), `16-remaining-doors.md` (100), `13-pre-launch-checklist.md` (48), plus the web-client-core block `3.1–3.144` in `03-foundation-ledger.md` and the mobile/desktop block in `12-offline-sync-apps.md` (347, of which the shells are a minority). **Not all are opened — §6 says which were.**

**Concern:** the rendering layer plus accessibility — accessible names, roles, focus order, contrast, tap-target sizes, the type scale, and **what a thing actually paints**, not what its docblock says it paints.

**Live surfaces available to me, measured at start:** `docker ps` shows `gisik-nokma-dev-web-1` (`0.0.0.0:3001->3000`), `gisik-nokma-dev-server-1` (`:3000`), `gisik-nokma-dev-postgres-1` (`:54330`), `gisik-nokma-postgres-1` (`:54329`), mailpit (`:8025`). `curl :3000/healthz` → `{"status":"ok","sha":"dev"}`; `curl :3001/v1/me/workspaces` → `401` in 8 ms (the proxy hop is healthy). `docker inspect gisik-nokma-dev-web-1` → `Created 2026-09-21T02:50:16Z`, `Mounts: []` — **a baked image, so `:3001` is NOT this tree** and is not used for any painted claim below. My own port is `:3041`.

---

## 2. COVERAGE — including the boundary

Stated in full in §6, after the findings, so the boundary is written against what was actually done rather than what was planned.

---

## 3. FINDINGS

_(ids `E4-<n>`; each carries WHAT · WHY · BETTER · MEASUREMENT · SEVERITY)_

### HOW THE PAINTED MEASUREMENTS WERE TAKEN — the door round 1 did not have

Round 1's stated #1 boundary was *"NO signed-in route was measured at paint"*, because `:3001` serves a baked image. I did not use `:3001`. I ran **this tree's** Next shell on my own port — `pnpm install --prefer-offline --frozen-lockfile` (6 s), `pnpm run build` in `domain`, `rule-engine`, `sync-client`, `ui`, `editor`, `app-core` (one package at a time, all `exit=0`), then `next dev -p 3041` from `apps/web` with `SERVER_ORIGIN=http://localhost:3000` (the default at `apps/web/next.config.ts:9`) — so `/v1/*` proxies to the owner's running API and the **pages are this worktree's source**. Positive controls before any number was believed: `lsof -p <next pid>` → `cwd /Users/kiro/my_projects/gisik-nokma-exec4/apps/web`; `curl :3041/v1/me/workspaces` → `401 {"error":"unauthenticated"}` (the hop). Sign-in: the server's better-auth refuses `callbackURL` on `:3041` (*"Invalid callbackURL"*, painted in the sign-in page's live region) — so I signed in **as the e2e seed owner `kiro@e2e.gisik-nokma.local`** through `:3001`'s form + the Mailpit link, and the `localhost` session cookie (host-scoped, not port-scoped) carried to `:3041`. Browser: Chrome via the chrome-devtools MCP — `take_snapshot` (the accessibility tree), `evaluate_script` (`getBoundingClientRect`/`getComputedStyle`), `emulate` (`390x844x2,mobile,touch` / `1512x900x1`), `take_screenshot`. **No ticket, comment, member or setting was created or changed**; the only writes are the session rows sign-in itself makes. No `docker compose` command was run.

**REPRODUCTION, as a runnable block (this worktree already carries `node_modules` and the six built `dist`s, so step 2 is optional on it):**

```bash
# 1. toolchain
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd /Users/kiro/my_projects/gisik-nokma-exec4            # or any checkout of a7b6292b
pnpm install --prefer-offline --frozen-lockfile
# 2. the packages apps/web imports by name (each is `tsc -p tsconfig.json`)
for p in domain rule-engine sync-client ui editor app-core; do (cd packages/$p && pnpm run build); done
# 3. this tree's shell on a free port, proxying /v1 and /api/auth to the running dev API on :3000
(cd apps/web && NEXT_TELEMETRY_DISABLED=1 SERVER_ORIGIN=http://localhost:3000 ./node_modules/.bin/next dev -p 3041)
curl -s http://localhost:3041/v1/me/workspaces      # → {"error":"unauthenticated"} 401 = the hop works
# 4. session: the API refuses callbackURL on :3041 ("Invalid callbackURL"), so sign in on :3001's form as
#    kiro@e2e.gisik-nokma.local, take the link from Mailpit (curl :8025/api/v1/messages?limit=1 → …/message/<ID>),
#    open it in the SAME browser profile; the `localhost` cookie is host-scoped and is sent to :3041.
# 5. the ids used above (Convenience Corner seed on the dev DB)
#    workspace 0TZSS5W6ATCTF2YBPMWGGP9JF5 · project 0XB92YA4CGEBF9S285AH4SDXR1
#    ticket   01EXF5XW3ZZZV7PD0P6B5HWGPX (CCSO-6, parent = epic 03HCQDZB48MNR2EK4M9E1BQH96 "Open questions")
#    workflow 0CGPSP01CRYGGMDM4CG17RP822 · ticket type `errand`
#    e.g. http://localhost:3041/w/0TZSS5W6ATCTF2YBPMWGGP9JF5/p/0XB92YA4CGEBF9S285AH4SDXR1?ticket=01EXF5XW3ZZZV7PD0P6B5HWGPX
# 6. viewports: Chrome DevTools device emulation 390×844 (mobile, touch), 768×1024, 1512×900; dark via
#    "Emulate CSS prefers-color-scheme: dark". Every measurement is getBoundingClientRect / getComputedStyle
#    in the console; the a11y-tree claims are the Accessibility panel (or CDP Accessibility.getFullAXTree).
```

---

### E4-1 — **IMPORTANT** — The ticket sheet's breadcrumb renders the SAME ancestor twice whenever the direct parent is an epic — which is 23 of the 26 tickets in the seeded project

**WHAT.** Open `CCSO-6` ("HSN codes for the real catalogue", parent = the epic "Open questions"). The painted crumb bar reads **`Convenience Corner › Shop operations › Open questions › Open questions › CCSO-6`** — two link crumbs, `data-testid="sheet-crumb-epic"` and `data-testid="sheet-crumb-parent"`, both labelled *Open questions*, both opening the same ticket.

**MEASUREMENT (painted, `:3041`, 1512×900).** `evaluate_script` on `nav[aria-label="Ticket location"]` returned the outerHTML: `…<button … data-testid="sheet-crumb-epic">Open questions</button><span … aria-hidden="true">›</span><button … data-testid="sheet-crumb-parent">Open questions</button>…`. The a11y snapshot (`take_snapshot`) lists `button "Open questions"` twice under `navigation "Ticket location"`. **The ticket has exactly one ancestor**: read-only recursive query on the dev DB (`proj_tickets`, 54330) for `01EXF5XW3ZZZV7PD0P6B5HWGPX` → depth 1 = `03HCQDZB48MNR2EK4M9E1BQH96` (`type_id = epic`, title *Open questions*), depth 2 = none. **Blast radius**: `select count(*) filter (where parent.type_id in (select type_id from proj_ticket_types where rank=1))` over the project's live tickets → **23 of 26** have an epic as their direct parent. **I painted ONE of them** (`CCSO-6`); the other 22 follow from the mechanism below, which has no branch that could tell them apart, and I say so rather than claim 23 paints.

**MECHANISM (source, opened).** `apps/server/src/routes/tickets.ts:617-665`: the epic walk starts at `cursor = state.parentId` and returns `{ kind:'ticket', id: cursor, … }` the moment `epicTypeIds.has(ancestor.typeId)` — so when the parent *is* the epic, `epic.id === parent.id`. `packages/app-core/src/views/ticket-sheet.tsx:1534` (`const epicCrumb = ticketRead.epic;`) and `:1772-1787` render `epicCrumb` and then `parent` under two independent null-checks; nothing compares their ids. **The test fixture never exercises this shape**: `ticket-sheet.test.tsx:2899-2901` states the fixture has *"a parent (`Registrations`) … and NO grandparent"*, and 16.63 (`:2920`) adds a *distinct* epic id — no case sets `parent.id === epic.id`.

**PROTOTYPE.** `Gisik Nokma - Desktop.dc.html` (sha `3d142d46…`) `:3410-3419` pushes `epicId` and `parentId` as two different fields of its data model; its fixtures carry no ticket whose parent is its epic, so the prototype never shows the doubled form and gives no authority for it. The owner's ruling quoted in `ticket-sheet.tsx:1505-1506` — *"workspace -> project -> grandparent -> parent (or however many layers here) -> ticket"* — is a chain of DISTINCT layers. **Category 3: diverges (from the ruling's own shape) with no ruling found** for the equal-id case; `grep -n "epic.*parent.*same\|same ticket twice\|epic === parent\|epic.id === parent.id"` over `packages/app-core/src/views/ticket-sheet.tsx`, `docs/lanes/*.md` and the breadcrumb dispatch returns nothing.

**WHY IT IS WRONG.** A breadcrumb is a path; a path that names the same node twice states a depth the hierarchy does not have — precisely the *"breadcrumb that skips a level states a hierarchy the product does not have"* argument the component's own comment (`:1752-1757`) makes for the missing-project case, in the other direction. A screen-reader user hears two identical link crumbs and cannot tell whether they are one ancestor or two.

**WHAT WOULD HAVE BEEN BETTER.** One comparison: render the epic crumb only when `epicCrumb.id !== parent.id` (or have the server null the `epic` when it equals the parent, with the docblock saying which). Plus one case in `ticket-sheet.test.tsx` whose fixture sets `parent.id === epic.id` and asserts `crumbTexts()` has the ancestor once — the shape the seed produces 23 times.

---

### E4-2 — **IMPORTANT** — The ticket sheet's Close control paints at 24×21 px, below WCAG 2.5.8's 24-px minimum, with no rule giving it a size and no other pointer control that closes the sheet

**WHAT.** `button.gn-sheet__close` ("×", `aria-label="Close sheet"`) — the one pointer-operated way out of the product's most-used overlay.

**MEASUREMENT (painted, `:3041`, 1512×900, sheet open).** `getBoundingClientRect()` → `w 23.59, h 21.20`; `getComputedStyle` → `padding: 1px 6px` (the UA's), `min-width: auto`, `min-height: auto`, `font-size: 19.2px`, `background: rgba(0,0,0,0)`. **No backdrop element exists** (`document.querySelector('[class*="backdrop"]')` → `null`), so click-outside is not an equivalent; Escape is a key, not a control. Source: `packages/ui/src/ui.css:719-728` (`.gn-dialog__close, .gn-sheet__close`) sets `font`, `font-size: 1.2rem`, `line-height: 1`, `border: none`, `background: none`, `color`, `cursor` — **no `min-height`, `min-width`, `padding` or `display`**. Markup `packages/ui/src/components/sheet.tsx:111`.

**THE DIALOG TWIN, same paint.** `button.gn-dialog__close` (`aria-label="Close dialog"`) in the New-ticket dialog measures **24×21** the same way (`packages/ui/src/components/dialog.tsx`, rule `ui.css:719-728` is the shared selector list `.gn-dialog__close, .gn-sheet__close`) — so every modal in the product closes through a 21-px glyph. Only the Filters panel moves focus into itself on open (`activeInDialog: true`); the Dialog and the Sheet leave `document.activeElement` on `body` — a painted reproduction of round 1's P8, recorded here as corroboration, not claimed as new.

**PROTOTYPE.** `Gisik Nokma - Desktop.dc.html` (`3d142d46…`) `:1121`: the sheet's close is `width:32px;height:32px;border-radius:999px;background:var(--ctlBg);box-shadow:var(--ctlShadow)` — a 32-px filled circle. **Category 3: diverges with no ruling found.** `grep -n "gn-sheet__close\|close.*32\|Close sheet" packages/ui/src/ui.css docs/lanes/review-compiled-controller.md docs/superpowers/plans/*.md` → the only hits are the rule itself and the markup; no ruling text.

**WHY IT IS WRONG.** The product's own floor rule is *24 for declared in-list controls, 44 for everything else* (`apps/web/e2e-viewport/tap-targets.ts:23-45`). This control is declared nowhere (`DENSE_IN_LIST` has four entries, `:139-186`, none of them this), so it is judged at 44 and paints at 21. **It has never been in any sweep's population** because no instrument opens the sheet (`measureTapTargets` has one call site in the stack suite, `e2e-stack/viewport.spec.ts:170`, on `/my-work` only; the sheet is not on `/my-work`). Round 1's P11 made the "never on screen when a sweep runs" argument for the Select panel; this is the same blindness on a control a person uses every time they open a ticket.

**WHAT WOULD HAVE BEEN BETTER.** The prototype's own numbers: `min-width: 32px; min-height: 32px; border-radius: 999px; background: var(--gn-fill-tertiary)` — or the product's 44 — on `.gn-sheet__close`; and one sweep that opens a sheet before measuring.

---

### E4-3 — **IMPORTANT** — Every board card carries a 66×21 px `who · when` disclosure button that no sweep has ever measured and that no floor rule admits

**WHAT.** `button.gn-board-card__provenance` — toggles the state-provenance line on each card (`aria-expanded`). It is not the card's open control; nothing larger performs its function.

**MEASUREMENT (painted, `:3041`, board `/w/…/p/0XB92YA4CGEBF9S285AH4SDXR1`, 1512×900).** My in-page sweep with the product's own selector list (`tap-targets.ts:268-280`) and visibility filter: **24 instances** (one per card; `document.querySelectorAll('button.gn-board-card__provenance').length` → 24, `.gn-board-card` → 24), each `66×21`, `display: inline-block`, not inline-in-prose (the exemption at `:341-343` requires `display: inline`). Source: `packages/ui/src/ui.css:990-998` — `font-size: 0.78rem; padding: 0.2rem 0 0; border: none; background: none` — no min size. Handler: `packages/app-core/src/views/board.tsx:1052-1059`, `onClick={() => setUnfolded(v => !v)}` — a disclosure, distinct from the card's `onOpen` (`:1036`, and the whole slot at `:990`, case 13.523).

**WHY THE SIBLING IS NOT A FINDING AND THIS IS.** `button.gn-board-card__title` also paints under 44 (e.g. `181×23`) but the whole card slot opens the same ticket (`board.tsx:961-1000`, 13.523), which is WCAG 2.5.8's *Equivalent* exception. The provenance toggle has no equivalent.

**THE RECORD, AND WHY IT DOES NOT CLOSE THIS.** `docs/pre-launch-checklist.md:590-595` (2026-09-07) recorded *"On the board at 390px, 48 interactive elements measure under 24×24 — but almost all are wide and 21–23px tall … Both are owner calls about the design"*, naming `gn-board-card__provenance` only for its 12.5-px text. `test-cases/13-pre-launch-checklist.md:588-593` then says the signed-in shell *"now carries the same sweep, the same 44px threshold and the same ratchet"* — true of `/my-work`, not of the board (the baseline file has one key). The owner's call arrived on 2026-09-20 — *"let the checker accept 24 for in-list controls, keep 44 for standalone buttons"* (`tap-targets.ts:26-27`) — and this control satisfies neither: 21 is under the in-list 24 and it is declared in neither the CSS nor `DENSE_IN_LIST`. So the item is not deferred any more; it is unfinished, and unpinned.

**WHY IT IS WRONG.** 21 px is under the 24-px *minimum* (2.5.8, AA), not merely under the product's 44. `DENSE_IN_LIST` (`tap-targets.ts:139-186`) does not declare it, so under the product's own rule it is judged at 44 — and the brief's *"find the controls that forgot to declare"* names exactly this shape. It cannot have been caught: the board is not a tap-target route in either suite (`e2e-stack/viewport.spec.ts:170` is the only call, on `/my-work`, which renders no board cards).

**WHAT WOULD HAVE BEEN BETTER.** Either give the control a 24-px floor in `ui.css` with the in-list argument written in the rule and a `DENSE_IN_LIST` entry (control `.gn-board-card__provenance`, container `.gn-board__cards`, witness `.gn-board__card-slot`) — the file's own documented procedure — or move the disclosure onto a 24-px-tall row. And add the board route to the stack suite's tap-target pass.

---

### E4-4 — **IMPORTANT** — The description editor and the comment composer are `role="textbox"` elements with NO accessible name; the description row's visible label is the raw field id `description`

**WHAT.** The product's two writing surfaces on the ticket sheet.

**MEASUREMENT (painted, sheet open, 1512).** `document.querySelectorAll('[contenteditable="true"]')` → two nodes, attributes exactly `contenteditable=true, role=textbox, translate=no, class=tiptap ProseMirror, tabindex=0` — **no `aria-label`, no `aria-labelledby`, no `aria-multiline`**, `labels: null`. The a11y snapshot renders them as `textbox multiline value="…"` with an empty name. The description row's `<dt>` is the literal lowercase `description` (`packages/app-core/src/views/ticket-sheet.tsx:2405`) beside Title-cased siblings `Assignee` `:2319`, `Priority` `:2334`, `Due` `:2351`, `Type` `:2373`; a `<dt>` is not a labelling relationship. Source of the gap: `packages/editor/src/components/TicketEditor.tsx:89-101` — `useEditor({ immediatelyRender, extensions, content, editable, onCreate, onUpdate })` with **no `editorProps.attributes`**; `grep -rn "aria-label\|aria-labelledby" packages/editor/src/components/TicketEditor.tsx packages/editor/src/components/TicketEditorSlot.tsx packages/app-core/src/views/editor-slot.tsx packages/app-core/src/views/comments-thread.tsx` → **0 matches** (positive control: the same grep over `packages/editor/src/components/EditorToolbar.tsx` finds the toolbar's `aria-label`s).

**PROTOTYPE.** `Desktop.dc.html:1170` is a bare `<textarea>` with no label either — the prototype is not an accessibility authority and gives no ruling on names; it draws no "description" caption at all (the field sits above the `<dl>`, `:1172`).

**WHY IT IS WRONG.** WCAG 4.1.2 (Level A): a form control must expose a name. A screen reader lands on "edit text, multiline" twice on the same sheet with nothing to say which is the description and which is the comment. The lowercase `description` is the field id leaking into the UI — `:2454` renders `{fieldId}` for custom fields and the description row copies that shape instead of a caption.

**WHAT WOULD HAVE BEEN BETTER.** `editorProps: { attributes: { 'aria-label': props.label, 'aria-multiline': 'true' } }` in `useEditor`, with the slot passing *"Description"* / *"Comment"*; and `<dt>Description</dt>`.

---

### E4-5 — **IMPORTANT** — The workspace home's `<h1>` is a button, so the page's level-1 heading is named "Rename Convenience Corner"

**WHAT.** `/w/<workspaceId>` renders `<h1 class="gn-page-title"><button type="button" class="gn-workspace-home__rename-trigger" aria-label="Rename Convenience Corner">Convenience Corner</button></h1>` — the heading's only child is the rename control.

**MEASUREMENT (painted, `:3041`, 1512).** `document.querySelector('h1').outerHTML` → the markup above (one child node, `BUTTON`). Verbose a11y snapshot (`take_snapshot verbose`) line 40: **`heading "Rename Convenience Corner" level="1"`**, line 41: `button "Rename Convenience Corner"`. The non-verbose snapshot omits the heading entirely and shows only the button. The button measures `316×41` (font 34px, `padding: 0`, `min-height: 0`) — under the 44 floor for a standalone control on a route whose tap targets are never asserted (the stack baseline file `apps/web/e2e-stack/tap-target-baseline.json` holds one key, `stack-phone-390|/my-work`).

**THE RECORDED REASON, and why it does not cover this.** `apps/web/app/w/[workspaceId]/page.tsx:742-761` explains the button-in-h1: *"this page's heading must survive … The accessible name still carries the WORKSPACE (`Rename {name}`)"*, quoting the owner's *"have the rename be there right on the header. THE CLICK TO RENAME."* The owner ruled click-to-rename on the header; nothing rules that the heading's exposed NAME becomes the action, and the docblock's own goal (the heading survives) is what the aria-label defeats. It applies to admins/owners only (`:798-812`: non-admins get plain text), and while renaming the `<h1>` is replaced by the form (`:763`), so the page has no level-1 heading at all.

**WHY IT IS WRONG.** Headings are the primary navigation structure for screen-reader users; the level-1 heading is supposed to name the page. Here it names an action. Sighted users read *Convenience Corner*; the accessible name is *Rename Convenience Corner* — WCAG 2.5.3 is technically satisfied (the visible text is contained) but the heading's purpose is inverted. No other route does this: `/workspaces` → `H1 "Workspaces — Kiro"`, the board → `H1 "Shop operations"` (plain text).

**WHAT WOULD HAVE BEEN BETTER.** `<h1>Convenience Corner</h1>` with an adjacent icon button *Rename Convenience Corner* (the shape `/w/<id>`'s own `Archive Shop operations` button uses), or keep the click-to-rename and put the accessible name on the heading: `<h1 aria-label="Convenience Corner">` is not it (that hides the button's purpose) — the two roles need two elements.

---

### E4-6 — **MINOR** — The visibility editor's people picker labels a member by a 26-character ULID

**WHAT.** In *Who can see this › Only the people I name › Who, exactly*, the second checkbox is labelled **`01M1V035TASFV2G9WPWFV9QDVW`**.

**MEASUREMENT (painted, sheet open).** `label.gn-visibility__person` ×2: `Kiro` and `01M1V035TASFV2G9WPWFV9QDVW`. Read-only `select id, email, name from "user"` on the dev DB: that id is `accountant@e2e.gisik-nokma.local` with `name = ''`. Source: `packages/app-core/src/views/visibility-editor.tsx:404-411` renders `actorLabel(member.id, member.name)`; `packages/app-core/src/provenance.ts:29-34` returns the raw id when the name is empty. The editor's `members` prop is `Actor[]` = `{ id, name }` (`:95`, `view-types.ts:3`) — the roster's `email?` field (`RosterMember`, `view-types.ts:60`) is not passed.

**CLASSIFICATION.** `provenance.ts:4-7` records the rule — *"Honesty contract 1: … A missing display name falls back to the raw actor id — attributed, never blank"* — so for provenance text this is **category 2, ruled**. **The argument that the ruling should not reach a picker:** the contract's purpose is attribution of a *recorded claim*; a checkbox is a *choice*, and a chooser who is shown a ULID cannot make it. The roster already carries an honest, human-readable attribution (the email) that the ruling's own wording ("attributed, never blank") would be better served by. The prototype's people are always named (`Desktop.dc.html`, `PEOPLE[m.k].full`) and never show an id.

**WHAT WOULD HAVE BEEN BETTER.** Pass `RosterMember[]` and label `name || email || id` in the picker only, leaving `actorLabel` untouched for provenance. Severity Minor because it needs a member with no display name, which the seed has and a real workspace may not.

---

---


### E4-7 — **IMPORTANT** — At phone width the ticket sheet's description is clipped: the field row keeps its 8-rem label column, the editor gets 224 px of a 367-px sheet, and its text paints past the sheet's right edge

**WHAT.** `emulate 390x844`, sheet open on `CCSO-6`. The description editor (`div.tiptap.ProseMirror`) measures **224×3195**; its container `dd` spans `x 178.6 → 402.7` while the sheet ends at `x 390` and the sheet body is `366.6` wide. Words are cut at the right edge — the screenshot (`docs/lanes/exec4-paint/sheet-390-description.jpeg`, committed with this report, taken from `:3041`) shows *"as o"*, *"the"*, *"screens"*, *"look"* truncated mid-glyph. The toolbar (`div.ticket-editor__toolbar`) also reports `right=403`.

**MEASUREMENT.** `getComputedStyle(field)` → `display: grid; grid-template-columns: 128px 224.094px` — `packages/ui/src/ui.css:1868`: `.gn-ticket-sheet__field { display: grid; grid-template-columns: 8rem 1fr; … }` with **no narrow-width override** (the file's four `@media (max-width…)` blocks are at `:2728`, `:3017`, `:4452`, `:4612`; none names `.gn-ticket-sheet__field`). The `dl` itself is `display: block`. `document.documentElement.scrollWidth` = 390 and the sheet's `scrollWidth` = 367, so the overflow is **clipped, not scrollable**. Same paint, the header: `input.gn-ticket-sheet__title-input` is **162×28** (title reads *"HSN codes for tl"*), `button.gn-sheet__full` **114×44** and `.gn-sheet__close` **24×21** share the row (`.gn-sheet__header`, `ui.css:526-532`, `flex; space-between; gap: 1rem`, no wrap), and the five crumbs stack **one per line** because `.gn-sheet__heading` (`:606-612`) gets what is left.

**PROTOTYPE.** The desktop prototype's sheet is `min(660px,100%)` (`Desktop.dc.html:3398`) and is never drawn at 390; the mobile prototype (`Gisik Nokma - Mobile.dc.html`, sha `14ca5b8d…`) draws the ticket as a full-width screen with its own header and no side-by-side label column. **Category 3: diverges with no ruling found** — `grep -n "390\|phone\|narrow" packages/ui/src/ui.css` near the ticket-sheet block (`:1800-1900`) returns nothing about the field grid; the only recorded narrow-width fact for the sheet is its `94vw` width (`:400`).

**WHY IT IS WRONG.** The description is the ticket's content. At the one width the product's own viewport suite calls "phone", the content is unreadable without a workaround, and the header spends 114 px on *Full screen* — a control whose effect on a 367-px sheet is 23 px — while the title gets 162.

**WHAT WOULD HAVE BEEN BETTER.** `@media (max-width: 40rem) { .gn-ticket-sheet__field { grid-template-columns: 1fr; } }` (the breakpoint `ui.css:2728` already uses), `min-width: 0` on the `dd`, and hide `.gn-sheet__full` below the same width. One painted case at 390 asserting `dd.right <= sheet.right`.

---

### E4-8 — **IMPORTANT** — The editor's formatting strip is the one control family in the neumorphic sheet drawn with hard 1-px outlines, and the two recorded reasons that leave it that way rest on a false premise

**WHAT.** In the sheet (style `neo`, light), `button.ticket-editor__tool` paints `border: 1px solid rgb(32,43,73)` (the label ink), `background: transparent`, `box-shadow: none`; the strip `div.ticket-editor__toolbar` has the same outline on three sides. Every neighbouring control — `.gn-button--ghost`, `.gn-segmented__item`, `.gn-select__trigger`, `.gn-field__input` — is border-less fill (the borders→fills campaign). The screenshot above shows it: six outlined boxes and an outlined rule over a soft-fill sheet.

**MEASUREMENT.** `getComputedStyle` on `.ticket-editor__tool` (painted values above). Source: `packages/editor/src/styles/editor.css:137-149` (`border: 1px solid currentColor; background: none`), `:126-136` (the strip). The docblock at `:114-125` records why: *"THE FILL IS NOT TRANSCRIBED, and it cannot be: … THIS FILE'S HEADER forbids colour of every kind here — `packages/editor` does not depend on `packages/ui`, so no token from `tokens.ts` is reachable."* The other side, `packages/ui/src/ui.css:5866-5871`: *"WHAT THIS BLOCK DELIBERATELY DOES NOT STYLE: the composer's own chrome … `packages/ui` styling another package's internals is the duplication this repo refuses."*

**PROTOTYPE.** `Desktop.dc.html:3669-3680` (`descTools`, and `cmtTools` identically): `border:none; background:var(--cardBg); box-shadow:var(--cardShadow)`, strip `background:var(--fill4)` (`:1165`). **Category 2 — the divergence is recorded — and this is the argument that the record is mistaken, not a preference:** (1) *"no token is reachable"* is false as CSS: a custom property cascades from the document, not from a package graph. `var(--gn-fill-tertiary, transparent)` in `editor.css` is neither a hex, a colour function nor a colour keyword (the three forms the header forbids), and it resolves in every host that loads `ui.css` — `apps/web/app/layout.tsx:4` imports `editor.css` beside it. (2) The only host without tokens is the mobile webview: `apps/mobile/src/editor/editor-html.generated.ts` contains **0** `--gn-` strings (`grep -c`), and there the fallback value is what paints — which is exactly today's result, so nothing regresses. (3) Two boundaries each refusing produces a hole neither owns; the record in each file is a *reason a shortcut was taken*, which the brief distinguishes from a ruling.

**WHY IT IS WRONG.** The owner treated *"grey OS buttons in a neumorphic page"* as a defect worth a commit and a case (`16.83`); hard-outlined toolbar boxes in the same sheet are the same class, on the control a person uses to write.

**WHAT WOULD HAVE BEEN BETTER.** In `editor.css`: `border: none; background: var(--gn-fill-tertiary); box-shadow: var(--gn-shadow-raised)` on `.ticket-editor__tool` (the two roles `ui.css` uses 14 and 19 times), the strip on `var(--gn-fill-quaternary)` — **no fallback value**, so an undefined variable resolves to `initial` (transparent / none), which is exactly today's paint in the token-less mobile webview. **Checked against the scanner rather than assumed:** `packages/ui/test/helpers/colour-scan.ts:70-79` matches a hex (`#[0-9a-fA-F]{3,8}`) in a CSS value or a string, and the functions `rgb|rgba|hsl|hsla|oklch|oklab|color-mix(`; a `var(--gn-…)` reference matches neither. The header's third prohibition (a bare colour *keyword*, `:1-9`) is why I do not propose `transparent` as the fallback. No test in `packages/editor/test` constrains `var()` in the stylesheet (`attachment-list-item.test.tsx:311`, `ticket-image.test.ts:267`, `mention.test.ts:530` read it for class names only). The header would need one amended sentence.

---

### E4-9 — **IMPORTANT** — The workflow builder renders TWO `<main>` landmarks, and at 390 px its name field is 403 px wide, so the page overflows the phone viewport to 415

**WHAT.** `/w/<id>/settings/workflows/<workflowId>` at `emulate 390x844`.

**MEASUREMENT (painted).** `document.querySelectorAll('main')` → **2**: `main.gn-shell` (parent `body`) and `main.workflow-builder-screen__canvas` (parent `div.workflow-builder-screen__layout`, `nested: true`). Source: `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:131` `<main className="workflow-builder-screen__canvas">`, inside the app shell's `<main>` (`apps/web/app/layout.tsx`). `window.innerWidth` → **415** on a 390 emulation (every other route in this pass reads 390) and `document.documentElement.scrollWidth` → 415 — so my sweep's `hOverflow` (`scrollWidth > innerWidth`) reads **false** here, and that is the point: the mobile layout viewport *expanded* to contain the 403-px input (shrink-to-fit), which is exactly the shape a `scrollWidth > innerWidth` assertion — the stack suite's overflow check included — cannot see; the widest element is `input.workflow-builder-screen__name` at **403 px** — its rule (`packages/ui/src/ui.css:2968-2979`) sets `font-size: 2.125rem` and no `width`/`max-width`/`min-width: 0`, so the input's intrinsic `size=20` width at 34 px wins. `h1` count → **0** on the builder and **0** on `…/history` (the builder's h1 gap is recorded at `ui.css:2959-2967` ("AN `<h1>` BESIDE IT WOULD PRINT THE NAME TWICE … pre-existing … recorded with an owner") — I list it as known, not as a finding). The crumb link `a "Settings › Workflows"` is `display: inline`, **126×15**, alone in `nav.gn-builder-crumb` (parent text == own text, so the sweep's inline-in-prose exemption does not apply) — judged at 44 by the product's rule.

**WHY IT IS WRONG.** HTML permits one visible `main` per document; a screen reader's landmark list offers "main" twice and the inner one is a canvas. The 415-px layout viewport means the phone shows the page zoomed out or side-scrolling — the `.gn-nav` overflow that the stack suite's docblock (`e2e-stack/viewport.spec.ts:47-54`) calls the bug this instrument exists to catch, on a route the instrument's overflow assertion does not visit.

**WHAT WOULD HAVE BEEN BETTER.** `<section aria-label="Canvas">` (or `role="region"`) for the canvas; `width: 100%; min-width: 0; box-sizing: border-box` on `.workflow-builder-screen__name`; and the builder route in the stack suite's overflow loop.

---

### E4-10 — **MINOR** — The workflow template gallery's four buttons paint as raw user-agent chrome — a population round 1's sweep could not see, because they carry no class at all

**WHAT.** `/w/<id>/settings/workflows/new`: `button "Use this template — Simple kanban"`, `… — Errand with waits`, `… — Approval chain`, `button "Start blank"`.

**MEASUREMENT (painted, 390 and unchanged in shape at 1512).** My sweep's UA-chrome detector (`borderTopStyle === 'outset'` or the UA's `rgb(239,239,239)` fill) flagged exactly these four on the route; sizes `143×29` ×3 and `95×29`. Source: `packages/app-core/src/workflow-builder/ui/template-gallery.tsx:13-19` and `:23-25` — `<button type="button" …>` with **no `className`**. Round 1's P1 population was *"each static `className` literal on a `<button|input|…>`"*, so a class-less button was never a candidate; the compiled ruling's own verification (`review-compiled-controller.md`, `exec1-P1`) re-ran the same class-keyed extractor. **Wider population, measured:** a regex over every `<button|a|input|select|textarea|summary …>` opening tag in non-test `.tsx` under `packages/` and `apps/web/` finds **78** class-less tags in 123 files — most are inputs inside labelled wrappers or docblock prose (the regex does not skip comments, and I say so) — and the painted UA-chrome detector over every route I visited flagged: **these four** (class-less), the timeline's three `.gn-timeline__nav` (a class WITH a rule — E4-15), and, in dark mode only, the two `editor-slot__submit` buttons round 1's P1 already lists. Nothing else.

**WHY IT IS WRONG.** Same cause and same look as `16.83`'s grey OS buttons, on the first screen of the workflow-authoring flow. `globals.css:84`'s `button { font: inherit }` fixes the font and nothing else.

**WHAT WOULD HAVE BEEN BETTER.** The shared `<Button>` (the file's own sibling `workflow-builder-screen.tsx:42` comment says why: *"The shared `Button`, not a bare `<button>`"*).

---

### E4-11 — **IMPORTANT** — At 390 px the signed-in shell's navigation bar is 310 px tall — 37 % of the viewport — where the only prototype drawn at that width puts navigation in a bottom tab bar

**WHAT.** On the board at `emulate 390x844`, `.gn-nav` measures **390×310** (`getBoundingClientRect`); the links wrap to five rows (`Workspaces` y=13, `Convenience Corner` y=73, `Shop operations` y=133, `My Work`/`Members` y=193, `Settings` y=253, each 44 tall). The board's first column header sits at y≈790 — below the fold on an 844-px phone once the title, search, workflow select, switch, Filters, New ticket and the view tabs have taken their rows (screenshot `docs/lanes/exec4-paint/board-390.jpeg`, committed).

**MEASUREMENT.** `apps/web/app/globals.css:1801` `.gn-nav__links { display: flex; flex-wrap: wrap; … }` with no narrow-width variant (the file's `@media (max-width: 60rem)` at `:1799` changes padding only). The file's own docblock (`:1766-1770`) records *"measured at 190px on a signed-in workspace route at 500px wide … three rows"* and calls a media query a trade of *"one wrong value for another"* — an author's note about the offset variable, not a ruling on the shell.

**PROTOTYPE.** `Gisik Nokma - Mobile.dc.html` (sha `14ca5b8d…`) `:1194-1203`: `<nav style="display:flex;background:var(--barBg);padding:6px 0 10px;…">` of icon+label tab buttons, shown on every root screen (`showTabs`, `:1762`); the top of the screen is one line (`screenLabel`, `:114`). **Category 3: diverges with no ruling found** — `grep -rni "tab bar\|tabbar\|bottom bar\|bottom nav" docs Features.md test-cases design-system/MASTER.md` finds only `docs/hig-reconciliation-audit.md:248,280`, which rule on `apps/mobile` (React Native), not on the web shell at phone width; the pre-launch checklist's *"Mobile HIG adoption — DEFERRED"* (`docs/pre-launch-checklist.md:398`) is likewise scoped to `apps/mobile`.

**WHY IT IS WRONG.** The web shell is the product's phone surface today (no device has ever run `apps/mobile` — `Features.md` marks it `⚙️`), the viewport suite measures at 390 on purpose, and on that surface the shell's own chrome consumes more of the screen than the content. This is the NARROW VIEWPORT edge class on every signed-in route.

**WHAT WOULD HAVE BEEN BETTER.** Below 40rem: collapse the workspace-scoped links into the mobile prototype's bottom bar or a single disclosure, keep the brand/inbox/account row at one line. If the owner rules the wrapped bar is acceptable, record that ruling at `globals.css:1801` — today the only sentence there says the growth is an *"understatement"*.

---

### E4-12 — **IMPORTANT** — When the signed-in instrument runs, its tap-target population is ONE route at ONE width, and its text-contrast population is ZERO routes

**WHAT.** Round 1's I1 established that no browser instrument has executed since 2026-09-06. This is the finding underneath it: even executed, the signed-in suite cannot see most of what this report measured.

**MEASUREMENT (source, opened).** `grep -n "measureTapTargets(" apps/web/e2e-stack/*.spec.ts` → **one** call, `viewport.spec.ts:170`, inside the `/my-work` test; the seven-route loop (`:469-513`) calls `measureTypeScale` (`:533`) and `sweepAccessibleNames` (`:611`) only. `apps/web/e2e-stack/tap-target-baseline.json` holds **one key** (`stack-phone-390|/my-work: 6`). `measureContrast` — TEXT contrast — is a module-private function of the signed-out spec (`apps/web/e2e-viewport/responsive.spec.ts:456`, not exported; `grep measureContrast apps/web/e2e-stack/` → 0). **Non-text (border) contrast IS swept signed-in** — `sweepBorders` (`e2e-stack/helpers/non-text-contrast.ts:64`) against the 50-line `non-text-contrast-roster.json`, with a planted positive and a negative control (`viewport.spec.ts:1007-1170`) — and this finding does not touch it; the zero is text contrast only. The stack suite's docblock at `:223` still says *"`/my-work` is the ONLY route in this file"* — true of the first test, false of the file since the loop was added. The type-scale sweep's two populations (`apps/web/e2e-viewport/type-scale.ts:61` and `:86-87`) name neither `input`, `textarea`, `select` nor `h1–h6`, `legend`, `code`, `kbd`, `caption` — so the UA-sized input text that `globals.css:86-95` records as an unmade decision is text no instrument can see. **Consequence, measured in this report:** the board's 24 `who · when` buttons at 21 px (E4-3), the sheet's 21-px close (E4-2), the 41-px h1 button (E4-5), the builder's 415-px overflow (E4-9) and the UA-chrome gallery (E4-10) are all on routes or in states no tap, contrast or overflow assertion visits.

**WHY IT IS WRONG.** A ratchet whose population is one page reports "offenders=6" as if it were about the product. Round 1's P11 made this point for the Select panel; the true scope is wider — the population is the shape of the suite's route list, not of a component.

**WHAT WOULD HAVE BEEN BETTER.** Run `measureTapTargets` inside the route loop (one line per route, with baselines recorded the way type-scale already does), lift `measureContrast` into a shared module the stack spec imports, and add the sheet-open and builder states.

---


### E4-13 — **IMPORTANT** — The New-ticket dialog's Title field is a bare `<input>` that paints as a 2-px inset user-agent box, 22 px tall, white, in a neumorphic dialog

**WHAT.** Open *New ticket* on the board. The first control a person types into is `<label class="gn-new-ticket__field">Title<input value=""></label>`.

**MEASUREMENT (painted, `:3041`, 1512, light).** `getComputedStyle(input)` → `border: 2px inset rgb(118,118,118)`, `background-color: rgb(255,255,255)`, `border-radius: 0px`, `padding: 1px 2px`, `font-size: 13.3333px`; `getBoundingClientRect` → **425×22**. Its two siblings in the same dialog (`Type`, `Parent`) are React Aria comboboxes inside `.gn-select__trigger` and paint at the product's 17 px in a border-less field. Source: `packages/app-core/src/views/new-ticket-dialog.tsx:127-130` — the `<input>` carries no class; `packages/ui/src/ui.css:2155` styles only the wrapper (`.gn-new-ticket__field { display: flex; flex-direction: column; … }`); `apps/web/app/globals.css:96` gives inputs `font-family: inherit` and nothing else.

**PROTOTYPE.** `Gisik Nokma - Desktop.dc.html` (`3d142d46…`) `:1580`: the same field is `min-height:44px; padding:0 14px; border:none; border-radius:var(--ctlR); background:var(--fieldBg); box-shadow:var(--fieldShadow); font-size:17px`. **Category 3 for the BOX** — no ruling found; `grep -n "gn-new-ticket" packages/ui/src/ui.css` → the wrapper rule and the actions rule only. **The font SIZE is category 2 and I do not claim it:** `globals.css:86-95` records that the three form elements *"currently render at the UA's ~13.3333px on every screen"* and parks the decision at case `15.31`.

**WHY IT IS WRONG.** It is the product's most-used input (every ticket starts here), it is 22 px tall against the product's own 44 floor and the prototype's 44, and it is the one white inset rectangle in a dialog whose every other surface is a soft fill. `16.83`'s *"grey OS buttons in a neumorphic page"* was treated as a defect; this is the same defect on an input.

**WHAT WOULD HAVE BEEN BETTER.** `className="gn-field__input"` — the class `passkeys-section.tsx:114-120` and `profile-section.tsx:40-46` already use for exactly this (per `state-inspector.tsx:9-15`'s own note), which carries the fill, radius, 44-px height and the `neo` sunken override.

---

### E4-14 — **IMPORTANT** — The active-filter chip's remove control is an 8×13 px "×"

**WHAT.** On Calendar and Timeline (and any view with a chip in the tray), `button.gn-project__filter-chip-remove` with `aria-label="Remove filter — Closed: hidden"`.

**MEASUREMENT (painted, 1512).** `getBoundingClientRect` → **8.1×13**; `getComputedStyle` → `padding: 0`, `line-height: 13px`, `font-size: 13px`, `min-width/min-height: auto`. The chip itself (`span.gn-project__filter-chip`, 147×26) is a `<span>` with no handler, so nothing larger removes the filter. Source: `packages/ui/src/ui.css:4981-4990` — `border: none; background: none; padding: 0; margin: 0; font: inherit; line-height: 1` — no size; the chip's `font-size: 0.8125rem` (`:4972`) is what the × inherits.

**WHY IT IS WRONG.** 8×13 is a third of WCAG 2.5.8's 24-px minimum and the smallest interactive target I measured anywhere in the product. It is not in `DENSE_IN_LIST`, so by the product's rule it is judged at 44. No sweep has ever seen it: the calendar and timeline views are not routes, and the tap pass runs on `/my-work` only (E4-12).

**WHAT WOULD HAVE BEEN BETTER.** `min-width: 24px; min-height: 24px; display: inline-grid; place-items: center` on the button (the chip stays 26 tall), or make the whole chip the remove control with the × as its glyph.

---

### E4-15 — **MINOR** — The timeline's Earlier / Today / Later buttons paint with the browser's 2-px outset bevel: the class HAS a rule, and the rule forgot the border

**WHAT.** `button.gn-timeline__nav` ×3 on the Timeline view.

**MEASUREMENT (painted, 1512, light and dark).** `getComputedStyle` → `border: 2px outset rgb(0,0,0)` with the product's own `background: rgb(241,234,227)`, `border-radius: 6px`, `padding: 3.2px 9.6px` — i.e. the rule applied and the UA border survived. Source: `packages/ui/src/ui.css:3427-3434` sets `border-radius`, `background`, `color`, `font`, `padding`, `cursor` and **no `border`**. This is outside round 1's P1 population by construction: P1 selected classes with **zero** matching selector blocks; this class has one. A sweep keyed on "has a rule" reports it as styled.

**PROTOTYPE.** `Desktop.dc.html:509-511`: `min-height:36px; padding:0 12px; border:none; border-radius:var(--ctlR); background:var(--ctlBg); box-shadow:var(--ctlShadow); color:var(--accent)`. **Category 3: diverges with no ruling found** — the sibling calendar nav (`.gn-calendar__nav`, 31×36) does follow the prototype's shape, and nothing records why the timeline's does not.

**WHAT WOULD HAVE BEEN BETTER.** `border: none; min-height: 36px; background: var(--gn-fill-tertiary); color: var(--gn-text-accent)` — the calendar nav's own values.

---

### E4-16 — **MINOR** — React Flow's attribution link renders at 10 px with 1.10:1 contrast in dark mode (2.61:1 in light)

**MEASUREMENT (painted, builder route).** `a "React Flow attribution"`: `font-size: 10px`, `color: rgb(153,153,153)` on the canvas backdrop `rgb(141,145,160)` (dark) → **1.10:1**; on `rgb(248,245,241)` (light) → **2.61:1**; both under 4.5. It is the only text-contrast failure in 12 dark-mode routes and 14 light-mode routes I measured (2,600+ text elements). **Caveat stated:** this is React Flow's own element (`.react-flow__attribution`), required by its licence unless the pro option is used; the product can still restyle it (`a` colour) without hiding it. Severity Minor: third-party, decorative, but it is on a shipping route and it fails.

---


### E4-17 — **IMPORTANT** — Every keyboard interaction with the shared `Select` ends with focus dropped to `<body>`

**WHAT.** Open the ticket sheet, Tab to *Assignee*, press Enter (the listbox opens, focus on the selected option), press Escape — or press Enter to pick — and `document.activeElement` is `body`. The keyboard user is thrown out of the sheet to the top of the document.

**MEASUREMENT (painted, real key events via CDP `press_key`, 1512).** Sequence 1: `trigger.focus()` → `activeElement = button.gn-select__trigger`; **Enter** → `[role=listbox]` present, `activeElement = li.gn-select__option "Unassigned"`; **Escape** → listbox gone, sheet still open, **`activeElement = BODY`**. Sequence 2: focus trigger, **Enter**, **Enter** (re-picks the already-selected *Unassigned*, so nothing is written) → listbox gone, **`activeElement = BODY`**. Control in the same session: the account menu (`.gn-nav__menu`, `role=menu`) moves focus to its first `menuitem` on open — so focus management is possible in this codebase and this component lacks it. Source: `packages/ui/src/select/select.tsx:187-190` wires `useOverlay({ isOpen, onClose, shouldCloseOnBlur, isDismissable })` and `:199-212` portals `SelectPanel` to `document.body`; `grep -n FocusScope packages/ui/src/select/select.tsx` → **0** (the package depends on `@react-aria/focus`, `packages/ui/node_modules/@react-aria/focus` is present, and `FocusScope restoreFocus` is the React Aria primitive that returns focus to the trigger; React Aria's own `Popover` wraps its content in it).

**BLAST RADIUS.** Every `Select` mount: the sheet's Assignee, the New-ticket `Type`/`Parent` comboboxes, `/members` Role and Channel, `/account`'s style and theme toggles, the ticket-type editor's Workflow picker, the builder's per-state Category. Round 1's P11 said the panel had never been measured; this is the measurement, and it fails on focus rather than on size (the options are `184×36`, above the 24 in-list floor).

**THE CATALOGUE ALREADY NAMES THIS DEFECT — for two other components.** `test-cases/13-neomorphism-and-workspace-screens.md:1730-1731` (`13.420`, the account menu): *"Escape closes the menu AND returns focus to the trigger. The focus half is the load-bearing one: closing without it **strands focus at the document root**"*; `13-board-prototype-port.md:165-166` (`13.446`, the Filters sheet) is the same contract, mutation-verified. No case makes the claim for `Select`, and `Select` is the one that strands.

**WHY IT IS WRONG.** WCAG 2.4.3 (Focus Order) and the ARIA listbox/select pattern both require focus to return to the control that opened the popup. On a sheet with ~37 focusables, landing on `body` means Tabbing from the nav again to get back.

**WHAT WOULD HAVE BEEN BETTER.** Wrap `SelectPanel`'s content in `<FocusScope restoreFocus autoFocus>` (one import from `@react-aria/focus`), or call `triggerRef.current?.focus()` in the `onClose` passed to `useOverlay`.

---

### E4-18 — **IMPORTANT** — The Assignee picker renders a BLANK 13-px option for a member with no display name — the same member the visibility picker labels by ULID (E4-6), and this time the recorded rule is broken rather than stretched

**WHAT.** The sheet's Assignee listbox has three rows: `Unassigned` (184×36), `Kiro` (184×36) and **`""` (184×13)** — no visible text, no accessible name.

**MEASUREMENT (painted, listbox open).** `Array.from(listbox.querySelectorAll('[role=option]'))` → the third `li.gn-select__option` has `textContent === ''` and height 13 (line-height with no glyphs). Source: `packages/app-core/src/views/ticket-sheet.tsx:1672` — `...people.map((member) => ({ value: member.id, label: member.name }))` — `member.name` verbatim, no `actorLabel`. The member is `accountant@e2e.gisik-nokma.local`, `name = ''` in `"user"` (read-only select on 54330). `packages/app-core/src/provenance.ts:4-7`: *"the UI never launders a claim into an anonymous fact. A missing display name falls back to the raw actor id — attributed, **never blank**"*.

**WHY IT IS WRONG.** One member, two pickers, two answers: a 26-character id in *Who can see this* (E4-6) and nothing at all in *Assignee*. The blank one violates the product's own written rule, is unselectable by label, and is announced as an empty option by a screen reader. A person cannot assign work to this member from the sheet.

**WHAT WOULD HAVE BEEN BETTER.** One helper for "how a roster member is shown in a picker" — `name || email || id` — used by both pickers and by `standingSentence`; and a seed member with an empty name kept on purpose, because it is the fixture that reddens exactly this.

---


### E4-19 — **IMPORTANT** — The History tab's headline is the raw event-type slug — `ticket.field_set` three times in a row with nothing saying which field — where the prototype writes a sentence and the wire carries the payload the sentence needs

**WHAT.** Sheet → *History*, `CCSO-6`: six rows whose headlines read `ticket.created`, `ticket.field_set`, `ticket.field_set`, `ticket.field_set`, `ticket.transitioned`, `visibility.set`, each followed by `Kiro` · `from web` and the two clocks.

**MEASUREMENT (painted).** `document.querySelectorAll('.gn-history__event')` → 6; `.gn-history__type` texts tallied → `{ticket.created:1, ticket.field_set:3, ticket.transitioned:1, visibility.set:1}`; one full row: `<span class="gn-history__type">ticket.field_set</span><span class="gn-history__actor">Kiro</span><span class="gn-history__origin">from web</span><dl class="gn-history__clocks">…</dl>` — no field name, no value, no target state. Source: `packages/app-core/src/views/history-list.tsx:45` renders `{event.type}` verbatim; `packages/app-core/src/view-types.ts:539-549` shows the event **does** carry `payload: unknown` and `version`, neither of which the row reads. `ui.css:2115` gives the slug `font-weight: 600` — it is styled as the headline.

**PROTOTYPE.** `Gisik Nokma - Desktop.dc.html:1337-1343` draws each history row as a 17-px sentence plus a 12-px meta line; its data (`:3733-3737`) is *"Created as <type>"*, *"Assigned to <person>"*, *"State set to <state>"*, meta *"8 Sep · 11:12 · mac-01"*. **Category 3: diverges with no ruling found.** The component's docblock (`history-list.tsx:1-27`) rules on the CLOCKS (both shown, IST, labelled) and the ACTOR (never anonymous) and says nothing about the label; `grep -rn "raw event type\|gn-history__type" docs Features.md test-cases` finds only the plan's transcription of the same markup (`2026-08-20-06-web-client.md:5864`).

**WHY IT IS WRONG.** *"The history view IS the ledger"* (`:2`) — and this ledger cannot be read: three identical `ticket.field_set` lines tell a person nothing about what was set. The two-clock discipline the docblock defends is undermined by a headline that is an identifier. It is the same class as E4-4's `description` and E4-6's ULID: an internal name painted as a label.

**WHAT WOULD HAVE BEEN BETTER.** A small `describeEvent(type, payload)` — `field_set` → *"Set <field> to <value>"*, `transitioned` → *"Moved to <state>"*, `visibility.set` → *"Visibility: <mode>"* — with the slug kept as a `title`/secondary line for the reader who wants the wire name. The prototype's sentences are the spec for the shape.

---


### E4-20 — **MINOR** — The workflow builder opens with `fitView`, so every control on a state node is painted at 74 % of its size on a 1512-px desktop (a 10×10 Blocked checkbox, ~9-px labels) and at ~52 % on a phone; the prototype draws the canvas at 1:1 inside a scrolling card

**MEASUREMENT (painted).** 1512×900: `.react-flow__viewport` `transform: matrix(0.744928, …)`; canvas `564×480`; per node `input.nodrag "Blocked"` → **10×10**, `button.gn-select__trigger "Category"` → **103×33** (the 44-px control at 0.745), `span "Start"` `font-size: 12px` painted in a `22×13` box (~9 px). 390×844: the same checkbox → **7×7**, the trigger → `69×22`. 768: `10×10`. Source: `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx:57` `fitView`; `.gn-workflow-canvas { height: 100%; min-height: 480px }` (`ui.css:2179`). The type-scale sweep reads computed `font-size` (12px, above its 12-px floor) and cannot see the transform — painted text under the floor that no instrument can report.

**PROTOTYPE.** `Desktop.dc.html` `isBuilder` block (`:1012`), lines `:1026-1028`: the canvas card is `overflow:auto; min-height:480px` around a fixed `820×520` drawing — nodes at 1:1, scroll for the rest. **Category 3: diverges with no ruling found** (`grep -n "fitView\|zoom" docs/superpowers/plans/2026-08-20-08-workflow-builder.md` → the prop in a code listing at `:3087`, no sentence about it).

**WHY IT IS WRONG.** The Blocked checkbox is wrapped in its `<label>` (`state-node.tsx:46-56`), so the label is the target — but the label's painted height is ~13 px too. A person can pinch or scroll-zoom, but the first paint is the one that has to be legible.

**WHAT WOULD HAVE BEEN BETTER.** `fitView={false}` with `defaultViewport={{ zoom: 1 }}` and the prototype's scrolling card, or `fitViewOptions={{ minZoom: 1 }}` so fit never shrinks below 1:1; and give the canvas more height than 480 px on a 900-px viewport.

---


### E4-21 — **IMPORTANT** — The searchable `Select` (New-ticket *Type* and *Parent*, the type editor's *Workflow*) has no visible focus indicator: the rule that suppresses the input's outline has no replacement

**MEASUREMENT (painted, New-ticket dialog, 1512).** `input[role=combobox]` focused: `input.matches(':focus-visible')` → **true**; `outline-style: none`; the wrapping `div.gn-select__trigger.gn-select__trigger--searchable.gn-field__input` → `outline-style: none`, `box-shadow` unchanged from its resting neo inset (`rgba(176,152,132,0.6) 4px 4px 9px inset, …`), `:focus-within` true. Control in the same dialog: the bare Title input focused → `outline: auto 1px rgb(0,95,204)` (the UA ring). Source: `packages/ui/src/ui.css:2474` `.gn-select__trigger--searchable input:focus { outline: none; }`; the only focus rule for the field class is `.gn-field__input:focus-visible` (`:4771`), which matches the **div** when the div is focused — and in the searchable variant the div is never focused, the input is. `grep -n "focus-within" packages/ui/src/ui.css` → **0**. The three mounts: `new-ticket-dialog.tsx:145`, `:204`, `ticket-type-editor-screen.tsx:360`.

**WHY IT IS WRONG.** WCAG 2.4.7 (Focus Visible, AA): a keyboard user Tabbing through the New-ticket dialog sees the ring on Title, then nothing on Type, nothing on Parent. The rule at `:2474` is the classic outline-suppression-without-replacement; `.gn-project-card__door:focus-visible { outline: none }` (`globals.css:1160-1164`) shows the repo knows the right shape — it suppresses and immediately re-draws on `::after`.

**WHAT WOULD HAVE BEEN BETTER.** `.gn-select__trigger--searchable:focus-within { outline: 2px solid var(--gn-focus-ring); outline-offset: 1px; }` beside the suppression, or drop the suppression.

---


### E4-22 — **MINOR** — The mobile board's rows are `TouchableOpacity`s with no `accessibilityRole`, so VoiceOver/TalkBack reads each row as text, not as a button

**MEASUREMENT (source; `apps/mobile` has never been rendered — `Features.md` marks it `⚙️`, and I did not run a simulator).** `apps/mobile/src/screens/board-screen.tsx:60-66`: `<TouchableOpacity onPress={() => navigation.navigate('Ticket', …)}>` with no `accessibilityRole`, `accessibilityLabel` or `accessibilityHint`; `grep -c "accessibilityRole\|accessibilityLabel"` → 2 in the file, both on the sync-status `<Text accessibilityRole="text">` (`:52-53`), none on the row. The row text is `{item.title} · {item.stateId}` — the raw state id, which `docs/pre-launch-checklist.md:402` records as *"keep the raw `stateId` display until a ruling"* (the HIG audit's row C at `docs/hig-reconciliation-audit.md:317` is the source), so the label is category 2 and not claimed; the missing role is not in that record.

**WHY IT IS WRONG.** React Native's `TouchableOpacity` is `accessible` by default but announces no role; a screen-reader user hears *"Order more till roll · next"* with no indication it can be activated. `accessibilityRole="button"` is one prop.

**WHAT WOULD HAVE BEEN BETTER.** `accessibilityRole="button"` and `accessibilityLabel={\`${item.title}, ${stateName}\`}` on the row; the same on `ticket-screen.tsx`'s contest `View` (`:108`), which carries `accessibilityRole="alert"` but whose three `<Button>`s are the only labelled controls.

---


### E4-23 — **IMPORTANT** — A ticket the server answers `404` for — never existed, soft-deleted, or invisible to this viewer — opens a sheet that says **"Loading…"** forever: the client believes it is waiting while the server has already refused

**WHAT.** `…/p/<projectId>?ticket=01EXF5XW3ZZZV7PD0P6B5HWGP0` (one character off a real id). The sheet opens titled *Ticket*, body **`Loading…`**, and stays there.

**MEASUREMENT (painted, 1512).** `[role=dialog]` `aria-label="Ticket"`, `innerText = "Ticket\n×\n\nLoading…"` at 2.5 s, **8.5 s and 18.5 s**; in the same window `fetch('/v1/workspaces/<ws>/tickets/01EXF5XW3ZZZV7PD0P6B5HWGP0')` from the page → **`404 {"error":"not_found"}`**, and the console shows the same 404 for the page's own request. Mechanism, opened: `packages/app-core/src/online/http.ts:92-97` — *"404 answers `null` on a GET, and ONLY on a GET … 404-as-`null` is a READ affordance"*; `online-data-source.ts:271-274` — `getTicket` returns `raw === null ? null : mapTicketRead(…)`; `ticket-sheet.tsx:618-631` — `read.error !== null` → the refusal sentence, **`read.data === null` → `Loading…`**. A 404 arrives as `data: null, error: null`, which is the loading arm. The server gives that answer for **three** conditions with one body (`apps/server/src/routes/tickets.ts:300-302`: *"Every refusal on this surface is the same 404 … A direct read of an invisible ticket is `404 {error:'not_found'}`"*; `:377`: *"A SOFT-DELETED ticket is 404 on its own detail route"*), so a deleted ticket's stale link and a colleague's restricted ticket both paint an endless wait. **Contrast, same session:** a bad project id paints `The board cannot be shown yet. HTTP 404 for /v1/projects/…/board` (`p.gn-shell__refusal`), a bad workspace paints *"This is not one of your workspaces…"*, a bad invite token paints *"This invitation link does not open anything…"* — the product knows how to refuse; the sheet is the surface that does not.

**THE PRODUCT'S OWN WORDS.** `ticket-sheet.tsx:391-395`: *"a failure drawn under the word 'Loading…' is a wait that never ends dressed as a wait that will"*; `:404-405`: *"`data` is null on a failure AND on a real absence, and an error must never render as an absence."* The docblock names the *absence* case and the component gives it no arm — the three-way distinction it claims (answer / wait / failure) has no fourth state for "the server said there is nothing here", and the second one absorbs it.

**WHY IT IS WRONG.** This is the brief's ninth edge class verbatim — *the server refuses while the client believes*. The person sees a spinner-equivalent with no way to learn the ticket is gone or restricted, on the product's most-used overlay, and every stale link in a comment, an email or the browser history lands here.

**WHAT WOULD HAVE BEEN BETTER.** Let `getTicket`'s `null` reach the sheet as a distinct state — `read.data === null && read.settled` → *"This ticket is not here — it may have been deleted, or you may not be able to see it."* (the server's one-body refusal means the sentence must name both), with the `Loading…` arm reserved for `!settled`. `useLiveQuery` already knows when a read resolved; it only needs to say so. One painted case at `?ticket=<never>` asserting the sentence.

---

## 4. MATCHES AND RULED DIVERGENCES CHECKED

_(so §3 is not a list of defects — each row is a measurement I took that came back clean or ruled)_

| comparison | class | evidence |
|---|---|---|
| **Text contrast, light theme, neo style** | **MATCHES** (4.5:1 / 3:1) | my composited sweep over 14 signed-in routes + 4 project views + sheet open: `contrastMeasured` 12–1248 text elements per route, **0 failures** except React Flow's attribution (E4-16). Method: ancestor-composited `background-color`, alpha over white, WCAG 2.x luminance; gradients/images skipped (0 skipped on every route). |
| **Text contrast, dark theme** (`emulate colorScheme: dark`, body `rgb(27,35,64)`) | **MATCHES** | same sweep over 12 routes + 4 views, **0 failures** except the attribution link (1.10:1). |
| **Horizontal overflow at 390** | **MATCHES** on 13 routes; **FAILS** on the builder (E4-9) | `document.documentElement.scrollWidth` = 390 everywhere except `/settings/workflows/<id>` (415). |
| **Horizontal overflow at 768** | **MATCHES** | 7 routes incl. sheet open, all 768. |
| `.gn-nav` links at 390 | **MATCHES the 44 floor** (every link `h=44`) — the bar's HEIGHT is E4-11 | painted `y`/`h` per link. |
| Segmented view tabs | **MATCHES** 44 tall at 390 and 1512 (`13-hig-per-screen.md:433` records the 40-px miss and its fix) | painted `92×44` ×5 / `69×44` ×5. |
| Editor toolbar buttons `34×32` | **MATCHES the prototype's `min-height:32px;min-width:34px`** (`Desktop.dc.html:3679`) — below the product's 44 but the authority draws 32; only the FILL diverges (E4-8) | painted. |
| Calendar nav `31×36` / Today `71×36` | **MATCHES** prototype `:483-486` (`min-height:36px; padding:0 12px`) | painted. |
| Sheet width `640` vs prototype `min(660px,100%)` | **DIVERGES AND RECORDED** — `ui.css:387-391` states the 20-px difference and why it is harmless to the slide | painted `w=640`. |
| Sheet close via Escape | **MATCHES** (Escape closes; with a Select open, a real Escape closes only the listbox) | `press_key Escape` ×2. |
| Account menu (`role=menu`) | **MATCHES** 13.420/13.423 — focus moves to the first `menuitem` on open; items `212×44` | painted. |
| Filters panel | **MATCHES** 13.445/13.446 — focus enters the panel on open (`activeInDialog: true`); choices `74–116×35` (in-list) | painted. |
| Whole board card opens the ticket (13.523) | **MATCHES** — the `<li>` slot carries the handler, which is why the 23-px title button is exempt (E4-3) | `board.tsx:961-1000`. |
| `Switch` (`51×31` input) | **MATCHES HIG** and exempt — wrapped in its `<label>` (`switch.tsx:22-31`) | painted. |
| Visibility radios/checkboxes `13×13` | **exempt** — each wrapped in its `<label>` (`visibility-editor.tsx:404-411`); the LABEL text is E4-6 | painted `labels: 1` each. |
| `lang="en"`, one `<main>` per route (except E4-9), no `<img>` without `alt`, no unlabelled standalone `<svg>` | **MATCHES** on every route swept | sweep counters `imgNoAlt: 0`, `svgUnlabelledStandalone: 0`, `mainCount: 1`. |
| Headings: an `<h1>` on every route except the builder and its history page | **MATCHES / RECORDED** — the builder's h1 gap is written at `ui.css:2959-2967` with an owner | sweep `counts.h1`. |
| The builder's `Settings › Workflows` crumb and the type editor's `Ticket types` back link | **MATCHES the prototype's shape** (`Desktop.dc.html:1016`, a 13-px link in a `<p>`) — 126×15 / 77×16 is what the authority draws | painted. |
| Member roster's `HiddenSelect`s (`74×20`, `83×20`, `95×20`) | **not a defect** — React Aria's visually-hidden native select inside a `1×1 clip:rect(0,0,0,0)` wrapper, `tabindex=-1`; **but a note for the instrument:** the product's tap sweep's visibility test (`display`, `visibility`, `width===0`, `height===0`) would count them as offenders on any route with a `Select`, which is one more reason the population is one route | painted chain of five ancestors. |
| Visibility roster cut (`own_user_ids`/`resolved_user_ids` refused) | **RULED** — already classified category 2 by the compiled ruling; not re-examined | — |
| Whole-board empty state, parent crumb title-only, 4-mode visibility radio, visibility `<section>` outside the `<dl>` | **RULED** in `review-compiled-controller.md` §4 rows 1, 2, 6, 7 — not re-raised | — |

---

## 5. PHASE-2 CANDIDATES (noted now, filed in `review-refutations-exec4.md` after T0+6h)

1. **`exec1-P1`'s stated cause for the seventh member.** P1 says `a.gn-nav__signin` is *"painted by accident"* because its class has no rule; `globals.css:1925-1926` `.gn-nav a, .gn-nav button` and `:1968` `.gn-nav a` style every anchor in the bar by descendant selector — the class is unnecessary, not the element unstyled. The finding's own paint (77×44, `offenders=0`) already showed it. A refutation of the *mechanism* of one member, not of the finding; to be measured against the painted `:3041` legal nav before filing.
2. **`exec1-P13` severity.** Round 1 narrowed to keyboard-only non-AT users; `<main>` is a bypass for AT. Nothing to refute; noted only because the compiled ruling accepted it "in the narrowed form".
3. **Round 1's coverage reason** (*"`:3001` serves a baked image predating `main`"*) was true when written; the container was re-created `2026-09-21T02:50Z`. Not a refutation of a finding — a note that the door I used (this tree on `:3041`) was open to any lane.
4. **The controller's own §4 row 2** (parent crumb title-only "stands; a three-file change for a disambiguation case"): E4-1 shows the disambiguation case is the seed's majority case (23/26) and the crumb is not merely undifferentiated but DUPLICATED. If a peer files the title-only divergence again, this is the measurement that changes its weight.

---

## 6. COVERAGE STATEMENT, GRAPHIFY USE, AND THE COUNT BY SEVERITY

### 6.1 What was reviewed, and how

**Painted, on this tree (`a7b6292b`, `next dev -p 3041`, signed in as the e2e seed owner), Chrome via chrome-devtools MCP:**

| width · theme | routes / states measured (each: my tap/name/UA-chrome/tiny-text/heading/landmark sweep with the product's own selector list, plus the composited text-contrast sweep) |
|---|---|
| **1512×900 · light · neo** | `/sign-in`, `/workspaces`, `/w/:id`, the board and its **List, Backlog, Calendar, Timeline** views, the **ticket sheet open** (Details and History tabs), the **New-ticket dialog**, the **Filters panel**, the **Move dialog**, the **Assignee listbox open** (real Enter/Escape keys), the **account menu open**, `/inbox` (empty), `/account`, `/settings`, `/members`, `/my-work`, `/settings/ticket-types` (list, `new`, `errand`), `/settings/workflows` (list, `new`, builder, history), `/help`, `/mcp/tokens` |
| **390×844 · light · neo** (`emulate …,mobile,touch`) | the board, the sheet open (with screenshot), `/inbox`, `/account`, `/my-work`, `/members`, `/settings`, ticket-types list/`new`/`errand`, workflows list/`new`/builder/history, `/help`, `/mcp/tokens` |
| **768×1024 · light · neo** | the sheet open on the board, `/workspaces`, `/w/:id`, `/members`, the builder, `errand`, `/account` |
| **1512 · dark** (`emulate colorScheme: dark`) | the sheet open, `/workspaces`, `/w/:id`, `/my-work`, `/members`, `/settings`, `errand`, the builder, `/account`, `/inbox`, `/help`, `/mcp/tokens`, and the four board views |

Screenshots taken and **committed** under `docs/lanes/exec4-paint/`: `board-1512.jpeg`, `board-390.jpeg`, `sheet-390-description.jpeg` (JPEG q55–60, 260 KB total). The numbers in the findings are from `getBoundingClientRect`/`getComputedStyle`; the screenshots are the human check.

**Read in source, driven by the paint (ranges opened, not whole files):** `ticket-sheet.tsx` (`:1500-1570`, `:1740-1800`, `:1660-1675`, `:2395-2460`), `board.tsx` (`:961-1060`), `visibility-editor.tsx` (`:236-246`, `:396-415`), `history-list.tsx` (`:1-50`), `new-ticket-dialog.tsx` (`:124-134`), `provenance.ts` (`:1-34`), `view-types.ts` (`:3`, `:60`, `:535-549`), `routes/tickets.ts` (`:600-672`), `sheet.tsx` (`:111`), `switch.tsx`, `select.tsx` (`:185-215`, `:240-254`), `TicketEditor.tsx` (`:85-125`), `editor.css` (`:1-20`, `:105-165`), `template-gallery.tsx`, `workflow-builder-screen.tsx` (`:20-45`, `:131`), `workflow-canvas.tsx` (`:45-62`), `state-node.tsx` (`:40-60`), `w/[workspaceId]/page.tsx` (`:742-815`), `next.config.ts` (`:9`, `:91-94`), `globals.css` (`:80-106`, `:1150-1168`, `:1720-1815`, `:1925-1990`), `ui.css` (the blocks each finding cites), the three sweep modules (`tap-targets.ts` in full, `type-scale.ts` `:60-90`, `accessible-names.ts` `:48-90`), `e2e-stack/viewport.spec.ts` (`:1-120`, `:160-260`, `:425-720`), the three baseline JSONs, `board-screen.tsx`, `apps/desktop/src/app.tsx` (`:140-165`), `index.html`. The class-less-tag regex pass covered all 123 non-test `.tsx` files under `packages/` and `apps/web/`.

**Prototype comparisons made (all against the staged export, shas in the header):** sheet crumbs (`:3404-3425`), sheet close (`:1121`), sheet width (`:3398`), description field (`:1165-1173`, `:1580`), descTools/cmtTools (`:3669-3680`), history rows (`:1337-1343`, `:3733-3737`), calendar nav (`:483-486`), timeline nav (`:509-511`), builder canvas/crumb (`:1012-1028`), New-ticket title (`:1580`); the mobile export's tab bar (`:1194-1203`) and header (`:99-114`). The three spec `.md` files were opened and none bears on a finding here.

**Case ids opened by hand:** `13.420`, `13.423`, `13.445`, `13.446`, `13.461`, `13.523`, `13.351`, `16.63`, `16.64`, `16.83`, `11.121`, `15.31`, the tap-target section of `13-pre-launch-checklist.md` (`:555-640`) and its parent record (`docs/pre-launch-checklist.md:586-600`). **Every one still holds and is witnessed** as far as I checked; the finding about them is the negative space — no case sets `parent.id === epic.id` (E4-1), no case names `Select`'s focus return (E4-17), no baseline key exists for any tap-target route but `/my-work` (E4-12).

### 6.2 NOT REACHED — the honest boundary, as a list

1. **The nine edge classes — what was painted and what was not.**

   | edge class | painted? | result |
   |---|---|---|
   | EMPTY | yes | inbox (empty), the board's empty columns, My Work's four empty sections — all draw a sentence; no finding |
   | ERROR | yes, by URL | bad project → `The board cannot be shown yet. HTTP 404 for /v1/projects/…/board` (`p.gn-shell__refusal`; the word *yet* on a 404 is a small overclaim I note and do not file); bad workspace → *"This is not one of your workspaces…"*; bad ticket → **E4-23** |
   | PERMISSION-REFUSED | partly | the bad-workspace and bad-invite sentences above; a real second role (guest/member) was **not** taken — it needs an invitation or a role change, which writes to the owner's DB |
   | OFFLINE / REPLICA-DEGRADED | yes (`emulate networkConditions: Offline`) | a client-side navigation while offline falls through to Chrome's `ERR_INTERNET_DISCONNECTED` page; no in-app indication. **Ruled**: `docs/manual.md:1215` *"The browser version is online-only. It has no offline queue at all"* — category 2, not filed. The replica apps were not run. |
   | SOFT-DELETED | by mechanism | the server answers a deleted ticket's detail route with the same `404` (`routes/tickets.ts:377`), so it paints E4-23's endless `Loading…`; I did not delete a ticket to paint it directly |
   | CONCURRENT / INTERLEAVED | no | needs a second writer; `contest-banner.tsx` and the sheet's contest arms were **not read** |
   | NARROW VIEWPORT | yes, thoroughly | E4-7, E4-9, E4-11, E4-20 |
   | FIRST-RUN | no | needs a workspace with no projects / a fresh account; not created |
   | SERVER REFUSES WHILE CLIENT BELIEVES | yes | **E4-23**; also observed but not filed: the bad-project page keeps `New ticket`, `Filters` and the five view tabs live under the refusal, and the bad-workspace page keeps `My Work / Members / Settings` links pointing into the refused workspace |

   `shell-refusal.tsx`, `sync-status-bar.tsx`, `contest-banner.tsx`, `expired-session.tsx` were **not read**; the sheet's refusal arms were (E4-23). One functionality observation handed across concerns rather than claimed here: while the page sat open the console logged `WebSocket connection to 'ws://localhost:3000/v1/stream' failed: … Unexpected response code: 429` **90 times in ~20 s** — the live-stream reconnect loop is being rate-limited by its own server, which is exec 3/6's territory.
2. **Overlays not opened:** the bulk-close dialog, the reopen dialog, the workflow-rebind dialog, the state-mapping dialog, the transition dialog's field/evidence arms, the evidence picker, upload chips, the image-wrap menu, the mention popup, the saved-filters menu, the InfoTip, the Toast. `packages/ui`'s `avatar`, `card`, `chip`, `info-tip`, `table`, `toast`, `tokens.ts` were **not read**.
3. **The classic (non-neo) style axis** was not measured — the seed owner's preference is `neo` and switching it writes a preference. Every painted number here is `data-style="neo"`.
4. **Signed-out routes** beyond `/sign-in` (`/help` I did paint signed-in; `/privacy`, `/terms`, the 404, `/invite/<token>`, `/mcp/authorize`) were not re-measured — round 1 ran the signed-out suite (31 passed) and its port `:3021` is not mine.
5. **`apps/mobile` and `apps/desktop`** were not rendered (no simulator, no Tauri build); one source finding each (E4-22; the desktop list is round 1's P7).
6. **The 41 `app-core` non-view components** were reached only where a painted route mounted them (builder, type editor, help, inbox shell, account sections); `calendar-view.tsx`, `timeline-view.tsx`, the inspectors and rule editors were **not read**, only painted.
7. **Case ids:** of my stated subset (~700 across the six UI files plus `3.1–3.144`), **14 were opened**. The rest were not. `check:citations` was not run.
8. **200 % zoom / `prefers-reduced-motion` / high-contrast / RTL** — not measured.
9. **The `.gn-*` families that were never in a campaign** — I did not enumerate the campaign rosters and diff them; the timeline nav (E4-15) and the editor strip (E4-8) were found by paint, not by roster.

### 6.3 Graphify — how it was used, and what it gave

The owner ordered graph-first. I did: `graphify-out/GRAPH_REPORT.md` header, hubs, god nodes and the 610-entry community index were read before any file; `graphify explain "SegmentedControl"` was run. **Result: the code layer holds import / contains / re-export edges only** — `SegmentedControl` has three edges, all module-level, and no edge to any of its seven JSX render sites; of 610 communities, one is UI-named (`ticket-list.tsx`) and the ten god nodes are all server/test infrastructure. For a rendering-and-accessibility concern the graph located nothing I could not get from `find` in one command, so I stopped using it after those two calls and say so rather than pad the section. `mcp__semble__search` was not used either: the paint told me which file to open, and the file told me the line. Token spend went to the browser instead, which is where this concern's evidence lives.

### 6.4 The count by severity — members named

| claimed severity | count | members |
|---|---|---|
| **Critical** | **0** | — |
| **Important** | **17** | E4-1 · E4-2 · E4-3 · E4-4 · E4-5 · E4-7 · E4-8 · E4-9 · E4-11 · E4-12 · E4-13 · E4-14 · E4-17 · E4-18 · E4-19 · E4-21 · E4-23 |
| **Minor** | **6** | E4-6 · E4-10 · E4-15 · E4-16 · E4-20 · E4-22 |
| **total** | **23** | `17 + 6 = 23`; ids `E4-1` … `E4-23` with no gaps |

**Prototype classification of the 22:** category 3 (diverges, no ruling found): E4-1, E4-2, E4-7, E4-11, E4-13, E4-15, E4-19, E4-20. Category 2 argued against the record: E4-6, E4-8, E4-3 (record superseded by the 2026-09-20 ruling). No prototype counterpart / pure accessibility, instrument or edge-class: E4-4, E4-5, E4-9, E4-10, E4-12, E4-14, E4-16, E4-17, E4-18, E4-21, E4-22, E4-23.

**Overlap with round 1, stated:** E4-10 and E4-15 are new members of P1's class found by widening the population (class-less tags; classes whose rule forgot the border) and painted; E4-12 widens P11's scope from one component to the suite's population; E4-2 carries a painted reproduction of P8's focus finding as corroboration only. Nothing else overlaps.

**Report complete at the time of the last push recorded in `git log origin/exec4/review-ui`; the phase-2 refutation file will be a separate commit after T0+6h.**

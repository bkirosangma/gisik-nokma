# REVIEW ROUND 2 — EXECUTOR 4: UI (rendering layer + accessibility)

**Lane:** exec 4 (Opus) · branch `exec4/review-ui`, cut from `origin/main = a7b6292b78c50208e8055c9f8639b1e8dcf4caa0` · **started 2026-09-21 09:42:01 IST** (T0 = 09:41:50 IST per `controller-state.md`; phase 1 closes 15:41:50 IST).
**Method:** enumerate → cover → state coverage including what was **not** reached. No fix branch, no fix commit, no PR.
**Prototype authority:** the staged export at `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/`, shas re-measured by me at start (`shasum -a 256`): `Gisik Nokma - Desktop.dc.html` = `3d142d464a070b33…`, `Gisik Nokma - Mobile.dc.html` = `14ca5b8d89ab2f2b…`, bundle `Gisik Nokma Desktop.html` = `bf64cc446880281f…`. **The repo's `design-system/interactive/desktop.dc.html` is NOT used as a comparison surface.**
**Round-1 report in scope for dedup:** `docs/lanes/review-ui-exec1.md` (18 findings `I1–I5`, `P1–P13`, all ACCEPTED in `docs/lanes/review-compiled-controller.md`). Re-finding any of them scores 0; every finding below states what it adds over the landed one where there is overlap.

---

## 0. THE ONE-LINE ANSWER

_(written last — see §6)_

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

_(written last — see §6)_

---

## 3. FINDINGS

_(ids `E4-<n>`; each carries WHAT · WHY · BETTER · MEASUREMENT · SEVERITY)_

### HOW THE PAINTED MEASUREMENTS WERE TAKEN — the door round 1 did not have

Round 1's stated #1 boundary was *"NO signed-in route was measured at paint"*, because `:3001` serves a baked image. I did not use `:3001`. I ran **this tree's** Next shell on my own port — `pnpm install --prefer-offline --frozen-lockfile` (6 s), `pnpm run build` in `domain`, `rule-engine`, `sync-client`, `ui`, `editor`, `app-core` (one package at a time, all `exit=0`), then `next dev -p 3041` from `apps/web` with `SERVER_ORIGIN=http://localhost:3000` (the default at `apps/web/next.config.ts:9`) — so `/v1/*` proxies to the owner's running API and the **pages are this worktree's source**. Positive controls before any number was believed: `lsof -p <next pid>` → `cwd /Users/kiro/my_projects/gisik-nokma-exec4/apps/web`; `curl :3041/v1/me/workspaces` → `401 {"error":"unauthenticated"}` (the hop). Sign-in: the server's better-auth refuses `callbackURL` on `:3041` (*"Invalid callbackURL"*, painted in the sign-in page's live region) — so I signed in **as the e2e seed owner `kiro@e2e.gisik-nokma.local`** through `:3001`'s form + the Mailpit link, and the `localhost` session cookie (host-scoped, not port-scoped) carried to `:3041`. Browser: Chrome via the chrome-devtools MCP — `take_snapshot` (the accessibility tree), `evaluate_script` (`getBoundingClientRect`/`getComputedStyle`), `emulate` (`390x844x2,mobile,touch` / `1512x900x1`), `take_screenshot`. **No ticket, comment, member or setting was created or changed**; the only writes are the session rows sign-in itself makes. No `docker compose` command was run.

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

**MEASUREMENT (painted, `:3041`, 1512×900, sheet open).** `getBoundingClientRect()` → `w 23.59, h 21.20`; `getComputedStyle` → `padding: 1px 6px` (the UA's), `min-width: auto`, `min-height: auto`, `font-size: 19.2px`, `background: rgba(0,0,0,0)`. **No backdrop element exists** (`document.querySelector('[class*="backdrop"]')` → `null`), so click-outside is not an equivalent; Escape is a key, not a control. Source: `packages/ui/src/ui.css:720-728` sets `font`, `font-size: 1.2rem`, `line-height: 1`, `border: none`, `background: none`, `color`, `cursor` — **no `min-height`, `min-width`, `padding` or `display`**. Markup `packages/ui/src/components/sheet.tsx:111`.

**PROTOTYPE.** `Gisik Nokma - Desktop.dc.html` (`3d142d46…`) `:1121`: the sheet's close is `width:32px;height:32px;border-radius:999px;background:var(--ctlBg);box-shadow:var(--ctlShadow)` — a 32-px filled circle. **Category 3: diverges with no ruling found.** `grep -n "gn-sheet__close\|close.*32\|Close sheet" packages/ui/src/ui.css docs/lanes/review-compiled-controller.md docs/superpowers/plans/*.md` → the only hits are the rule itself and the markup; no ruling text.

**WHY IT IS WRONG.** The product's own floor rule is *24 for declared in-list controls, 44 for everything else* (`apps/web/e2e-viewport/tap-targets.ts:23-45`). This control is declared nowhere (`DENSE_IN_LIST` has four entries, `:139-186`, none of them this), so it is judged at 44 and paints at 21. **It has never been in any sweep's population** because no instrument opens the sheet (`measureTapTargets` has one call site in the stack suite, `e2e-stack/viewport.spec.ts:170`, on `/my-work` only; the sheet is not on `/my-work`). Round 1's P11 made the "never on screen when a sweep runs" argument for the Select panel; this is the same blindness on a control a person uses every time they open a ticket.

**WHAT WOULD HAVE BEEN BETTER.** The prototype's own numbers: `min-width: 32px; min-height: 32px; border-radius: 999px; background: var(--gn-fill-tertiary)` — or the product's 44 — on `.gn-sheet__close`; and one sweep that opens a sheet before measuring.

---

### E4-3 — **IMPORTANT** — Every board card carries a 66×21 px `who · when` disclosure button that no sweep has ever measured and that no floor rule admits

**WHAT.** `button.gn-board-card__provenance` — toggles the state-provenance line on each card (`aria-expanded`). It is not the card's open control; nothing larger performs its function.

**MEASUREMENT (painted, `:3041`, board `/w/…/p/0XB92YA4CGEBF9S285AH4SDXR1`, 1512×900).** My in-page sweep with the product's own selector list (`tap-targets.ts:268-280`) and visibility filter: **24 instances** (one per card; `document.querySelectorAll('button.gn-board-card__provenance').length` → 24, `.gn-board-card` → 24), each `66×21`, `display: inline-block`, not inline-in-prose (the exemption at `:341-343` requires `display: inline`). Source: `packages/ui/src/ui.css:990-998` — `font-size: 0.78rem; padding: 0.2rem 0 0; border: none; background: none` — no min size. Handler: `packages/app-core/src/views/board.tsx:1052-1059`, `onClick={() => setUnfolded(v => !v)}` — a disclosure, distinct from the card's `onOpen` (`:1036`, and the whole slot at `:990`, case 13.523).

**WHY THE SIBLING IS NOT A FINDING AND THIS IS.** `button.gn-board-card__title` also paints under 44 (e.g. `181×23`) but the whole card slot opens the same ticket (`board.tsx:961-1000`, 13.523), which is WCAG 2.5.8's *Equivalent* exception. The provenance toggle has no equivalent.

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

## 4. MATCHES AND RULED DIVERGENCES CHECKED

_(so §3 is not a list of defects)_

---

## 5. PHASE-2 CANDIDATES (noted now, filed in `review-refutations-exec4.md` after T0+6h)

---

## 6. COVERAGE STATEMENT, GRAPHIFY USE, AND THE COUNT BY SEVERITY

_(written last)_

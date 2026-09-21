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

_(appended as produced; ids `E4-<n>`; each carries WHAT · WHY · BETTER · MEASUREMENT · SEVERITY)_

---

## 4. MATCHES AND RULED DIVERGENCES CHECKED

_(so §3 is not a list of defects)_

---

## 5. PHASE-2 CANDIDATES (noted now, filed in `review-refutations-exec4.md` after T0+6h)

---

## 6. COVERAGE STATEMENT, GRAPHIFY USE, AND THE COUNT BY SEVERITY

_(written last)_

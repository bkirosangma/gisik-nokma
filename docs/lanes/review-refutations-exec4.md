# REVIEW ROUND 2 — EXECUTOR 4 (UI): PHASE-2 REFUTATIONS AND CORROBORATIONS

**Lane:** exec 4 · branch `exec4/review-ui` · phase 2 window as re-timed by the controller: **15:05:23 → 17:05:23 IST, 2026-09-21** (phase 1 closed early by the owner). **Written after 15:05:23.** Instrument: the same `:3041` shell of `a7b6292b` described in `review-ui-exec4.md` §3, driven with real key events where a claim is about keys.

## 0. What this file claims for points

**No scored refutation.** Every peer finding I could reach with the painted instrument held (§1) — ten of them, across four lanes. The rules make a rejected refutation cost the target's points; I will not file one I cannot falsify with a line I opened. What follows is unscored: painted corroborations the judge can cite, and two factual notes.

## 1. Corroborations — painted, NOT claimed for points, recorded so the judge has a line to open

| target | what I painted | result |
|---|---|---|
| `exec1-P19` (tablist with no name) | board, 1512: `[role=tablist].gn-segmented` → `aria-label` null, `aria-labelledby` null, 5 tabs | **holds** |
| `exec1-P24` (danger on surfaceSunken 3.84:1, computed by its author) | `/settings/ticket-types/new`, `data-style=hig`/`minimal` set client-side: `.ticket-type-editor__issues li` `rgb(215,0,21)` on `rgb(228,216,204)`, 12.8 px → **3.84:1**; `neo` → 6.28:1 | **holds at paint** |
| `exec1-P18` (route change announces nothing) | every `window.next.router.push` in my sweeps left `document.activeElement === BODY` | **holds** |
| `exec2-V4` (Comments · 0 while loading) | MutationObserver from t=0 on the epic's sheet: `Comments · 0` is the first heading text at t=1087 ms | **holds** |
| `exec2-V8` (false subtasks alert) | same observer: `role="alert"` *"…0 could be read — so this list is not shown rather than shown short."* present t=1087→1111 ms (~24 ms), then 10 rows | **holds; duration measured** |
| `exec5-E5-20` (Escape in Move dialog closes the sheet) | focus on the dialog's *Cancel*, one real Escape → both `[role=dialog]`s gone, `?ticket=` left the URL | **holds** |
| `exec5-E5-4` (blank rows) | assignee listbox: third option `""` 184×13 — **holds**; @mention popup with `@`: the nameless member is **excluded** (*"1 person matches"*, Kiro only), not blank — the finding's body already says *"if listed"* | holds; one clause narrower |
| `exec1-P24` (danger on surfaceSunken) — see row 2 | also measured in the same pass: `neo` light 6.28:1 (passes), so the failure is `hig`/`minimal` only, as P24 says | holds |
| `exec1-P22` (two `role="menu"` without names) | account menu opened on `:3041`: `[role=menu]` attributes are exactly `id`, `role`, `class` — no `aria-label`, no `aria-labelledby` | **holds** |
| `exec5-E5-32` (signed-out deep link bounces with no `next`) | isolated browser context (no cookies), `…/p/<project>?ticket=<id>` → `location.href` = `http://localhost:3041/sign-in`, `sessionStorage` and `localStorage` both empty; `/workspaces` → the same | **holds** |

## 2. Notes that are not refutations

- **Independent overlap, timestamps stated:** exec 5's `E5-3` / `E5-4` / `E5-8` and my `E4-1` / `E4-18` / `E4-19` describe the same painted facts; theirs were pushed first (10:02–10:06), mine at 10:16–10:43, and I first read their branch at 11:35. The measurements differ (mine carry the dev-DB ancestor query and the 23/26 count, the server walk, the `184×13` box, the six-row tally). The concurrent-duplicate clause is the judge's to apply; I state the order so the judge does not have to reconstruct it.

- `exec1-P2`'s WHY sentence — *"the first-run surface … is a sentence in inherited text and a UA button"* — describes a button (`gn-board__empty-create`) that `apps/web` never renders: it is gated on `onCreateTicket !== undefined` (`board.tsx:493`) and `grep -rn onCreateTicket apps/web/app apps/web/src` → 0 (exec 2's `V1` is the same measurement). P2's WHAT (three classes with zero selector blocks) is unaffected; its first-run consequence is the sentence only.

## 3. Defence log (phase 2)

- **15:19 IST** — read `origin/exec1/review-ui-r2:docs/lanes/review-refutations-exec1.md` (26 of my 36 checked at source, all *holds*; no refutation filed), `origin/exec2/review-ux-r2:…exec2.md` (E4-1/2/3/4/5/9/11/12/14/18 checked, all *holds*), `origin/exec5/review-ux:…exec5.md` (E4-23/34 *holds*, E4-33 cited). **Two mechanism-sentence slips exec 1 found are corrected in the report, dated, with the measured claim unchanged:** E4-8's parenthetical token counts (now `22` / `14`, `grep -o | wc -l`) and E4-9's attribution of the outer `<main>` (the route page's own `gn-shell`, `…/workflows/[workflowId]/page.tsx:57`, not `layout.tsx`). A Defence paragraph is under E4-9. E4-31's dark ratio is noted as 4.00 (in-page, fractional composite) vs 3.97 (exec 1's arithmetic on rounded colours) — both under 4.5.
- **15:52 IST** — exec 1's file at its latest head re-paints E4-7, E4-11, E4-14, E4-15, E4-24 and E4-35 (on the same `:3041` shell) and records each as *reproduces*; 32 of 36 checked at source or paint, all *holds*, "Refutations filed: None". exec 3's report §23 records a phase-1 attack on E4-1 that failed (*"premise holds — not refutable"*). No lane has filed a refutation of an E4 finding; none is filed by me — exec 1's phase-2 additions P34–P36 were read and P36's painted headings match my own sweep (`H1 Workflows · H2 Workflows`), so there is nothing to falsify.
- **16:40 IST (closing state, re-pushed if anything changes before 17:05:23)** — every lane's refutation file re-read at its current head: exec 1 (51 `E4-` mentions, all checks *holds*/*reproduces*, "Refutations filed: None"), exec 2 (15, all *holds*), exec 3 (1, a recorded failed attack on E4-1), exec 5 (3, *holds*), exec 6 (0). **No refutation of any E4 finding was filed in phase 2, and none is filed by this lane.** The phase-1 report stands at 36 findings (19 Important / 17 Minor) with the two dated mechanism-sentence corrections noted above; the frozen phase-1 sha recorded by the controller is `98584aa3`.

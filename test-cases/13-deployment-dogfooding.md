# 13 — Deployment & dogfooding

Mirrors `Features.md` §13. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` covered by E2E only · `🚫` consciously out of scope. Test names cross-reference the covering test.

Opened by Plan 11 Tasks 7–8 (2026-09-06). Most of Plan 11 is not yet built — new cases continue from 13.20 as later tasks land; do not renumber the ids below.

## Seed plumbing (Task 7)
- 13.1 ✅ `seedUlid` is a valid, `ULID_REGEX`-matching id — `seed-ulid.test.ts`
- 13.2 ✅ `seedUlid` is deterministic — the idempotence mechanism — `seed-ulid.test.ts`
- 13.3 ✅ `seedUlid` differs across keys and across namespaces — `seed-ulid.test.ts`
- 13.4 ✅ planted defect: a namespace/key join ambiguity cannot collide (`'ab'+'c'` vs `'a'+'bc'`) — `seed-ulid.test.ts`
- 13.5 ✅ `plainTextDoc` keeps record text literal — markdown-looking characters stay characters — `doc-text.test.ts`
- 13.6 ✅ `plainTextDoc` renders one paragraph per line; blank lines become empty paragraphs — `doc-text.test.ts`
- 13.7 ✅ `plainTextDoc('')` is still a valid one-paragraph doc — `doc-text.test.ts`
- 13.8 ✅ `findUserIdByEmail` queries better-auth's `"user"` table case-insensitively and returns the id — `users.test.ts`
- 13.9 ✅ `findUserIdByEmail` returns null when nobody has signed in with that address — the seed never invents people — `users.test.ts`
- 13.10 ✅ `checkErrandTemplate` accepts the real errand-with-waits template — `templates.test.ts`
- 13.11 ✅ planted defect: a template missing the `waiting` state is named — `templates.test.ts`
- 13.12 ✅ planted defect: a mapped state reachable only in two hops is refused — no fabricated intermediate claims — `templates.test.ts`
- 13.13 ✅ planted defect: `waiting` without `blocked: true` is named (attention-strip contract) — `templates.test.ts`
- 13.14 ✅ planted defect: an unguarded way into `done` is named (closing an errand must say what happened) — `templates.test.ts`
- 13.15 ✅ planted defect: a rule on the one-hop seeding transition is named — Ruling P29's tripwire — `templates.test.ts`
- 13.16 ✅ `workflowFromTemplate` clones with a fresh id at version 1, leaving the template untouched — `templates.test.ts`
- 13.17 ✅ Ruling P29 pinned by identity: the real template trips exactly two `rule-bypassable` advisories — `templates.test.ts`
- 13.18 ✅ Ruling P29: "fixing" one advisory genuinely silences that advisory by identity, and `checkErrandTemplate` still reddens — `templates.test.ts`
- 13.19 ✅ Ruling P29: guarding both `waiting` paths clears the advisory panel to zero, and `checkErrandTemplate` still refuses it — `templates.test.ts`

## Convenience Corner mapping (Task 8)
- 13.20 ✅ `readCcBoard` reads week1 and the items out of the frozen snapshot — `cc-board.test.ts`
- 13.21 ✅ the two operational epics hold exactly 23 errands in snapshot `24e2240` (13 registrations + 10 questions, 0 done) — `cc-board.test.ts`
- 13.22 ✅ planted defect: a file that does not define `window.CC_TRACKER` is refused with the path named (a `.ts` module throws inside the `vm` sandbox before any shape check runs — proven by wrapping the eval and rethrowing) — `cc-board.test.ts`
- 13.23 ✅ planted defect: a sandboxed global that is not `CC_TRACKER`, and a `CC_TRACKER` missing `items`, both exercise the shape-check branch itself (not just the syntax-error path) — `cc-board.test.ts`
- 13.24 ✅ `neededWeekEnd` reproduces the tracker generator's own week arithmetic (`build_tracker.py:390`) at weeks 0, 1, 7, 28 — `cc-map.test.ts`
- 13.25 ✅ invariant 4: an item with no asked/submitted date gets no `startDate` claim — `cc-map.test.ts`
- 13.26 ✅ invariant 4, the record's own natural planted defect: `ops:duns` carries an attention `since` but no origin `started` — no `startDate` claim — `cc-map.test.ts`
- 13.27 ✅ the one origin-dated item (`ops:accountant-hsn-digits`) gets its `startDate` claim verbatim, shaped `{date, note?}` — `cc-map.test.ts`
- 13.28 ✅ planted defect: stripping `needed_week` removes the `dueDate` claim — `cc-map.test.ts`
- 13.29 ✅ `needed_week` becomes a `dueDate` claim carrying the derivation in its note — `cc-map.test.ts`
- 13.30 ✅ statuses map without invention: `next`/`later`/`blocked` (→ `waiting`) map correctly, and a `later` item emits no transition — `cc-map.test.ts`
- 13.31 ✅ planted defect: a `done` item is refused — the seed never claims completion on anyone's behalf — `cc-map.test.ts`
- 13.32 ✅ planted defect: `done: true` against a stale non-done state string is still refused — the flag is checked, not just the state string — `cc-map.test.ts`
- 13.33 ✅ planted defect: an unknown tracker state is refused, never guessed — `cc-map.test.ts`
- 13.34 ✅ the body carries the record verbatim: tracker id, origin, counterparty/who, blocked-by resolved to the blocking item's human title, attention schedule, ask text — `cc-map.test.ts`
- 13.35 ✅ the description event carries the text as a literal-text doc, round-tripped through the domain's own `docToPlainText` — `cc-map.test.ts`
- 13.36 ✅ determinism: two builds of the same item are identical id-for-id; every event id is namespaced to the item so a re-snapshot cannot collide — `cc-map.test.ts`

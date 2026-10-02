# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty (audit: none, the bucket's own registration).** Control: a case id cited by no test reddens the check.

## 25.12 Server: one rollup pass per page, compressed answers (T11)

Spec D7; audit SM-06. Tests: `apps/server/test/{read/ticket-cards-batch,visibility/rollup,http/compression,http/compression-real-routes}.test.ts`; the frozen "before" is `apps/server/test/helpers/legacy-rollup-for.ts`. The case block is 25.190–25.199, all used.

- ✅ **25.190 — every card on a mixed board (workspace/project/explicit audiences, a terminal and a category-less child, a soft-deleted child, a child in a deleted project, a cross-workspace child, an assignee-arm child, a childless parent) carries the rollup the frozen per-ticket function gives, for five viewer classes, compared as JSON text (audit SM-06).** Control: the fixture is not degenerate (≥ 4 distinct restricted counts, a terminal, an uncategorized, a null rollup). Mutations: arm reach not split per parent, deleted children counted → red.
- ✅ **25.191 — `rollupsFor` equals `rollupFor` for every parent, and a parent with no children is absent from the map (audit SM-06).** Control: the answers are not all zero (`{ total: 3, restrictedCount: 1 }`), and the childless parent is `null` through `rollupFor`.
- ✅ **25.192 — fifty parents cost at most six queries (children, the viewer's role in the workspace, the arm set), and five parents cost exactly as many; one parent at a time costs fifty (audit SM-06).** Plan departure: the plan said "at most four"; `resolveEffectiveRole` is up to three queries by itself, so the bound is a constant, pinned by the five-versus-fifty equality.
- ✅ **25.193 — a JSON answer over 1 KB is gzip-encoded for a client that accepts it and plain for one that does not, and decodes to the same document (audit SM-06, spec D7).** Control: the identity client. Mutation: the plugin `register`ed instead of applied before the first route → red.
- ✅ **25.194 — the per-viewer filter still applies per card on one page: the owner and an outsider get the same true totals and different restricted counts (audit SM-06).** Control: at least one card where the two disagree.
- ✅ **25.195 — the card assembly costs the same number of queries at two parents as at five, and an empty page asks the database nothing (audit SM-06).** Control: the count is above three (a real measurement), and a one-parent page does ask. Mutation: the cards ask per card again → red.
- ✅ **25.196 — a client that accepts brotli gets brotli and the bytes decode to the same document (spec D7).** Control: gzip-only gets gzip.
- ✅ **25.197 — nothing under the 1 KB threshold is encoded, and a request with no `Accept-Encoding` (the in-process MCP door sends none) gets the plain body however big (spec D7).** Control: the same big route is encoded for a client that asks. Mutation: threshold 0 → red.
- ✅ **25.198 — the encoding reaches a route declared inside a child scope (the shape of `POST /v1/attachments` and `/mcp`) (spec D7).**
- ✅ **25.199 — a route `buildApp` itself declares, the board read, is gzip-encoded with a real session, `Vary: Accept-Encoding` set, and decodes byte-for-byte to the plain answer (spec D7).** Control: the plain answer is over the threshold. This is the case the first draft of the wiring failed: `void app.register(compress)` compressed only child-scope routes.

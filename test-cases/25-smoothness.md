# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty (audit: none, the bucket's own registration).** Control: a case id cited by no test reddens the check.

## 25.2 The read cache, dedupe and one reload wave (T3)

- ✅ **25.020 — a number as `useLiveQuery`'s fifth argument still means `debounceMs`, and the sixth argument is still the 18.461 `initial` seed; a hook with no `cacheKey` reads and writes no cache (audit SM-01).** Control: the same remount without a `cacheKey` starts from `null`.
- ✅ **25.021 — a hook with a `cacheKey` serves the last answer on its FIRST render and still asks again; `settled` stays false until the fresh read lands and the fresh answer replaces the cached one; the same `cacheKey` in another workspace is another question (audit SM-01).** Control: a mount with no `cacheKey` starts from `null`; the workspace the answer was stored under serves it.
- ✅ **25.022 — a key change serves the NEW key's cached answer, never the old key's, and `null` when it has none (audit SM-01).** Control: the three keys A, B, C, one rerender each.
- ✅ **25.023 — the cache evicts by age (10 minutes, the expired entry is deleted, not hidden) and by size (200 entries, oldest first, a recall counts as use) and clears whole (audit SM-01).** Control: the entry a reader keeps touching outlives the one nobody asks for.
- ✅ **25.024 — one stream frame reloads every hook on the workspace ONCE each, from one timer per workspace; a frame on another workspace reloads nothing here, and an unmounted hook is not reloaded (audit SM-05).** Control: two frames, two hooks, two loads each overall, never four.
- ✅ **25.025 — two identical reads in flight share one call; a different argument, a read after settlement, and a read after a failure are new calls; ingest, subscribe and a write under `query` (`putPreferences`) are never shared (audit SM-05).** Control: the undecorated source makes a call per read.
- ✅ **25.026 — two board reads inside one second join the roster ONCE; a read a second later joins again; a failed join is not memoised (audit SM-05; FD7).** Control: a read just inside the burst window does not join again.
- ✅ **25.027 — a read the server refused evicts its cache entry and withdraws the stale answer it was serving (`data` is `null` beside `error`, so no board is drawn over its own refusal), and the next mount does not resurrect it; a reload that fails AFTER the key had a real answer keeps that answer (F6) but still evicts the entry (audit SM-01).** Control: the stale answer is served at once, before the refusal lands.
- ✅ **25.028 — no cached answer of one signed-in person is ever served to the next on the same device: the cache is emptied at the account menu's accepted sign-out, a write's 401, a read's 401, and the session resolving to somebody else or to nobody; it is NOT emptied by a refused sign-out, a non-401 failure, a re-render of the same person, or a person arriving after nobody (audit SM-01; review focus 2).** Control: each door's nearest non-door action leaves the planted answer in place.
- ✅ **25.029 — a read that was in flight when the cache was cleared does not write its answer back (audit SM-01; review focus 2).** Control: a read issued after the clear writes as usual.
- ✅ **25.030 — an identical read in flight across a sign-out is not shared with the next person's read (audit SM-05; review focus 2).** Control: with no clear between them the same two reads share one call.
- ✅ **25.031 — the roster burst memo does not cross a sign-out: the next person's read inside the same second joins the roster for itself (audit SM-05; review focus 2).** Control: with no clear between them the second read is served from the memo.
- ✅ **25.032 — a read never joins one that was in flight before a change overtook it: a write (`ingest`, `putPreferences`) submitted or settled in between, or a stream `event`/`purge`/`refresh` frame delivered in between, splits them; a `caught-up` frame does not (audit SM-05).** Control: with nothing in between, the same two reads share one call.

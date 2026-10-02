# §25 — Smoothness: loading, optimism and placeholders

**Opened 2026-10-02 by smoothness T1** (`docs/superpowers/plans/2026-10-02-smoothness.md`; spec `docs/superpowers/specs/2026-10-02-smoothness-design.md`, owner decisions D1–D13; audit `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md`, findings SM-01–SM-16). Mirrors `Features.md` §22.

3-DIGIT PADDED `25.001`–`25.999`, blocks per task: T1 25.001–25.009 · T2 25.010–25.019 · T3 25.020–25.039 · T4 25.040–25.049 · T5 25.050–25.069 · T6 25.070–25.089 · T7 25.090–25.119 · T8 25.120–25.149 · T9 25.150–25.169 · T10 25.170–25.189 · T11 25.190–25.199 · T12 25.200–25.209 · T13 25.210–25.229 · T14 25.230–25.239.

## 25.1 Catalogue (T1)

- ❌ **25.001 — the bucket is registered in `test-cases/README.md` and the citations baseline, and `pnpm check:citations` passes with it empty (audit: none, the bucket's own registration).** Control: a case id cited by no test reddens the check.

## 25.4 One workspaces read, the last user id, freshness (T4)

- ✅ **25.041 — three hooks mounted together make ONE `getMyWorkspaces` call and all see the same rows; a consumer that mounts after the read settled joins it (audit SM-05).** Control: the late consumer reads the rows at once and the call count stays 1.
- ✅ **25.042 — the last user id (`gn-last-user-id`) lets the remembered project tab be read before the session answers, never another person's, and a blocked store answers `null` (audit SM-02, spec D9).** Control: the stored id for the person who wrote the tab reads it back; after the id is cleared the same read gives `null`; the working store reads again.
- ✅ **25.043 — a refused shared read is reported once and is NOT kept: the next mount asks again (audit SM-05; drift the plan did not state: the old hooks re-asked on every mount).** Control: the second mount gets the rows and no error.
- ✅ **25.044 — another person, on a new mount, in the same mounted hook, or after a signed-out render, is never painted the first person's rows, not even for one render (audit SM-05, FD5).** Control: the first person's rows were painted, and the same person remounting gets them at once.
- ❌ **25.045 — focus, visibility and reconnect reload every cache entry older than 30 s (spec D13; audit SM-15).** Not built in T4: it reads T3's live-query cache (`liveQueryAgeMs`, `scheduleReload`, `rememberLiveQuery`), which has not landed on `release/smoothness`. Control: focus after 5 s reloads nothing.
- ✅ **25.046 — the inbox badge does not poll while the document is hidden, and reads again the moment it is shown (audit SM-15).** Control: a visible tab polls on the interval.
- ✅ **25.047 — a committed project write (the projects version) re-reads the shared rows, so a rename reaches the nav and the title as it did before the three hooks shared one read (audit SM-05).** Control: the first read's name is painted before the bump.

# §30 — My work, global and filtered

**Opened 2026-10-05 by my-work-global T1** (`docs/superpowers/plans/2026-10-05-my-work-global.md`; spec `docs/superpowers/specs/2026-10-05-my-work-global-design.md`, owner-approved 2026-10-05). Ships on `release/my-work-global`. Mirrors the My Work bullets in `Features.md` §3 ("My Work and the attention strip" and the bullets after it).
3-DIGIT PADDED `30.001`–`30.099`, blocks per task: T1 30.001–30.012 (+ 30.012b) and 30.059–30.061 (plan AMEND 16:26) · T2 30.013–30.018 · T3 30.019–30.035 · T4 30.036–30.050 · T5 30.051–30.058. Unused ids in a block stay free for that task's follow-ups. A later task adds its own § below; on a tipmerge conflict in this file, keep both sections.

Legend: ✅ covered by a test · ❌ not yet · 🟡 partial · 🧪 manual · 🚫 out of scope, with a reason.

## 30.1 Server (T1)

- ✅ **30.001 — the migration backfills `proj_tickets.created_by` from each ticket's `ticket.created` actor.** Two tickets created by U1 and U2 (U1's later assigned and transitioned by U2) are projected, the Down half drops the column, the Up half re-adds and backfills it: U1 and U2, not the later actor. A rebuild of every projection lands on the same values and `verify-projections` is clean; a `created_by` rewritten behind the ledger is reported as `proj_tickets` drift (the verifier compares the column). Control: the ticket with one event backfills to its creator. `apps/server/test/projections/proj-tickets-created-by.test.ts`.
- ✅ **30.002 — the projection writes `created_by` once, on `ticket.created`.** A ticket created by U2 after the migration carries U2; three later events by U1 (assign, transition, title) move `assignee_id` and `state_id` but leave `created_by` at U2; a rebuild agrees and the verifier is clean. Control: the same row's moved assignee and state prove the later upserts ran.
- ✅ **30.003 — no `show` is today's all-visible strip.** V (W1 `admin`) is served every visible blocked ticket in W1 (tc, ta, tb, tp, tw), each once and only in the blocked bucket; the explicit-[U] ticket th is absent. `apps/server/test/routes/attention-show.test.ts`.
- ✅ **30.004 — `show=created,assigned` is the union, each ticket once:** exactly tc, ta, tb, with tb (created by V AND assigned to V) served ONCE; the other member order spells the same set.
- ✅ **30.005 — each person arm alone:** `show=created` is tc, tb; `show=assigned` is ta, tb; `show=created,created` collapses to `created`.
- ✅ **30.006 — `show=ws-admin` widens only where the viewer holds the role:** on W1 (V `admin`) every ticket V may see, th still absent; on W2 (V `member`) **400 `{error:'invalid_query'}`**. Controls: the owner U gets th through the same arm; V's `show=created` on W2 answers.
- ✅ **30.007 — `show=project-admin` covers only the projects the viewer administers:** on W1 only tp (P1), not tw (P2) and not the hidden th (also P1). Refused (400) on W2, where V administers nothing, and for the owner U on W1, whose implicit rule-A projects carry `projectAdmin: false`.
- ✅ **30.008 — a malformed `show` is a 400 `invalid_query`:** `show=`, `show=bogus`, `show=created,`, a repeated `show` and `show=Created`. Control: `show=created` on the same workspace answers.
- ✅ **30.009 — visibility bounds the `created` arm:** in W2, tvh (created by V, explicit audience [U]) is absent from V's `show=created`, while tv (created by V, default audience) is served in the same answer. Control: the owner's `show=ws-admin` serves tvh, so its absence is visibility and not the bucket. (Rig per plan AMEND 16:26: rule A puts a member on every live project, so the ticket is hidden by an explicit audience, not by a project.)
- ✅ **30.010 — the no-`show` body still carries `settings`:** it equals `getWorkspaceSettings` for W1 after a settings claim (staleDays 9, dueSoonDays 4), beside the all-visible items; a filtered answer carries the same settings.
- ✅ **30.011 — each `/v1/me/workspaces` row carries `adminProjectIds`:** V's W1 row is `[P1]` (not P2, where V is a roster member without the flag); V's W2 row is `[]`. `apps/server/test/routes/me-workspaces-admin-projects.test.ts`.
- ✅ **30.012 — a workspace role administers no project by itself:** the owner U, on no roster, gets `[]` in both workspaces. Control: given `projectAdmin` rows on P2 and P1, the same owner gets both, sorted.
- ✅ **30.012b — `mapWorkspaceRefs` always sets `adminProjectIds`:** a row carrying `['P1']` maps to `['P1']`; a row without the key maps to `[]` with the key present; a non-array value and a non-string member are refused, naming the field. `packages/app-core/test/online/mappers.test.ts`.

### Contests take the same show (T1, plan AMEND 16:26)

- ✅ **30.059 — `GET /v1/contests?show=created,assigned` returns only the contests on tickets V created or is assigned to** (tc, ta); `show=assigned` is ta alone; `show=ws-admin` on W1 is every contest V may see. Control: with no `show`, every contest V may see (tc, ta, tp, tw; th's is hidden by `canSee`). `apps/server/test/routes/attention-show.test.ts`.
- ✅ **30.060 — contests refuse what the attention route refuses, with the same body:** `show=ws-admin` on W2 (V a `member`), `show=bogus` and a repeated `show` are each **400 `{error:'invalid_query'}`**. Control: `show=created` on W2 answers 200.
- ✅ **30.061 — `show=project-admin` returns only the contest on P1's visible ticket** (tp).

# §30 — My work, global and filtered

**Opened 2026-10-05 by the my-work-global plan** (`docs/superpowers/plans/2026-10-05-my-work-global.md`; spec `docs/superpowers/specs/2026-10-05-my-work-global-design.md`, owner-approved 2026-10-05). Ships on `release/my-work-global`. Its `Features.md` bullets sit beside the features they extend (§3 "My Work and the attention strip", §11 "My work preferences").
3-DIGIT PADDED `30.001`–`30.099`, blocks per task: T1 30.001–30.012 · T2 30.013–30.018 · T3 30.019–30.035 · T4 30.036–30.050 · T5 30.051–30.058. Unused ids in a block stay free for that task's follow-ups. Whichever task lands first creates this file; a later task adds its own § below, and a merge conflict here keeps both sections.

Legend: ✅ covered by a test · ❌ not yet · 🟡 partial · 🧪 manual · 🚫 out of scope, with a reason.

## 30.2 Preferences (T2)

`GET`/`PUT /v1/me/my-work-preferences` — the page's "Show" filter and "Group" toggle, one document per user (`user_my_work_preferences`, keyed by `user_id` alone). All six in `apps/server/test/routes/my-work-preferences.test.ts`, built through `buildTestApp` so `app.ts`'s registration is under test.

- ✅ **30.013 — GET with no row answers `DEFAULT_MY_WORK_PREFERENCES`** (`{show:['created','assigned'], grouping:'workspace-project'}`), asserted as the literal and as the domain constant. Mutation: the store returns `null` for no row → red.
- ✅ **30.014 — PUT a valid doc answers it, and GET answers it after, for the same user;** a second PUT replaces the first whole.
- ✅ **30.015 — user B never sees user A's doc:** B reads the default after A's PUT; control: A reads its own doc; B's own PUT then leaves A's alone. Mutation: the store keyed on a constant instead of `user_id` → red.
- ✅ **30.016 — a bad body is a 400 `invalid_my_work_preferences` and stores nothing:** `show:[]`, `show:['bogus']`, an extra key, `grouping:'tree'`, and five `show` entries (`.max(4)` bounds the raw body, before the de-dupe), each otherwise valid; for a fresh user GET still answers the default and for a user with a prior doc GET still answers that doc. Controls: a one-value doc and a four-value doc are taken. Mutations: `.min(1)` dropped, `.strict()` dropped, `.max(4)` dropped → red.
- ✅ **30.017 — anonymous GET and PUT are 401 `UNAUTHENTICATED_BODY`,** and the PUT adds no row.
- ✅ **30.018 — duplicate `show` values are stored once, first occurrence first:** `['created','created']` → `['created']` and `['assigned','created','assigned']` → `['assigned','created']`, in the PUT answer and in a later GET. Mutation: the de-dupe removed → red.

The PUT is a cookie-authenticatable per-user write, so it is in `HTTP_ORIGIN_PROTECTED_ROUTES` (`apps/server/src/http/http-origin.ts`) with its own row in `apps/server/test/http/security-middleware.test.ts` (13.116's set-equality guard), and the new table has a `not-entity-bearing` purge rule (`apps/server/src/purge/table-rules.ts`, 19.083's every-table guard).

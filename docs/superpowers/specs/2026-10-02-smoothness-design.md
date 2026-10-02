# Smoothness: asynchronous loading, optimistic writes and placeholders everywhere: design

**Status:** owner-approved (2026-10-02 ~13:50: "Accept" — D1–D13 and D2b as recommended). Ships as **its own release** after the prefix/groups/UX-fixes release; it runs **in parallel with the neo refresh** (its own release, `release/neo-refresh`), which owns `packages/ui/src/tokens.ts` and the shadow/surface rules in `packages/ui/src/ui.css`. This spec touches neither, by construction (§4.3). Base: `main` once `release/prefix-groups-ux` has merged; the audit's lines are from that branch at `4f86b959`.

**Sources:**
- the audit: `gisik-nokma-lanes/smoothness-2026-10-02/AUDIT.md` (findings SM-01–SM-16, every claim with a `file:line`);
- the research: `gisik-nokma-lanes/smoothness-2026-10-02/RESEARCH.md` (principles P1–P15, each with its URL);
- the 2026-10-01 audit's loading-class ids (WS-01, NP-03, NP-20, SYS-18, BRD-18) and `DEFERRED-IDS.md`;
- the owner's brief (2026-10-02): *"A smoother experience of the entire app. Asynchronous Loading. Optimistic Loading, Ghost items/placeholder animation for loading. Both for Desktop and Mobile and all screen sizes we have. Any optimizations of things to make things smoother and faster."*

## 1. Decisions for the owner

Each is numbered, with the recommendation the plan was written against. A different ruling changes the plan's task, not its shape.

| # | Decision | Recommendation |
|---|---|---|
| D1 | **A read cache on the web.** Today nothing is served from memory (SM-01). Options: (a) an in-memory, session-scoped stale-while-revalidate cache inside `useLiveQuery` (shows the last answer at once, refetches behind, cleared on sign-out); (b) also persist it to IndexedDB so a cold tab paints from disk (GitHub's and Linear's shape, RESEARCH §1–2); (c) run the existing replica on the web. | **(a) now**, with the cache keyed per signed-in user and emptied on sign-out and on a 401. (b) is the next release once (a) has field numbers; (c) is a product decision (offline web) and out of scope. |
| D2 | **Which writes become optimistic.** Today: board moves, backlog rank, inbox read. Candidates: the sheet's state, assignee, priority, dates and title; comments; create ticket; backlog Start; board Close; members' role change; workspace and project rename; notes rename. | **All of the listed sheet fields, create ticket, backlog Start, board Close and the two renames**, each with honest rollback (the overlay is dropped and the refusal is shown where the control is, the pattern `MoveRefusalNotice` already sets). Comments stay wait-for-server with a pending row (the body is the person's words; a refused comment must not vanish). Members' role change stays wait-for-server (a security-shaped write; the row shows "Changing…"). |
| D2b | **The created ticket's card before the server answers.** The ticket id is client-minted (ULID) but the key number is the server's. Show the card at once with a ghost key ("CC-…") that fills in on the answer, or wait for the answer (about one round trip) and only then add the card without waiting for the stream. | **The ghost card.** It appears in the first column within one frame, dims until committed, and is removed with the refusal shown in the dialog if the server refuses. |
| D3 | **The placeholder's look.** A skeleton is a wireframe of the real layout (P1). Options for its surface: a static tinted block; a slow opacity pulse; a travelling shimmer. | **Static tinted blocks with a slow opacity pulse** (1.6 s, between 1 and 0.6, `transform`/`opacity` only), no shimmer: shimmer reads as generic and distracts in dense lists (Atlassian, NN/g). Under `prefers-reduced-motion` the pulse is off and the block is static. The fill is `--gn-surface-track` with no shadow in every style, so in neo a placeholder is flat, which is the "no depth means not interactive" rule U7 already states. |
| D4 | **When a placeholder may appear.** The research converges on "nothing under 100–200 ms, and once shown never a 10 ms flash". | **Show nothing for 150 ms; then the skeleton; once shown, keep it at least 350 ms.** The two numbers are tokens (`--gn-wait-before`, `--gn-wait-hold`) in one place, read by one hook. Exception: a region that never had content (first paint of a route) shows the skeleton at once, because an empty page for 150 ms is worse than a wireframe for 150 ms. |
| D5 | **The route transition.** Options: a global top progress bar (YouTube/GitHub style); a pending hint on the clicked link plus the destination's own skeleton; nothing. | **The pending hint plus the destination's skeleton, no global bar.** `useLinkStatus` in the nav and the project list, fixed-size, opacity-only, delayed 100 ms (P10); every app route gets a `loading.tsx` whose skeleton is the page's own shell (nav bar geometry, title line, content shapes) so the frozen-page interval is replaced by a wireframe. frontend-design: one orchestrated moment, not a bar on every click. |
| D6 | **Bundle splitting.** Today every route, sign-in included, carries 471 KB gzip (SM-04). | **Split by need:** `Providers` imports from lean subpaths, not the root barrel; the editor loads on first open (`next/dynamic`, a same-shape skeleton while it loads) and is prefetched when a sheet or note is on screen; the workflow canvas (xyflow) and the help manual load only on their routes; `sideEffects` declared in `app-core`. Target: the board route's first load under 300 KB gzip, sign-in under 120 KB gzip. |
| D7 | **The server.** Batch the per-card rollup (SM-06) and compress responses. | **Both.** `rollupsFor(ids[])` is one query per page instead of one per card, with the per-ticket function kept as a thin wrapper so every existing case still holds; `@fastify/compress` with gzip and brotli. ETags are not in this release (the cache in D1 makes them a second-order win). Measurement 7 in the audit says whether the edge already compresses; if it does, compression is dropped from the plan. |
| D8 | **Stream fan-out.** One frame fires about seven reloads on the project page. Options: coalesce reloads client-side (one timer per workspace, identical reads collapsed); scope the hub's fan-out per project (a protocol change). | **Client-side coalescing and in-flight dedupe now**; project scoping is a server protocol change for a later release, listed in §8. |
| D9 | **The remembered tab before first paint.** The seed needs the user id, which arrives with the session (SM-02). | **Remember the signed-in user's id in `localStorage` at sign-in** (`gn-last-user-id`, written where the session resolves, cleared on sign-out), so `readProjectTab` can answer on the first render; the session's answer later confirms or clears it. Until the session confirms, the page renders the remembered tab's skeleton, never the Board arm. |
| D10 | **Performance budgets** (lab, Chrome, Fast 4G + 4× CPU on the phone preset; unthrottled on desktop). | **Phone (390): LCP ≤ 2.5 s cold, ≤ 1.0 s warm; INP ≤ 200 ms; CLS ≤ 0.05. Desktop (1440): LCP ≤ 1.5 s cold, ≤ 0.6 s warm; INP ≤ 100 ms; CLS ≤ 0.02. Soft navigation to visible content (cached) ≤ 150 ms; to fresh content ≤ 1.0 s on Fast 4G.** Provisional until audit measurement 1 lands; recorded as ratchets, not gates (§7). |
| D11 | **Desktop and mobile scope.** Both have loading gaps (SM-12, SM-13) and deeper replica costs. | **Loading states in this release** (desktop: a themed background before React, a skeleton list, a debounced refresh; mobile: a board skeleton and empty state, the webview's own placeholder and a lazily loaded editor page). **The replica's IPC N+1 and the webview reuse are deferred** to the apps' own series (§8). |
| D12 | **Board rendering cost.** Containment and memoisation now, or virtualization. | **Containment + memo now** (`contain: content` on the card list, `content-visibility: auto` with an intrinsic size on card slots, `memo` on the card slot with stable callbacks, `useDeferredValue` for search). Virtualization only if measurement 4 shows a board over 300 cards still misses INP; it is an owner call later, because it changes keyboard order and drag behaviour. |
| D13 | **Freshness.** No refetch on focus or reconnect; the inbox badge polls hidden tabs. | **Refetch stale cache entries on window focus and on socket reconnect; pause the badge while the document is hidden.** Stale means older than 30 s. |

## 2. Already handled elsewhere (out of this release)
- **Board moves, backlog rank, inbox read, notification toggles** are optimistic already (audit §4); this spec adds no second mechanism beside them and reuses `PENDING_TTL_MS`, `beginPending`/`dropPending` and the refusal notice.
- **The failed session read** (SYS-01 family) is fixed on this branch; this spec adds the signed-in skeleton WS-01 asked for.
- **The UX-fixes release** owns the phone header pattern, the tablet band, the sticky dialog footer and the scroll fades; the skeletons here match those layouts.
- **The neo refresh** owns tokens and surfaces; skeleton colours are existing roles (§4.3).

## 3. Scope

### 3.1 Principles (adopted from RESEARCH P1–P15 as the release's rules S1–S10)
- **S1 Skeleton = final layout.** A placeholder has the same box, the same height and the same position as the content it stands for; replacing it moves nothing else on the page. A swap that shifts layout is a defect (CLS from a swap is measured in §7).
- **S2 Wait, then show, then hold.** Nothing before `--gn-wait-before` (150 ms); once shown, a placeholder stays at least `--gn-wait-hold` (350 ms). One hook (`useWait`) owns both numbers. A route's first paint skips the wait (D4).
- **S3 A skeleton is never an empty state.** It stands only for content whose answer is unknown; an answered-empty region shows the next step (SYS-18), never a wireframe.
- **S4 Already-visible content is never replaced by a placeholder.** A refetch, a filter change, a tab switch or a return to a screen renders from the cache and revalidates behind (stale-while-revalidate); only a region with no answer yet shows a skeleton. Tab and filter switches run in a Transition.
- **S5 Every write is optimistic unless the spec names it otherwise (D2),** and every optimistic write has an honest rollback: the overlay is dropped, the control returns to the server's value, and the refusal is shown beside the control in the server's words. Nothing is silently kept.
- **S6 Pending is visible and announced.** A pending region carries `aria-busy="true"` and the pending control carries its pending label ("Saving…", "Creating…"); the shell's one polite `role="status"` region (mounted at boot) announces "Saved" and failures. Nothing assertive except a failure.
- **S7 One primitive, two apps.** `Skeleton`, `Pending` and `useWait` live in `packages/ui` and are the only placeholder spelling in web and desktop; a page that writes its own "Loading…" sentence is a defect (a sweep test polices it).
- **S8 Motion is `transform` and `opacity`, token-timed, reduced-motion-gated by a global belt** as well as per rule.
- **S9 Code arrives when it is needed.** Sign-in carries sign-in; the editor, the canvas and the manual load on first use with same-shape placeholders.
- **S10 Measured, not asserted.** The budgets (D10) are recorded as ratchets from a repeatable capture; a task that claims "faster" quotes the capture.

### 3.2 The system layer (shared code, fixed once)
- **The loading primitives** (`packages/ui`): `Skeleton` with `line`, `block`, `circle` and `card` shapes and a `rows` prop for lists; `Pending` (a wrapper that sets `aria-busy` and dims its children to `--gn-disabled-opacity` only after the wait); `useWait(pending)` returning `{ show }` per S2; `Button` gains `busy?: boolean` (disabled + `aria-busy` + the label swap via `busyLabel`). CSS appended to `ui.css` after its last rule (outside every range the neo refresh edits), colours from `--gn-surface-track`, timing from `--gn-motion-*` and two new wait variables emitted from `ui.css` itself (not from `tokens.ts`, D-neo).
- **The read cache** (`packages/app-core`): `useLiveQuery` gains an explicit `cacheKey` (namespaced by the caller: `board:<project>`, `list:<project>:<filter>`, `ticket:<id>`, `members:<ws>`, `workspaces:<user>`, `note:<id>`, `inbox:<tab>`); a module-level `LiveQueryCache` serves the last answer on first render and on key change (`settled` stays false until the fresh read lands), writes on resolve, evicts after 10 minutes or 200 entries, and is cleared by `clearLiveQueryCache()` on sign-out and on the 401 redirect. `initial` (18.461) becomes a special case of it.
- **In-flight dedupe and coalescing:** `withInflightDedupe(source)` collapses identical reads (`method + JSON(args)`) while one is in flight; the roster join is memoised for 1,000 ms per workspace inside `online-data-source` (one burst = one join; the docblock's "fresh per read" becomes "fresh per second", and a revoked member still disappears on the next read); the stream reload timer is one per workspace, shared by every hook, so a frame fires one reload wave.
- **One workspaces read on the web:** `useMyWorkspaces()` (`apps/web/src`) shares one promise and one cached answer across the nav, the name, the projects list and the pages; the four hooks that each called `getMyWorkspaces` read it.
- **Route transitions:** a `loading.tsx` per route segment with the segment's skeleton (`AppNavSkeleton` + the page's shapes); `useLinkStatus` in `app-nav.tsx`, `last-project-nav.tsx` and the bottom bar; tab and filter changes wrapped in `startTransition`; the remembered tab seeded from `gn-last-user-id` (D9).
- **Nav stability:** the bottom bar renders in the first frame below 64rem with the CSS belt alone deciding visibility (the "second poller" objection is removed by making the unread count one shared store with one poll); the corner's Notes/Inbox get a `≤64rem` CSS arm so the first frame is right before `useTabletBar` answers; the bar's slots read storage in the state initialiser on the client (the server markup is the default bar, hidden until hydration by the belt); the nav reserves its height; the remembered scope note renders from the cache.
- **Freshness (D13):** cache entries older than 30 s refetch on `focus`/`visibilitychange` and on stream reconnect; the badge pauses while hidden.
- **Bundles (D6):** `Providers` imports from `@gisik-nokma/app-core/data` (a new subpath with the data layer only); the editor via `next/dynamic` behind `EditorSkeleton`; the workflow canvas and the help browser via `next/dynamic` on their routes; `"sideEffects": ["**/*.css"]` in `app-core`; a source-level import-graph test keeps the sign-in route free of the editor, the canvas and the manual.
- **Server (D7):** `rollupsFor(db, viewerId, ticketIds)` batched; `@fastify/compress`.
- **Motion belt:** `@media (prefers-reduced-motion: reduce) { .gn-skeleton, [class*="gn-"] { animation-duration: 0.01ms !important; } }` is NOT adopted (it would also kill the glide-back's reduced arm, which is designed); instead the new keyframes get their own arms, and a test sweeps every `animation:` declaration in `ui.css` for a matching `reduce` arm.

### 3.3 Per-screen decisions
- **Project page (board, list, backlog, calendar, timeline):** the empty Suspense `<main>` becomes `ProjectPageSkeleton` (nav bar, breadcrumb line, title line, the five tabs, a toolbar row, then the remembered tab's shape: three columns of three cards, or six table rows); names in the header reserve their width with `Skeleton line`; the Create gate becomes the real button, `busy` until the list has answered; the tab seed happens before first paint (D9); view and filter switches run in a Transition and never show the arm; the five `role="status"` arms become the skeletons (case 13.1056 is amended deliberately: the sweep now pins zero bare arms and five `Skeleton` sites); arrows render from the group's cached def so the second paint disappears when the def is cached.
- **Board writes:** Close is optimistic through `beginPending` with the card dimmed, rolled back by `dropPending`; the created ticket's ghost card (D2b) sits in the first column, dimmed, its key "…" until committed; `board.reload()` runs on the answer, not on the stream.
- **Ticket sheet:** `TicketSheetSkeleton` (title line, the field rows, a description block, a comments block) replaces the sentence; the workflow and the ticket are read in parallel from the cache when the card's `workflowId` is known (the board card carries it); subtasks come from the cached list; an `OptimisticTicket` overlay (`Partial<TicketState>`) is applied over `read.data` for state, assignee, priority, dates and title from the moment the person commits, carrying `aria-busy` on the field, and is dropped on the answer (committed: the fresh read replaces it; refused: the field returns to the server's value and the refusal sits under it). The title field no longer flickers: `titleDraft` is cleared only when the read that carries the new title has landed.
- **New-ticket dialog:** "Create ticket" is `busy` with "Creating…"; the dialog closes on the first frame and the ghost card is already on the board (D2b); a refusal reopens the dialog with the draft intact and the refusal in the footer.
- **Notes:** the tree and the document render from the cache on a note change (the remount stays, as `tree-scroll.ts` argues, but it is now cheap); `getNote` is asked of every workspace in parallel and the first non-null wins; the editor region reserves `min-height` from the first frame with `EditorSkeleton`; the comment composer mounts on focus, not on open; `searching` is read so the list shows a skeleton row instead of "No notes match" while the first query runs; tree sections are memoised; the draft write to `localStorage` is coalesced with the autosave timer; the signed-out note URL renders the sign-in sentence (NP-03).
- **Workspaces, workspace home, members, inbox, my work:** each gets a skeleton of its own layout (cards ×3; the title + project cards; the summary line + rows; the tabs + rows; the attention strip's reserved band + rows); banners and strips reserve their band from the first frame and collapse to zero only on an answered-empty, never before the answer; rename shows the new name at once (overlay) and reverts on refusal.
- **Settings and account:** `WiringNotReady` and the three "Loading …" texts become one `SettingsSkeleton` (rail + a form block); the account page renders every card's skeleton in its final order from the first frame, each filling in as its read lands (no network-order insertion).
- **Sign-in and invite:** the methods form reserves the segmented control's row (a `Skeleton line` of its height) until `/auth/methods` answers, so the form never flips; every submit button is `busy` with "Sending…"/"Signing in…"; the invite page shows one skeleton (title + a sentence + the button) and one status sentence.
- **Help:** the manual loads on the help route only; search runs through `useDeferredValue`.
- **Phone shell:** the bottom bar is present from the first frame; the switcher's "Loading your workspaces…" becomes three skeleton rows; sheets keep their entrance.
- **Desktop app:** `index.html` paints the theme's background before React (inline `<style>` with the two surface colours, chosen by the stored theme); "Opening local replica…" becomes a `Skeleton` list; the engine's refresh is debounced 200 ms like the web; the list shows "No tickets yet" only after the first read.
- **Mobile app:** the board shows a skeleton list while `ds === null` and an empty state after the first read; the ticket screen's "Opening…" becomes a skeleton; the WebView gets `startInLoadingState` with a `renderLoading` skeleton of the editor's height; the editor HTML module is imported lazily on first ticket open; the 8 s refusal stays.

### 3.4 Deferred to the backlog (not this release)
- Persisting the cache to IndexedDB (D1b); the replica on the web (D1c).
- Project-scoped stream rooms (D8), ETags, server-side pagination of the board.
- Virtualization (D12), pending measurement 4.
- The desktop replica's IPC N+1 and the mobile WebView reuse (D11).
- Moving `AppNav` into the root layout (a structural change the per-page mount's docblocks argue against; the cache and the first-frame bar remove the symptoms it would have fixed).

## 4. The placeholder design

### 4.1 Shapes
*(Superseded in part by Amendment S-R1, appended at the end of this spec: the frame is the real component's own container and `Skeleton`'s shapes are its parts.)*

`Skeleton` renders a `<span class="gn-skeleton gn-skeleton--<shape>" aria-hidden="true">` with inline `--gn-skeleton-w`/`-h` from props. Shapes: `line` (height `1em`, radius `--gn-radius-control`, default width 60%), `block` (any size, radius `--gn-radius-card`), `circle` (avatar), `card` (a card's padding with two lines and a chip row, matching `.gn-board-card`'s padding (`packages/app-core/src/views/board.tsx:2155`, `packages/ui/src/ui.css:1495`) and minimum height). `rows={n}` repeats with the list's own gap. A skeleton region is a container with `aria-busy="true"` and a visually hidden "Loading <what>" sentence rendered once, not per block (Nord's pattern, RESEARCH §5).

### 4.2 Motion
One keyframe, `gnPulse` (`opacity: 1 → 0.6 → 1`, 1,600 ms, `--gn-motion-ease-out`, infinite), with its own `prefers-reduced-motion: reduce` arm setting `animation: none` and a static `opacity: 0.8`. Content replaces a skeleton in place with no entrance; a region that arrives late (a strip, a banner) fades in over `--gn-motion-feedback` only when it replaces its reserved band (never when it inserts). Pending controls dim to `--gn-disabled-opacity` after the wait, with no transition.

### 4.3 Across the styles and themes (hig / minimal / neo × light / dark), and beside the neo refresh
*(Two items here are superseded by Amendment S-R1: the Fill line (the fill is the new `surfacePlaceholder` role, never the neo well) and the "Nothing new in `tokens.ts`" bullet (S-R1 adds that role; the wait durations' "two exported constants in `use-wait.ts`" part still stands). The other bullets stand.)*
- Fill: `var(--gn-surface-track)` in every combination (the quiet track, already contrast-paired for text in UX fixes T1); no border, no shadow, no gradient. In neo this is the flat surface, which U7 defines as "not interactive"; in hig/minimal it is the existing track grey. Dark themes use the same role (the neo refresh may re-value `surfaceTrack`; the skeleton follows the token and needs no change).
- Nothing new in `tokens.ts`: the wait durations are two exported constants in `packages/ui/src/use-wait.ts` (`WAIT_BEFORE_MS = 150`, `WAIT_HOLD_MS = 350`), one place, pinned by fake-timer tests; CSS needs no delay of its own (plan FD1).
- All skeleton CSS is one contiguous block appended after `ui.css`'s last rule (line 8904 at `4f86b959`), with its keyframe beside it (one consumer, the header's own rule for keyframes), so no line the neo refresh edits (96–99, 1168–1178, 7176–7180, 7252–7258, 8097–8153) moves. `globals.css` gains only the `loading.tsx` shells' rules, appended likewise (neo edits 169 and 2942–2945).
- The style-neutral rule is tested: the skeleton rules must not name a style attribute (`[data-style=…]`) at all.

### 4.4 Copy
Pending labels are the verb in progress: "Saving…", "Creating…", "Sending…", "Signing in…", "Changing…". The polite region says "Saved", "Ticket created", "Couldn't save: <server's reason>". No "please wait", no spinner glyphs, no ellipsis-only labels.

## 5. Accessibility
- `aria-busy="true"` on every region whose answer is pending, removed when it lands; one visually hidden "Loading <region>" sentence per region, not per block.
- One app-level `role="status"` polite region mounted in the root layout beside the route announcer (`RouteAnnouncer`'s sibling), fed by a `useAnnounce()` hook; page-level `role="status"` arms are removed where they only said "Loading…".
- Pending buttons: `aria-busy`, `disabled`, and the busy label as the accessible name; focus stays on the control.
- `prefers-reduced-motion`: the pulse is off; no placeholder moves.
- Keyboard: a skeleton is `aria-hidden` and contains no focusable element; a `Pending` region keeps its children in the tab order (dimmed, not disabled) unless the control itself is busy.
- The route announcer keeps announcing the page title; `loading.tsx` shells set no title of their own.
- Contrast: `surfaceTrack` against `surface` is decoration (no text), so no ratio applies; the visually hidden sentence is text.

## 6. Performance budgets (D10)
| Viewport | LCP cold / warm | INP | CLS | Soft nav to cached content | Soft nav to fresh content (Fast 4G) | First-load JS (gzip) |
|---|---|---|---|---|---|---|
| Phone 390, Fast 4G + 4× CPU | ≤ 2.5 s / ≤ 1.0 s | ≤ 200 ms | ≤ 0.05 | ≤ 150 ms | ≤ 1.0 s | board ≤ 300 KB, sign-in ≤ 120 KB |
| Tablet 768, Fast 4G | ≤ 2.0 s / ≤ 0.8 s | ≤ 200 ms | ≤ 0.05 | ≤ 150 ms | ≤ 0.8 s | same |
| Desktop 1440, unthrottled | ≤ 1.5 s / ≤ 0.6 s | ≤ 100 ms | ≤ 0.02 | ≤ 100 ms | ≤ 0.5 s | same |

Request counts: a board paint ≤ 6 requests after the session (board, list page 1, members, actor names, types, workflow defs batched by cache), a sheet open ≤ 4 new requests, a workspace switch 1. A stream frame triggers one reload wave with no duplicate URL.

## 7. How it's verified
- The project's standing bar for every change: RED first, a control in the same `it`, a named mutation, and the catalogue in the same commit (a new bucket `test-cases/25-smoothness.md`, Features `## 22. Smoothness`).
- **Skeleton geometry** is pinned by jsdom tests reading the declared CSS (the `readUiCss`/`ruleExactly` helpers), and by one Playwright viewport case per screen that measures the skeleton's bounding boxes against the content's after load (CLS from the swap ≤ 0.01 per screen) at 390, 768 and 1440 in all three styles.
- **Wait and hold** are pinned by fake-timer tests on `useWait` (shown at 150 ms, not at 149; held to 350 ms after a 10 ms resolve).
- **Optimism and rollback** are pinned the way the board's cases are (`board-optimistic-moves.test.tsx`): a deferred ingest, the overlay observed open, the refusal observed to drop it and to paint the reason.
- **Request counts** are pinned by a fake `DataSource` counting calls per method on the project page and the sheet; **the dedupe** by two concurrent identical reads resolving from one fetch.
- **Bundles** by a source-level import-graph test for the sign-in route plus a recorded `next build` table in the catalogue (🧪, quoted in the task's report).
- **Server batching** by a `Queryable` spy counting queries for a 50-card board (≤ 8) with results equal to the per-ticket function's.
- **The budgets** by a repeatable capture (`capture-perf.mjs` beside the audit's `capture.mjs`: one paced process, a 429 check) producing `metrics.jsonl` with LCP/CLS/INP per route and viewport, ratcheted against a baseline file the way the tap-target ratchet is.
- **A re-audit closes the release:** the same walkthrough as the 2026-10-01 audit's loading class, with before/after frames at 390/768/1440.

## 8. Out of scope
- Offline web, IndexedDB persistence, the replica on the web (D1b, D1c).
- Project-scoped stream rooms and ETags (D8).
- Virtualization (D12) and any change to drag-and-drop behaviour.
- The replica's IPC costs and the mobile WebView reuse (D11).
- Any change to tokens, surfaces or shadows (the neo refresh's) *(exception: Amendment S-R1's `surfacePlaceholder` role is the one token change, and it is owner-ruled)*, any copy rename that the manual quotes, new features, MCP tools.

## Amendment S-R1: structural skeletons (2026-10-02)

**Owner, verbatim:** "can the skeleton take at least the shape of what the actual element would look like?" Then, on the planner's proposal: **"Yes, structural skeletons."**

**Supersedes:** §4.1 (generic shapes as the primary pattern) and §4.3's "Fill: var(--gn-surface-track) in every combination". It resolves the S94 OPEN, where neo N2 made `surfaceTrack` the sunken well. Effort: about +1–2 h across the release (owner informed).

1. **The frame is the real element.** A screen's skeleton renders the component's OWN container classes:
   - the board card (`.gn-board-card`), list row, ticket-sheet header, workspace card, notes list item, and so on;
   - with the same box, radius, padding and border, and in neo its raised surface and halo.
   - The skeleton copies the content's box (S1, no layout shift) by BEING that box.
   - It must not invent a container style. A skeleton rule that names a style attribute is still forbidden (§4.3's style-neutral test stays).
2. **Only the contents are placeholders:**
   - text becomes `Skeleton line` bar(s) at the text's line height and typical width;
   - the avatar becomes `circle` at its real size;
   - the key, state, due and chips become small pill bars at their real sizes and positions.
3. **The placeholder fill is a NEW token role `surfacePlaceholder`:**
   - hig and minimal (light and dark): it maps to the SAME primitive `surfaceTrack` uses today, so their look does not change;
   - neo (light and dark): a FLAT surface step, NEVER the well (`neoWellLight`/`neoWellDark`) and never a field look. Pick the neo surface step one notch off `surface` toward ink, and quote it;
   - decoration only (no text), so no contrast pair is needed;
   - guard 24.009 (hig/minimal byte-identical) must stay green, which the same-primitive mapping guarantees. Add the role to the token report.
4. **`Skeleton` keeps its generic shapes** (`line`, `block`, `circle`) as the PARTS. `card` stays only as a fallback for a region with no real component. The plan's per-screen tasks (T5–T9, T13) build each screen's skeleton from its real component plus parts.
5. **Unchanged:** motion (§4.2), copy (§4.4), accessibility (§5), budgets (§6), WAIT_BEFORE/HOLD.

**Where it lands:** the plan's T2 note (the role and the parts) and the notes on T5, T6, T7, T8, T9 and T13 (each screen's skeleton is its real component's container plus parts; tests assert the container class and that no skeleton fill is the well). Planner's full text: `gisik-nokma-lanes/AMENDMENT-smoothness-S-R1-structural-skeletons.md`.

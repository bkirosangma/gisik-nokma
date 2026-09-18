import { useEffect, useState } from 'react';

/**
 * The last project this person opened, and the tab they last had it on.
 *
 * ## This is `use-last-workspace.ts`'s deliberate SIBLING, one level down
 *
 * It follows that hook rather than inventing a second convention, and the
 * conventions it copies are ones that were paid for — each carries a decision
 * that is not obvious from the code alone:
 *
 * - **The record is KEYED BY USER.** `localStorage` outlives a session. Sign
 *   out, hand the laptop over, and a bare key points the next person's nav at
 *   the previous person's project — that project's NAME rendered in someone
 *   else's chrome, the same defect case 11.169 records for the inbox count. The
 *   stored value carries the user it was written for, and a record belonging to
 *   anyone else answers `none`. It is not cleared on sign-out; it is simply not
 *   honoured, which also survives the case where sign-out never runs at all.
 * - **THREE states, not two** — `unknown` / `none` / `remembered`. See the type
 *   below: collapsing `unknown` into `none` makes a bug representable.
 * - **Every storage access is wrapped**, because a browser with site data
 *   blocked throws on the ACCESSOR, not on the value.
 * - **It does not check that the project still exists.** Deliberate, and not an
 *   omission: the caller resolves the id through the same served read the
 *   workspaces page uses (`use-workspace-projects.ts`, and one step further in
 *   for a single name, `use-project-name.ts`), which yields nothing for
 *   anything the caller cannot reach. One shared read, no second request, and
 *   no second notion of "reachable" to keep in sync with the first.
 *
 * ## One place it DIVERGES from the sibling, and why
 *
 * The remembered PROJECT is keyed by user **and workspace**; the remembered
 * WORKSPACE cannot be, having no parent to be scoped to. A project id is unique
 * inside its workspace and meaningless outside it, so a record keyed by user
 * alone would resolve `p_1`'s name inside whichever workspace the viewer
 * happened to be standing in — naming a project from another workspace, or,
 * worse because it is silent, naming a DIFFERENT project that happens to share
 * the id. Case 13.853 is that property.
 *
 * The TAB map, by contrast, is keyed by user alone. A project id already names
 * its workspace implicitly — the route that carries one carries both — so
 * keying it twice would create two records that can disagree about one fact.
 */
export const LAST_PROJECT_KEY = 'gn-last-project';

/**
 * `projectId -> tab`, for every project this person has opened.
 *
 * Separate from `LAST_PROJECT_KEY` because the two have different lifetimes and
 * different keys: which project you were last in is one fact, and which tab you
 * left each project on is a map that outlives any single one of them. Folding
 * them together would mean the tab you left `p_1` on was erased the moment you
 * opened `p_2` — which is precisely the memory this feature exists to keep.
 */
export const PROJECT_TABS_KEY = 'gn-project-tabs';

/**
 * The five tabs the project page has, declared ONCE.
 *
 * The page's `view` state, the rail it renders and the value this hook stores
 * must agree; two copies of this list would be free to drift, and the failure
 * would be silent — a tab written by one and rejected by the other, reading as
 * "this project has no remembered tab" rather than as an error. The page
 * imports this type for that reason (it used to inline the union), and its
 * `TAB_NOUN` record is still `Record<typeof view, string>`, so a sixth member
 * added here and forgotten there fails `typecheck` exactly as it did before.
 */
export const PROJECT_TABS = ['backlog', 'board', 'list', 'calendar', 'timeline'] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

/**
 * Where a project opens when nothing is remembered for it — and the value the
 * nav seeds when it hands you to a project cold.
 *
 * The project page's own default, unchanged and deliberately NOT the first tab
 * in the rail: Backlog precedes the board in a ticket's lifecycle, but it is
 * not where a person lands. Named here so the page and the nav cannot come to
 * different conclusions about the same question.
 */
export const DEFAULT_PROJECT_TAB: ProjectTab = 'board';

/**
 * THREE states, and the third one is the point.
 *
 * `unknown` is the window before the effect has read storage — first paint, and
 * every server render. It is distinct from `none` because the nav does
 * something different in each: with `none` it falls back to the first
 * non-archived project in served order, and doing that during `unknown` would
 * be answering a question nobody has asked yet — with a different project than
 * the one about to arrive. Collapsing these two into `undefined` is exactly the
 * bug this type exists to make unrepresentable.
 */
export type LastProject =
  | { status: 'unknown' }
  | { status: 'none' }
  | { status: 'remembered'; projectId: string };

/**
 * MODULE-SCOPED, for the reason `use-last-workspace.ts` records for its own:
 * `AppNav` is rendered by each PAGE, not by the root layout, so every
 * client-side navigation unmounts and remounts it. Per-component state would
 * reset to `unknown` on every page change and the project item would vanish for
 * the tick it takes to read storage, then come back — the flicker the owner
 * reported for the workspace name, which one level up was fixed exactly here.
 *
 * Keyed by user AND workspace, because the answer depends on both: a cache that
 * outlived a sign-out would hand the next person the previous one's project,
 * and one that ignored the workspace would answer for the wrong one entirely,
 * bypassing the guard in `readFor` by never reaching it.
 */
let cache: { userId: string; workspaceId: string; value: LastProject } | null = null;

/** Tests share one module, so they share this. Cleared between cases. */
export function clearLastProjectCache(): void {
  cache = null;
}

/** The last project this person opened in this workspace. See `cache`. */
export function useLastProject(
  workspaceId: string | undefined,
  routeProjectId: string | undefined,
  userId: string | null,
): LastProject {
  const [remembered, setRemembered] = useState<LastProject>(() =>
    // Only the initial value: `useState`'s initialiser runs once per mount, so
    // this is the remount's head start and never a source of staleness after.
    userId !== null &&
    workspaceId !== undefined &&
    cache !== null &&
    cache.userId === userId &&
    cache.workspaceId === workspaceId
      ? cache.value
      : { status: 'unknown' },
  );

  useEffect(() => {
    // Signed out, or no workspace in scope: nothing is remembered FOR anybody.
    // Answering `none` rather than reading means a signed-out viewer never gets
    // a project link at all, which is what they can reach.
    if (userId === null || workspaceId === undefined) {
      setRemembered({ status: 'none' });
      return;
    }

    // The viewer or the workspace changed, so the cached answer is about a
    // different question. Dropped rather than merely not-read: a stale entry
    // left behind is re-read by `useState` on the next remount and the previous
    // answer would come back one navigation after the product learned it was
    // wrong.
    if (cache !== null && (cache.userId !== userId || cache.workspaceId !== workspaceId)) {
      cache = null;
    }

    const remember = (value: LastProject): void => {
      cache = { userId, workspaceId, value };
      setRemembered(value);
    };

    // The route is authority. Opening a project is what makes it the last one
    // opened, so this is both the write and the answer.
    if (routeProjectId !== undefined) {
      rememberProject(workspaceId, routeProjectId, userId);
      remember({ status: 'remembered', projectId: routeProjectId });
      return;
    }

    remember(readFor(userId, workspaceId));
  }, [workspaceId, routeProjectId, userId]);

  return remembered;
}

/**
 * Records a project as the last one opened, for this user in this workspace.
 *
 * EXPORTED because TWO doors open a project, and both must write the same
 * record: the project page, whose route is authority and which reaches this
 * through the hook's own `routeProjectId`, and the nav item's click, which
 * writes it BEFORE the navigation lands — so a destination that fails to render
 * cannot leave the memory pointing at the project you were on before. One
 * writer, so the two cannot come to disagree about the record's shape, its key,
 * or its user guard.
 */
export function rememberProject(
  workspaceId: string,
  projectId: string,
  userId: string | null,
): void {
  // No session: nothing is remembered FOR anybody, so nothing is written.
  if (userId === null) return;

  try {
    window.localStorage.setItem(
      LAST_PROJECT_KEY,
      JSON.stringify({ userId, workspaceId, projectId }),
    );
  } catch {
    // A private window, or site data blocked. The nav still works from the
    // route for this page; only the memory is lost, and a nav that refused to
    // render because it could not write a convenience would be worse.
  }

  // The module cache is brought along ONLY when it is already about this same
  // question. A cache holding another user's or another workspace's answer is
  // left as it is rather than being made to answer for one it was not read for.
  if (cache !== null && cache.userId === userId && cache.workspaceId === workspaceId) {
    cache = { userId, workspaceId, value: { status: 'remembered', projectId } };
  }
}

/** Every failure answers `none`: an unreadable memory is no memory. */
function readFor(userId: string, workspaceId: string): LastProject {
  const parsed = readJson(LAST_PROJECT_KEY);
  if (typeof parsed !== 'object' || parsed === null) return { status: 'none' };

  const { userId: storedUserId, workspaceId: storedWorkspaceId, projectId } = parsed as {
    userId?: unknown;
    workspaceId?: unknown;
    projectId?: unknown;
  };
  if (
    typeof storedUserId !== 'string' ||
    typeof storedWorkspaceId !== 'string' ||
    typeof projectId !== 'string'
  ) {
    return { status: 'none' };
  }
  // SOMEONE ELSE'S. See the docblock — this is the whole reason for the key's
  // shape, and it is checked before the id is handed back, never after.
  if (storedUserId !== userId) return { status: 'none' };
  // AND NOT THIS WORKSPACE'S. See the divergence note in this file's docblock.
  if (storedWorkspaceId !== workspaceId) return { status: 'none' };

  return { status: 'remembered', projectId };
}

/**
 * The tab this person last had the project on, or `null`.
 *
 * `null` is the honest answer for all four ways there is nothing to return: no
 * session, no entry, unreadable storage, and a stored value that is not a tab.
 * The caller's job is to fall back — the project page to `DEFAULT_PROJECT_TAB`,
 * the nav to seeding that same default — so collapsing them here costs nothing
 * and spares every caller the same four-arm decision.
 */
export function readProjectTab(projectId: string, userId: string | null): ProjectTab | null {
  if (userId === null) return null;

  const parsed = readJson(PROJECT_TABS_KEY);
  if (typeof parsed !== 'object' || parsed === null) return null;

  const { userId: storedUserId, tabs } = parsed as { userId?: unknown; tabs?: unknown };
  if (storedUserId !== userId) return null;
  if (typeof tabs !== 'object' || tabs === null) return null;

  const value = (tabs as Record<string, unknown>)[projectId];
  // The union is the door. A value outside it — hand-edited, or written by an
  // older shape of this key — must not reach `useState`: the page's rail would
  // then have no selected segment and no rendering arm, which is a blank page
  // rather than a wrong one.
  return isProjectTab(value) ? value : null;
}

/**
 * Remembers the tab for one project, leaving every other project's entry alone.
 *
 * A no-op with no session, for the reason `readProjectTab` answers `null`:
 * nothing is remembered FOR anybody, so nothing is written.
 */
export function rememberProjectTab(
  projectId: string,
  tab: ProjectTab,
  userId: string | null,
): void {
  if (userId === null) return;

  // The existing map is read back so this project's entry joins it rather than
  // replacing every other project's — and a map belonging to someone else is
  // discarded rather than extended, which is the write half of the same guard
  // `readProjectTab` makes on the read half.
  const existing = readJson(PROJECT_TABS_KEY);
  const tabs: Record<string, ProjectTab> =
    typeof existing === 'object' &&
    existing !== null &&
    (existing as { userId?: unknown }).userId === userId &&
    typeof (existing as { tabs?: unknown }).tabs === 'object' &&
    (existing as { tabs?: unknown }).tabs !== null
      ? { ...((existing as { tabs: Record<string, ProjectTab> }).tabs) }
      : {};

  tabs[projectId] = tab;
  try {
    window.localStorage.setItem(PROJECT_TABS_KEY, JSON.stringify({ userId, tabs }));
  } catch {
    // See the write in `useLastProject`: a lost convenience, never a failure
    // the page should surface. This one runs inside a click handler.
  }
}

function isProjectTab(value: unknown): value is ProjectTab {
  return typeof value === 'string' && (PROJECT_TABS as readonly string[]).includes(value);
}

/**
 * `JSON.parse` over one key, with every failure — a throwing accessor, a
 * missing key, unparseable text — answering `null`.
 *
 * Shared by the three readers above so the wrapping is written once: the
 * accessor is what raises in a blocked browser, and a second copy of this
 * guard is a second place for it to be forgotten.
 */
function readJson(key: string): unknown {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Hand-edited, or written by an older shape of this key.
    return null;
  }
}

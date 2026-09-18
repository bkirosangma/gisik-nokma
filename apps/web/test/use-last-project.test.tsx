import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LastProject } from '../src/use-last-project.js';
import {
  LAST_PROJECT_KEY,
  PROJECT_TABS_KEY,
  clearLastProjectCache,
  readProjectTab,
  rememberProjectTab,
  useLastProject,
} from '../src/use-last-project.js';

/**
 * `use-last-project` — the workspace hook's deliberate sibling, ONE level down.
 *
 * ## Why this file uses a PROBE COMPONENT and not `renderHook`
 *
 * Two reasons, and the first is the one that matters.
 *
 * `@testing-library/react`'s installed `renderHook` (16.3.3) sets only
 * `result.current` — there is no `result.all` — and it flushes effects inside
 * its own `act`. So by the time it hands you a result, the effect has already
 * run and the FIRST answer is gone. That first answer is exactly what these
 * cases are about: `unknown` is the state the nav must render *nothing* from,
 * and a case that cannot see it is a case that cannot pin it. Collapsing
 * `unknown` into `none` is the defect the three-state type exists to make
 * unrepresentable, and it would flash a false sentence at every first paint —
 * which is the shape the workspace hook's own docblock records as the bug it
 * was written against.
 *
 * The probe records EVERY render's answer, so `seen[0]` is the first paint and
 * `seen[seen.length - 1]` is the settled one. It is also the honest instrument:
 * a component is the only thing that consumes this hook, so the array is what a
 * consumer would actually observe.
 *
 * Second, no file in this suite uses `renderHook`, and this is not the place to
 * introduce the convention.
 */

/**
 * Every case starts cold, in both layers of state.
 *
 * `localStorage` is shared across this whole file — jsdom keeps one storage for
 * the module — and this hook has a MODULE-SCOPED cache on top of it, which one
 * test file shares for its whole run. Both leak between cases, and a case that
 * inherited the previous one's record would pass or fail on state its own body
 * cannot see. That is order-dependence, and it shows up as a suite that goes red
 * when an unrelated test is renamed.
 */
beforeEach(() => {
  window.localStorage.clear();
  clearLastProjectCache();
});

/**
 * Renders the hook and returns the answer from each render, oldest first.
 *
 * `render` wraps its work in `act`, so the effect has flushed by the time this
 * returns and the array is complete — `[unknown, <settled>]` for a read, and
 * `[unknown, remembered]` for a route.
 */
function probe(
  workspaceId: string | undefined,
  routeProjectId: string | undefined,
  userId: string | null,
): LastProject[] {
  const seen: LastProject[] = [];
  function Probe() {
    seen.push(useLastProject(workspaceId, routeProjectId, userId));
    return null;
  }
  render(<Probe />);
  return seen;
}

/** The settled answer, which is the last render's. */
function settled(seen: LastProject[]): LastProject {
  return seen[seen.length - 1] as LastProject;
}

/**
 * The record as `useLastProject` writes it. Written here by hand rather than by
 * calling the writer, so a case that reads it back is testing the READ and not
 * a round trip through the same two functions.
 */
function storeRecord(record: { userId: string; workspaceId: string; projectId: string }): void {
  window.localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify(record));
}

/**
 * A browser with site data blocked throws on the ACCESSOR, not on the value —
 * `window.localStorage` is what raises, before any method is reached. That is
 * the case the hook's every-access guard exists for, and it is the only shape
 * worth testing: a `getItem` that throws would be a strictly weaker claim.
 */
const REAL_STORAGE = Object.getOwnPropertyDescriptor(window, 'localStorage');

function blockStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('site data blocked');
    },
  });
}

afterEach(() => {
  if (REAL_STORAGE !== undefined) Object.defineProperty(window, 'localStorage', REAL_STORAGE);
});

describe('useLastProject — the remembered project, keyed by user AND workspace', () => {
  /**
   * 13.850 — the THREE states, and the first one is the point.
   *
   * `unknown` is the window before the effect has read storage — first paint,
   * and every server render. It is distinct from `none` because the nav says
   * something different in each: with a settled `none` it falls back to the
   * first project, and doing that during `unknown` would be answering a
   * question nobody has asked yet. This case asserts BOTH ends, so the type
   * cannot quietly collapse to two states.
   */
  it('13.850 answers `unknown` on the first paint, then `none` when storage holds nothing', () => {
    const seen = probe('ws_1', undefined, 'u_kiro');

    expect(seen[0]).toEqual({ status: 'unknown' });
    expect(settled(seen)).toEqual({ status: 'none' });
  });

  /**
   * 13.851 — a record belonging to SOMEONE ELSE is not honoured.
   *
   * `localStorage` outlives a session. Sign out, hand the laptop over, and an
   * unkeyed record points the next person's nav at the previous person's
   * project — its NAME rendered in someone else's chrome, which is the same
   * defect case 11.169 pins for the inbox count and 13.425 pins one level up.
   *
   * The control stores the IDENTICAL record with only `userId` changed, so the
   * `none` below cannot be explained by a malformed fixture, a wrong key, or a
   * parse failure: the same bytes, read by the right person, answer
   * `remembered`.
   */
  it('13.851 ignores a project remembered for a different user', () => {
    storeRecord({ userId: 'u_someone_else', workspaceId: 'ws_1', projectId: 'p_1' });
    expect(settled(probe('ws_1', undefined, 'u_kiro'))).toEqual({ status: 'none' });

    // The control, through the same path: same record, `userId` swapped.
    window.localStorage.clear();
    clearLastProjectCache();
    storeRecord({ userId: 'u_kiro', workspaceId: 'ws_1', projectId: 'p_1' });
    expect(settled(probe('ws_1', undefined, 'u_kiro'))).toEqual({
      status: 'remembered',
      projectId: 'p_1',
    });
  });

  /**
   * 13.852 — a record for this user AND this workspace is honoured.
   *
   * The plain positive the two absence cases above need to be read against:
   * without it, both would pass on a hook that never reads storage at all.
   */
  it('13.852 answers `remembered` for this user in this workspace', () => {
    storeRecord({ userId: 'u_kiro', workspaceId: 'ws_1', projectId: 'p_1' });

    expect(settled(probe('ws_1', undefined, 'u_kiro'))).toEqual({
      status: 'remembered',
      projectId: 'p_1',
    });
  });

  /**
   * 13.853 — THE WORKSPACE HALF OF THE KEY, which the workspace hook one level
   * up has no analogue for.
   *
   * A project id is unique inside its workspace and meaningless outside it, so
   * a record keyed by user alone would resolve `p_1`'s name inside whichever
   * workspace the viewer happened to be standing in — the nav would name a
   * project from another workspace, or (worse, because it is silent) name a
   * DIFFERENT project that happens to share the id. The control reads the same
   * record from the workspace it was written for, so a `none` below cannot be
   * a read that failed for some unrelated reason.
   */
  it('13.853 does not leak a project across workspaces', () => {
    storeRecord({ userId: 'u_kiro', workspaceId: 'ws_2', projectId: 'p_9' });

    expect(settled(probe('ws_1', undefined, 'u_kiro'))).toEqual({ status: 'none' });

    // The control: the same bytes, read from the workspace they name.
    window.localStorage.clear();
    clearLastProjectCache();
    storeRecord({ userId: 'u_kiro', workspaceId: 'ws_2', projectId: 'p_9' });
    expect(settled(probe('ws_2', undefined, 'u_kiro'))).toEqual({
      status: 'remembered',
      projectId: 'p_9',
    });
  });

  /**
   * 13.854 — a browser with site data blocked does not throw, and answers
   * `none`.
   *
   * The accessor is what throws, so this is the shape `use-last-workspace`'s
   * docblock names: "a browser with site data blocked throws on the ACCESSOR,
   * not on the value". An unguarded read would take the whole nav down on the
   * first render, and every page renders the nav.
   *
   * The case asserts the settled answer rather than merely "did not throw" —
   * `none` is the claim, and a hook that swallowed the error but answered
   * `remembered` with an invented id would pass a throw-only assertion.
   */
  it('13.854 survives storage that throws on access, and answers `none`', () => {
    blockStorage();

    expect(settled(probe('ws_1', undefined, 'u_kiro'))).toEqual({ status: 'none' });
  });

  /**
   * 13.855 — the ROUTE is authority, exactly as it is one level up.
   *
   * Opening a project is what makes it the last one opened, so the answer is
   * both the write and the return value. Asserted on the STORE as well as on
   * the return: a hook that answered `remembered` from the route without
   * persisting would pass the return half and lose the memory on the next page.
   */
  it('13.855 records the project when one is opened, and answers `remembered`', () => {
    expect(settled(probe('ws_1', 'p_7', 'u_kiro'))).toEqual({
      status: 'remembered',
      projectId: 'p_7',
    });

    expect(JSON.parse(window.localStorage.getItem(LAST_PROJECT_KEY) as string)).toEqual({
      userId: 'u_kiro',
      workspaceId: 'ws_1',
      projectId: 'p_7',
    });
  });
});

describe('useLastProject — the tab map', () => {
  /**
   * 13.856 — a tab remembered for a project is read back for the SAME person.
   *
   * The tab map is keyed by user and NOT by workspace: a project id already
   * names its workspace implicitly (the route that carries one carries both),
   * and keying it twice would mean two records that can disagree about one
   * fact. What it is keyed by is the USER, for the reason every record in this
   * hook is.
   */
  it('13.856 reads back the tab remembered for this user', () => {
    rememberProjectTab('p_1', 'calendar', 'u_kiro');

    expect(readProjectTab('p_1', 'u_kiro')).toBe('calendar');
    // Same path, a project nothing was remembered for.
    expect(readProjectTab('p_2', 'u_kiro')).toBeNull();
  });

  /**
   * 13.857 — another person's tab map is not honoured.
   *
   * The control writes through the SAME writer with a different user and then
   * reads it back with the writer's own user, so a null below cannot be a
   * writer that silently did nothing.
   */
  it('13.857 does not honour a tab map belonging to another user', () => {
    rememberProjectTab('p_1', 'timeline', 'u_someone_else');

    expect(readProjectTab('p_1', 'u_kiro')).toBeNull();
    // Control: the write landed, and is readable by the person it names.
    expect(readProjectTab('p_1', 'u_someone_else')).toBe('timeline');
  });

  /**
   * 13.858 — a stored value that is NOT a tab answers `null`, never a guess.
   *
   * Hand-edited storage, or a value written by an older shape of this key. The
   * union has five members and the read is the door: a value outside it reaching
   * `useState` would put the page's tab rail into a state with no selected
   * segment and no rendering arm, which is a blank page rather than a wrong
   * one. Both a non-member string and a malformed container are covered, and
   * the control is a member written through the writer.
   */
  it('13.858 answers null for a stored value that is not a tab', () => {
    // Control first: the writer's own output IS a member and IS read back.
    rememberProjectTab('p_ok', 'backlog', 'u_kiro');
    expect(readProjectTab('p_ok', 'u_kiro')).toBe('backlog');

    for (const bad of ['settings', '', 'Board', '{}', '5']) {
      window.localStorage.setItem(
        PROJECT_TABS_KEY,
        JSON.stringify({ userId: 'u_kiro', tabs: { p_bad: bad } }),
      );
      expect(readProjectTab('p_bad', 'u_kiro')).toBeNull();
    }

    // And a container that is not the shape at all.
    for (const junk of ['not json', '"a string"', '[]', '{"userId":"u_kiro"}', 'null']) {
      window.localStorage.setItem(PROJECT_TABS_KEY, junk);
      expect(readProjectTab('p_bad', 'u_kiro')).toBeNull();
    }
  });

  /**
   * 13.859 — blocked storage does not throw on the tab path either, reading OR
   * writing, and a signed-out viewer writes nothing at all.
   *
   * The write half matters more than it looks: this runs from `setView`, which
   * is a click handler on the project page. An unguarded write would turn
   * "switch to the List tab" into an exception inside a React event handler.
   */
  it('13.859 survives blocked storage on both the tab read and the tab write', () => {
    blockStorage();

    expect(() => rememberProjectTab('p_1', 'list', 'u_kiro')).not.toThrow();
    expect(readProjectTab('p_1', 'u_kiro')).toBeNull();
    // No session: nothing is remembered FOR anybody, and nothing is written.
    expect(() => rememberProjectTab('p_1', 'list', null)).not.toThrow();
    expect(readProjectTab('p_1', null)).toBeNull();
  });
});

import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * `use-workspace-projects` — the project LIST out of the ONE shared read.
 *
 * The nav's remembered project is only ever rendered when this hook says the
 * workspace HAS it, which is what makes it impossible for the item to name
 * something unreachable. That is `use-workspace-name`'s own contract one level
 * down: the same `getMyWorkspaces` call, the same "a failure is OMISSION, never
 * the id" rule, and the same module-scoped cache for the same remount reason.
 *
 * A PROBE COMPONENT again, for the reason `use-last-project.test.tsx` records:
 * the first-frame answer is a property under test (the nav's jitter fix), and
 * `renderHook` as installed cannot show it.
 */

/**
 * E5-25 — `Providers` now reads the router (it wraps the ONE `DataSource` in
 * the session-expiry guard, so a write that ends in a 401 can send the person
 * to `/sign-in` once). In the product it is mounted inside the app router and
 * this is free; a test that renders it directly is not, and `useRouter()`
 * throws `invariant expected app router to be mounted` before the memo can see
 * the injected `services`. One `push` — the guard's only use of it.
 */
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

let mockSessionUser: { id: string; name: string; email?: string } | null = {
  id: 'u_kiro',
  name: 'Kiro',
  email: 'kiro@example.com',
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockSessionUser === null ? null : { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { clearWorkspaceProjectsCache, useWorkspaceProjects } from '../src/use-workspace-projects.js';

beforeEach(() => {
  clearWorkspaceProjectsCache();
  routerPush.mockClear();
  mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
});

function project(over: Partial<ProjectRef> & { id: string }): ProjectRef {
  return { name: `Project ${over.id}`, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0, ...over };
}

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Convenience Corner',
    prefix: 'CC',
    role: 'owner',
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

function servicesFor(refs: WorkspaceRef[]) {
  return stubServices({ getMyWorkspaces: async () => refs });
}

/**
 * Records every render's answer; `seen[0]` is the first frame.
 *
 * ASYNC, because the read is a promise: `render` flushes effects but not the
 * `.then` behind them, so a synchronous probe returns with `seen` holding only
 * the cold frame and every settled assertion below would read the first frame
 * instead of the last. The explicit microtask flush is what closes that gap,
 * and it is here rather than a `waitFor` on a condition because the SIGNED-OUT
 * arm of 13.863 sets state it already holds, React bails out of the re-render,
 * and a "wait until there are two frames" condition would hang on a case that is
 * passing.
 */
async function probe(
  services: ReturnType<typeof stubServices>,
  workspaceId: string | undefined,
): Promise<(ProjectRef[] | null)[]> {
  const seen: (ProjectRef[] | null)[] = [];
  function Probe() {
    seen.push(useWorkspaceProjects(workspaceId));
    return null;
  }
  render(
    <Providers services={services}>
      <Probe />
    </Providers>,
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return seen;
}

const settled = (seen: (ProjectRef[] | null)[]) => seen[seen.length - 1];

describe('useWorkspaceProjects — the served project list for one workspace', () => {
  /**
   * 13.860 — the list is the SERVED order, archived rows INCLUDED.
   *
   * Order is not this hook's decision to make. `/workspaces` renders
   * `workspace.projects` with the archived ones filtered out and does NOT sort,
   * and the nav falls back to "the first non-archived project in served order"
   * — so a hook that sorted, or that dropped archived rows here, would put the
   * nav and the workspaces page on two different answers to one question. The
   * filtering belongs to the caller; this is the rows.
   */
  it('13.860 answers the workspace’s projects in served order, archived included', async () => {
    const projects = [
      project({ id: 'p_b', name: 'Beta' }),
      project({ id: 'p_a', name: 'Alpha', archived: true }),
      project({ id: 'p_c', name: 'Gamma' }),
    ];
    const seen = await probe(servicesFor([workspace({ id: 'ws_1', projects })]), 'ws_1');

    expect(settled(seen)).toEqual([
      { id: 'p_b', name: 'Beta', prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 },
      { id: 'p_a', name: 'Alpha', prefix: 'PJ', archived: true, ticketCount: 0, blockedCount: 0 },
      { id: 'p_c', name: 'Gamma', prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 },
    ]);
  });

  /**
   * 13.861 — a workspace the read SUCCEEDS without is `null`, and the cache is
   * EVICTED.
   *
   * You were removed from it, or it was deleted. `null` and `[]` are different
   * claims: `[]` says "this workspace exists and has no projects", which is the
   * one thing the nav's fallback would then act on. The eviction half is the
   * part `use-workspace-name.ts` records as load-bearing — a stale entry left
   * behind is re-read by `useState` on the next remount, and the answer comes
   * back one navigation after the product learned it was wrong.
   *
   * The control warms the cache for the same id FIRST, so an eviction that
   * never had anything to evict cannot pass this.
   */
  it('13.861 answers null for a workspace the read does not contain, and evicts what it cached', async () => {
    // Control: ws_gone resolves while it is present...
    const present = await probe(
      servicesFor([workspace({ id: 'ws_gone', projects: [project({ id: 'p_1' })] })]),
      'ws_gone',
    );
    expect(settled(present)).toHaveLength(1);
    // ...so a null here is an eviction, not a cache that never held anything.
    expect(settled(await probe(servicesFor([]), 'ws_gone'))).toBeNull();
    // And it stays evicted: a third mount against the empty read is still null
    // on its FIRST frame, not after a round trip.
    expect((await probe(servicesFor([]), 'ws_gone'))[0]).toBeNull();
  });

  /**
   * 13.862 — a REFUSED read is `null`, never an invented empty list.
   *
   * The distinction is the whole point of the helper this suite shares: `[]`
   * here would be this hook asserting that a workspace exists and contains no
   * projects. The nav would then render its "no reachable project" branch —
   * which happens to be nothing — and a refusal would be indistinguishable from
   * an empty project list. `null` keeps them apart.
   */
  it('13.862 answers null when the read refuses', async () => {
    const services = stubServices({
      getMyWorkspaces: async () => {
        throw new Error('served read refused');
      },
    });

    expect(settled(await probe(services, 'ws_1'))).toBeNull();
  });

  /**
   * 13.863 — signed out, or no workspace in scope, fires NOTHING.
   *
   * `use-workspace-name.ts` gates on a session "for the same reason
   * `InboxNavLink`'s poll does: a signed-out viewer transiently on a
   * workspace-scoped route must not fire a request that cannot succeed". The
   * spy is what makes this case about the REQUEST rather than its answer — a
   * `null` alone would also be produced by a read that fired and failed.
   */
  it('13.863 fires no request with no session, or with no workspace in scope', async () => {
    const calls: number[] = [];
    const services = stubServices({
      getMyWorkspaces: async () => {
        calls.push(1);
        return [];
      },
    });

    mockSessionUser = null;
    expect(settled(await probe(services, 'ws_1'))).toBeNull();
    expect(calls).toHaveLength(0);

    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    expect(settled(await probe(services, undefined))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  /**
   * 13.864 — THE JITTER, one level down.
   *
   * `AppNav` is rendered by each PAGE, so every client-side navigation remounts
   * it and per-component state restarts cold. Without the module cache the
   * project item would vanish for the tick it takes to read storage on every
   * page change and then come back — the flicker the owner reported for the
   * workspace name, which is why that hook has a cache and this one does too.
   *
   * The assertion is on the FIRST frame of the SECOND mount, and the first
   * mount in the same case is the control that proves the cache was warm: a
   * fresh module would answer `null` there, which is what makes "not null"
   * meaningful rather than vacuous.
   */
  /**
   * 13.878 — the cache is keyed by USER as well, because this list is
   * VIEWER-FILTERED and a workspace's name is not.
   *
   * `use-workspace-name.ts` keys its cache by workspace id alone and is right
   * to: everyone who can see a workspace is told the same name. A project list
   * is not that. The server serves a non-owner only the projects they hold a
   * membership in (`apps/server/src/read/visible-projects.ts` — the owner gets
   * the row set, everybody else gets it filtered by `eff.projects`), so one
   * `workspaceId` is a different list for every viewer.
   *
   * The sequence this forbids is ordinary: sign out, sign in as someone with
   * narrower access, and the nav's first paint names projects they cannot open
   * — from the cache, before the fresh read lands, and indefinitely if that
   * read is slow or failing. Sign-out is a CLIENT-SIDE navigation
   * (`account-menu.tsx`'s `router.push('/sign-in')`), so module state survives
   * it; the key is the only thing standing between the two viewers.
   *
   * The first frame IS the assertion — the settled value is Bob's either way,
   * because the fresh read always wins eventually. Only a warm cache can make
   * the second mount paint someone else's list.
   */
  it('13.878 does not serve one viewer the list cached for another', async () => {
    const alice = await probe(
      servicesFor([
        workspace({ id: 'ws_1', projects: [project({ id: 'p_alice', name: 'Alice Only' })] }),
      ]),
      'ws_1',
    );
    // Control: the cache is warm for u_kiro, so a miss below is the KEY and not
    // a cache that never held anything.
    expect(settled(alice)).toHaveLength(1);

    mockSessionUser = { id: 'u_bob', name: 'Bob', email: 'bob@example.com' };
    const bob = await probe(
      servicesFor([
        workspace({ id: 'ws_1', projects: [project({ id: 'p_bob', name: 'Bob Only' })] }),
      ]),
      'ws_1',
    );

    expect(bob[0]).toBeNull();
    expect(settled(bob)).toEqual([expect.objectContaining({ id: 'p_bob' })]);
  });

  it('13.864 paints a previously-read list on the first frame of the next mount', async () => {
    const services = servicesFor([workspace({ id: 'ws_1', projects: [project({ id: 'p_1' })] })]);

    const first = await probe(services, 'ws_1');
    expect(first[0]).toBeNull(); // cold: the first frame knows nothing yet
    expect(settled(first)).toHaveLength(1);

    const second = await probe(services, 'ws_1');
    expect(second[0]).toHaveLength(1); // warm: the remount's head start
  });
});

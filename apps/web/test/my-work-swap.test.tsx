import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttentionItem, GlobalSection, MyWorkView, WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearMyWorkspacesCache } from '../src/use-my-workspaces.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { AttentionBandSkeleton, MyWorkSkeleton } from '../src/skeletons/screen-skeletons.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Smoothness-2 G1, the MY WORK half (cases 25.250-25.253; DIAGNOSIS §3): the attention strip and the body are two reads and two
 * swaps, and a paint between the two commits moved the second region's neighbour by the difference between the strip's 4rem skeleton
 * and the real strip (my work CLS 0 or 0.6923 at 390 depending on which side of a 20 ms gap a paint fell, 0.289 at 768, 0.1898 at 1440).
 * jsdom has no paint, so the contract is read from what is IN the page after each read answers: never exactly one of the two regions
 * swapped.
 *
 * AMENDED 2026-10-06 (the main -> release sync, planner ruling): My work is ONE global page since my-work-global T4
 * (`app/my-work/page.tsx`; the per-workspace route only redirects to it, 30.040), so the hold, and these cases, moved there. The
 * reads are the fan-out (`useGlobalMyWork`), asked once the workspaces and the My work document have answered; the hold covers the
 * FIRST load only, and a later Show change is not held (25.252's last leg).
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/my-work',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } } }), signOut: async () => ({ data: {}, error: null }) },
}));

/** A section can be taken over for one case (25.252: a region ALREADY answered at the first ask); otherwise the real fan-out runs. */
const override: { attention: GlobalSection<AttentionItem[]> | null; myWork: GlobalSection<MyWorkView> | null } = { attention: null, myWork: null };
vi.mock('@gisik-nokma/app-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/app-core')>();
  return {
    ...actual,
    useGlobalMyWork: (...args: Parameters<typeof actual.useGlobalMyWork>) => {
      const real = actual.useGlobalMyWork(...args);
      return { ...real, attention: override.attention ?? real.attention, myWork: override.myWork ?? real.myWork };
    },
  };
});

import MyWorkPage from '../app/my-work/page.js';

const ALPHA: WorkspaceRef = {
  id: WORKSPACE,
  name: 'Alpha Works',
  prefix: 'WS',
  role: 'member',
  archived: false,
  memberCount: 2,
  nameRestrictedProjectCount: 0,
  projects: [{ id: 'p1', name: 'Mango', prefix: 'PR', archived: false, ticketCount: 1, blockedCount: 0 }],
};
/** A second workspace, for a refusal from ONE workspace of several (it lands in `byWorkspace`, drawn under the strip). */
const BETA: WorkspaceRef = { ...ALPHA, id: '01J9WSBETA0000000000000000', name: 'Beta Freight', projects: [] };
const ITEM: AttentionItem = { kind: 'overdue', ticketId: 't1', workspaceId: WORKSPACE, projectId: 'p1', title: 'File the GST return', reason: 'Two days overdue', claim: null };
const VIEW: MyWorkView = { assigned: [], inTransit: [], contested: [], shared: [] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
type Deferred<T> = ReturnType<typeof deferred<T>>;
const answered = <T,>(data: T): GlobalSection<T> => ({ data, error: null, byWorkspace: {}, settled: true });
const waiting = <T,>(): GlobalSection<T> => ({ data: null, error: null, byWorkspace: {}, settled: false });

/**
 * One workspace, the default document, and every ask of the two reads parked on its own deferred, in ask order: a case answers
 * `attention[n]` / `body[n]` only once the page has asked it (an answer settled before the ask would not force an order).
 */
function world(opts: { workspaces?: WorkspaceRef[]; refuseAttention?: string; refuseBody?: string } = {}) {
  const attention: Deferred<AttentionItem[]>[] = [];
  const body: Deferred<MyWorkView>[] = [];
  const services = stubServices({
    getMyWorkspaces: async () => opts.workspaces ?? [ALPHA],
    getMembers: async () => [],
    getActorNames: async () => [],
    getMyWorkPreferences: async () => ({ show: ['created', 'assigned'], grouping: 'flat' }),
    putMyWorkPreferences: async (doc) => doc,
    getAttention: (workspaceId) => {
      // `refuseAttention` names a workspace whose strip read refuses at once; it is not parked.
      if (workspaceId === opts.refuseAttention) return Promise.reject(new Error('Beta could not be read.'));
      const read = deferred<AttentionItem[]>();
      attention.push(read);
      return read.promise;
    },
    getMyWork: (workspaceId) => {
      if (workspaceId === opts.refuseBody) return Promise.reject(new Error('Beta work could not be read.'));
      const read = deferred<MyWorkView>();
      body.push(read);
      return read.promise;
    },
  });
  return { services, attention, body };
}
const mount = (services: ReturnType<typeof world>['services']) => render(<Providers services={services}><MyWorkPage /></Providers>);
/** Both reads of ask round `n` are out (round 0 is the first load, round 1 the first chip change). */
const asked = async (w: ReturnType<typeof world>, n = 0) => waitFor(() => expect(w.attention.length > n && w.body.length > n).toBe(true));

/** What a reader sees: the skeleton regions still up, and the real strip / body. The strip and the body wear the same classes as their skeletons, so busy decides. */
function frame() {
  const busy = [...document.querySelectorAll('[aria-busy="true"]')].map((el) => el.textContent ?? '');
  return {
    bandSkeleton: busy.some((text) => text.includes('Loading what needs your attention')),
    bodySkeleton: busy.some((text) => text.includes('Loading your work')),
    strip: document.querySelector('aside.gn-attention:not([aria-busy])') !== null,
    body: [...document.querySelectorAll('.gn-my-work')].some((el) => el.closest('[aria-busy="true"]') === null),
  };
}
/** The defect: exactly one of the two regions has swapped. */
const mixed = (f: ReturnType<typeof frame>): boolean => f.bandSkeleton !== f.bodySkeleton;

beforeEach(() => {
  cleanup();
  clearMyWorkspacesCache();
  clearWorkspaceNameCache();
  override.attention = null;
  override.myWork = null;
});
afterEach(() => cleanup());

describe('the two regions swap in one commit (G1 §3)', () => {
  it('25.250 with the reads forced in EACH order, no frame has exactly one region swapped; control: the pre-fix shape (two independent swaps) does show such a frame', async () => {
    for (const order of ['my-work first', 'attention first'] as const) {
      cleanup();
      clearMyWorkspacesCache();
      clearWorkspaceNameCache();
      const w = world();
      mount(w.services);
      await asked(w);
      expect(frame().bandSkeleton && frame().bodySkeleton, order).toBe(true);
      const [first, second] = order === 'my-work first' ? [() => w.body[0]!.resolve(VIEW), () => w.attention[0]!.resolve([ITEM])] : [() => w.attention[0]!.resolve([ITEM]), () => w.body[0]!.resolve(VIEW)];
      await act(async () => first());
      // The first answer is in; the page still shows BOTH skeletons and neither real region.
      const between = frame();
      expect(mixed(between), order).toBe(false);
      expect(between.bandSkeleton && between.bodySkeleton && !between.strip && !between.body, order).toBe(true);
      await act(async () => second());
      await waitFor(() => expect(frame().strip && frame().body).toBe(true));
      const after = frame();
      expect(after.bandSkeleton || after.bodySkeleton, order).toBe(false);
    }
    // CONTROL (the probe can see the defect): the two regions as they were, each swapped on its own read.
    cleanup();
    function Ungated({ a, b }: { a: AttentionItem[] | null; b: MyWorkView | null }) {
      return (
        <main>
          {a === null ? <AttentionBandSkeleton /> : <aside className="gn-attention">strip</aside>}
          {b === null ? <MyWorkSkeleton /> : <div className="gn-my-work">body</div>}
        </main>
      );
    }
    const view = render(<Ungated a={null} b={null} />);
    view.rerender(<Ungated a={null} b={VIEW} />);
    expect(mixed(frame())).toBe(true);
  });

  it('25.251 an answered-empty strip (nothing needs attention) and a refused read settle in the same commit as the body, never before it', async () => {
    // Empty strip first: the band gives way to the page's empty sentence in the SAME commit the body appears.
    const w = world();
    mount(w.services);
    await asked(w);
    await act(async () => w.attention[0]!.resolve([]));
    expect(frame().bandSkeleton, 'the band must not collapse while the body is still a skeleton').toBe(true);
    expect(frame().bodySkeleton).toBe(true);
    expect(document.querySelector('.gn-my-work__empty'), 'the empty sentence waits with the band').toBeNull();
    await act(async () => w.body[0]!.resolve(VIEW));
    await waitFor(() => expect(frame().body).toBe(true));
    expect(frame().bandSkeleton || frame().bodySkeleton).toBe(false);
    expect(document.querySelector('aside.gn-attention')).toBeNull();
    // A refusal is a settled read: it is shown (in place) once the other has answered, and holds nothing for ever.
    cleanup();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();
    const r = world();
    mount(r.services);
    await asked(r);
    await act(async () => r.attention[0]!.reject(new Error('The server could not read this.')));
    expect(frame().bandSkeleton && frame().bodySkeleton).toBe(true);
    expect(screen.queryByText(/The server could not read this\./)).toBeNull();
    await act(async () => r.body[0]!.resolve(VIEW));
    expect(await screen.findByText(/The server could not read this\./)).toBeInTheDocument();
    expect(frame().bandSkeleton || frame().bodySkeleton).toBe(false);
    // ONE workspace of two refusing is part of the strip's region too: its refusal waits with the band, not above a body skeleton.
    cleanup();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();
    const two = world({ workspaces: [ALPHA, BETA], refuseAttention: BETA.id });
    mount(two.services);
    await waitFor(() => expect(two.attention.length === 1 && two.body.length === 2).toBe(true));
    await act(async () => two.attention[0]!.resolve([ITEM]));
    expect(frame().bandSkeleton && frame().bodySkeleton).toBe(true);
    expect(screen.queryByText(/Beta could not be read\./), 'a workspace refusal drawn while the body is still a skeleton').toBeNull();
    await act(async () => {
      two.body[0]!.resolve(VIEW);
      two.body[1]!.resolve(VIEW);
    });
    expect(await screen.findByText(/Beta could not be read\./)).toBeInTheDocument();
    expect(frame().strip && frame().body).toBe(true);
    // The body's twin: one workspace's My work refusing waits with the body skeleton while the strip is still out.
    cleanup();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();
    const twin = world({ workspaces: [ALPHA, BETA], refuseBody: BETA.id });
    mount(twin.services);
    await waitFor(() => expect(twin.attention.length === 2 && twin.body.length === 1).toBe(true));
    await act(async () => twin.body[0]!.resolve(VIEW));
    expect(frame().bandSkeleton && frame().bodySkeleton).toBe(true);
    expect(screen.queryByText(/Beta work could not be read\./), 'a workspace refusal drawn while the strip is still a skeleton').toBeNull();
    await act(async () => {
      twin.attention[0]!.resolve([ITEM]);
      twin.attention[1]!.resolve([]);
    });
    expect(await screen.findByText(/Beta work could not be read\./)).toBeInTheDocument();
    expect(frame().strip && frame().body).toBe(true);
    // The strip leg's mirror: the WHOLE body read refusing first is a settled read too, and its refusal waits with the band rather
    // than standing in the body's place above a strip skeleton (the hold outranks both regions' refusals, not only the strip's).
    cleanup();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();
    const rb = world();
    mount(rb.services);
    await asked(rb);
    await act(async () => rb.body[0]!.reject(new Error('Your work could not be read.')));
    expect(frame().bandSkeleton && frame().bodySkeleton).toBe(true);
    expect(screen.queryByText(/Your work could not be read\./), 'a body refusal drawn while the strip is still a skeleton').toBeNull();
    await act(async () => rb.attention[0]!.resolve([ITEM]));
    expect(await screen.findByText(/Your work could not be read\./)).toBeInTheDocument();
    expect(frame().strip).toBe(true);
  });

  it('25.252 a region already present at the first ask is not held behind the slow one, and a Show change after the first load is not held; control: with both pending at the first ask the first answer is held', async () => {
    // One region answered at the first ask (a cached answer): it is in that commit, the other is its skeleton.
    override.attention = answered([ITEM]);
    override.myWork = waiting();
    const cached = world();
    mount(cached.services);
    await waitFor(() => expect(document.querySelector('aside.gn-attention:not([aria-busy])'), 'the answered strip must not wait for the slow body').not.toBeNull());
    expect(frame().bodySkeleton).toBe(true);
    // Its mirror: the BODY answered at the first ask and the strip still out. Each region's answer releases the page on its own.
    cleanup();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();
    override.attention = waiting();
    override.myWork = answered(VIEW);
    const cachedBody = world();
    mount(cachedBody.services);
    await waitFor(() => expect(frame().body, 'the answered body must not wait for the slow strip').toBe(true));
    expect(frame().bandSkeleton).toBe(true);
    // Control: both pending at the first ask, the strip answers alone: it is held (the other cases' rule).
    cleanup();
    clearMyWorkspacesCache();
    clearWorkspaceNameCache();
    override.attention = null;
    override.myWork = null;
    const w = world();
    mount(w.services);
    await asked(w);
    await act(async () => w.attention[0]!.resolve([ITEM]));
    expect(document.querySelector('aside.gn-attention:not([aria-busy])')).toBeNull();
    expect(frame().bandSkeleton).toBe(true);
    // The first load ends; then a Show change re-asks both reads, and the strip that answers first is shown at once (planner ruling:
    // the port holds the FIRST load only, a chip change keeps the page's own per-region swaps).
    await act(async () => w.body[0]!.resolve(VIEW));
    await waitFor(() => expect(frame().strip && frame().body).toBe(true));
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Assigned to me' }));
    await asked(w, 1);
    expect(frame().bandSkeleton && frame().bodySkeleton, 'a chip change re-asks both reads').toBe(true);
    await act(async () => w.attention[1]!.resolve([ITEM]));
    expect(frame().strip, 'a Show change must not hold the strip behind the body').toBe(true);
    expect(frame().bodySkeleton).toBe(true);
  });
});

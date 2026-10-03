import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttentionItem, LiveQueryResult, MyWorkView } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { AttentionBandSkeleton, MyWorkSkeleton } from '../src/skeletons/screen-skeletons.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Smoothness-2 G1, the MY WORK half (cases 25.250-25.253; DIAGNOSIS §3): the attention strip and the body are two reads and two
 * swaps, and a paint between the two commits moved the second region's neighbour by the difference between the strip's 4rem skeleton
 * and the real strip (my work CLS 0 or 0.6923 at 390 depending on which side of a 20 ms gap a paint fell, 0.289 at 768, 0.1898 at 1440).
 * jsdom has no paint, so the contract is read from what is IN the page after each read answers: never exactly one of the two regions
 * swapped.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const ANSELMA = '01J9USER000000000000000000';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000' }),
  usePathname: () => '/w/01J9WORKSPACE0000000000000/my-work',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } } }), signOut: async () => ({ data: {}, error: null }) },
}));

/** A hook can be taken over for one case (25.252: a region ALREADY answered at first render); otherwise the real hook runs. */
const override: { attention: LiveQueryResult<AttentionItem[]> | null; myWork: LiveQueryResult<MyWorkView> | null } = { attention: null, myWork: null };
vi.mock('@gisik-nokma/app-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/app-core')>();
  return {
    ...actual,
    useAttention: (...args: Parameters<typeof actual.useAttention>) => {
      const real = actual.useAttention(...args);
      return override.attention ?? real;
    },
    useMyWork: (...args: Parameters<typeof actual.useMyWork>) => {
      const real = actual.useMyWork(...args);
      return override.myWork ?? real;
    },
  };
});

import MyWorkPage from '../app/w/[workspaceId]/my-work/page.js';

const ITEM: AttentionItem = { kind: 'overdue', ticketId: 't1', projectId: 'p1', title: 'File the GST return', reason: 'Two days overdue', claim: null };
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
const answered = <T,>(data: T): LiveQueryResult<T> => ({ data, error: null, settled: true, hasAnswered: true, reload: () => {} });
const waiting = <T,>(): LiveQueryResult<T> => ({ data: null, error: null, settled: false, hasAnswered: false, reload: () => {} });

const world = (query: Parameters<typeof stubServices>[0]) => stubServices({ getMyWorkspaces: async () => [], getMembers: async () => [], getActorNames: async () => [], ...query });
const mount = (services: ReturnType<typeof world>) => render(<Providers services={services}><MyWorkPage /></Providers>);

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
  clearWorkspaceNameCache();
  override.attention = null;
  override.myWork = null;
});
afterEach(() => cleanup());

describe('the two regions swap in one commit (G1 §3)', () => {
  it('25.250 with the reads forced in EACH order, no frame has exactly one region swapped; control: the pre-fix shape (two independent swaps) does show such a frame', async () => {
    for (const order of ['my-work first', 'attention first'] as const) {
      cleanup();
      clearWorkspaceNameCache();
      const attention = deferred<AttentionItem[]>();
      const body = deferred<MyWorkView>();
      mount(world({ getAttention: () => attention.promise, getMyWork: () => body.promise }));
      await waitFor(() => expect(frame().bandSkeleton && frame().bodySkeleton).toBe(true));
      const [first, second] = order === 'my-work first' ? [() => body.resolve(VIEW), () => attention.resolve([ITEM])] : [() => attention.resolve([ITEM]), () => body.resolve(VIEW)];
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
    // Empty strip first: the band collapses (the strip renders nothing) in the SAME commit the body appears.
    const attention = deferred<AttentionItem[]>();
    const body = deferred<MyWorkView>();
    mount(world({ getAttention: () => attention.promise, getMyWork: () => body.promise }));
    await waitFor(() => expect(frame().bandSkeleton).toBe(true));
    await act(async () => attention.resolve([]));
    expect(frame().bandSkeleton, 'the band must not collapse while the body is still a skeleton').toBe(true);
    expect(frame().bodySkeleton).toBe(true);
    await act(async () => body.resolve(VIEW));
    await waitFor(() => expect(frame().body).toBe(true));
    expect(frame().bandSkeleton || frame().bodySkeleton).toBe(false);
    expect(document.querySelector('aside.gn-attention')).toBeNull();
    // A refusal is a settled read: it is shown (in place) once the other has answered, and holds nothing for ever.
    cleanup();
    clearWorkspaceNameCache();
    const refused = deferred<AttentionItem[]>();
    const slow = deferred<MyWorkView>();
    mount(world({ getAttention: () => refused.promise, getMyWork: () => slow.promise }));
    await waitFor(() => expect(frame().bandSkeleton).toBe(true));
    await act(async () => refused.reject(new Error('The server could not read this.')));
    expect(frame().bandSkeleton && frame().bodySkeleton).toBe(true);
    await act(async () => slow.resolve(VIEW));
    expect(await screen.findByText(/The server could not read this\./)).toBeInTheDocument();
    expect(frame().bandSkeleton || frame().bodySkeleton).toBe(false);
  });

  it('25.252 a region already present at the first render is not held behind the slow one; control: with both pending at first render the first answer is held', async () => {
    // One region answered at first render (a cached answer): it is in the first commit, the other is its skeleton.
    override.attention = answered([ITEM]);
    override.myWork = waiting();
    mount(world({ getAttention: async () => [ITEM], getMyWork: () => new Promise<MyWorkView>(() => {}) }));
    expect(document.querySelector('aside.gn-attention:not([aria-busy])'), 'the answered strip must not wait for the slow body').not.toBeNull();
    expect(frame().bodySkeleton).toBe(true);
    // Control: both pending at first render, the strip answers alone: it is held (the other cases' rule).
    cleanup();
    clearWorkspaceNameCache();
    override.attention = null;
    override.myWork = null;
    const attention = deferred<AttentionItem[]>();
    mount(world({ getAttention: () => attention.promise, getMyWork: () => new Promise<MyWorkView>(() => {}) }));
    await waitFor(() => expect(frame().bandSkeleton).toBe(true));
    await act(async () => attention.resolve([ITEM]));
    expect(document.querySelector('aside.gn-attention:not([aria-busy])')).toBeNull();
    expect(frame().bandSkeleton).toBe(true);
  });
});

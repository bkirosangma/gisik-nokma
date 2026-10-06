import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GraphEdgeView, GraphItemView, GraphRingResponse } from '@gisik-nokma/domain';
import type { AdjEntry, GraphStore } from '../../src/engine/model.js';
import { KnowledgeGraph } from '../../src/react/knowledge-graph.js';
import type { GraphRingQuery, GraphSource, KnowledgeGraphProps, ScopeChoices } from '../../src/react/types.js';
import { fakeRenderer } from './fake-renderer.js';
import { fixtureSource } from './fixture/fixture-source.js';

/*
 * Knowledge Graph spec D §6 (KG-D Task 8): the host's concept panel inside the view's inspector, cases 27.527 and
 * 27.534. The view runs on the fake renderer over the test copy of the browser harness's fixture (centred on GN-142),
 * where `concept:c1` (confirmed) tags GN-142, GN-151, GN-139 and a note, and `concept:c2` is a suggestion.
 */
const SCOPE: ScopeChoices = {
  workspaces: [
    { id: 'gn', name: 'Gisik Nokma', projects: [{ id: 'j_mw', name: 'Mobile web' }, { id: 'j_wf', name: 'Workflows' }, { id: 'j_ds', name: 'Design' }] },
    { id: 'st', name: 'Studio', projects: [{ id: 'j_web', name: 'Website' }, { id: 'j_br', name: 'Brand' }] },
  ],
};
const C1 = 'concept:c1';
const TAG_151 = `tag|${C1}|ticket:t151`;

function setup(over: Partial<KnowledgeGraphProps> = {}) {
  const fake = fakeRenderer();
  const fx = fixtureSource();
  const props: KnowledgeGraphProps = {
    centre: 'ticket:t142', config: 'desktop', source: fx.source, scope: SCOPE, defaultWorkspaceIds: ['gn', 'st'], onOpen: vi.fn(), createRenderer: fake.createRenderer, ...over,
  };
  render(<KnowledgeGraph {...props} />);
  return { fake, fx };
}
const refsOf = (call: { nodes: { ref: string }[] }) => call.nodes.map((n) => n.ref);
const edgesOf = (call: { edges: { id: string }[] }) => call.edges.map((e) => e.id);
async function drawn(fake: ReturnType<typeof fakeRenderer>, ref: string) {
  await waitFor(() => expect(fake.calls.length > 0 && refsOf(fake.last()).includes(ref)).toBe(true));
  await act(async () => new Promise((r) => setTimeout(r, 60)));
}
const pick = (fake: ReturnType<typeof fakeRenderer>, ref: string) => act(() => fake.pick({ kind: 'node', ref, double: false }));
const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
/** Takes an item and its edges out of the fixture's world, as a delete on the server would. */
function remove(all: GraphStore, ref: string) {
  (all.items as Map<string, GraphItemView>).delete(ref);
  for (const [id, e] of all.edges) if (e.from === ref || e.to === ref) (all.edges as Map<string, GraphEdgeView>).delete(id);
  const adj = all.adj as Map<string, AdjEntry[]>;
  adj.delete(ref);
  for (const [k, v] of adj) adj.set(k, v.filter((x) => x.to !== ref));
}
/** Takes a tag edge out of the fixture's world, as an untag on the server would. The fixture's maps are real `Map`s. */
function untag(all: GraphStore, id: string) {
  (all.edges as Map<string, GraphEdgeView>).delete(id);
  const adj = all.adj as Map<string, AdjEntry[]>;
  for (const [k, v] of adj) adj.set(k, v.filter((x) => x.edge.id !== id));
}

describe('27.527 the concept panel renders in the inspector for a selected concept', () => {
  it('27.527 selecting a concept renders renderConceptPanel\'s node with the SELECTED item; selecting a ticket does not', async () => {
    const renderConceptPanel = vi.fn((item: GraphItemView) => <div data-testid="concept-panel">{item.ref}</div>);
    const { fake } = setup({ renderConceptPanel });
    await drawn(fake, C1);
    pick(fake, C1);
    const node = await within(inspector()).findByTestId('concept-panel');
    expect(node).toHaveTextContent(C1);
    expect(renderConceptPanel.mock.lastCall?.[0].ref).toBe(C1);
    expect(renderConceptPanel.mock.lastCall?.[0].kind).toBe('concept');
    // the panel stands in for plan C's own concept body: no Confirmed pill, title or "Items" list beside it
    expect(within(inspector()).queryByText('Confirmed')).toBeNull();
    expect(within(inspector()).queryByRole('heading', { name: /^Items/ })).toBeNull();
    // the view's live region and its Center stay
    expect(within(inspector()).getByRole('button', { name: /^Center on / })).toBeInTheDocument();
    expect(inspector().querySelector('[aria-live="polite"]')).not.toBeNull();
    // a ticket is not a concept
    pick(fake, 'ticket:t151');
    await waitFor(() => expect(within(inspector()).getByRole('button', { name: 'Center on GN-151' })).toBeInTheDocument());
    expect(within(inspector()).queryByTestId('concept-panel')).toBeNull();
    expect(renderConceptPanel.mock.calls.every(([item]) => item.kind === 'concept')).toBe(true);
  });

  it('27.527 control: with no renderConceptPanel a concept shows plan C\'s default inspector, unchanged', async () => {
    const { fake } = setup();
    await drawn(fake, C1);
    pick(fake, C1);
    await waitFor(() => expect(within(inspector()).getByText('Confirmed')).toBeInTheDocument());
    expect(within(inspector()).getByRole('heading', { level: 3, name: 'Scroll position on phone sheets' })).toBeInTheDocument();
    expect(within(inspector()).getByRole('heading', { level: 4, name: /^Items/ })).toBeInTheDocument();
  });

  it('27.527 a new selection is a new panel: its state does not carry from one concept to the next', async () => {
    const mounts: string[] = [];
    const renderConceptPanel = (item: GraphItemView) => <Mounted item={item} onMount={(ref) => mounts.push(ref)} />;
    const { fake } = setup({ renderConceptPanel });
    await drawn(fake, 'concept:c2');
    pick(fake, C1);
    await within(inspector()).findByTestId('mounted');
    pick(fake, 'concept:c2');
    await waitFor(() => expect(mounts).toEqual([C1, 'concept:c2']));
  });
});

/** Records each MOUNT (an effect with no deps runs once per mount). */
function Mounted({ item, onMount }: { item: GraphItemView; onMount: (ref: string) => void }) {
  const ref = item.ref;
  useMountEffect(() => onMount(ref));
  return <p data-testid="mounted">{ref}</p>;
}
function useMountEffect(fn: () => void) {
  useEffect(() => {
    fn();
    // once per mount, on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

describe('27.534 ctx.refresh: the rings are read again and the graph redrawn in place', () => {
  it('27.534 after an untag, refresh re-reads every ring, the tag edge is gone, the camera keeps its view and no skeleton shows; control: before it, the edge is drawn', async () => {
    let refresh: () => void = () => undefined;
    const renderConceptPanel = (_item: GraphItemView, ctx: { refresh: () => void }) => {
      refresh = ctx.refresh;
      return <p data-testid="concept-panel">panel</p>;
    };
    const { fake, fx } = setup({ renderConceptPanel });
    await drawn(fake, C1);
    // control: the edge is drawn before the change
    expect(edgesOf(fake.last())).toContain(TAG_151);
    pick(fake, C1);
    await within(inspector()).findByTestId('concept-panel');
    const before = fx.log.length;
    const draws = fake.calls.length;
    untag(fx.all, TAG_151);
    const skeletons: boolean[] = [];
    const watch = new MutationObserver(() => skeletons.push(document.querySelector('.gn-kg__skeleton') !== null));
    watch.observe(document.body, { childList: true, subtree: true });
    act(() => refresh());
    await waitFor(() => expect(edgesOf(fake.last())).not.toContain(TAG_151));
    watch.disconnect();
    // every ring of the current centre was asked again, in order
    expect(fx.log.slice(before).map((q) => [q.center, q.hops])).toEqual([
      ['ticket:t142', 1],
      ['ticket:t142', 2],
      ['ticket:t142', 3],
    ]);
    expect(fake.calls.length).toBeGreaterThan(draws);
    expect(fake.last().view.keepView).toBe(true);
    expect(skeletons.some(Boolean)).toBe(false);
    expect(document.querySelector('.gn-kg__skeleton')).toBeNull();
    // the selection is kept: the concept is still in the graph
    expect(within(inspector()).getByTestId('concept-panel')).toBeInTheDocument();
  });

  it('27.534 a ring of the earlier fetch that answers AFTER a refresh never lands: the refreshed graph keeps what the refresh read; control: that ring held the item, and unheld it is drawn', async () => {
    let refresh: () => void = () => undefined;
    const renderConceptPanel = (_item: GraphItemView, ctx: { refresh: () => void }) => {
      refresh = ctx.refresh;
      return <p data-testid="concept-panel">panel</p>;
    };
    // The first ring 3 is answered from the world as it was when asked, but delivered only when the test says so.
    const fx = fixtureSource();
    let stale: GraphRingResponse | null = null;
    let deliver: () => void = () => undefined;
    let asked = 0;
    const source: GraphSource = {
      async ring(q) {
        asked += 1;
        const answer = await fx.source.ring(q);
        if (q.hops === 3 && stale === null) {
          stale = answer;
          await new Promise<void>((r) => (deliver = r));
        }
        return answer;
      },
    };
    const { fake } = setup({ renderConceptPanel, source });
    await drawn(fake, C1);
    await waitFor(() => expect(stale).not.toBeNull());
    const held = stale!.items[0]!.ref; // first seen at hop 3
    remove(fx.all, held);
    pick(fake, C1);
    await within(inspector()).findByTestId('concept-panel');
    const before = asked;
    act(() => refresh());
    await waitFor(() => expect(asked).toBe(before + 3));
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(refsOf(fake.last())).not.toContain(held);
    // the earlier fetch's ring 3 answers now, holding the item the refresh no longer has
    expect(stale!.items.map((i) => i.ref)).toContain(held);
    await act(async () => deliver());
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(refsOf(fake.last())).not.toContain(held);
    // control: answered in the ordinary way, that ring's item is drawn
    cleanup();
    const plain = setup();
    await drawn(plain.fake, held);
  });

  it('27.534 a refresh drops the OTHER cached centres, so Back re-reads them rather than drawing the old tags', async () => {
    let refresh: () => void = () => undefined;
    const renderConceptPanel = (_item: GraphItemView, ctx: { refresh: () => void }) => {
      refresh = ctx.refresh;
      return <p data-testid="concept-panel">panel</p>;
    };
    const { fake, fx } = setup({ renderConceptPanel });
    await drawn(fake, C1);
    act(() => fake.pick({ kind: 'node', ref: 'ticket:t151', double: true }));
    await waitFor(() => expect(fx.log.filter((q) => q.center === 'ticket:t151').length).toBe(3));
    await drawn(fake, C1);
    pick(fake, C1);
    await within(inspector()).findByTestId('concept-panel');
    untag(fx.all, TAG_151);
    act(() => refresh());
    await waitFor(() => expect(edgesOf(fake.last())).not.toContain(TAG_151));
    const asked = fx.log.length;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to GN-142' }));
    await waitFor(() => expect(fx.log.length).toBe(asked + 3));
    expect(fx.log.slice(asked).every((q) => q.center === 'ticket:t142')).toBe(true);
    await waitFor(() => expect(edgesOf(fake.last())).not.toContain(TAG_151));
  });
});

/**
 * The fixture's rings, answered from the world AS IT IS WHEN ASKED, with one ring the test may hold (delivered on
 * `release`) or fail. Each predicate applies to the next matching ask only.
 */
function steeredSource(fx: ReturnType<typeof fixtureSource>) {
  const holds: Array<{ q: GraphRingQuery; answer: GraphRingResponse; release: () => void }> = [];
  let hold: ((q: GraphRingQuery) => boolean) | null = null;
  let fail: ((q: GraphRingQuery) => boolean) | null = null;
  const source: GraphSource = {
    async ring(q) {
      const answer = await fx.source.ring(q);
      if (fail?.(q)) {
        fail = null;
        throw new Error('test: ring failed');
      }
      if (hold?.(q)) {
        hold = null;
        await new Promise<void>((release) => holds.push({ q, answer, release }));
      }
      return answer;
    },
  };
  return { source, holds, holdNext: (p: (q: GraphRingQuery) => boolean) => void (hold = p), failNext: (p: (q: GraphRingQuery) => boolean) => void (fail = p) };
}
function panelWithRefresh() {
  const box = { refresh: (): void => undefined };
  const renderConceptPanel = (_item: GraphItemView, ctx: { refresh: () => void }) => {
    box.refresh = ctx.refresh;
    return <p data-testid="concept-panel">panel</p>;
  };
  return { box, renderConceptPanel };
}
const pause = () => act(async () => new Promise((r) => setTimeout(r, 60)));

describe('27.534 the refresh\'s edges: where the world ends, a failed ring, two refreshes, a centre moved meanwhile', () => {
  it('27.534 a refresh stops where the world ends: after an empty ring it asks no further; control: the ordinary fetch stopped there too', async () => {
    const { box, renderConceptPanel } = panelWithRefresh();
    const fx = fixtureSource();
    const source: GraphSource = {
      async ring(q) {
        const answer = await fx.source.ring(q);
        return q.hops >= 2 ? { ...answer, items: [], edges: [], frontier: [], truncated: false, cursor: null } : answer;
      },
    };
    const { fake } = setup({ renderConceptPanel, source });
    await drawn(fake, C1);
    expect(fx.log.map((q) => q.hops)).toEqual([1, 2]); // control: ring 2 came back empty, and the walk ended there
    pick(fake, C1);
    await within(inspector()).findByTestId('concept-panel');
    act(() => box.refresh());
    await waitFor(() => expect(fx.log.length).toBeGreaterThan(2));
    await pause();
    expect(fx.log.slice(2).map((q) => q.hops)).toEqual([1, 2]);
  });

  it('27.534 a refresh whose ring fails swaps nothing and RESUMES the ordinary fetch it cut short: the ring that was out is asked again and its item drawn; control: that ring was held, its item not yet drawn', async () => {
    const { box, renderConceptPanel } = panelWithRefresh();
    const fx = fixtureSource();
    const st = steeredSource(fx);
    st.holdNext((q) => q.hops === 3);
    const { fake } = setup({ renderConceptPanel, source: st.source });
    await drawn(fake, C1);
    await waitFor(() => expect(st.holds).toHaveLength(1));
    const late = st.holds[0]!.answer.items.map((i) => i.ref).find((r) => !refsOf(fake.last()).includes(r));
    expect(late).toBeDefined(); // control: the held ring 3 brings an item not drawn yet
    pick(fake, C1);
    await within(inspector()).findByTestId('concept-panel');
    const asked = fx.log.length;
    st.failNext((q) => q.hops === 1);
    act(() => box.refresh());
    await waitFor(() => expect(fx.log.slice(asked).map((q) => q.hops)).toEqual([1, 3]));
    await waitFor(() => expect(refsOf(fake.last())).toContain(late));
  });

  it('27.534 two refreshes in a row: the FIRST, still out when the second has landed, asks nothing more and swaps nothing in; control: the second took the tag edge away', async () => {
    const { box, renderConceptPanel } = panelWithRefresh();
    const fx = fixtureSource();
    const st = steeredSource(fx);
    const { fake } = setup({ renderConceptPanel, source: st.source });
    await drawn(fake, C1);
    pick(fake, C1);
    await within(inspector()).findByTestId('concept-panel');
    expect(edgesOf(fake.last())).toContain(TAG_151);
    st.holdNext((q) => q.hops === 1);
    act(() => box.refresh()); // the first: its ring 1 read from the world WITH the edge, then held
    await waitFor(() => expect(st.holds).toHaveLength(1));
    untag(fx.all, TAG_151);
    act(() => box.refresh()); // the second
    await waitFor(() => expect(edgesOf(fake.last())).not.toContain(TAG_151));
    const asked = fx.log.length;
    await act(async () => st.holds[0]!.release());
    await pause();
    expect(fx.log.length).toBe(asked);
    expect(edgesOf(fake.last())).not.toContain(TAG_151);
  });

  it('27.534 a refresh that lands after the view moved to another centre leaves that centre\'s graph on screen; control: it was drawn, and the refresh did read its three rings', async () => {
    const { box, renderConceptPanel } = panelWithRefresh();
    const fx = fixtureSource();
    const st = steeredSource(fx);
    const { fake } = setup({ renderConceptPanel, source: st.source });
    await drawn(fake, C1);
    pick(fake, C1);
    await within(inspector()).findByTestId('concept-panel');
    st.holdNext((q) => q.hops === 1 && q.center === 'ticket:t142');
    act(() => box.refresh());
    await waitFor(() => expect(st.holds).toHaveLength(1));
    act(() => fake.pick({ kind: 'node', ref: 'ticket:t151', double: true }));
    await waitFor(() => expect(fx.log.filter((q) => q.center === 'ticket:t151').length).toBe(3));
    await pause();
    const shown = refsOf(fake.last());
    expect(shown).toContain('ticket:t151');
    expect(shown.length).toBeGreaterThan(3);
    await act(async () => st.holds[0]!.release());
    await waitFor(() => expect(fx.log.filter((q) => q.center === 'ticket:t142').length).toBe(6));
    await pause();
    expect(refsOf(fake.last())).toEqual(shown);
    expect(document.querySelector('.gn-kg__skeleton')).toBeNull();
  });
});

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAPH_CHIP_ORDER, type GraphEdgeView, type GraphItemView, type GraphRingResponse } from '@gisik-nokma/domain';
import { walk } from '../../src/engine/walk.js';
import { KnowledgeGraph } from '../../src/react/knowledge-graph.js';
import type { GraphRingQuery, GraphSource, KnowledgeGraphProps, ScopeChoices } from '../../src/react/types.js';
import { item } from '../engine/fixture.js';
import { fakeRenderer } from './fake-renderer.js';
import { fixtureSource, type FixtureOptions } from './fixture/fixture-source.js';

/*
 * The view over a fake renderer (cases 27.313–27.326, 27.365–27.367, 27.661–27.664). The source is a test-only copy of the browser harness's
 * fixture (the owner-approved mockup's world, centred on GN-142). Every count below is a LITERAL, read off the fixture by
 * an independent brute-force BFS over its raw edge table (roles/mut-out/kg-c-t7-view/oracle.py), never by `zones`.
 */
const SCOPE: ScopeChoices = {
  workspaces: [
    { id: 'gn', name: 'Gisik Nokma', projects: [{ id: 'j_mw', name: 'Mobile web' }, { id: 'j_wf', name: 'Workflows' }, { id: 'j_ds', name: 'Design' }] },
    { id: 'st', name: 'Studio', projects: [{ id: 'j_web', name: 'Website' }, { id: 'j_br', name: 'Brand' }] },
  ],
};
const T = (id: string) => `ticket:${id}`;
const CHIP_GROUPS = GRAPH_CHIP_ORDER.filter((g) => g !== 'projects');

function setup(over: Partial<KnowledgeGraphProps> = {}, opts: FixtureOptions & { source?: GraphSource } = {}) {
  const fake = fakeRenderer();
  const fx = fixtureSource(opts);
  const props: KnowledgeGraphProps = {
    centre: T('t142'), config: 'desktop', source: opts.source ?? fx.source, scope: SCOPE, defaultWorkspaceIds: ['gn', 'st'], onOpen: vi.fn(),
    createRenderer: fake.createRenderer, ...over,
  };
  const view = render(<KnowledgeGraph {...props} />);
  const rerender = (next: Partial<KnowledgeGraphProps>) => view.rerender(<KnowledgeGraph {...props} {...next} />);
  return { fake, fx, props, rerender };
}
const refsOf = (call: { nodes: { ref: string }[] }) => call.nodes.map((n) => n.ref).sort();
const hopsOf = (log: readonly GraphRingQuery[]) => log.map((q) => q.hops);
const settle = () => new Promise((r) => setTimeout(r, 60));
/** Waits until the last draw holds `ref`, then lets any further request show itself. */
async function drawn(fake: ReturnType<typeof fakeRenderer>, ref: string) {
  await waitFor(() => expect(fake.calls.length > 0 && refsOf(fake.last()).includes(ref)).toBe(true));
  await settle();
}
const doubleClick = (fake: ReturnType<typeof fakeRenderer>, ref: string) => act(() => fake.pick({ kind: 'node', ref, double: true }));
const count = () => document.querySelector('.gn-kg__count')!.textContent;

afterEach(() => vi.restoreAllMocks());

describe('KnowledgeGraph: rings, cache and race (spec C §2.2, §2.3)', () => {
  it('27.313 hops 2 requests rings 1, 2 and 3 in order with every chip group but projects; control: hops 1 requests 1 and 2 only', async () => {
    const a = setup();
    await drawn(a.fake, T('t126')); // a hop-3 item: the fog ring has landed
    expect(hopsOf(a.fx.log)).toEqual([1, 2, 3]);
    for (const q of a.fx.log) expect(q).toMatchObject({ center: T('t142'), groups: CHIP_GROUPS, workspaceIds: ['gn', 'st'], projectIds: [] });
    cleanup();
    const b = setup({ hops: 1 });
    await drawn(b.fake, T('t125')); // hop 2 of GN-142: the fog ring of hops 1
    expect(hopsOf(b.fx.log)).toEqual([1, 2]);
  });

  it('27.314 a double-clicked item\'s rings are fetched; Back makes no request and redraws the first centre; control: a third, new centre fetches', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    const first = refsOf(fake.last());
    doubleClick(fake, T('t133'));
    await waitFor(() => expect(fx.log.filter((q) => q.center === T('t133')).map((q) => q.hops)).toEqual([1, 2, 3]));
    await drawn(fake, T('t128')); // GN-133's hop 2 (relates t131 → t128)
    const before = fx.log.length;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to GN-142' }));
    await settle();
    expect(fx.log.length).toBe(before);
    expect(refsOf(fake.last())).toEqual(first);
    // control: a centre never visited is fetched
    doubleClick(fake, T('t131'));
    await waitFor(() => expect(fx.log.filter((q) => q.center === T('t131')).map((q) => q.hops)).toEqual([1, 2, 3]));
  });

  it('27.315 Everything fetches until a ring comes back empty (the fixture is 4 deep: 5 requests); an endless chain stops at exactly 8', async () => {
    const { fake, fx } = setup({ hops: 'all' });
    await drawn(fake, T('t126'));
    await waitFor(() => expect(hopsOf(fx.log)).toEqual([1, 2, 3, 4, 5]));
    await settle();
    expect(hopsOf(fx.log)).toEqual([1, 2, 3, 4, 5]);
    // an endless chain: every ring holds one item never seen before
    const log: GraphRingQuery[] = [];
    const chain = (n: number) => item(`e${n}`, { ws: 'gn', project: null });
    const endless: GraphSource = {
      async ring(q) {
        log.push(q);
        const prev = q.hops === 1 ? item('e0', { ws: 'gn', project: null }) : chain(q.hops - 1);
        const e: GraphEdgeView = { id: `relates|${prev.ref}|${chain(q.hops).ref}`, kind: 'relates', from: prev.ref, to: chain(q.hops).ref, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false };
        return { hop: q.hops, center: { ...item('e0', { ws: 'gn', project: null }), hop: 0 }, items: [{ ...chain(q.hops), hop: q.hops }], edges: [e], frontier: [chain(q.hops).ref], truncated: false, cursor: null };
      },
    };
    const b = setup({ centre: T('e0'), hops: 'all' }, { source: endless });
    await drawn(b.fake, T('e8'));
    expect(log).toHaveLength(8);
    expect(log[7]!.hops).toBe(8);
  });

  it('27.316 toggling the Blocks chip makes no request and drops every blocks edge; control: toggling it back restores the same edges, again with no request', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    const blocks = 'blocks|ticket:t133|ticket:t142';
    expect(fake.last().edges.map((e) => e.id)).toContain(blocks);
    // each chip shows its clear-edge count (the oracle's, both workspaces, two hops)
    expect([...document.querySelectorAll('.gn-kg__chip')].map((b) => b.textContent)).toEqual(
      ['Parent and subtasks6', 'Blocks1', 'Relates to2', 'Duplicates1', 'Attached notes1', 'Links in text5', 'People7', 'Concepts7'],
    );
    const edgesBefore = fake.last().edges.map((e) => e.id).sort();
    const requests = fx.log.length;
    const user = userEvent.setup();
    const chip = screen.getByRole('button', { name: /^Blocks/ });
    await user.click(chip);
    await settle();
    expect(fake.last().edges.filter((e) => e.grp === 'blocks')).toEqual([]);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(fx.log.length).toBe(requests);
    await user.click(chip);
    await settle();
    expect(fake.last().edges.map((e) => e.id).sort()).toEqual(edgesBefore);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(fx.log.length).toBe(requests);
  });

  it('27.317 choosing a project re-requests with its id, and a centre outside it gets the scope note; control: clearing the projects empties the note', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    const note = 'GN-142 is outside the projects you picked. It stays in the middle, and its links follow your scope.';
    expect(screen.queryByText(note)).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Projects/ }));
    await user.click(await screen.findByRole('option', { name: 'Workflows' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(fx.log.at(-1)!.projectIds).toEqual(['j_wf']));
    expect(await screen.findByText(note)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Workflows' }));
    await waitFor(() => expect(screen.queryByText(note)).toBeNull());
    // a project goes with its workspace: Workflows chosen again, then Gisik Nokma dropped, asks for Studio with no projects
    await user.click(screen.getByRole('button', { name: /Projects/ }));
    await user.click(await screen.findByRole('option', { name: 'Workflows' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(fx.log.at(-1)!.projectIds).toEqual(['j_wf']));
    await user.click(screen.getByRole('button', { name: 'Remove Gisik Nokma' }));
    await waitFor(() => expect(fx.log.at(-1)!).toMatchObject({ workspaceIds: ['st'], projectIds: [] }));
    expect(screen.queryByRole('button', { name: 'Remove Workflows' })).toBeNull();
  });

  it('27.367 jsdom: the scope note has ONE slot: empty with no project, the SAME element holds the note for Workflows and is emptied again; control: a phone has the empty slot after the count', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    const note = 'GN-142 is outside the projects you picked. It stays in the middle, and its links follow your scope.';
    const slot = document.querySelector('.gn-kg__scope-note');
    expect(slot).not.toBeNull(); // in the bar before any note: the band is reserved, not added with the note
    expect(slot!.textContent).toBe('');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Projects/ }));
    await user.click(await screen.findByRole('option', { name: 'Workflows' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(fx.log.at(-1)!.projectIds).toEqual(['j_wf']));
    await waitFor(() => expect(slot!.textContent).toBe(note));
    expect(document.querySelectorAll('.gn-kg__scope-note')).toHaveLength(1);
    expect(document.querySelector('.gn-kg__scope-note')).toBe(slot);
    await user.click(screen.getByRole('button', { name: 'Remove Workflows' }));
    await waitFor(() => expect(slot!.textContent).toBe(''));
    expect(slot!.isConnected).toBe(true);
    expect(document.querySelector('.gn-kg__scope-note')).toBe(slot);
    cleanup();
    // control: the phone keeps the same empty slot, right after the count (its CSS height is the browser half, 27.367)
    const p = setup({ config: 'phone' });
    await drawn(p.fake, T('t125'));
    const phoneSlot = document.querySelector('.gn-kg__scope-note');
    expect(phoneSlot).not.toBeNull();
    expect(phoneSlot!.textContent).toBe('');
    expect(phoneSlot!.previousElementSibling).toBe(document.querySelector('.gn-kg__count'));
  });

  it('27.318 Review Focus 2: two centre changes in quick succession draw only the second; a late answer for the first is never drawn', async () => {
    const { fake, fx, rerender } = setup({ centre: T('t118') }, { delayFor: (q) => (q.center === T('t118') ? 300 : 0) });
    // the t118-only items, from the two fixture walks (rings 1–3 each): asserted non-empty, or "none of them" holds of anything
    const reach = (c: string) => new Set(walk(fx.all, c, new Set(CHIP_GROUPS), 3, () => true).order);
    const of133 = reach(T('t133'));
    const only118 = [...reach(T('t118'))].filter((r) => !of133.has(r));
    expect(only118.length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 20));
    rerender({ centre: T('t133') });
    await new Promise((r) => setTimeout(r, 600));
    expect(fx.log.some((q) => q.center === T('t118'))).toBe(true); // the late request was made
    const at = fake.calls.findIndex((c) => c.nodes.some((n) => n.ref === T('t133') && n.center));
    expect(at).toBeGreaterThanOrEqual(0);
    for (const c of fake.calls.slice(at)) expect(c.nodes.filter((n) => only118.includes(n.ref))).toEqual([]);
    expect(refsOf(fake.last())).toEqual(expect.arrayContaining([T('t131'), T('t142'), T('t133')]));
    // two more renders from the CURRENT cache entry (the chip toggles, no request): still t133's and nothing of t118's
    const user = userEvent.setup();
    const chip = screen.getByRole('button', { name: /^Blocks/ });
    await user.click(chip);
    await user.click(chip);
    await settle();
    expect(refsOf(fake.last())).toEqual(expect.arrayContaining([T('t131'), T('t142'), T('t133')]));
    expect(fake.last().nodes.filter((n) => only118.includes(n.ref))).toEqual([]);
  });

  it('27.318 control: with no delay, t118 then t133 draws t118\'s rings first', async () => {
    const { fake, rerender } = setup({ centre: T('t118') });
    await drawn(fake, only118Ref);
    rerender({ centre: T('t133') });
    await drawn(fake, T('t131'));
    const firstT133 = fake.calls.findIndex((c) => c.nodes.some((n) => n.ref === T('t133') && n.center));
    const lastT118 = fake.calls.findIndex((c) => c.nodes.some((n) => n.ref === only118Ref));
    expect(lastT118).toBeGreaterThanOrEqual(0);
    expect(lastT118).toBeLessThan(firstT133);
  });

  it('27.319 a failed hop keeps ring 1 drawn and says so; Retry re-requests the hop; control: after a good retry the alert is gone', async () => {
    const { fake, fx } = setup({}, { failHop: 2 });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the next hop. Retry");
    await waitFor(() => expect(fake.calls.length).toBeGreaterThan(0)); // ring 1 is drawn (the renderer loads async: the alert can come first)
    expect(refsOf(fake.last())).toEqual(expect.arrayContaining([T('t118'), T('t133'), T('t160')]));
    expect(count()).toBe('11 items within 2 hops'); // ring 1 still counted: the cache entry kept it
    expect(hopsOf(fx.log)).toEqual([1, 2]);
    fx.ctl.failHop = 0;
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Retry' }));
    await drawn(fake, T('t126'));
    expect(hopsOf(fx.log)).toEqual([1, 2, 2, 3]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('27.319 control: a failure belongs to its centre: centring elsewhere shows no alert, Back to the failed centre shows it again', async () => {
    const { fake, fx } = setup({}, { failHop: 2 });
    await screen.findByRole('alert');
    fx.ctl.failHop = 0;
    doubleClick(fake, T('t133'));
    await drawn(fake, T('t128'));
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to GN-142' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the next hop. Retry");
  });
});

describe('KnowledgeGraph: states, keys and the trail (spec C §3, §6)', () => {
  it('27.320 before ring 1 answers the skeleton and the canvas are both there; control: after it the skeleton is gone', async () => {
    const { fake } = setup({}, { delayFor: (q) => (q.hops === 1 ? 150 : 0) });
    expect(screen.getByText('Loading the Knowledge Graph')).toBeInTheDocument();
    expect(document.querySelector('.gn-kg__canvas')).not.toBeNull();
    await drawn(fake, T('t126'));
    expect(screen.queryByText('Loading the Knowledge Graph')).toBeNull();
    expect(document.querySelector('.gn-kg__canvas')).not.toBeNull();
    cleanup();
    // a later hop still out: ring 1 is drawn, so no skeleton
    const late = setup({}, { delayFor: (q) => (q.hops === 2 ? 300 : 0) });
    await drawn(late.fake, T('t118'));
    expect(hopsOf(late.fx.log)).toEqual([1, 2]);
    expect(refsOf(late.fake.last())).not.toContain(T('t125')); // GN-125 is hop 2: ring 2 has not answered
    expect(screen.queryByText('Loading the Knowledge Graph')).toBeNull();
    // a config change (a phone/desktop switch) remounts the renderer, and the NEW one is fed the graph it missed: every ring in
    // first, so the only draw left to come is the re-feed (the phone's one hop is already in the cache: no request)
    await drawn(late.fake, T('t126'));
    const n = late.fake.calls.length;
    const requests = late.fx.log.length;
    expect(n).toBeGreaterThanOrEqual(1);
    late.rerender({ config: 'phone' });
    await waitFor(() => expect(late.fake.calls.length).toBe(n + 1));
    expect(late.fake.last().nodes.length).toBeGreaterThan(0);
    expect(late.fx.log.length).toBe(requests);
  });

  it('27.321 an item with no links says so, and Add link hands the host the centre item; control: a note centre has the sentence and no button', async () => {
    const lonely = (center: GraphItemView): GraphSource => ({
      ring: async (q): Promise<GraphRingResponse> => ({ hop: q.hops, center: { ...center, hop: 0 }, items: [], edges: [], frontier: [], truncated: false, cursor: null }),
    });
    const onAddLink = vi.fn();
    setup({ centre: T('t9'), onAddLink }, { source: lonely(item('t9', { label: 'GN-9', ws: 'gn', project: 'j_mw' })) });
    expect(await screen.findByText('Nothing is linked to GN-9 yet.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add link' }));
    expect(onAddLink).toHaveBeenCalledWith(expect.objectContaining({ ref: T('t9') }));
    cleanup();
    setup({ centre: 'note:n9', onAddLink }, { source: lonely(item('n9', { kind: 'note', label: 'Release notes', ws: 'gn', project: 'j_mw' })) });
    expect(await screen.findByText('Nothing is linked to Release notes yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull();
    cleanup();
    // a centre whose one neighbour is outside the scope (in the fog) has a link: no sentence
    const far = item('x1', { label: 'GN-77', ws: 'zz', project: null });
    const fogOnly: GraphSource = {
      ring: async (q): Promise<GraphRingResponse> => q.hops === 1
        ? { hop: 1, center: { ...item('t9', { label: 'GN-9', ws: 'gn', project: 'j_mw' }), hop: 0 }, items: [{ ...far, hop: 1, out: true }], edges: [{ id: `relates|${T('t9')}|${far.ref}`, kind: 'relates', from: T('t9'), to: far.ref, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false }], frontier: [], truncated: false, cursor: null }
        : { hop: q.hops, center: { ...item('t9', { label: 'GN-9', ws: 'gn', project: 'j_mw' }), hop: 0 }, items: [], edges: [], frontier: [], truncated: false, cursor: null },
    };
    setup({ centre: T('t9'), onAddLink }, { source: fogOnly });
    await waitFor(() => expect(count()).toBe('0 items within 2 hops, 1 more in the fog (1 outside the scope)'));
    expect(screen.queryByText('Nothing is linked to GN-9 yet.')).toBeNull();
  });

  it('27.322 keys: 3 sets three hops, c centres the selected item, Esc asks the host first; the zoom buttons drive the renderer; the canvas is a named image; control: 3 typed on the Workspaces picker changes nothing', async () => {
    const onEscape = vi.fn(() => true);
    const { fake, fx } = setup({ onEscape });
    await drawn(fake, T('t126'));
    const canvas = screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-142' });
    const user = userEvent.setup();
    // control first: the picker owns its keys
    await user.click(screen.getByRole('button', { name: /Workspaces/ }));
    await user.keyboard('{Escape}');
    screen.getByRole('button', { name: /Workspaces/ }).focus();
    await user.keyboard('3');
    await settle();
    expect(hopsOf(fx.log)).toEqual([1, 2, 3]);
    canvas.focus();
    await user.keyboard('3');
    await waitFor(() => expect(hopsOf(fx.log)).toEqual([1, 2, 3, 4]));
    // a single click selects (a hop-1 item); c centres it
    act(() => fake.pick({ kind: 'node', ref: T('t133'), double: false }));
    canvas.focus();
    await user.keyboard('c');
    await waitFor(() => expect(fx.log.some((q) => q.center === T('t133'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Back to GN-142' })).toBeInTheDocument();
    // Esc: the host consumes it (true), so Back does not run
    canvas.focus();
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Back to GN-142' })).toBeInTheDocument();
    // the host declines it (false): Back runs
    onEscape.mockReturnValue(false);
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Back to GN-142' })).toBeNull());
    expect(screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-142' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Fit to view' }));
    expect(fake.zooms).toEqual([1.5, 1 / 1.5]);
    expect(fake.cameras).toEqual(['fit']);
  });

  it('27.322 more keys: 4 asks for ring 5 and 5 is ignored; C (shifted) centres too; control: a phone ignores c', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    const canvas = screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-142' });
    const user = userEvent.setup();
    canvas.focus();
    await user.keyboard('4');
    await waitFor(() => expect(hopsOf(fx.log)).toEqual([1, 2, 3, 4, 5]));
    await user.keyboard('5');
    await settle();
    expect(hopsOf(fx.log)).toEqual([1, 2, 3, 4, 5]);
    act(() => fake.pick({ kind: 'node', ref: T('t133'), double: false }));
    canvas.focus();
    await user.keyboard('C');
    await waitFor(() => expect(fx.log.some((q) => q.center === T('t133'))).toBe(true));
    cleanup();
    const p = setup({ config: 'phone' });
    await drawn(p.fake, T('t125'));
    act(() => p.fake.pick({ kind: 'node', ref: T('t133'), double: false }));
    screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-142' }).focus();
    await user.keyboard('c');
    await settle();
    expect(p.fx.log.some((q) => q.center === T('t133'))).toBe(false);
  });

  it('27.323 the trail: t142 → t133 → t131 shows Back and three crumbs, a crumb past the loaded rings keeps its label, and the first crumb goes back two steps; control: a new centre prop resets the trail', async () => {
    const { fake, fx, rerender } = setup();
    await drawn(fake, T('t126'));
    doubleClick(fake, T('t133'));
    await drawn(fake, T('t128'));
    doubleClick(fake, T('t131'));
    await drawn(fake, T('t131'));
    const trail = () => [...document.querySelectorAll('.gn-kg__trail button')].map((b) => b.textContent);
    expect(trail()).toEqual(['‹ Back', 'GN-142', 'GN-133', 'GN-131']);
    expect(screen.getByRole('button', { name: 'Back to GN-133' })).toBeInTheDocument();
    // a crumb whose item is past the rings now loaded keeps its label: at hops 1 GN-128 loads rings 1 and 2 only, and GN-142 is
    // 3 hops from it (t128 → t131 → t133 → t142), so only the labels seen earlier can name the first crumb
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: '1' }));
    doubleClick(fake, T('t128'));
    await waitFor(() => expect(fake.last().nodes.some((nd) => nd.ref === T('t128') && nd.center) && refsOf(fake.last()).includes(T('t130'))).toBe(true));
    await settle();
    expect(fx.log.filter((q) => q.center === T('t128')).map((q) => q.hops)).toEqual([1, 2]); // the haystack: no ring 3 was loaded
    expect(refsOf(fake.last())).not.toContain(T('t142'));
    expect(trail()).toEqual(['‹ Back', 'GN-142', 'GN-133', 'GN-131', 'GN-128']);
    expect(screen.getByRole('button', { name: 'Back to GN-131' })).toBeInTheDocument();
    screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-128' }).focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trail()).toEqual(['‹ Back', 'GN-142', 'GN-133', 'GN-131']));
    await user.click(screen.getByRole('tab', { name: '2' }));
    // Esc (no host handler) goes back ONE step
    screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-131' }).focus();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(trail()).toEqual(['‹ Back', 'GN-142', 'GN-133']));
    expect(screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-133' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'GN-142' }));
    expect(trail()).toEqual([]);
    expect(screen.getByRole('img', { name: 'Knowledge Graph of items linked to GN-142' })).toBeInTheDocument();
    // a double-click reaches the CURRENT centre, not the first render's: back to GN-142 after GN-133 is a new step
    doubleClick(fake, T('t133'));
    await drawn(fake, T('t128'));
    doubleClick(fake, T('t142'));
    await waitFor(() => expect(trail()).toEqual(['‹ Back', 'GN-142', 'GN-133', 'GN-142']));
    // control: a new surface centre resets it
    rerender({ centre: T('t118') });
    await waitFor(() => expect(trail()).toEqual([]));
  });

  it('27.324 Review Focus 5: a localStorage that throws on every access: the view opens On, Off hides Concepts, On shows it, nothing is logged; control: a working store is written', async () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    const errors = vi.spyOn(console, 'error');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    try {
      const { fake } = setup();
      await drawn(fake, T('t126'));
      const user = userEvent.setup();
      expect(screen.getByRole('tab', { name: 'On' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: /^Concepts/ })).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Off' }));
      expect(screen.queryByRole('button', { name: /^Concepts/ })).toBeNull();
      await user.click(screen.getByRole('tab', { name: 'On' }));
      expect(screen.getByRole('button', { name: /^Concepts/ })).toBeInTheDocument();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'localStorage', real);
    }
    cleanup();
    window.localStorage.clear();
    const { fake } = setup();
    await drawn(fake, T('t126'));
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Off' }));
    expect(window.localStorage.getItem('gn-kg-semantic')).toBe('off');
    window.localStorage.clear();
  });

  it('27.325 jsdom: Off re-requests without Concepts, and a source that ignores the groups still draws no concept; control: On asks for them', async () => {
    window.localStorage.clear();
    try {
      const fx2 = fixtureSource();
      const ignoring: GraphSource = { ring: (q) => fx2.source.ring({ ...q, groups: CHIP_GROUPS }) };
      const { fake } = setup({}, { source: ignoring });
      await drawn(fake, T('t126'));
      expect(fx2.log.every((q) => q.groups.includes('concepts'))).toBe(true);
      expect(fake.last().nodes.some((n) => n.ref.startsWith('concept:'))).toBe(true); // or "none below" holds of nothing
      const before = fake.calls.length;
      await userEvent.setup().click(screen.getByRole('tab', { name: 'Off' }));
      await waitFor(() => expect(fake.calls.length > before && refsOf(fake.last()).includes(T('t126'))).toBe(true));
      await settle();
      expect(fake.last().nodes.filter((n) => n.ref.startsWith('concept:'))).toEqual([]);
      expect(fake.last().edges.filter((e) => e.grp === 'concepts')).toEqual([]);
      cleanup();
      // the view's own request leaves Concepts out once Off (the stored 'off' opens it Off)
      const { fx } = setup();
      await waitFor(() => expect(fx.log.length).toBeGreaterThan(0));
      await settle();
      expect(fx.log.at(-1)!.groups).toEqual(CHIP_GROUPS.filter((g) => g !== 'concepts'));
      await userEvent.setup().click(screen.getByRole('tab', { name: 'On' }));
      await waitFor(() => expect(fx.log.at(-1)!.groups).toEqual(CHIP_GROUPS));
    } finally {
      window.localStorage.clear();
    }
  });

  it('27.325 jsdom: Off and a concept centre or selection (§6.4): a concept centre goes back to the host\'s centre and the trail empties; a ticket centre stays; a selected concept falls back to the centre', async () => {
    const withoutConcepts = CHIP_GROUPS.filter((g) => g !== 'concepts');
    window.localStorage.clear();
    try {
      const a = setup();
      await drawn(a.fake, T('t126'));
      doubleClick(a.fake, 'concept:c1');
      // control: the concept IS the centre, with a trail back
      await waitFor(() => expect(a.fx.log.at(-1)!.center).toBe('concept:c1'));
      expect(screen.getByRole('button', { name: 'Back to GN-142' })).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('tab', { name: 'Off' }));
      await waitFor(() => expect(a.fx.log.at(-1)).toMatchObject({ center: T('t142'), groups: withoutConcepts }));
      expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
      expect(document.querySelector('.gn-kg__trail')).toBeNull();
      await waitFor(() => expect(a.fake.last().states.selected).toBe(T('t142')));
      cleanup();
      window.localStorage.clear();
      // a ticket centre is not the layer's: it stays, and so does its trail
      const b = setup();
      await drawn(b.fake, T('t126'));
      doubleClick(b.fake, T('t133'));
      await waitFor(() => expect(b.fx.log.at(-1)!.center).toBe(T('t133')));
      await userEvent.setup().click(screen.getByRole('tab', { name: 'Off' }));
      await waitFor(() => expect(b.fx.log.at(-1)!.groups).toEqual(withoutConcepts));
      expect(b.fx.log.at(-1)!.center).toBe(T('t133'));
      expect(screen.getByRole('button', { name: 'Back to GN-142' })).toBeInTheDocument();
      cleanup();
      window.localStorage.clear();
      // a selected concept goes with the layer: the selection falls back to the centre
      const c = setup();
      await drawn(c.fake, T('t126'));
      act(() => c.fake.pick({ kind: 'node', ref: 'concept:c1', double: false }));
      await waitFor(() => expect(c.fake.last().states.selected).toBe('concept:c1'));
      await userEvent.setup().click(screen.getByRole('tab', { name: 'Off' }));
      await waitFor(() => expect(c.fake.last().states.selected).toBe(T('t142')));
    } finally {
      window.localStorage.clear();
    }
  });

  it('27.327 jsdom: a new highlight reaches the renderer with no new request; control: the first draw carries none', async () => {
    const { fake, fx, rerender } = setup();
    await drawn(fake, T('t126'));
    expect(fake.last().states.highlight).toBeNull();
    const requests = fx.log.length;
    rerender({ highlight: new Set([T('t160')]) });
    await waitFor(() => expect([...(fake.last().states.highlight ?? [])]).toEqual([T('t160')]));
    expect(fx.log.length).toBe(requests);
  });

  it('27.365 the bar, literal: names, the keys hint, Hops by click, a last workspace is kept; control: a phone folds it with a summary (the chips shown that are on) and has no hint', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    const user = userEvent.setup();
    expect(screen.getByRole('group', { name: 'Show links' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Semantic layer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Projects/ })).toHaveTextContent('All projects');
    expect(document.querySelector('.gn-kg__keys')!.textContent).toBe('Keys: 1–4 hops, C center on the selected item, Esc back. Scroll or pinch to zoom, drag to pan, double-click an item to center on it.');
    // Hops by click: Everything fetches to the end, 1 is served from the cache
    await user.click(screen.getByRole('tab', { name: 'Everything' }));
    await waitFor(() => expect(count()).toBe('31 items, everything connected'));
    expect(hopsOf(fx.log)).toEqual([1, 2, 3, 4, 5]);
    await user.click(screen.getByRole('tab', { name: '1' }));
    await waitFor(() => expect(count()).toBe('11 items within 1 hop, 11 more in the fog'));
    expect(hopsOf(fx.log)).toEqual([1, 2, 3, 4, 5]);
    // the last workspace stays chosen
    await user.click(screen.getByRole('button', { name: 'Remove Studio' }));
    await waitFor(() => expect(fx.log.at(-1)!.workspaceIds).toEqual(['gn']));
    const requests = fx.log.length;
    await user.click(screen.getByRole('button', { name: 'Remove Gisik Nokma' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Remove Gisik Nokma' })).toBeInTheDocument();
    expect(fx.log.length).toBe(requests);
    cleanup();
    const p = setup({ config: 'phone' });
    await drawn(p.fake, T('t125'));
    const summary = () => document.querySelector('.gn-kg__fold > summary')!.textContent;
    expect(summary()).toBe('Scope and linksGisik Nokma, Studio, all projects; 8 of 8 link types');
    expect(document.querySelector('.gn-kg__keys')).toBeNull();
    await user.click(screen.getByText('Scope and links'));
    await user.click(screen.getByRole('button', { name: /^Blocks/ }));
    expect(summary()).toBe('Scope and linksGisik Nokma, Studio, all projects; 7 of 8 link types');
    // the layer Off hides the Concepts chip, which stays on: the summary counts the chips SHOWN that are on
    try {
      await user.click(screen.getByRole('tab', { name: 'Off' }));
      expect(summary()).toBe('Scope and linksGisik Nokma, Studio, all projects; 6 of 7 link types');
      await user.click(screen.getByRole('tab', { name: 'On' }));
      expect(summary()).toBe('Scope and linksGisik Nokma, Studio, all projects; 7 of 8 link types');
    } finally {
      window.localStorage.clear();
    }
  });

  it('27.366 picking a fogged item selects its clear neighbour and says why; outside the scope it says so; control: picking a clear item clears the sentence', async () => {
    const { fake } = setup();
    await drawn(fake, T('t126'));
    const status = () => document.querySelector('.gn-kg__status')!.textContent;
    act(() => fake.pick({ kind: 'node', ref: T('t126'), double: false }));
    await waitFor(() => expect(status()).toBe('GN-126 is in the fog. Center on GN-125 to reach it.'));
    expect(fake.last().states.selected).toBe(T('t125'));
    act(() => fake.pick({ kind: 'node', ref: T('t160'), double: false }));
    await waitFor(() => expect(status()).toBe(''));
    expect(fake.last().states.selected).toBe(T('t160'));
    // with Mobile web chosen, GN-133 (Workflows) is in the fog because it is outside the scope
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Projects/ }));
    await user.click(await screen.findByRole('option', { name: 'Mobile web' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(count()).toBe('18 items within 2 hops, 7 more in the fog (5 outside the scope)'));
    act(() => fake.pick({ kind: 'node', ref: T('t133'), double: false }));
    await waitFor(() => expect(status()).toBe('GN-133 is outside the scope.'));
    expect(fake.last().states.selected).toBe(T('t142'));
    cleanup();
    // the neighbour chosen must be CLEAR: f1's first edge (to f2, also fog) is listed before its edge to a (clear)
    const it = (id: string, label: string) => item(id, { label, ws: 'gn', project: null });
    const rel = (from: string, to: string): GraphEdgeView => ({ id: `relates|${from}|${to}`, kind: 'relates', from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false });
    const [c, a, f1, f2] = [it('c0', 'GN-1'), it('a0', 'GN-2'), it('f1', 'GN-3'), it('f2', 'GN-4')];
    const order: GraphSource = {
      ring: async (q) => {
        const items = q.hops === 1 ? [a] : q.hops === 2 ? [f1, f2] : [];
        const edges = q.hops === 1 ? [rel(c.ref, a.ref)] : q.hops === 2 ? [rel(f1.ref, f2.ref), rel(a.ref, f1.ref), rel(a.ref, f2.ref)] : [];
        return { hop: q.hops, center: { ...c, hop: 0 }, items: items.map((x) => ({ ...x, hop: q.hops })), edges, frontier: items.map((x) => x.ref), truncated: false, cursor: null };
      },
    };
    const o = setup({ centre: c.ref, hops: 1 }, { source: order });
    await drawn(o.fake, f1.ref);
    act(() => o.fake.pick({ kind: 'node', ref: f1.ref, double: false }));
    await waitFor(() => expect(status()).toBe('GN-3 is in the fog. Center on GN-2 to reach it.'));
    expect(o.fake.last().states.selected).toBe(a.ref);
  });

  it('27.326 the count line, literal: two hops, a project chosen, a capped world, a phone; control: one hop is singular', async () => {
    const a = setup();
    await drawn(a.fake, T('t126'));
    expect(count()).toBe('22 items within 2 hops, 7 more in the fog');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Projects/ }));
    await user.click(await screen.findByRole('option', { name: 'Mobile web' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(count()).toBe('18 items within 2 hops, 7 more in the fog (5 outside the scope)'));
    cleanup();
    // a 600-child star, each child with one grandchild: 500 clear, 101 children + 499 grandchildren of fog, 101 further out
    const kids = Array.from({ length: 600 }, (_, i) => item(`k${String(i).padStart(4, '0')}`, { ws: 'gn', project: null }));
    const grand = kids.map((k) => item(`g${k.id}`, { ws: 'gn', project: null }));
    const hub = item('hub', { label: 'GN-1', ws: 'gn', project: null });
    const rel = (from: string, to: string): GraphEdgeView => ({ id: `relates|${from}|${to}`, kind: 'relates', from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false });
    const star: GraphSource = {
      ring: async (q) => {
        const items = q.hops === 1 ? kids : q.hops === 2 ? grand : [];
        const edges = q.hops === 1 ? kids.map((k) => rel(hub.ref, k.ref)) : q.hops === 2 ? kids.map((k, i) => rel(k.ref, grand[i]!.ref)) : [];
        return { hop: q.hops, center: { ...hub, hop: 0 }, items: items.map((x) => ({ ...x, hop: q.hops })), edges, frontier: items.map((x) => x.ref), truncated: false, cursor: null };
      },
    };
    const s = setup({ centre: hub.ref }, { source: star });
    await waitFor(() => expect(count()).toBe('The 500 nearest are clear, 600 more in the fog, 101 further out'), { timeout: 10_000 });
    await userEvent.setup().click(screen.getByRole('button', { name: '+101 further out' }));
    expect(document.querySelector('.gn-kg__status')!.textContent).toBe('101 items are further than the 500 nearest. Turn off a link type, or Center closer to them.');
    expect(s.fake.calls.length).toBeGreaterThan(0);
    cleanup();
    const p = setup({ config: 'phone' });
    await drawn(p.fake, T('t125'));
    expect(count()).toBe('11 linked, 11 more in the fog');
    cleanup();
    const all = setup({ hops: 'all' });
    await drawn(all.fake, T('t126'));
    await waitFor(() => expect(count()).toBe('31 items, everything connected'));
    cleanup();
    // control
    const one = setup({ hops: 1 });
    await drawn(one.fake, T('t125'));
    expect(count()).toBe('11 items within 1 hop, 11 more in the fog');
  });
});

describe('KnowledgeGraph: the empty state and the scope note name their cause (KV7 follow-up)', () => {
  const chipsOff = "Every link type is turned off. Turn one on to see GN-142's links.";
  const workspacesNote = 'GN-142 is outside the workspaces you picked. It stays in the middle, and its links follow your scope.';
  const projectsNote = 'GN-142 is outside the projects you picked. It stays in the middle, and its links follow your scope.';
  const scopeNote = () => document.querySelector('.gn-kg__scope-note')!.textContent;
  /** Turns every chip off, one click each, and proves they all read off. */
  async function everyChipOff(user: ReturnType<typeof userEvent.setup>) {
    const n = document.querySelectorAll('.gn-kg__chip').length;
    expect(n).toBe(CHIP_GROUPS.length);
    for (let i = 0; i < n; i++) await user.click(document.querySelectorAll('.gn-kg__chip')[i]!);
    await settle();
    expect([...document.querySelectorAll('.gn-kg__chip')].map((b) => b.getAttribute('aria-pressed'))).toEqual(CHIP_GROUPS.map(() => 'false'));
  }
  const lonely = (center: GraphItemView): GraphSource => ({
    ring: async (q): Promise<GraphRingResponse> => ({ hop: q.hops, center: { ...center, hop: 0 }, items: [], edges: [], frontier: [], truncated: false, cursor: null }),
  });

  it('27.661 every chip off with a centre that has links: the chips-off sentence and no Add link; control: Blocks back on draws its link and the empty block is gone; some chips on but the carrying one off: the carry sentence (control: every chip off)', async () => {
    const onAddLink = vi.fn();
    const { fake } = setup({ onAddLink });
    await drawn(fake, T('t126'));
    const user = userEvent.setup();
    await everyChipOff(user);
    expect(document.querySelector('.gn-kg__empty p')!.textContent).toBe(chipsOff);
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull(); // t142 is a ticket and onAddLink is given: only the state hides it
    expect(fake.last().edges).toEqual([]);
    // control: one chip back on
    await user.click(screen.getByRole('button', { name: /^Blocks/ }));
    await settle();
    expect(fake.last().edges.filter((e) => e.grp === 'blocks').map((e) => e.id)).toContain('blocks|ticket:t133|ticket:t142');
    expect(document.querySelector('.gn-kg__empty')).toBeNull();
    expect(screen.queryByText(chipsOff)).toBeNull();
    cleanup();
    // one held link between two withheld ones still makes a filtered centre: every link is read, not only the first or the last
    const centre9 = item('t9', { label: 'GN-9', ws: 'gn', project: 'j_mw' });
    const link = (kind: GraphEdgeView['kind'], to: string): GraphEdgeView => ({ id: `${kind}|${T('t9')}|${T(to)}`, kind, from: T('t9'), to: T(to), snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false });
    const mixed: GraphSource = {
      ring: async (q): Promise<GraphRingResponse> => ({
        hop: q.hops, center: { ...centre9, hop: 0 }, frontier: [], truncated: false, cursor: null,
        items: q.hops === 1 ? [{ ...item('t5', { label: 'GN-5', ws: 'gn', project: 'j_mw' }), hop: 1 }] : [],
        edges: q.hops === 1 ? [link('relates', 't404'), link('blocks', 't5'), link('relates', 't405')] : [],
      }),
    };
    setup({ centre: T('t9'), onAddLink }, { source: mixed });
    await everyChipOff(userEvent.setup());
    expect(await screen.findByText("Every link type is turned off. Turn one on to see GN-9's links.")).toBeInTheDocument();
    expect(screen.queryByText('Nothing is linked to GN-9 yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull();
    cleanup();
    // some chips still on, but the one carrying the centre's links is off: the sentence names that cause, not "every link type"
    const blocksOnly: GraphSource = {
      ring: async (q): Promise<GraphRingResponse> => ({
        hop: q.hops, center: { ...centre9, hop: 0 }, frontier: [], truncated: false, cursor: null,
        items: q.hops === 1 ? [{ ...item('t5', { label: 'GN-5', ws: 'gn', project: 'j_mw' }), hop: 1 }] : [],
        edges: q.hops === 1 ? [link('blocks', 't5')] : [],
      }),
    };
    setup({ centre: T('t9'), onAddLink }, { source: blocksOnly });
    const someOn = userEvent.setup();
    await someOn.click(await screen.findByRole('button', { name: /^Blocks/ }));
    await settle();
    const chips = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.gn-kg__chip')];
    expect(chips().filter((b) => b.getAttribute('aria-pressed') === 'true').length).toBe(CHIP_GROUPS.length - 1);
    const carry = "The link types that carry GN-9's links are turned off. Turn one on to see them.";
    expect(document.querySelector('.gn-kg__empty p')!.textContent).toBe(carry);
    expect(screen.queryByText("Every link type is turned off. Turn one on to see GN-9's links.")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull(); // a ticket centre and onAddLink given: only the state hides it
    // control: the chips still on turned off too, so every chip is off: the every-link-type sentence, still no Add link
    for (const b of chips().filter((x) => x.getAttribute('aria-pressed') === 'true')) await someOn.click(b);
    await settle();
    expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual(CHIP_GROUPS.map(() => 'false'));
    expect(document.querySelector('.gn-kg__empty p')!.textContent).toBe("Every link type is turned off. Turn one on to see GN-9's links.");
    expect(screen.queryByText(carry)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull();
    // the chips the bar SHOWS decide: the first chip alone on, then the last alone on, each reads the carry sentence; with the
    // semantic layer off, Concepts leaves the bar while it is still on, so every chip shown is off: the every-link-type sentence
    const only = async (name: RegExp) => {
      for (const b of chips().filter((x) => x.getAttribute('aria-pressed') === 'true')) await someOn.click(b);
      await someOn.click(screen.getByRole('button', { name }));
      await settle();
      expect(chips().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual([expect.stringMatching(name)]);
    };
    try {
      await only(/^Parent and subtasks/);
      expect(document.querySelector('.gn-kg__empty p')!.textContent).toBe(carry);
      await only(/^Concepts/);
      expect(document.querySelector('.gn-kg__empty p')!.textContent).toBe(carry);
      await someOn.click(screen.getByRole('tab', { name: 'Off' }));
      await settle();
      expect(screen.queryByRole('button', { name: /^Concepts/ })).toBeNull();
      expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual(CHIP_GROUPS.filter((g) => g !== 'concepts').map(() => 'false'));
      expect(document.querySelector('.gn-kg__empty p')!.textContent).toBe("Every link type is turned off. Turn one on to see GN-9's links.");
      expect(screen.queryByRole('button', { name: 'Add link' })).toBeNull();
    } finally {
      window.localStorage.clear(); // the Off tab persists 'off' (gn-kg-semantic)
    }
  });

  it('27.662 a ticket centre with no links: Nothing is linked and Add link, with every chip on and with every chip off; control: the chips-off case does not say Nothing is linked', async () => {
    const onAddLink = vi.fn();
    setup({ centre: T('t9'), onAddLink }, { source: lonely(item('t9', { label: 'GN-9', ws: 'gn', project: 'j_mw' })) });
    expect(await screen.findByText('Nothing is linked to GN-9 yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeInTheDocument();
    expect(screen.queryByText("Every link type is turned off. Turn one on to see GN-9's links.")).toBeNull();
    // every chip off does not make a lonely centre look filtered: it still has nothing linked
    const user = userEvent.setup();
    await everyChipOff(user);
    expect(document.querySelector('.gn-kg__empty p')!.textContent).toBe('Nothing is linked to GN-9 yet.');
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(onAddLink).toHaveBeenCalledWith(expect.objectContaining({ ref: T('t9') }));
    cleanup();
    // an edge whose far end the server withheld is no link the member has: still nothing linked, and Add link
    const centre9 = item('t9', { label: 'GN-9', ws: 'gn', project: 'j_mw' });
    const withheld: GraphSource = {
      ring: async (q): Promise<GraphRingResponse> => ({
        hop: q.hops, center: { ...centre9, hop: 0 }, items: [], frontier: [], truncated: false, cursor: null,
        edges: q.hops === 1 ? [{ id: `relates|${T('t9')}|${T('t404')}`, kind: 'relates', from: T('t9'), to: T('t404'), snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false }] : [],
      }),
    };
    setup({ centre: T('t9'), onAddLink }, { source: withheld });
    expect(await screen.findByText('Nothing is linked to GN-9 yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeInTheDocument();
    cleanup();
    // control: the centre with links, every chip off
    const { fake } = setup({ onAddLink });
    await drawn(fake, T('t126'));
    await everyChipOff(userEvent.setup());
    expect(await screen.findByText(chipsOff)).toBeInTheDocument();
    expect(screen.queryByText('Nothing is linked to GN-142 yet.')).toBeNull();
  });

  it('27.663 Gisik Nokma removed from Workspaces: the note says workspaces; control: the same centre with only Workflows picked says projects', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove Gisik Nokma' }));
    await waitFor(() => expect(fx.log.at(-1)!).toMatchObject({ workspaceIds: ['st'], projectIds: [] }));
    await waitFor(() => expect(scopeNote()).toBe(workspacesNote));
    cleanup();
    // control: GN-142's workspace is in, its project (Mobile web) is not
    const p = setup();
    await drawn(p.fake, T('t126'));
    const u2 = userEvent.setup();
    await u2.click(screen.getByRole('button', { name: /Projects/ }));
    await u2.click(await screen.findByRole('option', { name: 'Workflows' }));
    await u2.keyboard('{Escape}');
    await waitFor(() => expect(p.fx.log.at(-1)!).toMatchObject({ workspaceIds: ['gn', 'st'], projectIds: ['j_wf'] }));
    await waitFor(() => expect(scopeNote()).toBe(projectsNote));
  });

  it('27.664 both excluded (Website picked, then Gisik Nokma removed): the note says workspaces, the outer scope; control: a centre in scope has no note', async () => {
    const { fake, fx } = setup();
    await drawn(fake, T('t126'));
    expect(scopeNote()).toBe(''); // after ring 1, so the centre item is held: the in-scope arm, not the not-yet-loaded one
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Projects/ }));
    await user.click(await screen.findByRole('option', { name: 'Website' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(fx.log.at(-1)!).toMatchObject({ workspaceIds: ['gn', 'st'], projectIds: ['j_web'] }));
    await waitFor(() => expect(scopeNote()).toBe(projectsNote));
    await user.click(screen.getByRole('button', { name: 'Remove Gisik Nokma' }));
    await waitFor(() => expect(fx.log.at(-1)!).toMatchObject({ workspaceIds: ['st'], projectIds: ['j_web'] }));
    await waitFor(() => expect(scopeNote()).toBe(workspacesNote));
  });
});

/** The one t118-only item (rings 1–3 of GN-118 minus those of GN-133): 27.318's main case derives and asserts it. */
const only118Ref = T('t126');

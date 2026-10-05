import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAPH_CHIP_ORDER, type GraphEdgeView, type GraphRingResponse } from '@gisik-nokma/domain';
import { KnowledgeGraph } from '../../src/react/knowledge-graph.js';
import type { GraphRingQuery, GraphSource, KnowledgeGraphProps, ScopeChoices } from '../../src/react/types.js';
import { item } from '../engine/fixture.js';
import { fakeRenderer } from './fake-renderer.js';
import { titleOverride } from './fixture/fixture.js';
import { fixtureSource, type FixtureOptions } from './fixture/fixture-source.js';

/*
 * The inspectors and the list over a fake renderer (cases 27.332–27.336). The source is the test-only copy of the browser
 * harness's fixture (the owner-approved mockup's world, centred on GN-142). Every count is a LITERAL read off the raw `E`
 * table (roles/mut-out/kg-c-t8-inspector/oracle.py), never computed with `zones`.
 */
const SCOPE: ScopeChoices = {
  workspaces: [
    { id: 'gn', name: 'Gisik Nokma', projects: [{ id: 'j_mw', name: 'Mobile web' }, { id: 'j_wf', name: 'Workflows' }, { id: 'j_ds', name: 'Design' }] },
    { id: 'st', name: 'Studio', projects: [{ id: 'j_web', name: 'Website' }, { id: 'j_br', name: 'Brand' }] },
  ],
};
const T = (id: string) => `ticket:${id}`;
const N = (id: string) => `note:${id}`;
const P = (id: string) => `person:${id}`;

function setup(over: Partial<KnowledgeGraphProps> = {}, opts: FixtureOptions & { source?: (fx: ReturnType<typeof fixtureSource>) => GraphSource } = {}) {
  const fake = fakeRenderer();
  const fx = fixtureSource(opts);
  const props: KnowledgeGraphProps = {
    centre: T('t142'), config: 'desktop', source: opts.source?.(fx) ?? fx.source, scope: SCOPE, defaultWorkspaceIds: ['gn', 'st'], onOpen: vi.fn(),
    createRenderer: fake.createRenderer, ...over,
  };
  render(<KnowledgeGraph {...props} />);
  return { fake, fx, props };
}
const refsOf = (call: { nodes: { ref: string }[] }) => call.nodes.map((n) => n.ref);
const edgeIds = (fake: ReturnType<typeof fakeRenderer>) => fake.last().edges.map((e) => e.id);
const settle = () => new Promise((r) => setTimeout(r, 60));
async function drawn(fake: ReturnType<typeof fakeRenderer>, ref: string) {
  await waitFor(() => expect(fake.calls.length > 0 && refsOf(fake.last()).includes(ref)).toBe(true));
  await settle();
}
const select = (fake: ReturnType<typeof fakeRenderer>, ref: string) => act(() => fake.pick({ kind: 'node', ref, double: false }));
const selectEdge = (fake: ReturnType<typeof fakeRenderer>, id: string) => act(() => fake.pick({ kind: 'edge', id }));
const insp = () => screen.getByRole('complementary', { name: 'Inspector' });
const title = () => within(insp()).getByRole('heading', { level: 3 }).textContent;
const status = () => document.querySelector('.gn-kg__status')!.textContent;
const pills = () => [...insp().querySelectorAll('.gn-kg-insp__meta .gn-kg-pill')].map((p) => p.textContent);
const hint = () => insp().querySelector('.gn-kg-insp__hint')?.textContent ?? null;
/** The inspector's action buttons (Center, Open, Remove link, Undo, Add …), not its link rows. */
const buttons = () => [...insp().querySelectorAll('.gn-kg-insp__acts button')].map((b) => b.textContent);
const RELATES = `relates|${T('t142')}|${T('t160')}`;

afterEach(() => {
  titleOverride.clear();
  vi.restoreAllMocks();
});

describe('the item inspector (spec C §3.5)', () => {
  it('27.332 GN-133: its title, state and project, Center on and Open ticket (handing the host GN-133), the path as the tooltip reads it; control: the centre has no Center and no path', async () => {
    const { fake, fx, props } = setup();
    await drawn(fake, T('t126'));
    expect(document.querySelectorAll('.gn-kg__status')).toHaveLength(1); // ONE live region
    select(fake, T('t133'));
    expect(title()).toBe('Move sheet: workflows branch');
    expect(insp().querySelector('.gn-kg-insp__head')!.textContent).toBe('GN-133');
    expect(pills()).toEqual(['Active', 'Workflows']);
    expect(within(insp()).queryByRole('heading', { name: /^Linked from/ })).toBeNull(); // nothing references GN-133
    expect(buttons()).toEqual(['Center on GN-133', 'Open ticket']);
    const user = userEvent.setup();
    await user.click(within(insp()).getByRole('button', { name: 'Open ticket' }));
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onOpen).mock.calls[0]![0].ref).toBe(T('t133'));
    const path = within(insp()).getByRole('heading', { name: 'How it connects to GN-142' }).nextElementSibling!;
    expect([...path.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['GN-133 blocks GN-142']);
    expect(document.querySelectorAll('.gn-kg__status')).toHaveLength(1);
    // control: the centre
    select(fake, T('t142'));
    expect(title()).toBe('Move sheet loses its scroll position on phone');
    expect(buttons()).toEqual(['Open ticket']);
    expect(within(insp()).queryByText(/How it connects/)).toBeNull();
    // Center on makes GN-133 the centre: its rings are fetched
    select(fake, T('t133'));
    await user.click(within(insp()).getByRole('button', { name: 'Center on GN-133' }));
    await waitFor(() => expect(fx.log.some((q) => q.center === T('t133'))).toBe(true));
    expect(title()).toBe('Move sheet: workflows branch');
    // a suggested concept says so (GN-142 at two hops: drag · column · board is at hop 2)
    act(() => fake.pick({ kind: 'node', ref: T('t142'), double: true })); // Back to GN-142 by centring it again
    await waitFor(() => expect(screen.getByRole('img', { name: /Knowledge Graph of/ }).getAttribute('aria-label')).toBe('Knowledge Graph of items linked to GN-142'));
    select(fake, 'concept:c2');
    expect(insp().querySelector('.gn-kg-insp__head')!.textContent).toBe('ConceptSuggested');
  });

  it('27.332 a path two steps long reads from the centre out; Done and Open tickets; a host with no page for a kind gets no Open', async () => {
    const { fake } = setup({ centre: T('t118'), canOpen: (it) => it.kind !== 'ticket' });
    await drawn(fake, T('t151'));
    select(fake, T('t151'));
    const path = within(insp()).getByRole('heading', { name: 'How it connects to GN-118' }).nextElementSibling!;
    expect([...path.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['GN-118 has subtask GN-142', 'GN-142 has subtask GN-151']);
    expect(pills()).toEqual(['Open', 'Mobile web']);
    expect(buttons()).toEqual(['Center on GN-151']); // no Open ticket: canOpen refused it
    select(fake, T('t149'));
    expect(pills()).toEqual(['Done', 'Mobile web']);
    select(fake, N('n1'));
    expect(buttons().slice(0, 2)).toEqual(['Center on Phone pass ruli…', 'Open note']); // a note may be opened
  });

  it('27.332 Center on truncates past 16 characters: 16 stay whole, 17 are cut', async () => {
    titleOverride.set(N('n1'), 'Sixteen chars ok'); // 16
    titleOverride.set(N('n2'), 'Seventeen chars x'); // 17
    const { fake } = setup();
    await drawn(fake, T('t126'));
    select(fake, N('n1'));
    expect(buttons()[0]).toBe('Center on Sixteen chars ok');
    select(fake, N('n2'));
    expect(buttons()[0]).toBe('Center on Seventeen chars…');
  });

  it('27.332 one hop: Center brings 1 item, or 4 items, out of the fog; the kinds\' words; a concept is Confirmed and lists Items', async () => {
    const { fake } = setup({ hops: 1 });
    await drawn(fake, T('t125'));
    select(fake, T('t133'));
    expect(hint()).toBe('Center brings 1 item out of the fog.'); // t131
    select(fake, N('n1'));
    expect(hint()).toBe('Center brings 4 items out of the fog.'); // n3, t125, n7, pR
    expect(pills()).toEqual(['Mobile web']); // a note: its project, and no state
    expect(insp().querySelector('.gn-kg-insp__head')!.textContent).toBe('Note');
    select(fake, P('pA'));
    expect(hint()).toBe('Center brings 2 items out of the fog.'); // t157, s12
    expect([insp().querySelector('.gn-kg-insp__head')!.textContent, title(), pills()]).toEqual(['Person', 'Ama Rangsa', []]);
    expect(insp().querySelector('.gn-kg-insp__meta')).toBeNull(); // nothing to say: no empty row
    expect(buttons()).toContain('Show their work');
    select(fake, 'concept:c1');
    expect(insp().querySelector('.gn-kg-insp__head')!.textContent).toBe('ConceptConfirmed');
    expect(within(insp()).getByRole('heading', { level: 4, name: /^Items/ })).toBeTruthy();
    // control: the centre itself brings nothing
    select(fake, T('t142'));
    expect(hint()).toBeNull();
    cleanup();
    // a project item (Projects offered, so the containment edges are walked): its workspace, not itself, is its pill
    const b = setup({ hops: 1, groups: GRAPH_CHIP_ORDER });
    await drawn(b.fake, T('t125'));
    select(b.fake, 'project:j_mw');
    expect([insp().querySelector('.gn-kg-insp__head')!.textContent, title(), pills()]).toEqual(['Project', 'Mobile web', ['Gisik Nokma']]);
    expect(buttons()).toContain('Open board');
  });

  it('27.332 the centre never says what Center would bring, even with 101 links past the 500 nearest; control: a clear child does', async () => {
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
    const { fake } = setup({ centre: hub.ref, defaultWorkspaceIds: ['gn'] }, { source: () => star });
    await waitFor(() => expect(screen.queryByRole('button', { name: '+101 further out' })).not.toBeNull(), { timeout: 15_000 });
    expect(title()).toBe('Title of hub'); // the centre, selected
    expect(hint()).toBeNull(); // 101 children are past the cap, not in the fog: Center on the centre brings nothing
    // control: the first child in ring order (ids descending) is clear, and Center on it brings its grandchild
    select(fake, kids[599]!.ref);
    expect(title()).toBe('Title of k0599');
    expect(hint()).toBe('Center brings 1 item out of the fog.');
  }, 30_000);

  it('27.332 links outside the scope: one says so in the singular and Add Studio (1) adds the workspace; with Design chosen eight lead out', async () => {
    const { fake, fx } = setup({ defaultWorkspaceIds: ['gn'] });
    await drawn(fake, T('t126'));
    // ST-15 (Studio) is outside the scope: picking it selects its one clear neighbour, Tengsrang (mentioned in it), and says why
    select(fake, T('s15'));
    expect([title(), status()]).toEqual(['Tengsrang Marak', 'ST-15 is outside the scope.']);
    expect(insp().querySelector('.gn-kg-insp__outs > p')?.textContent).toBe('1 link leads outside the scope, so it stays in the fog.');
    const user = userEvent.setup();
    await user.click(within(insp()).getByRole('button', { name: 'Add Studio (1)' }));
    expect(status()).toBe(''); // the scope changed: the sentence about it is gone
    await waitFor(() => expect(fx.log.some((q) => q.workspaceIds.includes('st'))).toBe(true));
    expect(fx.log[fx.log.length - 1]!.workspaceIds).toEqual(['gn', 'st']);
    cleanup();
    // a project of a chosen workspace: Design only, the centre's links lead into Mobile web (7) and Workflows (1)
    const b = setup({ defaultWorkspaceIds: ['gn'] });
    await drawn(b.fake, T('t126'));
    await user.click(screen.getByRole('button', { name: /Projects/ }));
    await user.click(await screen.findByRole('option', { name: 'Design' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(b.fx.log.some((q) => q.projectIds.includes('j_ds'))).toBe(true));
    await settle();
    select(b.fake, T('t142'));
    expect(insp().querySelector('.gn-kg-insp__outs > p')?.textContent).toBe('8 links lead outside the scope, so they stay in the fog.');
    expect(buttons().filter((x) => x!.startsWith('Add '))).toEqual(['Add Mobile web (7)', 'Add Workflows (1)']);
    await user.click(within(insp()).getByRole('button', { name: 'Add Workflows (1)' }));
    await waitFor(() => expect(b.fx.log[b.fx.log.length - 1]!.projectIds).toEqual(['j_ds', 'j_wf']));
    await settle();
    // two lead out of Design and Workflows from Tengsrang: one into Mobile web (a project), one into Studio (a workspace)
    select(b.fake, P('pT'));
    expect(insp().querySelector('.gn-kg-insp__outs > p')?.textContent).toBe('2 links lead outside the scope, so they stay in the fog.');
    expect(buttons().filter((x) => x!.startsWith('Add ')).sort()).toEqual(['Add Mobile web (1)', 'Add Studio (1)']);
    // control: in scope, nothing leads out
    cleanup();
    const c = setup();
    await drawn(c.fake, T('t126'));
    select(c.fake, P('pT'));
    expect(insp().querySelector('.gn-kg-insp__outs')).toBeNull();
  });

  it('27.332 Direct links: GN-142 has 11, the first 7 shown in ring order and "4 more on the graph"; a fogged row is marked', async () => {
    const { fake } = setup({ hops: 1 });
    await drawn(fake, T('t125'));
    const section = within(insp()).getByRole('heading', { level: 4, name: /^Direct links/ }).parentElement!;
    expect(section.querySelector('h4')!.textContent).toBe('Direct links 11');
    const rows = [...section.querySelectorAll('button')];
    expect(rows.map((r) => r.querySelector('.gn-kg-links__name')!.textContent)).toEqual([
      'GN-133 Move sheet: workflows branch', 'GN-160 Board column jumps after a drag', 'GN-139 Sheet scroll resets on iOS Safari',
      'GN-151 Restore scroll after Move closes', 'GN-149 Pin the sheet header while scrolling', 'GN-118 Phone pass', 'Phone pass rulings',
    ]);
    expect(rows.map((r) => r.querySelector('.gn-kg-links__rel')!.textContent)).toEqual(['is blocked by', 'relates to', 'is duplicated by', 'has subtask', 'has subtask', 'is a subtask of', 'has note']);
    expect(section.querySelector('.gn-kg-insp__more')!.textContent).toBe('4 more on the graph');
    expect(rows.filter((r) => r.hasAttribute('data-fog'))).toEqual([]); // hop 1: every neighbour of the centre is clear
    // exactly seven (People, Links in text and Concepts off): all shown, and no "more" line
    const user = userEvent.setup();
    for (const chip of [/^People/, /^Links in text/, /^Concepts/]) await user.click(screen.getByRole('button', { name: chip }));
    const seven = within(insp()).getByRole('heading', { level: 4, name: /^Direct links/ }).parentElement!;
    expect(seven.querySelector('h4')!.textContent).toBe('Direct links 7');
    expect(seven.querySelectorAll('button')).toHaveLength(7);
    expect(seven.querySelector('.gn-kg-insp__more')).toBeNull();
    for (const chip of [/^People/, /^Links in text/, /^Concepts/]) await user.click(screen.getByRole('button', { name: chip }));
    select(fake, N('n1'));
    const n1 = within(insp()).getByRole('heading', { level: 4, name: /^Direct links/ }).parentElement!;
    const fogged = [...n1.querySelectorAll('button[data-fog]')].map((r) => r.querySelector('.gn-kg-links__name')!.textContent);
    expect(fogged.sort()).toEqual(['GN-125 44 px touch targets', 'Mobile release checklist', 'Mobile web spec', 'Rikseng Sangma']);
    expect(n1.querySelector('.gn-kg-insp__more')).toBeNull(); // 5 links: no "more"
    // a row picks its item (a fogged one selects its clear neighbour and says why)
    await user.click([...n1.querySelectorAll('button')].find((r) => r.textContent!.includes('GN-142'))!);
    expect(title()).toBe('Move sheet loses its scroll position on phone');
  });
});

describe('Linked from (spec C §3.5)', () => {
  it('27.333 Phone pass rulings: the snippets are quoted with their source, the reference in a <mark>, and markup is text; control: a phone shows neither list', async () => {
    const xss: GraphEdgeView = { id: `ref|${N('n4')}|${N('n1')}`, kind: 'ref', from: N('n4'), to: N('n1'), snippet: '<img src=x onerror=alert(1)>[[A]] and [[B]]', addedBy: null, addedAt: null, origin: null, suggested: false };
    const withXss = (fx: ReturnType<typeof fixtureSource>): GraphSource => ({
      ring: async (q) => {
        const r = await fx.source.ring(q);
        // n4 is in ring 2; the second edge comes from an item the viewer cannot see, so it is never quoted
        return q.hops === 2 && q.center === T('t142') ? { ...r, edges: [...r.edges, xss, { ...xss, id: `ref|${N('gone')}|${N('n1')}`, from: N('gone'), snippet: 'Hidden [[x]].' }] } : r;
      },
    });
    const { fake } = setup({}, { source: withXss });
    await drawn(fake, T('t126'));
    select(fake, N('n1'));
    const section = within(insp()).getByRole('heading', { level: 4, name: /^Linked from/ }).parentElement!;
    expect(section.querySelector('h4')!.textContent).toBe('Linked from 3');
    const quotes = [...section.querySelectorAll('blockquote')];
    expect(quotes.map((q) => q.querySelector('.gn-kg-snip__src')?.textContent)).toEqual(['In GN-125 44 px touch targets', 'In Mobile release checklist', 'In Board drag measurements']);
    expect(quotes[1]!.querySelector('p')!.textContent).toBe('Every row in Phone pass rulings has a ticket before we cut the release.');
    expect([...quotes[1]!.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Phone pass rulings']);
    expect(section.textContent).not.toContain('[[');
    // the snippet is user text: an <img> in it is printed, never made
    expect(insp().querySelector('img')).toBeNull();
    expect(quotes[2]!.querySelector('p')!.textContent).toBe('<img src=x onerror=alert(1)>A and B');
    expect([...quotes[2]!.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['A', 'B']); // each reference its own mark
    // Mobile web spec has one reference into it (from Phone pass rulings)
    select(fake, N('n3'));
    expect(within(insp()).getByRole('heading', { level: 4, name: /^Linked from/ }).textContent).toBe('Linked from 1');
    // a reference from an item the viewer cannot see: nothing is quoted, and that end has no name
    selectEdge(fake, `ref|${N('gone')}|${N('n1')}`);
    expect(insp().querySelector('blockquote')).toBeNull();
    expect([...insp().querySelectorAll('.gn-kg-links--ends .gn-kg-links__name')].map((n) => n.textContent)).toEqual(['', 'Phone pass rulings']);
    cleanup();
    // control: a phone stops at the path
    const phone = setup({ config: 'phone' });
    await drawn(phone.fake, T('t125'));
    select(phone.fake, N('n1'));
    expect(title()).toBe('Phone pass rulings');
    expect(within(insp()).queryByText(/Linked from/)).toBeNull();
    expect(within(insp()).queryByText(/Direct links/)).toBeNull();
    expect(insp().className).toContain('gn-kg-insp--card');
  });
});

describe('the edge inspector (spec C §3.5)', () => {
  it('27.334 relates GN-142 → GN-160: its sentence, provenance via Claude, From and To; control: a parent edge says how it was set, with no Added by', async () => {
    const { fake } = setup();
    await drawn(fake, T('t126'));
    expect(fake.last().view.keepView).toBe(false); // control: the rings, drawn, fit the view
    selectEdge(fake, RELATES);
    expect(fake.last().view.keepView).toBe(true); // selecting a link keeps the zoom (§3.5)
    expect(insp().querySelector('.gn-kg-insp__head')!.textContent).toBe('Relates to');
    expect(title()).toBe('GN-142 relates to GN-160');
    expect(insp().querySelector('.gn-kg-insp__prov')!.textContent).toBe('Added by Ama Rangsa on 2 Oct 2026, via Claude. A typed link.');
    expect(insp().querySelector('blockquote')).toBeNull(); // a typed link has no snippet
    const user = userEvent.setup();
    await user.click(within(insp()).getByRole('button', { name: /^From/ }));
    expect(fake.last().states.selected).toBe(T('t142'));
    expect(title()).toBe('Move sheet loses its scroll position on phone');
    selectEdge(fake, RELATES);
    expect(within(insp()).getByRole('button', { name: /^To/ }).textContent).toBe('ToGN-160 Board column jumps after a drag');
    await user.click(within(insp()).getByRole('button', { name: /^To/ }));
    expect(fake.last().states.selected).toBe(T('t160'));
    expect(title()).toBe('Board column jumps after a drag');
    // control: a parent edge
    selectEdge(fake, `parent|${T('t118')}|${T('t142')}`);
    expect(title()).toBe('GN-118 has subtask GN-142');
    expect(insp().querySelector('.gn-kg-insp__prov')!.textContent).toBe("Set from the subtask's Parent field.");
  });

  it('27.334 a reference quotes its snippet, a mention with one too, a suggestion says so; Center on cuts past 14 characters', async () => {
    const mentionSnip = (fx: ReturnType<typeof fixtureSource>): GraphSource => ({
      ring: async (q) => {
        const r = await fx.source.ring(q);
        return { ...r, edges: r.edges.map((e) => (e.kind === 'mention' && e.from === N('n2') ? { ...e, snippet: 'Checked with [[Ama Rangsa]] on Friday.' } : e)) };
      },
    });
    titleOverride.set(N('n7'), 'Fourteen chars'); // 14
    const { fake, fx } = setup({}, { source: mentionSnip });
    await drawn(fake, T('t126'));
    selectEdge(fake, `ref|${N('n7')}|${N('n1')}`);
    expect(insp().querySelector('.gn-kg-snip__src')?.textContent).toBe('In Fourteen chars');
    expect(insp().querySelector('.gn-kg-snip mark')?.textContent).toBe('Phone pass rulings');
    expect(insp().querySelector('.gn-kg-insp__prov')!.textContent).toBe('Comes from the text: edit the text to change it.');
    expect(buttons()).toContain('Center on Fourteen chars');
    selectEdge(fake, `mention|${N('n2')}|${P('pA')}`);
    expect(insp().querySelector('.gn-kg-snip mark')?.textContent).toBe('Ama Rangsa');
    expect(buttons()).toContain('Center on Scroll restor…'); // 'Scroll restoration: what we tried': 13 characters and the ellipsis
    selectEdge(fake, `tag|concept:c2|${T('t160')}`);
    expect(insp().querySelector('.gn-kg-insp__head')!.textContent).toBe('ConceptsSuggested');
    expect(title()).toBe('drag · column · board may include GN-160');
    // control: a mention with no snippet quotes nothing; a confirmed tag is not Suggested
    selectEdge(fake, `mention|${T('t142')}|${P('pT')}`);
    expect(insp().querySelector('blockquote')).toBeNull();
    selectEdge(fake, `tag|concept:c1|${T('t142')}`);
    expect(insp().querySelector('.gn-kg-insp__head')!.textContent).toBe('Concepts');
    // Center on the edge's source makes it the centre
    await userEvent.setup().click(within(insp()).getByRole('button', { name: /^Center on/ }));
    await waitFor(() => expect(fx.log.some((q) => q.center === 'concept:c1')).toBe(true));
  });

  it('27.334 Center on in the edge inspector: 15 characters are cut, 14 stay (the boundary)', async () => {
    titleOverride.set(N('n7'), 'Fifteen chars x'); // 15
    const { fake } = setup();
    await drawn(fake, T('t126'));
    selectEdge(fake, `ref|${N('n7')}|${N('n1')}`);
    expect(buttons()).toContain('Center on Fifteen chars…');
  });
});

describe('Remove link (spec C §3.5, spec A §2.3)', () => {
  it('27.335 Remove link leaves the drawn graph; Undo waits for the host, then draws it again with no request; hops 2 → 3 still asks for ring 4', async () => {
    let release: () => void = () => {};
    const undo = vi.fn(() => new Promise<void>((r) => (release = r)));
    const onRemoveLink = vi.fn(async (_e: GraphEdgeView) => ({ undo }));
    const { fake, fx } = setup({ onRemoveLink });
    await drawn(fake, T('t126'));
    expect(edgeIds(fake)).toContain(RELATES); // or "no such edge" below holds of a canvas that never drew it
    selectEdge(fake, RELATES);
    const user = userEvent.setup();
    await user.click(within(insp()).getByRole('button', { name: 'Remove link' }));
    expect(onRemoveLink).toHaveBeenCalledTimes(1);
    expect(onRemoveLink.mock.calls[0]![0].id).toBe(RELATES);
    await waitFor(() => expect(status()).toBe('Link removed.'));
    expect(edgeIds(fake)).not.toContain(RELATES);
    expect(fake.last().view.keepView).toBe(true); // the camera stays where it is
    expect(title()).toBe('GN-142 relates to GN-160'); // the inspector stays on the removed link, with Undo
    expect(within(insp()).queryByRole('button', { name: 'Remove link' })).toBeNull();
    const before = fx.log.length;
    await user.click(within(insp()).getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledTimes(1);
    await settle();
    expect(status()).toBe('Link removed.'); // the host's undo is still out
    expect(within(insp()).getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true); // one at a time
    expect(edgeIds(fake)).not.toContain(RELATES);
    await act(async () => release());
    await waitFor(() => expect(status()).toBe('Link restored.'));
    expect(edgeIds(fake)).toContain(RELATES);
    expect(fake.last().view.keepView).toBe(true);
    await settle();
    expect(fx.log.length).toBe(before); // restored locally, through mergeRing, not refetched
    expect(within(insp()).getByRole('button', { name: 'Remove link' })).toHaveProperty('disabled', false);
    // the restore did not mark the entry exhausted: three hops asks for ring 4
    screen.getByRole('img', { name: /Knowledge Graph of/ }).focus();
    await user.keyboard('3');
    await waitFor(() => expect(fx.log.filter((q) => q.center === T('t142')).map((q) => q.hops)).toEqual([1, 2, 3, 4]));
  });

  it('27.335 a refusal shows the server\'s sentence and the link stays; a removal while a ring is still out stays removed when it lands', async () => {
    let refuse: (e: unknown) => void = () => {};
    const refusal = vi.fn((_e: GraphEdgeView) => new Promise<{ undo: () => Promise<void> }>((_, r) => (refuse = r)));
    const a = setup({ onRemoveLink: refusal });
    await drawn(a.fake, T('t126'));
    selectEdge(a.fake, RELATES);
    const user = userEvent.setup();
    const removeButton = () => within(insp()).getByRole('button', { name: 'Remove link' });
    await user.click(removeButton());
    expect(removeButton()).toHaveProperty('disabled', true); // one at a time while the host answers
    await act(async () => refuse(new Error('refused by may-edit: you cannot edit GN-160')));
    await waitFor(() => expect(status()).toBe('refused by may-edit: you cannot edit GN-160'));
    expect(edgeIds(a.fake)).toContain(RELATES);
    expect(removeButton()).toHaveProperty('disabled', false);
    expect(within(insp()).queryByRole('button', { name: 'Undo' })).toBeNull();
    // a host that fails with something that is not an Error: the view's own sentence
    await user.click(removeButton());
    await act(async () => refuse('offline'));
    await waitFor(() => expect(status()).toBe("Couldn't remove the link."));
    cleanup();
    // the host refuses the Undo: its sentence, the link stays out, and Undo is offered again
    let refuseUndo: (e: unknown) => void = () => {};
    const c = setup({ onRemoveLink: async () => ({ undo: () => new Promise<void>((_, r) => (refuseUndo = r)) }) });
    await drawn(c.fake, T('t126'));
    selectEdge(c.fake, RELATES);
    await user.click(removeButton());
    await waitFor(() => expect(status()).toBe('Link removed.'));
    const undoButton = () => within(insp()).getByRole('button', { name: 'Undo' });
    await user.click(undoButton());
    await act(async () => refuseUndo(new Error('refused by may-edit: GN-160 is archived')));
    await waitFor(() => expect(status()).toBe('refused by may-edit: GN-160 is archived'));
    expect(edgeIds(c.fake)).not.toContain(RELATES);
    expect(undoButton()).toHaveProperty('disabled', false);
    await user.click(undoButton());
    await act(async () => refuseUndo(503));
    await waitFor(() => expect(status()).toBe("Couldn't restore the link."));
    cleanup();
    // ring 3 answers late; the link is removed while it is out
    let open: () => void = () => {};
    const gate = new Promise<void>((r) => (open = r));
    const slow = (fx: ReturnType<typeof fixtureSource>): GraphSource => ({
      ring: async (q: GraphRingQuery): Promise<GraphRingResponse> => {
        if (q.hops === 3) await gate;
        return fx.source.ring(q);
      },
    });
    const b = setup({ onRemoveLink: async () => ({ undo: async () => {} }) }, { source: slow });
    await drawn(b.fake, T('t125')); // ring 2 is drawn, ring 3 is out
    expect(refsOf(b.fake.last())).not.toContain(T('t126'));
    selectEdge(b.fake, RELATES);
    await user.click(within(insp()).getByRole('button', { name: 'Remove link' }));
    await waitFor(() => expect(edgeIds(b.fake)).not.toContain(RELATES));
    await act(async () => open());
    await drawn(b.fake, T('t126')); // ring 3 has landed
    expect(edgeIds(b.fake)).not.toContain(RELATES);
  });

  it('27.335 only typed links can be removed, and only when the host offers it and allows it; control: a parent edge has no Remove link', async () => {
    const onRemoveLink = vi.fn(async () => ({ undo: async () => {} }));
    const { fake } = setup({ onRemoveLink, canRemoveLink: (e) => e.kind !== 'duplicates' });
    await drawn(fake, T('t126'));
    const offered = (id: string) => {
      selectEdge(fake, id);
      return within(insp()).queryByRole('button', { name: 'Remove link' }) !== null;
    };
    expect(offered(RELATES)).toBe(true);
    expect(offered(`blocks|${T('t133')}|${T('t142')}`)).toBe(true);
    expect(offered(`duplicates|${T('t139')}|${T('t142')}`)).toBe(false); // canRemoveLink refused it
    expect(offered(`parent|${T('t118')}|${T('t142')}`)).toBe(false);
    expect(offered(`attached|${N('n1')}|${T('t142')}`)).toBe(false);
    cleanup();
    // a host that can remove duplicates offers it there; a host without onRemoveLink offers it nowhere
    const b = setup({ onRemoveLink });
    await drawn(b.fake, T('t126'));
    selectEdge(b.fake, `duplicates|${T('t139')}|${T('t142')}`);
    expect(within(insp()).queryByRole('button', { name: 'Remove link' })).not.toBeNull();
    cleanup();
    const c = setup();
    await drawn(c.fake, T('t126'));
    selectEdge(c.fake, RELATES);
    expect(within(insp()).queryByRole('button', { name: 'Remove link' })).toBeNull();
  });
});

describe('the removed link held for Undo (spec C §3.5)', () => {
  it('27.335 the inspector holds the removed link only while it is the one selected: Back to a centre without the selected link shows the item', async () => {
    // one hop, so each centre holds two rings: GN-133's ring 2 has relates GN-131 → GN-128, GN-142's does not (GN-128 is 3 from it)
    const { fake } = setup({ hops: 1, onRemoveLink: async () => ({ undo: async () => {} }) });
    await drawn(fake, T('t125'));
    act(() => fake.pick({ kind: 'node', ref: T('t133'), double: true }));
    await drawn(fake, T('t128'));
    selectEdge(fake, RELATES);
    const user = userEvent.setup();
    await user.click(within(insp()).getByRole('button', { name: 'Remove link' }));
    await waitFor(() => expect(status()).toBe('Link removed.'));
    selectEdge(fake, `relates|${T('t131')}|${T('t128')}`);
    expect(title()).toBe('GN-131 relates to GN-128');
    expect(buttons()).toEqual(['Center on GN-131', 'Remove link']); // this link's own inspector: no Undo carried over from the removed one
    screen.getByRole('img', { name: /Knowledge Graph of/ }).focus();
    await user.keyboard('{Escape}'); // Back to GN-142, whose store has no GN-131 → GN-128: the selected link is nowhere
    await waitFor(() => expect(screen.getByRole('img', { name: /Knowledge Graph of/ }).getAttribute('aria-label')).toBe('Knowledge Graph of items linked to GN-142'));
    expect(title()).toBe('Move sheet loses its scroll position on phone'); // the item, never the link removed earlier
  });
});

describe('the accessible list (spec C §3.5)', () => {
  it('27.336 one hop, Gisik Nokma: Linked to GN-142 (11), in ring order, every row by Tab, Enter selects; 9 in the fog, 2 outside; control: four hops has no fog line', async () => {
    const { fake } = setup({ hops: 1, defaultWorkspaceIds: ['gn'] }, { delayFor: () => 30 });
    expect(screen.queryByRole('region', { name: /^Linked to/ })).toBeNull(); // nothing to list before ring 1
    await drawn(fake, T('t125'));
    const list = screen.getByRole('region', { name: /^Linked to GN-142/ });
    expect(list.querySelector('h4')!.textContent).toBe('Linked to GN-142 11');
    const rows = within(list).getAllByRole('button');
    expect(rows.map((r) => r.querySelector('.gn-kg-links__name')!.textContent)).toEqual([
      'GN-133 Move sheet: workflows branch', 'GN-160 Board column jumps after a drag', 'GN-139 Sheet scroll resets on iOS Safari',
      'GN-151 Restore scroll after Move closes', 'GN-149 Pin the sheet header while scrolling', 'GN-118 Phone pass', 'Phone pass rulings',
      'Scroll restoration: what we tried', 'Tengsrang Marak', 'Ama Rangsa', 'Scroll position on phone sheets',
    ]);
    expect(rows.map((r) => r.querySelector('.gn-kg-links__rel')!.textContent)).toEqual([
      'blocks GN-142', 'relates to GN-142', 'duplicates GN-142', 'is a subtask of GN-142', 'is a subtask of GN-142', 'has subtask GN-142',
      'is attached to GN-142', 'links to GN-142', 'is mentioned in GN-142', 'is the assignee of GN-142', 'includes GN-142',
    ]);
    const lines = [...list.querySelectorAll('.gn-kg-list__fog')].map((p) => p.textContent);
    expect(lines).toEqual(['9 more are one step further, in the fog. Select an item and press Center to bring its links in.', '2 are outside the scope. Change it under Scope and links.']);
    // Tab reaches every row, in order
    const user = userEvent.setup();
    rows[0]!.focus();
    for (const row of rows.slice(1)) {
      await user.tab();
      expect(document.activeElement).toBe(row);
    }
    // Enter selects a row; the row selected before loses it
    rows[2]!.focus();
    await user.keyboard('{Enter}');
    expect(rows.filter((r) => r.getAttribute('aria-current') === 'true')).toEqual([rows[2]]);
    expect(title()).toBe('Sheet scroll resets on iOS Safari');
    rows[9]!.focus();
    await user.keyboard('{Enter}');
    expect(rows.filter((r) => r.getAttribute('aria-current') === 'true')).toEqual([rows[9]]);
    selectEdge(fake, `assignee|${P('pA')}|${T('t142')}`); // a link selected: no row is the selection
    expect(rows.filter((r) => r.getAttribute('aria-current') === 'true')).toEqual([]);
    cleanup();
    // both workspaces: nothing is outside, so only the fog line (ST-12 and ST-15 join the fog)
    const both = setup({ hops: 1 });
    await drawn(both.fake, T('t125'));
    const all = screen.getByRole('region', { name: /^Linked to GN-142/ });
    expect([...all.querySelectorAll('.gn-kg-list__fog')].map((p) => p.textContent)).toEqual(['11 more are one step further, in the fog. Select an item and press Center to bring its links in.']);
    cleanup();
    // three hops: two in scope are still in the fog (n6, t96) and two are outside: both lines plural
    const three = setup({ hops: 3, defaultWorkspaceIds: ['gn'] });
    await drawn(three.fake, T('t96'));
    expect([...screen.getByRole('region', { name: /^Linked to GN-142/ }).querySelectorAll('.gn-kg-list__fog')].map((p) => p.textContent)).toEqual([
      '2 more are one step further, in the fog. Select an item and press Center to bring its links in.',
      '2 are outside the scope. Change it under Scope and links.',
    ]);
    cleanup();
    // control: four hops, nothing in scope is in the fog (ST-12 and ST-15 are still outside)
    const b = setup({ hops: 4, defaultWorkspaceIds: ['gn'] });
    await drawn(b.fake, T('t96'));
    const four = screen.getByRole('region', { name: /^Linked to GN-142/ });
    expect([...four.querySelectorAll('.gn-kg-list__fog')].map((p) => p.textContent)).toEqual(['2 are outside the scope. Change it under Scope and links.']);
  });

  it('27.336 the singular lines: 1 more is in the fog, 1 is outside the scope', async () => {
    const it1 = (id: string, label: string, ws: string) => ({ ...item(id, { label, ws, project: null }) });
    const [c, a, f, o] = [it1('c0', 'GN-1', 'gn'), it1('a0', 'GN-2', 'gn'), it1('f0', 'GN-3', 'gn'), it1('o0', 'ST-1', 'st')];
    const rel = (from: string, to: string): GraphEdgeView => ({ id: `relates|${from}|${to}`, kind: 'relates', from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false });
    const small: GraphSource = {
      ring: async (q) => {
        const items = q.hops === 1 ? [a, { ...o, out: true }] : q.hops === 2 ? [f] : [];
        const edges = q.hops === 1 ? [rel(c.ref, a.ref), rel(c.ref, o.ref)] : q.hops === 2 ? [rel(a.ref, f.ref)] : [];
        return { hop: q.hops, center: { ...c, hop: 0 }, items: items.map((x) => ({ ...x, hop: q.hops })), edges, frontier: items.filter((x) => !x.out).map((x) => x.ref), truncated: false, cursor: null };
      },
    };
    const { fake } = setup({ centre: c.ref, hops: 1, defaultWorkspaceIds: ['gn'] }, { source: () => small });
    await drawn(fake, f.ref);
    const list = screen.getByRole('region', { name: /^Linked to GN-1/ });
    expect(list.querySelector('h4')!.textContent).toBe('Linked to GN-1 1');
    expect([...list.querySelectorAll('.gn-kg-list__fog')].map((p) => p.textContent)).toEqual([
      '1 more is one step further, in the fog. Select an item and press Center to bring its links in.',
      '1 is outside the scope. Change it under Scope and links.',
    ]);
    // the centre's inspector: its state alone (no project), one direct link (ST-1 is outside); Relates off leaves no empty list
    expect(pills()).toEqual(['Open']);
    const direct = within(insp()).getByRole('heading', { level: 4, name: /^Direct links/ }).parentElement!;
    expect([direct.querySelector('h4')!.textContent, ...[...direct.querySelectorAll('.gn-kg-links__name')].map((n) => n.textContent)]).toEqual(['Direct links 1', 'GN-2 Title of a0']);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Relates to/ }));
    expect(within(insp()).queryByRole('heading', { level: 4, name: /^Direct links/ })).toBeNull();
  });
});

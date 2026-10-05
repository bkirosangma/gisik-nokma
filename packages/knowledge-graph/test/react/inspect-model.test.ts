import { describe, expect, it } from 'vitest';
import { GRAPH_CHIP_ORDER, inGraphScope, type GraphEdgeView, type GraphGroup, type GraphRingResponse } from '@gisik-nokma/domain';
import { mergeRing, type GraphStore } from '../../src/engine/model.js';
import { relation } from '../../src/engine/sentences.js';
import { walk } from '../../src/engine/walk.js';
import { directLinks, fogNext, kindWord, linkedFrom, longLabel, openLabel, outsideScope, pathTo } from '../../src/react/inspect-model.js';
import { edge, item } from '../engine/fixture.js';
import { fixtureWorld } from './fixture/fixture-source.js';

/*
 * The inspect model (cases 27.330, 27.331, and 27.332's words) on the mockup's world. Every literal is read off the raw `E`
 * table by hand or by the independent brute force in roles/mut-out/kg-c-t8-inspector/oracle.py, never by the engine.
 */
const T = (id: string) => `ticket:${id}`;
const N = (id: string) => `note:${id}`;
const P = (id: string) => `person:${id}`;
const DEFAULT = new Set<GraphGroup>(GRAPH_CHIP_ORDER.filter((g) => g !== 'projects'));
const TYPED = new Set<GraphGroup>(['blocks', 'relates', 'dup', 'structure']);
const all = () => true;
const without = (g: GraphGroup) => new Set([...DEFAULT].filter((x) => x !== g));
/** `inScope` as the view builds it: `inGraphScope` on the store's item. */
const scoped = (store: GraphStore, workspaceIds: string[], projectIds: string[] = []) => (r: string) => inGraphScope(store.items.get(r)!, { workspaceIds, projectIds });
/** Adds edges (and items) to a store through the store's own door. */
const plus = (store: GraphStore, edges: GraphEdgeView[], items: GraphRingResponse['items'] = []) =>
  mergeRing(store, { hop: 1, center: store.items.get(T('t142'))!, items, edges, frontier: [], truncated: false, cursor: null });

describe('the inspect model (spec C §3.5)', () => {
  it('27.330 pathTo: GN-151 at hop 2 of GN-118 reads two steps from the centre out; the centre has none; control: an unwalked item has none', () => {
    const store = fixtureWorld();
    const label = (r: string) => store.items.get(r)!.label;
    const w = walk(store, T('t118'), DEFAULT, 3, all);
    expect(pathTo(w, T('t151')).map((s) => `${label(s.from)} ${relation(s.edge, s.from)} ${label(s.to)}`)).toEqual(['GN-118 has subtask GN-142', 'GN-142 has subtask GN-151']);
    expect(pathTo(w, T('t118'))).toEqual([]);
    // control: one hop walked, GN-151 is never reached, so it has no parent to follow
    const near = walk(store, T('t118'), DEFAULT, 1, all);
    expect(near.dist.has(T('t151'))).toBe(false);
    expect(pathTo(near, T('t151'))).toEqual([]);
  });

  it('27.331 directLinks: GN-142\'s typed links and structure in ring order, not the store\'s; out of scope, missing or off are left out', () => {
    const store = fixtureWorld();
    expect(store.adj.get(T('t142'))!.map((x) => x.to)[0]).toBe(T('t118')); // the store lists t118 first: the sort below is observable
    expect(directLinks(store, T('t142'), TYPED, all).map((x) => x.to)).toEqual([T('t133'), T('t160'), T('t139'), T('t151'), T('t149'), T('t118')]);
    // scope: with Mobile web chosen GN-133 (Workflows) is not a direct link
    expect(directLinks(store, T('t142'), TYPED, scoped(store, ['gn'], ['j_mw'])).map((x) => x.to)).toEqual([T('t160'), T('t139'), T('t151'), T('t149'), T('t118')]);
    // an edge whose far end the store does not hold (the server never sends a hidden item) is not listed
    const ghost = plus(store, [edge('relates', T('t142'), T('t999'))]);
    expect(directLinks(ghost, T('t142'), TYPED, all).map((x) => x.to)).toEqual([T('t133'), T('t160'), T('t139'), T('t151'), T('t149'), T('t118')]);
    expect(outsideScope(ghost, T('t142'), TYPED, (r) => ghost.items.has(r), ['gn'])).toEqual([]); // nor does it lead out: there is nothing to add
    // control: Bolsrang's only group off empties his list
    expect(directLinks(store, P('pB'), DEFAULT, all).map((x) => x.to)).toEqual([T('t131')]);
    expect(directLinks(store, P('pB'), without('people'), all)).toEqual([]);
  });

  it('27.331 linkedFrom: exactly the references INTO the note that carry a snippet, from in-scope sources', () => {
    const store = plus(fixtureWorld(), [
      edge('ref', N('n4'), N('n1')), // a reference with no snippet
      edge('mention', N('n2'), N('n1'), { snippet: 'Ask [[Phone pass rulings]] first.' }), // a snippet, but not a reference
    ]);
    expect(linkedFrom(store, N('n1'), all).map((e) => e.id)).toEqual([`ref|${T('t125')}|${N('n1')}`, `ref|${N('n7')}|${N('n1')}`]);
    // a source outside the scope is left out
    expect(linkedFrom(store, N('n1'), (r) => r !== T('t125')).map((e) => e.id)).toEqual([`ref|${N('n7')}|${N('n1')}`]);
    // control: Mobile web spec is referenced FROM n1 (n1 → n3): it is n3's, not n1's
    expect(linkedFrom(store, N('n3'), all).map((e) => e.id)).toEqual([`ref|${N('n1')}|${N('n3')}`]);
  });

  it('27.331 outsideScope: grouped by the project to add inside a chosen workspace, or the workspace to add; an item with no workspace gets no group', () => {
    const store = fixtureWorld();
    // workspace gn, project Mobile web: GN-133 is in Workflows (people and the concept are in scope by inGraphScope)
    expect(outsideScope(store, T('t142'), DEFAULT, scoped(store, ['gn'], ['j_mw']), ['gn'])).toEqual([{ key: { projectId: 'j_wf', workspaceId: 'gn' }, refs: [T('t133')] }]);
    // project Design only: two groups, the Mobile web one holding seven refs in the store's order
    expect(outsideScope(store, T('t142'), DEFAULT, scoped(store, ['gn'], ['j_ds']), ['gn'])).toEqual([
      { key: { projectId: 'j_mw', workspaceId: 'gn' }, refs: [T('t118'), T('t151'), T('t149'), T('t160'), T('t139'), N('n1'), N('n2')] },
      { key: { projectId: 'j_wf', workspaceId: 'gn' }, refs: [T('t133')] },
    ]);
    // ST-15 with only gn chosen: add the Studio workspace for ST-12; Tengsrang (a person) is in scope
    expect(outsideScope(store, T('s15'), DEFAULT, scoped(store, ['gn']), ['gn'])).toEqual([{ key: { workspaceId: 'st' }, refs: [T('s12')] }]);
    // an out-of-scope item with NO workspace has nothing to add: no group (pT is a person, in scope, so it cannot reach this clause)
    const loose = plus(store, [edge('ref', T('s15'), N('x'))], [item('x', { kind: 'note', ws: null, project: null })]);
    expect(outsideScope(loose, T('s15'), DEFAULT, scoped(loose, ['gn']), ['gn'])).toEqual([{ key: { workspaceId: 'st' }, refs: [T('s12')] }]);
    // control: the group that leads out turned off, nothing is outside
    expect(outsideScope(store, T('s15'), without('relates'), scoped(store, ['gn']), ['gn'])).toEqual([]);
  });

  it('27.331 fogNext: enabled, in-scope neighbours that are not clear; control: the item\'s only group off brings none', () => {
    const store = fixtureWorld();
    // GN-142 and its eleven hop-1 neighbours (oracle: clear (t142+hop1, both ws))
    const clear = new Set([T('t142'), T('t118'), T('t151'), T('t149'), T('t133'), T('t160'), T('t139'), N('n1'), N('n2'), P('pT'), P('pA'), 'concept:c1']);
    expect(fogNext(store, T('t133'), DEFAULT, clear, all)).toBe(1); // t131 (t142 is clear)
    expect(fogNext(store, N('n1'), DEFAULT, clear, all)).toBe(4); // n3, t125, n7, pR (t142 is clear)
    expect(fogNext(store, N('n1'), without('people'), clear, all)).toBe(3); // pR goes with People
    expect(fogNext(store, P('pA'), DEFAULT, clear, all)).toBe(2); // t157, s12
    expect(fogNext(store, P('pA'), DEFAULT, clear, scoped(store, ['gn']))).toBe(1); // s12 is in Studio
    // control
    expect(fogNext(store, P('pB'), DEFAULT, clear, all)).toBe(1);
    expect(fogNext(store, P('pB'), without('people'), clear, all)).toBe(0);
  });

  it('27.332 the words: kindWord, openLabel and longLabel for every kind', () => {
    const store = fixtureWorld();
    const at = (r: string) => store.items.get(r)!;
    const refs = [T('t133'), N('n1'), P('pA'), 'concept:c1', 'workspace:wgn', 'project:j_mw'];
    expect(refs.map((r) => kindWord(at(r)))).toEqual(['GN-133', 'Note', 'Person', 'Concept', 'Workspace', 'Project']);
    expect(refs.map((r) => openLabel(at(r)))).toEqual(['Open ticket', 'Open note', 'Show their work', 'Open concept', 'Open workspace', 'Open board']);
    expect(refs.map((r) => longLabel(at(r)))).toEqual(['GN-133 Move sheet: workflows branch', 'Phone pass rulings', 'Ama Rangsa', 'Scroll position on phone sheets', 'Gisik Nokma', 'Mobile web']);
    expect(longLabel(item('t1', { label: 'GN-1', title: null }))).toBe('GN-1'); // a ticket with no title is its key alone
  });
});

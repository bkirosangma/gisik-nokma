import type { ComponentType } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { createHttpClient, createHttpGraphGateway, createOnlineDataSource, type FetchLike } from '@gisik-nokma/app-core/online';
import type { GraphGroup, IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { SEMANTIC_KEY, readSemantic, type KnowledgeGraphProps } from '@gisik-nokma/knowledge-graph';
import { Providers } from '../../src/providers.js';
import { stubServices } from '../helpers/stub-services.js';
import { AMA, CENTRE, CONCEPT, CP, SUGGESTION_VIEW, WS, conceptView, conceptWorld, recordingRenderer } from './concept-world.js';

/**
 * Knowledge Graph spec D, ruling D6 (KG-D Task 8, cases 27.528 and 27.529): the Semantic layer switch is a VIEWING
 * choice. In the web host, on the REAL view (its renderer a recording stand-in), every read the concept panel and the
 * rings make goes through app-core's ONLINE code over one recording `fetch`, so a write, a preferences or settings call,
 * or a `semantic` parameter would show up as the request it is (a fake data source answers the fixture whatever the
 * switch does, so it could not fail).
 */
const h = vi.hoisted(() => ({ push: vi.fn(), createRenderer: undefined as KnowledgeGraphProps['createRenderer'] }));
vi.mock('next/dynamic', async () => {
  const { createElement, lazy, Suspense } = await import('react');
  return {
    default: (load: () => Promise<ComponentType<object>>) => {
      const Lazy = lazy(() => load().then((component) => ({ default: component })));
      return (props: object) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
    },
  };
});
vi.mock('@gisik-nokma/knowledge-graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/knowledge-graph')>();
  const { createElement } = await import('react');
  return { ...actual, KnowledgeGraph: (props: KnowledgeGraphProps) => createElement(actual.KnowledgeGraph, { ...props, createRenderer: h.createRenderer }) };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/w',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { GraphPanel } from '../../src/knowledge-graph/graph-panel.js';

type Call = { method: string; url: string };
const workspace = (): WorkspaceRef =>
  ({ id: WS, name: 'Gisik Nokma', prefix: 'GN', role: 'member', archived: false, memberCount: null, nameRestrictedProjectCount: 0, projects: [] }) as WorkspaceRef;
const committed = (events: SubmittedEvent[]): IngestResult[] => events.map((_, i) => ({ status: 'committed', eventId: `e${i}`, seq: i, serverTime: '2026-10-05T04:00:00.000Z' }));
const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
const urlOf = (call: Call) => new URL(call.url, 'http://server.test');
const settle = () => act(async () => new Promise((r) => setTimeout(r, 60)));

/** The server, as the online code reaches it: the concept world's rings and the concept panel's three reads. */
function recordingFetch(world: ReturnType<typeof conceptWorld>) {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl: FetchLike = async (input, init) => {
    const call = { method: (init?.method ?? 'GET').toUpperCase(), url: input };
    calls.push(call);
    const u = urlOf(call);
    if (call.method !== 'GET') return json({ error: 'not in this world' }, 405);
    if (u.pathname === '/v1/graph/neighbours') {
      const p = u.searchParams;
      const groups = (p.get('groups') ?? '').split(',').filter(Boolean) as GraphGroup[];
      return json(await world.source.ring({ center: p.get('center')!, hops: Number(p.get('hops')), workspaceIds: p.get('ws')!.split(','), projectIds: [], groups }));
    }
    if (u.pathname === `/v1/concepts/${CP}`) return json(conceptView());
    if (u.pathname === `/v1/workspaces/${WS}/suggestions`) return json({ workspaceId: WS, suggestions: [SUGGESTION_VIEW] });
    if (u.pathname === `/v1/workspaces/${WS}/concepts/audience`) return json({ conceptId: null, members: 5, before: 5, after: 5 });
    return json({ error: 'not in this world' }, 404);
  };
  return { fetchImpl, calls };
}

function mount() {
  const world = conceptWorld();
  const rr = recordingRenderer();
  h.createRenderer = rr.createRenderer;
  const { fetchImpl, calls } = recordingFetch(world);
  const online = createOnlineDataSource({ baseUrl: '', fetchImpl });
  const services = stubServices({}, { graph: createHttpGraphGateway(createHttpClient('', fetchImpl)) });
  // Every read is the online one, over the recording fetch; only the two the scope and the names need are answered here.
  Object.assign(services.dataSource.query, online.query, {
    getMyWorkspaces: async () => [workspace()],
    getActorNames: async () => [{ id: AMA, name: 'Ama Rangsa' }],
  });
  const ingest = vi.fn(async (events: SubmittedEvent[]) => committed(events));
  services.dataSource.ingest = ingest;
  render(
    <Providers services={services}>
      <GraphPanel centre={CENTRE.ref} workspaceId={WS} onOpenTicket={vi.fn()} />
    </Providers>,
  );
  return { rr, calls, ingest };
}
async function select(rr: ReturnType<typeof recordingRenderer>, ref: string) {
  await waitFor(() => expect(rr.drawnRefs()).toContain(ref));
  act(() => rr.pick(ref));
  return within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
}
async function setSemantic(on: boolean, rr: ReturnType<typeof recordingRenderer>) {
  await userEvent.setup().click(within(screen.getByRole('tablist', { name: 'Semantic layer' })).getByRole('tab', { name: on ? 'On' : 'Off' }));
  await waitFor(() => expect(rr.drawnRefs().includes(CONCEPT.ref)).toBe(on));
}
/** The last ring request for hop 1 of the centre. */
const lastRing = (calls: Call[]) => calls.filter((c) => urlOf(c).pathname === '/v1/graph/neighbours' && urlOf(c).searchParams.get('hops') === '1').at(-1)!;

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
});
afterEach(() => vi.restoreAllMocks());

describe('27.528 the Semantic layer switch writes nothing but its own key (D6)', () => {
  it('27.528 Off, On, Off with a concept panel open: no ingest, no non-GET request, no preferences or settings call, and exactly three storage writes, all on gn-kg-semantic, the last Off; control: back On, "Remove from concept" DOES ingest', async () => {
    const { rr, calls, ingest } = mount();
    await select(rr, CONCEPT.ref);
    await settle();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await setSemantic(false, rr);
    await setSemantic(true, rr);
    await setSemantic(false, rr);
    await settle();
    expect(ingest).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(calls.filter((c) => /preferences|settings/.test(urlOf(c).pathname))).toEqual([]);
    expect(setItem.mock.calls).toEqual([
      [SEMANTIC_KEY, 'off'],
      [SEMANTIC_KEY, 'on'],
      [SEMANTIC_KEY, 'off'],
    ]);
    expect(readSemantic()).toBe(false);
    // control: the spies are live
    await setSemantic(true, rr);
    const panel = await select(rr, CONCEPT.ref);
    await userEvent.setup().click(within(panel).getAllByRole('button', { name: 'Remove from concept' })[0]!);
    await waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
  });
});

describe('27.529 the concept data is the same whichever way the switch stands (D6)', () => {
  it('27.529 getConcept GETs the same path, with no semantic parameter, before and after Off→On; the ring requests differ only by the concepts group', async () => {
    const { rr, calls } = mount();
    await select(rr, CONCEPT.ref);
    const ringOn = lastRing(calls);
    await setSemantic(false, rr);
    const ringOff = lastRing(calls);
    await setSemantic(true, rr);
    await select(rr, CONCEPT.ref);
    const conceptReads = calls.filter((c) => urlOf(c).pathname.startsWith('/v1/concepts/'));
    expect(conceptReads).toEqual([
      { method: 'GET', url: `/v1/concepts/${CP}` },
      { method: 'GET', url: `/v1/concepts/${CP}` },
    ]);
    expect(conceptReads.some((c) => urlOf(c).searchParams.has('semantic'))).toBe(false);
    // the rings: Off asked again, without `concepts` and only without it
    expect(ringOff).not.toBe(ringOn);
    const on = urlOf(ringOn).searchParams;
    const off = urlOf(ringOff).searchParams;
    const groupsOn = on.get('groups')!.split(',');
    const groupsOff = off.get('groups')!.split(',');
    expect(groupsOn).toContain('concepts');
    expect(groupsOff).not.toContain('concepts');
    expect(groupsOn.filter((g) => g !== 'concepts')).toEqual(groupsOff);
    on.delete('groups');
    off.delete('groups');
    expect(off.toString()).toBe(on.toString());
    expect(on.get('center')).toBe(CENTRE.ref);
  });
});

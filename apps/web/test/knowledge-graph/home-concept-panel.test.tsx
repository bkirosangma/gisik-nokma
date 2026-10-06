import type { ComponentType } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import type { GraphEdgeView, GraphItemView, GraphRingResponse, HomeResponse, IngestResult, SubmittedEvent, WorkspaceRole } from '@gisik-nokma/domain';
import type { GraphSource, KnowledgeGraphProps } from '@gisik-nokma/knowledge-graph';
import { Providers, resetLastKnownUser } from '../../src/providers.js';
import { stubServices } from '../helpers/stub-services.js';
import { AMA, CENTRE, CONCEPT, SUGGESTION_VIEW, VISIBLE, WS, conceptView, conceptWorld, recordingRenderer } from './concept-world.js';

/**
 * Knowledge Graph spec D §6 on Home (case 27.642; planner ruling 2026-10-06 13:51 (B)(3), added to KG-D Task 9): Home
 * hands the view the SAME concept inspector the ticket and note hosts do (`GraphPanel`'s `ConceptPanel`), so a concept
 * picked on Home is the server's concept with its attribution and its removable items, never plan C's default body.
 * Both hosts run the REAL view through their own `next/dynamic` loaders on `concept-world.tsx`'s recording renderer
 * (jsdom has no WebGL); Home is the real `HomeScreen`, centred on its workspace.
 */
const h = vi.hoisted(() => ({ push: vi.fn(), createRenderer: undefined as KnowledgeGraphProps['createRenderer'], userId: 'u_kiro' }));
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
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: h.userId, name: 'Kiro', email: 'kiro@example.com' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { HomeScreen } from '../../src/home/home-screen.js';
import { GraphPanel } from '../../src/knowledge-graph/graph-panel.js';
import { clearLastWorkspaceCache } from '../../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../../src/use-workspace-name.js';

const workspace = (role: WorkspaceRole): WorkspaceRef =>
  ({ id: WS, name: 'Gisik Nokma', prefix: 'GN', role, archived: false, memberCount: null, nameRestrictedProjectCount: 0, projects: [] }) as WorkspaceRef;
const committed = (events: SubmittedEvent[]): IngestResult[] => events.map((_, i) => ({ status: 'committed', eventId: `e${i}`, seq: i, serverTime: '2026-10-06T04:00:00.000Z' }));
const HOME: HomeResponse = {
  workspaceId: WS,
  generatedAt: '2026-10-06T04:30:00.000Z',
  dueSoonDays: 3,
  counts: { tickets: 2, open: 2, pastDue: 0, dueSoon: 0, members: 1, notes: 0 },
  ids: { tickets: [], open: [], pastDue: [], dueSoon: [], members: [], notes: [] },
};
/**
 * Home is centred on its workspace: the same world answered for `workspace:WS`, with the ticket centre T on ring 1 and
 * both tickets `in` the workspace, so the concepts that tag them hang off the centre as they would on a real Home.
 */
const HOME_CENTRE: GraphItemView = { ...CENTRE, ref: `workspace:${WS}`, kind: 'workspace', id: WS, label: 'Gisik Nokma', title: null, category: null };
const inWorkspace = (ref: string): GraphEdgeView => ({
  id: `in|${ref}|${HOME_CENTRE.ref}`, kind: 'in', from: ref, to: HOME_CENTRE.ref, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false,
});
function homeSource(world: ReturnType<typeof conceptWorld>): GraphSource {
  return {
    async ring(q) {
      const answer = await world.source.ring(q);
      if (q.hops !== 1) return { ...answer, center: HOME_CENTRE };
      const items = [{ ...CENTRE, hop: 1 }, ...answer.items];
      const edges = [...answer.edges, inWorkspace(CENTRE.ref), inWorkspace(VISIBLE.ref)];
      return { ...answer, center: HOME_CENTRE, items, edges, frontier: items.map((i) => i.ref) } satisfies GraphRingResponse;
    },
  };
}
const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
const PANEL = 'Concept Scroll position on phone sheets';

function mount(host: 'home' | 'ticket', role: WorkspaceRole = 'member') {
  const world = conceptWorld();
  const rr = recordingRenderer();
  h.createRenderer = rr.createRenderer;
  const getConcept = vi.fn(async () => conceptView());
  const services = stubServices(
    {
      getMyWorkspaces: async () => [workspace(role)],
      getHome: async () => HOME,
      // names only for the concept's workspace, so a panel reading another workspace's names says "u_ama"
      getActorNames: async (workspaceId: string) => (workspaceId === WS ? [{ id: AMA, name: 'Ama Rangsa' }] : []),
      getConcept,
      getSuggestions: async () => [SUGGESTION_VIEW],
      getConceptAudience: async () => ({ conceptId: null, members: 5, before: 5, after: 5 }),
    },
    { graph: host === 'home' ? homeSource(world) : { ring: world.source.ring }, notifications: { unreadCount: async () => 0 } },
  );
  const ingest = vi.fn(async (events: SubmittedEvent[]) => committed(events));
  services.dataSource.ingest = ingest;
  render(<Providers services={services}>{host === 'home' ? <HomeScreen /> : <GraphPanel centre={CENTRE.ref} workspaceId={WS} onOpenTicket={vi.fn()} />}</Providers>);
  return { rr, getConcept, ingest };
}
async function pickConcept(rr: ReturnType<typeof recordingRenderer>) {
  await waitFor(() => expect(rr.drawnRefs()).toContain(CONCEPT.ref));
  act(() => rr.pick(CONCEPT.ref));
}

beforeEach(() => {
  cleanup();
  h.push.mockReset();
  h.userId = 'u_kiro';
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  resetLastKnownUser();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
});

describe('27.642 Home hands the view the same concept inspector as the ticket and note hosts', () => {
  it('27.642 a concept picked on Home is the server\'s concept, attributed, its items removable as the viewer; CONTROL first: the ticket host on the same world', async () => {
    const ticket = mount('ticket');
    await pickConcept(ticket.rr);
    const control = await within(inspector()).findByRole('region', { name: PANEL });
    expect(within(control).getByText('Created by Ama Rangsa')).toBeInTheDocument();
    expect(within(control).getAllByRole('button', { name: 'Remove from concept' })).toHaveLength(2);
    cleanup();

    h.userId = 'u_lin'; // the actor is the signed-in viewer, not a fixture's u_kiro
    const { rr, getConcept, ingest } = mount('home');
    await pickConcept(rr);
    const panel = await within(inspector()).findByRole('region', { name: PANEL });
    expect(getConcept).toHaveBeenCalledWith(CONCEPT.id);
    expect(within(panel).getByText('Why sheets on phone jump back to the top.')).toBeInTheDocument();
    expect(within(panel).getByText('Created by Ama Rangsa')).toBeInTheDocument();
    expect(within(panel).getByText('GN-7 Renew the trade licence')).toBeInTheDocument();
    const removes = within(panel).getAllByRole('button', { name: 'Remove from concept' });
    expect(removes).toHaveLength(2);
    await userEvent.setup().click(removes[1]!);
    await waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    expect(ingest.mock.calls[0]![0]).toHaveLength(1);
    expect(ingest.mock.calls[0]![0][0]).toMatchObject({ workspaceId: WS, entity: { kind: 'concept', id: CONCEPT.id }, type: 'concept.item_untagged', actorId: 'u_lin' });
  });

  it('27.642 a guest of the workspace reads the concept on Home with no Remove, Rename or Delete (spec D §3.3)', async () => {
    const { rr } = mount('home', 'guest');
    await pickConcept(rr);
    const panel = await within(inspector()).findByRole('region', { name: PANEL });
    expect(within(panel).getByText('GN-7 Renew the trade licence')).toBeInTheDocument();
    for (const name of ['Remove from concept', 'Rename', 'Delete']) expect(within(inspector()).queryByRole('button', { name })).toBeNull();
  });
});

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import type { GraphItemView, GraphRingResponse, HomeResponse } from '@gisik-nokma/domain';
import type { GraphRingQuery } from '@gisik-nokma/knowledge-graph';
import { fakeRenderer } from '../../../packages/knowledge-graph/test/react/fake-renderer.js';
import { Providers, resetLastKnownUser } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 27.694 (KG release blocker P2-3, planner ruling 2026-10-06): Home's "Start from: Me" for a GUEST, through `HomeScreen`
 * with the REAL `Providers` and the REAL `KnowledgeGraph` (spec C's view) over a fake renderer, so the canvas's
 * aria-label and the bar's count are the view's own. The ring source answers what the server answers since the fix
 * (`apps/server/test/graph/self-node.test.ts`, 27.690): the viewer's own person node, labelled with their own name and
 * belonging to no workspace, ring 1 the items they can open, ring 2 the one person their list names. It proves the
 * client's half only; the guest's 200 is the server's (27.690), and the real browser is the reviewer's item.
 */
const h = vi.hoisted(() => ({ fake: null as null | { createRenderer: () => Promise<unknown> } }));
vi.mock('../src/home/home-graph-canvas.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/home/home-graph-canvas.js')>();
  const { KnowledgeGraph } = await import('@gisik-nokma/knowledge-graph');
  type ViewProps = Parameters<typeof KnowledgeGraph>[0];
  return { ...real, HomeGraphCanvas: (props: ViewProps) => <KnowledgeGraph {...props} createRenderer={h.fake!.createRenderer as ViewProps['createRenderer']} /> };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
// The session's name is NOT the answer's label: the canvas must name the viewer from the ring's centre.
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_gita', name: 'Gita', email: 'gita@example.com' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { HomeScreen } from '../src/home/home-screen.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';

const WS = 'ws_694';
const SELF = 'person:u_gita';

function view(ref: string, over: Partial<GraphItemView> = {}): GraphItemView {
  const [kind, id] = ref.split(':') as [GraphItemView['kind'], string];
  return { ref, kind, id, workspaceId: WS, projectId: null, label: id, title: null, category: null, hop: 0, out: false, suggested: false, ...over };
}
const edge = (kind: 'mention' | 'assignee', from: string, to: string) => ({ id: `${kind}|${from}|${to}`, kind, from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false });
/** The fixed server's answer to the guest's Me, ring by ring (27.690's shape). */
function guestSelfRing(hops: number): GraphRingResponse {
  const center = view(SELF, { workspaceId: null, label: 'Gita Guest' });
  const empty = { hop: hops, center, items: [], edges: [], frontier: [], truncated: false, cursor: null };
  if (hops === 1) {
    const items = [view('ticket:t_1', { label: 'KT-1', title: 'Share the July invoices', category: 'open', hop: 1 }), view('note:n_1', { label: 'Invoice checklist', title: 'Invoice checklist', hop: 1 })];
    return { ...empty, items, edges: [edge('mention', 'ticket:t_1', SELF), edge('mention', 'note:n_1', SELF)], frontier: items.map((i) => i.ref) };
  }
  if (hops === 2) {
    const items = [view('person:u_kiro', { workspaceId: null, label: 'Kiro Sangma', hop: 2 })];
    return { ...empty, items, edges: [edge('assignee', 'person:u_kiro', 'ticket:t_1')], frontier: items.map((i) => i.ref) };
  }
  return empty;
}
function workspaceRing(hops: number): GraphRingResponse {
  return { hop: hops, center: view(`workspace:${WS}`, { label: 'Kalita Tea' }), items: [], edges: [], frontier: [], truncated: false, cursor: null };
}
function home(): HomeResponse {
  return {
    workspaceId: WS, generatedAt: '2026-10-06T04:30:00.000Z', dueSoonDays: 3,
    counts: { tickets: 1, open: 1, pastDue: 0, dueSoon: 0, members: 1, notes: 1 },
    ids: { tickets: ['t_1'], open: ['t_1'], pastDue: [], dueSoon: [], members: ['u_kiro'], notes: ['n_1'] },
  };
}
function guestWorkspace(): WorkspaceRef {
  return { id: WS, name: 'Kalita Tea', prefix: 'KT', role: 'guest', archived: false, memberCount: 3, nameRestrictedProjectCount: 0, projects: [] };
}

beforeEach(() => {
  h.fake = fakeRenderer();
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  resetLastKnownUser();
  vi.stubGlobal('matchMedia', ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('27.694 Home, Start from: Me, for a guest', () => {
  it('27.694 Me draws the guest’s own node: the canvas names her from the answer, and the count is her two rings; control: while the server refuses her own node (the base’s 404) the canvas names no one and says it could not load', async () => {
    const asked: GraphRingQuery[] = [];
    let refused = true;
    const services = stubServices(
      { getMyWorkspaces: async () => [guestWorkspace()], getHome: async () => home() },
      {
        notifications: { unreadCount: async () => 0 },
        graph: {
          ring: async (q) => {
            asked.push(q);
            if (q.center === SELF && refused) throw new Error('not_found'); // the base's 404 (lane 2's walk, P2-3)
            return q.center === SELF ? guestSelfRing(q.hops) : workspaceRing(q.hops);
          },
        },
      },
    );
    render(
      <Providers services={services}>
        <HomeScreen />
      </Providers>,
    );
    const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Knowledge Graph of items linked to Kalita Tea' });
    const startFrom = screen.getByRole('tablist', { name: 'Start from' });

    // CONTROL first: the refused answer. Nothing names her, and the view says so.
    await user.click(within(startFrom).getByRole('tab', { name: 'Me' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the next hop."));
    expect(asked.some((q) => q.center === SELF && q.workspaceIds.join() === WS)).toBe(true);
    expect(screen.queryByRole('img', { name: /Gita Guest/ })).toBeNull();
    expect(screen.getByRole('img', { name: 'Knowledge Graph of items linked to' })).toBeInTheDocument();

    // The fixed answer: Retry asks again and the view draws her.
    refused = false;
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('img', { name: 'Knowledge Graph of items linked to Gita Guest' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.gn-kg__count')!.textContent).toBe('3 items within 2 hops'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(startFrom).getByRole('tab', { name: 'Me' })).toHaveAttribute('aria-selected', 'true');
  });
});

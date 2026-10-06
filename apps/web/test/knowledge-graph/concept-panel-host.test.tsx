import type { ComponentType } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import type { ConceptView, IngestResult, SubmittedEvent, SuggestionView, WorkspaceRole } from '@gisik-nokma/domain';
import type { KnowledgeGraphProps } from '@gisik-nokma/knowledge-graph';
import { Providers } from '../../src/providers.js';
import { stubServices } from '../helpers/stub-services.js';
import { AMA, CENTRE, CONCEPT, SUGGESTION, SUGGESTION_VIEW, VISIBLE, WS, WS2, conceptView, conceptWorld, recordingRenderer } from './concept-world.js';

/**
 * Knowledge Graph spec D §6 (KG-D Task 8): the web's `GraphPanel` hosts the concept inspector inside the REAL view
 * (cases 27.533, 27.535). The view is the package's own, reached through the panel's `next/dynamic` loader; only its
 * renderer is a recording stand-in (jsdom has no WebGL), injected by wrapping the export the loader picks.
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
  usePathname: () => '/w',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: h.userId, name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { GraphPanel } from '../../src/knowledge-graph/graph-panel.js';

const workspace = (role: WorkspaceRole, id = WS): WorkspaceRef =>
  ({ id, name: id === WS ? 'Gisik Nokma' : 'Second', prefix: id === WS ? 'GN' : 'SC', role, archived: false, memberCount: null, nameRestrictedProjectCount: 0, projects: [] }) as WorkspaceRef;
const committed = (events: SubmittedEvent[]): IngestResult[] => events.map((_, i) => ({ status: 'committed', eventId: `e${i}`, seq: i, serverTime: '2026-10-05T04:00:00.000Z' }));
const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });

type MountOpts = {
  role?: WorkspaceRole;
  /** The graph spans these instead of WS alone (the panel's own workspace stays WS). */
  workspaces?: WorkspaceRef[];
  conceptWs?: string;
  getConcept?: (id: string) => Promise<ConceptView>;
  getSuggestions?: (workspaceId: string) => Promise<SuggestionView[]>;
  ingest?: (events: SubmittedEvent[]) => Promise<IngestResult[]>;
};
function mount(opts: MountOpts = {}) {
  const world = conceptWorld({ conceptWs: opts.conceptWs });
  const rr = recordingRenderer();
  h.createRenderer = rr.createRenderer;
  const getConcept = vi.fn(opts.getConcept ?? (async () => conceptView()));
  const services = stubServices(
    {
      getMyWorkspaces: async () => opts.workspaces ?? [workspace(opts.role ?? 'member')],
      getActorNames: async () => [{ id: AMA, name: 'Ama Rangsa' }],
      getConcept,
      getSuggestions: opts.getSuggestions ?? (async () => [SUGGESTION_VIEW]),
      getConceptAudience: async () => ({ conceptId: null, members: 5, before: 5, after: 5 }),
    },
    { graph: { ring: world.source.ring } },
  );
  const ingest = vi.fn(opts.ingest ?? (async (events: SubmittedEvent[]) => committed(events)));
  services.dataSource.ingest = ingest;
  render(
    <Providers services={services}>
      <GraphPanel centre={CENTRE.ref} workspaceId={WS} onOpenTicket={vi.fn()} />
    </Providers>,
  );
  return { world, rr, ingest, getConcept };
}
/** The concepts sit in WS2, outside the scope the view opens with (WS): add WS2 as a person would, from the centre's inspector. */
async function addSecond(world: ReturnType<typeof conceptWorld>, rr: ReturnType<typeof recordingRenderer>) {
  await waitFor(() => expect(rr.drawnRefs()).toContain(CONCEPT.ref));
  await userEvent.setup().click(await within(inspector()).findByRole('button', { name: /^Add Second \(/ }));
  await waitFor(() => expect(world.log.some((q) => q.workspaceIds.includes(WS2))).toBe(true));
}
async function select(rr: ReturnType<typeof recordingRenderer>, ref: string) {
  await waitFor(() => expect(rr.drawnRefs()).toContain(ref));
  act(() => rr.pick(ref));
}

beforeEach(() => {
  cleanup();
  h.push.mockReset();
  h.userId = 'u_kiro';
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
});

describe('27.535 GraphPanel hands the view the concept inspector', () => {
  it('27.535 a confirmed concept shows the SERVER\'s concept, attributed, its items removable; a suggestion shows Suggested, the name from its terms and Confirm', async () => {
    const { rr, getConcept } = mount();
    await select(rr, CONCEPT.ref);
    const panel = await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    expect(getConcept).toHaveBeenCalledWith(CONCEPT.id);
    expect(within(panel).getByText('Why sheets on phone jump back to the top.')).toBeInTheDocument();
    expect(within(panel).getByText('Created by Ama Rangsa')).toBeInTheDocument();
    expect(within(panel).getAllByRole('button', { name: 'Remove from concept' })).toHaveLength(2);
    expect(within(panel).getByText('GN-7 Renew the trade licence')).toBeInTheDocument();
    await select(rr, SUGGESTION.ref);
    await waitFor(() => expect(within(inspector()).getByRole('button', { name: 'Confirm' })).toBeInTheDocument());
    expect(within(inspector()).getByText('Suggested')).toBeInTheDocument();
    expect(within(inspector()).getByRole('textbox', { name: 'Name' })).toHaveValue('drag · column · board');
    expect(within(inspector()).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('27.535 a refused write is reported in the server\'s words; the next committed write clears it', async () => {
    const results: IngestResult[][] = [[{ status: 'refused', eventId: 'e0', rule: 'concept-item-visibility', reason: 'You cannot see that item.' }]];
    const { rr } = mount({ ingest: async (events) => results.shift() ?? committed(events) });
    await select(rr, CONCEPT.ref);
    const panel = await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    const user = userEvent.setup();
    const [first, second] = within(panel).getAllByRole('button', { name: 'Remove from concept' });
    await user.click(first!);
    expect(await within(inspector()).findByRole('alert')).toHaveTextContent('Refused by the server: concept-item-visibility: You cannot see that item.');
    await user.click(second!);
    await waitFor(() => expect(within(inspector()).queryByRole('alert')).toBeNull());
  });

  it('27.535 a committed write re-reads every ring of the centre, in place (the row itself went at the click)', async () => {
    const { rr, world, ingest } = mount();
    await select(rr, CONCEPT.ref);
    const panel = await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    await waitFor(() => expect(world.log.length).toBeGreaterThan(0));
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    const asked = world.log.length;
    await userEvent.setup().click(within(panel).getAllByRole('button', { name: 'Remove from concept' })[1]!);
    await waitFor(() => expect(world.log.length).toBeGreaterThan(asked));
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]![0].map((e) => [e.type, e.entity])).toEqual([['concept.item_untagged', { kind: 'concept', id: CONCEPT.id }]]);
    expect(world.log.slice(asked).every((q) => q.center === CENTRE.ref)).toBe(true);
    expect(world.log.slice(asked)[0]!.hops).toBe(1);
  });

  it('27.535 a guest reads only: no Remove, Rename, Delete, Confirm or Reject (spec D §3.3); control: a member is offered each', async () => {
    const member = mount({ role: 'member' });
    await select(member.rr, CONCEPT.ref);
    await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    for (const name of ['Remove from concept', 'Rename', 'Delete']) expect(within(inspector()).queryAllByRole('button', { name }).length).toBeGreaterThan(0);
    cleanup();
    const guest = mount({ role: 'guest' });
    await select(guest.rr, CONCEPT.ref);
    const panel = await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    expect(within(panel).getByText('GN-7 Renew the trade licence')).toBeInTheDocument();
    for (const name of ['Remove from concept', 'Rename', 'Delete']) expect(within(inspector()).queryByRole('button', { name })).toBeNull();
    await select(guest.rr, SUGGESTION.ref);
    await waitFor(() => expect(within(inspector()).getByText('Suggested')).toBeInTheDocument());
    await waitFor(() => expect(within(inspector()).getByText('drag, column, board')).toBeInTheDocument());
    for (const name of ['Confirm', 'Reject']) expect(within(inspector()).queryByRole('button', { name })).toBeNull();
  });
});

describe('27.535 a concept from the graph\'s OTHER workspace is the other workspace\'s', () => {
  it('27.535 the panel is guarded by the role in the CONCEPT\'s workspace: a guest of WS2 is offered nothing though a member of the panel\'s WS; control: a member of WS2 (a guest of WS) is offered Remove, Rename and Delete', async () => {
    const guestThere = mount({ workspaces: [workspace('member', WS), workspace('guest', WS2)], conceptWs: WS2, getConcept: async () => conceptView({ workspaceId: WS2 }) });
    await addSecond(guestThere.world, guestThere.rr);
    await select(guestThere.rr, CONCEPT.ref);
    const panel = await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    expect(within(panel).getByText('GN-7 Renew the trade licence')).toBeInTheDocument();
    for (const name of ['Remove from concept', 'Rename', 'Delete']) expect(within(inspector()).queryByRole('button', { name })).toBeNull();
    cleanup();
    const memberThere = mount({ workspaces: [workspace('guest', WS), workspace('member', WS2)], conceptWs: WS2, getConcept: async () => conceptView({ workspaceId: WS2 }) });
    await addSecond(memberThere.world, memberThere.rr);
    await select(memberThere.rr, CONCEPT.ref);
    await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    for (const name of ['Remove from concept', 'Rename', 'Delete']) expect(within(inspector()).queryAllByRole('button', { name }).length).toBeGreaterThan(0);
  });

  it('27.535 a suggestion from WS2 is read from WS2\'s list and confirmed INTO WS2, by the signed-in person; control: WS\'s list does not hold it', async () => {
    h.userId = 'u_lin';
    const asked: string[] = [];
    const { world, rr, ingest } = mount({
      workspaces: [workspace('member', WS), workspace('member', WS2)],
      conceptWs: WS2,
      getSuggestions: async (workspaceId) => {
        asked.push(workspaceId);
        return workspaceId === WS2 ? [SUGGESTION_VIEW] : [];
      },
    });
    await addSecond(world, rr);
    await select(rr, SUGGESTION.ref);
    const confirm = await within(inspector()).findByRole('button', { name: 'Confirm' });
    expect(asked).toEqual([WS2]);
    await userEvent.setup().click(confirm);
    await waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    const events = ingest.mock.calls[0]![0];
    expect(events.map((e) => e.type)).toEqual(['concept.created', 'concept.item_tagged']);
    expect(events.map((e) => [e.workspaceId, e.actorId])).toEqual([
      [WS2, 'u_lin'],
      [WS2, 'u_lin'],
    ]);
    // control: the same lists, the suggestion drawn in WS: asking WS's list shows it is not there
    cleanup();
    asked.length = 0;
    const inWs = mount({ workspaces: [workspace('member', WS), workspace('member', WS2)], getSuggestions: async (workspaceId) => (asked.push(workspaceId), workspaceId === WS2 ? [SUGGESTION_VIEW] : []) });
    await select(inWs.rr, SUGGESTION.ref);
    await within(inspector()).findByText('This suggestion is no longer offered.');
    expect(asked).toEqual([WS]);
  });
});

describe('27.533 the concept inspector reveals nothing the server withheld (D4)', () => {
  it('27.533 control: a concept the server shows lists its visible item; the same concept answered 404 (it now holds an item this viewer cannot see) names no item: no label, key or count', async () => {
    const notFound = Object.assign(new Error(`GET /v1/concepts/${CONCEPT.id}: 404`), { status: 404 });
    let hidden = false;
    const { rr } = mount({
      getConcept: async () => {
        if (hidden) throw notFound;
        return conceptView();
      },
    });
    await select(rr, CONCEPT.ref);
    // control: the haystack holds the subject: the server's concept lists the visible item
    const panel = await within(inspector()).findByRole('region', { name: 'Concept Scroll position on phone sheets' });
    expect(within(panel).getByText('GN-7 Renew the trade licence')).toBeInTheDocument();
    // and the view's own store holds it too: the ring drew GN-7 and the tag edge into the concept
    expect(rr.drawnRefs()).toContain(VISIBLE.ref);
    hidden = true;
    await select(rr, VISIBLE.ref);
    await waitFor(() => expect(within(inspector()).getByRole('button', { name: 'Center on GN-7' })).toBeInTheDocument());
    await select(rr, CONCEPT.ref);
    await within(inspector()).findByText('This concept is no longer available to you.');
    const text = inspector().textContent ?? '';
    expect(text).not.toContain('GN-7');
    expect(text).not.toContain('Renew the trade licence');
    expect(within(inspector()).queryByRole('heading', { name: /^Items/ })).toBeNull();
    expect(inspector().querySelector('.gn-kg-badge')).toBeNull();
    expect(within(inspector()).queryByRole('button', { name: 'Remove from concept' })).toBeNull();
  });
});

import type { ComponentType } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import type { GraphEdgeView, GraphItemView, IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { KnowledgeGraphProps } from '@gisik-nokma/knowledge-graph';
import { Providers } from '../../src/providers.js';
import { PHONE_QUERY } from '../../src/use-is-phone.js';
import { stubServices } from '../helpers/stub-services.js';

/**
 * Knowledge Graph view plan, Task 9 (KG-C T9): the web's `GraphPanel`, cases 27.342 and 27.343. The view itself is
 * T7/T8's and is tested there; here it is a recording stand-in, reached through the panel's own `next/dynamic` loader
 * (so a loader that picked the wrong export would draw nothing).
 */
const h = vi.hoisted(() => ({ seen: [] as unknown[], push: vi.fn() }));
vi.mock('next/dynamic', async () => {
  const { createElement, lazy, Suspense } = await import('react');
  return {
    default: (load: () => Promise<ComponentType<object>>) => {
      const Lazy = lazy(() => load().then((component) => ({ default: component })));
      return (props: object) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
    },
  };
});
vi.mock('@gisik-nokma/knowledge-graph', () => ({
  KnowledgeGraph: (props: unknown) => {
    h.seen.push(props);
    return <div data-testid="kg-view" />;
  },
}));
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

const WS = '01J9WSGISIKNOKMA0000000000';
const SOURCE = '01J9TICKETSOURCE0000000000';
const TARGET = '01J9TICKETTARGET0000000000';

function workspace(over: Partial<WorkspaceRef>): WorkspaceRef {
  return { id: WS, name: 'Gisik Nokma', prefix: 'GN', role: 'member', archived: false, memberCount: null, nameRestrictedProjectCount: 0, projects: [], ...over } as WorkspaceRef;
}
const WORKSPACES: WorkspaceRef[] = [
  workspace({
    projects: [
      { id: 'p_live', name: 'Mobile web', archived: false },
      { id: 'p_old', name: 'Retired', archived: true },
    ] as WorkspaceRef['projects'],
  }),
  workspace({ id: 'ws_archived', name: 'Old studio', archived: true }),
];

const last = (): KnowledgeGraphProps => h.seen.at(-1) as KnowledgeGraphProps;
const item = (kind: GraphItemView['kind'], id: string, workspaceId: string | null = WS): GraphItemView =>
  ({ ref: `${kind}:${id}`, kind, id, workspaceId, projectId: null, label: id, title: null, category: null, hop: 1, out: false, suggested: false }) as GraphItemView;
const edge = (from: string, to: string): GraphEdgeView =>
  ({ id: `blocks|ticket:${from}|ticket:${to}`, kind: 'blocks', from: `ticket:${from}`, to: `ticket:${to}`, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false }) as GraphEdgeView;

function setPhone(phone: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: phone && query === PHONE_QUERY, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

function mount(opts: { centre?: string; ingest?: (events: SubmittedEvent[]) => Promise<IngestResult[]>; getMyWorkspaces?: () => Promise<WorkspaceRef[]>; onOpenTicket?: (id: string) => void } = {}) {
  const services = stubServices({ getMyWorkspaces: opts.getMyWorkspaces ?? (async () => WORKSPACES) });
  if (opts.ingest !== undefined) services.dataSource.ingest = opts.ingest;
  render(
    <Providers services={services}>
      <GraphPanel centre={opts.centre ?? `ticket:${SOURCE}`} workspaceId={WS} onOpenTicket={opts.onOpenTicket} />
    </Providers>,
  );
  return services;
}

beforeEach(() => {
  cleanup();
  h.seen.length = 0;
  h.push.mockClear();
  setPhone(false);
});

describe('GraphPanel (KG-C T9)', () => {
  it('27.342 hands the view the app\'s own gateway, the host\'s workspace and the viewer\'s live scope; desktop by default; control: the phone query makes it the phone view', async () => {
    const services = mount();
    await screen.findByTestId('kg-view');
    expect(last().source).toBe(services.graph);
    expect(last().defaultWorkspaceIds).toEqual([WS]);
    expect(last().centre).toBe(`ticket:${SOURCE}`);
    // The archived workspace and the archived project are not offered.
    expect(last().scope).toEqual({ workspaces: [{ id: WS, name: 'Gisik Nokma', projects: [{ id: 'p_live', name: 'Mobile web' }] }] });
    expect(last().config).toBe('desktop');

    // CONTROL, same it: under the phone query the same panel is the phone view.
    cleanup();
    h.seen.length = 0;
    setPhone(true);
    mount();
    await screen.findByTestId('kg-view');
    expect(last().config).toBe('phone');
  });

  it('27.342 opens each kind on its own page, and offers Open only where there is one', async () => {
    const onOpenTicket = vi.fn();
    mount({ onOpenTicket });
    await screen.findByTestId('kg-view');
    const { onOpen, canOpen } = last();
    onOpen(item('ticket', 'T1'));
    expect(onOpenTicket).toHaveBeenCalledWith('T1');
    onOpen(item('note', 'N1'));
    onOpen(item('project', 'P1'));
    onOpen(item('workspace', 'W1', null));
    onOpen(item('project', 'P2', null)); // a project with no workspace has no page to go to
    onOpen(item('person', 'U1', null));
    expect(h.push.mock.calls).toEqual([['/notes/N1'], [`/w/${WS}/p/P1`], ['/w/W1']]);
    expect(['ticket', 'note', 'project', 'workspace', 'person', 'concept'].map((kind) => canOpen!(item(kind as GraphItemView['kind'], 'x')))).toEqual([true, true, true, true, false, false]);

    // CONTROL, same it: a host with no ticket opener (the note panel) gets no Open on a ticket, and the rest stand.
    cleanup();
    h.seen.length = 0;
    mount();
    await screen.findByTestId('kg-view');
    expect(['ticket', 'note'].map((kind) => last().canOpen!(item(kind as GraphItemView['kind'], 'x')))).toEqual([false, true]);
  });

  it('27.342 shows the loading box until the scope read answers, and a refused read as the shell\'s refusal; control: an answer mounts the view', async () => {
    let answer!: (list: WorkspaceRef[]) => void;
    mount({ getMyWorkspaces: () => new Promise<WorkspaceRef[]>((resolve) => (answer = resolve)) });
    expect(screen.getByText('Loading the Knowledge Graph').closest('.gn-kg-panel--loading')).not.toBeNull();
    expect(screen.queryByTestId('kg-view')).toBeNull();
    await act(async () => answer(WORKSPACES));
    await screen.findByTestId('kg-view');
    expect(screen.queryByText('Loading the Knowledge Graph')).toBeNull();

    cleanup();
    mount({ getMyWorkspaces: async () => Promise.reject(new Error('HTTP 500 for /v1/me/workspaces')) });
    expect(await screen.findByText('HTTP 500 for /v1/me/workspaces')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your workspaces');
    expect(screen.queryByTestId('kg-view')).toBeNull();
    expect(screen.queryByText('Loading the Knowledge Graph')).toBeNull();
  });

  it('27.343 Remove link files ONE ticket.link_removed on the source\'s stream, Undo one ticket.link_added, a refusal throws its rule and reason; control: removed while viewing the TARGET, it still writes on the source', async () => {
    const ingest = vi.fn(async (_events: SubmittedEvent[]): Promise<IngestResult[]> => [{ status: 'committed', eventId: 'e1', seq: 1, serverTime: '2026-10-06T00:00:00.000Z' }]);
    mount({ ingest });
    await screen.findByTestId('kg-view');
    const { undo } = await last().onRemoveLink!(edge(SOURCE, TARGET));
    expect(ingest).toHaveBeenCalledTimes(1);
    const [removed] = ingest.mock.calls[0]![0];
    expect(ingest.mock.calls[0]![0]).toHaveLength(1);
    expect(removed).toEqual(expect.objectContaining({ workspaceId: WS, entity: { kind: 'ticket', id: SOURCE }, type: 'ticket.link_removed', actorId: 'u_kiro', origin: 'web' }));
    expect(removed!.payload).toEqual({ kind: 'blocks', targetId: TARGET });

    await undo();
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(ingest.mock.calls[1]![0]).toHaveLength(1);
    const [added] = ingest.mock.calls[1]![0];
    expect(added).toEqual(expect.objectContaining({ entity: { kind: 'ticket', id: SOURCE }, type: 'ticket.link_added' }));
    expect(added!.payload).toEqual({ kind: 'blocks', targetId: TARGET });

    // A refusal reaches the inspector as the server's own rule and reason; an invalid event as its message.
    ingest.mockResolvedValueOnce([{ status: 'refused', eventId: 'e2', rule: 'link-permission', reason: 'only a member of both projects may unlink' }]);
    await expect(last().onRemoveLink!(edge(SOURCE, TARGET))).rejects.toThrow(new Error('refused by link-permission: only a member of both projects may unlink'));
    ingest.mockResolvedValueOnce([{ status: 'invalid', eventId: null, code: 'invalid_payload', message: 'targetId must be a ticket' } as IngestResult]);
    await expect(last().onRemoveLink!(edge(SOURCE, TARGET))).rejects.toThrow(new Error('targetId must be a ticket'));

    // CONTROL, same it: centred on the TARGET, the same edge still writes on the SOURCE's stream.
    cleanup();
    h.seen.length = 0;
    ingest.mockClear();
    mount({ ingest, centre: `ticket:${TARGET}` });
    await screen.findByTestId('kg-view');
    await last().onRemoveLink!(edge(SOURCE, TARGET));
    expect(ingest.mock.calls[0]![0][0]).toEqual(expect.objectContaining({ entity: { kind: 'ticket', id: SOURCE }, type: 'ticket.link_removed' }));
    await waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
  });
});

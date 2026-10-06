import type { ComponentType } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSourceQuery, ProjectRef, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { ConceptSummary, IngestResult, NoteDetail, SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { PHONE_QUERY } from '../src/use-is-phone.js';
import { stubServices } from './helpers/stub-services.js';

/*
 * Knowledge Graph spec D §6 (KG-D Task 9): the note half of 27.543 and 27.544, and the note host's 27.549 legs. The
 * harness is `knowledge-graph/note-graph.test.tsx`'s (27.345: the mocks, the note, `stubServices`), and the phone
 * viewport is `note-byline-phone.test.tsx`'s `stubViewport`, narrowed to `PHONE_QUERY` so only the phone arm switches.
 */
const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/dynamic', async () => {
  const { createElement, lazy, Suspense } = await import('react');
  return {
    default: (load: () => Promise<ComponentType<object>>) => {
      const Lazy = lazy(() => load().then((component) => ({ default: component })));
      return (props: object) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
    },
  };
});
vi.mock('@gisik-nokma/knowledge-graph', () => ({ KnowledgeGraph: () => <div data-testid="kg-view" /> }));
// The note editor is not this case's subject: a null slot keeps Tiptap out of the run.
vi.mock('@gisik-nokma/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gisik-nokma/editor')>()),
  TicketEditorSlot: () => null,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NoteDocument } from '../src/notes/note-document.js';

const WS = '01J9WSLOGISTICS000000000000';
const PROJECT = '01J9PCOLDROOM00000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const WS_REF: WorkspaceRef = {
  id: WS,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 1,
  nameRestrictedProjectCount: 0,
  projects: [{ id: PROJECT, name: 'Cold room', prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 } as ProjectRef],
};
const MEMBERS: RosterMember[] = [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }];
const DETAIL: NoteDetail = {
  noteId: NOTE,
  workspaceId: WS,
  homeProjectId: PROJECT,
  authorId: 'u_kiro',
  title: 'Compressor log',
  scope: { mode: 'private' },
  attachedTickets: [],
  deleted: false,
  createdAt: '2026-09-23T06:00:00.000Z',
  updatedAt: '2026-09-23T06:00:00.000Z',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compressor stopped' }] }] },
  schemaVersion: 2,
};
const CP: ConceptSummary = { id: '01J9CONCEPTCOLDCHAIN000000', name: 'Cold chain', summary: '', itemCount: 3, createdBy: 'u_kiro', origin: 'web' };

function stubViewport(phone: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ matches: media === PHONE_QUERY ? phone : false, media, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

function mount(opts: { role?: WorkspaceRef['role']; getItemConcepts?: DataSourceQuery['getItemConcepts']; ingest?: (events: SubmittedEvent[]) => Promise<IngestResult[]> } = {}) {
  const getItemConcepts = vi.fn(opts.getItemConcepts ?? (async () => [CP]));
  const ws = { ...WS_REF, role: opts.role ?? 'owner' };
  const services = stubServices({
    getMyWorkspaces: async () => [ws],
    getNote: async (_ws: string, id: string) => (id === NOTE ? DETAIL : null),
    getMembers: async () => MEMBERS,
    getActorNames: async () => [],
    getNotes: async () => [],
    getDeletedNotes: async () => [],
    getItemConcepts,
  });
  if (opts.ingest !== undefined) services.dataSource.ingest = opts.ingest;
  render(
    <Providers services={services}>
      <NoteDocument noteId={NOTE} workspaces={[ws]} />
    </Providers>,
  );
  return { getItemConcepts, user: userEvent.setup() };
}
const row = () => document.querySelector<HTMLElement>('.gn-concepts-row');
const byline = () => document.querySelector<HTMLElement>('.gn-notes__byline');

beforeEach(() => {
  cleanup();
  h.push.mockClear();
});
afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('27.543 the note page mounts the Concepts row', () => {
  it('27.543 the row reads the note\'s concepts as a note, and sits directly under the byline', async () => {
    const { getItemConcepts } = mount();
    await waitFor(() => expect(row()).not.toBeNull());
    expect(getItemConcepts).toHaveBeenCalledWith(WS, { kind: 'note', id: NOTE });
    expect(within(row()!).getByRole('button', { name: `Remove from concept ${CP.name}` })).toBeInTheDocument();
    expect(byline()!.nextElementSibling).toBe(row());
  });

  it('27.543 a refused Remove puts the pill back and shows the server\'s reason in the page\'s refusal line', async () => {
    const reason = 'You cannot see every item in this concept.';
    const ingest = vi.fn(async (events: SubmittedEvent[]): Promise<IngestResult[]> => [{ status: 'refused', eventId: events[0]!.id, rule: 'concept.hidden_item', reason }]);
    const { user } = mount({ ingest });
    await waitFor(() => expect(row()).not.toBeNull());
    expect(screen.queryByText(reason)).toBeNull();
    await user.click(screen.getByRole('button', { name: `Remove from concept ${CP.name}` }));
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]![0][0]).toMatchObject({ entity: { kind: 'concept', id: CP.id }, type: 'concept.item_untagged', payload: { itemKind: 'note', itemId: NOTE }, actorId: 'u_kiro', origin: 'web' });
    const line = await screen.findByText(reason);
    expect(line).toHaveAttribute('role', 'alert');
    expect(line).toHaveClass('gn-refusal', 'gn-refusal--server');
    expect(within(row()!).getByRole('button', { name: `Remove from concept ${CP.name}` })).toBeInTheDocument();
  });
});

describe('27.544 the phone note page', () => {
  it('27.544 at phone width the row is drawn, as a sibling of the byline', async () => {
    stubViewport(true);
    mount();
    await waitFor(() => expect(row()).not.toBeNull());
    // precondition: the phone arm is the one drawn (the byline's actions fold into one menu, case 21.131)
    expect(within(byline()!).queryByRole('button', { name: 'Knowledge Graph' })).toBeNull();
    expect(row()!.parentElement).toBe(byline()!.parentElement);
  });
});

describe('27.549 the note host\'s edges', () => {
  it('27.549 a guest sees the note\'s concepts with no remove button; CONTROL: an owner has one', async () => {
    mount({ role: 'guest' });
    await waitFor(() => expect(row()).not.toBeNull());
    expect(within(row()!).getByText(CP.name)).toBeInTheDocument();
    expect(within(row()!).queryByRole('button', { name: /^Remove from concept/ })).toBeNull();
    cleanup();
    mount({ role: 'owner' });
    await waitFor(() => expect(row()).not.toBeNull());
    expect(within(row()!).getByRole('button', { name: `Remove from concept ${CP.name}` })).toBeInTheDocument();
  });

  it('27.549 the concept\'s name opens the note\'s Knowledge Graph', async () => {
    const { user } = mount();
    await waitFor(() => expect(row()).not.toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Knowledge Graph' })).toBeNull();
    await user.click(within(row()!).getByRole('button', { name: CP.name }));
    const dialog = screen.getByRole('dialog', { name: 'Knowledge Graph' });
    await act(async () => within(dialog).findByTestId('kg-view'));
  });
});

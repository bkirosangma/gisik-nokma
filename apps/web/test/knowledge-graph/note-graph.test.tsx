import type { ComponentType } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRef, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { GraphItemView, NoteDetail } from '@gisik-nokma/domain';
import type { KnowledgeGraphProps } from '@gisik-nokma/knowledge-graph';
import { Providers } from '../../src/providers.js';
import { stubServices } from '../helpers/stub-services.js';

/** Knowledge Graph view plan, Task 9 (KG-C T9): the note's Knowledge Graph panel, opened from its byline, case 27.345. */
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
vi.mock('../../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NoteDocument } from '../../src/notes/note-document.js';

const WS = '01J9WSLOGISTICS000000000000';
const PROJECT = '01J9PCOLDROOM00000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const TICKET = '01J9TICKET00000000000000000';
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
const last = (): KnowledgeGraphProps => h.seen.at(-1) as KnowledgeGraphProps;

beforeEach(() => {
  cleanup();
  h.seen.length = 0;
  h.push.mockClear();
});

describe('the note\'s Knowledge Graph panel (KG-C T9)', () => {
  it('27.345 Knowledge Graph in the byline opens a dialog of that name with the graph centred on the note, and closing it unmounts the graph; control: before the click no graph is mounted', async () => {
    const user = userEvent.setup();
    const services = stubServices({
      getMyWorkspaces: async () => [WS_REF],
      getNote: async (_ws: string, id: string) => (id === NOTE ? DETAIL : null),
      getMembers: async () => MEMBERS,
      getActorNames: async () => [],
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    render(
      <Providers services={services}>
        <NoteDocument noteId={NOTE} workspaces={[WS_REF]} />
      </Providers>,
    );
    const open = await screen.findByRole('button', { name: 'Knowledge Graph' });
    // CONTROL: the graph costs nothing until it is asked for.
    expect(screen.queryByRole('dialog', { name: 'Knowledge Graph' })).toBeNull();
    expect(screen.queryByTestId('kg-view')).toBeNull();
    expect(h.seen).toHaveLength(0);

    await user.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Knowledge Graph' });
    await within(dialog).findByTestId('kg-view');
    expect(last().centre).toBe(`note:${NOTE}`);
    expect(last().defaultWorkspaceIds).toEqual([WS]);
    expect(last().onAddLink).toBeUndefined();

    await user.click(within(dialog).getByRole('button', { name: 'Close sheet' }));
    expect(screen.queryByRole('dialog', { name: 'Knowledge Graph' })).toBeNull();
    expect(screen.queryByTestId('kg-view')).toBeNull();

    // A ticket opened from the graph closes the panel and opens on this page, as a badge does.
    await user.click(screen.getByRole('button', { name: 'Knowledge Graph' }));
    await screen.findByTestId('kg-view');
    last().onOpen({ ref: `ticket:${TICKET}`, kind: 'ticket', id: TICKET } as GraphItemView);
    expect(h.push).toHaveBeenCalledWith(`/notes/${NOTE}?ticket=${TICKET}`, { scroll: false });
    expect(await screen.findByRole('button', { name: 'Knowledge Graph' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Knowledge Graph' })).toBeNull();
  });
});

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSourceQuery, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail, SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Case 25.357 — a NEW note opens straight in edit mode, through the REAL door (smoothness G-3, FIX 1 F2).
 *
 * 25.343 marks the note by hand with `markNoteAsNew`, which leaves the call in `NotesPage`'s `onCreated` untested:
 * delete it and every note, new ones included, opens read-only with the title still empty. This drives the Create
 * dialog, takes the id the ledger received and the route the page pushed, and mounts THAT route's note.
 */
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
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

import { NotesPage } from '../src/notes/notes-page.js';

const WS = '01J9WSLOGISTICS000000000000';
const WORKSPACE: WorkspaceRef = {
  id: WS,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 1,
  nameRestrictedProjectCount: 0,
  projects: [],
};

function created(noteId: string): NoteDetail {
  return {
    noteId,
    workspaceId: WS,
    homeProjectId: '',
    authorId: 'u_kiro',
    title: 'Cold room audit',
    scope: { mode: 'private' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-10-02T09:00:00.000Z',
    updatedAt: '2026-10-02T09:00:00.000Z',
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    schemaVersion: 2,
  };
}

function world(ingested: SubmittedEvent[]) {
  const services = stubServices({
    getMyWorkspaces: async () => [WORKSPACE],
    getMembers: async () => [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }],
    getNote: async (_workspaceId: string, id: string) => (ingested.some((event) => event.entity.id === id) ? created(id) : null),
    getNotes: async () => [],
    getDeletedNotes: async () => [],
    getNoteComments: async () => [],
    getActorNames: async () => [],
  } as Partial<DataSourceQuery>);
  services.dataSource.ingest = async (events: SubmittedEvent[]) => {
    ingested.push(...events);
    return events.map((event) => ({
      status: 'committed' as const,
      eventId: event.id,
      seq: 1,
      serverTime: '2026-10-02T09:00:00.000Z',
    }));
  };
  return services;
}

beforeEach(() => {
  cleanup();
  routerPush.mockClear();
  window.localStorage.clear();
});
afterEach(cleanup);

describe('G-3 FIX 1: a note made through the Create dialog opens in edit', () => {
  it('25.357 create a note on the page, open the route it pushed: EDIT (Done, a live editor); open it again: READ', async () => {
    const user = userEvent.setup();
    const ingested: SubmittedEvent[] = [];
    const services = world(ingested);
    render(
      <Providers services={services}>
        <NotesPage />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Create note' }));
    await user.type(await screen.findByLabelText('Title'), 'Cold room audit');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(ingested).toHaveLength(1));
    const noteId = ingested[0]!.entity.id;
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith(`/notes/${noteId}`));

    // The route the page pushed mounts that note: it opens to WRITE, not read.
    cleanup();
    const first = render(
      <Providers services={services}>
        <NotesPage noteId={noteId} />
      </Providers>,
    );
    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit note' })).toBeNull();
    await waitFor(() => expect(first.container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('true'));
    expect(screen.getByTestId('note-title')).toHaveAttribute('contenteditable', 'true');

    // CONTROL, same it(): the mark is spent on that first open — the next open of the same note is READ.
    cleanup();
    const second = render(
      <Providers services={services}>
        <NotesPage noteId={noteId} />
      </Providers>,
    );
    expect(await screen.findByRole('button', { name: 'Edit note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    await waitFor(() => expect(second.container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false'));
  });
});

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientStreamFrame, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.221–18.223 — the drawn states spec §9.6–9.7 names beyond what
 * earlier tasks already cover (a saved-vs-unsaved indicator is Task 5's, a
 * search-empty state is Task 8's): losing access to an open note, a note
 * deleted under you, and an unreadable wiki-link target.
 */
const routerReplace = vi.fn();
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));

let mockSessionUser: { id: string; name: string; email?: string } = {
  id: 'u_kiro',
  name: 'Kiro',
  email: 'kiro@example.com',
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NotesPage } from '../src/notes/notes-page.js';

const WS_A = '01J9WSLOGISTICS000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const OTHER_NOTE = '01J9NOTEOTHER00000000000000';

const WS_A_REF: WorkspaceRef = {
  id: WS_A,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [],
};

const MEMBERS: RosterMember[] = [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }];

function body(content: unknown[]) {
  return { type: 'doc', content };
}

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function noteDetail(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    noteId: NOTE,
    workspaceId: WS_A,
    homeProjectId: '',
    authorId: 'u_kiro',
    title: 'Compressor log',
    scope: { mode: 'private' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-09-23T06:00:00.000Z',
    updatedAt: '2026-09-23T06:00:00.000Z',
    body: body([paragraph('Compressor stopped')]),
    schemaVersion: 2,
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  routerReplace.mockClear();
  routerPush.mockClear();
  mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('18.221-18.223 the drawn states', () => {
  /**
   * 18.221 — a note that stops being readable navigates away and shows the
   * toast; control: a note that stays readable does neither.
   *
   * `/notes` and `/notes/[noteId]` are TWO route files, so `router.replace`
   * REMOUNTS `NotesPage` rather than merely re-rendering it — the second
   * `render()` below, of a FRESH `<NotesPage />` with no `noteId`, is that
   * remount, and the toast must survive it via the module-level flash
   * `notes-page.tsx` documents. A single mocked-router render would pass
   * even if that flash were missing — REAL timers because the subscribe
   * callback below drives `useLiveQuery`'s own 200 ms reload debounce, and
   * `findBy*`/`waitFor` do not mix with fake ones (Task 8's own lesson).
   *
   * Mutation: stay — `onLostAccess` never fires, so neither `router.replace`
   * nor the toast happens.
   */
  it('18.221 losing access to an open note navigates to /notes and shows the toast', async () => {
    let readable = true;
    // EVERY subscriber, not just one: `NotesPage` mounts BOTH `NoteDocument`
    // (the note's own `note:<id>` query) and `WorkspaceNotesSection` (the
    // tree's `notes`/`deleted-notes` queries) on the SAME `dataSource`, and
    // each opens its own `subscribe` call. A single captured callback would
    // silently be the WRONG one as often as the right one; a real stream
    // notifies every open subscription, so this broadcasts to all of them,
    // same as the real thing does.
    const subscribers: Array<(item: ClientStreamFrame) => void> = [];

    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getNote: async (_workspaceId: string, id: string) =>
        id === NOTE && readable ? noteDetail() : null,
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    services.dataSource.subscribe = (_workspaceId, _afterSeq, cb) => {
      subscribers.push(cb);
      return () => {};
    };

    render(
      <Providers services={services}>
        <NotesPage noteId={NOTE} />
      </Providers>,
    );
    await screen.findByTestId('note-document');
    expect(routerReplace).not.toHaveBeenCalled();

    readable = false;
    await act(async () => {
      for (const cb of subscribers) cb({ type: 'refresh', workspaceId: WS_A });
    });
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/notes'), { timeout: 2000 });

    // The route swap: `NotesPage` unmounts here and a FRESH instance mounts —
    // the shape `router.replace` actually produces (a different route file),
    // not a re-render of the one we already have.
    cleanup();
    render(
      <Providers services={services}>
        <NotesPage />
      </Providers>,
    );
    expect(await screen.findByText('That note is no longer shared with you')).toBeInTheDocument();

    // CONTROL — a note that stays readable: neither the navigation nor the
    // toast fires just because a stream frame arrived.
    cleanup();
    routerReplace.mockClear();
    readable = true;
    const subscribers2: Array<(item: ClientStreamFrame) => void> = [];
    const services2 = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getNote: async (_workspaceId: string, id: string) => (id === NOTE ? noteDetail() : null),
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    services2.dataSource.subscribe = (_workspaceId, _afterSeq, cb) => {
      subscribers2.push(cb);
      return () => {};
    };
    render(
      <Providers services={services2}>
        <NotesPage noteId={NOTE} />
      </Providers>,
    );
    await screen.findByTestId('note-document');
    await act(async () => {
      for (const cb of subscribers2) cb({ type: 'refresh', workspaceId: WS_A });
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-document')).toBeInTheDocument();
  });

  /**
   * 18.222 — a note deleted under you: the banner, and who gets which button.
   *
   * Mutation: show Restore to readers — the reader arm (a plain member, not
   * the author) would see the editor's control instead of Back.
   */
  it('18.222 a note deleted under you shows the banner with Restore for an editor and Back for a reader', async () => {
    const user = userEvent.setup();
    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getNote: async (_workspaceId: string, id: string) =>
        id === NOTE ? noteDetail({ deleted: true }) : null,
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    render(
      <Providers services={services}>
        <NotesPage noteId={NOTE} />
      </Providers>,
    );
    expect(await screen.findByText('This note was deleted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    // The editor itself is read-only while deleted, even for its own author.
    await waitFor(() =>
      expect(screen.getByTestId('note-editor').querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe(
        'false',
      ),
    );

    // CONTROL — a plain member who is not the author: Back, not Restore.
    cleanup();
    mockSessionUser = { id: 'u_ana', name: 'Anselma Marak', email: 'ana@example.com' };
    const readerServices = stubServices({
      getMyWorkspaces: async () => [{ ...WS_A_REF, role: 'member' }],
      getNote: async (_workspaceId: string, id: string) =>
        id === NOTE ? noteDetail({ deleted: true, authorId: 'u_kiro' }) : null,
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    render(
      <Providers services={readerServices}>
        <NotesPage noteId={NOTE} />
      </Providers>,
    );
    expect(await screen.findByText('This note was deleted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(routerPush).toHaveBeenCalledWith('/notes');
  });

  /**
   * 18.223 — an unreadable wiki-link target renders the red pill on THIS
   * page — proving the wiring, not the editor's own rendering rule (Plan 4
   * already proves that).
   *
   * Two links, so the mutation is falsifiable: one to the OPEN note itself
   * (resolvable — the control) and one to an id nothing holds. A mutation
   * that always resolves (`resolveNoteTitle: () => 'x'`) would make BOTH
   * links draw as live text; only the real wiring keeps the first one true
   * and the second one a pill.
   */
  it('18.223 an unreadable wiki-link target renders the red pill; a readable one still links', async () => {
    const UNKNOWN = '01J9NUNKNOWN000000000000000';
    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getNote: async (_workspaceId: string, id: string) =>
        id === NOTE
          ? noteDetail({
              body: body([
                paragraph('See '),
                { type: 'wikiLink', attrs: { noteId: NOTE, title: 'Compressor log' } },
                { type: 'wikiLink', attrs: { noteId: UNKNOWN, title: 'Old title' } },
              ]),
            })
          : null,
      getMembers: async () => MEMBERS,
      getNotes: async () => [{ ...noteDetail(), noteId: OTHER_NOTE, title: 'Cold room audit' }],
      getDeletedNotes: async () => [],
    });
    const { container } = render(
      <Providers services={services}>
        <NotesPage noteId={NOTE} />
      </Providers>,
    );
    await screen.findByTestId('note-document');

    // The OPEN note resolves itself (`resolveNoteTitle(note.noteId) === note.title`).
    await waitFor(() => expect(container.querySelector('a.editor-wikilink')).not.toBeNull());
    const live = container.querySelector('a.editor-wikilink');
    expect(live?.textContent).toBe('Compressor log');

    // The UNKNOWN id: the missing pill, not a link.
    const pill = container.querySelector('.editor-wikilink--missing');
    expect(pill).not.toBeNull();
    expect(pill?.tagName).toBe('SPAN');
    expect(pill?.getAttribute('href')).toBeNull();
    expect(pill?.textContent).toBe('Old title');
  });
});

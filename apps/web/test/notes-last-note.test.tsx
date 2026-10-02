import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_PHONE_QUERY } from '@gisik-nokma/app-core';
import type { DataSourceQuery, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { lastNoteKey, lastWorkspaceKey } from '../src/notes/last-note.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 25.350–25.354 — the last note opened is remembered per device (smoothness G-3 addendum).
 *
 * Key: `gn-last-note:<userId>:<workspaceId>` = note id. Two workspaces (A holds NOTE_A, B holds NOTE_B) so a
 * key can be wrong in more than one way: the wrong workspace's note, the wrong user's key, a deleted note.
 */
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
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

const WS_A = '01J9WSLOGISTICS000000000000';
const WS_B = '01J9WSQUIET0000000000000000';
const NOTE_A = '01J9NOTECOLDROOM000000000000';
const NOTE_B = '01J9NOTEQUIET0000000000000';
const NOTE_GONE = '01J9NOTEGONE00000000000000';
const NOTE_DELETED = '01J9NOTEDELETED000000000000';
const NOTE_THROWS = '01J9NOTETHROWS0000000000000';

function ws(id: string, name: string): WorkspaceRef {
  return {
    id,
    name,
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
  };
}

function detail(noteId: string, workspaceId: string, title: string, deleted = false): NoteDetail {
  return {
    noteId,
    workspaceId,
    homeProjectId: '',
    authorId: 'u_kiro',
    title,
    scope: { mode: 'workspace' },
    attachedTickets: [],
    deleted,
    createdAt: '2026-09-23T06:00:00.000Z',
    updatedAt: '2026-09-23T06:00:00.000Z',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Body of ${title}` }] }] },
    schemaVersion: 2,
  };
}

const NOTES: Record<string, NoteDetail> = {
  [NOTE_A]: detail(NOTE_A, WS_A, 'Compressor log'),
  [NOTE_B]: detail(NOTE_B, WS_B, 'Quiet corner plan'),
  [NOTE_DELETED]: detail(NOTE_DELETED, WS_A, 'Old plan', true),
};

function summaryOf(note: NoteDetail) {
  const { body: _body, schemaVersion: _schema, ...rest } = note;
  return rest;
}

function world() {
  return stubServices(
    {
      getMyWorkspaces: async () => [ws(WS_A, 'Garo Hills Logistics'), ws(WS_B, 'Quiet Corner')],
      getMembers: async () => [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }],
      // The read is per WORKSPACE: a key naming a note under the wrong workspace must not resolve.
      getNote: async (workspaceId: string, id: string) => {
        if (id === NOTE_THROWS) throw new Error('offline'); // a read that FAILS, as opposed to one that answers null
        const note = NOTES[id];
        return note !== undefined && note.workspaceId === workspaceId ? note : null;
      },
      getNotes: async (workspaceId: string) =>
        Object.values(NOTES)
          .filter((note) => note.workspaceId === workspaceId && !note.deleted)
          .map(summaryOf),
      getDeletedNotes: async () => [],
      getNoteComments: async () => [],
      getActorNames: async () => [],
    } as Partial<DataSourceQuery>,
    { notifications: { unreadCount: async () => 0, list: async () => ({ notifications: [], nextCursor: null }) } },
  );
}

function renderPage(noteId?: string) {
  return render(
    <Providers services={world()}>
      <NotesPage {...(noteId === undefined ? {} : { noteId })} />
    </Providers>,
  );
}

function stubPhone(on: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: on
      ? (query: string) => ({
          matches: query === HELP_PHONE_QUERY,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        })
      : undefined,
  });
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 60));

beforeEach(() => {
  cleanup();
  replace.mockClear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  stubPhone(false);
  vi.restoreAllMocks();
});

describe('G-3 addendum: the last note opened, per device', () => {
  it('25.350 opening a note writes gn-last-note:<user>:<workspace> = its id — reading or editing — under no other key', async () => {
    renderPage(NOTE_A);
    await screen.findByRole('button', { name: 'Edit note' });
    await waitFor(() => expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBe(NOTE_A));
    expect(lastNoteKey('u_kiro', WS_A)).toBe(`gn-last-note:u_kiro:${WS_A}`);
    // A different workspace has its own key, a different user has theirs: neither was touched.
    expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_B))).toBeNull();
    expect(window.localStorage.getItem(lastNoteKey('u_other', WS_A))).toBeNull();
    // Opening the other workspace's note writes ITS key and leaves the first alone.
    cleanup();
    renderPage(NOTE_B);
    await waitFor(() => expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_B))).toBe(NOTE_B));
    expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBe(NOTE_A);
    // CONTROL: a deleted note is not remembered.
    window.localStorage.clear();
    cleanup();
    renderPage(NOTE_DELETED);
    await screen.findByTestId('note-deleted-banner');
    await settle();
    expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBeNull();
  });

  it('25.351 re-entering the Notes area resumes the remembered note; the note then opens read-only', async () => {
    renderPage(NOTE_A);
    await waitFor(() => expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBe(NOTE_A));
    cleanup(); // leave
    renderPage(); // re-enter: /notes with no id
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/notes/${NOTE_A}`));
    // The route the replace names mounts the note, and a note opens to READ.
    cleanup();
    const { container } = renderPage(NOTE_A);
    await screen.findByRole('button', { name: 'Edit note' });
    await waitFor(() => expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false'));

    // A different workspace has its own key: only WS_B's key set, and it is B's note that is resumed.
    window.localStorage.clear();
    replace.mockClear();
    cleanup();
    window.localStorage.setItem(lastNoteKey('u_kiro', WS_B), NOTE_B);
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/notes/${NOTE_B}`));

    // CONTROL: nothing remembered, nothing resumed; another user's key is not ours.
    window.localStorage.clear();
    replace.mockClear();
    cleanup();
    window.localStorage.setItem(lastNoteKey('u_other', WS_A), NOTE_A);
    renderPage();
    await screen.findByRole('navigation', { name: 'Notes' });
    await settle();
    expect(replace).not.toHaveBeenCalled();
  });

  it('25.352 a remembered note that is gone, deleted, or in the wrong workspace is ignored, its key cleared, the list shown', async () => {
    for (const [workspaceId, noteId] of [
      [WS_A, NOTE_GONE],
      [WS_A, NOTE_DELETED],
      [WS_B, NOTE_A], // exists, but not under the workspace the key names
    ] as const) {
      window.localStorage.clear();
      replace.mockClear();
      window.localStorage.setItem(lastNoteKey('u_kiro', workspaceId), noteId);
      renderPage();
      const tree = await screen.findByRole('navigation', { name: 'Notes' });
      await waitFor(() => expect(window.localStorage.getItem(lastNoteKey('u_kiro', workspaceId))).toBeNull());
      expect(replace).not.toHaveBeenCalled();
      expect(await within(tree).findByTestId(`note-row-${NOTE_A}`)).toBeInTheDocument();
      expect(screen.queryByText('That note is no longer shared with you.')).toBeNull();
      cleanup();
    }
    // A read that THROWS (the network, not an answer) keeps the key: a flaky connection must not erase a good memory.
    // The `null` answers above are the control: those DO clear.
    window.localStorage.clear();
    replace.mockClear();
    window.localStorage.setItem(lastNoteKey('u_kiro', WS_A), NOTE_THROWS);
    renderPage();
    const flaky = await screen.findByRole('navigation', { name: 'Notes' });
    expect(await within(flaky).findByTestId(`note-row-${NOTE_A}`)).toBeInTheDocument();
    await settle();
    expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBe(NOTE_THROWS);
    expect(replace).not.toHaveBeenCalled();
    cleanup();
    // CONTROL: a readable remembered note is NOT cleared.
    window.localStorage.clear();
    window.localStorage.setItem(lastNoteKey('u_kiro', WS_A), NOTE_A);
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/notes/${NOTE_A}`));
    expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBe(NOTE_A);
  });

  it('25.353 storage that throws behaves as before: the list shows, the note opens, nothing is resumed or broken', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    renderPage();
    const tree = await screen.findByRole('navigation', { name: 'Notes' });
    expect(await within(tree).findByTestId(`note-row-${NOTE_A}`)).toBeInTheDocument();
    await settle();
    expect(replace).not.toHaveBeenCalled();
    cleanup();
    renderPage(NOTE_A);
    expect(await screen.findByRole('button', { name: 'Edit note' })).toBeInTheDocument();
    expect(screen.getByTestId('note-title')).toHaveTextContent('Compressor log');
    // CONTROL: the stubs were reached, so "nothing broke" is not "nothing ran".
    expect(getItem).toHaveBeenCalled();
    await waitFor(() => expect(setItem).toHaveBeenCalled());
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('25.354 on a phone the list stays: no forced reading pane, the remembered note marked current', async () => {
    stubPhone(true);
    window.localStorage.setItem(lastNoteKey('u_kiro', WS_A), NOTE_A);
    renderPage();
    const panel = await screen.findByTestId('notes-panel');
    const row = await within(panel).findByTestId(`note-row-${NOTE_A}`);
    await waitFor(() => expect(row).toHaveAttribute('aria-current', 'page'));
    expect(panel).toHaveAttribute('data-panel-open', 'true');
    await settle();
    expect(replace).not.toHaveBeenCalled();
    // Only the remembered one is current in the list (the app nav's own "Notes" link is current too).
    expect(panel.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    // CONTROL, same it(): a desktop viewport DOES open it directly.
    cleanup();
    stubPhone(false);
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/notes/${NOTE_A}`));
  });

  it('25.354 on a phone the remembered note is scrolled into view inside the list when it is below the fold, and a visible one leaves the list where it was', async () => {
    const rect = (top: number, height: number): DOMRect =>
      ({ top, height, bottom: top + height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    // jsdom lays nothing out: the list is 200px tall at the top of the page, and the current row sits where the case says.
    const scrollInto = async (rowTop: number, startAt: number): Promise<number> => {
      const original = Element.prototype.getBoundingClientRect;
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this.classList.contains('gn-help__nav')) return rect(0, 200);
        const list = this.getAttribute('aria-current') === 'page' ? this.closest<HTMLElement>('.gn-help__nav') : null;
        // The row moves up the page by however far the list has scrolled, as a laid-out row would.
        if (list !== null) return rect(rowTop - (list.scrollTop - startAt), 40);
        return original.call(this);
      });
      stubPhone(true);
      window.localStorage.clear();
      window.localStorage.setItem(lastNoteKey('u_kiro', WS_A), NOTE_A);
      const view = renderPage();
      const panel = await screen.findByTestId('notes-panel');
      const nav = panel.querySelector<HTMLElement>('.gn-help__nav')!;
      nav.scrollTop = startAt;
      await within(panel).findByTestId(`note-row-${NOTE_A}`);
      await settle();
      const at = nav.scrollTop;
      view.unmount();
      vi.restoreAllMocks();
      return at;
    };
    // Below the fold: 600 - 0 - (200 - 40) / 2 = 520 more than where it started.
    expect(await scrollInto(600, 0)).toBe(520);
    // CONTROL, same it(): a row already in view (top 20, bottom 60 inside 0..200, not at the centre) leaves the list
    // exactly where it was — centring it would have moved the list to 40.
    expect(await scrollInto(20, 100)).toBe(100);
  });

  it('25.356 the note opened LAST is the one resumed, across workspaces; with the pointer missing or unreadable, list order decides', async () => {
    // Open A in the first workspace, then B in the second, leave, and re-enter: B, not the first workspace's A.
    renderPage(NOTE_A);
    await waitFor(() => expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBe(NOTE_A));
    cleanup();
    renderPage(NOTE_B);
    await waitFor(() => expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_B))).toBe(NOTE_B));
    expect(window.localStorage.getItem(lastWorkspaceKey('u_kiro'))).toBe(WS_B);
    expect(lastWorkspaceKey('u_kiro')).toBe('gn-last-note-workspace:u_kiro');
    // The pointer is the user's, not another user's, and the per-workspace keys stay as pinned.
    expect(window.localStorage.getItem(lastWorkspaceKey('u_other'))).toBeNull();
    expect(window.localStorage.getItem(lastNoteKey('u_kiro', WS_A))).toBe(NOTE_A);
    cleanup();
    replace.mockClear();
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/notes/${NOTE_B}`));
    expect(replace).not.toHaveBeenCalledWith(`/notes/${NOTE_A}`);

    // CONTROL, same it(): with the pointer MISSING both keys remain and list order resumes the first workspace's note.
    window.localStorage.removeItem(lastWorkspaceKey('u_kiro'));
    cleanup();
    replace.mockClear();
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/notes/${NOTE_A}`));

    // CONTROL, same it(): with the pointer UNREADABLE (storage throws for that key only) the same.
    window.localStorage.setItem(lastWorkspaceKey('u_kiro'), WS_B);
    const realGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === lastWorkspaceKey('u_kiro')) throw new DOMException('blocked', 'SecurityError');
      return realGetItem.call(this, key);
    });
    cleanup();
    replace.mockClear();
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/notes/${NOTE_A}`));
  });
});

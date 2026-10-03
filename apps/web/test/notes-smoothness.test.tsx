import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { clearLiveQueryCache } from '@gisik-nokma/app-core';
import type { NoteDetail, NoteSummary } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { clearReadCaches } from '../src/clear-read-caches.js';
import { NotesPageShell } from '../src/skeletons/page-shells.js';
import { NoteEditorBand } from '../src/notes/note-skeletons.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 25.150–25.162 — smoothness T9: Notes (spec D5/S1/S4/S7, amendment S-R1; audit SM-07, NP-03).
 *
 * `NotesPage` is mounted whole, as `notes-page.test.tsx` mounts it, because every claim here is about what the PAGE does across a
 * remount (a note change is one in production: `tree-scroll.ts`) or across a render. The two collaborators with a counting wrapper
 * (`useNotesSearch`, `NoteByline`) are RENDER witnesses and call the real thing; the editor slot is the real one, wrapped only to
 * hand the test the live Tiptap instance a keystroke is driven through (jsdom cannot type into ProseMirror reliably).
 */
let currentPath = '/notes';
let mockUser: { id: string; name: string } | null = { id: 'u_kiro', name: 'Kiro' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockUser === null ? null : { user: mockUser }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const renders = { sections: 0, byline: 0 };
vi.mock('../src/use-notes-search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/use-notes-search.js')>();
  return {
    ...actual,
    useNotesSearch: (...args: Parameters<typeof actual.useNotesSearch>) => {
      renders.sections += 1;
      return actual.useNotesSearch(...args);
    },
  };
});
vi.mock('../src/notes/note-byline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/notes/note-byline.js')>();
  return {
    ...actual,
    NoteByline: (props: Parameters<typeof actual.NoteByline>[0]) => {
      renders.byline += 1;
      return actual.NoteByline(props);
    },
  };
});

let noteEditor: { current: Editor | null } | null = null;
vi.mock('@gisik-nokma/editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/editor')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    TicketEditorSlot: function CapturingSlot(props: { mode?: string; editorRef?: { current: Editor | null } }) {
      if (props.mode === 'note') noteEditor = props.editorRef ?? null;
      return createElement(actual.TicketEditorSlot as never, props as never);
    },
  };
});

// The editor chunk's prefetch (T10's `prefetchEditor`): counted at the seam, calling the real one (25.164, 25.166).
const prefetch = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/editor-slot.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/editor-slot.js')>();
  return {
    ...actual,
    prefetchEditor: () => {
      prefetch.calls += 1;
      actual.prefetchEditor();
    },
  };
});

import { NotesPage } from '../src/notes/notes-page.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]) => readFileSync(join(TEST_DIR, ...parts), 'utf8');

function ws(id: string, over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id,
    name: `Workspace ${id}`,
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 2,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}
const body = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
function noteDetail(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    noteId: 'n1',
    workspaceId: 'ws2',
    homeProjectId: '',
    authorId: 'u_kiro',
    title: 'Compressor log',
    scope: { mode: 'workspace' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-10-01T06:00:00.000Z',
    updatedAt: '2026-10-01T06:00:00.000Z',
    body: body('Compressor stopped in the cold room'),
    schemaVersion: 2,
    ...over,
  };
}
function summary(noteId: string, title: string, workspaceId = 'ws2'): NoteSummary {
  return {
    noteId,
    workspaceId,
    homeProjectId: '',
    authorId: 'u_kiro',
    title,
    scope: { mode: 'workspace' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-10-01T06:00:00.000Z',
    updatedAt: '2026-10-01T06:00:00.000Z',
  };
}
const tick = (ms = 20) => new Promise<void>((done) => setTimeout(done, ms));
function deferred<T>() {
  let resolveIt: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolveIt = done));
  return { promise, resolve: resolveIt };
}

type Reads = Parameters<typeof stubServices>[0];
function world(over: Reads = {}) {
  return stubServices(
    {
      getMyWorkspaces: async () => [ws('ws1'), ws('ws2'), ws('ws3')],
      getNote: async (workspaceId: string, id: string) => (workspaceId === 'ws2' && id === 'n1' ? noteDetail() : null),
      getNotes: async (workspaceId: string) => (workspaceId === 'ws2' ? [summary('n1', 'Compressor log'), summary('n2', 'Cold room audit')] : []),
      getDeletedNotes: async () => [],
      getMembers: async () => [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }],
      getActorNames: async () => [],
      getNoteComments: async () => [],
      ...over,
    },
    { notifications: { unreadCount: async () => 0, list: async () => ({ notifications: [], nextCursor: null }) } },
  );
}
const page = (services: ReturnType<typeof world>, key: string, noteId?: string) => (
  <Providers services={services}>
    <NotesPage key={key} {...(noteId === undefined ? {} : { noteId })} />
  </Providers>
);

beforeEach(() => {
  cleanup();
  clearReadCaches();
  clearLiveQueryCache();
  window.localStorage.clear();
  currentPath = '/notes';
  mockUser = { id: 'u_kiro', name: 'Kiro' };
  renders.sections = 0;
  renders.byline = 0;
  noteEditor = null;
  prefetch.calls = 0;
});
afterEach(() => vi.restoreAllMocks());

describe('25.15 Notes — cheap remount, parallel resolve, the reserved band, a quiet keystroke (T9)', () => {
  it('25.150 /notes reads the workspaces through the shared read: a remount inside 30 s makes no extra getMyWorkspaces call and paints the tree at once; CONTROL: one past the stale window makes exactly one', async () => {
    const getMyWorkspaces = vi.fn(async () => [ws('ws1'), ws('ws2')]);
    const services = world({ getMyWorkspaces });
    const view = render(page(services, 'a'));
    await screen.findByTestId('notes-container-ws1');
    await act(() => tick(40));
    const afterFirst = getMyWorkspaces.mock.calls.length;
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    view.rerender(page(services, 'b'));
    // The first frame of the remount already has the sections: the rows came from memory, not from a read in flight.
    expect(screen.getByTestId('notes-container-ws1')).toBeInTheDocument();
    await act(() => tick(60));
    expect(getMyWorkspaces).toHaveBeenCalledTimes(afterFirst);

    // CONTROL: the answer is now older than the stale window, so the next mount asks again — once, painting the rows meanwhile.
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 31_000);
    view.rerender(page(services, 'c'));
    expect(screen.getByTestId('notes-container-ws1')).toBeInTheDocument();
    await act(() => tick(60));
    expect(getMyWorkspaces).toHaveBeenCalledTimes(afterFirst + 1);
  });

  it('25.151 opening a note asks every workspace in PARALLEL and reads the found note once', async () => {
    const order: string[] = [];
    const getNote = vi.fn(async (workspaceId: string, id: string) => {
      order.push(`${workspaceId}:start`);
      await tick(20);
      order.push(`${workspaceId}:end`);
      return workspaceId === 'ws2' && id === 'n1' ? noteDetail() : null;
    });
    render(page(world({ getNote }), 'a', 'n1'));
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Compressor log');
    await act(() => tick(80));
    // Parallel: the third workspace was asked before the first had answered (sequential would start it after ws1:end and ws2:end).
    expect(order.filter((entry) => entry.endsWith(':start'))).toHaveLength(3);
    expect(order.indexOf('ws3:start')).toBeLessThan(order.indexOf('ws1:end'));
    // Once: the resolve's answer is the first answer, not a head start for a second identical request.
    expect(getNote.mock.calls.filter(([w, id]) => w === 'ws2' && id === 'n1')).toHaveLength(1);
  });

  it('25.152 a switch to a note not seen yet keeps the tree on screen from the cache and draws the document band as the editor slot\'s own box, busy, with no well fill', async () => {
    const second = deferred<NoteDetail | null>();
    const getNote = vi.fn(async (workspaceId: string, id: string) => {
      if (id === 'n2') return second.promise;
      return workspaceId === 'ws2' && id === 'n1' ? noteDetail() : null;
    });
    const services = world({ getNote });
    currentPath = '/notes/n1';
    const view = render(page(services, 'n1', 'n1'));
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Compressor log');
    await screen.findByTestId('note-row-n1');
    await act(() => tick(60));

    currentPath = '/notes/n2';
    view.rerender(page(services, 'n2', 'n2'));
    // The tree: rows from the cache on the FIRST frame of the remount, not an empty tree waiting for its own read.
    expect(screen.getByTestId('note-row-n1')).toBeInTheDocument();
    expect(screen.getByTestId('note-row-n2')).toBeInTheDocument();
    // The document: the editor slot's box (S-R1 rule 1), named once, busy.
    const label = await screen.findByText('Loading the note');
    const region = label.parentElement!;
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.classList.contains('editor-slot')).toBe(true);
    expect(region.classList.contains('editor-slot--note')).toBe(true);
    expect(region.closest('.gn-notes__editor')).not.toBeNull();
    expect(region.querySelector('.ticket-editor > .gn-field__input.ticket-editor__content')).not.toBeNull();
    // No part names its own fill: every part is the shared `.gn-skeleton` (whose fill is the placeholder role), none inline or "well".
    const parts = region.querySelectorAll('.gn-skeleton');
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect((part as HTMLElement).style.background).toBe('');
      expect(part.className).not.toMatch(/well/i);
    }
    expect(screen.queryByText('Loading…')).toBeNull();
    // CONTROL: when the read lands the band is the document.
    await act(async () => second.resolve(noteDetail({ noteId: 'n2', title: 'Cold room audit' })));
    await waitFor(() => expect(screen.queryByText('Loading the note')).toBeNull());
    expect(screen.getByTestId('note-document')).toBeInTheDocument();
  });

  it('25.153 the comment composer\'s editor mounts on click, not on open', async () => {
    currentPath = '/notes/n1';
    render(page(world(), 'a', 'n1'));
    await screen.findByTestId('note-document');
    await waitFor(() => expect(document.querySelectorAll('.ProseMirror')).toHaveLength(1));
    // CONTROL: the note's own read-only body is the one editor; the composer is a button.
    const add = await screen.findByRole('button', { name: /Add a comment/ });
    await userEvent.click(add);
    await waitFor(() => expect(document.querySelectorAll('.ProseMirror')).toHaveLength(2));
    const composer = document.querySelectorAll('.ProseMirror')[1]!;
    await waitFor(() => expect(composer.contains(document.activeElement)).toBe(true));
    expect(screen.queryByRole('button', { name: /Add a comment/ })).toBeNull();
  });

  it('25.154 the signed-out note URL says how to sign in instead of "Loading…" (audit NP-03)', async () => {
    mockUser = null;
    currentPath = '/notes/n1';
    render(page(world(), 'a', 'n1'));
    const links = await screen.findAllByRole('link', { name: 'Sign in' });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', '/sign-in?next=%2Fnotes%2Fn1');
    expect(screen.queryByText('Loading…')).toBeNull();
    // CONTROL: the document region itself carries the sentence (the tree already did), so a signed-in-but-slow read is NOT this arm.
    const region = screen.getByTestId('note-document-region');
    expect(within(region).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?next=%2Fnotes%2Fn1');
  });

  it('25.155 one workspace whose read fails does not sink the resolve: the workspace that holds the note still opens it; CONTROL: when nobody has it and a read failed, the page says it could not load, not that the note is no longer shared', async () => {
    const getNote = vi.fn(async (workspaceId: string, id: string) => {
      if (workspaceId === 'ws1') throw new Error('boom');
      return workspaceId === 'ws2' && id === 'n1' ? noteDetail() : null;
    });
    currentPath = '/notes/n1';
    render(page(world({ getNote }), 'a', 'n1'));
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Compressor log');
    cleanup();
    clearReadCaches();
    clearLiveQueryCache();
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    render(page(world({ getNote: failing }), 'b', 'n1'));
    expect(await screen.findByText('This note could not be loaded. Reload to try again.')).toBeInTheDocument();
    expect(screen.queryByText('That note is no longer shared with you.')).toBeNull();
  });

  it('25.156 the editor band is ONE number: the field floor and the page shell\'s document skeleton both read --gn-notes-editor-min, declared once', () => {
    const css = read('../app/globals.css');
    const declarations = css.match(/--gn-notes-editor-min:/g) ?? [];
    expect(declarations).toHaveLength(1);
    const floor = css.match(/\.gn-notes__editor \.ticket-editor \.ticket-editor__content\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(floor).toMatch(/min-height:\s*var\(--gn-notes-editor-min\)/);
    // The shell's document block takes the same variable (it used a bare 40dvh, a second number for the same band).
    const shell = render(<NotesPageShell />).container;
    const block = shell.querySelector('.gn-notes__document .gn-skeleton--block') as HTMLElement;
    expect(block.style.getPropertyValue('--gn-skeleton-h')).toBe('var(--gn-notes-editor-min)');
    // CONTROL: the number itself is still the 23.162 floor, now written once.
    expect(css).toMatch(/--gn-notes-editor-min:\s*max\(40dvh,\s*calc\(100dvh - var\(--app-nav-offset, 0px\) - 20rem\)\)/);
  });

  it('25.157 a keystroke that changes the headings re-renders the page but not the tree sections; CONTROL: the title filter does', async () => {
    currentPath = '/notes/n1';
    render(page(world(), 'a', 'n1'));
    await screen.findByTestId('note-row-n1');
    await userEvent.click(await screen.findByTestId('note-edit'));
    await waitFor(() => expect(noteEditor?.current).not.toBeNull());
    await act(() => tick(60));

    renders.sections = 0;
    const editor = noteEditor!.current!;
    act(() => {
      editor
        .chain()
        .focus()
        .insertContent([
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'First' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Second' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Third' }] },
        ])
        .run();
    });
    // The page DID see the new headings (the contents launcher appears), so the quiet below is a memo, not an absent re-render.
    await waitFor(() => expect(document.querySelector('.gn-notes__toc button')).not.toBeNull());
    expect(renders.sections).toBe(0);

    // CONTROL: a real prop change re-renders the sections, so the counter witnesses renders.
    fireEvent.change(screen.getByLabelText('Filter by title'), { target: { value: 'comp' } });
    await act(() => tick(20));
    expect(renders.sections).toBeGreaterThan(0);
  });

  it('25.158 while a search is running and nothing has come back the list shows skeleton note rows, never "No notes match"; CONTROL: the answered empty search does say it', async () => {
    const lexical = deferred<{ notes: never[]; corrected: null }>();
    const searchNotes = vi.fn((_ws: string, _text: string, opts: { mode: string }) =>
      opts.mode === 'lexical' ? lexical.promise : Promise.resolve({ notes: [], corrected: null }),
    );
    let said = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('No notes match') === true) said = true;
    });
    render(page(world({ searchNotes: searchNotes as never, getMyWorkspaces: async () => [ws('ws2')] }), 'a'));
    const box = await screen.findByPlaceholderText('Search');
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    try {
      fireEvent.change(box, { target: { value: 'zzz' } });
      const results = await screen.findByTestId('notes-results-ws2');
      const label = await within(results).findByText('Searching notes', undefined, { timeout: 2000 });
      const region = label.parentElement!;
      expect(region).toHaveAttribute('aria-busy', 'true');
      // The real list item's own container, with parts inside (S-R1).
      expect(region.querySelectorAll('li.gn-notes__row-item > .gn-notes__row .gn-skeleton').length).toBeGreaterThan(0);
      expect(said).toBe(false);
      // CONTROL: once both halves answer, the empty answer is worded.
      await act(async () => lexical.resolve({ notes: [], corrected: null }));
      expect(await within(results).findByText('No notes match', undefined, { timeout: 2000 })).toBeInTheDocument();
      expect(within(results).queryByText('Searching notes')).toBeNull();
    } finally {
      observer.disconnect();
    }
  });

  it('25.159 while the workspaces read is pending the tree is the notes list item\'s own container with parts, busy and named once; CONTROL: answered, there is none', async () => {
    const answer = deferred<WorkspaceRef[]>();
    render(page(world({ getMyWorkspaces: () => answer.promise }), 'a'));
    const label = await screen.findByText('Loading your notes');
    const region = label.parentElement!;
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.closest('nav.gn-notes__tree')).not.toBeNull();
    expect(region.querySelectorAll('li.gn-notes__row-item > .gn-notes__row .gn-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading…')).toBeNull();
    // The create control is not offered over a wait (as before): nobody can see what it would do.
    expect(screen.queryByRole('button', { name: 'Create note' })).toBeNull();
    await act(async () => answer.resolve([ws('ws2')]));
    await screen.findByTestId('notes-container-ws2');
    expect(screen.queryByText('Loading your notes')).toBeNull();
  });

  it('25.160 a keystroke inside the note does not re-render the byline, the comments or the rest of the document; CONTROL: leaving edit mode does', async () => {
    currentPath = '/notes/n1';
    render(page(world(), 'a', 'n1'));
    await userEvent.click(await screen.findByTestId('note-edit'));
    await waitFor(() => expect(noteEditor?.current).not.toBeNull());
    await act(() => tick(80));

    renders.byline = 0;
    // A character inside an existing word: the document changes, the word count does not, so nothing downstream has a new fact.
    act(() => {
      noteEditor!.current!.chain().focus('start').insertContent('x').run();
    });
    await act(() => tick(80));
    expect(renders.byline).toBe(0);

    // CONTROL: the Done button changes the document's own state, so the byline renders again (the counter is a witness).
    await userEvent.click(screen.getByTestId('note-done'));
    await waitFor(() => expect(renders.byline).toBeGreaterThan(0));
  });

  it('25.162 a note opened before paints from the cache on its next mount, while its read is still in flight', async () => {
    const held = { on: false };
    const getNote = vi.fn((workspaceId: string, id: string) =>
      held.on ? new Promise<NoteDetail | null>(() => undefined) : Promise.resolve(workspaceId === 'ws2' && id === 'n1' ? noteDetail() : null),
    );
    const services = world({ getNote });
    currentPath = '/notes/n1';
    const view = render(page(services, 'a', 'n1'));
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Compressor log');
    await act(() => tick(60));

    held.on = true;
    view.rerender(page(services, 'b', 'n1'));
    // First frame of the remount: the note is the cached answer, not a band waiting for the read.
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Compressor log');
    expect(screen.queryByText('Loading the note')).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('25.165 the editor band stays reserved while the purged-chip read is pending: the slot\'s own box, then the editor; no gap between', async () => {
    const held = deferred<Array<{ kind: 'ticket' | 'note'; id: string }>>();
    const chip = { type: 'ticketRef', attrs: { ticketId: 't1', projectId: 'p1', key: 'CC-1', title: 'A ticket' } };
    const withChip = noteDetail({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, chip] }] } as never });
    currentPath = '/notes/n1';
    render(page(world({ getNote: async (w: string, id: string) => (w === 'ws2' && id === 'n1' ? withChip : null), purgedAmong: () => held.promise as never }), 'a', 'n1'));
    await screen.findByTestId('note-document');
    const band = (await screen.findAllByText('Loading the editor'))[0]!.parentElement!;
    expect(band.closest('.gn-notes__editor')).not.toBeNull();
    expect(band.classList.contains('editor-slot--note')).toBe(true);
    expect(document.querySelectorAll('.gn-notes__editor .ProseMirror')).toHaveLength(0);
    // CONTROL: the answer lands, and the editor takes the band's place.
    await act(async () => held.resolve([]));
    await waitFor(() => expect(document.querySelectorAll('.gn-notes__editor .ProseMirror')).toHaveLength(1));
    expect(screen.queryByText('Loading the editor')).toBeNull();
  });

  it('25.164 the notes list warms the editor chunk on the first sign of intent (hover, focus, click) before a note opens, and not before; a search result link does the same; CONTROL: a settled list with no pointer has asked for nothing', async () => {
    const hit = { noteId: 'n2', title: 'Cold room audit', snippet: 'cold', homeProjectId: '', scopeMode: 'workspace', attachedTicketKeys: [], authorId: 'u_kiro', updatedAt: '2026-10-01T06:00:00.000Z', source: 'lexical' };
    const searchNotes = vi.fn(async () => ({ notes: [hit], corrected: null }));
    render(page(world({ searchNotes: searchNotes as never, getMyWorkspaces: async () => [ws('ws2')] }), 'a'));
    const row = await screen.findByTestId('note-row-n2');
    await act(() => tick(60));
    expect(prefetch.calls).toBe(0);
    await userEvent.hover(row);
    expect(prefetch.calls).toBeGreaterThanOrEqual(1);
    prefetch.calls = 0;
    act(() => row.focus());
    expect(prefetch.calls).toBeGreaterThanOrEqual(1);
    prefetch.calls = 0;
    row.addEventListener('click', (event) => event.preventDefault(), { once: true }); // jsdom cannot navigate
    fireEvent.click(row);
    expect(prefetch.calls).toBeGreaterThanOrEqual(1);
    // The search result's own link: a different element, the same intent.
    fireEvent.change(await screen.findByPlaceholderText('Search'), { target: { value: 'cold' } });
    const link = await within(await screen.findByTestId('notes-result-n2')).findByRole('link', { name: 'Cold room audit' });
    prefetch.calls = 0;
    await userEvent.hover(link);
    expect(prefetch.calls).toBeGreaterThanOrEqual(1);
    prefetch.calls = 0;
    act(() => link.focus());
    expect(prefetch.calls).toBeGreaterThanOrEqual(1);
    prefetch.calls = 0;
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(prefetch.calls).toBeGreaterThanOrEqual(1);
  });

  it('25.166 opening a note starts the editor chunk with the page, before the note\'s own read and the purged-chip read let the slot render; CONTROL: /notes with no note open does not', async () => {
    render(page(world(), 'a'));
    await screen.findByTestId('note-row-n1');
    await act(() => tick(60));
    expect(prefetch.calls).toBe(0);
    cleanup();
    const held = deferred<NoteDetail | null>();
    currentPath = '/notes/n1';
    render(page(world({ getNote: async () => held.promise }), 'b', 'n1'));
    await act(() => tick(20));
    expect(document.querySelectorAll('.gn-notes__editor .ProseMirror')).toHaveLength(0);
    expect(prefetch.calls).toBeGreaterThanOrEqual(1);
  });

  it('25.167 the band IS the editor slot\'s skeleton: the lazy slot, chunk held, with the props NoteEditorPane passes, draws the same box as the band (read and edit), so band → slot skeleton → editor moves nothing; CONTROL: an editing band draws the formatting strip\'s place, a reading one none', async () => {
    const { TicketEditorSlot: LazySlot } = await vi.importActual<typeof import('../src/editor-slot.js')>('../src/editor-slot.js');
    // The seam this file mocks would hand back the loaded chunk; here the real wrapper must stay on its skeleton, so the chunk is held.
    vi.resetModules();
    vi.doMock('@gisik-nokma/editor', () => new Promise(() => {}));
    const { TicketEditorSlot: HeldSlot } = await vi.importActual<typeof import('../src/editor-slot.js')>('../src/editor-slot.js');
    expect(HeldSlot).not.toBe(LazySlot);
    const box = (root: Element) => {
      const region = root.firstElementChild!;
      const shape = (element: Element): unknown => ({ cls: element.className.toString(), kids: [...element.children].map(shape) });
      return shape(region);
    };
    for (const readOnly of [true, false]) {
      const band = render(<NoteEditorBand label="Loading the editor" readOnly={readOnly} />);
      const slot = render(<HeldSlot mode="note" doc={null} readOnly={readOnly} workspaceId="ws2" ticketId="" noteId="n1" submitSlot="none" />);
      expect(box(slot.container), `readOnly=${readOnly}`).toEqual(box(band.container));
      expect(band.container.querySelector('.editor-slot.editor-slot--note > .ticket-editor > .ticket-editor__content')).not.toBeNull();
      expect(band.container.querySelector('.editor-slot__footer'), 'the footer is part of the slot\'s box').not.toBeNull();
      expect(band.container.querySelector('.ticket-editor__toolbar') !== null, `strip, readOnly=${readOnly}`).toBe(!readOnly);
      band.unmount();
      slot.unmount();
    }
    vi.doUnmock('@gisik-nokma/editor');
  });
});

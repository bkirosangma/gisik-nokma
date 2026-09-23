import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { EMPTY_NOTE_DOC, type NoteDetail, type NoteSummary, type SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.186–18.190 — the notes tree (Plan 5 of 6, spec §9.2).
 *
 * **Why the page and not the section.** The title filter is ONE input in the
 * tree header that narrows EVERY section, and the deleted group's visibility is
 * decided per workspace from the viewer's role. Both are page-level facts spread
 * across per-workspace components, so a case that rendered a single section
 * could not see either. These render `NotesPage` and drive it, which is also the
 * only way 18.188's `openNoteId` travels the route the product uses.
 */
let currentPath = '/notes';
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

/** Mutable, so 18.189 can walk member / admin / author without a second file. */
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

const N_HOME_NEW = '01J9NHOMENEW0000000000000000';
const N_HOME_OLD = '01J9NHOMEOLD0000000000000000';
const N_COLD_NEW = '01J9NCOLDNEW0000000000000000';
const N_COLD_OLD = '01J9NCOLDOLD0000000000000000';
const N_GHOST = '01J9NGHOST00000000000000000';
const N_DELETED = '01J9NDELETED0000000000000000';

const TICKET = '01J9TICKET00000000000000000';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}

const WS_A_REF: WorkspaceRef = {
  id: WS_A,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [project('p_cold', 'Cold room'), project('p_freezer', 'Freezer')],
};

/**
 * Five notes chosen so each assertion below has an ARM THAT COULD FAIL.
 *
 * Two per group, with distinct `updatedAt`s, so the ordering arm is not a
 * one-element list that any order satisfies. Titles are set so a filter word
 * (`cold`) crosses TWO groups at once — a single-group fixture cannot tell
 * "narrows every section" from "narrows the one section it happens to be in".
 */
function note(over: Partial<NoteSummary> & { noteId: string }): NoteSummary {
  return {
    workspaceId: WS_A,
    homeProjectId: '',
    authorId: 'u_kiro',
    title: 'Untitled',
    scope: { mode: 'workspace' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z',
    ...over,
  };
}

const HOME_NEW = note({ noteId: N_HOME_NEW, title: 'Cold room audit', updatedAt: '2026-09-23T12:00:00.000Z' });
const HOME_OLD = note({ noteId: N_HOME_OLD, title: 'Old planning', updatedAt: '2026-09-20T09:00:00.000Z' });
const COLD_NEW = note({
  noteId: N_COLD_NEW,
  homeProjectId: 'p_cold',
  title: 'Cold compressor log',
  attachedTickets: [{ ticketId: TICKET, projectId: 'p_cold', key: 'CCSO-1183', title: 'Renew the trade licence' }],
  updatedAt: '2026-09-22T10:00:00.000Z',
});
const COLD_OLD = note({ noteId: N_COLD_OLD, homeProjectId: 'p_cold', title: 'Older note', updatedAt: '2026-09-18T10:00:00.000Z' });
/** The unknown home. Nothing founded `p_ghost`, and the note must still draw. */
const GHOST = note({ noteId: N_GHOST, homeProjectId: 'p_ghost', title: 'Orphan note', updatedAt: '2026-09-21T10:00:00.000Z' });

const LIVE = [HOME_NEW, HOME_OLD, COLD_NEW, COLD_OLD, GHOST];

function workspace(over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return { ...WS_A_REF, ...over };
}

/**
 * A world whose note reads can be re-answered between calls — `deleted` is a
 * THUNK rather than an array so 18.189 can make the second read differ from the
 * first, which is how the RELOAD is witnessed rather than only the write.
 */
function world(opts: { ws?: WorkspaceRef; deleted?: () => NoteSummary[] } = {}) {
  return stubServices({
    getMyWorkspaces: async () => [opts.ws ?? workspace()],
    getNotes: async () => LIVE,
    getDeletedNotes: async () => (opts.deleted ?? (() => []))(),
    // 18.188 opens `/notes/<id>` through the page, which — since Task 4 —
    // mounts the real `NoteDocument` in the document pane rather than the
    // Task 1 placeholder. Nothing here asserts on that pane, but the
    // document's own effect still awaits `getNote`, and this helper's
    // un-stubbed reads reject BY NAME (see stub-services.ts): a case that
    // does not stub it now gets a real answer instead of an unhandled
    // rejection out of a `useEffect`.
    getNote: async (_workspaceId: string, noteId: string): Promise<NoteDetail | null> => {
      const found = [...LIVE, ...(opts.deleted ?? (() => []))()].find((candidate) => candidate.noteId === noteId);
      return found === undefined ? null : { ...found, body: EMPTY_NOTE_DOC, schemaVersion: 2 };
    },
  });
}

function renderNotes(noteId?: string) {
  const view = render(
    <Providers services={world()}>
      <NotesPage noteId={noteId} />
    </Providers>,
  );
  return view;
}

/** The note ids of the rows inside a container, in DOM order. */
function rowIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="note-row-"]')).map((el) =>
    (el.getAttribute('data-testid') ?? '').replace('note-row-', ''),
  );
}

describe('18.11 The Notes page — the tree', () => {
  /**
   * 18.186 — grouping by home, and the order INSIDE each group.
   *
   * The control is the fixture's asymmetry: `p_ghost` is a home nobody founded,
   * so it is absent from `workspace.projects` and absent from the headings a
   * project-driven renderer would draw. Its note is the assertion that an
   * unknown home is drawn rather than dropped — the failure mode a `Map` keyed
   * by the served project list produces silently.
   */
  it('18.186 groups notes by home, newest first, and never drops an unknown home', async () => {
    renderNotes();

    expect(await screen.findByTestId('notes-home-01J9WSLOGISTICS000000000000')).toBeInTheDocument();
    // Workspace-level notes first, newest `updatedAt` first. MUTATION TARGET:
    // ascending order swaps these two.
    expect(rowIds(screen.getByTestId(`notes-home-${WS_A}`))).toEqual([N_HOME_NEW, N_HOME_OLD]);
    expect(rowIds(screen.getByTestId('notes-container-p_cold'))).toEqual([N_COLD_NEW, N_COLD_OLD]);
    // The project with no notes still draws its heading — the tree is the
    // workspace's shape, not a list of what happens to exist.
    expect(screen.getByRole('heading', { level: 3, name: 'Freezer' })).toBeInTheDocument();
    expect(rowIds(screen.getByTestId('notes-container-p_freezer'))).toEqual([]);

    // CONTROL: the unknown home has its own group, headed by the raw id.
    expect(screen.getByRole('heading', { level: 3, name: 'p_ghost' })).toBeInTheDocument();
    expect(rowIds(screen.getByTestId('notes-container-p_ghost'))).toEqual([N_GHOST]);
  });

  /**
   * 18.187 — the ticket keys beside the title.
   *
   * The control is the sibling row: a renderer that drew the keys element for
   * every row, empty, would pass an assertion that only looked at the attached
   * one.
   */
  it('18.187 shows an attached note its ticket keys, and an unattached one nothing', async () => {
    renderNotes();

    const attached = await screen.findByTestId(`note-row-${N_COLD_NEW}`);
    expect(attached).toHaveTextContent('Cold compressor log');
    const keys = attached.querySelector('.gn-notes__keys');
    expect(keys).not.toBeNull();
    expect(keys).toHaveTextContent('CCSO-1183');

    // CONTROL: no keys element at all on a note with no tickets.
    const unattached = screen.getByTestId(`note-row-${N_HOME_NEW}`);
    expect(unattached.querySelector('.gn-notes__keys')).toBeNull();
  });

  /**
   * 18.188 — the open note's row, and only it.
   *
   * `openNoteId` arrives from the route, so this renders `/notes/<id>` through
   * the page rather than passing the prop to a section — the wiring under test
   * is the page's, and a section-level case would not exercise it.
   */
  it('18.188 marks the open note current and no other row', async () => {
    renderNotes(N_COLD_NEW);

    const open = await screen.findByTestId(`note-row-${N_COLD_NEW}`);
    expect(open).toHaveAttribute('aria-current', 'page');

    // CONTROL: MUTATION TARGET — marking every row fails here.
    for (const id of [N_HOME_NEW, N_HOME_OLD, N_COLD_OLD, N_GHOST]) {
      expect(screen.getByTestId(`note-row-${id}`), id).not.toHaveAttribute('aria-current', 'page');
    }
  });

  /**
   * 18.189 — the Deleted group's three arms, and Restore.
   *
   * `getDeletedNotes` is deliberately fed rows the viewer is NOT entitled to in
   * the member arms. The read narrows to one's own in production (18.101), so
   * the group's own rule is the only thing standing between a hypothetical
   * over-serving read and someone else's deleted note — and a fixture built from
   * what the real read returns could not reach that arm at all.
   */
  it('18.189 shows Deleted to an author and an admin, withholds it from a plain member, and Restore writes one event', async () => {
    const mine = note({ noteId: N_DELETED, title: 'Deleted by me', authorId: 'u_kiro', deleted: true });
    const theirs = note({ noteId: N_DELETED, title: 'Deleted by Ana', authorId: 'u_ana', deleted: true });

    // ARM ONE — a plain member reading their OWN deleted note: the group draws.
    mockSessionUser = { id: 'u_kiro', name: 'Kiro' };
    const member = world({ ws: workspace({ role: 'member' }), deleted: () => [mine] });
    const first = render(
      <Providers services={member}>
        <NotesPage />
      </Providers>,
    );
    expect(await screen.findByTestId('notes-deleted')).toBeInTheDocument();
    expect(screen.getByText('Deleted by me')).toBeInTheDocument();
    first.unmount();

    // ARM TWO — an admin reading SOMEONE ELSE's: still drawn, because the
    // admin may restore it. The row's author is what makes this arm about the
    // role and not about ownership.
    const admin = world({ ws: workspace({ role: 'admin' }), deleted: () => [theirs] });
    const second = render(
      <Providers services={admin}>
        <NotesPage />
      </Providers>,
    );
    expect(await screen.findByTestId('notes-deleted')).toBeInTheDocument();
    expect(screen.getByText('Deleted by Ana')).toBeInTheDocument();
    second.unmount();

    // ARM THREE — CONTROL, and the mutation's target: a plain member with none
    // of their own. "Show it to everyone" draws the group here.
    const memberNoOwn = world({ ws: workspace({ role: 'member' }), deleted: () => [theirs] });
    const third = render(
      <Providers services={memberNoOwn}>
        <NotesPage />
      </Providers>,
    );
    await screen.findByTestId(`notes-home-${WS_A}`);
    expect(screen.queryByTestId('notes-deleted')).toBeNull();
    expect(screen.queryByText('Deleted by Ana')).toBeNull();
    third.unmount();

    // ARM FOUR — Restore writes exactly one event, against the NOTE, and the
    // live query re-reads. The stub answers `[]` on the second read, so the row
    // leaving the screen is the query reloading and not a local state edit.
    let deletedCalls = 0;
    const ingested: SubmittedEvent[] = [];
    const services = stubServices({
      getMyWorkspaces: async () => [workspace()],
      getNotes: async () => LIVE,
      getDeletedNotes: async () => {
        deletedCalls += 1;
        return deletedCalls === 1 ? [mine] : [];
      },
    });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T14:00:00.000Z',
      }));
    };
    render(
      <Providers services={services}>
        <NotesPage />
      </Providers>,
    );
    const restore = await screen.findByRole('button', { name: 'Restore Deleted by me' });
    await userEvent.click(restore);

    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]!.type).toBe('note.restored');
    expect(ingested[0]!.entity).toEqual({ kind: 'note', id: N_DELETED });
    await waitFor(() => expect(screen.queryByTestId('notes-deleted')).toBeNull());
  });

  /**
   * 18.190 — one filter, every section, case-insensitively.
   *
   * The word `cold` is chosen because it appears in TWO groups with different
   * capitals (`Cold room audit`, `Cold compressor log`) and in NEITHER of
   * `Old planning` / `Older note` — so the case is about case-folding and about
   * reach, and the control is the project that ends up with nothing.
   */
  it('18.190 narrows every section with the title filter, case-insensitively, and clearing restores', async () => {
    renderNotes();
    await screen.findByTestId(`notes-home-${WS_A}`);

    const filter = screen.getByLabelText('Filter by title');
    await userEvent.type(filter, 'COLD');

    await waitFor(() => expect(rowIds(screen.getByTestId(`notes-home-${WS_A}`))).toEqual([N_HOME_NEW]));
    expect(rowIds(screen.getByTestId('notes-container-p_cold'))).toEqual([N_COLD_NEW]);
    // CONTROL: a project heading with no matching rows is hidden while
    // filtering — otherwise the tree would still claim those projects hold
    // something under this word.
    expect(screen.queryByTestId('notes-container-p_freezer')).toBeNull();
    expect(screen.queryByTestId('notes-container-p_ghost')).toBeNull();

    await userEvent.clear(filter);
    await waitFor(() => expect(rowIds(screen.getByTestId(`notes-home-${WS_A}`))).toEqual([N_HOME_NEW, N_HOME_OLD]));
    expect(rowIds(screen.getByTestId('notes-container-p_cold'))).toEqual([N_COLD_NEW, N_COLD_OLD]);
    expect(screen.getByTestId('notes-container-p_freezer')).toBeInTheDocument();
    expect(screen.getByTestId('notes-container-p_ghost')).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveQueryCache, type ProjectRef, type WorkspaceRef } from '@gisik-nokma/app-core';
import { documentTitleFor } from '../src/page-title.js';
import { clearReadCaches } from '../src/clear-read-caches.js';
import { Providers } from '../src/providers.js';
import { shellRefusalCopy } from '../src/shell-refusal.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.181–18.185 — the `/notes` shell (Plan 5 of 6, spec §9.1).
 *
 * **Why the page and not the pieces.** `NotesPage` is the only thing that
 * mounts `AppNav`, reads `getMyWorkspaces()` and arranges the three regions, and
 * nothing else in this repo renders it — so a deleted region, a read that never
 * fires or a second read are all invisible to every other file. The three arms
 * below are written against `screen`, which is what makes a missing region fail
 * here rather than pass.
 *
 * The route mock is MUTABLE (`currentPath`) because 18.181's control renders a
 * different route through the same module mock — the same shape
 * `app-nav.test.tsx:41-49` uses, and for the same reason.
 */
let currentPath = '/notes';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NotesPage } from '../src/notes/notes-page.js';
import InboxPage from '../app/inbox/page.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(TEST_DIR, '../app');

const WS_A = '01J9WSLOGISTICS000000000000';
const WS_B = '01J9WSQUIET0000000000000000';
const P_COLD = '01J9PCOLDROOM00000000000000';
const P_FREEZER = '01J9PFREEZER000000000000000';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}

/**
 * Two workspaces, deliberately UNLIKE each other: one with two projects and one
 * with none. 18.183's control needs a workspace that contributes no project
 * heading at all — a fixture where every workspace had projects could not tell
 * "one heading per project" from "the first workspace's projects, everywhere".
 */
function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Convenience Corner',
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

const WS_A_REF = workspace({
  id: WS_A,
  name: 'Garo Hills Logistics',
  projects: [project(P_COLD, 'Cold room'), project(P_FREEZER, 'Freezer')],
});
const WS_B_REF = workspace({ id: WS_B, name: 'Quiet Corner', projects: [] });

function world(overrides: Parameters<typeof stubServices>[0] = {}) {
  return stubServices(
    { getMyWorkspaces: async () => [WS_A_REF, WS_B_REF], ...overrides },
    { notifications: { unreadCount: async () => 0, list: async () => ({ notifications: [], nextCursor: null }) } },
  );
}

function renderNotes() {
  currentPath = '/notes';
  return render(
    <Providers services={world()}>
      <NotesPage />
    </Providers>,
  );
}

// The shell's per-person reads are module state (smoothness T3/T4/T9): each case starts with none, as a first visit does.
beforeEach(() => clearReadCaches());

describe('18.11 The Notes page — the shell', () => {
  /**
   * 18.181 — the shell, its three regions, its title, and the empty document.
   *
   * The control is the ROUTE, not the component: `/inbox` renders through the
   * same `AppNav` and the same `Providers`, so `Inbox` coming back is what makes
   * the `Notes` assertion a statement about this page's own heading rather than
   * about a harness that renders one title for everything.
   */
  it('18.181 renders the shell with the three regions and the title "Notes"', async () => {
    renderNotes();

    expect(await screen.findByRole('heading', { level: 1, name: 'Notes' })).toBeInTheDocument();
    // The three regions by their ROLES, which is what a screen reader meets:
    // the tree is the `nav` named Notes, the document is the `section` beside
    // it, and the TOC is the `aside`. A `data-testid` on each would pass on a
    // tree rendered as a `div`.
    expect(screen.getByRole('navigation', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByTestId('note-document-region')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'On this page' })).toBeInTheDocument();
    expect(screen.getByText('Pick a note, or create one.')).toBeInTheDocument();
    // MUTATION TARGET: the tree region. Dropping it fails on the `navigation`
    // query above, which is the whole reason that query is by role.

    // CONTROL, in the same case: a different route still names itself.
    //
    // ⚠ THE `cleanup()` IS REQUIRED AND IS NOT HYGIENE. RTL's `render` APPENDS
    // its container to `document.body` rather than replacing the previous one,
    // so without it BOTH trees are on the page and `queryByRole(… 'Notes')`
    // still finds the first one — measured: without the unmount this arm read
    // `expected <h1 class="gn-page-title">Notes</h1> to be null`. The count is
    // asserted as well as the name, because "the inbox names itself" and "the
    // notes tree went away" are two facts and only the pair carries both.
    cleanup();
    currentPath = '/inbox';
    render(
      <Providers services={world()}>
        <InboxPage />
      </Providers>,
    );
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Inbox');
  });

  /**
   * 18.183 — one section per workspace, and the projects NESTED under their own
   * workspace.
   *
   * The control is the asymmetry of the fixture. `Quiet Corner` has no projects,
   * so under the contract it renders one heading and nothing below it; the
   * mutation named in the plan (render the FIRST workspace's projects under
   * every workspace) puts `Cold room` inside `Quiet Corner` and reddens the
   * control arm while the first arm stays green — which is what makes the pair a
   * test of NESTING rather than of "some headings rendered".
   */
  it('18.183 renders one section per workspace with one sub-heading per project', async () => {
    renderNotes();

    const logistics = await screen.findByRole('heading', { level: 2, name: 'Garo Hills Logistics' });
    const quiet = screen.getByRole('heading', { level: 2, name: 'Quiet Corner' });

    // The two workspace sections are SIBLINGS — neither heading contains the
    // other — so "one section per workspace" is a shape and not a count.
    expect(logistics.closest('section')).toBe(screen.getByTestId(`notes-container-${WS_A}`));
    expect(quiet.closest('section')).toBe(screen.getByTestId(`notes-container-${WS_B}`));
    expect(logistics.closest('section')).not.toBe(quiet.closest('section'));

    // Each project heading is inside its OWN workspace's section.
    const cold = screen.getByRole('heading', { level: 3, name: 'Cold room' });
    const freezer = screen.getByRole('heading', { level: 3, name: 'Freezer' });
    expect(cold.closest(`[data-testid="notes-container-${WS_A}"]`)).not.toBeNull();
    expect(freezer.closest(`[data-testid="notes-container-${WS_A}"]`)).not.toBeNull();

    // CONTROL: the workspace with no projects contributes no project heading —
    // and, named rather than counted, none of its sibling's either.
    const quietSection = screen.getByTestId(`notes-container-${WS_B}`);
    expect(quietSection.querySelectorAll('h3')).toHaveLength(0);
    expect(quietSection.textContent).not.toContain('Cold room');
    expect(quietSection.textContent).not.toContain('Freezer');
  });

  /**
   * 18.184 — the three arms of the workspaces read, and the loading arm is the
   * one the mutation targets.
   *
   * Each arm is asserted BESIDE the other two, because the defect class here is
   * state collapse: a page that renders the empty copy while the read is still
   * in flight, or a refusal panel for an empty answer, passes a case that only
   * ever asserts one state at a time.
   */
  it('18.184 draws the refusal, the empty tree and the loading arm as three distinct states', async () => {
    const refusal = render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => Promise.reject(new Error('HTTP 500 for /v1/me/workspaces')) },
          { notifications: { unreadCount: async () => 0 } },
        )}
      >
        <NotesPage />
      </Providers>,
    );
    expect(await screen.findByText('HTTP 500 for /v1/me/workspaces')).toBeInTheDocument();
    expect(screen.getByText(shellRefusalCopy('Your notes'))).toBeInTheDocument();
    expect(screen.queryByText('No notes yet')).toBeNull();
    refusal.unmount();

    const empty = render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          { notifications: { unreadCount: async () => 0 } },
        )}
      >
        <NotesPage />
      </Providers>,
    );
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
    // The Create button is part of THIS state (spec §9.7: "No notes yet" AND
    // the button) and not of the two beside it — asserted here rather than only
    // in the populated case, because "there is nowhere to file a note" and
    // "there is nowhere to file a note YET" are the two facts a person in this
    // state needs told apart.
    expect(screen.getByRole('button', { name: 'Create note' })).toBeInTheDocument();
    // ...and NOT while loading, where the read has not answered at all.
    empty.unmount();
    clearReadCaches(); // the next arm is a FIRST visit: the shared read would otherwise carry the rows this one just read (T4)

    // The read never answers: `workspaces` stays null and NEITHER of the two
    // settled arms may be drawn. MUTATION TARGET — rendering "No notes yet"
    // while loading fails here, and only here.
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: () => new Promise<WorkspaceRef[]>(() => {}) },
          { notifications: { unreadCount: async () => 0 } },
        )}
      >
        <NotesPage />
      </Providers>,
    );
    // The loading arm is the notes list item's skeleton region (smoothness T9, 25.159), named once; never the empty copy.
    expect(await screen.findByText('Loading your notes')).toBeInTheDocument();
    expect(screen.queryByText('No notes yet')).toBeNull();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create note' })).toBeNull();
  });

  /**
   * 18.462 (R7b, planner's browser pass 2026-09-30) — a note opened while the
   * workspaces read is still in flight never draws "That note is no longer
   * shared with you.". The page used to hand the document `workspaces ?? []`,
   * so its search walked an empty list, found nothing and drew the copy until
   * the read landed (measured 95–137 ms on direct load). A MutationObserver
   * records the copy at ANY moment, not just where the test looks.
   *
   * CONTROLS, same `it`: once the read answers a workspace that does not hold
   * the note, or `[]` (a person with no workspaces), the copy IS drawn — `[]`
   * is an answer and stays the document's to word.
   * MUTATION TARGET: restore `workspaces ?? []` for the not-yet-asked arm.
   */
  it('18.462 a note opened while the workspaces read is pending never draws the lost-access copy; CONTROL: an answered miss and an answered [] do', async () => {
    const LOST = 'That note is no longer shared with you.';
    let flashed = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes(LOST) === true) flashed = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    let answer: (value: WorkspaceRef[]) => void = () => undefined;
    try {
      render(
        <Providers
          services={stubServices(
            {
              getMyWorkspaces: () => new Promise<WorkspaceRef[]>((resolve) => (answer = resolve)),
              getNote: async () => null,
            },
            { notifications: { unreadCount: async () => 0 } },
          )}
        >
          <NotesPage noteId="01J9NOTEMISSING000000000000" />
        </Providers>,
      );
      // Nothing has answered yet (the tree says so), and the observer is watching.
      // Nothing has answered yet: the tree and the document each say so as a skeleton region (smoothness T9, 25.152, 25.159).
      expect(await screen.findByText('Loading your notes')).toBeInTheDocument();
      expect(await screen.findByText('Loading the note')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.queryByText(LOST)).toBeNull();
      expect(flashed).toBe(false);
      // CONTROL A — the read answers a workspace that does not hold the note.
      answer([WS_A_REF]);
      expect(await screen.findByText(LOST)).toBeInTheDocument();
    } finally {
      observer.disconnect();
    }
    cleanup();

    // CONTROL B — the read answers [] (no workspaces): the copy is drawn, not held back.
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [], getNote: async () => null },
          { notifications: { unreadCount: async () => 0 } },
        )}
      >
        <NotesPage noteId="01J9NOTEMISSING000000000000" />
      </Providers>,
    );
    await waitFor(() => expect(screen.getByText(LOST)).toBeInTheDocument());
  });

  /**
   * 18.485 — above 60rem the document scrolls in its OWN column, and the window does not
   * (18.481). Next resets the WINDOW's scroll on a navigation; it does not reset an
   * element's. `/notes/a` → `/notes/b` is the same route file with a new param; IF App
   * Router keeps the page mounted the section persists and the next note would
   * open at the previous note's offset (a rerender with a new `noteId` is what this
   * drives; whether the real navigation remounts is the browser case 18.493).
   * CONTROL: an unrelated re-render (same note) leaves the offset alone, and a link
   * with a `#heading` or `#comment-…` hash is left to the scroll that owns it.
   * MUTATION TARGET: delete the effect, or drop the hash guard.
   */
  it('18.485 opening a different note returns the document column to the top; CONTROL: the same note keeps its place, and a hash link is not reset', async () => {
    const view = (id: string) => (
      <Providers services={world({ getNote: async () => null })}>
        <NotesPage noteId={id} />
      </Providers>
    );
    window.location.hash = '';
    const { rerender } = render(view('01J9NOTEAAAAAAAAAAAAAAAAAA'));
    const region = await screen.findByTestId('note-document-region');
    region.scrollTop = 400;
    rerender(view('01J9NOTEAAAAAAAAAAAAAAAAAA')); // CONTROL: same note
    expect(region.scrollTop).toBe(400);
    rerender(view('01J9NOTEBBBBBBBBBBBBBBBBBB'));
    expect(screen.getByTestId('note-document-region')).toBe(region); // the rerender kept the same column element
    await waitFor(() => expect(region.scrollTop).toBe(0));

    window.location.hash = '#a-heading';
    try {
      region.scrollTop = 400;
      rerender(view('01J9NOTECCCCCCCCCCCCCCCCCC'));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(region.scrollTop).toBe(400);
    } finally {
      window.location.hash = '';
    }
  });

  /**
   * 18.488 — the tree keeps its place when the next note opens (owner, 2026-09-30; measured in a
   * real browser at `e4e92f77`: the tree's `scrollTop` went 800 → 0).
   *
   * App Router keys a dynamic segment by its param VALUE, so `/notes/a` → `/notes/b` does not re-render
   * `NotesPage`, it MOUNTS A NEW ONE: the `<nav id="gn-notes-tree">` is a new node by design and the
   * workspaces and every section's notes are read again. This test models that with a `key` (a bare
   * re-render with a new `noteId` keeps the node and would pass today — the trap 18.485 fell into).
   * The restore has to outlast the reads: the new tree is "Loading…" and short, and a browser CLAMPS
   * `scrollTop` to what is scrollable, so a restore on mount lands on 0. jsdom does not clamp, so the
   * setter below does — by the number of note links present — and the test reads 0 straight after the
   * remount to prove it is live. The restore is cancelled by the reader taking over (wheel, touch, key,
   * pointer), and what they scroll to next is what the next note restores.
   * CONTROL (same `it`): a first mount starts at 0 and the clamp is real; the geometry in a browser is 🧪 18.493.
   * MUTATION TARGET: drop the restore (the observer, or the saved value), or stop recording on `scroll`.
   */
  it('18.488 a remount puts the tree back at the offset it had once its rows are back; CONTROL: a first mount starts at 0, and the new tree is 0 while its rows are still loading', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      noteId: `01J9NOTE${String(i).padStart(18, '0')}`,
      workspaceId: WS_A,
      homeProjectId: '',
      authorId: 'u_kiro',
      title: `Note ${i}`,
      scope: { mode: 'workspace' as const },
      attachedTickets: [],
      deleted: false,
      createdAt: '2026-09-19T09:00:00.000Z',
      updatedAt: '2026-09-19T09:00:00.000Z',
    }));
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    const offsets = new WeakMap<Element, number>();
    const room = (el: Element) => Math.max(0, el.querySelectorAll('a[href^="/notes/"]').length * 60 - 300);
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        return this.id === 'gn-notes-tree' ? (offsets.get(this) ?? 0) : (original.get as () => number).call(this);
      },
      set(this: Element, value: number) {
        if (this.id === 'gn-notes-tree') offsets.set(this, Math.min(value, room(this)));
        else (original.set as (v: number) => void).call(this, value);
      },
    });
    try {
      const services = world({ getNote: async () => null, getNotes: async () => rows });
      const view = (id: string) => (
        <Providers services={services}>
          <NotesPage key={id} noteId={id} />
        </Providers>
      );
      const treeOf = () => screen.getByRole('navigation', { name: 'Notes' });
      const loaded = (tree: HTMLElement) =>
        waitFor(() => expect(tree.querySelectorAll('a[href^="/notes/"]').length).toBeGreaterThan(10));

      const { rerender } = render(view('01J9NOTEAAAAAAAAAAAAAAAAAA'));
      const first = treeOf();
      expect(first.scrollTop).toBe(0); // CONTROL: a first mount starts at the top
      await loaded(first);
      first.scrollTop = 800;
      fireEvent.scroll(first);
      expect(first.scrollTop).toBe(800);

      // COLD remount: the read cache is empty (a first visit to this workspace's notes on this device), so the new tree's rows
      // are still loading and the clamp reads 0. (Smoothness T9, 25.152: a WARM remount paints the rows from the cache on its
      // first frame — the third remount below — so this case empties the cache to keep the observer path under test.)
      clearLiveQueryCache();
      rerender(view('01J9NOTEBBBBBBBBBBBBBBBBBB')); // what Next does: a new page, a new tree
      const second = treeOf();
      expect(second).not.toBe(first); // a remount IS a new node; the offset has to be carried
      expect(second.scrollTop).toBe(0); // CONTROL: still loading, and the clamp says 0
      await waitFor(() => expect(second.scrollTop).toBe(800));

      // The reader scrolls somewhere else: THAT is what the next note restores.
      second.scrollTop = 200;
      fireEvent.scroll(second);
      rerender(view('01J9NOTECCCCCCCCCCCCCCCCCC'));
      await waitFor(() => expect(treeOf().scrollTop).toBe(200));
    } finally {
      Object.defineProperty(Element.prototype, 'scrollTop', original);
    }
  });

  /**
   * 18.185 — the title comes from a SERVER layout, and there are TWO of them.
   *
   * `document-title.test.tsx:118-124` resolves a page's title mechanism by
   * looking in the PAGE'S OWN directory for a sibling `layout.tsx`, so
   * `app/notes/[noteId]/page.tsx` needs `app/notes/[noteId]/layout.tsx` and is
   * not covered by `app/notes/layout.tsx`. Asserting both here means the second
   * one cannot be dropped without this case naming which.
   *
   * This reads SOURCE, which is what the P12 sweep does and what this arm can
   * honestly do: `export const metadata` is applied by Next's runtime, which a
   * bare `render()` never invokes. MUTATION TARGET: delete either layout.
   */
  it('18.185 declares the document title from a server layout for both routes', () => {
    // The two files the title sweep requires, by the two directories it checks:
    // `notes/page.tsx` resolves against `notes/layout.tsx`, and
    // `notes/[noteId]/page.tsx` against `notes/[noteId]/layout.tsx`.
    for (const layout of [
      join(APP_DIR, 'notes', 'layout.tsx'),
      join(APP_DIR, 'notes', '[noteId]', 'layout.tsx'),
    ]) {
      const source = readFileSync(layout, 'utf8');
      expect(source, `${layout} does not export metadata`).toMatch(/export\s+const\s+metadata\b/);
      expect(source, `${layout} does not title the route`).toContain("documentTitleFor('Notes')");
    }

    // The topic itself, so a layout that named some OTHER route would fail here
    // rather than at the suffix.
    expect(documentTitleFor('Notes')).toBe('Notes | Gisik Nokma');
  });
});

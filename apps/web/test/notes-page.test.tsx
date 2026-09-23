import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { documentTitleFor } from '../src/page-title.js';
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
    expect(screen.queryByText(/cannot be shown yet/)).toBeNull();
    empty.unmount();

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
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No notes yet')).toBeNull();
    expect(screen.queryByText(/cannot be shown yet/)).toBeNull();
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
    expect(documentTitleFor('Notes')).toBe('Notes · Gisik Nokma');
  });
});

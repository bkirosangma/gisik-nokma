import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail, NoteSummary, SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.224–18.226 — the two-column layout and its breakpoints, the TOC's
 * heading gate reaching the page's own wiring, and the CSS binding scanner
 * (spec §8.2, §9.1–9.2; Task 9's 11.95 shape applied to `.gn-notes*`).
 */
const routerReplace = vi.fn();
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));
let mockSessionUser: { id: string; name: string; email?: string } | null = {
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CSS = readFileSync(join(REPO_ROOT, 'apps/web/app/globals.css'), 'utf8');

/** Comments stripped first, exactly as the inbox scanner does it. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `gn-notes…` class NAMED IN A SELECTOR, sorted, deduplicated. */
function styledClasses(css: string): string[] {
  const hits = [...stripComments(css).matchAll(/\.(gn-notes[A-Za-z0-9_-]*)/g)].flatMap((hit) => hit[1] ?? []);
  return [...new Set(hits)].sort();
}

/** Every `gn-notes…` class actually on an element in the rendered tree. */
function renderedClasses(root: ParentNode): string[] {
  const hits = [...root.querySelectorAll<HTMLElement>('*')].flatMap((element) =>
    [...element.classList].filter((name) => name.startsWith('gn-notes')),
  );
  return [...new Set(hits)].sort();
}

/** Every `[data-…]` attribute name a `gn-notes` selector keys on. */
function styledAttributes(css: string): string[] {
  const notesRules = [...stripComments(css).matchAll(/^[^{}\n]*\.gn-notes[^{}\n]*\{/gm)].flatMap((hit) => hit[0] ?? []);
  const hits = notesRules.flatMap((selector) => [...selector.matchAll(/\[(data-[a-z-]+)/g)].flatMap((a) => a[1] ?? []));
  return [...new Set(hits)].sort();
}

/** The declarations of the rule whose selector list is EXACTLY `selector`. */
function declarationsFor(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(stripComments(css));
  return rule?.[1] ?? null;
}

/**
 * Every `@media (...)` block in `css` whose body touches `.${prefix}`, in file
 * order — depth-counted rather than regex-matched to the next `}` so a rule
 * INSIDE the block (which has its own braces) cannot truncate it early.
 */
function mediaBlocksTouching(css: string, prefix: string): Array<{ condition: string; body: string }> {
  const stripped = stripComments(css);
  const blocks: Array<{ condition: string; body: string }> = [];
  const opener = /@media\s*\(([^)]*)\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(stripped)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < stripped.length && depth > 0; i++) {
      if (stripped[i] === '{') depth++;
      else if (stripped[i] === '}') depth--;
    }
    const body = stripped.slice(match.index + match[0].length, i - 1);
    if (body.includes(`.${prefix}`)) blocks.push({ condition: (match[1] ?? '').trim(), body });
  }
  return blocks;
}

describe('18.226 the scanners are proven against planted input before they are trusted', () => {
  it('reads classes out of selectors, ignores commented-out ones', () => {
    const planted = [
      '/* .gn-notes__ghost { color: red; } — a rule that was DELETED */',
      '.gn-notes { background: var(--gn-surface); }',
      '.gn-notes__tree--drawer[data-open=\'true\'] .gn-notes__row { color: blue; }',
      '.gn-note-document { color: green; }',
    ].join('\n');
    expect(styledClasses(planted)).toEqual(['gn-notes', 'gn-notes__row', 'gn-notes__tree--drawer']);
  });

  it('reads classes off a rendered tree, ignoring a similarly-prefixed sibling class', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="gn-notes"><span class="gn-notes__row gn-note-document"></span></div>';
    expect(renderedClasses(host)).toEqual(['gn-notes', 'gn-notes__row']);
  });

  it('finds a media block by depth, not by the first inner brace', () => {
    const planted = ['.gn-notes__toc { display: none; }', '@media (min-width: 64rem) {', '  .gn-notes__toc { display: block; }', '  .gn-notes__body { grid-template-columns: 1fr; }', '}'].join('\n');
    const blocks = mediaBlocksTouching(planted, 'gn-notes');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.condition).toBe('min-width: 64rem');
    expect(blocks[0]!.body).toContain('.gn-notes__body');
  });
});

describe('18.224 the two-column layout and its breakpoints', () => {
  /**
   * The base grid, and the two breakpoints — REUSED, not invented (`60rem` is
   * `.gn-shell`'s own step-down, `64rem` is the workflow builder's rail
   * collapse; globals.css's own comment names both). This reads the
   * STYLESHEET directly rather than a rendered viewport — jsdom has no layout
   * engine to make a real breakpoint switch observable.
   *
   * Mutation: `60rem` → `59rem` on the `@media (max-width: 60rem)` line —
   * this test's own pinned condition string goes red.
   */
  it('pins the base grid and the two breakpoints, and no other value touches .gn-notes', () => {
    const base = declarationsFor(CSS, '.gn-notes__body');
    expect(base).not.toBeNull();
    expect(base ?? '').toMatch(/grid-template-columns:\s*18rem minmax\(0, 1fr\);/);

    const blocks = mediaBlocksTouching(CSS, 'gn-notes');
    // EXACT set, in file order: a third breakpoint value on a `.gn-notes`
    // selector anywhere in the file would add a THIRD entry here.
    expect(blocks.map((b) => b.condition)).toEqual(['max-width: 60rem', 'min-width: 64rem']);

    const narrow = blocks[0]!.body;
    expect(narrow).toMatch(/\.gn-notes__body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(narrow).toMatch(/\.gn-notes__tree-toggle\s*\{[^}]*display:\s*inline-flex;/);
    expect(narrow).toMatch(/\.gn-notes__tree--drawer\s*\{[^}]*display:\s*none;/);
    expect(narrow).toMatch(/\.gn-notes__tree--drawer\[data-open='true'\]\s*\{[^}]*display:\s*block;/);

    const wide = blocks[1]!.body;
    expect(wide).toMatch(/\.gn-notes__body\s*\{[^}]*grid-template-columns:\s*18rem minmax\(0, 1fr\) 14rem;/);
    expect(wide).toMatch(/\.gn-notes__toc\s*\{[^}]*display:\s*block;/);

    // The rest-state defaults the two breakpoints override.
    expect(declarationsFor(CSS, '.gn-notes__toc')).toMatch(/display:\s*none;/);
    expect(declarationsFor(CSS, '.gn-notes__tree-toggle')).toMatch(/display:\s*none;/);
  });
});

// ── Fixtures shared by 18.225 and 18.226 ────────────────────────────────────

const WS_A = '01J9WSLOGISTICS000000000000';
const P_COLD = '01J9PCOLDROOM00000000000000';
const OPEN_NOTE = '01J9NOTEOPEN0000000000000000';
const GROUP_NOTE = '01J9NOTEGROUP00000000000000';
const DELETED_NOTE = '01J9NOTEDELETED0000000000000';
const DELETED_NOTE_B = '01J9NOTEDELETEDB000000000000';
const TICKET = '01J9TICKET00000000000000000';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}
function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Garo Hills Logistics',
    prefix: 'CC',
    role: 'owner',
    memberCount: 2,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}
const WS_A_REF = workspace({ id: WS_A, projects: [project(P_COLD, 'Cold room')] });
const MEMBERS: RosterMember[] = [
  { id: 'u_kiro', name: 'Kiro', role: 'owner' },
  { id: 'u_ana', name: 'Ana Marak', role: 'member' },
];

function body(content: unknown[]) {
  return { type: 'doc', content };
}
function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
function heading(level: 1 | 2 | 3, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function noteSummary(over: Partial<NoteSummary> & { noteId: string }): NoteSummary {
  return {
    workspaceId: WS_A,
    homeProjectId: '',
    authorId: 'u_kiro',
    title: 'Untitled',
    scope: { mode: 'private' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-09-23T06:00:00.000Z',
    updatedAt: '2026-09-23T06:00:00.000Z',
    ...over,
  };
}
function noteDetail(over: Partial<NoteDetail> & { noteId: string }): NoteDetail {
  return { ...noteSummary(over), body: body([paragraph('Empty')]), schemaVersion: 2, ...over };
}

describe('18.225 the TOC lists headings at three or more, and nothing below that', () => {
  /**
   * `extractReadingMeta` (packages/editor, case 9.288) already gates
   * `ReadingTOC` at three headings — this proves the WIRING this task built
   * reaches it: `NoteDocument`'s heading-reporting effect, up through
   * `onHeadingsChange`, into `NotesPage`'s `<aside>`. A doc with three
   * `heading` nodes shows the rail; one with two shows nothing.
   *
   * Mutation: drop `onHeadingsChange={setHeadings}` from `NotesPage`'s
   * `<NoteDocument .../>` call — headings never reach the TOC, and BOTH arms
   * below go red (the three-heading arm finds nothing, and the two-heading
   * arm's "nothing" assertion is no longer proof of the gate).
   */
  it('three headings render the rail; two render nothing', async () => {
    const threeHeadingsNote = noteDetail({
      noteId: OPEN_NOTE,
      title: 'Cold room log',
      body: body([heading(1, 'Overview'), paragraph('x'), heading(2, 'Readings'), paragraph('y'), heading(2, 'Actions'), paragraph('z')]),
    });
    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === OPEN_NOTE ? threeHeadingsNote : null),
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const first = render(
      <Providers services={services}>
        <NotesPage noteId={OPEN_NOTE} />
      </Providers>,
    );
    await screen.findByTestId('note-document');
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Overview|Readings|Actions/ })).toHaveLength(3));
    first.unmount();

    // CONTROL — the same wiring, two headings: the rail draws nothing.
    const twoHeadingsNote = noteDetail({
      noteId: OPEN_NOTE,
      title: 'Cold room log',
      body: body([heading(1, 'Overview'), paragraph('x'), heading(2, 'Readings'), paragraph('y')]),
    });
    const services2 = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === OPEN_NOTE ? twoHeadingsNote : null),
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const { unmount } = render(
      <Providers services={services2}>
        <NotesPage noteId={OPEN_NOTE} />
      </Providers>,
    );
    await screen.findAllByTestId('note-document');
    // A settling window equal to the one the positive arm needed, so the
    // control is not merely "asked before the effect could have run".
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
    unmount();
  });
});

describe('18.226 every class the Notes page renders is a class globals.css styles, and the reverse', () => {
  /**
   * THE MAXIMAL FIXTURE. No single `NotesPage` render can show every
   * conditional class at once (search replaces the tree; a deleted note's
   * banner needs a DIFFERENT open note than the badges/history arms) — so
   * this drives ONE populated page through every surface Task 9 (and the
   * tasks before it) can draw, snapshotting the rendered class set after
   * each state change, then unions two small supplementary renders for the
   * states that genuinely cannot coexist with the rest.
   */
  it('the two sets are EQUAL — a rename on either side reddens here', async () => {
    const user = userEvent.setup();
    const seen = new Set<string>();
    const snap = (container: HTMLElement) => {
      for (const c of renderedClasses(container)) seen.add(c);
    };

    let refuseType: string | null = null;
    const openNote = noteDetail({
      noteId: OPEN_NOTE,
      title: 'Compressor log',
      attachedTickets: [{ ticketId: TICKET, projectId: P_COLD, key: 'CCSO-1183', title: 'Renew the trade licence' }],
      body: body([paragraph('Compressor stopped')]),
    });
    const groupNote = noteSummary({ noteId: GROUP_NOTE, homeProjectId: P_COLD, title: 'Freezer audit' });
    const deletedNote = noteSummary({ noteId: DELETED_NOTE, title: 'Old draft', deleted: true });

    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === OPEN_NOTE ? openNote : null),
      getNotes: async () => [{ ...openNote }, groupNote],
      getDeletedNotes: async () => [deletedNote],
      getNoteHistory: async () => [{ eventId: 'ev_1', authorId: 'u_kiro', recordedAt: '2026-09-23T08:00:00.000Z', seq: 2 }],
      getNoteVersion: async () => body([paragraph('An earlier version')]),
      searchNotes: async (_ws, text, options) =>
        text === 'zzzz'
          ? { notes: [] }
          : {
              notes: [
                {
                  noteId: GROUP_NOTE,
                  title: 'Freezer audit',
                  snippet: 'The **compressor** failed overnight',
                  homeProjectId: P_COLD,
                  scopeMode: 'private' as const,
                  attachedTicketKeys: ['CCSO-9'],
                  authorId: 'u_kiro',
                  updatedAt: '2026-09-23T09:00:00.000Z',
                  source: options.mode,
                },
              ],
              corrected: options.mode === 'lexical' ? ['compressor'] : undefined,
            },
    });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      const type = events[0]?.type;
      if (type === refuseType) {
        return events.map((event) => ({
          status: 'refused' as const,
          eventId: event.id,
          rule: 'x',
          reason: 'Not allowed right now.',
        }));
      }
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T09:00:00.000Z',
      }));
    };

    const { container, unmount: unmountMain } = render(
      <Providers services={services}>
        <NotesPage noteId={OPEN_NOTE} />
      </Providers>,
    );
    await screen.findByTestId('note-document');
    snap(container); // header, body, tree, tree-head, filter, rows/row/row-item/row-title/keys/key,
    // group/group-title, deleted/restore button, session-absent, editor,
    // title, byline, author, edited, scope/scope-wrap, badges, reading-time,
    // byline-actions, toc(wrapper), search/search-input/filters.

    // New note → dialog, then a refused Create → dialog-failure.
    await user.click(screen.getByRole('button', { name: 'New note' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Draft');
    refuseType = 'note.created';
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(container.querySelector('.gn-notes__dialog-failure')).not.toBeNull());
    snap(container); // dialog, field, field-label, input, dialog-actions, dialog-failure
    refuseType = null;
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // History → the list, then a version.
    await user.click(screen.getByRole('button', { name: 'History' }));
    await screen.findByTestId('history-list');
    await waitFor(() => expect(screen.queryAllByTestId(/^history-row-/).length).toBeGreaterThan(0));
    snap(container); // history-list, history-row
    await user.click(screen.getAllByTestId(/^history-row-/)[0]!);
    await waitFor(() => expect(container.querySelector('.gn-notes__history-version')).not.toBeNull());
    snap(container); // history-version, history-banner, history-actions
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));

    // The scope chip → the popover → Specific people → a refused write.
    await user.click(screen.getByTestId('note-scope'));
    const scopePopover = await screen.findByRole('dialog', { name: 'Change who can see this note' });
    await user.click(within(scopePopover).getByRole('button', { name: /Scope/ }));
    await user.click(await screen.findByRole('option', { name: 'Specific people' }));
    await user.click(within(scopePopover).getByRole('checkbox', { name: /Ana/ }));
    refuseType = 'note.scope_set';
    await user.click(screen.getByRole('button', { name: 'Save audience' }));
    // The popover is portaled to `document.body` (`Popover`'s own
    // `createPortal`), so it is a SIBLING of `container`, not a descendant —
    // `container.querySelector` cannot see it.
    await waitFor(() => expect(scopePopover.querySelector('.gn-notes__scope-failure')).not.toBeNull());
    snap(scopePopover); // scope-editor, scope-failure (scope/scope-wrap already in snap #1)
    refuseType = null;

    // The tree's Deleted group → a refused Restore.
    refuseType = 'note.restored';
    await user.click(screen.getByRole('button', { name: 'Restore Old draft' }));
    await waitFor(() => expect(container.querySelector('.gn-notes__restore-failure')).not.toBeNull());
    snap(container); // restore-failure
    refuseType = null;

    // Search: a query with hits (results/result/result-title/snippet/mark's
    // classes are not gn-notes-prefixed, so the mark itself is out of scope)
    // and corrected, then a query with none.
    await user.type(screen.getByTestId('notes-search'), 'compressor');
    await waitFor(() => expect(container.querySelector('.gn-notes__results')).not.toBeNull(), { timeout: 2000 });
    snap(container); // search-results, corrected, results, result, result-title, snippet
    await userEvent.clear(screen.getByTestId('notes-search'));
    await user.type(screen.getByTestId('notes-search'), 'zzzz');
    await waitFor(() => expect(container.querySelector('.gn-notes__no-results')).not.toBeNull(), { timeout: 2000 });
    snap(container); // no-results
    await userEvent.clear(screen.getByTestId('notes-search'));
    unmountMain();

    // ── Supplementary renders: states that cannot coexist with the above ──
    // Each one unmounts before the next starts — `screen` binds to
    // `document.body`, so a still-mounted render would leave two matches for
    // every role query the next render issues.

    // A DELETED note open (as its own author): the banner.
    const deletedOpenServices = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNote: async (_ws, id) => (id === DELETED_NOTE_B ? noteDetail({ noteId: DELETED_NOTE_B, title: 'Gone', deleted: true }) : null),
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const deletedRender = render(
      <Providers services={deletedOpenServices}>
        <NotesPage noteId={DELETED_NOTE_B} />
      </Providers>,
    );
    await screen.findByText('This note was deleted');
    snap(deletedRender.container); // deleted-banner
    deletedRender.unmount();

    // No workspace at all: the empty tree, and the Create button it still
    // draws (spec §9.7) opened on an empty roster — dialog-empty.
    const emptyServices = stubServices({ getMyWorkspaces: async () => [], getMembers: async () => [] });
    const emptyRender = render(
      <Providers services={emptyServices}>
        <NotesPage />
      </Providers>,
    );
    await screen.findByText('No notes yet');
    await user.click(screen.getByRole('button', { name: 'New note' }));
    await screen.findByText(/not in a workspace yet/);
    snap(emptyRender.container); // empty, dialog, dialog-empty, hint (NO_NOTE_COPY)
    emptyRender.unmount();

    // Loading: the workspaces read never lands.
    const loadingRender = render(
      <Providers services={stubServices({ getMyWorkspaces: () => new Promise(() => {}) })}>
        <NotesPage />
      </Providers>,
    );
    await screen.findByText('Loading…');
    snap(loadingRender.container); // loading
    loadingRender.unmount();

    // Signed out.
    mockSessionUser = null;
    const signedOutRender = render(
      <Providers services={stubServices({})}>
        <NotesPage />
      </Providers>,
    );
    await waitFor(() => expect(signedOutRender.container.querySelector('.gn-notes__session')).not.toBeNull());
    snap(signedOutRender.container); // session
    signedOutRender.unmount();

    const rendered = [...seen].sort();
    const styled = styledClasses(CSS);

    // The walks really walked.
    expect(rendered.length).toBeGreaterThan(30);
    expect(styled.length).toBeGreaterThan(30);

    // NEITHER LIST IS TYPED HERE — see the inbox scanner's own docblock for why.
    expect(rendered).toEqual(styled);
  });

  it('the one data-attribute globals.css keys a .gn-notes rule on is really rendered', async () => {
    const services = stubServices({
      getMyWorkspaces: async () => [WS_A_REF],
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
    });
    const { container } = render(
      <Providers services={services}>
        <NotesPage />
      </Providers>,
    );
    await within(container).findByRole('navigation', { name: 'Notes' });
    const styled = styledAttributes(CSS);
    expect(styled).toEqual(['data-open']);
    const rendered = [...container.querySelectorAll<HTMLElement>('*')].flatMap((el) =>
      el.getAttributeNames().filter((name) => name.startsWith('data-')),
    );
    for (const attribute of styled) expect(rendered).toContain(attribute);
  });
});

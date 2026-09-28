import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchTermSchema } from '@gisik-nokma/domain';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSourceQuery, ProjectRef, RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteDetail, SubmittedEvent } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { noteDraftKey } from '../src/notes/use-note-autosave.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.199–18.204 — the note document (Plan 5 of 6, spec §9.2, §9.6, §8.5).
 *
 * **What this file stubs, and what that costs.** The `TicketEditorSlot` is the
 * one collaborator replaced: 18.202's subject is the four WIKI-LINK CALLBACKS
 * the document builds and hands over, and reaching them through a real editor
 * would mean typing `[[` into ProseMirror to observe closures a test can read
 * directly. Everything else — the reads, the writes, the ingest — is real. The
 * stub is a pass-through by default (`stubSlot = false` renders the REAL slot),
 * so 18.199/18.204's editor assertions below are about the shipped component and
 * not about the harness.
 */
let capturedSlotProps: Array<Record<string, unknown>> = [];
let stubSlot = false;
vi.mock('@gisik-nokma/editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gisik-nokma/editor')>();
  return {
    ...actual,
    TicketEditorSlot: function CapturingSlot(props: Record<string, unknown>) {
      capturedSlotProps.push(props);
      return stubSlot ? null : createElement(actual.TicketEditorSlot as never, props as never);
    },
  };
});

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
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

import { NoteDocument } from '../src/notes/note-document.js';

const WS_A = '01J9WSLOGISTICS000000000000';
const P_COLD = '01J9PCOLDROOM00000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const TICKET = '01J9TICKET00000000000000000';
const OTHER_NOTE = '01J9NOTEOTHER00000000000000';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}

const WS_A_REF: WorkspaceRef = {
  id: WS_A,
  name: 'Garo Hills Logistics',
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [project(P_COLD, 'Cold room')],
};

const MEMBERS: RosterMember[] = [
  { id: 'u_kiro', name: 'Kiro', role: 'owner' },
  { id: 'u_ana', name: 'Anselma Marak', role: 'member' },
];

/** Two hundred and forty characters of prose, so `previewNote`'s cut is visible. */
const LONG_PARAGRAPH = 'Compressor stopped in the cold room. '.repeat(8);

function body(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function noteDetail(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    noteId: NOTE,
    workspaceId: WS_A,
    homeProjectId: P_COLD,
    authorId: 'u_kiro',
    title: 'Compressor log',
    scope: { mode: 'private' },
    attachedTickets: [{ ticketId: TICKET, projectId: P_COLD, key: 'CCSO-1183', title: 'Renew the trade licence' }],
    deleted: false,
    createdAt: '2026-09-23T06:00:00.000Z',
    updatedAt: '2026-09-23T06:00:00.000Z',
    body: body('Compressor stopped in the cold room'),
    schemaVersion: 2,
    ...over,
  };
}

function world(
  opts: {
    note?: NoteDetail;
    role?: string;
    search?: DataSourceQuery['search'];
    getTickets?: DataSourceQuery['getTickets'];
  } = {},
) {
  const services = stubServices({
    getMyWorkspaces: async () => [{ ...WS_A_REF, role: opts.role ?? 'owner' }],
    ...(opts.search === undefined ? {} : { search: opts.search }),
    ...(opts.getTickets === undefined ? {} : { getTickets: opts.getTickets }),
    // The read REFUSES an id nothing holds, as the route does — a stub that
    // answered the same note for every id would make 18.202's "unknown target"
    // arm unfalsifiable, since `previewNote` would always find something.
    getNote: async (_workspaceId: string, id: string) =>
      id === NOTE ? (opts.note ?? noteDetail()) : null,
    getMembers: async () => MEMBERS,
    getNotes: async () => [
      {
        noteId: OTHER_NOTE,
        workspaceId: WS_A,
        homeProjectId: '',
        authorId: 'u_kiro',
        title: 'Cold room audit',
        scope: { mode: 'workspace' as const },
        attachedTickets: [],
        deleted: false,
        createdAt: '2026-09-20T09:00:00.000Z',
        updatedAt: '2026-09-20T09:00:00.000Z',
      },
    ],
    getDeletedNotes: async () => [],
  });
  return services;
}

const writeText = vi.fn(async (_text: string) => undefined);
beforeEach(() => {
  cleanup();
  capturedSlotProps = [];
  stubSlot = false;
  routerPush.mockClear();
  writeText.mockClear();
  mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

function renderDocument(opts: { note?: NoteDetail; role?: string } = {}) {
  return render(
    <Providers services={world(opts)}>
      <NoteDocument noteId={NOTE} workspaces={[{ ...WS_A_REF, role: opts.role ?? 'owner' }]} />
    </Providers>,
  );
}

/**
 * What the NOTE editor's slot was last rendered with — `mode: 'note'`,
 * specifically, and not merely the last entry pushed. Task 7 mounts a SECOND
 * `TicketEditorSlot` in this tree (`NoteComments`' composer, `mode:
 * 'comment'`), which renders AFTER the note editor and would otherwise be
 * what `capturedSlotProps[capturedSlotProps.length - 1]` returns — reddening
 * every case here that reads `slotProps().readOnly`/`.mode` for reasons that
 * have nothing to do with what they test.
 */
function slotProps(): Record<string, unknown> {
  const last = [...capturedSlotProps].reverse().find((props) => props['mode'] === 'note');
  if (last === undefined) throw new Error('the note-mode slot was never rendered');
  return last;
}

describe('18.11 The Notes page — the document', () => {
  /**
   * 18.199 — the whole document, once.
   *
   * The breadcrumb, the editable title, the byline (author, edited time, scope,
   * badges, reading time) and the editor carrying the LOADED BODY. The body is
   * the arm that matters: every other assertion here passes against a document
   * that mounted an empty composer, which is exactly the defect a `doc`
   * pass-through gets wrong.
   */
  it('18.199 renders the breadcrumb, the title, the byline with its badges, and the editor over the loaded body', async () => {
    const { container } = renderDocument();

    // The breadcrumb: workspace / project / the note's own title.
    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(crumb).toHaveTextContent('Garo Hills Logistics');
    expect(crumb).toHaveTextContent('Cold room');
    expect(crumb).toHaveTextContent('Compressor log');

    // The editable title, named by its own words so the assertion is about the
    // control and not about a `data-testid`.
    const title = screen.getByTestId('note-title');
    expect(title).toHaveTextContent('Compressor log');
    expect(title).toHaveAttribute('contenteditable', 'true');

    // The byline.
    expect(await screen.findByText('Kiro')).toBeInTheDocument();
    expect(screen.getByText(/edited/i)).toBeInTheDocument();
    expect(screen.getByTestId('note-scope')).toHaveTextContent('Private');
    // 18.253 — the canonical sheet path, not the id-only My Work door.
    const badge = screen.getByRole('link', { name: 'Renew the trade licence' });
    expect(badge).toHaveAttribute('href', `/w/${WS_A}/p/${P_COLD}?ticket=${TICKET}`);
    expect(screen.getByTestId('note-reading-time')).toBeInTheDocument();

    // The editor, over the loaded body. MUTATION TARGET: an empty `doc` empties
    // this and every assertion above still passes.
    await waitFor(() =>
      expect(container.querySelector('.ProseMirror')?.textContent ?? '').toContain(
        'Compressor stopped in the cold room',
      ),
    );
    expect(slotProps().mode).toBe('note');
  });

  /**
   * 18.334 — an absent breadcrumb level renders no segment and no
   * separator (owner report, 2026-09-24): a note's crumb read "Convenience
   * Corner /  / Furniture", an empty middle segment with its own separator
   * either side. Root cause: a WORKSPACE-scoped note's `homeProjectId` is
   * legitimately `''` (`note-state.ts` refuses an empty one only for
   * `scope.mode === 'project'`), `.find()` over that finds no project, and
   * the OLD JSX rendered the `<li>` regardless of whether it had a name —
   * `?? ''` painted over the miss with an empty string instead of omitting
   * the slot. `.gn-breadcrumb__item + .gn-breadcrumb__item::before` draws
   * `/` only between two RENDERED siblings, so omitting the `<li>` removes
   * its separator for free.
   */
  it('18.334 a workspace-scoped note (no project) shows exactly the two non-empty levels', async () => {
    renderDocument({ note: noteDetail({ homeProjectId: '' }) });

    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    const items = within(crumb).getAllByRole('listitem');
    // MUTATION TARGET: reverting to `?? ''` on the project slot puts a
    // THIRD, empty `<li>` back — this fails on COUNT, not merely on text,
    // so an empty item hiding behind a passing `toHaveTextContent` cannot
    // slip through.
    expect(items.map((item) => item.textContent)).toEqual(['Garo Hills Logistics', 'Compressor log']);
    expect(items).toHaveLength(2);
  });

  /**
   * 18.200 — renaming: when, and what counts as a change.
   *
   * The three arms are the three gates: Enter with a change writes; blur with a
   * change writes; Escape and an emptied title write nothing. The empty-title
   * arm is the CONTROL and it is the one a naive implementation fails —
   * `noteRenamedPayload` refuses `title: ''`, so a document that wrote on every
   * blur would file a claim the domain rejects.
   */
  it('18.200 writes one note.renamed on Enter or blur when the title changed and is non-empty', async () => {
    const user = userEvent.setup();
    const ingested: SubmittedEvent[] = [];
    const services = world();
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T07:00:00.000Z',
      }));
    };
    render(
      <Providers services={services}>
        <NoteDocument noteId={NOTE} workspaces={[WS_A_REF]} />
      </Providers>,
    );

    const title = await screen.findByTestId('note-title');
    title.focus();
    await user.clear(title);
    await user.type(title, 'Compressor log (revised){Enter}');

    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]!.type).toBe('note.renamed');
    expect(ingested[0]!.entity).toEqual({ kind: 'note', id: NOTE });
    expect(ingested[0]!.payload).toEqual({ title: 'Compressor log (revised)' });

    // ESCAPE reverts: no second event, and the field shows the standing title.
    title.focus();
    await user.clear(title);
    await user.type(title, 'Something else{Escape}');
    expect(ingested).toHaveLength(1);
    expect(screen.getByTestId('note-title')).toHaveTextContent('Compressor log');

    // CONTROL — a BLUR with the title emptied writes nothing, because the
    // domain refuses an empty title and a blank heading is not a rename.
    title.focus();
    await user.clear(title);
    title.blur();
    expect(ingested).toHaveLength(1);
  });

  /**
   * 18.201 — detaching, and the reader's control.
   *
   * The × is a real control and the badge is a real link, asserted through the
   * slot's own `onDetach`, which is the document's decision rather than the
   * kit's (18.197 owns the kit's half).
   */
  it('18.201 detaches an attached ticket for an editor and offers no × to a reader', async () => {
    const user = userEvent.setup();
    const ingested: SubmittedEvent[] = [];
    const services = world();
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T07:00:00.000Z',
      }));
    };
    const view = render(
      <Providers services={services}>
        <NoteDocument noteId={NOTE} workspaces={[WS_A_REF]} />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Detach Renew the trade licence' }));
    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]!.type).toBe('note.detached');
    expect(ingested[0]!.payload).toEqual({ ticketId: TICKET });
    view.unmount();

    // CONTROL — a reader who is not the author and holds a plain member role.
    mockSessionUser = { id: 'u_ana', name: 'Anselma Marak' };
    renderDocument({ role: 'member' });
    expect(await screen.findByRole('link', { name: 'Renew the trade licence' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Detach/ })).toBeNull();
  });

  /**
   * 18.202 — the four wiki-link callbacks, read off the props the document hands
   * the slot.
   *
   * `stubSlot` renders `null` in place of the editor so the closures can be
   * CALLED. Every assertion is about what the document answers, which is the
   * unit; the editor's own half of the contract is `packages/editor`'s (9.288).
   */
  it('18.202 answers the wiki-link callbacks from the loaded notes and the note itself', async () => {
    stubSlot = true;
    capturedSlotProps = [];
    renderDocument();

    // `treeNotes` loads in its OWN effect, gated on `note` rather than fired
    // alongside it, so the slot's first render (which satisfies "rendered at
    // least once") can predate that load — a race the earlier version of this
    // case had, intermittently reading the pre-load closures. Wait for the
    // settled answer instead of for the mere fact of a render.
    //
    // The sentinel is `queryNotes('co')` carrying BOTH notes, not
    // `resolveNoteTitle(OTHER_NOTE) !== null` — 18.202's own mutation answers
    // the id itself (truthy) for an id `treeNotes` does not yet hold, which
    // would satisfy a `resolveNoteTitle`-based sentinel on the very first,
    // pre-load render and race ahead exactly as before, just on a target the
    // mutation cannot touch: `queryNotes` never falls back to the query text.
    await waitFor(async () => {
      const queryNotes = slotProps().queryNotes as (
        q: string,
      ) => Promise<Array<{ noteId: string; title: string }>>;
      expect((await queryNotes('co')).map((hit) => hit.noteId)).toContain(OTHER_NOTE);
    });

    const queryNotes = slotProps().queryNotes as (q: string) => Promise<Array<{ noteId: string; title: string }>>;
    const resolveNoteTitle = slotProps().resolveNoteTitle as (id: string) => string | null;
    const previewNote = slotProps().previewNote as (id: string) => Promise<string | null>;
    const onNavigateNote = slotProps().onNavigateNote as (id: string) => void;

    // `getNotes` is stubbed with one note titled "Cold room audit", and the
    // OPEN note ("Compressor log") also matches "co" — the open note is a
    // candidate too, because a link to the note you are reading must not go red
    // just because the tree's list happens to omit it.
    const hits = await queryNotes('co');
    expect(hits.map((hit) => hit.noteId)).toEqual([NOTE, OTHER_NOTE]);
    expect(await queryNotes('zzz')).toEqual([]);

    // The OPEN note's own title is resolvable too — the tree's list may not
    // carry it, and a `[[` link to the note you are reading must not go red.
    expect(resolveNoteTitle(NOTE)).toBe('Compressor log');
    expect(resolveNoteTitle(OTHER_NOTE)).toBe('Cold room audit');
    // MUTATION TARGET: answering the STORED title for an id nothing holds —
    // 18.202's mutation. The editor draws a red pill off this `null`.
    expect(resolveNoteTitle('01J9NUNKNOWN000000000000000')).toBeNull();

    const preview = await previewNote(NOTE);
    expect(preview).not.toBeNull();
    expect(preview!.length).toBeLessThanOrEqual(200);
    expect(preview!.startsWith('Compressor stopped in the cold room')).toBe(true);
    // A target that is not shared answers `null` rather than a preview.
    expect(await previewNote('01J9NUNKNOWN000000000000000')).toBeNull();

    onNavigateNote('01J9NUNKNOWN000000000000000');
    expect(routerPush).toHaveBeenCalledWith('/notes/01J9NUNKNOWN000000000000000');
  });

  /**
   * 18.273 — Plan 7 Task 4 (spec §14): the note page supplies the SAME two
   * ticket-ref callbacks to its editor (this case) and its comment thread
   * (`note-comments.test.tsx`). Same shape as 18.202's read: `stubSlot`
   * renders `null` so the closures can be called directly.
   */
  it('18.273 supplies queryTickets and resolveTicketHref to the note editor', async () => {
    stubSlot = true;
    capturedSlotProps = [];
    const search = vi.fn(async (_workspaceId: string, _text: string) => [
      { ticketId: TICKET, projectId: P_COLD, title: 'Renew the trade licence', snippet: '', matchedIn: 'title' as const, key: 'CCSO-1183' },
    ]);
    render(
      <Providers services={world({ search })}>
        <NoteDocument noteId={NOTE} workspaces={[{ ...WS_A_REF, role: 'owner' }]} />
      </Providers>,
    );

    await waitFor(() => {
      expect(slotProps().queryTickets).toBeDefined();
    });
    const queryTickets = slotProps().queryTickets as (
      q: string,
    ) => Promise<Array<{ ticketId: string; projectId: string; key: string; title: string }>>;
    const resolveTicketHref = slotProps().resolveTicketHref as (ref: {
      ticketId: string;
      projectId: string;
    }) => string | null;

    const hits = await queryTickets('licence');
    expect(search).toHaveBeenCalledWith(WS_A, 'licence');
    expect(hits).toEqual([{ ticketId: TICKET, projectId: P_COLD, key: 'CCSO-1183', title: 'Renew the trade licence' }]);
    expect(resolveTicketHref({ ticketId: TICKET, projectId: P_COLD })).toBe(
      `/w/${WS_A}/p/${P_COLD}?ticket=${TICKET}`,
    );
  });

  /**
   * 18.310 — Unit 6e (owner ruling 2026-09-29): the note editor's bare
   * `:ticket` — no project in this context — lists the workspace's tickets
   * instead of reaching `search('')`, which the route refuses (400), drawn as
   * "Search needs a connection". Same mount as 18.273; the comment box's half
   * is in `note-comments.test.tsx`.
   */
  it('18.310 the note editor\'s empty :ticket query lists the workspace\'s tickets and never calls search', async () => {
    stubSlot = true;
    capturedSlotProps = [];
    const search = vi.fn(async (_workspaceId: string, text: string) => {
      searchTermSchema.parse(text);
      return [];
    });
    const getTickets = vi.fn(async (projectId: string) => ({
      projectId,
      rows: [{ ticketId: TICKET, title: 'Renew the trade licence', key: 'CCSO-1183' }],
    })) as unknown as DataSourceQuery['getTickets'];
    render(
      <Providers services={world({ search, getTickets })}>
        <NoteDocument noteId={NOTE} workspaces={[{ ...WS_A_REF, role: 'owner' }]} />
      </Providers>,
    );
    await waitFor(() => {
      expect(slotProps().queryTickets).toBeDefined();
    });
    const queryTickets = slotProps().queryTickets as (q: string) => Promise<Array<{ key: string }>>;
    const listed = await queryTickets('');
    expect(listed.map((c) => c.key)).toContain('CCSO-1183');
    expect(search).not.toHaveBeenCalled();
  });

  /**
   * 18.203 — Copy as Markdown, and it is the SERIALISER's output.
   *
   * `exportMarkdown` is the same function the paste/copy round trip uses, so a
   * document that put `JSON.stringify(doc)` on the clipboard would satisfy "the
   * clipboard was written" and fail here.
   */
  it('18.203 puts the exported Markdown on the clipboard', async () => {
    renderDocument();
    const copy = await screen.findByRole('button', { name: 'Copy as Markdown' });
    /* ⚠ `fireEvent`, NOT `userEvent`, AND THAT IS A MEASUREMENT RATHER THAN A
       PREFERENCE. `userEvent.click` does not reach this control: measured in
       this file, `userEvent.click` on the Copy button leaves `writeText`
       uncalled while `fireEvent.click` on the SAME node calls it, and in the
       same render `userEvent.click` on the byline's Detach button DOES work —
       so it is not a blanket pointer-events or disabled-element problem, and it
       is not a claim about the product (which a browser reading would settle).
       The case is about what is PUT ON THE CLIPBOARD, so it drives the handler
       by the shortest route and says so. */
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toContain('Compressor stopped in the cold room');
    expect(copied).not.toContain('"type"');
  });

  /**
   * 18.204 — the reader's four differences, each with the author's arm beside it
   * in the SAME case, so "the reader gets less" cannot pass on a document that
   * gives everyone less.
   */
  it('18.204 gives a reader a read-only editor, no toolbar, a static title and a static scope chip', async () => {
    // The note is authored by somebody else, so `isAuthor` cannot carry the
    // reader arm on its own — the role is the ONLY thing making them a reader.
    const { container } = renderDocument({
      role: 'member',
      note: noteDetail({ authorId: 'u_ana' }),
    });
    await waitFor(() => expect(slotProps().readOnly).toBe(true));
    expect(screen.getByTestId('note-title')).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByTestId('note-scope').tagName).not.toBe('BUTTON');
    // The toolbar is absent for a read-only mount — `EditorToolbar` renders
    // nothing when `editable` is false, which is the observable.
    await waitFor(() =>
      expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false'),
    );
    // Scoped to the NOTE editor's own region: Task 7's comment composer is a
    // SECOND `TicketEditorSlot` in this tree, and it is not `canEdit`-gated
    // (spec §9.6: any reader may comment) — an unscoped query would find its
    // toolbar too, on both arms of this case, for a reason that has nothing
    // to do with the note's own read-only state.
    expect(within(screen.getByTestId('note-editor')).queryByRole('toolbar')).toBeNull();

    // CONTROL, same case: the author gets all four the other way.
    cleanup();
    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    const second = renderDocument({ role: 'member' });
    await waitFor(() => expect(slotProps().readOnly).toBe(false));
    expect(screen.getByTestId('note-title')).toHaveAttribute('contenteditable', 'true');
    expect(screen.getByTestId('note-scope').tagName).toBe('BUTTON');
    await waitFor(() =>
      expect(second.container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('true'),
    );
    expect(within(screen.getByTestId('note-editor')).getByRole('toolbar')).toBeInTheDocument();
  });
});

/**
 * 18.205–18.209 — autosave, INTEGRATED (Plan 5 Task 5, spec §9.4).
 *
 * `use-note-autosave.test.tsx` proves the hook's own contract in isolation.
 * These two prove the wiring: that the REAL editor (`stubSlot` stays false —
 * see this file's header) actually mounts with what the hook recovered,
 * rather than with the note's server-loaded body regardless. That distinction
 * is not academic here — an earlier draft of `NoteDocument` set `initialDoc`
 * from an EFFECT, which `useEditor`'s one-time, empty-deps `content` read
 * (`packages/editor` case 9.72) would have silently ignored on every render
 * after the first, opening every note's recovered draft as if it had never
 * existed. `use-note-autosave.test.tsx`'s `renderHook`-based cases could not
 * see that: they read `result.current.initialDoc` after `act()` has already
 * flushed effects, which is exactly the synchrony a REAL mount does not get
 * for free.
 */
describe('18.205-18.209 autosave, mounted through NoteDocument', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('a draft newer than the note reopens IN THE EDITOR, not the server body, and reports Not saved', async () => {
    window.localStorage.setItem(
      noteDraftKey('u_kiro', NOTE),
      JSON.stringify({ doc: body('a draft nobody has seen yet'), at: Date.parse('2026-09-23T07:00:00.000Z') }),
    );
    const { container } = renderDocument();

    await waitFor(() =>
      expect(container.querySelector('.ProseMirror')?.textContent ?? '').toContain('a draft nobody has seen yet'),
    );
    // CONTROL — the server's own body is NOT what rendered.
    expect(container.querySelector('.ProseMirror')?.textContent ?? '').not.toContain(
      'Compressor stopped in the cold room',
    );
    expect(screen.getByTestId('editor-save-state')).toHaveTextContent('Not saved (kept on this device)');
  });

  it('a throwing localStorage never stops the note from opening, with the note’s own body', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    try {
      const { container } = renderDocument();
      await waitFor(() =>
        expect(container.querySelector('.ProseMirror')?.textContent ?? '').toContain(
          'Compressor stopped in the cold room',
        ),
      );
    } finally {
      getItem.mockRestore();
    }
  });
});

/**
 * Additional coverage beyond the plan's named cases (advisor review, same
 * session): a real defect in the History→Restore path, found before Task 9
 * touched this file at all.
 *
 * `NoteEditorPane` (Task 5) is keyed by `note.noteId` so a DIFFERENT note
 * remounts it — the mechanism the autosave hook's own docblock depends on for
 * synchronous draft recovery. Restoring an OLD version does not change
 * `noteId`, so before the fix below, `write('note.body_set', …)`'s
 * `live.reload()` updated the `note` PROP the pane already had — but
 * `TicketEditor`'s `useEditor` (`packages/editor` case 9.72, empty deps)
 * never re-reads it: the live editor kept showing the PRE-restore body, and
 * `HistoryPanel`'s own 18.212 could not see this — it only proves
 * `onRestore` is called with the right bytes, not that they reach the page.
 */
describe('History → Restore reaches the live editor, not just the server record', () => {
  it('Restore actually updates the editor on screen, not only the record the server holds', async () => {
    const user = userEvent.setup();
    const OLD_EVENT = '01J9EVENTOLD00000000000000000';
    let currentNote = noteDetail({ body: body('the current words') });

    const services = stubServices({
      getNote: async (_workspaceId: string, id: string) => (id === NOTE ? currentNote : null),
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
      getNoteHistory: async () => [
        { eventId: OLD_EVENT, authorId: 'u_kiro', recordedAt: '2026-09-23T05:00:00.000Z', seq: 1 },
      ],
      getNoteVersion: async () => body('the old words'),
    });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      // The fixture's OWN commit: a real server would fold `note.body_set`
      // through the reducer; this stands in for that fold, the same way
      // every other write test in this file does.
      currentNote = { ...currentNote, body: body('the old words'), updatedAt: '2026-09-23T09:00:00.000Z' };
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 2,
        serverTime: '2026-09-23T09:00:00.000Z',
      }));
    };

    render(
      <Providers services={services}>
        <NoteDocument noteId={NOTE} workspaces={[WS_A_REF]} />
      </Providers>,
    );
    const editor = await screen.findByTestId('note-editor');
    await waitFor(() =>
      expect(editor.querySelector('.ProseMirror')?.textContent ?? '').toContain('the current words'),
    );

    await user.click(screen.getByRole('button', { name: 'History' }));
    const row = await screen.findByTestId(`history-row-${OLD_EVENT}`);
    await user.click(row);
    await screen.findByText(/Viewing version from/);
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    // THE ASSERTION: the LIVE editor (not the History panel's own read-only
    // one) shows the restored body.
    await waitFor(() =>
      expect(editor.querySelector('.ProseMirror')?.textContent ?? '').toContain('the old words'),
    );
    expect(editor.querySelector('.ProseMirror')?.textContent ?? '').not.toContain('the current words');
  });
});

/**
 * 13.1488 — clicking the padded empty area below short text focuses the
 * editor (owner, 2026-09-23: the notes page should "feel like its a note" —
 * `.gn-notes__editor`'s own `min-height`, `globals.css`, is the OTHER half of
 * this request). The wrapper `<div className="gn-notes__editor" ...>` is the
 * click target this reuses — a click landing INSIDE the editor's own content
 * never reaches this handler (`event.target !== event.currentTarget`), so
 * ProseMirror's own click-to-position-caret behaviour is untouched; this is
 * for the empty space the `min-height` adds, which has nothing else to catch
 * the click.
 */
describe('13.1488 clicking below the text focuses the editor', () => {
  /** MUTATION TARGET: drop the wrapper's onClick handler. */
  it('a click on the wrapper itself (not the editor content) focuses the editor', async () => {
    renderDocument();
    const wrapper = await screen.findByTestId('note-editor');
    // SCOPED to the wrapper: a second `TicketEditorSlot` (the comment
    // composer, mode: 'comment') mounts elsewhere on this same page.
    const textbox = await within(wrapper).findByRole('textbox');
    expect(textbox).not.toHaveFocus(); // CONTROL: not focused before the click.

    fireEvent.click(wrapper);

    await waitFor(() => expect(textbox).toHaveFocus());
  });
});

/**
 * 9.409 / 9.410 — KB parity: the reading-progress bar on the note page.
 *
 * gisik has no read/edit toggle, so the note page is the reading surface and
 * the bar is there for an editor and a reader alike (the source mounts it in
 * read mode only). 9.410 is the skin: the bar is under the sticky nav, painted
 * from tokens, still under reduced motion, and a heading scrolled to clears the
 * nav.
 */
describe('9.409 the note page carries a reading-progress bar', () => {
  it('9.409 a labelled progressbar is mounted for an editor and for a read-only viewer', async () => {
    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    renderDocument({ role: 'member' });
    const bar = await screen.findByRole('progressbar', { name: 'Reading progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    cleanup();

    renderDocument({ role: 'member', note: noteDetail({ authorId: 'u_ana' }) });
    await waitFor(() => expect(slotProps().readOnly).toBe(true));
    expect(await screen.findByRole('progressbar', { name: 'Reading progress' })).toBeInTheDocument();
  });

  it('9.410 the skin: tokens only, under the nav, motion off under prefers-reduced-motion, headings clear the nav', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (selector: string): string => {
      const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
      expect(match, `a rule for ${selector}`).not.toBeNull();
      return match?.[1] ?? '';
    };
    expect(rule('.reading-progress')).toMatch(/top:\s*var\(--app-nav-offset/);
    expect(rule('.reading-progress')).toMatch(/background:\s*var\(--gn-border\)/);
    expect(rule('.reading-progress__bar')).toMatch(/background:\s*var\(--gn-accent\)/);
    expect(rule('.reading-progress__bar')).toMatch(/transition:\s*transform/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.reading-progress__bar\s*\{\s*transition:\s*none/);
    expect(rule('.gn-notes__editor :is(h1, h2, h3, h4, h5, h6)')).toMatch(/scroll-margin-top:\s*calc\(var\(--app-nav-offset/);
    // No literal colour in the section this piece added.
    const section = css.slice(css.indexOf('.reading-progress {'));
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});

/**
 * 9.418–9.420 — KB parity: heading anchors on the note page. The extension and
 * the button are proved in `packages/editor/test/heading-anchors.test.ts`; what
 * belongs here is what only the page knows — the URL it hands the button, and
 * the arrival at `/notes/<id>#slug`, which has to wait for the headings.
 */
const HEADED_BODY = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
    { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Deep detail' }] },
  ],
};

describe('9.418 heading anchors on the note page', () => {
  it('9.418 the note editor gets a copy-link button per heading, carrying this note\'s absolute URL', async () => {
    const { container } = renderDocument({ note: noteDetail({ body: HEADED_BODY as never }) });
    await waitFor(() => expect(container.querySelectorAll('.ProseMirror h2 .editor-heading-link, .ProseMirror h4 .editor-heading-link')).toHaveLength(2));
    const headingLink = slotProps().headingLink as (id: string) => string | null;
    expect(headingLink('deep-detail')).toBe(`${window.location.origin}/notes/${NOTE}#deep-detail`);
    expect(container.querySelector('.ProseMirror h4')?.getAttribute('id')).toBe('deep-detail');
    // The comment composer is not a page: it gets no anchors.
    const composer = [...capturedSlotProps].reverse().find((props) => props['mode'] === 'comment');
    expect(composer?.['headingLink']).toBeUndefined();
  });

  it('9.419 arriving at #slug scrolls that heading into view once the editor has drawn it', async () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    window.history.replaceState(null, '', `/notes/${NOTE}#deep-detail`);
    try {
      const { container } = renderDocument({ note: noteDetail({ body: HEADED_BODY as never }) });
      await waitFor(() => expect(scrolled.length).toBeGreaterThan(0));
      expect(scrolled[0]).toBe(container.querySelector('.ProseMirror h4'));
    } finally {
      Element.prototype.scrollIntoView = original;
      window.history.replaceState(null, '', '/');
    }
  });

  it('9.420 a fragment naming no heading scrolls nothing and does not throw', async () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    window.history.replaceState(null, '', `/notes/${NOTE}#no-such-heading`);
    try {
      const { container } = renderDocument({ note: noteDetail({ body: HEADED_BODY as never }) });
      await waitFor(() => expect(container.querySelector('.ProseMirror h2')).not.toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(scrolled).toHaveLength(0);
    } finally {
      Element.prototype.scrollIntoView = original;
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('9.422 the draft-restore banner', () => {
  const DRAFT_TEXT = 'a draft nobody has seen yet';
  function seedDraft(): void {
    window.localStorage.setItem(
      noteDraftKey('u_kiro', NOTE),
      JSON.stringify({ doc: body(DRAFT_TEXT), at: Date.now() - 5 * 60_000 }),
    );
  }
  const editorText = (container: HTMLElement): string => container.querySelector('.ProseMirror')?.textContent ?? '';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('9.422 a recovered draft opens with a banner naming its age; a note with no draft has none', async () => {
    seedDraft();
    const { container } = renderDocument();
    const banner = await screen.findByTestId('draft-restore-banner');
    expect(banner).toHaveTextContent('Restored unsaved changes from 5m ago.');
    expect(editorText(container)).toContain(DRAFT_TEXT);
    // CONTROL, same it: with no draft stored the same page draws no banner.
    cleanup();
    window.localStorage.clear();
    renderDocument();
    await waitFor(() => expect(screen.getByTestId('note-editor')).toBeInTheDocument());
    expect(screen.queryByTestId('draft-restore-banner')).toBeNull();
  });

  it('9.423 Keep hides the banner and leaves the recovered words and their stored draft in place', async () => {
    seedDraft();
    const { container } = renderDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Keep' }));
    expect(screen.queryByTestId('draft-restore-banner')).toBeNull();
    expect(editorText(container)).toContain(DRAFT_TEXT);
    expect(window.localStorage.getItem(noteDraftKey('u_kiro', NOTE))).not.toBeNull();
  });

  it('9.424 Discard reloads the server body, deletes the draft key and writes nothing to the server', async () => {
    seedDraft();
    const services = world();
    const ingested: SubmittedEvent[] = [];
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-29T09:00:00.000Z',
      }));
    };
    const { container } = render(
      <Providers services={services}>
        <NoteDocument noteId={NOTE} workspaces={[{ ...WS_A_REF, role: 'owner' }]} />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(editorText(container)).toContain('Compressor stopped in the cold room'));
    expect(editorText(container)).not.toContain(DRAFT_TEXT);
    expect(screen.queryByTestId('draft-restore-banner')).toBeNull();
    expect(window.localStorage.getItem(noteDraftKey('u_kiro', NOTE))).toBeNull();
    // Give an unmount flush and the coalescing timer their turn: neither may write the discarded words.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ingested.filter((event) => event.type === 'note.body_set')).toHaveLength(0);
    expect(screen.getByTestId('editor-save-state')).toHaveTextContent('Saved');
  });

  it('9.425 a reader who cannot edit is not offered the banner', async () => {
    seedDraft();
    // CONTROL, same it: the author's own page over the same draft shows the banner.
    renderDocument();
    await screen.findByTestId('draft-restore-banner');
    cleanup();
    // Authored by somebody else, so the member role is the only thing making them a reader (18.204's recipe).
    renderDocument({ role: 'member', note: noteDetail({ authorId: 'u_ana' }) });
    await waitFor(() => expect(slotProps().readOnly).toBe(true));
    expect(screen.queryByTestId('draft-restore-banner')).toBeNull();
  });
});

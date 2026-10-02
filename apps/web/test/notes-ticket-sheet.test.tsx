import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteComment, NoteDetail, SubmittedEvent, TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { ProjectRef, RosterMember, TicketRead, WorkspaceRef } from '@gisik-nokma/app-core';
import { CommentsThread, createClientStateCache } from '@gisik-nokma/app-core';
import { Providers, type AppServices } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **A NOTE'S TICKET BADGE OPENS THE SHEET IN PLACE** (owner request,
 * 2026-09-24, relayed via a screenshot of a note's byline): *"the ticket
 * badge on the note ... the sheet should open right there and not navigate
 * to the project page."*
 *
 * Copies the shape `apps/web/test/my-work-sheet-in-place.test.tsx` proved for
 * My Work's own sheet mount, onto the Notes page's own document component
 * (`NoteDocument`, mounted by both `/notes` route files). The three things a
 * component-level test cannot see are the same three that file names: WHERE
 * the click goes (18.321, 18.323), WHICH project the sheet is given
 * (18.325), and the state that survives a reload (18.326).
 *
 * `NoteBadge`'s own `onOpen` intercept (a plain click vs. a modifier click) is
 * `packages/ui/test/note-badge.test.tsx`'s case 18.322, not repeated here —
 * this file is about the WIRING above that component, not the intercept
 * mechanism itself.
 *
 * ⚠ Search params are MUTABLE on purpose, the same convention the My Work
 * file uses and explains: `router.push` is mocked and does not feed back
 * into `useSearchParams()`, so an arm that needs the sheet ON SCREEN sets the
 * param and re-renders, which is what the router's own landing produces.
 */

const WORKSPACE = '01J9WSLOGISTICS000000000000';
const PROJECT = '01J9PCOLDROOM00000000000000';
const OTHER_PROJECT = '01J9POTHERPROJECT000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const TICKET = '01J9TICKET00000000000000000';
const STALE_TICKET = '01J9TICKETSTALE0000000000';

const WORKSPACE_NAME = 'Garo Hills Logistics';
const PROJECT_NAME = 'Cold room';
const TICKET_TITLE = 'Renew the trade licence';
const STALE_TICKET_TITLE = 'A ticket this note never attached';

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useParams: () => ({}),
  usePathname: () => `/notes/${NOTE}`,
  useSearchParams: () => searchParams,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { NoteDocument } from '../src/notes/note-document.js';
import { ticketSheetPath } from '../src/ticket-location.js';
import { ticketRefHrefIn } from '../src/ticket-ref-callbacks.js';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}

const WORKSPACE_REF: WorkspaceRef = {
  id: WORKSPACE,
  name: WORKSPACE_NAME,
  prefix: 'CC',
  role: 'owner',
  memberCount: 1,
  nameRestrictedProjectCount: 0,
  archived: false,
  projects: [project(PROJECT, PROJECT_NAME), project(OTHER_PROJECT, 'Other project')],
};

const MEMBERS: RosterMember[] = [{ id: 'u_kiro', name: 'Kiro', role: 'owner' }];

function body(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function noteDetail(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    noteId: NOTE,
    workspaceId: WORKSPACE,
    homeProjectId: PROJECT,
    authorId: 'u_kiro',
    title: 'Compressor log',
    scope: { mode: 'private' },
    attachedTickets: [{ ticketId: TICKET, projectId: PROJECT, key: 'CCSO-1183', title: TICKET_TITLE }],
    deleted: false,
    createdAt: '2026-09-24T06:00:00.000Z',
    updatedAt: '2026-09-24T06:00:00.000Z',
    body: body('Compressor stopped in the cold room'),
    schemaVersion: 2,
    ...over,
  };
}

const CLAIM = {
  actorId: 'u_kiro',
  actorName: 'Kiro',
  clientTime: '2026-09-24T07:00:00.000Z',
  serverTime: '2026-09-24T07:00:01.000Z',
  cause: null,
};

const WF: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [] }],
};

function ticketRead(spec: { id: string; title: string; projectId: string }): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket',
    id: spec.id,
    workspaceId: WORKSPACE,
    projectId: spec.projectId,
    typeId: 'task',
    parentId: null,
    workflowId: WF.id,
    workflowVersion: WF.version,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {
      title: {
        value: spec.title,
        actorId: 'u_kiro',
        clientTime: CLAIM.clientTime,
        serverTime: CLAIM.serverTime,
      },
    },
    transitions: [],
    closed: null,
    rank: null,
    reopenedAt: null,
    deleted: null,
  };
  return {
    ticket,
    title: spec.title,
    stateProvenance: CLAIM,
    assignedProvenance: null,
    visibility: null,
    parent: null,
    rollup: null,
    key: null,
    epic: null,
  };
}

/** The seeded fixture's default `getTicket` answer, by id. */
function ticketFor(id: string): TicketRead {
  if (id === STALE_TICKET) return ticketRead({ id: STALE_TICKET, title: STALE_TICKET_TITLE, projectId: OTHER_PROJECT });
  return ticketRead({ id: TICKET, title: TICKET_TITLE, projectId: PROJECT });
}

function mount(
  opts: {
    note?: NoteDetail;
    ticket?: (id: string) => TicketRead;
    comments?: NoteComment[];
    locate?: (
      workspaceId: string,
      ticketId: string,
    ) => Promise<{ workspaceId: string; projectId: string } | null>;
  } = {},
): AppServices {
  const services = stubServices(
    {
      getMyWorkspaces: async () => [WORKSPACE_REF],
      getNote: async (_workspaceId: string, id: string) => (id === NOTE ? (opts.note ?? noteDetail()) : null),
      getMembers: async () => MEMBERS,
      getNotes: async () => [],
      getNoteComments: async () => opts.comments ?? [],
      getDeletedNotes: async () => [],
      getTicket: async (_workspaceId: string, ticketId: string) => (opts.ticket ?? ticketFor)(ticketId),
      getTicketAttachments: async () => [],
      getWorkflowDef: async () => WF,
      getTicketHistory: async () => [],
      getTicketComments: async () => [],
      getTickets: async () => ({ projectId: PROJECT, rows: [] }),
    },
    {
      ticketLocation: { locate: opts.locate ?? (async () => null) },
    },
  );
  // A REAL cache: the sheet's transition precheck reads it, same reason
  // `my-work-sheet-in-place.test.tsx` gives for its own mount.
  services.cache = createClientStateCache();
  return services;
}

function renderDocument(services: AppServices) {
  return render(
    <Providers services={services}>
      <NoteDocument noteId={NOTE} workspaces={[WORKSPACE_REF]} />
    </Providers>,
  );
}

function rerender(view: ReturnType<typeof render>, services: AppServices) {
  view.rerender(
    <Providers services={services}>
      <NoteDocument noteId={NOTE} workspaces={[WORKSPACE_REF]} />
    </Providers>,
  );
}

/**
 * The title, read off the sheet's own title CONTROL — the same reason
 * `my-work-sheet-in-place.test.tsx` awaits it: the sheet mounts on the param
 * before its own read answers, so a synchronous query races it.
 */
async function openedTicketTitle(sheet: HTMLElement): Promise<string> {
  const input = await within(sheet).findByLabelText('Ticket title');
  return (input as HTMLInputElement).value;
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  searchParams = new URLSearchParams();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('18.321 a plain click on a note’s ticket badge opens the sheet in place', () => {
  it('pushes ?ticket= on this note’s own path (never the project page), and the sheet lands there', async () => {
    const services = mount();
    const view = renderDocument(services);

    const badge = await screen.findByRole('link', { name: TICKET_TITLE });
    await userEvent.click(badge);

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/notes/${NOTE}?ticket=${TICKET}`, { scroll: false }),
    );
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/w/'), expect.anything());
    expect(replace).not.toHaveBeenCalled();

    // The push above is not applied by the mock (see the file docblock) —
    // this is the landing.
    searchParams = new URLSearchParams({ ticket: TICKET });
    rerender(view, services);

    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(TICKET_TITLE);
    // …and the reader is still reading the note underneath it.
    expect(screen.getByTestId('note-title')).toHaveTextContent('Compressor log');
  });

  it('CONTROL: with no ?ticket= param, the document renders no sheet at all', async () => {
    renderDocument(mount());
    await screen.findByTestId('note-document');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('18.323 Back closes the sheet, not the note', () => {
  it('Close pushes this note’s bare path with no param, and Back is exactly that landing', async () => {
    searchParams = new URLSearchParams({ ticket: TICKET });
    const services = mount();
    const view = renderDocument(services);
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/notes/${NOTE}`, { scroll: false }));
    expect(push).toHaveBeenCalledTimes(1);
    // MUTATION TARGET: opening or closing through `replace` would still look
    // closed here, but a real Back would then have nothing to land ON.
    expect(replace).not.toHaveBeenCalled();

    // Back lands on precisely this: the SAME path, the param gone.
    searchParams = new URLSearchParams();
    rerender(view, services);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('note-document')).toBeInTheDocument();
  });
});

describe('18.324 the × never opens the sheet', () => {
  it('detaching writes note.detached and pushes nothing', async () => {
    const ingested: SubmittedEvent[] = [];
    const services = mount();
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-24T08:00:00.000Z',
      }));
    };
    renderDocument(services);

    await userEvent.click(await screen.findByRole('button', { name: `Detach ${TICKET_TITLE}` }));
    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]!.type).toBe('note.detached');
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('18.325 the open ticket’s project comes from this note first, the locator only otherwise', () => {
  it('a ticket attached to this note needs no request at all', async () => {
    const locate = vi.fn(async () => null);
    searchParams = new URLSearchParams({ ticket: TICKET });
    renderDocument(mount({ locate }));

    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(TICKET_TITLE);
    expect(locate).not.toHaveBeenCalled();
  });

  it('a ticket NOT attached to this note (a stale reload, or the sheet’s own parent chip) is placed by the locator', async () => {
    const locate = vi.fn(async (workspaceId: string) => ({ workspaceId, projectId: OTHER_PROJECT }));
    searchParams = new URLSearchParams({ ticket: STALE_TICKET });
    renderDocument(mount({ locate }));

    await waitFor(() => expect(locate).toHaveBeenCalledWith(WORKSPACE, STALE_TICKET));
    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(STALE_TICKET_TITLE);
  });

  it('a ticket the locator will not place mounts no sheet and draws the frozen refusal sentence', async () => {
    searchParams = new URLSearchParams({ ticket: STALE_TICKET });
    renderDocument(mount({ locate: async () => null }));

    // Queried by its OWN class, not by role alone: this note's unstubbed
    // `getNoteComments` also draws a `role="alert"` refusal, and a query with
    // no way to tell the two apart would find both.
    const refusal = await waitFor(() => {
      const found = document.querySelector('.gn-notes__refusal');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(refusal).toHaveTextContent('That ticket cannot be opened from here');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('18.326 the open ticket lives in the URL, so a reload opens the same sheet with no navigation', () => {
  it('landing on ?ticket= mounts the sheet with zero pushes', async () => {
    searchParams = new URLSearchParams({ ticket: TICKET });
    renderDocument(mount());

    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(TICKET_TITLE);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('18.327 closing the sheet returns focus to the badge that opened it', () => {
  it('focus lands back on the badge, not the body', async () => {
    const services = mount();
    const view = renderDocument(services);

    const badge = await screen.findByRole('link', { name: TICKET_TITLE });
    await userEvent.click(badge);
    searchParams = new URLSearchParams({ ticket: TICKET });
    rerender(view, services);
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    searchParams = new URLSearchParams();
    rerender(view, services);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('link', { name: TICKET_TITLE }));
  });
});

describe('18.328 deleting the open ticket reloads this note’s own live query', () => {
  it('a committed ticket.deleted re-asks getNote', async () => {
    let noteReads = 0;
    searchParams = new URLSearchParams({ ticket: TICKET });
    const services = mount();
    services.dataSource.query.getNote = async (_workspaceId: string, id: string) => {
      if (id === NOTE) noteReads += 1;
      return id === NOTE ? noteDetail() : null;
    };
    services.dataSource.ingest = async (events: SubmittedEvent[]) =>
      events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-24T08:00:00.000Z',
      }));
    renderDocument(services);
    await screen.findByRole('dialog');
    const before = noteReads;

    // Two presses since ruling E2-35; the confirm is queried by its OWN
    // name, since the sheet is a `role="dialog"` too.
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete ticket' }));

    await waitFor(() => expect(noteReads).toBeGreaterThan(before));
  });
});

/**
 * 18.335–18.338 — the REMAINING doors that left `/notes` for a ticket's project
 * page (owner, 2026-09-29: "opening a ticket from note should only open the
 * sheet there in the note section itself. not navigate to the project screen").
 * The byline badge (18.321) already opened the sheet in place; a ticket chip in
 * the note's BODY and in a note COMMENT still followed its project-page `href`.
 * Both now go through the SAME `openTicket` the badge uses, via one delegated
 * click handler on the document root — the chip's `href` stays canonical, so a
 * modified or middle click still opens the project page in a new tab.
 */
const CHIP_KEY = 'CCSO-2000';
const CHIP_TITLE = 'Chip text';

function chipNode() {
  return { type: 'ticketRef', attrs: { ticketId: TICKET, projectId: PROJECT, key: CHIP_KEY, title: CHIP_TITLE } };
}
function docWithChip() {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, chipNode()] }] };
}
function commentWithChip(): NoteComment {
  return {
    commentId: 'c-chip',
    authorId: 'u_kiro',
    body: docWithChip(),
    recordedAt: '2026-09-24T08:00:00.000Z',
    editedAt: null,
    deletedAt: null,
  };
}

async function bodyChip(view: ReturnType<typeof render>): Promise<HTMLAnchorElement> {
  return await waitFor(() => {
    const chip = view.container.querySelector<HTMLAnchorElement>('a.editor-ticketref');
    if (chip === null) throw new Error('no body chip yet');
    return chip;
  });
}
async function commentChip(view: ReturnType<typeof render>): Promise<HTMLAnchorElement> {
  return await waitFor(() => {
    const chip = view.container.querySelector<HTMLAnchorElement>('a.gn-comment__ticketref');
    if (chip === null) throw new Error('no comment chip yet');
    return chip;
  });
}

describe('18.335 a plain click on a ticket chip in the note body or a comment opens the sheet in place', () => {
  it('18.335 the body chip pushes ?ticket= on this note’s own path, never the project page', async () => {
    const view = renderDocument(mount({ note: noteDetail({ body: docWithChip() }) }));
    const chip = await bodyChip(view);
    // `false` = the click was cancelled, so the browser does NOT also follow the href.
    expect(fireEvent.click(chip)).toBe(false);
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/notes/${NOTE}?ticket=${TICKET}`, { scroll: false }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/w/'), expect.anything());
  });

  it('18.335 the comment chip does the same', async () => {
    const view = renderDocument(mount({ comments: [commentWithChip()] }));
    const chip = await commentChip(view);
    // `false` = the click was cancelled, so the browser does NOT also follow the href.
    expect(fireEvent.click(chip)).toBe(false);
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/notes/${NOTE}?ticket=${TICKET}`, { scroll: false }));
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('18.336 a modified or middle click on a ticket chip is NOT intercepted', () => {
  it('18.336 Ctrl/Cmd/Shift/Alt and the middle button leave the link alone, on both doors', async () => {
    const view = renderDocument(mount({ note: noteDetail({ body: docWithChip() }), comments: [commentWithChip()] }));
    for (const chip of [await bodyChip(view), await commentChip(view)]) {
      for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
        const notPrevented = fireEvent(
          chip,
          new MouseEvent('click', { bubbles: true, cancelable: true, ...modifier }),
        );
        expect(notPrevented, `${chip.className} ${JSON.stringify(modifier)}`).toBe(true);
      }
    }
    expect(push).not.toHaveBeenCalled();
  });
});

describe('18.337 the chip’s href stays the canonical project-page path', () => {
  it('18.337 both chips keep `ticketSheetPath` as their href, so open-in-new-tab still works', async () => {
    const view = renderDocument(mount({ note: noteDetail({ body: docWithChip() }), comments: [commentWithChip()] }));
    const expected = ticketSheetPath({ workspaceId: WORKSPACE, projectId: PROJECT }, TICKET);
    expect((await bodyChip(view)).getAttribute('href')).toBe(expected);
    expect((await commentChip(view)).getAttribute('href')).toBe(expected);
  });
});

describe('18.338 CONTROL: outside the note document a ticket chip is not intercepted', () => {
  it('18.338 a comment chip rendered off /notes (the project page’s shared renderer) follows its href', () => {
    const outside = render(
      <CommentsThread
        comments={[{ ...commentWithChip(), files: [] }]}
        nameOf={() => 'Kiro'}
        ticketHref={ticketRefHrefIn(WORKSPACE)}
        composer={null}
      />,
    );
    const chip = outside.container.querySelector<HTMLAnchorElement>('a.gn-comment__ticketref');
    expect(chip).not.toBeNull();
    const notPrevented = fireEvent(chip!, new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(notPrevented).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
});

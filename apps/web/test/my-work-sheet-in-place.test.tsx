import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent, TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type {
  AttachmentListEntry,
  AttentionItem,
  MyWorkView,
  TicketRead,
  WorkItem,
} from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import { Providers, type AppServices } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **OPENING A TICKET FROM MY WORK OPENS THE SHEET ON MY WORK** (owner request,
 * 2026-09-23): *"opening a ticket from my work should open the sheet on the my
 * work page, not redirect to the project page."*
 *
 * ## What this file has to witness that nothing else can
 *
 * The change is a change of DESTINATION: the same click that used to push
 * `/w/:ws/p/:projectId?ticket=…` now pushes `?ticket=` on the page the reader is
 * already on, and mounts the sheet there. Every arm below is therefore about one
 * of three things a component-level test cannot see:
 *
 * 1. **Where the click GOES** (13.1391, 13.1392, 13.1393) — read off the router
 *    mock, which is the only instrument in jsdom that can tell "opened in place"
 *    from "navigated away and opened there".
 * 2. **Which project's names and files the sheet is given** (13.1394, 13.1396) —
 *    My work spans projects, so every project-scoped prop has to come from the
 *    OPEN TICKET, and a wrong answer here is not a layout bug: it is another
 *    project's name over this ticket's history.
 * 3. **The state that survives a reload** (13.1392) — the whole reason the open
 *    ticket lives in the URL rather than in `useState`.
 *
 * `MyWork` (the view) is deliberately not touched by any of this: it still takes
 * one `onOpenTicket(ticketId)` and stays ignorant of what opening means, so
 * `packages/app-core/test/views/my-work.test.tsx` remains the file that proves
 * every section's button calls it.
 *
 * ⚠ **The search params are MUTABLE on purpose.** `router.push` is mocked and
 * does not feed back into them — a mock that rewrote its own state would be
 * simulating Next's router rather than measuring what this page asked it to do.
 * So the arms that need the sheet ON SCREEN set the param and re-render, which
 * is exactly what the router's landing produces; the arms that assert the PUSH
 * read the mock instead.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECTSHOPFLOOR000000';
const OTHER_PROJECT = '01J9PROJECTSIBLING00000000';
const WORKSPACE_NAME = 'Garo Hills Logistics';
const PROJECT_NAME = 'Shop floor';
const OTHER_PROJECT_NAME = 'Sibling project';

const ASSIGNED = '01J9TICKETASSIGNED00000000';
const SHARED = '01J9TICKETSHARED0000000000';
const ATTENTION = '01J9TICKETATTENTION0000000';
const PARENT = '01J9TICKETPARENT000000000';

const ASSIGNED_TITLE = 'File the GST return';
const SHARED_TITLE = 'Countersign the sibling lease';
const ATTENTION_TITLE = 'Chase the blocked delivery';
const PARENT_TITLE = 'Registrations';

const ANSELMA = '01J9USER000000000000000000';

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE }),
  usePathname: () => `/w/${WORKSPACE}/my-work`,
  useSearchParams: () => searchParams,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: ANSELMA, name: 'Anselma Marak' } },
      isPending: false,
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import MyWorkPage from '../app/w/[workspaceId]/my-work/page.js';

const CLAIM = {
  actorId: ANSELMA,
  actorName: 'Anselma Marak',
  clientTime: '2026-09-23T07:00:00.000Z',
  serverTime: '2026-09-23T07:00:01.000Z',
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

/** One row of any of the three `WorkItem` sections. */
function workItem(over: Partial<WorkItem> & { ticketId: string; title: string }): WorkItem {
  return {
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    projectName: PROJECT_NAME,
    stateId: 'todo',
    stateName: 'To do',
    stateCategory: 'open',
    stateProvenance: CLAIM,
    dueDate: null,
    ...over,
  };
}

function attentionItem(over: Partial<AttentionItem> & { ticketId: string; title: string }): AttentionItem {
  return {
    kind: 'blocked',
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    reason: 'nothing has moved it for nine days',
    claim: null,
    ...over,
  };
}

function emptyView(over: Partial<MyWorkView> = {}): MyWorkView {
  return { assigned: [], inTransit: [], contested: [], shared: [], ...over };
}

/**
 * The full-fidelity `TicketRead` the sheet is built for — every field the
 * component reads, none of them defaulted, the same recipe
 * `sheet-delete.test.tsx` uses for the same reason: a partial fixture makes the
 * SHEET the thing under test, and this file is about the page.
 */
function ticketRead(spec: {
  id: string;
  title: string;
  projectId: string;
  parent?: TicketRead['parent'];
}): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket',
    id: spec.id,
    workspaceId: WORKSPACE,
    projectId: spec.projectId,
    typeId: 'task',
    parentId: spec.parent?.id ?? null,
    workflowId: WF.id,
    workflowVersion: WF.version,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {
      title: {
        value: spec.title,
        actorId: ANSELMA,
        clientTime: '2026-09-23T07:00:00.000Z',
        serverTime: '2026-09-23T07:00:01.000Z',
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
    parent: spec.parent ?? null,
    rollup: null,
    key: null,
    epic: null,
  };
}

/**
 * **A TICKET'S OWN PROJECT IS WHAT THE SHEET IS TOLD**, so this factory answers
 * by ID: the two rows in the fixture below sit in two different projects, and an
 * arm that read the project from anywhere but the open ticket would still get a
 * plausible ticket back — which is precisely the defect 13.1394 is written to
 * catch.
 */
function ticketFor(id: string): TicketRead {
  if (id === SHARED) {
    return ticketRead({ id: SHARED, title: SHARED_TITLE, projectId: OTHER_PROJECT });
  }
  if (id === ATTENTION) {
    return ticketRead({ id: ATTENTION, title: ATTENTION_TITLE, projectId: OTHER_PROJECT });
  }
  if (id === PARENT) {
    return ticketRead({ id: PARENT, title: PARENT_TITLE, projectId: OTHER_PROJECT });
  }
  return ticketRead({ id: ASSIGNED, title: ASSIGNED_TITLE, projectId: PROJECT });
}

function workspaceRow() {
  return {
    id: WORKSPACE,
    name: WORKSPACE_NAME,
    // The ticket key's first half. REQUIRED: `mapWorkspaceRefs` reads it as a
    // plain string and refuses an absent one, so a stub without it takes the
    // page down and reads as a layout failure.
    prefix: 'GH',
    role: 'owner',
    archived: false,
    memberCount: 1,
    nameRestrictedProjectCount: 0,
    projects: [
      { id: PROJECT, name: PROJECT_NAME, prefix: 'SF', archived: false, ticketCount: 1, blockedCount: 0 },
      {
        id: OTHER_PROJECT,
        name: OTHER_PROJECT_NAME,
        prefix: 'ET',
        archived: false,
        ticketCount: 1,
        blockedCount: 0,
      },
    ],
  };
}

const upload = (filename: string): AttachmentListEntry => ({
  kind: 'upload',
  attachmentId: `01J9ATTACHMENT${filename}`,
  filename,
  mime: 'application/pdf',
  size: 1024,
  sha256: null,
});

/** What the page did, counted — the only instrument jsdom has for "re-asked". */
type Counters = {
  myWork: number;
  attention: number;
  attachmentReads: string[];
};

function mount(
  opts: {
    view?: MyWorkView;
    attention?: AttentionItem[];
    attachments?: (ticketId: string) => AttachmentListEntry[];
    ticket?: (ticketId: string) => TicketRead;
    locate?: (workspaceId: string, ticketId: string) => Promise<
      { workspaceId: string; projectId: string } | null
    >;
  } = {},
): { services: AppServices; counters: Counters } {
  const counters: Counters = { myWork: 0, attention: 0, attachmentReads: [] };
  const view = opts.view ?? emptyView({ assigned: [workItem({ ticketId: ASSIGNED, title: ASSIGNED_TITLE })] });
  const services = stubServices(
    {
      getMyWork: async () => {
        counters.myWork += 1;
        return view;
      },
      getAttention: async () => {
        counters.attention += 1;
        return opts.attention ?? [];
      },
      getTicket: async (_workspaceId, ticketId) => (opts.ticket ?? ticketFor)(ticketId),
      getTicketAttachments: async (_workspaceId, ticketId) => {
        counters.attachmentReads.push(ticketId);
        return (opts.attachments ?? (() => []))(ticketId);
      },
      getMyWorkspaces: async () => [workspaceRow()],
      getWorkflowDef: async () => WF,
      getTicketHistory: async () => [],
      getTicketComments: async () => [],
      getMembers: async () => [{ id: ANSELMA, name: 'Anselma Marak', role: 'owner' }],
      getTickets: async () => ({ projectId: PROJECT, rows: [] }),
    },
    {
      ticketLocation: {
        locate:
          opts.locate ?? (async (workspaceId: string) => ({ workspaceId, projectId: OTHER_PROJECT })),
      },
    },
  );
  // A REAL cache: `stubServices`'s is a deliberate null-object and the sheet's
  // transition precheck reads it — a null-object here is a failure dressed as a
  // fixture.
  services.cache = createClientStateCache();
  return { services, counters };
}

/** Render the page, then land the router on `ticket` the way `push` would. */
async function openByClicking(
  button: string,
  view: ReturnType<typeof render>,
  services: AppServices,
  regionName?: string,
): Promise<void> {
  // Both queries are ASYNC: the sections arrive from a read, so a synchronous
  // lookup here would race the page's own render.
  const target =
    regionName === undefined
      ? await screen.findByRole('button', { name: button })
      : await within(await screen.findByRole('region', { name: regionName })).findByRole(
          'button',
          { name: button },
        );
  await userEvent.click(target);
  searchParams = new URLSearchParams({ ticket: ticketIdFor(button) });
  view.rerender(
    <Providers services={services}>
      <MyWorkPage />
    </Providers>,
  );
}

/**
 * The title of the ticket the sheet is showing — read off the sheet's own title
 * CONTROL rather than as text, because `gn-ticket-sheet__title-input` is an
 * `<input>` carrying the title as its value, so a `getByText` fails against a
 * perfectly open sheet.
 *
 * ⚠ It is AWAITED, and that is not tidiness. The sheet mounts IMMEDIATELY on the
 * param — before its read answers — drawing `Loading…` under the generic title
 * "Ticket", so a synchronous `getByLabelText('Ticket title')` races the read and
 * passes or fails on timing. `findBy*` waits for the real title to arrive.
 */
async function openedTicketTitle(sheet: HTMLElement): Promise<string> {
  const input = await within(sheet).findByLabelText('Ticket title');
  return (input as HTMLInputElement).value;
}

function ticketIdFor(title: string): string {
  if (title === ASSIGNED_TITLE) return ASSIGNED;
  if (title === SHARED_TITLE) return SHARED;
  if (title === ATTENTION_TITLE) return ATTENTION;
  return PARENT;
}

beforeEach(() => {
  push.mockClear();
  searchParams = new URLSearchParams();
});

afterEach(() => {
  // The workspace name is MODULE-cached (`use-workspace-name.ts`) and jsdom
  // modules are shared across the cases in one file — a cached name would make
  // the second case's crumbs appear synchronously and hide a regression in the
  // read they come from.
  clearWorkspaceNameCache();
});

describe('13.1391 opening a ticket from My work opens the sheet THERE', () => {
  it('13.1391 the click keeps the reader on My work, and the sheet opens on the page under them', async () => {
    const { services } = mount();
    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const region = await screen.findByRole('region', { name: 'Assigned to me' });
    await userEvent.click(
      await within(region).findByRole('button', { name: ASSIGNED_TITLE }),
    );

    // THE ROUTE. Exactly one push, and it is this page's own path carrying the
    // ticket as a param — which is what "opens here" means in a router the test
    // drives. `toHaveBeenCalledTimes(1)` is the load-bearing half: the defect
    // this case exists for is a SECOND push to the project page.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}/my-work?ticket=${ASSIGNED}`, {
        scroll: false,
      }),
    );
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalledWith(
      expect.stringContaining('/p/'),
      expect.anything(),
    );

    // AND THE SHEET IS ON THAT PAGE. The push above has not been applied (the
    // mock does not simulate Next's router — see the file docblock), so this is
    // the landing.
    searchParams = new URLSearchParams({ ticket: ASSIGNED });
    view.rerender(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const sheet = await screen.findByRole('dialog');
    // The title, read off the sheet's own title CONTROL: `gn-ticket-sheet__title-input`
    // is an `<input>` carrying the title as its value, so `getByText` fails
    // against a perfectly open sheet.
    expect(await openedTicketTitle(sheet)).toBe(ASSIGNED_TITLE);
    // …and the reader is still on My work, which is the whole request: the page
    // they were on is still the page they are on.
    expect(screen.getByRole('heading', { name: 'My work' })).toBeInTheDocument();
  });

  /**
   * CONTROL, in its own case rather than an arm of the one above: without it,
   * "the sheet opened" would also be satisfied by a page that renders a sheet
   * unconditionally — a different bug from the one the owner reported, and one
   * that would delete the page's own subject.
   */
  it('13.1393 CONTROL: with no ?ticket= param the page renders no sheet at all', async () => {
    const { services } = mount();
    render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );
    // The page has LOADED — asserted on what it certainly renders — so the
    // absence below is a page that chose not to draw a sheet, not one that had
    // not rendered yet.
    await screen.findByRole('heading', { name: 'My work' });
    await screen.findByRole('region', { name: 'Assigned to me' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('13.1392 the open ticket lives in the URL, so a reload opens the same sheet', () => {
  it('13.1392 a page loaded on ?ticket= mounts the sheet with no navigation at all', async () => {
    // THE ARM THE PARAM DECISION IS FOR. A link a person sent to somebody else —
    // or their own reload — reaches the page with the ticket already named, and
    // the sheet is there. Component state cannot do this: it starts empty on
    // every mount.
    searchParams = new URLSearchParams({ ticket: ASSIGNED });
    const { services } = mount();
    render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(ASSIGNED_TITLE);
    // No push: landing on a URL is not a navigation, and a page that pushed on
    // mount would fight the reader's back button.
    expect(push).not.toHaveBeenCalled();
  });

  it('13.1395 closing the sheet is the param’s removal, and it stays on My work', async () => {
    searchParams = new URLSearchParams({ ticket: ASSIGNED });
    const { services } = mount();
    render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Close sheet' }));

    // One push, to this page's path with NO param — the sheet's own definition
    // of closed — and not to the project page, which is where a close would have
    // to go if the sheet were living somewhere else.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}/my-work`, { scroll: false }),
    );
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('13.1394 the sheet’s project-scoped props come from the OPEN TICKET', () => {
  it('13.1394 a ticket in another project gets THAT project’s name and href, not the page’s first row', async () => {
    // Two rows, two projects, and the second one clicked. My work spans
    // projects, so a page that resolved "the project" once — from the first
    // section, or from the row it happened to find first — would put the WRONG
    // project's name over this ticket and link the crumb into a board the ticket
    // is not on.
    const { services } = mount({
      view: emptyView({
        assigned: [workItem({ ticketId: ASSIGNED, title: ASSIGNED_TITLE })],
        shared: [
          workItem({
            ticketId: SHARED,
            title: SHARED_TITLE,
            projectId: OTHER_PROJECT,
            projectName: OTHER_PROJECT_NAME,
          }),
        ],
      }),
    });
    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    await openByClicking(SHARED_TITLE, view, services, 'Shared with me');

    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(SHARED_TITLE);

    // The bar names the server's own names for the OPEN ticket's workspace and
    // project, and the project crumb is an ADDRESS — the href is the assertion,
    // because a crumb that read the right name and linked to the wrong board
    // would be the same defect one step along.
    const bar = await screen.findByRole('navigation', { name: 'Ticket location' });
    expect(within(bar).getByRole('link', { name: WORKSPACE_NAME })).toHaveAttribute(
      'href',
      `/w/${WORKSPACE}`,
    );
    expect(within(bar).getByRole('link', { name: OTHER_PROJECT_NAME })).toHaveAttribute(
      'href',
      `/w/${WORKSPACE}/p/${OTHER_PROJECT}`,
    );
    // AND NOT THE OTHER ROW'S PROJECT. Without this arm the assertion above is
    // satisfied by any bar that happens to name both projects.
    expect(within(bar).queryByRole('link', { name: PROJECT_NAME })).toBeNull();
  });
});

describe('13.1396 the open ticket’s files are keyed per ticket', () => {
  it('13.1396 swapping ?ticket= in place re-asks for the files, and the previous ticket’s do not survive', async () => {
    // The project page's own mount records this as a ruling (P17): the key
    // carries the ticket id so the next ticket refetches rather than showing the
    // previous one's files under its heading. On My work the swap is REACHABLE
    // WITHOUT LEAVING THE PAGE — the sheet's parent chip does it in place — so
    // the page never unmounts to hide the mistake.
    searchParams = new URLSearchParams({ ticket: ASSIGNED });
    const { services, counters } = mount({
      view: emptyView({
        assigned: [workItem({ ticketId: ASSIGNED, title: ASSIGNED_TITLE })],
        shared: [
          workItem({
            ticketId: SHARED,
            title: SHARED_TITLE,
            projectId: OTHER_PROJECT,
            projectName: OTHER_PROJECT_NAME,
          }),
        ],
      }),
      attachments: (ticketId) =>
        ticketId === SHARED ? [upload('sibling-lease.pdf')] : [upload('shop-floor-gst.pdf')],
    });
    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const sheet = await screen.findByRole('dialog');
    // The files live behind the sheet's OWN third tab (owner ruling, 2026-09-22
    // — spec decision 5), so the list is not on screen until it is opened. The
    // tab is opened ONCE: the sheet stays mounted across the swap below, which
    // is the point of the case.
    await waitFor(() =>
      expect(screen.getByRole('tablist', { name: 'Ticket sections' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
    expect(
      await within(sheet).findByRole('link', { name: 'shop-floor-gst.pdf' }),
    ).toBeInTheDocument();

    // The swap, as the router's landing produces it: a NEW param on the same
    // mounted page.
    searchParams = new URLSearchParams({ ticket: SHARED });
    view.rerender(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    const swapped = await screen.findByRole('dialog');
    expect(await openedTicketTitle(swapped)).toBe(SHARED_TITLE);
    expect(
      await within(swapped).findByRole('link', { name: 'sibling-lease.pdf' }),
    ).toBeInTheDocument();
    // THE HALF THE SHEET CANNOT COVER FOR: the first ticket's file must be GONE,
    // not merely joined by the second's.
    expect(within(swapped).queryByRole('link', { name: 'shop-floor-gst.pdf' })).toBeNull();
    // The read really was re-asked, rather than the DOM being an accident of
    // which entries arrived.
    expect(counters.attachmentReads).toEqual([ASSIGNED, SHARED]);
  });
});

describe('13.1397 the sheet’s parent chip opens the parent HERE', () => {
  it('13.1397 the parent chip swaps ?ticket= in place, and a parent in another project is placed by the locator', async () => {
    // `TicketSheet`'s `Subtask of {parent}` chip needs a project for a parent
    // the chip's own read cannot carry (`ParentRef` is `{kind, id, title}`), and
    // the project page answers that by NAVIGATING (`openParentTicket`). On this
    // page the chip goes through the page's own `openTicket`, so the reader
    // stays where they are and the same resolver that places a contested claim
    // places the parent — which is what makes a CROSS-PROJECT parent work
    // without leaving My work.
    const locate = vi.fn(async (workspaceId: string) => ({ workspaceId, projectId: OTHER_PROJECT }));
    const { services } = mount({
      // The two tickets are given DIFFERENT titles and different projects, so
      // "the parent's sheet opened" is a measurement rather than a coincidence
      // of one fixture answering for both ids.
      ticket: (ticketId) =>
        ticketId === PARENT
          ? ticketRead({ id: PARENT, title: PARENT_TITLE, projectId: OTHER_PROJECT })
          : ticketRead({
              id: ASSIGNED,
              title: ASSIGNED_TITLE,
              projectId: PROJECT,
              parent: { kind: 'ticket', id: PARENT, title: PARENT_TITLE },
            }),
      locate,
    });
    searchParams = new URLSearchParams({ ticket: ASSIGNED });
    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    await screen.findByRole('dialog');
    const bar = await screen.findByRole('navigation', { name: 'Ticket location' });
    // A CONTROL AND NOT A CONVENIENCE: the chip is only a button because this
    // mount passes `onOpenTicket` — with none it renders as the plain pill, so
    // "the chip is a control" is itself the assertion that the prop is wired.
    await userEvent.click(within(bar).getByRole('button', { name: PARENT_TITLE }));

    expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}/my-work?ticket=${PARENT}`, {
      scroll: false,
    });
    expect(push).toHaveBeenCalledTimes(1);

    // The parent is in NO section of this page's view, so it is placed the way
    // the contested section is: asked of the locator, in place.
    searchParams = new URLSearchParams({ ticket: PARENT });
    view.rerender(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );
    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(PARENT_TITLE);
    await waitFor(() => expect(locate).toHaveBeenCalledWith(WORKSPACE, PARENT));
    // The locator's answer is what the crumb carries — the whole reason the
    // parent is asked about at all.
    const parentBar = await screen.findByRole('navigation', { name: 'Ticket location' });
    expect(within(parentBar).getByRole('link', { name: OTHER_PROJECT_NAME })).toHaveAttribute(
      'href',
      `/w/${WORKSPACE}/p/${OTHER_PROJECT}`,
    );
  });
});

describe('13.1398 the attention strip’s rows open here too, without asking the server', () => {
  it('13.1398 an attention row is placed from the view (the locator is never asked)', async () => {
    // `AttentionStrip` sits on THIS page and shares the page's `openTicket`, so
    // the owner's request covers it as much as the four sections do. Its rows
    // carry a `projectId` — the resolver reads them for the same reason it reads
    // the `WorkItem[]` sections — so this click needs no round trip, and the
    // locator being UNASKED is the assertion that says so.
    const locate = vi.fn(async () => null);
    const { services } = mount({
      view: emptyView({}),
      attention: [attentionItem({ ticketId: ATTENTION, title: ATTENTION_TITLE })],
      locate,
    });
    const view = render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    await openByClicking(ATTENTION_TITLE, view, services);

    const sheet = await screen.findByRole('dialog');
    expect(await openedTicketTitle(sheet)).toBe(ATTENTION_TITLE);
    // A resolver that had to ask would have opened the sheet one round trip
    // later — or, with this refusing locator, never.
    expect(locate).not.toHaveBeenCalled();
  });
});

describe('13.1399 an ended session mounts no sheet', () => {
  it('13.1399 with both reads refusing a 401, the page says so and asks nobody where the ticket is', async () => {
    // The project page's mount gates its sheet on `!expired` and records why a
    // writing surface over a dead session is a refusal the reader has to read
    // twice. This page's mount is new code, so the term is new code: without it
    // a `?ticket=` link opened on an expired session would mount the sheet AND
    // fire a locate at a server that will answer 401 — an error sentence about
    // the wrong thing, over a page whose real message is "sign in again".
    const locate = vi.fn(async () => null);
    const services = stubServices(
      {
        getMyWork: async () => {
          throw new Error('HTTP 401 for /v1/me/work');
        },
        getAttention: async () => {
          throw new Error('HTTP 401 for /v1/me/work/attention');
        },
      },
      { ticketLocation: { locate } },
    );
    searchParams = new URLSearchParams({ ticket: ASSIGNED });
    render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Your session has ended');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(locate).not.toHaveBeenCalled();
  });
});

describe('13.1400 a My work deletion leaves the view', () => {
  it('13.1400 the sheet’s committed delete re-asks BOTH of this page’s reads', async () => {
    // `TicketSheet` emits `ticket.deleted`, closes itself, and hands the
    // committed fact to its host. The host owns the CORRECTION, and the reason
    // is measured rather than stylistic — with the workspace stream absent the
    // view still showed a row the deletion had just committed, which is the
    // defect the project page's own handler records. This page has two reads and
    // both hold the row, so both are re-asked.
    const ingested: SubmittedEvent[][] = [];
    searchParams = new URLSearchParams({ ticket: ASSIGNED });
    const { services, counters } = mount();
    services.dataSource = {
      ...services.dataSource,
      // A COMMIT-shaped answer. `stubServices`'s own `ingest` answers ZERO
      // results for one event, which is the sheet's transport-error arm — the
      // delete would never commit and this case would be about nothing.
      ingest: async (events: SubmittedEvent[]) => {
        ingested.push(events);
        return events.map((event) => ({
          status: 'committed' as const,
          eventId: event.id,
          seq: 1,
          serverTime: '2026-09-23T08:00:00.000Z',
        }));
      },
    };
    render(
      <Providers services={services}>
        <MyWorkPage />
      </Providers>,
    );

    await screen.findByRole('dialog');
    const before = { ...counters };

    // The footer's Delete is TWO presses since ruling E2-35, and the confirm is
    // queried by its OWN name: the sheet is a `role="dialog"` too, so an unnamed
    // query finds two.
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete ticket' }));

    // The delete really committed — the precondition for the correction below.
    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]![0]!.type).toBe('ticket.deleted');

    await waitFor(() => expect(counters.myWork).toBeGreaterThan(before.myWork));
    expect(counters.attention).toBeGreaterThan(before.attention);
  });
});

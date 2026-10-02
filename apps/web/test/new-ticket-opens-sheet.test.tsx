import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IngestResult,
  SubmittedEvent,
  TicketState,
  TicketTypeDef,
  WorkflowDef,
} from '@gisik-nokma/domain';
import type { TicketRead } from '@gisik-nokma/app-core';

/**
 * 13.1369 (owner request 2026-09-23) — **CREATING A TICKET OPENS IT.**
 *
 * ## Why this case exists at all: the ask was a measurement, not a build
 *
 * The owner asked for the sheet to open on a ticket the moment it is created,
 * and the wiring for it was ALREADY PRESENT end to end — measured before
 * anything was written, and this file is that measurement turned into a case:
 *
 * - `create-ticket-flow.tsx` calls `onCreated(createdId)` on a committed create;
 * - `page.tsx` passes `onCreated={openTicket}`;
 * - `openTicket` is `router.push(…?ticket=<id>, { scroll: false })`;
 * - the sheet is driven by that search param (`openTicketId =
 *   searchParams.get('ticket')`), which is what `{openTicketId !== null && !expired
 *   ? <TicketSheet … /> : …}` reads.
 *
 * **Nothing pinned it.** That is the whole reason the ask read as a missing
 * feature: an unpinned path is one refactor away from being a missing one, and
 * nobody could tell the two apart by looking at the app.
 *
 * ## What this case WITNESSES, and what it deliberately does not
 *
 * **It witnesses the CLIENT half**, and it does so on the ROUTED page rather
 * than on the sheet mounted directly: a real create through the real dialog
 * reaches `router.push`, and the id it pushes is read back off the
 * `ticket.created` envelope that was actually ingested — so the URL cannot name
 * a ticket other than the one the ledger just received. Then the sheet is
 * opened from that param and its title is read off the screen.
 *
 * ⚠ **It does NOT witness the SERVER half, and that distinction is the point.**
 * `getTicket` is stubbed here, so "the sheet answered" means "the sheet renders
 * when its read answers" — it says nothing about whether a read against a live
 * server, issued moments after the create, sees the row. That is the same
 * question the owner's separately-reported live-update defect asks (a created
 * ticket not appearing without a manual reload), it is being investigated
 * elsewhere, and this case must not be read as evidence about it either way.
 *
 * ⚠ Nor is it a layout check: jsdom has no engine, so "the sheet is open" is
 * asserted as the sheet's own content being in the DOM.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const ANSELMA = '01J9USER000000000000000000';

const push = vi.fn();
/**
 * The search params, MUTABLE — the whole measurement depends on it. The routed
 * page reads `?ticket=` to decide whether to open the sheet, so a fixed-empty
 * `URLSearchParams` would make "the sheet opened" unobservable, which is how
 * this path stayed unpinned in the first place.
 *
 * The mock does NOT feed `push` back into it: nothing here re-navigates, and a
 * mock that rewrote its own state would be simulating Next's router rather than
 * measuring what the page asked it to do — which is the assertion below.
 */
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => searchParams,
}));

let session: { data: { user: { id: string; name: string } } | null; isPending: boolean } = {
  data: { user: { id: ANSELMA, name: 'Anselma Marak' } },
  isPending: false,
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { stubServices, EMPTY_PREFERENCES } from './helpers/stub-services.js';
import { Providers } from '../src/providers.js';
import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';


const WF: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [],
} as unknown as WorkflowDef;

/**
 * One root-legal type. NOT an empty list: `defaultRootTypeFor` answers `null`
 * when every type needs a parent, the dialog then starts with no type chosen and
 * `Create` is DISABLED — so an empty ladder would have made this measurement
 * report "a create does not open the sheet" when in fact no create was possible.
 */
const TYPES: TicketTypeDef[] = [
  { id: 'task', name: 'Task', rank: 3, workflowId: WF.id, fields: [] } as unknown as TicketTypeDef,
];

function ticketState(): TicketState {
  return {
    kind: 'ticket',
    id: 'unused',
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    typeId: 'task',
    parentId: null,
    workflowId: WF.id,
    workflowVersion: 1,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {},
    transitions: [],
    closed: null,
  } as unknown as TicketState;
}

function ticketRead(title: string): TicketRead {
  return {
    ticket: { ...ticketState(), fields: { title: { value: title, actorId: ANSELMA, clientTime: '2026-09-23T07:00:00.000Z', serverTime: '2026-09-23T07:00:00.000Z' } } },
    title,
    stateProvenance: {
      actorId: ANSELMA,
      actorName: 'Anselma Marak',
      clientTime: '2026-09-23T07:00:00.000Z',
      serverTime: '2026-09-23T07:00:01.000Z',
    },
    assignedProvenance: null,
    visibility: null,
    parent: null,
    rollup: null,
    key: null,
    epic: null,
  } as unknown as TicketRead;
}

beforeEach(() => {
  push.mockClear();
  searchParams = new URLSearchParams();
});

/** The page header's primary "Create ticket"; an empty board draws a second one (the banner's). */
const headerCreateTicket = async (): Promise<HTMLElement> => {
  const all = await screen.findAllByRole('button', { name: 'Create ticket' });
  const header = all.find((el) => el.classList.contains('gn-button--primary'));
  if (header === undefined) throw new Error('no primary Create ticket button');
  return header;
};

describe('13.1369 creating a ticket opens it', () => {
  it('13.1369 a committed create pushes the NEW TICKET’S OWN ID as ?ticket=, and the sheet opens on it', async () => {
    const ingested: SubmittedEvent[] = [];
    const services = stubServices({
      getBoard: async () => ({ projectId: PROJECT, groups: [] }),
      getTickets: async () => ({ projectId: PROJECT, rows: [] }),
      getTicketTypes: async () => TYPES,
      getPreferences: async () => EMPTY_PREFERENCES,
      getTicket: async () => ticketRead('Order the new sign'),
      getWorkflowDef: async () => WF,
      getTicketHistory: async () => [],
      getMembers: async () => [{ id: ANSELMA, name: 'Anselma Marak', role: 'owner' }],
    });
    services.dataSource.ingest = async (events: SubmittedEvent[]): Promise<IngestResult[]> => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T07:00:00.000Z',
      }));
    };

    const view = render(<Providers services={services}><ProjectPage /></Providers>);
    const user = userEvent.setup();
    // The HEADER's button — an empty board also draws a banner button of the same name (BRD-19).
    await user.click(await headerCreateTicket());
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Order the new sign' } });
    await user.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    // ARM ONE — the id the page pushed is the id the ledger received. Read back
    // off the INGESTED ENVELOPE rather than asserted as "some string", because
    // the two can disagree: a client that pushed a freshly-minted id of its own
    // would satisfy a shape check and open a ticket nobody created.
    const created = ingested.find((event) => event.type === 'ticket.created');
    expect(created).toBeDefined();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/${WORKSPACE}/p/${PROJECT}?ticket=${created!.entity.id}`,
        { scroll: false },
      ),
    );

    // ARM TWO — the sheet actually opens on that param. The page is re-rendered
    // with it set, which is what `router.push` produces once Next's router lands
    // — the step the mock above deliberately does not simulate.
    searchParams = new URLSearchParams({ ticket: created!.entity.id });
    view.rerender(<Providers services={services}><ProjectPage /></Providers>);

    const sheet = await screen.findByRole('dialog');
    // The ticket's title, read off the sheet's own title CONTROL rather than as
    // text — `gn-ticket-sheet__title-input` is an `<input>` carrying the title as
    // its value, so a `getByText` here would fail against a perfectly open sheet
    // (measured, 2026-09-23).
    expect(within(sheet).getByLabelText('Ticket title')).toHaveValue('Order the new sign');
    // …and it is the TICKET, not the dialog we were just in: the create form is
    // gone, so "the sheet opened" cannot be satisfied by the modal that was
    // already on screen.
    expect(screen.queryByRole('dialog', { name: 'Create ticket' })).toBeNull();
  });

  it('13.1369 CONTROL: with no ?ticket= param, no sheet renders — so the arm above is not reading a page that always shows one', async () => {
    // Without this, the case above passes against a page that renders a sheet
    // unconditionally, which would be a very different bug from the one the
    // owner asked about.
    const services = stubServices({
      getBoard: async () => ({ projectId: PROJECT, groups: [] }),
      getTickets: async () => ({ projectId: PROJECT, rows: [] }),
      getTicketTypes: async () => TYPES,
      getPreferences: async () => EMPTY_PREFERENCES,
      getTicket: async () => ticketRead('Order the new sign'),
      getWorkflowDef: async () => WF,
      getTicketHistory: async () => [],
      getMembers: async () => [{ id: ANSELMA, name: 'Anselma Marak', role: 'owner' }],
    });
    render(<Providers services={services}><ProjectPage /></Providers>);
    // The page has loaded — asserted on something it certainly renders — so the
    // absence below is a page that chose not to draw a sheet, not one that had
    // not rendered yet.
    await headerCreateTicket();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import type { BoardCard, BoardView, TicketRead } from '@gisik-nokma/app-core';

/**
 * The project page wires the optimistic board (smoothness T7 FIX 1, F5 P1–P4 and F3; cases 25.114, 25.104): a create
 * with an open answer shows the ghost on the board; a committed answer reloads the board and the real card replaces
 * it; a refusal removes it and reopens the dialog; and the sheet opened from a board card starts its workflow read
 * before its ticket read answers. Mounted the way `new-ticket-opens-sheet.test.tsx` and
 * `backlog-start-optimistic.test.tsx` mount the page — the wiring the component suites cannot see.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const USER = '01J9USER000000000000000000';

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000', projectId: '01J9PROJECT000000000000000' }),
  usePathname: () => '/w/01J9WORKSPACE0000000000000/p/01J9PROJECT000000000000000',
  useSearchParams: () => searchParams,
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { Providers } from '../src/providers.js';
import { EMPTY_PREFERENCES, stubServices } from './helpers/stub-services.js';
import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

beforeEach(() => {
  searchParams = new URLSearchParams();
});
afterEach(cleanup);

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
const TYPES: TicketTypeDef[] = [{ id: 'task', name: 'Task', rank: 3, workflowId: WF.id, fields: [] } as unknown as TicketTypeDef];

const PROVENANCE = { actorId: USER, actorName: 'Kiro', clientTime: '2026-10-02T07:00:00.000Z', serverTime: '2026-10-02T07:00:01.000Z' };
const card = (ticketId: string, title: string, key: string | null): BoardCard => ({
  ticketId,
  title,
  typeId: 'task',
  assignee: null,
  stateProvenance: PROVENANCE,
  cause: null,
  rollup: null,
  dueDate: null,
  priority: { value: 'P2', claim: PROVENANCE },
  key,
  pending: false,
  parent: null,
  epic: null,
});
const boardOf = (cards: BoardCard[]): BoardView => ({
  projectId: PROJECT,
  groups: [
    {
      workflowId: WF.id,
      workflowVersion: 1,
      workflowName: 'Errand',
      columns: [
        { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards },
        { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [] },
        { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: true, cards: [] },
      ],
    },
  ],
});

function deferred() {
  let resolve!: (results: IngestResult[]) => void;
  const promise = new Promise<IngestResult[]>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A project whose board answers `cards` (a mutable list: the test says when the server "has" the new ticket). */
function world(cards: { list: BoardCard[] }) {
  const sent: SubmittedEvent[] = [];
  const writes: Array<ReturnType<typeof deferred>> = [];
  const getBoard = vi.fn(async () => boardOf(cards.list));
  const services = stubServices({
    getBoard,
    getTickets: async () => ({ projectId: PROJECT, rows: [] }),
    getTicketTypes: async () => TYPES,
    getPreferences: async () => EMPTY_PREFERENCES,
    getWorkflowDef: async () => WF,
    getTicketHistory: async () => [],
    getMembers: async () => [{ id: USER, name: 'Kiro', role: 'owner' }],
  });
  services.dataSource.ingest = async (events: SubmittedEvent[]) => {
    sent.push(...events);
    const write = deferred();
    writes.push(write);
    return write.promise;
  };
  return { services, sent, writes, getBoard };
}

const headerCreateTicket = async (): Promise<HTMLElement> => {
  const all = await screen.findAllByRole('button', { name: 'Create ticket' });
  const header = all.find((el) => el.classList.contains('gn-button--primary'));
  if (header === undefined) throw new Error('no primary Create ticket button');
  return header;
};

/** Open the dialog, type a title, start it on the board (not the Backlog) and press Create. */
async function createOnBoard(title: string) {
  const user = userEvent.setup();
  await user.click(await headerCreateTicket());
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } });
  await user.click(screen.getByLabelText('Starts in the backlog?'));
  await user.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
}

const created = (sent: SubmittedEvent[]) => sent.find((event) => event.type === 'ticket.created')!;

describe('25.114 the project page draws the pending create on its board', () => {
  it('25.114 a create with an OPEN answer shows the ghost on the board (busy, key "…") and closes the dialog; the board holds nothing else new', async () => {
    const cards = { list: [card('tk_a', 'Existing', 'CC-1')] };
    const { services, sent, writes } = world(cards);
    render(<Providers services={services}><ProjectPage /></Providers>);
    // Control: the board has its one card and nothing is busy.
    await screen.findByText('Existing');
    expect(document.querySelectorAll('[aria-busy="true"][data-testid^="ticket-card-"]')).toHaveLength(0);
    await createOnBoard('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    const ghost = await screen.findByTestId(`ticket-card-${created(sent).entity.id}`);
    expect(ghost).toHaveAttribute('aria-busy', 'true');
    expect(within(ghost).getByText('Buy milk')).toBeInTheDocument();
    expect(within(ghost).getByText('…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Create ticket' })).toBeNull();
  });

  it('25.114 a COMMITTED answer reloads the board and the real card replaces the ghost', async () => {
    const cards = { list: [card('tk_a', 'Existing', 'CC-1')] };
    const { services, sent, writes, getBoard } = world(cards);
    render(<Providers services={services}><ProjectPage /></Providers>);
    await screen.findByText('Existing');
    await createOnBoard('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    const id = created(sent).entity.id;
    await screen.findByTestId(`ticket-card-${id}`);
    const readsBefore = getBoard.mock.calls.length;
    // The server now has the ticket; the answer is committed.
    cards.list = [card('tk_a', 'Existing', 'CC-1'), card(id, 'Buy milk', 'CC-9')];
    writes[0]!.resolve([{ status: 'committed', eventId: created(sent).id, seq: 7, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult]);
    // The page re-read the board, and the one card with that id is the REAL one (its key, no busy mark).
    await waitFor(() => expect(getBoard.mock.calls.length).toBeGreaterThan(readsBefore));
    await screen.findByText('CC-9');
    expect(screen.getAllByTestId(`ticket-card-${id}`)).toHaveLength(1);
    expect(screen.getByTestId(`ticket-card-${id}`)).not.toHaveAttribute('aria-busy');
  });

  it('25.114 a REFUSAL removes the ghost and reopens the dialog with the typed title', async () => {
    const cards = { list: [card('tk_a', 'Existing', 'CC-1')] };
    const { services, sent, writes } = world(cards);
    render(<Providers services={services}><ProjectPage /></Providers>);
    await screen.findByText('Existing');
    await createOnBoard('Buy milk');
    await waitFor(() => expect(writes).toHaveLength(1));
    const id = created(sent).entity.id;
    // Control: the ghost is there before the answer.
    await screen.findByTestId(`ticket-card-${id}`);
    writes[0]!.resolve([{ status: 'refused', eventId: created(sent).id, rule: 'title-taken', reason: 'A ticket with that title exists.' } as IngestResult]);
    await waitFor(() => expect(screen.queryByTestId(`ticket-card-${id}`)).toBeNull());
    expect(await screen.findByRole('dialog', { name: 'Create ticket' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Buy milk');
    expect(await screen.findByText(/A ticket with that title exists\./)).toBeInTheDocument();
  });
});

describe('25.104 the sheet opened from a board card starts its workflow read before its ticket read answers', () => {
  /** How many workflow reads the page makes in the 400 ms after it opens `ticketId`, with that ticket's own read still OPEN. */
  async function workflowReadsWhileTicketOpen(ticketId: string): Promise<number> {
    const { services } = world({ list: [card('tk_a', 'Existing', 'CC-1')] });
    const getWorkflowDef = vi.fn(async () => WF);
    Object.assign(services.dataSource.query, { getWorkflowDef, getTicket: () => new Promise<TicketRead>(() => undefined) });
    searchParams = new URLSearchParams({ ticket: ticketId });
    const view = render(<Providers services={services}><ProjectPage /></Providers>);
    await screen.findByText('Existing');
    await new Promise((resolve) => setTimeout(resolve, 400));
    view.unmount();
    return getWorkflowDef.mock.calls.length;
  }

  it('25.104 the page hands the sheet the board card\'s workflow: one more workflow read than for a ticket the board does not hold, while the ticket read is still open', async () => {
    // Control: a ticket the board does not hold has no hint, so the sheet waits for its own read (the page's reads only).
    const without = await workflowReadsWhileTicketOpen('tk_elsewhere');
    expect(without).toBeGreaterThan(0);
    // A board card's ticket: the sheet asks for its workflow without waiting.
    const withHint = await workflowReadsWhileTicketOpen('tk_a');
    expect(withHint).toBe(without + 1);
  });
});

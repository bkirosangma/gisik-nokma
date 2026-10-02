import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import type { TicketRead } from '../../src/view-types.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, ticketStateSeed } from '../helpers/seed.js';

/**
 * The sheet's writes show at once and roll back honestly (smoothness T7, spec S5; audit SM-03; owner D2) —
 * cases 25.092 (the title), 25.093 (a refused state change) and 25.096 (the fields are independent).
 * The overlay's own rules are in `optimistic-ticket.test.ts`.
 */

afterEach(cleanup);

const stamp = { actorId: 'user_kiro', clientTime: '2026-08-18T07:59:00.000Z', serverTime: '2026-08-18T08:00:00.000Z' };

function readOf(): TicketRead {
  return {
    ticket: ticketStateSeed({
      fields: {
        title: { value: 'Old title', ...stamp },
        priority: { value: 'P2', ...stamp },
      },
    }),
    title: 'Old title',
    stateProvenance: { actorId: 'user_anselma', actorName: 'Anselma Marak', clientTime: stamp.clientTime, serverTime: stamp.serverTime },
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: 'CCSO-1183',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  } as unknown as TicketRead;
}

type Deferred = { promise: Promise<IngestResult[]>; resolve: (results: IngestResult[]) => void; reject: (cause: unknown) => void };
function deferred(): Deferred {
  let resolve!: (results: IngestResult[]) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<IngestResult[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const committed = { status: 'committed', eventId: 'e', seq: 9, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult;
const refused = (reason: string) => ({ status: 'refused', eventId: 'e', rule: 'close-requires-terminal', reason }) as IngestResult;

/** A sheet whose reads keep answering the OLD ticket (the slow-reload case) and whose writes wait to be answered by hand. */
async function mount() {
  const read = readOf();
  const writes: Deferred[] = [];
  const source = createFakeDataSource(
    {
      getTicket: async () => read,
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
      getTicketHistory: async () => [],
      getTickets: async (projectId: string) => ({ projectId, rows: [] }),
    },
    () => {
      const write = deferred();
      writes.push(write);
      return write.promise;
    },
  );
  render(<TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Ticket title')).toHaveValue('Old title'), { timeout: 4_000 });
  await waitFor(() => expect(stateText()).toContain('Doing'));
  return { source, writes };
}

/** The State row's whole text: the chip, the claim line and the Move control all name the state, so a name is read off the row, not off one node. */
const stateText = () => screen.getByTestId('field-state').textContent ?? '';
const titleBox = () => screen.getByRole('textbox', { name: 'Ticket title' }) as HTMLTextAreaElement;

async function typeTitle(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.clear(titleBox());
  await user.type(titleBox(), text);
  await user.tab();
}

describe('the sheet shows a write the moment it is made (spec S5)', () => {
  it('25.092 a committed title shows the new title at once and never flashes the old one back while the reload is slow', async () => {
    const user = userEvent.setup();
    const { writes } = await mount();
    await typeTitle(user, 'New title');
    await waitFor(() => expect(writes).toHaveLength(1));
    // The write is OPEN: the new title is on the sheet (its box and its own label), and the read still says Old.
    expect(titleBox()).toHaveValue('New title');
    expect(screen.getByRole('dialog', { name: 'New title' })).toBeInTheDocument();
    writes[0]!.resolve([committed]);
    // Answered, the reload lands with the OLD title (a slow projection): the overlay holds, no flash.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(titleBox()).toHaveValue('New title');
    expect(screen.queryByDisplayValue('Old title')).toBeNull();
  });

  it('25.092 a refused title takes the committed title back (the sheet\'s own label) and prints the server\'s words; the draft stays in the box', async () => {
    const user = userEvent.setup();
    const { writes } = await mount();
    await typeTitle(user, 'New title');
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(titleBox()).toHaveValue('New title');
    expect(screen.getByRole('dialog', { name: 'New title' })).toBeInTheDocument();
    writes[0]!.resolve([refused('Titles may not be changed on a closed ticket.')]);
    expect(await screen.findByText(/Titles may not be changed on a closed ticket\./)).toBeInTheDocument();
    // The ticket is called what the data says again…
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Old title' })).toBeInTheDocument());
    // …and the person's words stay in the box beside the refusal (the established rule: a refused edit is not thrown away).
    expect(titleBox()).toHaveValue('New title');
  });

  it('25.093 a Move shows the ticket in its new state at once with "Saving…", and a refusal puts the State row back with the reason', async () => {
    const user = userEvent.setup();
    const { writes } = await mount();
    expect(stateText()).not.toContain('Saving…');
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    // Open: the row names the NEW state and says Saving… in place of a claim nobody has stamped.
    expect(stateText()).toContain('Waiting on counterparty');
    expect(stateText()).toContain('Saving…');
    writes[0]!.resolve([refused('Only Anselma Marak may perform "Doing → Waiting" on this ticket.')]);
    expect(await screen.findByText(/Only Anselma Marak may perform/)).toBeInTheDocument();
    await waitFor(() => expect(stateText()).toContain('Doing'));
    expect(within(screen.getByTestId('field-state')).queryByText(/Waiting on counterparty/)).toBeNull();
    expect(within(screen.getByTestId('field-state')).queryByText('Saving…')).toBeNull();
  });

  it('25.093 a Move whose connection drops puts the State row back and says the server could not be reached', async () => {
    const user = userEvent.setup();
    const { writes } = await mount();
    await user.click(screen.getByRole('button', { name: 'Move…' }));
    await user.click(screen.getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(stateText()).toContain('Waiting on counterparty');
    writes[0]!.reject(new Error('socket closed'));
    expect(await screen.findByText(/We could not reach the server for this move: socket closed/)).toBeInTheDocument();
    await waitFor(() => expect(stateText()).not.toContain('Waiting on counterparty'));
    expect(stateText()).toContain('Doing');
    expect(stateText()).not.toContain('Saving…');
  });

  it('25.096 the fields are independent: a refused priority rolls back alone while the title committed in the same breath stays', async () => {
    const user = userEvent.setup();
    const { writes } = await mount();
    await typeTitle(user, 'New title');
    fireEvent.click(within(screen.getByTestId('field-priority')).getByRole('tab', { name: 'P3' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    const priority = () => within(screen.getByTestId('field-priority'));
    expect(priority().getByRole('tab', { name: 'P3' })).toHaveAttribute('aria-selected', 'true');
    expect(priority().getByText('Saving…')).toBeInTheDocument();
    // The priority is refused; the title commits.
    // (The sheet prints ONE refusal line and a commit clears it, so the commit is answered first.)
    writes[0]!.resolve([committed]);
    writes[1]!.resolve([refused('"Priority" needs one of P1, P2 or P3.')]);
    await waitFor(() => expect(priority().getByRole('tab', { name: 'P2' })).toHaveAttribute('aria-selected', 'true'));
    expect(priority().getByRole('tab', { name: 'P3' })).toHaveAttribute('aria-selected', 'false');
    expect(await screen.findByText(/needs one of P1, P2 or P3/)).toBeInTheDocument();
    // The refusal took NOTHING else with it.
    expect(titleBox()).toHaveValue('New title');
  });
});

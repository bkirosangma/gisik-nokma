import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult } from '@gisik-nokma/domain';
import type { TicketRead } from '../../src/view-types.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, ticketStateSeed } from '../helpers/seed.js';

/**
 * The sheet's overlay belongs to ONE ticket (smoothness T7 FIX 1, F1; case 25.103). `TicketSheet` is re-targeted
 * in place (the parent crumb, a subtask row), so a title committed on ticket A must never be drawn on ticket B.
 * The hook's own scoping rules (a late answer from A never touches B) are in `optimistic-ticket.test.ts`.
 */

afterEach(cleanup);

const OTHER = '01J00000000000000000000OTH';
const stamp = { actorId: 'user_kiro', clientTime: '2026-08-18T07:59:00.000Z', serverTime: '2026-08-18T08:00:00.000Z' };

function readOf(id: string, title: string): TicketRead {
  return {
    ticket: ticketStateSeed({ id, fields: { title: { value: title, ...stamp }, priority: { value: 'P2', ...stamp } } } as never),
    title,
    stateProvenance: {
      actorId: 'user_anselma',
      actorName: id === TICKET ? 'Anselma Marak' : 'Bea Bsangma',
      clientTime: stamp.clientTime,
      serverTime: stamp.serverTime,
    },
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: id === TICKET ? 'CC-1' : 'CC-2',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  } as unknown as TicketRead;
}

type Mounted = { rerender: (ticketId: string) => void; resolveWrite: (result: IngestResult) => void };

/** A sheet whose reads keep answering A's OLD title (a slow projection) and whose one write waits to be answered by hand. */
function mountOn(ticketId: string): Mounted {
  let resolveWrite!: (results: IngestResult[]) => void;
  const source = createFakeDataSource(
    {
      getTicket: async (_workspaceId: string, id: string) => (id === TICKET ? readOf(TICKET, 'Old title') : readOf(OTHER, 'B title')),
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
      getTicketHistory: async () => [],
      getTickets: async (projectId: string) => ({ projectId, rows: [] }),
    } as never,
    () =>
      new Promise<IngestResult[]>((resolve) => {
        resolveWrite = resolve;
      }),
  );
  const sheet = (id: string) => <TicketSheet dataSource={source} workspaceId={WS} ticketId={id} currentUserId="user_kiro" onClose={vi.fn()} />;
  const { rerender } = render(sheet(ticketId));
  return { rerender: (id) => rerender(sheet(id)), resolveWrite: (result) => resolveWrite([result]) };
}

const titleBox = () => screen.getByRole('textbox', { name: 'Ticket title' }) as HTMLTextAreaElement;
const committed = { status: 'committed', eventId: 'e', seq: 9, serverTime: '2026-10-02T09:00:00.000Z' } as IngestResult;

describe('the overlay is scoped to its ticket (F1)', () => {
  it('25.103 a title committed on ticket A is never drawn on ticket B after the sheet is re-targeted; A keeps it', async () => {
    const user = userEvent.setup();
    const sheet = mountOn(TICKET);
    await waitFor(() => expect(titleBox()).toHaveValue('Old title'), { timeout: 4_000 });
    await user.clear(titleBox());
    await user.type(titleBox(), 'New title');
    await user.tab();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'New title' })).toBeInTheDocument());
    sheet.resolveWrite(committed);
    await new Promise((resolve) => setTimeout(resolve, 60));
    // Control: on the SAME ticket the committed title holds while A's reload still answers the old one.
    expect(titleBox()).toHaveValue('New title');
    // Re-target the same instance at B. B's read lands (its provenance is on screen) …
    sheet.rerender(OTHER);
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Bea Bsangma'));
    // … and B shows B's own title, never A's overlay.
    expect(titleBox()).toHaveValue('B title');
    expect(screen.queryByRole('dialog', { name: 'New title' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'B title' })).toBeInTheDocument();
    // Back on A the read is the data again: the overlay was cleared by the switch, not parked.
    sheet.rerender(TICKET);
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Anselma Marak'));
    expect(titleBox()).toHaveValue('Old title');
  });

  it("25.103 A's write answering AFTER the sheet moved to B leaves B as B's read says", async () => {
    const user = userEvent.setup();
    const sheet = mountOn(TICKET);
    await waitFor(() => expect(titleBox()).toHaveValue('Old title'), { timeout: 4_000 });
    await user.clear(titleBox());
    await user.type(titleBox(), 'New title');
    await user.tab();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'New title' })).toBeInTheDocument());
    sheet.rerender(OTHER);
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Bea Bsangma'));
    // Control: B is already its own title before the late answer (the dialog is named by the DRAWN title; the box may
    // still hold A's unanswered draft, which is the sheet's own per-instance field state, not the overlay's).
    expect(screen.getByRole('dialog', { name: 'B title' })).toBeInTheDocument();
    sheet.resolveWrite(committed);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(titleBox()).toHaveValue('B title');
    expect(screen.getByRole('dialog', { name: 'B title' })).toBeInTheDocument();
  });
});

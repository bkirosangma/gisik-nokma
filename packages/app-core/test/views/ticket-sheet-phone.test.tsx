import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketRead } from '../../src/view-types.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

/**
 * The web app on phones, Plan Task 6 — the behaviour half of case 21.071 (§21.6): the sheet's
 * header carries a "Move" shortcut that calls the SAME handler as the state row's "Move…", so
 * exactly one dialog opens. Whether it is painted is the CSS half (`packages/ui/test/phone-overlays.test.ts`);
 * jsdom loads no stylesheet, so here the shortcut is always in the tree.
 */
afterEach(cleanup);

const PROVENANCE_LINE = 'marked Doing by Anselma Marak on 19 Aug 2026';

function read(closed: { actorId: string; at: string } | null = null): TicketRead {
  return {
    ticket: ticketStateSeed(closed === null ? {} : { stateId: 'done', stateCategory: 'terminal', closed }),
    title: 'File the GST return',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: 'CCSO-1183',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
  };
}

function renderSheet(ticket: TicketRead, ingest?: Parameters<typeof createFakeDataSource>[1]): void {
  const source = createFakeDataSource({
    getTicket: async () => ticket,
    getWorkflowDef: async () => WF_ERRAND,
    getMembers: async () => [
      { id: 'user_kiro', name: 'Kiro', role: 'owner' },
      { id: 'user_anselma', name: 'Anselma Marak', role: 'member' },
    ],
    getTicketHistory: async () => [],
    getTickets: async (projectId) => ({ projectId, rows: [] }),
    getTicketTypes: async () => [{ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] }],
  }, ingest);
  render(
    <TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} />,
  );
}

async function settled(closed = false): Promise<void> {
  await waitFor(() =>
    expect(closed ? screen.getByText(/^Closed by /) : screen.getByText(PROVENANCE_LINE)).toBeInTheDocument(),
  );
}

const stateRowMove = () => within(screen.getByTestId('field-state')).getByRole('button', { name: 'Move…' });
const headerMove = () => screen.getByRole('button', { name: 'Move this ticket' });
const moveDialogs = () => screen.queryAllByRole('dialog', { name: 'Move ticket' });

describe('21.071 the header Move shortcut opens the SAME single dialog', () => {
  it('21.071 the header shortcut and the state row Move… each open exactly one Move dialog, and the shortcut sits in the sheet header, not the body', async () => {
    const user = userEvent.setup();
    renderSheet(read());
    await settled();
    expect(moveDialogs()).toHaveLength(0);

    const shortcut = headerMove();
    expect(shortcut.closest('.gn-sheet__header')).not.toBeNull();
    expect(shortcut).toBeEnabled();
    await user.click(shortcut);
    // Exactly ONE Move dialog (plus the sheet itself) — never a second dialog from a second handler.
    await waitFor(() => expect(moveDialogs()).toHaveLength(1));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    await user.click(within(moveDialogs()[0]!).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(moveDialogs()).toHaveLength(0));

    // CONTROL, same `it`: the state row's Move… still opens that one dialog.
    await user.click(stateRowMove());
    await waitFor(() => expect(moveDialogs()).toHaveLength(1));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
  });

  it('21.071 a closed ticket disables the shortcut with the state row control (control: an open ticket enables both)', async () => {
    renderSheet(read({ actorId: 'user_anselma', at: '2026-08-20T19:00:00.000Z' }));
    await settled(true);
    expect(headerMove()).toBeDisabled();
    expect(stateRowMove()).toBeDisabled();
    cleanup();

    renderSheet(read());
    await settled();
    expect(headerMove()).toBeEnabled();
    expect(stateRowMove()).toBeEnabled();
  });

  it('21.071 the shortcut clears a stale refusal exactly as the state row Move… does — one handler, not two', async () => {
    const user = userEvent.setup();
    const terminal = { ...read(), ticket: ticketStateSeed({ stateId: 'done', stateCategory: 'terminal', closed: null }) };
    renderSheet(terminal, (events) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'close-requires-terminal',
        reason: 'A ticket can only be closed from a terminal state.',
      })),
    );
    await waitFor(() => expect(within(screen.getByTestId('field-state')).getByRole('button', { name: 'Close' })).toBeInTheDocument());

    for (const open of [headerMove, stateRowMove]) {
      await user.click(within(screen.getByTestId('field-state')).getByRole('button', { name: 'Close' }));
      await screen.findByText(/close-requires-terminal/);
      await user.click(open());
      // The Move dialog is up AND the earlier notice is gone — the handler that opened it cleared it.
      await waitFor(() => expect(moveDialogs()).toHaveLength(1));
      expect(screen.queryByText(/close-requires-terminal/)).toBeNull();
      await user.click(within(moveDialogs()[0]!).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(moveDialogs()).toHaveLength(0));
    }
  });
});

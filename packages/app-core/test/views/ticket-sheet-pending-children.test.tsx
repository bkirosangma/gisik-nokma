import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ListRow, TicketRead } from '../../src/view-types.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { PROJECT, TICKET, WF_ERRAND, WS, claim, listRowSeed, ticketStateSeed } from '../helpers/seed.js';

/**
 * Case 28.197 (AMEND-drafts-t8-pending-children, planner 2026-10-04 18:34): a draft's pending children on its sheet.
 * D is `TICKET`; a published C placed under D is held on D's own stream (`ticketState.pendingChildren`, drafts T6) and
 * joins D when D is published. The rows come from the sheet's existing subtasks read; no new request.
 */
afterEach(cleanup);

const C1 = '01JCH1LD0000000000000000C1';
const C2 = '01JCH1LD0000000000000000C2';
const OWN = '01JOWNCH1LD0000000000000K1';
const STRAY = '01JSTRAY00000000000000000X';
const committed = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' } as const;
const editorSlot: EditorSlotComponent = (props) => <textarea aria-label={props.mode} placeholder={props.placeholder} readOnly />;

function read(overrides: Partial<TicketRead> = {}, state: Parameters<typeof ticketStateSeed>[0] = {}): TicketRead {
  return {
    ticket: ticketStateSeed(state),
    title: 'Pave the lane',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: 'RP-1',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
    ...overrides,
  };
}
const row = (ticketId: string, key: string, title: string, over: Partial<ListRow> = {}): ListRow =>
  listRowSeed({ ticketId, key, title, ...over });

function mount(source: FakeDataSource, ticketId: string, currentUserId = 'user_kiro') {
  render(
    <TicketSheet dataSource={source} workspaceId={WS} ticketId={ticketId} currentUserId={currentUserId} onClose={() => {}}
      editorSlot={editorSlot} workspaceName="Roads Co" projectName="Roads" />,
  );
}
function world(getTicket: () => TicketRead, rows: () => ListRow[], ingest?: Parameters<typeof createFakeDataSource>[1]) {
  return createFakeDataSource(
    {
      getTicket: async () => getTicket(),
      getTickets: async (projectId) => ({ projectId, rows: rows() }),
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }, { id: 'user_anselma', name: 'Anselma', role: 'member' }],
      getTicketTypes: async () => [{ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] }],
    },
    ingest,
  );
}
const listed = (): string[] =>
  within(screen.getByTestId('sheet-subtasks')).queryAllByRole('listitem').map((li) => li.getAttribute('data-testid') ?? '');

describe('28.197 a draft\'s pending children on its sheet', () => {
  it('28.197 both pending children are listed after the draft\'s own, the second with its key, title, state and the note; controls: C\'s sheets show no parent; after publish C is an ordinary child', async () => {
    // The author's draft D: one child of its own, two pending children, and a stray row of the project that is neither.
    let published = false;
    const dRead = () =>
      published
        ? read({ key: 'RP-20' })
        : read({ key: null, draft: true }, { stateId: 'backlog', stateCategory: 'open', pendingChildren: [C1, C2] });
    const dRows = () => [
      row(C1, 'RP-11', 'Order the kerbs', { parentId: published ? TICKET : null }),
      row(OWN, 'RP-10', 'Mark the line', { parentId: TICKET }),
      row(STRAY, 'RP-13', 'Paint the gate'),
      row(C2, 'RP-12', 'Lay the kerbs', { parentId: published ? TICKET : null, stateId: 'doing', stateName: 'Doing', stateCategory: 'active' }),
    ];
    const d = world(dRead, dRows, (events) => {
      published = true;
      return events.map(() => committed);
    });
    mount(d, TICKET);
    await waitFor(() => expect(listed()).toEqual([`subtask-${OWN}`, `subtask-pending-${C1}`, `subtask-pending-${C2}`]));
    const second = screen.getByTestId(`subtask-pending-${C2}`);
    expect(second.querySelector('.gn-ticket-sheet__subtask-key')?.textContent).toBe('RP-12');
    expect(second.querySelector('.gn-ticket-sheet__subtask-title')?.textContent).toBe('Lay the kerbs');
    expect(within(second).getByText('Doing')).toBeInTheDocument();
    expect(second.querySelector('.gn-ticket-sheet__subtask-pending')?.textContent).toBe('Joins when published');
    expect(screen.getByTestId(`subtask-${OWN}`).querySelector('.gn-ticket-sheet__subtask-pending')).toBeNull();
    expect(screen.getAllByText('Joins when published')).toHaveLength(2);
    expect(d.ingested).toEqual([]); // no request writes anything; the reads are the sheet's own

    // After publish: C1 and C2 are ordinary children (parentId D) and the note is gone.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(listed()).toEqual([`subtask-${C1}`, `subtask-${OWN}`, `subtask-${C2}`]));
    expect(screen.queryByText('Joins when published')).toBeNull();
    cleanup();

    // CONTROL: another member's sheet of C2 (the server serves no draft to them) shows no parent and no D anywhere.
    const c2Read = () => read({ key: 'RP-12', title: 'Lay the kerbs' }, { id: C2, projectId: PROJECT });
    mount(world(c2Read, () => [row(C2, 'RP-12', 'Lay the kerbs')]), C2, 'user_anselma');
    await screen.findByTestId('sheet-crumb-ticket');
    await act(async () => {});
    expect(screen.queryByTestId('sheet-parent-chip')).toBeNull();
    expect(screen.queryByText(/Pave the lane/)).toBeNull();
    cleanup();
    // CONTROL: the author's own sheet of C2 shows no parent until publish, even with D's row in the project read.
    mount(world(c2Read, () => [row(TICKET, 'RP-20', 'Pave the lane'), row(C2, 'RP-12', 'Lay the kerbs')]), C2);
    await screen.findByTestId('sheet-crumb-ticket');
    await act(async () => {});
    expect(screen.queryByTestId('sheet-parent-chip')).toBeNull();
    expect(screen.queryByText('Joins when published')).toBeNull();
    expect(screen.queryByText(/Pave the lane/)).toBeNull();
  });
});

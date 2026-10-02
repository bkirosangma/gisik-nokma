import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { ASSIGN_OUTSIDER_OPTION, OUTSIDER_ASSIGN, OUTSIDER_EMAIL_LABEL } from '../../src/people/copy.js';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import { NewTicketDialog } from '../../src/views/new-ticket-dialog.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS } from '../helpers/seed.js';

/** Access plan Task 7, cases 3.987–3.988. */

const PEOPLE = [{ id: 'user_anselma', name: 'Anselma Marak' }];
const OUT = { userId: 'user_out', name: 'Era Momin', email: 'era@example.test', inWorkspace: false, role: null } as const;

async function pickOutsider(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
  await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: ASSIGN_OUTSIDER_OPTION }));
  await user.type(screen.getByLabelText(OUTSIDER_EMAIL_LABEL), 'era@example.test{Enter}');
  await user.click(await screen.findByRole('button', { name: OUTSIDER_ASSIGN }));
}

describe('3.987 the dialog’s outsider arm', () => {
  const props = {
    open: true,
    userId: 'usr_ada',
    workspaceId: 'ws_1',
    typeOptions: [{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }],
    parentCandidates: [],
    assigneeCandidates: PEOPLE,
    workflowStates: () => null,
    onClose: () => undefined,
  };

  it('3.987 the option exists only with lookupPerson; an outsider leaves as assigneeIsOutsider', async () => {
    const user = userEvent.setup();
    const bare = render(<NewTicketDialog {...props} onCreate={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    expect(within(await screen.findByRole('listbox')).queryByRole('option', { name: ASSIGN_OUTSIDER_OPTION })).toBeNull();
    bare.unmount();

    const onCreate = vi.fn();
    render(<NewTicketDialog {...props} lookupPerson={async () => OUT} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await pickOutsider(user);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 'user_out', assigneeIsOutsider: true }));
  });

  it('3.987 CONTROL: a member pick carries no assigneeIsOutsider key', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTicketDialog {...props} lookupPerson={async () => OUT} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Anselma Marak' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty('assigneeIsOutsider');
  });
});

describe('3.988 the flow routes an outsider draft through assignOutsider', () => {
  function renderFlow(assignOutsider: (userId: string, event: SubmittedEvent) => Promise<IngestResult>) {
    const source = createFakeDataSource();
    render(
      <CreateTicketFlow
        dataSource={source}
        workspaceId={WS}
        projectId="01J9GPRJ000000000000000000"
        currentUserId="user_kiro"
        typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
        workflowStates={() => null}
        parentCandidates={[]}
        assigneeCandidates={PEOPLE}
        lookupPerson={async () => OUT}
        assignOutsider={assignOutsider}
        onCreated={() => undefined}
      />,
    );
    return source;
  }

  it('3.988 the outsider’s ticket.created goes to assignOutsider, not ingest', async () => {
    const user = userEvent.setup();
    const assignOutsider = vi.fn(async (_u: string, e: SubmittedEvent): Promise<IngestResult> => ({
      status: 'committed',
      eventId: e.id,
      seq: 1,
      serverTime: '2026-09-29T10:00:00.000Z',
    }));
    const source = renderFlow(assignOutsider);
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await pickOutsider(user);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
    await vi.waitFor(() => expect(assignOutsider).toHaveBeenCalledTimes(1));
    const [userId, event] = assignOutsider.mock.calls[0]!;
    expect(userId).toBe('user_out');
    expect(event).toMatchObject({ type: 'ticket.created', payload: expect.objectContaining({ assigneeId: 'user_out' }) });
    expect(source.ingested).toHaveLength(0);
  });

  it('3.988 CONTROL: a member draft goes through ingest', async () => {
    const user = userEvent.setup();
    const assignOutsider = vi.fn();
    const source = renderFlow(assignOutsider);
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Collect the rent' } });
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Anselma Marak' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
    await vi.waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(assignOutsider).not.toHaveBeenCalled();
  });
});

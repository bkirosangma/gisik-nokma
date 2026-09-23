import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { CreateTicketFlow } from '../../src/views/create-ticket-flow.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { WS } from '../helpers/seed.js';

/**
 * Case 13.1444 — the birth START and DUE date on the wire (addendum,
 * 2026-09-23). `new-ticket-dialog.test.tsx`'s own 13.1443/13.1445 cover the
 * dialog's bare-string draft and its client-side validation; this file is
 * the one place that can see the ACTUAL `ticket.created` payload
 * `CreateTicketFlow.create` builds — the `{date}` object wrap, and the
 * omission of whichever input was left empty, both live in THIS door
 * (`create-ticket-flow.tsx:` the `...(draft.startDate === undefined ? {} :
 * {startDate: {date: draft.startDate}})` spread), not in the dialog.
 */
function renderFlow(source: FakeDataSource): void {
  render(
    <CreateTicketFlow
      dataSource={source}
      workspaceId={WS}
      projectId="01J9GPRJ000000000000000000"
      currentUserId="user_kiro"
      typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
      workflowStates={() => null}
      parentCandidates={[]}
      assigneeCandidates={[]}
      onCreated={() => undefined}
    />,
  );
}

function ticketCreatedPayload(source: FakeDataSource): Record<string, unknown> {
  const [batch] = source.ingested;
  const event = batch?.[0] as SubmittedEvent | undefined;
  if (event === undefined || event.type !== 'ticket.created') {
    throw new Error(`expected exactly one ticket.created event, got ${JSON.stringify(source.ingested)}`);
  }
  return event.payload as Record<string, unknown>;
}

describe('13.1444 the birth start/due date reach ticket.created as {date} objects, omitted when empty', () => {
  it('a filled Start date wraps as {date}; an empty Due date carries no key at all', async () => {
    const source = createFakeDataSource();
    renderFlow(source);
    await userEvent.setup().click(screen.getByRole('button', { name: 'New ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-30' } });
    // Due date left empty.
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(source.ingested).toHaveLength(1);
    const payload = ticketCreatedPayload(source);
    expect(payload['startDate']).toEqual({ date: '2026-09-30' });
    expect(payload).not.toHaveProperty('dueDate');
  });

  it('both filled travel as two independent {date} objects', async () => {
    const source = createFakeDataSource();
    renderFlow(source);
    await userEvent.setup().click(screen.getByRole('button', { name: 'New ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const payload = ticketCreatedPayload(source);
    expect(payload['startDate']).toEqual({ date: '2026-09-30' });
    expect(payload['dueDate']).toEqual({ date: '2026-10-15' });
  });

  it('neither filled: the payload carries no startDate and no dueDate key at all', async () => {
    const source = createFakeDataSource();
    renderFlow(source);
    await userEvent.setup().click(screen.getByRole('button', { name: 'New ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const payload = ticketCreatedPayload(source);
    expect(payload).not.toHaveProperty('startDate');
    expect(payload).not.toHaveProperty('dueDate');
  });
});

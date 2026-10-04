import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { label, type SubmittedEvent, type WorkflowDef } from '@gisik-nokma/domain';
import { workflowStateNotCreatableRefusal } from '@gisik-nokma/rule-engine';
import { createClientStateCache } from '../../src/cache.js';
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
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-30' } });
    // Due date left empty.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    expect(source.ingested).toHaveLength(1);
    const payload = ticketCreatedPayload(source);
    expect(payload['startDate']).toEqual({ date: '2026-09-30' });
    expect(payload).not.toHaveProperty('dueDate');
  });

  it('both filled travel as two independent {date} objects', async () => {
    const source = createFakeDataSource();
    renderFlow(source);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-15' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    const payload = ticketCreatedPayload(source);
    expect(payload['startDate']).toEqual({ date: '2026-09-30' });
    expect(payload['dueDate']).toEqual({ date: '2026-10-15' });
  });

  it('neither filled: the payload carries no startDate and no dueDate key at all', async () => {
    const source = createFakeDataSource();
    renderFlow(source);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    const payload = ticketCreatedPayload(source);
    expect(payload).not.toHaveProperty('startDate');
    expect(payload).not.toHaveProperty('dueDate');
  });
});

/**
 * Case 13.1441a — the inline `stateRefusal` precheck (starting-status
 * design, 2026-09-23), UNWITNESSED until this case: `create-ticket-flow.tsx`
 * gained a whole branch — the state-creatable half of `precheckEvent`,
 * `setStateRefusal`, the reason rendered under the dialog's Starting-status
 * select — and no test exercised it. Suffixed because the UI block
 * (`13.1431`–`13.1445`) is fully spent; `check-case-citations`' ratchet skips
 * suffixed ids (case-citation-ratchet-skips-suffixed-ids), so this citation
 * is by hand.
 *
 * REACHABLE IN PRODUCTION, not dormant: `apps/web/src/providers.tsx` wires
 * `cache-feed.ts`'s `cache.upsertWorkflowDef(def)` into the real
 * `ClientStateCache` every mount, so the web app's `CreateTicketFlow`
 * genuinely holds workflow defs this precheck can disagree with
 * `workflowStates` about — this is not a path that only a test can reach.
 */
describe('29.165 the birth estimate reaches ticket.created as a bare number', () => {
  it('29.165 the flow sends estimate as a bare number', async () => {
    const source = createFakeDataSource();
    renderFlow(source);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    fireEvent.change(screen.getByLabelText('Estimate (days)'), { target: { value: '5' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));
    expect(ticketCreatedPayload(source)['estimate']).toBe(5);
  });
});

describe('13.1441a the inline stateRefusal precheck — a cache that disagrees with workflowStates', () => {
  it('refuses locally, submits NOTHING, and renders the reason under the select', async () => {
    const user = userEvent.setup();
    const source = createFakeDataSource();
    const cache = createClientStateCache();
    /**
     * The CACHE's own belief: `locked` is `creatable: false`. `workflowStates`
     * below — the UI's own read, built independently in this fixture — offers
     * `locked` as creatable anyway, the one way this branch can fire at all
     * (the select's own options are already filtered to `creatable`, so an
     * ordinary session can't pick a state its own `workflowStates` refused to
     * offer).
     */
    const def: WorkflowDef = {
      id: 'wf-errand',
      version: 1,
      name: 'Errand',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'locked', name: 'Locked', category: 'active', creatable: false },
      ],
      transitions: [],
    };
    cache.upsertWorkflowDef(def);

    render(
      <CreateTicketFlow
        dataSource={source}
        cache={cache}
        workspaceId={WS}
        projectId="01J9GPRJ000000000000000000"
        currentUserId="user_kiro"
        typeOptions={[{ id: 'task', name: 'Task', rank: 3, workflowId: 'wf-errand' }]}
        workflowStates={(workflowId) =>
          workflowId === 'wf-errand'
            ? {
                initialStateId: 'todo',
                states: [
                  { id: 'todo', name: 'To do', category: 'open', creatable: true },
                  // The disagreement: the UI's own read says `locked` IS creatable.
                  { id: 'locked', name: 'Locked', category: 'active', creatable: true },
                ],
              }
            : null
        }
        parentCandidates={[]}
        assigneeCandidates={[]}
        onCreated={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Create ticket' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renew the trade licence' } });
    // Backlog defaults to ON, which disables the select — OFF it first.
    await user.click(screen.getByRole('checkbox', { name: 'Starts in the backlog?' }));
    await user.click(screen.getByRole('button', { name: /Starting status/ }));
    await user.click(await screen.findByRole('option', { name: 'Locked' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Create ticket' })).getByRole('button', { name: 'Create ticket' }));

    // The SAME sentence `checks/hierarchy.ts` would refuse with, rendered
    // INSIDE the dialog, under the select — not the flow's own below-dialog
    // `failure` paragraph. Awaited FIRST, not a bare synchronous read: the
    // precheck is async, so this is what waits for it to have actually
    // decided before either assertion below is checked.
    const reason = workflowStateNotCreatableRefusal(label(def, 'locked'));
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Create ticket' })).toBeInTheDocument();

    // NOTHING submitted — the refusal was caught before `submitChildEvent`
    // was ever reached. Checked AFTER the reason renders, not before: by this
    // point the precheck has definitely settled, so a `0` here means the
    // branch actually refused rather than merely not having run yet.
    expect(source.ingested).toHaveLength(0);
  });
});

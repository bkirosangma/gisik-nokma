import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { newUlid, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { BoardView } from '../../src/view-types.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.js';
import { WorkflowHistoryScreen } from '../../src/workflow-builder/ui/workflow-history-screen.js';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.js';
import { TimelineView } from '../../src/timeline/timeline-view.js';
import { Board, EMPTY_COLUMN_COPY } from '../../src/views/board.js';

/**
 * 23.195 (UX fixes T11, spec §3.3, audit SYS-19): an empty state names the next step instead of ending in a full
 * stop. Each case renders the screen empty, finds the control by role and accessible name, and (control, same
 * `it`) renders the same screen NON-empty to prove the message and the control belong to the empty state alone.
 */
const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };
const memberSession: BuilderSession = { userId: newUlid(), role: 'member' };
const WORKFLOW_ID = newUlid();

const published: PublishedWorkflowDef = {
  id: WORKFLOW_ID,
  version: 1,
  name: 'Field ops',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [] }],
};

describe('23.195 empty states point to a next step (workflow list and history)', () => {
  it('23.195 an empty workflow list says "No workflows yet." and offers "Create one from a template", which opens the template gallery door', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    const { unmount } = render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={onNew}
      />,
    );
    expect(await screen.findByText('No workflows yet.')).toBeInTheDocument();
    expect(screen.queryByText('No workflows published yet.')).toBeNull();
    const create = screen.getByRole('button', { name: 'Create one from a template' });
    await user.click(create);
    expect(onNew).toHaveBeenCalledTimes(1);
    unmount();

    // CONTROL: a list that holds a workflow shows neither the message nor the control.
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows: [published] })}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={() => {}}
      />,
    );
    await screen.findByText('Field ops');
    expect(screen.queryByText('No workflows yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create one from a template' })).toBeNull();
  });

  it('23.195 a person who cannot author gets the message without a control that would only be refused', async () => {
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={memberSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('No workflows yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create one from a template' })).toBeNull();
  });

  it('23.195 an empty history says "No published versions yet." and offers "Back to workflows", a link to the workflow list', async () => {
    const workspaceId = newUlid();
    const { unmount } = render(
      <WorkflowHistoryScreen
        workspaceId={workspaceId}
        workflowId={newUlid()}
        gateway={createFakeGateway({ workflows: [published] })}
      />,
    );
    expect(await screen.findByText('No published versions yet.')).toBeInTheDocument();
    expect(screen.queryByText('No published versions to show.')).toBeNull();
    const back = screen.getByRole('link', { name: 'Back to workflows' });
    expect(back).toHaveAttribute('href', `/w/${workspaceId}/settings/workflows`);
    unmount();

    // CONTROL: a workflow with versions shows the chain, not the message.
    render(
      <WorkflowHistoryScreen
        workspaceId={workspaceId}
        workflowId={WORKFLOW_ID}
        gateway={createFakeGateway({ workflows: [published] })}
      />,
    );
    expect(await screen.findByText('Version history')).toBeInTheDocument();
    expect(screen.queryByText('No published versions yet.')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to workflows' })).toBeNull();
  });

  it('23.195 the history empty state hands the click to onBack when the shell supplies one', async () => {
    const onBack = vi.fn();
    render(
      <WorkflowHistoryScreen
        workspaceId={newUlid()}
        workflowId={newUlid()}
        gateway={createFakeGateway({ workflows: [published] })}
        onBack={onBack}
      />,
    );
    await screen.findByText('No published versions yet.');
    fireEvent.click(screen.getByRole('link', { name: 'Back to workflows' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('23.195 empty states point to a next step (board column and timeline side list)', () => {
  const column = (stateId: string, name: string, cards: BoardView['groups'][number]['columns'][number]['cards']) => ({
    stateId,
    name,
    category: 'open' as const,
    blocked: false,
    creatable: true,
    cards,
  });

  it('23.195 an empty board column offers "Create ticket in <column>" beside its empty copy, and only while the shell can create', () => {
    const board: BoardView = {
      projectId: 'prj_1',
      groups: [
        {
          workflowId: 'wf-errand',
          workflowVersion: 1,
          workflowName: 'Errand',
          columns: [column('todo', 'To do', [])],
        },
      ],
    };
    const onCreateTicket = vi.fn();
    const { rerender } = render(<Board board={board} onOpenTicket={() => {}} onCreateTicket={onCreateTicket} />);
    const todo = screen.getByRole('region', { name: 'To do' });
    expect(within(todo).getByText(EMPTY_COLUMN_COPY)).toBeInTheDocument();
    const create = within(todo).getByRole('button', { name: 'Create ticket in To do' });
    expect(create).toHaveTextContent('Create ticket');
    fireEvent.click(create);
    expect(onCreateTicket).toHaveBeenCalledTimes(1);

    // CONTROL: with no create handler the control is absent rather than a no-op.
    rerender(<Board board={board} onOpenTicket={() => {}} />);
    expect(within(screen.getByRole('region', { name: 'To do' })).queryByRole('button', { name: /^Create ticket in / })).toBeNull();
  });

  it('23.195 the timeline "Not on the timeline yet" list offers "Add dates" per ticket, and a dated ticket gets none', () => {
    const undated = (id: string, title: string, fields: Record<string, unknown> = {}) => ({
      state: {
        kind: 'ticket' as const,
        id,
        workspaceId: 'ws_1',
        projectId: 'p1',
        typeId: 'task',
        parentId: null,
        workflowId: 'wf_basic',
        workflowVersion: 1,
        stateId: 'doing',
        stateCategory: 'active' as const,
        assigneeId: null,
        collaboratorIds: [],
        fields: {
          title: { value: title, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
          ...fields,
        },
        transitions: [],
      },
      pendingFieldIds: [],
      customDateFields: [],
    });
    const onOpenTicket = vi.fn();
    render(
      <TimelineView
        tickets={[
          undated('t1', 'Order till roll'),
          undated('t2', 'Dated', {
            startDate: { value: { date: '2026-08-24' }, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
            dueDate: { value: { date: '2026-08-28' }, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
          }),
        ]}
        today="2026-08-23"
        userName={(id) => id}
        onOpenTicket={onOpenTicket}
      />,
    );
    const side = within(screen.getByRole('complementary', { name: 'Undated or partially dated' }));
    expect(side.getByRole('heading', { name: 'Not on the timeline yet (1)' })).toBeInTheDocument();
    const add = side.getByRole('button', { name: 'Add dates to Order till roll' });
    expect(add).toHaveTextContent('Add dates');
    fireEvent.click(add);
    expect(onOpenTicket).toHaveBeenCalledWith('t1');
    // CONTROL: the ticket that has both dates is drawn as a bar and is not offered "Add dates".
    expect(side.queryByRole('button', { name: 'Add dates to Dated' })).toBeNull();
  });
});

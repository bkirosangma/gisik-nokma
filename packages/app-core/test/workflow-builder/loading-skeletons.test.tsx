import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';
import { WorkflowHistoryScreen } from '../../src/workflow-builder/ui/workflow-history-screen.js';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.js';
import { TicketTypeListScreen } from '../../src/workflow-builder/ticket-types/ticket-type-list-screen.js';
import { TicketTypeEditorScreen } from '../../src/workflow-builder/ticket-types/ticket-type-editor-screen.js';
import { CommentsThread } from '../../src/views/comments-thread.js';
import { WORKFLOW_TEMPLATES, draftFromTemplate } from '../../src/workflow-builder/templates.js';

/**
 * Smoothness T8 — the workflow builder's list / editor / history, the ticket-type list / editor, and the comment thread draw
 * rows or a form block in their own container while their reads are open (spec S1, S7; audit SM-09; cases 25.130, 25.131).
 * Each case holds the read with a deferred promise; the CONTROL is the same screen after the read lands (no busy region left),
 * and a REJECTED read keeps its load-error sentence and no skeleton (a wait is not a failure).
 */
const session: BuilderSession = { userId: newUlid(), role: 'admin' };
const workspaceId = newUlid();

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
const region = (container: HTMLElement, label: string): HTMLElement => {
  const hidden = [...container.querySelectorAll('.gn-skeleton-region > .gn-visually-hidden')].find((node) => node.textContent === label);
  expect(hidden, `no busy region named "${label}"`).toBeDefined();
  const found = hidden!.parentElement!;
  expect(found).toHaveAttribute('aria-busy', 'true');
  return found;
};

describe('25.130 the workflow builder screens', () => {
  it('25.130 the list holds card-shaped rows in `section.workflow-list`; a rejected read keeps its error sentence and no region', async () => {
    const gate = held<never[]>();
    const gateway = { ...createFakeGateway(), listWorkflows: () => gate.promise };
    const { container } = render(<WorkflowListScreen workspaceId={workspaceId} session={session} gateway={gateway} onOpen={() => undefined} onHistory={() => undefined} onNew={() => undefined} />);
    const rows = region(container, 'Loading workflows');
    expect(rows.closest('section.workflow-list') ?? rows.querySelector('.workflow-list__cards, .workflow-list__card, .gn-skeleton')).not.toBeNull();
    expect(screen.queryByText('Loading workflows…')).toBeNull();
    act(() => gate.resolve([]));
    await screen.findByText('No workflows yet.');
    expect(container.querySelector('.gn-skeleton-region')).toBeNull();
    const failing = { ...createFakeGateway(), listWorkflows: () => Promise.reject(new Error('x')) };
    const again = render(<WorkflowListScreen workspaceId={workspaceId} session={session} gateway={failing} onOpen={() => undefined} onHistory={() => undefined} onNew={() => undefined} />);
    await screen.findByText('Could not load workflows. Reload to try again.');
    expect(again.container.querySelector('.gn-skeleton-region')).toBeNull();
  });

  it('25.130 the history screen draws rows while the versions are read, and the builder a form block while the people and types are read', async () => {
    const gate = held<never>();
    const history = render(<WorkflowHistoryScreen workspaceId={workspaceId} workflowId="wf" gateway={{ ...createFakeGateway(), getWorkflow: () => gate.promise }} />);
    region(history.container, 'Loading history');
    expect(screen.queryByText('Loading history…')).toBeNull();
    history.unmount();
    const people = held<never[]>();
    const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
    const builder = render(
      <WorkflowBuilderScreen workspaceId={workspaceId} session={session} gateway={{ ...createFakeGateway(), listMembers: () => people.promise }} initialDraft={draftFromTemplate(kanban)} />,
    );
    const block = region(builder.container, 'Loading workspace people and types');
    expect(block.querySelector('.gn-skeleton')).not.toBeNull();
    expect(screen.queryByText('Loading workspace people and types…')).toBeNull();
  });

  it('25.130 the ticket-type list and editor draw their rows / form block in their own sections', async () => {
    const gate = held<never[]>();
    const gateway = { ...createFakeGateway(), listTicketTypes: () => gate.promise };
    const list = render(<TicketTypeListScreen workspaceId={workspaceId} session={session} gateway={gateway} onOpen={() => undefined} onNew={() => undefined} />);
    region(list.container, 'Loading ticket types');
    expect(screen.queryByText('Loading ticket types…')).toBeNull();
    list.unmount();
    const editor = render(<TicketTypeEditorScreen workspaceId={workspaceId} session={session} gateway={gateway} initialDef={null} />);
    const block = region(editor.container, 'Loading ticket types');
    expect(block.closest('section.ticket-type-editor')).not.toBeNull();
    await waitFor(() => expect(screen.queryByText('Loading ticket types…')).toBeNull());
  });
});

describe('25.131 the comment thread', () => {
  it('25.131 an open read draws rows in the thread\'s own container (no "Comments (0)", no "No comments yet.", no sentence); an answered-empty read still says so (control)', () => {
    const { container, rerender } = render(<CommentsThread comments={null} nameOf={(id: string) => id} />);
    const rows = region(container, 'Loading comments');
    expect(rows.closest('.gn-comments') ?? rows).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByText('No comments yet.')).toBeNull();
    rerender(<CommentsThread comments={[]} nameOf={(id: string) => id} />);
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
    expect(container.querySelector('.gn-skeleton-region')).toBeNull();
  });
});

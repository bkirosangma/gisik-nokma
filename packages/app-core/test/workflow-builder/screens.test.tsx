import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { cloneTemplate, draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.js';
import { TemplateGallery } from '../../src/workflow-builder/ui/template-gallery.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.js';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };

describe('WorkflowBuilderScreen', () => {
  it('loads workspace data, then shows canvas, panels, name field and publish', async () => {
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(screen.getByText('Loading workspace people and types…')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toHaveValue('Simple kanban');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText('System rules — in every workflow')).toBeInTheDocument();
    expect(screen.getByText('No issues — this workflow can be published.')).toBeInTheDocument();
    expect(screen.getByText('To do')).toBeInTheDocument(); // a canvas node
    expect(screen.getByText('Select a state or a transition to edit it.')).toBeInTheDocument();
  });

  it('edits the workflow name into the def', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(kanban);
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />,
    );
    const nameField = await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.clear(nameField);
    await user.type(nameField, 'Shop errands');
    expect(nameField).toHaveValue('Shop errands');
  });

  it('adds a state from the header button', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.click(screen.getByRole('button', { name: 'Add state' }));
    expect(screen.getByText('New state')).toBeInTheDocument();
  });

  it('says so when workspace data cannot load', async () => {
    const gateway = createFakeGateway();
    gateway.listMembers = async () => {
      throw new Error('boom');
    };
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(
      await screen.findByText('Could not load workspace people and types — reload to try again.'),
    ).toBeInTheDocument();
  });
});

describe('WorkflowListScreen', () => {
  it('lists published workflows with version and state count, and opens one', async () => {
    const user = userEvent.setup();
    const first = cloneTemplate(kanban);
    const workflows = [{ ...first, version: 3 }];
    const onOpen = vi.fn();
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows })}
        onOpen={onOpen}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Simple kanban')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('3 states')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Simple kanban' }));
    expect(onOpen).toHaveBeenCalledWith(first.id);
  });

  it('offers New workflow to authors and says when the list is empty', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onNew={onNew}
      />,
    );
    expect(await screen.findByText('No workflows published yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New workflow' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('hides New workflow from non-authors', async () => {
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('No workflows published yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument();
  });
});

describe('TemplateGallery', () => {
  it('offers the three templates and Start blank', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<TemplateGallery onPick={onPick} />);
    expect(screen.getByText('Start from a template')).toBeInTheDocument();
    for (const template of WORKFLOW_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
      expect(screen.getByText(template.tagline)).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Use this template — Errand with waits' }));
    expect(onPick).toHaveBeenCalledWith(WORKFLOW_TEMPLATES[1]);
    await user.click(screen.getByRole('button', { name: 'Start blank' }));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});

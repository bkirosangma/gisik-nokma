import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider } from '../../src/workflow-builder/ui/builder-context.js';
import { BuilderPanels } from '../../src/workflow-builder/ui/builder-panels.js';

/**
 * Case 10.152 — the expanded body is the EXISTING inspector component, mounted, not a copy of it
 * (brief W1: "import and mount, do not copy"). The two inspector modules are replaced by marker
 * components; a row that rendered its own inline copy of the fields would show no marker. Kept in its
 * own file because `vi.mock` is file-wide and the real inspectors are exercised in builder-panels.test.tsx.
 */
vi.mock('../../src/workflow-builder/ui/state-inspector.js', () => ({
  StateInspector: (props: { stateId: string }) => <div data-testid="mounted-state-inspector">{props.stateId}</div>,
}));
vi.mock('../../src/workflow-builder/ui/transition-inspector.js', () => ({
  TransitionInspector: (props: { index: number }) => <div data-testid="mounted-transition-inspector">{props.index}</div>,
}));

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

afterEach(cleanup);

describe('10.152 a row mounts the existing inspectors', () => {
  it('10.152 a state row mounts StateInspector with its id; a transition row mounts TransitionInspector with its index', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    render(
      <BuilderProvider
        store={store}
        env={{
          workspaceId: newUlid(),
          session: { userId: newUlid(), role: 'admin' },
          gateway: createFakeGateway(),
          members: [],
          ticketTypes: [],
          canAuthor: true,
        }}
      >
        <BuilderPanels />
      </BuilderProvider>,
    );
    // CONTROL: collapsed, neither marker is mounted (the marker only appears through a row opening).
    expect(screen.queryByTestId('mounted-state-inspector')).toBeNull();
    expect(screen.queryByTestId('mounted-transition-inspector')).toBeNull();

    const states = screen.getByRole('heading', { name: /^States \(/ }).closest('section')!;
    await user.click(states.querySelectorAll('button')[1]!);
    expect(screen.getByTestId('mounted-state-inspector')).toHaveTextContent('doing');

    const transitions = screen.getByRole('heading', { name: /^Transitions \(/ }).closest('section')!;
    await user.click(transitions.querySelectorAll('button')[2]!);
    expect(screen.getByTestId('mounted-transition-inspector')).toHaveTextContent('2');
    expect(screen.queryByTestId('mounted-state-inspector')).toBeNull();
  });
});

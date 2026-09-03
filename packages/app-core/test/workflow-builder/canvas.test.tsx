import { render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export that survives `verbatimModuleSyntax` — same fix already
// settled at packages/app-core/test/views/board.test.tsx. The plan's Task 5
// snippet still carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { WorkflowCanvas } from '../../src/workflow-builder/ui/workflow-canvas.js';

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;

export function testEnv(overrides: Partial<BuilderEnvironment> = {}): BuilderEnvironment {
  return {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
    ...overrides,
  };
}

function renderCanvas(store: DraftStore, env = testEnv()) {
  return render(
    <BuilderProvider store={store} env={env}>
      <WorkflowCanvas />
    </BuilderProvider>,
  );
}

describe('WorkflowCanvas', () => {
  it('renders every state as a node with its name', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    for (const name of ['Later', 'Next', 'In progress', 'Waiting', 'Done']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('shows the initial-state marker on the start state only', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const start = screen.getByTestId('state-node-later');
    expect(within(start).getByText('Start')).toBeInTheDocument();
    expect(within(screen.getByTestId('state-node-done')).queryByText('Start')).not.toBeInTheDocument();
  });

  it('checks the blocked checkbox exactly on blocked-flagged states', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    expect(
      within(screen.getByTestId('state-node-waiting')).getByRole('checkbox', { name: 'Blocked' }),
    ).toBeChecked();
    expect(
      within(screen.getByTestId('state-node-in-progress')).getByRole('checkbox', { name: 'Blocked' }),
    ).not.toBeChecked();
  });

  it('changes a state category through the node picker', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const picker = within(screen.getByTestId('state-node-done')).getByRole('combobox', { name: 'Category' });
    await user.selectOptions(picker, 'active');
    expect(store.getState().def.states.find((state) => state.id === 'done')?.category).toBe('active');
  });

  it('toggles the blocked flag through the node checkbox', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    await user.click(
      within(screen.getByTestId('state-node-in-progress')).getByRole('checkbox', { name: 'Blocked' }),
    );
    expect(store.getState().def.states.find((state) => state.id === 'in-progress')?.blocked).toBe(true);
  });

  it('selects a state on click', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    await user.click(within(screen.getByTestId('state-node-done')).getByText('Done'));
    expect(store.getState().selection).toEqual({ kind: 'state', stateId: 'done' });
  });

  // The plan's own text (line ~1738) documents that the errand-with-waits
  // template was AMENDED at Plan 11's walk: its original inline payload used
  // require-evidence into `done`, which violated Plan 11's checkErrandTemplate
  // pin and was corrected to require-comment. ERRAND_WITH_WAITS_TEMPLATE as it
  // stands on this branch (packages/domain/src/workflows/errand-with-waits.ts)
  // carries three require-comment rules (transitions 3, 6, 8) and zero
  // require-evidence rules — so the plan's literal Step 6 test text (asserting
  // 'Must carry an attachment as evidence.' and a click landing on index 5)
  // would fail against the real template. Rewritten here to assert what the
  // template as measured actually carries, addressed by the edge's own
  // data-testid rather than by an ambiguous getAllByText[i] ordering guess.
  it('renders rule summaries on edges and selects the transition when a label is clicked', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    expect(screen.getAllByText('Must carry a comment explaining it.')).toHaveLength(3);
    await user.click(screen.getByTestId('transition-label-3'));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 3 });
  });

  it('renders the distinguished any-state source node', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    expect(screen.getByText('Any state')).toBeInTheDocument();
    expect(screen.getByText('drag from here for a from-anywhere move')).toBeInTheDocument();
  });

  it('disables editing controls when the viewer cannot author', () => {
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store, testEnv({ session: { userId: newUlid(), role: 'member' }, canAuthor: false }));
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('combobox', { name: 'Category' }),
    ).toBeDisabled();
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('checkbox', { name: 'Blocked' }),
    ).toBeDisabled();
  });

  // Measured fact from the coordination doc (~line 489, recorded unfixed):
  // transitionSchema admits a dangling `to: '*'` — a transition whose
  // DESTINATION is the literal string '*', which names no real state — and
  // it publishes clean today. This canvas must not crash reading that edge
  // back. flow-graph.ts's own "drops edges whose endpoint state is missing"
  // test only exercises a dangling FROM (`from: 'ghost'`); this is the
  // untested TO half, and this render is the discriminating claim — the
  // fixing of the validator is explicitly not this task's job (task brief),
  // only surviving what it lets through.
  it('renders without crashing when a transition dangles to the literal state "*"', () => {
    const draft = draftFromTemplate(errand);
    draft.def = { ...draft.def, transitions: [...draft.def.transitions, { from: 'later', to: '*', rules: [] }] };
    renderCanvas(createDraftStore(draft));
    expect(screen.getByText('Any state')).toBeInTheDocument();
  });
});

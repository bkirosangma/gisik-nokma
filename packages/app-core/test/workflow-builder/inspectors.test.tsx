import { render, screen } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export that survives `verbatimModuleSyntax` (settled at Task 5,
// packages/app-core/test/workflow-builder/canvas.test.tsx). The plan's Task 6
// snippet still carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { InspectorPanel } from '../../src/workflow-builder/ui/inspector-panel.js';
import { defaultRuleFor } from '../../src/workflow-builder/ui/rule-editors/add-rule-menu.js';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

function env(overrides: Partial<BuilderEnvironment> = {}): BuilderEnvironment {
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

function renderPanel(store: DraftStore, environment = env()) {
  return render(
    <BuilderProvider store={store} env={environment}>
      <InspectorPanel />
    </BuilderProvider>,
  );
}

describe('InspectorPanel', () => {
  it('hints when nothing is selected', () => {
    renderPanel(createDraftStore(draftFromTemplate(kanban)));
    expect(screen.getByText('Select a state or a transition to edit it.')).toBeInTheDocument();
  });
});

describe('StateInspector', () => {
  it('renames the selected state', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store);
    const nameInput = screen.getByRole('textbox', { name: 'State name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'In review');
    expect(store.getState().def.states.find((state) => state.id === 'doing')?.name).toBe('In review');
  });

  it('sets the selected state as the start state', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Set as start' }));
    expect(store.getState().def.initialStateId).toBe('doing');
  });

  it('the start state itself shows a disabled Set as start', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'todo' });
    renderPanel(store);
    expect(screen.getByRole('button', { name: 'Set as start' })).toBeDisabled();
  });

  it('deletes the selected state', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Delete state' }));
    expect(store.getState().def.states.map((state) => state.id)).toEqual(['todo', 'done']);
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  it('renders read-only when the viewer cannot author', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store, env({ canAuthor: false }));
    expect(screen.getByRole('textbox', { name: 'State name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete state' })).not.toBeInTheDocument();
  });
});

describe('TransitionInspector', () => {
  it('names both ends of the transition, including the any-state source', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addTransition('*', 'done');
    store.actions.select({ kind: 'transition', index: 4 });
    renderPanel(store);
    expect(screen.getByText('From Any state to Done')).toBeInTheDocument();
  });

  // "The add-rule menu offers EXACTLY the five kinds from the domain Rule
  // union with honest defaults — no sixth thing" (this task's own brief).
  // The plan's own test above, despite its title "adds a rule of each kind",
  // exercises exactly ONE kind (require-comment) — misdescribed coverage
  // recorded here rather than left implicit. This pair closes the gap: the
  // menu's full contents, and every kind's default, asserted directly.
  it('offers exactly the five Rule kinds and no sixth thing', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'transition', index: 2 });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Restrict who may move it',
      'Require a comment',
      'Require evidence (attachment)',
      'Require a field to be set',
      'Require a different user (four eyes)',
    ]);
  });

  it('defaultRuleFor gives an honest default for every one of the five kinds', () => {
    const draft = draftFromTemplate(kanban);
    expect(defaultRuleFor('restrict-to', draft.def)).toEqual({ kind: 'restrict-to', assignee: true });
    expect(defaultRuleFor('require-comment', draft.def)).toEqual({ kind: 'require-comment' });
    expect(defaultRuleFor('require-evidence', draft.def)).toEqual({ kind: 'require-evidence' });
    expect(defaultRuleFor('require-field', draft.def)).toEqual({ kind: 'require-field', field: 'dueDate' });
    // Kanban's transitions[0] is todo -> doing, so the first inbound target is 'doing'.
    expect(defaultRuleFor('require-different-user', draft.def)).toEqual({
      kind: 'require-different-user',
      thanActorOf: { to: 'doing' },
    });
  });

  it('adds a rule of each kind with honest defaults', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'transition', index: 2 }); // doing -> done
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.click(screen.getByRole('menuitem', { name: 'Require a comment' }));
    expect(store.getState().def.transitions[2]?.rules).toEqual([{ kind: 'require-comment' }]);
  });

  it('defaults require-different-user to the first transition target', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'transition', index: 2 });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.click(screen.getByRole('menuitem', { name: 'Require a different user (four eyes)' }));
    expect(store.getState().def.transitions[2]?.rules).toEqual([
      { kind: 'require-different-user', thanActorOf: { to: 'doing' } },
    ]);
  });

  it('removes a rule and deletes the transition', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(2, { kind: 'require-evidence' });
    store.actions.select({ kind: 'transition', index: 2 });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Remove rule' }));
    expect(store.getState().def.transitions[2]?.rules).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Delete transition' }));
    expect(store.getState().def.transitions).toHaveLength(3);
  });

  it('hides authoring controls from non-authors but still shows the rules', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(2, { kind: 'require-evidence' });
    store.actions.select({ kind: 'transition', index: 2 });
    renderPanel(store, env({ canAuthor: false }));
    expect(screen.getByText('Must carry an attachment as evidence.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete transition' })).not.toBeInTheDocument();
  });
});

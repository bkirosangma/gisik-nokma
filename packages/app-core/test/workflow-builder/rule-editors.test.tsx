import { render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export under this repo's module resolution.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid, type TicketTypeDef } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { InspectorPanel } from '../../src/workflow-builder/ui/inspector-panel.js';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const ASHA = newUlid();
const BIKRAM = newUlid();

function boundType(workflowId: string): TicketTypeDef {
  return {
    id: newUlid(),
    name: 'Errand',
    icon: 'wrench',
    rank: 3,
    workflowId,
    fields: [{ id: 'counterparty', name: 'Counterparty', type: 'text' }],
  };
}

function renderInspector(store: DraftStore, envOverrides: Partial<BuilderEnvironment> = {}) {
  const environment: BuilderEnvironment = {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [
      { userId: ASHA, displayName: 'Asha', role: 'member' },
      { userId: BIKRAM, displayName: 'Bikram', role: 'admin' },
    ],
    ticketTypes: [boundType(store.getState().def.id)],
    canAuthor: true,
    ...envOverrides,
  };
  return render(
    <BuilderProvider store={store} env={environment}>
      <InspectorPanel />
    </BuilderProvider>,
  );
}

describe('RestrictToEditor', () => {
  it('toggles assignee, roles, and named members into the rule', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    const editor = screen.getByTestId('restrict-to-editor');
    await user.click(within(editor).getByRole('checkbox', { name: 'The assignee' }));
    await user.click(within(editor).getByRole('checkbox', { name: 'Role: admin' }));
    await user.click(within(editor).getByRole('checkbox', { name: 'Asha' }));
    expect(store.getState().def.transitions[0]?.rules[0]).toEqual({
      kind: 'restrict-to',
      roles: ['admin'],
      userIds: [ASHA],
    });
  });

  it('shows the emptiness helper when nobody is picked', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    await user.click(screen.getByRole('checkbox', { name: 'The assignee' }));
    expect(
      screen.getByText('Pick at least one — a restriction that names nobody can never be satisfied.'),
    ).toBeInTheDocument();
  });
});

describe('RequireFieldEditor', () => {
  it('offers built-ins plus the bound types fields, and picks into the rule', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'require-field', field: 'dueDate' });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    const picker = screen.getByRole('combobox', { name: 'Field' });
    const optionLabels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // fields.ts's BUILTIN_FIELD_CHOICES carries four built-ins (title,
    // description, dueDate, startDate) — the plan's own text lists only three,
    // but a prior fix round (dd1cdeb) added startDate to mirror domain's
    // BUILTIN_FIELD_IDS, and this test targets fieldChoicesFor's real output.
    expect(optionLabels).toEqual(['Title', 'Description', 'Due date', 'Start date', 'Counterparty (Errand)']);
    await user.selectOptions(picker, 'counterparty');
    expect(store.getState().def.transitions[0]?.rules[0]).toEqual({
      kind: 'require-field',
      field: 'counterparty',
    });
  });

  it('warns when the rule names a field no bound type carries', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'require-field', field: 'ghost-field' });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    expect(
      screen.getByText('This field is not on any ticket type bound to this workflow.'),
    ).toBeInTheDocument();
  });
});

describe('RequireDifferentUserEditor', () => {
  it('offers only states some transition points at, naming the move', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    store.actions.select({ kind: 'transition', index: 2 });
    renderInspector(store);
    const picker = screen.getByRole('combobox', { name: 'Earlier move' });
    const optionLabels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['the move to "Doing"', 'the move to "To do"', 'the move to "Done"']);
    await user.selectOptions(picker, 'done');
    expect(store.getState().def.transitions[2]?.rules[0]).toEqual({
      kind: 'require-different-user',
      thanActorOf: { to: 'done' },
    });
  });

  it('notes the vacuous case when the rule watches the start state', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    // 'todo' is already a transition target (doing -> todo) AND the initial state — the vacuous case
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'todo' } });
    store.actions.select({ kind: 'transition', index: 2 });
    renderInspector(store);
    expect(
      screen.getByText(
        'A ticket born in the start state has nobody to differ from — this rule only bites once the move to "To do" has actually been performed.',
      ),
    ).toBeInTheDocument();
  });
});

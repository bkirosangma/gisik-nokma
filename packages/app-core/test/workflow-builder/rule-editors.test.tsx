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
import { BuilderPanels } from '../../src/workflow-builder/ui/builder-panels.js';

// Every conditional affordance below is asserted BOTH ways: present when the
// condition holds, and absent when it does not. The absent half is not
// ceremony — an affordance only ever asserted present cannot detect
// over-firing, and a mutation that renders it unconditionally passes. That
// matters most for the require-field unknown-field warning, which is the only
// enforcement of design decision 3 anywhere in the product: validateWorkflowDef
// emits eleven issue codes and adviseWorkflowDef two more, and not one of them
// reads require-field's `field`. domain's ruleSchema asks only for a non-empty
// string, so 'ghost-field' publishes clean. This warning is the whole
// enforcement.
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
      <BuilderPanels />
    </BuilderProvider>,
  );
}

describe('RestrictToEditor', () => {
  /**
   * 10.11 — restrict-to: assignee/role/member pickers write the rule; dead keys omitted.
   */
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
    // Absent half: something is picked, so the emptiness helper must not show.
    expect(screen.queryByText('Pick at least one. A restriction that names nobody can never be satisfied.')).not.toBeInTheDocument();
  });

  it('renders without a member roster at all', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.select({ kind: 'transition', index: 0 });
    // A guest may not call GET /v1/workspaces/:id/members (executor ruling
    // 2026-09-02), so an empty roster is a legitimate state, not a bug — the
    // people fieldset renders no rows and the rest of the editor still works.
    renderInspector(store, { members: [] });
    const editor = screen.getByTestId('restrict-to-editor');
    expect(within(editor).getByRole('checkbox', { name: 'Role: admin' })).toBeInTheDocument();
    expect(within(editor).queryByRole('checkbox', { name: 'Asha' })).not.toBeInTheDocument();
  });

  /**
   * 10.12 — the restrict-to emptiness helper appears when nobody is picked.
   */
  it('shows the emptiness helper when nobody is picked', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    await user.click(screen.getByRole('checkbox', { name: 'The assignee' }));
    expect(
      screen.getByText('Pick at least one. A restriction that names nobody can never be satisfied.'),
    ).toBeInTheDocument();
  });
});

describe('RequireFieldEditor', () => {
  /**
   * 10.13 — require-field is picker-only: built-ins plus bound types' fields.
   */
  /**
   * 10.87 — both rule-editor pickers render as the shared non-searchable Select (button trigger, portal listbox) instead of native `<select>`s, each carrying the `string` -> `string | null` unset treatment so an unrecognised value shows the component's own placeholder. The sibling tests below cover the placeholder-fallback and the Earlier-move picker.
   */
  it('offers built-ins plus the bound types fields, and picks into the rule', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'require-field', field: 'dueDate' });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    const picker = screen.getByRole('button', { name: /Field/ });
    await user.click(picker);
    const listbox = await screen.findByRole('listbox');
    const optionLabels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // fields.ts's BUILTIN_FIELD_CHOICES carries four built-ins (title,
    // description, dueDate, startDate) — the plan's own text lists only three,
    // but a prior fix round (dd1cdeb) added startDate to mirror domain's
    // BUILTIN_FIELD_IDS, and this test targets fieldChoicesFor's real output.
    expect(optionLabels).toEqual(['Title', 'Description', 'Due date', 'Start date', 'Counterparty (Errand)']);
    await user.click(within(listbox).getByRole('option', { name: 'Counterparty (Errand)' }));
    expect(store.getState().def.transitions[0]?.rules[0]).toEqual({
      kind: 'require-field',
      field: 'counterparty',
    });
    // Absent half, and the load-bearing one: both 'dueDate' and 'counterparty'
    // are real choices, so a warning here would be the product crying wolf
    // about the one thing it alone polices.
    expect(screen.queryByText('This field is not on any ticket type bound to this workflow.')).not.toBeInTheDocument();
  });

  /**
   * 10.14 — require-field warns on a field no bound type carries.
   */
  it('warns when the rule names a field no bound type carries', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'require-field', field: 'ghost-field' });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    expect(
      screen.getByText('This field is not on any ticket type bound to this workflow.'),
    ).toBeInTheDocument();
    // The placeholder is what keeps the trigger from *displaying* a field the
    // rule does not name. Without Select falling back to its placeholder text
    // when `value` matches nothing, the trigger would show "Title" while the
    // rule still requires 'ghost-field' — the exact misrepresentation design
    // decision 3 exists to prevent.
    expect(screen.getByRole('button', { name: /Field/ })).toHaveTextContent('Select…');
  });
});

describe('RequireDifferentUserEditor', () => {
  /**
   * 10.15 — require-different-user picks among transition targets, naming the move.
   */
  it('offers only states some transition points at, naming the move', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    store.actions.select({ kind: 'transition', index: 2 });
    renderInspector(store);
    const picker = screen.getByRole('button', { name: /Earlier move/ });
    await user.click(picker);
    const listbox = await screen.findByRole('listbox');
    const optionLabels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['the move to "Doing"', 'the move to "To do"', 'the move to "Done"']);
    await user.click(within(listbox).getByRole('option', { name: 'the move to "Done"' }));
    expect(store.getState().def.transitions[2]?.rules[0]).toEqual({
      kind: 'require-different-user',
      thanActorOf: { to: 'done' },
    });
    // Absent half: 'done' is not the start state, so the vacuous-case note must
    // not show. Matched by substring — the note interpolates the state name, so
    // an over-firing note would read "…the move to \"Done\"" here.
    expect(screen.queryByText(/has nobody to differ from/)).not.toBeInTheDocument();
  });

  /**
   * 10.16 — the rdu start-state vacuous case carries its honesty note.
   */
  it('notes the vacuous case when the rule watches the start state', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    // 'todo' is already a transition target (doing -> todo) AND the initial state — the vacuous case
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'todo' } });
    store.actions.select({ kind: 'transition', index: 2 });
    renderInspector(store);
    expect(
      screen.getByText(
        'A ticket born in the start state has nobody to differ from. This rule only bites once the move to "To do" has actually been performed.',
      ),
    ).toBeInTheDocument();
  });
});

describe('RuleEditor authoring gate', () => {
  it('shows a non-author the rule summaries and none of the editors', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    // One rule of each configurable kind, so all three editors are exercised.
    // inspectors.test.tsx's non-author test uses require-evidence, whose editor
    // renders nothing either way — it could never have caught this gate.
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.addRule(0, { kind: 'require-field', field: 'dueDate' });
    store.actions.addRule(0, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store, { canAuthor: false });
    // Present half — without it, "no editors" cannot be told apart from
    // "nothing rendered at all".
    expect(screen.getByText('Only the assignee may make this move.')).toBeInTheDocument();
    // Absent half, probed through each editor's own affordance rather than a
    // testid: only restrict-to-editor carries one.
    expect(screen.queryByRole('checkbox', { name: 'The assignee' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Field/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Earlier move/ })).not.toBeInTheDocument();
  });
});

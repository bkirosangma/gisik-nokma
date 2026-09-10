import { render, screen } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export that survives `verbatimModuleSyntax` — settled at test/views/board.test.tsx
// and re-corrected at canvas.test.tsx. The plan's Task 12 snippet still carries
// the default spelling, as its Task 5 snippet did.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid, type TicketTypeDef } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { cloneTemplate, draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.js';
import { TicketTypeListScreen } from '../../src/workflow-builder/ticket-types/ticket-type-list-screen.js';
import { TicketTypeEditorScreen } from '../../src/workflow-builder/ticket-types/ticket-type-editor-screen.js';

// EVERY testid lookup in this file is `await findByTestId`, never `getByTestId`,
// and that is load-bearing rather than stylistic. React Flow measures and lays
// out before it paints edge labels, so awaiting the name textbox does NOT imply
// the edges exist: `getByTestId` asserts on the first tick, and the first tick
// can be empty. This reddened CI on 2026-09-03 at the member case below --
// `Unable to find an element by: [data-testid="transition-label-8"]` -- with 686
// of 687 app-core tests passing and its own admin control case passing in the
// same run, which is a race signature, not a bad selector.
//
// Measured twice, because "it passes now" proves nothing here -- it passed 17
// consecutive local runs before anyone found the window:
//   - Post-textbox-await, the instant this file used to query: the edge was
//     absent 1 observation in 16, and the hit landed on the first attempt of a
//     cold run -- the same shape as a cold CI runner.
//   - Synchronously after render(): absent 16/16, no variance. At that instant
//     `getByTestId` throws 8/8 and `await findByTestId` succeeds 8/8 -- a
//     deterministic paired control that needs no luck to reproduce.
// Do not "simplify" these back to getByTestId.

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;

// Hardcoded, NOT imported from the component. If both sides read one constant a
// copy drift is invisible and this whole file asserts only "the banner agrees
// with itself". The string is the Pinned UI copy row, character for character.
const BANNER = 'You can look, not touch — only a workspace owner or admin can change workflows and ticket types.';

// All four of WorkspaceRole, because the whole gate is `canAuthorRole`, a
// one-line predicate over this union. A suite that only ever passes 'member'
// and 'admin' is a two-point sample, not a boundary test: rewrite the predicate
// to `role === 'admin'` and every member/admin assertion still passes while an
// OWNER is shown a banner saying they may not change the thing they own.
const memberSession: BuilderSession = { userId: newUlid(), role: 'member' };
const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };
const ownerSession: BuilderSession = { userId: newUlid(), role: 'owner' };
const guestSession: BuilderSession = { userId: newUlid(), role: 'guest' };

const kanbanPublished = { ...cloneTemplate(WORKFLOW_TEMPLATES[0]!), version: 1 };
const errandPublished = { ...cloneTemplate(errand), version: 1 };
const taskType: TicketTypeDef = {
  id: 'task',
  name: 'Task',
  icon: 'check',
  rank: 3,
  workflowId: kanbanPublished.id,
  fields: [{ id: newUlid(), name: 'Shop', type: 'text' }],
};

function renderBuilder(session: BuilderSession, gateway = createFakeGateway()) {
  render(
    <WorkflowBuilderScreen
      workspaceId={newUlid()}
      session={session}
      gateway={gateway}
      initialDraft={draftFromTemplate(errand)}
    />,
  );
  return gateway;
}

/**
 * Every value-bearing control the builder screen puts on screen, by role.
 * Deliberately a QUERY over the whole tree rather than a list of names: the
 * point of the count assertions below is that a control added later is caught
 * by them, and a hand-maintained name list would silently stop covering it.
 */
function valueControls(): HTMLElement[] {
  return [
    ...screen.queryAllByRole('textbox'),
    ...screen.queryAllByRole('combobox'),
    ...screen.queryAllByRole('checkbox'),
    ...screen.queryAllByRole('spinbutton'),
    // The shared Select component's trigger is a real <button> (react-aria's
    // useSelect), not a <select>/combobox — but it is still the value-bearing
    // control for whichever field it picks, so the enumeration has to keep
    // catching it under its new role rather than silently losing coverage.
    // Scoped to "Field type" by name: the only Select call site in this
    // screen's tree at time of writing (fields-editor.tsx, Task 5 of the
    // shared-select plan).
    ...screen.queryAllByRole('button', { name: /Field type/ }),
  ];
}

describe('read-only workflow views for non-admins', () => {
  /**
   * 10.47 — non-admins: banner, disabled fields, no publish/save/add anywhere.
   */
  it('the builder screen shows the banner, disables the name field, and offers no publish', async () => {
    renderBuilder(memberSession);
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Workflow name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add state' })).not.toBeInTheDocument();
  });

  // The control for the test above. Without it, a typo in either button name
  // would make both `queryByRole(...).not.toBeInTheDocument()` assertions pass
  // against a screen that never had those buttons under those names at all.
  it('control: the admin builder screen carries no banner and does offer Publish and Add state', async () => {
    renderBuilder(adminSession);
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toBeEnabled();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add state' })).toBeInTheDocument();
  });

  // The other side of the boundary. `canAuthorRole` is `owner || admin`, and an
  // owner is the ONE role for which a wrong predicate is actively insulting
  // rather than merely restrictive — so this is the test that fails when the
  // predicate narrows, and none of the member/admin pairs above would.
  it('an owner authors exactly as an admin does — no banner, and both authoring affordances', async () => {
    renderBuilder(ownerSession);
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toBeEnabled();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add state' })).toBeInTheDocument();
  });

  /**
   * Guest is the role where two separate facts about this screen meet, and
   * nothing in the repo pinned either of them for a guest before this test:
   * the read-only gate, and the executor ruling of 2026-09-02 that a guest may
   * NOT call GET /v1/workspaces/:id/members. `screens.test.tsx`'s test named
   * for that refusal passes an ADMIN session — it proves the degradation, not
   * that a guest gets it. Here the roster is refused the way a guest's actually
   * will be, and the screen must still render, still be read-only, and still
   * offer nothing but jumps.
   */
  it('a guest gets the read-only screen even when the member roster is refused, as a guest roster is', async () => {
    const gateway = createFakeGateway();
    gateway.listMembers = async () => {
      throw new Error('403 guest cannot list members');
    };
    renderBuilder(guestSession, gateway);
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Workflow name' })).toBeDisabled();
    expect(
      screen.queryByText('Could not load workspace people and types — reload to try again.'),
    ).not.toBeInTheDocument();
    for (const button of screen.queryAllByRole('button')) {
      expect(button.className).toMatch(/(issues|advisories)-panel__jump/);
    }
    expect(gateway.submitted).toEqual([]);
  });

  it('a member can inspect a transition but cannot edit its rules', async () => {
    const user = userEvent.setup();
    renderBuilder(memberSession);
    await screen.findByRole('textbox', { name: 'Workflow name' });
    // Transition 8 is `In progress -> Done`, the errand template's own edge.
    // Addressed by the edge's data-testid, not by its summary text: the
    // template carries THREE identical `Must carry a comment explaining it.`
    // labels (transitions 3, 6 and 8), so `getByText` on that string throws on
    // multiple matches. The plan's snippet asserts `Must carry an attachment as
    // evidence.` instead — the errand template has no require-evidence rule at
    // all, so that click could never have landed (see the report note).
    await user.click(await screen.findByTestId('transition-label-8'));
    // The inspector opens with the rule visible…
    expect(screen.getByText('From In progress to Done')).toBeInTheDocument();
    // …but nothing is editable.
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete transition' })).not.toBeInTheDocument();
  });

  it('control: the identical gesture as an admin opens the same inspector WITH Add rule, Remove rule and Delete transition', async () => {
    const user = userEvent.setup();
    renderBuilder(adminSession);
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.click(await screen.findByTestId('transition-label-8'));
    expect(screen.getByText('From In progress to Done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove rule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete transition' })).toBeInTheDocument();
  });

  it('the workflow list shows the banner to members', async () => {
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={memberSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
  });

  it('control: the admin workflow list shows no banner', async () => {
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('No workflows published yet.')).toBeInTheDocument();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it('the ticket-type list shows the banner to members', async () => {
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={memberSession}
        gateway={createFakeGateway({ ticketTypes: [taskType] })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
  });

  it('control: the admin ticket-type list shows no banner', async () => {
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ ticketTypes: [taskType] })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Task')).toBeInTheDocument();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it('the ticket-type editor shows the banner to members', async () => {
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={memberSession}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [taskType] })}
        initialDef={taskType}
      />,
    );
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
  });

  it('control: the admin ticket-type editor shows no banner', async () => {
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [taskType] })}
        initialDef={taskType}
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Type name' })).toBeEnabled();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });
});

/**
 * The end-to-end half. The four tests above prove named affordances are absent;
 * these prove no OTHER path reaches an authoring action — which is the claim
 * rulings P19, P22 and P23 each found a UI making without a test behind it.
 */
describe('no authoring action is reachable by any path the builder screen offers a member', () => {
  it('shows the member every control the admin gets, and disables every one of them', async () => {
    renderBuilder(memberSession);
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await screen.findByText('Later'); // the canvas nodes mount a tick after the screen
    const memberControls = valueControls();
    // Enumerated, not counted alone: 1 workflow-name textbox + 5 category
    // comboboxes + 5 blocked checkboxes, one pair per errand state. A zero here
    // would make "every one of them is disabled" vacuously true.
    expect(memberControls).toHaveLength(11);
    for (const control of memberControls) expect(control).toBeDisabled();
    // Read-only is not hidden: nothing was omitted, only frozen. One category
    // picker per state, all five still on screen.
    expect(screen.getAllByRole('combobox', { name: 'Category' })).toHaveLength(5);
  });

  it('control: the admin render has the SAME controls, every one of them enabled', async () => {
    renderBuilder(adminSession);
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await screen.findByText('Later');
    const adminControls = valueControls();
    expect(adminControls).toHaveLength(11);
    for (const control of adminControls) expect(control).toBeEnabled();
  });

  /**
   * MEASURED, and it corrected the claim this test was first written to make.
   * "A member's builder screen offers no button at all" is FALSE: the frozen
   * ERRAND_WITH_WAITS_TEMPLATE trips `rule-bypassable` twice, so the advisories
   * panel puts two jump buttons on screen for everyone. (That double advisory
   * is an OPEN RULING REQUEST recorded in the coordination doc under its own
   * top-level heading beginning "RULING REQUEST -- Plan 8 Task 3's frozen
   * errand template trips rule-bypassable" — not this task's to resolve, and
   * the template is not to be fixed here.)
   *
   * The true invariant is narrower and worth more: every button a member is
   * offered is a JUMP — an issues-panel or advisories-panel affordance whose
   * whole effect is `store.actions.select`, which changes what is being LOOKED
   * at and nothing about the def. So the sweep clicks every one of them and
   * re-checks the invariant after each click, because a jump mounts an
   * inspector and an inspector is exactly where an ungated authoring button
   * would appear.
   */
  it('offers a member only jump buttons — clicking every one of them, and selecting a state and a transition, never surfaces an authoring button', async () => {
    const user = userEvent.setup();
    renderBuilder(memberSession);
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await screen.findByText('Later');

    function everyButtonIsAJump(): void {
      for (const button of screen.queryAllByRole('button')) {
        expect(button.className).toMatch(/(issues|advisories)-panel__jump/);
      }
    }

    const openingNames = screen.queryAllByRole('button').map((button) => button.textContent ?? '');
    // Non-vacuity: the sweep below would prove nothing over an empty list, and
    // the first draft of this test asserted exactly that empty list.
    expect(openingNames.length).toBeGreaterThan(0);
    everyButtonIsAJump();
    for (const name of openingNames) {
      const button = screen.queryAllByRole('button').find((candidate) => candidate.textContent === name);
      if (button !== undefined) await user.click(button);
      everyButtonIsAJump();
    }

    // The two gestures that MOUNT new components (TransitionInspector,
    // StateInspector) — the two other ways a button could appear after the
    // first paint.
    await user.click(await screen.findByTestId('transition-label-8'));
    expect(screen.getByText('From In progress to Done')).toBeInTheDocument();
    everyButtonIsAJump();
    await user.click(await screen.findByTestId('state-node-waiting'));
    expect(screen.getByRole('textbox', { name: 'State name' })).toBeDisabled();
    everyButtonIsAJump();
  });

  it('control: the same three gestures as an admin surface the authoring buttons at every step', async () => {
    const user = userEvent.setup();
    renderBuilder(adminSession);
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await screen.findByText('Later');
    // The paired control for `everyButtonIsAJump`: on the admin's opening
    // screen the SAME predicate is false, because Add state and Publish are
    // there. A predicate that held for both roles would be measuring nothing.
    const adminOpening = screen.queryAllByRole('button');
    expect(adminOpening.some((button) => !/(issues|advisories)-panel__jump/.test(button.className))).toBe(true);
    expect(screen.getByRole('button', { name: 'Add state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    await user.click(await screen.findByTestId('transition-label-8'));
    expect(screen.getByRole('button', { name: 'Delete transition' })).toBeInTheDocument();
    await user.click(await screen.findByTestId('state-node-waiting'));
    expect(screen.getByRole('button', { name: 'Delete state' })).toBeInTheDocument();
  });

  it('never reaches gateway.submit for a member, however the screen is worked (control: the admin publish does submit)', async () => {
    const user = userEvent.setup();
    const memberGateway = renderBuilder(memberSession);
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await screen.findByText('Later');
    for (const name of screen.queryAllByRole('button').map((button) => button.textContent ?? '')) {
      const button = screen.queryAllByRole('button').find((candidate) => candidate.textContent === name);
      if (button !== undefined) await user.click(button);
    }
    await user.click(await screen.findByTestId('transition-label-8'));
    await user.click(await screen.findByTestId('state-node-waiting'));
    expect(memberGateway.submitted).toEqual([]);
    screen.getByText(BANNER); // still the same screen we swept

    const adminGateway = renderBuilder(adminSession);
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    // The gate is the ONLY difference: the identical draft, submitted.
    expect(adminGateway.submitted).toHaveLength(1);
  });
});

/**
 * `migrateTypeToWorkflow` is the one irreversible call in this package — it
 * expands into a `ticket.workflow_rebound` per ticket — and it was the only one
 * of the three gateway call sites with no non-author test behind it. Task 11's
 * rebind suite drives the whole flow, but its helper defaults to an admin
 * session, so no member ever reached the divergence section there. (An assertion
 * on `migrations` from the BUILDER screen would not cover this: that screen has
 * no migrate path, so it could never fail.)
 */
describe('the bulk migration — the one irreversible call — is unreachable for a member', () => {
  function renderEditor(session: BuilderSession) {
    const gateway = createFakeGateway({
      workflows: [kanbanPublished, errandPublished],
      ticketTypes: [taskType],
      typePopulation: { task: { [kanbanPublished.id]: 14 } },
    });
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={session}
        gateway={gateway}
        initialDef={taskType}
      />,
    );
    return gateway;
  }

  it('locks the binding itself, so the divergence section a migration lives in never opens', async () => {
    const user = userEvent.setup();
    const gateway = renderEditor(memberSession);
    const picker = await screen.findByRole('combobox', { name: 'Workflow' });
    expect(picker).toBeDisabled();
    // The gesture an admin uses to reach the migration, attempted anyway.
    await user.selectOptions(picker, errandPublished.id).catch(() => {});
    expect(screen.queryByTestId('workflow-divergence')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Move them to "${errandPublished.name}"…` })).not.toBeInTheDocument();
    expect(gateway.migrations).toEqual([]);
    expect(gateway.submitted).toEqual([]);
  });

  it('control: the identical gesture as an admin does open the divergence section and offer the move', async () => {
    const user = userEvent.setup();
    renderEditor(adminSession);
    const picker = await screen.findByRole('combobox', { name: 'Workflow' });
    expect(picker).toBeEnabled();
    await user.selectOptions(picker, errandPublished.id);
    expect(await screen.findByTestId('workflow-divergence')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }),
    ).toBeInTheDocument();
  });
});

describe('the server, not the UI, is the enforcer', () => {
  /**
   * 10.48 — planted defect: permission.role refusal rendered character for character.
   */
  it('renders a permission.role refusal verbatim (planted defect: the gate is down but the server still refuses)', async () => {
    const user = userEvent.setup();
    const reason = 'Only a workspace owner or admin can do this. Your role is member.';
    renderBuilder(
      adminSession, // the UI believes this user may publish…
      createFakeGateway({
        submitResults: [{ status: 'refused', eventId: 'evt', rule: 'permission.role', reason }],
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    // …and the server's refusal reaches the screen character for character.
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: permission.role')).toBeInTheDocument();
  });

  // The refusal path is not special-cased on the rule name anywhere: this
  // client meets rule names it has never heard of, and a lookup table would be
  // the paraphrase the pinned copy forbids. Same banner, a rule string this
  // package has no knowledge of whatsoever.
  it('renders a refusal under a rule name this client has never heard of, with no table to look it up in', async () => {
    const user = userEvent.setup();
    const reason = 'This workspace is read-only while its billing is being reconciled.';
    renderBuilder(
      adminSession,
      createFakeGateway({
        submitResults: [{ status: 'refused', eventId: 'evt', rule: 'workspace.frozen-for-billing', reason }],
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: workspace.frozen-for-billing')).toBeInTheDocument();
  });
});

/**
 * The other half of the enumeration, and the half the first version of this file
 * left out. Everything above enumerates the BUILDER screen; the ticket-type
 * editor is the other surface behind the same gate, and it is the one that owns
 * field-schema authoring and the rank that drives D4's requires-parent rule.
 * Measured before these two tests existed, at the sha that added them: three
 * separate gates on that screen were pinned by NOTHING — dropping `disabled` on
 * the IconPicker, on the FieldsEditor, and the `!canAuthor` half of the rank
 * input's gate each left 211/211 green. The gate itself was correct; the proof
 * was missing, which is the same defect rulings P19, P22 and P23 name.
 *
 * The fixture is a CUSTOM type on purpose. Every member fixture that existed
 * before — `taskType` here, and `ticket-types.test.tsx`'s builtin seeds — is one
 * of BUILTIN_TICKET_TYPE_SEEDS, so `isBuiltin` is already true and the rank
 * input's `!canAuthor || isBuiltin` is satisfied by its second term whatever the
 * first says. A custom type is the only shape in which the author half of that
 * gate can fail.
 */
const customType: TicketTypeDef = {
  id: newUlid(),
  name: 'Errand',
  icon: 'truck',
  // Deeper than the domain's DEEPEST_RANK of 4 — `rank >= DEEPEST_RANK`, so
  // this type requires a parent. That makes the rank input exactly the field
  // D4's requires-parent rule reads, and the one an ungated member could move.
  rank: 5,
  fields: [
    { id: newUlid(), name: 'Shop', type: 'text' },
    // A select field, so the editor also mounts its options textarea: one more
    // value-bearing control that FieldsEditor gates and nothing pinned.
    { id: newUlid(), name: 'Urgency', type: 'select', options: ['today', 'this week'] },
  ],
  workflowId: kanbanPublished.id,
};

describe('no authoring action is reachable by any path the TICKET-TYPE EDITOR offers a member', () => {
  function renderTypeEditor(session: BuilderSession) {
    const gateway = createFakeGateway({
      workflows: [kanbanPublished, errandPublished],
      ticketTypes: [customType],
    });
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={session}
        gateway={gateway}
        initialDef={customType}
      />,
    );
    return gateway;
  }

  it('shows the member every control the admin gets, disables every one of them, and every button on the screen is an icon choice or a gated Field-type control', async () => {
    renderTypeEditor(memberSession);
    await screen.findByRole('textbox', { name: 'Type name' });
    const memberControls = valueControls();
    // Enumerated, not counted alone: 4 textboxes (Type name, two Field names —
    // a textarea reports as one too, so the select field's options box is in
    // here) + 1 combobox (Workflow) + 2 Field-type Select triggers (the shared
    // Select's trigger is a <button>, counted by valueControls()'s dedicated
    // query for it) + 1 spinbutton (rank).
    expect(memberControls).toHaveLength(8);
    for (const control of memberControls) expect(control).toBeDisabled();
    // Named separately from the sweep because this is the D4 field and the
    // sharpest of the three: on a builtin type `isBuiltin` would mask it.
    expect(screen.getByRole('spinbutton', { name: 'Hierarchy rank' })).toBeDisabled();

    // The button analogue of the builder screen's `everyButtonIsAJump`: every
    // button a member is offered here is either an icon choice or one of the
    // two Field-type Select triggers — a value control already covered by the
    // sweep above, not an authoring affordance — and every one of them is
    // disabled. FieldsEditor's Add/Remove and the Save button are the ones
    // that would appear if a gate came down.
    const iconGroup = screen.getByRole('group', { name: 'Icon' });
    const fieldTypeTriggers = screen.getAllByRole('button', { name: /Field type/ });
    expect(fieldTypeTriggers).toHaveLength(2);
    const buttons = screen.queryAllByRole('button');
    // Non-vacuity: sixteen icon choices ship at this sha, so an empty list here
    // would mean the picker never rendered rather than that nothing escaped.
    expect(buttons.length).toBeGreaterThan(8);
    for (const button of buttons) {
      expect(iconGroup.contains(button) || fieldTypeTriggers.includes(button)).toBe(true);
      expect(button).toBeDisabled();
    }
    // The named half, whose control is the next test — without it a typo in any
    // of these three names would make all three assertions pass vacuously.
    expect(screen.queryByRole('button', { name: 'Add field' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove field' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save ticket type' })).not.toBeInTheDocument();
  });

  it('control: the admin render has the SAME eight controls, every one enabled, and DOES offer Add field, Remove field and Save', async () => {
    renderTypeEditor(adminSession);
    await screen.findByRole('textbox', { name: 'Type name' });
    const adminControls = valueControls();
    expect(adminControls).toHaveLength(8);
    for (const control of adminControls) expect(control).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Hierarchy rank' })).toBeEnabled();

    // The paired control for "every button is an icon choice": on the admin's
    // render that predicate is FALSE, because the three authoring buttons are
    // there. A predicate that held for both roles would measure nothing.
    const iconGroup = screen.getByRole('group', { name: 'Icon' });
    const buttons = screen.queryAllByRole('button');
    expect(buttons.some((button) => !iconGroup.contains(button))).toBe(true);
    expect(screen.getByRole('button', { name: 'Add field' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove field' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save ticket type' })).toBeInTheDocument();
  });
});

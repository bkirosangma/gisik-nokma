import { cleanup, render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export that survives `verbatimModuleSyntax` (settled at Task 5,
// canvas.test.tsx). The plan's Task 9 snippet still carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  adviseWorkflowDef,
  newUlid,
  validateWorkflowDef,
  type PublishedWorkflowDef,
} from '@gisik-nokma/domain';
import { createDraftStore, draftFromPublished, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway, type FakeGatewaySeed } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { IssuesPanel } from '../../src/workflow-builder/ui/issues-panel.js';
import { PublishControls } from '../../src/workflow-builder/ui/publish-controls.js';
import { StateMappingDialog } from '../../src/workflow-builder/ui/state-mapping-dialog.js';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

function publishedKanban(id: string): PublishedWorkflowDef {
  return {
    id,
    version: 2,
    name: 'Kanban',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'review', name: 'Review', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'review', rules: [] },
      { from: 'review', to: 'done', rules: [] },
      { from: 'done', to: 'todo', rules: [] },
    ],
  };
}

/** The same workflow with a fourth state, so a draft can drop TWO of them. */
function publishedKanbanWithTriage(id: string): PublishedWorkflowDef {
  return {
    id,
    version: 2,
    name: 'Kanban',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'triage', name: 'Triage', category: 'active' },
      { id: 'review', name: 'Review', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'triage', rules: [] },
      { from: 'triage', to: 'review', rules: [] },
      { from: 'review', to: 'done', rules: [] },
      { from: 'done', to: 'todo', rules: [] },
    ],
  };
}

function setup(
  store: DraftStore,
  seed: FakeGatewaySeed = {},
  options: { withPanel?: boolean; canAuthor?: boolean; onPublished?: (payload: PublishedWorkflowDef) => void } = {},
) {
  const gateway = createFakeGateway(seed);
  const environment: BuilderEnvironment = {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway,
    members: [],
    ticketTypes: [],
    canAuthor: options.canAuthor ?? true,
  };
  render(
    <BuilderProvider store={store} env={environment}>
      {options.withPanel === true ? <IssuesPanel /> : null}
      <PublishControls onPublished={options.onPublished} />
    </BuilderProvider>,
  );
  return gateway;
}

/** A draft edited down from published version 2: the Review state removed. */
function draftDroppingReview(workflowId: string): DraftStore {
  const store = createDraftStore(draftFromPublished(publishedKanban(workflowId)));
  store.actions.addTransition('todo', 'done'); // keep the graph sound without Review
  store.actions.removeState('review');
  return store;
}

/** A draft edited down from published version 2: BOTH Triage and Review removed. */
function draftDroppingTriageAndReview(workflowId: string): DraftStore {
  const store = createDraftStore(draftFromPublished(publishedKanbanWithTriage(workflowId)));
  store.actions.addTransition('todo', 'done'); // keep the graph sound without either
  store.actions.removeState('review');
  store.actions.removeState('triage');
  return store;
}

describe('PublishControls gating', () => {
  it('disables publish while the draft is invalid, naming why', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.setStateCategory('done', 'active');
    setup(store);
    const button = screen.getByRole('button', { name: 'Publish' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Fix the issues below first.');
  });

  it('renders nothing at all for a session that cannot author', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    setup(store, {}, { canAuthor: false });
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  // The planted defect that makes the advisory tier a guarantee rather than a
  // convention (design decision 9). If anyone ever folds adviseWorkflowDef into
  // selectCanPublish, this is the test that goes red.
  it('an advisory does not gate publish — the button stays enabled and the publish commits', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addTransition('todo', 'done'); // a fast track that skips Doing
    store.actions.addRule(4, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });

    const def = store.getState().def;
    expect(validateWorkflowDef(def)).toEqual([]);
    const advisories = adviseWorkflowDef(def);
    // Both codes, in adviseWorkflowDef's own documented order. The plan's
    // `toEqual(['rdu-bypassable'])` is one code behind the shipped function:
    // `rule-bypassable` landed in packages/domain/src/advise-workflow.ts after
    // this plan's text was written (measured, and already pinned as a pair by
    // Task 8's validation.test.tsx).
    expect(advisories.map((advisory) => advisory.code)).toEqual(['rdu-bypassable', 'rule-bypassable']);

    const gateway = setup(store, {}, { withPanel: true });
    expect(screen.getByText('Worth a look — none of these block publishing')).toBeInTheDocument();
    for (const advisory of advisories) {
      expect(screen.getAllByText(advisory.message).length).toBeGreaterThan(0);
    }

    const button = screen.getByRole('button', { name: 'Publish' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('title');

    await user.click(button);
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(1);
    // and the advisories are still on screen after a successful publish — they
    // were never a thing to be cleared, only a thing to be told
    expect(screen.getByText('Worth a look — none of these block publishing')).toBeInTheDocument();
    for (const advisory of advisories) {
      expect(screen.getAllByText(advisory.message).length).toBeGreaterThan(0);
    }
  });
});

describe('PublishControls — clean publish', () => {
  it('submits workflow.defined version 1 for a fresh draft and reports success', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    const gateway = setup(store);
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(1);
    const event = gateway.submitted[0]!;
    expect(event.type).toBe('workflow.defined');
    expect(event.entity).toEqual({ kind: 'workflow', id: store.getState().def.id });
    const payload = event.payload as PublishedWorkflowDef;
    expect(payload.version).toBe(1);
    expect('stateMapping' in payload).toBe(false);
  });

  /**
   * `onPublished` is in the component's Produces clause and Task 13 wires the
   * page to it; until it is asserted both ways it is a callback nobody has
   * checked fires, or checked STAYS SILENT when the server said no. The pair is
   * the point: a callback invoked unconditionally after submit would satisfy
   * the first assertion alone.
   */
  it('hands the published payload to onPublished — and never calls it on a refusal', async () => {
    const user = userEvent.setup();
    const published: PublishedWorkflowDef[] = [];

    const committing = createDraftStore(draftFromTemplate(kanban));
    setup(committing, {}, { onPublished: (payload) => published.push(payload) });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(published).toHaveLength(1);
    expect(published[0]!.version).toBe(1);
    expect(published[0]!.id).toBe(committing.getState().def.id);

    cleanup();
    const refused = createDraftStore(draftFromTemplate(kanban));
    setup(
      refused,
      { submitResults: [{ status: 'refused', eventId: 'evt', rule: 'permission.role', reason: 'Only an owner or admin may publish a workflow.' }] },
      { onPublished: (payload) => published.push(payload) },
    );
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(published).toHaveLength(1);
  });

  it('bumps from the PUBLISHED base version, not from the draft def', async () => {
    const user = userEvent.setup();
    const workflowId = newUlid();
    // Nothing dropped, so no dialog: version 2 published, version 3 submitted.
    const store = createDraftStore(draftFromPublished(publishedKanban(workflowId)));
    store.actions.renameState('review', 'In review');
    const gateway = setup(store);
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Version 3 published.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as PublishedWorkflowDef;
    expect(payload.version).toBe(3);
    expect('stateMapping' in payload).toBe(false);
  });
});

describe('PublishControls — the state-mapping dialog', () => {
  it('lists every stranded state with its in-flight count and requires a target for each', async () => {
    const user = userEvent.setup();
    const workflowId = newUlid();
    const store = draftDroppingReview(workflowId);
    const gateway = setup(store, { occupancy: { [workflowId]: { review: 4 } } });

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Every dropped state needs a destination')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Version 3 removes states that version 2 has. Publishing cannot see which tickets sit in which state, so every removed state needs a destination — occupied or not.',
      ),
    ).toBeInTheDocument();

    const row = await screen.findByTestId('mapping-row-review');
    expect(within(row).getByText('Review')).toBeInTheDocument();
    expect(await within(row).findByText('4 tickets sit here today')).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Publish with this mapping' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Send them to — Review' }), 'todo');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(await screen.findByText('Version 3 published.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as PublishedWorkflowDef;
    expect(payload.version).toBe(3);
    expect(payload.stateMapping).toEqual({ review: 'todo' });
  });

  /**
   * The stranding rule itself, and the reason the count can never become an
   * engine input: occupancy zero does NOT excuse the mapping. A client replica
   * is visibility-scoped, so a user who cannot see the tickets in a dropped
   * state computes 0 where the server computes 3 — making publish legality
   * depend on occupancy would make the two engines disagree by construction.
   * So this test is the one that goes red if anyone "helpfully" pre-fills or
   * skips an empty state.
   */
  it('demands a destination for a state nothing sits in — the mapping is the contract', async () => {
    const user = userEvent.setup();
    const workflowId = newUlid();
    const store = draftDroppingReview(workflowId);
    const gateway = setup(store, { occupancy: { [workflowId]: {} } });

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const row = await screen.findByTestId('mapping-row-review');
    expect(await within(row).findByText('0 tickets sit here today')).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Publish with this mapping' });
    expect(confirm).toBeDisabled();
    expect(gateway.submitted).toHaveLength(0);

    await user.selectOptions(within(row).getByRole('combobox', { name: 'Send them to — Review' }), 'done');
    await user.click(confirm);
    expect(await screen.findByText('Version 3 published.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as PublishedWorkflowDef;
    expect(payload.stateMapping).toEqual({ review: 'done' });
  });

  /**
   * TWO dropped states in one dialog, and the reason this test exists rather
   * than a second single-row variant: with one row, `dropped.every(...)` is
   * indistinguishable from `mapping[dropped[0].id] !== undefined`, so every
   * other test in this file would pass a dialog that only ever guards one row.
   *
   * The discriminating move is picking exactly ONE destination and asserting
   * the confirm button is STILL disabled — done twice, once for each row,
   * because a single pick only rules out a guard keyed on the OTHER row.
   * Measured: with `complete = mapping[dropped[0].id] !== undefined` planted,
   * picking the second row first leaves this test green; both halves are what
   * make it red. `dropped` follows the BASE's state order, so Triage is
   * dropped[0] and Review is dropped[1] — asserted below rather than assumed,
   * because the whole point of the pair is which row is which.
   *
   * The occupancy is mixed on purpose: Review has four tickets, Triage none.
   * Both rows demand a destination all the same.
   */
  it('demands a destination for EVERY dropped state — either one alone is not enough', async () => {
    const user = userEvent.setup();
    const workflowId = newUlid();
    const seed: FakeGatewaySeed = { occupancy: { [workflowId]: { review: 4 } } };

    async function openDialog(): Promise<HTMLElement> {
      await user.click(screen.getByRole('button', { name: 'Publish' }));
      return await screen.findByRole('dialog', { name: 'Every dropped state needs a destination' });
    }
    function confirmButton(): HTMLElement {
      return screen.getByRole('button', { name: 'Publish with this mapping' });
    }

    // The row order the guard's index-shaped defects key off, pinned.
    setup(draftDroppingTriageAndReview(workflowId), seed);
    const dialog = await openDialog();
    expect(
      [...dialog.querySelectorAll('.state-mapping-dialog__row')].map((row) => row.getAttribute('data-testid')),
    ).toEqual(['mapping-row-triage', 'mapping-row-review']);
    expect(await within(screen.getByTestId('mapping-row-review')).findByText('4 tickets sit here today')).toBeInTheDocument();
    expect(within(screen.getByTestId('mapping-row-triage')).getByText('0 tickets sit here today')).toBeInTheDocument();

    // Only the FIRST row picked — kills a guard that reads dropped[0] alone.
    expect(confirmButton()).toBeDisabled();
    await user.selectOptions(
      within(screen.getByTestId('mapping-row-triage')).getByRole('combobox', { name: 'Send them to — Triage' }),
      'done',
    );
    expect(confirmButton()).toBeDisabled();

    // Only the SECOND row picked — kills a guard that reads the last row alone.
    cleanup();
    setup(draftDroppingTriageAndReview(workflowId), seed);
    await openDialog();
    await user.selectOptions(
      within(screen.getByTestId('mapping-row-review')).getByRole('combobox', { name: 'Send them to — Review' }),
      'todo',
    );
    expect(confirmButton()).toBeDisabled();

    // Both picked: enabled, and the payload carries BOTH entries — a mapping
    // that collapsed to one would still satisfy every assertion above.
    await user.selectOptions(
      within(screen.getByTestId('mapping-row-triage')).getByRole('combobox', { name: 'Send them to — Triage' }),
      'done',
    );
    expect(confirmButton()).toBeEnabled();
    cleanup();

    const gateway = setup(draftDroppingTriageAndReview(workflowId), seed);
    await openDialog();
    await user.selectOptions(
      within(screen.getByTestId('mapping-row-triage')).getByRole('combobox', { name: 'Send them to — Triage' }),
      'done',
    );
    await user.selectOptions(
      within(screen.getByTestId('mapping-row-review')).getByRole('combobox', { name: 'Send them to — Review' }),
      'todo',
    );
    await user.click(confirmButton());
    expect(await screen.findByText('Version 3 published.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as PublishedWorkflowDef;
    expect(payload.version).toBe(3);
    expect(payload.stateMapping).toEqual({ triage: 'done', review: 'todo' });
  });

  it('never offers a dropped state as its own destination', async () => {
    const user = userEvent.setup();
    const workflowId = newUlid();
    setup(draftDroppingReview(workflowId), {});
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const row = await screen.findByTestId('mapping-row-review');
    const options = [...row.querySelectorAll('option')]
      .map((option) => option.value)
      .filter((value) => value !== '');
    expect(options).toEqual(['todo', 'done']);
  });

  it('says so when the count read fails, and still demands the mapping', async () => {
    const user = userEvent.setup();
    const store = draftDroppingReview(newUlid());
    setup(store, { occupancyError: true });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const row = await screen.findByTestId('mapping-row-review');
    expect(await within(row).findByText('ticket count unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish with this mapping' })).toBeDisabled();
  });

  it('cancel closes the dialog without submitting anything', async () => {
    const user = userEvent.setup();
    const store = draftDroppingReview(newUlid());
    const gateway = setup(store);
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Every dropped state needs a destination')).not.toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(0);
  });
});

/**
 * The count line's four shapes, driven directly rather than through the
 * controls: the loading window inside PublishControls closes on the same
 * microtask the click awaits, so `counting tickets…` has no observable moment
 * there — and the pinned copy has a singular form no PublishControls test
 * above exercises.
 */
describe('StateMappingDialog — the count line degrades honestly', () => {
  function renderDialog(occupancy: Record<string, number> | null, occupancyFailed: boolean) {
    render(
      <StateMappingDialog
        dropped={[{ id: 'review', name: 'Review' }]}
        occupancy={occupancy}
        occupancyFailed={occupancyFailed}
        targetStates={[{ id: 'todo', name: 'To do' }]}
        fromVersion={2}
        toVersion={3}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    return screen.getByTestId('mapping-row-review');
  }

  it('says counting while the read is in flight', () => {
    expect(within(renderDialog(null, false)).getByText('counting tickets…')).toBeInTheDocument();
  });

  it('says unavailable when the read failed — never a substituted zero', () => {
    expect(within(renderDialog(null, true)).getByText('ticket count unavailable')).toBeInTheDocument();
  });

  it('uses the singular for one ticket', () => {
    expect(within(renderDialog({ review: 1 }, false)).getByText('1 ticket sits here today')).toBeInTheDocument();
  });

  it('uses the plural for many', () => {
    expect(within(renderDialog({ review: 9 }, false)).getByText('9 tickets sit here today')).toBeInTheDocument();
  });
});

describe('PublishControls — server results rendered honestly', () => {
  it('renders a stranded-state refusal verbatim (planted defect: mapping-less publish)', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    const reason =
      'Version 3 drops state(s) "review" that version 2 has; publishing cannot see which tickets sit in which state, so every dropped state needs a stateMapping entry.';
    setup(store, {
      submitResults: [{ status: 'refused', eventId: 'evt', rule: 'workflow-state-mapping', reason }],
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: workflow-state-mapping')).toBeInTheDocument();
  });

  it('renders a stale-version refusal verbatim (someone published while we edited)', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    const reason = 'Workflow "Kanban" is at version 3; the next published version must be 4, not 3.';
    setup(store, {
      submitResults: [{ status: 'refused', eventId: 'evt', rule: 'workflow-version', reason }],
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: workflow-version')).toBeInTheDocument();
  });

  it('renders an invalid-envelope result verbatim', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    setup(store, {
      submitResults: [
        {
          status: 'invalid',
          eventId: null,
          code: 'unknown-event-type',
          message: 'The event type workflow.defined is not registered.',
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server could not read this claim.')).toBeInTheDocument();
    expect(screen.getByText('The event type workflow.defined is not registered.')).toBeInTheDocument();
  });

  /**
   * The refusal is rendered, not paraphrased — and this is what makes that
   * falsifiable rather than a reading of the source. A banner that summarised
   * the reason in its own words ("this publish strands tickets") would pass
   * every `findByText('The server refused this publish.')` above; only an
   * assertion driven off the seeded string itself can tell the two apart.
   */
  it('renders a rule and reason it has never seen before, character for character', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    const reason = 'Nobody has written this sentence before; the banner must not improve it — 7 “quoted” bits & all.';
    setup(store, {
      submitResults: [{ status: 'refused', eventId: 'evt', rule: 'some-rule-this-client-never-heard-of', reason }],
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: some-rule-this-client-never-heard-of')).toBeInTheDocument();
  });
});

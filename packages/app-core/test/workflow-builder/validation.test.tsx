import { render, screen } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export that survives `verbatimModuleSyntax` (settled at Task 5,
// packages/app-core/test/workflow-builder/canvas.test.tsx). The plan's Task 8
// snippet still carries the default spelling.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adviseWorkflowDef, newUlid, validateWorkflowDef, type WorkflowDef } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { layoutDraft } from '../../src/workflow-builder/layout.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { IssuesPanel } from '../../src/workflow-builder/ui/issues-panel.js';
import { SystemRulesPanel } from '../../src/workflow-builder/ui/system-rules-panel.js';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

function kanbanStore(): DraftStore {
  return createDraftStore(draftFromTemplate(kanban));
}

function renderIssues(store: DraftStore) {
  const environment: BuilderEnvironment = {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
  };
  return render(
    <BuilderProvider store={store} env={environment}>
      <IssuesPanel />
    </BuilderProvider>,
  );
}

/**
 * Assert the panel shows EXACTLY the validator's issues, then hand back the codes.
 *
 * The count assertion is not decoration. Without it this helper is an
 * at-least check: a panel that rendered every issue twice, or that appended a
 * message of its own invention, would sail through `getAllByText`. Counting
 * the rendered rows against `issues.length` is what makes the docblock's
 * "exactly" true rather than aspirational.
 */
function expectPanelMatchesValidator(store: DraftStore): string[] {
  const issues = validateWorkflowDef(store.getState().def);
  expect(issues.length).toBeGreaterThan(0);
  for (const issue of issues) {
    expect(screen.getAllByText(issue.message).length).toBeGreaterThan(0);
  }
  expect(document.querySelectorAll('.issues-panel__item')).toHaveLength(issues.length);
  return issues.map((issue) => issue.code);
}

/** The advisory half of the same exactness check, driven off adviseWorkflowDef's own output. */
function expectAdvisoriesMatchAdviser(store: DraftStore): string[] {
  const advisories = adviseWorkflowDef(store.getState().def);
  expect(advisories.length).toBeGreaterThan(0);
  for (const advisory of advisories) {
    expect(screen.getAllByText(advisory.message).length).toBeGreaterThan(0);
  }
  expect(document.querySelectorAll('.advisories-panel__item')).toHaveLength(advisories.length);
  return advisories.map((advisory) => advisory.code);
}

function loadDef(store: DraftStore, def: WorkflowDef): void {
  store.actions.loadDraft({ def, positions: layoutDraft(def), base: null, selection: { kind: 'none' } });
}

describe('IssuesPanel planted defects — every validateWorkflowDef code', () => {
  it('shows the all-clear on a clean def', () => {
    renderIssues(kanbanStore());
    expect(screen.getByText('No issues. This workflow can be published.')).toBeInTheDocument();
  });

  /**
   * 10.19 — planted defect: no-states.
   */
  it('plants no-states by deleting every state', () => {
    const store = kanbanStore();
    for (const stateId of ['todo', 'doing', 'done']) store.actions.removeState(stateId);
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('no-states');
  });

  /**
   * 10.20 — planted defect: duplicate-state-id (via a loaded def — the store mints unique ids).
   */
  it('plants duplicate-state-id via a loaded def', () => {
    // the store mints ULID state ids, so a duplicate can only arrive inside a
    // loaded def (a clone or an externally saved draft) — still the canvas's model
    const store = kanbanStore();
    const def = store.getState().def;
    loadDef(store, { ...def, states: [...def.states, { id: 'done', name: 'Done twice', category: 'terminal' }] });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('duplicate-state-id');
  });

  /**
   * 10.21 — planted defect: no-terminal-state.
   */
  it('plants no-terminal-state by recategorising the only terminal state', () => {
    const store = kanbanStore();
    store.actions.setStateCategory('done', 'active');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('no-terminal-state');
  });

  /**
   * 10.22 — planted defect: unknown-transition-state (via a loaded def — removeState cascades edges).
   */
  it('plants unknown-transition-state via a loaded def', () => {
    // removeState cascades a state's edges, so a dangling edge too can only
    // arrive inside a loaded def
    const store = kanbanStore();
    const def = store.getState().def;
    loadDef(store, { ...def, transitions: [...def.transitions, { from: 'doing', to: 'ghost', rules: [] }] });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('unknown-transition-state');
  });

  /**
   * 10.23 — planted defect: duplicate-transition.
   */
  it('plants duplicate-transition by drawing the same edge twice', () => {
    const store = kanbanStore();
    store.actions.addTransition('todo', 'doing');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('duplicate-transition');
  });

  /**
   * 10.24 — planted defect: unreachable-state.
   */
  it('plants unreachable-state by adding an unconnected state', () => {
    const store = kanbanStore();
    store.actions.addState({ name: 'Island' });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('unreachable-state');
  });

  /**
   * 10.25 — planted defect: terminal-no-inbound.
   */
  it('plants terminal-no-inbound by making the start state terminal', () => {
    const store = kanbanStore();
    // a two-state def whose start has no inbound edge, authored entirely by gestures
    for (const stateId of ['todo', 'doing', 'done']) store.actions.removeState(stateId);
    const start = store.actions.addState({ name: 'Intake' });
    const finish = store.actions.addState({ name: 'Filed', category: 'terminal' });
    store.actions.addTransition(start, finish);
    expect(validateWorkflowDef(store.getState().def)).toEqual([]);
    store.actions.setStateCategory(start, 'terminal');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('terminal-no-inbound');
  });

  /**
   * 10.26 — planted defect: unknown-initial-state.
   */
  it('plants unknown-initial-state by deleting the start state', () => {
    const store = kanbanStore();
    store.actions.removeState('todo');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('unknown-initial-state');
  });

  /**
   * 10.27 — planted defect: empty-restrict-to.
   */
  it('plants empty-restrict-to by unpicking everyone', () => {
    const store = kanbanStore();
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.updateRule(0, 0, { kind: 'restrict-to' });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('empty-restrict-to');
  });

  /**
   * 10.28 — planted defect: rdu-unknown-state.
   */
  it('plants rdu-unknown-state by deleting the watched state', () => {
    const store = kanbanStore();
    // rule sits on todo -> doing and watches 'done'; deleting 'done' leaves the
    // rule's reference dangling (decision 1: rules are never silently rewritten)
    store.actions.addRule(0, { kind: 'require-different-user', thanActorOf: { to: 'done' } });
    store.actions.removeState('done');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('rdu-unknown-state');
  });

  /**
   * 10.54 — planted defect: rdu-unenterable-state — a four-eyes rule watching a state no transition enters.
   */
  it('plants rdu-unenterable-state by watching a state nothing enters', () => {
    const store = kanbanStore();
    // drop the only way back into the start state, then ask for a second person
    // on a move into it: the state exists, but no move in this version reaches
    // it, so the rule can never require anybody
    store.actions.removeTransition(1); // doing -> todo
    store.actions.addRule(1, { kind: 'require-different-user', thanActorOf: { to: 'todo' } });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('rdu-unenterable-state');
  });
});

describe('IssuesPanel advisories — a second tier that blocks nothing', () => {
  /**
   * The kanban draft plus a fast track that skips Doing, guarded by a rule
   * watching Doing. The plan's A1 route exactly — but MEASURED, this draft
   * trips adviseWorkflowDef TWICE, not once: `rdu-bypassable` (the watched
   * state is avoidable) and `rule-bypassable` (the guarded edge is avoidable —
   * "Done" is also entered from "Doing" carrying no rule of that kind). The
   * plan's advisory table names only the first code; `rule-bypassable` landed
   * in packages/domain/src/advise-workflow.ts after this plan's text was
   * written, and the plan mentions it nowhere.
   */
  function bypassableStore(): DraftStore {
    const store = kanbanStore();
    store.actions.addTransition('todo', 'done');
    store.actions.addRule(4, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    return store;
  }

  /**
   * The second advisory code on its own, with no rdu rule anywhere: the kanban
   * draft plus an unguarded fast track into "Done", with require-comment placed
   * on the ORIGINAL "Doing" -> "Done" edge (index 2). The guard is real on the
   * path its author drew and absent on the other, which is exactly what
   * `rule-bypassable` describes.
   *
   * This fixture, not A1, is what makes the advisory ANCHOR falsifiable: the
   * guarded edge is index 2 while the bypassing fast track is index 4, so a
   * click-to-select assertion here can tell the two apart. In A1 both
   * advisories anchor to the same index 4, so an anchor assertion there passes
   * whichever queue served it.
   *
   * Authored through the store rather than borrowed from
   * ERRAND_WITH_WAITS_TEMPLATE (which also trips rule-bypassable twice, and is
   * recorded as an open ruling request in the coordination doc): a panel test
   * should be about the panel, not about a frozen artefact someone may later
   * change out from under it. templates.test.ts already pins the errand case.
   */
  function lowerGuardStore(): DraftStore {
    const store = kanbanStore();
    store.actions.addTransition('todo', 'done');
    store.actions.addRule(2, { kind: 'require-comment' }); // doing -> done
    return store;
  }

  it('warns about a bypassable four-eyes rule without calling it an issue', () => {
    const store = bypassableStore();
    const def = store.getState().def;
    // the def is clean by the validator's lights — that is the whole point
    expect(validateWorkflowDef(def)).toEqual([]);

    renderIssues(store);
    expect(screen.getByText('Worth a look (none of these block publishing)')).toBeInTheDocument();
    expect(
      screen.getByText('Advisories describe a workflow that is legal but may not do what you meant.'),
    ).toBeInTheDocument();
    // Both codes, in adviseWorkflowDef's own documented order (every
    // rdu-bypassable first, then every rule-bypassable). Pinned as a pair
    // because the plan's `toEqual(['rdu-bypassable'])` is one code behind the
    // shipped function.
    expect(expectAdvisoriesMatchAdviser(store)).toEqual(['rdu-bypassable', 'rule-bypassable']);
    // and the issues half still says the workflow can go out: neither advisory
    // ever entered validateWorkflowDef's array
    expect(screen.getByText('No issues. This workflow can be published.')).toBeInTheDocument();
  });

  /**
   * 10.58 — rule-bypassable advisory: a guard sidestepped by a lower/no-guard edge into the same target, anchored to the GUARDED edge.
   */
  it('warns about a guard another edge into the same state sidesteps, without calling it an issue', () => {
    const store = lowerGuardStore();
    expect(validateWorkflowDef(store.getState().def)).toEqual([]);

    renderIssues(store);
    expect(screen.getByText('Worth a look (none of these block publishing)')).toBeInTheDocument();
    expect(expectAdvisoriesMatchAdviser(store)).toEqual(['rule-bypassable']);
    expect(screen.getByText('No issues. This workflow can be published.')).toBeInTheDocument();
  });

  it('anchors an advisory to its transition, click-to-select, like any issue', async () => {
    const user = userEvent.setup();
    const store = bypassableStore();
    store.actions.select({ kind: 'none' });
    renderIssues(store);
    const [advisory] = adviseWorkflowDef(store.getState().def);
    await user.click(screen.getByRole('button', { name: advisory!.message }));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 4 });
  });

  it('anchors a rule-bypassable advisory to the GUARDED edge, not the one that sidesteps it', async () => {
    const user = userEvent.setup();
    const store = lowerGuardStore();
    store.actions.select({ kind: 'none' });
    renderIssues(store);
    const [advisory] = adviseWorkflowDef(store.getState().def);
    await user.click(screen.getByRole('button', { name: advisory!.message }));
    // index 2 is doing -> done, the edge carrying the require-comment rule;
    // index 4 is the unguarded fast track the advisory is ABOUT but not ON.
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 2 });
  });

  it('renders no advisory section at all when there is nothing to say', () => {
    const store = kanbanStore();
    expect(adviseWorkflowDef(store.getState().def)).toEqual([]);
    renderIssues(store);
    expect(
      screen.queryByText('Worth a look (none of these block publishing)'),
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll('.advisories-panel__item')).toHaveLength(0);
  });
});

describe('IssuesPanel anchoring', () => {
  it('clicking a state-anchored issue selects the state', async () => {
    const user = userEvent.setup();
    const store = kanbanStore();
    const islandId = store.actions.addState({ name: 'Island' });
    store.actions.select({ kind: 'none' });
    renderIssues(store);
    const [message] = validateWorkflowDef(store.getState().def).map((issue) => issue.message);
    await user.click(screen.getByRole('button', { name: message }));
    expect(store.getState().selection).toEqual({ kind: 'state', stateId: islandId });
  });

  it('clicking a transition-anchored issue selects the transition', async () => {
    const user = userEvent.setup();
    const store = kanbanStore();
    store.actions.addRule(1, { kind: 'restrict-to' });
    renderIssues(store);
    const [message] = validateWorkflowDef(store.getState().def).map((issue) => issue.message);
    await user.click(screen.getByRole('button', { name: message }));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 1 });
  });
});

describe('SystemRulesPanel', () => {
  /**
   * 10.49 — the system-rules panel names provenance and the parent-terminal refusal. It used to cite "spec §4" to the reader; UX fixes T11 (23.191) took the citation out.
   */
  it('names the two invariants no workflow can author away, in plain words with no spec citation', () => {
    render(<SystemRulesPanel />);
    expect(screen.getByText('System rules in every workflow')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Provenance on everything: every move records who made it and when. "Done" always unfolds to "marked done by X on a date".',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Parents cannot outrun children: no ticket can enter a terminal state while any of its children is still open.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('These two sit above all workflows and cannot be authored away.')).toBeInTheDocument();
    // CONTROL: the panel prints no section sign and no "product design" citation anywhere.
    expect(document.body.textContent).not.toMatch(/§|product design/);
  });
});

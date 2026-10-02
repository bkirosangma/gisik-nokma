import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '../src/workflow.js';
import { validateWorkflowDef } from '../src/validate-workflow.js';

function def(partial: Partial<WorkflowDef>): WorkflowDef {
  return {
    id: 'wf_test',
    version: 1,
    name: 'Test',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'doing', rules: [] },
      { from: 'doing', to: 'done', rules: [] },
    ],
    ...partial,
  };
}

function codes(d: WorkflowDef): string[] {
  return validateWorkflowDef(d).map((issue) => issue.code);
}

describe('validateWorkflowDef — identity checks', () => {
  it('a clean definition has no issues', () => {
    expect(validateWorkflowDef(def({}))).toEqual([]);
  });

  /**
   * 4.1 — a definition with no states reports exactly `no-states`, and nothing else.
   */
  it('an empty definition reports no-states and nothing else', () => {
    expect(validateWorkflowDef(def({ states: [], transitions: [] }))).toEqual([
      { code: 'no-states', message: 'This workflow has no states at all.' },
    ]);
  });

  it('duplicate state ids are reported once per duplicated id', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
        { id: 'done', name: 'Done again', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    });
    expect(validateWorkflowDef(d)).toEqual([
      { code: 'duplicate-state-id', message: 'Two states share the id "done"; state ids must be unique.' },
    ]);
  });

  it('a workflow with no terminal state could never finish', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
      ],
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'todo', rules: [] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      { code: 'no-terminal-state', message: 'This workflow has no terminal state, so no ticket could ever finish.' },
    ]);
  });

  it('a transition to a state that does not exist is reported with the raw ids', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [] },
        { from: 'doing', to: 'blessed', rules: [] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'unknown-transition-state',
        message: 'The transition from "doing" to "blessed" refers to "blessed", which is not a state in this workflow.',
      },
    ]);
  });

  it('two transitions over the same edge are ambiguous about which rules run', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'duplicate-transition',
        message: 'There are two transitions from "Doing" to "Done"; keep at most one transition per direction between a pair of states.',
      },
    ]);
  });

  it('an exact edge and a from-any edge to the same target are NOT duplicates', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [] },
        { from: '*', to: 'done', rules: [] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });
});

describe('validateWorkflowDef — reachability', () => {
  /**
   * 4.6 — an UNREACHABLE state is refused at publish: a state no transition can reach is dead weight on the board. The row’s other half — that from-any targets count as reachable — is the test below.
   */
  it('a state no transition can reach is dead weight on the board', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'limbo', name: 'Limbo', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    });
    expect(validateWorkflowDef(d)).toEqual([
      { code: 'unreachable-state', message: 'State "Limbo" cannot be reached from the starting state "To do".' },
    ]);
  });

  it('a from-any transition makes its target reachable', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'blocked', name: 'Blocked', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'done', rules: [] },
        { from: '*', to: 'blocked', rules: [] },
        { from: 'blocked', to: 'todo', rules: [] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });

  /**
   * 4.7 — a TERMINAL state with no way in is refused. The row’s other half — that a self-loop is not a way in — is the test below.
   */
  it('a terminal state nothing leads into can never be entered', () => {
    const d = def({
      initialStateId: 'done',
      states: [
        { id: 'done', name: 'Done', category: 'terminal' },
        { id: 'todo', name: 'To do', category: 'open' },
      ],
      transitions: [{ from: 'done', to: 'todo', rules: [] }],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'terminal-no-inbound',
        message: 'Terminal state "Done" has no transition leading into it, so no ticket could ever reach it.',
      },
    ]);
  });

  it('a self-loop is not a way into a terminal state', () => {
    const d = def({
      initialStateId: 'done',
      states: [{ id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [{ from: 'done', to: 'done', rules: [] }],
    });
    expect(codes(d)).toEqual(['terminal-no-inbound']);
  });
});

describe('validateWorkflowDef — rule-level checks', () => {
  it('a restrict-to that names nobody can never be satisfied', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'restrict-to' }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'empty-restrict-to',
        message:
          'A restrict-to rule on the transition from "Doing" to "Done" names nobody: it must allow the assignee, at least one role, or at least one named person.',
      },
    ]);
  });

  it('a four-eyes rule watching a nonexistent transition can never fire', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'reviewed' } }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'rdu-unknown-state',
        message:
          'A require-different-user rule on the transition from "Doing" to "Done" refers to a move to "reviewed", but no state with that id exists.',
      },
    ]);
  });

  /**
   * 4.31 — a require-different-user rule watching a state that EXISTS but that nothing in this version enters is refused at publish: it could never require a second person.
   */
  it('a four-eyes rule watching a state nothing enters can never require a second person', () => {
    // The narrow case that survives the reachability checks: the rule watches
    // the INITIAL state, which every ticket starts in and nothing loops back
    // to. Nobody ever performs a move into it, so the rule is dead on arrival.
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'todo' } }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([
      {
        code: 'rdu-unenterable-state',
        message:
          'A require-different-user rule on the transition from "Doing" to "Done" refers to a move to "To do", but nothing in this version enters that state, so the rule can never require a second person.',
      },
    ]);
  });

  it('a four-eyes rule is silent when some transition does enter the watched state', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'doing' } }] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });

  it('a from-any transition counts as entering its target', () => {
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: '*', to: 'todo', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'todo' } }] },
      ],
    });
    expect(codes(d)).toEqual([]);
  });

  /**
   * 4.32 — an unknown watched state reports ONLY `rdu-unknown-state`: the two four-eyes codes never both fire for one rule.
   */
  it('an unknown watched state reports only rdu-unknown-state, never both codes', () => {
    // One authoring mistake, one message: enterability is checked only for
    // states that exist, so the two rdu codes can never fire for one rule.
    const d = def({
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'reviewed' } }] },
      ],
    });
    expect(codes(d)).toEqual(['rdu-unknown-state']);
  });
});

/**
 * The order and the two branch conditions the cases above leave unpinned. The
 * engine joins these messages into one refusal reason, so their order is copy,
 * not an implementation detail.
 */
describe('validateWorkflowDef — issue order and the branches nothing else pins', () => {
  it('issues come back in the documented order across every tier', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'todo', name: 'To do (again)', category: 'open' },
        { id: 'limbo', name: 'Limbo', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'done', rules: [] },
        { from: 'todo', to: 'done', rules: [] },
        { from: 'todo', to: 'ghost', rules: [] },
        { from: 'done', to: 'done', rules: [{ kind: 'restrict-to' }] },
      ],
    });
    expect(codes(d)).toEqual([
      'duplicate-state-id',
      'unknown-transition-state',
      'duplicate-transition',
      'unreachable-state',
      'empty-restrict-to',
    ]);
  });

  /**
   * 4.43 — an `initialStateId` naming no declared state is refused as `unknown-initial-state` and is the ONLY issue, because there is no start to walk from and the reachability walk never runs.
   */
  it('an initial state that names nothing is the only issue — there is no start to walk from', () => {
    // Not merely "reports unknown-initial-state": a walk that ran anyway from a
    // start that does not exist would call every real state unreachable and
    // bury the one issue that matters under three that do not.
    expect(validateWorkflowDef(def({ initialStateId: 'nope' }))).toEqual([
      {
        code: 'unknown-initial-state',
        message: 'This workflow\'s initial state is "nope", but no state with that id exists.',
      },
    ]);
  });

  /**
   * 4.58 — starting-status design: a start state that forbids creation would
   * leave the workflow with no way any ticket ever gets onto it. Control: the
   * same definition with `creatable` absent (every pre-existing workflow's
   * shape) has no such issue.
   */
  it('4.58 a start state with creatable:false is refused — the workflow could never receive a ticket', () => {
    const d = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open', creatable: false },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
    });
    expect(codes(d)).toEqual(['start-state-not-creatable']);
  });

  it('4.58 control: a start state with creatable absent (or true) raises no such issue', () => {
    expect(validateWorkflowDef(def({}))).toEqual([]);
    const explicitlyTrue = def({
      states: [
        { id: 'todo', name: 'To do', category: 'open', creatable: true },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
    });
    expect(validateWorkflowDef(explicitlyTrue)).toEqual([]);
  });

  it('a from-any inbound is not a way into the only state there is', () => {
    // '*' means "from any state", and in a one-state workflow the only state it
    // can mean is this one — which is the self-loop the case above rejects.
    const d = def({
      initialStateId: 'done',
      states: [{ id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [{ from: '*', to: 'done', rules: [] }],
    });
    expect(codes(d)).toEqual(['terminal-no-inbound']);
  });

  it('a from-any inbound does count once there is somewhere else to come from', () => {
    const d = def({
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: '*', to: 'done', rules: [] }],
    });
    expect(codes(d)).toEqual([]);
  });
});

/** 13.564 — the reserved id (backlog/closed spec §1.1): `backlog` cannot be declared, as a state or as a transition endpoint. */
describe('validateWorkflowDef — the reserved backlog id', () => {
  it('as a state', () => {
    const d = def({ states: [...def({}).states, { id: 'backlog', name: 'Mine', category: 'open' }] });
    expect(validateWorkflowDef(d)).toContainEqual({
      code: 'reserved-state-id',
      // 23.371 (HK-3): no spaced em dash; the quoted tokens are unchanged.
      message: '`backlog` is reserved: every workflow has it without declaring it.',
    });
  });

  it('as a transition endpoint, even when no state declares it', () => {
    const d = def({ transitions: [...def({}).transitions, { from: 'backlog', to: 'todo', rules: [] }] });
    expect(codes(d)).toContain('reserved-state-id');
  });

  it('a clean def has no such issue', () => {
    expect(codes(def({}))).not.toContain('reserved-state-id');
  });
});

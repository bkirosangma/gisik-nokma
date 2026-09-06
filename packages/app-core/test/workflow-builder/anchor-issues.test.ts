import { describe, expect, it } from 'vitest';
import { adviseWorkflowDef, validateWorkflowDef, type WorkflowDef } from '@gisik-nokma/domain';
import { anchorIssues } from '../../src/workflow-builder/anchor-issues.js';

function base(): WorkflowDef {
  return {
    id: '01J9Z0000000000000000000WF',
    version: 1,
    name: 'Anchor fixture',
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
  };
}

/** Validate then anchor — the panel's exact pipeline. */
function anchored(def: WorkflowDef) {
  return anchorIssues(def, validateWorkflowDef(def));
}

function anchorOf(def: WorkflowDef, code: string) {
  return anchored(def).find((issue) => issue.code === code)?.anchor;
}

/** Advise then anchor — the panel's other pipeline, through the same function. */
function advisoryAnchorOf(def: WorkflowDef, code: string) {
  return anchorIssues(def, adviseWorkflowDef(def)).find((advisory) => advisory.code === code)?.anchor;
}

describe('anchorIssues', () => {
  it('whole-workflow codes anchor to the canvas', () => {
    expect(anchorOf({ ...base(), states: [], transitions: [] }, 'no-states')).toEqual({ kind: 'workflow' });
    const noTerminal = base();
    noTerminal.states[2] = { id: 'done', name: 'Done', category: 'active' };
    expect(anchorOf(noTerminal, 'no-terminal-state')).toEqual({ kind: 'workflow' });
    expect(anchorOf({ ...base(), initialStateId: 'gone' }, 'unknown-initial-state')).toEqual({
      kind: 'workflow',
    });
  });

  it('duplicate-state-id anchors to the first occurrence of the duplicated id', () => {
    const def = base();
    def.states = [...def.states, { id: 'doing', name: 'Doing again', category: 'active' }];
    expect(anchorOf(def, 'duplicate-state-id')).toEqual({ kind: 'state', stateId: 'doing' });
  });

  it('unknown-transition-state anchors to the offending transition', () => {
    const def = base();
    def.transitions = [...def.transitions, { from: 'doing', to: 'ghost', rules: [] }];
    expect(anchorOf(def, 'unknown-transition-state')).toEqual({ kind: 'transition', index: 2 });
  });

  it('duplicate-transition anchors to the second copy of the edge', () => {
    const def = base();
    def.transitions = [...def.transitions, { from: 'todo', to: 'doing', rules: [] }];
    expect(anchorOf(def, 'duplicate-transition')).toEqual({ kind: 'transition', index: 2 });
  });

  it('unreachable-state and terminal-no-inbound anchor to the state', () => {
    const def = base();
    def.states = [...def.states, { id: 'island', name: 'Island', category: 'open' }];
    expect(anchorOf(def, 'unreachable-state')).toEqual({ kind: 'state', stateId: 'island' });

    const startTerminal: WorkflowDef = {
      ...base(),
      states: [
        { id: 'todo', name: 'To do', category: 'terminal' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
    };
    expect(anchorOf(startTerminal, 'terminal-no-inbound')).toEqual({ kind: 'state', stateId: 'todo' });
  });

  it('rule-level codes anchor to their transition', () => {
    const def = base();
    def.transitions[0] = { from: 'todo', to: 'doing', rules: [{ kind: 'restrict-to' }] };
    expect(anchorOf(def, 'empty-restrict-to')).toEqual({ kind: 'transition', index: 0 });

    const rdu = base();
    rdu.transitions[1] = {
      from: 'doing',
      to: 'done',
      rules: [{ kind: 'require-different-user', thanActorOf: { to: 'ghost' } }],
    };
    expect(anchorOf(rdu, 'rdu-unknown-state')).toEqual({ kind: 'transition', index: 1 });

    // nothing in this def enters 'todo' (it is only the start), so a rule
    // watching the move into it can never fire — the eleventh code
    const unenterable = base();
    unenterable.transitions[1] = {
      from: 'doing',
      to: 'done',
      rules: [{ kind: 'require-different-user', thanActorOf: { to: 'todo' } }],
    };
    expect(anchorOf(unenterable, 'rdu-unenterable-state')).toEqual({ kind: 'transition', index: 1 });
  });

  /**
   * 10.55 — the rdu-bypassable advisory anchors to the transition carrying the rule, and is absent when there is nothing to say.
   */
  it('the rdu-bypassable advisory anchors to the transition carrying the rule', () => {
    const fastTrack = base();
    fastTrack.transitions = [
      ...fastTrack.transitions,
      {
        from: 'todo',
        to: 'done',
        rules: [{ kind: 'require-different-user', thanActorOf: { to: 'doing' } }],
      },
    ];
    // the fast track is clean by validateWorkflowDef's lights — the warning
    // lives in the other tier, and anchors through the same machinery
    expect(validateWorkflowDef(fastTrack)).toEqual([]);
    expect(advisoryAnchorOf(fastTrack, 'rdu-bypassable')).toEqual({ kind: 'transition', index: 2 });
  });

  it('the rule-bypassable advisory anchors to the guarded transition', () => {
    const uncovered = base();
    uncovered.transitions = [
      ...uncovered.transitions,
      { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
    ];
    expect(validateWorkflowDef(uncovered)).toEqual([]);
    const advisories = adviseWorkflowDef(uncovered);
    expect(advisories.some((advisory) => advisory.code === 'rule-bypassable')).toBe(true);
    expect(advisoryAnchorOf(uncovered, 'rule-bypassable')).toEqual({ kind: 'transition', index: 2 });
  });

  it('two distinct duplicated state ids pair in second-sighting order, not first-occurrence order', () => {
    // validateWorkflowDef fills its duplicateIds Set at the SECOND sighting of
    // each id, so with x,y,y,x the issues come out [y, x] — not the [x, y]
    // definition-order a naive first-occurrence walk would produce.
    const def: WorkflowDef = {
      id: 'wf',
      version: 1,
      name: 'dup ids',
      initialStateId: 'x',
      states: [
        { id: 'x', name: 'X', category: 'open' },
        { id: 'y', name: 'Y', category: 'terminal' },
        { id: 'y', name: 'Y2', category: 'terminal' },
        { id: 'x', name: 'X2', category: 'terminal' },
      ],
      transitions: [],
    };
    const issues = validateWorkflowDef(def).filter((issue) => issue.code === 'duplicate-state-id');
    expect(issues.map((issue) => issue.message)).toEqual([
      expect.stringContaining('"y"'),
      expect.stringContaining('"x"'),
    ]);
    expect(anchorIssues(def, issues).map((issue) => issue.anchor)).toEqual([
      { kind: 'state', stateId: 'y' },
      { kind: 'state', stateId: 'x' },
    ]);
  });

  it('a to:"*" transition never anchors as unknown-transition-state', () => {
    const def: WorkflowDef = {
      id: 'wf',
      version: 1,
      name: 'wildcard to',
      initialStateId: 'a',
      states: [
        { id: 'a', name: 'A', category: 'open' },
        { id: 'b', name: 'B', category: 'terminal' },
      ],
      transitions: [
        { from: 'a', to: '*', rules: [] },
        { from: 'ghost', to: 'b', rules: [] },
      ],
    };
    const issues = validateWorkflowDef(def).filter((issue) => issue.code === 'unknown-transition-state');
    expect(issues).toHaveLength(1);
    expect(anchorIssues(def, issues).map((issue) => issue.anchor)).toEqual([{ kind: 'transition', index: 1 }]);
  });

  it('a triplicated edge produces exactly one duplicate-transition issue and one anchor', () => {
    const def: WorkflowDef = {
      id: 'wf',
      version: 1,
      name: 'triple dup',
      initialStateId: 'a',
      states: [
        { id: 'a', name: 'A', category: 'open' },
        { id: 'b', name: 'B', category: 'terminal' },
      ],
      transitions: [
        { from: 'a', to: 'b', rules: [] },
        { from: 'a', to: 'b', rules: [] },
        { from: 'a', to: 'b', rules: [] },
      ],
    };
    const issues = validateWorkflowDef(def).filter((issue) => issue.code === 'duplicate-transition');
    expect(issues).toHaveLength(1);
    expect(anchorIssues(def, issues).map((issue) => issue.anchor)).toEqual([{ kind: 'transition', index: 1 }]);
  });

  it('two distinct duplicate-edge groups, one tripled and one doubled, each anchor at their own second sighting', () => {
    const def: WorkflowDef = {
      id: 'wf',
      version: 1,
      name: 'two dup groups',
      initialStateId: 'a',
      states: [
        { id: 'a', name: 'A', category: 'open' },
        { id: 'b', name: 'B', category: 'open' },
        { id: 'c', name: 'C', category: 'terminal' },
      ],
      transitions: [
        { from: 'a', to: 'b', rules: [] },
        { from: 'a', to: 'b', rules: [] },
        { from: 'a', to: 'b', rules: [] },
        { from: 'b', to: 'c', rules: [] },
        { from: 'b', to: 'c', rules: [] },
      ],
    };
    const issues = validateWorkflowDef(def).filter((issue) => issue.code === 'duplicate-transition');
    expect(issues).toHaveLength(2);
    expect(anchorIssues(def, issues).map((issue) => issue.anchor)).toEqual([
      { kind: 'transition', index: 1 },
      { kind: 'transition', index: 4 },
    ]);
  });

  it('two issues of one code pair with offenders in definition order', () => {
    const def = base();
    def.states = [
      ...def.states,
      { id: 'islandA', name: 'Island A', category: 'open' },
      { id: 'islandB', name: 'Island B', category: 'open' },
    ];
    const anchors = anchored(def)
      .filter((issue) => issue.code === 'unreachable-state')
      .map((issue) => issue.anchor);
    expect(anchors).toEqual([
      { kind: 'state', stateId: 'islandA' },
      { kind: 'state', stateId: 'islandB' },
    ]);
  });

  it('an issue whose offender cannot be recomputed degrades to the canvas, never crashes', () => {
    const anchoredIssues = anchorIssues(base(), [{ code: 'unreachable-state', message: 'drifted copy' }]);
    expect(anchoredIssues).toEqual([
      { code: 'unreachable-state', message: 'drifted copy', anchor: { kind: 'workflow' } },
    ]);
  });

  /**
   * 10.29 — issues anchor per code: every issue from a many-defect def gets
   * some anchor. (This case's other two halves — click-to-select and a dry
   * queue degrading to canvas — are validation.test.tsx's anchoring describe
   * block and the test just above this one.)
   */
  it('every issue from a many-defect def gets some anchor', () => {
    const def = base();
    def.initialStateId = 'gone';
    def.states = [...def.states, { id: 'doing', name: 'Doing twice', category: 'active' }];
    def.transitions = [...def.transitions, { from: 'ghost', to: 'done', rules: [] }];
    const all = anchored(def);
    expect(all.length).toBe(validateWorkflowDef(def).length);
    for (const issue of all) {
      expect(issue.anchor).toBeDefined();
    }
  });

  it('every advisory from adviseWorkflowDef gets some anchor, both known codes included', () => {
    const both = base();
    both.transitions = [
      { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
      { from: 'doing', to: 'done', rules: [] },
      {
        from: 'todo',
        to: 'doing',
        rules: [{ kind: 'require-different-user', thanActorOf: { to: 'done' } }],
      },
    ];
    const advisories = adviseWorkflowDef(both);
    const codes = new Set(advisories.map((advisory) => advisory.code));
    expect(codes.has('rdu-bypassable')).toBe(true);
    expect(codes.has('rule-bypassable')).toBe(true);
    const all = anchorIssues(both, advisories);
    expect(all.length).toBe(advisories.length);
    for (const advisory of all) {
      expect(advisory.anchor).toBeDefined();
    }
  });
});

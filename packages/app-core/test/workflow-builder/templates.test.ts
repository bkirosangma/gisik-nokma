import { describe, expect, it } from 'vitest';
import {
  ERRAND_WITH_WAITS_TEMPLATE,
  SIMPLE_KANBAN_TEMPLATE,
  adviseWorkflowDef,
  simpleKanbanWorkflowDef,
  validateWorkflowDef,
} from '@gisik-nokma/domain';
import {
  WORKFLOW_TEMPLATES,
  cloneTemplate,
  draftFromTemplate,
} from '../../src/workflow-builder/templates.js';

describe('WORKFLOW_TEMPLATES', () => {
  it('the gallery Kanban IS the workspace-bootstrap default — one home, not two copies', () => {
    const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
    // Identity, not equality: a structural check would pass on a second copy
    // that had drifted into agreement, and go on passing until it drifted out.
    expect(kanban.def).toBe(SIMPLE_KANBAN_TEMPLATE);
    // …and what Plan 4 founds every workspace with is that object plus an id
    // and version 1, so the card an admin picks in the gallery and the workflow
    // their workspace already had are the same workflow.
    const { id: _id, version, ...founded } = simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000001');
    expect(version).toBe(1);
    expect(founded).toEqual(kanban.def);
  });

  it('offers exactly simple-kanban, errand-with-waits, approval-chain', () => {
    expect(WORKFLOW_TEMPLATES.map((template) => template.id)).toEqual([
      'simple-kanban',
      'errand-with-waits',
      'approval-chain',
    ]);
  });

  it('every template clones into a def that validates clean', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const def = cloneTemplate(template);
      expect(validateWorkflowDef(def), `template ${template.id}`).toEqual([]);
      expect(def.version).toBe(1);
      expect(def.states.some((state) => state.category === 'terminal')).toBe(true);
    }
  });

  /**
   * 10.57 — simple-kanban and approval-chain produce no advisories.
   */
  it('simple-kanban and approval-chain warn about nothing', () => {
    // errand-with-waits is excluded here, not weakened: see the next test and
    // its comment for why, with a named owner (record, not fix — this
    // package neither owns adviseWorkflowDef nor the frozen template shape).
    for (const template of WORKFLOW_TEMPLATES.filter((candidate) => candidate.id !== 'errand-with-waits')) {
      const def = cloneTemplate(template);
      // a shipped template that greets the author with a warning is a shipped
      // template that is wrong; caught here, at build time, not in the gallery
      expect(adviseWorkflowDef(def), `template ${template.id} advisories`).toEqual([]);
    }
  });

  /**
   * 10.61 — errand-with-waits trips rule-bypassable twice — recorded and ruled (RULING P29), not a gap.
   */
  it('errand-with-waits trips rule-bypassable — recorded, not adjudicated (coordination doc §Plan 8/5)', () => {
    // ERRAND_WITH_WAITS_TEMPLATE is FROZEN — its shape is pinned by Plan 11's
    // checkErrandTemplate oracle, which has LANDED since this comment was
    // written (it read "not yet landed on this branch; verified absent by
    // search this session"): the oracle is defined in
    // `apps/server/src/seed/templates.ts`, its own suite is
    // `apps/server/test/seed/templates.test.ts`, and the seeder calls it as a
    // throwing guard before it writes — `seed-convenience-corner.ts`. It must
    // not be edited from Task 3.
    // require-comment guards in-progress -> waiting, but later -> waiting and
    // next -> waiting both enter the same state with no require-comment rule,
    // one hop each — a pinned seeding path (Task 3's guard-step comment), so
    // it must stay rule-free. packages/domain/src/advise-workflow.ts's
    // rule-bypassable check (an amendment that landed after this plan's
    // Task 3 text was written) correctly reports both bypasses per its own
    // documented semantics.
    //
    // Task 3's own prose states an invariant this contradicts — "a shipped
    // template that greets the author with a warning is a shipped template
    // that is wrong." Both cannot hold at once, and this task owns neither
    // side (not the frozen template shape, not the advisory check), so it is
    // left unadjudicated in docs/superpowers/plans/2026-08-20-00-series-coordination.md,
    // ruling-request entry "Plan 8 Task 3: the frozen errand template trips
    // rule-bypassable" — asserted here against the function's own output,
    // never a hardcoded message, per the binding contract's copy-ownership rule.
    const def = cloneTemplate(WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!);
    const advisories = adviseWorkflowDef(def);
    expect(advisories.map((advisory) => advisory.code)).toEqual(['rule-bypassable', 'rule-bypassable']);
  });

  /**
   * 10.37 — the three templates validate clean and clone with fresh ids, never sharing structure.
   */
  it('cloning twice mints two distinct workflow ids and never shares state arrays', () => {
    const template = WORKFLOW_TEMPLATES[0]!;
    const first = cloneTemplate(template);
    const second = cloneTemplate(template);
    expect(first.id).not.toBe(second.id);
    first.states[0]!.name = 'Mutated';
    expect(second.states[0]!.name).not.toBe('Mutated');
    expect(template.def.states[0]!.name).not.toBe('Mutated');
  });

  /**
   * 10.38 — errand-with-waits blocked-flags exactly its one waiting state.
   */
  it('the errand card IS the domain template, and its waiting state is blocked-flagged', () => {
    const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;
    // Identity, not resemblance — the same guarantee the Kanban card carries:
    // the shop's seeded workflow (Plan 11) and this gallery card can never
    // drift, because they are one object.
    expect(errand.def).toBe(ERRAND_WITH_WAITS_TEMPLATE);
    const blockedIds = errand.def.states.filter((state) => state.blocked === true).map((state) => state.id);
    expect(blockedIds).toEqual(['waiting']);
    for (const state of errand.def.states.filter((candidate) => candidate.blocked === true)) {
      expect(state.category).toBe('active');
    }
  });

  /**
   * 10.39 — approval-chain requires a second person on the approve move.
   */
  it('approval-chain requires a second person on the approve move', () => {
    const approval = WORKFLOW_TEMPLATES.find((template) => template.id === 'approval-chain')!;
    const approve = approval.def.transitions.find((transition) => transition.to === 'approved')!;
    expect(approve.rules).toEqual([{ kind: 'require-different-user', thanActorOf: { to: 'submitted' } }]);
  });

  it('draftFromTemplate produces a positioned, unselected, baseless draft', () => {
    const draft = draftFromTemplate(WORKFLOW_TEMPLATES[1]!);
    expect(draft.base).toBeNull();
    expect(draft.selection).toEqual({ kind: 'none' });
    for (const state of draft.def.states) {
      expect(draft.positions[state.id]).toBeDefined();
    }
  });
});

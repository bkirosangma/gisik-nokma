import { adviseWorkflowDef, ERRAND_WITH_WAITS_TEMPLATE } from '@gisik-nokma/domain';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { seedUlid } from '../../src/seed/seed-ulid.js';
import { TRACKER_STATE_TO_ERRAND_STATE, checkErrandTemplate, workflowFromTemplate } from '../../src/seed/templates.js';

describe('the status mapping table', () => {
  it('maps exactly the tracker vocabulary', () => {
    expect(TRACKER_STATE_TO_ERRAND_STATE).toEqual({
      later: 'later',
      next: 'next',
      'in-progress': 'in-progress',
      blocked: 'waiting',
    });
  });
});

describe('checkErrandTemplate — the executable pin on Plan 8', () => {
  it('the real errand-with-waits template carries the tracker board', () => {
    expect(checkErrandTemplate(ERRAND_WITH_WAITS_TEMPLATE)).toEqual({ ok: true });
  });

  it('planted defect: a template missing the waiting state is named', () => {
    const broken = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      states: ERRAND_WITH_WAITS_TEMPLATE.states.filter((state) => state.id !== 'waiting'),
      transitions: ERRAND_WITH_WAITS_TEMPLATE.transitions.filter(
        (transition) => transition.to !== 'waiting' && transition.from !== 'waiting',
      ),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain("missing state 'waiting'");
  });

  it('planted defect: a mapped state reachable only in two hops is refused — no fabricated intermediate claims', () => {
    const initial = ERRAND_WITH_WAITS_TEMPLATE.initialStateId;
    const broken = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      transitions: ERRAND_WITH_WAITS_TEMPLATE.transitions
        .filter((transition) => !(transition.to === 'waiting' && (transition.from === '*' || transition.from === initial)))
        .concat([{ from: 'in-progress', to: 'waiting', rules: [] }]),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain('one transition');
  });

  it('planted defect: waiting without blocked:true is named (attention-strip contract)', () => {
    const broken = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      states: ERRAND_WITH_WAITS_TEMPLATE.states.map((state) =>
        state.id === 'waiting' ? { ...state, blocked: false } : state,
      ),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
  });

  it('planted defect: an unguarded way into done is named (closing an errand must say what happened)', () => {
    const broken = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      transitions: ERRAND_WITH_WAITS_TEMPLATE.transitions.map((transition) =>
        transition.to === 'done' ? { ...transition, rules: [] } : transition,
      ),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain('require-comment');
  });

  it('planted defect: a rule on the one-hop seeding transition is named (Ruling P29 tripwire)', () => {
    const broken = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      transitions: ERRAND_WITH_WAITS_TEMPLATE.transitions.map((transition) =>
        transition.from === 'later' && transition.to === 'waiting'
          ? { ...transition, rules: [{ kind: 'require-comment' as const }] }
          : transition,
      ),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain('carries rules');
  });
});

describe('workflowFromTemplate', () => {
  it('clones with a fresh id at version 1, leaving the template untouched', () => {
    const workflowId = seedUlid('workflow', 'test-fixture');
    const cloned = workflowFromTemplate(ERRAND_WITH_WAITS_TEMPLATE, workflowId);
    expect(cloned.id).toBe(workflowId);
    expect(cloned.version).toBe(1);
    expect(cloned.states).toEqual(ERRAND_WITH_WAITS_TEMPLATE.states);
    expect((ERRAND_WITH_WAITS_TEMPLATE as Partial<WorkflowDef>).id).not.toBe(workflowId);
  });
});

describe('Ruling P29 — the two rule-bypassable advisories are the correct, pinned shape', () => {
  it('a live errand-with-waits def trips exactly two rule-bypassable advisories', () => {
    const live = workflowFromTemplate(ERRAND_WITH_WAITS_TEMPLATE, seedUlid('workflow', 'ruling-p29-live'));
    const advisories = adviseWorkflowDef(live).filter((advisory) => advisory.code === 'rule-bypassable');
    expect(advisories).toHaveLength(2);
  });

  it('"fixing" the later->waiting advisory by adding a rule genuinely silences THAT advisory, but checkErrandTemplate still reddens', () => {
    // NOTE ON DEVIATION FROM THE PLAN'S PRESCRIBED ASSERTION: adviseLowerGuardBypasses
    // emits one advisory per (guarded edge, uncovered other edge) PAIR, not one per
    // silenced path. With three edges into 'waiting' (later, next, in-progress+rc),
    // the base count is 2 (in-progress vs later, in-progress vs next). Adding
    // require-comment to later->waiting makes THAT edge guarded too, which kills the
    // (in-progress, later) pair but creates a new (later, next) pair — total stays 2,
    // just a different pair. A bare `.length === 1` assertion here would be the "check
    // that cannot fail" shape: true before AND after for reasons unrelated to the
    // mutation. So this pins IDENTITY (the specific "from Later" advisory disappears)
    // rather than a raw count, and a separate case below shows the count that DOES
    // reach zero (guard both paths) while checkErrandTemplate still refuses it.
    const live = workflowFromTemplate(ERRAND_WITH_WAITS_TEMPLATE, seedUlid('workflow', 'ruling-p29-mutated'));
    const mutated: WorkflowDef = {
      ...live,
      transitions: live.transitions.map((transition) =>
        transition.from === 'later' && transition.to === 'waiting'
          ? { ...transition, rules: [{ kind: 'require-comment' as const }] }
          : transition,
      ),
    };

    const baseAdvisories = adviseWorkflowDef(live).filter((advisory) => advisory.code === 'rule-bypassable');
    expect(baseAdvisories.filter((advisory) => advisory.message.includes('entered from "Later"'))).toHaveLength(1);

    const mutatedAdvisories = adviseWorkflowDef(mutated).filter((advisory) => advisory.code === 'rule-bypassable');
    expect(mutatedAdvisories.filter((advisory) => advisory.message.includes('entered from "Later"'))).toHaveLength(0);

    expect(checkErrandTemplate(mutated).ok).toBe(false);
  });

  it('guarding BOTH waiting paths clears the advisory panel entirely, and checkErrandTemplate still reddens', () => {
    const live = workflowFromTemplate(ERRAND_WITH_WAITS_TEMPLATE, seedUlid('workflow', 'ruling-p29-both-fixed'));
    const fixedBoth: WorkflowDef = {
      ...live,
      transitions: live.transitions.map((transition) =>
        transition.to === 'waiting' ? { ...transition, rules: [{ kind: 'require-comment' as const }] } : transition,
      ),
    };

    expect(adviseWorkflowDef(fixedBoth).filter((advisory) => advisory.code === 'rule-bypassable')).toHaveLength(0);

    const verdict = checkErrandTemplate(fixedBoth);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain('carries rules');
  });
});

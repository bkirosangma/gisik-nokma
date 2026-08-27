import { label } from './validate-workflow.js';
import type { WorkflowDef } from './workflow.js';

/**
 * A warning: real, but not fatal. Structurally identical to Issue on purpose —
 * the separation that matters is which FUNCTION returns it, not which type,
 * because structural typing makes a distinct name worthless as a guard.
 */
export type Advisory = { code: string; message: string };

/**
 * Advisory checks over a workflow definition. Assumes a def that already
 * validates clean. The rule engine NEVER calls this: everything
 * validateWorkflowDef returns becomes a refusal, so a warning placed there
 * would silently become one too.
 *
 * Scope, stated so nobody reads more into it: this characterises reachable
 * vacuous acceptance WITHIN A SINGLE WORKFLOW VERSION. Across versions a
 * dropped-and-remapped state is the counterexample, which is why transition
 * log entries carry their workflowVersion and four-eyes resolves them forward.
 */
export function adviseWorkflowDef(def: WorkflowDef): Advisory[] {
  const advisories: Advisory[] = [];
  const stateIds = new Set(def.states.map((state) => state.id));

  for (const transition of def.transitions) {
    for (const rule of transition.rules) {
      if (rule.kind !== 'require-different-user') continue;
      const target = rule.thanActorOf.to;
      // Suppression, so one authoring mistake yields one message: both of
      // these already produced an ERROR in validateWorkflowDef.
      if (!stateIds.has(target)) continue; // rdu-unknown-state fired
      if (!def.transitions.some((candidate) => candidate.to === target)) continue; // rdu-unenterable-state fired

      // States reachable from the start WITHOUT ever entering the watched
      // state: walk the graph with every edge into `target` removed. Same
      // wildcard semantics the reachability walk pins — a from:'*' edge is
      // traversable from any state already in the set, and a '*' → target
      // edge is excluded like any other because its `to` is the target.
      const reachableWithoutTarget = new Set<string>([def.initialStateId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const candidate of def.transitions) {
          if (candidate.to === target) continue;
          if (!stateIds.has(candidate.to) || reachableWithoutTarget.has(candidate.to)) continue;
          // A from:'*' edge is traversable from any state already in the set,
          // and the set always holds at least the initial state.
          const traversable = candidate.from === '*' || reachableWithoutTarget.has(candidate.from);
          if (traversable) {
            reachableWithoutTarget.add(candidate.to);
            grew = true;
          }
        }
      }

      const bypassable =
        transition.from === '*' || reachableWithoutTarget.has(transition.from);
      if (!bypassable) continue;

      const targetName = def.states.find((state) => state.id === target)?.name ?? target;
      advisories.push({
        code: 'rdu-bypassable',
        message: `A require-different-user rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} watches the move to "${targetName}", but this move can be reached without ever entering "${targetName}"; on that path one person can make it alone.`,
      });
    }
  }

  return advisories;
}

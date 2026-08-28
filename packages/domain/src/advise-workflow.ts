import { label } from './validate-workflow.js';
import type { Rule, Transition, WorkflowDef } from './workflow.js';

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
 *
 * Two sweeps, each complete, concatenated in a fixed order: every
 * `rdu-bypassable` first, then every `rule-bypassable`. The order is the
 * tier's contract — a caller rendering warnings beside the edges they name
 * regroups them anyway, and a caller asserting on the array needs the order to
 * be a decision rather than an accident.
 */
export function adviseWorkflowDef(def: WorkflowDef): Advisory[] {
  return [...adviseWatchedStateBypasses(def), ...adviseLowerGuardBypasses(def)];
}

/**
 * `rdu-bypassable`: a four-eyes rule whose guarded move can be made without
 * ever having entered the state it watches, so the second pair of eyes is
 * vacuously satisfied and one person can make the move alone.
 *
 * Deliberately NOT merged into `rule-bypassable` below, though the owner's
 * ruling left that open. The two describe different geometries and want
 * different fixes. This one is about the WATCHED state being avoidable and can
 * fire on a target with exactly one edge into it — the guarded transition
 * itself; its remedy is to close the path around the watched state or re-point
 * the watch. The other is about the GUARDED EDGE being avoidable, needs a
 * second edge into the same target by definition, and its remedy is to guard
 * that other edge. A def can trip both at once, on the same rule, for reasons
 * an author would fix in two different places; one code could not say that.
 */
function adviseWatchedStateBypasses(def: WorkflowDef): Advisory[] {
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

/**
 * `rule-bypassable`: a rule of ANY of the five kinds guards one edge into a
 * state, while another edge enters the same state carrying no rule of that
 * kind. The guard is real on the path its author drew and absent on the other,
 * and until this code existed nothing said so — the definition published
 * clean.
 *
 * The archetype is the from-any edge: `{from:'*', to:'done', rules:[]}` beside
 * a guarded `{from:'doing', to:'done', rules:[restrict-to …]}` makes the guard
 * optional for every ticket not currently in "doing". Nothing here is special
 * about the wildcard, though — a plain fast-track edge voids a guard exactly
 * as thoroughly, and gets the same warning.
 *
 * COVER — the design call the owner's ruling left to this amendment, made
 * here and argued in the PR that lands it. A rule of kind K on the guarded
 * edge is COVERED when the other edge carries at least one rule of kind K.
 * Same-kind-present, not rule-set equivalence, and PARAMETERS ARE NEVER
 * COMPARED: not restrict-to's assignee/roles/userIds, not require-field's
 * `field`, not require-different-user's watched state. Two reasons.
 *
 * First, there is no honest ordering to compare against. Is `restrict-to
 * roles:['admin']` weaker or stronger than `restrict-to userIds:['user_b']`?
 * The answer depends on who holds which role in a workspace this layer cannot
 * see, so a tier claiming to rank them would be guessing in a sentence written
 * to sound certain.
 *
 * Second, the owner's codicil made the guarded wildcard the sanctioned way to
 * close the hole — "we should be able to have the anywhere arrow carry its own
 * guard". A from-any edge is a DIFFERENT path, and the guard that belongs on
 * it is usually a different guard ("from anywhere, only an admin may close").
 * Demanding equivalence would leave that author with a warning they cannot
 * clear without copying a rule that does not fit the path — and a warning
 * nobody can clear is a warning everybody learns to ignore.
 *
 * So silence here means the author SAID SOMETHING of that kind on the other
 * path, and nothing stronger. It is a floor, not a proof of equal strictness,
 * and a reader who mistakes it for one will be wrong.
 */
function adviseLowerGuardBypasses(def: WorkflowDef): Advisory[] {
  const advisories: Advisory[] = [];
  const stateIds = new Set(def.states.map((state) => state.id));

  for (const [guardedIndex, guarded] of def.transitions.entries()) {
    // A target that is not a declared state is out of scope twice over: an
    // unknown id already produced unknown-transition-state, and the `to: '*'`
    // the coordination doc's rider names is inert — the engine refuses
    // unknown-state before any edge is selected — so an advisory about it
    // would describe a move nobody can make.
    if (!stateIds.has(guarded.to)) continue;

    // Two restrict-to rules on one edge are one guard to sidestep, not two, so
    // the sweep is over the DISTINCT kinds present, in first-appearance order.
    const kindsSeen = new Set<Rule['kind']>();
    for (const rule of guarded.rules) {
      if (kindsSeen.has(rule.kind)) continue;
      kindsSeen.add(rule.kind);

      for (const [otherIndex, other] of def.transitions.entries()) {
        if (otherIndex === guardedIndex) continue;
        if (other.to !== guarded.to) continue;
        // A self-loop is not a way in — the same reading terminal-no-inbound
        // takes. Whoever is standing in the target already paid whatever it
        // cost to arrive.
        if (other.from === other.to) continue;
        if (carriesKind(other, rule.kind)) continue;

        advisories.push({
          code: 'rule-bypassable',
          message: `A ${rule.kind} rule on the transition from ${label(def, guarded.from)} to ${label(def, guarded.to)} guards this move, but ${label(def, guarded.to)} can also be entered from ${label(def, other.from)} with no ${rule.kind} rule; on that path the guard does not apply.`,
        });
      }
    }
  }

  return advisories;
}

/** The cover test, in one line so the floor semantics have exactly one home. */
function carriesKind(transition: Transition, kind: Rule['kind']): boolean {
  return transition.rules.some((rule) => rule.kind === kind);
}

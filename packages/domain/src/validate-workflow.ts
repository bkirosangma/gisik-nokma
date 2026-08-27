import type { WorkflowDef } from './workflow.js';

export type Issue = { code: string; message: string };

/**
 * Pure structural validation of a workflow definition. No I/O — the builder
 * UI calls this same function for live validation; the engine calls it before
 * accepting a workflow.defined event. All issues are collected so the builder
 * can show every problem at once; order is deterministic (documented in the
 * plan) because the engine joins messages into a single refusal reason.
 */
export function validateWorkflowDef(def: WorkflowDef): Issue[] {
  if (def.states.length === 0) {
    return [{ code: 'no-states', message: 'This workflow has no states at all.' }];
  }

  const issues: Issue[] = [];
  const stateIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const state of def.states) {
    if (stateIds.has(state.id)) duplicateIds.add(state.id);
    stateIds.add(state.id);
  }
  for (const id of duplicateIds) {
    issues.push({
      code: 'duplicate-state-id',
      message: `Two states share the id "${id}"; state ids must be unique.`,
    });
  }

  if (!def.states.some((state) => state.category === 'terminal')) {
    issues.push({
      code: 'no-terminal-state',
      message: 'This workflow has no terminal state, so no ticket could ever finish.',
    });
  }

  for (const transition of def.transitions) {
    for (const ref of [transition.from, transition.to]) {
      if (ref !== '*' && !stateIds.has(ref)) {
        issues.push({
          code: 'unknown-transition-state',
          message: `The transition from "${transition.from}" to "${transition.to}" refers to "${ref}", which is not a state in this workflow.`,
        });
      }
    }
  }

  const seenEdges = new Set<string>();
  const duplicateEdges = new Set<string>();
  for (const transition of def.transitions) {
    const key = JSON.stringify([transition.from, transition.to]);
    if (seenEdges.has(key)) duplicateEdges.add(key);
    else seenEdges.add(key);
  }
  for (const key of duplicateEdges) {
    const [from, to] = JSON.parse(key) as [string, string];
    issues.push({
      code: 'duplicate-transition',
      message: `There are two transitions from ${label(def, from)} to ${label(def, to)}; keep at most one transition per direction between a pair of states.`,
    });
  }

  // Reachability from the starting state — the state named by initialStateId
  // (the contract amendment: position in the list is never semantic). The
  // starting state matches '*', so every '*' target is reachable outright.
  // An initialStateId naming no state is its own issue, and reachability is
  // skipped — there is no start to walk from.
  const start = def.states.find((state) => state.id === def.initialStateId);
  if (start === undefined) {
    issues.push({
      code: 'unknown-initial-state',
      message: `This workflow's initial state is "${def.initialStateId}", but no state with that id exists.`,
    });
  } else {
    const reachable = new Set<string>([start.id]);
    for (const transition of def.transitions) {
      if (transition.from === '*' && stateIds.has(transition.to)) reachable.add(transition.to);
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const transition of def.transitions) {
        if (
          transition.from !== '*' &&
          reachable.has(transition.from) &&
          stateIds.has(transition.to) &&
          !reachable.has(transition.to)
        ) {
          reachable.add(transition.to);
          grew = true;
        }
      }
    }
    for (const state of def.states) {
      if (!reachable.has(state.id)) {
        issues.push({
          code: 'unreachable-state',
          message: `State "${state.name}" cannot be reached from the starting state "${start.name}".`,
        });
      }
    }
  }

  // An unenterable terminal state: nothing leads into it. A self-loop does not
  // count; a '*' inbound counts only when there is some other state to come from.
  for (const state of def.states) {
    if (state.category !== 'terminal') continue;
    const hasInbound = def.transitions.some(
      (transition) =>
        transition.to === state.id &&
        (transition.from === '*' ? def.states.length > 1 : transition.from !== state.id),
    );
    if (!hasInbound) {
      issues.push({
        code: 'terminal-no-inbound',
        message: `Terminal state "${state.name}" has no transition leading into it, so no ticket could ever reach it.`,
      });
    }
  }

  for (const transition of def.transitions) {
    for (const rule of transition.rules) {
      if (rule.kind === 'restrict-to') {
        const namesAnyone =
          rule.assignee === true ||
          (rule.roles !== undefined && rule.roles.length > 0) ||
          (rule.userIds !== undefined && rule.userIds.length > 0);
        if (!namesAnyone) {
          issues.push({
            code: 'empty-restrict-to',
            message: `A restrict-to rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} names nobody: it must allow the assignee, at least one role, or at least one named person.`,
          });
        }
      }
      if (rule.kind === 'require-different-user') {
        const target = rule.thanActorOf.to;
        if (!stateIds.has(target)) {
          issues.push({
            code: 'rdu-unknown-state',
            message: `A require-different-user rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} refers to a move to "${target}", but no state with that id exists.`,
          });
        } else if (!def.transitions.some((candidate) => candidate.to === target)) {
          // Enterability is checked ONLY for states that exist: an unknown id
          // already reported above must not also report here — one authoring
          // mistake, one message. A from:'*' transition still has a concrete
          // `to`, so it counts as entering that state like any other.
          // "nothing in this version" is deliberate: a legacy ticket can carry
          // an older version's entry into this state forward, so an
          // unqualified "nothing ever" would overclaim. The target exists
          // here, so its NAME resolves — unlike rdu-unknown-state above, which
          // must print the raw id because no name exists to print.
          const targetName = def.states.find((state) => state.id === target)?.name ?? target;
          issues.push({
            code: 'rdu-unenterable-state',
            message: `A require-different-user rule on the transition from ${label(def, transition.from)} to ${label(def, transition.to)} refers to a move to "${targetName}", but nothing in this version enters that state, so the rule can never require a second person.`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * How a state reference is rendered in a message: its quoted name when the id
 * is known, the unquoted words `any state` for the wildcard, and the quoted
 * raw id when nothing resolves. Exported because the advisory tier (Step 7)
 * renders the same references and must render them identically.
 */
export function label(def: WorkflowDef, ref: string): string {
  if (ref === '*') return 'any state';
  const state = def.states.find((s) => s.id === ref);
  return state === undefined ? `"${ref}"` : `"${state.name}"`;
}

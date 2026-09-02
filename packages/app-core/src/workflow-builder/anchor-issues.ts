import type { Advisory, Issue, WorkflowDef } from '@gisik-nokma/domain';

export type IssueAnchor =
  | { kind: 'workflow' }
  | { kind: 'state'; stateId: string }
  | { kind: 'transition'; index: number };

export type AnchoredIssue = Issue & { anchor: IssueAnchor };
export type AnchoredAdvisory = Advisory & { anchor: IssueAnchor };

const CANVAS_ANCHOR: IssueAnchor = { kind: 'workflow' };

/**
 * Issue carries no structural pointer, so anchors are recomputed here and
 * paired per code: for each code we rebuild the offender list in definition
 * order (mirroring validateWorkflowDef's documented per-code order) and zip
 * it against that code's issues in order. Pairing per code — never by global
 * position — keeps anchoring correct wherever the reconciled validator slots
 * a code in its overall ordering; that is why Plan 2 inserting
 * rdu-unenterable-state after rdu-unknown-state costs nothing here beyond one
 * more offender computation. A dry queue degrades to a canvas anchor.
 *
 * Advisory is structurally identical to Issue, so both tiers come through this
 * one function; the generic keeps the caller's element type on the way out
 * instead of flattening an Advisory into an AnchoredIssue.
 *
 * adviseWorkflowDef (packages/domain/src/advise-workflow.ts) emits TWO codes,
 * `rdu-bypassable` and `rule-bypassable` — the plan text that specified this
 * module predates the `rule-bypassable` amendment and only names the first.
 * Both are wired here against the function's actual output; a queue keyed
 * only by 'rdu-bypassable' would leave every rule-bypassable advisory to fall
 * through to the canvas-level default, which is not a crash but is a worse
 * anchor than the transition the advisory actually names.
 */
export function anchorIssues<T extends Issue | Advisory>(
  def: WorkflowDef,
  issues: readonly T[],
): (T & { anchor: IssueAnchor })[] {
  const queues = new Map<string, IssueAnchor[]>([
    ['duplicate-state-id', duplicateStateAnchors(def)],
    ['unknown-transition-state', unknownTransitionStateAnchors(def)],
    ['duplicate-transition', duplicateTransitionAnchors(def)],
    ['unreachable-state', unreachableStateAnchors(def)],
    ['terminal-no-inbound', terminalNoInboundAnchors(def)],
    ['empty-restrict-to', ruleAnchors(def, isEmptyRestrictTo)],
    ['rdu-unknown-state', ruleAnchors(def, (rule) => isRduUnknown(def, rule))],
    ['rdu-unenterable-state', ruleAnchors(def, (rule) => isRduUnenterable(def, rule))],
    // the advisory tier — same offender shape (the transition carrying the rule)
    ['rdu-bypassable', ruleAnchors(def, (rule, transition) => isRduBypassable(def, rule, transition))],
    ['rule-bypassable', ruleBypassableAnchors(def)],
  ]);
  const consumed = new Map<string, number>();
  return issues.map((issue) => {
    const queue = queues.get(issue.code);
    if (queue === undefined) return { ...issue, anchor: CANVAS_ANCHOR };
    const at = consumed.get(issue.code) ?? 0;
    consumed.set(issue.code, at + 1);
    return { ...issue, anchor: queue[at] ?? CANVAS_ANCHOR };
  });
}

function duplicateStateAnchors(def: WorkflowDef): IssueAnchor[] {
  const counts = new Map<string, number>();
  for (const state of def.states) counts.set(state.id, (counts.get(state.id) ?? 0) + 1);
  const anchors: IssueAnchor[] = [];
  const reported = new Set<string>();
  for (const state of def.states) {
    if ((counts.get(state.id) ?? 0) > 1 && !reported.has(state.id)) {
      reported.add(state.id);
      anchors.push({ kind: 'state', stateId: state.id });
    }
  }
  return anchors;
}

function unknownTransitionStateAnchors(def: WorkflowDef): IssueAnchor[] {
  const stateIds = new Set(def.states.map((state) => state.id));
  const anchors: IssueAnchor[] = [];
  def.transitions.forEach((transition, index) => {
    if (transition.from !== '*' && !stateIds.has(transition.from)) anchors.push({ kind: 'transition', index });
    if (!stateIds.has(transition.to)) anchors.push({ kind: 'transition', index });
  });
  return anchors;
}

function duplicateTransitionAnchors(def: WorkflowDef): IssueAnchor[] {
  const seen = new Set<string>();
  const anchors: IssueAnchor[] = [];
  def.transitions.forEach((transition, index) => {
    const key = `${transition.from} ${transition.to}`;
    if (seen.has(key)) anchors.push({ kind: 'transition', index });
    seen.add(key);
  });
  return anchors;
}

/**
 * States reachable from initialStateId. `avoiding` closes one state off — the
 * rdu-bypassable question is "can the guarded move be reached without ever
 * entering the watched state?", which is this walk with that state removed.
 */
function reachableStateIds(def: WorkflowDef, avoiding?: string): Set<string> {
  const stateIds = new Set(def.states.map((state) => state.id));
  const reachable = new Set<string>();
  if (stateIds.has(def.initialStateId)) reachable.add(def.initialStateId);
  let grew = true;
  while (grew) {
    grew = false;
    for (const transition of def.transitions) {
      if (transition.to === avoiding) continue;
      if (!stateIds.has(transition.to) || reachable.has(transition.to)) continue;
      const fromReachable =
        transition.from === '*' ? reachable.size > 0 : reachable.has(transition.from);
      if (fromReachable) {
        reachable.add(transition.to);
        grew = true;
      }
    }
  }
  return reachable;
}

function unreachableStateAnchors(def: WorkflowDef): IssueAnchor[] {
  const reachable = reachableStateIds(def);
  return def.states
    .filter((state) => !reachable.has(state.id))
    .map((state) => ({ kind: 'state', stateId: state.id }) as IssueAnchor);
}

function terminalNoInboundAnchors(def: WorkflowDef): IssueAnchor[] {
  return def.states
    .filter((state) => state.category === 'terminal')
    .filter((state) => {
      const hasInbound = def.transitions.some((transition) => {
        if (transition.to !== state.id) return false;
        if (transition.from === state.id) return false; // a self-loop is not a way in
        if (transition.from === '*') return def.states.length > 1; // '*' counts only with company
        return true;
      });
      return !hasInbound;
    })
    .map((state) => ({ kind: 'state', stateId: state.id }) as IssueAnchor);
}

type DefRule = WorkflowDef['transitions'][number]['rules'][number];
type DefTransition = WorkflowDef['transitions'][number];

function ruleAnchors(
  def: WorkflowDef,
  offending: (rule: DefRule, transition: DefTransition) => boolean,
): IssueAnchor[] {
  const anchors: IssueAnchor[] = [];
  def.transitions.forEach((transition, index) => {
    for (const rule of transition.rules) {
      if (offending(rule, transition)) anchors.push({ kind: 'transition', index });
    }
  });
  return anchors;
}

function isEmptyRestrictTo(rule: DefRule): boolean {
  return (
    rule.kind === 'restrict-to' &&
    rule.assignee !== true &&
    (rule.roles === undefined || rule.roles.length === 0) &&
    (rule.userIds === undefined || rule.userIds.length === 0)
  );
}

function isRduUnknown(def: WorkflowDef, rule: DefRule): boolean {
  return (
    rule.kind === 'require-different-user' &&
    !def.states.some((state) => state.id === rule.thanActorOf.to)
  );
}

function someTransitionEnters(def: WorkflowDef, stateId: string): boolean {
  return def.transitions.some((transition) => transition.to === stateId);
}

/** The watched state exists but nothing moves into it — the rule can never fire. */
function isRduUnenterable(def: WorkflowDef, rule: DefRule): boolean {
  return (
    rule.kind === 'require-different-user' &&
    def.states.some((state) => state.id === rule.thanActorOf.to) &&
    !someTransitionEnters(def, rule.thanActorOf.to)
  );
}

/**
 * The advisory offender rule (Plan 2 owns the authoritative algorithm; this is
 * the recomputation anchoring needs, per decision 2). The guarded transition is
 * reachable from initialStateId without ever entering the watched state, so on
 * that path there is no earlier performer to differ from. Suppressed when the
 * watched state is unknown or unenterable — an error already fired for the
 * same rule, and the builder does not stack a warning on top of it.
 */
function isRduBypassable(def: WorkflowDef, rule: DefRule, transition: DefTransition): boolean {
  if (rule.kind !== 'require-different-user') return false;
  const watched = rule.thanActorOf.to;
  if (!def.states.some((state) => state.id === watched)) return false;
  if (!someTransitionEnters(def, watched)) return false;
  if (transition.from === '*') return true; // a from-anywhere move is reachable by definition
  return reachableStateIds(def, watched).has(transition.from);
}

/** A self-loop is not a way in — the same reading terminal-no-inbound takes. */
function carriesKind(transition: DefTransition, kind: DefRule['kind']): boolean {
  return transition.rules.some((rule) => rule.kind === kind);
}

/**
 * The `rule-bypassable` offender queue, mirroring adviseWorkflowDef's own
 * traversal order exactly (packages/domain/src/advise-workflow.ts,
 * adviseLowerGuardBypasses): for each guarded transition in definition order,
 * for each distinct rule kind on it in first-appearance order, for each other
 * transition entering the same target in definition order that carries no
 * rule of that kind (excluding self-loops and unknown targets) — one anchor
 * at the GUARDED transition's index, because that is the edge whose guard the
 * advisory is about. One rule can produce several advisories (one per
 * uncovered other edge); each gets its own queue entry, all pointing at the
 * same guarded index, matching adviseWorkflowDef's own emission order.
 */
function ruleBypassableAnchors(def: WorkflowDef): IssueAnchor[] {
  const stateIds = new Set(def.states.map((state) => state.id));
  const anchors: IssueAnchor[] = [];

  def.transitions.forEach((guarded, guardedIndex) => {
    if (!stateIds.has(guarded.to)) return;

    const kindsSeen = new Set<DefRule['kind']>();
    for (const rule of guarded.rules) {
      if (kindsSeen.has(rule.kind)) continue;
      kindsSeen.add(rule.kind);

      def.transitions.forEach((other, otherIndex) => {
        if (otherIndex === guardedIndex) return;
        if (other.to !== guarded.to) return;
        if (other.from === other.to) return;
        if (carriesKind(other, rule.kind)) return;
        anchors.push({ kind: 'transition', index: guardedIndex });
      });
    }
  });

  return anchors;
}

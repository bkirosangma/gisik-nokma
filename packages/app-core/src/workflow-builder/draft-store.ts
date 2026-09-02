import {
  newUlid,
  validateWorkflowDef,
  type Issue,
  type PublishedWorkflowDef,
  type Rule,
  type StateCategory,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import { layoutDraft, nextFreePosition, type StatePosition } from './layout.js';

export type BuilderSelection =
  | { kind: 'none' }
  | { kind: 'state'; stateId: string }
  | { kind: 'transition'; index: number };

export type WorkflowDraft = {
  def: WorkflowDef;
  positions: Record<string, StatePosition>;
  /** The published version this draft edits — null for a brand-new workflow. */
  base: { version: number; states: { id: string; name: string }[] } | null;
  selection: BuilderSelection;
};

export type DraftActions = {
  setWorkflowName(name: string): void;
  addState(input?: { name?: string; category?: StateCategory }): string;
  renameState(stateId: string, name: string): void;
  setStateCategory(stateId: string, category: StateCategory): void;
  setStateBlocked(stateId: string, blocked: boolean): void;
  setInitialState(stateId: string): void;
  removeState(stateId: string): void;
  moveState(nodeId: string, position: StatePosition): void;
  addTransition(from: string, to: string): void;
  removeTransition(index: number): void;
  addRule(transitionIndex: number, rule: Rule): void;
  updateRule(transitionIndex: number, ruleIndex: number, rule: Rule): void;
  removeRule(transitionIndex: number, ruleIndex: number): void;
  select(selection: BuilderSelection): void;
  loadDraft(draft: WorkflowDraft): void;
};

export type DraftStore = {
  getState(): WorkflowDraft;
  subscribe(listener: () => void): () => void;
  actions: DraftActions;
};

export function newDraft(name: string): WorkflowDraft {
  const stateId = newUlid();
  const def: WorkflowDef = {
    id: newUlid(),
    version: 1,
    name,
    initialStateId: stateId,
    states: [{ id: stateId, name: 'New', category: 'open' }],
    transitions: [],
  };
  return { def, positions: layoutDraft(def), base: null, selection: { kind: 'none' } };
}

export function draftFromPublished(published: PublishedWorkflowDef): WorkflowDraft {
  const { stateMapping: _pastMapping, ...def } = published as PublishedWorkflowDef & {
    stateMapping?: Record<string, string>;
  };
  return {
    def,
    positions: layoutDraft(def),
    base: {
      version: published.version,
      states: published.states.map((state) => ({ id: state.id, name: state.name })),
    },
    selection: { kind: 'none' },
  };
}

export function selectIssues(draft: WorkflowDraft): Issue[] {
  return validateWorkflowDef(draft.def);
}

/**
 * Publish legality is validateWorkflowDef emptiness — advisories excluded.
 * adviseWorkflowDef is NOT called here and its Advisory[] is never unioned in:
 * an advisory is an authoring warning, and folding one into this predicate
 * would turn every warning into a publish blocker (design decision 9).
 *
 * What keeps that honest TODAY is draft-store.test.ts's `an advisory does not
 * gate publish` — a draft that trips rdu-bypassable and nothing else, asserted
 * to leave this selector true. The issues panel that will render advisories in
 * their own visually distinct section does not exist yet: Task 8 builds it
 * (validation.test.tsx, the planted-defect table), and Task 9 adds the proof
 * that the Publish button stays enabled and the publish commits.
 */
export function selectCanPublish(draft: WorkflowDraft): boolean {
  return selectIssues(draft).length === 0;
}

/** Distinct state ids that some transition points at — the choices Task 7's
 * require-different-user picker will offer. No production code calls this yet;
 * its own test in draft-store.test.ts does. */
export function selectInboundTargetIds(def: WorkflowDef): string[] {
  const targets: string[] = [];
  for (const transition of def.transitions) {
    if (!targets.includes(transition.to)) targets.push(transition.to);
  }
  return targets;
}

export function createDraftStore(initial: WorkflowDraft): DraftStore {
  let state = initial;
  const listeners = new Set<() => void>();

  function set(next: WorkflowDraft): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function setDef(def: WorkflowDef): void {
    set({ ...state, def });
  }

  function mapState(
    stateId: string,
    change: (found: WorkflowDef['states'][number]) => WorkflowDef['states'][number],
  ): void {
    setDef({
      ...state.def,
      states: state.def.states.map((candidate) => (candidate.id === stateId ? change(candidate) : candidate)),
    });
  }

  function mapTransition(
    index: number,
    change: (found: WorkflowDef['transitions'][number]) => WorkflowDef['transitions'][number],
  ): void {
    setDef({
      ...state.def,
      transitions: state.def.transitions.map((candidate, at) => (at === index ? change(candidate) : candidate)),
    });
  }

  const actions: DraftActions = {
    setWorkflowName(name) {
      setDef({ ...state.def, name });
    },
    addState(input = {}) {
      const id = newUlid();
      const def: WorkflowDef = {
        ...state.def,
        states: [
          ...state.def.states,
          { id, name: input.name ?? 'New state', category: input.category ?? 'open' },
        ],
        initialStateId: state.def.states.length === 0 ? id : state.def.initialStateId,
      };
      set({
        ...state,
        def,
        positions: { ...state.positions, [id]: nextFreePosition(state.positions) },
        selection: { kind: 'state', stateId: id },
      });
      return id;
    },
    renameState(stateId, name) {
      mapState(stateId, (found) => ({ ...found, name }));
    },
    setStateCategory(stateId, category) {
      mapState(stateId, (found) => ({ ...found, category }));
    },
    setStateBlocked(stateId, blocked) {
      mapState(stateId, (found) => {
        if (blocked) return { ...found, blocked: true };
        const { blocked: _cleared, ...rest } = found;
        return rest;
      });
    },
    setInitialState(stateId) {
      setDef({ ...state.def, initialStateId: stateId });
    },
    removeState(stateId) {
      // Cascades edges (a dangling edge cannot render) but never rewrites what the
      // author wrote elsewhere: initialStateId and require-different-user references
      // stay put and surface as unknown-initial-state / rdu-unknown-state issues.
      const { [stateId]: _gone, ...positions } = state.positions;
      set({
        ...state,
        def: {
          ...state.def,
          states: state.def.states.filter((candidate) => candidate.id !== stateId),
          transitions: state.def.transitions.filter(
            (transition) => transition.from !== stateId && transition.to !== stateId,
          ),
        },
        positions,
        selection: { kind: 'none' },
      });
    },
    moveState(nodeId, position) {
      set({ ...state, positions: { ...state.positions, [nodeId]: position } });
    },
    addTransition(from, to) {
      setDef({ ...state.def, transitions: [...state.def.transitions, { from, to, rules: [] }] });
    },
    removeTransition(index) {
      // BuilderSelection addresses a transition by index (the plan's Produces
      // contract), so this clears only a selection pointing AT the removed one.
      // A selection with a HIGHER index keeps its number while the transitions
      // shift down under it: measured on a 3-transition def, selection index 2
      // survived removeTransition(0) and then addressed nothing — 2 is past the
      // new end. Nearer the front it would instead address a different
      // transition. Reconciling that is a selection-semantics decision (clear,
      // or decrement) that belongs to the task owning the inspector.
      const keepSelection =
        state.selection.kind === 'transition' && state.selection.index === index
          ? ({ kind: 'none' } as const)
          : state.selection;
      set({
        ...state,
        def: { ...state.def, transitions: state.def.transitions.filter((_transition, at) => at !== index) },
        selection: keepSelection,
      });
    },
    addRule(transitionIndex, rule) {
      mapTransition(transitionIndex, (found) => ({ ...found, rules: [...found.rules, rule] }));
    },
    updateRule(transitionIndex, ruleIndex, rule) {
      mapTransition(transitionIndex, (found) => ({
        ...found,
        rules: found.rules.map((candidate, at) => (at === ruleIndex ? rule : candidate)),
      }));
    },
    removeRule(transitionIndex, ruleIndex) {
      mapTransition(transitionIndex, (found) => ({
        ...found,
        rules: found.rules.filter((_candidate, at) => at !== ruleIndex),
      }));
    },
    select(selection) {
      set({ ...state, selection });
    },
    loadDraft(draft) {
      set(draft);
    },
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
  };
}

import { useRef, useState } from 'react';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { Button, Popover, Select } from '@gisik-nokma/ui';
import { useBuilderEnv, useBuilderStore, useDraft } from './builder-context.js';

/** The From picker's value for a from-any (`'*'`) transition. The draft stores `'*'`; a state id is a ULID or a slug, never `'*'`. */
const ANY = '*';

/** The def already has a transition for exactly this pair (`validateWorkflowDef` flags a second one: "keep at most one transition per direction between a pair"). */
export function transitionExists(def: WorkflowDef, from: string, to: string): boolean {
  return def.transitions.some((transition) => transition.from === from && transition.to === to);
}

/** Why Add is off for this pair, or null when it is on. `validateWorkflowDef` has no self-loop code; the form refuses From = To for clarity. */
function refusal(def: WorkflowDef, from: string | null, to: string | null): string | null {
  if (from === null || to === null) return null;
  if (from === to) return 'Pick two different states';
  if (transitionExists(def, from, to)) return 'That transition already exists';
  return null;
}

/**
 * The "Add transition" control: a button that opens a popover with From (states plus "Any state"), To (states) and Add
 * (spec §4.4). It calls the draft's own `addTransition` and then selects the new transition so the panel shows its rules.
 * Authors only, like `AddStateButton`: the guard is the component's, so every layout that mounts it is covered.
 */
export function AddTransitionForm(props: { onAdded?: (index: number) => void }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  if (!canAuthor) return null;

  const states = draft.def.states.map((state) => ({ value: state.id, label: state.name }));
  const reason = refusal(draft.def, from, to);
  const canAdd = from !== null && to !== null && reason === null;

  const close = () => {
    setOpen(false);
    setFrom(null);
    setTo(null);
  };
  const add = () => {
    if (from === null || to === null || !canAdd) return;
    store.actions.addTransition(from, to);
    const index = store.getState().def.transitions.length - 1;
    store.actions.select({ kind: 'transition', index });
    close();
    props.onAdded?.(index);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        className="gn-add-transition__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        Add transition
      </Button>
      <Popover triggerRef={triggerRef} open={open} onClose={close} aria-label="Add transition">
        <div className="gn-add-transition">
          <div className="gn-add-transition__field">
            <span className="gn-add-transition__label">From</span>
            <Select
              options={[{ value: ANY, label: 'Any state' }, ...states]}
              value={from}
              onChange={setFrom}
              placeholder="Pick a state"
              aria-label="From"
            />
          </div>
          <div className="gn-add-transition__field">
            <span className="gn-add-transition__label">To</span>
            <Select options={states} value={to} onChange={setTo} placeholder="Pick a state" aria-label="To" />
          </div>
          {reason === null ? null : (
            <p className="gn-add-transition__reason" role="status">
              {reason}
            </p>
          )}
          <Button className="gn-add-transition__add" disabled={!canAdd} onClick={add}>
            Add
          </Button>
        </div>
      </Popover>
    </>
  );
}

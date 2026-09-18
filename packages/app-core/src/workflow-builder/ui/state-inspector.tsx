import { Button } from '@gisik-nokma/ui';
import { useBuilderEnv, useBuilderStore, useDraft } from './builder-context.js';

/**
 * The right rail's state inspector.
 *
 * ## Two shared components, adopted here rather than re-spelled
 *
 * The name field was a bare `<input>` with no class, so it rendered with
 * user-agent defaults; the two actions were bare `<button>`s, likewise. Both
 * now come from the shared layer — `.gn-field`/`.gn-field__label`/
 * `.gn-field__input` for the field (the same three `passkeys-section.tsx:114-120`
 * and `profile-section.tsx:40-46` use, so this input inherits the measured
 * contrast pair and the `[data-style="neo"]` sunken override for free) and
 * `<Button>` for the actions, with `variant="danger"` on the destructive one —
 * the precedent `fields-editor.tsx:64` set for exactly this action on the
 * sibling builder screen.
 *
 * ## What the prototype draws here that is NOT built
 *
 * `isBuilder`'s right card (`desktop.dc.html@6d7b67c0a52c:1080-1090`) shows
 * State name + a Category `<select>` + a "Blocks the ticket" toggle + an
 * "Initial state" toggle + Delete, as one consolidated panel. Only the name
 * field and Delete are real *here*: Category and Blocked live on the STATE NODE
 * on the canvas (`state-node.tsx:29-57`), and "initial state" is this button,
 * not a switch. `docs/hig-reconciliation-audit.md:703-708` already ruled that
 * card "SHOWN BUT DOES NOT EXIST. Do not build", and moving those two controls
 * into this panel would be a product change to a tested layout, not a design
 * fit. The two toggles and the select stay named absences.
 */
export function StateInspector(props: { stateId: string }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const state = draft.def.states.find((candidate) => candidate.id === props.stateId);
  if (state === undefined) return null;
  return (
    <section className="state-inspector">
      <h3 className="state-inspector__title">State</h3>
      <label className="gn-field">
        <span className="gn-field__label">State name</span>
        <input
          type="text"
          aria-label="State name"
          className="gn-field__input"
          disabled={!canAuthor}
          value={state.name}
          onChange={(changeEvent) => store.actions.renameState(state.id, changeEvent.target.value)}
        />
      </label>
      {canAuthor ? (
        <div className="state-inspector__actions">
          <Button
            disabled={draft.def.initialStateId === state.id}
            onClick={() => store.actions.setInitialState(state.id)}
          >
            Set as start
          </Button>
          <Button variant="danger" onClick={() => store.actions.removeState(state.id)}>
            Delete state
          </Button>
        </div>
      ) : null}
    </section>
  );
}

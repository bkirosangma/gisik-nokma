import { useBuilderEnv, useBuilderStore, useDraft } from './builder-context.js';

export function StateInspector(props: { stateId: string }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const state = draft.def.states.find((candidate) => candidate.id === props.stateId);
  if (state === undefined) return null;
  return (
    <section className="state-inspector">
      <h3 className="state-inspector__title">State</h3>
      <label className="state-inspector__field">
        <span>State name</span>
        <input
          type="text"
          aria-label="State name"
          disabled={!canAuthor}
          value={state.name}
          onChange={(changeEvent) => store.actions.renameState(state.id, changeEvent.target.value)}
        />
      </label>
      {canAuthor ? (
        <div className="state-inspector__actions">
          <button
            type="button"
            disabled={draft.def.initialStateId === state.id}
            onClick={() => store.actions.setInitialState(state.id)}
          >
            Set as start
          </button>
          <button type="button" onClick={() => store.actions.removeState(state.id)}>
            Delete state
          </button>
        </div>
      ) : null}
    </section>
  );
}

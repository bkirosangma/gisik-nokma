import { useDraft } from './builder-context.js';
import { StateInspector } from './state-inspector.js';
import { TransitionInspector } from './transition-inspector.js';

export function InspectorPanel() {
  const draft = useDraft();
  if (draft.selection.kind === 'state') return <StateInspector stateId={draft.selection.stateId} />;
  if (draft.selection.kind === 'transition') return <TransitionInspector index={draft.selection.index} />;
  return <p className="inspector-panel__hint">Select a state or a transition to edit it.</p>;
}

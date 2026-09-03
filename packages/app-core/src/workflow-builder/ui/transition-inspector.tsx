import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.js';
import { summarizeRule } from '../summaries.js';
import { AddRuleMenu } from './rule-editors/add-rule-menu.js';

export function TransitionInspector(props: { index: number }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const transition = draft.def.transitions[props.index];
  if (transition === undefined) return null;
  const fromName = transition.from === '*' ? 'Any state' : summaryCtx.stateName(transition.from);
  const toName = summaryCtx.stateName(transition.to);
  return (
    <section className="transition-inspector">
      <h3 className="transition-inspector__title">{`From ${fromName} to ${toName}`}</h3>
      <ul className="transition-inspector__rules">
        {transition.rules.map((rule, ruleIndex) => (
          <li className="transition-inspector__rule" key={ruleIndex}>
            <span className="transition-inspector__rule-summary">{summarizeRule(rule, summaryCtx)}</span>
            {canAuthor ? (
              <button
                type="button"
                aria-label="Remove rule"
                onClick={() => store.actions.removeRule(props.index, ruleIndex)}
              >
                Remove rule
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canAuthor ? (
        <div className="transition-inspector__actions">
          <AddRuleMenu transitionIndex={props.index} />
          <button type="button" onClick={() => store.actions.removeTransition(props.index)}>
            Delete transition
          </button>
        </div>
      ) : null}
    </section>
  );
}

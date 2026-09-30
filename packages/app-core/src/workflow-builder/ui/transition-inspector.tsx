import { Button } from '@gisik-nokma/ui';
import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.js';
import { summarizeRule } from '../summaries.js';
import { AddRuleMenu } from './rule-editors/add-rule-menu.js';
import { RuleEditor } from './rule-editors/rule-editor.js';

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
              <Button
                variant="danger"
                className="builder-quiet-danger"
                aria-label="Remove rule"
                onClick={() => store.actions.removeRule(props.index, ruleIndex)}
              >
                Remove rule
              </Button>
            ) : null}
            {canAuthor ? (
              <RuleEditor transitionIndex={props.index} ruleIndex={ruleIndex} rule={rule} />
            ) : null}
          </li>
        ))}
      </ul>
      {canAuthor ? (
        <div className="transition-inspector__actions">
          <AddRuleMenu transitionIndex={props.index} />
          <Button variant="danger" className="builder-quiet-danger" onClick={() => store.actions.removeTransition(props.index)}>
            Delete transition
          </Button>
        </div>
      ) : null}
    </section>
  );
}

import type { Rule } from '@gisik-nokma/domain';
import { selectInboundTargetIds } from '../../draft-store.js';
import { useBuilderStore, useDraft, useSummaryCtx } from '../builder-context.js';

type RequireDifferentUser = Extract<Rule, { kind: 'require-different-user' }>;

export function RequireDifferentUserEditor(props: {
  transitionIndex: number;
  ruleIndex: number;
  rule: RequireDifferentUser;
}) {
  const store = useBuilderStore();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const target = props.rule.thanActorOf.to;
  const targetIds = selectInboundTargetIds(draft.def);
  const known = targetIds.includes(target);
  return (
    <div className="require-different-user-editor">
      <label>
        <span>Earlier move</span>
        <select
          aria-label="Earlier move"
          value={known ? target : ''}
          onChange={(changeEvent) =>
            store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
              kind: 'require-different-user',
              thanActorOf: { to: changeEvent.target.value },
            })
          }
        >
          {known ? null : <option value="" disabled hidden></option>}
          {targetIds.map((stateId) => (
            <option key={stateId} value={stateId}>
              {`the move to "${summaryCtx.stateName(stateId)}"`}
            </option>
          ))}
        </select>
      </label>
      {target === draft.def.initialStateId ? (
        <p className="require-different-user-editor__start-note">
          {`A ticket born in the start state has nobody to differ from — this rule only bites once the move to "${summaryCtx.stateName(target)}" has actually been performed.`}
        </p>
      ) : null}
    </div>
  );
}

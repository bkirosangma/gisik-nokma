import type { Rule } from '@gisik-nokma/domain';
import { Select } from '@gisik-nokma/ui';
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
      <span>Earlier move</span>
      <Select
        options={targetIds.map((stateId) => ({
          value: stateId,
          label: `the move to "${summaryCtx.stateName(stateId)}"`,
        }))}
        value={known ? target : null}
        onChange={(next) =>
          store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
            kind: 'require-different-user',
            thanActorOf: { to: next },
          })
        }
        aria-label="Earlier move"
      />
      {target === draft.def.initialStateId ? (
        <p className="require-different-user-editor__start-note">
          {`A ticket born in the start state has nobody to differ from. This rule only bites once the move to "${summaryCtx.stateName(target)}" has actually been performed.`}
        </p>
      ) : null}
    </div>
  );
}

import type { Rule } from '@gisik-nokma/domain';
import { fieldChoicesFor } from '../../fields.js';
import { useBuilderEnv, useBuilderStore, useDraft } from '../builder-context.js';

type RequireField = Extract<Rule, { kind: 'require-field' }>;

/**
 * Picker-only by design: a free-typed field id would author a rule that can
 * never legally fire — a lie factory (design decision 3).
 */
export function RequireFieldEditor(props: { transitionIndex: number; ruleIndex: number; rule: RequireField }) {
  const store = useBuilderStore();
  const { ticketTypes } = useBuilderEnv();
  const draft = useDraft();
  const boundTypes = ticketTypes.filter((type) => type.workflowId === draft.def.id);
  const choices = fieldChoicesFor(boundTypes);
  const known = choices.some((choice) => choice.id === props.rule.field);
  return (
    <div className="require-field-editor">
      <label>
        <span>Field</span>
        <select
          aria-label="Field"
          value={known ? props.rule.field : ''}
          onChange={(changeEvent) =>
            store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
              kind: 'require-field',
              field: changeEvent.target.value,
            })
          }
        >
          {known ? null : <option value="" disabled hidden></option>}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.source === 'Built-in' ? choice.name : `${choice.name} (${choice.source})`}
            </option>
          ))}
        </select>
      </label>
      {known ? null : (
        <p className="require-field-editor__unknown-warning">
          This field is not on any ticket type bound to this workflow.
        </p>
      )}
    </div>
  );
}

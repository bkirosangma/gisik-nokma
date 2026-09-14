import type { Rule } from '@gisik-nokma/domain';
import { Select } from '@gisik-nokma/ui';
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
      <span>Field</span>
      <Select
        options={choices.map((choice) => ({
          value: choice.id,
          label: choice.source === 'Built-in' ? choice.name : `${choice.name} (${choice.source})`,
        }))}
        value={known ? props.rule.field : null}
        onChange={(next) =>
          store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
            kind: 'require-field',
            field: next,
          })
        }
        aria-label="Field"
      />
      {known ? null : (
        <p className="require-field-editor__unknown-warning">
          This field is not on any ticket type bound to this workflow.
        </p>
      )}
    </div>
  );
}

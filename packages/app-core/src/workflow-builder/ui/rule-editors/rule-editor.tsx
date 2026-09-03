import type { Rule } from '@gisik-nokma/domain';
import { RestrictToEditor } from './restrict-to-editor.js';
import { RequireFieldEditor } from './require-field-editor.js';
import { RequireDifferentUserEditor } from './require-different-user-editor.js';

/** require-comment and require-evidence have nothing to configure — their summary row is the whole story. */
export function RuleEditor(props: { transitionIndex: number; ruleIndex: number; rule: Rule }) {
  switch (props.rule.kind) {
    case 'restrict-to':
      return <RestrictToEditor transitionIndex={props.transitionIndex} ruleIndex={props.ruleIndex} rule={props.rule} />;
    case 'require-field':
      return <RequireFieldEditor transitionIndex={props.transitionIndex} ruleIndex={props.ruleIndex} rule={props.rule} />;
    case 'require-different-user':
      return (
        <RequireDifferentUserEditor transitionIndex={props.transitionIndex} ruleIndex={props.ruleIndex} rule={props.rule} />
      );
    case 'require-comment':
    case 'require-evidence':
      return null;
  }
}

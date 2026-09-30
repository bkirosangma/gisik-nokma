import { useState } from 'react';
import type { Rule, WorkflowDef } from '@gisik-nokma/domain';
import { selectInboundTargetIds } from '../../draft-store.js';
import { useBuilderStore, useDraft } from '../builder-context.js';

const RULE_MENU: { kind: Rule['kind']; label: string }[] = [
  { kind: 'restrict-to', label: 'Restrict who may move it' },
  { kind: 'require-comment', label: 'Require a comment' },
  { kind: 'require-evidence', label: 'Require evidence (attachment)' },
  { kind: 'require-field', label: 'Require a field to be set' },
  { kind: 'require-different-user', label: 'Require a different user (four eyes)' },
];

/** Honest defaults: never an empty restrict-to, never a dangling reference where one exists to point at. */
export function defaultRuleFor(kind: Rule['kind'], def: WorkflowDef): Rule {
  switch (kind) {
    case 'restrict-to':
      return { kind: 'restrict-to', assignee: true };
    case 'require-comment':
      return { kind: 'require-comment' };
    case 'require-evidence':
      return { kind: 'require-evidence' };
    case 'require-field':
      return { kind: 'require-field', field: 'dueDate' };
    case 'require-different-user': {
      const firstTarget = selectInboundTargetIds(def)[0] ?? def.initialStateId;
      return { kind: 'require-different-user', thanActorOf: { to: firstTarget } };
    }
  }
}

export function AddRuleMenu(props: { transitionIndex: number }) {
  const store = useBuilderStore();
  const draft = useDraft();
  const [open, setOpen] = useState(false);
  return (
    <div className="add-rule-menu">
      <button
        type="button"
        className="add-rule-menu__trigger"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Add rule
      </button>
      {/* exec1 P22: a `menu` is a name-requiring role and this one had none.
          The words are the trigger's own (`:44`, "Add rule"), so the control and
          the set it opens read as one thing rather than as an unnamed group a
          screen reader can only call "menu". */}
      {open ? (
        <ul className="add-rule-menu__list" role="menu" aria-label="Add rule">
          {RULE_MENU.map((entry) => (
            <li key={entry.kind}>
              <button
                type="button"
                role="menuitem"
                className="add-rule-menu__item"
                onClick={() => {
                  store.actions.addRule(props.transitionIndex, defaultRuleFor(entry.kind, draft.def));
                  setOpen(false);
                }}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

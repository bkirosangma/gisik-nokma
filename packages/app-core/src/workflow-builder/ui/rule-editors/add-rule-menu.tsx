import { useRef, useState, type KeyboardEvent } from 'react';
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  /**
   * What a `role="menu"` promises (polish 2, 2026-10-01 — the controller's browser pass: two Escape presses left it
   * open with focus on an item). Escape closes it and puts focus back on the trigger; the press is CONSUMED
   * (`preventDefault` is the contract `Dialog` and `Sheet` document, `stopPropagation` keeps anything above from also acting),
   * and only while the menu is open — a closed menu returns before touching the event, so the next Escape reaches whatever
   * else is open. ArrowDown/ArrowUp step between the items (wrapping), Home and End jump to the ends; from the trigger the two arrows enter the open menu.
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    // Opening leaves focus on the trigger, so the two arrows ENTER the open menu from there (ArrowDown at the first item,
    // ArrowUp at the last) — deliberately, not as a side effect of `at` being -1. Anything else from the trigger (Home and
    // End are the page's there) and any key from outside the menu and its trigger is left alone.
    const onTrigger = document.activeElement === triggerRef.current;
    if (at < 0 && !onTrigger) return;
    const target = onTrigger
      ? event.key === 'ArrowDown' ? items[0]
        : event.key === 'ArrowUp' ? items[items.length - 1]
        : undefined
      : event.key === 'ArrowDown' ? items[(at + 1) % items.length]
      : event.key === 'ArrowUp' ? items[(at - 1 + items.length) % items.length]
      : event.key === 'Home' ? items[0]
      : event.key === 'End' ? items[items.length - 1]
      : undefined;
    if (target === undefined) return;
    event.preventDefault();
    target.focus();
  }

  return (
    <div className="add-rule-menu" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
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
        <ul ref={listRef} className="add-rule-menu__list" role="menu" aria-label="Add rule">
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

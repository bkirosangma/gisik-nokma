'use client';

import type { GroupRow } from '@gisik-nokma/domain';
import { GroupPicker, type GroupChoice } from './group-picker.js';

/** What a door refusal says, split out so a screen can hand it to the form. */
export type EditRefusal = { rule: string; reason: string };

/** The field a refusal is ABOUT, or `null` when it belongs to the whole act (shown by the screen). */
export function refusalField(rule: string): 'prefix' | 'group' | null {
  if (rule === 'project.prefix-reserved' || rule === 'project.prefix-taken') return 'prefix';
  if (rule.startsWith('group.')) return 'group';
  return null;
}

/**
 * The "Group (optional)" field every project form shares (prefixes and groups plan Task 10 for the Edit form,
 * P-T13 for the Create project dialog): the four-level `GroupPicker` and, under it, the door's reason when the
 * refusal is ABOUT the group (`refusalField(rule) === 'group'`, shown verbatim, 22.181). One component, so the
 * two forms cannot describe the same field two ways. `className` is the caller's field wrapper (the Edit form's
 * `gn-project-edit__field`); `idPrefix` keeps two open forms' ids apart.
 */
export function ProjectGroupField({
  groups,
  value,
  onChange,
  disabled,
  idPrefix,
  refusal,
  className,
}: {
  groups: GroupRow[];
  value: GroupChoice;
  onChange: (choice: GroupChoice) => void;
  disabled: boolean;
  idPrefix: string;
  refusal: EditRefusal | null;
  className?: string;
}) {
  const showRefusal = refusal !== null && refusalField(refusal.rule) === 'group';
  return (
    <div className={['gn-field', className].filter(Boolean).join(' ')}>
      <span className="gn-field__label">Group (optional)</span>
      <GroupPicker groups={groups} value={value} onChange={onChange} disabled={disabled} idPrefix={idPrefix} />
      {showRefusal ? (
        <p id={`${idPrefix}-group-refusal`} role="alert" className="gn-project-edit__hint gn-refusal gn-refusal--server">
          {refusal.reason}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a project form does with a door refusal (22.181 / 22.187): a refusal ABOUT a field (`prefix`, `group`) is
 * kept by the form and shown under that field, so the page does not say it twice (`true`); every other rule is
 * the page's own line (`false`). A `group.name-taken` also re-reads the groups, so the picker can adopt the group
 * someone else made first; nothing is resubmitted. The Edit form and the Create project dialog both use THIS.
 *
 * `owns` is the fields the calling form DRAWS a refusal for: the Create project dialog has a slot under the
 * group picker and none under its prefix box, so it owns `group` only and a `project.prefix-taken` stays the
 * dialog's own alert line (22.156) instead of being claimed and shown nowhere.
 */
export function fieldRefusalHandler(
  keep: (refusal: EditRefusal) => void,
  reread: () => void,
  owns: readonly ('prefix' | 'group')[] = ['prefix', 'group'],
): (rule: string, reason: string) => boolean {
  return (rule, reason) => {
    const field = refusalField(rule);
    if (field === null || !owns.includes(field)) return false;
    keep({ rule, reason });
    if (rule === 'group.name-taken') reread();
    return true;
  };
}

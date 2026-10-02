'use client';

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Button } from '@gisik-nokma/ui';
import { prefixSchema, type GroupRow } from '@gisik-nokma/domain';
import { GroupPicker, type GroupChoice } from './group-picker.js';
import { PrefixChangeConfirm } from './prefix-change-confirm.js';

export interface ProjectEditValues {
  name: string;
  description: string;
  /** Upper-cased, 1 to 3 letters — a value the form has already checked. */
  prefix: string;
  group: GroupChoice;
}

/** What a door refusal says, split out so a screen can hand it to the form. */
export type EditRefusal = { rule: string; reason: string };

/** The field a refusal is ABOUT, or `null` when it belongs to the whole act (shown by the screen). */
export function refusalField(rule: string): 'prefix' | 'group' | null {
  if (rule === 'project.prefix-reserved' || rule === 'project.prefix-taken') return 'prefix';
  if (rule.startsWith('group.')) return 'group';
  return null;
}

/**
 * The inline form behind every project "Edit" (MCP CRUD plan Task 2; prefixes and groups plan Task 10):
 * the workspace home's card and the project page's header render THIS, so the two screens cannot
 * describe one act two ways.
 *
 * - **Name, description, prefix and group.** The prefix upper-cases as it is typed (as the founding
 *   form's box does) and must be 1 to 3 letters; the group is the four-level `GroupPicker`, offered
 *   once the screen has the workspace's groups (`groups`, `null` = no list, so no field and the group
 *   is left as it was).
 * - **A changed prefix asks first** (`PrefixChangeConfirm`, 22.180): it re-keys every ticket in the
 *   project. Keep closes the question and leaves the form open; only Change prefix reaches `onSave`.
 *   A group-only change, or a prefix typed back to what it was, asks nothing (22.182, 22.186).
 * - **ONE primary** (`Save`); `Cancel` is the quiet secondary. Both are the shared `Button`, so the 44 px
 *   target comes from it; the inputs are the shared recessed field (`gn-field__input`).
 * - **A blank name is refused HERE and not sent**, and the form says why: the domain's `displayName`
 *   would refuse it anyway, so sending one only spends a round trip to be told what this form already
 *   knows. The description is optional and may be emptied — that is how it is cleared.
 * - **Escape cancels**, handled on the form because focus may be on Save or Cancel by the time a person
 *   changes their mind. Enter saves natively (the picker keeps its own Enter and Escape).
 * - **It owns no submission.** `onSave` hands the values to the screen, which decides what to send and
 *   when to close; a refused save therefore leaves the form open with the typed values. The door's
 *   reason arrives as `refusal`: a prefix or group rule is shown under ITS field, verbatim (22.181),
 *   and any other rule is left to the screen's own refusal slot.
 * - **Focus returns** to `returnFocusRef` (the Edit trigger) when the form goes away, however it goes,
 *   so a keyboard user is not dropped at the page top.
 */
export function ProjectEditForm({
  idPrefix,
  initial,
  workspacePrefix,
  groups,
  refusal = null,
  busy,
  onSave,
  onCancel,
  returnFocusRef,
}: {
  idPrefix: string;
  initial: { name: string; description: string | null; prefix: string; groupId: string | null };
  /** The workspace's half of every key, for the confirmation's `CCSO` → `CCSH`. */
  workspacePrefix: string;
  groups: GroupRow[] | null;
  refusal?: EditRefusal | null;
  busy: boolean;
  onSave: (values: ProjectEditValues) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [prefix, setPrefix] = useState(initial.prefix);
  const [group, setGroup] = useState<GroupChoice>({ groupId: initial.groupId, pendingNames: [] });
  const [confirming, setConfirming] = useState(false);
  const blank = name.trim() === '';
  const prefixOk = prefixSchema.safeParse(prefix.trim().toUpperCase()).success;
  const nameId = `${idPrefix}-edit-name`;
  const hintId = `${idPrefix}-edit-name-hint`;
  const descriptionId = `${idPrefix}-edit-description`;
  const prefixId = `${idPrefix}-edit-prefix`;
  const prefixHintId = `${idPrefix}-edit-prefix-hint`;
  const prefixRefusalId = `${idPrefix}-edit-prefix-refusal`;
  const groupRefusalId = `${idPrefix}-edit-group-refusal`;
  const field = refusal === null ? null : refusalField(refusal.rule);
  const prefixDescribedBy = [!prefixOk ? prefixHintId : null, field === 'prefix' ? prefixRefusalId : null]
    .filter((id): id is string => id !== null)
    .join(' ');

  const focusTarget = useRef(returnFocusRef);
  focusTarget.current = returnFocusRef;
  useEffect(
    () => () => {
      focusTarget.current?.current?.focus();
    },
    [],
  );

  const values = (): ProjectEditValues => ({
    name,
    description,
    prefix: prefix.trim().toUpperCase(),
    group,
  });

  const send = (event: FormEvent): void => {
    event.preventDefault();
    if (blank || !prefixOk || busy) return;
    // Re-keying is asked about, not assumed; anything else goes straight through.
    if (prefix.trim().toUpperCase() !== initial.prefix) {
      setConfirming(true);
      return;
    }
    onSave(values());
  };

  const nextPrefix = prefix.trim().toUpperCase();
  return (
    <>
      <form
        className="gn-project-edit"
        aria-label="Edit project"
        onSubmit={send}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        <div className="gn-field gn-project-edit__field">
          <label className="gn-field__label" htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            className="gn-field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={blank ? 'true' : undefined}
            aria-describedby={blank ? hintId : undefined}
            autoFocus
          />
          {blank ? (
            <p id={hintId} className="gn-project-edit__hint">
              A project needs a name.
            </p>
          ) : null}
        </div>
        <div className="gn-field gn-project-edit__field">
          <label className="gn-field__label" htmlFor={descriptionId}>
            Description (optional)
          </label>
          <input
            id={descriptionId}
            className="gn-field__input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="gn-field gn-project-edit__field">
          <label className="gn-field__label" htmlFor={prefixId}>
            Prefix
          </label>
          <input
            id={prefixId}
            className="gn-field__input"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value.toUpperCase())}
            aria-invalid={!prefixOk || field === 'prefix' ? 'true' : undefined}
            aria-describedby={prefixDescribedBy === '' ? undefined : prefixDescribedBy}
          />
          {!prefixOk ? (
            <p id={prefixHintId} className="gn-project-edit__hint">
              A prefix is 1 to 3 letters.
            </p>
          ) : null}
          {field === 'prefix' && refusal !== null ? (
            <p id={prefixRefusalId} role="alert" className="gn-project-edit__hint gn-refusal gn-refusal--server">
              {refusal.reason}
            </p>
          ) : null}
        </div>
        {groups !== null ? (
          <div className="gn-field gn-project-edit__field">
            <span className="gn-field__label">Group (optional)</span>
            <GroupPicker groups={groups} value={group} onChange={setGroup} disabled={busy} idPrefix={`${idPrefix}-edit`} />
            {field === 'group' && refusal !== null ? (
              <p id={groupRefusalId} role="alert" className="gn-project-edit__hint gn-refusal gn-refusal--server">
                {refusal.reason}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="gn-project-edit__actions">
          <Button variant="primary" type="submit" disabled={busy || blank || !prefixOk}>
            Save
          </Button>
          <Button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
      {confirming ? (
        <PrefixChangeConfirm
          from={`${workspacePrefix}${initial.prefix}`}
          to={`${workspacePrefix}${nextPrefix}`}
          onConfirm={() => {
            setConfirming(false);
            onSave(values());
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}

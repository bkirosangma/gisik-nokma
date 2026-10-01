'use client';

import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Button } from '@gisik-nokma/ui';

export interface ProjectEditValues {
  name: string;
  description: string;
}

/**
 * The inline form behind every project "Edit" (MCP CRUD plan Task 2): the
 * workspace home's card and the project page's header render THIS, so the two
 * screens cannot describe one act two ways.
 *
 * - **Name and description only.** The prefix is immutable after creation and
 *   is not offered (`projectUpdatedPayload` refuses the key).
 * - **ONE primary** (`Save`); `Cancel` is the quiet secondary. Both are the
 *   shared `Button`, so the 44 px target comes from it; the inputs are the
 *   shared recessed field (`gn-field__input`).
 * - **A blank name is refused HERE and not sent**, and the form says why: the
 *   domain's `displayName` would refuse it anyway, so sending one only spends a
 *   round trip to be told what this form already knows. The description is
 *   optional and may be emptied — that is how it is cleared.
 * - **Escape cancels**, handled on the form because focus may be on Save or
 *   Cancel by the time a person changes their mind. Enter saves natively.
 * - **It owns no submission.** `onSave` hands the values to the screen, which
 *   decides what to send and when to close; a refused save therefore leaves the
 *   form open with the typed values, and the screen shows the server's reason in
 *   its own refusal slot.
 * - **Focus returns** to `returnFocusRef` (the Edit trigger) when the form goes
 *   away, however it goes, so a keyboard user is not dropped at the page top.
 */
export function ProjectEditForm({
  idPrefix,
  initial,
  busy,
  onSave,
  onCancel,
  returnFocusRef,
}: {
  idPrefix: string;
  initial: { name: string; description: string | null };
  busy: boolean;
  onSave: (values: ProjectEditValues) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const blank = name.trim() === '';
  const nameId = `${idPrefix}-edit-name`;
  const hintId = `${idPrefix}-edit-name-hint`;
  const descriptionId = `${idPrefix}-edit-description`;

  const focusTarget = useRef(returnFocusRef);
  focusTarget.current = returnFocusRef;
  useEffect(
    () => () => {
      focusTarget.current?.current?.focus();
    },
    [],
  );

  const send = (event: FormEvent): void => {
    event.preventDefault();
    if (blank || busy) return;
    onSave({ name, description });
  };

  return (
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
      <div className="gn-project-edit__actions">
        <Button variant="primary" type="submit" disabled={busy || blank}>
          Save
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

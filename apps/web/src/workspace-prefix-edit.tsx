'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { EnvelopeSeed } from '@gisik-nokma/app-core';
import { prefixSchema } from '@gisik-nokma/domain';
import { Button } from '@gisik-nokma/ui';
import { PrefixChangeConfirm } from './prefix-change-confirm.js';

/**
 * The workspace header's "Edit prefix" (prefixes and groups plan Task 10, case 22.185): the workspace's
 * half of every ticket key (`CC` in `CCSO-12`). Offered to owners and admins only — the caller gates it
 * with `mayAdminister`, the expression the server's `ADMIN_ONLY_TYPES` answers independently, so a hidden
 * control is a courtesy and the door is the enforcement.
 *
 * The prefix upper-cases as typed and must be 1 to 3 letters. A changed prefix asks first
 * (`PrefixChangeConfirm`, `CC` → `CX`: every key in the workspace is re-read, old ones keep working) and
 * only then submits ONE `workspace.prefix_changed`; the old value, or a form with nothing changed, sends
 * nothing. A refusal is shown under the field, verbatim, and the form stays open on the typed value.
 *
 * **It owns no submission**, like `ProjectEditForm`: `onSubmit` is the workspace home's one `submit`
 * (actor id, results-as-a-list, the re-read), and the third argument claims a refusal for this form's
 * own slot so the page does not say it twice.
 */
export function WorkspacePrefixEdit({
  workspaceId,
  prefix,
  busy,
  onSubmit,
}: {
  workspaceId: string;
  prefix: string;
  busy: boolean;
  onSubmit: (
    build: (actorId: string) => EnvelopeSeed[],
    whenDone: () => void,
    onRefused: (rule: string, reason: string) => boolean,
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prefix);
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const next = draft.trim().toUpperCase();
  const valid = prefixSchema.safeParse(next).success;

  // Focus goes back to the trigger when the form goes away, however it goes.
  useEffect(() => {
    if (wasEditing.current && !editing) trigger.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const open = (): void => {
    setDraft(prefix);
    setRefusal(null);
    setEditing(true);
  };

  const send = (event: FormEvent): void => {
    event.preventDefault();
    if (!valid || busy) return;
    if (next === prefix) {
      setEditing(false); // nothing changed, nothing to send
      return;
    }
    setConfirming(true);
  };

  const submit = (): void => {
    setConfirming(false);
    setRefusal(null);
    onSubmit(
      () => [
        {
          workspaceId,
          entity: { kind: 'workspace', id: workspaceId },
          type: 'workspace.prefix_changed',
          payload: { prefix: next },
        },
      ],
      () => setEditing(false),
      (_rule, reason) => {
        setRefusal(reason);
        return true;
      },
    );
  };

  if (!editing) {
    return (
      <Button ref={trigger} type="button" className="gn-workspace-prefix-edit__trigger" disabled={busy} onClick={open}>
        Edit prefix
      </Button>
    );
  }
  return (
    <>
      <form
        className="gn-workspace-prefix-edit"
        aria-label="Edit workspace prefix"
        onSubmit={send}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setEditing(false);
          }
        }}
      >
        <label className="gn-field__label" htmlFor="workspace-prefix">
          Workspace prefix
        </label>
        <input
          id="workspace-prefix"
          className="gn-field__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          aria-invalid={!valid || refusal !== null ? 'true' : undefined}
          aria-describedby={!valid ? 'workspace-prefix-hint' : refusal !== null ? 'workspace-prefix-refusal' : undefined}
          autoFocus
        />
        <Button variant="primary" type="submit" disabled={busy || !valid}>
          Save prefix
        </Button>
        <Button type="button" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {!valid ? (
          <p id="workspace-prefix-hint" className="gn-project-edit__hint">
            A prefix is 1 to 3 letters.
          </p>
        ) : null}
        {refusal !== null ? (
          <p id="workspace-prefix-refusal" role="alert" className="gn-refusal gn-refusal--server">
            {refusal}
          </p>
        ) : null}
      </form>
      {confirming ? <PrefixChangeConfirm from={prefix} to={next} onConfirm={submit} onCancel={() => setConfirming(false)} /> : null}
    </>
  );
}

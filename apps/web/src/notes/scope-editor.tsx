'use client';

import { useEffect, useRef, useState } from 'react';
import type { NoteDetail, NoteScopeMode } from '@gisik-nokma/domain';
import { makeSubmittedFactory, PeoplePicker } from '@gisik-nokma/app-core';
import type { RosterMember } from '@gisik-nokma/app-core';
import { Button, Popover, Select } from '@gisik-nokma/ui';
import { useAppServices, useCurrentUser } from '../providers.js';
import { SCOPE_LABELS, scopeOptions } from './note-scope-options.js';

/**
 * The byline's scope chip and the editor behind it (spec §9.3, §9.6).
 *
 * ## A reader gets TEXT, not a disabled chip
 *
 * `canEdit` is the caller's answer (§9.6's `isAuthor || isAdminReader ||
 * isOwner`), and when it is false this renders a `<span>` carrying the mode's
 * name — not a `Button` with `disabled`. A disabled control still says "there is
 * something to do here and you may not do it", which is a claim about the
 * viewer's rights that an owner reading the same screen would contradict. Static
 * text claims nothing. 18.195's control arm asserts the element is not a
 * button, because a `disabled` button would satisfy every other assertion in it.
 *
 * ## Why `explicit` drafts and every other mode writes on choose
 *
 * The other four modes are each one value, so choosing IS the claim. `explicit`
 * is a SET, and the first checkbox is not the audience — so the picker is
 * drafted locally and a Save submits it. Without that split, picking three
 * people would file three `note.scope_set` events, the first two naming
 * audiences nobody meant.
 *
 * The draft is also why the Select is controlled by local state rather than by
 * `note.scope.mode`: a control bound to the note cannot SHOW `explicit` before
 * the note has said it, so the picker would never reveal.
 *
 * ## Why `inherit` is conditional HERE for a different reason than the dialog
 *
 * The dialog's rule is "was this opened from a ticket". This one's is the note's
 * own STATE: `inherit` on an existing note is legal exactly while it has at
 * least one attachment (`note-state.ts`), which is a fact only the note carries
 * (18.196).
 */
export function ScopeEditor({
  note,
  members,
  canEdit,
  onChanged,
}: {
  note: NoteDetail;
  members: RosterMember[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<NoteScopeMode>(note.scope.mode);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const mode = note.scope.mode;
  const attached = note.attachedTickets.length > 0;
  const choices = scopeOptions(
    { workspaceId: note.workspaceId, projectId: note.homeProjectId },
    // `inherit` exists exactly when an attachment does. Every attached ticket of
    // a note is in the note's own workspace by construction, so handing the
    // first one over is what makes the option reachable rather than a way around
    // that function's workspace check.
    attached ? { workspaceId: note.workspaceId } : undefined,
  );

  // The draft follows the NOTE whenever the note changes under us (a live query
  // lands, or our own write commits) — but only once the editor is closed, so a
  // re-render mid-choice cannot yank the Select back to the standing value.
  useEffect(() => {
    if (open) return;
    setDraftMode(note.scope.mode);
    setUserIds(note.scope.mode === 'explicit' ? note.scope.userIds : []);
  }, [note.scope, open]);

  if (!canEdit) {
    return (
      <span className="gn-notes__scope" data-testid="note-scope">
        {SCOPE_LABELS[mode]}
      </span>
    );
  }

  async function write(next: { mode: NoteScopeMode; userIds?: string[] }): Promise<void> {
    if (user === null) return;
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    const event = make({
      workspaceId: note.workspaceId,
      entity: { kind: 'note', id: note.noteId },
      type: 'note.scope_set',
      // FLAT: `noteScopeSetPayload` IS the scope. Only `note.created` carries it
      // under a `scope` key — nesting it here made the door answer
      // `invalid-payload` for every change (case 18.430).
      payload:
        next.mode === 'explicit'
          ? { mode: next.mode, userIds: next.userIds ?? [] }
          : { mode: next.mode },
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      setFailure('The server did not answer this change.');
      return;
    }
    if (result.status === 'committed') {
      setFailure(null);
      onChanged();
      setOpen(false);
      return;
    }
    setFailure(result.status === 'refused' ? result.reason : result.message);
  }

  return (
    <span className="gn-notes__scope-wrap" ref={triggerRef}>
      <Button
        className="gn-notes__scope"
        data-testid="note-scope"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {SCOPE_LABELS[mode]}
      </Button>
      <Popover
        triggerRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        aria-label="Change who can see this note"
      >
        <div className="gn-notes__scope-editor">
          <Select
            options={choices}
            value={draftMode}
            aria-label="Scope"
            onChange={(value) => {
              const next = value as NoteScopeMode;
              setDraftMode(next);
              // The ONE mode that does not write on choose: the audience is not
              // chosen yet. The picker below gathers it and Save submits it.
              if (next === 'explicit') return;
              void write({ mode: next });
            }}
          />

          {draftMode === 'explicit' ? (
            <>
              <PeoplePicker
                members={members}
                selected={userIds}
                onToggle={toggle}
                legend="Who can see it"
              />
              <Button
                variant="primary"
                disabled={userIds.length === 0}
                onClick={() => void write({ mode: 'explicit', userIds })}
              >
                Save audience
              </Button>
            </>
          ) : null}

          {failure !== null ? (
            <p className="gn-notes__scope-failure" role="status">
              {failure}
            </p>
          ) : null}
        </div>
      </Popover>
    </span>
  );

  function toggle(userId: string): void {
    setUserIds((chosen) =>
      chosen.includes(userId) ? chosen.filter((id) => id !== userId) : [...chosen, userId],
    );
  }
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { NoteScopeMode } from '@gisik-nokma/domain';
import { newUlid } from '@gisik-nokma/domain';
import { makeSubmittedFactory, PeoplePicker } from '@gisik-nokma/app-core';
import type { RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import { Button, Dialog, Select } from '@gisik-nokma/ui';
import { useAppServices, useCurrentUser } from '../providers.js';
import { SCOPE_LABELS, homeOptions, homeValue, parseHome, scopeOptions, type HomeRef } from './note-scope-options.js';

/**
 * Create a note anywhere you belong (spec §9.3; D3).
 *
 * ## What this dialog can and cannot author
 *
 * Two of the five scopes are conditional and the conditions come from the
 * DOMAIN's own refusals, not from taste (`noteCreatedPayload`'s two refines): a
 * `project` scope needs a project home, and `inherit` needs a ticket to inherit
 * from. Offering either where the door will refuse it is the failure this
 * dialog's option lists exist to prevent — a person would fill in a title, press
 * Create, and be told the claim was malformed by a form that offered it.
 *
 * The Home select is the second subject: a note is filed in exactly ONE
 * workspace, so the workspace chosen there is the `workspaceId` the claim is
 * filed under, and the scope options are recomputed from it. Changing the home
 * away from a project DROPS a `project` scope back to `private` rather than
 * leaving a selection the payload would refuse.
 *
 * ## The empty-workspaces arm
 *
 * A person who belongs to no workspace can reach this dialog (the page draws
 * the button, spec §9.7's empty state). It has nothing to offer, so it says so
 * instead of drawing a Home select with no options and a Create that cannot
 * succeed — the dead-control shape this repo refuses.
 */
export function CreateNoteDialog({
  open,
  onClose,
  workspaces,
  defaultHome,
  attachTicket,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  workspaces: WorkspaceRef[];
  defaultHome: HomeRef;
  attachTicket?: { workspaceId: string; ticketId: string; projectId: string };
  onCreated: (noteId: string, workspaceId: string) => void;
}) {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();

  const [title, setTitle] = useState('');
  const [home, setHome] = useState<HomeRef>(defaultHome);
  const [mode, setMode] = useState<NoteScopeMode>(attachTicket === undefined ? 'private' : 'inherit');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seeded every time it OPENS, so a dialog closed half-filled does not hand
  // the next person the last one's title and audience. Keyed on the home's and
  // the ticket's PRIMITIVES, not their objects: `NotesPage` builds `defaultHome`
  // inline, so a fresh object arrives on every page re-render (a live-list
  // refresh, another note landing) and re-seeding on identity wiped the title a
  // person was typing (case 18.433).
  const defaultWorkspaceId = defaultHome.workspaceId;
  const defaultProjectId = defaultHome.projectId;
  const attachTicketId = attachTicket?.ticketId;
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setHome(defaultHome);
    setMode(attachTicket === undefined ? 'private' : 'inherit');
    setUserIds([]);
    setFailure(null);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the primitives above
  }, [open, defaultWorkspaceId, defaultProjectId, attachTicketId]);

  const homeChoices = useMemo(() => homeOptions(workspaces), [workspaces]);
  const scopeChoices = useMemo(() => scopeOptions(home, attachTicket), [home, attachTicket]);

  // The roster is read for the CHOSEN workspace, and only when the picker can
  // actually be shown — `explicit` is the one mode that needs it, and reading it
  // on open would spend a request on every dialog a person opens by accident.
  useEffect(() => {
    if (!open || mode !== 'explicit') return;
    let cancelled = false;
    dataSource.query.getMembers(home.workspaceId).then(
      (rows) => {
        if (!cancelled) setMembers(rows);
      },
      () => {
        if (!cancelled) setMembers([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, mode, home.workspaceId, dataSource]);

  /** Dropping a scope the current home no longer allows. */
  function chooseHome(value: string): void {
    const next = parseHome(value);
    if (next === null) return;
    setHome(next);
    const allowed = scopeOptions(next, attachTicket).map((option) => option.value);
    if (!allowed.includes(mode)) setMode('private');
  }

  const titleReady = title.trim() !== '';
  const scopeReady = mode !== 'explicit' || userIds.length > 0;
  const canCreate = titleReady && scopeReady && workspaces.length > 0 && user !== null && !busy;

  async function create(): Promise<void> {
    if (!canCreate || user === null) return;
    setBusy(true);
    setFailure(null);
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    const event = make({
      workspaceId: home.workspaceId,
      entity: { kind: 'note', id: newUlid() },
      type: 'note.created',
      payload: {
        title: title.trim(),
        homeProjectId: home.projectId,
        scope: mode === 'explicit' ? { mode, userIds } : { mode },
        // Carried whenever the dialog was opened FROM a ticket, which is what
        // makes the note's origin legible later — not only in `inherit` mode.
        ...(attachTicket === undefined ? {} : { attachTicketId: attachTicket.ticketId }),
      },
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    setBusy(false);
    if (result === undefined) {
      setFailure('The server did not answer this change.');
      return;
    }
    if (result.status === 'committed') {
      onCreated(event.entity.id, home.workspaceId);
      return;
    }
    // NOT ACCEPTED: the dialog stays open with every field still filled and the
    // authority's own words beside it. Closing on a refusal is how a person
    // loses a title they had just typed.
    setFailure(result.status === 'refused' ? result.reason : result.message);
  }

  return (
    <Dialog open={open} title="New note" onClose={onClose}>
      <div className="gn-notes__dialog">
        {workspaces.length === 0 ? (
          <p className="gn-notes__dialog-empty">
            You are not in a workspace yet, so there is nowhere to file a note.
          </p>
        ) : (
          <>
            <label className="gn-notes__field">
              <span className="gn-notes__field-label">Title</span>
              <input
                className="gn-notes__input"
                aria-label="Title"
                value={title}
                onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              />
            </label>

            <div className="gn-notes__field">
              <span className="gn-notes__field-label">Home</span>
              <Select
                options={homeChoices}
                value={homeValue(home)}
                onChange={chooseHome}
                aria-label="Home"
              />
            </div>

            <div className="gn-notes__field">
              <span className="gn-notes__field-label">Scope</span>
              <Select
                options={scopeChoices}
                value={mode}
                onChange={(value) => setMode(value as NoteScopeMode)}
                aria-label="Scope"
              />
            </div>

            {mode === 'explicit' ? (
              <PeoplePicker members={members} selected={userIds} onToggle={toggleUser} legend="Who can see it" />
            ) : null}

            {failure !== null ? (
              <p className="gn-notes__dialog-failure" role="status">
                {failure}
              </p>
            ) : null}

            <div className="gn-notes__dialog-actions">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" disabled={!canCreate} onClick={() => void create()}>
                Create
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );

  function toggleUser(userId: string): void {
    setUserIds((chosen) =>
      chosen.includes(userId) ? chosen.filter((id) => id !== userId) : [...chosen, userId],
    );
  }
}

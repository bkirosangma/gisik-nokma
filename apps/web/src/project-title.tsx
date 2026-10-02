'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngestResult } from '@gisik-nokma/domain';
import { Button, PencilIcon } from '@gisik-nokma/ui';
import { makeSubmittedFactory } from '@gisik-nokma/app-core';
import { newUlid } from '@gisik-nokma/domain';
import { ProjectEditForm, refusalField, type EditRefusal, type ProjectEditValues } from './project-edit-form.js';
import { useWorkspaceGroups } from './use-workspace-groups.js';
import { useOptimisticName } from './use-optimistic-name.js';
import { updateSeeds } from './project-update-seeds.js';
import { bumpProjectsVersion, useProjectsVersion } from './projects-version.js';
import { useAppServices, useSessionStatus } from './providers.js';
import { mayAdminister } from './workspace-viewer.js';

/**
 * The project page's `<h1>` and, for a workspace owner/admin, its Edit (MCP CRUD
 * plan Task 2, owner ruling M1) — the same form, the same people and the same
 * `project.updated` as the card on the workspace home.
 *
 * **It reads its own row** (`getMyWorkspaces`, the one shared read) for the two
 * facts the page does not otherwise hold: the caller's role in this workspace
 * and the project's description. While that read is pending or refused both are
 * `null`, and a `null` role offers NO Edit — the absence claims nothing, where
 * an Edit shown on a failed read would promise a power nobody has checked. The
 * gate is `mayAdminister`, the same expression the card uses; the server's
 * `ADMIN_ONLY_TYPES` answers the same question independently.
 *
 * **The heading survives editing**: the title is the page's only level-1
 * heading, so the form sits beside it (replacing the title row while open) and
 * the `<h1>` returns as soon as the form closes. The new name arrives by
 * re-reading — `bumpProjectsVersion` makes `useProjectName` and the nav ask
 * again — never by editing a local copy.
 */
export function ProjectTitle({
  workspaceId,
  projectId,
  projectName,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
}) {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const userId = session.kind === 'signed-in' ? session.user.id : null;
  const version = useProjectsVersion();
  const [row, setRow] = useState<{
    role: string;
    description: string | null;
    prefix: string;
    groupId: string | null;
    workspacePrefix: string;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** A prefix or group refusal, handed to the form to show under its field (22.181, 22.184, 22.187). */
  const [fieldRefusal, setFieldRefusal] = useState<EditRefusal | null>(null);
  const { groups, reread } = useWorkspaceGroups(workspaceId, row !== null && mayAdminister(row.role) && editing);
  const trigger = useRef<HTMLButtonElement>(null);
  /**
   * The name the `<h1>` draws (smoothness T7, spec S5). The form stays open for the write — it carries four fields, a
   * re-key confirmation and field-level refusals that need it — so the gap this closes is the one AFTER the commit:
   * the form leaves, and until the re-read lands the heading would show the OLD name. The typed name is held from Save,
   * drawn from the commit until a read carries it, and dropped on any refusal.
   */
  const shownName = useOptimisticName(projectName);

  useEffect(() => {
    if (userId === null) {
      setRow(null);
      return;
    }
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        const workspace = rows.find((entry) => entry.id === workspaceId);
        const project = workspace?.projects.find((entry) => entry.id === projectId);
        setRow(
          workspace === undefined || project === undefined
            ? null
            : {
                role: workspace.role,
                description: project.description ?? null,
                prefix: project.prefix,
                groupId: project.groupId ?? null,
                workspacePrefix: workspace.prefix,
              },
        );
      },
      () => {
        if (!cancelled) setRow(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId, projectId, userId, version]);

  const save = useCallback(
    (values: ProjectEditValues): void => {
      if (userId === null || row === null) return;
      setRefusal(null);
      setFieldRefusal(null);
      const seeds = updateSeeds(
        workspaceId,
        projectId,
        { name: projectName, description: row.description, prefix: row.prefix, groupId: row.groupId },
        values,
        groups ?? [],
        newUlid,
      );
      // Nothing changed: nothing to send, and the act is done.
      if (seeds.length === 0) {
        setEditing(false);
        return;
      }
      const make = makeSubmittedFactory({ actorId: userId, origin: 'web' });
      if (values.name.trim() !== projectName) shownName.begin(values.name.trim());
      setBusy(true);
      void dataSource.ingest(seeds.map(make)).then(
        (results: IngestResult[]) => {
          setBusy(false);
          if (results.length !== seeds.length) {
            shownName.drop();
            setRefusal(
              `The server answered ${results.length} of ${seeds.length} claims, so what happened is not known.`,
            );
            bumpProjectsVersion();
            return;
          }
          const bad = results.find((result) => result.status !== 'committed');
          if (bad === undefined) {
            shownName.settle();
            setEditing(false);
          } else if (bad.status === 'refused' && refusalField(bad.rule) !== null) {
            setFieldRefusal({ rule: bad.rule, reason: bad.reason });
            // Someone made the group first: ask again so the picker adopts it; nothing is resubmitted (22.187).
            if (bad.rule === 'group.name-taken') reread();
          } else {
            setRefusal(
              bad.status === 'refused' ? `${bad.rule}: ${bad.reason}` : `${bad.code}: ${bad.message}`,
            );
          }
          if (bad !== undefined) shownName.drop();
          // Re-read on a refusal too, for the reason the workspace home gives.
          bumpProjectsVersion();
        },
        (cause: unknown) => {
          setBusy(false);
          shownName.drop();
          setRefusal(cause instanceof Error ? cause.message : String(cause));
        },
      );
    },
    [dataSource, groups, projectId, projectName, reread, row, shownName, userId, workspaceId],
  );

  const canEdit = row !== null && mayAdminister(row.role);

  return (
    <>
      {canEdit && editing ? (
        <ProjectEditForm
          idPrefix="gn-project-header"
          initial={{ name: projectName, description: row.description, prefix: row.prefix, groupId: row.groupId }}
          workspacePrefix={row.workspacePrefix}
          groups={groups}
          refusal={fieldRefusal}
          busy={busy}
          onSave={save}
          onCancel={() => {
            setRefusal(null);
            setFieldRefusal(null);
            setEditing(false);
          }}
          returnFocusRef={trigger}
        />
      ) : (
        <div className="gn-project__title-row">
          <h1 className="gn-project__title">{shownName.name}</h1>
          {canEdit ? (
            <Button
              ref={trigger}
              type="button"
              className="gn-project__edit"
              aria-label={`Edit ${shownName.name}`}
              onClick={() => setEditing(true)}
            >
              {/* Neo follow-up F-2 (case 23.331): on a phone the word gives way to the glyph so Edit stays on the title's row
                  (the phone arm in `globals.css` swaps them); the accessible name above is the same at every width. */}
              <span className="gn-project__edit-icon">
                <PencilIcon />
              </span>
              <span className="gn-project__edit-label">Edit</span>
            </Button>
          ) : null}
        </div>
      )}
      {refusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
    </>
  );
}

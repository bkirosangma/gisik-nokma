'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngestResult } from '@gisik-nokma/domain';
import { Button } from '@gisik-nokma/ui';
import { makeSubmittedFactory } from '@gisik-nokma/app-core';
import { ProjectEditForm, type ProjectEditValues } from './project-edit-form.js';
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
  const [row, setRow] = useState<{ role: string; description: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

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
            : { role: workspace.role, description: project.description ?? null },
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
      const seeds = updateSeeds(
        workspaceId,
        projectId,
        { name: projectName, description: row.description },
        values,
      );
      // Nothing changed: nothing to send, and the act is done.
      if (seeds.length === 0) {
        setEditing(false);
        return;
      }
      const make = makeSubmittedFactory({ actorId: userId, origin: 'web' });
      setBusy(true);
      void dataSource.ingest(seeds.map(make)).then(
        (results: IngestResult[]) => {
          setBusy(false);
          if (results.length !== seeds.length) {
            setRefusal(
              `The server answered ${results.length} of ${seeds.length} claims, so what happened is not known.`,
            );
            bumpProjectsVersion();
            return;
          }
          const bad = results.find((result) => result.status !== 'committed');
          if (bad === undefined) {
            setEditing(false);
          } else {
            setRefusal(
              bad.status === 'refused' ? `${bad.rule}: ${bad.reason}` : `${bad.code}: ${bad.message}`,
            );
          }
          // Re-read on a refusal too, for the reason the workspace home gives.
          bumpProjectsVersion();
        },
        (cause: unknown) => {
          setBusy(false);
          setRefusal(cause instanceof Error ? cause.message : String(cause));
        },
      );
    },
    [dataSource, projectId, projectName, row, userId, workspaceId],
  );

  const canEdit = row !== null && mayAdminister(row.role);

  return (
    <>
      {canEdit && editing ? (
        <ProjectEditForm
          idPrefix="gn-project-header"
          initial={{ name: projectName, description: row.description }}
          busy={busy}
          onSave={save}
          onCancel={() => {
            setRefusal(null);
            setEditing(false);
          }}
          returnFocusRef={trigger}
        />
      ) : (
        <div className="gn-project__title-row">
          <h1 className="gn-project__title">{projectName}</h1>
          {canEdit ? (
            <Button
              ref={trigger}
              type="button"
              aria-label={`Edit ${projectName}`}
              onClick={() => setEditing(true)}
            >
              Edit
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

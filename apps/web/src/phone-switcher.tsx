'use client';

import Link from 'next/link';
import { Sheet } from '@gisik-nokma/ui';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { useAppServices } from './providers.js';
import { useWorkspaceProjects } from './use-workspace-projects.js';

/**
 * The phone top bar's one control: which workspace, and which project, am I in
 * — and a way to change either (mobile-web plan Task 2, spec §3.1, cases
 * 21.010–21.011).
 *
 * ## What it replaces
 *
 * At ≤40rem `AppNav` hides its link row and the scope note (`globals.css`, the
 * 40rem arm) and this button stands in their place. The owner's screenshot of
 * `/workspaces` at 412px (2026-10-01) showed the scope note — *"No workspace
 * selected — pick one to reach its board, members and settings."* — squeezed
 * into an eight-line column; here the same fact is the button's own label,
 * "Choose a workspace". Above 40rem nothing changes: the wrapper is
 * `display: none`, and the note (case 13.391) keeps rendering for the desktop
 * bar.
 *
 * ## The label follows the nav's own rules, it does not invent new ones
 *
 * `workspaceId` is the nav's EFFECTIVE workspace — routed, or remembered AND
 * resolved — or `undefined` when the bar has none (`AppNav`'s `noWorkspace`).
 * So a remembered workspace that no longer resolves reads "Choose a workspace"
 * rather than naming something the person cannot open (Rounds 22–25, plan FD5).
 * The project is the ROUTED one (`/w/<ws>/p/<id>`), found in the same served
 * list the nav's last-project item reads; with no project in the route the label
 * is the workspace's name alone.
 *
 * ## The sheet
 *
 * A bottom-anchored list, portalled to `document.body` so it is not trapped
 * under the sticky bar's stacking context (`.gn-nav` is `z-index: 20`): this
 * workspace's live projects (when there is a workspace), then every live
 * workspace, then "All workspaces". The current item carries `aria-current` AND
 * a check mark — never colour alone. Archived rows are not offered, for the rule
 * the nav's project dropdown and `/workspaces` both follow: an archived thing is
 * not somewhere you go to work.
 */
export function PhoneSwitcher({
  workspaceId,
  workspaceName,
  projectId,
}: {
  workspaceId: string | undefined;
  workspaceName: string | null;
  projectId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const projects = useWorkspaceProjects(workspaceId);
  const projectName =
    projectId === undefined ? null : (projects?.find((project) => project.id === projectId)?.name ?? null);

  const label =
    workspaceId === undefined
      ? 'Choose a workspace'
      : projectName !== null && workspaceName !== null
        ? `${projectName}, ${workspaceName}`
        : (workspaceName ?? 'Workspace');

  const close = (): void => setOpen(false);

  return (
    <div className="gn-phone-switcher">
      <button
        type="button"
        className="gn-phone-switcher__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="gn-phone-switcher__label">{label}</span>
        <svg className="gn-phone-switcher__chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <Sheet open title={label} onClose={close}>
              <SwitcherBody
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                projectId={projectId}
                projects={projects}
                onNavigate={close}
              />
            </Sheet>,
            document.body,
          )
        : null}
    </div>
  );
}

function Check() {
  return (
    <svg className="gn-phone-switcher__check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SwitcherBody({
  workspaceId,
  workspaceName,
  projectId,
  projects,
  onNavigate,
}: {
  workspaceId: string | undefined;
  workspaceName: string | null;
  projectId: string | undefined;
  projects: ReturnType<typeof useWorkspaceProjects>;
  onNavigate: () => void;
}) {
  const { dataSource } = useAppServices();
  // Read when the sheet OPENS, through the same `getMyWorkspaces` the nav's name and
  // project hooks share — never a second endpoint.
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | 'failed' | null>(null);
  useEffect(() => {
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (!cancelled) setWorkspaces(rows);
      },
      () => {
        if (!cancelled) setWorkspaces('failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  const liveProjects = (projects ?? []).filter((project) => !project.archived);
  const liveWorkspaces = Array.isArray(workspaces) ? workspaces.filter((workspace) => !workspace.archived) : [];

  return (
    <nav className="gn-phone-switcher__sheet" aria-label="Workspaces and projects">
      {workspaceId !== undefined && liveProjects.length > 0 ? (
        <section>
          <h3 className="gn-phone-switcher__heading">{workspaceName === null ? 'Projects' : `Projects in ${workspaceName}`}</h3>
          <ul className="gn-phone-switcher__list">
            {liveProjects.map((project) => {
              const current = project.id === projectId;
              return (
                <li key={project.id}>
                  <Link
                    className="gn-phone-switcher__link"
                    href={`/w/${workspaceId}/p/${project.id}`}
                    aria-current={current ? 'page' : undefined}
                    onClick={onNavigate}
                  >
                    <span className="gn-phone-switcher__link-text">{project.name}</span>
                    {current ? <Check /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <section>
        <h3 className="gn-phone-switcher__heading">Workspaces</h3>
        {workspaces === null ? <p className="gn-phone-switcher__note">Loading your workspaces…</p> : null}
        {workspaces === 'failed' ? <p className="gn-phone-switcher__note">Your workspaces could not be loaded.</p> : null}
        {liveWorkspaces.length > 0 ? (
          <ul className="gn-phone-switcher__list">
            {liveWorkspaces.map((workspace) => {
              const current = workspace.id === workspaceId;
              return (
                <li key={workspace.id}>
                  <Link
                    className="gn-phone-switcher__link"
                    href={`/w/${workspace.id}`}
                    aria-current={current && projectId === undefined ? 'page' : current ? 'true' : undefined}
                    onClick={onNavigate}
                  >
                    <span className="gn-phone-switcher__link-text">{workspace.name}</span>
                    {current ? <Check /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        <Link className="gn-phone-switcher__link gn-phone-switcher__link--all" href="/workspaces" onClick={onNavigate}>
          <span className="gn-phone-switcher__link-text">All workspaces</span>
        </Link>
      </section>
    </nav>
  );
}

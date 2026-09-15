import type { WorkspaceRef } from '@gisik-nokma/app-core';

export type WorkspacesSectionProps = { workspaces: WorkspaceRef[] };

/**
 * Two fields only, both real: `role` (served verbatim from
 * `proj_memberships.role` on `GET /v1/me/workspaces`, the same field
 * `/workspaces`' own card renders as a sentence) and `projects.length`, a
 * count over data the caller already holds in full — no invented row.
 *
 * `memberCount` and `nameRestrictedProjectCount` are real too but unused here
 * on purpose: this is a compact convenience list (`/account`), not a second
 * `/workspaces` card — the withheld-count treatment `WorkspaceRef.memberCount`
 * needs (`null` = guest, never painted as `0`) belongs to the surface that
 * already carries it correctly, not a duplicate here.
 *
 * Unstyled by the same disclosed convention `AppearanceSection` and
 * `ProfileSection` already establish on this page: `gn-account__section` and
 * `gn-account__section-title` carry no CSS rule in `globals.css` today, and
 * neither do `__workspace-row`/`__workspace-name`/`__workspace-role`/
 * `__workspace-count` below. The one real rule in scope is `.gn-account ul`
 * (descendant selector), which does apply to `gn-account__workspace-list` and
 * gives it the page's standard list spacing.
 */
export function WorkspacesSection({ workspaces }: WorkspacesSectionProps) {
  return (
    <section className="gn-account__section gn-account__workspaces">
      <h2 className="gn-account__section-title">Your workspaces</h2>
      <ul className="gn-account__workspace-list">
        {workspaces.map((workspace) => (
          <li key={workspace.id} className="gn-account__workspace-row">
            <span className="gn-account__workspace-name">{workspace.name}</span>
            <span className="gn-account__workspace-role">{workspace.role}</span>
            <span className="gn-account__workspace-count">
              {workspace.projects.length} {workspace.projects.length === 1 ? 'project' : 'projects'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

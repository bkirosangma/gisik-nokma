import Link from 'next/link';
import { Avatar } from '@gisik-nokma/ui';
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
 * STYLED as of the Account styling port, against the DESKTOP prototype's
 * `isAccount` screen (`design-system/interactive/desktop.dc.html:1504-1512`),
 * which is the reference the governing spec names. This docblock previously
 * disclosed that these classes carried no CSS rule at all; that is no longer
 * true of any of them.
 *
 * Three things came from the reference and are worth naming because they are
 * more than styling:
 *
 * 1. **The row is a door.** The prototype's row is a control that opens the
 *    workspace, with an accent "Open" at its trailing edge. Rendered as a
 *    real `<a>` per `.gn-workspace-card__door`'s precedent. This is the one
 *    piece of NEW BEHAVIOUR in the port — the list was previously inert — and
 *    it stays inside the spec's non-goals, which forbid creating, deleting or
 *    changing MEMBERSHIP from `/account`, not navigating to a workspace.
 * 2. **The avatar is `Avatar` from `packages/ui`, not a new one.** Its `tint`
 *    is keyed on `workspace.id`, so a workspace is the same colour on every
 *    device and two workspaces sharing initials are still told apart. The
 *    prototype's own avatar colour is seed data (`w.bg`) with no field behind
 *    it in `WorkspaceRef`, so a hash of the real id is what replaces it
 *    rather than an invented colour column.
 * 3. **The project count stays**, though the prototype's row shows only name
 *    and role. It is real data already catalogued in `Features.md`, and
 *    dropping a true field to match a mock would be the wrong direction.
 */
export function WorkspacesSection({ workspaces }: WorkspacesSectionProps) {
  return (
    <section className="gn-account__section gn-account__workspaces">
      <h2 className="gn-account__section-title">Your workspaces</h2>
      <ul className="gn-account__workspace-list">
        {workspaces.map((workspace) => {
          /*
            E5-12 — ONE UNIT UNDER THE WORD "PROJECT".

            This row counted `workspace.projects.length`, the whole array, while
            `/workspaces`' own card counts LIVE projects only and says "archived"
            separately (`projectCountLine` + the archived chip). So one workspace
            read "2 projects" here and "1 project, 1 archived" there, and NEITHER
            screen named its unit — the same word for two different measurements.

            The live-only count is what is kept, because that is the unit the
            other screen and the manual already use, and the archived half is
            named rather than dropped: a reader who sees "2 projects" on one page
            and "1 project" on the other is owed the reason.
          */
          const live = workspace.projects.filter((project) => !project.archived);
          const archived = workspace.projects.length - live.length;
          return (
          <li key={workspace.id} className="gn-account__workspace-row">
            {/* THE ROW IS THE DOOR, the shape `.gn-workspace-card__door`
                already established on the workspace card — a real `<a>`
                filling the row rather than a `<div onClick>`, so keyboard and
                screen-reader reachability come from the element itself.

                `aria-label` pins the accessible name to one phrase. Without
                it the name is the concatenation of everything inside,
                including `Avatar`'s own `aria-label` (it labels itself with
                the workspace name), which would announce the name twice
                before the role and count. */}
            <Link
              href={`/w/${workspace.id}`}
              className="gn-account__workspace-door"
              aria-label={`Open ${workspace.name}`}
            >
              <Avatar name={workspace.name} tint={workspace.id} size="medium" />
              <span className="gn-account__row-text">
                <span className="gn-account__workspace-name">{workspace.name}</span>
                {/* Role and count stay SEPARATE elements rather than one
                    joined string: each is its own fact, and
                    `account-page.test.tsx` reads them that way
                    (`getByText('admin')`, `getByText('1 project')`). */}
                <span className="gn-account__workspace-facts">
                  <span className="gn-account__workspace-role">{workspace.role}</span>
                  <span className="gn-account__workspace-count">
                    {live.length} {live.length === 1 ? 'project' : 'projects'}
                    {archived > 0 ? `, ${archived} archived` : ''}
                  </span>
                </span>
              </span>
              <span className="gn-account__workspace-open">Open</span>
            </Link>
          </li>
          );
        })}
      </ul>
    </section>
  );
}

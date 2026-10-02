'use client';
import { Card, Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

/**
 * The secondary screens' skeletons (smoothness T8, spec S1, S7; amendment S-R1; audit SM-09; cases 25.122–25.131, 25.147).
 *
 * Each one is the real component's OWN container classes filled with `Skeleton` parts, so the swap to content moves nothing: the
 * roster is the roster's table, the workspace card is `Card.gn-workspace-card`, the inbox row is `li.gn-inbox__item`. Nothing here
 * names a fill, a border or a colour (the parts own those, and §4.3's style-neutral test stands). A region is the busy wrapper that
 * names the wait once for assistive tech; in a real page it is a block (`display: contents` only inside the T5 route shells), so a
 * region wraps the real container and never sits between a `ul` and its `li`.
 *
 * `'use client'` like `page-shells.tsx`: the barrel `@gisik-nokma/ui` may only be imported from a client module.
 */
const FIVE = [0, 1, 2, 3, 4];
const THREE = [0, 1, 2];
const SIX = [0, 1, 2, 3, 4, 5];

/** Members: the roster's own table (Person and Role columns) with five rows of avatar, two text lines and a role chip. */
export function MembersRosterSkeleton() {
  return (
    <SkeletonRegion label="Loading members">
      <div className="gn-members">
        <table className="gn-members__table">
          <thead>
            <tr>
              <th scope="col" className="gn-members__th gn-members__th--person">
                Person
              </th>
              <th scope="col" className="gn-members__th">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {FIVE.map((row) => (
              <tr key={row} className="gn-members__row">
                <td className="gn-members__cell">
                  <span className="gn-members__person">
                    <Skeleton shape="circle" width="2rem" height="2rem" />
                    <span className="gn-members__identity">
                      <Skeleton width="9rem" height="1rem" />
                      <Skeleton width="12rem" height="0.875rem" />
                    </span>
                  </span>
                </td>
                <td className="gn-members__cell">
                  <div className="gn-members__role-cell">
                    <Skeleton shape="block" width="4rem" height="1.5rem" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SkeletonRegion>
  );
}

/** Members: the invite form's slot while the "may I invite" question is open: the mint form's own `form.gn-invite-mint`. */
export function MembersInviteSkeleton() {
  return (
    <SkeletonRegion label="Checking whether you can invite people">
      <div className="gn-invite-mint">
        <Skeleton width="10rem" height="1.25rem" />
        <Skeleton shape="block" height="2.5rem" />
        <Skeleton shape="block" width="8rem" height="2.5rem" />
      </div>
    </SkeletonRegion>
  );
}

/** Workspaces: three workspace cards in the real list and card classes (avatar, name, meta, chips, role line). */
export function WorkspaceListSkeleton() {
  return (
    <SkeletonRegion label="Loading your workspaces">
      <ul className="gn-workspace-list">
        {THREE.map((card) => (
          <li key={card}>
            <Card className="gn-workspace-card">
              <div className="gn-workspace-card__door">
                <div className="gn-workspace-card__head">
                  <Skeleton shape="circle" width="2.75rem" height="2.75rem" />
                  <div className="gn-workspace-card__titles">
                    <Skeleton width="10rem" height="1.25rem" />
                    <Skeleton width="6rem" height="0.875rem" />
                  </div>
                </div>
                <div className="gn-workspace-card__chips">
                  <Skeleton shape="block" width="5rem" height="1.5rem" />
                  <Skeleton shape="block" width="4rem" height="1.5rem" />
                </div>
                <Skeleton width="55%" height="0.875rem" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Workspaces: the invitations band while that read is in flight; the band itself, so an answered-empty list collapses it. */
export function InvitationsBandSkeleton() {
  return (
    <SkeletonRegion label="Checking for invitations" className="gn-invitations">
      <Skeleton shape="circle" width="1.375rem" height="1.375rem" />
      <div className="gn-invitations__body">
        <Skeleton width="14rem" height="1.25rem" />
        <ul className="gn-invitations__list">
          <li className="gn-invitations__item">
            <Skeleton width="80%" height="1rem" />
          </li>
        </ul>
      </div>
    </SkeletonRegion>
  );
}

/** Workspace home: three project cards in the real grid and card classes. */
export function ProjectGridSkeleton() {
  return (
    <SkeletonRegion label="Loading the workspace">
      <ul className="gn-workspace-home__projects">
        {THREE.map((card) => (
          <li key={card}>
            <Card className="gn-project-card">
              <div className="gn-project-card__door">
                <span className="gn-project-card__head">
                  <Skeleton width="9rem" height="1.25rem" />
                </span>
                <Skeleton width="85%" height="0.875rem" />
                <span className="gn-project-card__chips">
                  <Skeleton shape="block" width="4rem" height="1.25rem" />
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The project dialog's group field while the groups are read: the field's own `gn-field` box, a label line and an input block. */
export function GroupFieldSkeleton() {
  return (
    <SkeletonRegion label="Loading groups" className="gn-field">
      <Skeleton width="4rem" height="0.875rem" />
      <Skeleton shape="block" height="2.5rem" />
    </SkeletonRegion>
  );
}

/** Inbox: the list's own classes with six rows of glyph circle, two text lines and a time. */
export function InboxRowsSkeleton() {
  return (
    <SkeletonRegion label="Loading your inbox">
      <div className="gn-inbox">
        <ul className="gn-inbox__list">
          {SIX.map((row) => (
            <li key={row} className="gn-inbox__item">
              <div className="gn-inbox__row">
                <span className="gn-inbox__glyph">
                  <Skeleton shape="circle" width="2rem" height="2rem" />
                </span>
                <span className="gn-inbox__text">
                  <Skeleton width="60%" height="1rem" />
                  <Skeleton width="85%" height="0.875rem" />
                </span>
                <Skeleton width="4rem" height="0.75rem" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </SkeletonRegion>
  );
}

/** My work: the attention strip's band, reserved while that read is open (it collapses only on an answered-empty). */
export function AttentionBandSkeleton() {
  return (
    <SkeletonRegion label="Loading what needs your attention" className="gn-attention">
      <Skeleton shape="block" height="4rem" />
    </SkeletonRegion>
  );
}

const MY_WORK_SECTIONS: { title: string; rows: number }[] = [
  { title: 'Assigned to me', rows: 2 },
  { title: 'My claims in transit', rows: 1 },
  { title: 'My contested claims', rows: 1 },
  { title: 'Shared with me', rows: 1 },
];

/** My work: the page's four sections (heading, item cards) in its own classes. */
export function MyWorkSkeleton() {
  return (
    <SkeletonRegion label="Loading your work">
      <div className="gn-my-work">
        {MY_WORK_SECTIONS.map((section) => (
          <section key={section.title} className="gn-my-work__section">
            <h2 className="gn-my-work__heading">{section.title}</h2>
            {Array.from({ length: section.rows }, (_, row) => (
              <Card key={row} className="gn-my-work__item">
                <Skeleton width="70%" height="1rem" />
                <Skeleton width="45%" height="0.875rem" />
              </Card>
            ))}
          </section>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** The phone switcher sheet: three rows in the switcher's own list and link classes. */
export function SwitcherRowsSkeleton() {
  return (
    <SkeletonRegion label="Loading your workspaces">
      <ul className="gn-phone-switcher__list">
        {THREE.map((row) => (
          <li key={row}>
            <span className="gn-phone-switcher__link">
              <span className="gn-phone-switcher__link-text">
                <Skeleton width="60%" height="1.25rem" />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** Settings, workspace tab: the form's own `section.gn-workspace-settings` with its title and four field blocks. */
export function SettingsFormSkeleton() {
  return (
    <SkeletonRegion label="Loading settings" className="gn-workspace-settings">
      <Skeleton width="12rem" height="1.5rem" />
      <Skeleton shape="block" height="3.5rem" rows={4} />
      <Skeleton shape="block" width="7rem" height="2.5rem" />
    </SkeletonRegion>
  );
}

/** Settings, groups tab: the tree's own `.gn-groups` with its toolbar block and six rows. */
export function GroupsTreeSkeleton() {
  return (
    <SkeletonRegion label="Loading groups" className="gn-groups">
      <Skeleton shape="block" width="9rem" height="2.5rem" />
      <Skeleton height="1.5rem" rows={6} />
    </SkeletonRegion>
  );
}

/** The role check behind every settings tab and the builder screens: a block where the tab's body will be. */
export function WiringCheckSkeleton() {
  return (
    <SkeletonRegion label="Checking what you may change in this workspace">
      <Skeleton shape="block" height="18rem" />
    </SkeletonRegion>
  );
}

/**
 * One account section while its read is open: the real `section.gn-account__section` in its FINAL position with its title as the
 * region's name, so the cards never reorder as the reads land (25.128). `title` is the section's own heading text.
 */
export function AccountSectionSkeleton({ title }: { title: string }) {
  return (
    <section className="gn-account__section">
      <SkeletonRegion label={title}>
        <Skeleton width="10rem" height="1.25rem" />
        <Skeleton shape="block" height="6rem" />
      </SkeletonRegion>
    </section>
  );
}

/** The deleted-items section's body while its list is read (the section keeps its own heading). */
export function DeletedItemsSkeleton() {
  return (
    <div>
      <SkeletonRegion label="Loading deleted items">
        <Skeleton shape="block" height="3rem" rows={2} />
      </SkeletonRegion>
    </div>
  );
}

/** The MCP tokens card's list while it is read: rows in the card's own list and row classes. */
export function McpTokensRowsSkeleton() {
  return (
    <SkeletonRegion label="Loading your connected assistants">
      <ul className="gn-mcp-tokens__list">
        {[0, 1].map((row) => (
          <li key={row} className="gn-mcp-tokens__row">
            <span className="gn-mcp-tokens__when">
              <Skeleton width="9rem" height="1rem" />
              <Skeleton width="14rem" height="0.875rem" />
            </span>
            <Skeleton shape="block" width="5rem" height="2rem" />
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The MCP tokens card's session wait: a block where the lead and the list will be. */
export function McpSessionSkeleton() {
  return (
    <SkeletonRegion label="Checking your session">
      <Skeleton shape="block" height="3rem" />
    </SkeletonRegion>
  );
}

/** The invite page's waits, INSIDE its own `Card.gn-invite` (the page has no nav or main shell to borrow): the invitation sentence, or just the action's place. */
export function InviteCheckSkeleton({ label, action = false }: { label: string; action?: boolean }) {
  return (
    <SkeletonRegion label={label}>
      {action ? null : (
        <>
          <Skeleton width="85%" height="1rem" />
          <Skeleton width="55%" height="0.875rem" />
        </>
      )}
      <Skeleton shape="block" width="12rem" height="2.5rem" />
    </SkeletonRegion>
  );
}

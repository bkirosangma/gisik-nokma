'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import type { GroupRow } from '@gisik-nokma/domain';
import type { ProjectRef } from '@gisik-nokma/app-core';
import { useCollapsedGroups } from './use-group-collapse.js';

/** The heading of the section that holds projects with no group (prefixes and groups Task 7, case 22.141). */
export const UNGROUPED_LABEL = 'Ungrouped';

/** One group, its projects and its child groups — the tree the view draws. */
type GroupNode = { group: GroupRow; projects: ProjectRef[]; children: GroupNode[] };

/** `a.rank` before `b.rank`; the id breaks a tie so the order is a function of the set and not of the wire. */
function byRank(a: GroupRow, b: GroupRow): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The groups as a forest, pruned: a node survives only when it holds a project or a descendant does
 * (case 22.146), so an empty branch of the tree is never drawn. Siblings are in rank order whatever order
 * the wire served them. A project filed under a group the list does not name (a group the caller was not
 * served, a stale read) is NOT lost: it is returned in `ungrouped` with the ones that have no group.
 */
export function groupForest(
  groups: readonly GroupRow[],
  projects: readonly ProjectRef[],
): { roots: GroupNode[]; ungrouped: ProjectRef[] } {
  const known = new Set(groups.map((group) => group.id));
  const own = new Map<string, ProjectRef[]>();
  const ungrouped: ProjectRef[] = [];
  for (const project of projects) {
    const id = project.groupId ?? null;
    if (id === null || !known.has(id)) {
      ungrouped.push(project);
      continue;
    }
    own.set(id, [...(own.get(id) ?? []), project]);
  }
  const childrenOf = new Map<string | null, GroupRow[]>();
  for (const group of groups) {
    // A parent the list does not name is treated as a root rather than dropping the branch.
    const parent = group.parentId !== null && known.has(group.parentId) ? group.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), group]);
  }
  const build = (parent: string | null): GroupNode[] =>
    [...(childrenOf.get(parent) ?? [])]
      .sort(byRank)
      .map((group) => ({ group, projects: own.get(group.id) ?? [], children: build(group.id) }))
      .filter((node) => node.projects.length > 0 || node.children.length > 0);
  return { roots: build(null), ungrouped };
}

/** Every project in the node's subtree: its own and its descendants'. */
function subtreeCount(node: GroupNode): number {
  return node.projects.length + node.children.reduce((sum, child) => sum + subtreeCount(child), 0);
}

/**
 * The workspace home's grouped view (prefixes and groups Task 7, cases 22.140, 22.141, 22.146; collapse and
 * guides, smoothness G-1, cases 25.300-25.306).
 *
 * Nested sections, level 1 outermost, each headed by a disclosure button and the group's name. The section
 * carries `data-level="N"`, and a CSS guide down its left edge (from `--gn-level-N`) runs from the heading row
 * to the bottom of its last child, so the depth reads without the words and, because it is a pseudo-element,
 * says nothing to assistive technology: the heading's own level (h3 for level 1 down to h6) names the depth.
 * A group's own projects come first, then its child groups. Projects with no group follow every group, under
 * "Ungrouped", and the section is absent when there are none.
 *
 * Every group collapses (the Ungrouped section, which is not a level, does not): the WHOLE subtree goes, behind
 * `hidden`, so a card keeps its state while it is away; a collapsed heading counts the projects it holds. The
 * choice is remembered per user and workspace (`use-group-collapse.ts`) when the caller names both.
 *
 * It owns only the SHAPE. The card is the caller's (`renderCard`), so the plain grid and this view draw the
 * very same card and a change to one cannot leave the other behind.
 */
export function GroupedProjects({
  groups,
  projects,
  renderCard,
  userId,
  workspaceId,
}: {
  groups: readonly GroupRow[];
  projects: readonly ProjectRef[];
  renderCard: (project: ProjectRef) => ReactNode;
  /** With `workspaceId`, what the collapse is remembered under; without either it lasts the page's life. */
  userId?: string | undefined;
  workspaceId?: string | undefined;
}): ReactElement {
  const base = useId();
  const { collapsed, toggle } = useCollapsedGroups('gn-groups-collapsed', userId, workspaceId);
  const { roots, ungrouped } = groupForest(groups, projects);
  const cards = (list: readonly ProjectRef[]): ReactElement => (
    <ul className="gn-workspace-home__projects">{list.map((project) => renderCard(project))}</ul>
  );
  const renderNode = (node: GroupNode): ReactElement => {
    const headingId = `${base}-${node.group.id}`;
    // h3 for level 1 down to h6 for level 4: the page's own h2 is "Projects", so the tree starts below it.
    const Heading = `h${Math.min(2 + node.group.level, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
    const bodyId = `${base}-${node.group.id}-body`;
    const isCollapsed = collapsed.has(node.group.id);
    const count = subtreeCount(node);
    return (
      <section
        key={node.group.id}
        className="gn-group-section"
        aria-labelledby={headingId}
        data-group-id={node.group.id}
        data-level={node.group.level}
      >
        <div className="gn-group-section__head">
          {/* A real button whose name is plain text: the caret is a separate aria-hidden span drawn in CSS. */}
          <button
            type="button"
            className="gn-group-section__toggle"
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.group.name}`}
            onClick={() => toggle(node.group.id)}
          >
            <span className="gn-group-section__caret" aria-hidden="true" />
          </button>
          <Heading id={headingId} className="gn-group-section__name">
            {node.group.name}
          </Heading>
          {isCollapsed ? (
            <span className="gn-group-section__count">
              <span aria-hidden="true">· </span>
              {count} {count === 1 ? 'project' : 'projects'}
            </span>
          ) : null}
        </div>
        <div id={bodyId} className="gn-group-section__body" hidden={isCollapsed}>
          {node.projects.length > 0 ? cards(node.projects) : null}
          {node.children.map(renderNode)}
        </div>
      </section>
    );
  };
  const ungroupedId = `${base}-ungrouped`;
  return (
    <div className="gn-grouped-projects">
      {roots.map(renderNode)}
      {ungrouped.length > 0 ? (
        <section className="gn-group-section gn-group-section--ungrouped" aria-labelledby={ungroupedId}>
          <div className="gn-group-section__head">
            <h3 id={ungroupedId} className="gn-group-section__name">
              {UNGROUPED_LABEL}
            </h3>
          </div>
          {cards(ungrouped)}
        </section>
      ) : null}
    </div>
  );
}

import { ATTENTION_SHOW_VALUES, type AttentionShow } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '../view-types.js';

/**
 * The pure half of the global My work page (my-work-global T3): the workspace → project tree
 * both of its sections render in, and which "Show" chips a viewer is offered.
 */

export interface WorkspaceGroup<T> {
  workspaceId: string;
  workspaceName: string;
  projects: { projectId: string; projectName: string; items: T[] }[];
}

/** What a project nobody named for this viewer is called — never its id (case 30.023). */
export const UNKNOWN_PROJECT_NAME = 'Unknown project';

const byName = (a: string, b: string): number => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * A project's name for this viewer, the ONE rule both arrangements of the page print: the
 * grouped headings and the flat place label (T4, case 30.037). Absent from the workspace's
 * `projects`, it is "Unknown project" — never the id, which is not a name.
 */
const projectNameIn = (workspace: WorkspaceRef, projectId: string): string =>
  workspace.projects.find((project) => project.id === projectId)?.name ?? UNKNOWN_PROJECT_NAME;

/**
 * Groups items under their workspace, then their project.
 *
 * - **Order:** workspaces by name, then projects by name — both case-insensitive
 *   (`localeCompare`, `'en'`, sensitivity `base`), with the id as the tie-break so two
 *   equal names still come out in one order. Items keep their INPUT order inside a project:
 *   the caller has already put attention in bucket order, and re-sorting here would undo it.
 * - **The project is the item's CURRENT `projectId`** (Review Focus 4). Nothing is cached
 *   between calls, so a ticket moved since the last render groups under its new home.
 * - **An item whose workspace is not in `workspaces` is dropped and warned about.** It
 *   cannot be named, and a heading reading "undefined" is worse than a missing row; the
 *   warning is there because a dropped row is a fact somebody should be able to find.
 * - **A project absent from the workspace's `projects` is "Unknown project"** — the viewer
 *   may hold a ticket in a project whose name is withheld from them, and the id is not a name.
 */
export function groupByWorkspaceProject<T extends { workspaceId: string; projectId: string }>(
  items: readonly T[],
  workspaces: readonly WorkspaceRef[],
): WorkspaceGroup<T>[] {
  const known = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const groups = new Map<string, { workspace: WorkspaceRef; projects: Map<string, T[]> }>();
  for (const item of items) {
    const workspace = known.get(item.workspaceId);
    if (workspace === undefined) {
      console.warn(`groupByWorkspaceProject: dropped an item from workspace ${item.workspaceId}, which is not in the list`);
      continue;
    }
    let group = groups.get(workspace.id);
    if (group === undefined) {
      group = { workspace, projects: new Map() };
      groups.set(workspace.id, group);
    }
    const bucket = group.projects.get(item.projectId);
    if (bucket === undefined) group.projects.set(item.projectId, [item]);
    else bucket.push(item);
  }
  return [...groups.values()]
    .map(({ workspace, projects }) => {
      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        projects: [...projects.entries()]
          .map(([projectId, projectItems]) => ({
            projectId,
            projectName: projectNameIn(workspace, projectId),
            items: projectItems,
          }))
          .sort((a, b) => byName(a.projectName, b.projectName) || byName(a.projectId, b.projectId)),
      };
    })
    .sort((a, b) => byName(a.workspaceName, b.workspaceName) || byName(a.workspaceId, b.workspaceId));
}

/** Where an item lives, by name: the FLAT arrangement's per-row label (my-work-global T4). */
export interface ItemPlace {
  workspaceName: string;
  projectName: string;
}

/**
 * The flat arrangement's label source (T4, case 30.037): with no headings, each row says which
 * workspace and project it is in. The names follow `groupByWorkspaceProject`'s rules exactly
 * (`projectNameIn`), so switching between the two arrangements never renames anything; an item
 * whose workspace is not in the list is `null` — no label, never a heading's "undefined".
 */
export function placeLookup(
  workspaces: readonly WorkspaceRef[],
): (item: { workspaceId: string; projectId: string }) => ItemPlace | null {
  const known = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  return (item) => {
    const workspace = known.get(item.workspaceId);
    if (workspace === undefined) return null;
    return { workspaceName: workspace.name, projectName: projectNameIn(workspace, item.projectId) };
  };
}

const runsWorkspace = (workspace: WorkspaceRef): boolean => workspace.role === 'owner' || workspace.role === 'admin';
const runsAProject = (workspace: WorkspaceRef): boolean => (workspace.adminProjectIds ?? []).length > 0;

/**
 * The `show` values this viewer is offered as chips: "Created by me" and "Assigned to me"
 * always; "Workspaces I own or run" when they are an owner or admin of at least one
 * workspace; "Projects I run" when they administer at least one project.
 *
 * Archived workspaces are left out, because the global page never queries them: a chip only
 * an archived workspace justified would select nothing anywhere.
 */
export function showOptionsFor(workspaces: readonly WorkspaceRef[]): AttentionShow[] {
  const live = workspaces.filter((workspace) => !workspace.archived);
  return ATTENTION_SHOW_VALUES.filter(
    (value) =>
      value === 'created' ||
      value === 'assigned' ||
      (value === 'ws-admin' && live.some(runsWorkspace)) ||
      (value === 'project-admin' && live.some(runsAProject)),
  );
}

/**
 * The part of a selection ONE workspace may be asked for. `ws-admin` only where the viewer
 * is an owner or admin of THAT workspace, `project-admin` only where they run a project in
 * it — the attention route refuses either elsewhere (400 `invalid_query`), and a refusal
 * there would blank a workspace whose created/assigned tickets the viewer did ask for.
 *
 * Canonical order (`ATTENTION_SHOW_VALUES`, the domain's one spelling of the set) and no
 * repeats, so one selection always produces one request URL. An empty answer means the
 * workspace has nothing to be asked, and is skipped.
 */
export function showForWorkspace(workspace: WorkspaceRef, show: readonly AttentionShow[]): AttentionShow[] {
  return ATTENTION_SHOW_VALUES.filter(
    (value) =>
      show.includes(value) &&
      (value === 'created' ||
        value === 'assigned' ||
        (value === 'ws-admin' && runsWorkspace(workspace)) ||
        (value === 'project-admin' && runsAProject(workspace))),
  );
}

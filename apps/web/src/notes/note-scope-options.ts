import type { NoteScopeMode } from '@gisik-nokma/domain';
import type { SelectOption } from '@gisik-nokma/ui';

/**
 * The scope vocabulary, in the product's words (spec §9.3).
 *
 * One table, because the Create dialog and the byline's ScopeEditor offer the
 * SAME five modes and a second spelling is how the two come to disagree about
 * what `inherit` is called — the drift this repo keeps recording for labels.
 *
 * The words are chosen against the wire's:
 *
 * - `private` and `workspace` are the wire's own, because there is nothing to
 *   translate;
 * - `project` is **"This project"** rather than "Project", because a picker
 *   listing one project would read as a general noun rather than as the note's
 *   own home;
 * - `inherit` is **"Same as the ticket"**, which names the RULE (the note is
 *   visible to whoever can see the ticket) instead of the mechanism, because
 *   "Inherit" tells a person nothing about what they are about to do;
 * - `explicit` is **"Specific people"**, which is what the picker under it
 *   asks for.
 */
export const SCOPE_LABELS: Record<NoteScopeMode, string> = {
  private: 'Private',
  workspace: 'Workspace',
  project: 'This project',
  inherit: 'Same as the ticket',
  explicit: 'Specific people',
};

/** A note's home: a workspace, and a project inside it or `''` for workspace level. */
export type HomeRef = { workspaceId: string; projectId: string };

/**
 * How a home travels in a `Select`, which carries one string.
 *
 * `ws:<id>` and `p:<workspaceId>:<projectId>`. The PREFIX is what makes the two
 * kinds distinguishable — a bare workspace id and a bare project id are both
 * 26-character ULIDs and a value-only encoding could not tell one from the
 * other, which would file a workspace-level note under a project whose id
 * happened to be the value.
 *
 * Colons are safe as separators here for the reason ULIDs are ULIDs: the
 * alphabet is Crockford base32, so neither id can contain one.
 */
export function homeValue(home: HomeRef): string {
  return home.projectId === '' ? `ws:${home.workspaceId}` : `p:${home.workspaceId}:${home.projectId}`;
}

/** The inverse of `homeValue`. A value it cannot parse answers `null` rather
 * than a guessed home: an unparseable value is a bug, and filing a note in a
 * fabricated workspace is worse than filing it nowhere. */
export function parseHome(value: string): HomeRef | null {
  if (value.startsWith('ws:')) return { workspaceId: value.slice(3), projectId: '' };
  if (value.startsWith('p:')) {
    const rest = value.slice(2);
    const split = rest.indexOf(':');
    if (split === -1) return null;
    return { workspaceId: rest.slice(0, split), projectId: rest.slice(split + 1) };
  }
  return null;
}

/**
 * Every home the person may file into: each workspace as itself, then each of
 * its projects (spec §9.3).
 *
 * The label carries the workspace on every project row — `"<ws> / <project>"` —
 * because a flat list of project names from several workspaces is ambiguous the
 * moment two of them share a name, and the person picking cannot see which one
 * the dialog meant.
 */
export function homeOptions(workspaces: { id: string; name: string; projects: { id: string; name: string }[] }[]): SelectOption[] {
  const options: SelectOption[] = [];
  for (const workspace of workspaces) {
    options.push({ value: homeValue({ workspaceId: workspace.id, projectId: '' }), label: `${workspace.name} — workspace` });
    for (const project of workspace.projects) {
      options.push({
        value: homeValue({ workspaceId: workspace.id, projectId: project.id }),
        label: `${workspace.name} / ${project.name}`,
      });
    }
  }
  return options;
}

/**
 * The scope options a home and a caller allow.
 *
 * Two of the five are CONDITIONAL, and both conditions are the domain's own
 * refusals rather than a UI preference:
 *
 * - **`project` needs a project home.** `noteCreatedPayload`'s second refine
 *   refuses `project` scope with `homeProjectId: ''` — a note visible to one
 *   project while filed nowhere has no project to be visible to.
 * - **`inherit` needs a ticket, in the SAME workspace.** The first refine
 *   refuses `inherit` without `attachTicketId`; the workspace half is this
 *   function's own, because inheriting from a ticket in another workspace is
 *   not a claim the reducer can resolve either.
 *
 * `private`, `workspace` and `explicit` are unconditional (18.193's control).
 */
export function scopeOptions(home: HomeRef, attachTicket?: { workspaceId: string }): SelectOption[] {
  const options: SelectOption[] = [
    { value: 'private', label: SCOPE_LABELS.private },
    { value: 'workspace', label: SCOPE_LABELS.workspace },
  ];
  if (home.projectId !== '') options.push({ value: 'project', label: SCOPE_LABELS.project });
  options.push({ value: 'explicit', label: SCOPE_LABELS.explicit });
  if (attachTicket !== undefined && attachTicket.workspaceId === home.workspaceId) {
    options.push({ value: 'inherit', label: SCOPE_LABELS.inherit });
  }
  return options;
}

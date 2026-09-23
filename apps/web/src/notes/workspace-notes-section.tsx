'use client';

import type { WorkspaceRef } from '@gisik-nokma/app-core';

/**
 * ONE workspace's branch of the notes tree (spec §9.2).
 *
 * ## Why one component per workspace rather than one call with every id
 *
 * This is the shape the page's hooks force, and it is worth stating because it
 * looks like an accident. A note list is a LIVE query — `useLiveQuery` opens
 * one subscription per key — and hooks cannot be called in a loop, so "one
 * workspace" is the largest unit that can be a component. The page therefore
 * renders one of these per workspace and each owns its own reads.
 *
 * ## What is here, and what is not, at Plan 5 Task 1
 *
 * The headings only: the workspace's `<h2>` and one `<h3>` per project. The rows,
 * the ticket keys, the Deleted group and the title filter land in Task 2, which
 * replaces the body of the two `<section>`s below — deliberately NOT a stub with
 * an invented empty list, because `getNotes: async () => []` rendered as "this
 * workspace has no notes" is a claim about the world that no read made.
 *
 * The nesting is the contract 18.183 asserts: each project's `<section>` is a
 * CHILD of its workspace's, so "the projects are grouped under their workspace"
 * is a shape and not a coincidence of ordering.
 */
export function WorkspaceNotesSection({ workspace }: { workspace: WorkspaceRef }) {
  return (
    <section className="gn-notes__section" data-testid={`notes-container-${workspace.id}`}>
      <h2 className="gn-notes__section-title">{workspace.name}</h2>
      {workspace.projects.map((project) => (
        <section
          key={project.id}
          className="gn-notes__group"
          data-testid={`notes-container-${project.id}`}
        >
          <h3 className="gn-notes__group-title">{project.name}</h3>
        </section>
      ))}
    </section>
  );
}

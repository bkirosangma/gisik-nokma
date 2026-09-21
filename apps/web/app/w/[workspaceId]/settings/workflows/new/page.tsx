'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReadOnlyBanner,
  TemplateGallery,
  WorkflowBuilderScreen,
  canAuthorRole,
  draftFromTemplate,
  newDraft,
  type WorkflowDraft,
} from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../../src/authoring/builder-wiring.js';
import { DocumentTitle } from '../../../../../../src/document-title.js';

/**
 * `/w/[workspaceId]/settings/workflows/new` — pick a template, then author.
 *
 * ## THE ROLE GATE HERE IS THIS ROUTE'S JOB, and it was recorded as owed
 *
 * The coordination doc's Plan 8 Task 12 section records, owner "Plan 8 Task 13":
 * `TemplateGallery` takes no session and applies no role check — `props.onPick`
 * is unconditional. Inside app-core that is harmless, because the only thing
 * that mounts the gallery is a list screen's `onNew`, which is `canAuthor ? … :
 * null`. The exposure is a ROUTE, and this is the route: the plan's own snippet
 * renders `<TemplateGallery>` as soon as the wiring resolves and never consults
 * `session.role`, so a member who TYPES this URL is handed the gallery the list
 * screen deliberately hid, picks a template, and lands on a read-only builder.
 *
 * No authoring action would escape — the banner shows and Publish is gone — but
 * an authoring *entry point* would be offered, and offering a door that leads
 * nowhere is its own kind of lie. So the gate is here, in the same commit as the
 * page, rather than retrofitted onto a component with no session to consult.
 *
 * `canAuthorRole` is imported, never re-spelled as `role === 'owner' || role ===
 * 'admin'`: a second copy of the predicate is free to drift from the one the
 * four screens use, and then two surfaces would disagree about one person.
 */
export default function NewWorkflowPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);

  return (
    <main className="gn-shell">
      <DocumentTitle title="New workflow" />
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">New workflow</h1>
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : !canAuthorRole(wiring.session.role) ? (
        <>
          <ReadOnlyBanner />
          <p>
            <a href={`/w/${workspaceId}/settings/workflows`}>Back to the workflows</a> — you can read
            every one of them.
          </p>
        </>
      ) : draft === null ? (
        <TemplateGallery
          onPick={(template) =>
            setDraft(template === null ? newDraft('New workflow') : draftFromTemplate(template))
          }
        />
      ) : (
        <WorkflowBuilderScreen
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          initialDraft={draft}
          onPublished={() => router.push(`/w/${workspaceId}/settings/workflows`)}
        />
      )}
    </main>
  );
}

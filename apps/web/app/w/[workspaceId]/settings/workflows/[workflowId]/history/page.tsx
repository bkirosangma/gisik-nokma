'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { WorkflowHistoryScreen } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../../../src/authoring/builder-wiring.js';
import { DocumentTitle } from '../../../../../../../src/document-title.js';

/**
 * `/w/[workspaceId]/settings/workflows/[workflowId]/history` — the version
 * chain of one workflow, opened by the list's second action (Task 3, lifted by
 * the owner 2026-09-19).
 *
 * Thin by design, exactly like its two siblings: session in, gateway out,
 * screen from app-core, and the breadcrumb this route owns because routing is
 * the one thing app-core cannot know. Every decision about what the chain shows
 * lives in `WorkflowHistoryScreen`.
 *
 * **The breadcrumb is the way back and it is the only one** — the same
 * arrangement, with the same reason, as the builder route one level up: it
 * renders ABOVE the screen's own load states, so it is available whether the
 * read is loading, refused, empty or loaded, which is precisely when a person
 * needs it. Its words are the builder route's (`Settings › Workflows`), one
 * level shallower than this page, because the chain is a view OF the workflow
 * list's subject rather than a fourth thing to name in the crumb.
 *
 * **Why this page is not a fourth screen in the prototype's set.** The
 * prototype draws no history view at all — see `WorkflowHistoryScreen`'s
 * docblock, which records that the prototype's `View history` handler fires a
 * toast and navigates nowhere, and that this is therefore the first screen in
 * this repo authored by the owner rather than ported from a drawing.
 */
export default function WorkflowHistoryPage() {
  const { workspaceId, workflowId } = useParams<{ workspaceId: string; workflowId: string }>();
  const wiring = useBuilderWiring(workspaceId);
  return (
    <main id="gn-main" className="gn-shell">
      <DocumentTitle title="Workflow history" />
      <AppNav workspaceId={workspaceId} />
      <nav className="gn-builder-crumb" aria-label="Breadcrumb">
        <Link href={`/w/${workspaceId}/settings/workflows`}>Settings › Workflows</Link>
      </nav>
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : (
        <WorkflowHistoryScreen
          workspaceId={workspaceId}
          workflowId={workflowId}
          gateway={wiring.gateway}
        />
      )}
    </main>
  );
}

'use client';

import { useParams, useRouter } from 'next/navigation';
import { WorkflowListScreen } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../src/authoring/builder-wiring.js';
import { DocumentTitle } from '../../../../../src/document-title.js';

/**
 * `/w/[workspaceId]/settings/workflows` — the workflows this workspace has
 * published.
 *
 * Thin by design: session in, gateway out, screen from app-core, and the two
 * jumps this route owns because routing is the one thing app-core cannot know.
 * Every decision about what a member may see or do lives in
 * `WorkflowListScreen`, behind `canAuthorRole`.
 */
export default function WorkflowsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  const base = `/w/${workspaceId}/settings/workflows`;
  return (
    <main id="gn-main" className="gn-shell">
      <DocumentTitle title="Workflows" />
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">Workflows</h1>
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : (
        <WorkflowListScreen
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          onOpen={(workflowId) => router.push(`${base}/${workflowId}`)}
          onHistory={(workflowId) => router.push(`${base}/${workflowId}/history`)}
          onNew={() => router.push(`${base}/new`)}
        />
      )}
    </main>
  );
}

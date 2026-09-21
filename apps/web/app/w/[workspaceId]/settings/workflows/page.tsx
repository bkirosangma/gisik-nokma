'use client';

import { useParams, useRouter } from 'next/navigation';
import { WorkflowListScreen } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../src/authoring/builder-wiring.js';

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
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      {/* P36 (2026-09-21). "Settings", NOT "Workflows" — the screen mounted
            below renders "<h2>Workflows</h2>", so this route painted the same word
            twice 6.4px apart: an h1 and, directly under it, an h2, with nothing
            between them to say what changed. The `/settings` shell has always
            drawn it the other way — `Settings` over the section title — and the
            finding's own reading of the export is the same shape. Both screens
            mount in BOTH places, so the h2 is right and this route was the
            duplicate. */}
        <h1 className="gn-page-title">Settings</h1>
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

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkflowBuilderScreen, draftFromPublished, type WorkflowDraft } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../../src/app-nav.js';
import { ShellRefusal } from '../../../../../../src/shell-refusal.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../../src/authoring/builder-wiring.js';

/**
 * `/w/[workspaceId]/settings/workflows/[workflowId]` — the published definition,
 * loaded onto the canvas as the starting draft.
 *
 * ## Four states, and the plan's snippet had two
 *
 * The plan renders `null` while `draft === null` and a sentence for `'missing'`.
 * That leaves a REJECTED read — a 500, a dropped connection — rendering a
 * spinner that never stops, which is the shell claiming the answer is on its
 * way. `getWorkflow` goes through `DataSource.getWorkflowDef`, whose 404 is
 * already `null` (the read affordance: "no such thing" and "not yours" are one
 * frozen body, deliberately), so `'missing'` is the honest sentence for that and
 * a rejection is a different fact needing a different one.
 */
export default function EditWorkflowPage() {
  const { workspaceId, workflowId } = useParams<{ workspaceId: string; workflowId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  const [draft, setDraft] = useState<
    { kind: 'loading' } | { kind: 'missing' } | { kind: 'failed'; why: string } | { kind: 'loaded'; draft: WorkflowDraft }
  >({ kind: 'loading' });
  const gateway = wiring.kind === 'ready' ? wiring.gateway : null;

  useEffect(() => {
    if (gateway === null) return;
    let cancelled = false;
    gateway.getWorkflow(workspaceId, workflowId).then(
      (published) => {
        if (cancelled) return;
        setDraft(
          published === null
            ? { kind: 'missing' }
            : { kind: 'loaded', draft: draftFromPublished(published) },
        );
      },
      (cause: unknown) => {
        if (cancelled) return;
        setDraft({ kind: 'failed', why: cause instanceof Error ? cause.message : String(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId, workflowId]);

  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : draft.kind === 'loading' ? (
        <p role="status">Loading this workflow…</p>
      ) : draft.kind === 'missing' ? (
        <p>No published workflow has this id — it may never have existed, or it may not be yours.</p>
      ) : draft.kind === 'failed' ? (
        <ShellRefusal what="This workflow" message={draft.why} />
      ) : (
        <WorkflowBuilderScreen
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          initialDraft={draft.draft}
          onPublished={() => router.push(`/w/${workspaceId}/settings/workflows`)}
        />
      )}
    </main>
  );
}

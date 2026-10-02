'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
    <main id="gn-main" className="gn-shell gn-shell--wide">
      <AppNav workspaceId={workspaceId} />
      {/* The breadcrumb back to the workflow list. Two things make this the
          route's job rather than `WorkflowBuilderScreen`'s: routing is the one
          thing app-core cannot know (`.../workflows/page.tsx`'s own docblock
          records the same line for its two jumps), and a plain `<a>` inside
          app-core would be a full document load where every other link in this
          product is a client-side navigation.

          This element is not an addition to the design — it is the one
          `apps/web/app/settings/page.tsx:94-96` already names as the reason the
          builder is the only settings sub-screen NOT inlined into that shell:
          "it carries its own breadcrumb back ('Settings › Workflows')". That
          sentence described an element that did not exist until now; the fix is
          to build it, not to delete the sentence.

          It renders ABOVE the load states, not inside them. The way back is
          available whether the read is loading, missing, refused or loaded —
          which is exactly the case a person needs it in. The text is the
          prototype's, character for character (`isBuilder`,
          `desktop.dc.html@6d7b67c0a52c:1015`), as a single link: the prototype
          makes the whole crumb one `goWorkflows` target, not a "Settings" link
          and a "Workflows" link that would both land in the same place. */}
      <nav className="gn-builder-crumb" aria-label="Breadcrumb">
        <Link href={`/w/${workspaceId}/settings/workflows`}>Settings › Workflows</Link>
      </nav>
      {/* The page's one h1 (UX fixes Task 5, case 23.071): the visible title is the name FIELD, which is not a heading. */}
      <h1 className="gn-visually-hidden">Edit workflow</h1>
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

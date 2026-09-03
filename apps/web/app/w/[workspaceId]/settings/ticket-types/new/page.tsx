'use client';

import { useParams, useRouter } from 'next/navigation';
import { ReadOnlyBanner, TicketTypeEditorScreen, canAuthorRole } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../../src/authoring/builder-wiring.js';

/**
 * `/w/[workspaceId]/settings/ticket-types/new` — a fresh type.
 *
 * The same role gate as `workflows/new/page.tsx`, and the coordination doc names
 * this file too: "`ticket-types/new/page.tsx` has the same shape". Unlike the
 * gallery route the exposure here is milder — `TicketTypeEditorScreen` DOES take
 * a session and disables every control for a non-author, so a member typing this
 * URL was never going to save anything. What they would get is a blank form they
 * cannot fill: an authoring entry point offered to somebody who has none. The
 * gate turns that into a sentence.
 *
 * `canAuthorRole` imported, not re-spelled — one predicate, four screens and now
 * two routes.
 */
export default function NewTicketTypePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">New ticket type</h1>
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : !canAuthorRole(wiring.session.role) ? (
        <>
          <ReadOnlyBanner />
          <p>
            <a href={`/w/${workspaceId}/settings/ticket-types`}>Back to the ticket types</a> — you
            can read every one of them.
          </p>
        </>
      ) : (
        <TicketTypeEditorScreen
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          initialDef={null}
          onSaved={() => router.push(`/w/${workspaceId}/settings/ticket-types`)}
        />
      )}
    </main>
  );
}

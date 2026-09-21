'use client';

import { useParams, useRouter } from 'next/navigation';
import { TicketTypeListScreen } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../src/authoring/builder-wiring.js';

/**
 * `/w/[workspaceId]/settings/ticket-types` — the workspace's ticket types and
 * the workflow each is bound to. Thin: the screen owns every role decision.
 */
export default function TicketTypesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(workspaceId);
  const base = `/w/${workspaceId}/settings/ticket-types`;
  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      {/* P36 (2026-09-21). "Settings", NOT "Ticket types" — the screen mounted
            below renders "<h2>Ticket types</h2>", so this route painted the same word
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
        <TicketTypeListScreen
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          onOpen={(typeId) => router.push(`${base}/${typeId}`)}
          onNew={() => router.push(`${base}/new`)}
        />
      )}
    </main>
  );
}

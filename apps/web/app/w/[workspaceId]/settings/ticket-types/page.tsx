'use client';

import { useParams, useRouter } from 'next/navigation';
import { TicketTypeListScreen } from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../src/app-nav.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../src/authoring/builder-wiring.js';
import { DocumentTitle } from '../../../../../src/document-title.js';

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
      <DocumentTitle title="Ticket types" />
      <AppNav workspaceId={workspaceId} />
      <h1 className="gn-page-title">Ticket types</h1>
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

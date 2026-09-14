'use client';

import { useParams } from 'next/navigation';
import { AppNav } from '../../../../../../src/app-nav.js';
import { NewTicketTypePane } from '../../../../../../src/ticket-type-editor-pane.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../../src/authoring/builder-wiring.js';

/**
 * `/w/[workspaceId]/settings/ticket-types/new` — a fresh type. `NewTicketTypePane`
 * (`src/ticket-type-editor-pane.tsx`) owns the role gate and the
 * breadcrumb+header+editor markup — the same pane `app/settings/page.tsx`
 * inlines on its own route, so this route is now a thin wrapper around it
 * rather than a second copy.
 */
export default function NewTicketTypePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const wiring = useBuilderWiring(workspaceId);
  const base = `/w/${workspaceId}/settings/ticket-types`;
  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : (
        <NewTicketTypePane
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          listHref={base}
        />
      )}
    </main>
  );
}

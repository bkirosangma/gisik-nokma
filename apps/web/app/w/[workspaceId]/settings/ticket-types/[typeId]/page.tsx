'use client';

import { useParams } from 'next/navigation';
import { AppNav } from '../../../../../../src/app-nav.js';
import { TicketTypeEditorPane } from '../../../../../../src/ticket-type-editor-pane.js';
import { WiringNotReady, useBuilderWiring } from '../../../../../../src/authoring/builder-wiring.js';

/**
 * `/w/[workspaceId]/settings/ticket-types/[typeId]` — one type, opened for
 * editing. `TicketTypeEditorPane` (`src/ticket-type-editor-pane.tsx`) owns the
 * fetch-by-id/loading/missing/failed logic and the breadcrumb+header+editor
 * markup — the same pane `app/settings/page.tsx` inlines on its own route, so
 * this route is now a thin wrapper around it rather than a second copy.
 */
export default function EditTicketTypePage() {
  const { workspaceId, typeId } = useParams<{ workspaceId: string; typeId: string }>();
  const wiring = useBuilderWiring(workspaceId);
  const base = `/w/${workspaceId}/settings/ticket-types`;
  return (
    <main id="gn-main" className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      {wiring.kind !== 'ready' ? (
        <WiringNotReady wiring={wiring} />
      ) : (
        <TicketTypeEditorPane
          workspaceId={workspaceId}
          session={wiring.session}
          gateway={wiring.gateway}
          typeId={typeId}
          listHref={base}
        />
      )}
    </main>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { makeSubmittedFactory } from '@gisik-nokma/app-core';
import { parseGraphRef, type GraphEdgeView, type GraphItemView, type TicketLinkKind } from '@gisik-nokma/domain';
import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import { useAppServices, useCurrentUser } from '../providers.js';
import { ShellRefusal } from '../shell-refusal.js';
import { useIsPhone } from '../use-is-phone.js';
import { useGraphScope } from './use-graph-scope.js';

/** Client-only: WebGL, matchMedia and localStorage (spec C §4.1). The Sigma adapter is a further `import()` inside. */
const KnowledgeGraph = dynamic(() => import('@gisik-nokma/knowledge-graph').then((m) => m.KnowledgeGraph), { ssr: false });

export type GraphPanelProps = {
  /** `kind:id` (`kgNodeId`). */
  centre: string;
  /** The host's workspace: the scope the view opens with (§3.5). */
  workspaceId: string;
  /** Absent = a ticket item gets no Open button (the host has no sheet to open it in). */
  onOpenTicket?: (id: string) => void;
  /** Spec A's "Add link" on an empty ticket centre: the ticket tab returns the sheet to Details. Absent = no button. */
  onShowLinks?: () => void;
};

/**
 * The Knowledge Graph as the web hosts it (KG-C T9): the ticket sheet's fourth tab and the note's panel. It hands the
 * view the app's graph gateway, the viewer's scope choices, a page per kind to open, and spec A's link removal.
 */
export function GraphPanel(props: GraphPanelProps) {
  const { graph, dataSource } = useAppServices();
  const actorId = useCurrentUser()?.id ?? ''; // the panel only mounts signed in (the sheet and the note are)
  const phone = useIsPhone();
  const { scope, error } = useGraphScope();
  const router = useRouter();
  if (error !== null) return <ShellRefusal what="Your workspaces" message={error} />;
  if (scope === null) {
    return (
      <SkeletonRegion label="Loading the Knowledge Graph" className="gn-kg-panel gn-kg-panel--loading">
        <Skeleton shape="block" height="100%" />
      </SkeletonRegion>
    );
  }
  const onOpen = (item: GraphItemView) => {
    if (item.kind === 'ticket') props.onOpenTicket?.(item.id);
    else if (item.kind === 'note') router.push(`/notes/${item.id}`);
    else if (item.kind === 'project' && item.workspaceId !== null) router.push(`/w/${item.workspaceId}/p/${item.id}`);
    else if (item.kind === 'workspace') router.push(`/w/${item.id}`);
  };
  /**
   * Spec A's removal (A §2.2): `ticket.link_removed` on the stored SOURCE's stream, whichever end the viewer is
   * centred on, the way the ticket sheet's Links section files it; Undo files `ticket.link_added` again (A §3.1).
   */
  const onRemoveLink = async (edge: GraphEdgeView) => {
    const source = parseGraphRef(edge.from)!;
    const target = parseGraphRef(edge.to)!;
    const make = makeSubmittedFactory({ actorId, origin: 'web' });
    const kind = edge.kind as TicketLinkKind;
    const submit = async (type: 'ticket.link_removed' | 'ticket.link_added') => {
      const [result] = await dataSource.ingest([
        make({ workspaceId: props.workspaceId, entity: { kind: 'ticket', id: source.id }, type, payload: { kind, targetId: target.id } }),
      ]);
      // IngestResult (`packages/domain/src/ingest-result.ts`): committed | invalid { message } | refused { rule, reason }.
      if (result === undefined || result.status === 'committed') return;
      throw new Error(result.status === 'refused' ? `refused by ${result.rule}: ${result.reason}` : result.message);
    };
    await submit('ticket.link_removed');
    return { undo: () => submit('ticket.link_added') };
  };
  return (
    <div className="gn-kg-panel">
      <KnowledgeGraph
        centre={props.centre}
        config={phone ? 'phone' : 'desktop'}
        source={graph}
        scope={scope}
        defaultWorkspaceIds={[props.workspaceId]}
        onOpen={onOpen}
        // Person and concept have no page, and a ticket opens only where the host has a sheet for it.
        canOpen={(item) => item.kind !== 'person' && item.kind !== 'concept' && (item.kind !== 'ticket' || props.onOpenTicket !== undefined)}
        onAddLink={props.onShowLinks ? () => props.onShowLinks!() : undefined}
        onRemoveLink={onRemoveLink}
      />
    </div>
  );
}

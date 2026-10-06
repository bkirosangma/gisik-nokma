'use client';

import { kgNodeId } from '@gisik-nokma/knowledge-graph/ids';
import type { KnowledgeGraphSlotComponent } from '@gisik-nokma/app-core';
import { GraphPanel } from './graph-panel.js';

/** The ticket sheet's `knowledgeGraphSlot` (spec C §1): the graph centred on this ticket, `Add link` back to Details. */
export const TicketGraphTab: KnowledgeGraphSlotComponent = ({ workspaceId, ticketId, onOpenTicket, onShowLinks }) => (
  <GraphPanel centre={kgNodeId('ticket', ticketId)} workspaceId={workspaceId} onOpenTicket={onOpenTicket} onShowLinks={onShowLinks} />
);

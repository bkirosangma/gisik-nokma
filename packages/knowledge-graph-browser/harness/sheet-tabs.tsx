import { createRoot } from 'react-dom/client';
// The web app's stylesheet, then ui.css: the order the BUILT app serves them (measured on the stack, 2026-10-06:
// globals.css's chunk is linked before ui.css's, although `apps/web/app/layout.tsx` imports ui.css first), so an
// equal-specificity tie is won here as it is in the product (kg-walk-fixes-2 item 2, case 27.687).
import '../../../apps/web/app/globals.css';
import '@gisik-nokma/ui/ui.css';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import { TicketSheet, type KnowledgeGraphSlotComponent } from '@gisik-nokma/app-core';
import type { GraphRingResponse } from '@gisik-nokma/domain';
import { KnowledgeGraph, type GraphSource, type ScopeChoices } from '@gisik-nokma/knowledge-graph';
import { createSigmaRenderer } from '@gisik-nokma/knowledge-graph/sigma';
// app-core's own sanctioned fake and seeds (`packages/app-core/test/helpers`), so the sheet reads what its unit cases read.
import { createFakeDataSource } from '../../app-core/test/helpers/fake-data-source.js';
import { WF_ERRAND, claim, ticketStateSeed } from '../../app-core/test/helpers/seed.js';
import { fixtureRing } from './fixture-source.js';

/*
 * The ticket sheet's four sections in a real browser (kg-walk-fixes-2 item 1, cases 27.680-27.683): the REAL `TicketSheet`
 * (its header, chips and Details grid as the product draws them) with the REAL Knowledge Graph in its fourth tab, mounted
 * as `apps/web/src/knowledge-graph/graph-panel.tsx` mounts it (`.gn-kg-panel`, `config` phone at <=40rem, Add link back to
 * Details), on the view harness's fixture centred on GN-142. `?world=lonely`: nothing is linked to GN-142, so the view's
 * empty state offers Add link, which takes the sheet back to Details (the one host-driven change of section, 27.683).
 * `?theme=dark`, `?style=hig|minimal` (neo by default, as the shell). The title is the release walk's own two-line one.
 */
const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.style = params.get('style') || 'neo';
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')!;
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const WS = 'gn';
const TICKET = 't142';
const SCOPE: ScopeChoices = {
  workspaces: [
    { id: 'gn', name: 'Gisik Nokma', projects: [{ id: 'j_mw', name: 'Mobile web' }, { id: 'j_wf', name: 'Workflows' }, { id: 'j_ds', name: 'Design' }] },
    { id: 'st', name: 'Studio', projects: [{ id: 'j_web', name: 'Website' }, { id: 'j_br', name: 'Brand' }] },
  ],
};

const read = {
  ticket: ticketStateSeed({ id: TICKET, workspaceId: WS }),
  title: 'Apple Developer Program (organisation)',
  stateProvenance: claim(),
  assignedProvenance: null,
  parent: null,
  rollup: null,
  key: 'GN-142',
  epic: null,
  visibility: { ownMode: 'inherit' as const, resolvedMode: 'project' as const },
};
const dataSource = createFakeDataSource({
  getTicket: async () => read,
  getWorkflowDef: async () => WF_ERRAND,
  getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
});

const lonely: GraphSource = {
  ring: async (q): Promise<GraphRingResponse> => ({
    hop: q.hops,
    center: { ref: 'ticket:t142', kind: 'ticket', id: TICKET, workspaceId: WS, projectId: 'j_mw', label: 'GN-142', title: read.title, category: 'open', hop: 0, out: false, suggested: false },
    items: [], edges: [], frontier: [], truncated: false, cursor: null,
  }),
};
const fixture: GraphSource = { ring: (q) => fixtureRing({ ...q, workspaceIds: [...q.workspaceIds], projectIds: [...q.projectIds], groups: [...q.groups] }) };
const phone = window.matchMedia('(max-width: 40rem)').matches;
const GraphTab: KnowledgeGraphSlotComponent = ({ onShowLinks }) => (
  <div className="gn-kg-panel">
    <KnowledgeGraph
      centre="ticket:t142"
      config={phone ? 'phone' : 'desktop'}
      source={params.get('world') === 'lonely' ? lonely : fixture}
      scope={SCOPE}
      defaultWorkspaceIds={[WS]}
      onOpen={() => undefined}
      onAddLink={() => onShowLinks()}
      createRenderer={async () => () => createSigmaRenderer()}
    />
  </div>
);

createRoot(document.getElementById('root')!).render(
  <TicketSheet dataSource={dataSource} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={() => undefined} knowledgeGraphSlot={GraphTab} />,
);

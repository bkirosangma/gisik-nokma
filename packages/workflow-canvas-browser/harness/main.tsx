import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  WORKFLOW_TEMPLATES,
  WorkflowBuilderScreen,
  createFakeGateway,
  draftFromTemplate,
  draftStorageKey,
  type BuilderSession,
} from '@gisik-nokma/app-core';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';

const params = new URLSearchParams(window.location.search);
const template = WORKFLOW_TEMPLATES.find((candidate) => candidate.id === params.get('seed')) ?? WORKFLOW_TEMPLATES[0]!;
// The product's own head: the theme variables `ui.css` reads (apps/web/app/layout.tsx), neo by default like the shell.
document.documentElement.dataset.style = params.get('style') || 'neo';
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme')!;
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const initialDraft = draftFromTemplate(template);
const WORKSPACE_ID = 'ws1';
const session: BuilderSession = { userId: 'u1', role: (params.get('role') || 'owner') as BuilderSession['role'] };

// The draft the screen persists on every change: a test reads positions from here, which is the store's own state.
(window as unknown as { __draftPositions: () => unknown }).__draftPositions = () =>
  (JSON.parse(window.sessionStorage.getItem(draftStorageKey(WORKSPACE_ID, initialDraft.def.id)) ?? 'null') as { positions?: unknown } | null)?.positions;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkflowBuilderScreen
      workspaceId={WORKSPACE_ID}
      session={session}
      gateway={createFakeGateway({ members: [], ticketTypes: [] })}
      initialDraft={initialDraft}
    />
  </StrictMode>,
);

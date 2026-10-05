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

/**
 * G-9 T5 (planner ruling 2026-10-04 Q3): `?stableDraft=1` gives the draft this FIXED id, so a reload reads the same storage key (25.556).
 * Opt-in: by default every load mints a fresh id, so a second `openHarness` in one test never restores the first one's stored draft
 * (E5-41), which 25.526 and 25.541 rely on.
 */
const HARNESS_DRAFT_ID = 'harness-draft';
const fresh = draftFromTemplate(template);
const initialDraft = params.get('stableDraft') === '1' ? { ...fresh, def: { ...fresh.def, id: HARNESS_DRAFT_ID } } : fresh;
// Fixed ULIDs (G-9 T5): Publish runs the event through the shipped envelope schema (the fake gateway's `submit`), which refuses a
// workspace or actor id that is not a ULID; fixed, so a reload reads the same storage key.
const WORKSPACE_ID = '01JA0000000000000000000000';
const session: BuilderSession = { userId: '01JA0000000000000000000001', role: (params.get('role') || 'owner') as BuilderSession['role'] };

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

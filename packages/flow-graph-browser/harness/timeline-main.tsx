import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TimelineView, type TicketDatesInput } from '@gisik-nokma/app-core';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';

/**
 * The product's own Timeline view (the BUILT `@gisik-nokma/app-core`) over a synthetic project, in a page the specs drive.
 * `?n=<tickets>&span=<days the tickets are spread over>&h=<panel height>&theme=light|dark&style=neo|hig|minimal`.
 * Today is the fixed day 60 after 2026-08-03 (an injected prop, like the product's: nothing here reads the clock).
 */
const params = new URLSearchParams(window.location.search);
document.documentElement.dataset['style'] = params.get('style') || 'neo';
if (params.get('theme')) document.documentElement.dataset['theme'] = params.get('theme') as string;
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const claim = (value: unknown) => ({ value, actorId: 'u1', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' });
const n = Number(params.get('n') ?? 40);
const span = Number(params.get('span') ?? 400);
const base = Date.UTC(2026, 7, 3);
const day = (offset: number): string => new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
const tickets: TicketDatesInput[] = Array.from({ length: n }, (_, i) => {
  const start = Math.floor((i * span) / n);
  const length = 1 + ((i * 7) % 12);
  return {
    key: `GN-${100 + i}`,
    state: {
      kind: 'ticket', id: `t${i}`, workspaceId: 'w', projectId: 'p', typeId: 'task', parentId: i % 9 === 0 ? 'epic1' : null, workflowId: 'wf', workflowVersion: 1,
      stateId: 's', stateCategory: i % 4 === 0 ? 'terminal' : i % 4 === 1 ? 'active' : 'open', assigneeId: null, collaboratorIds: [],
      fields: {
        title: claim(`Ticket ${i} with a long title`),
        startDate: claim({ date: day(start) }),
        dueDate: claim({ date: day(start + length - 1) }),
        ...(i % 7 === 0 ? { 'filed-on': claim(day(start + 1)) } : {}),
      },
      transitions: [],
    },
    pendingFieldIds: [],
    customDateFields: [{ id: 'filed-on', name: 'Filed on' }],
  } as unknown as TicketDatesInput;
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <div id="host" style={{ height: params.get('h') ?? '70vh', display: 'flex', flexDirection: 'column' }}>
      <TimelineView tickets={tickets} today={day(60)} userName={(id) => id} onOpenTicket={(id) => ((window as unknown as { __opened: string }).__opened = id)} />
    </div>
  </StrictMode>,
);

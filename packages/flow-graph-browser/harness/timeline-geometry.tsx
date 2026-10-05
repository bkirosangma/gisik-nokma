import { createRoot } from 'react-dom/client';
import { TimelineView, type TicketDatesInput } from '@gisik-nokma/app-core';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';

/**
 * `timeline-geometry.html`: the product's own Timeline view over a fixed geometry seed, for the real-browser layout cases (29.089).
 * Not a stress page: the stress page's 2,000-ticket scene and its recorded numbers stay as they are. The seed is a draft row
 * (KEYLESS one-day bars on twelve adjacent days, the shape ERRATA E11 found overlapping at the Month preset) and eight keyed
 * one-day bars three days apart, whose keys are drawn outside them at Month.
 */
const host = document.getElementById('host') as HTMLElement;
document.documentElement.dataset['style'] = 'neo';
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const claim = (value: unknown) => ({ value, actorId: 'u1', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' });
const DAY = 86_400_000;
const TODAY = '2026-10-03';
const iso = (offset: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);

function oneDay(id: string, key: string | null, offset: number): TicketDatesInput {
  return {
    key,
    state: {
      kind: 'ticket', id, workspaceId: 'w', projectId: 'p', typeId: 'task', parentId: null, workflowId: 'wf', workflowVersion: 1,
      stateId: 's', stateCategory: 'open', assigneeId: null, collaboratorIds: [],
      fields: { title: claim(`Ticket ${id}`), startDate: claim({ date: iso(offset) }), dueDate: claim({ date: iso(offset) }) },
      transitions: [],
    },
    pendingFieldIds: [], customDateFields: [],
  } as unknown as TicketDatesInput;
}

const tickets: TicketDatesInput[] = [
  ...Array.from({ length: 12 }, (_, i) => oneDay(`d${i}`, null, i - 6)),
  ...Array.from({ length: 8 }, (_, i) => oneDay(`k${i}`, `GN-${200 + i}`, i * 3 - 12)),
];
createRoot(host).render(<TimelineView tickets={tickets} today={TODAY} userName={(id) => id} onOpenTicket={() => undefined} />);

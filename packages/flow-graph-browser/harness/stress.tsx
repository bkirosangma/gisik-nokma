import { createRoot } from 'react-dom/client';
import { TimelineView, type TicketDatesInput } from '@gisik-nokma/app-core';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';
import { frameStats, samplePan } from './sampler.js';
import type { SceneName, StressRecord } from './results.js';
import { flowScene, timeScene, type Scene } from './scenes.js';

/**
 * `stress.html?scene=time|flow|view&n=<count>[&auto=1]`. Three pans; the first is warm-up and the second is the record
 * (`window.__stress`, the screen, and POST /__results). `view` is the product's own Timeline view at `n` dated tickets: at T1
 * it is the shipped week-column grid (the baseline); after the lift it is the continuous view, so the same page measures both.
 */
const params = new URLSearchParams(location.search);
const scene = (params.get('scene') ?? 'time') as SceneName;
const DEFAULTS: Record<SceneName, number> = { time: 1200, flow: 300, view: 2000 };
const count = Number(params.get('n') ?? DEFAULTS[scene]);
const host = document.getElementById('host') as HTMLElement;
const out = document.getElementById('out') as HTMLElement;
document.documentElement.dataset['style'] = 'neo';
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

const claim = (value: unknown) => ({ value, actorId: 'u1', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' });
const DAY = 86_400_000;
const TODAY = '2026-10-03';
function tickets(n: number): TicketDatesInput[] {
  const base = Date.parse(`${TODAY}T00:00:00Z`) - 28 * DAY;
  return Array.from({ length: n }, (_, i) => {
    const start = base + ((i * 7) % 700) * DAY;
    const end = start + (i % 14) * DAY;
    const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    return {
      key: `GN-${100 + i}`,
      state: {
        kind: 'ticket', id: `t${i}`, workspaceId: 'w', projectId: 'p', typeId: 'task', parentId: null, workflowId: 'wf', workflowVersion: 1,
        stateId: 's', stateCategory: i % 4 === 0 ? 'terminal' : i % 4 === 1 ? 'active' : 'open', assigneeId: null, collaboratorIds: [],
        fields: { title: claim(`Ticket ${i} with a long title`), startDate: claim({ date: iso(start) }), dueDate: claim({ date: iso(end) }) },
        transitions: [],
      },
      pendingFieldIds: [], customDateFields: [],
    } as unknown as TicketDatesInput;
  });
}

/** The view scene pans the product's own scroller: the continuous view's canvas if it has one, else the page. */
function viewScene(): Scene {
  host.replaceChildren();
  const mount = document.createElement('div');
  host.appendChild(mount);
  createRoot(mount).render(<TimelineView tickets={tickets(count)} today={TODAY} userName={(id) => id} onOpenTicket={() => undefined} />);
  return {
    count,
    async pan(durationMs) {
      const canvas = document.querySelector<HTMLElement>('.gn-timeline__canvas');
      const target = canvas ?? document.scrollingElement ?? document.documentElement;
      target.scrollTo(0, 0);
      let direction = 1;
      const horizontal = canvas !== null;
      const gaps = await samplePan((dt) => {
        const size = horizontal ? target.clientWidth : window.innerHeight;
        const max = horizontal ? target.scrollWidth - target.clientWidth : target.scrollHeight - window.innerHeight;
        const now = horizontal ? target.scrollLeft : target.scrollTop;
        const next = now + (direction * size * dt) / 1000;
        if (next >= max || next <= 0) direction = -direction;
        const clamped = Math.min(max, Math.max(0, next));
        if (horizontal) target.scrollLeft = clamped;
        else target.scrollTop = clamped;
      }, durationMs);
      return frameStats(gaps);
    },
  };
}

/** A nav button's word without its aria-hidden glyph: the shipped `Later` button's text is `Later›`. */
const wordOf = (button: HTMLButtonElement): string => (button.textContent ?? '').replace(/[‹›]/g, '').trim();

/** Click -> the frame after the click's work settled (two frames: React commit, then paint). Null when the page has no Later / Today. */
async function clickToSettle(): Promise<number | null> {
  const buttons = [...host.querySelectorAll('button')];
  const button = buttons.find((b) => wordOf(b) === 'Later') ?? buttons.find((b) => wordOf(b) === 'Today');
  if (button === undefined) return null;
  const t0 = performance.now();
  button.click();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return Math.round((performance.now() - t0) * 10) / 10;
}

async function go(): Promise<void> {
  out.textContent = 'running...';
  const s = scene === 'time' ? timeScene(host, count) : scene === 'flow' ? flowScene(host, count) : viewScene();
  await new Promise((resolve) => setTimeout(resolve, 600));
  await s.pan(2000);
  const pan = await s.pan(2000);
  const clickToSettleMs = scene === 'view' ? await clickToSettle() : null;
  const record: StressRecord = { scene, count: s.count, device: navigator.userAgent, touch: navigator.maxTouchPoints > 0, pan, clickToSettleMs };
  (window as unknown as { __stress: StressRecord }).__stress = record;
  out.textContent = `${scene}: ${s.count} on the page\n${pan.fps} frames a second, worst frame ${pan.worstMs} ms, p95 ${pan.p95Ms} ms\nframes over 16.7 / 20 / 50 ms: ${pan.over167} / ${pan.over20} / ${pan.over50}\n${clickToSettleMs === null ? '' : `click to settle ${clickToSettleMs} ms\n`}${navigator.userAgent}`;
  await fetch('/__results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) }).catch(() => undefined);
}
document.getElementById('run')!.addEventListener('click', () => void go());
if (params.has('auto')) void go();

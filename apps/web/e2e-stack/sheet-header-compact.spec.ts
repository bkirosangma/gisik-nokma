import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openSeededBoard } from './helpers/board.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * Smoothness G-8 (cases 25.431–25.433): the phone ticket-sheet header compacts with the scroll by TRANSFORMING the same elements, and
 * it does not jitter. Read from a lane-port `next dev` of the worktree, signed in against the stack. LOCAL.
 *
 * ## Running it
 *
 * The stack serves the primary checkout's built image, so a CSS or component change in a worktree is invisible to it.
 * `SHEET_COMPACT_ORIGIN` points the SCREENS at a lane-port `next dev` of the worktree
 * (`SERVER_ORIGIN=http://localhost:3000 next dev -p <port>`, after `pnpm exec turbo run build --filter='@gisik-nokma/web^...'`:
 * the web app reads app-core's dist); sign-in still happens against the stack and its cookie is shared across ports on `localhost`.
 *
 * ## What "no jitter" is measured as
 *
 * The scroller is `.gn-sheet__body`. The header sits OUTSIDE its flow (an absolute overlay) and the body reserves the header's full
 * height once, so nothing the header does can move the content. A wheel scroll in small steps then has to satisfy, at every step:
 *
 *   - `scrollTop` never goes backwards on the way down (a header that reflowed the body would fight the scroll and bounce it);
 *   - the content's first row keeps its position in CONTENT coordinates: `rect.top + scrollTop` is the same number at every step
 *     (it moved by exactly the scroll delta);
 *   - no in-flow height changes: the scroller's `scrollHeight`, `clientHeight` and the first row's `offsetHeight` are constant;
 *   - the layout-shift observer reports a cumulative shift of 0.
 *
 * Control, in the same test: the header's own height DID change over the same scroll (otherwise the test would pass for a header that
 * never compacts). The named mutation (`.gn-sheet[data-compact] .gn-sheet__header` back in the flow, `position: static`) turns it red.
 */

const ORIGIN = process.env['SHEET_COMPACT_ORIGIN'] ?? '';
const REPORT_DIR = process.env['SHEET_COMPACT_REPORT_DIR'] ?? '';

interface Opened {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly ticketId: string;
}

async function openSheet(page: Page): Promise<Opened> {
  await signIn(page, OWNER_EMAIL);
  const { workspaceId, projectId } = await openSeededBoard(page);
  const firstCard = page.locator('[data-testid^="ticket-card-"]').first();
  await expect(firstCard).toBeVisible({ timeout: 20_000 });
  const testId = await firstCard.getAttribute('data-testid');
  const ticketId = testId?.replace('ticket-card-', '') ?? '';
  expect(ticketId, 'a ticket id must be readable off the board').not.toBe('');
  await page.goto(`${ORIGIN}/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 });
  return { workspaceId, projectId, ticketId };
}

/** The seeded ticket is short; make the scroller long enough to compact fully and then some. */
async function ensureScrollable(page: Page): Promise<void> {
  await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.gn-sheet__body');
    if (body === null) throw new Error('no .gn-sheet__body');
    if (body.scrollHeight - body.clientHeight >= 700) return;
    const pad = document.createElement('div');
    pad.setAttribute('data-test-spacer', '');
    pad.style.height = '1400px';
    body.appendChild(pad);
  });
}

interface Frame {
  readonly scrollTop: number;
  readonly contentY: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly firstRowHeight: number;
  readonly headerHeight: number;
  readonly p: number;
  readonly mode: string;
}

async function frame(page: Page): Promise<Frame> {
  return page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.gn-sheet__body')!;
    const panel = document.querySelector<HTMLElement>('.gn-sheet')!;
    const header = document.querySelector<HTMLElement>('.gn-sheet__header')!;
    const first = body.firstElementChild as HTMLElement;
    const rect = first.getBoundingClientRect();
    return {
      scrollTop: body.scrollTop,
      contentY: rect.top + body.scrollTop,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      firstRowHeight: first.offsetHeight,
      headerHeight: header.getBoundingClientRect().height,
      p: Number(panel.style.getPropertyValue('--p') || '0'),
      mode: panel.getAttribute('data-compact') ?? '',
    };
  });
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function wheelTo(page: Page, targetTop: number, step: number, record: Frame[]): Promise<void> {
  for (let guard = 0; guard < 400; guard += 1) {
    const now = await frame(page);
    if (step > 0 ? now.scrollTop >= targetTop : now.scrollTop <= targetTop) return;
    await page.mouse.wheel(0, step);
    await settle(page);
    record.push(await frame(page));
  }
  throw new Error(`the wheel never reached ${targetTop}`);
}

test.describe('25.431 the phone header compacts without jitter', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a small-step wheel scroll down and back up: the content moves by exactly the scroll delta, no in-flow height changes, CLS 0', async ({ page }) => {
    await openSheet(page);
    await ensureScrollable(page);
    await page.mouse.move(195, 500);
    await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __clsWho: string[] };
      w.__cls = 0;
      w.__clsWho = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as {
            value: number;
            hadRecentInput: boolean;
            sources?: { node: Element | null; previousRect: DOMRect; currentRect: DOMRect }[];
          };
          if (shift.hadRecentInput) continue;
          w.__cls += shift.value;
          for (const src of shift.sources ?? []) {
            const el = src.node;
            const name = el === null ? 'detached' : `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)}`;
            w.__clsWho.push(`${name} ${Math.round(src.previousRect.top)}->${Math.round(src.currentRect.top)} (${shift.value})`);
          }
        }
      }).observe({ type: 'layout-shift', buffered: false });
    });

    const start = await frame(page);
    expect(start.mode).toBe('full');
    expect(start.scrollTop).toBe(0);
    const down: Frame[] = [start];
    await wheelTo(page, 320, 6, down);
    const bottomOfRange = await frame(page);
    expect(bottomOfRange.mode, 'the header reached its compact state').toBe('compact');
    expect(bottomOfRange.p).toBe(1);
    const up: Frame[] = [bottomOfRange];
    await wheelTo(page, 0, -6, up);

    // Monotonic on the way down; monotonic (the other way) on the way up.
    for (let i = 1; i < down.length; i += 1) expect(down[i]!.scrollTop, `down step ${i}`).toBeGreaterThanOrEqual(down[i - 1]!.scrollTop);
    for (let i = 1; i < up.length; i += 1) expect(up[i]!.scrollTop, `up step ${i}`).toBeLessThanOrEqual(up[i - 1]!.scrollTop);
    // The progress follows it, never backwards on the way down.
    for (let i = 1; i < down.length; i += 1) expect(down[i]!.p, `p step ${i}`).toBeGreaterThanOrEqual(down[i - 1]!.p);

    const all = [...down, ...up];
    // The content's first row keeps its position in content coordinates: it moved by exactly the scroll delta.
    const y0 = start.contentY;
    for (const f of all) expect(Math.abs(f.contentY - y0), `contentY at scrollTop ${f.scrollTop}`).toBeLessThan(0.51);
    // No in-flow height changes.
    for (const f of all) {
      expect(f.scrollHeight, `scrollHeight at ${f.scrollTop}`).toBe(start.scrollHeight);
      expect(f.clientHeight, `clientHeight at ${f.scrollTop}`).toBe(start.clientHeight);
      expect(f.firstRowHeight, `first row height at ${f.scrollTop}`).toBe(start.firstRowHeight);
    }
    // CONTROL: the header itself did change over the same scroll — the test would pass for a header that never compacts.
    expect(start.headerHeight - bottomOfRange.headerHeight, 'the header shrank').toBeGreaterThan(40);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    const who = await page.evaluate(() => (window as unknown as { __clsWho: string[] }).__clsWho);
    expect(cls, `layout shifts: ${who.join(' | ')}`).toBe(0);
  });
});

test.describe('25.432 the three frames, the overlays and the desktop control', () => {
  test('390: p = 0, 0.5 and 1 are the same elements moved; the compact line is one row; the overlays overlay', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSheet(page);
    await ensureScrollable(page);
    const report: string[] = [];
    const shot = async (name: string): Promise<void> => {
      if (REPORT_DIR === '') return;
      mkdirSync(REPORT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(REPORT_DIR, `sheet-header-${name}.png`) });
    };
    const geometry = async (): Promise<{ crumbTops: number[]; titleTop: number; titleHeight: number; closeRight: number; headerWidth: number; moveOpacity: string }> =>
      page.evaluate(() => {
        const header = document.querySelector<HTMLElement>('.gn-sheet__header')!;
        const hr = header.getBoundingClientRect();
        const items = Array.from(document.querySelectorAll<HTMLElement>('.gn-ticket-sheet__crumbs > *'));
        const title = document.querySelector<HTMLElement>('.gn-ticket-sheet__title-input')!;
        const close = document.querySelector<HTMLElement>('.gn-sheet__close')!;
        const move = document.querySelector<HTMLElement>('.gn-sheet__move')!;
        return {
          crumbTops: items.filter((el) => getComputedStyle(el).opacity !== '0').map((el) => Math.round(el.getBoundingClientRect().top - hr.top)),
          titleTop: title.getBoundingClientRect().top - hr.top,
          titleHeight: title.getBoundingClientRect().height,
          closeRight: hr.right - close.getBoundingClientRect().right,
          headerWidth: hr.width,
          moveOpacity: getComputedStyle(move).opacity,
        };
      });

    const full = await geometry();
    await shot('p0');
    // FIDELITY AT p = 0: the top of the sheet must read exactly as it did before the header learned to compact. Every moving
    // element's box is read as laid out now (absolute, placed by transform) and again in the plain flow (compact attribute off,
    // transforms off, transitions off); each must be within half a pixel. A measurement that counted a stale transform (a button's
    // own `transform` transition) put Move 240px to the right of where it belongs, which only a comparison like this sees.
    const drift = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.gn-sheet')!;
      const header = panel.querySelector<HTMLElement>('.gn-sheet__header')!;
      const boxes = (): number[][] =>
        Array.from(
          header.querySelectorAll<HTMLElement>('.gn-ticket-sheet__crumbs > *, .gn-ticket-sheet__title-input, .gn-sheet__close, .gn-sheet__move'),
        ).map((el) => {
          const r = el.getBoundingClientRect();
          return [r.left, r.top, r.width, r.height];
        });
      const placed = boxes();
      const mode = panel.getAttribute('data-compact') ?? 'full';
      const els = Array.from(header.querySelectorAll<HTMLElement>('*'));
      panel.removeAttribute('data-compact');
      for (const el of els) {
        el.style.transition = 'none';
        el.style.transform = 'none';
      }
      const natural = boxes();
      panel.setAttribute('data-compact', mode);
      for (const el of els) el.style.removeProperty('transform');
      void header.offsetWidth;
      for (const el of els) el.style.removeProperty('transition');
      return placed.map((box, i) => box.map((n, k) => Math.abs(n - (natural[i]?.[k] ?? Number.NaN))));
    });
    expect(drift.length).toBeGreaterThan(5);
    for (const box of drift) for (const d of box) expect(d, `p0 box drift ${JSON.stringify(drift)}`).toBeLessThanOrEqual(0.5);
    const first = await frame(page);
    expect(first.mode).toBe('full');
    // p = 0.5 and p = 1 by the scroll that makes them.
    const range = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.gn-sheet')!;
      const h0 = Number(panel.style.getPropertyValue('--gh-h0'));
      const h1 = Number(panel.style.getPropertyValue('--gh-h1'));
      return Math.min(240, Math.max(120, h0 - h1));
    });
    await page.evaluate((top) => {
      document.querySelector<HTMLElement>('.gn-sheet__body')!.scrollTop = top;
    }, range / 2);
    await settle(page);
    const half = await frame(page);
    expect(half.p).toBeGreaterThan(0.4);
    expect(half.p).toBeLessThan(0.6);
    await shot('p0.5');
    await page.evaluate((top) => {
      document.querySelector<HTMLElement>('.gn-sheet__body')!.scrollTop = top;
    }, range + 40);
    await settle(page);
    const compact = await geometry();
    await shot('p1');
    const last = await frame(page);
    expect(last.p).toBe(1);

    // The same elements: nothing was added or removed between the frames.
    expect(compact.crumbTops.length).toBeGreaterThan(0);
    // Compact: one row of crumbs (all at the same top), the title below it, the ✕ at the right edge, Move gone.
    expect(new Set(compact.crumbTops).size, 'the compact crumbs are on one line').toBe(1);
    expect(compact.titleTop).toBeGreaterThan(compact.crumbTops[0]! + 10);
    expect(compact.closeRight).toBeLessThan(20);
    expect(Number(compact.moveOpacity)).toBe(0);
    // Full: the crumbs wrap or sit on rows, the title is large; compact is smaller than full.
    expect(full.titleHeight).toBeGreaterThan(compact.titleHeight);
    expect(last.headerHeight).toBeLessThan(first.headerHeight);
    report.push(JSON.stringify({ full, compact, first, half, last }));

    // The title overlay: the full-size title with Move beside it, no scroll change; Escape collapses it.
    const before = (await frame(page)).scrollTop;
    await page.getByRole('button', { name: 'Show the full title' }).click();
    const peek = page.getByRole('group', { name: 'Full title' });
    await expect(peek).toBeVisible();
    await page.waitForTimeout(400); // past the card's 130ms fade-in: the frame is the settled card
    await shot('title-overlay');
    const move = page.getByRole('button', { name: 'Move this ticket' });
    await expect(move).toBeVisible();
    await expect(move).not.toHaveAttribute('inert', /.*/);
    expect((await frame(page)).scrollTop).toBe(before);
    await page.keyboard.press('Escape');
    await expect(peek).toBeHidden();
    await expect(move).toHaveAttribute('inert', '');
    expect((await frame(page)).scrollTop).toBe(before);
    // The sheet itself is still open (Escape went to the overlay).
    await expect(page.getByRole('dialog')).toBeVisible();

    // Any scroll collapses an overlay.
    await page.getByRole('button', { name: 'Show the full title' }).click();
    await expect(peek).toBeVisible();
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, 30);
    await expect(peek).toBeHidden();

    if (REPORT_DIR !== '') writeFileSync(resolve(REPORT_DIR, 'sheet-header-report.json'), report.join('\n'));
  });

  test('1440: the desktop sheet is unchanged — no compact mode, the header stays in the flow, Move stays hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSheet(page);
    await ensureScrollable(page);
    const read = async (): Promise<Record<string, string | boolean>> =>
      page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.gn-sheet')!;
        const header = document.querySelector<HTMLElement>('.gn-sheet__header')!;
        const body = document.querySelector<HTMLElement>('.gn-sheet__body')!;
        const title = document.querySelector<HTMLElement>('.gn-ticket-sheet__title-input')!;
        const move = document.querySelector<HTMLElement>('.gn-sheet__move')!;
        return {
          compactAttr: panel.hasAttribute('data-compact'),
          p: panel.style.getPropertyValue('--p'),
          headerPosition: getComputedStyle(header).position,
          headerHeight: String(header.getBoundingClientRect().height),
          bodyPaddingTop: getComputedStyle(body).paddingTop,
          titleTransform: getComputedStyle(title).transform,
          moveDisplay: getComputedStyle(move).display,
          hit: document.querySelector('.gn-sheet__title-hit') !== null,
        };
      });
    const before = await read();
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.gn-sheet__body')!.scrollTop = 600;
    });
    await settle(page);
    const after = await read();
    expect(after).toEqual(before);
    expect(before['compactAttr']).toBe(false);
    expect(before['p']).toBe('');
    expect(before['headerPosition']).not.toBe('absolute');
    expect(before['bodyPaddingTop']).toBe('0px');
    expect(before['titleTransform']).toBe('none');
    expect(before['moveDisplay']).toBe('none');
    expect(before['hit']).toBe(false);
  });
});

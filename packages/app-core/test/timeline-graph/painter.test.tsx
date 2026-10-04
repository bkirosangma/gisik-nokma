// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { DrawIndex } from '../../src/timeline-graph/draw-index.js';
import type { Draw, DrawBar, DrawDiamond } from '../../src/timeline-graph/draw-types.js';
import { TimelinePainter } from '../../src/timeline-graph/painter.js';

const bar = (i: number, x0: number): DrawBar => ({
  kind: 'bar', id: `b${i}`, ticketId: `t${i}`, z: 1, b: { x0, x1: x0 + 96, y0: 0, y1: 28 }, style: 'done', key: `GN-${i}`, title: `Bar ${i}`,
  long: false, mark: 'done', passRank: 0, pass: 1, pin: null, chip: null, draft: false, labelPx: 60, keyOutside: false, pinAt: null, ariaLabel: `Bar ${i}, done`,
});
const draws = Array.from({ length: 200 }, (_, i) => bar(i, i * 120));
const index = new DrawIndex(draws);
const props = { draws, index, overscan: 0, width: 24_000, height: 400 };

describe('29.303 TimelinePainter', () => {
  it('29.303 mounts only the window; a sub-bucket move changes nothing; a bigger one swaps ids; control: overscan mounts more', () => {
    const { container, rerender } = render(<TimelinePainter {...props} view={{ x0: 0, x1: 600, y0: 0, y1: 400 }} />);
    const ids = () => [...container.querySelectorAll('[data-draw-id]')].map((e) => e.getAttribute('data-draw-id'));
    const first = ids();
    expect(container.querySelector('.gn-tlg-canvas')?.getAttribute('data-mounted')).toBe(String(first.length)); // the stress pages read this count
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(10);
    const el0 = container.querySelector('[data-draw-id="b0"]');
    rerender(<TimelinePainter {...props} view={{ x0: 10, x1: 610, y0: 0, y1: 400 }} />); // a 10 px move: the same bars touch
    expect(ids()).toEqual(first);
    expect(container.querySelector('[data-draw-id="b0"]')).toBe(el0); // the same DOM node: no remount (no React churn)
    rerender(<TimelinePainter {...props} view={{ x0: 6_000, x1: 6_600, y0: 0, y1: 400 }} />);
    expect(ids().some((id) => first.includes(id))).toBe(false);
    // the window CAUGHT UP (the painter defers its window): exactly the bars touching the new one, no stale and no missing id
    expect(ids()).toEqual(draws.filter((d) => d.b.x1 >= 6_000 && d.b.x0 <= 6_600).map((d) => d.id));
    rerender(<TimelinePainter {...props} overscan={600} view={{ x0: 6_000, x1: 6_600, y0: 0, y1: 400 }} />);
    expect(ids().length).toBeGreaterThan(first.length);
  });
  it('29.303 pick on a mounted bar; selection marks it; no control is named Earlier, Later, Previous or Next', () => {
    const onPick = vi.fn();
    const { container } = render(<TimelinePainter {...props} view={{ x0: 0, x1: 300, y0: 0, y1: 400 }} selectedId="b0" onPick={onPick} />);
    const b0 = container.querySelector('[data-draw-id="b0"]') as HTMLElement;
    expect(b0.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-draw-id="b1"]')?.getAttribute('aria-pressed')).toBe('false'); // control: only the selected one
    fireEvent.click(b0);
    expect(onPick).toHaveBeenCalledWith('t0'); // the TICKET id (`Bar` calls `onPick(d.ticketId)`; Home's `onSelect` takes a ticket, T5)
    const names = [...container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') ?? '');
    expect(names).toContain('Bar 0, done'); // control: the scan sees the painter's names
    expect(names.some((n) => /^(earlier|later|previous|next)$/i.test(n))).toBe(false);
  });
  it('29.303 a vertical-only move swaps the mounted rows exactly; control: the top row is mounted first', () => {
    const rows: Draw[] = [bar(0, 0), bar(1, 120), { ...bar(2, 0), b: { x0: 0, x1: 96, y0: 2_000, y1: 2_028 } }, { ...bar(3, 120), b: { x0: 120, x1: 216, y0: 2_000, y1: 2_028 } }];
    const { container, rerender } = render(<TimelinePainter draws={rows} index={new DrawIndex(rows)} overscan={0} width={400} height={2_100} view={{ x0: 0, x1: 400, y0: 0, y1: 400 }} />);
    const ids = () => [...container.querySelectorAll('[data-draw-id]')].map((e) => e.getAttribute('data-draw-id'));
    expect(ids()).toEqual(['b0', 'b1']);
    rerender(<TimelinePainter draws={rows} index={new DrawIndex(rows)} overscan={0} width={400} height={2_100} view={{ x0: 0, x1: 400, y0: 1_900, y1: 2_100 }} />);
    expect(ids()).toEqual(['b2', 'b3']);
  });
  it('29.303 a bar or a diamond whose ticket changed repaints in place (the primitives are memoised): new text and style, same DOM node; control: an unchanged bar keeps its node and text', () => {
    const before: Draw[] = [
      { ...bar(0, 0), long: true, title: 'Old title' }, { ...bar(1, 120), long: true, title: 'Kept title' },
      { kind: 'diamond', id: 'd2', ticketId: 't2', z: 1, b: { x0: 300, x1: 328, y0: 0, y1: 28 }, style: 'planned', key: 'GN-2', title: 'D', mark: null, revised: false, pin: null, draft: false, ariaLabel: 'GN-2 D' },
    ];
    const view = { x0: 0, x1: 400, y0: 0, y1: 40 };
    const { container, rerender } = render(<TimelinePainter draws={before} index={new DrawIndex(before)} overscan={0} width={400} height={40} view={view} />);
    const el = (id: string) => container.querySelector(`[data-draw-id="${id}"]`) as HTMLElement;
    const [b0, b1, d2] = [el('b0'), el('b1'), el('d2')];
    expect([d2.dataset['style'], d2.textContent]).toEqual(['planned', '']);
    // a new object for each changed ticket only, as a scene rebuild makes
    const after: Draw[] = [{ ...(before[0] as DrawBar), title: 'New title', style: 'active', mark: 'active' }, before[1] as DrawBar, { ...(before[2] as DrawDiamond), style: 'done', mark: 'done', revised: true }];
    rerender(<TimelinePainter draws={after} index={new DrawIndex(after)} overscan={0} width={400} height={40} view={view} />);
    expect([el('b0'), el('b0').querySelector('.gn-tlg-title')?.textContent, el('b0').dataset['style'], el('b0').querySelector('.gn-tlg-mark')?.textContent]).toEqual([b0, 'New title', 'active', '▶']);
    expect([el('b1'), el('b1').querySelector('.gn-tlg-title')?.textContent]).toEqual([b1, 'Kept title']);
    expect([el('d2'), el('d2').dataset['style'], el('d2').textContent]).toEqual([d2, 'done', '✓revised']);
  });
  it('29.303 a TICKET id selects that ticket\'s bars and diamond (Home selects tickets); control: the other ticket stays unpressed', () => {
    const two: Draw[] = [bar(0, 0), bar(1, 120), { kind: 'diamond', id: 'd1', ticketId: 't1', z: 1, b: { x0: 240, x1: 268, y0: 0, y1: 28 }, style: 'done', key: 'GN-1', title: 'D', mark: null, revised: false, pin: null, draft: false, ariaLabel: 'GN-1 D' }];
    const { container } = render(<TimelinePainter draws={two} index={new DrawIndex(two)} overscan={0} width={400} height={40} view={{ x0: 0, x1: 400, y0: 0, y1: 40 }} selectedId="t1" />);
    const pressed = (id: string) => container.querySelector(`[data-draw-id="${id}"]`)?.getAttribute('aria-pressed');
    expect([pressed('b1'), pressed('d1')]).toEqual(['true', 'true']);
    expect(pressed('b0')).toBe('false');
  });
  it('29.303 a diamond picks its TICKET and is selected by its own draw id too; control: the bar of the same ticket is not', () => {
    const onPick = vi.fn();
    const two: Draw[] = [bar(1, 0), { kind: 'diamond', id: 'd1', ticketId: 't1', z: 1, b: { x0: 240, x1: 268, y0: 0, y1: 28 }, style: 'done', key: 'GN-1', title: 'D', mark: null, revised: false, pin: null, draft: false, ariaLabel: 'GN-1 D' }];
    const { container } = render(<TimelinePainter draws={two} index={new DrawIndex(two)} overscan={0} width={400} height={40} view={{ x0: 0, x1: 400, y0: 0, y1: 40 }} selectedId="d1" onPick={onPick} />);
    const d1 = container.querySelector('[data-draw-id="d1"]') as HTMLElement;
    expect([d1.getAttribute('aria-pressed'), container.querySelector('[data-draw-id="b1"]')?.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    fireEvent.click(d1);
    expect(onPick).toHaveBeenCalledWith('t1');
  });
  it('29.303 what each primitive shows, exactly: key or "Draft", title only on a long bar, chip, pin counts, ✓ / ▶, "revised"; placed at its bounds; every edge in ONE svg; control: no edge in view, no svg', () => {
    const scene: Draw[] = [
      { ...bar(0, 0), key: 'GN-7', mark: 'done', long: true, title: 'Ship the thing', chip: 'Not taken (pass 2)', pin: { notes: 2, attachments: 1 }, pinAt: 'inside' },
      { ...bar(1, 200), b: { x0: 200, x1: 248, y0: 40, y1: 68 }, style: 'active', draft: true, key: null, mark: 'active', keyOutside: true, dim: true, passRank: 2, pin: { notes: 0, attachments: 3 }, pinAt: 'after-key' },
      { ...bar(2, 400), style: 'planned', mark: null, title: 'Short one' },
      { kind: 'diamond', id: 'd3', ticketId: 't3', z: 1, b: { x0: 600, x1: 628, y0: 0, y1: 28 }, style: 'done', key: 'GN-3', title: 'Decide', mark: 'done', revised: true, pin: null, draft: false, ariaLabel: 'GN-3 Decide' },
      { kind: 'diamond', id: 'd4', ticketId: 't4', z: 1, b: { x0: 700, x1: 728, y0: 0, y1: 28 }, style: 'planned', key: 'GN-4', title: 'Decide again', mark: 'active', revised: false, pin: null, draft: false, ariaLabel: 'GN-4 Decide again' },
      { kind: 'edge', id: 'e1', z: 0, b: { x0: 96, x1: 200, y0: 0, y1: 68 }, from: 't0', to: 't1', d: 'M96 14 H150 V54 H200', label: { x: 150, y: 10, text: 'Needs rework' }, edgeKind: 'leads_to', loop: false, taken: null, dim: true },
      { kind: 'edge', id: 'e2', z: 0, b: { x0: 248, x1: 400, y0: 0, y1: 68 }, from: 't1', to: 't2', d: 'M248 54 C300 0, 350 0, 400 14', label: null, edgeKind: 'blocks', loop: true, taken: true },
      { kind: 'heading', id: 'h1', z: 0, b: { x0: 0, x1: 900, y0: 80, y1: 114 }, text: 'Project One', sticky: true },
      { kind: 'strip', id: 's1', z: 0, b: { x0: 0, x1: 900, y0: 120, y1: 140 }, text: 'Pruned' },
      { kind: 'today', id: 'td', z: 2, b: { x0: 300, x1: 302, y0: 0, y1: 140 }, text: 'Today' },
      { kind: 'weekend', id: 'w1', z: 0, b: { x0: 480, x1: 528, y0: 0, y1: 140 } },
      { kind: 'connector', id: 'c1', ticketId: 't0', z: 0, b: { x0: 96, x1: 120, y0: 14, y1: 15 }, dashed: true },
    ];
    const { container, rerender } = render(<TimelinePainter draws={scene} index={new DrawIndex(scene)} overscan={0} width={2_000} height={200} view={{ x0: 0, x1: 900, y0: 0, y1: 200 }} className="gn-home-tl" />);
    const el = (id: string) => container.querySelector(`[data-draw-id="${id}"]`) as HTMLElement;
    const canvas = container.querySelector('.gn-tlg-canvas') as HTMLElement;
    expect([[...canvas.classList], canvas.style.width, canvas.style.height]).toEqual([['gn-tlg-canvas', 'gn-home-tl'], '2000px', '200px']); // the canvas is the scroll extent
    const text = (id: string, cls: string) => el(id).querySelector(`.${cls}`)?.textContent ?? null;
    expect([text('b0', 'gn-tlg-key'), text('b0', 'gn-tlg-title'), text('b0', 'gn-tlg-chip'), text('b0', 'gn-tlg-mark')]).toEqual(['GN-7', 'Ship the thing', 'Not taken (pass 2)', '✓']);
    const pin = el('b0').querySelector('.gn-tlg-pin');
    expect([pin?.getAttribute('data-notes'), pin?.getAttribute('data-attachments'), pin?.getAttribute('data-at')]).toEqual(['2', '1', 'inside']);
    const pin1 = el('b1').querySelector('.gn-tlg-pin');
    expect([pin1?.getAttribute('data-notes'), pin1?.getAttribute('data-attachments'), pin1?.getAttribute('data-at')]).toEqual(['0', '3', 'after-key']);
    // the lit set and the pass rank are written for the tasks that style them (T5 to T7): one of each value
    expect([el('b0').dataset['dim'], el('b1').dataset['dim'], el('b0').dataset['passRank'], el('b1').dataset['passRank']]).toEqual(['false', 'true', '0', '2']);
    expect([el('b0').style.left, el('b0').style.top, el('b0').style.width, el('b0').style.height]).toEqual(['0px', '0px', '96px', '28px']);
    expect([el('b1').style.left, el('b1').style.top, el('b1').style.width]).toEqual(['200px', '40px', '48px']);
    expect([el('b0').dataset['style'], el('b1').dataset['style'], el('b2').dataset['style']]).toEqual(['done', 'active', 'planned']);
    expect([text('b1', 'gn-tlg-key'), text('b1', 'gn-tlg-mark'), el('b1').dataset['draft'], el('b1').querySelector('.gn-tlg-key')?.getAttribute('data-outside')]).toEqual(['Draft', '▶', 'true', 'true']);
    // control: a short bar shows its key and nothing else
    expect([text('b2', 'gn-tlg-key'), text('b2', 'gn-tlg-title'), text('b2', 'gn-tlg-chip'), text('b2', 'gn-tlg-mark'), el('b2').querySelector('.gn-tlg-pin')]).toEqual(['GN-2', null, null, null, null]);
    expect([text('d3', 'gn-tlg-revised'), text('d3', 'gn-tlg-mark'), text('d4', 'gn-tlg-revised'), text('d4', 'gn-tlg-mark')]).toEqual(['revised', '✓', null, '▶']);
    expect([el('h1').textContent, el('s1').textContent, el('td').textContent, el('c1').dataset['dashed'], el('w1').className]).toEqual(['Project One', 'Pruned', 'Today', 'true', 'gn-tlg-weekend']);
    expect(container.querySelectorAll('svg.gn-tlg-edges')).toHaveLength(1);
    expect([...container.querySelectorAll('svg.gn-tlg-edges > g')].map((g) => g.getAttribute('data-draw-id'))).toEqual(['e1', 'e2']);
    expect([el('e1').querySelector('path')?.getAttribute('d'), el('e1').querySelector('text')?.textContent, el('e2').querySelector('text'), el('e2').dataset['loop'], el('e2').dataset['kind']]).toEqual(['M96 14 H150 V54 H200', 'Needs rework', null, 'true', 'blocks']);
    expect([el('e1').querySelector('text')?.getAttribute('x'), el('e1').querySelector('text')?.getAttribute('y'), el('e1').dataset['dim'], el('e2').dataset['dim']]).toEqual(['150', '10', 'true', 'false']);
    rerender(<TimelinePainter draws={scene} index={new DrawIndex(scene)} overscan={0} width={2_000} height={200} view={{ x0: 560, x1: 900, y0: 0, y1: 40 }} />);
    expect(el('d3')).not.toBeNull(); // control: the view still mounts something
    expect(container.querySelector('svg')).toBeNull();
  });
  it('29.301 the scroller contains its own scroll (the page-scroll defence the browser leg measures) and 29.303 a ghost is dashed, never faded', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../ui/src/ui.css'), 'utf8');
    const block = css.slice(css.indexOf('/* WTG4 T2:'), css.indexOf('/* WTG4 T2 end */'));
    const rule = (selector: string): string => {
      const at = block.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return block.slice(at, block.indexOf('}', at));
    };
    expect(rule('.gn-tlg-scroller')).toContain('overscroll-behavior: contain');
    expect(rule('.gn-tlg-scroller')).toContain('overflow: auto');
    expect(rule(".gn-tlg-bar[data-style='ghost']")).toContain('dashed');
    expect(rule('.gn-tlg-bar')).toContain('height: 28px');
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, ''); // declarations only: the block's own docblock names what it avoids
    expect(rules).not.toMatch(/opacity|touch-action:\s*none/);
    expect(rules).toContain('.gn-tlg-edge-label {'); // control: the slice runs to the block's last rule, so the scan saw every rule
  });
});

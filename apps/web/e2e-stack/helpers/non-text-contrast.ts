import type { Page } from '@playwright/test';

/**
 * WCAG 1.4.11 (non-text contrast) over the RENDERED page — the borders and
 * rings that identify a control, which every text-walking instrument in this
 * repo is blind to by construction.
 *
 * ## Why this exists as a committed instrument rather than a probe
 *
 * "17 of 24 distinct bordered classes below 3:1" (`docs/pre-launch-checklist.md`)
 * was measured **ad hoc**, in a session, and never committed. So the finding
 * was reproducible only by the person who found it, and the number could not be
 * re-measured after a change without rebuilding the instrument from prose —
 * which is how a before/after comparison quietly ends up comparing two
 * different populations.
 *
 * ## It composites alpha, and that is the whole reason it cannot reuse
 * ## `relativeLuminance` from `tokens.ts`
 *
 * That function ignores alpha **by documented design**, and the checklist
 * records both directions of the damage: `text` on `surfaceOverlay` computes
 * 1.00 against a true 6.43 (a false red), and `border` on `surfaceOverlay`
 * reads 11.87 against a true 1.85 — **a false green, which is the dangerous
 * direction.** HIG's fill hierarchy is entirely `rgba()`, so a sweep that
 * cannot composite would score the very fills this change introduces, wrongly
 * and green.
 *
 * This is not a duplicate implementation to reconcile. The token-level function
 * is correct for opaque token-to-token pairs and is the gate for those; this one
 * measures pixels that only exist once a browser has stacked them.
 *
 * ## What counts as "bordered"
 *
 * A side with non-zero width, a style that paints, and a colour that is not
 * fully transparent. An element is grouped by its class signature, because the
 * finding is about CLASSES ("`.gn-card` renders at 1.45"), not about the
 * hundreds of instances a board renders.
 */
export type BorderReading = {
  /** `.gn-card`, `td`, `button.gn-button--ghost` — the grouping key. */
  selector: string;
  /** Worst (lowest) ratio measured for this selector across the sweep. */
  ratio: number;
  /** How many elements carried this signature. */
  instances: number;
  /** Composited border colour and the backdrop it was measured against. */
  border: string;
  backdrop: string;
};

export type BorderSweep = {
  readings: BorderReading[];
  below: BorderReading[];
  /** Instrument self-check: an element the sweep MUST score high. */
  control: { selector: string; ratio: number } | null;
  examined: number;
};

/**
 * Sweep the current page. `minimum` is WCAG 1.4.11's 3:1 for a non-text UI
 * component; it is a parameter so a caller can prove the instrument reports
 * differently at a different threshold rather than trusting one number.
 */
export async function sweepBorders(page: Page, minimum = 3): Promise<BorderSweep> {
  const raw = await page.evaluate(() => {
    const parseColor = (value: string): [number, number, number, number] | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (match === null) return null;
      const parts = match[1]!.split(',').map((p) => Number.parseFloat(p.trim()));
      if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
      return [parts[0]!, parts[1]!, parts[2]!, parts.length > 3 ? parts[3]! : 1];
    };
    /** `src` over `dst`, both opaque-ised. Standard source-over. */
    const over = (
      src: [number, number, number, number],
      dst: [number, number, number],
    ): [number, number, number] => [
      src[0] * src[3] + dst[0] * (1 - src[3]),
      src[1] * src[3] + dst[1] * (1 - src[3]),
      src[2] * src[3] + dst[2] * (1 - src[3]),
    ];
    /**
     * The opaque colour actually behind `el` — walk ancestors compositing each
     * translucent background until something opaque is reached. Falls back to
     * white, which is what a browser paints over.
     */
    const backdropOf = (el: Element): [number, number, number] => {
      const stack: [number, number, number, number][] = [];
      let node: Element | null = el.parentElement;
      while (node !== null) {
        const c = parseColor(getComputedStyle(node).backgroundColor);
        if (c !== null && c[3] > 0) {
          stack.push(c);
          if (c[3] === 1) break;
        }
        node = node.parentElement;
      }
      let base: [number, number, number] = [255, 255, 255];
      for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i]!, base);
      return base;
    };
    const lin = (c: number): number => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (rgb: [number, number, number]): number =>
      0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const signature = (el: Element): string => {
      const cls = Array.from(el.classList).filter((c) => !/^\d/.test(c));
      return cls.length > 0 ? `${el.tagName.toLowerCase()}.${cls.join('.')}` : el.tagName.toLowerCase();
    };

    const out: {
      selector: string;
      ratio: number;
      border: string;
      backdrop: string;
    }[] = [];
    let examined = 0;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
      let worst: { r: number; border: string; backdrop: string } | null = null;
      for (const side of sides) {
        const width = Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`));
        const styleName = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
        if (!(width > 0) || styleName === 'none' || styleName === 'hidden') continue;
        const c = parseColor(style.getPropertyValue(`border-${side.toLowerCase()}-color`));
        if (c === null || c[3] === 0) continue;
        const back = backdropOf(el);
        const painted = over(c, back);
        const r = ratio(painted, back);
        if (worst === null || r < worst.r) {
          worst = {
            r,
            border: `rgba(${c.map((n) => Math.round(n * 1000) / 1000).join(',')})`,
            backdrop: `rgb(${back.map((n) => Math.round(n)).join(',')})`,
          };
        }
      }
      if (worst !== null) {
        examined += 1;
        out.push({ selector: signature(el), ratio: worst.r, border: worst.border, backdrop: worst.backdrop });
      }
    }
    return { out, examined };
  });

  const bySelector = new Map<string, BorderReading>();
  for (const row of raw.out) {
    const existing = bySelector.get(row.selector);
    if (existing === undefined) {
      bySelector.set(row.selector, { ...row, instances: 1 });
    } else {
      existing.instances += 1;
      if (row.ratio < existing.ratio) {
        existing.ratio = row.ratio;
        existing.border = row.border;
        existing.backdrop = row.backdrop;
      }
    }
  }
  const readings = [...bySelector.values()].sort((a, b) => a.ratio - b.ratio);
  return {
    readings,
    below: readings.filter((r) => r.ratio < minimum),
    control: readings.length > 0 ? { selector: readings[readings.length - 1]!.selector, ratio: readings[readings.length - 1]!.ratio } : null,
    examined: raw.examined,
  };
}

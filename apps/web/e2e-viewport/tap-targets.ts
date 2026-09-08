import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * What a tap target IS, in one place, for both viewport suites.
 *
 * It lived in `responsive.spec.ts` until 2026-09-08, when `e2e-stack/viewport.spec.ts`
 * needed the same sweep for the signed-in shell. Importing it from the spec
 * FAILED in a way worth recording: Playwright loads an imported spec's `test()`
 * registrations too, so the stack config tried to run all six unauthed cases
 * and answered `project "" has no entry in VIEWPORTS` six times. A spec is not
 * a library. Hence this file, which registers nothing.
 *
 * The alternative — a second copy beside the stack spec — is the failure this
 * repo keeps a catalogue of: two definitions of the same rule, free to drift
 * while both files go on reporting confident numbers that are no longer
 * comparable.
 */

export type TapTargets = {
  /**
   * How many nodes the SELECTOR matched, before any visibility or exemption
   * filtering. This is the anti-broken-selector control, and it is separate
   * from `examined` on purpose: `examined` can legitimately be 0 on a prose
   * page whose only control is one inline link, but `rawMatches` can only be 0
   * if the selector itself stopped matching. A floor on `examined` would
   * therefore redden a true reading; a floor on `rawMatches` reddens exactly
   * the thing it is named for.
   */
  rawMatches: number;
  examined: { selector: string; w: number; h: number }[];
  offenders: { selector: string; w: number; h: number }[];
  inlineExempt: { selector: string; w: number; h: number }[];
  invisibleSkipped: number;
  smallestExamined: { selector: string; w: number; h: number } | null;
};

/**
 * WCAG 2.5.8 "Target Size (Minimum)" is 24x24; the 44x44 this task asks for is
 * the stricter 2.5.5 / platform-HIG number, and it is also the number this
 * repo's own CSS is written against — `packages/ui/src/ui.css:1250` sets
 * `min-height: 2.75rem` with the comment "44px — the minimum touch target".
 *
 * THE EXEMPTION, AND WHY IT IS NOT A LOOPHOLE. Both success criteria exempt a
 * target that is "in a sentence or its size is otherwise constrained by the
 * line-height of non-target text" — an inline link inside a paragraph cannot be
 * 44px tall without breaking the paragraph. `/privacy` and `/terms` are almost
 * entirely prose with inline links, so without this the sweep would report
 * dozens of "violations" that the standard itself excuses, and the real
 * offenders would drown.
 *
 * The loophole guard is that exempted elements are COUNTED AND RETURNED, not
 * silently dropped. A run that exempted everything is visible as such in the
 * output. The rule is narrow on purpose: `display: inline` AND a parent
 * carrying text of its own beyond the link. An `inline-block` control, or a
 * link that is its parent's entire content, is NOT exempt.
 */
export async function measureTapTargets(page: Page): Promise<TapTargets> {
  return page.evaluate(() => {
    const SELECTOR = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="checkbox"]',
      '[role="switch"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const describe = (el: Element): string => {
      const id = el.id !== '' ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className !== ''
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : '';
      const text = (el.textContent ?? '').trim().slice(0, 28);
      return `${el.tagName.toLowerCase()}${id}${cls}${text !== '' ? ` "${text}"` : ''}`;
    };

    const examined: { selector: string; w: number; h: number }[] = [];
    const offenders: { selector: string; w: number; h: number }[] = [];
    const inlineExempt: { selector: string; w: number; h: number }[] = [];
    let invisibleSkipped = 0;

    const matched = Array.from(document.querySelectorAll(SELECTOR));
    for (const el of matched) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) {
        invisibleSkipped += 1;
        continue;
      }
      const entry = { selector: describe(el), w: Math.round(r.width), h: Math.round(r.height) };
      const parentText = (el.parentElement?.textContent ?? '').trim().length;
      const ownText = (el.textContent ?? '').trim().length;
      const inlineInProse = cs.display === 'inline' && parentText > ownText;
      if (inlineInProse) {
        inlineExempt.push(entry);
        continue;
      }
      examined.push(entry);
      if (entry.w < 44 || entry.h < 44) offenders.push(entry);
    }

    const smallestExamined =
      examined.length === 0
        ? null
        : examined.reduce((a, b) => (Math.min(a.w, a.h) <= Math.min(b.w, b.h) ? a : b));

    return {
      rawMatches: matched.length,
      examined,
      offenders,
      inlineExempt,
      invisibleSkipped,
      smallestExamined,
    };
  });
}

const TAP_BASELINE_PATH = fileURLToPath(new URL('./tap-target-baseline.json', import.meta.url));

/**
 * Both helpers take the path, because there are now TWO baselines: this suite's
 * unauthed one and `e2e-stack/tap-target-baseline.json` for the signed-in shell.
 * They share this code rather than each carrying a copy, for the reason this
 * repo has a catalogue of: a second definition of "what a tap target is" drifts
 * from the first silently, and the two counts would stop being comparable
 * without either file changing.
 */
export function readTapBaseline(path: string = TAP_BASELINE_PATH): Record<string, number> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

export function recordTapBaseline(key: string, count: number, path: string = TAP_BASELINE_PATH): void {
  const current = readTapBaseline(path);
  if (current[key] !== undefined) return;
  current[key] = count;
  const ordered = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

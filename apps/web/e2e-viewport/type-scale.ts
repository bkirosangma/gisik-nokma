import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * LABEL TEXT — the type-scale population that no sweep in this repo could see.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS WHEN `measureBodyText` ALREADY DOES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `e2e-viewport/responsive.spec.ts` has swept body copy against a 16px floor
 * since item 7. Its population is deliberately narrow — `p, li, dd, dt, td,
 * figcaption, label`, block-level carriers with their own direct text — and its
 * docblock says why headings and `code` are excluded.
 *
 * What that leaves uncovered is not a corner. `docs/pre-launch-checklist.md`
 * reported the finding this file answers:
 *
 *     "Small text is real but mostly legitimate labels
 *      (`gn-board-card__provenance` at 12.5px x25, chips at 12.8px); the counts
 *      are identical at 768 and 1512, so it is a type-scale question, not a
 *      responsive one."
 *
 * Every element it names is a `span` or a `div`. **Not one of them is in the
 * body sweep's selector**, so the reading in that paragraph came from a
 * one-off manual measurement and has had no guard of any kind since. This is
 * the same shape as the tap-target note that lived in prose while the code
 * drifted underneath it, and it is fixed the same way: a sweep and a ratchet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO SWEEPS, NOT ONE DUPLICATED — AND THE DISJOINTNESS IS MEASURED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This repo keeps a catalogue of rules that got defined twice and drifted while
 * both copies reported confident numbers. It also has the counter-case, stated
 * at `docs/pre-launch-checklist.md`: the token-level contrast function and the
 * live-DOM walker are "not a duplicate implementation to reconcile" because
 * they answer different questions over different inputs.
 *
 * This is that second kind. Body copy and label text have different floors for
 * different reasons, so one function with one threshold would have to lie about
 * one of them. But "different population" is a claim, and a claim that overlaps
 * silently is exactly how two sweeps start double-counting and disagreeing.
 *
 * So it is not left as a comment. Every element this sweep matches is checked
 * against the body sweep's own selector and, when it matches both, put in
 * `bodyOwned` instead of `examined`. A caller asserts `bodyOwned` is empty.
 * If someone widens either selector into the other's territory, that assertion
 * goes red naming the elements — the overlap cannot arrive quietly.
 */

/** The body sweep's population, quoted here so the overlap check is real. */
const BODY_SELECTOR = 'p, li, dd, dt, td, figcaption, label';

/**
 * Inline and generic carriers — the half of the rendered text that no floor
 * has ever applied to. `time`, `output`, `abbr` and `dfn` are in the list not
 * because this product uses them today but because they are the tags a due
 * date, a computed count and a glossary term arrive as, and this sweep should
 * not have to be edited to keep covering the page.
 *
 * `a`, `button`, `summary` and `th` ARE IN THE LIST BECAUSE A MUTATION CAUGHT
 * THEIR ABSENCE, and the way it caught it is the reason to trust the list now.
 * The first attempt to prove this ratchet could redden planted `font-size:
 * 0.7rem` on `.gn-help__toc-link` and ran the suite. It went red — through the
 * TAP-TARGET ratchet, because the links lost height — while this sweep reported
 * `under-12px=0` on the same page in the same run. `a` was in neither
 * population: not here, and not in `measureBodyText`'s `p, li, dd, dt, td,
 * figcaption, label`. **Every link and every button in the product had no
 * font-size floor of any kind**, and the mutation designed to test this check
 * could not be seen by it.
 *
 * That is this repo's recorded failure shape — a control that does not traverse
 * the same path as the measurement — and it was one green tick away from being
 * shipped as proof. Headings stay out, matching the body sweep's own reasoning:
 * they are the responsive signature's business and are larger by construction.
 */
const LABEL_SELECTOR =
  'span, small, div, strong, em, b, i, time, output, abbr, dfn, a, button, summary, th';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FLOOR IS 12px, AND IT IS NOT BORROWED FROM WCAG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * State the absence first, because the tap-target ratchet next door DOES cite
 * a success criterion and the symmetry invites a false one here: **no WCAG
 * success criterion sets a minimum font size.** 1.4.4 is resize-to-200%, 1.4.12
 * is text spacing. Neither says a number. iOS HIG's 11pt and Material's 12sp
 * are platform guidance for native apps, not a web standard. Writing "WCAG"
 * beside this number would be inventing authority.
 *
 * So the floor is drawn from the only source that can honestly carry it — the
 * type scale this product already has:
 *
 *     0.75rem (12px)  x17 rules in packages/ui/src/ui.css
 *     0.78rem-1.3rem  x69 rules
 *     0.70rem (11.2px) x2   <- below every other rung
 *     0.65rem (10.4px) x1   <- below every other rung
 *
 * Seventeen rules sit at exactly 12px, and the pre-launch measurement judged
 * the 12.5px and 12.8px labels legitimate. **12px is the bottom rung of the
 * scale the design already chose**, and the three rules underneath it are not
 * a smaller tier — they are strays, each a one-off in a single component.
 *
 * That is why this is a floor and not a redesign. The owner's ruling was "take
 * it" on type scale at 390px; raising all 91 declarations would override a
 * judgment already recorded in the tree, while leaving 10.4px text unguarded
 * would answer nothing. Bringing three outliers onto the existing scale is the
 * change the reading actually supports.
 */
export const LABEL_FLOOR_PX = 12;

export type TextSample = { selector: string; fontSizePx: number; text: string };

export type TypeScale = {
  /**
   * Selector matches before any filtering. The anti-broken-selector control,
   * and separate from `examined` for the same reason `TapTargets.rawMatches`
   * is: `examined` may legitimately be small on a sparse route, but
   * `rawMatches` can only collapse if the selector itself stopped matching.
   *
   * `div` alone guarantees this is never 0 on a rendered page, which makes it
   * a sharp control rather than a decorative one.
   */
  rawMatches: number;
  /** Carriers of their own visible text, in this sweep's population. */
  examined: TextSample[];
  /** Examined elements rendering below `LABEL_FLOOR_PX`. */
  offenders: TextSample[];
  /**
   * Matched the label selector AND the body sweep's selector. Must be empty;
   * see the disjointness note above. Non-empty means the two populations have
   * grown into each other and their counts have stopped being separable.
   */
  bodyOwned: TextSample[];
  /** Invisible, empty, or code-owned: counted so a silent-empty run is visible. */
  skipped: number;
  /** The worst reading found, reported whether or not it offends. */
  smallest: TextSample | null;
};

/**
 * WHAT COUNTS AS "CARRYING TEXT", AND WHY `div` DOES NOT USUALLY
 *
 * Only DIRECT text-node children count. A `div` wrapping three spans has no
 * direct text and is skipped, so a nested layout is measured once at the
 * element that actually paints the glyphs rather than once per ancestor. This
 * is the same test `measureBodyText` applies, and it is what makes `div` safe
 * to include in the selector at all.
 *
 * `code`/`kbd`/`pre` descendants are excluded, matching the body sweep: those
 * are set to `0.92em` deliberately at `packages/ui/src/ui.css` as typographic
 * contrast, which is a different question from label legibility.
 */
export async function measureTypeScale(page: Page): Promise<TypeScale> {
  return page.evaluate(
    ({ labelSelector, bodySelector, floor }) => {
      const describe = (el: Element): string => {
        const cls =
          typeof el.className === 'string' && el.className !== ''
            ? `.${el.className.trim().split(/\s+/).join('.')}`
            : '';
        return `${el.tagName.toLowerCase()}${cls}`;
      };

      const examined: { selector: string; fontSizePx: number; text: string }[] = [];
      const offenders: { selector: string; fontSizePx: number; text: string }[] = [];
      const bodyOwned: { selector: string; fontSizePx: number; text: string }[] = [];
      let skipped = 0;

      const matched = Array.from(document.querySelectorAll(labelSelector));
      for (const el of matched) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent ?? '').trim())
          .join(' ')
          .trim();
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          r.width === 0 ||
          r.height === 0 ||
          directText === ''
        ) {
          skipped += 1;
          continue;
        }
        if (el.closest('code, kbd, pre') !== null) {
          skipped += 1;
          continue;
        }
        const entry = {
          selector: describe(el),
          fontSizePx: Number.parseFloat(cs.fontSize),
          text: directText.slice(0, 40),
        };
        if (el.matches(bodySelector)) {
          bodyOwned.push(entry);
          continue;
        }
        examined.push(entry);
        if (entry.fontSizePx < floor) offenders.push(entry);
      }

      const smallest =
        examined.length === 0
          ? null
          : examined.reduce((a, b) => (a.fontSizePx <= b.fontSizePx ? a : b));

      return { rawMatches: matched.length, examined, offenders, bodyOwned, skipped, smallest };
    },
    { labelSelector: LABEL_SELECTOR, bodySelector: BODY_SELECTOR, floor: LABEL_FLOOR_PX },
  );
}

const TYPE_SCALE_BASELINE_PATH = fileURLToPath(
  new URL('./type-scale-baseline.json', import.meta.url),
);

/**
 * The ratchet, in the shape `tap-targets.ts` established and for the same
 * reason: a count that may fall and never rise, so a route that is imperfect
 * today cannot get worse tomorrow without a red run.
 *
 * `recordTypeScaleBaseline` writes only ABSENT keys — deliberately, and it cost
 * two wasted runs on the tap-target pass to relearn. A branch that made a
 * number WORSE must not be able to re-baseline over it. A falling number needs
 * the key deleted from the file first; setting `UPDATE_TYPE_SCALE_BASELINE=1`
 * will not lower one.
 */
export function readTypeScaleBaseline(
  path: string = TYPE_SCALE_BASELINE_PATH,
): Record<string, number> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

export function recordTypeScaleBaseline(
  key: string,
  count: number,
  path: string = TYPE_SCALE_BASELINE_PATH,
): void {
  const current = readTypeScaleBaseline(path);
  if (current[key] !== undefined) return;
  current[key] = count;
  const ordered = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

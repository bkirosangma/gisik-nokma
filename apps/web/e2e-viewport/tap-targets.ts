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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TWO FLOORS — 24 FOR IN-LIST CONTROLS, 44 FOR STANDALONE ONES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner ruling, 2026-09-20, verbatim: *"let the checker accept 24 for in-list
 * controls, keep 44 for standalone buttons."*
 *
 * This file enforced a FLAT 44 for everything until then. The product had not
 * been flat-44 for a long time: `packages/ui/src/ui.css` argues the 24px floor
 * in its own words at four separate sites, and every one of them was being
 * counted as a violation by the sweep that was supposed to be checking them.
 * The four, quoted from their own rules:
 *
 *   | control                  | its own rule says                                        |
 *   |--------------------------|----------------------------------------------------------|
 *   | `.gn-attention__title`   | "Dense in-list controls get 24, standalone controls get 44" |
 *   | `.gn-help__nav-link`     | "WCAG 2.5.8's 24px floor for an in-list control still clears" |
 *   | `.gn-help__group-toggle` | "above WCAG 2.5.8's 24px floor for an in-list control, below the 44px this file gives STANDALONE controls" |
 *   | `.gn-help__pager-link`   | "sits in running text rather than on its own, so the 24px in-list floor is the applicable one" |
 *
 * So this is a change to make the CHECKER agree with a rule the product had
 * already written down — not a new threshold. `ui.css:1606-1616` states the
 * whole rule in one sentence: *"Dense in-list controls get 24, standalone
 * controls get 44 — the same call `/help`'s table-of-contents links got."*
 *
 * ## WHY MEMBERSHIP IS DECLARED AND NOT DERIVED
 *
 * The obvious design is to compute "is this control in a list" from the DOM.
 * Three such rules were tried against this product's real markup and every one
 * of them is wrong, in the direction that matters:
 *
 *   * **"inside a `<ul>`/`<ol>`"** — TOO LOOSE. `.gn-board-card__move` is a
 *     44px standalone control living inside `ul.gn-board__cards`, so every
 *     board arrow would have been silently re-judged at 24. That is the failure
 *     this design exists to prevent: a blanket 24 wearing a structural costume.
 *   * **"a direct child of an `<li>`"** — TOO NARROW, and it misses two of the
 *     four above. `.gn-help__group-toggle` sits in a `<div class="gn-help__group">`,
 *     and `.gn-help__pager-link` is not in a list at all: it is an inline link
 *     inside `<p class="gn-help__pager">`, which its own rule explains.
 *   * **"one of ≥2 sibling controls of the same class"** — TOO LOOSE again.
 *     A board card's two move arrows are exactly that shape, and so is any
 *     toolbar of identical buttons.
 *
 * No structural predicate separates those four from the controls that must keep
 * 44, because the distinction is not structural — it is a PRODUCT DECISION,
 * made per control, and already argued in the CSS. So the class is declared
 * here and the MEASUREMENT stays measured: this table says which controls are
 * judged at 24, and `measureTapTargets` is what decides whether they meet it.
 *
 * ## THE MEMBERSHIP RULE, STATED SO IT CAN BE APPLIED CONSISTENTLY
 *
 * > **A control belongs in `DENSE_IN_LIST` when the product's own CSS gives it
 * > the 24px WCAG 2.5.8 floor rather than the 44px 2.5.5 floor — i.e. when it
 * > is one item among many in a dense collection, or an interactive run inside
 * > running text, and its rule says so.**
 *
 * Every entry below must therefore name the rule that makes the call. An entry
 * whose `declaredAt` rule no longer exists in `ui.css` is a live check:
 * `apps/web/test/tap-target-density.test.ts` reads that file and fails.
 *
 * The dangerous direction is guarded by leaving it alone: ANY control not in
 * this table is judged at 44. Forgetting to declare a dense control reddens the
 * sweep (loud, and the fix is one line); the only way to absolve a standalone
 * control is to add it here, which is an explicit, reviewable, committed act —
 * the same shape `CONTRAST_PAIRS` uses in `packages/ui/src/tokens.ts`.
 */
export type DenseInList = {
  /** The control judged at the 24px floor. */
  readonly control: string;
  /** The container the control must be inside for the entry to apply. */
  readonly container: string;
  /** The `packages/ui/src/ui.css` rule that makes the 24px call, in its own words. */
  readonly declaredAt: string;
  /** What in that rule makes this an in-list control. */
  readonly why: string;
};

export const DENSE_IN_LIST: readonly DenseInList[] = [
  {
    control: '.gn-attention__title',
    container: '.gn-attention__items',
    declaredAt: '.gn-attention__title',
    why:
      'A bare text button on a row that also carries a chip and the server’s reason, sharing the ' +
      'row’s baseline (`.gn-attention__item` is `align-items: baseline`). Its rule gives the reason ' +
      '44 is refused: "44px would break that alignment and turn a compact strip into a list of slabs."',
  },
  {
    control: '.gn-help__nav-link',
    container: '.gn-help__group-items',
    declaredAt: '.gn-help__nav-link',
    why:
      'One of 224 section links in the /help topic sidebar — an index whose every row is a link. ' +
      'Its rule records that the height floor was DROPPED deliberately and the 24px floor still ' +
      'clears "with 9px to spare".',
  },
  {
    control: '.gn-help__group-toggle',
    container: '.gn-help__groups',
    declaredAt: '.gn-help__group-toggle',
    why:
      'The sidebar’s group disclosure, 36px "from the reference — above WCAG 2.5.8’s 24px floor ' +
      'for an in-list control, below the 44px this file gives STANDALONE controls." The rule names ' +
      'both halves of this very split.',
  },
  {
    control: '.gn-help__pager-link',
    container: '.gn-help__pager',
    declaredAt: '.gn-help__pager-link',
    why:
      'The "Next section" link at the foot of each section. It looks standalone but is not: it ' +
      'sits inline after a `Next` label in running text, and its rule says so — "the 24px in-list ' +
      'floor is the applicable one."',
  },
];

/** WCAG 2.5.8, "Target Size (Minimum)" — the floor for a dense in-list control. */
export const DENSE_FLOOR_PX = 24;
/** WCAG 2.5.5, "Target Size (Enhanced)" — the floor for a standalone control. */
export const STANDALONE_FLOOR_PX = 44;

export type TapTargetEntry = {
  selector: string;
  w: number;
  h: number;
  /**
   * Which floor this element was judged against — 24 or 44. Carried on every
   * entry so an offender list names the rule it broke rather than leaving the
   * reader to infer it from the class of the thing it names.
   */
  floor: number;
};

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
  examined: TapTargetEntry[];
  /** Controls below the floor their OWN class sets — 24 for dense, 44 for standalone. */
  offenders: TapTargetEntry[];
  inlineExempt: TapTargetEntry[];
  invisibleSkipped: number;
  smallestExamined: TapTargetEntry | null;
  /**
   * How many nodes `DENSE_IN_LIST` classified as in-list ON THIS PAGE. The
   * split's population, printed on every run: a table that matched nothing
   * would otherwise be indistinguishable from a split that works.
   */
  denseMembers: number;
  /**
   * The nodes the split actually RESCUES — dense controls measuring 24–43,
   * which were offenders under the flat 44 and are not under the split. This is
   * the visible size of the change, per route, rather than a claim that the
   * change happened.
   */
  denseAccepted: TapTargetEntry[];
  /**
   * Entries whose container rendered but whose control did not — a STALE
   * SELECTOR, which would silently classify nothing and leave real in-list
   * controls being judged at 44. Empty is the only passing value.
   */
  brokenEntries: string[];
};

/**
 * WCAG 2.5.8 "Target Size (Minimum)" is 24x24; WCAG 2.5.5 "Target Size
 * (Enhanced)" is 44x44. Both are in play, on the membership rule above.
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
 * link that is its parent's entire content, is NOT exempt — which is why
 * `.gn-attention__title` (`inline-flex`) and `.gn-help__pager-link`
 * (`inline-flex`) are NOT reached by it and had to be classified explicitly.
 */
export async function measureTapTargets(
  page: Page,
  dense: readonly DenseInList[] = DENSE_IN_LIST,
): Promise<TapTargets> {
  return page.evaluate(
    ({ table, denseFloor, standaloneFloor }) => {
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

      const classify = (el: Element): boolean =>
        table.some((entry) => el.matches(entry.control) && el.closest(entry.container) !== null);

      const examined: TapTargetEntry[] = [];
      const offenders: TapTargetEntry[] = [];
      const inlineExempt: TapTargetEntry[] = [];
      const denseAccepted: TapTargetEntry[] = [];
      let denseMembers = 0;
      let invisibleSkipped = 0;

      const matched = Array.from(document.querySelectorAll(SELECTOR));
      for (const el of matched) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) {
          invisibleSkipped += 1;
          continue;
        }
        const isDense = classify(el);
        const floor = isDense ? denseFloor : standaloneFloor;
        const entry: TapTargetEntry = {
          selector: describe(el),
          w: Math.round(r.width),
          h: Math.round(r.height),
          floor,
        };
        const parentText = (el.parentElement?.textContent ?? '').trim().length;
        const ownText = (el.textContent ?? '').trim().length;
        const inlineInProse = cs.display === 'inline' && parentText > ownText;
        if (inlineInProse) {
          inlineExempt.push(entry);
          continue;
        }
        if (isDense) {
          denseMembers += 1;
          // The split's whole effect, stated as the set it moves: a dense
          // control that would have been an offender under the flat 44.
          if (entry.w < standaloneFloor || entry.h < standaloneFloor) denseAccepted.push(entry);
        }
        examined.push(entry);
        if (entry.w < floor || entry.h < floor) offenders.push(entry);
      }

      const smallestExamined =
        examined.length === 0
          ? null
          : examined.reduce((a, b) => (Math.min(a.w, a.h) <= Math.min(b.w, b.h) ? a : b));

      /**
       * The stale-selector guard. A container that rendered CONTENT is evidence
       * its control was meant to be on this page; a control selector that then
       * matches nothing inside it is a renamed or deleted class, and the entry
       * has quietly stopped classifying anything.
       *
       * Both halves of the condition are load-bearing, and both are the
       * difference between a check and a false red:
       *
       *   * A container that did NOT render is not evidence of anything. The
       *     attention strip returns `null` on an empty list, so
       *     `.gn-attention__items` is legitimately absent on a page with
       *     nothing needing attention.
       *   * A container that rendered EMPTY is not evidence either.
       *     `.gn-help__group-items` is an unconditional `<ul>`; a group that
       *     declared no sections would render one with no `<li>` in it, and
       *     flagging that would convict a table entry for a page with nothing
       *     to classify rather than for a selector that stopped matching.
       */
      const brokenEntries: string[] = [];
      for (const e of table) {
        const containers = Array.from(document.querySelectorAll(e.container)).filter(
          (c) => c.children.length > 0,
        );
        if (containers.length === 0) continue;
        const found = containers.reduce(
          (n, c) => n + c.querySelectorAll(e.control).length,
          0,
        );
        if (found === 0) brokenEntries.push(`${e.control} inside ${e.container}`);
      }

      return {
        rawMatches: matched.length,
        examined,
        offenders,
        inlineExempt,
        invisibleSkipped,
        smallestExamined,
        denseMembers,
        denseAccepted,
        brokenEntries,
      };
    },
    { table: dense as DenseInList[], denseFloor: DENSE_FLOOR_PX, standaloneFloor: STANDALONE_FLOOR_PX },
  );
}

/**
 * ⚠ RESOLVED AT CALL TIME, NOT AT IMPORT TIME, and the difference is measured.
 *
 * This was `const TAP_BASELINE_PATH = fileURLToPath(new URL(…, import.meta.url))`
 * until 2026-09-20, which made importing this module FAIL under vitest with
 * `TypeError: The URL must be of scheme file` — Vite serves modules over its own
 * scheme, so `import.meta.url` is not a `file:` URL at module scope. Playwright
 * never noticed, because Playwright loads it from disk.
 *
 * The reason that matters beyond the error: `apps/web/test/tap-target-density.test.ts`
 * needs `DENSE_IN_LIST` on the GATE, and **neither viewport suite is on any
 * gate** — so the table that decides which controls get the 24px floor was, and
 * would have stayed, checked by nothing that runs automatically. A module-scope
 * side effect that only works under one of its two loaders was the whole
 * obstacle. A default parameter expression is evaluated when the function is
 * CALLED, so neither suite changes behaviour and the import becomes free.
 */
function tapBaselinePath(): string {
  return fileURLToPath(new URL('./tap-target-baseline.json', import.meta.url));
}

/**
 * Both helpers take the path, because there are now TWO baselines: this suite's
 * unauthed one and `e2e-stack/tap-target-baseline.json` for the signed-in shell.
 * They share this code rather than each carrying a copy, for the reason this
 * repo has a catalogue of: a second definition of "what a tap target is" drifts
 * from the first silently, and the two counts would stop being comparable
 * without either file changing.
 */
export function readTapBaseline(path: string = tapBaselinePath()): Record<string, number> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

export function recordTapBaseline(key: string, count: number, path: string = tapBaselinePath()): void {
  const current = readTapBaseline(path);
  if (current[key] !== undefined) return;
  current[key] = count;
  const ordered = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}

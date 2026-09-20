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
const LABEL_SELECTOR_BASE =
  'span, small, div, strong, em, b, i, time, output, abbr, dfn, a, button, summary, th';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARAGRAPH LABELS — THE SECOND SELECTOR, AND WHY AN EXEMPTION WOULD NOT DO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner ruling, 2026-09-20, on executor 2's `EXEC-RULING-REQUEST-2026-09-20-
 * viewport-gate-body-text-floor.md`, and the shape is `#604`'s one assertion
 * over: **the floor SPLITS, it does not drop.** `measureBodyText`'s 16px floor
 * stays HARD and UNCHANGED for anything not declared here; what moves is which
 * population a DECLARED label is judged by.
 *
 * THE FINDING. `/help` at 390px was the single red on `main` in the viewport
 * suite: 17 offenders, and every one an uppercase eyebrow LABEL —
 * `p.gn-help__eyebrow` at 12.48px ×1 and `p.gn-help__section-eyebrow` at 13px
 * ×16. Neither size is an accident: `c21246b0` (2026-09-15) moved 0.8125rem →
 * 0.78rem under the owner's own direction *"lets move the styling towards the
 * guide"*, and the 13px is annotated "all from the reference" at
 * `packages/ui/src/ui.css:4201-4205`. **Both sit inside the `0.78rem-1.3rem`
 * band this file's own docblock calls the legitimate scale**, and both clear
 * `LABEL_FLOOR_PX`. They were red only because they are `<p>` elements, which
 * puts them in the BODY sweep.
 *
 * ⚠ WHY THIS IS A SECOND SELECTOR AND NOT A SKIP, MEASURED RATHER THAN ASSUMED
 * (the ruling asks this question explicitly, and the answer decides the fix):
 *
 *     BODY_SELECTOR  = 'p, li, dd, dt, td, figcaption, label'
 *     LABEL_SELECTOR = 'span, small, div, …'          ← `p` is in NEITHER list above
 *     'p' in body: true     'p' in label: false     intersection: (none)
 *
 * So a `<p>` label is currently visible to the BODY sweep and **invisible to
 * this one**. Deleting it from the body sweep without adding it here would not
 * re-classify it — **it would leave it with no floor of any kind, silently**,
 * which is precisely the loss the ruling forbids. Hence the `label` column
 * below is a SECOND SELECTOR, and the tables are what make the element still
 * covered rather than merely excused.
 *
 * THE DANGEROUS DIRECTION IS GUARDED BY LEAVING IT ALONE, exactly as
 * `DENSE_IN_LIST` guards it: **an element not declared in this table is still
 * judged at 16px, hard.** Forgetting to declare a label reddens loudly; there
 * is no way to opt out of the floor by accident. The mirror of the tap-target
 * stale-entry guard is here too — a declared `label` whose container and
 * witness rendered but which matched nothing is reported, because that is the
 * only way to tell "renamed out of classification" from "not on this route".
 */
export type LabelInBody = {
  /** The class that makes a body-tagged element a LABEL rather than body copy. */
  readonly label: string;
  /** The wrapper that renders wherever the label can render. */
  readonly container: string;
  /**
   * A sibling only that container renders. Checked before the label is, so an
   * empty shell of a container is not read as a dead entry — the same reason
   * `DENSE_IN_LIST` carries one.
   */
  readonly witness: string;
  /** Which rule sets the size, and who decided it. */
  readonly why: string;
};

export const LABEL_IN_BODY: readonly LabelInBody[] = [
  {
    label: '.gn-help__eyebrow',
    container: '.gn-help__nav',
    witness: '.gn-help__nav-link',
    why:
      "The /help sidebar's `Topics` label — the accessible name of the nav region, uppercase, " +
      '600 weight, tracked. 0.78rem (12.48px), set there by `c21246b0` under the owner\'s ' +
      'direction "lets move the styling towards the guide", and above `LABEL_FLOOR_PX`.',
  },
  {
    label: '.gn-help__section-eyebrow',
    container: '.gn-help__section',
    witness: '.gn-help__h2',
    why:
      'The `MANUAL · <group>` label above each section heading. 0.8125rem (13px), and its own ' +
      'rule records the provenance — "13px/18px/600 with 0.4px tracking … all from the ' +
      'reference" (`packages/ui/src/ui.css:4201-4205`). Above `LABEL_FLOOR_PX`.',
  },
];

/**
 * The declared labels, as one selector. The second half of what this sweep sees.
 *
 * EXPORTED because the body sweep must subtract exactly this set and no more:
 * `responsive.spec.ts` imports it rather than re-typing the two class names, so
 * a third label added to the table cannot be exempted from the 16px floor in
 * one file and left uncovered in the other.
 */
export const LABEL_IN_BODY_SELECTOR = LABEL_IN_BODY.map((e) => e.label).join(', ');

/**
 * Everything this sweep examines: the inline/generic carriers plus the declared
 * paragraph labels. Built from the table rather than typed out, so a label
 * cannot be declared into `LABEL_IN_BODY` and left uncovered here.
 */
const LABEL_SELECTOR = `${LABEL_SELECTOR_BASE}, ${LABEL_IN_BODY_SELECTOR}`;

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

export type TextSample = {
  selector: string;
  fontSizePx: number;
  text: string;
  /** Computed `font-family`. Carried so `uaFont` below can be a real check. */
  fontFamily: string;
};

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
  /**
   * ⚠ THE STALE-ENTRY GUARD for `LABEL_IN_BODY`, and the half that is invisible
   * without it.
   *
   * A declared label that gets RENAMED stops being matched by this sweep — and
   * because it is also exempt from the body sweep, it does not fall back to the
   * 16px floor either. It leaves the population entirely and **no floor applies
   * to it at all**, which reads identically to a clean route. That is the
   * dangerous direction, and it is the one a declaration table creates.
   *
   * Reported only when the container AND its witness both rendered, so a route
   * the label simply is not on cannot redden this. Non-empty names the entries
   * that have stopped classifying anything.
   */
  brokenLabelEntries: string[];
  /**
   * How many elements this sweep examined BECAUSE `LABEL_IN_BODY` declared
   * them — the receiving end of the hand-off the body sweep reports as
   * `BodyText.labelSkipped`. The spec asserts the two numbers are EQUAL; see
   * the note in `measureTypeScale`.
   */
  labelInBodyExamined: number;
  /**
   * Examined elements whose computed `font-family` is NOT the one `body`
   * resolves to — i.e. text painted in the BROWSER's font rather than the
   * product's, because no rule ever set one.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * WHY THIS IS A SEPARATE READING AND NOT A SECOND FLOOR
   * ═══════════════════════════════════════════════════════════════════════
   *
   * The finding this answers could not be seen by `offenders`, and the reason
   * is worth stating because it is the exact shape this repo keeps cataloguing.
   * Twenty-six controls rendered at 13.3333px — Chrome's UA default for
   * `<button>` — on the signed-in surface at 390px. The floor is 12px. **They
   * were ABOVE it.** So the ratchet was green, the baseline read 0, and the
   * defect was found only by a human temporarily raising the floor to 16 for
   * one enumerating run. Nothing in the suite could have failed.
   *
   * Fixing that with a number — "assert the 13.3333px bucket is absent" — is
   * one line and has a FALSE-GREEN mode: if the UA constant ever changes, or a
   * different control leaks a different default, removing the fix produces some
   * OTHER bucket and the assertion goes on passing. It would be a check keyed
   * to the symptom of one browser version.
   *
   * `font-family` names the actual defect instead: *no rule set a font here.*
   * It has no magic number, it cannot drift with a UA constant, and it is
   * mutation-witnessed — deleting `button { font: inherit }` from
   * `apps/web/app/globals.css` turns this list non-empty and names the
   * selectors.
   *
   * Safe as an equality because this product has exactly one SANS stack, and
   * the loop above skips `code`/`kbd`/`pre` descendants before reaching here.
   * The declarations are `body`'s own `var(--gn-font-sans)`; four `inherit`s
   * (`button`, the `input, textarea, select` rule, and
   * `.gn-mcp-authorize__input`'s own); and — the second typeface, added
   * 2026-09-15 with the prototype's fonts — two MONO rules, `.gn-help__code` in
   * `ui.css` and `.gn-invite-mint__url` in `globals.css`. Neither mono site is
   * examined here: `code` is skipped by the `closest()` guard above.
   *
   * **⚠ `editor.css` IS NOW LOADED IN THIS APP, AND THIS PARAGRAPH USED TO SAY
   * THE OPPOSITE.** Its sentence read *"`editor.css` is loaded only inside the
   * RN webview this suite never opens"* and was true until 2026-09-19, when
   * `apps/web/app/layout.tsx` began importing it so the ticket sheet's real
   * editor renders its CONTENT styled rather than bare.
   *
   * **⚠ "Its content" is the precise claim, and the first draft of this note
   * said "the composer mounts unstyled" instead — which an independent review
   * measured as an OVERSTATEMENT.** `editor.css` styles the editor's document
   * and its furniture (images, mention nodes, the picker popup, upload chips,
   * attachment and evidence items). It does **not** style `.editor-slot` or
   * `.editor-slot__submit`, the wrapper and the Save control
   * `TicketEditorSlot.tsx:199/218` emit: `grep -rn '\.editor-slot' --include='*.css'`
   * over `packages/` and `apps/` returns **nothing**, so both fall back to
   * user-agent styling. That is a real gap and it is recorded rather than
   * implied away; it is simply not this import's doing.
   *
   * **The equality above still holds,
   * and that was MEASURED rather than assumed:** that stylesheet declares
   * `font: inherit` in three rules (`.mention-popup__item`,
   * `.image-wrap-menu__option`, `.image-wrap-menu__alt`) — INHERITANCE, never a
   * `font-family` of its own — so it introduces no second typeface and cannot
   * put a non-inherited family into this list. It also adds no element this
   * suite visits: the first two selectors need the mention popup and the image
   * wrap menu open, and the third is inside that same menu. A second SANS
   * typeface in a LABEL position would still need this widened to a set, and
   * would still fail loudly here first.
   *
   * ITS FALSE-GREEN MODE, AND WHY `bodyFamily` IS REPORTED BELOW. This compares
   * each element to `body` and never to the product. Since 2026-09-15 `body`'s
   * family is `var(--gn-font-sans)`; a custom property that fails to resolve
   * makes the declaration invalid at computed-value time, so `body` falls back
   * to the UA serif — and then every inheriting element matches it, `uaFont` is
   * EMPTY, and the run is green with the typeface gone from the whole product.
   * That is the precise failure this list was built to catch, wearing the shape
   * of a pass. `bodyFamily` is carried out so the spec can assert `body` is
   * painting in the ORIGIN's stack, which is the half an equality cannot state.
   */
  uaFont: TextSample[];
  /**
   * `body`'s own computed `font-family` — the thing every comparison above is
   * relative to, reported so that "relative to what" is itself checkable. See
   * the false-green note on `uaFont`.
   */
  bodyFamily: string;
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
    ({ labelSelector, bodySelector, floor, declaredLabelSelector, labelInBody }) => {
      const describe = (el: Element): string => {
        const cls =
          typeof el.className === 'string' && el.className !== ''
            ? `.${el.className.trim().split(/\s+/).join('.')}`
            : '';
        return `${el.tagName.toLowerCase()}${cls}`;
      };

      type Sample = { selector: string; fontSizePx: number; text: string; fontFamily: string };
      const examined: Sample[] = [];
      const offenders: Sample[] = [];
      const bodyOwned: Sample[] = [];
      const uaFont: Sample[] = [];
      let skipped = 0;
      /**
       * Elements that reached `examined` BY DECLARATION — a `<p>` the body
       * sweep handed over because `LABEL_IN_BODY` names its class.
       *
       * Carried out so the hand-off is MEASURED FROM BOTH ENDS. The body sweep
       * reports how many it skipped as declared labels; this reports how many
       * arrived. The spec asserts the two are equal, which is the only way to
       * tell "the element is covered by the label rule instead" from "the
       * element quietly fell out of both sweeps" — two states that otherwise
       * read identically, both green.
       */
      let labelInBodyExamined = 0;

      /* The product's own resolved stack, read from the live document rather
         than hardcoded here — a literal copy of `body`'s declaration would go
         stale the day someone edits the stylesheet, and would then compare the
         page against a font nothing uses. */
      const bodyFamily = getComputedStyle(document.body).fontFamily;

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
          fontFamily: cs.fontFamily,
        };
        /**
         * Matched BOTH selectors. Ordinarily that is the drift this field
         * reports: the two populations have grown into each other and their
         * counts have stopped being separable.
         *
         * A DECLARED paragraph label is the one legitimate overlap, and it is
         * the whole reason the table exists — it is a `<p>` (so the body
         * selector matches it) that is a LABEL (so this sweep is the one that
         * must judge it). It falls through to be examined at `LABEL_FLOOR_PX`.
         *
         * The exemption is the DECLARATION and nothing else: an undeclared `<p>`
         * still lands in `bodyOwned` and still reddens the disjointness
         * assertion. Nothing reaches the lower floor by accident.
         */
        if (el.matches(bodySelector) && !el.matches(declaredLabelSelector)) {
          bodyOwned.push(entry);
          continue;
        }
        examined.push(entry);
        if (el.matches(declaredLabelSelector)) labelInBodyExamined += 1;
        if (entry.fontSizePx < floor) offenders.push(entry);
        if (entry.fontFamily !== bodyFamily) uaFont.push(entry);
      }

      const smallest =
        examined.length === 0
          ? null
          : examined.reduce((a, b) => (a.fontSizePx <= b.fontSizePx ? a : b));

      /**
       * The stale-entry guard for `LABEL_IN_BODY`. Container AND witness must
       * both have rendered before a missing label means anything: without the
       * witness, a route the label simply is not on would report every entry
       * as dead. Same three-part test `DENSE_IN_LIST`'s guard applies.
       */
      const brokenLabelEntries: string[] = [];
      for (const e of labelInBody) {
        if (document.querySelectorAll(e.container).length === 0) continue;
        if (document.querySelectorAll(e.witness).length === 0) continue;
        if (document.querySelectorAll(e.label).length > 0) continue;
        brokenLabelEntries.push(`${e.label} inside ${e.container}`);
      }

      return {
        rawMatches: matched.length,
        examined,
        offenders,
        bodyOwned,
        brokenLabelEntries,
        labelInBodyExamined,
        uaFont,
        bodyFamily,
        skipped,
        smallest,
      };
    },
    {
      labelSelector: LABEL_SELECTOR,
      bodySelector: BODY_SELECTOR,
      floor: LABEL_FLOOR_PX,
      declaredLabelSelector: LABEL_IN_BODY_SELECTOR,
      labelInBody: LABEL_IN_BODY,
    },
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

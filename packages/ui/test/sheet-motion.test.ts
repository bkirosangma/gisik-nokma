import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Case **13.961** — the ticket sheet's scrim and entrance, matched to the
 * prototype's MOTION.
 *
 * The owner: *"gn-sheet__scrim. the surface that shows when you open a ticket.
 * check with the prototype and match it."* **The colour was NOT the mismatch** —
 * all four style × theme combinations already matched (`--gn-surface-overlay`
 * against the prototype's `--overlay`, read from both sides) — so this case is
 * about motion only, and nothing here re-asserts a colour.
 *
 * ## WHY A SOURCE SCAN AND NOT A RENDERED READING
 *
 * **jsdom has no layout engine and no animation timeline**, so no unit test in
 * this repo can watch an entrance: `getComputedStyle` in this suite reports the
 * declared cascade, not a frame, and `document.getAnimations()` returns nothing
 * for an element jsdom never laid out. The timing values below are the DECLARED
 * ones, each compared against the prototype line it ports.
 *
 * **What this case therefore CANNOT see, stated rather than implied:** that the
 * animation actually RUNS, moves, and settles. That was measured in a real
 * browser instead — Chromium via Playwright, driving the SAME bytes of this
 * stylesheet with the `Sheet` component's own markup, eleven checks including a
 * mid-animation transform, a settled transform, and `prefers-reduced-motion:
 * reduce` emulated at the engine level. **No assertion here substitutes for
 * that run**, and a green suite is not evidence the sheet animates.
 *
 * ## The cascade-loss gap, and the uniqueness claim that closes it
 *
 * `attention-styling.test.ts` (13.893) records the defect this shape is blind to:
 * a later rule of equal-or-higher specificity re-declaring the property leaves
 * every VALUE assertion here green with the animation dead in a browser. The
 * mitigation is the same — exactly ONE rule in this stylesheet may carry an
 * `animation` declaration for each selector, asserted at the end — and it is a
 * scan over a fixed list of SPELLINGS rather than a parser.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_CSS = readFileSync(resolve(HERE, '../src/ui.css'), 'utf8');

/**
 * Comments STRIPPED before any scan — and the first draft of this file did not,
 * which made three of its five cases fail against a stylesheet that was
 * correct.
 *
 * The block regex captures everything between the previous `}` and the next
 * `{` as the selector, so a doc comment sitting above a rule is swept into that
 * run and the "selector" arrives as the comment text followed by the real
 * selector. It therefore matches no exact entry. **Both rules this case is
 * about are commented, so both were invisible, and the only block that matched
 * was the reduced-motion guard's** — a reading that passed for the wrong
 * element, which is precisely the failure this file's docblock warns about one
 * level up. A check's name is not its instrument.
 */
const UI_CSS = RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every `selector { … }` block whose COMMA-SEPARATED selector list contains
 * `sel` as an EXACT entry.
 *
 * Exact and not `includes`, and the difference is not pedantry: `includes`
 * makes `blocksFor('.gn-sheet')` also return every `.gn-sheet__scrim`,
 * `.gn-sheet__header` and `.gn-sheet__body` rule, so `declared('.gn-sheet',
 * 'animation')` would have been satisfied by the SCRIM's own animation and the
 * panel could have carried none at all. Measured on the first draft of this
 * file, which passed for exactly that reason.
 */
function blocksFor(sel: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(UI_CSS)) !== null) {
    const selector = (m[1] ?? '').trim();
    // `@media` prelude lines carry a `{` of their own; skip anything whose
    // "selector" is an at-rule rather than a selector list.
    if (selector.startsWith('@')) continue;
    const parts = selector.split(',').map((p) => p.trim());
    if (parts.includes(sel)) out.push({ selector, body: m[2] ?? '' });
  }
  return out;
}

/** The exact selectors named by a guard's body, e.g. `.gn-sheet { … }` → `.gn-sheet`. */
function selectorListIn(body: string): string[] {
  return [...body.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/g)].flatMap((m) =>
    (m[2] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  );
}

/** The declared value of `prop` across every block whose selector list has `sel`. */
function declared(sel: string, prop: string): string[] {
  return blocksFor(sel)
    .flatMap((b) => b.body.split(';'))
    .map((d) => d.trim())
    .filter((d) => d.startsWith(`${prop}:`))
    .map((d) => d.slice(prop.length + 1).trim());
}

describe('13.961 the sheet’s scrim fades and its panel slides, at the prototype’s own timings', () => {
  it('13.961 the scrim carries gnFade at .2s ease, which is what all four prototype scrims carry', () => {
    // The prototype's four scrims — `:1384`, `:1436`, `:1570` and the ticket
    // sheet's own `sheetScrimStyle` at `:3396` — each read
    // `animation:gnFade .2s ease`. `.2s` normalises to `200ms`, which is the
    // spelling this stylesheet already uses for its other gnFade.
    const found = declared('.gn-sheet__scrim', 'animation');
    expect(found).toContain('gnFade 200ms ease');
  });

  it('13.961 the scrim rule is SHARED with the dialog, and both take the fade — a choice made on our rule, not cited from theirs', () => {
    // The prototype CANNOT decide this: all four of its scrims are side panels
    // and it draws no centred dialog anywhere. What decides it is this file's
    // own structure — one rule, one surface, same role — so the case pins the
    // shared selector rather than the sheet alone.
    // Two blocks carry this selector list — the rule itself and its
    // reduced-motion guard — so the assertion is on the one that DECLARES the
    // fade rather than on the count, which is what an earlier version of this
    // case got wrong.
    const shared = blocksFor('.gn-dialog__scrim').filter((b) =>
      b.selector.includes('.gn-sheet__scrim'),
    );
    expect(shared).toHaveLength(2);
    expect(shared.filter((b) => b.body.includes('animation: gnFade 200ms ease'))).toHaveLength(1);
    expect(shared.filter((b) => b.body.includes('animation: none'))).toHaveLength(1);
  });

  it('13.961 the panel carries gnSlide at .26s on the prototype’s cubic-bezier, over its 28px travel', () => {
    expect(declared('.gn-sheet', 'animation')).toContain(
      'gnSlide 260ms cubic-bezier(0.32, 0.72, 0, 1)',
    );
    // The keyframe's own frames, unchanged from `desktop.dc.html@6d7b67c0a52c:95`.
    const slide = /@keyframes\s+gnSlide\s*\{([^}]*\}[^}]*)\}/.exec(UI_CSS)?.[1] ?? '';
    expect(slide).toContain('translateX(28px)');
    expect(slide).toContain('transform: none');
    // The travel is checked against OUR width rather than copied blind: the
    // prototype's sheet is `min(660px,100%)` (`:3399`) and ours is
    // `min(40rem, 94vw)` = 640px, 20px apart — not a difference a 28px offset
    // can be wrong for, and both sit against the same right edge.
    expect(declared('.gn-sheet', 'width')).toContain('min(40rem, 94vw)');
  });

  it('13.961 a reader who asked for less motion gets NONE of it, in the shape this file already uses', () => {
    // The established opt-out shape: a `@media (prefers-reduced-motion: reduce)`
    // block setting `animation: none` on the same selector. Followed rather
    // than invented. **The count is stated the way it really is, because an
    // earlier version of this comment said "three times" and was wrong:**
    // before this change exactly ONE guard in the file turned an ANIMATION off
    // (`.gn-help`'s); the others cover `transition`. The shape is followed; it
    // was not already used three times.
    const guards = [...UI_CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1] ?? '');
    const covering = guards.filter((g) => g.includes('animation: none'));
    for (const sel of ['.gn-sheet__scrim', '.gn-sheet']) {
      expect(
        covering.some((g) => selectorListIn(g).includes(sel)),
        `${sel} is not turned off for a reader who asked for less motion`,
      ).toBe(true);
    }
  });

  it('13.961 the dialog RISES — the prototype draws a centred dialog, and this case used to say it did not', () => {
    // THE CLAIM THIS CASE EXISTS TO KEEP HONEST. The change first asserted that
    // "the prototype draws no centred dialog anywhere" and left `.gn-dialog`
    // unanimated on that basis. **Both halves were false.** `desktop.dc.html`
    // `:1569` is a centred container (`align-items:center;justify-content:center`)
    // whose scrim (`:1570`) carries `gnFade .2s ease` and whose panel (`:1571`)
    // carries `animation:gnRise .24s cubic-bezier(.32,.72,0,1)`. The error was
    // made by grepping for the SCRIMS and never reading each hit's CONTAINER.
    expect(declared('.gn-dialog', 'animation')).toContain(
      'gnRise 240ms cubic-bezier(0.32, 0.72, 0, 1)',
    );
    const rise = /@keyframes\s+gnRise\s*\{([^}]*\}[^}]*)\}/.exec(UI_CSS)?.[1] ?? '';
    expect(rise).toContain('translateY(14px)');
    expect(rise).toContain('transform: none');
    // ...and the dialog PANEL is guarded like the sheet's.
    const guards = [...UI_CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1] ?? '')
      .filter((g) => g.includes('animation: none'));
    expect(guards.some((g) => selectorListIn(g).includes('.gn-dialog'))).toBe(true);
  });

  it('13.961 exactly ONE rule carries each animation — the cascade-loss check this shape is blind without', () => {
    // A second declaration of the same property on the same selector would win
    // or lose by specificity while every value assertion above stayed green.
    //
    // **THE FIRST VERSION OF THIS CHECK DID NOT DO WHAT ITS DOCBLOCK SAID, and
    // an independent review measured the hole rather than accepting the
    // sentence.** It read "exactly ONE rule per selector" but asserted only
    // `.gn-sheet__scrim`, filtered `!== 'none'`, and so was blind in two
    // directions: a competing `animation: none` on either selector, and ANY
    // second declaration on `.gn-sheet` at all. Measured with a browser on the
    // same stylesheet bytes, appending `.gn-sheet { animation: none; }` leaves
    // the suite at 5 passed while the panel's animation is DEAD. A positive
    // control (`animation: gnFade 300ms ease`) reddens it, so the check does
    // fire in the one direction it covered.
    //
    // The fix is to count EVERY `animation` declaration on each selector,
    // separating the guard from the entrance by the VALUE the guard is allowed
    // to carry and nothing else.
    for (const sel of ['.gn-sheet', '.gn-dialog', '.gn-sheet__scrim']) {
      const values = declared(sel, 'animation');
      const nonNone = values.filter((v) => v !== 'none');
      const nones = values.filter((v) => v === 'none');
      expect(nonNone, `${sel} carries ${values.length} animation declarations`).toHaveLength(1);
      // At most one `none`, and it must be the reduced-motion guard's — a second
      // one anywhere would be a rule that kills the animation outright.
      expect(nones.length, `${sel} carries ${nones.length} 'animation: none' declarations`).toBeLessThanOrEqual(1);
    }
    expect(UI_CSS.match(/@keyframes\s+gnFade\s*\{/g)).toHaveLength(1);
    expect(UI_CSS.match(/@keyframes\s+gnSlide\s*\{/g)).toHaveLength(1);
  });
});

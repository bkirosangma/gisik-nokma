import type { Page } from '@playwright/test';

/*
 * CONTROL helpers for the CSS legs (kg-walk-fixes-2): each edits the LIVE stylesheet the harness loaded, so a leg can show
 * the rule it credits is what holds the measurement (the same it(), read again after the edit). Both return how many
 * rules they touched, and the legs assert that count, so a renamed selector fails the control instead of passing it.
 */

/** Deletes every style rule (inside media rules too) whose selector contains `part`; with `media`, only inside a media
 *  rule whose condition contains it. */
export function dropRules(page: Page, part: string, media?: string): Promise<number> {
  return page.evaluate(
    ([needle, condition]) => {
      let dropped = 0;
      const sweep = (list: CSSRuleList, remove: (i: number) => void, inMedia: string | null) => {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const rule = list[i]!;
          if (rule instanceof CSSStyleRule && rule.selectorText.includes(needle!) && (condition === null || (inMedia ?? '').includes(condition!))) {
            remove(i);
            dropped += 1;
          } else if (rule instanceof CSSMediaRule) {
            sweep(rule.cssRules, (j) => rule.deleteRule(j), rule.conditionText);
          }
        }
      };
      for (const sheet of [...document.styleSheets]) sweep(sheet.cssRules, (i) => sheet.deleteRule(i), null);
      return dropped;
    },
    [part, media ?? null] as const,
  );
}

/** Removes `white-space` from the shared `.gn-segmented__item` rule (ui.css), the one-line rule every segmented
 *  control reads (case 27.686); every other declaration of the rule stays. */
export function dropSharedNowrap(page: Page): Promise<number> {
  return page.evaluate(() => {
    let touched = 0;
    for (const sheet of [...document.styleSheets]) {
      for (const rule of [...sheet.cssRules]) {
        if (rule instanceof CSSStyleRule && rule.selectorText === '.gn-segmented__item' && rule.style.whiteSpace === 'nowrap') {
          rule.style.removeProperty('white-space');
          touched += 1;
        }
      }
    }
    return touched;
  });
}

/** Gives ui.css's region rule back its old specificity: `:where(.gn-skeleton-region)` (zero) becomes `.gn-skeleton-region`
 *  (0,1,0) in place, as it was before kg-walk-fixes-2 item 5 (case 27.695), so its `display: block` wins every tie with a
 *  container's own class rule served earlier. */
export function restoreRegionSpecificity(page: Page): Promise<number> {
  return page.evaluate(() => {
    let touched = 0;
    for (const sheet of [...document.styleSheets]) {
      for (const rule of [...sheet.cssRules]) {
        if (rule instanceof CSSStyleRule && rule.selectorText === ':where(.gn-skeleton-region)') {
          rule.selectorText = '.gn-skeleton-region';
          touched += 1;
        }
      }
    }
    return touched;
  });
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './colour-scan.js';

/**
 * The exact-selector CSS reader for the styling refresh (Plan A Task 1; Plan B
 * reuses it). `components.test.tsx`'s `rule()` returns the FIRST substring match,
 * so `rule('.gn-sheet')` lands on the `.gn-dialog,\n.gn-sheet` GROUP at
 * `ui.css:351-352` rather than the sheet's own rule at `:399`. This reader
 * compares the WHOLE selector list, so a group and a lone selector are
 * different rules. It also knows which at-rule a rule sits in, so a
 * `prefers-reduced-motion` arm is not confused with the base rule.
 *
 * Comments are BLANKED rather than removed, so a `}` in prose cannot close a
 * rule early and a selector discussed in a comment never answers for a
 * deleted rule.
 */
export type CssRule = { selectors: readonly string[]; body: string; atRule: string | null };

export const UI_CSS_PATH = join(REPO_ROOT, 'packages/ui/src/ui.css');

export function readUiCss(): string {
  return readFileSync(UI_CSS_PATH, 'utf8');
}

function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

export function parseRules(css: string): CssRule[] {
  const src = blankComments(css);
  const rules: CssRule[] = [];
  const atStack: string[] = [];
  let head = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') {
      const prelude = src.slice(head, i).trim();
      if (prelude.startsWith('@')) {
        atStack.push(prelude.replace(/\s+/g, ' '));
        head = i + 1;
        continue;
      }
      const close = src.indexOf('}', i);
      if (close === -1) throw new Error(`unclosed rule after "${prelude}"`);
      rules.push({
        selectors: prelude.split(',').map((part) => part.replace(/\s+/g, ' ').trim()),
        body: src.slice(i + 1, close),
        atRule: atStack.length > 0 ? (atStack[atStack.length - 1] ?? null) : null,
      });
      i = close;
      head = close + 1;
    } else if (ch === '}') {
      atStack.pop();
      head = i + 1;
    }
  }
  return rules;
}

/**
 * The ONE rule whose selector list is exactly `selectors`, in order, under
 * `atRule` (null = top level). Throws on zero AND on more than one: a
 * selector declared twice at the same level is the cascade fork these tests
 * exist to refuse.
 */
export function ruleExactly(
  css: string,
  selectors: string | readonly string[],
  atRule: string | null = null,
): string {
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  const hits = parseRules(css).filter(
    (rule) =>
      rule.atRule === atRule &&
      rule.selectors.length === wanted.length &&
      rule.selectors.every((selector, index) => selector === wanted[index]),
  );
  if (hits.length !== 1) {
    throw new Error(`expected exactly one rule for "${wanted.join(', ')}" under ${atRule ?? 'top level'}, found ${hits.length}`);
  }
  const [only] = hits;
  if (only === undefined) throw new Error('unreachable');
  return only.body;
}

/** Every rule, at any level, whose selector list NAMES `selector` — for "nothing else declares X" scans. */
export function rulesNaming(css: string, selector: string): CssRule[] {
  return parseRules(css).filter((rule) => rule.selectors.includes(selector));
}

/** The value of the LAST declaration of `property` in `body` (whitespace-collapsed), or null. */
export function valueOf(body: string, property: string): string | null {
  const escaped = property.replace(/[-]/g, '\\-');
  const hits = [...body.matchAll(new RegExp(`(?:^|;|\\s)${escaped}\\s*:\\s*([^;]+);`, 'g'))];
  const last = hits[hits.length - 1];
  const value = last?.[1];
  return value === undefined ? null : value.replace(/\s+/g, ' ').trim();
}

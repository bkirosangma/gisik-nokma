/**
 * `ruleFor` — the whole CSS rule for a selector, read ACROSS LINES.
 *
 * ## Why this is a shared helper rather than six copies
 *
 * Six files under `apps/web/test/` carried their own `ruleFor` when this was
 * written, and **three of them were the single-line form**:
 *
 *     css.split('\n').find((line) => pattern.test(line) && line.includes('{'))
 *
 * That returns the SELECTOR LINE, not the rule. Every assertion of the shape
 * "this rule does not declare X" then reads only the selector line, so it passes
 * with X written one line below — the defect P16 (2026-09-21) found in
 * `neo-card-radius.test.ts`, latent there only because `.gn-sign-in` happened to
 * be written on one line. `members-styling.test.ts` had already recorded both
 * facts in its own note: no shared helper existed in `test/helpers/`, and the
 * single-line form *"truncates every rule in the members family, whose
 * declarations each sit on their own line."*
 *
 * **A check that pins the ABSENCE of a declaration cannot be allowed to stop at
 * the line the declaration is not on.**
 *
 * ## The shape it returns
 *
 * One string, from the selector line through the closing brace, inclusive. The
 * opening brace may sit on a LATER line than the selector match — which is how
 * these stylesheets write a multi-selector rule — so the walk starts at the
 * selector and then advances to the brace.
 *
 * ## What it is not
 *
 * A LINE scan, not a parser, and deliberately: a `}` inside a comment or a
 * string would close a rule early. The alternative is a CSS parser as a test
 * helper; these stylesheets are hand-written with one declaration per line, and
 * every caller asserts something about a specific declaration's presence or
 * absence rather than about nesting.
 */
export function ruleFor(css: string, selectorPattern: RegExp): string | undefined {
  const lines = css.split('\n');
  const startIndex = lines.findIndex((line) => selectorPattern.test(line));
  if (startIndex === -1) return undefined;
  // Walk forward from the first line the OPENING brace appears on, which may be
  // later than the selector match for a multi-selector rule.
  const openIndex = lines.findIndex((line, i) => i >= startIndex && line.includes('{'));
  if (openIndex === -1) return undefined;
  const closeIndex = lines.findIndex((line, i) => i >= openIndex && line.includes('}'));
  if (closeIndex === -1) return undefined;
  return lines.slice(startIndex, closeIndex + 1).join('\n');
}

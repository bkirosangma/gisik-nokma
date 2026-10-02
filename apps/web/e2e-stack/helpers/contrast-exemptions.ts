/**
 * The ONE class the non-text-contrast sweep exempts, and why (owner ruling, 2026-10-02, case 13.1730).
 *
 * `nav.gn-bottom-bar` paints a 1.12:1 border (the phone bar's hairline against the page). The owner ruled
 * the bar a CONTAINER, not a control: it has no state of its own to perceive, and each item inside it
 * carries its own >=3:1 cue. No visual change was made; the sweep now says so out loud instead of failing.
 *
 * The match is EXACT string equality on the sweep's own signature (`tag.class.class`), never a prefix, a
 * `startsWith` or a `contains`. A descendant control of the bar has its own signature (`a.gn-bottom-bar__item`,
 * `button.gn-bottom-bar__…`), so it is NOT exempt and still fails at <3:1 (the CONTROL in
 * `test/contrast-exemptions.test.ts`).
 */
export const CONTRAST_EXEMPT: Readonly<Record<string, string>> = {
  'nav.gn-bottom-bar':
    'container, not a control; its items carry their own >=3:1 cues (icon, label, current-item bar)',
};

/** Splits sub-3:1 sweep rows into those that still FAIL and those the owner exempted (with the reason). */
export function splitByExemption<T extends readonly [string, { ratio: number }]>(
  below: readonly T[],
): { failing: T[]; exempt: { selector: string; ratio: number; reason: string }[] } {
  const failing: T[] = [];
  const exempt: { selector: string; ratio: number; reason: string }[] = [];
  for (const row of below) {
    const reason = Object.prototype.hasOwnProperty.call(CONTRAST_EXEMPT, row[0]) ? CONTRAST_EXEMPT[row[0]] : undefined;
    if (reason === undefined) failing.push(row);
    else exempt.push({ selector: row[0], ratio: row[1].ratio, reason });
  }
  return { failing, exempt };
}

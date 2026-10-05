import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `ticket-list-css-binding.test.tsx`'s path form: jsdom's `import.meta.url` is not a file URL here.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../ui/src/ui.css'), 'utf8');
const CLASSES = [
  'gn-draft-pill', 'gn-draft-banner', 'gn-draft-banner__text', 'gn-draft-reason', 'gn-discard-lines', 'gn-drafts', 'gn-drafts__row',
  'gn-drafts__title', 'gn-drafts__meta', 'gn-drafts__actions', 'gn-drafts__menu', 'gn-drafts__menu-list', 'gn-drafts__alert',
  'gn-drafts__empty', 'gn-nav__count',
  // AMEND-drafts-t8-pending-children (28.197): the pending child's row on a draft's sheet.
  'gn-ticket-sheet__subtask-head', 'gn-ticket-sheet__subtask-key', 'gn-ticket-sheet__subtask-card--pending', 'gn-ticket-sheet__subtask-pending',
];

/** Case 28.179 (styling half; the accessible-name half is asserted in the list, sheet and nav cases). */
describe('28.179 draft styling bindings', () => {
  it.each(CLASSES)('28.179 .%s has a rule', (name) => {
    // `(?![\w-])`, not `\b`: a `\b` after `gn-drafts__menu` also matched `.gn-drafts__menu-list {`.
    expect(css).toMatch(new RegExp(`(^|[\\s,}])\\.${name}(?![\\w-])[^{]*\\{`, 'm'));
  });
  it('28.179 the pill and a pending child are dashed, and the rows meet the phone touch size', () => {
    expect(css).toMatch(/\.gn-draft-pill\s*\{[^}]*border:\s*1px dashed/);
    expect(css).toMatch(/\.gn-ticket-sheet__subtask-card--pending\s*\{[^}]*border:\s*1px dashed/);
    expect(css).toMatch(/@media \(max-width: 40rem\)\s*\{[^}]*\.gn-drafts__row[^}]*min-height:\s*2\.75rem/);
  });
  it('28.179 the block sits above LOADING PLACEHOLDERS, which must stay the last rules (25.019)', () => {
    const block = css.indexOf('.gn-draft-pill {');
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(css.indexOf('/* ── LOADING PLACEHOLDERS'));
  });
});

import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/**
 * Styling refresh Plan B, Task B11 — cases 20.301–20.302 (§20.31). 20.303 and
 * 20.304 are DOM cases (`apps/web/test/create-note-dialog.test.tsx`,
 * `draft-restore-banner.test.tsx`).
 */
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-notes__deleted', declarations: { 'border-top': '1px solid var(--gn-fill-secondary)' } },
  { sheet: 'ui', selectors: '.gn-comment__code', declarations: { background: 'var(--gn-surface-well)' } },
];

const NEO_TASK_BOX_SELECTORS = [
  "[data-style='neo'] .ticket-editor__content ul[data-type='taskList'] input[type='checkbox']:not(:checked)",
  "[data-style='neo'] .gn-comment__task > input[type='checkbox']:not(:checked)",
];
const NEO_TASK_BOX = NEO_TASK_BOX_SELECTORS.join(', ');

describe('20.301 Notes follow the rules', () => {
  it('20.301 every row; fields keep their edge', () => {
    // CONTROL — the notes fields keep their accessible 1px edge: only the Deleted group's separator went to a hairline.
    expectRow({ sheet: 'globals', selectors: '.gn-notes__input', declarations: { border: '1px solid var(--gn-border)' } });
    for (const row of ROWS) expectRow(row);
  });
});

describe('20.302 no flat boundary in Notes', () => {
  it('20.302 none', () => {
    const globals = cssOf('globals');
    // CONTROL — the scan reads the notes rules (and the comment rules in `ui.css`), not an empty set.
    const notes = parseRules(globals).filter((rule) => rule.selectors.some((s) => s.includes('.gn-notes')));
    expect(notes.length).toBeGreaterThan(60);
    const comments = parseRules(cssOf('ui')).filter((rule) => rule.selectors.some((s) => s.includes('.gn-comment')));
    expect(comments.length).toBeGreaterThan(10);
    const prefixes = ['.gn-notes', '.gn-note-', '.ticket-editor', '.gn-comment'];
    // KEPT — neo's own character: an UNCHECKED task box takes the same sunken coat as a neo field
    // (`[data-style='neo'] .gn-field__input`), so it is a control's recess, not a flat boundary. It carries
    // its own accessible edge (`border-strong`, case 9.481), asserted below. The control: with no `kept`
    // list the scan reports exactly this rule, so the entry is load-bearing and cannot go stale silently.
    expect(flatBoundaryOffenders(globals, prefixes, [])).toEqual([NEO_TASK_BOX]);
    expectRow({ sheet: 'globals', selectors: NEO_TASK_BOX_SELECTORS, declarations: { 'border-color': 'var(--gn-border-strong)' } });
    expect(flatBoundaryOffenders(globals, prefixes, [NEO_TASK_BOX])).toEqual([]);
    expect(flatBoundaryOffenders(cssOf('ui'), ['.gn-comment', '.gn-note-'], [])).toEqual([]);
  });
});

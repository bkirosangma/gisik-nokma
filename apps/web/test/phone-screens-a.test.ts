import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * The web app on phones, Plan Task 7 — cases 21.090–21.093 (§21.7): `/workspaces`, the workspace
 * home, Members and the Inbox at ≤40rem. (21.094, the browser pass at every P8 width, is the
 * controller's and stays 🧪.)
 *
 * Every phone rule is read from the ONE `@media (max-width: 40rem)` arm AND must come after the
 * base rule it overrides — at equal specificity source order decides, so a phone rule written
 * above its base is a rule that never applies. `after()` reads that order from `parseRules`
 * (which keeps source order); it only compares two rules of the SAME sheet, because order across
 * `ui.css` and `globals.css` is the bundler's, not this file's. That is why the Inbox arm lives in
 * `ui.css`, beside the `.gn-inbox__*` base rules the components' stylesheet owns.
 */
const PHONE = '@media (max-width: 40rem)';
const TABLET = '@media (max-width: 60rem)';
/** The tablet band's stacked tables (UX fixes Task 4, case 23.052): the 64rem arm, not the 60rem two-column one above. */
const BAND = '@media (max-width: 64rem)';
const globals = readGlobalsCss();
const ui = readUiCss();

/** Position of the one rule `selectors` under `atRule` in the sheet's source order. */
function position(css: string, selectors: string, atRule: string | null): number {
  const index = parseRules(css).findIndex((rule) => rule.atRule === atRule && rule.selectors.length === 1 && rule.selectors[0] === selectors);
  if (index === -1) throw new Error(`no rule "${selectors}" under ${atRule ?? 'top level'}`);
  return index;
}
/** The phone rule for `phoneSelector` comes AFTER the (top-level or tablet) base rule `baseSelector`. */
function after(css: string, baseSelector: string, baseAt: string | null, phoneSelector: string = baseSelector): boolean {
  return position(css, baseSelector, baseAt) < position(css, phoneSelector, PHONE);
}
/** Every declaration block under the phone arm that names `selector`, joined — for "nothing here hides it". */
function phoneBodies(css: string, selector: string): string {
  return rulesNaming(css, selector)
    .filter((rule) => rule.atRule === PHONE)
    .map((rule) => rule.body)
    .join('\n');
}

describe('21.090 /workspaces on a phone', () => {
  it('21.090 the workspace cards are one column and the header Create workspace drops under the title at full width, each AFTER its base rule; tablet keeps two columns', () => {
    expect(valueOf(ruleExactly(globals, '.gn-workspace-list', PHONE), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    // The phone arm follows the tablet arm it overrides (both are `(0,1,0)`).
    expect(position(globals, '.gn-workspace-list', TABLET)).toBeLessThan(position(globals, '.gn-workspace-list', PHONE));
    // The header (prefixes/groups Task 8, 22.151): the title+summary column and the one primary share a row on
    // desktop; on a phone the grid is one column, so the button takes its own line under the title.
    expect(valueOf(ruleExactly(globals, '.gn-workspaces__head', PHONE), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    expect(valueOf(ruleExactly(globals, '.gn-workspaces__head > .gn-button', PHONE), 'grid-column')).toBe('1');
    expect(after(globals, '.gn-workspaces__head', null)).toBe(true);
    expect(after(globals, '.gn-workspaces__head > .gn-button', null)).toBe(true);

    // CONTROL — tablet still draws two columns, and desktop keeps the title and the button on one row.
    expect(valueOf(ruleExactly(globals, '.gn-workspace-list', TABLET), 'grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))');
    expect(valueOf(ruleExactly(globals, '.gn-workspaces__head'), 'grid-template-columns')).toBe('minmax(0, 1fr) auto');
    expect(valueOf(ruleExactly(globals, '.gn-workspaces__head > .gn-button'), 'grid-column')).toBe('2');
  });
});

describe('21.091 the workspace home on a phone', () => {
  it('21.091 project cards and section cards are one column; the door-card hover rule (B13) is unchanged', () => {
    expect(valueOf(ruleExactly(globals, '.gn-workspace-home__projects', PHONE), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    expect(position(globals, '.gn-workspace-home__projects', TABLET)).toBeLessThan(position(globals, '.gn-workspace-home__projects', PHONE));
    expect(valueOf(ruleExactly(globals, '.gn-workspace-home__links', PHONE), 'grid-template-columns')).toBe('minmax(0, 1fr)');
    expect(after(globals, '.gn-workspace-home__links', null)).toBe(true);
    // The inline "New project" row and its phone arm are gone (prefixes/groups Task 8, 22.152): the form is a
    // dialog now, which is its own full-width surface, so no phone rule is left to assert for it.
    expect(globals).not.toMatch(/\.gn-project-founding/);

    // CONTROL — the door cards' hover and press rules are what B13 wrote (shadow only), and no phone rule touches them.
    const hover = ruleExactly(globals, ['.gn-card:has(> .gn-workspace-card__door:hover)', '.gn-card:has(> .gn-project-card__door:hover)']);
    expect(valueOf(hover, 'box-shadow')).toBe('var(--gn-shadow-lift-near)');
    expect(valueOf(hover, 'z-index')).toBe('1');
    for (const rule of parseRules(globals).filter((r) => r.atRule === PHONE)) {
      expect(rule.selectors.join(', '), 'a phone rule on a door card').not.toMatch(/__door/);
    }
    // CONTROL — desktop keeps three project columns.
    expect(valueOf(ruleExactly(globals, '.gn-workspace-home__projects'), 'grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))');
  });
});

describe('21.092 Members on a phone (and, since 2026-10-02, the whole tablet band: 64rem, case 23.052)', () => {
  it('21.092 the table becomes stacked rows (name + email, then role select full width, Remove under it); the zebra and the desktop table are untouched', () => {
    // The table is not a table at ≤64rem (AMENDED 2026-10-02, UX fixes Task 4: was ≤40rem): every level is a block, and the 51.25rem floor — the thing
    // that actually overflowed — is gone. The header band goes with it (each cell names itself).
    const table = ruleExactly(globals, '.gn-members__table', BAND);
    expect(valueOf(table, 'display')).toBe('block');
    expect(valueOf(table, 'min-width')).toBe('0');
    expect(valueOf(ruleExactly(globals, '.gn-members__table tbody', BAND), 'display')).toBe('block');
    expect(valueOf(ruleExactly(globals, '.gn-members__table tr', BAND), 'display')).toBe('block');
    expect(valueOf(ruleExactly(globals, '.gn-members__table thead', BAND), 'display')).toBe('none');
    // Each cell is its own line: name + email over the role control.
    expect(valueOf(ruleExactly(globals, '.gn-members__cell', BAND), 'display')).toBe('block');
    // The role cell stacks the Select and Remove; both take the full width, the static chip does not.
    const roleCell = ruleExactly(globals, '.gn-members__role-cell', BAND);
    expect(valueOf(roleCell, 'flex-direction')).toBe('column');
    expect(valueOf(roleCell, 'align-items')).toBe('stretch');
    expect(valueOf(ruleExactly(globals, '.gn-members__role', BAND), 'align-self')).toBe('flex-start');
    for (const selector of ['.gn-members__table', '.gn-members__cell', '.gn-members__role-cell', '.gn-members__role']) {
      expect(position(globals, selector, null) < position(globals, selector, BAND), selector).toBe(true);
    }
    expect(position(globals, '.gn-members__table tbody', BAND)).toBeGreaterThan(position(globals, '.gn-members__table', null));

    // CONTROL — the desktop table is a table with its 820px floor; no top-level rule gives it `display`.
    const base = ruleExactly(globals, '.gn-members__table');
    expect(valueOf(base, 'min-width')).toBe('51.25rem');
    expect(valueOf(base, 'display')).toBeNull();
    expect(valueOf(ruleExactly(globals, '.gn-members__cell'), 'display')).toBeNull();
    // CONTROL — nothing here names the zebra row (13.888 counts the rules that do: exactly one).
    expect(rulesNaming(globals, '.gn-members__row:nth-child(even)').filter((r) => r.atRule !== null)).toEqual([]);
    expect(parseRules(globals).filter((r) => r.atRule === BAND && r.selectors.some((s) => /\.gn-members__row\b/.test(s)))).toEqual([]);
  });

  it('21.092 the pending list rows wrap (the address takes a line, Withdraw sits left under the meta); the invite form fields and button are full width', () => {
    // P1 of 2026-09-30, kept: the rows wrap and the 40rem arm lays them out.
    expect(valueOf(ruleExactly(globals, '.gn-invite-pending__row'), 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(globals, '.gn-invite-pending__address', PHONE), 'flex-basis')).toBe('100%');
    expect(valueOf(ruleExactly(globals, '.gn-invite-pending__withdraw', PHONE), 'margin-left')).toBe('0');
    expect(after(globals, '.gn-invite-pending__address', null)).toBe(true);
    expect(after(globals, '.gn-invite-pending__withdraw', null)).toBe(true);
    // The invite form: the input and the submit are full width and the select trigger stays so.
    expect(valueOf(ruleExactly(globals, '.gn-invite-mint .gn-field__input', PHONE), 'width')).toBe('100%');
    expect(valueOf(ruleExactly(globals, '.gn-invite-mint .gn-button', PHONE), 'width')).toBe('100%');

    // CONTROL — desktop: Withdraw is pushed to the far edge, and the form's controls have no width of their own.
    expect(valueOf(ruleExactly(globals, '.gn-invite-pending__withdraw'), 'margin-left')).toBe('auto');
    expect(parseRules(globals).filter((r) => r.atRule === null && r.selectors.some((s) => s.startsWith('.gn-invite-mint .')))).toEqual([]);
  });
});

describe('21.093 the Inbox on a phone', () => {
  it('21.093 rows stay ≥2.75rem with room to tap, the unread dot and badge are kept, and "Load more" is full width', () => {
    const row = ruleExactly(ui, '.gn-inbox__row', PHONE);
    expect(valueOf(row, 'min-height')).toBe('2.75rem');
    expect(valueOf(row, 'padding')).toBe('0.75rem 0.5rem');
    const more = ruleExactly(ui, '.gn-inbox__more', PHONE);
    // The base rule's 0.5rem side margins are inside the width: `100%` alone would overflow by 1rem.
    expect(valueOf(more, 'display')).toBe('flex');
    expect(valueOf(more, 'width')).toBe('calc(100% - 1rem)');
    expect(after(ui, '.gn-inbox__row', null)).toBe(true);
    expect(after(ui, '.gn-inbox__more', null)).toBe(true);
    // The dot and the badge are not hidden by any phone rule in either sheet.
    for (const sheet of [ui, globals]) {
      for (const selector of ['.gn-inbox__dot', '.gn-inbox__badge', '.gn-inbox__glyph']) {
        expect(valueOf(phoneBodies(sheet, selector), 'display') ?? '', selector).not.toBe('none');
      }
    }

    // CONTROL — desktop is unchanged: the 44px floor stands at the top level, rows keep their 0.5rem padding,
    // "Load more" is the content-width pill, and the dot and badge still draw.
    expect(valueOf(ruleExactly(ui, '.gn-inbox__row'), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(ui, '.gn-inbox__row'), 'padding')).toBe('0.5rem');
    expect(valueOf(ruleExactly(ui, '.gn-inbox__more'), 'display')).toBe('inline-flex');
    expect(valueOf(ruleExactly(ui, '.gn-inbox__more'), 'width')).toBeNull();
    expect(valueOf(ruleExactly(ui, '.gn-inbox__dot'), 'width')).toBe('8px');
    expect(valueOf(ruleExactly(ui, '.gn-inbox__badge'), 'display')).toBe('inline-block');
  });
});

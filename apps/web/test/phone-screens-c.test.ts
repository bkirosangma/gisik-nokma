import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * The web app on phones, Plan Task 10 — Account, Settings, MCP tokens, Help, Privacy, Terms
 * (cases 21.150–21.153, §21.10; 21.154 is the controller's browser pass).
 *
 * Every phone rule is drawn inside the ONE `@media (max-width: 40rem)` arm and AFTER the base rule it
 * overrides: at equal specificity source order decides, so the order is asserted, not assumed.
 */
const PHONE = '@media (max-width: 40rem)';
const css = readGlobalsCss();
const rules = parseRules(css);

/** Index of the one rule with exactly these selectors under `atRule` — throws on zero or several. */
function indexOfRule(selectors: string | readonly string[], atRule: string | null = null): number {
  ruleExactly(css, selectors, atRule);
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  return rules.findIndex(
    (r) => r.atRule === atRule && r.selectors.length === wanted.length && r.selectors.every((s, i) => s === wanted[i]),
  );
}

/** Index of the LAST top-level rule whose selector list names every one of `selectors` (a base rule may be split across the file). */
function lastBaseIndex(selectors: string | readonly string[]): number {
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  let found = -1;
  rules.forEach((r, i) => {
    if (r.atRule === null && wanted.every((s) => r.selectors.includes(s))) found = i;
  });
  if (found === -1) throw new Error(`no top-level rule names ${wanted.join(', ')}`);
  return found;
}

/** The value of `property` across EVERY top-level rule that names `selector` (last declaration wins, as the cascade does). */
function baseValue(selector: string, property: string): string | null {
  const bodies = rules.filter((r) => r.atRule === null && r.selectors.includes(selector)).map((r) => r.body).join('\n');
  return valueOf(bodies, property);
}

/** The phone rule for `phone` is declared AFTER the base rule for `base`, and nothing outside the arm names `phone`. */
function expectPhoneAfterBase(base: string | readonly string[], phone: string | readonly string[]): void {
  expect(indexOfRule(phone, PHONE), `${String(phone)} must come after ${String(base)}`).toBeGreaterThan(lastBaseIndex(base));
}

/** Desktop control: no top-level rule names a phone-arm selector (the arm is the only place it is drawn). */
function expectOnlyInPhoneArm(selector: string): void {
  const outside = rulesNaming(css, selector).filter((r) => r.atRule !== PHONE);
  expect(outside, `${selector} is drawn outside the phone arm`).toEqual([]);
}

describe('21.150 Account on a phone', () => {
  const SESSION_TEXT = '.gn-account__session-row .gn-account__row-text';
  const PASSKEY_TEXT = '.gn-account__passkey-row .gn-account__row-text';

  it('21.150 device and passkey rows stack: the label block takes the whole line, the action wraps under it; the column is single and uncapped', () => {
    expect(valueOf(ruleExactly(css, [SESSION_TEXT, PASSKEY_TEXT], PHONE), 'flex-basis')).toBe('100%');
    for (const selector of [SESSION_TEXT, PASSKEY_TEXT]) expectOnlyInPhoneArm(selector);
    expectPhoneAfterBase('.gn-account__row-text', [SESSION_TEXT, PASSKEY_TEXT]);
    const column = ruleExactly(css, '.gn-account__column', PHONE);
    expect(valueOf(column, 'max-width')).toBe('none');
    expectPhoneAfterBase('.gn-account__column', '.gn-account__column');

    // CONTROL — desktop is unchanged: the rows still wrap with the text growing beside the action,
    // the column keeps its 42.5rem measure, and the notification row (a switch at the trailing edge)
    // is NOT stacked by this task.
    const base = ruleExactly(css, '.gn-account__row-text');
    expect(valueOf(base, 'flex')).toBe('1 1 auto');
    expect(valueOf(ruleExactly(css, '.gn-account__column'), 'max-width')).toBe('42.5rem');
    expect(valueOf(ruleExactly(css, '.gn-account__column'), 'flex-direction')).toBe('column');
    expect(css).not.toMatch(/\.gn-account__notification-row \.gn-account__row-text/);
  });

  it('21.150 Connected assistants rows stack and the Copy URL field takes its own line and wraps (the account page mounts the MCP screen)', () => {
    expect(valueOf(ruleExactly(css, '.gn-mcp-tokens__when', PHONE), 'flex-basis')).toBe('100%');
    const url = ruleExactly(css, '.gn-mcp-tokens__url', PHONE);
    expect(valueOf(url, 'flex-basis')).toBe('100%');
    expect(valueOf(url, 'overflow-wrap')).toBe('anywhere');
    expectPhoneAfterBase('.gn-mcp-tokens__when', '.gn-mcp-tokens__when');
    expectPhoneAfterBase('.gn-mcp-tokens__url', '.gn-mcp-tokens__url');
    // CONTROL — above 40rem the URL is a content-sized flex item beside Copy.
    expect(valueOf(ruleExactly(css, '.gn-mcp-tokens__url'), 'flex-basis')).toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-mcp-tokens__when'), 'flex-basis')).toBeNull();
  });
});

describe('21.151 Settings on a phone', () => {
  it('21.151 the sidebar becomes a horizontally scrolling track above the content; Save is full width', () => {
    const settings = ruleExactly(css, '.gn-settings', PHONE);
    expect(valueOf(settings, 'flex-direction')).toBe('column');
    expect(valueOf(settings, 'flex-wrap')).toBe('nowrap');
    expect(valueOf(settings, 'align-items')).toBe('stretch');

    const sidebar = ruleExactly(css, '.gn-settings__sidebar', PHONE);
    expect(valueOf(sidebar, 'flex-direction')).toBe('row');
    expect(valueOf(sidebar, 'overflow-x')).toBe('auto');
    // In a COLUMN the base `flex: 0 0 15.5rem` would be a HEIGHT: it must be overridden.
    expect(valueOf(sidebar, 'flex')).toBe('0 0 auto');
    expect(valueOf(sidebar, 'min-width')).toBe('0');
    expect(valueOf(ruleExactly(css, '.gn-settings__content', PHONE), 'flex')).toBe('1 1 auto');

    const items = ruleExactly(css, ['.gn-settings__sidebar a', '.gn-settings__sidebar-item--disabled'], PHONE);
    expect(valueOf(items, 'flex')).toBe('none');
    expect(valueOf(items, 'white-space')).toBe('nowrap');
    // Never colour alone: the current section keeps the base rule's TRACK pill and its 600 weight (AMENDED 2026-10-02,
    // UX fixes T2 / 23.020: it was the accent fill), the targets stay the base rule's 44px, and this arm adds NO
    // `aria-current` rule (13.910 allows exactly one in `.gn-settings`).
    expect(valueOf(ruleExactly(css, ".gn-settings__sidebar a[aria-current='page']"), 'background')).toBe('var(--gn-surface-track)');
    expect(valueOf(ruleExactly(css, ".gn-settings__sidebar a[aria-current='page']"), 'font-weight')).toBe('600');
    expect(rules.filter((r) => r.atRule === PHONE && r.selectors.some((s) => s.includes('gn-settings') && s.includes('aria-current')))).toEqual([]);
    expect(valueOf(ruleExactly(css, ['.gn-settings__sidebar a', '.gn-settings__sidebar-item--disabled']), 'min-height')).toBe('2.75rem');

    const save = ruleExactly(css, '.gn-workspace-settings__actions .gn-button', PHONE);
    expect(valueOf(save, 'flex')).toBe('1 1 100%');
    expect(valueOf(save, 'justify-content')).toBe('center');

    for (const [base, phone] of [
      ['.gn-settings', '.gn-settings'],
      ['.gn-settings__sidebar', '.gn-settings__sidebar'],
      ['.gn-settings__content', '.gn-settings__content'],
      [['.gn-settings__sidebar a', '.gn-settings__sidebar-item--disabled'], ['.gn-settings__sidebar a', '.gn-settings__sidebar-item--disabled']],
      ['.gn-workspace-settings__actions', '.gn-workspace-settings__actions .gn-button'],
    ] as const) {
      expectPhoneAfterBase(base, phone);
    }

    // CONTROL — desktop is unchanged: the sidebar is still a 15.5rem column beside the content.
    expect(valueOf(ruleExactly(css, '.gn-settings__sidebar'), 'flex')).toBe('0 0 15.5rem');
    expect(valueOf(ruleExactly(css, '.gn-settings__sidebar'), 'flex-direction')).toBe('column');
    expect(valueOf(ruleExactly(css, '.gn-settings'), 'flex-direction')).toBeNull();
    expectOnlyInPhoneArm('.gn-workspace-settings__actions .gn-button');
  });
});

describe('21.152 /mcp/tokens on a phone', () => {
  it('21.152 a row stacks: the label block takes the whole line and Rename / Revoke / Disconnect sit under it; the naming form fills the row', () => {
    expect(valueOf(ruleExactly(css, '.gn-mcp-tokens__when', PHONE), 'flex-basis')).toBe('100%');
    const naming = ruleExactly(css, '.gn-mcp-tokens__naming .gn-field', PHONE);
    expect(valueOf(naming, 'min-width')).toBe('0');
    expect(valueOf(naming, 'flex')).toBe('1 1 100%');
    expectPhoneAfterBase('.gn-mcp-tokens__naming .gn-field', '.gn-mcp-tokens__naming .gn-field');
    // The rows keep wrapping (the buttons are siblings of the label block, so a column would
    // put each on its own line): nothing here flips the row to a column.
    expect(valueOf(ruleExactly(css, '.gn-mcp-tokens__row'), 'flex-wrap')).toBe('wrap');
    expect(rulesNaming(css, '.gn-mcp-tokens__row').filter((r) => r.atRule === PHONE)).toEqual([]);

    // CONTROL — desktop unchanged: the 12rem naming field minimum and the unbased label block.
    expect(valueOf(ruleExactly(css, '.gn-mcp-tokens__naming .gn-field'), 'min-width')).toBe('12rem');
    expect(valueOf(ruleExactly(css, '.gn-mcp-tokens__when'), 'flex-basis')).toBeNull();
  });
});

describe('21.153 Help, Privacy and Terms on a phone', () => {
  it('21.153 the legal pages read at full width with 1rem gutters, headings wrap and prose breaks anywhere', () => {
    const column = ruleExactly(css, '.gn-legal__column', PHONE);
    expect(valueOf(column, 'max-width')).toBe('none');
    // 0.75rem of shell inset (`.gn-shell` at ≤60rem) + 0.25rem here = the 1rem gutter. Never the
    // `padding` shorthand on a `.gn-shell` selector: the bottom bar's `:has()` padding lives there.
    expect(valueOf(column, 'padding-inline')).toBe('0.25rem');
    expect(valueOf(ruleExactly(css, '.gn-legal__title', PHONE), 'overflow-wrap')).toBe('anywhere');
    const prose = ruleExactly(css, '.gn-legal__section', PHONE);
    expect(valueOf(prose, 'overflow-wrap')).toBe('anywhere');
    expect(valueOf(prose, 'max-width')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-legal__meta', PHONE), 'max-width')).toBe('none');
    expectPhoneAfterBase('.gn-legal__column', '.gn-legal__column');
    expectPhoneAfterBase('.gn-legal__section', '.gn-legal__section');
    expectPhoneAfterBase('.gn-legal__meta', '.gn-legal__meta');
    expectPhoneAfterBase(['.gn-notfound__title', '.gn-legal__title'], '.gn-legal__title');

    // CONTROL — the desktop measure is unchanged and the title does not truncate at any width.
    expect(valueOf(ruleExactly(css, '.gn-legal__column'), 'max-width')).toBe('72ch');
    expect(baseValue('.gn-legal__section', 'max-width')).toBe('68ch');
    expect(baseValue('.gn-legal__section', 'overflow-wrap')).toBeNull();
    expect(valueOf(ruleExactly(css, ['.gn-notfound__title', '.gn-legal__title']), 'white-space')).toBeNull();
  });

  it('21.153 Help: the column is full width with the same 1rem gutters and its prose breaks anywhere; the stylesheet order lets this file win over ui.css', () => {
    const main = ruleExactly(css, '.gn-help__main', PHONE);
    expect(valueOf(main, 'padding-inline')).toBe('0.25rem');
    const column = ruleExactly(css, '.gn-help__column', PHONE);
    expect(valueOf(column, 'max-width')).toBe('none');
    expect(valueOf(column, 'overflow-wrap')).toBe('anywhere');
    expectOnlyInPhoneArm('.gn-help__main');
    expectOnlyInPhoneArm('.gn-help__column');

    // `.gn-help__main` / `.gn-help__column` are declared in `ui.css` (also loaded by apps/desktop), whose
    // own ≤47.9375rem arm sets `padding: 0 0 2rem`. Equal specificity: the later sheet wins, so the
    // layout must import `ui.css` BEFORE `globals.css`.
    const here = dirname(fileURLToPath(import.meta.url));
    const layout = readFileSync(resolve(here, '../app/layout.tsx'), 'utf8');
    expect(layout.indexOf("'@gisik-nokma/ui/ui.css'")).toBeGreaterThan(-1);
    expect(layout.indexOf("'@gisik-nokma/ui/ui.css'")).toBeLessThan(layout.indexOf("'./globals.css'"));

    // CONTROL — `ui.css` still owns the base: the 72ch measure (desktop) and the 2rem side padding are untouched here.
    const ui = readFileSync(resolve(here, '../../../packages/ui/src/ui.css'), 'utf8');
    expect(valueOf(ruleExactly(ui, '.gn-help__column'), 'max-width')).toBe('72ch');
    expect(valueOf(ruleExactly(ui, '.gn-help__main'), 'padding')).toBe('0 2rem 2rem');
  });
});

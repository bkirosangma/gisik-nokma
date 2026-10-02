import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parseRules, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { redirect } from 'next/navigation';
import Home from '../app/page.js';

/**
 * The web app on phones, Plan Task 12 — sign-in, invite accept, MCP connect/authorize, the root page
 * (cases 21.190–21.192, §21.12; 21.193 is the owner's real-phone pass).
 *
 * Every phone rule is drawn inside the ONE `@media (max-width: 40rem)` arm and AFTER the base rule it
 * overrides: at equal specificity source order decides, so the order is asserted, not assumed.
 */
const PHONE = '@media (max-width: 40rem)';
const css = readGlobalsCss();
const rules = parseRules(css);
const HERE = dirname(fileURLToPath(import.meta.url));

function indexOfRule(selectors: string | readonly string[], atRule: string | null = null): number {
  ruleExactly(css, selectors, atRule);
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  return rules.findIndex(
    (r) => r.atRule === atRule && r.selectors.length === wanted.length && r.selectors.every((s, i) => s === wanted[i]),
  );
}

/** Index of the LAST top-level rule whose selector list names every one of `selectors`. */
function lastBaseIndex(selectors: string | readonly string[]): number {
  const wanted = typeof selectors === 'string' ? [selectors] : [...selectors];
  let found = -1;
  rules.forEach((r, i) => {
    if (r.atRule === null && wanted.every((s) => r.selectors.includes(s))) found = i;
  });
  if (found === -1) throw new Error(`no top-level rule names ${wanted.join(', ')}`);
  return found;
}

/** The phone rule for `phone` is declared AFTER the base rule for `base`. */
function expectPhoneAfterBase(base: string | readonly string[], phone: string | readonly string[]): void {
  expect(indexOfRule(phone, PHONE), `${String(phone)} must come after ${String(base)}`).toBeGreaterThan(lastBaseIndex(base));
}

/** A page's source with its comments blanked, so prose that NAMES `AppNav` cannot answer for an import of it. */
function codeOf(relative: string): string {
  return readFileSync(resolve(HERE, '..', relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Whether the page pulls in the app shell — `AppNav` is the ONLY mount point of the bottom bar. */
const MOUNTS_THE_BAR = /app-nav|bottom-bar|\bAppNav\b|\bBottomBar\b/;

describe('21.190 sign-in on a phone', () => {
  it('21.190 the card fills the width with the shared 24px gutter (UX fixes 23.041); the method, passkey and provider buttons are full width and ≥48px', () => {
    // The centring column's own cap (26rem) and the card's give way; the gutter is a longhand on the
    // `--centred` modifier, never the `padding` shorthand on `.gn-shell`.
    expect(valueOf(ruleExactly(css, '.gn-shell--centred > *', PHONE), 'max-width')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-shell--centred', PHONE), 'padding-inline')).toBe('var(--gn-space-3)');
    expect(valueOf(ruleExactly(css, '.gn-sign-in', PHONE), 'max-width')).toBe('none');

    const buttons = ruleExactly(css, ['.gn-sign-in__method .gn-button', '.gn-sign-in__alternatives > .gn-button'], PHONE);
    expect(valueOf(buttons, 'width')).toBe('100%');
    expect(valueOf(buttons, 'min-height')).toBe('3rem');
    expect(valueOf(buttons, 'justify-content')).toBe('center');
    // The provider marks (Google / Apple) share the row between them and are as tall as the buttons.
    const marks = ruleExactly(css, '.gn-sign-in__mark', PHONE);
    expect(valueOf(marks, 'flex')).toBe('1 1 0');
    expect(valueOf(marks, 'min-height')).toBe('3rem');

    expectPhoneAfterBase('.gn-shell--centred > *', '.gn-shell--centred > *');
    expectPhoneAfterBase('.gn-shell--centred', '.gn-shell--centred');
    expectPhoneAfterBase('.gn-sign-in', '.gn-sign-in');
    expectPhoneAfterBase('.gn-sign-in__mark', '.gn-sign-in__mark');
    expect(indexOfRule(['.gn-sign-in__method .gn-button', '.gn-sign-in__alternatives > .gn-button'], PHONE)).toBeGreaterThan(
      lastBaseIndex('.gn-sign-in__alternatives'),
    );

    // CONTROL — the desktop centred card is unchanged: a 26rem column centred on both axes, the
    // marks still a 44px-tall row of content-sized tiles, and none of the phone selectors is drawn
    // outside the arm.
    expect(valueOf(ruleExactly(css, '.gn-shell--centred > *'), 'max-width')).toBe('26rem');
    expect(valueOf(ruleExactly(css, '.gn-sign-in'), 'max-width')).toBe('26rem');
    const centred = ruleExactly(css, '.gn-shell--centred');
    expect(valueOf(centred, 'align-items')).toBe('center');
    expect(valueOf(centred, 'justify-content')).toBe('center');
    expect(valueOf(centred, 'padding-inline')).toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-sign-in__mark'), 'min-height')).toBe('2.75rem');
    expect(valueOf(ruleExactly(css, '.gn-sign-in__mark'), 'flex')).toBeNull();
    expect(rulesNaming(css, '.gn-sign-in__method .gn-button').filter((r) => r.atRule !== PHONE)).toEqual([]);
  });

  it('21.190 no bottom bar: the sign-in page never mounts AppNav (FD3), the one place the bar renders', () => {
    expect(codeOf('app/sign-in/page.tsx')).not.toMatch(MOUNTS_THE_BAR);
    expect(codeOf('app/sign-in/layout.tsx')).not.toMatch(MOUNTS_THE_BAR);
    // CONTROL — the scan can see a mount: a signed-in screen imports AppNav, and AppNav is what renders the bar.
    expect(codeOf('app/workspaces/page.tsx')).toMatch(MOUNTS_THE_BAR);
    expect(codeOf('src/app-nav.tsx')).toMatch(/\bBottomBar\b/);
  });
});

describe('23.172 the magic-link primary is full width at every width', () => {
  it('23.172 the Send magic link button fills its form in the BASE rule, as wide as the passkey button; the phone arm still holds', () => {
    // The base rule, drawn OUTSIDE any media arm — not only the 40rem arm.
    const base = ruleExactly(css, '.gn-sign-in__method-form .gn-button');
    expect(valueOf(base, 'width')).toBe('100%');
    expect(valueOf(base, 'justify-content')).toBe('center');
    // The primary lives in that form, and is the page's one primary on the screen.
    const page = codeOf('app/sign-in/page.tsx');
    expect(page).toMatch(/<form\s+className="gn-sign-in__method-form"[\s\S]*?<Button variant="primary" type="submit"[^>]*>\s*Send magic link/);
    // "At least as wide as the passkey button": that button is a stretched child of a flex column (no
    // `align-items` narrowing it, no width of its own outside the phone arm), so it spans the card; the
    // primary's 100% is the same span.
    const alternatives = ruleExactly(css, '.gn-sign-in__alternatives');
    expect(valueOf(alternatives, 'flex-direction')).toBe('column');
    expect(valueOf(alternatives, 'align-items')).toBeNull();
    // CONTROL — the rule is not a blanket: no `.gn-button` rule outside the arm narrows the form's button, and
    // the phone arm for the method and passkey buttons is untouched.
    expect(valueOf(ruleExactly(css, ['.gn-sign-in__method .gn-button', '.gn-sign-in__alternatives > .gn-button'], PHONE), 'width')).toBe('100%');
    expect(rulesNaming(css, '.gn-sign-in__method-form .gn-button').filter((r) => r.atRule !== null)).toEqual([]);
  });
});

describe('21.191 invite accept, /mcp/connect and /mcp/authorize on a phone', () => {
  it('21.191 the connect stage and the authorize card fill the width; the centring (C1) is kept; the decision buttons are full width', () => {
    expect(valueOf(ruleExactly(css, '.gn-mcp-connect__stage', PHONE), 'max-width')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-mcp-authorize__card', PHONE), 'max-width')).toBe('none');
    const actions = ruleExactly(css, '.gn-mcp-authorize__actions .gn-button', PHONE);
    expect(valueOf(actions, 'flex')).toBe('1 1 100%');
    expect(valueOf(actions, 'min-height')).toBe('3rem');
    expect(valueOf(actions, 'justify-content')).toBe('center');
    const invite = ruleExactly(css, '.gn-invite .gn-button', PHONE);
    expect(valueOf(invite, 'width')).toBe('100%');
    expect(valueOf(invite, 'min-height')).toBe('3rem');
    expect(valueOf(invite, 'justify-content')).toBe('center');

    expectPhoneAfterBase('.gn-mcp-connect__stage', '.gn-mcp-connect__stage');
    expectPhoneAfterBase('.gn-mcp-authorize__card', '.gn-mcp-authorize__card');
    expectPhoneAfterBase('.gn-mcp-authorize__actions', '.gn-mcp-authorize__actions .gn-button');
    expectPhoneAfterBase('.gn-invite__dead', '.gn-invite .gn-button');

    // C1 KEPT: the connect stage is centred by `margin: auto` and NO phone rule undoes it —
    // not on the stage, not on the page column — so the card is full width AND centred.
    expect(valueOf(ruleExactly(css, '.gn-mcp-connect__stage'), 'margin')).toBe('auto');
    for (const selector of ['.gn-mcp-connect__stage', '.gn-mcp-connect']) {
      for (const rule of rules.filter((r) => r.atRule === PHONE && r.selectors.includes(selector))) {
        expect(valueOf(rule.body, 'margin'), `${selector} margin in the phone arm`).toBeNull();
        expect(valueOf(rule.body, 'text-align'), `${selector} text-align in the phone arm`).toBeNull();
        expect(valueOf(rule.body, 'align-items'), `${selector} align-items in the phone arm`).toBeNull();
      }
    }

    // CONTROL — desktop is unchanged: the 34rem measures and the side-by-side consent row.
    expect(valueOf(ruleExactly(css, '.gn-mcp-connect__stage'), 'max-width')).toBe('34rem');
    expect(valueOf(ruleExactly(css, '.gn-mcp-authorize__card'), 'max-width')).toBe('34rem');
    expect(valueOf(ruleExactly(css, '.gn-mcp-authorize__actions'), 'flex-wrap')).toBe('wrap');
    expect(rulesNaming(css, '.gn-invite .gn-button').filter((r) => r.atRule !== PHONE)).toEqual([]);
    expect(rulesNaming(css, '.gn-mcp-authorize__actions .gn-button').filter((r) => r.atRule !== PHONE)).toEqual([]);
  });

  it('21.191 none of the three pages mounts the bottom bar (FD3)', () => {
    for (const page of ['app/invite/[token]/page.tsx', 'app/mcp/connect/page.tsx', 'app/mcp/authorize/page.tsx']) {
      expect(codeOf(page), page).not.toMatch(MOUNTS_THE_BAR);
    }
    expect(codeOf('app/workspaces/page.tsx')).toMatch(MOUNTS_THE_BAR); // CONTROL
  });

  it('21.191 Join / Allow stay the ONE primary on their screens (the variant is the page\'s, this arm only widens it)', () => {
    const invite = codeOf('app/invite/[token]/page.tsx');
    expect(invite).toMatch(/<Button variant="primary" onClick=\{accept\}[^>]*>/);
    const connect = codeOf('app/mcp/connect/page.tsx');
    expect(connect).toMatch(/<Button variant="primary" onClick=\{\(\) => decide\(true\)\}/);
    // CONTROL — the deny control on the connect screen is the ghost, so there is exactly one primary per screen.
    expect(connect).toMatch(/<Button variant="ghost" onClick=\{\(\) => decide\(false\)\}/);
    expect(connect.match(/variant="primary"/g)).toHaveLength(1);
  });
});

describe('21.192 the root page on a phone', () => {
  it('21.192 renders nothing (so nothing can overflow at 360) and its redirect still fires', () => {
    const rendered: unknown = Home();
    expect(rendered).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith('/workspaces');
    // The page's code carries no markup and no stylesheet class at all.
    expect(codeOf('app/page.tsx')).not.toMatch(/<[A-Za-z]|className/);
    // CONTROL — the same scan does see markup on a page that has some.
    expect(codeOf('app/sign-in/page.tsx')).toMatch(/className/);
  });
});

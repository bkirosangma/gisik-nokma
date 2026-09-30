import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * 9.319–9.320 — the suggestion popups' colour, radius and shadow (bug fix,
 * owner report 2026-09-23: "the inline :note menu is also unstyled").
 * `packages/editor`'s `editor.css` cannot carry these — no package that
 * `apps/desktop`/mobile also import may hold a colour token — so this is
 * the host half, sourced from `sign-in-neo-restyle.test.ts`'s own warning:
 * `packages/ui/test/tokens.test.ts`'s "every var(--gn-…) names a declared
 * role" scan reads ONLY `packages/ui/src/ui.css`, never this file, so a
 * typo'd variable name here resolves to nothing at runtime and every other
 * suite stays green. These cases close that gap for the properties Unit 3
 * touched.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');

describe('9.319-9.320 the suggestion popups draw the house surface, shadow and selected fill', () => {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

  it('9.319 the shared popup rule uses --gn-surface-raised, --gn-shadow-lift-near and --gn-radius-card, the same P-FLOAT set .gn-select__panel uses', () => {
    const rule = ruleFor(css, /^\.mention-popup,\s*$/);
    expect(rule, `.mention-popup rule: ${String(rule)}`).toBeDefined();
    expect(rule).toContain('.wikilink-popup');
    expect(rule).toContain('.ticketref-popup');
    expect(rule).toContain('var(--gn-surface-raised)');
    // Amended 2026-09-30 by 20.221 (styling refresh Plan B): P-FLOAT — `lift-near` and the card radius.
    expect(rule).toContain('var(--gn-shadow-lift-near)');
    expect(rule).toContain('var(--gn-radius-card)');
  });

  it('9.319 the selected-item rule uses --gn-fill-tertiary, not an outline; control: the base item rule carries no background of its own', () => {
    const selected = ruleFor(css, /^\.mention-popup__item--selected,\s*$/);
    expect(selected, `selected rule: ${String(selected)}`).toBeDefined();
    expect(selected).toContain('var(--gn-fill-tertiary)');
    expect(selected).not.toContain('outline');

    const item = ruleFor(css, /^\.mention-popup__item,\s*$/);
    expect(item, `item rule: ${String(item)}`).toBeDefined();
    expect(item).not.toContain('background');
  });

  it('9.320 .ticketref-popup__status and .ticketref-popup__key both read --gn-text-muted, the same tier .gn-select__option-description uses', () => {
    const status = ruleFor(css, /^\.ticketref-popup__status\s*\{/);
    expect(status, `status rule: ${String(status)}`).toBeDefined();
    expect(status).toContain('var(--gn-text-muted)');

    const key = ruleFor(css, /^\.ticketref-popup__key\s*\{/);
    expect(key, `key rule: ${String(key)}`).toBeDefined();
    expect(key).toContain('var(--gn-text-muted)');
    expect(key).toContain('var(--gn-fill-tertiary)');
  });
});

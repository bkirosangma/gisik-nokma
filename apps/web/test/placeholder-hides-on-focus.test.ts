import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * Case 18.304 — Unit 6c (owner, 2026-09-23: "placeholders in the text box
 * should not be visible once they are in focus"). Case ids live in
 * `test-cases/18-notes.md`, block `18.301`-`18.320`.
 *
 * A source-text scan, not a rendered reading: jsdom has no rendering engine
 * and cannot compute a pseudo-element's style, so `:focus::placeholder`'s
 * actual effect is a manual/browser concern (18.305, 🧪), not this file's.
 * What IS checkable — and what a mutation that silently deleted the focus
 * rule would actually break — is that each of the three families this
 * product's text fields fall into (`.gn-field__input`, every BARE
 * `<input>`/`<textarea>` with no such class, and the rich editor's own
 * `is-editor-empty` placeholder) carries a real rule setting the
 * placeholder transparent on focus.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8');
const UI_CSS = readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8');
const EDITOR_CSS = readFileSync(resolve(TEST_DIR, '../../../packages/editor/src/styles/editor.css'), 'utf8');

describe('18.304 every placeholder family hides on focus', () => {
  it('18.304a .gn-field__input:focus::placeholder sets color: transparent', () => {
    const rule = ruleFor(UI_CSS, /^\.gn-field__input:focus::placeholder\s*\{/);
    expect(rule, '.gn-field__input:focus::placeholder rule').toBeDefined();
    expect(rule).toContain('color: transparent');
    // CONTROL: the resting rule stays muted, not transparent — only :focus changes.
    const resting = ruleFor(UI_CSS, /^\.gn-field__input::placeholder\s*\{/);
    expect(resting).toBeDefined();
    expect(resting).not.toContain('transparent');
  });

  it('18.304b bare input/textarea placeholders (no .gn-field__input class) hide on focus, product-wide', () => {
    const restingRule = ruleFor(GLOBALS_CSS, /^input::placeholder,\s*$/);
    expect(restingRule, 'bare resting placeholder rule').toBeDefined();
    expect(restingRule).toContain('textarea::placeholder');
    expect(restingRule).toContain('color: var(--gn-text-subtle)');

    const focusRule = ruleFor(GLOBALS_CSS, /^input:focus::placeholder,\s*$/);
    expect(focusRule, 'bare focus placeholder rule').toBeDefined();
    expect(focusRule).toContain('textarea:focus::placeholder');
    expect(focusRule).toContain('color: transparent');
  });

  it('18.304c the rich editor draws its own placeholder transparent once the field has focus', () => {
    const rule = ruleFor(
      EDITOR_CSS,
      /^\.editor-slot \.ticket-editor__content:focus-within \.is-editor-empty:first-child::before\s*\{/,
    );
    expect(rule, 'editor focus-hide placeholder rule').toBeDefined();
    expect(rule).toContain('color: transparent');
    // CONTROL: the resting (unfocused) rule is still the subtle tone, not transparent.
    const resting = ruleFor(EDITOR_CSS, /^\.ticket-editor__content \.is-editor-empty:first-child::before\s*\{/);
    expect(resting).toBeDefined();
    expect(resting).toContain('var(--gn-text-subtle)');
    expect(resting).not.toContain('transparent');
  });
});

/**
 * Case 18.308 — Unit 6d (owner, 2026-09-23: "placeholders have the same
 * colour as the input text. they should be much lighter"). Confirms the
 * SOURCE reads the lighter role — `18.306`/`18.307`
 * (`packages/ui/test/field-placeholder-contrast.test.ts`) prove that role
 * actually clears its floor once composited; this proves the shipped rules
 * really name it and not `--gn-text-muted` (dark theme's `--gn-text-muted`
 * is #ebebf5, next to typed text's #f2e9e1 — the reported defect).
 */
describe('18.308 every placeholder rule reads --gn-text-subtle, not --gn-text-muted', () => {
  it('18.308 all three resting placeholder rules, and the Select trigger, name --gn-text-subtle', () => {
    const fieldInput = ruleFor(UI_CSS, /^\.gn-field__input::placeholder\s*\{/);
    expect(fieldInput).toBeDefined();
    expect(fieldInput).toContain('var(--gn-text-subtle)');
    expect(fieldInput).not.toContain('var(--gn-text-muted)');

    const bare = ruleFor(GLOBALS_CSS, /^input::placeholder,\s*$/);
    expect(bare).toBeDefined();
    expect(bare).toContain('var(--gn-text-subtle)');
    expect(bare).not.toContain('var(--gn-text-muted)');

    const editor = ruleFor(EDITOR_CSS, /^\.ticket-editor__content \.is-editor-empty:first-child::before\s*\{/);
    expect(editor).toBeDefined();
    expect(editor).toContain('var(--gn-text-subtle)');
    expect(editor).not.toContain('var(--gn-text-muted)');
  });
});

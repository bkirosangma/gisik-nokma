import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Cases 9.323-9.325 — the ticket sheet's "Attach note" button and its
 * AttachNotePicker menu, both drawn as unstyled native controls (owner
 * screenshot, 2026-09-23: "add note button does not have a style and the
 * add note menu needs better styling"). `ticket-notes-section.tsx` and
 * `attach-note-picker.tsx` live in `packages/app-core`, but — like every
 * other ticket-sheet class (`.gn-ticket-sheet__attach` itself, styled a few
 * lines above these rules) — their CSS lives in THIS package's `ui.css`,
 * not `apps/web/app/globals.css`: app-core is the shared view layer, ui.css
 * is the shared design-system layer, and globals.css is web-host-only (the
 * suggestion popups used globals.css instead only because their OWN source
 * package, `packages/editor`, is colour-free by rule for the mobile
 * webview — app-core carries no such restriction). Case ids live in
 * `test-cases/09-editor-attachments.md`, block `9.313`-`9.337`.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const UI_CSS = readFileSync(resolve(TEST_DIR, '../src/ui.css'), 'utf8');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
const CLEAN_UI_CSS = stripComments(UI_CSS);

/**
 * The rule whose selector is EXACTLY `selector`, body included — `.gn-attach-
 * note-picker__option` is a PREFIX of five other selectors in this same
 * block (`-title`, `-meta`, `[aria-selected=…]`, `:disabled`, `--create`), so
 * a `startsWith`/`includes` lookup would answer the wrong rule's body.
 * Mirrors `attention-styling.test.ts`'s own `ruleFor`.
 */
function ruleFor(css: string, selector: string): string | undefined {
  const lines = css.split('\n');
  const startIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === `${selector} {` || trimmed.startsWith(`${selector} {`);
  });
  if (startIndex === -1) return undefined;
  const startLine = lines[startIndex]!;
  if (startLine.includes('}')) return startLine.trim();
  const closeIndex = lines.findIndex((line, i) => i > startIndex && line.includes('}'));
  if (closeIndex === -1) return undefined;
  return lines.slice(startIndex, closeIndex + 1).join('\n');
}

describe('9.324-9.325 the AttachNotePicker menu draws the house field/menu-item treatment', () => {
  it('9.324 option rows carry a selected fill (not an outline) and a muted meta tier, with no painting border', () => {
    const option = ruleFor(CLEAN_UI_CSS, '.gn-attach-note-picker__option');
    expect(option, `.gn-attach-note-picker__option rule: ${String(option)}`).toBeDefined();
    // A direct assertion of the declared value, not the shared `PAINTING_BORDER`
    // regex from `components.test.tsx`: that regex's `\s*` between the colon and
    // the value can backtrack to zero-width, so its negative lookahead ends up
    // testing the SPACE character rather than "none" whenever the source is
    // written `border: none;` (the standard spacing this whole file uses) —
    // `/border(-(top|…))?(-(width|style))?\s*:\s*(?!(none|0)\b)/.test('border: none;')`
    // is `true`, a false positive. Reported separately; not fixed here (out of
    // this unit's scope). A literal-value check has no such gap.
    expect(option).toContain('border: none');

    const selected = ruleFor(CLEAN_UI_CSS, '.gn-attach-note-picker__option[aria-selected="true"]');
    expect(selected, `selected rule: ${String(selected)}`).toBeDefined();
    expect(selected).toContain('var(--gn-fill-tertiary)');
    expect(selected).not.toContain('outline');

    const meta = ruleFor(CLEAN_UI_CSS, '.gn-attach-note-picker__option-meta');
    expect(meta, `meta rule: ${String(meta)}`).toBeDefined();
    expect(meta).toContain('var(--gn-text-muted)');
  });

  it('9.325 the disabled "New note" row is drawn muted via :disabled, and the status/refusal lines match the house muted/danger tiers', () => {
    const disabled = ruleFor(CLEAN_UI_CSS, '.gn-attach-note-picker__option:disabled');
    expect(disabled, `disabled rule: ${String(disabled)}`).toBeDefined();
    expect(disabled).toContain('var(--gn-text-muted)');

    const status = ruleFor(CLEAN_UI_CSS, '.gn-attach-note-picker__status');
    expect(status, `status rule: ${String(status)}`).toBeDefined();
    expect(status).toContain('var(--gn-text-muted)');

    const refusal = ruleFor(CLEAN_UI_CSS, '.gn-attach-note-picker__refusal');
    expect(refusal, `refusal rule: ${String(refusal)}`).toBeDefined();
    expect(refusal).toContain('var(--gn-danger)');
  });
});

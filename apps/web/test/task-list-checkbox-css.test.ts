import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 9.360 / 9.361 — owner report 2026-09-29 (screenshot): in the editor's task list the
 * checkbox sat ~half a line ABOVE its text and was the browser's native blue box; and
 * (owner, same day) done items must not be struck through.
 *
 * MEASURED before the fix, on the real `<li data-checked><label><input><span/></label>
 * <div><p>…</p></div></li>` DOM in the live stylesheets: checkbox centre 8.5px ABOVE
 * the first text line's centre (single-line and wrapped alike), native `appearance:
 * auto`, 13x13px. After: 0.5px (editor) / 0.6px (comment body) in every one of
 * neo/hig/minimal × light/dark, a 16x16 box in a 24x24 hit area. jsdom computes no
 * layout, so this file pins the RULES that produce those numbers.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8');
const EDITOR_CSS = readFileSync(resolve(TEST_DIR, '../../../packages/editor/src/styles/editor.css'), 'utf8');

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

interface Rule {
  selectors: string[];
  body: string;
}

function rulesOf(css: string): Rule[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((hit) => ({
    selectors: (hit[1] ?? '').split(',').map((part) => part.trim()).filter(Boolean),
    body: hit[2] ?? '',
  }));
}

/** The declarations of every rule whose selector LIST contains `selector` verbatim. */
function bodyFor(selector: string): string {
  return rulesOf(CSS)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join('\n');
}

const TASKS = ".ticket-editor__content ul[data-type='taskList']";
const BOX = `${TASKS} input[type='checkbox']`;
const COMMENT_BOX = ".gn-comment__task > input[type='checkbox']";

describe('9.360 the task-list checkbox is centred on the first line and is not the native box', () => {
  it('9.360 the label is one line tall, the first paragraph gives up its top margin, the box is custom', () => {
    const label = bodyFor(`${TASKS} > li > label`);
    expect(label, 'label rule').not.toBe('');
    expect(label).toMatch(/align-items:\s*center;/);
    expect(label).toMatch(/height:\s*1lh;/);
    expect(label).toMatch(/min-height:\s*1\.5rem;/);
    expect(label).toMatch(/width:\s*1\.5rem;/);

    // THE cause of the 8.5px: the item's paragraph kept `.ticket-editor__content p`'s
    // 0.5rem top margin, pushing the text down while the box stayed at the top.
    expect(bodyFor(`${TASKS} > li > div > p:first-child`)).toMatch(/margin-top:\s*0;/);
    expect(bodyFor(`${TASKS} > li > div > p:last-child`)).toMatch(/margin-bottom:\s*0;/);

    const box = bodyFor(BOX);
    expect(box, 'checkbox rule').not.toBe('');
    expect(box).toMatch(/appearance:\s*none;/);
    expect(box).toMatch(/width:\s*1rem;/);
    expect(box).toMatch(/height:\s*1rem;/);
    expect(box).toMatch(/border:\s*1\.5px solid var\(--gn-border-strong\);/);
    expect(box).toMatch(/background:\s*var\(--gn-fill-quaternary\);/);

    // The other states, all on house tokens.
    expect(bodyFor(`${BOX}:hover`)).toMatch(/border-color:\s*var\(--gn-accent\);/);
    expect(bodyFor(`${BOX}:checked`)).toMatch(/background:\s*var\(--gn-accent\);/);
    expect(bodyFor(`${BOX}:checked::after`)).toMatch(/border:\s*solid var\(--gn-text-inverted\);/);
    expect(bodyFor(`${BOX}:focus-visible`)).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\);/);
    // `neo`: the same sunken coat `[data-style="neo"] .gn-field__input` wears.
    const neo = bodyFor(`[data-style='neo'] ${BOX}:not(:checked)`);
    expect(neo).toMatch(/background:\s*var\(--gn-surface-sunken\);/);
    expect(neo).toMatch(/box-shadow:\s*var\(--gn-shadow-sunken\);/);
  });

  it('9.360 the comment body’s read-only task item wears the same box (shared selector list)', () => {
    expect(bodyFor(COMMENT_BOX)).toMatch(/appearance:\s*none;/);
    expect(bodyFor(`${COMMENT_BOX}:checked`)).toMatch(/background:\s*var\(--gn-accent\);/);
    expect(bodyFor(`${COMMENT_BOX}:focus-visible`)).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\);/);
  });

  it('9.360 no colour literal in the task-list rules, and editor.css stays colour-free', () => {
    const own = rulesOf(CSS)
      .filter((rule) => rule.selectors.some((sel) => sel.includes("[data-type='taskList']") || sel.includes('gn-comment__task')))
      .map((rule) => rule.body)
      .join('\n');
    expect(own).not.toBe('');
    expect(own).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    // CONTROL: the structural sheet does not restyle the checkbox at all.
    expect(EDITOR_CSS).not.toMatch(/type=['"]?checkbox/);
  });
});

describe('9.361 a done task item reads muted and is never struck through', () => {
  it('9.361 the checked item is muted; no task-list or comment-task rule sets a text-decoration', () => {
    expect(bodyFor(`${TASKS} > li[data-checked='true'] > div`)).toMatch(/color:\s*var\(--gn-text-muted\);/);
    expect(bodyFor(`${COMMENT_BOX}:checked + span`)).toMatch(/color:\s*var\(--gn-text-muted\);/);
    const decorated = rulesOf(CSS).filter(
      (rule) =>
        rule.selectors.some((sel) => sel.includes("[data-type='taskList']") || sel.includes('gn-comment__task')) &&
        /text-decoration|line-through/.test(rule.body),
    );
    expect(decorated).toEqual([]);
  });
});

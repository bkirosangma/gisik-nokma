import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderCommentBody } from '../../../packages/app-core/src/views/comment-body.js';

/**
 * 9.360 / 9.361 — owner report 2026-09-29 (screenshot): in the editor's task list the
 * checkbox sat ~half a line ABOVE its text and was the browser's native blue box; and
 * (owner, same day) done items must not be struck through.
 *
 * MEASURED before the fix, on the real `<li data-checked><label><input><span/></label>
 * <div><p>…</p></div></li>` DOM in the live stylesheets: checkbox centre 8.5px ABOVE
 * the first text line's centre (single-line and wrapped alike), native `appearance:
 * auto`, 13x13px. After: 0.5px (editor; the comment-body half of this figure was
 * taken on a bare-span fixture and is superseded by 9.365) in every one of
 * neo/hig/minimal × light/dark, a 16x16 box in a 24x24 hit area. jsdom computes no
 * layout, so this file pins the RULES that produce those numbers.
 */
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(TEST_DIR, '../app/globals.css'), 'utf8');
const UI_CSS = readFileSync(resolve(TEST_DIR, '../../../packages/ui/src/ui.css'), 'utf8');
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

/**
 * 9.365 — owner report 2026-09-29 (screenshot of a POSTED comment): each checkbox sat a full
 * paragraph-margin ABOVE its text and the items were far apart, while the composer beneath drew
 * the same list at normal spacing.
 *
 * Root cause, measured in the live app on a posted comment: `renderCommentBody` renders a task
 * item as `<li class="gn-comment__task"><input><span><p>…</p></span></li>` — a taskItem's child
 * is a PARAGRAPH — and `.gn-comment__body > * { margin: 0 }` only reaches DIRECT children, so the
 * nested `<p>` kept the user-agent's `1em` (17px) margins: row 56px for one line, checkbox centre
 * 16.41px above the first line's centre, 34px between one line and the next. The 9.360 rule
 * assumed "a bare input + span (no paragraph margin)" — true only of the hand-written fixture.
 * The fixture here is what the RENDERER emits.
 */
const BODY_LINE_HEIGHT_REM = Number(/line-height:\s*([\d.]+)rem;/.exec(bodyIn(UI_CSS, '.gn-comment__body'))?.[1]);

function bodyIn(css: string, selector: string): string {
  return rulesOf(css)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join('\n');
}

/** Declarations of every rule in ui.css + globals.css whose selector list matches `el`, in source order. */
function matchingBodies(el: Element): string[] {
  const out: string[] = [];
  for (const css of [UI_CSS, CSS]) {
    for (const rule of rulesOf(css)) {
      const hit = rule.selectors.some((sel) => {
        try {
          return el.matches(sel);
        } catch {
          return false;
        }
      });
      if (hit) out.push(rule.body);
    }
  }
  return out;
}

const item = (checked: boolean, ...paragraphs: string[]) => ({
  type: 'taskItem',
  attrs: { checked },
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
const TASK_DOC = {
  type: 'doc',
  content: [{ type: 'taskList', content: [item(false, 'short'), item(false, 'a long wrapped item'), item(true, 'done'), item(false, 'first', 'second')] }],
};

function renderBody(doc: unknown) {
  return render(createElement('div', { className: 'gn-comment__body' }, renderCommentBody(doc, () => null, () => false)));
}

function postedRows(): HTMLElement[] {
  const { container } = renderBody(TASK_DOC);
  return [...container.querySelectorAll<HTMLElement>('li.gn-comment__task')];
}

describe('9.365 a posted comment’s task item sits like the composer’s: box on line 1, no stacked paragraph margins', () => {
  it('9.365 the renderer’s row is input + span > p, and NO rule leaves the nested paragraph a margin', () => {
    const rows = postedRows();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      // The shape the CSS must serve — a paragraph inside the span, not a bare span.
      expect(row.querySelector(':scope > input + span > p'), 'row shape').not.toBeNull();
    }
    const para = rows[0]!.querySelector('p')!;
    const declared = matchingBodies(para).join('\n');
    // Zeroed: some rule matching THIS paragraph declares `margin: 0`…
    expect(declared).toMatch(/(^|[;\s])margin:\s*0;/);
    // …and none gives it a non-zero margin.
    expect(declared).not.toMatch(/margin(?:-top|-bottom)?:\s*(?!0\s*;)\S[^;]*;/);
    // CONTROL (the helper can see a nested-paragraph margin at all): the comment body's own
    // direct `<p>` is reached by `.gn-comment__body > *`, the rule that never reached the row.
    const { container } = renderBody({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] });
    expect(matchingBodies(container.querySelector('.gn-comment__body > p')!).join('\n')).toMatch(/margin:\s*0;/);
  });

  it('9.365 a two-paragraph item keeps only the comment body’s own 0.4rem between its blocks', () => {
    const second = postedRows()[3]!.querySelectorAll('p')[1]!;
    expect(matchingBodies(second).join('\n')).toMatch(/margin-top:\s*0\.4rem;/);
  });

  it('9.365 the row is the composer’s: 1.5rem tall at least, no gap between rows, box nudge = (line - box) / 2', () => {
    const row = postedRows()[0]!;
    const rowRules = matchingBodies(row).join('\n');
    expect(rowRules).toMatch(/min-height:\s*1\.5rem;/);
    // The composer's rows abut (measured gap 0px); ui.css's generic `li + li` 0.15rem must not apply.
    const second = postedRows()[1]!;
    const sibling = matchingBodies(second).filter((body) => /margin-top/.test(body));
    expect(sibling.pop()).toMatch(/margin-top:\s*0;/);

    expect(BODY_LINE_HEIGHT_REM, 'the body line-height parsed from ui.css').toBeGreaterThan(1);
    const nudge = Number(/margin:\s*([\d.]+)rem 0 0;/.exec(bodyFor(COMMENT_BOX))?.[1]);
    expect(nudge).toBeCloseTo((BODY_LINE_HEIGHT_REM - 1) / 2, 4);
  });
});

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
function matchingBodies(el: Element, sheets: string[] = [UI_CSS, CSS]): string[] {
  const out: string[] = [];
  for (const css of sheets) {
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

/**
 * 9.367 — owner report 2026-09-29 (measured on a POSTED comment beside the composer): every `<p>`
 * inside `ul/ol.gn-comment__list > li` kept the user-agent's 1em margins, so consecutive bullets sat
 * 17px apart (pitch 39px for one 22px line, against the composer's 30px), and the `li` carried a
 * 2.4px margin-top on top. Same root cause as 9.365: `renderCommentBody` emits `li > p` (a listItem's
 * child is a paragraph) and `.gn-comment__body > *` reaches one level only. A blockquote's inner
 * `<p>` had the same margins and, with no padding/border to stop them, collapsed THROUGH the quote.
 * Fixture = the renderer's own output for a bullet list holding a two-paragraph item, a nested list
 * and a quote, plus a numbered list and a task list (which must NOT be touched by the list-item rule).
 */
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const li = (...blocks: unknown[]) => ({ type: 'listItem', content: blocks });
const LIST_DOC = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        li(para('parent'), { type: 'bulletList', content: [li(para('child a')), li(para('child b'))] }),
        li(para('first'), para('second')),
        li(para('with quote'), { type: 'blockquote', content: [para('quoted')] }),
        li(para('last')),
      ],
    },
    { type: 'orderedList', content: [li(para('one')), li(para('two'))] },
    { type: 'taskList', content: [item(false, 'task')] },
  ],
};
const declaredMargins = (el: Element, sheets?: string[]) => matchingBodies(el, sheets).join('\n');
const NON_ZERO_MARGIN = /margin(?:-top|-bottom)?:\s*(?!0\s*;)\S[^;]*;/;
const COMPOSER_PARAGRAPH_MARGIN_REM = Number(/margin:\s*([\d.]+)rem 0;/.exec(bodyFor('.ticket-editor__content p'))?.[1]);

describe('9.367 a posted comment’s bullet/numbered list has no stacked paragraph margins; items sit like the composer’s', () => {
  const rendered = () => renderBody(LIST_DOC).container;

  it('9.367 the renderer’s item is li > p, and NO rule leaves that paragraph — or a quote’s — a margin', () => {
    const c = rendered();
    const paras = [...c.querySelectorAll<HTMLElement>('ul.gn-comment__list:not(.gn-comment__list--tasks) li > p:first-child, ol.gn-comment__list > li > p:first-child')];
    expect(paras.length, 'first paragraphs of bullet and numbered items found').toBeGreaterThanOrEqual(8);
    for (const p of paras) {
      const declared = declaredMargins(p);
      expect(declared, p.textContent ?? '').toMatch(/(^|[;\s])margin:\s*0;/);
      expect(declared, p.textContent ?? '').not.toMatch(NON_ZERO_MARGIN);
    }
    const quoted = c.querySelector('blockquote > p')!;
    expect(declaredMargins(quoted)).toMatch(/margin:\s*0;/);
    expect(declaredMargins(quoted)).not.toMatch(NON_ZERO_MARGIN);
  });

  it('9.367 CONTROL — the same check goes RED with the list-item reset deleted (the matcher can see the difference)', () => {
    const c = rendered();
    const p = c.querySelector('ul.gn-comment__list > li > p')!;
    const without = (css: string, rule: string) => {
      expect(css, `the rule "${rule}" exists to be deleted`).toContain(rule);
      return css.replace(rule, '');
    };
    const noListReset = without(UI_CSS, '.gn-comment__list:not(.gn-comment__list--tasks) > li > * { margin: 0; }');
    // Mutation 1: delete the paragraph reset → no rule zeroes the paragraph (UA 1em stays).
    expect(declaredMargins(p, [noListReset, CSS])).not.toMatch(/margin:\s*0;/);
    const noQuoteReset = without(UI_CSS, '.gn-comment__quote > * { margin: 0; }');
    // Mutation 2: delete the quote reset → the quote's paragraph keeps its margins.
    expect(declaredMargins(c.querySelector('blockquote > p')!, [noQuoteReset, CSS])).not.toMatch(/margin:\s*0;/);
  });

  it('9.367 a second block in one item keeps the body’s 0.4rem; a nested list is set off by the same', () => {
    const c = rendered();
    const items = [...c.querySelectorAll('ul.gn-comment__list > li')];
    const second = items.find((el) => el.textContent === 'firstsecond')!.querySelectorAll('p')[1]!;
    expect(declaredMargins(second)).toMatch(/margin-top:\s*0\.4rem;/);
    const nested = c.querySelector('li > ul.gn-comment__list')!;
    expect(declaredMargins(nested)).toMatch(/margin-top:\s*0\.4rem;/);
    expect(declaredMargins(nested)).not.toMatch(/margin-top:\s*0\.15rem;/);
    const quote = c.querySelector('li > blockquote')!;
    expect(declaredMargins(quote)).toMatch(/margin-top:\s*0\.4rem;/);
  });

  it('9.367 items are the composer’s paragraph margin apart — 0.5rem, read from globals.css — not 0.15rem, not 1em', () => {
    expect(COMPOSER_PARAGRAPH_MARGIN_REM, 'the composer paragraph margin parsed from globals.css').toBeGreaterThan(0);
    const c = rendered();
    for (const selector of ['ul.gn-comment__list:not(.gn-comment__list--tasks) > li + li', 'ol.gn-comment__list > li + li']) {
      const sibling = c.querySelector(selector)!;
      const gap = matchingBodies(sibling).filter((body) => /margin-top/.test(body)).pop() ?? '';
      expect(Number(/margin-top:\s*([\d.]+)rem;/.exec(gap)?.[1]), selector).toBeCloseTo(COMPOSER_PARAGRAPH_MARGIN_REM, 4);
    }
  });

  it('9.367 the task list is NOT reached by the list-item rule: its span takes no top margin, its rows still abut', () => {
    const c = rendered();
    const row = c.querySelector('li.gn-comment__task')!;
    const span = row.querySelector(':scope > span')!;
    expect(declaredMargins(span)).not.toMatch(/margin-top:\s*0\.4rem;/);
    expect(declaredMargins(span)).not.toMatch(/margin:\s*0;/);
    // Mutation 3: drop the `:not(--tasks)` guard → the row's span is reached and gets 0.4rem.
    const unguarded = UI_CSS.replaceAll(':not(.gn-comment__list--tasks)', '');
    expect(unguarded).not.toBe(UI_CSS);
    expect(declaredMargins(span, [unguarded, CSS])).toMatch(/margin-top:\s*0\.4rem;/);
  });
});

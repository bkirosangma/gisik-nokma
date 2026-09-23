import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import { MARKDOWN_HINT } from '../src/components/EditorToolbar.js';
import type { DocJson } from '../src/doc.js';

/**
 * 16.85 — the rich-text toolbar.
 *
 * ## What these cases are FOR, stated because the obvious test is worthless
 *
 * The dispatch names the trap in one line: *"a toolbar is exactly the shape
 * where a mutation is easy to fake: a test asserting a button exists proves
 * nothing about whether pressing it changes the document."* So **not one case
 * below asserts that a control is on screen.** Every one of them clicks a
 * control and then reads the DOCUMENT — the serialized ProseMirror JSON — and
 * asserts the mark or node the click claims to produce is in it. A button that
 * rendered and did nothing would pass every "exists" assertion and fail all of
 * these.
 *
 * The mutation each case is written to catch is the one that leaves the markup
 * untouched: delete the `run` body (or point the button at the wrong command)
 * and the JSON assertion fails, because the JSON is what moved.
 *
 * ## Why the selection is set through the EDITOR and not through the DOM
 *
 * jsdom has no layout, so `document.createRange` on rendered text cannot
 * produce a real ProseMirror selection. `selectAll` is the editor's own
 * command, which is the same thing a user's drag would produce, and it is how
 * the sibling cases in `ticket-editor.test.tsx` drive selection (the image wrap
 * menu uses `setNodeSelection` for the same reason).
 */

const DOC: DocJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the description' }] }],
};

function makeProps(overrides: Partial<TicketEditorProps> = {}): TicketEditorProps {
  return {
    queryUsers: async () => [],
    uploadAttachment: vi.fn(),
    onAttachmentAdded: vi.fn(),
    ...overrides,
  };
}

async function mount(props: TicketEditorProps) {
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const ready = vi.fn();
  const view = render(
    <TicketEditor {...props} editorRef={editorRef} onEditorReady={ready} initialDoc={DOC} />,
  );
  await vi.waitFor(() => {
    expect(ready).toHaveBeenCalled();
    expect(editorRef.current).not.toBeNull();
  });
  return { view, editor: editorRef.current as Editor };
}

/** The control, found the way a screen reader names it — by its accessible name. */
function tool(view: ReturnType<typeof render>, name: string): HTMLButtonElement {
  const el = view.container.querySelector(`.ticket-editor__tool[aria-label="${name}"]`);
  if (el === null) throw new Error(`no toolbar control named ${name}`);
  return el as HTMLButtonElement;
}

describe('the editor toolbar (16.85)', () => {
  /**
   * 16.85 — every one of the five MARK/NODE controls changes the document.
   *
   * One `it` per control rather than a loop, so a failure names the control
   * that failed rather than the index of a loop — and so a mutation to one
   * command reddens exactly one case.
   */
  it('16.85 Bold: pressing it puts a bold mark in the document', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.selectAll();
    tool(view, 'Bold').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"type":"bold"');
    });
    view.unmount();
  });

  it('16.85 Italic: pressing it puts an italic mark in the document', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.selectAll();
    tool(view, 'Italic').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"type":"italic"');
    });
    view.unmount();
  });

  it('16.85 Code: pressing it puts a code mark in the document', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.selectAll();
    tool(view, 'Code').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"type":"code"');
    });
    view.unmount();
  });

  it('16.85 Bullet list: pressing it turns the block into a bulletList', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.selectAll();
    tool(view, 'Bullet list').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"type":"bulletList"');
    });
    view.unmount();
  });

  it('16.85 Quote: pressing it turns the block into a blockquote', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.selectAll();
    tool(view, 'Quote').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"type":"blockquote"');
    });
    view.unmount();
  });

  /**
   * 16.85 — `aria-pressed` reports the mark's real state, and it MOVES.
   *
   * Asserted in both directions in one case on purpose: a control hard-wired to
   * `aria-pressed={true}` would pass a one-armed test, and a control hard-wired
   * to `false` likewise. Reading it before and after the click is what makes
   * the value a report rather than a constant.
   */
  it('16.85 the bold control reports its own state, before and after', async () => {
    const { view, editor } = await mount(makeProps());
    expect(tool(view, 'Bold').getAttribute('aria-pressed')).toBe('false');
    editor.commands.selectAll();
    tool(view, 'Bold').click();
    await vi.waitFor(() => {
      expect(tool(view, 'Bold').getAttribute('aria-pressed')).toBe('true');
    });
    view.unmount();
  });

  /**
   * 16.85 — `link` asks for a destination and the destination reaches the document.
   *
   * This is the one control that cannot act on a click alone: `toggleLink`
   * takes a `{href}`, and applying it with nothing would leave an anchor with no
   * destination. The case therefore drives the whole path — open the field,
   * type a URL, press Enter — and asserts the `link` mark carries THAT href.
   */
  it('16.85 Link: the URL field is required, and the typed URL lands on the mark', async () => {
    const { view, editor } = await mount(makeProps());
    expect(view.container.querySelector('.ticket-editor__link-url')).toBeNull();
    tool(view, 'Link').click();
    // `waitFor`, not a bare read: the click dispatches outside `act`, so React
    // has not committed the field by the next line.
    let field!: HTMLInputElement;
    await vi.waitFor(() => {
      field = view.container.querySelector('.ticket-editor__link-url') as HTMLInputElement;
      expect(field).not.toBeNull();
    });
    editor.commands.selectAll();
    // React's own `onChange` reads `event.target.value`, so setting the value
    // through the native setter and dispatching `input` is what a keystroke
    // does here — `field.value = …` alone is invisible to React.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(field, 'https://example.test/x');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('https://example.test/x');
    });
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"link"');
    view.unmount();
  });

  /**
   * 16.85 — an EMPTY url is a cancel, not a link to the empty string.
   *
   * `setLink({href: ''})` is a legal call and would store an anchor that goes
   * nowhere. The case asserts the document is unchanged and the field closed.
   */
  it('16.85 Link: an empty URL applies nothing', async () => {
    const { view, editor } = await mount(makeProps());
    const before = JSON.stringify(editor.getJSON());
    editor.commands.selectAll();
    tool(view, 'Link').click();
    let field!: HTMLInputElement;
    await vi.waitFor(() => {
      field = view.container.querySelector('.ticket-editor__link-url') as HTMLInputElement;
      expect(field).not.toBeNull();
    });
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__link-url')).toBeNull();
    });
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    view.unmount();
  });

  /**
   * 16.85 — the strip is the six controls the prototype draws, IN ITS ORDER, and
   * the hint line is the prototype's own sentence.
   *
   * ## ⚠ THIS CASE WAS NAMED FOR AN ORDER IT DID NOT ASSERT
   *
   * Its first version was named `B/i/code/link/list/quote` and its body asserted
   * `['Bold','Italic','Code','Bullet list','Quote','Link']`. **`list` and `quote`
   * rendered BEFORE `link`**, so the strip was actually `B i code list quote
   * link` while the case name, the component's own comment and the catalogue all
   * said otherwise. An independent reviewer caught it by reading the prototype
   * and then the test — the suite was green throughout, which is exactly the
   * failure mode this repo records most often: **a case passing for a reason
   * unrelated to the property its name states.**
   *
   * The order is not cosmetic: the prototype draws `B, i, code, link, list,
   * quote` (`desktop.dc.html:3670-3678`), and a strip whose control order drifts
   * from the authority's is a difference the owner will see.
   *
   * The one case here that reads the STRIP rather than the document, alongside
   * the read-only case below — eight of these ten drive a control and read the
   * serialized document.
   */
  it('16.85 the strip is B/i/code/link/list/quote in the prototype’s order, and the hint is its sentence', async () => {
    const { view } = await mount(makeProps());
    const names = Array.from(view.container.querySelectorAll('.ticket-editor__tool')).map((el) =>
      el.getAttribute('aria-label'),
    );
    // THE PROTOTYPE'S SIX, ASSERTED AS A PREFIX RATHER THAN AS THE WHOLE STRIP.
    // Plan 4 Task 4 widens the strip with three controls the prototype has no
    // counterpart for (Task item, Code block, Collapsible — case 9.274), and
    // they are appended AFTER the transcribed six so the transcription this
    // case exists to protect stays checkable. The alternative — rewriting the
    // literal to nine names — would leave the order of the prototype's six
    // pinned by nothing but their presence in a longer list.
    expect(names.slice(0, 6)).toEqual(['Bold', 'Italic', 'Code', 'Link', 'Bullet list', 'Quote']);
    // …and the port's three are the ones that follow, in their own order, so a
    // future control cannot slip in between the six and these three unnoticed.
    expect(names.slice(6)).toEqual(['Task item', 'Code block', 'Collapsible', 'Link a note']);
    expect(view.container.querySelector('.ticket-editor__hint')?.textContent).toBe(MARKDOWN_HINT);
    view.unmount();
  });

  /**
   * 16.85 — a READ-ONLY composer has no toolbar.
   *
   * `TicketEditorSlot` passes `editable={!readOnly}`; a viewer who may not write
   * must not be shown six commands the door would refuse. Asserted in both
   * directions so the case cannot pass by the toolbar never rendering at all.
   */
  it('16.85 the toolbar is absent when the editor is read-only, and present when it is not', async () => {
    const editable = await mount(makeProps());
    expect(editable.view.container.querySelector('.ticket-editor__toolbar')).not.toBeNull();
    editable.view.unmount();

    const readOnly = await mount(makeProps({ editable: false }));
    expect(readOnly.view.container.querySelector('.ticket-editor__toolbar')).toBeNull();
    expect(readOnly.view.container.querySelector('.ticket-editor__hint')).toBeNull();
    readOnly.view.unmount();
  });
});

/**
 * Case `13.1154` — E4-8 — the formatting strip and its buttons take the
 * product's fill treatment instead of hard `1px solid currentColor` outlines.
 *
 * In the sheet (style `neo`, light), `button.ticket-editor__tool` painted
 * `border: 1px solid rgb(32,43,73)` (the label ink), `background: transparent`,
 * `box-shadow: none`, and the strip carried the same outline on three sides —
 * while every neighbouring control in the same sheet (`.gn-button--ghost`,
 * `.gn-segmented__item`, `.gn-select__trigger`, `.gn-field__input`) is
 * border-less fill. Six outlined boxes and an outlined rule over a soft-fill
 * sheet.
 *
 * **The two recorded reasons for leaving it that way both failed on
 * inspection, and the second is the one that decides the shape of this fix.**
 * (1) *"`packages/editor` does not depend on `packages/ui`, so no token is
 * reachable"* — a PACKAGE-DEPENDENCY fact where the question is a DOCUMENT one:
 * `layout.tsx` imports both stylesheets, and custom properties cascade.
 * (2) *"this file forbids colour of every kind"* — **a `var(--gn-…)` reference
 * is not a colour literal**, and the header's third prohibition is a bare
 * colour *keyword*, which is why neither rule writes `transparent`. Both are
 * asserted below, because both are one edit away from being undone by someone
 * who reads the header and not this case.
 */
describe('13.1154 the editor strip takes the product\'s fill, not an outline', () => {
  const TEST_DIR = dirname(fileURLToPath(import.meta.url));
  const EDITOR_CSS = readFileSync(resolve(TEST_DIR, '../src/styles/editor.css'), 'utf8');
  const body = (selector: string): string => {
    const m = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(
      EDITOR_CSS.replace(/\/\*[\s\S]*?\*\//g, ''),
    );
    if (m?.[1] === undefined) throw new Error(`no rule for ${selector}`);
    return m[1];
  };

  it('13.1154 both rules declare a fill and no outline', () => {
    expect(body('.ticket-editor__tool')).toMatch(/background:\s*var\(--gn-fill-tertiary\)/);
    expect(body('.ticket-editor__tool')).toMatch(/box-shadow:\s*var\(--gn-shadow-raised\)/);
    expect(body('.ticket-editor__toolbar')).toMatch(/background:\s*var\(--gn-fill-quaternary\)/);
    for (const selector of ['.ticket-editor__tool', '.ticket-editor__toolbar']) {
      expect(body(selector), `${selector} still draws an edge`).not.toMatch(/currentColor/);
      expect(body(selector), `${selector} still draws a border`).not.toMatch(/border[^:]*:\s*1px/);
    }
  });

  it('13.1154 neither rule writes a colour LITERAL or a bare keyword', () => {
    // The half that keeps the fix inside this file's contract: the header bans
    // a hex, a colour function AND a bare colour keyword. `var(--gn-…)` is none
    // of the three — which is the whole reason the fill is expressible here.
    const KEYWORDS = /\b(transparent|white|black|red|grey|gray|currentcolor)\b/i;
    for (const selector of ['.ticket-editor__tool', '.ticket-editor__toolbar']) {
      const rule = body(selector);
      expect(rule, `${selector} carries a colour literal`).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(/i);
      expect(rule, `${selector} carries a bare colour keyword`).not.toMatch(KEYWORDS);
    }
  });

  it('13.1154 the token-less context degrades to what these controls paint today', () => {
    // NOT decoration: `src/webview/entry.tsx` loads this file WITHOUT `ui.css`,
    // so `var(--gn-…)` resolves to `initial` there — `transparent` for
    // `background`, `none` for `box-shadow`. That is exactly the paint these
    // controls have today, so the mobile webview regresses by nothing. Asserted
    // by reading the declaration, since nothing here can run a webview.
    const tool = body('.ticket-editor__tool');
    expect(tool, 'a fallback value was added — it would change the webview paint').not.toMatch(
      /var\(--gn-[a-z-]+,\s*[^)]+\)/,
    );
  });
});

/**
 * 9.274 — THE NOTES PORT'S THREE NEW CONTROLS (Plan 4 Task 4).
 *
 * Same standard as every case above, for the same stated reason: not one
 * assertion here is that a button is on screen. Each clicks a control and then
 * reads the DOCUMENT, so a button that rendered and did nothing fails. The
 * three controls are asserted in ONE `it` with Bold as the control arm, because
 * the property is "the strip grew by three working controls" — and the control
 * arm is what distinguishes that from "the strip is clickable".
 *
 * Each control gets its own mount: `toggleTaskList`, `toggleCodeBlock` and
 * `setDetails` each transform the block they are applied to, so driving all
 * three into one document would make each assertion depend on the previous
 * click's shape rather than on its own command.
 */
describe('9.274 the toolbar gains task, code block and collapsible', () => {
  it('9.274 Task item, Code block and Collapsible each change the document; Bold still toggles bold', async () => {
    const task = await mount(makeProps());
    task.editor.commands.selectAll();
    tool(task.view, 'Task item').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(task.editor.getJSON())).toContain('"type":"taskList"');
    });
    task.view.unmount();

    const code = await mount(makeProps());
    code.editor.commands.selectAll();
    tool(code.view, 'Code block').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(code.editor.getJSON())).toContain('"type":"codeBlock"');
    });
    code.view.unmount();

    const collapsible = await mount(makeProps());
    collapsible.editor.commands.selectAll();
    tool(collapsible.view, 'Collapsible').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(collapsible.editor.getJSON())).toContain('"type":"details"');
    });
    // ⚠ AND IT MUST BE OPEN. Found by the plan-close review: the Details
    // extension's `setDetails()` inserts NO attrs, and `open` defaults to
    // false — so the button produced a FOLDED block while the input rule
    // produced an open one, and 9.274 could not see the difference because it
    // asserted only the node's type. A folded block hides its own body from
    // the reader who just asked for it, and `persist` is on for an editor, so
    // the fold is written into the document.
    expect(collapsible.editor.getJSON().content?.[0]?.attrs?.['open']).toBe(true);
    collapsible.view.unmount();

    // THE CONTROL ARM, in the same `it`: an older control still works, so a
    // failure above is about the new entry rather than about the strip having
    // stopped working altogether.
    const bold = await mount(makeProps());
    bold.editor.commands.selectAll();
    tool(bold.view, 'Bold').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(bold.editor.getJSON())).toContain('"type":"bold"');
    });
    bold.view.unmount();
  });
});

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import { MARKDOWN_HINT } from '../src/components/EditorToolbar.js';
import type { DocJson } from '../src/doc.js';
import { isElementNode, isTextNode } from './helpers/json-node.js';

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

/** The visible tooltip for a control, found by its own `aria-describedby`. */
function tooltipFor(view: ReturnType<typeof render>, button: HTMLButtonElement): Element | null {
  const id = button.getAttribute('aria-describedby');
  if (id === null) return null;
  return view.container.querySelector(`#${id}`);
}

// The suggestion popups portal to `document.body`, outside the React tree
// `view.unmount()` tears down — the same leak `wiki-link.test.ts`/
// `ticket-ref.test.ts` guard against, for the same reason.
afterEach(() => {
  for (const el of document.querySelectorAll('.wikilink-popup, .ticketref-popup')) el.remove();
});

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
    // KB EDITOR PARITY (owner ruling 2026-09-24, cases 9.375-9.386) added seven
    // controls the prototype has no counterpart for: Undo/Redo lead the strip,
    // Strikethrough follows Italic, Numbered list follows Bullet list and the
    // Horizontal rule follows Collapsible. They are filtered out so THIS case
    // still pins the relative order of the eleven it was written for — the
    // prototype's six then the port's five — rather than a longer literal that
    // pins nothing but presence.
    const added = new Set(['Undo', 'Redo', 'Strikethrough', 'Numbered list', 'Horizontal rule', 'Insert table']);
    const original = names.filter((name) => !added.has(name ?? ''));
    expect(original.slice(0, 6)).toEqual(['Bold', 'Italic', 'Code', 'Link', 'Bullet list', 'Quote']);
    expect(original.slice(6)).toEqual(['Task item', 'Code block', 'Collapsible', 'Insert note', 'Insert ticket']);
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

/**
 * 9.326–9.332 — Unit 4 restyle: tooltips (not `title=`), keyboard shortcuts,
 * platform-aware rendering, and the two insert buttons that replaced `[[`.
 * Case ids live in `test-cases/09-editor-attachments.md`, block
 * `9.313`–`9.337`.
 */
describe('9.326-9.332 toolbar tooltips, shortcuts and the insert buttons', () => {
  it('9.326 a tooltip names the tool on hover AND on keyboard focus, via role="tooltip" + aria-describedby, and hides again on blur', async () => {
    const user = userEvent.setup();
    const { view } = await mount(makeProps());
    const bold = tool(view, 'Bold');
    expect(bold.getAttribute('aria-describedby')).toBeNull();

    // Hover shows it.
    await user.hover(bold);
    expect(bold.getAttribute('aria-describedby')).not.toBeNull();
    let panel = tooltipFor(view, bold);
    expect(panel?.getAttribute('role')).toBe('tooltip');
    expect(panel?.textContent).toContain('Bold');
    await user.unhover(bold);
    expect(bold.getAttribute('aria-describedby')).toBeNull();

    // Keyboard focus shows it too — the whole reason this is not `title=`
    // (packages/ui/src/ui.css's ruling: unreachable by keyboard).
    fireEvent.focus(bold);
    expect(bold.getAttribute('aria-describedby')).not.toBeNull();
    panel = tooltipFor(view, bold);
    expect(panel?.textContent).toContain('Bold');
    fireEvent.blur(bold);
    expect(bold.getAttribute('aria-describedby')).toBeNull();
    view.unmount();
  });

  it('9.327 Bold\'s tooltip carries its shortcut and the button exposes aria-keyshortcuts (aria-label stays the plain name)', async () => {
    const { view } = await mount(makeProps({ toolbarPlatform: 'mac' }));
    const bold = tool(view, 'Bold');
    expect(bold.getAttribute('aria-label')).toBe('Bold');
    expect(bold.getAttribute('aria-keyshortcuts')).toBe('Meta+B');
    fireEvent.focus(bold);
    expect(tooltipFor(view, bold)?.textContent).toContain('⌘B');
    view.unmount();
  });

  it('9.328 the same shortcut renders ⌘-glyphs on mac and Ctrl+-words on every other platform, from one shared table', async () => {
    const mac = await mount(makeProps({ toolbarPlatform: 'mac' }));
    const codeBlockMac = tool(mac.view, 'Code block');
    fireEvent.focus(codeBlockMac);
    expect(tooltipFor(mac.view, codeBlockMac)?.textContent).toContain('⌘⌥C');
    expect(codeBlockMac.getAttribute('aria-keyshortcuts')).toBe('Meta+Alt+C');
    mac.view.unmount();

    // CONTROL, same tool, the other platform arm: no ⌘ anywhere, Ctrl+ words instead.
    const other = await mount(makeProps({ toolbarPlatform: 'other' }));
    const codeBlockOther = tool(other.view, 'Code block');
    fireEvent.focus(codeBlockOther);
    const otherText = tooltipFor(other.view, codeBlockOther)?.textContent ?? '';
    expect(otherText).toContain('Ctrl+Alt+C');
    expect(otherText).not.toContain('⌘');
    expect(codeBlockOther.getAttribute('aria-keyshortcuts')).toBe('Control+Alt+C');
    other.view.unmount();
  });

  it('9.329 Link and Collapsible have no keyboard shortcut anywhere: no aria-keyshortcuts, no shortcut in the tooltip', async () => {
    const { view } = await mount(makeProps());
    for (const name of ['Link', 'Collapsible']) {
      const button = tool(view, name);
      expect(button.getAttribute('aria-keyshortcuts'), `${name} aria-keyshortcuts`).toBeNull();
      fireEvent.focus(button);
      const text = tooltipFor(view, button)?.textContent ?? '';
      // The name is still there — only a shortcut glyph is absent — so this
      // is not "no tooltip", it is "no invented binding" (advisor rule).
      expect(text).toContain(name);
      expect(text).not.toMatch(/⌘|Ctrl|Mod-/);
      fireEvent.blur(button);
    }
    view.unmount();
  });

  it('9.330 a markdown trigger, where one exists, is a second muted tooltip line reading FROM the same table MARKDOWN_HINT is built from', async () => {
    const { view } = await mount(makeProps());
    const bold = tool(view, 'Bold');
    fireEvent.focus(bold);
    const boldText = tooltipFor(view, bold)?.textContent ?? '';
    expect(boldText).toContain('or type **bold**');
    // Proof of ONE source, not a second hand-typed literal: the exact markdown
    // fragment shown here is a substring of the exported MARKDOWN_HINT sentence.
    expect(MARKDOWN_HINT).toContain('**bold**');
    fireEvent.blur(bold);

    // A tool with a markdown trigger MARKDOWN_HINT itself never names (code
    // block's ``` is not one of the sentence's six) still gets its own line,
    // sourced from the installed extension's own input rule (verified against
    // `@tiptap/extension-code-block@3.31.3`'s `backtickInputRegex`).
    const codeBlock = tool(view, 'Code block');
    fireEvent.focus(codeBlock);
    expect(tooltipFor(view, codeBlock)?.textContent).toContain('or type ``` then space');
    fireEvent.blur(codeBlock);

    // CONTROL, same tooltip: the shortcut line and the markdown line never
    // merge into one string with the wrong content — Code block's own
    // shortcut is still there too, distinguishable from Bold's.
    fireEvent.focus(codeBlock);
    expect(tooltipFor(view, codeBlock)?.textContent).toContain('Code block');
    expect(tooltipFor(view, codeBlock)?.textContent).not.toContain('**bold**');
    view.unmount();
  });

  it('9.331 Insert note / Insert ticket each insert their trigger and open the SAME picker a typed trigger opens', async () => {
    const queryNotes = vi.fn(async () => []);
    const queryTickets = vi.fn(async () => []);
    const { view, editor } = await mount(makeProps({ queryNotes, queryTickets }));
    editor.commands.selectAll();
    editor.commands.deleteSelection();

    tool(view, 'Insert note').click();
    expect(JSON.stringify(editor.getJSON())).toContain(':note ');
    await vi.waitFor(() => {
      expect(document.querySelector('.wikilink-popup')).not.toBeNull();
    });
    // Focus stayed in the editor — the whole point of chaining `.focus()`
    // into the same command the click runs, not a second implementation.
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(editor.view.dom);
    });

    editor.commands.clearContent();
    tool(view, 'Insert ticket').click();
    expect(JSON.stringify(editor.getJSON())).toContain(':ticket ');
    await vi.waitFor(() => {
      expect(document.querySelector('.ticketref-popup')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(editor.view.dom);
    });
    view.unmount();
  });

  it('9.332 no @ / mention control anywhere in the strip, and the strip is exactly seventeen controls (the eleven plus KB parity six; no stray extra)', async () => {
    const { view } = await mount(makeProps());
    const names = Array.from(view.container.querySelectorAll('.ticket-editor__tool')).map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(names).toHaveLength(17);
    expect(names).not.toContain('@');
    expect(names.some((name) => name?.toLowerCase().includes('mention'))).toBe(false);
    view.unmount();
  });

  /** 9.375 — Undo/Redo lead the strip, report their state, and act. */
  it('9.375 Undo and Redo are disabled with no history, enabled after an edit, and step through it', async () => {
    const { view, editor } = await mount(makeProps());
    expect(tool(view, 'Undo').disabled).toBe(true);
    expect(tool(view, 'Redo').disabled).toBe(true);
    const names = Array.from(view.container.querySelectorAll('.ticket-editor__tool')).map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(names.slice(0, 2)).toEqual(['Undo', 'Redo']);

    editor.chain().focus().selectAll().toggleBold().run();
    await vi.waitFor(() => {
      expect(tool(view, 'Undo').disabled).toBe(false);
    });
    expect(JSON.stringify(editor.getJSON())).toContain('"bold"');
    tool(view, 'Undo').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).not.toContain('"bold"');
      expect(tool(view, 'Redo').disabled).toBe(false);
    });
    tool(view, 'Redo').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"bold"');
    });
    view.unmount();
  });

  /** 9.376 — Strikethrough, Numbered list and Horizontal rule change the document. */
  it('9.376 Strikethrough puts a strike mark, Numbered list an orderedList, Horizontal rule a horizontalRule', async () => {
    const { view, editor } = await mount(makeProps());
    editor.chain().focus().selectAll().run();
    tool(view, 'Strikethrough').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"strike"');
    });
    expect(tool(view, 'Strikethrough').getAttribute('aria-pressed')).toBe('true');
    tool(view, 'Numbered list').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"orderedList"');
    });
    editor.commands.clearContent();
    tool(view, 'Horizontal rule').click();
    await vi.waitFor(() => {
      expect(JSON.stringify(editor.getJSON())).toContain('"horizontalRule"');
    });
    // a rule toggles nothing, so it reports no pressed state
    expect(tool(view, 'Horizontal rule').hasAttribute('aria-pressed')).toBe(false);
    view.unmount();
  });

  /** 9.377 — every heading level is reachable from the one select, and it reports the active one. */
  it('9.377 the Heading level select sets H1-H6 and Paragraph, and reports the active level', async () => {
    const { view, editor } = await mount(makeProps());
    const select = view.container.querySelector('select[aria-label="Heading level"]') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Paragraph',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Heading 4',
      'Heading 5',
      'Heading 6',
    ]);
    expect(select.value).toBe('paragraph');
    for (const level of [1, 2, 3, 4, 5, 6]) {
      fireEvent.change(select, { target: { value: String(level) } });
      await vi.waitFor(() => {
        expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level } });
      });
      await vi.waitFor(() => {
        expect(select.value).toBe(String(level));
      });
    }
    fireEvent.change(select, { target: { value: 'paragraph' } });
    await vi.waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    });
    view.unmount();
  });

  /** 9.378 — selectFullLink: a mark toggle inside a link formats the WHOLE link. */
  it('9.378 Bold pressed with the caret inside a link bolds the entire link text', async () => {
    const linked: DocJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see ' },
            { type: 'text', text: 'the docs', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
            { type: 'text', text: ' now' },
          ],
        },
      ],
    };
    const editorRef: React.MutableRefObject<Editor | null> = { current: null };
    const ready = vi.fn();
    const view = render(
      <TicketEditor {...makeProps()} editorRef={editorRef} onEditorReady={ready} initialDoc={linked} />,
    );
    await vi.waitFor(() => {
      expect(editorRef.current).not.toBeNull();
    });
    const editor = editorRef.current as Editor;
    // caret in the middle of "the docs" (doc positions: paragraph opens at 0, 'see ' is 1-5)
    editor.chain().focus().setTextSelection(8).run();
    tool(view, 'Bold').click();
    await vi.waitFor(() => {
      const nodes = editor.getJSON().content?.[0]?.content ?? [];
      const bolded = nodes.filter(isTextNode).filter((n) => n.marks?.some((m) => m.type === 'bold')).map((n) => n.text);
      expect(bolded).toEqual(['the docs']);
    });
    view.unmount();
  });

  /** 9.379 — the new tools name their real shortcut/markdown in the tooltip. */
  it('9.379 the new tools carry their shortcut and markdown trigger', async () => {
    const { view } = await mount(makeProps());
    expect(tool(view, 'Undo').getAttribute('aria-keyshortcuts')).toBe('Control+Z');
    expect(tool(view, 'Redo').getAttribute('aria-keyshortcuts')).toBe('Control+Shift+Z');
    expect(tool(view, 'Strikethrough').getAttribute('aria-keyshortcuts')).toBe('Control+Shift+S');
    expect(tool(view, 'Numbered list').getAttribute('aria-keyshortcuts')).toBe('Control+Shift+7');
    expect(tool(view, 'Horizontal rule').hasAttribute('aria-keyshortcuts')).toBe(false);
    fireEvent.mouseEnter(tool(view, 'Strikethrough').parentElement as Element);
    expect(tooltipFor(view, tool(view, 'Strikethrough'))?.textContent).toContain('~~strike~~');
    view.unmount();
  });

  /** 9.380 — the table picker: open, light the corner, choose, and a header-row table lands. */
  it('9.380 Insert table opens the size grid; choosing 2 × 3 inserts a 2-row, 3-column table with a header row', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.clearContent();
    const trigger = tool(view, 'Insert table');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(view.container.querySelector('.ticket-editor__table-picker')).toBeNull();
    trigger.click();
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__table-picker')).not.toBeNull();
    });
    expect(tool(view, 'Insert table').getAttribute('aria-expanded')).toBe('true');
    const cells = view.container.querySelectorAll<HTMLButtonElement>('.ticket-editor__table-cell');
    expect(cells).toHaveLength(64);
    expect(view.container.querySelector('.ticket-editor__table-label')?.textContent).toBe('1 × 1 table');
    fireEvent.mouseEnter(cells[10] as Element); // row 2, col 3
    expect(view.container.querySelector('.ticket-editor__table-label')?.textContent).toBe('2 × 3 table');
    expect(view.container.querySelectorAll('.ticket-editor__table-cell--lit')).toHaveLength(6);
    (cells[10] as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe('table');
    });
    const table = editor.getJSON().content?.[0];
    if (!table || !isElementNode(table)) throw new Error('expected a table node');
    expect(table.content).toHaveLength(2);
    const row = table.content?.[0];
    if (!row || !isElementNode(row)) throw new Error('expected a table row');
    expect(row.content).toHaveLength(3);
    expect(row.content?.[0]?.type).toBe('tableHeader');
    expect(view.container.querySelector('.ticket-editor__table-picker')).toBeNull();
    view.unmount();
  });

  /** 9.381 — keyboard: arrows move the corner, Enter commits, Escape closes and returns to the trigger. */
  it('9.381 the size grid works from the keyboard: arrows, Enter to insert, Escape to close with focus back on the trigger', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.clearContent();
    tool(view, 'Insert table').click();
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__table-picker')).not.toBeNull();
    });
    const grid = view.container.querySelector('.ticket-editor__table-picker') as HTMLElement;
    const focused = () => document.activeElement?.getAttribute('aria-label');
    await vi.waitFor(() => {
      expect(focused()).toBe('1 × 1 table');
    });
    // one tab stop for the whole grid
    expect(grid.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    await vi.waitFor(() => {
      expect(focused()).toBe('2 × 2 table');
    });
    // clamped at the edge, never past 8
    for (let n = 0; n < 10; n += 1) fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    await vi.waitFor(() => {
      expect(focused()).toBe('2 × 8 table');
    });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__table-picker')).toBeNull();
    });
    expect(document.activeElement).toBe(tool(view, 'Insert table'));
    expect(editor.getJSON().content?.[0]?.type).not.toBe('table');

    tool(view, 'Insert table').click();
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__table-picker')).not.toBeNull();
    });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    fireEvent.click(await vi.waitFor(() => {
      const el = document.activeElement as HTMLButtonElement;
      expect(el.getAttribute('aria-label')).toBe('2 × 1 table');
      return el;
    }));
    await vi.waitFor(() => {
      expect(editor.getJSON().content?.[0]?.content).toHaveLength(2);
    });
    view.unmount();
  });

  /** 9.382 — inside a table the tool is disabled and says why (TableNoNest would refuse anyway). */
  it('9.382 Insert table is disabled, and named as such, while the caret is inside a table', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.clearContent();
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    await vi.waitFor(() => {
      expect(editor.isActive('table')).toBe(true);
    });
    // The strip repaints on the transaction, a tick after the editor state moved.
    await vi.waitFor(() => {
      const disabled = view.container.querySelector<HTMLButtonElement>(
        '.ticket-editor__tool[aria-label="Insert table (not allowed inside a table)"]',
      );
      expect(disabled).not.toBeNull();
      expect(disabled?.disabled).toBe(true);
    });
    view.unmount();
  });

  /** 9.383 — an outside press closes the grid and inserts nothing. */
  it('9.383 pressing outside the size grid closes it without inserting', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.clearContent();
    tool(view, 'Insert table').click();
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__table-picker')).not.toBeNull();
    });
    fireEvent.mouseDown(document.body);
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__table-picker')).toBeNull();
    });
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    view.unmount();
  });

  /** 9.384 — every class the open size grid draws has a rule in editor.css (the skin test excludes this file). */
  it('9.384 each class the open table size grid renders is declared in editor.css', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.clearContent();
    tool(view, 'Insert table').click();
    await vi.waitFor(() => {
      expect(view.container.querySelector('.ticket-editor__table-picker')).not.toBeNull();
    });
    fireEvent.mouseEnter(view.container.querySelector('.ticket-editor__table-cell') as Element);
    const drawn = new Set<string>();
    for (const el of view.container.querySelectorAll('.ticket-editor__table-picker, .ticket-editor__table-picker *')) {
      for (const cls of Array.from(el.classList)) drawn.add(cls);
    }
    expect([...drawn].sort()).toEqual([
      'ticket-editor__table-cell',
      'ticket-editor__table-cell--lit',
      'ticket-editor__table-grid',
      'ticket-editor__table-label',
      'ticket-editor__table-picker',
    ]);
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, '../src/styles/editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const cls of drawn) {
      expect(css, `editor.css has no rule for .${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{`));
    }
    view.unmount();
  });
});

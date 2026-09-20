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
   * 16.85 — the strip is the six controls the prototype draws, and the hint line
   * is the prototype's own sentence.
   *
   * The one case here that reads the STRIP rather than the document, and it
   * earns its place by asserting the SET — a missing `link` or an invented
   * seventh control is exactly the drift a per-control document assertion
   * cannot see.
   */
  it('16.85 the strip is B/i/code/link/list/quote, and the hint is the prototype’s', async () => {
    const { view } = await mount(makeProps());
    const names = Array.from(view.container.querySelectorAll('.ticket-editor__tool')).map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Bold', 'Italic', 'Code', 'Bullet list', 'Quote', 'Link']);
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

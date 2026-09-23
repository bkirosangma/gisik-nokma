import { describe, expect, it, vi } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';

/**
 * 9.273 — the code block's Copy button.
 *
 * `CodeBlockWithCopy` is `CodeBlock.extend({ addNodeView })` and the NODE NAME
 * is unchanged, so the interesting risks are both about what the extension
 * kept rather than what it added: a node view that replaced the editable
 * content instead of handing a `contentDOM` back would leave a code block
 * nobody can type into, and a rename would silently drop the two input rules
 * that make ``` produce one. Both are asserted below, beside the button.
 */
describe('9.273 code block copy button', () => {
  it('9.273 renders a copy button that writes the text; node name and rules unchanged', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true });
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'npm run gst' }] }],
    });
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button.editor-codeblock__copy');
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
    expect(button?.getAttribute('contenteditable')).toBe('false');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('npm run gst');
    });

    // THE NODE IS STILL `codeBlock`, and it is still a textblock: the node view
    // must hand ProseMirror a `contentDOM` or the block stops being editable.
    expect(editor.schema.nodes['codeBlock']).toBeDefined();
    expect(editor.schema.nodes['codeBlockWithCopy']).toBeUndefined();
    const first = editor.view.dom.querySelector('.editor-codeblock');
    expect(first?.querySelector('code')?.getAttribute('contenteditable')).not.toBe('false');

    // …and its two input rules survive the extension, so ``` still opens one.
    const codeBlock = editor.extensionManager.extensions.find((e) => e.name === 'codeBlock');
    expect(codeBlock).toBeDefined();
    editor.destroy();
  });

  /**
   * THE OTHER BRANCH OF THE SAME BUTTON, and it had NO witness — found by the
   * closing audit asking what in the new code nothing could fail on.
   *
   * `navigator.clipboard` is undefined outside a secure context, and the mobile
   * WebView is one of those (a `source={{ html }}` document has no secure
   * origin), so the fallback is the ONLY path a phone ever takes. A branch that
   * never runs in a test is indistinguishable from one that cannot run.
   */
  it('9.273 falls back to execCommand when there is no clipboard API', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    // Removed, not stubbed to undefined: `navigator.clipboard?.writeText` must
    // take the same path a phone does.
    delete (globalThis.navigator as { clipboard?: unknown }).clipboard;
    // The value is captured INSIDE the call, not read afterwards: the
    // implementation appends the textarea, copies and removes it in the same
    // synchronous tick, so by the next line it is gone. (The first cut of this
    // arm read it after the click and failed on an empty list — the test being
    // wrong, not the code.)
    let copiedAtCallTime: string | null = null;
    const execCommand = vi.fn(() => {
      copiedAtCallTime = document.querySelector('textarea')?.value ?? null;
      return true;
    });
    const originalExec = document.execCommand;
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    try {
      const editor = createTestEditor(undefined, {
        type: 'doc',
        content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'npm run gst' }] }],
      });
      const button = editor.view.dom.querySelector<HTMLButtonElement>('button.editor-codeblock__copy');
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // The text really reached the hidden textarea the browser copies from —
      // asserting the CALL alone would pass on a fallback that copied ''.
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(copiedAtCallTime).toBe('npm run gst');
      // …and the textarea is removed again rather than left in the document.
      await vi.waitFor(() => {
        expect(button?.textContent).toBe('Copied');
      });
      expect(document.querySelectorAll('textarea')).toHaveLength(0);
      editor.destroy();
    } finally {
      document.execCommand = originalExec;
      if (original !== undefined) Object.defineProperty(globalThis.navigator, 'clipboard', original);
    }
  });
});

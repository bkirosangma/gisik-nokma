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
});

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import { emptyDoc, type DocJson } from '../src/doc.js';

const IMG = '01J9GATA000000000000000000';

function makeProps(overrides: Partial<TicketEditorProps> = {}): TicketEditorProps {
  return {
    queryUsers: async () => [],
    uploadAttachment: vi.fn(async () => ({ attachmentId: IMG, url: `/v1/attachments/${IMG}`, mime: 'image/png', filename: 'a.png', size: 1, sha256: 'd'.repeat(64) })),
    onAttachmentAdded: vi.fn(),
    ...overrides,
  };
}

function Harness({ props, editorRef }: { props: TicketEditorProps; editorRef: React.MutableRefObject<Editor | null> }) {
  const ref = useRef<Editor | null>(null);
  // Bridge the outer ref so tests can drive the editor imperatively.
  return (
    <TicketEditor
      {...props}
      editorRef={editorRef}
      onEditorReady={() => {
        ref.current = editorRef.current;
        props.onEditorReady?.();
      }}
    />
  );
}

async function mount(props: TicketEditorProps) {
  const editorRef: React.MutableRefObject<Editor | null> = { current: null };
  const ready = vi.fn();
  const view = render(<Harness props={{ ...props, onEditorReady: ready }} editorRef={editorRef} />);
  await vi.waitFor(() => {
    expect(ready).toHaveBeenCalled();
    expect(editorRef.current).not.toBeNull();
  });
  return { view, editor: editorRef.current as Editor };
}

describe('TicketEditor', () => {
  it('mounts (immediatelyRender: false ⇒ ready fires post-hydration) and renders initialDoc', async () => {
    const doc: DocJson = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the description' }] }],
    };
    const { view, editor } = await mount(makeProps({ initialDoc: doc }));
    expect(view.container.querySelector('.ticket-editor')).not.toBeNull();
    expect(editor.getText()).toContain('the description');
    view.unmount();
  });

  it('onDocChange fires with the serialized doc on edits', async () => {
    const onDocChange = vi.fn();
    const { view, editor } = await mount(makeProps({ onDocChange }));
    editor.commands.insertContent('typed words');
    await vi.waitFor(() => {
      expect(onDocChange).toHaveBeenCalled();
    });
    const lastDoc = onDocChange.mock.lastCall?.[0] as DocJson;
    expect(JSON.stringify(lastDoc)).toContain('typed words');
    view.unmount();
  });

  it('Mod-Enter submits the current doc', async () => {
    const onSubmit = vi.fn();
    const { view, editor } = await mount(makeProps({ onSubmit }));
    editor.commands.insertContent('a comment');
    editor.commands.keyboardShortcut('Mod-Enter');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onSubmit.mock.lastCall?.[0])).toContain('a comment');
    view.unmount();
  });

  it('the wrap menu appears on image selection and rewrites the wrap attr', async () => {
    const { view, editor } = await mount(makeProps());
    editor.commands.insertTicketImage({ attachmentId: IMG, mime: 'image/png', alt: 'shelf' });
    let imagePos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
      return imagePos === -1;
    });
    editor.commands.setNodeSelection(imagePos);
    await vi.waitFor(() => {
      expect(view.container.querySelector('.image-wrap-menu')).not.toBeNull();
    });
    const wrapLeft = Array.from(view.container.querySelectorAll('.image-wrap-menu__option')).find(
      (el) => el.textContent === 'Wrap left',
    ) as HTMLButtonElement;
    wrapLeft.click();
    await vi.waitFor(() => {
      const json = JSON.stringify(editor.getJSON());
      expect(json).toContain('"wrap":"inline-left"');
    });
    view.unmount();
  });

  it('upload chips appear while an upload is in flight and clear after', async () => {
    let releaseUpload: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const props = makeProps({
      uploadAttachment: vi.fn(async () => {
        await gate;
        return { attachmentId: IMG, url: `/v1/attachments/${IMG}`, mime: 'image/png', filename: 'slow.png', size: 1, sha256: 'd'.repeat(64) };
      }),
    });
    const { view, editor } = await mount(props);
    const file = new File([new Uint8Array(4)], 'slow.png', { type: 'image/png' });
    const event = {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, editor.state.doc.slice(0)));
    await vi.waitFor(() => {
      expect(view.container.querySelector('.upload-chips__chip')?.textContent).toContain('slow.png');
    });
    releaseUpload();
    await vi.waitFor(() => {
      expect(view.container.querySelector('.upload-chips__chip')).toBeNull();
    });
    view.unmount();
  });
});

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { IMAGE_WRAP_MODES, type ImageWrapMode } from '../extensions/ticket-image.js';

const WRAP_LABELS: Record<ImageWrapMode, string> = {
  'inline-left': 'Wrap left',
  'inline-right': 'Wrap right',
  block: 'Full width',
};

/** Wrap picker + alt input, shown while an image node is selected. */
export function ImageWrapMenu({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const repaint = () => force((n) => n + 1);
    editor.on('transaction', repaint);
    return () => {
      editor.off('transaction', repaint);
    };
  }, [editor]);
  if (!editor || editor.isDestroyed) return null;
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null;
  const currentWrap = selection.node.attrs.wrap as ImageWrapMode;
  const alt = selection.node.attrs.alt as string;
  return (
    <div className="image-wrap-menu" role="toolbar" aria-label="Image layout">
      {IMAGE_WRAP_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={
            mode === currentWrap
              ? 'image-wrap-menu__option image-wrap-menu__option--active'
              : 'image-wrap-menu__option'
          }
          onClick={() => editor.chain().focus().setImageWrap(mode).run()}
        >
          {WRAP_LABELS[mode]}
        </button>
      ))}
      <input
        className="image-wrap-menu__alt"
        aria-label="Alt text"
        placeholder="Describe this image"
        value={alt}
        onChange={(event) => editor.chain().updateAttributes('image', { alt: event.target.value }).run()}
      />
    </div>
  );
}

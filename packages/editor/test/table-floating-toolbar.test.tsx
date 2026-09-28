import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { TicketEditor, type TicketEditorProps } from '../src/components/TicketEditor.js';
import type { DocJson } from '../src/doc.js';

const IMG = '01J9GATA000000000000000000';

const TABLE_DOC: DocJson = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
          ],
        },
      ],
    },
  ],
};

/**
 * A second row, for 'Delete row' only: prosemirror-tables' `deleteRow`
 * refuses to remove a table's LAST remaining row (a table cannot have zero
 * rows) — measured directly, not assumed: the single-row `TABLE_DOC` above
 * left `deleteRow` a documented no-op (`canRun` false, the row survives).
 */
const TABLE_DOC_2_ROWS: DocJson = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'd' }] }] },
          ],
        },
      ],
    },
  ],
};

function makeProps(overrides: Partial<TicketEditorProps> = {}): TicketEditorProps {
  return {
    queryUsers: async () => [],
    uploadAttachment: vi.fn(async () => ({
      attachmentId: IMG,
      url: `/v1/attachments/${IMG}`,
      mime: 'image/png',
      filename: 'a.png',
      size: 1,
      sha256: 'd'.repeat(64),
    })),
    onAttachmentAdded: vi.fn(),
    ...overrides,
  };
}

function Harness({ props, editorRef }: { props: TicketEditorProps; editorRef: React.MutableRefObject<Editor | null> }) {
  const ref = useRef<Editor | null>(null);
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

/** The first cell's text-node position, so a real click lands the caret inside it. */
function firstCellPos(editor: Editor): number {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos !== -1) return false;
    if (node.type.name === 'text') {
      pos = p + 1;
      return false;
    }
    return true;
  });
  return pos;
}

describe('table floating toolbar', () => {
  it('9.349 does not render read-only, even with the caret in a table cell', async () => {
    const { view, editor } = await mount(makeProps({ editable: false, initialDoc: TABLE_DOC }));
    editor.commands.setTextSelection(firstCellPos(editor));
    await vi.waitFor(() => {});
    expect(view.container.querySelector('.table-toolbar')).toBeNull();
    view.unmount();
  });

  it('9.349 does not render while the caret sits outside any table', async () => {
    const { view } = await mount(makeProps({ initialDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] } }));
    expect(view.container.querySelector('.table-toolbar')).toBeNull();
    view.unmount();
  });

  it('9.349 renders once the caret enters a table cell (editable)', async () => {
    const { view, editor } = await mount(makeProps({ initialDoc: TABLE_DOC }));
    editor.commands.setTextSelection(firstCellPos(editor));
    await vi.waitFor(() => {
      expect(view.container.querySelector('.table-toolbar')).not.toBeNull();
    });
    view.unmount();
  });

  // TABLE_DOC's one row has two cells, 'a' then 'b'. The caret lands inside
  // 'a' (column 0) below, so "before"/"after" cases assert WHICH SIDE the new
  // row/column lands on — a swapped addRowBefore<->addRowAfter mapping still
  // grows the count by exactly 1, so a count-only assertion would not catch
  // the mutation the brief asks for; the position check does.
  const CASES: { label: string; doc?: DocJson; assert: (e: Editor) => void }[] = [
    {
      label: 'Add row above',
      assert: (e) => {
        const rows = Array.from(e.view.dom.querySelectorAll('tr'));
        expect(rows).toHaveLength(2);
        expect(rows[1]!.textContent).toContain('a');
      },
    },
    {
      label: 'Add row below',
      assert: (e) => {
        const rows = Array.from(e.view.dom.querySelectorAll('tr'));
        expect(rows).toHaveLength(2);
        expect(rows[0]!.textContent).toContain('a');
      },
    },
    {
      label: 'Delete row',
      doc: TABLE_DOC_2_ROWS,
      assert: (e) => {
        const rows = Array.from(e.view.dom.querySelectorAll('tr'));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.textContent).toContain('c');
      },
    },
    {
      label: 'Add column left',
      assert: (e) => {
        const cells = Array.from(e.view.dom.querySelector('tr')!.children);
        expect(cells).toHaveLength(3);
        expect(cells[1]!.textContent).toBe('a');
      },
    },
    {
      label: 'Add column right',
      assert: (e) => {
        const cells = Array.from(e.view.dom.querySelector('tr')!.children);
        expect(cells).toHaveLength(3);
        expect(cells[0]!.textContent).toBe('a');
      },
    },
    {
      label: 'Delete column',
      assert: (e) => {
        expect(e.view.dom.querySelector('tr')!.children).toHaveLength(1);
      },
    },
    {
      label: 'Toggle header row',
      assert: (e) => {
        expect(e.view.dom.querySelector('th')).not.toBeNull();
      },
    },
    {
      label: 'Toggle header column',
      assert: (e) => {
        expect(e.view.dom.querySelector('th')).not.toBeNull();
      },
    },
  ];
  it.each(CASES)('9.350 $label runs its command and changes the table structurally', async ({ label, doc, assert }) => {
    const { view, editor } = await mount(makeProps({ initialDoc: doc ?? TABLE_DOC }));
    editor.commands.setTextSelection(firstCellPos(editor));
    await vi.waitFor(() => {
      expect(view.container.querySelector('.table-toolbar')).not.toBeNull();
    });
    const button = Array.from(view.container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === label,
    )!;
    expect(button, `no button labelled "${label}"`).toBeDefined();
    fireEvent.click(button);
    assert(editor);
    view.unmount();
  });

  it('9.351 Delete table removes the table node entirely', async () => {
    const { view, editor } = await mount(makeProps({ initialDoc: TABLE_DOC }));
    editor.commands.setTextSelection(firstCellPos(editor));
    await vi.waitFor(() => {
      expect(view.container.querySelector('.table-toolbar')).not.toBeNull();
    });
    const button = Array.from(view.container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Delete table',
    )!;
    fireEvent.click(button);
    let found = false;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') found = true;
      return !found;
    });
    expect(found).toBe(false);
    view.unmount();
  });

  it('9.349 no title= attribute on any button (house rule against title= tooltips)', async () => {
    const { view, editor } = await mount(makeProps({ initialDoc: TABLE_DOC }));
    editor.commands.setTextSelection(firstCellPos(editor));
    await vi.waitFor(() => {
      expect(view.container.querySelector('.table-toolbar')).not.toBeNull();
    });
    const buttons = Array.from(view.container.querySelectorAll('.table-toolbar button'));
    expect(buttons.length).toBe(9);
    for (const button of buttons) {
      expect(button.hasAttribute('title')).toBe(false);
      expect(button.getAttribute('aria-label')).not.toBeNull();
    }
    view.unmount();
  });
});

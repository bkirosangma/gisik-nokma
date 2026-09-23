import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

/**
 * The formatting strip above the composer — the prototype's `descTools`
 * (`design-system/interactive/desktop.dc.html:3670-3681`, drawn at `:1167`),
 * which is six controls and a hint line and has never had a counterpart here.
 *
 * ## Why this needed NO schema change, measured rather than assumed
 *
 * Every button below calls a command the installed extension list ALREADY
 * registers. `buildEditorExtensions` (`schema/extensions.ts`) builds from
 * `StarterKit` plus `Link`, `Placeholder`, `Table`, `TicketImage` and
 * `Mention`; `StarterKit.configure` switches off FOUR things — `document`
 * (replaced by `VersionedDocument`), `link` (reconfigured below it),
 * `underline` (outside the vocabulary) and, since Plan 4 Task 4, `codeBlock`
 * (replaced by `CodeBlockWithCopy`) — so `bold`, `italic`, `code`,
 * `bulletList` and `blockquote` all arrive with it. The six commands
 * were checked against the INSTALLED packages, not the library's docs:
 * `toggleBold` in extension-bold@3.30.5, `toggleItalic` in
 * extension-italic@3.30.5, `toggleCode` in extension-code@3.30.5,
 * `toggleBlockquote` in extension-blockquote@3.30.5, `toggleLink` in
 * extension-link@3.30.5, and `toggleBulletList` in @tiptap/core@3.30.5 itself.
 *
 * ## The prototype's buttons INSERT markdown; these TOGGLE a mark
 *
 * That difference is the whole reason this is a component and not a
 * transcription. The prototype's editor is a `<textarea>` holding markdown, so
 * its buttons splice `**`/`*`/`` ` `` around the selection and the hint line
 * underneath tells the reader what those characters mean. This editor holds
 * ProseMirror JSON and has no markdown syntax to splice — the marks are marks.
 * The set of six is the prototype's; the mechanics are the editor's own chain
 * commands, which is what the dispatch directs. The hint line is still drawn
 * (`MARKDOWN_HINT`), because it is the prototype's and because a reader typing
 * `**bold**` into this composer should be told what the product does with it.
 *
 * ## Active marks are REPORTED, and that is not the prototype's doing
 *
 * The prototype's controls are inserters and have no state to report. These are
 * toggles, so a button that does not say whether the mark is on is a control
 * the reader has to guess about. `isActive` is re-read on every editor
 * TRANSACTION — the `ImageWrapMenu` pattern (`:15-22`), which is this package's
 * established way to follow the editor's state without Tiptap re-rendering the
 * tree. `aria-pressed` carries the same fact to a screen reader.
 *
 * ## `Link` is the one control that needs input, and it gets it inline
 *
 * `toggleLink` takes an optional `{href}` (`extension-link@3.30.5`
 * dist/index.d.ts:136-142). Called with nothing it would leave an anchor with
 * no destination — a link to nowhere, and a worse answer than the prototype's,
 * whose `[text](https://)` at least puts the brackets on screen for the reader
 * to fill in. So this control reveals a URL field instead, in the shape
 * `ImageWrapMenu`'s alt input already uses. On a selection that is ALREADY a
 * link, the button removes the mark without asking, which is the one case where
 * there is no destination to supply.
 */
export const MARKDOWN_HINT = 'Markdown: **bold**, *italic*, `code`, > quote, - list, [text](url)';

export type EditorToolbarProps = {
  editor: Editor | null;
  /** The toolbar is chrome for a composer someone may type into; read-only has none. */
  editable: boolean;
};

export function EditorToolbar({ editor, editable }: EditorToolbarProps): React.JSX.Element | null {
  /**
   * The URL field's own state. `null` = closed, which is the ordinary case and
   * what Escape returns to. It is deliberately NOT cleared on a successful
   * apply by anything other than that same reset — see `applyLink`.
   */
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  // The transaction subscription that re-reads `isActive`. Same shape and same
  // reason as `ImageWrapMenu`'s repaint: `useEditor` does not re-render this
  // tree on every transaction, and a toggle button that never updates its own
  // state is the failure this exists to prevent.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const repaint = () => force((n) => n + 1);
    editor.on('transaction', repaint);
    return () => {
      editor.off('transaction', repaint);
    };
  }, [editor]);

  if (!editor || editor.isDestroyed || !editable) return null;

  const linkIsActive = editor.isActive('link');

  function applyLink(): void {
    const trimmed = href.trim();
    // An empty box is a cancel, not a link to the empty string. `setLink` would
    // happily write `href: ''`, and the door would store an anchor that goes
    // nowhere — refusing here is the same choice `TicketEditorSlot`'s
    // `uploadOrRefuse` makes about a fabricated upload result.
    if (trimmed === '') {
      setLinkOpen(false);
      setHref('');
      return;
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    setLinkOpen(false);
    setHref('');
  }

  /**
   * THE CONTROLS IN THE PROTOTYPE'S ORDER — `B i code link list quote` — and the
   * first cut of this file had it WRONG.
   *
   * That version was `B i code list quote` followed by a hand-written `link`
   * button appended after the map, so the strip rendered `B i code list quote
   * link`. **The component's own comment claimed the right order, the case was
   * NAMED for the right order, and its body asserted the wrong one** — a case
   * passing for a reason unrelated to the property its name states, which is this
   * repo's most-repeated defect. An independent reviewer found it by reading the
   * prototype (`desktop.dc.html:3670-3678`: `B, i, code, link, list, quote`) and
   * then the test file, not by running anything: the suite was green.
   *
   * `link` is not special-cased INTO the list to hide its difference — it is
   * called out at the button, which is the one control that asks for input. Its
   * `run` is the whole difference, and it is visible here rather than buried.
   */
  const controls: { key: string; label: string; name: string; active: boolean; run: () => void }[] = [
    {
      key: 'bold',
      label: 'B',
      name: 'Bold',
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      label: 'i',
      name: 'Italic',
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'code',
      label: 'code',
      name: 'Code',
      active: editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      key: 'link',
      label: 'link',
      name: 'Link',
      active: linkIsActive,
      run: () => {
        // Already a link: remove it, which is the one case with no destination
        // to ask for. Otherwise reveal the URL field.
        if (linkIsActive) {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          setLinkOpen(false);
          setHref('');
          return;
        }
        setLinkOpen((was) => !was);
      },
    },
    {
      key: 'list',
      label: 'list',
      name: 'Bullet list',
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'quote',
      label: 'quote',
      name: 'Quote',
      active: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    // THE NOTES PORT'S THREE (Plan 4 Task 4), after the prototype's six rather
    // than inserted among them: the prototype has no counterpart for any of
    // them, so the strip keeps its transcribed order and grows at the end. The
    // commands are `toggleTaskList` (extension-task-list), `toggleCodeBlock`
    // (extension-code-block) and `setDetails` (extension-details, whose own
    // `setDetails` inserts the same shape `Collapsible`'s input rule builds).
    {
      key: 'task',
      label: '☐',
      name: 'Task item',
      active: editor.isActive('taskItem'),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      key: 'codeBlock',
      label: '</>',
      name: 'Code block',
      active: editor.isActive('codeBlock'),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: 'collapsible',
      label: '▸',
      name: 'Collapsible',
      active: editor.isActive('details'),
      run: () => editor.chain().focus().setDetails().run(),
    },
  ];

  return (
    <div className="ticket-editor__toolbar" role="toolbar" aria-label="Formatting">
      {controls.map((control) => (
        <button
          key={control.key}
          type="button"
          className={
            control.active
              ? 'ticket-editor__tool ticket-editor__tool--active'
              : 'ticket-editor__tool'
          }
          aria-label={control.name}
          aria-pressed={control.active}
          // Only `link` opens anything, so only it reports an expanded state —
          // an `aria-expanded` on the five toggles would promise a disclosure
          // that never arrives.
          {...(control.key === 'link' ? { 'aria-expanded': linkOpen } : {})}
          onClick={control.run}
        >
          {control.label}
        </button>
      ))}
      {linkOpen ? (
        <input
          className="ticket-editor__link-url"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the field exists only
          // because the reader just asked for it; leaving focus behind is the
          // `autoFocus` case the rule is written to allow.
          autoFocus
          type="url"
          aria-label="Link URL"
          placeholder="https://"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyLink();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setLinkOpen(false);
              setHref('');
            }
          }}
        />
      ) : null}
    </div>
  );
}

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMarkRange } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { placePopover } from './popover-position.js';

/**
 * The floating editor for the link under the caret, ported from the
 * knowledge-base app's `LinkEditorPopover.tsx` — its LINK-MARK branch only.
 *
 * ## WHAT WAS NOT PORTED
 *
 * The source has a second shape for its `[[path#section|text]]` wiki-link node
 * (a Path input, a datalist of known paths, a folder browser). This product's
 * `wikiLink` is a reference to a note BY ID whose title is the note's own, so
 * there is no path or display text to edit; the branch, its datalist and the
 * `FolderPicker` it hosts have nothing to bind to. Removing one is Backspace.
 *
 * ## WHAT WAS ADDED
 *
 * - **Focus gate.** The ticket sheet mounts two editable editors (the
 *   description and the comment composer). The source is single-editor, so its
 *   popover follows the caret unconditionally; here it shows only for the editor
 *   that has focus — or whose popover has — so two carets never stack two panels.
 * - **Open** — a real anchor for the destination, only for the schemes a
 *   browser should follow from a click (`http(s)`, `mailto`, `tel`).
 * - **Ctrl/Cmd-K** with the caret in a link moves focus into the URL field, so
 *   the panel is reachable from the keyboard (it is portalled to `<body>`, so
 *   Tab from the text never lands in it).
 * - **Marks survive a text edit** — the source rewrites the range as a bare
 *   link-marked text node, silently dropping bold/italic on it.
 * - A blur that leaves the panel commits WITHOUT `.focus()`, so tabbing to
 *   another field is not answered by the editor grabbing focus back.
 *
 * ## BEHAVIOUR KEPT
 *
 * Commit on Enter or blur, Escape reverts the draft; an empty URL removes the
 * link and an empty text deletes it; below the link or flipped above when it
 * would clip, clamped to the viewport.
 */

type LinkTarget = { from: number; to: number; href: string; text: string };

/** The schemes worth an "Open" affordance; anything else stays edit-only. */
function isOpenable(href: string): boolean {
  try {
    const url = new URL(href, 'https://placeholder.invalid');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/** The link under the caret, or null. Read straight off `editor.state` each render. */
function readTarget(editor: Editor): LinkTarget | null {
  const linkType = editor.schema.marks['link'];
  if (linkType === undefined || !editor.isEditable || !editor.isActive('link')) return null;
  const range = getMarkRange(editor.state.selection.$from, linkType);
  if (range === undefined) return null;
  const href = String((editor.getAttributes('link') as { href?: unknown }).href ?? '');
  return { from: range.from, to: range.to, href, text: editor.state.doc.textBetween(range.from, range.to, '') };
}

export type LinkEditorPopoverProps = { editor: Editor | null };

export function LinkEditorPopover({ editor }: LinkEditorPopoverProps): React.JSX.Element | null {
  const urlId = useId();
  const textId = useId();
  const [, force] = useState(0);
  const [editorFocused, setEditorFocused] = useState(false);
  const [panelFocused, setPanelFocused] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftText, setDraftText] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef<string | null>(null);

  // Repaint on every transaction (the toolbar's own pattern) and track whether
  // THIS editor holds focus. A blur INTO the panel is not a blur: the panel is
  // `tabIndex={-1}`, so even a press on its label reports it as `relatedTarget`.
  useEffect(() => {
    if (!editor) return;
    const repaint = (): void => force((n) => n + 1);
    const onFocus = (): void => setEditorFocused(true);
    const onBlur = ({ event }: { event: FocusEvent }): void => {
      if (panelRef.current?.contains(event.relatedTarget as Node | null) === true) return;
      setEditorFocused(false);
    };
    setEditorFocused(editor.isFocused);
    editor.on('transaction', repaint);
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    return () => {
      editor.off('transaction', repaint);
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  const target = editor && !editor.isDestroyed ? readTarget(editor) : null;
  const visible = target !== null && (editorFocused || panelFocused);

  // Ctrl/Cmd-K with the caret in a link → into the URL field.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'k') return;
      if (readTarget(editor) === null) return;
      event.preventDefault();
      urlRef.current?.focus();
      urlRef.current?.select();
    };
    dom.addEventListener('keydown', onKeyDown);
    return () => dom.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  // Re-sync the drafts when the target changes, or when the live value changes
  // while its field is not the one being typed in.
  const liveHref = target?.href ?? '';
  const liveText = target?.text ?? '';
  const key = target === null ? null : String(target.from);
  useEffect(() => {
    if (key === null) {
      lastKey.current = null;
      return;
    }
    const changed = lastKey.current !== key;
    if (changed || document.activeElement !== urlRef.current) setDraftUrl(liveHref);
    if (changed || document.activeElement !== textRef.current) setDraftText(liveText);
    lastKey.current = key;
  }, [key, liveHref, liveText]);

  // Placement: below the link's start, flipped above when it would clip, then
  // clamped. `coordsAtPos` needs layout; without it (jsdom) the editor's own box
  // stands in, so the panel is still shown, just not next to the link.
  const from = target?.from ?? null;
  useLayoutEffect(() => {
    if (!editor || from === null || !visible) {
      setPos(null);
      return;
    }
    const place = (): void => {
      let anchor: { top: number; bottom: number; left: number };
      try {
        anchor = editor.view.coordsAtPos(from);
      } catch {
        const box = editor.view.dom.getBoundingClientRect();
        anchor = { top: box.top, bottom: box.bottom, left: box.left };
      }
      const el = panelRef.current;
      setPos(
        placePopover({
          anchor,
          size: { width: el?.offsetWidth ?? 320, height: el?.offsetHeight ?? 120 },
          viewport: { width: window.innerWidth, height: window.innerHeight },
        }),
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [editor, from, visible]);

  // A link with no destination yet (a fresh one) wants the URL first.
  useEffect(() => {
    if (visible && liveHref === '') urlRef.current?.focus();
    // only when a different link is reached
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible]);

  if (!editor || target === null || !visible) return null;

  const commitUrl = (raw: string, refocus: boolean): void => {
    const trimmed = raw.trim();
    if (trimmed === target.href) return;
    const chain = refocus ? editor.chain().focus() : editor.chain();
    const linked = chain.setTextSelection({ from: target.from, to: target.to }).extendMarkRange('link');
    if (trimmed === '') linked.unsetLink().run();
    else linked.setLink({ href: trimmed }).run();
  };

  const commitText = (next: string, refocus: boolean): void => {
    if (next === target.text) return;
    const chain = refocus ? editor.chain().focus() : editor.chain();
    if (next === '') {
      chain
        .setTextSelection({ from: target.from, to: target.to })
        .unsetMark('link')
        .deleteSelection()
        .run();
      return;
    }
    // Keep whatever else the link text carried (bold, italic…): the marks at the
    // first character, not a bare link-only node.
    const carried = editor.state.doc
      .resolve(Math.min(target.from + 1, editor.state.doc.content.size))
      .marks()
      .map((mark) => ({ type: mark.type.name, attrs: mark.attrs }));
    const marks = carried.some((m) => m.type === 'link') ? carried : [...carried, { type: 'link', attrs: { href: target.href } }];
    chain.insertContentAt({ from: target.from, to: target.to }, { type: 'text', text: next, marks }).run();
  };

  const onUnlink = (): void => {
    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).unsetLink().run();
  };

  const onKey =
    (kind: 'url' | 'text') =>
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (kind === 'url') commitUrl(draftUrl, true);
        else commitText(draftText, true);
        editor.commands.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // No "escaped" flag for the blur this causes: the revert is rendered
        // before Tiptap's deferred `focus()` moves focus, so that blur compares
        // the reverted draft with the live value and commits nothing. (A flag
        // would also outlive a focus that never moves, and swallow the next
        // real blur.)
        if (kind === 'url') setDraftUrl(target.href);
        else setDraftText(target.text);
        editor.commands.focus();
      }
    };

  const onBlur =
    (kind: 'url' | 'text') =>
    (event: React.FocusEvent<HTMLInputElement>): void => {
      if (panelRef.current?.contains(event.relatedTarget as Node | null) === true) return;
      if (kind === 'url') commitUrl(draftUrl, false);
      else commitText(draftText, false);
    };

  return createPortal(
    <div
      ref={panelRef}
      className="link-editor"
      role="dialog"
      aria-label="Edit link"
      tabIndex={-1}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos === null ? 'hidden' : 'visible',
      }}
      onFocus={() => setPanelFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPanelFocused(false);
      }}
      // A press inside must not reach the editor, or it would move the caret
      // out of the link and close the panel under the pointer.
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="link-editor__row">
        <label className="link-editor__label" htmlFor={urlId}>
          URL
        </label>
        <input
          id={urlId}
          ref={urlRef}
          className="link-editor__input"
          type="url"
          value={draftUrl}
          placeholder="https://"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setDraftUrl(event.target.value)}
          onKeyDown={onKey('url')}
          onBlur={onBlur('url')}
        />
      </div>
      <div className="link-editor__row">
        <label className="link-editor__label" htmlFor={textId}>
          Text
        </label>
        <input
          id={textId}
          ref={textRef}
          className="link-editor__input"
          type="text"
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={onKey('text')}
          onBlur={onBlur('text')}
        />
      </div>
      <div className="link-editor__actions">
        {isOpenable(target.href) ? (
          <a className="link-editor__action" href={target.href} target="_blank" rel="noopener noreferrer">
            Open link
          </a>
        ) : null}
        <button
          type="button"
          className="link-editor__action"
          aria-label="Remove link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onUnlink}
        >
          Unlink
        </button>
      </div>
    </div>,
    document.body,
  );
}

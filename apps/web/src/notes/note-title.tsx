'use client';

import { useEffect, useRef } from 'react';

/**
 * The note's title, editable in place (spec §9.2, §9.4).
 *
 * ## Why this is an uncontrolled `contenteditable` and not a controlled one
 *
 * A controlled contenteditable is the classic way to get a caret that jumps to
 * the start on every keystroke: React re-renders the heading with the value it
 * last saw, which is the value from BEFORE the keystroke, and the browser puts
 * the caret at the beginning of the text it just replaced. So the DOM is the
 * source of truth WHILE the person is typing and React only seeds it — on mount
 * and whenever the committed title changes from underneath (a live query
 * landing, or this component's own write coming back).
 *
 * ## The three gates, and why there are three
 *
 * `noteRenamedPayload` refuses an empty title (`title: z.string().min(1)`), so:
 *
 * - **a changed, non-empty title on Enter or blur** writes;
 * - **Escape** reverts the DOM and writes nothing — the person said no;
 * - **an empty title** on blur restores the standing one and writes nothing.
 *
 * That last arm is not politeness. A heading a person cleared by accident and
 * then clicked away from would otherwise file a claim the domain rejects, and
 * the refusal would arrive with the title already gone from the screen.
 *
 * ## Paste and drop insert PLAIN TEXT only (owner report, 2026-09-24)
 *
 * *"my title became huge when i pasted. maybe because its a header
 * markdown. Title should always paste format stripped text only."* The title
 * element had no `onPaste`/`onDrop` of its own, so the browser inserted the
 * clipboard's HTML verbatim — a pasted `<h1>` rendering as a giant heading
 * INSIDE this already-heading element is exactly the shape the report
 * describes. It looked like it survived a blur because it did not: `commit`
 * reads `textContent`, which is always plain, so the SAVED title was already
 * correct — the giant heading was on screen only until the next blur/Enter
 * rewrote the DOM to that plain text. The defect is the WINDOW between paste
 * and commit, not the saved value.
 *
 * Both handlers below `preventDefault` the browser's own insertion and hand
 * the clipboard's (or drag's) `text/plain` payload to `insertPlainText`
 * instead — never the `text/html` payload, which is what a rich-HTML paste
 * would otherwise carry. Every run of whitespace, including a newline,
 * collapses to one space: a multi-line paste is one line, because a title is
 * one line.
 *
 * `insertPlainText` prefers `document.execCommand('insertText', …)` — still
 * the only path that leaves the browser's native undo stack intact for a
 * `contentEditable` edit; inserting through the Selection/Range API directly
 * bypasses that stack entirely, so a person who pastes and then presses
 * Ctrl/Cmd+Z would find nothing to undo. `execCommand` is deprecated but
 * still implemented everywhere this ships; the one place it is NOT
 * implemented is jsdom, where the method is simply absent (not merely a
 * no-op) — measured: calling it unguarded throws. Which is also what makes
 * the fallback below a real second path this file's own tests exercise,
 * not dead code.
 *
 * ## `contentEditable="plaintext-only"` was tried as a second line, and DROPPED — measured, not skipped
 *
 * The brief itself asked for it, "where supported", ON TOP of the handlers
 * above rather than instead of them: Chromium and WebKit (Chrome 96+, Safari
 * 16+) additionally refuse to insert anything but plain text at the
 * browser's own paste step under this value, before either handler ever
 * runs. It was added, and then measured against this file's OWN test
 * suite, which is where it stopped being a free second line.
 *
 * **`@testing-library/user-event@14.6.6`'s `isContentEditable` check
 * (`utils/edit/isContentEditable.js`) recognises only `contenteditable="true"`
 * or `contenteditable=""`** — never `"plaintext-only"`. Under that value,
 * `getTargetTypeAndSelection` classifies this heading as `type: 'default'`
 * instead of `'contenteditable'`, `getInputRange` then returns `undefined`,
 * and `input()` (the function every keystroke `user.type()` simulates goes
 * through) hits its `if (!inputRange) return;` guard — SILENTLY, with no
 * thrown error. `user.clear()` fails LOUDLY instead (its own `isEditable`
 * gate throws first), which is how this was caught: the existing case
 * 18.200 (`note-document.test.tsx`) started failing the moment this landed.
 * A silent no-op is the worse of the two failure modes it could have
 * caused — a `user.type()`-driven interaction test would keep passing
 * having exercised NOTHING.
 *
 * `contentEditable={canEdit}` (plain `true`/`false`) is what ships instead.
 * Nothing about the actual reported bug is lost: `preventDefault()` inside
 * `onPaste`/`onDrop` stops the browser's own insertion in EVERY browser
 * regardless of the `contenteditable` value, `plaintext-only` or not — the
 * handlers were always the complete fix, and Firefox (which has never
 * implemented `plaintext-only` at all — tracked upstream as Mozilla bug
 * 1291467, unresolved as of this change) already depended on them alone.
 * Revisiting `plaintext-only` is owed to whoever next upgrades
 * `@testing-library/user-event` past this gap, or accepts rewriting this
 * file's interaction tests off `clear()`/`type()` to unlock it sooner.
 */

/**
 * Collapses every run of whitespace — spaces, tabs, and every newline a
 * multi-line paste carries — to exactly one space, then trims the ends. A
 * title is one line; this is what makes a three-paragraph paste read as one.
 */
export function sanitizePastedTitleText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Inserts plain text at the current selection inside `host`, replacing
 * whatever the selection covers — the shared body `onPaste` and `onDrop`
 * both call this with `sanitizePastedTitleText`'s output, AFTER the caller
 * has already `preventDefault`'d the browser's own insertion.
 *
 * See the docblock above for why `execCommand` is tried first and the
 * Range-based body is a real fallback, not a formality: jsdom does not
 * implement `execCommand` at all (a documented no-op, always `false`), so
 * without the fallback this function would insert nothing under any test
 * that exercises it, and only ever work in a real browser.
 */
export function insertPlainText(host: HTMLElement, text: string): void {
  // Measured: jsdom does not define `execCommand` at all (not merely a
  // no-op returning `false`) — calling it unguarded throws `TypeError:
  // document.execCommand is not a function` under every test that reaches
  // this line, so the feature-check comes first, not just the return value.
  if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)) {
    return;
  }
  const selection = host.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0 || !host.contains(selection.anchorNode)) {
    host.textContent = `${host.textContent ?? ''}${text}`;
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function NoteTitle({
  title,
  canEdit,
  onRename,
}: {
  title: string;
  canEdit: boolean;
  onRename: (next: string) => void;
}) {
  const ref = useRef<HTMLHeadingElement | null>(null);

  // Seed the DOM from the committed title. Runs when the note loads, and again
  // when a write of ours comes back — never while the person is typing, because
  // nothing rerenders this component mid-keystroke.
  useEffect(() => {
    if (ref.current !== null && ref.current.textContent !== title) {
      ref.current.textContent = title;
    }
  }, [title]);

  function restore(): void {
    if (ref.current !== null) ref.current.textContent = title;
  }

  function commit(): void {
    const next = (ref.current?.textContent ?? '').trim();
    if (next === '' || next === title) {
      restore();
      return;
    }
    onRename(next);
  }

  /**
   * The ONE body behind both `onPaste` and `onDrop`: never let the browser
   * insert what it was given (HTML, or a multi-line string), and hand it
   * only the plain, one-line form instead. `dataTransfer` is one interface
   * both `ClipboardEvent` and `DragEvent` carry it under, so a single
   * function reads either.
   */
  function insertSanitized(dataTransfer: DataTransfer | null): void {
    if (ref.current === null) return;
    const raw = dataTransfer?.getData('text/plain') ?? '';
    insertPlainText(ref.current, sanitizePastedTitleText(raw));
  }

  return (
    <h2
      ref={ref}
      className="gn-notes__title gn-page-title"
      data-testid="note-title"
      // `contentEditable` and not `suppressContentEditableWarning`'s absence:
      // React warns when a contenteditable has React-managed children, and the
      // warning is correct in general. Here `{title}` is the SEED and the effect
      // above is the writer, which is the pattern the warning cannot see.
      //
      // Plain `canEdit`, NOT `'plaintext-only'` — see this file's own
      // docblock ("was tried as a second line, and DROPPED") for why: it
      // silently breaks `@testing-library/user-event`'s `type()`/`clear()`
      // for this element, which is a real cost `onPaste`/`onDrop` below do
      // not need paid, since a `preventDefault()` there is a complete fix on
      // its own in every browser.
      contentEditable={canEdit}
      suppressContentEditableWarning
      onBlur={canEdit ? commit : undefined}
      onPaste={
        canEdit
          ? (event) => {
              event.preventDefault();
              insertSanitized(event.clipboardData);
            }
          : undefined
      }
      onDrop={
        canEdit
          ? (event) => {
              event.preventDefault();
              insertSanitized(event.dataTransfer);
            }
          : undefined
      }
      onKeyDown={
        canEdit
          ? (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                restore();
              }
            }
          : undefined
      }
    >
      {title}
    </h2>
  );
}

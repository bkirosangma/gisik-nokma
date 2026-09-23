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
 */
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

  return (
    <h1
      ref={ref}
      className="gn-notes__title gn-page-title"
      data-testid="note-title"
      // `contentEditable` and not `suppressContentEditableWarning`'s absence:
      // React warns when a contenteditable has React-managed children, and the
      // warning is correct in general. Here `{title}` is the SEED and the effect
      // above is the writer, which is the pattern the warning cannot see.
      contentEditable={canEdit}
      suppressContentEditableWarning
      onBlur={canEdit ? commit : undefined}
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
    </h1>
  );
}

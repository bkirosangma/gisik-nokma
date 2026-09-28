import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteTitle, sanitizePastedTitleText } from '../src/notes/note-title.js';

/**
 * Cases 18.331–18.333 — the note title pastes PLAIN TEXT only (owner report,
 * 2026-09-24, ADDENDUM to task/notes-badge-sheet): *"my title became huge
 * when i pasted. maybe because its a header markdown. Title should always
 * paste format stripped text only."*
 *
 * The sweep this task's brief asks for — every `contentEditable` outside the
 * rich editor, across `apps/web`, `packages/app-core` and `packages/ui` —
 * found exactly ONE: this file's own `<h1>`. The ticket title
 * (`gn-ticket-sheet__title-input`) is a real `<input>`, which cannot render
 * rich HTML at all regardless of what is pasted into it — inputs are immune
 * to this class of defect by construction, not by a handler that has to
 * remember to run. Nothing else needed the same treatment.
 *
 * A `<h1 contentEditable>` never actually inserted the RENDERED giant
 * heading permanently: `commit()` reads `textContent`, which is always
 * plain, so the SAVED title was correct the whole time — the defect was the
 * window between paste and the next blur/Enter, while the pasted HTML was
 * still live in the DOM. These cases assert the DOM itself, immediately
 * after the paste/drop event, which is the only place the old code could be
 * wrong.
 */

function renderTitle(title = '') {
  const onRename = vi.fn();
  render(<NoteTitle title={title} canEdit onRename={onRename} />);
  return { heading: screen.getByTestId('note-title'), onRename };
}

/** A `ClipboardEvent`/`DragEvent`-shaped `getData`, the only method both handlers read. */
function transferWith(plain: string, html: string) {
  return {
    getData: (type: string) => (type === 'text/plain' ? plain : html),
  };
}

describe('18.331 pasting HTML inserts plain text only, with no element children', () => {
  it('pasting <h1>Big</h1><p>two</p> yields the text "Big two" and no element children', () => {
    const { heading } = renderTitle();
    heading.focus();

    // MUTATION TARGET: removing the `onPaste` handler lets jsdom's own
    // (unimplemented, but real-browser-accurate) default action stand, and
    // this assertion is what would catch it reappearing.
    fireEvent.paste(heading, {
      clipboardData: transferWith('Big\ntwo', '<h1>Big</h1><p>two</p>'),
    });

    expect(heading.textContent).toBe('Big two');
    expect(heading.querySelector('*'), 'no element ever belongs inside this heading').toBeNull();
  });

  it('the event’s own default action is prevented — the browser’s rich insertion never runs', () => {
    const { heading } = renderTitle();
    heading.focus();
    const notPrevented = fireEvent.paste(heading, {
      clipboardData: transferWith('plain', '<b>rich</b>'),
    });
    expect(notPrevented).toBe(false);
  });
});

describe('18.332 a multi-line paste becomes one line; a drop is handled the same way', () => {
  it('collapses every run of whitespace, including newlines, to one space', () => {
    expect(sanitizePastedTitleText('Big\n\ntwo\tthree   four')).toBe('Big two three four');
    expect(sanitizePastedTitleText('  padded  \n')).toBe('padded');
  });

  it('a multi-line clipboard string becomes one line in the DOM', () => {
    const { heading } = renderTitle();
    heading.focus();
    fireEvent.paste(heading, {
      clipboardData: transferWith('first line\nsecond line\nthird line', '<p>first line</p><p>second line</p>'),
    });
    expect(heading.textContent).toBe('first line second line third line');
    expect(heading.textContent!.includes('\n')).toBe(false);
  });

  it('a drop gets the identical treatment — plain text, one line, no elements', () => {
    const { heading } = renderTitle();
    heading.focus();
    fireEvent.drop(heading, {
      dataTransfer: transferWith('dropped\ntext', '<h1>dropped</h1><p>text</p>'),
    });
    expect(heading.textContent).toBe('dropped text');
    expect(heading.querySelector('*')).toBeNull();
  });
});

describe('18.333 CONTROL: Enter still commits and Escape still restores, unaffected by the new handlers', () => {
  it('Enter with a changed, non-empty title writes note.renamed via onRename', async () => {
    const user = userEvent.setup();
    const { heading, onRename } = renderTitle('Compressor log');
    heading.focus();
    await user.clear(heading);
    await user.type(heading, 'Compressor log (revised){Enter}');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('Compressor log (revised)');
  });

  it('Escape reverts the DOM to the standing title and writes nothing', async () => {
    const user = userEvent.setup();
    const { heading, onRename } = renderTitle('Compressor log');
    heading.focus();
    await user.clear(heading);
    await user.type(heading, 'Something else{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(heading.textContent).toBe('Compressor log');
  });
});

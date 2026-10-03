'use client';

import Link from 'next/link';
import type { NoteSummary } from '@gisik-nokma/domain';
import { prefetchEditor } from '../editor-slot.js';

/**
 * One row of the notes tree (spec §9.2).
 *
 * ## The open state is `aria-current`, not a class
 *
 * `aria-current="page"` is what says "this is where you are" to a screen
 * reader; the `--open` class says the same thing to the stylesheet. Both are
 * derived from one boolean here so they cannot disagree, and 18.188 asserts the
 * attribute — the class is paint and jsdom cannot witness it.
 *
 * ## The keys are TEXT, not links
 *
 * `attachedTickets` carries a key and a title per ticket, and this renders the
 * KEY alone beside the note's title. Deliberately not a link to the ticket: the
 * row is already a link to the note, and a link inside a link is not a thing a
 * browser can draw — the nested anchor would be flattened by the parser, so the
 * "ticket is clickable" affordance would be a lie in the DOM. The note's own
 * page (Task 4) carries badges that DO link, because there they are siblings of
 * the title rather than inside it.
 */
export function NoteRow({ note, open }: { note: NoteSummary; open: boolean }) {
  return (
    <li className="gn-notes__row-item">
      <Link
        href={`/notes/${note.noteId}`}
        className={open ? 'gn-notes__row gn-notes__row--open' : 'gn-notes__row'}
        aria-current={open ? 'page' : undefined}
        data-testid={`note-row-${note.noteId}`}
        // The note this opens carries the editor, a chunk of its own (smoothness T10, T9 case 25.164): warm it on the first sign of
        // intent. One shared load, so a hover, a focus and the click together fetch it once.
        onPointerEnter={prefetchEditor}
        onFocus={prefetchEditor}
        onClick={prefetchEditor}
      >
        <span className="gn-notes__row-title">{note.title}</span>
        {note.attachedTickets.length > 0 ? (
          <span className="gn-notes__keys">
            {note.attachedTickets.map((ticket) => (
              <span key={ticket.ticketId} className="gn-notes__key">
                {ticket.key}
              </span>
            ))}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

'use client';

import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

/**
 * The notes screen's placeholders (smoothness T9; spec S1, amendment S-R1 rule 1: a skeleton IS the real component's box).
 *
 * `NoteRowSkeleton` is `NoteRow`'s own container (`li.gn-notes__row-item` > `.gn-notes__row`) with a title part and a key
 * chip, `rows` of them, named once. It stands for the tree while the workspaces read is out and for a search that has not
 * answered. `NoteEditorBand` is the editor slot's own box (`.editor-slot.editor-slot--note` > `.ticket-editor` >
 * `.gn-field__input.ticket-editor__content`), so the notes floor rule (`--gn-notes-editor-min`, `globals.css`) sizes it with no
 * number of its own; it stands for the editor wherever it has not drawn yet (the note is loading, or the purged-chip read
 * `NoteEditorPane` waits for). `NoteDocumentSkeleton` is the document column while the note itself is loading: a title part and
 * the band, inside `.gn-notes__editor`. Every fill is the shared `.gn-skeleton` placeholder role, never the well.
 */
export function NoteRowSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <SkeletonRegion label={label}>
      <ul className="gn-notes__rows">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="gn-notes__row-item">
            <span className="gn-notes__row">
              <Skeleton width={`${60 + ((index * 13) % 30)}%`} height="1.25rem" />
              <span className="gn-notes__keys">
                <Skeleton shape="block" width="3.5rem" height="1.25rem" />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

export function NoteEditorBand({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="editor-slot editor-slot--note">
      <div className="ticket-editor">
        <div className="gn-field__input ticket-editor__content">
          <Skeleton shape="line" width="70%" rows={3} />
        </div>
      </div>
    </SkeletonRegion>
  );
}

export function NoteDocumentSkeleton() {
  return (
    <div className="gn-note-document">
      <Skeleton width="60%" height="var(--gn-title-page-size)" />
      <div className="gn-notes__editor">
        <NoteEditorBand label="Loading the note" />
      </div>
    </div>
  );
}

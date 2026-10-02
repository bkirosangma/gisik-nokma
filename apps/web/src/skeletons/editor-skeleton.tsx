import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

/**
 * What the ticket editor's slot looks like before its chunk arrives (smoothness T10; spec D6, S9; amendment S-R1: the frame is the real
 * component's own container).
 *
 * The frame IS `TicketEditorSlot`'s root (`editor-slot editor-slot--description`, so the same radius and clipping), the strip is the
 * toolbar's own class (`ticket-editor__toolbar`, which sits flush at the top of the slot) filled with button-sized blocks, and the field
 * is the real content host's classes (`gn-field__input ticket-editor__content`) with the slot's own minimum height, so when the editor
 * arrives it replaces this in place and nothing below it moves. Decoration only: the region is named once, for assistive technology.
 */
export function EditorSkeleton({ minHeight = '12rem' }: { minHeight?: string }) {
  return (
    <SkeletonRegion label="Loading editor" className="editor-slot editor-slot--description">
      <div className="ticket-editor__toolbar">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} shape="block" width="2.125rem" height="2rem" />
        ))}
      </div>
      <div className="gn-field__input ticket-editor__content" style={{ minHeight }}>
        <Skeleton shape="line" width="70%" rows={3} />
      </div>
    </SkeletonRegion>
  );
}

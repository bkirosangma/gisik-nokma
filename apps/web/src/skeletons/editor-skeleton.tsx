import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

export type EditorSkeletonProps = {
  /** The slot's own `mode`: it picks the root modifier, and the stylesheet sizes the content host from it. */
  mode?: 'description' | 'comment' | 'note';
  /** True where the slot draws its Attach button (it has an uploader). */
  attach?: boolean;
  /** True for a read-only slot, which draws no formatting strip and no Format button. */
  readOnly?: boolean;
};

/**
 * What the ticket editor's slot looks like before its chunk arrives (smoothness T10; spec D6, S1, S9; amendment S-R1 rule 1: the
 * skeleton IS the real component's own box).
 *
 * Everything the real `TicketEditorSlot` draws as a box is drawn here with the same class and the same child order: the root
 * `editor-slot editor-slot--<mode>`, the `ticket-editor` host holding the formatting strip (`ticket-editor__toolbar`, only where the
 * slot is editable) and the content host (`gn-field__input ticket-editor__content`), then `editor-slot__footer` with a pill where Attach
 * sits and one where the submit control sits. NO size is set here: the content host takes its height from the stylesheet's per-mode
 * rule (description 8.375rem, comment 5.5rem), so when the editor arrives it replaces this in place and nothing below it moves.
 * Parts only inside (lines, blocks); their fill is the placeholder surface. Decoration: the region is named once for assistive tech.
 */
export function EditorSkeleton({ mode = 'description', attach = false, readOnly = false }: EditorSkeletonProps) {
  // G-6: an editable COMMENT slot keeps its strip behind a Format button in the footer (the stored choice is per device, and the
  // default is hidden), so its skeleton draws that button's pill and no strip; description and note draw the strip, a read-only slot neither.
  const collapsible = mode === 'comment' && !readOnly;
  return (
    <SkeletonRegion label="Loading editor" className={`editor-slot editor-slot--${mode}`}>
      <div className="ticket-editor">
        {readOnly || collapsible ? null : (
          <div className="ticket-editor__toolbar">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} shape="block" width="2.125rem" height="2rem" />
            ))}
          </div>
        )}
        <div className="gn-field__input ticket-editor__content">
          <Skeleton shape="line" width="70%" rows={mode === 'comment' ? 2 : 3} />
        </div>
      </div>
      <div className="editor-slot__footer">
        {collapsible ? <Skeleton shape="block" width="2.125rem" height="2rem" /> : null}
        {attach ? (
          <span className="editor-slot__attach-wrap">
            <Skeleton shape="block" width="5.5rem" height="2.5rem" />
          </span>
        ) : null}
        <p className="editor-slot__hint">{mode === 'note' ? null : <Skeleton shape="line" width="55%" />}</p>
        {mode === 'note' ? null : <Skeleton shape="block" width="6rem" height="2.5rem" />}
      </div>
    </SkeletonRegion>
  );
}

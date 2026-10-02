import { useCommentToolbarShown } from '@gisik-nokma/editor/comment-toolbar-pref';
import { Skeleton, SkeletonRegion } from '@gisik-nokma/ui';

export type EditorSkeletonProps = {
  /** The slot's own `mode`: it picks the root modifier, and the stylesheet sizes the content host from it. */
  mode?: 'description' | 'comment' | 'note';
  /** True where the slot draws its Attach button (it has an uploader). */
  attach?: boolean;
  /** True for a read-only slot, which draws no formatting strip, no Format button and no submit control. */
  readOnly?: boolean;
  /** The slot's `submitSlot`: `'none'` (the new-ticket dialog) omits the submit control, so the skeleton omits its pill. */
  submitSlot?: 'footer' | 'none';
};

/**
 * The formatting strip's items, per breakpoint, in the real bar's own groups and order (`EditorToolbar.tsx`): desktop draws all 17
 * tools plus the heading select in the blocks group; at ≤40rem (`PHONE_VISIBLE_TOOLS`) eight tools, the heading select AFTER the
 * blocks, and the one More button. Both sets are rendered and the stylesheet shows one (`editor.css`, `.gn-editor-skeleton__set`), so
 * the server markup and the first client render agree and no editor module is needed to know which bar is coming.
 */
const DESKTOP_GROUPS = [
  { key: 'history', tools: 2, select: false },
  { key: 'marks', tools: 5, select: false },
  { key: 'blocks', tools: 7, select: 'first' },
  { key: 'insert', tools: 3, select: false },
] as const;
const PHONE_GROUPS = [
  { key: 'history', tools: 2, select: false },
  { key: 'marks', tools: 3, select: false },
  { key: 'blocks', tools: 3, select: 'last' },
  { key: 'more', tools: 1, select: false },
] as const;

type Group = { key: string; tools: number; select: false | 'first' | 'last' };

function StripSet({ groups, which }: { groups: readonly Group[]; which: 'desktop' | 'phone' }) {
  const select = <Skeleton shape="block" className="gn-editor-skeleton__select" />;
  return (
    <div className={`gn-editor-skeleton__set gn-editor-skeleton__set--${which}`}>
      {groups.map((group, index) => (
        <div key={group.key} className="ticket-editor__tool-group">
          {index > 0 ? <span className="ticket-editor__tool-divider" aria-hidden="true" /> : null}
          {group.select === 'first' ? select : null}
          {Array.from({ length: group.tools }, (_, tool) => (
            <Skeleton key={tool} shape="block" className="gn-editor-skeleton__tool" />
          ))}
          {group.select === 'last' ? select : null}
        </div>
      ))}
    </div>
  );
}

/**
 * What the ticket editor's slot looks like before its chunk arrives (smoothness T10; spec D6, S1, S9; amendment S-R1 rule 1: the
 * skeleton IS the real component's own box).
 *
 * Everything the real `TicketEditorSlot` draws as a box is drawn here with the same class and child order: the root
 * `editor-slot editor-slot--<mode>`, the `ticket-editor` host holding the formatting strip (`ticket-editor__toolbar`) and the content
 * host (`gn-field__input ticket-editor__content`), then `editor-slot__footer`. The content host takes its height from the stylesheet's
 * per-mode rule (description 8.375rem, comment 5.5rem), so it carries no size here. The parts that DO carry a size are the ones whose
 * real controls set their own: the strip's items (each takes a tool's box, laid out in the real groups so the real toolbar container
 * wraps them into the same rows, per breakpoint, `editor.css`), the Format, Attach and submit pills, and the hint line (the footer's
 * height is the tallest of them). They are sized to the real controls' boxes, not invented ones; the box heights were measured equal,
 * skeleton against loaded editor, at 390 and 1280 px (case 25.182). The fill is the placeholder surface, never the well.
 *
 * Where the strip is: description and note draw it, a read-only slot draws none, and an editable COMMENT slot draws it only when the
 * reader has opted in to it (G-6; the stored per-device choice, read from the light `comment-toolbar-pref` subpath so no editor
 * module is pulled in), otherwise it leads its footer with the Format pill. Decoration only: the region is named once.
 */
export function EditorSkeleton({ mode = 'description', attach = false, readOnly = false, submitSlot = 'footer' }: EditorSkeletonProps) {
  const [commentStripShown] = useCommentToolbarShown();
  const collapsible = mode === 'comment' && !readOnly;
  const strip = !readOnly && (mode !== 'comment' || commentStripShown);
  const submit = mode !== 'note' && submitSlot !== 'none';
  return (
    <SkeletonRegion label="Loading editor" className={`editor-slot editor-slot--${mode}`}>
      <div className="ticket-editor">
        {strip ? (
          <div className="ticket-editor__toolbar">
            <StripSet groups={DESKTOP_GROUPS} which="desktop" />
            <StripSet groups={PHONE_GROUPS} which="phone" />
          </div>
        ) : null}
        <div className="gn-field__input ticket-editor__content">
          <Skeleton shape="line" width="70%" rows={mode === 'comment' ? 2 : 3} />
        </div>
      </div>
      <div className="editor-slot__footer">
        {collapsible ? <Skeleton shape="block" className="gn-editor-skeleton__format" /> : null}
        {attach ? (
          <span className="editor-slot__attach-wrap">
            <Skeleton shape="block" width="5.5rem" height="2.5rem" className="gn-editor-skeleton__attach" />
          </span>
        ) : null}
        <p className="editor-slot__hint">{mode === 'note' ? null : <Skeleton shape="line" width="55%" height="1rem" />}</p>
        {submit ? <Skeleton shape="block" width="6rem" height="2.75rem" className="gn-editor-skeleton__submit" /> : null}
      </div>
    </SkeletonRegion>
  );
}

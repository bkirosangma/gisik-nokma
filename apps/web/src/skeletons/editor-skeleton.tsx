import { useCommentToolbarShown } from '@gisik-nokma/editor/comment-toolbar-pref';
import { MARKDOWN_HINT } from '@gisik-nokma/editor/markdown-hint';
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
  /** The slot's `footerNote`: a comment composer's whole hint line. The hint wraps to as many lines as the words need at this width. */
  footerNote?: string;
};

/**
 * The formatting strip's items, per breakpoint, in the real bar's own groups and order (`EditorToolbar.tsx`): desktop draws all 17
 * tools plus the heading select in the blocks group; at ≤40rem it is G-7's ONE row (`PHONE_BAR_ORDER`): seven tools with the heading
 * select after the fourth (bold, italic, list, task, SELECT, link, insert ticket, insert note) scrolling inside `.ticket-editor__scroll`,
 * and the one More button pinned after it in its own group (`.ticket-editor__more`). Both sets are rendered and the stylesheet shows
 * one (`editor.css`, `.gn-editor-skeleton__set`), so the server markup and the first client render agree and no editor module is
 * needed to know which bar is coming. The phone row takes its height (`--ticket-editor-bar-h`: 56px, 84px in neo) and its nowrap,
 * its scroller and its pinned More from the real bar's own rules, because it is drawn in the real bar's own classes.
 */
const DESKTOP_GROUPS = [
  { key: 'history', tools: 2, select: false },
  { key: 'marks', tools: 5, select: false },
  { key: 'blocks', tools: 7, select: 'first' },
  { key: 'insert', tools: 3, select: false },
] as const;
/** The phone bar's scrolling group: tools before the heading select, then tools after it (the real `PHONE_BAR_ORDER`). */
const PHONE_SCROLL = { before: 4, after: 3 } as const;
const PHONE_MORE_TOOLS = 1;

const skeletonTools = (count: number) => Array.from({ length: count }, (_, tool) => <Skeleton key={tool} shape="block" className="gn-editor-skeleton__tool" />);
const skeletonSelect = () => <Skeleton shape="block" className="gn-editor-skeleton__select" />;

function DesktopSet() {
  return (
    <div className="gn-editor-skeleton__set gn-editor-skeleton__set--desktop">
      {DESKTOP_GROUPS.map((group, index) => (
        <div key={group.key} className="ticket-editor__tool-group">
          {index > 0 ? <span className="ticket-editor__tool-divider" aria-hidden="true" /> : null}
          {group.select === 'first' ? skeletonSelect() : null}
          {skeletonTools(group.tools)}
        </div>
      ))}
    </div>
  );
}

function PhoneSet() {
  return (
    <div className="gn-editor-skeleton__set gn-editor-skeleton__set--phone">
      <div className="ticket-editor__scroll" data-at-start="true" data-at-end="true">
        <div className="ticket-editor__tool-group">
          {skeletonTools(PHONE_SCROLL.before)}
          {skeletonSelect()}
          {skeletonTools(PHONE_SCROLL.after)}
        </div>
      </div>
      <div className="ticket-editor__tool-group ticket-editor__more">{skeletonTools(PHONE_MORE_TOOLS)}</div>
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
 * wraps them into the same rows, per breakpoint, `editor.css`), the Format, Attach and submit pills, and the hint (its own words, set transparent on the placeholder fill, so it wraps to the lines the real hint wraps to; the footer's
 * height is the tallest of them). They are sized to the real controls' boxes, not invented ones; the box heights were measured equal,
 * skeleton against loaded editor, at 390 and 1280 px (case 25.182). The fill is the placeholder surface, never the well.
 *
 * Where the strip is: description and note draw it, a read-only slot draws none, and an editable COMMENT slot draws it only when the
 * reader has opted in to it (G-6; the stored per-device choice, read from the light `comment-toolbar-pref` subpath so no editor
 * module is pulled in), otherwise it leads its footer with the Format pill. Decoration only: the region is named once.
 */
export function EditorSkeleton({ mode = 'description', attach = false, readOnly = false, submitSlot = 'footer', footerNote }: EditorSkeletonProps) {
  const [commentStripShown] = useCommentToolbarShown();
  const collapsible = mode === 'comment' && !readOnly;
  const strip = !readOnly && (mode !== 'comment' || commentStripShown);
  const submit = mode !== 'note' && submitSlot !== 'none';
  // The real slot's hint line: note none, comment the host's `footerNote`, description the Markdown sentence (none when read-only).
  const hint = mode === 'note' ? '' : mode === 'comment' ? (footerNote ?? '') : readOnly ? '' : MARKDOWN_HINT;
  return (
    <SkeletonRegion label="Loading editor" className={`editor-slot editor-slot--${mode}`}>
      <div className="ticket-editor">
        {strip ? (
          <div className="ticket-editor__toolbar">
            <DesktopSet />
            <PhoneSet />
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
            <Skeleton shape="block" width="5.7rem" height="2.5rem" className="gn-editor-skeleton__attach" />
          </span>
        ) : null}
        <p className="editor-slot__hint">
          {hint === '' ? null : (
            <span className="gn-skeleton gn-editor-skeleton__hint-text" aria-hidden="true">
              {hint}
            </span>
          )}
        </p>
        {submit ? <Skeleton shape="block" width="4.375rem" height="2.75rem" className="gn-editor-skeleton__submit" /> : null}
      </div>
    </SkeletonRegion>
  );
}

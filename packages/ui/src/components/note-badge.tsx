import { RemoveIcon } from '../select/select-icons.js';

/**
 * `NoteBadge` — a note, named on somebody else's page (spec §10.2).
 *
 * ## The × is a SEPARATE control, and it is a sibling of the link
 *
 * The shape the spec draws is `<span><a>{title}</a><button aria-label="Detach
 * {title}">×</button></span>`, and the nesting is the whole point rather than a
 * layout preference. A `<button>` inside an `<a>` is not a thing a browser can
 * draw — the HTML parser does not allow interactive content inside an anchor,
 * and what it does with one is flatten it or reparent it, differently per
 * engine. So a badge that put the × inside the link would render, would look
 * right in a screenshot, and would be a link that navigates when you meant to
 * detach (or a detached note when you meant to open it), depending on which way
 * the parser leaned. 18.197 asserts the button is not a descendant of the link.
 *
 * `RemoveIcon` is `aria-hidden`, so the button's accessible name is its own
 * `aria-label` — the spec's `Detach <title>` — and that name carries the TITLE
 * rather than a bare "Detach", because a note page can show several badges and
 * "Detach" alone identifies none of them.
 *
 * ## Why the title is truncated but `title=` carries it whole
 *
 * Forty characters is the spec's number (§10.2), and the ellipsis is what keeps
 * one long note from eating a ticket's whole notes row. The `title=` attribute
 * holds the FULL string, so the truncation hides nothing from a pointer — and
 * the accessible NAME is the truncated text, deliberately: a screen reader
 * announcing forty characters twice (once in the name, once in the description)
 * is not more informative than announcing them once.
 */
export type NoteBadgeProps = {
  title: string;
  scopeMode: 'private' | 'workspace' | 'project' | 'inherit' | 'explicit';
  href: string;
  /** Absent → no × is rendered at all, which is how a reader's badge differs. */
  onDetach?: () => void;
};

/** The spec's truncation point (§10.2), INCLUDING the ellipsis. */
export const NOTE_BADGE_TITLE_MAX = 40;

/** `title` cut to `NOTE_BADGE_TITLE_MAX` characters with an ellipsis, or unchanged. */
export function truncateNoteTitle(title: string): string {
  return title.length <= NOTE_BADGE_TITLE_MAX
    ? title
    : `${title.slice(0, NOTE_BADGE_TITLE_MAX - 1)}…`;
}

export function NoteBadge({ title, scopeMode, href, onDetach }: NoteBadgeProps) {
  return (
    <span className={`gn-note-badge gn-note-badge--${scopeMode}`}>
      <a href={href} title={title} className="gn-note-badge__title">
        {truncateNoteTitle(title)}
      </a>
      {onDetach === undefined ? null : (
        <button
          type="button"
          className="gn-note-badge__remove"
          aria-label={`Detach ${title}`}
          onClick={onDetach}
        >
          <RemoveIcon />
        </button>
      )}
    </span>
  );
}

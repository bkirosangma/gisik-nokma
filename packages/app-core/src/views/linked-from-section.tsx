import { useState, type MouseEvent } from 'react';
import { linkedFromSourceTitle, splitSnippet, type LinkedFromPage, type LinkedFromRow } from '@gisik-nokma/domain';
import { PageIcon } from '@gisik-nokma/ui';
import type { LiveQueryResult } from './use-live-query.js';

export type LinkedFromSectionProps = {
  page: LiveQueryResult<LinkedFromPage>;
  loadMore: (cursor: string) => Promise<LinkedFromPage>;
  hrefOf: (row: LinkedFromRow) => string | null;
  nameOf: (userId: string) => string;
  onNavigate?: (href: string) => void;
};

/** Where a row opens (spec B §3.1): the source; a comment opens its parent at `#comment-<id>`. */
export function linkedFromHref(
  row: LinkedFromRow,
  ticketHref: (ref: { ticketId: string; projectId: string }) => string | null,
): string | null {
  const parent = row.parent;
  const base = parent.kind === 'ticket' ? ticketHref({ ticketId: parent.ticketId, projectId: parent.projectId }) : `/notes/${parent.noteId}`;
  if (base === null) return null;
  return row.sourceKind === 'comment' ? `${base}#comment-${row.sourceId}` : base;
}

function Glyph({ row }: { row: LinkedFromRow }) {
  if (row.sourceKind === 'comment') return <span className="gn-linked-from__glyph gn-linked-from__glyph--comment" aria-hidden="true">”</span>;
  if (row.parent.kind === 'note') return <span className="gn-linked-from__glyph gn-linked-from__glyph--note" aria-hidden="true"><PageIcon /></span>;
  return <span className={`gn-linked-from__dot gn-linked-from__dot--${row.parent.stateCategory}`} aria-hidden="true" />;
}

function Snippet({ snippet }: { snippet: string }) {
  const parts = splitSnippet(snippet);
  if (parts === null) return <span className="gn-linked-from__snippet">{snippet}</span>;
  return (
    <span className="gn-linked-from__snippet">
      {parts.before}
      <mark>{parts.marked}</mark>
      {parts.after}
    </span>
  );
}

/**
 * "Linked from" (Knowledge Graph spec B §3.1): the sources that reference this
 * ticket or note and that the viewer may see. ABSENT while loading and when
 * nothing links here ("nothing to say"); a failed read says so in one line,
 * the `TicketNotesSection` sentence.
 */
export function LinkedFromSection({ page, loadMore, hrefOf, nameOf, onNavigate }: LinkedFromSectionProps) {
  const [extra, setExtra] = useState<{ forPage: LinkedFromPage; rows: LinkedFromRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  if (page.error !== null) {
    return (
      <section className="gn-linked-from" data-testid="linked-from">
        <h3 className="gn-ticket-sheet__caption">Linked from</h3>
        <p className="gn-linked-from__error" role="alert">
          {`What links here could not be read: ${page.error}. That is a failure of this read, not a statement about this item: it may answer on a retry.`}
        </p>
      </section>
    );
  }
  const first = page.data;
  if (first === null || first.total === 0) return null;
  // Rows paged in by "Show all" belong to the first page they were loaded under; a reload starts over.
  const rows = [...first.items, ...(extra !== null && extra.forPage === first ? extra.rows : [])];

  async function showAll(start: LinkedFromPage): Promise<void> {
    setLoading(true);
    setMoreError(null);
    const collected: LinkedFromRow[] = [];
    let cursor = start.nextCursor;
    try {
      while (cursor !== null) {
        const next = await loadMore(cursor);
        collected.push(...next.items);
        cursor = next.nextCursor;
      }
      setExtra({ forPage: start, rows: collected });
    } catch (cause) {
      setMoreError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  const open = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate === undefined) return;
    event.preventDefault();
    onNavigate(href);
  };

  return (
    <section className="gn-linked-from" data-testid="linked-from">
      <h3 className="gn-ticket-sheet__caption">
        Linked from<span className="gn-linked-from__count">{first.total}</span>
      </h3>
      <ul className="gn-linked-from__list">
        {rows.map((row) => {
          const name = `${linkedFromSourceTitle(row)}${row.sourceKind === 'comment' ? ` by ${nameOf(row.authorId)}` : ''}`;
          const body = (
            <>
              <Glyph row={row} />
              <span className="gn-linked-from__name">{name}</span>
              <Snippet snippet={row.snippet} />
            </>
          );
          const href = hrefOf(row);
          return (
            <li key={`${row.sourceKind}:${row.sourceId}`} className="gn-linked-from__row">
              {href === null ? <span className="gn-linked-from__link">{body}</span> : <a className="gn-linked-from__link" href={href} onClick={open(href)}>{body}</a>}
            </li>
          );
        })}
      </ul>
      {first.total > rows.length ? (
        <button type="button" className="gn-button gn-button--ghost gn-linked-from__more" disabled={loading} onClick={() => void showAll(first)}>
          {`Show all ${first.total}`}
        </button>
      ) : null}
      {moreError === null ? null : <p className="gn-linked-from__error" role="alert">{`The rest could not be read: ${moreError}.`}</p>}
    </section>
  );
}

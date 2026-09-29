import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { formatIstInstant, type DeletedItem, type LifecycleKind } from '@gisik-nokma/domain';
import { Button } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { cachedDeletedItemsOf } from '../deleted-items-from-cache.js';
import { writeFailureCopy, writeFailureRefusalClass } from '../session-expired.js';
import { makeSubmittedFactory, type EnvelopeSeed } from '../submit.js';
import { classifyBatch } from '../trash/batch.js';
import {
  DELETED_BY_UNKNOWN,
  DELETED_BY_YOU,
  DELETED_ITEMS_EMPTY,
  DELETED_ITEMS_HEADING,
  DELETED_ITEMS_LOADING,
  DELETED_ITEMS_OFFLINE,
  KIND_LABEL,
  MARK_LABEL,
  PURGE_UNDER_WAY,
  RESTORE_LABEL,
  UNMARK_BEFORE_RESTORE,
  UNMARK_LABEL,
  changeUnreachableLine,
  containedLine,
  deletedByLine,
  deletedItemsAsOf,
  deletedItemsFailed,
  markItemName,
  permanentlyDeletedOn,
  restoreItemName,
  unansweredLine,
  unmarkItemName,
} from '../trash/copy.js';
import { isPurgeOverdue, istDayLabel } from '../trash/dates.js';
import { markSeeds, restoreSeeds, targetOf, unmarkSeeds } from '../trash/seeds.js';

export type DeletedItemsSectionProps = {
  dataSource: Pick<DataSource, 'ingest' | 'query'>;
  currentUserId: string;
  /** Injected so "overdue" is testable at the due instant; the page omits it. */
  now?: () => Date;
};

type Load =
  | { at: 'loading' }
  | { at: 'ready'; items: DeletedItem[] }
  | { at: 'cached'; items: DeletedItem[]; fetchedAt: string }
  | { at: 'offline' }
  | { at: 'failed'; message: string };

type RowNotice = { id: string; text: string; className: string };

/**
 * Account → Deleted items (trash series Plan 4; spec §6.3, §7). Every deleted
 * workspace, project, ticket or note this person may act on (T3 — the server
 * decides; this lists what `GET /v1/me/deleted-items` serves, in its order,
 * newest first).
 *
 * ## Three states that are NOT the empty list (D13)
 *
 * "Nothing deleted." is a claim about the account. The replica cannot answer
 * this read until Plan 3 (`ReplicaGapError`) and a server can fail; neither may
 * be painted as that claim — the reasoning Plan 1 gave for the replica's
 * rejection (`replica-data-source.ts`'s `DELETED_ITEMS_NOT_CACHED`). The offline
 * case is recognised by the error's NAME (`ReplicaGapError`, set in its
 * constructor), so this view does not import the replica module.
 *
 * Trash Plan 3 adds a fourth: the SAVED copy (`DeletedItemsFromCache`), drawn
 * read-only under its instant. `DELETED_ITEMS_OFFLINE` now means only that
 * nothing was ever saved.
 *
 * ## A marked row cannot be restored — the server says so, and so does the row (D14)
 *
 * `*.undeleted`/`*.restored` are refused while marked (`UNMARK_FIRST_REASON`),
 * and an unmark is refused once due (`PURGE_DUE_REASON`). The row states both
 * as visible text beside a disabled Restore rather than offering a press the
 * server will refuse.
 */
export function DeletedItemsSection({
  dataSource,
  currentUserId,
  now = () => new Date(),
}: DeletedItemsSectionProps): ReactElement {
  const headingId = useId();
  const [load, setLoad] = useState<Load>({ at: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<RowNotice | null>(null);
  // Set synchronously before the first await: a second press in the same tick
  // is refused before React re-renders `disabled`.
  const busyRef = useRef<string | null>(null);

  const reload = useCallback((): Promise<void> => {
    return dataSource.query.getDeletedItems().then(
      (items) => setLoad({ at: 'ready', items }),
      (cause: unknown) => {
        // Trash Plan 3 (D9): the saved copy is a list, just not a current one.
        const cached = cachedDeletedItemsOf(cause);
        if (cached !== null) setLoad({ at: 'cached', items: cached.items, fetchedAt: cached.fetchedAt });
        else if (cause instanceof Error && cause.name === 'ReplicaGapError') setLoad({ at: 'offline' });
        else setLoad({ at: 'failed', message: cause instanceof Error ? cause.message : String(cause) });
      },
    );
  }, [dataSource]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (item: DeletedItem, seeds: EnvelopeSeed[]): Promise<void> => {
    if (busyRef.current !== null) return;
    busyRef.current = item.id;
    setBusyId(item.id);
    setNotice(null);
    const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });
    try {
      const results = await dataSource.ingest(seeds.map(make));
      const outcome = classifyBatch(results, seeds.length);
      if (outcome.status === 'unanswered') {
        setNotice({ id: item.id, text: unansweredLine(outcome.answered, seeds.length), className: 'gn-refusal gn-refusal--transport' });
      } else if (outcome.status !== 'committed') {
        setNotice({ id: item.id, text: outcome.reason, className: 'gn-refusal gn-refusal--server' });
      }
      // Re-read on every answer: a committed act moved the row, and a refused
      // or half-committed one may have changed the world under it. Awaited, so
      // the latch outlasts the window where the old row is still drawn.
      await reload();
    } catch (cause) {
      const text = writeFailureCopy(cause, changeUnreachableLine);
      setNotice({ id: item.id, text, className: writeFailureRefusalClass(text) });
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  };

  const at = now();
  // A live list and a saved copy draw the same rows; only the live one can be acted on.
  const rows = load.at === 'ready' || load.at === 'cached' ? load.items : null;
  const readOnly = load.at === 'cached';

  return (
    <section className="gn-account__section gn-deleted-items" aria-labelledby={headingId}>
      <h2 className="gn-account__section-title" id={headingId}>
        {DELETED_ITEMS_HEADING}
      </h2>
      {load.at === 'loading' ? <p className="gn-account__note">{DELETED_ITEMS_LOADING}</p> : null}
      {load.at === 'offline' ? <p className="gn-account__note">{DELETED_ITEMS_OFFLINE}</p> : null}
      {load.at === 'cached' ? <p className="gn-account__note">{deletedItemsAsOf(formatIstInstant(load.fetchedAt))}</p> : null}
      {load.at === 'failed' ? (
        <p role="alert" className="gn-refusal gn-refusal--transport">
          {deletedItemsFailed(load.message)}
        </p>
      ) : null}
      {rows !== null && rows.length === 0 ? (
        <p className="gn-account__note">{DELETED_ITEMS_EMPTY}</p>
      ) : null}
      {rows !== null && rows.length > 0 ? (
        <ul className="gn-deleted-items__list">
          {rows.map((item) => {
            const label = item.label !== '' ? item.label : KIND_LABEL[item.kind];
            const marked = item.purgeDueAt !== null;
            const overdue = isPurgeOverdue(item.purgeDueAt, at);
            const where = whereLine(item);
            const who =
              item.deletedBy === currentUserId ? DELETED_BY_YOU : (item.deletedByName ?? DELETED_BY_UNKNOWN);
            const inside = containedLine(item.containedCount);
            const busy = busyId !== null;
            const target = targetOf(item);
            return (
              <li key={`${item.kind}:${item.id}`} className="gn-deleted-items__row" data-testid={`deleted-item-${item.id}`}>
                <KindIcon kind={item.kind} />
                <span className="gn-deleted-items__text">
                  <span className="gn-deleted-items__label">{label}</span>
                  <span className="gn-deleted-items__meta">
                    {where === null ? KIND_LABEL[item.kind] : `${KIND_LABEL[item.kind]} · ${where}`}
                  </span>
                  <span className="gn-deleted-items__meta">{deletedByLine(who, istDayLabel(item.deletedAt))}</span>
                  {inside !== null ? <span className="gn-deleted-items__meta">{inside}</span> : null}
                  {item.purgeDueAt !== null ? (
                    <span className="gn-deleted-items__due">{permanentlyDeletedOn(istDayLabel(item.purgeDueAt))}</span>
                  ) : null}
                  {marked && !readOnly ? (
                    <span className="gn-deleted-items__reason">{overdue ? PURGE_UNDER_WAY : UNMARK_BEFORE_RESTORE}</span>
                  ) : null}
                </span>
                {readOnly ? null : (
                  <span className="gn-deleted-items__actions">
                    <Button
                      aria-label={restoreItemName(label)}
                      disabled={busy || marked}
                      onClick={() => void act(item, restoreSeeds(target, false))}
                    >
                      {RESTORE_LABEL}
                    </Button>
                    {!marked ? (
                      <Button
                        variant="danger"
                        aria-label={markItemName(label)}
                        disabled={busy}
                        onClick={() => void act(item, markSeeds(target))}
                      >
                        {MARK_LABEL}
                      </Button>
                    ) : null}
                    {marked && !overdue ? (
                      <Button
                        aria-label={unmarkItemName(label)}
                        disabled={busy}
                        onClick={() => void act(item, unmarkSeeds(target))}
                      >
                        {UNMARK_LABEL}
                      </Button>
                    ) : null}
                  </span>
                )}
                {notice !== null && notice.id === item.id ? (
                  <p role="alert" className={notice.className}>
                    {notice.text}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** Spec §6.3's "where it lived (workspace › project)". A workspace lived nowhere but itself. */
function whereLine(item: DeletedItem): string | null {
  if (item.kind === 'workspace') return null;
  if (item.kind === 'project' || item.projectName === null) return item.workspaceName;
  return `${item.workspaceName} › ${item.projectName}`;
}

/**
 * The kind's glyph — DECORATIVE (`aria-hidden`): the kind is also written in
 * the row's meta line, so colour and shape are never the only signal. Stroke
 * `currentColor`, 20px on a 24 grid (the product's icon metrics).
 */
function KindIcon({ kind }: { kind: LifecycleKind }): ReactElement {
  return (
    <svg
      className="gn-deleted-items__icon"
      data-kind={kind}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'workspace' ? (
        <>
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        </>
      ) : kind === 'project' ? (
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      ) : kind === 'ticket' ? (
        <>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m9 12 2 2 4-4" />
        </>
      ) : (
        <>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </>
      )}
    </svg>
  );
}

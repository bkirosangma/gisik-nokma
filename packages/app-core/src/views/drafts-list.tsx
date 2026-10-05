import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button, Chip } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import { makeSubmittedFactory } from '../submit.js';
import type { DraftRow } from '../view-types.js';
import { DiscardDraftDialog } from './discard-draft-dialog.js';
import { discardCounts, discardDraft, publishDraft, subDraftsOf, type DraftOutcome } from './draft-actions.js';
import {
  DRAFTS_EMPTY,
  DRAFTS_NAV_LABEL,
  DRAFT_DISCARD_LABEL,
  DRAFT_PENDING_LABEL,
  DRAFT_PUBLISH_LABEL,
  draftParentLabel,
} from './drafts-copy.js';

export type DraftsListProps = {
  drafts: readonly DraftRow[];
  dataSource: DataSource;
  workspaceId: string;
  currentUserId: string;
  typeName: (typeId: string) => string;
  /** The title of a parent that is not itself one of these drafts; `null` when unknown. */
  parentTitleOf?: (parentId: string) => string | null;
  /** Below `40rem` the two row actions collapse into one `Actions for <title>` menu (decision 11). */
  phone?: boolean;
  onOpenTicket: (ticketId: string) => void;
  /** A publish or discard committed or was queued: the host re-reads the list. */
  onChanged?: () => void;
};

type Alert = { ticketId: string; text: string };

/**
 * The Drafts page's list (drafts plan, Task 8, spec §12.2): the viewer's own drafts, in the order given, each with its
 * type, title, project, parent and Publish/Discard. Never a key: a draft has none. Publish and Discard hide their rows
 * at once and put them back on any answer that is not a commit or a queue (decision 5), with the reason under the
 * draft's own row.
 */
export function DraftsList(props: DraftsListProps): ReactElement {
  const { drafts, dataSource, workspaceId, currentUserId } = props;
  const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [alert, setAlert] = useState<Alert | null>(null);
  const [discarding, setDiscarding] = useState<DraftRow | null>(null);

  const hide = (ids: readonly string[]): void => setHidden((was) => new Set([...was, ...ids]));
  const show = (ids: readonly string[]): void => setHidden((was) => new Set([...was].filter((id) => !ids.includes(id))));

  /** One answer, one treatment: a commit or a queue asks the host to re-read; anything else puts the rows back. */
  const settle = (draft: DraftRow, ids: readonly string[], outcome: DraftOutcome): void => {
    if (outcome.status === 'committed' || outcome.status === 'queued') {
      // A queued claim leaves the draft a draft until the server answers (decision 4): its row comes back, and the
      // re-read lists it `pending`.
      if (outcome.status === 'queued') show(ids);
      props.onChanged?.();
      return;
    }
    show(ids);
    setAlert({ ticketId: draft.ticketId, text: outcome.status === 'refused' ? outcome.reason : outcome.message });
  };

  const publish = async (draft: DraftRow): Promise<void> => {
    setAlert(null);
    hide([draft.ticketId]);
    settle(draft, [draft.ticketId], await publishDraft(dataSource, make, { workspaceId, ticketId: draft.ticketId, projectId: draft.projectId }));
  };

  const confirmDiscard = async (draft: DraftRow): Promise<void> => {
    const ids = [draft.ticketId, ...subDraftsOf(drafts, draft.ticketId).map((d) => d.ticketId)];
    setDiscarding(null);
    setAlert(null);
    hide(ids);
    settle(draft, ids, await discardDraft(dataSource, make, { workspaceId, ticketId: draft.ticketId, projectId: draft.projectId }));
  };

  const visible = drafts.filter((d) => !hidden.has(d.ticketId));
  // An alert is set only with its row restored and is drawn inside that row, so an empty list has no alert to keep.
  if (visible.length === 0) return <p className="gn-drafts__empty">{DRAFTS_EMPTY}</p>;

  const parentTitle = (draft: DraftRow): string | null =>
    draft.parentId === null
      ? null
      : (drafts.find((d) => d.ticketId === draft.parentId)?.title ?? props.parentTitleOf?.(draft.parentId) ?? null);

  return (
    <>
      <ul className="gn-drafts" aria-label={DRAFTS_NAV_LABEL}>
        {visible.map((draft) => {
          const parent = parentTitle(draft);
          return (
            <li key={draft.ticketId} className="gn-drafts__row">
              <Chip>{props.typeName(draft.typeId)}</Chip>
              {/* The accessible name is `Open <title>`; the visible text is the title, so the verb is a visually
                  hidden prefix (label-in-name kept). */}
              <button type="button" className="gn-drafts__title" onClick={() => props.onOpenTicket(draft.ticketId)}>
                <span className="gn-visually-hidden">Open </span>
                {draft.title}
              </button>
              <span className="gn-drafts__meta">
                {draft.projectName === null ? null : <span>{draft.projectName}</span>}
                {parent === null ? null : <span>{draftParentLabel(parent)}</span>}
                {draft.pending ? <span>{DRAFT_PENDING_LABEL}</span> : null}
              </span>
              {props.phone === true ? (
                <RowMenu title={draft.title} onPublish={() => void publish(draft)} onDiscard={() => setDiscarding(draft)} />
              ) : (
                <span className="gn-drafts__actions">
                  <Button variant="primary" aria-label={`${DRAFT_PUBLISH_LABEL} ${draft.title}`} onClick={() => void publish(draft)}>
                    {DRAFT_PUBLISH_LABEL}
                  </Button>
                  <Button aria-label={`${DRAFT_DISCARD_LABEL} ${draft.title}`} onClick={() => setDiscarding(draft)}>
                    {DRAFT_DISCARD_LABEL}
                  </Button>
                </span>
              )}
              {alert?.ticketId === draft.ticketId ? (
                <p role="alert" className="gn-drafts__alert">
                  {alert.text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {discarding === null ? null : (
        <DiscardDraftDialog
          open
          title={discarding.title}
          counts={discardCounts(drafts, discarding.ticketId)}
          onCancel={() => setDiscarding(null)}
          onConfirm={() => void confirmDiscard(discarding)}
        />
      )}
    </>
  );
}

/** The phone's row menu: one button, two items. Escape and a pick close it; Escape returns focus to the button. */
function RowMenu(props: { title: string; onPublish: () => void; onDiscard: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const pick = (action: () => void) => (): void => {
    setOpen(false);
    action();
  };
  return (
    <span className="gn-drafts__menu">
      <Button
        ref={button}
        aria-label={`Actions for ${props.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true">&#8943;</span>
      </Button>
      {open ? (
        <div role="menu" aria-label={`Actions for ${props.title}`} className="gn-drafts__menu-list">
          <button type="button" role="menuitem" onClick={pick(props.onPublish)}>
            {DRAFT_PUBLISH_LABEL}
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onDiscard)}>
            {DRAFT_DISCARD_LABEL}
          </button>
        </div>
      ) : null}
    </span>
  );
}

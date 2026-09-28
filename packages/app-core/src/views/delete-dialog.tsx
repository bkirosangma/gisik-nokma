import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { LifecycleKind } from '@gisik-nokma/domain';
import { Button, Dialog, Switch } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import type { MakeSubmitted } from '../submit.js';
import { writeFailureCopy, writeFailureRefusalClass } from '../session-expired.js';
import { classifyBatch } from '../trash/batch.js';
import {
  DELETE_CANCEL_LABEL,
  DELETE_CLOSE_LABEL,
  DELETE_NOTE,
  DELETE_PERMANENTLY_LABEL,
  batchMixedLine,
  deleteConfirmAccessibleName,
  deleteConfirmVisibleLabel,
  deleteDialogTitle,
  deleteUnreachableLine,
  deletedNotMarkedLine,
  typeNameLabel,
  unansweredLine,
} from '../trash/copy.js';
import { deleteSeeds } from '../trash/seeds.js';

export type DeleteDialogProps = {
  open: boolean;
  kind: LifecycleKind;
  /** The item's human name — a title, a project or workspace name. */
  name: string;
  workspaceId: string;
  entityId: string;
  dataSource: Pick<DataSource, 'ingest'>;
  make: MakeSubmitted;
  /** Cancel, the ×, the scrim or Escape — nothing committed. */
  onCancel: () => void;
  /** The delete COMMITTED. `permanent` is true only when the mark committed too. */
  onDeleted: (outcome: { permanent: boolean }) => void;
};

/**
 * THE delete confirmation (trash series Plan 4; spec §6.1, §7). Every delete
 * door in the product opens this one component — the ticket sheet, a note's
 * page, a project card, a workspace card — so the switch, the note, the
 * one-batch order and the refusal behaviour cannot drift between them.
 *
 * It owns its submit rather than handing a callback to its host, because §7's
 * rule — "the dialog shows it inline and keeps the dialog open" — is about
 * THIS surface, and a host-owned submit would need every host to thread a
 * refusal back in.
 *
 * `open` false renders nothing, and each opening mounts a FRESH body: the
 * switch and the typed name start empty every time, but a refusal inside one
 * opening keeps both (Review Focus 2, case 19.222).
 */
export function DeleteDialog(props: DeleteDialogProps): ReactElement | null {
  if (!props.open) return null;
  return <DeleteDialogBody {...props} />;
}

type Phase =
  | { at: 'asking'; notice: { text: string; className: string } | null }
  | { at: 'partly'; text: string };

function DeleteDialogBody({
  kind,
  name,
  workspaceId,
  entityId,
  dataSource,
  make,
  onCancel,
  onDeleted,
}: DeleteDialogProps): ReactElement {
  const [permanent, setPermanent] = useState(false);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>({ at: 'asking', notice: null });
  const [submitting, setSubmitting] = useState(false);
  // Set SYNCHRONOUSLY before the first await, so a second press in the same
  // tick is refused even before React re-renders `disabled` (the ticket
  // sheet's title latch records why render state alone cannot do this).
  const inFlight = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const noteId = useId();
  const nameId = useId();
  const needsTypedName = kind === 'workspace';
  const nameMatches = !needsTypedName || typed.trim() === name.trim();

  // D10's Close takes the focus the confirm had: the confirm is gone, and a
  // person who pressed it must land on the one thing left to press.
  useEffect(() => {
    if (phase.at === 'partly') closeRef.current?.focus();
  }, [phase.at]);

  const finishPartly = (): void => onDeleted({ permanent: false });

  const submit = async (): Promise<void> => {
    if (inFlight.current || !nameMatches) return;
    inFlight.current = true;
    setSubmitting(true);
    const seeds = deleteSeeds({ kind, workspaceId, entityId }, permanent);
    try {
      const results = await dataSource.ingest(seeds.map(make));
      const outcome = classifyBatch(results, seeds.length);
      if (outcome.status === 'committed') {
        onDeleted({ permanent });
        return;
      }
      if (outcome.status === 'partly') {
        setPhase({
          at: 'partly',
          text: outcome.committed[0] === true ? deletedNotMarkedLine(kind, outcome.reason) : batchMixedLine(outcome.reason),
        });
        return;
      }
      if (outcome.status === 'refused') {
        setPhase({ at: 'asking', notice: { text: outcome.reason, className: 'gn-refusal gn-refusal--server' } });
        return;
      }
      setPhase({
        at: 'asking',
        notice: { text: unansweredLine(outcome.answered, seeds.length), className: 'gn-refusal gn-refusal--transport' },
      });
    } catch (cause) {
      const text = writeFailureCopy(cause, deleteUnreachableLine);
      setPhase({ at: 'asking', notice: { text, className: writeFailureRefusalClass(text) } });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const title = deleteDialogTitle(kind, name);

  if (phase.at === 'partly') {
    return (
      <Dialog open title={title} onClose={finishPartly} role="alertdialog" initialFocusRef={closeRef}>
        <div className="gn-delete-dialog">
          <p role="alert" className="gn-refusal gn-refusal--server">
            {phase.text}
          </p>
          <div className="gn-delete-dialog__actions">
            <Button ref={closeRef} onClick={finishPartly}>
              {DELETE_CLOSE_LABEL}
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title={title}
      onClose={onCancel}
      role="alertdialog"
      initialFocusRef={cancelRef}
      describedBy={noteId}
    >
      <div className="gn-delete-dialog">
        {needsTypedName ? (
          <div className="gn-field gn-delete-dialog__name">
            <label className="gn-field__label" htmlFor={nameId}>
              {typeNameLabel(name)}
            </label>
            <input
              id={nameId}
              className="gn-field__input"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}
        <Switch checked={permanent} onChange={setPermanent} className="gn-delete-dialog__switch">
          {DELETE_PERMANENTLY_LABEL}
        </Switch>
        <p id={noteId} className="gn-delete-dialog__note">
          {DELETE_NOTE}
        </p>
        {phase.notice !== null ? (
          <p role="alert" className={phase.notice.className}>
            {phase.notice.text}
          </p>
        ) : null}
        <div className="gn-delete-dialog__actions">
          <Button ref={cancelRef} onClick={onCancel}>
            {DELETE_CANCEL_LABEL}
          </Button>
          <Button
            variant="danger"
            aria-label={deleteConfirmAccessibleName(kind, permanent)}
            disabled={submitting || !nameMatches}
            onClick={() => void submit()}
          >
            {deleteConfirmVisibleLabel(permanent)}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

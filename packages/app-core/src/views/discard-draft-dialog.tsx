import { useRef, type ReactElement } from 'react';
import { Button, Dialog } from '@gisik-nokma/ui';
import type { DiscardCounts } from './draft-actions.js';
import {
  DISCARD_ATTACHMENTS_UNKNOWN,
  DISCARD_CONFIRM_LABEL,
  DISCARD_NOTES_LINE,
  DISCARD_QUESTION,
  attachmentsLine,
  subDraftsLine,
} from './drafts-copy.js';

/**
 * The Discard confirmation (drafts plan, Task 8; spec §12.3, R60). Presentational: the host owns the submit, because
 * the list erases a row optimistically and the sheet closes itself, and neither wants a dialog that decides. Focus
 * starts on Cancel, the safe answer for a destructive confirm (`Dialog.initialFocusRef`, the trash series' precedent).
 * A count line shows only when its count is above zero; an unknown attachment count (`null`, the offline copy) says
 * so without a number rather than printing `0`.
 */
export function DiscardDraftDialog(props: {
  open: boolean;
  title: string;
  counts: DiscardCounts;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement | null {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { counts } = props;
  return (
    <Dialog
      open={props.open}
      title={DISCARD_CONFIRM_LABEL}
      role="alertdialog"
      onClose={props.onCancel}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={props.onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={props.onConfirm}>
            {DISCARD_CONFIRM_LABEL}
          </Button>
        </>
      }
    >
      <p>{DISCARD_QUESTION}</p>
      <p>
        <strong>{props.title}</strong>
      </p>
      <ul className="gn-discard-lines">
        {counts.subDrafts > 0 ? <li>{subDraftsLine(counts.subDrafts)}</li> : null}
        {counts.attachments === null ? (
          <li>{DISCARD_ATTACHMENTS_UNKNOWN}</li>
        ) : counts.attachments > 0 ? (
          <li>{attachmentsLine(counts.attachments)}</li>
        ) : null}
        <li>{DISCARD_NOTES_LINE}</li>
      </ul>
    </Dialog>
  );
}

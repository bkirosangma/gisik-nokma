import type { ReactElement } from 'react';
import { Toast } from '@gisik-nokma/ui';
import { DRAFT_SAVED_OPEN, DRAFT_SAVED_TOAST } from './drafts-copy.js';

/**
 * "Draft saved" with an Open action (drafts plan, Task 8, decision 10): `Toast`'s one action slot, labelled Open.
 * There is no Undo for a saved draft (Discard is the way back), so no `undo` meaning is lost.
 */
export function DraftSavedToast(props: { ticketId: string; onOpen: (ticketId: string) => void; onDismiss: () => void }): ReactElement {
  return (
    <Toast
      open
      message={DRAFT_SAVED_TOAST}
      undo={{
        label: DRAFT_SAVED_OPEN,
        onUndo: () => {
          props.onOpen(props.ticketId);
          props.onDismiss();
        },
      }}
      onDismiss={props.onDismiss}
    />
  );
}

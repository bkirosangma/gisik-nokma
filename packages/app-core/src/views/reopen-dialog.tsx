import { useState } from 'react';
import { Button, Dialog } from '@gisik-nokma/ui';

/** Which authority produced the refusal being shown. They are never the same thing. */
export type RefusalOrigin = 'instant' | 'server';

export type ReopenDialogProps = {
  open: boolean;
  parentTitle: string;
  parentStateName: string;
  /** The refusal that opened this offer, rendered VERBATIM under its own origin. */
  refusal: { rule: string; reason: string };
  refusalOrigin: RefusalOrigin;
  reopenStates: Array<{ id: string; name: string }>;
  /**
   * The parent workflow's OWN refusal of the reopen, once attempted. Always the
   * server's — this client never pre-clears a reopen — and rendered verbatim.
   */
  parentRefusal: { rule: string; reason: string } | null;
  onAccept: (toStateId: string) => void;
  onCancel: () => void;
};

/**
 * The owner decision, as UI: "<Parent> is <terminal state>. Reopen it to
 * [non-terminal state] and proceed?" — offered at the moment the refusal
 * happens, and never silently applied. Cancelling submits nothing.
 *
 * ## The refusal wears its origin
 *
 * Two different things can open this dialog and they carry different weight.
 * The instant pre-check (`../precheck.ts`) is THIS CLIENT guessing with the
 * shared engine over cached state, and on the `ticket.created` /
 * `ticket.reparented` path it can only ever refuse or decline to answer — it
 * has no `passed` to give. The server's refusal is the fact. Rendering both
 * under one neutral sentence would present a local guess as though the
 * authority had spoken, which spec §5's honesty contract forbids as squarely as
 * the reverse would be. So the origin is a required prop, the two spellings are
 * the ones Task 12's `TransitionDialog` already uses — `instant check — ` and
 * `Refused by the server — ` — and they differ in class as well as in words.
 *
 * ## Why the state list is a list and not a decision
 *
 * `reopenStateOptions` filters STRUCTURALLY only. A target whose edge carries
 * `restrict-to` stays on the list, is attempted, and is refused by the server
 * in the server's words below. The owner decision is explicit that the parent
 * workflow's own rules still apply to the reopen; a client that greyed out the
 * moves it guessed would fail would be answering on the server's behalf, and a
 * client that skipped them would be the escalation the decision forbids.
 */
export function ReopenDialog({
  open,
  parentTitle,
  parentStateName,
  refusal,
  refusalOrigin,
  reopenStates,
  parentRefusal,
  onAccept,
  onCancel,
}: ReopenDialogProps) {
  const [toStateId, setToStateId] = useState(reopenStates[0]?.id ?? '');
  return (
    <Dialog open={open} title="Reopen parent?" onClose={onCancel}>
      <p className="gn-reopen__summary">
        {parentTitle} is {parentStateName}.
      </p>
      <p
        className={
          refusalOrigin === 'server' ? 'gn-refusal gn-refusal--server' : 'gn-refusal gn-refusal--preview'
        }
      >
        {refusalOrigin === 'server' ? 'Refused by the server — ' : 'instant check — '}
        {refusal.rule}: {refusal.reason}
      </p>
      {reopenStates.length === 0 ? (
        // Not a disabled button with no explanation: the workflow declares no
        // non-terminal move out of this state, so there is nothing to offer and
        // that is said out loud rather than shown as an empty picker.
        <p className="gn-reopen__gap">
          {parentStateName} has no declared move to a state that is not itself final, so this
          workflow offers no reopen.
        </p>
      ) : (
        <label className="gn-reopen__picker">
          Reopen to
          <select value={toStateId} onChange={(event) => setToStateId(event.target.value)}>
            {reopenStates.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {parentRefusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          Refused by the server — {parentRefusal.rule}: {parentRefusal.reason}
        </p>
      ) : null}
      <div className="gn-reopen__actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={toStateId === ''} onClick={() => onAccept(toStateId)}>
          Reopen and proceed
        </Button>
      </div>
    </Dialog>
  );
}

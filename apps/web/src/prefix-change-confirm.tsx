'use client';

import { useId, useRef } from 'react';
import { Button, Dialog } from '@gisik-nokma/ui';

/**
 * The question asked before a prefix is changed (prefixes and groups plan Task 10, case 22.180): a
 * prefix is half of every ticket key, so changing it re-keys the tickets. `from` and `to` are the
 * WHOLE key prefixes the person will see (`CCSO` → `CCSH` for a project; `CC` → `CX` for the workspace),
 * composed by the caller, so this reads the same for both.
 *
 * The old keys keep working (the former prefixes stay reserved and resolvable, spec R1/R2), and the
 * dialog says so, because "renumbered" alone reads as "your links break".
 *
 * **Focus lands on Keep**, the safe answer, as the other confirms do (`initialFocusRef`): a person who
 * hits Enter on arrival changes nothing. Escape and the scrim are Keep.
 */
export function PrefixChangeConfirm({
  from,
  to,
  onConfirm,
  onCancel,
}: {
  from: string;
  to: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  return (
    <Dialog open title="Change prefix" onClose={onCancel} initialFocusRef={keepRef} describedBy={bodyId}>
      <p id={bodyId} className="gn-prefix-confirm__body">
        {`Tickets will be renumbered ${to}-… Old ${from}- keys still work.`}
      </p>
      <div className="gn-prefix-confirm__actions">
        <Button variant="primary" type="button" onClick={onConfirm}>
          Change prefix
        </Button>
        <Button ref={keepRef} type="button" onClick={onCancel}>
          {`Keep ${from}`}
        </Button>
      </div>
    </Dialog>
  );
}

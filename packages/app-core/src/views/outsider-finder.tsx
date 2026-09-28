import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@gisik-nokma/ui';
import {
  OUTSIDER_ASSIGN,
  OUTSIDER_CANCEL,
  OUTSIDER_EMAIL_LABEL,
  OUTSIDER_FIND,
  OUTSIDER_JOINS_AS_GUEST,
  OUTSIDER_NOT_FOUND,
  alreadyInWorkspaceLine,
  foundLine,
  lookupFailedLine,
} from '../people/copy.js';
import type { LookedUpPerson, LookupPerson } from '../people/types.js';

type FinderState =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'found'; person: LookedUpPerson }
  | { kind: 'none' }
  | { kind: 'failed'; why: string };

/**
 * Find ONE account by its exact email and hand it back (owner ruling
 * 2026-09-29: "have them type up their email, and only show if a user matching
 * that email is found"). Nothing is listed; nothing is suggested while typing.
 *
 * A status for "found"/"not found" (the answer to what the person just asked),
 * an alert only for a failed lookup (the product could not answer). Focus moves
 * to Assign when someone is found, so Enter-Enter assigns; it stays in the field
 * when nobody is, so the person can correct the address.
 *
 * NOT a `<form>`: this renders inside the New ticket dialog and the ticket
 * sheet, whose own controls must not be submitted by Enter here.
 */
export function OutsiderFinder({
  lookup,
  onPick,
  onCancel,
}: {
  lookup: LookupPerson;
  onPick: (person: LookedUpPerson) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FinderState>({ kind: 'idle' });
  const assignRef = useRef<HTMLButtonElement | null>(null);
  // Which lookup is current. An answer that arrives after the address changed (or
  // after a newer Find) belongs to a question nobody is asking any more — showing
  // it would put Assign on someone the person did not just look up.
  const askedRef = useRef(0);

  useEffect(() => {
    if (state.kind === 'found') assignRef.current?.focus();
  }, [state]);

  const find = async (): Promise<void> => {
    const wanted = email.trim();
    if (wanted === '') return;
    const asked = ++askedRef.current;
    setState({ kind: 'looking' });
    try {
      const person = await lookup(wanted);
      if (asked !== askedRef.current) return;
      setState(person === null ? { kind: 'none' } : { kind: 'found', person });
    } catch (cause) {
      if (asked !== askedRef.current) return;
      setState({ kind: 'failed', why: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  return (
    <div className="gn-outsider-finder">
      <label className="gn-field" htmlFor={inputId}>
        <span className="gn-field__label">{OUTSIDER_EMAIL_LABEL}</span>
        <input
          id={inputId}
          type="email"
          className="gn-field__input"
          value={email}
          onChange={(event) => {
            askedRef.current += 1;
            setEmail(event.target.value);
            setState({ kind: 'idle' });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void find();
            }
          }}
        />
      </label>
      <div className="gn-outsider-finder__actions">
        <Button type="button" onClick={() => void find()} disabled={state.kind === 'looking'}>
          {OUTSIDER_FIND}
        </Button>
        <Button type="button" onClick={onCancel}>
          {OUTSIDER_CANCEL}
        </Button>
      </div>
      {state.kind === 'none' ? <p role="status">{OUTSIDER_NOT_FOUND}</p> : null}
      {state.kind === 'failed' ? (
        <p role="alert" className="gn-refusal gn-refusal--transport">
          {lookupFailedLine(state.why)}
        </p>
      ) : null}
      {state.kind === 'found' ? (
        <div role="status" className="gn-outsider-finder__found">
          <p>{foundLine(state.person)}</p>
          <p>{state.person.inWorkspace ? alreadyInWorkspaceLine(state.person.name) : OUTSIDER_JOINS_AS_GUEST}</p>
          <Button ref={assignRef} type="button" variant="primary" onClick={() => onPick(state.person)}>
            {OUTSIDER_ASSIGN}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

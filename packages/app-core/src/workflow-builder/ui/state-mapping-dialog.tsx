import { useState } from 'react';

/**
 * The pinned count copy, and the only place it is spelled. Four shapes, and
 * the two that are NOT a number matter most: `counting tickets…` while the
 * read is in flight, `ticket count unavailable` when it failed. Neither
 * substitutes a zero, because a zero here would read as "nothing is standing
 * in this state" — a claim nobody made.
 */
function countLine(count: number | undefined, failed: boolean, loading: boolean): string {
  if (failed) return 'ticket count unavailable';
  if (loading) return 'counting tickets…';
  const n = count ?? 0;
  return n === 1 ? '1 ticket sits here today' : `${n} tickets sit here today`;
}

/**
 * The server's stranded-state refusal, surfaced before it fires: every dropped
 * state must be sent somewhere real.
 *
 * THE COUNT IS A COURTESY, THE MAPPING IS THE CONTRACT — and the asymmetry is
 * load-bearing, not stylistic. A version N+1 that drops states version N has is
 * refused unless stateMapping covers EVERY dropped state, whether or not a
 * ticket sits in it (owner, 2026-08-26; permanent semantics, not a stopgap).
 * The reason occupancy can never become an input to that rule: the rule engine
 * runs identically on client and server, and client replicas are
 * visibility-scoped, so a user who cannot see three tickets in a dropped state
 * computes occupancy 0 while the server computes 3 — making publish legality
 * depend on the count would make the two engines disagree by construction.
 *
 * So `complete` below is keyed off `props.dropped` alone and never reads
 * `props.occupancy`. `occupancy` reaches exactly one expression in this file,
 * `countLine`, which produces a string and nothing else.
 */
export function StateMappingDialog(props: {
  dropped: { id: string; name: string }[];
  occupancy: Record<string, number> | null;
  occupancyFailed: boolean;
  targetStates: { id: string; name: string }[];
  fromVersion: number;
  toVersion: number;
  onCancel(): void;
  onConfirm(mapping: Record<string, string>): void;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const complete = props.dropped.every((state) => mapping[state.id] !== undefined);
  const loading = props.occupancy === null && !props.occupancyFailed;
  return (
    <div className="state-mapping-dialog" role="dialog" aria-label="Every dropped state needs a destination">
      <h3 className="state-mapping-dialog__title">Every dropped state needs a destination</h3>
      <p className="state-mapping-dialog__body">
        {`Version ${props.toVersion} removes states that version ${props.fromVersion} has. Publishing cannot see which tickets sit in which state, so every removed state needs a destination — occupied or not.`}
      </p>
      <ul className="state-mapping-dialog__rows">
        {props.dropped.map((state) => (
          <li className="state-mapping-dialog__row" data-testid={`mapping-row-${state.id}`} key={state.id}>
            <span className="state-mapping-dialog__state-name">{state.name}</span>
            <span className="state-mapping-dialog__count">
              {countLine(props.occupancy?.[state.id], props.occupancyFailed, loading)}
            </span>
            <label className="state-mapping-dialog__target">
              <span>Send them to</span>
              <select
                aria-label={`Send them to — ${state.name}`}
                value={mapping[state.id] ?? ''}
                onChange={(changeEvent) =>
                  setMapping((current) => ({ ...current, [state.id]: changeEvent.target.value }))
                }
              >
                <option value="" disabled hidden></option>
                {props.targetStates.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <div className="state-mapping-dialog__actions">
        <button type="button" className="state-mapping-dialog__cancel" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="state-mapping-dialog__confirm"
          disabled={!complete}
          onClick={() => props.onConfirm(mapping)}
        >
          Publish with this mapping
        </button>
      </div>
    </div>
  );
}

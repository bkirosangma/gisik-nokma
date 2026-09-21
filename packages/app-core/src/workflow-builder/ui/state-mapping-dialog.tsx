import { useState } from 'react';
import { Select } from '@gisik-nokma/ui';

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
  /**
   * E5-28 — what the person had already chosen, when this dialog is being
   * re-entered rather than opened.
   *
   * The dialog used to own its mapping outright, and `PublishControls` set
   * `submitting` before awaiting the server — which unmounted it. So a REFUSAL
   * returned the person to an idle Publish button with the mapping gone, and
   * pressing Publish again reopened an EMPTY dialog. The owner of the mapping
   * is now the caller, and this is how it hands it back.
   *
   * It is the INITIAL value and not a controlled one, deliberately: the dialog
   * still owns what is typed into it from this point on, or every keystroke
   * would need a round trip through the parent to appear.
   */
  initialMapping?: Record<string, string>;
  onCancel(): void;
  onConfirm(mapping: Record<string, string>): void;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>(props.initialMapping ?? {});
  const complete = props.dropped.every((state) => mapping[state.id] !== undefined);
  const loading = props.occupancy === null && !props.occupancyFailed;
  return (
    <div className="state-mapping-dialog" role="dialog" aria-label="Every dropped state needs a destination">
      <h3 className="state-mapping-dialog__title">Every dropped state needs a destination</h3>
      <p className="state-mapping-dialog__body">
        {`Version ${props.toVersion} removes states that version ${props.fromVersion} has. The counts below are for your information only — the rule needs a destination for every removed state, occupied or not.`}
      </p>
      <ul className="state-mapping-dialog__rows">
        {props.dropped.map((state) => (
          <li className="state-mapping-dialog__row" data-testid={`mapping-row-${state.id}`} key={state.id}>
            <span className="state-mapping-dialog__state-name">{state.name}</span>
            <span className="state-mapping-dialog__count">
              {countLine(props.occupancy?.[state.id], props.occupancyFailed, loading)}
            </span>
            <div className="state-mapping-dialog__target">
              <span>Send them to</span>
              <Select
                options={props.targetStates.map((target) => ({ value: target.id, label: target.name }))}
                value={mapping[state.id] ?? null}
                onChange={(next) => setMapping((current) => ({ ...current, [state.id]: next }))}
                aria-label={`Send them to — ${state.name}`}
              />
            </div>
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

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
   * It is the INITIAL value and not a controlled one: the dialog keeps its own
   * working copy from this point on, and reports each pick through
   * `onMappingChange`, so the caller's copy is always current and a REMOUNT
   * (G-9 T5 FIX 1: the full-screen toggle moves `PublishControls` between the
   * toolbar and the title row) starts again from every pick made so far.
   */
  initialMapping?: Record<string, string>;
  /** Every pick, as the whole mapping after it (G-9 T5 FIX 1): what the caller seeds `initialMapping` from on a remount. */
  onMappingChange?(mapping: Record<string, string>): void;
  onCancel(): void;
  onConfirm(mapping: Record<string, string>): void;
  /**
   * True while the publish this mapping belongs to is on the wire (E2-22). The
   * dialog is NOT unmounted for it — the caller keeps it mounted for the whole
   * attempt precisely because `mapping` lives HERE, and a remount would discard
   * the map the admin just authored. This only states the state on the controls.
   */
  submitting?: boolean;
  /**
   * The attempt's verdict when it did not commit, rendered INSIDE this dialog
   * rather than in the controls' banner: the mapping is still here, is still the
   * admin's, and is the thing they will retry with, so the answer belongs on it.
   * `null` while nothing has been answered (including the in-flight window).
   */
  outcome?: { kind: 'refused' | 'invalid'; title: string; rule?: string; detail: string } | null;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>(props.initialMapping ?? {});
  const complete = props.dropped.every((state) => mapping[state.id] !== undefined);
  const loading = props.occupancy === null && !props.occupancyFailed;
  return (
    <div className="state-mapping-dialog" role="dialog" aria-label="Every dropped state needs a destination">
      <h3 className="state-mapping-dialog__title">Every dropped state needs a destination</h3>
      <p className="state-mapping-dialog__body">
        {`Version ${props.toVersion} removes states that version ${props.fromVersion} has. The counts below are for your information only. The rule needs a destination for every removed state, occupied or not.`}
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
                onChange={(next) => {
                  const picked = { ...mapping, [state.id]: next };
                  setMapping(picked);
                  props.onMappingChange?.(picked);
                }}
                aria-label={`Send tickets from ${state.name} to`}
              />
            </div>
          </li>
        ))}
      </ul>
      {/* The attempt's own verdict, in the surface that holds the mapping — the
          same two facts the controls' banner carries when this dialog is not the
          one the attempt was made on. `role="alert"` because it answers a press
          the person just made. */}
      {props.outcome !== undefined && props.outcome !== null ? (
        <div
          className={`publish-controls__banner publish-controls__banner--${props.outcome.kind}`}
          role="alert"
        >
          <p className="publish-controls__banner-title">{props.outcome.title}</p>
          <p className="publish-controls__banner-reason">{props.outcome.detail}</p>
          {props.outcome.rule === undefined ? null : (
            <p className="publish-controls__banner-rule">{`rule: ${props.outcome.rule}`}</p>
          )}
        </div>
      ) : null}
      <div className="state-mapping-dialog__actions">
        {/* Both controls rest while the request is in flight. Publish, because a
            second press would submit a second publish for the same mapping;
            Cancel, because the outcome of a claim already sent cannot be
            un-asked and would land on a screen that had moved on. The guard
            LIFTS the moment a verdict arrives — that is what makes the retry
            free, and it is the whole reason this dialog is not unmounted. */}
        <button
          type="button"
          className="state-mapping-dialog__cancel"
          disabled={props.submitting === true}
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="state-mapping-dialog__confirm"
          disabled={!complete || props.submitting === true}
          onClick={() => props.onConfirm(mapping)}
        >
          {props.submitting === true ? 'Publishing…' : 'Publish with this mapping'}
        </button>
      </div>
    </div>
  );
}

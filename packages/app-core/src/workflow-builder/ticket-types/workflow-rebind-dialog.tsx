import { useState } from 'react';
import { Select } from '@gisik-nokma/ui';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';

/**
 * The bulk affordance for the owner's versioned-bindings decision: one map from
 * the outgoing workflow's states to the incoming one's, which the server
 * expands into one `ticket.workflow_rebound` per ticket (Plan 3 owns that
 * event, its payload and its refusals). Every outgoing state needs a
 * destination — an unmapped state would leave its tickets nowhere to land.
 *
 * A SEPARATE COMPONENT FROM StateMappingDialog ON PURPOSE, and the reason is
 * the payload rather than the pixels. That dialog authors a `stateMapping`
 * keyed INSIDE one workflow's version chain, which is stored on the published
 * def and re-read by every later fold. This one authors a one-shot map BETWEEN
 * TWO UNRELATED WORKFLOWS, which is stored nowhere and rides its own request.
 * Sharing the component would eventually mean sharing the payload, and that is
 * the mistake design decision 10 names.
 *
 * COLOUR ROUTE, corrected against the shipped repo — the same correction Tasks
 * 5, 8 and 9 already recorded. The plan's Task 11 snippet imports `tokens` from
 * `@gisik-nokma/ui` and reads `tokens.workflowBuilder.surface` /
 * `.textPrimary` / `.panelBorder` into inline styles. No such export exists:
 * packages/ui/src/tokens.ts exports `primitives`, `themes`, `colorOf`,
 * `cssVariableName` and `themeStylesheet`, and TOKEN_ROLES carries no
 * workflow-builder roles. So this file follows its sibling exactly — BEM
 * classes here, colours as `var(--gn-*)` in packages/ui/src/ui.css, and no new
 * roles.
 */
export function WorkflowRebindDialog(props: {
  fromWorkflow: PublishedWorkflowDef;
  toWorkflow: PublishedWorkflowDef;
  onCancel(): void;
  onConfirm(stateMap: Record<string, string>): void;
  /**
   * True while the migration request is in flight. The dialog is NOT unmounted
   * for it — the calling screen keeps it mounted through `'migrating'` on
   * purpose, because `stateMap` lives HERE: a remount would reset it to `{}`
   * and a rejected request would cost the admin the mapping they just
   * authored. This flag only states the state on the controls.
   */
  submitting?: boolean;
  /**
   * A TRANSPORT failure's sentence, rendered here rather than in the screen's
   * shared refusal slot — the answer belongs on the surface the admin is
   * looking at, and this dialog is the surface. Never a refusal: nothing was
   * adjudicated.
   */
  error?: string | null;
}) {
  const [stateMap, setStateMap] = useState<Record<string, string>>({});
  const complete = props.fromWorkflow.states.every((state) => stateMap[state.id] !== undefined);
  const heading = `Move existing tickets to "${props.toWorkflow.name}"`;
  return (
    <div className="workflow-rebind-dialog" role="dialog" aria-label={heading}>
      <h3 className="workflow-rebind-dialog__title">{heading}</h3>
      <p className="workflow-rebind-dialog__body">
        {`These two workflows share no history, so nothing carries across on its own: every state of "${props.fromWorkflow.name}" needs a destination in "${props.toWorkflow.name}". Each ticket gets its own recorded move.`}
      </p>
      <ul className="workflow-rebind-dialog__rows">
        {props.fromWorkflow.states.map((state) => (
          <li className="workflow-rebind-dialog__row" data-testid={`rebind-row-${state.id}`} key={state.id}>
            <span className="workflow-rebind-dialog__state-name">{state.name}</span>
            <div className="workflow-rebind-dialog__target">
              <span>Send them to</span>
              <Select
                options={props.toWorkflow.states.map((target) => ({ value: target.id, label: target.name }))}
                value={stateMap[state.id] ?? null}
                onChange={(next) => setStateMap((current) => ({ ...current, [state.id]: next }))}
                aria-label={`Send them to — ${state.name}`}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="workflow-rebind-dialog__footer">
        Leaving them is a real choice — a type can have tickets on two workflows, and the board shows each ticket under
        its own workflow&apos;s states.
      </p>
      {/* The transport's own channel, and NOT the screen's server-refusal slot:
          `.gn-refusal--transport` is the warning-leaning recipe the board uses
          for "we could not reach the server", where `--server` says the server
          adjudicated and declined. Nothing was adjudicated here — the rows above
          are still the admin's to retry. */}
      {props.error !== undefined && props.error !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--transport workflow-rebind-dialog__error">
          {props.error}
        </p>
      ) : null}
      <div className="workflow-rebind-dialog__actions">
        {/* Both controls rest while the request is in flight. Confirm, because a
            second press would submit the same map against a migration already
            running; cancel, because the outcome of a request already sent
            cannot be un-asked and would land on a screen that had moved on. */}
        <button
          type="button"
          className="workflow-rebind-dialog__cancel"
          disabled={props.submitting === true}
          onClick={props.onCancel}
        >
          Leave them where they are
        </button>
        <button
          type="button"
          className="workflow-rebind-dialog__confirm"
          disabled={!complete || props.submitting === true}
          onClick={() => props.onConfirm(stateMap)}
        >
          {props.submitting === true ? 'Moving…' : 'Move these tickets'}
        </button>
      </div>
    </div>
  );
}

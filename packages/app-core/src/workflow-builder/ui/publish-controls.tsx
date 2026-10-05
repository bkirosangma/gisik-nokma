import { useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import { Button } from '@gisik-nokma/ui';
import { selectIssues } from '../draft-store.js';
import { buildPublishPayload, buildWorkflowDefinedEvent, droppedStates } from '../events.js';
import { useBuilderEnv, useDraft } from './builder-context.js';
import { StateMappingDialog } from './state-mapping-dialog.js';

export type PublishPhase =
  | { phase: 'idle' }
  /**
   * E5-28 — the dialog's phase carries the authority's answer too:
   *
   * - `refusal` — the authority's answer, when this phase was re-entered FROM
   *   one. `null` on the ordinary open.
   *
   * What the person has chosen so far is NOT here any more: it is the flow's
   * `picks` (see `PublishFlow`), beside the phase rather than inside one arm of
   * it. E5-28 put it in this arm so a REFUSAL could hand it back (the dialog
   * used to hold its own `useState` and was unmounted the instant `submitting`
   * was set, so a refusal cost the person their mapping); held beside the
   * phase it survives every arm the dialog is open in, `submitting` and
   * `invalid` included, which is what the full-screen toggle needs (G-9 T5
   * FIX 1).
   *
   * `occupancy`/`occupancyFailed` are carried back unchanged, never refetched
   * and never reset to `null`: `null` with `occupancyFailed: false` is the
   * "counting tickets…" state, so clearing them would tell the person the count
   * was being read again when nobody re-read it.
   */
  | {
      phase: 'mapping';
      occupancy: Record<string, number> | null;
      occupancyFailed: boolean;
      refusal: { rule: string; reason: string } | null;
    }
  | { phase: 'submitting' }
  | { phase: 'published'; version: number }
  | { phase: 'refused'; rule: string; reason: string }
  | { phase: 'invalid'; message: string }
  /**
   * E5-28 — a dropped connection, or a door that answered nothing at all.
   * Ruling 27/33's split, applied here for the first time: a transport failure
   * is NOT an adjudication, so it gets its own phase, its own sentence and its
   * own banner tone, never the `refused` banner's words. This is the arm whose
   * absence left Publish disabled for ever with nothing on screen.
   */
  | { phase: 'transport'; message: string }
  /**
   * E5-28 — the door ANSWERED, with a status this client's vocabulary does not
   * name. Its own phase rather than a silent fall-through: before this, a
   * status outside the `switch` returned without setting any phase at all,
   * which left `submitting` in place and Publish disabled for ever — the same
   * stuck control as a dropped connection, reached by a completely different
   * route. It is not a transport failure (the server did answer) and not a
   * refusal (nobody refused), so it says exactly that and nothing more.
   */
  | { phase: 'unknown'; status: string };

/**
 * One publish attempt's state: its phase, and the destinations picked in the mapping dialog so far.
 *
 * G-9 T5 FIX 1 (planner ruling 2026-10-05 09:42): full screen shows `PublishControls` in its floating toolbar and the normal layout
 * in its title row, so switching between them REMOUNTS it, and an attempt held in its own `useState` died with the switch: the open
 * mapping, the author's picks, the phase and the refusal or outcome on it. `WorkflowBuilderScreen` therefore calls
 * `usePublishFlow()` ABOVE the toggle and hands the same flow to both mounts. Mounted on its own (the tests), the control holds one
 * itself. `picks` is reset when a new attempt opens the dialog, never by a remount.
 */
export type PublishFlow = {
  state: PublishPhase;
  setState: Dispatch<SetStateAction<PublishPhase>>;
  picks: Record<string, string>;
  setPicks: Dispatch<SetStateAction<Record<string, string>>>;
};

export function usePublishFlow(): PublishFlow {
  const [state, setState] = useState<PublishPhase>({ phase: 'idle' });
  const [picks, setPicks] = useState<Record<string, string>>({});
  return { state, setState, picks, setPicks };
}

/**
 * Publish: the version bump from the PUBLISHED base, the mapping dialog when
 * this version drops states the base had, and every server result rendered as
 * it arrived.
 *
 * GATING IS `selectIssues(draft).length === 0` AND NOTHING ELSE — this file
 * does not import `adviseWorkflowDef`, does not call it, and has no branch that
 * consults an advisory (design decision 9, owner 2026-08-26). Task 8 proved the
 * panel half of that guarantee (an advisory renders); the half proved HERE is
 * the one that makes it a guarantee rather than a convention: publish.test.tsx's
 * `an advisory does not gate publish` mounts IssuesPanel beside these controls
 * on a draft that trips two advisory codes and no issue, and asserts the button
 * is enabled, carries no disabled title, and that the click COMMITS. Fold
 * advisories into the disabled predicate and that test goes red; nothing else in
 * app-core does.
 *
 * THE VERSION BUMP READS `draft.base`, NOT `draft.def.version`. A draft loaded
 * from published version 2 carries `def.version === 2`; the next published
 * version is `base.version + 1`, which `buildPublishPayload` computes. A fresh
 * draft has `base === null` and publishes as version 1.
 *
 * REFUSALS ARE NEVER REPHRASED. The banner renders `result.reason` and
 * `result.rule` verbatim — no lookup table, no client-side spelling of any
 * server rule name. This client meets rule names it has never heard of (the
 * server's REFUSAL_RULES is not this package's to enumerate), and a paraphrase
 * would be this product's own named failure: the board knowing something the
 * user does not.
 *
 * COLOUR ROUTE, corrected against the shipped repo — the same correction Task 8
 * recorded for the issues panel. The plan's Task 9 snippets import `tokens` from
 * `@gisik-nokma/ui` and read `tokens.workflowBuilder.surface` / `.textPrimary` /
 * `.panelBorder` / `.issueAccent` into inline styles. NO SUCH EXPORT EXISTS:
 * packages/ui/src/tokens.ts exports `primitives`, `themes`, `colorOf`,
 * `cssVariableName` and `themeStylesheet`, and TOKEN_ROLES carries no
 * workflow-builder roles. Colours live in packages/ui/src/ui.css as
 * `var(--gn-*)` against the BEM classes below; packages/ui/src is scanned by
 * token-discipline.test.ts, `.css` included, so a literal in either place fails
 * the build rather than shipping.
 */
export function PublishControls(props: { onPublished?: (payload: PublishedWorkflowDef) => void; flow?: PublishFlow }) {
  const env = useBuilderEnv();
  const draft = useDraft();
  const own = usePublishFlow();
  const { state, setState, picks, setPicks } = props.flow ?? own;
  /** The id the disabled Publish button is described by — see its note below. */
  const publishReasonId = useId();
  const publishRef = useRef<HTMLButtonElement>(null);
  if (!env.canAuthor) return null;

  const issues = selectIssues(draft);
  const dropped = droppedStates(draft);

  async function submitPayload(stateMapping?: Record<string, string>): Promise<void> {
    // Captured BEFORE the `submitting` set: the `mapping` arm (its occupancy
    // and count state) is what a refusal must hand back. Read off the render
    // closure, which is correct here — this function is called from the
    // `mapping` phase's own onConfirm (or from `idle`, when nothing was
    // dropped, in which case there is nothing to hand back and `priorMapping`
    // is null). The picks need no capture: they are the flow's, untouched by
    // the phase.
    const priorMapping = state.phase === 'mapping' ? state : null;
    setState({ phase: 'submitting' });
    const payload = buildPublishPayload(draft, stateMapping);
    const event = buildWorkflowDefinedEvent({
      workspaceId: env.workspaceId,
      actorId: env.session.userId,
      origin: 'web',
      payload,
    });
    try {
      const [result] = await env.gateway.submit([event]);
      if (result === undefined) {
        // A SILENCE, not a refusal — the same distinction `ticket-sheet.tsx`'s
        // `submitTicketEvent` draws for `results[0] === undefined`, and it goes
        // to the same transport slot with its own sentence.
        setState({ phase: 'transport', message: 'The server did not answer this publish.' });
        return;
      }
      if (result.status === 'committed') {
        setState({ phase: 'published', version: payload.version });
        props.onPublished?.(payload);
        return;
      }
      if (result.status === 'refused') {
        // E5-28 — a refusal KEEPS the mapping (the flow's `picks`, never
        // cleared here) and reopens the dialog on it, with the authority's
        // words above it. `result.rule`/`result.reason`
        // are carried VERBATIM, the same discipline the `refused` banner
        // already keeps: this client meets rule names it has never heard of,
        // and a paraphrase would be the board knowing something the user does
        // not.
        if (priorMapping !== null && stateMapping !== undefined) {
          setState({ ...priorMapping, refusal: { rule: result.rule, reason: result.reason } });
          return;
        }
        setState({ phase: 'refused', rule: result.rule, reason: result.reason });
        return;
      }
      if (result.status === 'invalid') {
        setState({ phase: 'invalid', message: result.message });
        return;
      }
      // No `default` used to exist and no path set a phase, so an unnamed
      // status left `submitting` in place for ever — see the `unknown` phase's
      // own docblock. Naming it is the point: the door answered, and this
      // client will not pretend it understood what it said.
      setState({ phase: 'unknown', status: String((result as { status: unknown }).status) });
    } catch (cause) {
      // Ruling 27/33 — a dropped connection is not an adjudication, and the
      // sentence says whose failure it was. Same words the sheet uses for the
      // same fact, for the same reason.
      const message = cause instanceof Error ? cause.message : String(cause);
      setState({ phase: 'transport', message: `We could not reach the server for this publish: ${message}` });
    }
  }

  async function onPublishClick(): Promise<void> {
    if (dropped.length === 0) {
      await submitPayload();
      return;
    }
    setPicks({});
    setState({ phase: 'mapping', occupancy: null, occupancyFailed: false, refusal: null });
    try {
      const occupancy = await env.gateway.getStateOccupancy(env.workspaceId, draft.def.id);
      setState((current) => (current.phase === 'mapping' ? { ...current, occupancy } : current));
    } catch {
      // The count is a courtesy; the mapping is the contract. The dialog says
      // the count is unavailable and still demands a destination for every
      // dropped state — the guard is never relaxed because the read failed.
      setState((current) => (current.phase === 'mapping' ? { ...current, occupancyFailed: true } : current));
    }
  }

  /**
   * ⚠ THE DIALOG IS THE SURFACE THIS ATTEMPT IS BEING MADE ON, AND IT STAYS UP
   * UNTIL THERE IS A VERDICT (E2-22, 2026-09-21).
   *
   * It used to render only while `state.phase === 'mapping'`, and `submitPayload`
   * opens with `setState({ phase: 'submitting' })` — so PRESSING the dialog's own
   * confirm unmounted it, in the instant before the request had even been sent.
   * `StateMappingDialog` held the authored mapping in its own `useState`, so a
   * REFUSED publish cost the admin every row they had just filled in, and the
   * refusal banner rendered where the dialog had been. Restoring `'mapping'` on a
   * refusal is not enough (the remount would still have lost the map): the fix is
   * to mount it for the WHOLE attempt and dismiss it only on `committed`, which
   * is what `mappingDialogOpen` below says.
   *
   * G-9 T5 FIX 1: the dialog's own copy is now seeded from, and reports every
   * pick to, the flow's `picks`, so a remount (the full-screen toggle) keeps
   * the map too. Within one layout it still stays mounted for the attempt.
   *
   * `dropped.length > 0` is the discriminator and it is DERIVED, not a second
   * state value: `onPublishClick` only ever enters `'mapping'` when there are
   * dropped states, so a drop-free publish can be `'submitting'` or `'refused'`
   * without ever having had a mapping to lose — and for those the banners below
   * stay where they are.
   */
  const mappingDialogOpen =
    dropped.length > 0 &&
    (state.phase === 'mapping' ||
      state.phase === 'submitting' ||
      state.phase === 'refused' ||
      state.phase === 'invalid');

  /**
   * Cancel, from its button or from Escape: back to idle, and focus back on Publish, so focus that was inside the dialog does not
   * fall to the body with it.
   */
  const cancelMapping = () => {
    publishRef.current?.focus();
    setState({ phase: 'idle' });
  };

  return (
    /*
      G-9 T5 FIX 1 (F1). Escape with the mapping open is the dialog's Cancel, at every width. The dialog is an inline
      `role="dialog"`, not the shared `Dialog` (whose document listener closes it and prevents the key), so in full screen the
      window Escape ladder heard the key first and exited full screen. This handler is on the controls, not on the dialog,
      because focus stays on Publish after the click that opened it; React runs it before the ladder's window listener, and
      `preventDefault()` is what the ladder obeys. While the publish is on the wire Cancel rests, so the key is not taken: the
      ladder may exit full screen, and the attempt survives that (the flow is held above the toggle). An open Select inside the
      dialog stops its own Escape (react-aria), so one press closes the list and leaves the mapping.
    */
    <div
      className="publish-controls"
      onKeyDown={(keyEvent) => {
        if (keyEvent.key !== 'Escape' || !mappingDialogOpen || state.phase === 'submitting') return;
        keyEvent.preventDefault();
        cancelMapping();
      }}
    >
      {/* E4-27 — the shared `Button`, not a page-local control. The class
          stays for `align-self: flex-start` (the one thing the shared
          component does not supply); the paint is `gn-button--primary`'s. */}
      <Button
        ref={publishRef}
        variant="primary"
        className="publish-controls__publish"
        disabled={issues.length > 0 || state.phase === 'submitting'}
        title={issues.length > 0 ? 'Fix the issues below first.' : undefined}
        /*
          THE REASON, REACHABLE. A `disabled` button is out of the focus order,
          so this `title` was spoken to nobody — the pointer to the issues below
          reached a mouse user who hovered. `aria-describedby` attaches the same
          words to the control wherever it is reached; the `title` stays for the
          hovering reader. Only rendered while there ARE issues, so an enabled
          Publish button carries no description at all.
        */
        aria-describedby={issues.length > 0 ? publishReasonId : undefined}
        onClick={() => void onPublishClick()}
      >
        Publish
      </Button>
      {issues.length > 0 && (
        <span
          id={publishReasonId}
          /* Visually hidden, inline — the recipe `route-announcer.tsx` carries. */
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            margin: -1,
            padding: 0,
            border: 0,
            overflow: 'hidden',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          Fix the issues below first.
        </span>
      )}
      {mappingDialogOpen ? (
        <StateMappingDialog
          dropped={dropped}
          occupancy={state.phase === 'mapping' ? state.occupancy : null}
          occupancyFailed={state.phase === 'mapping' ? state.occupancyFailed : false}
          targetStates={draft.def.states.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
          fromVersion={draft.base?.version ?? 0}
          toVersion={(draft.base?.version ?? 0) + 1}
          submitting={state.phase === 'submitting'}
          // The attempt's own outcome, rendered INSIDE the dialog — the same
          // facts the banners below carry when there is no dialog to carry them.
          outcome={
            // E5-28 hands a refused publish BACK to the mapping phase with its
            // `refusal` and the mapping the person authored, so the refusal the
            // dialog renders comes from that arm; `refused` remains the arm for a
            // publish that had no mapping to keep. One sentence either way.
            state.phase === 'mapping' && state.refusal !== null
              ? { kind: 'refused', title: 'The server refused this publish.', rule: state.refusal.rule, detail: state.refusal.reason }
              : state.phase === 'refused'
                ? { kind: 'refused', title: 'The server refused this publish.', rule: state.rule, detail: state.reason }
                : state.phase === 'invalid'
                ? {
                    kind: 'invalid',
                    title: 'The server could not read this claim.',
                    detail: state.message,
                  }
                : null
          }
          initialMapping={picks}
          onMappingChange={setPicks}
          onCancel={cancelMapping}
          onConfirm={(mapping) => void submitPayload(mapping)}
        />
      ) : null}
      {state.phase === 'published' ? (
        <p className="publish-controls__banner publish-controls__banner--success">
          {`Version ${state.version} published.`}
        </p>
      ) : null}
      {/* Both banners are gated on the dialog being CLOSED, so one outcome is one
          sentence in one place: when a mapping attempt is refused, the refusal is
          in the dialog the admin is still looking at. */}
      {state.phase === 'refused' && !mappingDialogOpen ? (
        <div className="publish-controls__banner publish-controls__banner--refused">
          <p className="publish-controls__banner-title">The server refused this publish.</p>
          <p className="publish-controls__banner-reason">{state.reason}</p>
          <p className="publish-controls__banner-rule">{`rule: ${state.rule}`}</p>
        </div>
      ) : null}
      {state.phase === 'invalid' && !mappingDialogOpen ? (
        <div className="publish-controls__banner publish-controls__banner--invalid">
          <p className="publish-controls__banner-title">The server could not read this claim.</p>
          <p className="publish-controls__banner-reason">{state.message}</p>
        </div>
      ) : null}
      {/*
        E5-28 — the dropped connection's own slot, Ruling 27's split. Its own
        banner class and its own words: this is not the server refusing, and it
        must never read as the server refusing.

        Publish is RE-ENABLED here by construction — the disabled predicate is
        `issues.length > 0 || phase === 'submitting'`, and this is not
        `submitting`. Before this arm existed the phase stayed `submitting` for
        ever, so the button was greyed with nothing on screen saying why.
      */}
      {state.phase === 'transport' ? (
        <div className="publish-controls__banner publish-controls__banner--transport" role="alert">
          <p className="publish-controls__banner-title">This publish did not reach the server.</p>
          <p className="publish-controls__banner-reason">{state.message}</p>
        </div>
      ) : null}
      {state.phase === 'unknown' ? (
        <div className="publish-controls__banner publish-controls__banner--unknown" role="alert">
          <p className="publish-controls__banner-title">
            The server answered this publish with a result this build does not recognise.
          </p>
          <p className="publish-controls__banner-reason">{`status: ${state.status}`}</p>
        </div>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import { selectIssues } from '../draft-store.js';
import { buildPublishPayload, buildWorkflowDefinedEvent, droppedStates } from '../events.js';
import { useBuilderEnv, useDraft } from './builder-context.js';
import { StateMappingDialog } from './state-mapping-dialog.js';

type PublishPhase =
  | { phase: 'idle' }
  | { phase: 'mapping'; occupancy: Record<string, number> | null; occupancyFailed: boolean }
  | { phase: 'submitting' }
  | { phase: 'published'; version: number }
  | { phase: 'refused'; rule: string; reason: string }
  | { phase: 'invalid'; message: string };

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
export function PublishControls(props: { onPublished?: (payload: PublishedWorkflowDef) => void }) {
  const env = useBuilderEnv();
  const draft = useDraft();
  const [state, setState] = useState<PublishPhase>({ phase: 'idle' });
  if (!env.canAuthor) return null;

  const issues = selectIssues(draft);
  const dropped = droppedStates(draft);

  async function submitPayload(stateMapping?: Record<string, string>): Promise<void> {
    setState({ phase: 'submitting' });
    const payload = buildPublishPayload(draft, stateMapping);
    const event = buildWorkflowDefinedEvent({
      workspaceId: env.workspaceId,
      actorId: env.session.userId,
      origin: 'web',
      payload,
    });
    const [result] = await env.gateway.submit([event]);
    if (result === undefined) throw new Error('gateway.submit returned no result for the event');
    switch (result.status) {
      case 'committed':
        setState({ phase: 'published', version: payload.version });
        props.onPublished?.(payload);
        return;
      case 'refused':
        setState({ phase: 'refused', rule: result.rule, reason: result.reason });
        return;
      case 'invalid':
        setState({ phase: 'invalid', message: result.message });
        return;
    }
  }

  async function onPublishClick(): Promise<void> {
    if (dropped.length === 0) {
      await submitPayload();
      return;
    }
    setState({ phase: 'mapping', occupancy: null, occupancyFailed: false });
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
   * `StateMappingDialog` holds the authored mapping in its own `useState`, so a
   * REFUSED publish cost the admin every row they had just filled in, and the
   * refusal banner rendered where the dialog had been. Restoring `'mapping'` on a
   * refusal is not enough (the remount would still have lost the map): the fix is
   * to mount it for the WHOLE attempt and dismiss it only on `committed`, which
   * is what `mappingDialogOpen` below says.
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

  return (
    <div className="publish-controls">
      <button
        type="button"
        className="publish-controls__publish"
        disabled={issues.length > 0 || state.phase === 'submitting'}
        title={issues.length > 0 ? 'Fix the issues below first.' : undefined}
        onClick={() => void onPublishClick()}
      >
        Publish
      </button>
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
            state.phase === 'refused'
              ? { kind: 'refused', title: 'The server refused this publish.', rule: state.rule, detail: state.reason }
              : state.phase === 'invalid'
                ? {
                    kind: 'invalid',
                    title: 'The server could not read this claim.',
                    detail: state.message,
                  }
                : null
          }
          onCancel={() => setState({ phase: 'idle' })}
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
    </div>
  );
}

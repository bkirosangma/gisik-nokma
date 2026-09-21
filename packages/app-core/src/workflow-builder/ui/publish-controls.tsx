import { useId, useState } from 'react';
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
  /** The id the disabled Publish button is described by — see its note below. */
  const publishReasonId = useId();
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

  return (
    <div className="publish-controls">
      <button
        type="button"
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
      </button>
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
      {state.phase === 'mapping' ? (
        <StateMappingDialog
          dropped={dropped}
          occupancy={state.occupancy}
          occupancyFailed={state.occupancyFailed}
          targetStates={draft.def.states.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
          fromVersion={draft.base?.version ?? 0}
          toVersion={(draft.base?.version ?? 0) + 1}
          onCancel={() => setState({ phase: 'idle' })}
          onConfirm={(mapping) => void submitPayload(mapping)}
        />
      ) : null}
      {state.phase === 'published' ? (
        <p className="publish-controls__banner publish-controls__banner--success">
          {`Version ${state.version} published.`}
        </p>
      ) : null}
      {state.phase === 'refused' ? (
        <div className="publish-controls__banner publish-controls__banner--refused">
          <p className="publish-controls__banner-title">The server refused this publish.</p>
          <p className="publish-controls__banner-reason">{state.reason}</p>
          <p className="publish-controls__banner-rule">{`rule: ${state.rule}`}</p>
        </div>
      ) : null}
      {state.phase === 'invalid' ? (
        <div className="publish-controls__banner publish-controls__banner--invalid">
          <p className="publish-controls__banner-title">The server could not read this claim.</p>
          <p className="publish-controls__banner-reason">{state.message}</p>
        </div>
      ) : null}
    </div>
  );
}

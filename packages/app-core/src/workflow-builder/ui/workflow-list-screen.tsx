import { useEffect, useState } from 'react';
import type { PublishedWorkflowDef, StateCategory } from '@gisik-nokma/domain';
import { Button, Card } from '@gisik-nokma/ui';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from './builder-context.js';
import { ReadOnlyBanner } from './read-only-banner.js';

/**
 * `/settings?tab=workflows` and `/w/[workspaceId]/settings/workflows` — the
 * card grid (prototype `design-system/interactive/desktop.dc.html:841-869`,
 * `@227434a5`).
 *
 * ## WHAT IS DRAWN, and the two things that are NOT
 *
 * The prototype draws a `repeat(auto-fit,minmax(320px,1fr))` grid of cards, each
 * with a name, a status badge, a row of per-state chips carrying a 4px category
 * bar, a meta line and two actions. The card, the chips, the meta line, the
 * header subtitle and the primary action are all drawn here. **The badge and the
 * second action are ABSENT, and the reason is a missing field rather than a
 * missing afternoon:**
 *
 * The VERSION rides in the meta line (`v7 · 3 states · 9 transitions`) rather
 * than in the name. The prototype writes it into the name itself (`"Delivery
 * v4"`, `:3175`) because its data has no separate field; this product names the
 * workflow and its version separately, and dropping the version to match the
 * drawing would lose a fact the screen already showed (case 10.62 asserts it).
 *
 * - **the status badge.** `PublishedWorkflowDef` is `{id,version,name,
 *   initialStateId,states,transitions,stateMapping?}` (`packages/domain/src/
 *   workflow.ts:83-116`) — **no status field**, so `"Published"` is derivable but
 *   the prototype's other two badge values (`"Superseded"`, `"Draft · N issues"`)
 *   are not. A badge that can only ever say one thing is a badge that lies by
 *   omission, so there is no badge rather than a constant one.
 * - **the second action.** `"Duplicate"` / `"Discard draft"` / `"View history"`
 *   have no method on `WorkflowAuthoringGateway`. A second button with no door
 *   behind it is the defect this repo keeps re-finding.
 *
 * Both are named absences in the catalogue entry rather than empty slots here.
 *
 * ## The chip's fill is a DEPTH problem, not a colour choice
 *
 * The prototype fills a state chip with `--trayBg` (`:3185`), which maps to
 * `--gn-surface-sunken`. Under `neo` — the shipped default — `surface`,
 * `surfaceRaised` and `surfaceSunken` are the SAME hex, so a chip filled with it
 * on a `.gn-card` is the same colour as the card behind it and the chip's only
 * boundary disappears. That is a known family here and NOT a hypothetical: it is
 * the same defect fixed on `.gn-avatar` the same day, and the fix is the one
 * `.ticket-type-list__badge` already ships — keep the fill, add
 * `--gn-shadow-sunken-compact` under `[data-style="neo"]`. Case **13.884**
 * measures that boundary, because a rule that sets a colour is not a boundary
 * that reads.
 *
 * ## The category bar is DATA, not decoration
 *
 * `WorkflowState.category` is `'open' | 'active' | 'terminal'`
 * (`packages/domain/src/workflow.ts:3-7`), so the bar's colour is a function of
 * a field the read already carries. It maps onto the three `--gn-category-*`
 * roles the product's own `.gn-chip__dot` uses for the same three categories,
 * which is why no new role is invented for it.
 */
export function WorkflowListScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  onOpen(workflowId: string): void;
  onNew(): void;
}) {
  const [workflows, setWorkflows] = useState<PublishedWorkflowDef[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    props.gateway
      .listWorkflows(props.workspaceId)
      .then((loaded) => {
        if (!cancelled) setWorkflows(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.gateway, props.workspaceId]);

  if (loadFailed) {
    return <p className="workflow-list__load-error">Could not load workflows — reload to try again.</p>;
  }
  if (workflows === null) return <p className="workflow-list__loading">Loading workflows…</p>;
  const canAuthor = canAuthorRole(props.session.role);
  return (
    <section className="workflow-list">
      <header className="workflow-list__header">
        <div className="workflow-list__heading">
          <h2 className="workflow-list__title">Workflows</h2>
          {/* The prototype's own sentence (`:845`), added rather than paraphrased:
              an exact-string search found it nowhere in the product. */}
          <p className="workflow-list__subtitle">
            Publishing records a version. Nothing already recorded is rewritten.
          </p>
        </div>
        {canAuthor ? (
          <Button variant="primary" className="workflow-list__new" onClick={props.onNew}>
            New workflow
          </Button>
        ) : null}
      </header>
      {canAuthor ? null : <ReadOnlyBanner />}
      {workflows.length === 0 ? (
        <p className="workflow-list__empty">No workflows published yet.</p>
      ) : (
        <div className="workflow-list__cards">
          {workflows.map((workflow) => (
            <Card className="workflow-list__card" key={workflow.id}>
              <p className="workflow-list__name">{workflow.name}</p>
              <div className="workflow-list__states">
                {workflow.states.map((state) => (
                  <span className="workflow-list__state" key={state.id}>
                    <span
                      className={`workflow-list__state-bar workflow-list__state-bar--${state.category satisfies StateCategory}`}
                      aria-hidden="true"
                    />
                    {state.name}
                  </span>
                ))}
              </div>
              <p className="workflow-list__meta">
                {`v${workflow.version} · ${workflow.states.length} ${workflow.states.length === 1 ? 'state' : 'states'} · ${workflow.transitions.length} ${workflow.transitions.length === 1 ? 'transition' : 'transitions'}`}
              </p>
              <div className="workflow-list__actions">
                <Button
                  className="workflow-list__open"
                  aria-label={`Open ${workflow.name}`}
                  onClick={() => props.onOpen(workflow.id)}
                >
                  Open
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

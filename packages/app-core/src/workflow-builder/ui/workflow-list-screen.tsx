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
 * ## WHAT IS DRAWN, and the one thing that is NOT — a RULING
 *
 * The prototype draws a `repeat(auto-fit,minmax(320px,1fr))` grid of cards, each
 * with a name, a status badge, a row of per-state chips carrying a 4px category
 * bar, a meta line and two actions. The card, the chips, the meta line, the
 * header subtitle and both actions are drawn here. **The badge is ABSENT, and it
 * is a DECISION rather than an omission** — the owner ruled on it on 2026-09-18,
 * approving the controller's recommendation. This block records what was decided
 * and what was measured, so a reader comparing this screen to the prototype
 * meets a ruling rather than a silence that reads as an oversight.
 *
 * **The second action WAS the second absence and is no longer one** (2026-09-19);
 * its bullet below carries both the original reasoning and the lift, because the
 * reasoning is what the lift resolved rather than what it discarded.
 *
 * The VERSION rides in the meta line (`v7 · 3 states · 9 transitions`) rather
 * than in the name. The prototype writes it into the name itself (`"Delivery
 * v4"`, `:3175`) because its data has no separate field; this product names the
 * workflow and its version separately, and dropping the version to match the
 * drawing would lose a fact the screen already showed (case 10.62 asserts it).
 *
 * - **the status badge — RULED: NOT BUILT.** No status field is added to
 *   `PublishedWorkflowDef` and no event is added to carry one. This list serves
 *   only published definitions, so a field that can hold exactly one value would
 *   be a badge that lies by omission the moment a second state exists.
 *   `PublishedWorkflowDef` stays `{id,version,name,initialStateId,states,
 *   transitions,stateMapping?}` (`packages/domain/src/workflow.ts:100-133`) with
 *   no status anywhere on the wire; `"Published"` is derivable from the read
 *   itself, and the prototype's other two badge values (`"Superseded"`,
 *   `"Draft · N issues"`, `:3175-3178`) are not.
 * - **the second action — BUILT 2026-09-19, and two of its three candidates are
 *   still absent.** `"View history"` was given the conditional ruling — build it
 *   **if the version chain is readable from an existing read** — and the
 *   measurement below established that it is. The owner lifted the hold on
 *   2026-09-19 and ruled it **one decision with the screen it opens**, so the
 *   action and `WorkflowHistoryScreen` are one task: `onHistory` navigates to
 *   `/w/[workspaceId]/settings/workflows/[workflowId]/history`. **It sits on
 *   every card**, not on a superseded one, because this screen renders one card
 *   per workflow id — the measurement's point 2, which is why the prototype's
 *   placement could not be copied. `"Duplicate"` and `"Discard draft"` are built
 *   under **no** reading and that has not changed: neither has a door.
 *
 * ### The `"View history"` measurement, because the ruling turned on it
 *
 * Two facts, each read rather than inferred:
 *
 * 1. **There is no history view in the prototype to port.** `"View history"` is
 *    drawn as the **`primary`** label of the SUPERSEDED card (`:3178`) — *not* as
 *    a second action. Every card's `secondLabel` is `"Duplicate"` (`"Discard
 *    draft"` on the draft card; `:3175-3178`), which is why the plan and dispatch
 *    group the three strings as "the second action": the grouping is a summary of
 *    the card's non-`"Open"` labels, and it hides the one that is not second. The
 *    block declares ten `screen:` values — `board`, `builder`, `legal`,
 *    `mcptokens`, `signin`, `typeeditor`, `types`, `workflows`, `workspace`,
 *    `workspaces` — and **none of them is a workflow history screen**; the only
 *    history SURFACE in the prototype is the ticket sheet's History tab (`:3589`,
 *    `:3734`), the word appearing elsewhere only in legal prose and toasts, which
 *    are not views. The handler `"View history"` is wired to (`:3187`) fires a
 *    **toast** — `"…has 128 recorded events — history is read-only"` — and
 *    navigates nowhere. So porting it would mean designing a view the prototype
 *    does not draw, which is a product decision rather than a port.
 * 2. **The card that carries the affordance is not rendered here.** The prototype
 *    lists a superseded version as its own card — `"Field ops v2"` and `"Field
 *    ops v1"` side by side (`:3176`, `:3178`) — and `"View history"` replaces
 *    `"Open"` on the older one. This screen renders one card per workflow id:
 *    `gateway.listWorkflows` → `GET /v1/workspaces/:id/workflows` →
 *    `latestWorkflowDefs` (`apps/server/src/read/workflow-defs.ts:25-38`), whose
 *    own docblock says "the latest published definition per workflow id" and
 *    which loops `getWorkflowDefFromProjection(db, workspaceId, id)` with **no
 *    version selector** — the reader's `ORDER BY version DESC LIMIT 1` branch. So
 *    there is no superseded card for the button to sit on.
 *
 *    **The version-aware read, however, DOES exist — end to end — and the first
 *    draft of this block denied it. Corrected here rather than left standing.**
 *    `DataSourceQuery.getWorkflowDef(workspaceId, workflowId, version?)`
 *    (`packages/app-core/src/data-source.ts:146`) declares a version parameter;
 *    the ONLINE adapter sends it (`online-data-source.ts:277-281` builds
 *    `?version=`), the replica adapter answers one locally, and the server route
 *    `GET /v1/workspaces/:workspaceId/workflows/:workflowId?version=N` serves any
 *    single version (`apps/server/src/routes/builder-reads.ts:517-546`, numeric
 *    branch at `apps/server/src/projections/workflows.ts:116-120`).
 *    `WorkflowAuthoringGateway` was version-BLIND when this measurement was taken —
 *    neither `listWorkflows` nor `getWorkflow(workspaceId, workflowId)` took a
 *    version — and the adapter that implemented it DROPPED an argument that
 *    already existed one layer down
 *    (`apps/web/src/authoring/data-source-gateway.ts:233`, whose own seam
 *    docblock names the member as `getWorkflowDef(workspaceId, workflowId, v?)`
 *    at `:26`). **THE OWNER'S 2026-09-19 LIFT IS WHAT CLOSED IT: `getWorkflow`
 *    now takes `version?` and that adapter passes it through**, which is why this
 *    paragraph reads in the past tense — it is the record of why the ruling
 *    turned on a *parameter* rather than on missing data. Versions are contiguous
 *    **by server-side ENFORCEMENT**, not by convention: the engine refuses a first
 *    version that is not 1, and any later version that is not `latest + 1`
 *    (`packages/rule-engine/src/workflow-defined.ts:53-58`, `:63-68`, rule
 *    `workflowVersion` at `refusal-rules.ts:18`) — so `1..N` is walkable from the
 *    `N` the list already returns. **What was missing was an exposed parameter,
 *    not a read.**
 *
 * **What the measurement does NOT say, recorded because it is the strongest
 * argument the other way.** The chain is not missing from the product. Every
 * published version is its own row in `proj_workflows` — the projection's own
 * docblock gives the reason ("every published version, queryable individually,
 * because the engine's version walk needs the intermediates and their
 * stateMappings, not just the newest definition") — `getWorkflowDefFromProjection`
 * reads any one of them by number, and `readWorkflowVersions`
 * (`apps/server/src/sync/ledger-deps.ts:156-174`) already returns the whole
 * ladder as `Map<number, WorkflowDef>`. So a history view needs **no new schema
 * and no new event**. Nor is the chain even unserved over HTTP:
 * `GET /v1/sync/bootstrap?workspaceId=<id>` returns "definitions in
 * `workspace_seq` order for everyone including guests"
 * (`apps/server/src/sync/sync-routes.ts:172-198`), so every published version of
 * every workflow is already reachable by a client that asks the replica door.
 * **THE RESOLUTION — and it is a DEPARTURE from the ruling's words, stated that
 * way so a reader does not take this absence as what the ruling asked for.** The
 * ruling is DATA-conditional and its data half is **SATISFIED**: the chain is
 * readable, by version, through reads that already ship, so **on the ruling's own
 * words the button was owed.** What stops this change short is a second rule from
 * the same task text colliding with the first: a button with no door behind it is
 * "the exact defect this repo keeps re-finding". Here it would have no door — the
 * prototype draws no history view (its own handler is a toast), and the card it
 * hangs `"View history"` on is a SUPERSEDED version's, which this screen does not
 * render — so the button would open nothing and would sit nowhere. **Those two
 * rules cannot both be honoured, and only the owner can pick between them:
 * ESCALATED to the controller as a ruling, not decided here.** Building it means
 * designing the view and choosing where the button lives, and inventing a screen
 * is the one thing a measurement cannot authorise. **The owner answered on
 * 2026-09-19 — `yes`, as ONE decision with the screen — so the collision is
 * resolved the first rule's way, with the view authored by the owner rather than
 * by this change.** The escalation paragraphs above are kept as the record of
 * *why* an answer was needed; the answer itself is in the bullet at the top and
 * in `WorkflowHistoryScreen`'s docblock, which is where a reader comparing this
 * product to the prototype will find why there is nothing to compare it to.
 *
 * Both absences are named in the catalogue entry rather than left as empty slots
 * here, and case 13.920 pins both at the RENDERED node — a class-shaped guard
 * alone would pass a badge renamed to `.gn-chip`.
 *
 * ## The chip's fill is a DEPTH problem, not a colour choice
 *
 * The prototype fills a state chip with `--trayBg` (`:3184`), which maps to
 * `--gn-surface-sunken`. Under `neo` — the shipped default — `surface`,
 * `surfaceRaised` and `surfaceSunken` are the SAME hex, so a chip filled with it
 * on a `.gn-card` is the same colour as the card behind it and the chip's only
 * boundary disappears. That is a known family here and NOT a hypothetical: it is
 * the same defect fixed on `.gn-avatar` the same day, and the fix is the one
 * `.ticket-type-list__badge` already ships — keep the fill, add
 * `--gn-shadow-sunken-compact` under `[data-style="neo"]`. Case **13.920**
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
  onHistory(workflowId: string): void;
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
                {/* Task 3's second action, LIFTED by the owner 2026-09-19. It
                    sits on EVERY card rather than on a superseded one, because
                    this screen renders one card per workflow id — the
                    prototype's superseded card has no counterpart here, and the
                    docblock above records that rather than assuming it. */}
                <Button
                  className="workflow-list__history"
                  aria-label={`View history of ${workflow.name}`}
                  onClick={() => props.onHistory(workflow.id)}
                >
                  View history
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

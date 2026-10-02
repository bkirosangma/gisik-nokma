import { useEffect, useState } from 'react';
import type { PublishedWorkflowDef, StateCategory } from '@gisik-nokma/domain';
import { Card } from '@gisik-nokma/ui';
import { CATEGORY_LABEL } from '../category-label.js';
import type { WorkflowAuthoringGateway } from '../gateway.js';

/**
 * `/w/[workspaceId]/settings/workflows/[workflowId]/history` — every published
 * version of one workflow, newest first.
 *
 * ## ⚠ THIS IS THE FIRST PORT IN THIS REPO THAT DRAWS A SCREEN THE PROTOTYPE
 * ## DOES NOT HAVE, and that is the whole reason it needed an owner answer
 *
 * The prototype draws **no history view.** Its `"View history"` handler
 * (`design-system/interactive/desktop.dc.html:3187`) fires a **toast** —
 * *"…has 128 recorded events — history is read-only"* — and navigates nowhere.
 * The block declares ten `screen:` values (`board`, `builder`, `legal`,
 * `mcptokens`, `signin`, `typeeditor`, `types`, `workflows`, `workspace`,
 * `workspaces`) and **none of them is a workflow history screen**; the only
 * other history surface in that file is the ticket sheet's History tab, which
 * is a different subject. So this screen has no drawing to be faithful to, and
 * a port cannot author a view — only the owner can. **The owner did, on
 * 2026-09-19**, in one decision with the list's second action: they are ONE
 * task, because the action is the only door to the screen.
 *
 * A reader comparing this product to the prototype will find the action and no
 * counterpart for what it opens. **That is stated here so they meet the reason
 * rather than a silence that reads as an oversight.**
 *
 * ## `"Duplicate"` and `"Discard draft"` are NOT built, and not by omission
 *
 * The prototype's cards carry three non-`"Open"` labels (`:3174-3188`).
 * `"Duplicate"` and `"Discard draft"` **have no door behind them under any
 * reading** — no route duplicates a workflow, and a draft is not a state this
 * product has (`PublishedWorkflowDef` carries no status and no draft flag, and
 * Task 2 recorded that half as a named absence beside this one). A button with
 * no door is the defect this repo keeps re-finding, so they are absent
 * deliberately and are named here rather than left to be inferred from a gap.
 *
 * ## Where the chain comes from — no new route, no new event, no new schema
 *
 * The per-version read already existed end to end and only the web seam dropped
 * it (see `WorkflowAuthoringGateway.getWorkflow`'s docblock). This screen walks
 * it: fetch the latest to learn `N`, then read `1..N` and render what comes
 * back. **Versions are contiguous `1..N` by SERVER ENFORCEMENT rather than by
 * convention** — the engine refuses a first version that is not 1 and any later
 * version that is not `latest + 1` (`packages/rule-engine/src/workflow-defined.ts`)
 * — which is what makes a walk from `N` a complete chain rather than a guess at
 * one. Every published version is also its own row in `proj_workflows`, placed
 * there for exactly this reason ("the engine's version walk needs the
 * intermediates and their stateMappings, not just the newest definition").
 *
 * **The cost, stated rather than hidden:** the walk is `N` reads, one per
 * version, because the per-version door is the only one HTTP offers a client.
 * A workflow with many versions costs many requests. That is a property of the
 * door, not of this screen, and it is why the screen renders the chain in one
 * pass rather than paging.
 *
 * ## What "content" means here
 *
 * Each version renders **the definition it actually published**: its states
 * with their category bars, its transitions, and its state mapping when it has
 * one. A superseded version whose content is not shown would be a version
 * number and nothing else — indistinguishable from a version that published
 * nothing, which is the failure this screen exists to avoid. The newest version
 * is marked `Current` and every other one `Superseded`, so the reader can tell
 * which chain they are looking at without counting.
 */
export function WorkflowHistoryScreen(props: {
  workspaceId: string;
  workflowId: string;
  gateway: WorkflowAuthoringGateway;
}) {
  const [versions, setVersions] = useState<PublishedWorkflowDef[] | null>(null);
  const [missing, setMissing] = useState(0);
  /* The top of the range, held from the read that ESTABLISHED it rather than
     re-derived from `versions[0]` at render time. The review found the
     difference: if the top-of-range read ever failed to answer while the
     unversioned read answered `N`, deriving it from the array would label
     `v(N-1)` "Current" while the same render reported a gap — a screen
     contradicting itself. Latent today (the projection's rows are append-only
     and the engine enforces contiguity), which is exactly when it is cheap. */
  const [latestNumber, setLatestNumber] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const { gateway, workspaceId, workflowId } = props;

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    setVersions(null);
    setMissing(0);
    (async () => {
      const latest = await gateway.getWorkflow(workspaceId, workflowId);
      if (cancelled) return;
      if (latest === null) {
        setVersions([]);
        return;
      }
      setLatestNumber(latest.version);
      const numbers = Array.from({ length: latest.version }, (_unused, index) => index + 1);
      const loaded = await Promise.all(
        numbers.map((version) => gateway.getWorkflow(workspaceId, workflowId, version)),
      );
      if (cancelled) return;
      const present = loaded.filter((def): def is PublishedWorkflowDef => def !== null);
      setMissing(numbers.length - present.length);
      setVersions(present.sort((a, b) => b.version - a.version));
    })().catch(() => {
      if (!cancelled) setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId, workflowId]);

  if (loadFailed) {
    return <p className="workflow-history__load-error">Could not load this workflow's history — reload to try again.</p>;
  }
  if (versions === null) return <p className="workflow-history__loading">Loading history…</p>;
  if (versions.length === 0) {
    return <p className="workflow-history__empty">No published versions to show.</p>;
  }
  return (
    <section className="workflow-history">
      <header className="workflow-history__header">
        <div className="workflow-history__heading">
          <h2 className="workflow-history__title">Version history</h2>
          <p className="workflow-history__subtitle">
            Publishing records a version. Nothing already recorded is rewritten.
          </p>
        </div>
      </header>
      {/* A version in `1..N` that the read did not answer is a hole in the
          chain, and saying so is the point: a screen that silently rendered the
          versions it happened to receive would show a shorter chain than the
          workflow has, with nothing on screen to say which. */}
      {missing > 0 ? (
        <p className="workflow-history__gap">
          {`${missing} version${missing === 1 ? '' : 's'} in this workflow's range did not answer and ${
            missing === 1 ? 'is' : 'are'
          } not shown.`}
        </p>
      ) : null}
      <ol className="workflow-history__versions">
        {versions.map((version) => {
          const current = version.version === latestNumber;
          return (
            <li key={version.version} data-version={version.version}>
              <Card className={`workflow-history__version${current ? ' workflow-history__version--current' : ''}`}>
                <div className="workflow-history__version-head">
                  <span className="workflow-history__version-number">{`v${version.version}`}</span>
                  <span className="workflow-history__version-state">{current ? 'Current' : 'Superseded'}</span>
                </div>
                <p className="workflow-history__version-name">{version.name}</p>
                {/* THE SAME CHIP THE LIST RENDERS, by class rather than by a
                    copy. `.workflow-list__state` is the state chip — 4px
                    category bar, sunken fill, its own neo shadow — and a second
                    family here would be two chips that drift, which is the
                    divergence the product already paid for once (the `Switch`
                    was hoisted rather than copied for exactly this reason).
                    Hoisting the family to a neutral name would be a rename of
                    classes a shipped case pins at the rendered node, and that
                    is not this task's to carry. */}
                <div className="workflow-list__states">
                  {version.states.map((state) => (
                    <span className="workflow-list__state" key={state.id}>
                      <span
                        className={`workflow-list__state-bar workflow-list__state-bar--${state.category satisfies StateCategory}`}
                        aria-hidden="true"
                      />
                      {state.name}
                      <span className="workflow-list__state-category">{CATEGORY_LABEL[state.category]}</span>
                    </span>
                  ))}
                </div>
                <p className="workflow-history__meta">
                  {`${version.states.length} ${version.states.length === 1 ? 'state' : 'states'} · ` +
                    `${version.transitions.length} ${version.transitions.length === 1 ? 'transition' : 'transitions'}` +
                    (version.stateMapping === undefined
                      ? ''
                      : ` · maps ${Object.keys(version.stateMapping).length} state${
                          Object.keys(version.stateMapping).length === 1 ? '' : 's'
                        }`)}
                </p>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

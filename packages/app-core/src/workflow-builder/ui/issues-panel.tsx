import { adviseWorkflowDef, validateWorkflowDef } from '@gisik-nokma/domain';
import { anchorIssues, type IssueAnchor } from '../anchor-issues.js';
import type { BuilderSelection } from '../draft-store.js';
import { useBuilderStore, useDraft } from './builder-context.js';

function selectionFor(anchor: IssueAnchor): BuilderSelection {
  switch (anchor.kind) {
    case 'state':
      return { kind: 'state', stateId: anchor.stateId };
    case 'transition':
      return { kind: 'transition', index: anchor.index };
    case 'workflow':
      return { kind: 'none' };
  }
}

/**
 * Live validation: this render IS the validation run — validateWorkflowDef is
 * pure and cheap, and useDraft() re-renders on every store change. The panel
 * speaks the validator's own plain language; it never rephrases an issue.
 *
 * Two tiers, two calls, never merged. adviseWorkflowDef's output is rendered
 * in its own section below the issues and gates nothing: selectCanPublish is
 * validateWorkflowDef emptiness alone (design decision 9). Note the advisory
 * section renders even when there are no issues — a clean workflow with a
 * bypassable guard is exactly the case worth showing, and an early return on
 * the all-clear would hide it. That is not a hypothetical: measured this
 * session, adding `if (anchoredIssues.length === 0) return <all-clear/>` above
 * the advisory block reddens exactly four tests, all of them in the advisory
 * describe block of validation.test.tsx — the two that assert a warning beside
 * a clean issues list and the two that click an advisory to select its
 * transition. Package-wide with it planted: 4 failed / 602 passed. The eleven
 * planted-defect tests, both issue-anchoring tests, the empty-advisory test
 * and every other suite in app-core stay green, so those prove nothing about
 * this branch and these four are the whole guarantee.
 *
 * COLOUR ROUTE, corrected against the shipped repo. The plan's Task 8 snippet
 * imports `tokens` from `@gisik-nokma/ui` and reads
 * `tokens.workflowBuilder.issueAccent` / `.advisoryAccent` / `.panelBorder` /
 * `.textMuted` into inline styles. No such export exists: packages/ui/src/
 * tokens.ts exports `primitives`, `themes`, `colorOf`, `cssVariableName` and
 * `themeStylesheet`, and TOKEN_ROLES carries no workflow-builder roles. Task 5
 * already settled the route for this plan's components — BEM classes in the
 * TSX, colours in packages/ui/src/ui.css as `var(--gn-*)`, and no new roles
 * ("the state category colours, blocked ring, accent, border and surface roles
 * this canvas needs already exist"). The same holds here: `danger` for the
 * issues accent, `warning` for the advisory accent. packages/ui/src is scanned
 * by token-discipline.test.ts, `.css` included, so a literal in either place
 * fails the build rather than shipping.
 */
export function IssuesPanel() {
  const store = useBuilderStore();
  const draft = useDraft();
  const anchoredIssues = anchorIssues(draft.def, validateWorkflowDef(draft.def));
  const anchoredAdvisories = anchorIssues(draft.def, adviseWorkflowDef(draft.def));
  return (
    <>
      {anchoredIssues.length === 0 ? (
        <section className="issues-panel issues-panel--clean">
          <p className="issues-panel__all-clear">No issues — this workflow can be published.</p>
        </section>
      ) : (
        <section className="issues-panel">
          <h3 className="issues-panel__title">Issues</h3>
          <ul className="issues-panel__list">
            {anchoredIssues.map((issue, at) => (
              <li className="issues-panel__item" key={`${issue.code}:${at}`}>
                <button
                  type="button"
                  className="issues-panel__jump"
                  onClick={() => store.actions.select(selectionFor(issue.anchor))}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {anchoredAdvisories.length > 0 ? (
        <section className="advisories-panel">
          <h3 className="advisories-panel__title">Worth a look — none of these block publishing</h3>
          <ul className="advisories-panel__list">
            {anchoredAdvisories.map((advisory, at) => (
              <li className="advisories-panel__item" key={`${advisory.code}:${at}`}>
                <button
                  type="button"
                  className="advisories-panel__jump"
                  onClick={() => store.actions.select(selectionFor(advisory.anchor))}
                >
                  {advisory.message}
                </button>
              </li>
            ))}
          </ul>
          <p className="advisories-panel__footer">
            Advisories describe a workflow that is legal but may not do what you meant.
          </p>
        </section>
      ) : null}
    </>
  );
}

import { useEffect, useState } from 'react';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from './builder-context.js';

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
        <h2 className="workflow-list__title">Workflows</h2>
        {canAuthor ? (
          <button type="button" className="workflow-list__new" onClick={props.onNew}>
            New workflow
          </button>
        ) : null}
      </header>
      {workflows.length === 0 ? (
        <p className="workflow-list__empty">No workflows published yet.</p>
      ) : (
        <ul className="workflow-list__rows">
          {workflows.map((workflow) => (
            <li className="workflow-list__row" key={workflow.id}>
              <span className="workflow-list__name">{workflow.name}</span>
              <span className="workflow-list__version">{`v${workflow.version}`}</span>
              <span className="workflow-list__states">{`${workflow.states.length} states`}</span>
              <button
                type="button"
                aria-label={`Open ${workflow.name}`}
                onClick={() => props.onOpen(workflow.id)}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

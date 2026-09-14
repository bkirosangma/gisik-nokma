import { useEffect, useState } from 'react';
import { BUILTIN_TICKET_TYPE_SEEDS, type PublishedWorkflowDef, type TicketTypeDef } from '@gisik-nokma/domain';
import { Button, Card } from '@gisik-nokma/ui';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from '../ui/builder-context.js';
import { ReadOnlyBanner } from '../ui/read-only-banner.js';
import { TypeIcon } from './icons.js';

export function TicketTypeListScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  onOpen(typeId: string): void;
  onNew(): void;
}) {
  const [types, setTypes] = useState<TicketTypeDef[] | null>(null);
  // Workflow names for the meta line only — never a ticket count. There is no
  // `countTicketsOfType(typeId)` on the gateway, and `getTypeWorkflowPopulation`
  // answers "how many are on THIS workflow", which stops being the type's whole
  // count the moment a rebind leaves tickets behind on a workflow it no longer
  // names (the very divergence this package's editor screen exists to show).
  // Showing a number here would be exactly the invented count `divergenceBody`
  // in the editor screen refuses to print.
  const [workflows, setWorkflows] = useState<PublishedWorkflowDef[] | null>(null);
  const { gateway, workspaceId } = props;
  useEffect(() => {
    let cancelled = false;
    void Promise.all([gateway.listTicketTypes(workspaceId), gateway.listWorkflows(workspaceId)]).then(
      ([loadedTypes, loadedWorkflows]) => {
        if (cancelled) return;
        setTypes(loadedTypes);
        setWorkflows(loadedWorkflows);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId]);

  if (types === null || workflows === null) return <p className="ticket-type-list__loading">Loading ticket types…</p>;
  const canAuthor = canAuthorRole(props.session.role);
  const builtinIds = new Set<string>(BUILTIN_TICKET_TYPE_SEEDS.map((seed) => seed.id));
  const workflowNames = new Map<string, string>(workflows.map((workflow) => [workflow.id, workflow.name]));
  const count = types.length;
  return (
    <section className="ticket-type-list">
      <header className="ticket-type-list__header">
        <div className="ticket-type-list__heading">
          <h2 className="ticket-type-list__title">Ticket types</h2>
          <p className="ticket-type-list__summary">
            {`${count} ${count === 1 ? 'type' : 'types'}, ordered by hierarchy rank — the lowest rank sits at the project root.`}
          </p>
        </div>
        {canAuthor ? (
          <Button variant="primary" className="ticket-type-list__new" onClick={props.onNew}>
            New ticket type
          </Button>
        ) : null}
      </header>
      {canAuthor ? null : <ReadOnlyBanner />}
      <Card className="ticket-type-list__card">
        <ul className="ticket-type-list__rows">
          {types.map((type) => (
            <li key={type.id}>
              <button
                type="button"
                className="ticket-type-list__row"
                aria-label={`Edit ${type.name}`}
                onClick={() => props.onOpen(type.id)}
              >
                <span className="ticket-type-list__icon">
                  <TypeIcon name={type.icon} />
                </span>
                <span className="ticket-type-list__info">
                  <span className="ticket-type-list__name">{type.name}</span>
                  <span className="ticket-type-list__meta">
                    <span className="ticket-type-list__rank">{`rank ${type.rank}`}</span>
                    <span className="ticket-type-list__meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="ticket-type-list__fields">
                      {type.fields.length === 1 ? '1 field' : `${type.fields.length} fields`}
                    </span>
                    <span className="ticket-type-list__meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="ticket-type-list__workflow">
                      {workflowNames.get(type.workflowId) ?? 'an unknown workflow'}
                    </span>
                  </span>
                </span>
                {builtinIds.has(type.id) ? <span className="ticket-type-list__badge">Built-in</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

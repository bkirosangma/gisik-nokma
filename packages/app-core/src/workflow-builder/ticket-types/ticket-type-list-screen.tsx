import { useEffect, useState } from 'react';
import { BUILTIN_TICKET_TYPE_SEEDS, type TicketTypeDef } from '@gisik-nokma/domain';
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
  const { gateway, workspaceId } = props;
  useEffect(() => {
    let cancelled = false;
    void gateway.listTicketTypes(workspaceId).then((loaded) => {
      if (!cancelled) setTypes(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [gateway, workspaceId]);

  if (types === null) return <p className="ticket-type-list__loading">Loading ticket types…</p>;
  const canAuthor = canAuthorRole(props.session.role);
  const builtinIds = new Set<string>(BUILTIN_TICKET_TYPE_SEEDS.map((seed) => seed.id));
  return (
    <section className="ticket-type-list">
      <header className="ticket-type-list__header">
        <h2 className="ticket-type-list__title">Ticket types</h2>
        {canAuthor ? (
          <button type="button" className="ticket-type-list__new" onClick={props.onNew}>
            New ticket type
          </button>
        ) : null}
      </header>
      {canAuthor ? null : <ReadOnlyBanner />}
      <ul className="ticket-type-list__rows">
        {types.map((type) => (
          <li className="ticket-type-list__row" key={type.id}>
            <TypeIcon name={type.icon} />
            <span className="ticket-type-list__name">{type.name}</span>
            {builtinIds.has(type.id) ? <span className="ticket-type-list__badge">Built-in</span> : null}
            <span className="ticket-type-list__rank">{`rank ${type.rank}`}</span>
            <span className="ticket-type-list__fields">
              {type.fields.length === 1 ? '1 field' : `${type.fields.length} fields`}
            </span>
            <button type="button" aria-label={`Open ${type.name}`} onClick={() => props.onOpen(type.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

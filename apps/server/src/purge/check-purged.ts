import { PURGE_RULE, PURGE_SERVER_ONLY_REASON, PURGED_REASON, type EventEnvelope } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';
import type { Queryable } from '../db/queryable.js';

/**
 * The door after a purge (trash series Plan 2; spec §5.7, server half). Runs
 * at BOTH ingest doors (D10) — see `ingest-service.ts`'s call site for why the
 * internal door needs it too.
 */
// Moved to the domain by trash Plan 3 (the device matches on it); re-exported
// so every existing importer of this module keeps compiling unchanged.
export { PURGE_RULE };

function refuse(reason: string): Refusal {
  return { refused: true, rule: PURGE_RULE, reason };
}

/**
 * The ids a payload names as a container, a link target or a flow cause's ticket, by type. Field names
 * are the schemas' own (`events/ticket-events.ts` `ticketCreatedPayload`,
 * `ticketReparentedPayload`; `events/note-events.ts` `noteCreatedPayload`,
 * `noteMovedPayload`, `noteAttachedPayload`). Read defensively: the payload
 * has already parsed, but this must never throw on a shape it does not know.
 */
export function payloadIds(type: string, rawPayload: unknown, depth = 0): Array<[kind: string, id: string]> {
  const payload = (typeof rawPayload === 'object' && rawPayload !== null ? rawPayload : {}) as Record<
    string,
    unknown
  >;
  const named: Array<[string, string]> = [];
  const add = (kind: string, value: unknown): void => {
    if (typeof value === 'string' && value !== '') named.push([kind, value]);
  };
  switch (type) {
    case 'ticket.created':
      add('project', payload['projectId']);
      add('ticket', payload['parentId']);
      break;
    case 'ticket.reparented':
      add('ticket', payload['newParentId']);
      add('ticket', payload['childId']); // the draft-side pending child (drafts T6, owner ruling O1)
      break;
    case 'note.created':
      add('project', payload['homeProjectId']);
      add('ticket', payload['attachTicketId']);
      break;
    case 'note.moved':
      add('project', payload['homeProjectId']);
      break;
    case 'note.attached':
      add('ticket', payload['ticketId']);
      break;
    case 'ticket.link_added':
    case 'ticket.link_removed':
      // Spec A: the TARGET is the second ticket a link names; a purged one refuses the claim. Drafts R42: a
      // from-form link also names its SOURCE.
      add('ticket', payload['targetId']);
      add('ticket', payload['from']);
      break;
    case 'ticket.decided': {
      // wtg2 T5 (PS-6): a decision naming an erased ticket among the started ones it asks the settle to close is refused
      // at the door, the way a link to one is.
      const ids = payload['closeStarted'];
      if (Array.isArray(ids)) for (const id of ids) add('ticket', id);
      break;
    }
    case 'ticket.transitioned':
    case 'ticket.closed':
    case 'ticket.reopened': {
      // wtg2 T8: a flow cause names the ticket that led here (`led-to` sourceTicketId) or the Decision whose outcome
      // moved it (`decisionTicketId`); an erased one refuses the move at the door, as a link to it does.
      const cause = payload['cause'];
      if (typeof cause === 'object' && cause !== null) {
        add('ticket', (cause as Record<string, unknown>)['sourceTicketId']);
        add('ticket', (cause as Record<string, unknown>)['decisionTicketId']);
      }
      break;
    }
    case 'ticket.published':
      // Drafts T1: the publish names its project (the key query needs it); a purged project refuses it.
      add('project', payload['projectId']);
      break;
    case 'claim.contested': {
      // Trash Plan 3 (D10). A refused ticket claim comes back as a contest on
      // the claim's OWN entity (`sync/sync-service.ts`'s `contest()`), and for a
      // NEW ticket under an erased parent that entity is not in the registry —
      // so the contest must be judged by what its embedded claim names. One
      // level only: a contest never embeds a contest (`sync-service.ts` refuses
      // a client-submitted `claim.contested` before ingest).
      const original = payload['originalEvent'];
      if (depth === 0 && typeof original === 'object' && original !== null) {
        const embedded = original as { entity?: { kind?: unknown; id?: unknown }; type?: unknown; payload?: unknown };
        if (typeof embedded.entity?.kind === 'string') add(embedded.entity.kind, embedded.entity.id);
        if (typeof embedded.type === 'string') named.push(...payloadIds(embedded.type, embedded.payload, depth + 1));
      }
      break;
    }
    default:
      break;
  }
  return named;
}

export async function checkPurged(db: Queryable, env: EventEnvelope): Promise<Refusal | null> {
  if (env.type === 'purge.completed') return refuse(PURGE_SERVER_ONLY_REASON);
  const named: Array<[string, string]> = [
    [env.entity.kind, env.entity.id],
    ['workspace', env.workspaceId],
    ...payloadIds(env.type, env.payload),
  ];
  const { rows } = await db.query<{ hit: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM purged_entities p
         JOIN unnest($1::text[], $2::text[]) AS n(kind, id) ON p.entity_kind = n.kind AND p.entity_id = n.id
     ) AS hit`,
    [named.map(([kind]) => kind), named.map(([, id]) => id)],
  );
  return rows[0]?.hit === true ? refuse(PURGED_REASON) : null;
}

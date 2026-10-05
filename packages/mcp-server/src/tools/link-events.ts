import type { SubmittedEvent, TicketLinkKind } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import { envelopeFor, resultError, submitBatchByIndex, type EventResult } from './submit.js';

/** One row of `GET …/tickets/:id/links` (typed-links T4; `label` from Graph Part 2, no key when the link has none, 29.126). */
export type LinkRow = { kind: string; direction: 'out' | 'in'; label?: string; ticket: { id: string; key?: string | null; title?: string | null } };
export type LinkEnd = { id: string; draft: boolean };
export type LinkSpec = { kind: TicketLinkKind; source: LinkEnd; target: LinkEnd; label?: string | undefined };

const fold = (s: string): string => s.trim().toLowerCase();

const RELABEL_UNKNOWN =
  'gisik-nokma did not report whether the relabel happened, so the link may be gone or relabelled: read it again with get_ticket before doing anything else';

/**
 * The ONE place that decides which stream a link event goes on (Drafts R42, R43). A link that touches a draft lives on
 * the DRAFT's stream: a draft source files as always; a published source and a draft target file on the draft's stream
 * with `targetId` = the draft and `from` = the source. A plain form on a published stream naming a draft is refused
 * `draft.link-form`. `link_removed` carries no label (LK-2); a label rides `link_added` only.
 */
export function linkEvent(session: Session, workspaceId: string, type: 'ticket.link_added' | 'ticket.link_removed', spec: LinkSpec): SubmittedEvent {
  const onDraft = spec.target.draft && !spec.source.draft;
  const payload: Record<string, unknown> = { kind: spec.kind, targetId: spec.target.id };
  if (onDraft) payload['from'] = spec.source.id;
  if (type === 'ticket.link_added' && spec.label !== undefined) payload['label'] = spec.label;
  return envelopeFor(session, workspaceId, { kind: 'ticket', id: onDraft ? spec.target.id : spec.source.id }, type, payload);
}

/**
 * The stored link between `ticketId` and `otherId`. When BOTH directions of a `leads_to` are stored (a two-ticket loop,
 * which Graph Part 2 allows) the outgoing one wins: `remove (A, B)` removes A→B. To remove B→A, call with B first.
 */
export function pickLink(links: readonly LinkRow[], kind: string, otherId: string): LinkRow | undefined {
  const same = links.filter((l) => l.kind === kind && l.ticket.id === otherId);
  return same.find((l) => l.direction === 'out') ?? same[0];
}

/** A result that did not commit, in `submitBatch`'s words (`event <i> refused by <rule>: <reason>`), without the reason's final full stop. */
export function describeResult(r: EventResult, index: number): string {
  return `event ${index} ${(resultError(r)?.message ?? r.status).replace(/\.$/, '')}`;
}

/**
 * Relabel = remove + add (LK-4). The event door commits each event in its own transaction and goes ON after a refusal
 * (`apps/server/src/ingest/ingest-service.ts:432-445`), so a refused add leaves the remove standing and the link gone.
 * Two pre-checks here make that rare (not the current label, not another outgoing branch's label; the schema refuses a
 * blank one); the race that remains (another writer between the read and the write) is compensated: the old link is
 * added back, and if even that is refused the error says which label to re-add.
 */
export async function relabelStored(
  session: Session,
  workspaceId: string,
  stored: LinkSpec,
  otherLabels: readonly string[],
  newLabel: string,
): Promise<EventResult[]> {
  if (stored.label === newLabel) throw new Error('the link already has this label');
  if (otherLabels.some((l) => fold(l) === fold(newLabel))) throw new Error(`another branch of this ticket is already labelled "${newLabel}"`);
  const results = await submitBatchByIndex(session, [
    linkEvent(session, workspaceId, 'ticket.link_removed', stored),
    linkEvent(session, workspaceId, 'ticket.link_added', { ...stored, label: newLabel }),
  ], RELABEL_UNKNOWN);
  const [removed, added] = results as [EventResult, EventResult];
  if (removed.status === 'committed' && added.status === 'committed') return results;
  if (removed.status === 'committed') {
    const restored = await submitBatchByIndex(session, [linkEvent(session, workspaceId, 'ticket.link_added', stored)], RELABEL_UNKNOWN).then(
      ([back]) => back?.status === 'committed',
      () => false,
    );
    throw new Error(
      `${describeResult(added, 1)}. ` +
        (restored
          ? 'The previous link was put back, so nothing changed.'
          : `The previous link could NOT be put back: add it again with link_tickets (action "add", label "${stored.label ?? ''}").`),
    );
  }
  throw new Error(`${describeResult(removed, 0)}.${added.status === 'committed' ? ' The link with the new label was added.' : ''}`);
}

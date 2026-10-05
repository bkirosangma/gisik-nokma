import type { TicketState } from './entity-state.js';

/**
 * What an author may submit on their OWN draft (drafts spec §3.3, R6). Everything else is refused
 * `draft.not-allowed` (R7) — comments, transitions, closing, ranking, deleting, collaborators, visibility.
 * `note.attached` / `note.detached` naming a draft are also allowed, but they are filed on the NOTE's
 * stream, so they are decided by the note-side gate (T9), not by this list.
 */
export const DRAFT_ALLOWED_EVENT_TYPES = [
  'ticket.field_set',
  'ticket.assigned',
  'ticket.reparented',
  'ticket.link_added',
  'ticket.link_removed',
  'attachment.added',
  'ticket.published',
  'ticket.discarded',
] as const;

/**
 * Ticket-scoped types the draft gate does NOT judge, each for a reason a reader can check: `ticket.created`
 * is the birth, not an act on a draft; the contest pair is the server's record of a refusal (an offline
 * draft edit that was refused must still be recordable); `purge.*` have their own refusals
 * (`checkLifecycle`, `purge/check-purged.ts`).
 */
export const DRAFT_GATE_EXEMPT_EVENT_TYPES = [
  'ticket.created',
  'claim.contested',
  'claim.contested_resolved',
  'purge.marked',
  'purge.unmarked',
  'purge.completed',
] as const;

const ALLOWED: ReadonlySet<string> = new Set(DRAFT_ALLOWED_EVENT_TYPES);
const EXEMPT: ReadonlySet<string> = new Set(DRAFT_GATE_EXEMPT_EVENT_TYPES);

/** The verb in `A draft cannot be <verb>.` for each refused type; an unlisted type reads `changed that way`. */
const VERBS: Readonly<Record<string, string>> = {
  'ticket.transitioned': 'moved',
  'ticket.closed': 'closed',
  'ticket.reopened': 'reopened',
  'ticket.ranked': 'ranked',
  'ticket.restored': 'restored',
  'ticket.workflow_rebound': 'moved to another workflow',
  'ticket.collaborator_added': 'shared with collaborators',
  'ticket.collaborator_removed': 'shared with collaborators',
  'comment.added': 'commented on',
  'comment.edited': 'commented on',
  'comment.deleted': 'commented on',
  'visibility.set': 'shared',
};

/** True when an author may submit this type on their draft (allowlisted or exempt). */
export function draftAllows(type: string): boolean {
  return ALLOWED.has(type) || EXEMPT.has(type);
}

/**
 * Drafts spec R8: a draft is private to its author, so there is nobody from outside to bring in to see it. The ONE definition:
 * the server's refusal (`apps/server/src/routes/people.ts`) and the MCP preview that warns of it (`packages/mcp-server/src/tools/assignee-email.ts`,
 * drafts T7, planner ruling 2026-10-04) both read these, so the two cannot drift (case 28.146 counts the sentence's definitions).
 */
export const DRAFT_NO_OUTSIDERS_RULE = 'draft.no-outsiders';
export const DRAFT_NO_OUTSIDERS_REASON = 'Publish the ticket before inviting someone from outside';

/** The sentence for a refused type: names the way out (spec §3.3, R7). Total: any type gets a sentence. */
export function draftNotAllowedReason(type: string): string {
  if (type === 'ticket.deleted') return 'A draft cannot be deleted. Discard it instead.';
  return `A draft cannot be ${VERBS[type] ?? 'changed that way'}. Publish it first, or discard it.`;
}

/** A draft exists on this state, discarded or not. A published ticket has no `draft` key. */
export function isDraft(state: Pick<TicketState, 'draft'>): boolean {
  return state.draft !== undefined;
}

/** The author has discarded it: every door treats it as gone until the erasure lands. */
export function isDiscardedDraft(state: Pick<TicketState, 'draft'>): boolean {
  return state.draft?.discarded === true;
}

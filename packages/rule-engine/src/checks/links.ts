import type { EventEnvelope, TicketLinkKind, TicketState } from '@gisik-nokma/domain';
import { ticketLinkAddedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { ACCEPT, linkExistsRefusal, refuse } from './refusals.js';

const titleOf = (t: TicketState): string => {
  const v = t.fields['title']?.value;
  return typeof v === 'string' && v !== '' ? v : t.id;
};

/** The rule id for a link that would put a draft's name on a public stream (drafts R43), and the second sentence for two drafts. */
export const DRAFT_LINK_FORM_RULE = 'draft.link-form';
export const DRAFT_LINK_BETWEEN_DRAFTS_REASON = "File a link between two drafts from the source draft's side";
const FROM_STRUCTURE_DETAIL =
  'a link with "from" is filed on the draft it points at, so targetId must be that draft';

/**
 * Does `a` already hold the link "a kind b"? Two places can say so: a's own PLAIN entries naming b, and b's
 * entries filed from a's side (`from === a.id`, drafts R42), which exist while b is a draft. Entries that carry
 * `from` on a's own list are b-side facts about a different pair and never answer for a.
 */
const stored = (a: TicketState, b: TicketState, kind: TicketLinkKind): boolean =>
  (a.links ?? []).some((l) => l.from === undefined && l.kind === kind && l.targetId === b.id) ||
  (b.links ?? []).some((l) => l.from === a.id && l.kind === kind && l.targetId === b.id);

/** A draft is invisible to everyone but its live author: another person's and a discarded one read as nothing. */
const draftHidden = (t: TicketState, actorId: string): boolean =>
  t.draft !== undefined && (t.draft.discarded === true || t.draft.authorId !== actorId);

/** Rules 3 to 5 of spec A for the ordered pair (source, target), whichever stream holds the entries. */
function pairVerdict(source: TicketState, target: TicketState, kind: TicketLinkKind): Accept | Refusal {
  if (stored(source, target, kind)) {
    return refuse('link.duplicate', linkExistsRefusal(kind, titleOf(source), titleOf(target)));
  }
  if (stored(target, source, kind)) {
    // `relates` is unordered, so its stored reverse IS a duplicate (rule 3); for blocks and duplicates it is the
    // direct reverse (rules 4 and 5).
    return refuse(kind === 'relates' ? 'link.duplicate' : 'link.reverse', linkExistsRefusal(kind, titleOf(target), titleOf(source)));
  }
  return ACCEPT;
}

/**
 * Typed links, rules 1–5 (spec A §2.3) plus `link.absent`. Both tickets' links
 * come from `getEntityState`, which on the server is `proj_tickets.links`
 * (typed-links T2) and on the client the cache (`precheck.ts`). The rules
 * about WHO may link (6, 7) are the permission gate's, because they need
 * `canSee`, which this context does not carry. A draft's from entries are the
 * second place a pair is stored (`stored`); the draft gate has already run, so
 * the entity is never another person's draft.
 *
 * A deleted SOURCE never reaches here: `checkTicketLive` refuses a deleted
 * stream ticket ahead of the dispatch (`evaluate.ts`), and in the from form,
 * whose source is `from`, a deleted one is `link.target-deleted` below. The two
 * event types share one payload shape, so one schema parses both.
 */
export async function checkTicketLink(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ${env.type} event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketLinkAddedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ${env.type} event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const { kind, targetId, from } = parsed.data;
  const entity = await getTicketState(ctx, env.entity.id);
  if (entity === null) return refuse(REFUSAL_RULES.unknownTicket, `This event links ticket ${env.entity.id}, but no such ticket is known.`);
  if (from !== undefined) return checkFromForm(env, ctx, entity, kind, targetId, from);

  if (env.type === 'ticket.link_removed') {
    return (entity.links ?? []).some((l) => l.from === undefined && l.kind === kind && l.targetId === targetId)
      ? ACCEPT
      : refuse('link.absent');
  }
  if (targetId === entity.id) return refuse('link.self');
  const target = await getTicketState(ctx, targetId);
  if (target === null || target.workspaceId !== env.workspaceId || draftHidden(target, env.actorId)) {
    return refuse('link.unknown-target');
  }
  if ((target.deleted ?? null) !== null) return refuse('link.target-deleted');
  // Drafts R43: a PUBLISHED source never names a draft. Two drafts are filed on the source draft's own stream.
  if (entity.draft === undefined && target.draft !== undefined) return refuse(DRAFT_LINK_FORM_RULE);
  return pairVerdict(entity, target, kind);
}

/**
 * The from form (drafts R42): the stream's entity is the DRAFT, `targetId` is that draft and `from` is the source.
 * Anything else is malformed: a `from` on a public stream is the one thing R43 forbids.
 */
async function checkFromForm(
  env: EventEnvelope, ctx: EngineContext, draft: TicketState, kind: TicketLinkKind, targetId: string, fromId: string,
): Promise<Accept | Refusal> {
  if (draft.draft === undefined || targetId !== draft.id) {
    return refuse(REFUSAL_RULES.malformedPayload, `This ${env.type} event's payload is malformed: ${FROM_STRUCTURE_DETAIL}.`);
  }
  if (env.type === 'ticket.link_removed') {
    return (draft.links ?? []).some((l) => l.from === fromId && l.kind === kind && l.targetId === draft.id)
      ? ACCEPT
      : refuse('link.absent');
  }
  const source = await getTicketState(ctx, fromId);
  if (source === null || source.workspaceId !== env.workspaceId || draftHidden(source, env.actorId)) {
    return refuse('link.unknown-target');
  }
  if ((source.deleted ?? null) !== null) return refuse('link.target-deleted');
  // Drafts T6 decision 2: the re-file would lose a link whose source is itself a draft.
  if (source.draft !== undefined) return refuse(DRAFT_LINK_FORM_RULE, DRAFT_LINK_BETWEEN_DRAFTS_REASON);
  return pairVerdict(source, draft, kind);
}

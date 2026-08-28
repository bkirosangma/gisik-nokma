import type { Accept, Refusal } from '../engine.js';

/**
 * The exact plain-language refusal reasons — a deliverable of Plan 3.
 *
 * Tests and fixtures assert the LITERAL strings, never these constants, so a
 * typo here cannot certify itself. Every reason is written to a person who is
 * being told "no": it states the fact, and where a remedy exists it names the
 * remedy, because a refusal a person cannot act on is a dead end wearing a
 * sentence.
 *
 * The ids are namespaced by what the refusal is ABOUT — `ticket.` for the
 * ticket or its type, `hierarchy.` for the shape of the tree, `field.` for a
 * claim on a field — not by which check happens to raise them. Two checks may
 * raise the same id (`checkTicketCreated` and `checkTicketReparented` both
 * refuse `hierarchy.rank`), and a person who meets one refusal twice should not
 * have to work out whether it is the same refusal.
 *
 * NOT EXHAUSTIVE, and deliberately so: a ticket cannot be created into a
 * project that was never founded, but `proj_projects` and the honest
 * "the project does not exist" refusal belong to PLAN 4 (coordination doc,
 * owner decision 2026-08-26 — it "joins Plan 3's precondition list as a
 * cross-reference"). Nothing here checks project existence, and
 * `checkTicketCreated`'s documented check order says the same thing at the
 * other end. This note is the cross-reference: read the list below as the
 * preconditions THIS plan enforces, not as every precondition there is.
 */
export const REFUSALS = {
  'ticket.unknown-type': "This ticket's type is not defined in this workspace.",
  'ticket.unknown': 'This ticket does not exist in this workspace.',
  /**
   * The mirror of `ticket.unknown`, and it is not in Plan 3's table: it was
   * routed here by Task 3's review. `applyTicketEvent` folds a `ticket.created`
   * UNCONDITIONALLY (`packages/domain/src/ticket-state.ts:95`, which is what
   * Task 3's brief asked for), so a second accepted create for a ticket that
   * already exists does not error and does not merge — it resets the fold,
   * erasing the ticket's status, collaborators, field claims and transition
   * log. The reason names that consequence rather than the mechanism, because
   * "this id is taken" tells a person nothing about what they nearly lost.
   */
  'ticket.already-exists':
    'This ticket already exists. Creating it again would erase everything recorded on it — open the existing ticket instead.',
  'ticket.workflow-undefined':
    "This ticket type's workflow has not been defined yet, so the ticket would have no status.",
  'hierarchy.unknown-parent': 'The chosen parent ticket does not exist in this workspace.',
  'hierarchy.cross-project': 'The parent is in a different project. Pick a parent from the same project.',
  'hierarchy.cycle':
    'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
  'field.unknown': "This ticket's type has no such field. Add the field to the ticket type first.",
  'field.title-required': 'A ticket always has a title. Change the title instead of clearing it.',
} as const;

export function rankRefusal(childTypeName: string, parentTypeName: string): string {
  return `"${childTypeName}" cannot go under "${parentTypeName}": a ticket's parent must be a bigger kind of work.`;
}

/**
 * Owner decision (2026-08-20, coordination doc sign-off table): a ticket whose
 * type sits at the deepest rank always belongs to a parent. The reason names
 * the TYPE rather than saying "sub-task", because the built-in sub-task is only
 * the most common type this bites — any custom type at the same rank raises it.
 */
export function deepestRankParentRefusal(typeName: string): string {
  return `"${typeName}" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.`;
}

export function fieldKindRefusal(fieldName: string, needsPhrase: string): string {
  return `"${fieldName}" needs ${needsPhrase}.`;
}

/**
 * One argument for a refusal whose reason is fixed; two when the reason names
 * something from the event (a type name, a parent's title) and therefore has to
 * be built. The overloads keep the fixed-reason call honest: `refuse('…')` only
 * type-checks for a key the map actually has.
 */
export function refuse(rule: keyof typeof REFUSALS): Refusal;
export function refuse(rule: string, reason: string): Refusal;
export function refuse(rule: string, reason?: string): Refusal {
  return { refused: true, rule, reason: reason ?? REFUSALS[rule as keyof typeof REFUSALS] };
}

export const ACCEPT: Accept = { refused: false };

/**
 * Owner decision (2026-08-20, coordination doc): live work arriving under a
 * finished parent refuses toward the offered reopen — the remedy is in the
 * reason. `move` picks the verb pair: 'add' for ticket.created, 'move' for
 * ticket.reparented.
 *
 * This is NOT Plan 2's `parent-terminal-with-open-children`
 * (`refusal-rules.ts:14`), and neither may be renamed to the other: that one
 * fires when a PARENT tries to enter a terminal state while children are still
 * open; this one fires when live work arrives UNDER a parent already finished.
 * Adjacent meanings, opposite directions, and a person meeting one is being
 * told something the other does not say.
 */
export function parentTerminalRefusal(parentTitle: string, stateName: string, move: 'add' | 'move'): string {
  const remedy =
    move === 'add'
      ? 'Adding live work reopens it — choose a state to reopen it to, then add this ticket.'
      : 'Moving live work under it reopens it — choose a state to reopen it to, then move this ticket.';
  return `"${parentTitle}" is finished (${stateName}). ${remedy}`;
}

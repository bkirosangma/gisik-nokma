import { memberLabel } from './member-label.js';

/** One person the `@` picker can offer — `MentionCandidate` in `packages/editor`, field for field. */
export type MentionPerson = { userId: string; name: string };

/**
 * The people an `@` mention offers: the workspace roster, each labelled the way
 * the Assignee picker labels them, filtered by what was typed.
 *
 * THE ONE SOURCE. The ticket sheet's `queryUsers` was this body inline; the
 * note body editor and the note comment composer now call the same function
 * over the same roster shape, so "who can I mention" cannot be a different list
 * on a note than on a ticket (owner ruling 2026-09-29: give the note editors
 * the mention source the ticket editors use — no second list).
 *
 * Labels are resolved BEFORE matching (RULING E5-4): a magic-link member's raw
 * `name` is blank, so matching first would make them unreachable by typing;
 * resolved through `memberLabel` (name → email → id), the same step the
 * Assignee picker takes, so a person is found by what the list shows for them.
 * `memberLabel`, not `actorLabel`: a row here IS a roster member, so the
 * address step applies and the system-actor override (which is for claims) does
 * not.
 */
export function mentionCandidatesOf(
  members: ReadonlyArray<{ id: string; name: string; email?: string }>,
  query: string,
): MentionPerson[] {
  const needle = query.trim().toLowerCase();
  return members
    .map((member) => ({ userId: member.id, name: memberLabel(member) }))
    .filter((person) => needle === '' || person.name.toLowerCase().includes(needle));
}

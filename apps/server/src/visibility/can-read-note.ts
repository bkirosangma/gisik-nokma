import type { NoteState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
import { getNoteStateFromDb } from '../projections/notes.js';
import { ticketIsLive } from '../read/live-ticket.js';
import { canSeeResolved, getResolvedVisibility, type ResolvedVisibility } from './can-see.js';

/**
 * "Who may read a note" — the ONE definition (notes series, Plan 1 of 6, spec
 * §4.1).
 *
 * Pure, and total: given an effective role, a user id, the three note fields the
 * answer depends on, and the resolved audiences of the note's attached tickets,
 * it returns a boolean. Nothing here reads a clock, a database or a request.
 *
 * ## The SQL twin, and why there are two spellings of one rule
 *
 * `visibleNotesWhere` (`../read/visible-where.ts`) states the same table as a
 * WHERE fragment, because a LIST read cannot call a function per row. Two
 * spellings of one decision is exactly the shape that drifts, so the plan's case
 * 18.021 asserts them EQUAL per user on one fixture, and that case is the only
 * reason the second spelling is allowed to exist. If you change one arm here,
 * 18.021 is what tells you.
 *
 * ## The order of the three early answers, and why it is not arbitrary
 *
 * Not a member → false, and FIRST: every later arm is about a role this person
 * does not have, and `workspaceRole === null` makes the switch below
 * unanswerable.
 *
 * The AUTHOR arm is second, above the owner arm: the author reads their own note
 * whatever its scope, including `private` — that is what `private` means (spec
 * §4.1).
 *
 * The FIRST arm bounds it, and that is spec §4.1's own order rather than an
 * oversight: the author arm is about SCOPE, not membership, so it does not
 * survive leaving the workspace. An author removed from the workspace reads
 * nothing, their own note included, because `eff.workspaceRole` is null and the
 * function has already returned.
 *
 * ## Deleted notes
 *
 * `deleted` is in the signature and is deliberately NOT consulted. A deleted
 * note is still READABLE — it is in the undo window, and the reads that show it
 * (`getDeletedNotes`) are gated on top of this function by who may see a deleted
 * note at all. Folding deletion in here would make "this note is hidden from you"
 * and "this note was deleted" the same answer.
 */
export function canReadNote(
  eff: EffectiveRole,
  userId: string,
  note: Pick<NoteState, 'authorId' | 'homeProjectId' | 'scope' | 'deleted'>,
  attachedVisibilities: ResolvedVisibility[],
): boolean {
  if (eff.workspaceRole === null) return false; // not a member of the workspace
  if (note.authorId === userId) return true; // the author always reads their own note
  if (eff.workspaceRole === 'owner') return true; // the owner reads everything (can-see.ts)
  // A bare switch with no `default`: a sixth scope must fail to compile here
  // rather than fall out of the function and read as "not readable", which is
  // the permissive direction for a function nobody can see failing.
  switch (note.scope.mode) {
    case 'private':
      return false;
    // Guest refused, matching `canSeeResolved`'s guest arm for a
    // workspace-mode TICKET: a guest reaches work through explicit lists only.
    case 'workspace':
      return eff.workspaceRole !== 'guest';
    // Membership, NOT role — and since rule A an owner/admin/member is on every founded project; a guest never.
    case 'project':
      return eff.workspaceRole !== 'guest' && eff.projects.has(note.homeProjectId);
    // `explicit` admits guests, as it does for tickets, and consults the USER
    // LIST and nothing else — no role, no project, no workspace.
    case 'explicit':
      return note.scope.userIds.includes(userId);
    // ANY one attached visible ticket admits the reader. A `every` here would
    // make a note attached to two tickets hidden from somebody who can see one
    // of them, which is the opposite of what "inherit" means.
    case 'inherit':
      return attachedVisibilities.some((v) => canSeeResolved(eff, userId, v));
  }
}

/**
 * A note plus the resolved audiences of its attached, LIVE tickets — the pair
 * `canReadNote` needs, loaded in one place so no caller assembles it by hand.
 *
 * ## `ticketIsLive` rather than trusting the attachment rows
 *
 * `proj_note_attachments` holds every link the ledger ever made, including links
 * to tickets later deleted. A deleted ticket is in no view (the FAQ's rule), so
 * its audience must not admit anybody to an `inherit` note — an attachment to a
 * deleted ticket is not a door. The filter is applied here, at the one read,
 * rather than in the reducer, because deletion is a property of the TICKET and
 * the reducer folds notes.
 *
 * `getResolvedVisibility` answers `null` for a ticket `proj_visibility` has no
 * row for, and such a ticket is skipped for the same reason.
 */
export async function loadNoteForVisibility(
  db: Queryable,
  noteId: string,
): Promise<{ note: NoteState; attachedVisibilities: ResolvedVisibility[] } | null> {
  const note = await getNoteStateFromDb(db, noteId);
  if (note === null) return null;
  const attachedVisibilities: ResolvedVisibility[] = [];
  for (const ticketId of note.attachedTicketIds) {
    if (!(await ticketIsLive(db, note.workspaceId, ticketId))) continue;
    const v = await getResolvedVisibility(db, ticketId);
    if (v !== null) attachedVisibilities.push(v);
  }
  return { note, attachedVisibilities };
}

/**
 * The by-id convenience every permission check and route uses: load, resolve the
 * role, decide. `false` for a note that does not exist, which is the honest
 * answer to "may this person read it" and the one the routes turn into a 404
 * identical to the one an unknown id gets.
 */
export async function canReadNoteById(db: Queryable, userId: string, noteId: string): Promise<boolean> {
  const loaded = await loadNoteForVisibility(db, noteId);
  if (loaded === null) return false;
  const eff = await resolveEffectiveRole(db, userId, loaded.note.workspaceId);
  return canReadNote(eff, userId, loaded.note, loaded.attachedVisibilities);
}

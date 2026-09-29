import { PURGE_DELAY_DAYS, type LifecycleKind } from '@gisik-nokma/domain';

/**
 * Every string the trash UI shows (trash series Plan 4). Exported so each test
 * pins the constant rather than retyping it; the spec's fixed strings (§6.1,
 * §6.3) are verbatim, with ONE substitution — the day count is
 * `PURGE_DELAY_DAYS`, because Plan 1's rule is that nothing else spells it
 * (case 19.210 changes the constant and reads the sentence back).
 *
 * Server refusals are NOT here: a refusal renders `IngestResult.reason`
 * verbatim, and its wording belongs to `apps/server/src/permissions/
 * check-lifecycle.ts`.
 */

// ── The delete dialog (spec §6.1) ──────────────────────────────────────────
export const DELETE_NOTE = `Deleted items sit in Deleted items on your Account page, where you can restore them. Deleting permanently marks the item to be purged for good after ${PURGE_DELAY_DAYS} days — you can unmark it there any time before then.`;
export const DELETE_PERMANENTLY_LABEL = 'Delete permanently';
export const DELETE_CONFIRM_LABEL = 'Delete';
export const DELETE_CANCEL_LABEL = 'Cancel';
export const DELETE_CLOSE_LABEL = 'Close';
/** The door that OPENS the dialog — the ellipsis says more is asked before anything happens (spec §6.2's own spelling). */
export const DELETE_TRIGGER_LABEL = 'Delete…';
export const NOT_SIGNED_IN_LINE = 'You are not signed in, so nothing was sent.';

export function deleteDialogTitle(kind: LifecycleKind, name: string): string {
  return `Delete ${kind} “${name}”?`;
}

export function deleteConfirmVisibleLabel(permanent: boolean): string {
  return permanent ? DELETE_PERMANENTLY_LABEL : DELETE_CONFIRM_LABEL;
}

/**
 * D8. Off: `Delete <kind>` — CONTAINS the visible `Delete` (WCAG 2.5.3) and is
 * not the footer's own `Delete`, so one screen never holds two buttons of one
 * name (ruling E2-35, case 13.1183). On: `Delete permanently`, equal to the
 * visible text; the switch of the same words is a checkbox, a different role.
 */
export function deleteConfirmAccessibleName(kind: LifecycleKind, permanent: boolean): string {
  return permanent ? DELETE_PERMANENTLY_LABEL : `${DELETE_CONFIRM_LABEL} ${kind}`;
}

export function typeNameLabel(name: string): string {
  return `Type “${name}” to confirm`;
}

/** D10 — the delete committed and the mark did not. `reason` is the server's own sentence, which ends in a full stop. */
export function deletedNotMarkedLine(kind: LifecycleKind, reason: string): string {
  return `This ${kind} was deleted, but not marked for permanent deletion — ${reason} You can mark it from Deleted items on your Account page.`;
}

export function batchMixedLine(reason: string): string {
  return `Only part of this went through — ${reason} Check Deleted items on your Account page.`;
}

/** The workspace home's own sentence for a short answer (`app/w/[workspaceId]/page.tsx:258-260`), shared now. */
export function unansweredLine(answered: number, sent: number): string {
  return `The server answered ${answered} of ${sent} claims, so what happened is not known.`;
}

export function deleteUnreachableLine(message: string): string {
  return `We could not reach the server for this delete — ${message}`;
}

export function changeUnreachableLine(message: string): string {
  return `We could not reach the server for this change — ${message}`;
}

/** What a card page says once its dialog closed on a committed delete. */
export function deletedNotice(kind: LifecycleKind, name: string, permanent: boolean): string {
  return permanent
    ? `Deleted ${kind} “${name}” and marked it for permanent deletion. You can unmark it from Deleted items on your Account page within ${PURGE_DELAY_DAYS} days.`
    : `Deleted ${kind} “${name}”. You can restore it from Deleted items on your Account page.`;
}

/** The project page's toast. The soft sentence is the 2026-09-20/E2-30 one, unchanged. */
export function ticketDeletedToast(name: string, permanent: boolean): string {
  return permanent
    ? `${name} marked for permanent deletion · you can also undo this on the page`
    : `${name} deleted · you can also undo this on the page`;
}

/** The project page's durable strip (E2-30). The soft sentence is unchanged. */
export function ticketDurableUndoLine(title: string, permanent: boolean): string {
  return permanent
    ? `${title} is deleted and marked for permanent deletion. Undo here until you delete another ticket or reload the page.`
    : `${title} is deleted. Undo here until you delete another ticket or reload the page.`;
}

// ── Account → Deleted items (spec §6.3) ────────────────────────────────────
export const DELETED_ITEMS_HEADING = 'Deleted items';
export const DELETED_ITEMS_EMPTY = 'Nothing deleted.';
/** D13, narrowed by trash Plan 3: this device has never read the list online (nothing is cached); never shown as "Nothing deleted." */
export const DELETED_ITEMS_OFFLINE = 'Deleted items needs a connection.';
export const DELETED_ITEMS_LOADING = 'Loading…';
/** Trash Plan 3 (D9): the saved copy, offline — when it was read, and why nothing can be pressed. */
export function deletedItemsAsOf(when: string): string {
  return `Deleted items as of ${when}, saved on this device. Restoring and marking need a connection.`;
}
export function deletedItemsFailed(message: string): string {
  return `Deleted items could not be loaded — ${message}`;
}
export const RESTORE_LABEL = 'Restore';
export const MARK_LABEL = 'Mark for permanent deletion';
export const UNMARK_LABEL = 'Unmark';
export const UNMARK_BEFORE_RESTORE = 'Unmark it to restore it.';
export const PURGE_UNDER_WAY = 'Its permanent deletion is under way.';
export const DELETED_BY_YOU = 'you';
export const DELETED_BY_UNKNOWN = 'someone';
export const KIND_LABEL: Readonly<Record<LifecycleKind, string>> = {
  workspace: 'Workspace',
  project: 'Project',
  ticket: 'Ticket',
  note: 'Note',
};
export function permanentlyDeletedOn(day: string): string {
  return `Permanently deleted on ${day}`;
}
/** Spec §6.3's "and 42 items inside" — nothing at 0, the singular at 1. */
export function containedLine(count: number): string | null {
  if (count <= 0) return null;
  return `and ${count} ${count === 1 ? 'item' : 'items'} inside`;
}
export function deletedByLine(who: string, day: string): string {
  return `Deleted by ${who} · ${day}`;
}
export function restoreItemName(label: string): string {
  return `${RESTORE_LABEL} ${label}`;
}
export function markItemName(label: string): string {
  return `${MARK_LABEL} — ${label}`;
}
export function unmarkItemName(label: string): string {
  return `${UNMARK_LABEL} ${label}`;
}

// ── Cards (spec §6.2) ──────────────────────────────────────────────────────
export const ARCHIVE_LABEL = 'Archive';
export const WORKSPACE_MENU_LABEL = 'Workspace actions';
export const ARCHIVED_GROUP_HEADING = 'Archived';
/** The chip an archived WORKSPACE card wears — the project card's own word (`app/w/[workspaceId]/page.tsx:415`). */
export const ARCHIVED_CHIP_LABEL = 'Archived';
/** An archived card's door name — the project card's convention (`app/w/[workspaceId]/page.tsx:410`). */
export function archivedDoorName(name: string): string {
  return `${name}, archived`;
}
/** A card's Delete… button's accessible name: the item, and the visible word (WCAG 2.5.3). */
export function deleteItemName(name: string): string {
  return `${DELETE_CONFIRM_LABEL} ${name}`;
}
export function restoreUnreachableLine(message: string): string {
  return `We could not reach the server to restore it — ${message}`;
}
export function moreActionsFor(name: string): string {
  return `More actions for ${name}`;
}
/** The workspace home's archived-projects toggle wording (`app/w/[workspaceId]/page.tsx:935-943`), for workspaces. */
export function archivedToggleText(count: number, open: boolean): string {
  return open ? 'Hide archived' : `${count} archived · show`;
}
export function archivedToggleName(open: boolean): string {
  return `${open ? 'Hide' : 'Show'} archived workspaces`;
}

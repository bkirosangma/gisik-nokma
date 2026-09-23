/** Days between a `purge.marked` and the purge (owner, 2026-09-23). The only place 15 is spelled. */
export const PURGE_DELAY_DAYS = 15;

export type LifecycleKind = 'workspace' | 'project' | 'ticket' | 'note';
export const PURGEABLE_KINDS: readonly LifecycleKind[] = ['workspace', 'project', 'ticket', 'note'];

/** The instant a mark made at `markedAt` falls due. Derived, never claimed (spec §4). */
export function purgeDueAt(markedAt: string): string {
  return new Date(Date.parse(markedAt) + PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export const LIFECYCLE_EVENT_TYPES = [
  'workspace.archived', 'workspace.restored', 'workspace.deleted', 'workspace.undeleted',
  'project.deleted', 'project.undeleted', 'purge.marked', 'purge.unmarked',
] as const;

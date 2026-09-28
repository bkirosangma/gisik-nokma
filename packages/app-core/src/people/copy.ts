import type { LookedUpPerson } from './types.js';

/** Every string the outsider arm shows (access plan Task 7). Pinned literally once, by `outsider-finder.test.tsx`. */
export const ASSIGN_OUTSIDER_OPTION = 'Assign someone outside this workspace…';
export const OUTSIDER_EMAIL_LABEL = 'Their email';
export const OUTSIDER_FIND = 'Find';
export const OUTSIDER_CANCEL = 'Cancel';
export const OUTSIDER_ASSIGN = 'Assign';
export const OUTSIDER_NOT_FOUND = 'No user with that email.';
export const OUTSIDER_JOINS_AS_GUEST = 'They will join this workspace as a guest and see only this ticket.';

export function foundLine(person: Pick<LookedUpPerson, 'name' | 'email'>): string {
  return `${person.name} (${person.email})`;
}

export function alreadyInWorkspaceLine(name: string): string {
  return `${name} is already in this workspace.`;
}

export function lookupFailedLine(why: string): string {
  return `The lookup failed: ${why}`;
}

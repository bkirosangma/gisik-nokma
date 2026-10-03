import { createHash } from 'node:crypto';

export type ItemKind = 'ticket' | 'note';
export function itemKey(kind: ItemKind, id: string): string {
  return `${kind}:${id}`;
}
export function parseItemKey(key: string): { kind: ItemKind; id: string } {
  const [kind, id] = key.split(':') as [string, string | undefined];
  if ((kind !== 'ticket' && kind !== 'note') || id === undefined || id === '') throw new Error(`not an item key: ${key}`);
  return { kind, id };
}
/** Spec D §4.1 step 6: a hash of the sorted item ids. */
export function signatureOf(keys: readonly string[]): string {
  return createHash('sha256').update([...keys].sort().join('\n')).digest('hex');
}
/**
 * One item, hashed. A rejection records hashes, never ids (Task 5): `workspace.concept_suggestion_rejected`
 * is on the WORKSPACE stream, which every member's replica receives, and an id list would tell a member
 * that a ticket they cannot see exists. A hash tells them nothing they did not already know.
 */
export function itemHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}
/** "Changed by more than half" (spec D §4.1 step 6) = Jaccard distance > 0.5. Exactly half is not more. */
export function changedByMoreThanHalf(before: readonly string[], after: readonly string[]): boolean {
  const a = new Set(before);
  const b = new Set(after);
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  const union = a.size + b.size - shared;
  return union > 0 && 1 - shared / union > 0.5;
}

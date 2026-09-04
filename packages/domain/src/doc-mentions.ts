/**
 * Finds the structured mention nodes (coordination amendment 12:
 * { type: 'mention', attrs: { userId } }) anywhere in an editor document,
 * dependency-free (no Tiptap, no ProseMirror import). Only a node carrying
 * a non-empty string userId counts as a mention — no text-scanning for '@',
 * no guessing from a label. Extraction only: this walker does not check
 * whether the userId names a real or visible user. Visibility filtering of
 * who actually receives a notification for a mention happens later, at
 * fan-out — the ruling that a mention must never become a server-side probe
 * for who can see a ticket binds fan-out, not this file, and this file
 * exposes nothing that could answer such a probe.
 *
 * Shares docToPlainText's finite-depth recursion guard (MAX_DEPTH), and the
 * same reasoning: a node that is its own descendant, or nesting deep enough
 * to threaten the call stack, are indistinguishable from one another and
 * from a very deep but legitimate document, so both take the same safe
 * branch — stop descending and return what was found so far, never throw.
 * Depth increments once per node level, not per array hop (an array's own
 * children are visited at their parent's depth, matching doc-text.ts's
 * `render`), so MAX_DEPTH means the same "200 real document levels" here as
 * it does there.
 */
const MAX_DEPTH = 200;

export function extractMentionedUserIds(doc: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  walk(doc, 0, found, seen);
  return found;
}

function walk(node: unknown, depth: number, found: string[], seen: Set<string>): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, depth, found, seen);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  if (record.type === 'mention' && typeof record.attrs === 'object' && record.attrs !== null) {
    const userId = (record.attrs as Record<string, unknown>).userId;
    if (typeof userId === 'string' && userId.length > 0 && !seen.has(userId)) {
      seen.add(userId);
      found.push(userId);
    }
  }
  walk(record.content, depth + 1, found, seen);
}

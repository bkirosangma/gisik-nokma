import { ULID_REGEX } from './ids.js';
import type { StateCategory } from './workflow.js';

/** Knowledge Graph spec B §3–§4: the "Linked from" wire shape, shared by the server read, the app and MCP. */
export type LinkedFromTarget = { kind: 'ticket' | 'note'; id: string };
export type LinkedFromParent =
  | { kind: 'ticket'; ticketId: string; projectId: string; key: string; title: string; stateCategory: StateCategory }
  | { kind: 'note'; noteId: string; title: string };
export type LinkedFromRow = {
  sourceKind: 'ticket' | 'note' | 'comment';
  sourceId: string;
  parent: LinkedFromParent;
  /** Who last wrote the source's body; for a comment, its author (only the author may edit one). */
  authorId: string;
  snippet: string;
  updatedAt: string;
};
export type LinkedFromPage = { total: number; items: LinkedFromRow[]; nextCursor: string | null };

/** Spec B §3.1–§3.2: twenty rows per page; "Show all N" pages the rest. */
export const LINKED_FROM_PAGE_SIZE = 20;
export const EMPTY_LINKED_FROM: LinkedFromPage = Object.freeze({ total: 0, items: [], nextCursor: null }) as LinkedFromPage;

export function parseLinkedFromTarget(raw: unknown): LinkedFromTarget | null {
  if (typeof raw !== 'string') return null;
  const at = raw.indexOf(':');
  const kind = raw.slice(0, at);
  const id = raw.slice(at + 1);
  if (at < 0 || (kind !== 'ticket' && kind !== 'note') || !ULID_REGEX.test(id)) return null;
  return { kind, id };
}

function parentName(parent: LinkedFromParent): string {
  if (parent.kind === 'note') return parent.title;
  return parent.key === '' ? parent.title : `${parent.key} ${parent.title}`;
}

/** "GN-118 Phone pass", "Note: Phone pass rulings", "Comment on GN-118". The app adds " by <name>" to a comment. */
export function linkedFromSourceTitle(row: LinkedFromRow): string {
  if (row.sourceKind !== 'comment') return row.parent.kind === 'note' ? `Note: ${row.parent.title}` : parentName(row.parent);
  if (row.parent.kind === 'note') return `Comment on note ${row.parent.title}`;
  return `Comment on ${row.parent.key === '' ? row.parent.title : row.parent.key}`;
}

/** The snippet's one `[[…]]` pair (Task 1 guarantees exactly one), or null. */
export function splitSnippet(snippet: string): { before: string; marked: string; after: string } | null {
  const open = snippet.indexOf('[[');
  const close = snippet.indexOf(']]', open + 2);
  if (open < 0 || close < 0) return null;
  return { before: snippet.slice(0, open), marked: snippet.slice(open + 2, close), after: snippet.slice(close + 2) };
}

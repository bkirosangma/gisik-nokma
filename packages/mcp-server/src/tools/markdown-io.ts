import {
  docToMarkdown,
  markdownToDoc,
  MARKDOWN_SYNTAX_HELP,
  scanMarkdownRefs,
  type DocJson,
  type RefResolver,
} from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';

export { MARKDOWN_SYNTAX_HELP };

type Person = { userId: string; displayName: string };
type TicketHit = { card: { ticketId: string; projectId: string; key: string | null; title: string } };
type NoteRow = { noteId: string; title: string };

const enc = encodeURIComponent;

/** The people a body may mention: the roster, or for a guest the people on their own tickets (the `list_members` rule). */
async function peopleOf(session: Session, workspaceId: string): Promise<Person[]> {
  const base = `/v1/workspaces/${enc(workspaceId)}`;
  try {
    return ((await session.get(`${base}/members`)) as { members: Person[] }).members;
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404)) throw error;
    return ((await session.get(`${base}/actor-names`)) as { names: Person[] }).names;
  }
}

/** A key resolves only to the hit whose key is EXACTLY it — the search ranks `CCSO-40` beside `CCSO-4` (case 14.384). */
async function ticketByKey(session: Session, workspaceId: string, key: string) {
  const query = new URLSearchParams({ workspaceId, q: key, kinds: 'ticket' });
  const { hits } = (await session.get(`/v1/search?${query.toString()}`)) as { hits: TicketHit[] };
  const hit = hits.find((h) => h.card.key === key);
  return hit === undefined ? null : { ticketId: hit.card.ticketId, projectId: hit.card.projectId, key, title: hit.card.title };
}

/**
 * Markdown → the stored document (spec §3). Reads ONLY what the body names (no roster read for a body with
 * no mention), resolves through the product's own reads — so a person, ticket or note the caller cannot see
 * cannot be referenced — and refuses with every unresolvable token named. Nothing is sent on a refusal.
 */
export async function markdownBody(session: Session, workspaceId: string, markdown: string): Promise<DocJson> {
  const refs = scanMarkdownRefs(markdown);
  const people = refs.userIds.length === 0 ? [] : await peopleOf(session, workspaceId);
  const tickets = new Map<string, Awaited<ReturnType<typeof ticketByKey>>>();
  for (const key of refs.ticketKeys) tickets.set(key, await ticketByKey(session, workspaceId, key));
  const notes = refs.noteRefs.length === 0 ? [] : ((await session.get(`/v1/workspaces/${enc(workspaceId)}/notes`)) as { notes: NoteRow[] }).notes;
  const extra: string[] = [];
  const resolve: RefResolver = {
    user: (id) => {
      const person = people.find((p) => p.userId === id);
      return person === undefined ? null : { userId: person.userId, label: person.displayName };
    },
    ticket: (key) => tickets.get(key) ?? null,
    note: (ref) => {
      const byId = notes.find((n) => n.noteId === ref);
      if (byId !== undefined) return { noteId: byId.noteId, title: byId.title };
      const titled = notes.filter((n) => n.title === ref);
      if (titled.length > 1) {
        extra.push(`two or more notes are titled "${ref}"; write [[note:<note id>]] instead`);
        return { noteId: titled[0]!.noteId, title: ref }; // placeholder; the refusal below stops the write
      }
      return titled[0] === undefined ? null : { noteId: titled[0].noteId, title: titled[0].title };
    },
  };
  const { doc, problems } = markdownToDoc(markdown, resolve);
  const all = [...problems, ...extra];
  if (extra.length > 0 && problems.length === 0) throw new Error(extra.join('; '));
  if (all.length > 0) throw new Error(`the Markdown was not stored: ${all.join('; ')}`);
  return doc;
}

export function bodyAsMarkdown(doc: unknown): { markdown: string; lossy: string[] } {
  return docToMarkdown(doc);
}

/** Exactly one of `ticketId` / `noteId` — a comment, an attachment and a body all belong to ONE parent. */
export function parentOf(args: { ticketId?: string | undefined; noteId?: string | undefined }, tool: string): { kind: 'ticket' | 'note'; id: string } {
  if ((args.ticketId === undefined) === (args.noteId === undefined)) throw new Error(`${tool} takes exactly one of ticketId or noteId`);
  return args.ticketId !== undefined ? { kind: 'ticket', id: args.ticketId } : { kind: 'note', id: args.noteId as string };
}

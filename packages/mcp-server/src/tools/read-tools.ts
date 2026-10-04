import { z } from 'zod';
import { filterSpecSchema } from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { bodyAsMarkdown } from './markdown-io.js';
import { readOrNotFound } from './reads.js';

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler(args: Record<string, unknown>): Promise<unknown>;
};

/** `filter` is the domain schema, imported and not restated. It is `.strict()`: a key it does not
 *  know is refused rather than silently matching nothing. Each person/type/state/priority slot has a
 *  SINGLE key (`assigneeId`) and a PLURAL one (`assigneeIds`, 1–20 values — "Asha or Ravi"), mutually
 *  exclusive, and `"me"` in an assignee or collaborator slot is resolved to the caller by the server
 *  (MCP CRUD plan M5/M6). Importing the schema is what makes the plural keys and the refusal of a
 *  singular+plural pair arrive here without a second spelling. */
const filterArg = filterSpecSchema.optional();
const searchShape = { workspaceId: z.string().min(1), query: z.string().min(1).max(500), filter: filterArg };

/** The server answers a refused filter with `400 { error: 'invalid_filter' }` and deliberately names
 *  nothing (it would mirror the refused value). On its own that reaches an assistant as "answered
 *  400"; this says what can be wrong with a filter so it can retry. */
const INVALID_FILTER_SENTENCE =
  'invalid_filter: the filter was refused. Each filter slot takes a single value OR its list form ' +
  '(assigneeId or assigneeIds, never both), lists hold 1–20 values, "me" stands for you in the ' +
  'assignee and collaborator slots, and priorities are P1, P2 or P3.';

const NO_SCOPE =
  'list_tickets needs a scope: pass projectId (the tickets of one project) or workspaceId (every ' +
  'project you can see in that workspace).';
const TWO_SCOPES =
  'list_tickets takes one scope, not both: pass projectId (the tickets of one project) OR ' +
  'workspaceId (every project you can see in that workspace).';

/** `get_ticket` shows at most this many attached notes; `notesTotal` counts every one the caller can read (MCP sweep 2 §3.2). */
const MAX_TICKET_NOTES = 50;
const notesUnread = (why: string): string =>
  `The ticket was read but the notes attached to it could not be (${why}), so nothing is returned: an empty list would read as "no notes".`;

type AttachedNote = { noteId: string; title: string; authorId: string; updatedAt: string };

/**
 * The notes attached to a ticket that THIS caller may read, as the Notes section of the ticket sheet reads them
 * (`GET …/tickets/:id/notes`, `apps/server/src/routes/notes.ts:87-96`). The route has no ticket check of its own, so the
 * caller reads the ticket first. Any failure here fails the call (GT-5).
 */
async function attachedNotes(session: Session, path: string): Promise<AttachedNote[]> {
  let body: unknown;
  try {
    body = await session.get(path);
  } catch (error) {
    throw new Error(notesUnread(error instanceof Error ? error.message : String(error)));
  }
  const list = (body as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(list)) throw new Error(notesUnread('the answer was not a list of notes'));
  return (list as AttachedNote[]).map((n) => ({ noteId: n.noteId, title: n.title, authorId: n.authorId, updatedAt: n.updatedAt }));
}

/** What `/members` and `/actor-names` carry, narrowed to what this tool reads. */
type RosterRow = { userId: string; displayName: string; role?: string; email?: string; removed?: true };

export function readTools(session: Session): ToolDefinition[] {
  const runSearch = async (
    tool: string,
    parsed: { workspaceId: string; query: string; filter?: z.infer<typeof filterSpecSchema>; kinds?: string[]; mode?: string },
  ) => {
    if (parsed.filter?.text !== undefined) {
      // Refused here rather than at the server, which answers a bare
      // `invalid_filter` that does not say which of the two text terms is
      // the problem.
      throw new Error(
        `${tool} takes the search text as \`query\`; a \`text\` key inside \`filter\` is refused ` +
          'by the server. Pass one or the other, not both.',
      );
    }
    const search = new URLSearchParams({ workspaceId: parsed.workspaceId, q: parsed.query });
    if (parsed.kinds !== undefined) search.set('kinds', parsed.kinds.join(','));
    if (parsed.mode !== undefined) search.set('mode', parsed.mode);
    if (parsed.filter !== undefined) search.set('filter', JSON.stringify(parsed.filter));
    return session.get(`/v1/search?${search.toString()}`);
  };
  return [
    {
      name: 'search',
      description:
        'Full-text search across the tickets and notes you can see in one workspace. Returns at most 50 hits ' +
        'and has no pages — narrow the query, `kinds` or the filter rather than expecting a next page. ' +
        '`kinds` limits it to tickets, notes, or both (the default is both); `mode: "meaning"` ranks notes by ' +
        'what they say rather than the words they use and answers notes only. ' +
        'A ticket key such as "CCSO-12" (any case) returns that ticket first, also by a key it held before a ' +
        'prefix change. Use list_tickets when you need to enumerate.',
      inputSchema: { ...searchShape, kinds: z.array(z.enum(['ticket', 'note'])).min(1).optional(), mode: z.enum(['lexical', 'meaning']).optional() },
      handler: async (args) => {
        const parsed = z.object({ ...searchShape, kinds: z.array(z.enum(['ticket', 'note'])).min(1).optional(), mode: z.enum(['lexical', 'meaning']).optional() }).parse(args);
        return runSearch('search', parsed);
      },
    },
    {
      name: 'search_tickets',
      description:
        'Kept for one release as the old name of `search`; it answers exactly what it always did (tickets, and notes too). Prefer `search`. ' +
        'Full-text search across the tickets you can see in one workspace. Returns at most 50 hits ' +
        'and has no pagination — narrow the query or the filter rather than expecting a next page. ' +
        'A ticket key such as "CCSO-12" (any case) returns that ticket first, also by a key it held before a ' +
        'prefix change. Use list_tickets when you need to enumerate.',
      inputSchema: searchShape,
      handler: async (args) => runSearch('search_tickets', z.object(searchShape).parse(args)),
    },
    {
      name: 'list_tickets',
      description:
        'List tickets, optionally grouped and filtered. Pass exactly one of `projectId` (the tickets of one ' +
        'project) or `workspaceId` (every project you can see in that workspace, archived projects ' +
        'excluded) — never both, never neither. In `filter`, `assigneeId` and `collaboratorId` accept ' +
        '"me" for yourself ("my open tickets everywhere" is `workspaceId` + `filter: { assigneeId: "me", ' +
        'closed: false }`), and assignee, collaborator, type, state, state category and priority also ' +
        'take a list under `assigneeIds`, `collaboratorIds`, `typeIds`, `stateIds`, `stateCategories`, ' +
        '`priorities` (P1–P3) — "assigned to Asha or Ravi" — instead of, never beside, the single key. ' +
        'Use list_members to find a person\'s userId. `parentId` accepts the literal value "root" to mean ' +
        'top-level tickets only. Pages with `cursor`; the response carries `nextCursor` (null on the last page).',
      inputSchema: {
        projectId: z.string().min(1).optional(),
        workspaceId: z.string().min(1).optional(),
        groupBy: z.enum(['epic', 'status', 'assignee', 'type', 'flat']).optional(),
        filter: filterArg,
        parentId: z.string().min(1).optional(),
        cursor: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      handler: async (args) => {
        const parsed = z
          .object({
            projectId: z.string().min(1).optional(),
            workspaceId: z.string().min(1).optional(),
            groupBy: z.enum(['epic', 'status', 'assignee', 'type', 'flat']).optional(),
            filter: filterArg,
            parentId: z.string().min(1).optional(),
            cursor: z.string().min(1).optional(),
            limit: z.number().int().min(1).max(200).optional(),
          })
          .parse(args);
        // EXACTLY ONE scope, decided before anything is sent: a call naming both would silently pick one.
        if (parsed.projectId === undefined && parsed.workspaceId === undefined) throw new Error(NO_SCOPE);
        if (parsed.projectId !== undefined && parsed.workspaceId !== undefined) throw new Error(TWO_SCOPES);
        const search = new URLSearchParams();
        if (parsed.groupBy !== undefined) search.set('groupBy', parsed.groupBy);
        if (parsed.parentId !== undefined) search.set('parentId', parsed.parentId);
        if (parsed.cursor !== undefined) search.set('cursor', parsed.cursor);
        if (parsed.limit !== undefined) search.set('limit', String(parsed.limit));
        if (parsed.filter !== undefined) search.set('filter', JSON.stringify(parsed.filter));
        const query = search.toString();
        // `/ticket-list`, not `/tickets`: `GET /v1/workspaces/:id/tickets` is Plan 4's visibility list (a
        // different shape, `200 []` for an outsider). The workspace scope answers the project route's
        // `ListResponse` with `projectId: null`.
        const path =
          parsed.projectId !== undefined
            ? `/v1/projects/${encodeURIComponent(parsed.projectId)}/tickets`
            : `/v1/workspaces/${encodeURIComponent(parsed.workspaceId ?? '')}/ticket-list`;
        try {
          return await session.get(`${path}${query === '' ? '' : `?${query}`}`);
        } catch (error) {
          if (error instanceof HttpError && error.status === 400 && isInvalidFilter(error.body)) {
            throw new Error(INVALID_FILTER_SENTENCE, { cause: error });
          }
          throw error;
        }
      },
    },
    {
      name: 'get_ticket',
      description:
        'Read one ticket in full: its visibility row, its folded state (assignee, collaborators, ' +
        'custom fields, transition history), its title, who last moved it, its parent, its rollup and its typed links ' +
        '(`links`: kind, direction "out"/"in" and the other ticket, visible ends only). ' +
        '`notes` lists the notes attached to it that you can read (noteId, title, authorId, updatedAt; newest first, at most 50) and ' +
        '`notesTotal` counts them all; read one in full with get_note. ' +
        'A ticket you cannot see is indistinguishable from one that does not exist — both answer not_found.',
      inputSchema: { workspaceId: z.string().min(1), ticketId: z.string().min(1) },
      handler: async (args) => {
        const parsed = z.object({ workspaceId: z.string().min(1), ticketId: z.string().min(1) }).parse(args);
        const detail = (await readOrNotFound(
          session,
          `/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/tickets/${encodeURIComponent(parsed.ticketId)}`,
          'ticket',
        )) as { ticketState?: { fields?: Record<string, { value: unknown }>; links?: unknown } } & Record<string, unknown>;
        // Typed links, both directions, visible ends only (typed-links T4): the links route, not the folded outbound `ticketState.links`.
        const linked = (await readOrNotFound(
          session,
          `/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/tickets/${encodeURIComponent(parsed.ticketId)}/links`,
          'ticket',
        )) as { links: Array<{ kind: string; direction: 'out' | 'in'; ticket: { id: string; key: string | null; title: string } }> };
        // AFTER the ticket read: the notes route does not check the ticket (GT-1).
        const notes = await attachedNotes(
          session,
          `/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/tickets/${encodeURIComponent(parsed.ticketId)}/notes`,
        );
        // The description is a document: answer it as Markdown (with what Markdown cannot show), never as the raw tree.
        const { description, ...fields } = detail.ticketState?.fields ?? {};
        // One representation of links: `ticketState.links` (the ids held on this ticket's stream: its outbound links, plus a
        // draft's inbound `from` entries) is dropped in favour of `links`.
        const { links: _held, ...state } = detail.ticketState ?? {};
        return {
          ...detail,
          ...(detail.ticketState === undefined ? {} : { ticketState: { ...state, ...(detail.ticketState.fields === undefined ? {} : { fields }) } }),
          description: bodyAsMarkdown(description?.value ?? null),
          links: linked.links.map((l) => ({ kind: l.kind, direction: l.direction, ticket: { id: l.ticket.id, key: l.ticket.key, title: l.ticket.title } })),
          notes: notes.slice(0, MAX_TICKET_NOTES),
          notesTotal: notes.length,
        };
      },
    },
    {
      name: 'list_members',
      description:
        'The people in a workspace, so you can find someone\'s userId (for assignee filters or assigning). ' +
        'Owners, admins and members get the roster with each person\'s role and, where they have a real ' +
        'one, their email. A guest gets only the names of the people on tickets shared with them — no ' +
        'roster, no roles, no emails. Use "me" in filters for yourself.',
      inputSchema: { workspaceId: z.string().min(1) },
      handler: async (args) => {
        const workspaceId = z.string().min(1).parse(args['workspaceId']);
        const base = `/v1/workspaces/${encodeURIComponent(workspaceId)}`;
        try {
          const roster = (await session.get(`${base}/members`)) as { members: RosterRow[] };
          return {
            workspaceId,
            members: roster.members.map((m) => ({
              userId: m.userId,
              name: m.displayName,
              ...(m.email === undefined ? {} : { email: m.email }),
              ...(m.role === undefined ? {} : { role: m.role }),
            })),
          };
        } catch (error) {
          // A 404 here is how the server tells a GUEST (or a stranger) that the roster is not theirs
          // (`/members` is `no-guests`). ONLY a 404 falls back: anything else is a failure, not a visibility ruling.
          if (!(error instanceof HttpError && error.status === 404)) throw error;
        }
        try {
          const names = (await session.get(`${base}/actor-names`)) as { names: RosterRow[] };
          return {
            workspaceId,
            members: names.names.map((n) => ({
              userId: n.userId,
              name: n.displayName,
              ...(n.removed === true ? { removed: true } : {}),
            })),
          };
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) throw new Error('workspace not found or not visible to you');
          throw error;
        }
      },
    },
  ];
}

function isInvalidFilter(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { error?: unknown }).error === 'invalid_filter';
}

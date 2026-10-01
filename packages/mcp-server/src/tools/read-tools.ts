import { z } from 'zod';
import { filterSpecSchema } from '@gisik-nokma/domain';
import type { Session } from '../session.js';

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler(args: Record<string, unknown>): Promise<unknown>;
};

/** `filter` is the domain schema, imported and not restated. It is `.strict()`,
 *  and its assignee/collaborator keys are SINGULAR — a caller passing an array
 *  is refused by the schema rather than silently matching nothing. */
const filterArg = filterSpecSchema.optional();

export function readTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_projects',
      description:
        'List the projects you can see inside one workspace. Reads the same workspace directory as ' +
        'list_workspaces — the server has no separate projects route — and returns an empty list for ' +
        'a workspace you cannot see.',
      inputSchema: { workspaceId: z.string().min(1) },
      handler: async (args) => {
        const workspaceId = z.string().min(1).parse(args['workspaceId']);
        const body = (await session.get('/v1/me/workspaces')) as {
          workspaces: { workspaceId: string; projects: { projectId: string; name: string }[] }[];
        };
        const match = body.workspaces.find((w) => w.workspaceId === workspaceId);
        return { workspaceId, projects: match?.projects ?? [] };
      },
    },
    {
      name: 'search_tickets',
      description:
        'Full-text search across the tickets you can see in one workspace. Returns at most 50 hits ' +
        'and has no pagination — narrow the query or the filter rather than expecting a next page. ' +
        'Use list_tickets when you need to enumerate.',
      inputSchema: {
        workspaceId: z.string().min(1),
        query: z.string().min(1).max(500),
        filter: filterArg,
      },
      handler: async (args) => {
        const parsed = z
          .object({ workspaceId: z.string().min(1), query: z.string().min(1).max(500), filter: filterArg })
          .parse(args);
        if (parsed.filter?.text !== undefined) {
          // Refused here rather than at the server, which answers a bare
          // `invalid_filter` that does not say which of the two text terms is
          // the problem.
          throw new Error(
            'search_tickets takes the search text as `query`; a `text` key inside `filter` is refused ' +
              'by the server. Pass one or the other, not both.',
          );
        }
        const search = new URLSearchParams({ workspaceId: parsed.workspaceId, q: parsed.query });
        if (parsed.filter !== undefined) search.set('filter', JSON.stringify(parsed.filter));
        return session.get(`/v1/search?${search.toString()}`);
      },
    },
    {
      name: 'list_tickets',
      description:
        'List tickets in one project, optionally grouped and filtered. `parentId` accepts the literal ' +
        'value "root" to mean top-level tickets only. Pages with `cursor`; the response carries ' +
        '`nextCursor` (null on the last page).',
      inputSchema: {
        projectId: z.string().min(1),
        groupBy: z.enum(['epic', 'status', 'assignee', 'type', 'flat']).optional(),
        filter: filterArg,
        parentId: z.string().min(1).optional(),
        cursor: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      handler: async (args) => {
        const parsed = z
          .object({
            projectId: z.string().min(1),
            groupBy: z.enum(['epic', 'status', 'assignee', 'type', 'flat']).optional(),
            filter: filterArg,
            parentId: z.string().min(1).optional(),
            cursor: z.string().min(1).optional(),
            limit: z.number().int().min(1).max(200).optional(),
          })
          .parse(args);
        const search = new URLSearchParams();
        if (parsed.groupBy !== undefined) search.set('groupBy', parsed.groupBy);
        if (parsed.parentId !== undefined) search.set('parentId', parsed.parentId);
        if (parsed.cursor !== undefined) search.set('cursor', parsed.cursor);
        if (parsed.limit !== undefined) search.set('limit', String(parsed.limit));
        if (parsed.filter !== undefined) search.set('filter', JSON.stringify(parsed.filter));
        const query = search.toString();
        return session.get(`/v1/projects/${encodeURIComponent(parsed.projectId)}/tickets${query === '' ? '' : `?${query}`}`);
      },
    },
    {
      name: 'get_ticket',
      description:
        'Read one ticket in full: its visibility row, its folded state (assignee, collaborators, ' +
        'custom fields, transition history), its title, who last moved it, its parent and its rollup. ' +
        'A ticket you cannot see is indistinguishable from one that does not exist — both answer not_found.',
      inputSchema: { workspaceId: z.string().min(1), ticketId: z.string().min(1) },
      handler: async (args) => {
        const parsed = z.object({ workspaceId: z.string().min(1), ticketId: z.string().min(1) }).parse(args);
        return session.get(
          `/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/tickets/${encodeURIComponent(parsed.ticketId)}`,
        );
      },
    },
  ];
}

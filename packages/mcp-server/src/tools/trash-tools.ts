import { z } from 'zod';
import type { Session } from '../session.js';
import { readDeleted } from './directory.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs } from './reads.js';

/** The tool that brings each kind of deleted thing back. */
const RESTORE_WITH: Record<string, string> = {
  ticket: 'restore_ticket',
  note: 'restore_note',
  project: 'undelete_project',
  workspace: 'undelete_workspace',
};

const KINDS = ['ticket', 'note', 'project', 'workspace'] as const;
const shape = { workspaceId: z.string().min(1).optional(), kinds: z.array(z.enum(KINDS)).min(1).optional(), ...pageArgs };

export function trashTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_deleted',
      description:
        'List what you have deleted and can still bring back (items stay for 15 days): tickets, notes, projects and workspaces. ' +
        'Narrow it with `workspaceId` and/or `kinds`. Each item names the tool that restores it in `restoreWith`. ' +
        'Pages with `cursor`; the response carries `nextCursor` (null on the last page).',
      inputSchema: shape,
      handler: async (args) => {
        const a = z.object(shape).parse(args);
        const items = (await readDeleted(session)).filter(
          (i) => (a.workspaceId === undefined || i.workspaceId === a.workspaceId) && (a.kinds === undefined || (a.kinds as string[]).includes(i.kind)),
        );
        const paged = page(items, a.cursor, a.limit);
        return { items: paged.items.map((i) => ({ ...i, restoreWith: RESTORE_WITH[i.kind] ?? null })), nextCursor: paged.nextCursor };
      },
    },
  ];
}

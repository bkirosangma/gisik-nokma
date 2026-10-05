import { z } from 'zod';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { readOrNotFound } from './reads.js';

/**
 * Knowledge Graph spec D §5.1: the graph and meaning READS. Every one calls the HTTP API, so the server's
 * visibility answers for it (`reads.ts`). D6's switch has no effect on any of them (§5.2 "Switch").
 */
const id = z.string().min(1);
const enc = encodeURIComponent;
const itemRef = z.object({ kind: z.enum(['ticket', 'note']), id });
const similarShape = { workspaceId: id, item: itemRef, k: z.number().int().min(1).max(20).optional() };

export function graphTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'similar',
      description:
        'The tickets and notes nearest to one item by MEANING (what they say, not the words they share), with a ' +
        'similarity score from 0 to 1. Up to k (default 10, at most 20), only items you can see. A ticket counts ' +
        'its comments. Items written in the last few seconds may not be indexed yet.',
      inputSchema: similarShape,
      handler: async (args) => {
        const a = z.object(similarShape).parse(args);
        const qs = `item=${enc(`${a.item.kind}:${a.item.id}`)}${a.k === undefined ? '' : `&k=${String(a.k)}`}`;
        return readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/similar?${qs}`, 'item');
      },
    },
  ];
}

import { z } from 'zod';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs } from './reads.js';
import { envelopeFor, submitOne } from './submit.js';
import { readTicket } from './ticket-tools.js';

const id = z.string().min(1);
const enc = encodeURIComponent;
const listShape = { workspaceId: id.optional(), projectId: id.optional(), ...pageArgs };
const ticketShape = { workspaceId: id, ticketId: id };
const discardShape = { ...ticketShape, confirm_name: z.string().optional() };

/** One row of `GET /v1/me/drafts`. Only these fields are ever answered. */
type MyDraftWire = {
  workspaceId: string;
  ticketId: string;
  projectId: string;
  projectName: string;
  title: string;
  typeId: string;
  parentId: string | null;
  updatedAt: string;
};

/** The three fields of a row of `GET /v1/workspaces/:id/drafts` that the erasure preview needs. */
export type WorkspaceDraftWire = { ticketId: string; parentId: string | null; attachmentCount: number };

/**
 * What discarding `rootId` erases besides the draft itself: every descendant draft and the attachments uploaded to the
 * draft and to them. A sibling's drafts are not in it. The `seen` set makes a corrupt `parentId` cycle end.
 */
export function eraseSetOf(drafts: readonly WorkspaceDraftWire[], rootId: string): { subDrafts: number; attachments: number } {
  const children = new Map<string, WorkspaceDraftWire[]>();
  for (const d of drafts) {
    if (d.parentId !== null) children.set(d.parentId, [...(children.get(d.parentId) ?? []), d]);
  }
  let attachments = drafts.find((d) => d.ticketId === rootId)?.attachmentCount ?? 0;
  let subDrafts = 0;
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    for (const child of children.get(next) ?? []) {
      if (seen.has(child.ticketId)) continue;
      seen.add(child.ticketId);
      subDrafts += 1;
      attachments += child.attachmentCount;
      queue.push(child.ticketId);
    }
  }
  return { subDrafts, attachments };
}

export function draftTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_my_drafts',
      description:
        'List your drafts: tickets only you can see, until you publish them. They have no key. Reads across every workspace you ' +
        'belong to; narrow it with `workspaceId` and/or `projectId`. Each draft names its project, type and parent. ' +
        'Pages with `cursor`; the response carries `nextCursor` (null on the last page).',
      inputSchema: listShape,
      handler: async (args) => {
        const a = z.object(listShape).parse(args);
        const q = new URLSearchParams();
        if (a.workspaceId !== undefined) q.set('workspaceId', a.workspaceId);
        if (a.projectId !== undefined) q.set('projectId', a.projectId);
        const qs = q.toString();
        const body = (await session.get(`/v1/me/drafts${qs === '' ? '' : `?${qs}`}`)) as { items: MyDraftWire[] };
        const paged = page(body.items, a.cursor, a.limit);
        return {
          // Named fields, never the row: whatever else the server sends stays on the server.
          items: paged.items.map((d) => ({
            workspaceId: d.workspaceId,
            ticketId: d.ticketId,
            projectId: d.projectId,
            projectName: d.projectName,
            title: d.title,
            typeId: d.typeId,
            parentId: d.parentId,
            updatedAt: d.updatedAt,
          })),
          nextCursor: paged.nextCursor,
        };
      },
    },
    {
      name: 'publish_draft',
      description:
        'Publish one of your drafts: it takes its key and joins the end of its project\'s Backlog, and everyone who can see the project ' +
        'can now see it. A draft whose parent is still a draft cannot be published until the parent is. The answer carries the new key.',
      inputSchema: ticketShape,
      handler: async (args) => {
        const a = z.object(ticketShape).parse(args);
        try {
          // The atomic publish route (drafts T5b), a one-id set: it derives the project, ranks the ticket in the same
          // transaction (T9), and records the act as the assistant's (`origin` defaults to `web` on that route).
          const out = (await session.post(`/v1/workspaces/${enc(a.workspaceId)}/drafts/publish`, { ticketIds: [a.ticketId], origin: 'mcp' })) as {
            results: Array<{ ticketId: string; key: string | null }>;
          };
          const row = out.results.find((r) => r.ticketId === a.ticketId);
          if (row === undefined) throw new Error('gisik-nokma published no ticket for this draft');
          return { ticketId: a.ticketId, key: row.key, published: true };
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          if (error.status === 404) throw new Error('draft not found or not visible to you');
          const refused = (error.body ?? {}) as { rule?: unknown; cause?: { rule?: unknown; reason?: unknown } };
          if (error.status === 409 && refused.rule === 'draft.publish-refused' && refused.cause !== undefined) {
            // The engine's own rule and sentence, spelled as `submitOne` spells a refusal.
            throw new Error(`refused by ${String(refused.cause.rule)}: ${String(refused.cause.reason)}`);
          }
          throw error;
        }
      },
    },
    {
      name: 'discard_draft',
      description:
        'Discard one of your drafts: it is erased, with its sub-drafts and the attachments uploaded to them, and cannot be recovered. ' +
        'confirm_name must be the draft\'s exact title; without it you get a preview of what would be erased and nothing changes. ' +
        'Only a draft can be discarded: use delete_ticket for a published ticket.',
      inputSchema: discardShape,
      handler: async (args) => {
        const a = z.object(discardShape).parse(args);
        const ticket = await readTicket(session, a.workspaceId, a.ticketId);
        if (ticket.ticketState.draft === undefined) {
          throw new Error('This ticket is not a draft. Use delete_ticket to remove a published ticket.');
        }
        const preview = await confirmOrPreview(ticket.title, a.confirm_name, async () => {
          const { items } = (await session.get(`/v1/workspaces/${enc(a.workspaceId)}/drafts`)) as { items: WorkspaceDraftWire[] };
          const { subDrafts, attachments } = eraseSetOf(items, a.ticketId);
          return {
            sentence: `Erases the draft "${ticket.title}", ${subDrafts} sub-drafts and ${attachments} attachments uploaded to them (permanently deleted). Linked notes are kept. This cannot be undone.`,
            counts: { subDrafts, attachments },
          };
        });
        if (preview !== null) return preview;
        await submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.discarded', {}));
        return { ticketId: a.ticketId, discarded: true };
      },
    },
  ];
}

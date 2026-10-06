import { z } from 'zod';
import { stateCategorySchema } from '@gisik-nokma/domain';

/**
 * THE SEAM FILE. Every route, wire shape and field name that Graph Parts 2 to 4 and the Drafts plan own is spelled
 * here and nowhere else in `packages/mcp-server`. A name that differs on the landed code is fixed in this file;
 * a piece that is MISSING is not built here (see the Part 5 plan's Global Constraints).
 */

/** Drafts T4 (G7): the server's ticket detail of the author's own draft carries `ticketState.draft = {authorId, at}` (probe S2). A published ticket has no such member. */
export function isDraftDetail(detail: { ticketState?: { draft?: unknown } }): boolean {
  return detail.ticketState?.draft !== undefined;
}

const enc = encodeURIComponent;

/** Graph Part 3: `GET /v1/workspaces/:ws/tickets/:id/flow` (spec §4, FL-1 to FL-3). Probe S4. */
export const FLOW_PATH = (workspaceId: string, ticketId: string): string => `/v1/workspaces/${enc(workspaceId)}/tickets/${enc(ticketId)}/flow`;

const at = z.string().min(1);
const passRecord = z.object({
  pass: z.number().int().min(1), outcome: z.string().nullable(), by: z.string(), at,
  revisions: z.array(z.object({ from: z.string().nullable(), to: z.string().nullable(), by: z.string(), at })),
});
/**
 * One node of a flow. `parentId` is required (publish_flow orders parents first); every id that can name another ticket is
 * nullable because the caller may not see it. A member the server adds and this schema does not name is stripped, so it can
 * never carry an id past `toFlowAnswer`.
 */
export const flowNodeSchema = z.object({
  id: z.string(), key: z.string().nullable(), draft: z.boolean(), title: z.string(), parentId: z.string().nullable(),
  kind: z.enum(['ticket', 'decision']),
  // the domain's category enum, imported and not restated: this seam relays a category and never reads what one means (29.150)
  state: z.object({ id: z.string(), name: z.string(), category: stateCategorySchema }),
  assigneeId: z.string().nullable(), waitForAll: z.boolean(),
  estimate: z.number().int().nullable(), reworkEstimate: z.number().int().nullable(), round: z.number().int().min(1),
  outcome: z.string().nullable(), passes: z.array(passRecord),
  // a hole's resolution has no outcome: the server withholds a hidden Decision's branch name with its id (29.449)
  resolution: z.object({ kind: z.literal('not-taken'), decisionTicketId: z.string().nullable(), outcome: z.string().optional(), pass: z.number().int() }).nullable(),
  alternates: z.array(z.object({ viaDecisionId: z.string().nullable(), outcome: z.string(), firstTicketId: z.string().nullable() })),
  periods: z.array(z.object({ start: at, end: at.nullable(), pass: z.number().int() })),
  planned: z.array(z.object({ pass: z.number().int(), start: z.string(), end: z.string(), basis: z.enum(['explicit', 'chained']), pruned: z.boolean() })),
  actual: z.object({ start: at, end: at.nullable() }).nullable(),
  tray: z.string().nullable(),
  notes: z.array(z.object({ id: z.string(), title: z.string() })),
});
export const flowWireSchema = z.object({
  flowId: z.string(), truncated: z.boolean(), start: z.array(z.string()), end: z.array(z.string()),
  nodes: z.array(flowNodeSchema),
  edges: z.array(z.object({ kind: z.enum(['leads_to', 'blocks']), from: z.string(), to: z.string(), label: z.string().nullable(), loop: z.boolean(), taken: z.number().int().min(0) })),
  autoMoves: z.array(z.object({ ticketId: z.string(), at, kind: z.enum(['led-to', 'reopened-by-flow', 'branch-not-taken']), becauseTicketId: z.string().nullable(), pass: z.number().int().nullable() })),
  draftCount: z.number().int().min(0),
});
export type FlowWire = z.infer<typeof flowWireSchema>;

/** A route's answer, parsed. A missing or mistyped member is a version mismatch between this tool and the server, said so (T3, T4, T5 use it too). */
export function parseWire<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, wire: unknown, what: string): T {
  const parsed = schema.safeParse(wire);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new Error(`the ${what} answer is not the shape this tool reads (${issue?.path.join('.') ?? 'unknown'}: ${issue?.message ?? 'invalid'}). This is a server mismatch, not something a retry fixes.`);
}

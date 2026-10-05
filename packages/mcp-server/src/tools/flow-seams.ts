/**
 * THE SEAM FILE. Every route, wire shape and field name that Graph Parts 2 to 4 and the Drafts plan own is spelled
 * here and nowhere else in `packages/mcp-server`. A name that differs on the landed code is fixed in this file;
 * a piece that is MISSING is not built here (see the Part 5 plan's Global Constraints).
 */

/** Drafts T4 (G7): the server's ticket detail of the author's own draft carries `ticketState.draft = {authorId, at}` (probe S2). A published ticket has no such member. */
export function isDraftDetail(detail: { ticketState?: { draft?: unknown } }): boolean {
  return detail.ticketState?.draft !== undefined;
}

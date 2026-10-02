import type { BoardView } from '@gisik-nokma/app-core';

/**
 * The workflow a ticket's sheet can start reading before the ticket itself lands (smoothness T7 F3, plan Task 7
 * Step 3): the group of the board card the ticket sits on. The sheet is URL-driven (`?ticket=`), so the hint is
 * read off the board at the mount rather than handed through `openTicket`'s navigation — which also serves a
 * reload, a Back press and a link. `undefined` when the board does not hold the ticket (the backlog, the list):
 * the sheet then waits for its own read, as it always did.
 */
export function ticketSheetHint(
  view: BoardView | null,
  ticketId: string,
): { workflowId: string; workflowVersion: number } | undefined {
  const group = view?.groups.find((candidate) => candidate.columns.some((column) => column.cards.some((card) => card.ticketId === ticketId)));
  return group === undefined ? undefined : { workflowId: group.workflowId, workflowVersion: group.workflowVersion };
}

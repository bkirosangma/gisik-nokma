import type { HttpClient } from '@gisik-nokma/app-core/online';

/**
 * Where a ticket lives, so the inbox can open it.
 *
 * ## Why this file exists at all — the plan's deep link names a route that is not here
 *
 * Task 14's sketch opens a notification with `router.push('/tickets/${id}')`,
 * under a Guard that says "match Plan 6's ticket route — the same path its Board
 * cards push". Measured: this shell has **no `/tickets` route** (`app/` holds
 * `invite/[token]`, `sign-in`, `w/[workspaceId]/…`, `workspaces` and now
 * `inbox`), and a Board card does not push a path at all — the ticket SHEET is a
 * `?ticket=` query parameter on the project page
 * (`app/w/[workspaceId]/p/[projectId]/page.tsx`: `router.push(`/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`)`).
 * Shipping the sketch verbatim would have given every inbox row a 404.
 *
 * That real URL needs a **projectId**, and a `Notification` does not carry one:
 * `packages/domain/src/notifications.ts` puts `workspaceId` on the row and every
 * one of the five payloads carries a `ticketId` and no project. So the shell has
 * to ask. `app/my-work/page.tsx` (My work, global since my-work-global T4) hits the same wall and answers
 * it the only way it can — it resolves the project out of the row it already
 * holds, falling back to THIS gateway for a ticket no row carries (owner
 * request 2026-09-23: a My Work click opens the sheet on My Work, so the sheet's
 * project-scoped props have to come from the open ticket) — and the inbox holds
 * no such row at all.
 *
 * ## Deliberately NOT a `DataSource` method, and not `getTicket`
 *
 * **⚠ CORRECTED 2026-09-20 — this paragraph read *"`DataSource.getTicket` exists
 * and **refuses**: `mapTicketRead` throws `ServingGapError` because a `TicketRead`
 * wants a `title`, a `stateProvenance` and a domain `TicketState`, and the route
 * answers a snake_case `proj_visibility` row with none of them (`online/mappers.ts`)."*
 * That was true when written (`e09666ce`, 2026-09-04) and was falsified two days
 * later by ruling P25 clause 1 (`c86c4b5c`, 2026-09-06), which served all three:
 * `getTicket` maps through `mapTicketRead` and answers.** The superseded wording is
 * kept rather than deleted because the DECISION below outlives the reason it was
 * first given — `getTicket` answers a WHOLE ticket read, and this file asks a
 * strictly SMALLER question, one the route answers completely: *which project is
 * this ticket in?*
 * `project_id` is a column of the row the route already serves, so nothing is
 * derived, defaulted or reconstructed here. A gateway beside `DataSource` is the
 * shape this shell already uses for a one-shot action no replica serves offline
 * (`providers.tsx` argues it for invites, founding and authoring), and Plan 10's
 * replica knows its own tickets' projects without asking anybody.
 *
 * ## `null` is an answer, not a failure
 *
 * `createHttpClient` maps a 404 on a GET to `null`, and this route answers one
 * frozen 404 both for a ticket that does not exist and for one this viewer may
 * not see (`routes/tickets.ts`) — deliberately, so a stranger cannot use the
 * status as an existence oracle. This gateway keeps that indistinguishable and
 * answers `null`, so the caller says "this cannot be opened from here" rather
 * than guessing which of the two it was. A 401 still throws, because a session
 * that ended is a different event with a different remedy.
 */
export type TicketLocation = { workspaceId: string; projectId: string };

export type TicketLocator = {
  /** The ticket's project, or `null` when the server will not place it for this viewer. */
  locate(workspaceId: string, ticketId: string): Promise<TicketLocation | null>;
};

export function createHttpTicketLocator(http: HttpClient): TicketLocator {
  return {
    async locate(workspaceId: string, ticketId: string): Promise<TicketLocation | null> {
      const raw = await http.get(
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/tickets/${encodeURIComponent(ticketId)}`,
      );
      if (raw === null) return null;
      /**
       * Read narrowly and refuse a shape that is not the one documented above,
       * rather than casting. `project_id` is snake_case on the wire — this is a
       * `proj_visibility` row, not a client view model — and a `?? ''` here
       * would build `/w/ws/p/?ticket=…`, a URL that routes nowhere and looks
       * like it should.
       */
      const ticket = (raw as { ticket?: unknown }).ticket;
      if (typeof ticket !== 'object' || ticket === null) return null;
      const projectId = (ticket as { project_id?: unknown }).project_id;
      if (typeof projectId !== 'string' || projectId.length === 0) return null;
      return { workspaceId, projectId };
    },
  };
}

/** The one place the ticket-sheet URL is spelled outside the project page's own pushes. */
export function ticketSheetPath(location: TicketLocation, ticketId: string): string {
  return `/w/${location.workspaceId}/p/${location.projectId}?ticket=${ticketId}`;
}

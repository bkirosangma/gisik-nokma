import type { DataSource, DataSourceQuery } from '../data-source.js';
import type { FilterSpec, Grouping, ListRow, UserPreferences } from '../view-types.js';
import { HttpError, createHttpClient, type FetchLike, type HttpClient } from './http.js';
import {
  boardWorkspaceId,
  mapActors,
  mapAttention,
  mapWorkspaceSettings,
  mapBoardView,
  mapHistory,
  mapIngestResults,
  LIST_PAGE_CAP,
  LIST_PAGE_SIZE,
  LIST_TOO_LARGE_ABSENCE,
  ServingGapError,
  mapListPage,
  mapMyWork,
  mapPreferences,
  mapSearchHits,
  mapTicketAttachments,
  mapTicketComments,
  mapTicketRead,
  mapTicketTypes,
  mapWorkflowDef,
  mapWorkspaceRefs,
  rosterByActorId,
  toServerFilterSpec,
  toServerPreferences,
  type ListPage,
} from './mappers.js';
import { createStreamSubscriber, type WebSocketLike } from './stream.js';

/** The contract is 1..100 — `MAX_BATCH_SIZE` in `apps/server/src/routes/events.ts`. */
export const MAX_INGEST_BATCH = 100;

export type OnlineDataSourceDeps = {
  /** HTTP origin — '' when a shell proxies same-origin (Next rewrites). */
  baseUrl: string;
  /**
   * WS origin; defaults to `baseUrl`. Next dev does not proxy protocol upgrades,
   * so a shell must dial the server's own origin here rather than its own.
   *
   * **`apps/web` does exactly that** — `apps/web/src/providers.tsx:83` passes
   * `NEXT_PUBLIC_SERVER_URL`. This sentence read "no such shell exists yet" until
   * 2026-09-02; it was true when written and `apps/web` landed four commits later
   * on the same branch without it being revisited. A docblock naming an absence is
   * a claim with a shelf life.
   */
  streamBaseUrl?: string;
  fetchImpl?: FetchLike;
  webSocketFactory?: (url: string) => WebSocketLike;
  random?: () => number;
};

/**
 * The query string `GET /v1/projects/:projectId/tickets` actually accepts.
 *
 * **This is not the plan text's spelling, and the difference is measured rather
 * than stylistic.** The plan emits
 * `grouping=epic&q=gst&assignee=u1&assignee=u2&…`; the shipped route
 * (`routes/list.ts`) reads `groupBy`, `filter` (ONE JSON document parsed through
 * `filterSpecSchema`), `parentId`, `cursor` and `limit`, and answers 400
 * `invalid_filter` for anything else. Adapting a request spelling is exactly
 * what Plan 6's adaptation boundary puts inside `online/`.
 *
 * The plural→singular narrowing throws (`toServerFilterSpec`): a client asking
 * for two assignees has no request that expresses it, and silently sending the
 * first would answer a question the user did not ask while labelling it with the
 * one they did.
 */
export function listQueryString(filter: FilterSpec, grouping: Grouping): string {
  const params = new URLSearchParams();
  params.set('groupBy', grouping);
  const spec = toServerFilterSpec(filter);
  if (Object.keys(spec).length > 0) params.set('filter', JSON.stringify(spec));
  return params.toString();
}

/**
 * The online implementation of amendment 10's `DataSource`: HTTP + WS.
 *
 * ## ZERO of the THIRTEEN query methods REFUSE — the register is the record
 *
 * **⚠ CORRECTED 2026-09-20.** This heading read *"FOUR of the THIRTEEN query
 * methods REFUSE, and that is the design"*, and the paragraph under it named the
 * four: `getMyWorkspaces`, `getMyWork`, `search` and `getAttention`. The number
 * fell to zero one ruling at a time — **4** after ruling P25 clause 1
 * (`c86c4b5c`, 2026-09-06) served `getTickets` and `getTicket` (the list route
 * grew `typeRank`, `epicId`, `stateName`, `assignedProvenance` and
 * `hasRestrictedParent`; the single read grew the domain `TicketState`, the title,
 * the state provenance and the visible parent's title); **3** after P32/P38 served
 * `getMyWorkspaces`; **1** after P39/P40 served `getMyWork` and `getAttention`;
 * and **0** on 2026-09-19, when the owner ruled that the search QUERY must derive
 * `matchedIn` rather than the client guess it. `SERVING_GAPS` (`mappers.ts`) is
 * therefore EMPTY, and its own test pins that (3.39).
 *
 * What survives the count, and is why this section is kept rather than deleted:
 * while a method refused, it refused in `mappers.ts` with a `ServingGapError` that
 * ENUMERATED the facts the shipped routes did not serve and named who closed each,
 * because the alternative — returning a `TicketListView` whose `stateName` is the
 * state id, or a `MyWorkView` whose `contested` is `[]` — would put a view on
 * screen that is indistinguishable from an answer. **An empty register is not a
 * claim that no read is missing:** it says no MAPPER in `mappers.ts` refuses
 * outright, and a refusal that MOVES has its own home (`replica-data-source.ts`).
 * See the coordination doc's "Step 11 (Plan 6 remainder) — the `DataSource`
 * register, re-derived, and RULING REQUEST P25".
 *
 * ## Three methods take a `workspaceId` the plan's signature did not have
 *
 * `getMyWork`, `getPreferences` and `putPreferences` — P25 clause 2. Their
 * routes read `?workspaceId=` before the door and answer 400 `invalid_query`
 * without one, so the plan's zero-argument signatures could not form a request
 * at all. Ruling P24 already gave the shipped preferences DOCUMENT precedence
 * over Plan 6's; this is the same argument one layer out, at the signature.
 */
export function createOnlineDataSource(deps: OnlineDataSourceDeps): DataSource {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const http: HttpClient = createHttpClient(deps.baseUrl, fetchImpl);

  /**
   * The workspace roster, fetched fresh for every board read.
   *
   * NOT cached across calls, deliberately: a cached roster keeps naming somebody
   * whose membership was revoked, on a surface whose whole job is saying who
   * claimed what. A 404 (this caller may not read the roster — a guest gets one
   * from `door(..., 'no-guests')`) yields an EMPTY roster rather than
   * propagating, because "no name known" is what an empty roster means and it is
   * what `mapAssignee` already handles.
   */
  async function workspaceRoster(workspaceId: string): Promise<Map<string, string>> {
    const raw = await http.get(`/v1/workspaces/${workspaceId}/members`);
    return raw === null ? new Map() : rosterByActorId(mapActors(raw));
  }

  const query: DataSourceQuery = {
    getMyWorkspaces: async () => mapWorkspaceRefs(await http.get('/v1/me/workspaces')),

    /**
     * `[]` on a 404, and the asymmetry with `contested: []` is deliberate rather
     * than an oversight, so it is stated here.
     *
     * A workspace always has an owner, so "no members" is never true of a real
     * workspace — which is the shape of claim `mapMyWork` refuses to make about
     * contested claims. The difference is what the caller can do with it: this
     * route's 404 means "you may not read the roster" (a guest gets one from
     * `door(..., 'no-guests')`), the roster's ONLY consumer here is the display-
     * name join, and an empty roster is exactly what "no name known" means to
     * `mapAssignee` — which then shows the actor id rather than pretending
     * nobody is assigned. A `contested: []` has no such reading: it goes
     * straight into a view as an assertion about the world. The plan sanctions
     * `[]`-on-404 for `getTicketHistory` explicitly and is silent here; this
     * follows it, narrowly, for a roster whose emptiness costs a name and not a
     * fact.
     */
    getMembers: async (workspaceId) => {
      const raw = await http.get(`/v1/workspaces/${workspaceId}/members`);
      return raw === null ? [] : mapActors(raw);
    },

    getBoard: async (projectId) => {
      const path = `/v1/projects/${projectId}/board`;
      const raw = await http.get(path);
      // `Promise<BoardView>` has no absence value, so the 404 the transport
      // turned into `null` has to become an exception again here — and it is
      // re-raised as the STATUS it was, not a bare `Error`, so a caller can tell
      // "no such project, or not yours" from a mapping failure. Every other
      // failure this module raises is a named class; this one is `HttpError`
      // because the server really did answer 404 and nothing was malformed.
      if (raw === null) throw new HttpError(404, path);
      // The join P25 sanctions: the board body carries `workspaceId`, and the
      // members route answers `{id, name}` for that workspace. Two shipped
      // routes, no invented fact.
      return mapBoardView(raw, await workspaceRoster(boardWorkspaceId(raw)));
    },

    /**
     * THE PAGING LOOP — ruling P41, Door B. This method answers the COMPLETE
     * row set for the project or it refuses; it never answers a page.
     *
     * `mapListPage` maps one page and hands back the server's cursor;
     * everything below decides when the list is finished. That division is the
     * point: the mapper cannot know whether a page is the whole project, and
     * `TicketListView` means the whole project — `views/list-model.ts` groups
     * it on that promise and `test/views/list-model.test.ts` enforces the
     * promise as a TYPE guard on `keyof TicketListView`. Assembling here is
     * what keeps that guard TRUE instead of something to route around.
     *
     * The alternative doors, and why P41 refused them, are argued at
     * `mapListPage`.
     *
     * ## The loop is BOUNDED and the bound REFUSES
     *
     * Past `LIST_PAGE_CAP` pages this throws `ServingGapError` with
     * `LIST_TOO_LARGE_ABSENCE` rather than returning what it has. Returning the
     * rows so far would be the original defect exactly — a page presented as a
     * project — just at 2000 rows instead of 50, and it would be HARDER to
     * notice for being bigger. The cap is a disclosed assumption, not a
     * measurement, and its own docblock says so.
     *
     * ## THE ASSEMBLED VIEW IS NOT A SNAPSHOT, and that is disclosed here
     *
     * Ten requests are ten transactions. A ticket that becomes visible to this
     * caller MID-WALK — a `proj_visibility` widening, or being added to the
     * project — with an id BELOW the cursor already passed is silently absent
     * from a view whose whole contract is "the complete row set", and that
     * contract is what licenses `list-model.ts` to group it. The window is
     * small and it self-heals on the next stream-triggered reload, and there is
     * no server-side snapshot cursor to close it with today.
     *
     * Written down rather than left for a reader to deduce, because the cap
     * above got a full disclosed-assumption docblock and this is the same class
     * of thing: an assumption the code depends on and cannot enforce. *Owner:
     * whoever gives the list route a consistent-read cursor, if the product
     * ever needs one.*
     *
     * ## The cursor is sent as a VALUE, and the server already takes one
     *
     * `routes/list.ts` binds `cursor` as a parameter (its docblock: "both
     * arrive from the caller and both are bound"), so nothing on the server
     * changes for this. `DataSourceQuery.getTickets` does NOT grow a cursor
     * parameter — P30 holds, and the whole reason the loop lives here is that
     * no caller should have to hold a position to get an answer.
     */
    getTickets: async (projectId, filter, grouping) => {
      const rows: ListRow[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < LIST_PAGE_CAP; page += 1) {
        // `limit` is SENT rather than inherited — see `LIST_PAGE_SIZE`. It is
        // the route's validated maximum, so the walk is four times shorter than
        // it would be at the server's default and the row bound is this
        // client's own arithmetic rather than another package's constant.
        const query = `${listQueryString(filter, grouping)}&limit=${LIST_PAGE_SIZE}`;
        const url =
          cursor === null
            ? `/v1/projects/${projectId}/tickets?${query}`
            : `/v1/projects/${projectId}/tickets?${query}&cursor=${encodeURIComponent(cursor)}`;
        const raw = await http.get(url);
        // A 404 becomes `null` here (`http.ts`, the read affordance), and a
        // `null` handed to the mapper would surface as "expected an object" — a
        // MAPPING failure for what was an HTTP one. The window matters more now
        // than it did: access revoked between page 3 and page 4 was impossible
        // when there was only ever a page 1. Raised as the STATUS it was,
        // exactly as `getBoard` does one method up.
        if (raw === null) throw new HttpError(404, url);
        const answered: ListPage = mapListPage(raw);
        rows.push(...answered.rows);
        if (answered.nextCursor === null) {
          return { projectId: answered.projectId, rows };
        }
        cursor = answered.nextCursor;
      }
      // Only reachable with a cursor still outstanding: the loop returns from
      // inside the moment the server says there is no more. So this is "more
      // pages exist than this client will fetch", never "we happened to stop".
      throw new ServingGapError('getTickets', [LIST_TOO_LARGE_ABSENCE]);
    },

    /**
     * The roster join, the same one `getBoard` makes and for the same reason:
     * this signature already names the workspace, so the display names are one
     * shipped route away. `getTickets` above gets an EMPTY roster instead —
     * neither its signature nor the list body names a workspace — and
     * `mapListPage`'s docblock argues why that degrades rather than lies.
     * (It was `mapListView` until ruling P41. This cross-reference is LIVE, so
     * it is repointed rather than left naming a symbol that no longer exists.)
     *
     * The roster is fetched only after a non-null body: a 404 here means "no
     * such ticket, or not yours", and fetching a roster for it would be a round
     * trip on behalf of an answer this method is about to give as `null`.
     */
    getTicket: async (workspaceId, ticketId) => {
      const raw = await http.get(`/v1/workspaces/${workspaceId}/tickets/${ticketId}`);
      return raw === null ? null : mapTicketRead(raw, await workspaceRoster(workspaceId));
    },

    getTicketHistory: async (ticketId, afterSeq, limit) => {
      const params = new URLSearchParams();
      if (afterSeq !== undefined) params.set('afterSeq', String(afterSeq));
      if (limit !== undefined) params.set('limit', String(limit));
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const raw = await http.get(`/v1/tickets/${ticketId}/history${suffix}`);
      return raw === null ? [] : mapHistory(raw);
    },

    /**
     * The attachments read — a 404 re-raised rather than folded into an empty
     * value.
     *
     * **⚠ CORRECTED 2026-09-20.** This read *"the ONE method in this file whose
     * 404 is re-raised rather than folded into an empty value"*, and that is
     * false: `getBoard` (`:168`), `getTickets` (`:243`), `getTicketTypes`
     * (`:331`) and `getPreferences` (`:439`) re-raise too — five sites, and
     * `getTicketTypes` argues the same choice at length for an array-returning
     * signature. Re-raising is this file's ordinary handling of "no such thing,
     * or not yours". What is particular here is the CONSEQUENCE of folding,
     * stated below and not shared with those four.
     *
     * `Promise<AttachmentListEntry[]>` HAS an absence value, `[]`, and using it
     * here is the trap this method exists to avoid. `[]` is the TRUE answer for
     * a visible ticket with no files, and `AttachmentList` renders `null` for
     * it — *"must not promise there are none"* — so folding a refusal into `[]`
     * would draw the same nothing for "this ticket has no attachments" and "we
     * could not read them". The two are exactly the states the sheet has to
     * tell apart, so a `null` body is raised as the STATUS it was, which is the
     * same decision `getBoard` makes one method family up and the opposite of
     * `getMembers`' and `getTicketHistory`'s `[]`-on-404, for their stated
     * reasons.
     */
    getTicketAttachments: async (workspaceId, ticketId) => {
      const path = `/v1/workspaces/${workspaceId}/tickets/${ticketId}/attachments`;
      const raw = await http.get(path);
      if (raw === null) throw new HttpError(404, path);
      return mapTicketAttachments(raw);
    },

    /**
     * The comment thread — a 404 re-raised, and the reason is the one directly
     * above, one read over.
     *
     * `TicketComment[]` HAS an absence value, `[]`, and the comments block draws
     * it as *"No comments yet."*. The route answers 404 for a ticket that is
     * invisible, deleted or nonexistent — the same answer to all three, by
     * design — so folding it into `[]` would print a sentence about the ticket
     * over a failure to read it. `[]` here means exactly one thing: this ticket
     * has no comments.
     */
    getTicketComments: async (workspaceId, ticketId) => {
      const path = `/v1/workspaces/${workspaceId}/tickets/${ticketId}/comments`;
      const raw = await http.get(path);
      if (raw === null) throw new HttpError(404, path);
      return mapTicketComments(raw);
    },

    getWorkflowDef: async (workspaceId, workflowId, version) => {
      const suffix = version === undefined ? '' : `?version=${version}`;
      const raw = await http.get(`/v1/workspaces/${workspaceId}/workflows/${workflowId}${suffix}`);
      return raw === null ? null : mapWorkflowDef(raw);
    },

    /**
     * The route that shipped and had no seam (Plan 6 Task 14 fix round).
     *
     * **404 is re-raised, and the alternative is the bug this method exists to
     * remove.** `Promise<TicketTypeDef[]>` has an absence value — `[]` — and it
     * would be a lie: this route answers the frozen `READ_NOT_FOUND_BODY` for
     * "not a member of this workspace" (`door(..., 'members-only')`,
     * `builder-reads.ts:534`), and `[]` reads as "this workspace defines no
     * ticket types". That is not merely wrong, it is impossible — Plan 4's
     * bootstrap materialises the four built-ins as real `ticket-type.defined`
     * events in every workspace from its first moment — so an empty answer would
     * be a claim no real workspace could ever produce, handed to a New-ticket
     * dialog which would then offer NO types at all. Same argument as
     * `getBoard`'s and `getPreferences`', and it is `HttpError` for the same
     * reason: the server really did answer 404 and nothing was malformed.
     */
    getTicketTypes: async (workspaceId) => {
      const path = `/v1/workspaces/${workspaceId}/ticket-types`;
      const raw = await http.get(path);
      if (raw === null) throw new HttpError(404, path);
      return mapTicketTypes(raw);
    },

    search: async (workspaceId, text, filter) => {
      const params = new URLSearchParams({ workspaceId, q: text });
      if (filter !== undefined) {
        const spec = toServerFilterSpec(filter);
        if (Object.keys(spec).length > 0) params.set('filter', JSON.stringify(spec));
      }
      return mapSearchHits(await http.get(`/v1/search?${params.toString()}`));
    },

    /**
     * ONE read plus the roster, because ruling P40 put the contested claims on
     * this route's own body. The alternative — joining `/v1/contests` here —
     * cannot be written: that route's `claimantId` is caller-supplied and this
     * source has no viewer id to supply (`getMyWork(workspaceId)` carries none,
     * P30 forbids widening `data-source.ts`, and the web shell builds this
     * source while its session is still pending), so an unfiltered read would
     * render every contest this viewer may SEE as their own.
     *
     * The roster is for `stateProvenance` — a `ClaimProvenance` names its actor
     * — and is fetched the same way `getBoard` fetches it, uncached, so a
     * revoked member stops being named. It does NOT feed the contested rows:
     * `ContestedClaimProvenance` has no `actorName` (ruling P39).
     */
    getMyWork: async (workspaceId) => {
      const [raw, roster] = await Promise.all([
        http.get(`/v1/me/work?workspaceId=${workspaceId}`),
        workspaceRoster(workspaceId),
      ]);
      return mapMyWork(raw, roster);
    },

    /**
     * TWO reads, and the join is the fourth item kind.
     *
     * `/v1/workspaces/:ws/attention` computes the three server-swept kinds;
     * `/v1/contests?workspaceId=&open=true` carries the contested ones, which
     * that sweep does not produce. Both are scoped to the same population — the
     * attention route filters by `visibleTicketsWhere` and the contests route
     * per row by `canSee`, neither by assignment — so the strip stays "everything
     * visible here that needs attention" with the fourth kind included rather
     * than silently missing.
     *
     * `open=true` because a settled contest needs no attention. It is the one
     * value that parameter accepts (`open=false` is a 400 by design), so this is
     * the filter applied, not a filter omitted.
     */
    getAttention: async (workspaceId) => {
      const [raw, contests, roster] = await Promise.all([
        http.get(`/v1/workspaces/${workspaceId}/attention`),
        http.get(`/v1/contests?workspaceId=${workspaceId}&open=true`),
        workspaceRoster(workspaceId),
      ]);
      return mapAttention(raw, contests, roster);
    },

    /**
     * The SAME route as `getAttention`, one key of it (second wave, Task 6).
     *
     * `/v1/workspaces/:ws/attention` is the only door that serves a workspace's
     * settings — `AttentionResponse.settings` is a sibling of its `items` — and
     * the server has sent it since Plan 5. This reads that key and nothing else,
     * which is why it does not call `mapAttention` and does not fetch the
     * contests list: neither has anything this method returns.
     *
     * The roster is read for the same reason `getAttention` reads it — so the
     * settings' `provenance` can name the person who claimed them rather than
     * printing a raw id. It is a second round trip this method could skip, and
     * deliberately does not: a settings screen that showed "someone" where the
     * name is known would be this client withholding a fact it has.
     *
     * `mapWorkspaceSettings` refuses a body without the three knobs, so a server
     * that stopped sending `settings` fails loudly here rather than rendering a
     * form full of defaults.
     */
    getWorkspaceSettings: async (workspaceId) => {
      const [raw, roster] = await Promise.all([
        http.get(`/v1/workspaces/${workspaceId}/attention`),
        workspaceRoster(workspaceId),
      ]);
      const record = raw as { settings?: unknown } | null;
      if (record === null || typeof record !== 'object') {
        throw new HttpError(200, `/v1/workspaces/${workspaceId}/attention`);
      }
      return mapWorkspaceSettings(record.settings, 'attention.settings', roster);
    },

    /**
     * The 404 is re-raised, for the same reason `getBoard`'s is and one more
     * that is specific to this route.
     *
     * `Promise<UserPreferences>` has no absence value. And the value the mapper
     * used to substitute — the empty document — is the SERVER'S OWN 200 answer
     * for a person who has never saved anything (`preferences/store.ts`), so
     * folding the 404 into it makes "you may not read this workspace"
     * indistinguishable from "you have never arranged anything here". A member
     * revoked mid-session would be shown stock columns and no saved filters and
     * given no way to tell that from their own settings. `requireMember` is the
     * only thing that answers 404 on this route once `workspaceId` is present
     * (`routes/preferences.ts` — a missing or repeated one is a 400), so the
     * status means exactly one thing and it is not "empty".
     */
    getPreferences: async (workspaceId) => {
      const path = `/v1/me/preferences?workspaceId=${workspaceId}`;
      const raw = await http.get(path);
      if (raw === null) throw new HttpError(404, path);
      return mapPreferences(raw);
    },

    putPreferences: async (workspaceId, preferences: UserPreferences) => {
      await http.put(
        `/v1/me/preferences?workspaceId=${workspaceId}`,
        toServerPreferences(preferences),
      );
    },
  };

  return {
    async ingest(events) {
      if (events.length === 0) return [];
      if (events.length > MAX_INGEST_BATCH) {
        throw new Error(
          `ingest batch of ${events.length} exceeds the contract maximum of ${MAX_INGEST_BATCH}`,
        );
      }
      return mapIngestResults(await http.post('/v1/events', { events }), events.length);
    },
    query,
    subscribe: createStreamSubscriber({
      baseUrl: deps.streamBaseUrl ?? deps.baseUrl,
      ...(deps.webSocketFactory === undefined ? {} : { webSocketFactory: deps.webSocketFactory }),
      ...(deps.random === undefined ? {} : { random: deps.random }),
    }),
  };
}

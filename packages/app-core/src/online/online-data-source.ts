import type { DataSource, DataSourceQuery } from '../data-source.js';
import type { FilterSpec, Grouping, UserPreferences } from '../view-types.js';
import { HttpError, createHttpClient, type FetchLike, type HttpClient } from './http.js';
import {
  boardWorkspaceId,
  mapActors,
  mapAttention,
  mapBoardView,
  mapHistory,
  mapIngestResults,
  mapListView,
  mapMyWork,
  mapPreferences,
  mapSearchHits,
  mapTicketRead,
  mapTicketTypes,
  mapWorkflowDef,
  mapWorkspaceRefs,
  rosterByActorId,
  toServerFilterSpec,
  toServerPreferences,
} from './mappers.js';
import { createStreamSubscriber, type WebSocketLike } from './stream.js';

/** The contract is 1..100 — `MAX_BATCH_SIZE` in `apps/server/src/routes/events.ts`. */
export const MAX_INGEST_BATCH = 100;

export type OnlineDataSourceDeps = {
  /** HTTP origin — '' when a shell proxies same-origin (Next rewrites). */
  baseUrl: string;
  /** WS origin; defaults to baseUrl. Next dev cannot proxy WS, so a web shell would pass the server origin here — no such shell exists yet. */
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
 * ## Six of the THIRTEEN query methods REFUSE, and that is the design
 *
 * They refuse in `mappers.ts`, with a `ServingGapError` that ENUMERATES the
 * facts the shipped routes do not serve and names who closes each. The
 * alternative — returning a `TicketListView` whose `stateName` is the state id,
 * or a `MyWorkView` whose `contested` is `[]` — would put a view on screen that
 * is indistinguishable from an answer. See the coordination doc's "Step 11 (Plan
 * 6 remainder) — the `DataSource` register, re-derived, and RULING REQUEST P25".
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

    getTickets: async (projectId, filter, grouping) =>
      mapListView(
        await http.get(`/v1/projects/${projectId}/tickets?${listQueryString(filter, grouping)}`),
      ),

    getTicket: async (workspaceId, ticketId) => {
      const raw = await http.get(`/v1/workspaces/${workspaceId}/tickets/${ticketId}`);
      return raw === null ? null : mapTicketRead(raw);
    },

    getTicketHistory: async (ticketId, afterSeq, limit) => {
      const params = new URLSearchParams();
      if (afterSeq !== undefined) params.set('afterSeq', String(afterSeq));
      if (limit !== undefined) params.set('limit', String(limit));
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const raw = await http.get(`/v1/tickets/${ticketId}/history${suffix}`);
      return raw === null ? [] : mapHistory(raw);
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

    getMyWork: async (workspaceId) =>
      mapMyWork(await http.get(`/v1/me/work?workspaceId=${workspaceId}`)),

    getAttention: async (workspaceId) =>
      mapAttention(await http.get(`/v1/workspaces/${workspaceId}/attention`)),

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

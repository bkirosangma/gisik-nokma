/**
 * The `@gisik-nokma/app-core/online` subpath: the ONE module in this package
 * that speaks HTTP or WebSocket (coordination amendment 10). The web shell WILL
 * consume it — `apps/web` does not exist yet (`apps/` holds `server/` alone), so
 * this subpath has no consumer today beyond its own tests. Nothing under
 * `src/views/` may consume it whether or not that shell arrives, and
 * `test/no-http-in-views.test.ts` enforces that against the checked-in source.
 *
 * `./invites.js` (Plan 6 Task 15) is deliberately NOT re-exported yet — the file
 * does not exist, and an export line for it would break every consumer of this
 * subpath for the sake of a promise.
 */
export { HttpError, createHttpClient, type FetchLike, type HttpClient } from './http.js';
export {
  MappingError,
  SERVING_GAPS,
  ServingGapError,
  UnexpressibleFilterError,
  boardWorkspaceId,
  mapActors,
  mapAttention,
  mapBoardView,
  mapHistory,
  mapIngestResults,
  mapListView,
  mapMyWork,
  mapPreferences,
  mapProvenance,
  mapRollup,
  mapSearchHits,
  mapTicketRead,
  mapWorkflowDef,
  mapWorkspaceRefs,
  rosterByActorId,
  toClientFilterSpec,
  toServerFilterSpec,
  toServerPreferences,
  type Absence,
} from './mappers.js';
export {
  MAX_INGEST_BATCH,
  createOnlineDataSource,
  listQueryString,
  type OnlineDataSourceDeps,
} from './online-data-source.js';
export {
  BACKOFF_CAP_MS,
  BACKOFF_INITIAL_MS,
  backoffDelayMs,
  createStreamSubscriber,
  parseFrame,
  streamUrl,
  type StreamDeps,
  type WebSocketLike,
} from './stream.js';

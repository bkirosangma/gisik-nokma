/**
 * The `@gisik-nokma/app-core/online` subpath: the ONE module in this package
 * that speaks HTTP or WebSocket (coordination amendment 10). Nothing under
 * `src/views/` may consume it, and `test/no-http-in-views.test.ts` enforces that
 * against the checked-in source.
 *
 * ## Two sentences here were true when they were written and are not now
 *
 * This docblock used to say that `apps/web` "does not exist yet (`apps/` holds
 * `server/` alone)", so "this subpath has no consumer today beyond its own
 * tests", and that `./invites.js` was held back because "the file does not
 * exist". Task 14 built `apps/web` and it is this subpath's consumer; Task 15
 * built `./invites.js` and the export line below is the promise being kept.
 * Both sentences are corrected rather than deleted, because the reason the
 * export was withheld — an export line for a file that does not exist breaks
 * every consumer of the subpath — is still the rule, and a reader who finds no
 * trace of it will withhold nothing next time.
 *
 * ## The three ONBOARDING gateways are deliberately not `DataSource` methods
 *
 * `invites.js`, `invites-admin.js` and `founding.js` are one-shot onboarding
 * actions no replica ever serves offline. `DataSource` is the contract Plan 10's
 * replica must ALSO satisfy; putting founding or acceptance in it would oblige
 * that replica to implement something it can only refuse. Each file's docblock
 * carries the argument, and `invites-admin.js` carries the matching one for the
 * revoke that is deliberately NOT there — it is an ordinary `invite.revoked`
 * through `DataSource.ingest`.
 */
export { HttpError, createHttpClient, refusalText, type FetchLike, type HttpClient } from './http.js';
export {
  InviteAcceptanceError,
  createHttpInviteGateway,
  type InviteGateway,
  type InviteSummary,
} from './invites.js';
export {
  InviteAdminError,
  createHttpInviteAdminGateway,
  type InviteAdminGateway,
  type MintInviteRequest,
  type MintedInvite,
  type PendingInvite,
} from './invites-admin.js';
export {
  FoundingError,
  createHttpFoundingGateway,
  type FoundingGateway,
} from './founding.js';
/**
 * The CALLER-scoped invitations gateway (Task 17). A FOURTH onboarding
 * gateway on the same argument as the three above: an offline replica cannot
 * know whether an invitation is still pending, because the answer depends on a
 * credential row and a clock that live only on the server.
 */
export {
  InvitationActionError,
  createHttpMyInvitationsGateway,
  type MyInvitationsGateway,
  type PendingInvitation,
} from './my-invitations.js';
/**
 * The inbox adapter, moved here 2026-09-07 from `apps/web/src/`. It belongs
 * beside the three above — it takes an `HttpClient` exactly as they do, imports
 * no React, no Next and no DOM, and its own docblock already named them as the
 * pattern it follows. Sitting in `apps/web` made it the ONE real gateway that
 * `apps/server`'s integration tests could not reach, which is the whole reason
 * Plan 9's consumer contract went unwitnessed while every sibling's was proven.
 * Unlike the three onboarding gateways, this one IS an interface Plan 10's
 * replica must also satisfy (`inbox/gateway.ts`), so it is an adapter for a
 * produced contract rather than a one-shot action.
 */
export { createHttpNotificationsGateway } from './notifications.js';
export {
  MappingError,
  LIST_PAGE_CAP,
  LIST_TOO_LARGE_ABSENCE,
  SERVING_GAPS,
  ServingGapError,
  UnexpressibleFilterError,
  boardWorkspaceId,
  mapActors,
  mapAttention,
  mapBoardView,
  mapHistory,
  mapIngestResults,
  mapListPage,
  mapMyWork,
  mapPreferences,
  mapProvenance,
  mapRollup,
  mapSearchHits,
  mapTicketRead,
  mapTicketTypes,
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

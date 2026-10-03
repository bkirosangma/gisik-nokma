/**
 * The data layer without a single view (smoothness T10, spec D6, audit SM-04; case 25.171, 25.175).
 *
 * The web shell's `Providers`, its session-expiry handling and its authoring gateway need the read/write seam, the cache, the
 * in-flight dedupe and the session-expired vocabulary on EVERY route, sign-in included. Imported from the root barrel they dragged
 * in every view, the workflow canvas (`@xyflow/react`) and the manual's text too: 471 KB gzip on a page with one form. This subpath
 * names exactly what the shell needs and nothing that renders; `apps/web/test/import-graph.test.ts` walks its static imports and
 * fails on a view, the canvas or the manual.
 *
 * Types are free (they emit no edge), so the gateway shapes are re-exported from the modules that define them.
 */
export * from './data-source.js';
export { createClientStateCache, type ClientStateCache } from './cache.js';
export { withCacheFeed } from './cache-feed.js';
export { withInflightDedupe } from './inflight-dedupe.js';
export { makeSubmittedFactory, type EnvelopeSeed, type MakeSubmitted } from './submit.js';
export { precheckEvent } from './precheck.js';
export { SESSION_EXPIRED_COPY, SessionExpiredError, writeFailureCopy, writeFailureRefusalClass } from './session-expired.js';
export {
  clearLiveQueryCache,
  forgetLiveQuery,
  liveQueryAgeMs,
  recallLiveQuery,
  rememberLiveQuery,
  staleWorkspaces,
} from './views/live-query-cache.js';
export { scheduleReload, subscribeReloads } from './views/reload-scheduler.js';
// The one authoring class the shell's gateway constructs: `gateway.ts` imports types only, so it carries no canvas.
export { AuthoringReadRefused } from './workflow-builder/gateway.js';
export type { UserPreferences } from './view-types.js';
export type { NotificationsGateway } from './inbox/gateway.js';
export type { NotificationPreferencesGateway } from './account/notification-preferences-gateway.js';
export type { MigrationOutcome, MigrationRequest, WorkflowAuthoringGateway } from './workflow-builder/gateway.js';

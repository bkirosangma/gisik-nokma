/**
 * The root barrel. Deliberately narrow: the ONE storage interface, the local
 * schema, and the replica — and nothing that reaches a native module or a test
 * framework. The better-sqlite3 engine and the conformance suite live behind
 * the `./testing` subpath — see `src/testing.ts`. Tauri (Task 16) and Expo
 * (Task 17) import this entry, so the exports below are named one by one
 * rather than star-exported: a `export *` would silently widen the barrel the
 * next time a module in this package grows a new export.
 */
export type { SqlRow, SqlValue, SyncStorage } from './storage/storage.js';
export { LOCAL_SCHEMA_VERSION, migrateLocal } from './storage/schema.js';
export { buildLocalDeps, workflowVersionsOf } from './replica/local-deps.js';
export { isSyncInstruction } from './replica/sync-item.js';
export type {
  PurgeInstruction,
  ScopeRevokedInstruction,
  SyncInstruction,
  SyncItem,
} from './replica/sync-item.js';
export { createReplica } from './replica/replica.js';
export type {
  BootstrapResponse,
  BootstrapTicket,
  LocalContest,
  Me,
  Replica,
  ReplicaTicket,
} from './replica/replica.js';
export { buildLocalEngineContext, buildPendingOverlay } from './precheck/local-context.js';
export type { LocalContextDeps, PendingOverlay } from './precheck/local-context.js';
export { backoffMs, createOutbox } from './outbox/outbox.js';
export type { EnqueueResult, Outbox, OutboxItem, PendingTicket, SyncEventResult } from './outbox/outbox.js';

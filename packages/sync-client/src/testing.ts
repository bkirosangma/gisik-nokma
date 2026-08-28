/**
 * Test-and-harness surface — the `./testing` subpath.
 *
 * Everything here reaches something an app bundle must never see: a native
 * node addon (better-sqlite3) or a test framework (vitest). Nothing in this
 * file may be re-exported from `src/index.ts`; `test/barrel.test.ts` is the
 * guard that keeps that true.
 */
export { createBetterSqliteStorage } from './storage/better-sqlite3.js';
export { storageConformanceTests } from './storage/conformance.js';

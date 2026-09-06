import type { LedgerEvent, ReachGrantedTicket } from '@gisik-nokma/domain';

/**
 * What sync-down hands a replica — the CLIENT-SIDE MIRROR of
 * `apps/server/src/visibility/visible-events-for.ts`.
 *
 * ## FOUR members, not two
 *
 * *This heading said "Three members" until closure 5b added `reach-granted`
 * (ruling P37.1). The count is kept accurate rather than generalised away,
 * because the whole point of the section below is that a reader who trusts a
 * SMALLER count drops an instruction — which is what happened to
 * `scope-revoked`.*
 *
 * Plan 10 Task 9's own Interfaces list names only `SyncItem` and
 * `PurgeInstruction`, and Plan 4 Task 11's header pins the union at those two.
 * The shipped server type has THREE members, and the server file says in its
 * own words why the two-member reading is dangerous: *"a consumer written to
 * the header alone treats a `scope-revoked` as neither a purge nor an envelope
 * and silently drops the one instruction that tells a removed device to empty
 * itself."* A replica that dropped it would keep showing a guest work they were
 * revoked from, offline, forever.
 *
 * So this file states all three, and `applyServerItem` discriminates all three.
 *
 * ## Why it is mirrored rather than imported
 *
 * `@gisik-nokma/sync-client` cannot depend on `apps/server` — the whole point
 * of the package is that Expo and Tauri can import it. There is no shared home
 * for these types today: they live in the server's visibility module, and both
 * sides depend on `@gisik-nokma/domain`, which is where they would belong.
 * **RECORDED, not fixed here**: moving `PurgeInstruction` /
 * `ScopeRevokedInstruction` / `SyncItem` into `@gisik-nokma/domain` so the
 * server and this package share one declaration. *Owner: Plan 10 Task 11 (the
 * sync engine), which consumes the same union over the wire and would other-
 * wise inherit a third copy.* Until then this is a mirror, and a mirror can
 * drift silently — it is a wire contract with no compile-time link.
 *
 * **TASK 11 DID NOT INHERIT A THIRD COPY, AND THAT MUCH IS ENFORCED.**
 * `net/http-transport.ts` translates the wire into THESE types and declares no
 * frame union of its own; the executor ruling deferring `ServerStreamFrame` →
 * `ServerStreamFrame` forbids one, and the transport carries a compile-time
 * assertion that every member of `@gisik-nokma/domain`'s `ServerStreamFrame`
 * has a branch (verified by deletion: dropping one makes `typecheck` red with
 * `TS2344: Type 'false' does not satisfy the constraint 'true'`). So the
 * INSTRUCTION half of the union is now linked to the published wire
 * declaration by the compiler, at the one place the wire is read.
 *
 * What is still unlinked is the shapes themselves: `PurgeInstruction` and
 * `ScopeRevokedInstruction` above are structural copies of
 * `apps/server/src/visibility/visible-events-for.ts:84` and `:127`, and nothing
 * fails if one side grows a field. Moving them is a bigger job than the
 * `SyncEventResult` move costed in `outbox/outbox.ts` — `visible-events-for.ts`
 * is the server's visibility core, not a two-file route — so it is recorded and
 * not attempted. *Owner: still open.*
 *
 * ## Discriminating it
 *
 * `entity.kind` is NESTED, so a top-level `'kind' in item` is a sound test for
 * "this is not an envelope". That is the server file's rule, restated here
 * because this is where the client reads it.
 */

/** One entity is gone: delete every local trace of it. */
export type PurgeInstruction = { kind: 'purge'; entityId: string };

/**
 * "Everything you held in this scope is gone" — what a device receives at a
 * scope-revocation boundary instead of one purge per ticket. Per-id purges
 * would tell the recipient how many tickets existed in the scope, including
 * ids they never held. `projectId` absent means the whole workspace went.
 *
 * Handling is a local delete by scope, so it is idempotent exactly as a purge
 * is: every statement is a delete, and a re-delivered instruction changes
 * nothing.
 */
export type ScopeRevokedInstruction = { kind: 'scope-revoked'; workspaceId: string; projectId?: string };

/**
 * "Your reach grew; here are the ids it now admits." Ruling P37.1, closure
 * 5b(d) — the pull-shaped replacement for the grant-side history burst.
 *
 * The replica's handling is deliberately small: record the ids it does NOT
 * already hold as owed, and stop. It cannot pull — it has no transport — so
 * fetching is the sync engine's job, and keeping the split means the replica
 * stays a store rather than becoming a second client.
 *
 * `tickets` may name tickets this device already holds — the server does not
 * model a device's holdings and must not start. Each entry carries the ticket's
 * HEAD SEQ (ruling P37.2), which is what lets the client tell a copy it holds
 * COMPLETELY from a stale partial one. An id-only notice could not: holding a
 * ticket says nothing about holding all of it.
 */
export type ReachGrantedInstruction = { kind: 'reach-granted'; workspaceId: string; tickets: ReachGrantedTicket[] };

export type SyncItem = LedgerEvent | PurgeInstruction | ScopeRevokedInstruction | ReachGrantedInstruction;

/** The two members that carry a top-level `kind`. */
export type SyncInstruction = PurgeInstruction | ScopeRevokedInstruction | ReachGrantedInstruction;

/**
 * `true` when `item` is an instruction rather than an event envelope.
 *
 * Written as a predicate so the narrowing lives in one place: a call site that
 * spells `'kind' in item` inline gets the same narrowing, but only this
 * function can be pointed at when the union grows.
 */
export function isSyncInstruction(item: SyncItem): item is SyncInstruction {
  return 'kind' in item;
}

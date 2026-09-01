import type { EntityKind, LedgerEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { canSee } from './can-see.js';

/**
 * "This ticket is gone — delete whatever you hold for it."
 *
 * Emitted when something in the streamed range took a ticket AWAY from this
 * user. It is not an assertion that the ticket was deleted: the ticket may be
 * alive and being worked on by people who can still see it. It says only that
 * this replica may no longer hold it.
 */
export interface PurgeInstruction {
  kind: 'purge';
  entityId: string;
}

/**
 * "Everything you held in this scope is gone" — one instruction instead of one
 * purge per ticket (owner decision 2026-08-27).
 *
 * Per-id purges tell the recipient how many tickets a scope contained,
 * INCLUDING ids they never held. For someone still standing inside the
 * workspace that is a minor count-leak, consistent with the restricted-parent
 * existence-leak spec §6 already accepts (case 6.14). For someone who has just
 * been put OUT of the workspace, or who is only a guest in it, it is an
 * external party learning the size of work they were never shown, and losing
 * access is not a thing that should teach them it. The ticket list is not even
 * COMPUTED on those paths, so nothing counts it.
 *
 * The replica's handling is a local delete by scope, so it is idempotent in the
 * same way a purge is.
 */
export interface ScopeRevokedInstruction {
  kind: 'scope-revoked';
  workspaceId: string;
  /** Absent means the whole workspace went. */
  projectId?: string;
}

/**
 * What sync-down hands a replica.
 *
 * **THREE members, and the plan's Interfaces section documents a two-way
 * discriminator.** Plan 4's Task 11 header pins `SyncItem = LedgerEvent |
 * PurgeInstruction` and tells the consumer to discriminate with
 * `'kind' in item && item.kind === 'purge'`; `ScopeRevokedInstruction` arrived
 * in the same task's implementation text and is not in that sentence. A
 * consumer written to the header alone treats a `scope-revoked` as neither a
 * purge nor an envelope and silently drops the one instruction that tells a
 * removed device to empty itself.
 *
 * So the discrimination rule is stated HERE, where the type is:
 *
 * ```ts
 * if ('kind' in item) {
 *   if (item.kind === 'purge') …          // one ticket
 *   else …                                 // item.kind === 'scope-revoked'
 * } else … // a LedgerEvent — envelopes have no top-level `kind`
 * ```
 *
 * `entity.kind` is NESTED, so `'kind' in item` is a sound test for an envelope.
 * Recorded as a cross-plan finding, owner Plan 10 — that plan codes against
 * this contract without reading this file.
 */
export type SyncItem = LedgerEvent | PurgeInstruction | ScopeRevokedInstruction;

/** The event types that can move a ticket, or a subtree under it, out of view. */
const VISIBILITY_AFFECTING: ReadonlySet<string> = new Set(['visibility.set', 'ticket.reparented']);

/**
 * Who an event about this entity kind is for, before any per-ticket question is
 * asked.
 *
 * ## The bare switch is the fail-closed guard, and it is load-bearing
 *
 * No `default`. The `AudienceClass` return annotation does the work: an
 * `EntityKind` no `case` names falls out of the switch, the function ends
 * without returning, and tsc refuses it with TS2366 — the same shape
 * `canSeeResolved` uses and for the same reason. Measured, not asserted:
 * adding a member to `ENTITY_KINDS` raises TS2366 *here*.
 *
 * Without it, a new entity kind added by a later plan would fall through the
 * caller's `switch` and be silently DROPPED from every replica's stream — or,
 * had the caller been written with a permissive `default`, silently SENT to
 * everyone. Both are decided at compile time instead.
 *
 * Do not add a `default:` to quiet a linter. That restores exactly the silent
 * fall-through this shape exists to prevent.
 */
type AudienceClass = 'ticket' | 'roster' | 'workspace' | 'definition' | 'withheld';

function audienceClassOf(kind: EntityKind): AudienceClass {
  switch (kind) {
    case 'ticket':
      return 'ticket';
    case 'membership':
    case 'project':
      // The roster: who is in the workspace, who is on which project. Both
      // kinds carry a LOSS branch naming a user, and both go to non-guests.
      return 'roster';
    case 'workspace':
      return 'workspace';
    case 'workflow':
    case 'ticket-type':
      return 'definition';
    case 'invite':
      // WITHHELD FROM EVERYONE on this branch, deliberately fail-closed.
      // `invite.sent` carries an email address — PII — and Plan 4's own
      // reserved case 6.38 says it reaches owners and admins in sync-down and
      // nobody else. That role split is not built here (its file,
      // `test/sync/visible-events.test.ts`, does not exist on this branch), and
      // shipping the event to every member in the meantime would disclose the
      // address the case exists to protect. Sending nothing costs a replica an
      // invite list it has no screen for yet.
      // *Owner: Plan 4 Task 13 (invites), case 6.38.*
      return 'withheld';
  }
}

/** The `userId` a roster payload names, or `undefined` if it names none. */
function subjectOf(env: LedgerEvent): string | undefined {
  const payload = env.payload as { userId?: unknown } | null;
  const subject = payload?.userId;
  return typeof subject === 'string' ? subject : undefined;
}

/**
 * Reads the ROW's payload rather than minting an envelope from it: this runs
 * over every row in the window for anyone whose role is null, including every
 * stranger who polls, and `rowToEnvelope` would allocate a full envelope and
 * two `.toISOString()` calls per row to answer a question about one field.
 */
function isRevocationOf(row: EventRow, userId: string): boolean {
  const payload = row.payload as { userId?: unknown } | null;
  return (
    row.entity_kind === 'membership' &&
    row.type === 'membership.revoked' &&
    payload?.userId === userId
  );
}

/**
 * `ticketId` plus every INHERITING descendant under it that this user cannot
 * see now. The walk prunes at authored descendants, exactly like
 * re-resolution: their audience is their own and cannot have changed from
 * above.
 *
 * ## The prune is an optimisation; the safety comes from `canSee`
 *
 * Recorded because Plan 4 already learned it once, on the projection side
 * (case 6.10): deleting the `own_mode === 'inherit'` test leaves this
 * function's results IDENTICAL, because walking into an authored subtree
 * re-asks `canSee`, which re-derives the audience that subtree already had.
 * The property "an authored subtree is not purged by its ancestor's
 * revocation" is enforced by `canSee`, not by this line, and case 6.90 asserts
 * that property rather than the line. Nothing here can pin the prune, and a
 * test claiming to would be passing for a reason unrelated to the property it
 * named.
 *
 * ## The `seen` guard is NOT the same kind of line, and it is load-bearing
 *
 * The parent graph on this branch **can contain a cycle** and nothing refuses
 * one: case 6.58 measures `A → B → A` arriving through a `ticket.reparented`,
 * states that Plan 3's reparent command does not exist yet and the permission
 * gate does not look at ancestry, and calls the cycle reachable today. This
 * walk descends `parent_id`, so a cycle is not a wrong ANSWER here, it is
 * unbounded recursion on a request path — a hang inside the generator that
 * serves sync-down, reached from data the projection already admits. The
 * projection itself terminates on a cycle (6.58 pins that); this function has
 * to terminate for its own reasons, and the guard is what does it. Case 6.99
 * builds the cycle and mutating the guard away reddens it.
 */
async function nowInvisibleInheritSubtree(
  db: Queryable,
  userId: string,
  ticketId: string,
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = async (id: string): Promise<void> => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    if (!(await canSee(db, userId, id))) {
      out.push(id);
    }
    const result = await db.query<{ ticket_id: string; own_mode: string }>(
      'SELECT ticket_id, own_mode FROM proj_visibility WHERE parent_id = $1 ORDER BY ticket_id',
      [id],
    );
    for (const child of result.rows) {
      if (child.own_mode === 'inherit') {
        await walk(child.ticket_id);
      }
    }
  };
  await walk(ticketId);
  return out;
}

/**
 * What a person just lost.
 *
 * This is NOT the old `MembershipScope`: membership is workspace-scoped since
 * the 2026-08-27 collapse and its payload carries no scope at all. Which scope
 * went is computed from WHICH EVENT ARRIVED — `membership.revoked` → the
 * workspace, `project.member_removed` → that project — so the type lives here
 * beside the purge rather than in the vocabulary.
 */
type LostScope = 'workspace' | { projectId: string };

/** Every ticket in the lost scope this user cannot see now. */
async function nowInvisibleTicketsInScope(
  db: Queryable,
  userId: string,
  workspaceId: string,
  scope: LostScope,
): Promise<string[]> {
  const result =
    scope === 'workspace'
      ? await db.query<{ ticket_id: string }>(
          'SELECT ticket_id FROM proj_visibility WHERE workspace_id = $1 ORDER BY ticket_id',
          [workspaceId],
        )
      : await db.query<{ ticket_id: string }>(
          `SELECT ticket_id FROM proj_visibility
           WHERE workspace_id = $1 AND project_id = $2 ORDER BY ticket_id`,
          [workspaceId, scope.projectId],
        );
  const out: string[] = [];
  for (const row of result.rows) {
    if (!(await canSee(db, userId, row.ticket_id))) {
      out.push(row.ticket_id);
    }
  }
  return out;
}

/**
 * The sync-down visibility filter — the interface Plan 10 consumes.
 *
 * Streams the workspace's ledger past `afterSeq`, filtered against visibility
 * **as of now**: an event about a ticket this user cannot see now is never
 * yielded, and whatever a revocation inside the range took away comes back as a
 * tombstone. Backfilling a ticket's pre-cursor history when visibility is newly
 * GRANTED is Plan 10's job, on top of this primitive.
 *
 * ## `afterSeq` is the WORKSPACE cursor
 *
 * `workspace_seq`, never a per-entity `seq` (coordination §18). Every entity
 * restarts its own counter at 1, so ordering a workspace stream by it would
 * bury the early events of anything born after the cursor — a ticket created
 * today would have its first comment silently skipped forever. Callers hand
 * back the last `workspaceSeq` they were given and treat it as opaque.
 *
 * ## Membership is read through `resolveEffectiveRole`, never off the roster
 *
 * `membership.revoked` deletes the workspace-scope row alone; a project-scope
 * row SURVIVES it by design (`../projections/proj-memberships.ts`). So
 * `SELECT … WHERE scope_kind = 'project'` returns rows for people who are no
 * longer in the workspace at all, and `resolveEffectiveRole`'s early return —
 * no workspace role means an EMPTY project set — is the one thing standing
 * between that and a leak. Every membership question here goes through it.
 * There is also no way to fake one: `EffectiveRole` is branded with a
 * module-private symbol, so a hand-built value does not compile.
 *
 * ## A revoked user is told, and the plan's own code could not tell them
 *
 * The plan text opened with `if (eff.workspaceRole === null) return;` and put
 * the `membership.revoked` purge branch INSIDE the loop below it. Those two
 * lines cannot both run for the same person: a revocation deletes the
 * workspace row, so the revoked user's role IS null and the generator returned
 * before reaching the branch meant to serve them. A device belonging to someone
 * put out of the workspace would have received nothing at all and kept every
 * ticket it held, forever — the exact failure the tombstone exists to prevent.
 *
 * The discriminator between "revoked inside this range" and "never a member" is
 * the RANGE, not the role: a stranger's window contains no `membership.revoked`
 * naming them, and someone revoked BEFORE the cursor was already told. Case
 * 6.92 walks both.
 *
 * On that path the instruction is necessarily scope-level. Asking
 * `nowInvisibleTicketsInScope` for a null-role user would return EVERY ticket
 * in the workspace — the whole count, itemised, handed to someone now standing
 * outside it.
 *
 * ## What the filter does NOT hide
 *
 * A visible ticket's own payload travels intact, and `ticket.created` /
 * `ticket.reparented` name a `parentId` that may be a ticket this user cannot
 * see. That is not a leak this function opens: spec §6 and case 6.14 already
 * disclose exactly that much at the read door, where a visible child under an
 * unreachable parent is served `parent: { kind: 'restricted', id }` — existence
 * and id, nothing else. Redacting it here and not there would be two answers to
 * one question.
 *
 * ## Determinism
 *
 * No clock, locale or random source is read, and no caller can make one be
 * read: the whole input is `(db, userId, workspaceId, afterSeq)` plus the
 * committed rows. Ordering is `workspace_seq ASC`, which is unique per
 * workspace, so the sequence is a function of the ledger and the projections.
 */
export async function* visibleEventsFor(
  db: Queryable,
  userId: string,
  workspaceId: string,
  afterSeq: number,
): AsyncGenerator<SyncItem> {
  const stream = await db.query<EventRow>(
    `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
            actor_id, origin, client_time, server_time, seq, workspace_seq
     FROM events
     WHERE workspace_id = $1 AND workspace_seq > $2
     ORDER BY workspace_seq ASC`,
    [workspaceId, afterSeq],
  );

  const eff = await resolveEffectiveRole(db, userId, workspaceId);

  if (eff.workspaceRole === null) {
    // Not a member NOW. Either they never were — nothing is owed — or this very
    // range is where they stopped being one, and the device they left behind is
    // owed the one instruction that empties it. See the docblock.
    if (stream.rows.some((row) => isRevocationOf(row, userId))) {
      yield { kind: 'scope-revoked', workspaceId };
    }
    return;
  }

  const isGuest = eff.workspaceRole === 'guest';
  const purged = new Set<string>();

  async function* purge(ids: readonly string[]): AsyncGenerator<PurgeInstruction> {
    for (const id of ids) {
      if (!purged.has(id)) {
        purged.add(id);
        yield { kind: 'purge', entityId: id };
      }
    }
  }

  for (const row of stream.rows) {
    const env = rowToEnvelope(row);
    switch (audienceClassOf(env.entity.kind)) {
      case 'ticket': {
        if (await canSee(db, userId, env.entity.id)) {
          yield env;
        }
        // Even an event this user CAN see may have flipped an inheriting
        // descendant out of their view — and an event they cannot see is
        // usually exactly the one that did it, which is why the purge walk is
        // outside the `canSee` branch rather than inside it.
        if (VISIBILITY_AFFECTING.has(env.type)) {
          yield* purge(await nowInvisibleInheritSubtree(db, userId, env.entity.id));
        }
        break;
      }
      case 'roster': {
        if (subjectOf(env) === userId) {
          if (env.type === 'membership.revoked') {
            // They are standing here with a role, so they were RE-GRANTED
            // later in this same range (case 6.5: a re-grant restores). What
            // they lost is whatever the new role no longer reaches — which for
            // a re-grant down to guest is most of the workspace.
            if (isGuest) {
              yield { kind: 'scope-revoked', workspaceId };
            } else {
              yield* purge(
                await nowInvisibleTicketsInScope(db, userId, workspaceId, 'workspace'),
              );
            }
          } else if (env.type === 'project.member_removed') {
            // A guest holds no project (the 2026-08-27 collapse, stated in
            // `can-see.ts`), so this site is reached by members only and the
            // itemised purge is the honest answer here.
            yield* purge(
              await nowInvisibleTicketsInScope(db, userId, workspaceId, {
                projectId: env.entity.id,
              }),
            );
          }
        }
        if (!isGuest) {
          yield env;
        }
        break;
      }
      case 'workspace': {
        if (!isGuest) {
          yield env;
        }
        break;
      }
      case 'definition': {
        // Clause 5 of the filter semantics: definitions reach EVERYONE, guests
        // included. A guest cannot render their explicitly-shared ticket's
        // status without the workflow that names the states.
        //
        // Task 11's implementation text narrows this — a guest gets only the
        // definitions their own visible tickets use — and that narrowing is NOT
        // shipped, because this branch has no correct source for "which
        // workflow does this ticket use". It needs `proj_tickets`, which does
        // not exist here (Plan 3 Task 12 owns it), and the ledger substitute
        // (`ticket.created.typeId` → `ticket-type.defined.workflowId`) is WRONG
        // for any ticket a `ticket.workflow_rebound` has since moved. A
        // narrowing that is quietly wrong is worse than a documented broad one,
        // and deriving another plan's projection inside a query here is the ban
        // case 6.82 already recorded.
        // *Owner: Plan 3 Task 12 (`proj_tickets`), case 6.94.*
        yield env;
        break;
      }
      case 'withheld': {
        break;
      }
    }
  }
}

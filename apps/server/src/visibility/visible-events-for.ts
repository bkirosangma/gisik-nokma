import type { EntityKind, LedgerEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { canSee } from './can-see.js';
import { grantNoticeFor, isGrantBackfillTrigger } from './grant-backfill.js';

/**
 * "This ticket is gone — delete whatever you hold for it."
 *
 * Emitted when a SCOPE BOUNDARY inside the streamed range took a ticket away
 * from this user: a `membership.revoked` they were re-granted after, or a
 * `project.member_removed` naming them. It is not an assertion that the ticket
 * was deleted — the ticket may be alive and being worked on by people who can
 * still see it. It says only that this replica may no longer hold it.
 *
 * ## A purge is a per-BOUNDARY instruction, and only a per-boundary one
 *
 * There used to be a second emitter, and it is gone: a per-EVENT walk that ran
 * on every `visibility.set` and `ticket.reparented`, purging that event's
 * ticket plus every inheriting descendant this user cannot see NOW (controller
 * ruling on case 6.101). The two emitters look identical from the outside and
 * are not, so the reasoning is kept here rather than left in a review.
 *
 * Naming a ticket the recipient never held is NOT a harmless no-op the replica
 * quietly ignores. It is a positive assertion that the ticket EXISTS, pushed to
 * a device, and ULIDs are timestamp-ordered so the id dates it too. What makes
 * that tolerable anywhere is RELATIONSHIP, not size. Case 6.14 serves a visible
 * child's unreachable parent as `{ kind: 'restricted', id }`, and it is
 * tolerable because the viewer ALREADY HOLDS THE CHILD — the id names something
 * they stand in a relationship to. Drop that axis and 6.14 degenerates into
 * "small leaks are fine", which is not what it says.
 *
 * The walk had no such axis, and its own test proved it: case 6.101 seeded a
 * ticket in a project the viewer was NEVER on, asserted `canSee` false, and the
 * walk emitted `purge:<thatTicket>` regardless — an id for an entity the
 * recipient stands in no relationship to whatever. The cardinality defence
 * ("only a few ids") does not repair it either: it compares a PER-EMISSION
 * quantity against the scope branch's PER-BOUNDARY one, which are different
 * subjects, and nobody measured the walk's integral over a sync window. It is
 * the guest disclosure (case 6.100) at a smaller radius, and it is closed the
 * same way — by not walking.
 *
 * ## What survives, and on which axis
 *
 * - **A guest, and anyone the range put OUT of the workspace, is never handed a
 *   ticket id at all.** Spec §6 calls guests external collaborators ("the
 *   accountant, the supplier"), and an external party learning the shape of
 *   work they were never shown is the disclosure `ScopeRevokedInstruction`
 *   exists to avoid. They are answered at scope level, or not at all.
 * - **At a scope-revocation boundary, a member or an admin still standing
 *   inside the workspace may be handed an id they never held.** That is settled
 *   and is NOT the walk's trade wearing different clothes: it fires once, when
 *   a NAMED scope is taken from a NAMED person, and every id it can emit is
 *   bounded by that scope. Spec §6 decided it — "within a workspace, the
 *   existence-leak is the honest trade; full concealment was considered and
 *   declined" — and cases 6.17 and 6.103 pin that it really happens, so it is a
 *   disclosed behaviour rather than one a later reader rediscovers as a bug.
 *
 * ## Why "could this recipient see it BEFORE?" is not the test, and what
 * ## refusing to approximate it costs
 *
 * It is the question one would rather ask, and this module cannot ask it.
 * `proj_visibility` stores the audience that applies NOW and keeps no prior
 * value (its migration has no history column), and neither payload carries a
 * before-image: `visibilitySetPayload` is the new mode and list,
 * `ticketReparentedPayload` is the new parent alone. Reconstructing the
 * pre-event audience would mean re-deriving the projection's own `resolve()`
 * rule here, against a ledger lookback — a second definition of visibility that
 * can disagree with the table every other door reads. That is exactly the ban
 * cases 6.82 and 6.94 already recorded, and it is refused here for the same
 * reason.
 *
 * So the walk could not be gated on the one property it needed, and it is
 * removed rather than approximated on some weaker one. The cost is an
 * UNDER-purge, taken deliberately: a member un-shared by a plain
 * `visibility.set`, or moved under an unreachable parent by a
 * `ticket.reparented`, now receives no tombstone and keeps the stale copy until
 * a full resync. Stale local data is the safe direction — an id on a device the
 * server does not control is never retrieved, while retained data is corrected
 * by the next bootstrap.
 *
 * **The residual now has a door, and it is not this one.** Closure 5 (ruling
 * P37) closes case 6.104 by inverting the direction rather than restoring the
 * walk: `POST /v1/sync/reconcile` lets the CLIENT name the ids it holds and
 * answers only about those (`../sync/reconcile-route.ts`). Nothing above this
 * line changes — a server-initiated purge is still refused, still for P23's
 * reason, and this module still emits none. What changed is that a device is no
 * longer without a way to ask.
 * Cases 12.284-12.286 exercise the ROUTE through `app.inject`; 12.289 drives
 * the CLIENT half — engine, presentation, local purge — on the dual-client
 * rig, whose transport RESTATES this route's rule in-process rather than
 * calling it (the rig has no HTTP, and it restates `bootstrapTicket` the
 * same way). **No single case runs the client and the real route together**,
 * so a drift between them is caught by nothing until closure 5b's first
 * commit points the rig at `inject()`.
 * the dual-client rig.
 * *Was: owner Plan 10 (the WS catch-up/purge protocol), case 6.104 — the
 * sibling of 6.102, which records the identical residual on the guest side.
 * 6.102's GUEST side is unchanged and still open: a guest reconciling is the
 * same primitive and nobody has measured it.*
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
 * workspace that is the existence-leak spec §6 already accepts (case 6.14),
 * bounded here by the named scope and fired once at a named boundary — and the
 * itemised branch below deliberately keeps it rather than widening this
 * instruction to cover it. For someone who has just been put OUT of the
 * workspace, or who is only a guest in it, it is an external party learning the
 * size of work they were never shown, and losing access is not a thing that
 * should teach them it.
 *
 * ## No ticket list is computed on a guest's path, or on an ex-member's
 *
 * That used to be a claim about this branch alone, and as a claim about the
 * MODULE it was false. The subtree purge walk sat outside every role test, so
 * an ordinary `visibility.set` or `ticket.reparented` on ANY ticket in the
 * workspace handed a guest `purge:<thatTicketId>` for a ticket they had never
 * held and could never see (case 6.100). It was first gated on `!isGuest`, and
 * the controller then struck the walk entirely (case 6.101), so the sentence is
 * now true of the whole file: with the null-role path returning before the loop
 * and no per-event walk left, a guest and an ex-member reach no code anywhere
 * here that names a ticket id.
 *
 * The guest's residual is unchanged and still deliberate: a guest un-shared
 * from a ticket they legitimately held receives no tombstone for it, and keeps
 * it until a full resync. Retention is recoverable and disclosure is not — an
 * id on a device the server does not control is never retrieved — so the trade
 * is taken this way round.
 * *Owner: Plan 10 (the WS catch-up/purge protocol and the snapshot-bounded
 * bootstrap), case 6.102.* Since the walk went, MEMBERS carry the same residual
 * for the same reason, recorded beside it as case 6.104.
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
/**
 * "Your reach grew; here are the ids it now admits." Ruling P37.1, closure
 * 5b(d) — the pull-shaped replacement for the grant-side history burst that
 * closure 5 emitted here.
 *
 * See `stream-frames.ts`'s wire declaration for the full argument, including
 * why this is not case 6.101's purge walk arriving from the other direction.
 * The short form: a purge names an entity to a device that may never have held
 * it, which is news; a notice names ids the recipient may at that moment read
 * in full, which is not.
 *
 * The list is what the reader's `canSee` admits, NOT what the reader lacks —
 * the server does not model a device's holdings and must not start. The client
 * drops the ids it already has, which is also what makes a repeated no-op
 * `visibility.set` cost a holding client nothing.
 */
export type ReachGrantedInstruction = { kind: 'reach-granted'; workspaceId: string; ticketIds: string[] };

export type SyncItem = LedgerEvent | PurgeInstruction | ScopeRevokedInstruction | ReachGrantedInstruction;

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
type AudienceClass = 'ticket' | 'roster' | 'workspace' | 'definition' | 'admin' | 'withheld';

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
      // Owners and admins only (Plan 4 Task 14, case 6.38). Until that task this
      // branch returned `'withheld'` — fail-closed, because `invite.sent`
      // carries a personal address and the role split had no implementation to
      // defer to. It has one now.
      //
      // This is the FIRST event kind withheld from plain members, and the reason
      // is narrower than "invites are sensitive": the payload contains an
      // address somebody gave in confidence to whoever invited them, and a
      // member has no screen that needs it and no act it enables. The smaller
      // the audience of a PII-bearing event, the better — and the switch's
      // default-deny shape already supported a new class, which is why adding
      // one is three lines rather than a redesign.
      return 'admin';
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
 * GRANTED **is done here now** — closure 5's grant half, ruling P37, in
 * `grant-backfill.ts`. This docblock said it was "Plan 10's job, on top of this
 * primitive" from Task 11 until 2026-09-06, and for that whole time nothing did
 * it: case 12.274 measured a client left holding 2 events where the server held
 * 4, permanently. The sentence that named an owner is what made the absence look
 * like a decision.
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
  // Closure 5's GRANT half, per drain: the tickets whose pre-cursor history has
  // already been handed back in THIS drain. Two triggers on one ticket inside
  // one range, or a trigger on a ticket an ancestor's subtree walk already
  // covered, deliver once. Scoped to the drain and not to the subscription on
  // purpose — a later drain that sees a NEW widening is owed the delivery again,
  // and the alternative would need per-subscriber state this generator does not
  // have and must not invent.
  const backfilled = new Set<string>();

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
          // CLOSURE 5, THE GRANT HALF (ruling P37). An event that can change
          // this ticket's resolved audience, reaching a reader who may see it
          // NOW, hands back the pre-cursor history their cursor ran past while
          // they could not see it — for this ticket and every descendant that
          // inherits from it. The whole argument, including why a NARROWING can
          // never reach this line and therefore needs no before-image to
          // exclude, is `grant-backfill.ts`'s docblock.
          //
          // Ruling P37.1: a bounded NOTICE, yielded BEFORE its trigger, never
          // the history it used to carry.
          //
          // Before-and-not-after is the load-bearing half. The client must have
          // pulled a ticket before a folded `ticket.reparented` for it arrives,
          // or `applyTicketEvent` replays a transition with no `ticket.created`
          // and stalls the engine terminally. Under the OLD push shape this
          // ordering was the unsafe repair — putting the trigger first to
          // advance the cursor ahead of the burst — and it is safe here for the
          // reason that stopped being true of it: a notice carries no history
          // to sit behind, so there is no burst to advance the cursor past.
          //
          // The notice cannot move a cursor either. Both consumers advance only
          // on `workspaceSeq > cursor` (`stream/hub.ts`'s `drain`, and the
          // dual-client rig's `syncDown`), and an instruction has no
          // `workspaceSeq` at all — which here is a requirement rather than an
          // accident, because the notice must be RE-DELIVERED if the socket
          // dies before the client finishes pulling.
          if (isGrantBackfillTrigger(env.type)) {
            const ticketIds = await grantNoticeFor(db, userId, env.entity.id, backfilled);
            if (ticketIds.length > 0) yield { kind: 'reach-granted', workspaceId, ticketIds };
          }
          yield env;
        }
        // NO per-event purge here, and there used to be one — this is the site
        // the controller's ruling on case 6.101 emptied, so the absence is
        // marked rather than left to look like an omission.
        //
        // It walked this event's ticket and every inheriting descendant and
        // emitted a purge for each the user cannot see NOW, which is true of a
        // ticket taken away and equally true of one never held. For a guest
        // that disclosed every ticket anyone re-authored (6.100); for a member
        // it disclosed tickets in projects they were never on (6.101) — an id
        // for an entity the recipient stands in no relationship to, which is
        // the axis case 6.14 actually turns on. The gate it needed is "could
        // they see it BEFORE", which this module cannot ask and may not
        // reconstruct (`PurgeInstruction`'s docblock, cases 6.82 and 6.94), so
        // the walk is removed rather than approximated. The under-purge that
        // leaves is case 6.104, the member-side sibling of 6.102.
        break;
      }
      case 'roster': {
        if (subjectOf(env) === userId) {
          if (env.type === 'membership.revoked') {
            // They are standing here with a role, so they were RE-GRANTED
            // later in this same range (case 6.5: a re-grant restores). What
            // they lost is whatever the new role no longer reaches — which for
            // a re-grant down to guest is most of the workspace.
            //
            // The two arms are the `PurgeInstruction` role line, applied to a
            // whole workspace. A guest is an external collaborator and gets the
            // scope instruction. Someone re-granted at a NON-guest role is
            // standing inside the workspace, where spec §6 already declined
            // full concealment, so they get the itemised list — which is worth
            // itemising: an OWNER re-granted as a member really does lose the
            // owner bypass, and those are genuine retractions of tickets that
            // were on the device (case 6.103).
            //
            // The itemised list also names ids they never held, and on one
            // shape it names NOTHING ELSE: a member revoked and re-granted at
            // `member` inside one window has lost nothing at all — the
            // revocation deletes only the workspace-scope row and the project
            // rows survive it — so every id emitted is one they never held.
            // That is the accepted count-leak, stated rather than hidden; the
            // alternative, widening `scope-revoked` to cover it, would wipe a
            // replica that lost nothing.
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
      case 'admin': {
        // `isAdmin`, NOT `!isGuest`. The two differ by exactly the plain
        // MEMBER, who is the whole audience this class exists to exclude — so
        // writing it the roster branch's way would ship every invited person's
        // address to every member and every test above would still pass.
        //
        // Read off `eff`, which `resolveEffectiveRole` produced and which the
        // null-role early return above has already narrowed: reaching this line
        // means the reader holds a role in this workspace. A hand-built
        // `EffectiveRole` cannot get here — the type is branded.
        if (eff.workspaceRole === 'owner' || eff.workspaceRole === 'admin') {
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

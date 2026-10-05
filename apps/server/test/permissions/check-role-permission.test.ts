import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  membershipId,
  newUlid,
  SIMPLE_KANBAN_TEMPLATE,
  type EventEnvelope,
  type IngestResult,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { Pool } from 'pg';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import {
  adminOnlyReason,
  checkRolePermission,
  IDENTITY_SPOOF_REASON,
  NOT_A_MEMBER_REASON,
  PERMISSION_ROLE_RULE,
  PROJECT_ROSTER_REASON,
  SERVER_ORIGIN_REASON,
  WORKSPACE_ALREADY_FOUNDED_REASON,
  WORKSPACE_MEMBERSHIP_REASON,
  WORKSPACE_OWNER_GRANT_REASON,
  INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON,
} from '../../src/permissions/check-permission.js';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { applyAll, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * The pre-engine permission gate (Plan 4 Task 5), and the founding sequence
 * behind it.
 *
 * TERMINOLOGY, because two unrelated things are called "origin" and they meet
 * in this file: **envelope-origin** is `EventEnvelope.origin`, the provenance
 * enum `'web' | 'mobile' | 'desktop' | 'server' | 'mcp'`. **HTTP-Origin** is the
 * browser `Origin` header, which is CSRF and appears nowhere in this file.
 *
 * NO `// test-cases N.N` MARKERS, deliberately, and this is the one thing to
 * read before adding one. `3.31` — the nearest existing id — is the
 * envelope-origin gate, and `test-cases/03-foundation-ledger.md` names
 * `check-permission.test.ts` as its file. Stamping it on the role gate, the
 * founding sequence and the project roster would assert coverage that entry
 * never described, which is the false-marker class this repository keeps
 * finding. The right id does not exist yet: Plan 4 puts its catalogue steps in
 * **Tasks 12–14**, not in Task 5, and `test-cases/06-auth-visibility.md` is
 * that bucket. *Owner: whoever executes Plan 4 Task 12, who claims the numbers
 * from the reservation table and back-fills them here in the same change set.*
 */

// ---------------------------------------------------------------------------
// Part 1 — the pure role checks. No database: `checkRolePermission` takes the
// resolved role as an argument precisely so the rules can be stated without
// one, and so a role the projection cannot currently produce ('guest' at
// workspace scope, say) can still be exercised.
// ---------------------------------------------------------------------------

const WS = newUlid();
const ACTOR = newUlid();

/**
 * A hand-built `EffectiveRole` for `checkRolePermission`, which is pure and is
 * driven here across every role. The cast is required since Plan 4 Task 8
 * branded the type (ruling P22, case 6.64): a hand-builder must now assert at a
 * greppable site rather than satisfy the shape structurally. Sound here because
 * the value never leaves this file's pure calls.
 */
function eff(
  workspaceRole: EffectiveRole['workspaceRole'],
  projects: Array<[string, boolean]> = [],
): EffectiveRole {
  return {
    workspaceRole,
    projects: new Map(projects.map(([id, projectAdmin]) => [id, { projectAdmin }])),
  } as unknown as EffectiveRole;
}

function env(
  overrides: Partial<EventEnvelope> & Pick<EventEnvelope, 'type' | 'entity' | 'payload'>,
): EventEnvelope {
  return testEnvelope({ workspaceId: WS, actorId: ACTOR, ...overrides });
}

const ticket = { kind: 'ticket' as const, id: newUlid() };

/**
 * A permission context for `ACTOR`. `workspaceExists` defaults to `false` — a
 * workspace with no ledger — because that value only changes the answer for
 * `workspace.created`, and the two cases where it decides something pass it by
 * name rather than relying on the default.
 */
function ctx(role: EffectiveRole, workspaceExists = false) {
  return { sessionUserId: ACTOR, eff: role, workspaceExists };
}

/**
 * 6.6 — cited on the block: the admin-only event types — `workflow.defined`, `ticket-type.defined`, `project.created` and `ticket.workflow_rebound` — are each refused to a plain member under `permission.role` and each allowed for BOTH owner and admin. The row’s closing clause, that ordinary ticket work is let through because the visibility gate owns the rest, is the test at the end of this block.
 * 6.78 — a RECORD rather than an assertion, kept where it applies: three shipped fixtures were REPAIRED rather than three assertions loosened when this gate landed. Two of the three were in this file. Each had gone red for a reason unrelated to its own subject — "a refusal that fires before the interesting code proves nothing", arriving from the other direction.
 */
describe('checkRolePermission — planted defects', () => {
  /**
   * 6.7 — a claim submitted as ANOTHER person is refused. The row’s "including from a workspace owner, so the check is identity and not privilege" half is the client-door test further down.
   */
  it('refuses a claim submitted as another person', () => {
    // Mutation: delete the `env.actorId !== ctx.sessionUserId` branch. This
    // goes green-for-nothing and every other case in this file still passes,
    // which is why identity gets its own case rather than riding along.
    const e = env({ type: 'ticket.transitioned', entity: ticket, payload: {}, actorId: newUlid() });
    expect(checkRolePermission(e, ctx(eff('admin')))).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: IDENTITY_SPOOF_REASON,
    });
  });

  /**
   * 6.8 — a client-submitted event wearing the SERVER’s envelope-origin is refused. (Envelope-origin here is the event envelope’s `origin` field, not the HTTP `Origin` header.) The row’s founding-sequence half is asserted in the founding block below.
   */
  it("refuses a client-submitted event wearing the server's envelope-origin", () => {
    const e = env({ type: 'ticket.transitioned', entity: ticket, payload: {}, origin: 'server' });
    expect(checkRolePermission(e, ctx(eff('admin')))).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: SERVER_ORIGIN_REASON,
    });
  });

  it('refuses any claim from a non-member of the workspace', () => {
    const e = env({ type: 'ticket.transitioned', entity: ticket, payload: {} });
    expect(checkRolePermission(e, ctx(eff(null)))).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });
  });

  it('allows any signed-in user to found a workspace — there is no membership to hold yet', () => {
    // The one bypass, and the reason the whole product can start: a founder is
    // a non-member of a workspace that does not exist. Mutation: move the
    // `workspace.created` early return below the membership check and NO
    // workspace can ever be founded through the client door again.
    const e = env({ type: 'workspace.created', entity: { kind: 'workspace', id: WS }, payload: { name: 'New' } });
    expect(checkRolePermission(e, ctx(eff(null), false))).toBeNull();
  });

  /**
   * 6.43 — the founding bypass cannot be used to SEIZE an existing workspace: a non-member founding a workspace that already exists is refused. The row’s other planted defects — a stranger re-founding, and "already exists" being a question about the WORKSPACE rather than one entity id — are in the founding block below.
   */
  it('planted defect: refuses a NON-MEMBER founding a workspace that already exists', () => {
    // The bypass's bound, and without it the bypass is a privilege escalation:
    // nothing else refuses a second `workspace.created`, the engine has no case
    // for the type, and the founding sequence would then append
    // `membership.granted {role: 'owner'}` for whoever submitted it. Measured
    // before the fix, end to end through the client door: the stranger resolved
    // as `owner` of a workspace they were never in, and the workspace held 14
    // events instead of 7.
    // Mutation: drop `&& !ctx.workspaceExists` and this goes green while the
    // integration twin below turns an outsider into an owner.
    const e = env({ type: 'workspace.created', entity: { kind: 'workspace', id: WS }, payload: { name: 'New' } });
    expect(checkRolePermission(e, ctx(eff(null), true))).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });
  });

  it.each(['owner', 'admin', 'member', 'guest'] as const)(
    'planted defect: refuses a %s of the workspace founding it a SECOND time',
    (role) => {
      // CASE 6.52, the half the `workspaceExists` bound left open. That bound
      // answers a NON-member (the case above); a member of any role walked
      // straight past it — `workspace.created` is not in `ADMIN_ONLY_TYPES`, it
      // is not a membership or roster event, and check 1 is a ticket-entity
      // filter — so the claim reached the engine, which has no case for the
      // type, and COMMITTED. It founded nothing (`workspaceSeq === 1` in
      // `ingestAll` is what stops the grant), but the workspace's history then
      // carried a second, false founding claim that §11 can never take back —
      // and `workspaces/workspace-name.ts` reads exactly those events for the
      // directory's name, so it was not inert noise either.
      //
      // Walked over all FOUR roles rather than one, because the branch it
      // closes is reached by every non-null role and a single role would leave
      // three unexamined. Mutation: delete the `env.type === 'workspace.created'`
      // refusal and all four go green while the integration twin below lets an
      // owner append a second founding to their own ledger.
      const e = env({ type: 'workspace.created', entity: { kind: 'workspace', id: WS }, payload: { name: 'Again' } });
      expect(checkRolePermission(e, ctx(eff(role), true))).toEqual({
        refused: true,
        rule: PERMISSION_ROLE_RULE,
        reason: WORKSPACE_ALREADY_FOUNDED_REASON,
      });
    },
  );

  it('the two founding refusals name different faults, and the non-member one is unchanged', () => {
    // The discriminator, in one place: a stranger is told they do not belong
    // here; a member is told the thing they are claiming has already happened.
    // Merging them into one sentence would make the mutation "move the new
    // refusal above the membership check" invisible — it would still refuse,
    // with the wrong reason, which is the failure mode this file exists to
    // catch. Mutation: return `NOT_A_MEMBER_REASON` from the new branch and
    // only this case goes red.
    const e = env({ type: 'workspace.created', entity: { kind: 'workspace', id: WS }, payload: { name: 'Again' } });
    const stranger = checkRolePermission(e, ctx(eff(null), true));
    const member = checkRolePermission(e, ctx(eff('member'), true));
    expect(stranger).toMatchObject({ reason: NOT_A_MEMBER_REASON });
    expect(member).toMatchObject({ reason: WORKSPACE_ALREADY_FOUNDED_REASON });
    expect(NOT_A_MEMBER_REASON).not.toBe(WORKSPACE_ALREADY_FOUNDED_REASON);
  });

  it.each(['workflow.defined', 'ticket-type.defined', 'project.created', 'ticket.workflow_rebound'] as const)(
    'refuses %s from a plain member, names the rule and the role',
    (type) => {
      const entity =
        type === 'workflow.defined'
          ? { kind: 'workflow' as const, id: newUlid() }
          : type === 'ticket-type.defined'
            ? { kind: 'ticket-type' as const, id: newUlid() }
            : type === 'project.created'
              ? { kind: 'project' as const, id: newUlid() }
              : { kind: 'ticket' as const, id: newUlid() };
      const e = env({ type, entity, payload: {} });
      expect(checkRolePermission(e, ctx(eff('member')))).toEqual({
        refused: true,
        rule: PERMISSION_ROLE_RULE,
        reason: adminOnlyReason('member'),
      });
    },
  );

  it.each(['owner', 'admin'] as const)('allows an %s to define workflows', (role) => {
    // Both, not one. The refusal direction was well pinned by the case above;
    // testing only 'admin' here would leave a gate written `role !== 'admin'`
    // green while it locked every workspace OWNER out of their own workflows.
    const e = env({ type: 'workflow.defined', entity: { kind: 'workflow', id: newUlid() }, payload: {} });
    expect(checkRolePermission(e, ctx(eff(role)))).toBeNull();
  });

  it('refuses workspace-scope membership grants from below admin', () => {
    const grantee = newUlid();
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, grantee) },
      payload: { userId: grantee, role: 'member' },
    });
    expect(checkRolePermission(e, ctx(eff('member')))).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_MEMBERSHIP_REASON,
    });
  });

  /**
   * E6-21 — at the PURE gate, isolated from the full ingest pipeline: any
   * role may revoke their OWN membership. `WORKSPACE_MEMBERSHIP_REASON`
   * previously refused this identically to a plain member trying to manage
   * someone ELSE'S — see the ingest-level pair further down for the
   * self-vs-other control and the real client-door round trip.
   */
  it.each(['guest', 'member', 'admin'] as const)('lets a %s revoke their own membership', (role) => {
    const e = env({
      type: 'membership.revoked',
      entity: { kind: 'membership', id: membershipId(WS, ACTOR) },
      payload: { userId: ACTOR },
    });
    expect(checkRolePermission(e, ctx(eff(role)))).toBeNull();
  });

  // A project admin runs their project's roster, not the workspace's door.
  // Before the 2026-08-27 scope collapse a project-scoped `membership.granted`
  // let them do both through one event; now the two questions have two events,
  // and this pair of cases is what keeps them two.
  it('lets a project admin manage their own project roster and no other', () => {
    const mine = newUlid();
    const theirs = newUlid();
    const add = (projectId: string) =>
      env({
        type: 'project.member_added',
        entity: { kind: 'project', id: projectId },
        payload: { userId: newUlid(), projectAdmin: false },
      });
    const asProjectAdmin = ctx(eff('member', [[mine, true]]));
    expect(checkRolePermission(add(mine), asProjectAdmin)).toBeNull();
    expect(checkRolePermission(add(theirs), asProjectAdmin)).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: PROJECT_ROSTER_REASON,
    });
  });

  it('refuses a project admin who tries to grant workspace membership', () => {
    const grantee = newUlid();
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, grantee) },
      payload: { userId: grantee, role: 'guest' },
    });
    expect(
      checkRolePermission(e, ctx(eff('member', [[newUlid(), true]]))),
    ).toEqual({ refused: true, rule: PERMISSION_ROLE_RULE, reason: WORKSPACE_MEMBERSHIP_REASON });
  });

  /**
   * 13.823 — the ACTOR half of the last-owner guard (owner ruling 2026-09-18).
   *
   * It is one half of a pair and the pairing is the point: `13.820` (the WORLD
   * half, in `packages/rule-engine`) refuses a change that would leave the
   * workspace with no owner. That guard alone does NOT close the escalation an
   * admin had, because an admin could demote the sole owner and then promote
   * themselves — at no point does the workspace hold zero owners, only zero of
   * the original owner's ROLE. This case is what refuses the second step, and
   * the first step is refused by neither if it is the only guard present.
   *
   * The rule string is spelled here rather than imported: importing it would
   * make the assertion agree with the module about a wire contract the members
   * page renders.
   */
  it('refuses an admin granting the owner role, and lets an owner grant it', () => {
    const grantee = newUlid();
    const grantOwner = () =>
      env({
        type: 'membership.granted',
        entity: { kind: 'membership', id: membershipId(WS, grantee) },
        payload: { userId: grantee, role: 'owner' },
      });
    expect(checkRolePermission(grantOwner(), ctx(eff('admin')))).toEqual({
      refused: true,
      rule: 'grant-owner-requires-owner',
      reason: WORKSPACE_OWNER_GRANT_REASON,
    });
    // The owner may — otherwise the rule would be a deadlock rather than a
    // guard, and no workspace could ever gain a second owner.
    expect(checkRolePermission(grantOwner(), ctx(eff('owner')))).toBeNull();
  });

  it('CONTROL: the same admin may grant any role that is not owner', () => {
    // Same actor, same event type, same target, one difference: the role. A
    // gate that refused every grant from an admin would satisfy the case above
    // and be catastrophically wrong, and only this distinguishes them.
    const grantee = newUlid();
    const grantAdmin = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, grantee) },
      payload: { userId: grantee, role: 'admin' },
    });
    expect(checkRolePermission(grantAdmin, ctx(eff('admin')))).toBeNull();
  });

  it('CONTROL: a plain member granting owner is refused as NOT A MEMBER MANAGER, not by the owner rule', () => {
    // Ordering, which is a behaviour and not a detail: the broad refusal runs
    // first, so the sentence a plain member reads is about their standing in
    // the workspace rather than about a role they never tried to hand over.
    const grantee = newUlid();
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, grantee) },
      payload: { userId: grantee, role: 'owner' },
    });
    expect(checkRolePermission(e, ctx(eff('member')))).toEqual({
      refused: true,
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_MEMBERSHIP_REASON,
    });
  });

  it('does NOT refuse a malformed owner grant as a role problem — the engine owns that verdict', () => {
    // A payload this gate cannot parse is left to the engine's
    // `malformed-payload`, which names the offending field. Refusing it here
    // would report a shape problem as an authority problem, and the two have
    // different remedies.
    const e = env({
      type: 'membership.granted',
      entity: { kind: 'membership', id: membershipId(WS, newUlid()) },
      payload: { userId: newUlid(), role: 'owner', scope: 'project' },
    });
    expect(checkRolePermission(e, ctx(eff('admin')))).toBeNull();
  });

  it('refuses project roster changes from a plain project member', () => {
    const project = newUlid();
    const e = env({
      type: 'project.member_added',
      entity: { kind: 'project', id: project },
      payload: { userId: newUlid(), projectAdmin: false },
    });
    expect(
      checkRolePermission(e, ctx(eff('member', [[project, false]]))),
    ).toEqual({ refused: true, rule: PERMISSION_ROLE_RULE, reason: PROJECT_ROSTER_REASON });
  });

  /**
   * Case 6.34 — the token-bypass defect (Plan 4 Task 14).
   *
   * An admin can read their workspace's own history, so they can read every
   * pending `inviteId` in it. Without this refusal they could submit
   * `invite.accepted { inviteId, userId: <anyone> }` and bind any outstanding
   * invitation to any account, having never seen the link. The token is the
   * only thing entitled to make that binding, and no client-submitted event
   * carries one.
   *
   * THE ROLE MATTERS. It is asserted at `admin` and at `owner` — the two roles
   * that reach this line with every earlier guard already passed. A non-member
   * would be answered `NOT_A_MEMBER_REASON` several checks earlier and would
   * prove nothing about acceptance at all, which is exactly the
   * refusal-before-the-interesting-code trap.
   *
   * Mutation that this kills and nothing else does: delete the
   * `env.type === 'invite.accepted'` branch. Every other case in this file
   * stays green, and an admin's forged acceptance commits.
   */
  it('planted defect: refuses a client-submitted invite.accepted from EVERY role, admin and owner included', () => {
    const inviteId = newUlid();
    const e = env({
      type: 'invite.accepted',
      entity: { kind: 'invite', id: inviteId },
      payload: { inviteId, userId: ACTOR },
    });
    for (const role of ['owner', 'admin', 'member', 'guest'] as const) {
      expect(checkRolePermission(e, ctx(eff(role))), role).toEqual({
        refused: true,
        rule: PERMISSION_ROLE_RULE,
        reason: INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON,
      });
    }
  });

  /**
   * The other two invite types, and the positive control that separates "invite
   * events are refused" from "acceptance is refused".
   *
   * `invite.sent` and `invite.revoked` are ordinary admin-only work — inviting
   * somebody into a workspace is managing its membership — so an admin is
   * ADMITTED for both and a member is refused with the admin-only sentence.
   * Without this case, a gate that refused every `invite.*` type outright would
   * pass the acceptance case above while silently making invitations
   * unissuable.
   */
  it('invite.sent and invite.revoked are admin-only, and an admin passes both', () => {
    const inviteId = newUlid();
    const sent = env({
      type: 'invite.sent',
      entity: { kind: 'invite', id: inviteId },
      payload: { inviteId, address: 'a@example.com', channel: 'email', role: 'member' },
    });
    const revoked = env({
      type: 'invite.revoked',
      entity: { kind: 'invite', id: inviteId },
      payload: { inviteId },
    });
    for (const e of [sent, revoked]) {
      expect(checkRolePermission(e, ctx(eff('owner')))).toBeNull();
      expect(checkRolePermission(e, ctx(eff('admin')))).toBeNull();
      for (const role of ['member', 'guest'] as const) {
        expect(checkRolePermission(e, ctx(eff(role))), `${e.type} as ${role}`).toEqual({
          refused: true,
          rule: PERMISSION_ROLE_RULE,
          reason: adminOnlyReason(role),
        });
      }
    }
  });

  it('lets ordinary ticket work through — the visibility gate (Task 9) owns the rest', () => {
    // The admits direction for the common case. Without it, a gate that
    // refused everything would pass every refusal case above.
    const e = env({ type: 'ticket.transitioned', entity: ticket, payload: {} });
    expect(
      checkRolePermission(e, ctx(eff('member', [[newUlid(), false]]))),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Part 2 — the gate and the founding sequence through the real ingest path.
// ---------------------------------------------------------------------------

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/** Every envelope the engine was asked to judge — how "before the engine" is proven. */
let evaluated: string[] = [];

function ingestService(): IngestService {
  evaluated = [];
  return createIngestService({
    pool: db.pool,
    evaluate: async (envelope, ctx) => {
      evaluated.push(envelope.id);
      return evaluateEvent(envelope, ctx);
    },
    projections: buildProjectionRegistry(),
  });
}

/**
 * Hands out real clients, but refuses to hand out a SECOND one while the first
 * is still checked out — with a named error rather than a hang.
 *
 * This exists to pin one line: `commitInTx` passes the gate `client`, the ingest
 * transaction's own connection, and not `deps.pool`. The pool version compiles,
 * and every other test in this repository passes under it, because a healthy
 * pool simply hands out a second connection and the read returns the same rows.
 * What it costs is invisible until it is expensive:
 *
 * - **Correctness.** A membership change committing between the transaction's
 *   own reads (`readEntityHead`, the engine's context) and a pool-side
 *   membership read gives one `commitOne` a mixed view of the world, after the
 *   workspace lock was taken precisely to stop that.
 * - **Liveness, which is what this test can actually see.** A gate that needs a
 *   second connection makes every ingest hold one connection while waiting for
 *   another. At `max` concurrent ingests the pool is empty and every one of
 *   them is waiting for a connection only another of them could release — a
 *   deadlock that appears under load and never in a test suite.
 *
 * Stated plainly because the test below pins the second and not the first: a
 * proxy cannot manufacture a concurrent commit, so the correctness half stays
 * an argument in `check-permission.ts`'s docblock. The liveness half is enough
 * to make the line falsifiable, which is what it did not have before.
 */
function poolAllowingOneClient(real: Pool): Pool {
  let outstanding = 0;
  const connect = async () => {
    if (outstanding > 0) {
      throw new Error(
        'planted: something asked for a second connection while the ingest transaction held one',
      );
    }
    outstanding += 1;
    const client = await real.connect();
    return new Proxy(client, {
      get(target, property) {
        if (property === 'release') {
          return (...args: unknown[]) => {
            outstanding -= 1;
            return (target.release as (...a: unknown[]) => void).apply(target, args);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  return {
    connect,
    /**
     * Checkout, run, release — what `pg.Pool.query` actually does, and the
     * reason this method exists rather than being left off as "nothing calls
     * it".
     *
     * The proxy had no `query` at all, so the mutation below died of
     * `TypeError: db.query is not a function` and the planted error string
     * occurred ZERO times in the run (measured at 6a6203c). The counter, the
     * release hook and the named error took no part in the kill: the test
     * reddened because the fake was incomplete, not because a second connection
     * was asked for, which is a different property from the one its name
     * claims. Routing through `connect` is what makes the kill mean what the
     * title says.
     *
     * It cannot change the unmutated result: nothing on the green path calls
     * `query` on this pool — if anything did, this test would already have been
     * dying of that same TypeError. `connect()` is awaited OUTSIDE the `try` so
     * a refused checkout never reaches a `release` that would decrement a
     * counter it never incremented.
     */
    async query(...args: unknown[]) {
      const client = await connect();
      try {
        return await (client.query as (...a: unknown[]) => Promise<unknown>)(...args);
      } finally {
        client.release();
      }
    },
  } as unknown as Pool;
}

function submitted(fields: {
  workspaceId: string;
  entity: SubmittedEvent['entity'];
  type: string;
  payload: unknown;
  actorId: string;
}): SubmittedEvent {
  return {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    ...fields,
  };
}

function founding(workspaceId: string, actorId: string): SubmittedEvent {
  return submitted({
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    payload: { name: 'Founded' },
    actorId,
  });
}

function expectCommitted(results: IngestResult[]): void {
  expect(results.map((result) => result.status)).toEqual(results.map(() => 'committed'));
}

async function workspaceStream(workspaceId: string) {
  const { rows } = await db.pool.query<{ type: string; payload: Record<string, unknown> }>(
    'SELECT type, payload FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
    [workspaceId],
  );
  return rows;
}

describe('the founding sequence — a new workspace can hold a ticket the moment it exists', () => {
  /**
   * 6.24 (amended by wtg2 T5, 29.134: five built-in types) — founding appends the default workflow, then the five built-in types naming it, then the founder’s owner grant — asserted in that ORDER, not merely as a set.
   */
  it('appends the default workflow, then the five built-in types, then the grant — in that order', async () => {
    const workspaceId = newUlid();
    const founder = newUlid();
    expectCommitted(await ingestService().ingestBatch([founding(workspaceId, founder)]));

    // Ordered by the WORKSPACE cursor, not per-entity `seq` (coordination §18):
    // this sequence spans four entity kinds, so per-entity seq cannot order it.
    // Mutation: move the grant to the front of `foundingSequence` and this
    // names the swapped pair.
    const rows = await workspaceStream(workspaceId);
    expect(rows.map((row) => row.type)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'membership.granted',
    ]);

    const workflowId = rows[1]?.payload['id'] as string;
    expect(rows.slice(2, 7).map((row) => row.payload['id'])).toEqual(['epic', 'story', 'task', 'sub-task', 'decision']);
    for (const row of rows.slice(2, 7)) {
      // Every type names the workflow defined one event earlier — the reason
      // the order cannot be rearranged for tidiness.
      expect(row.payload['workflowId']).toBe(workflowId);
    }
  });

  it('founds on the canonical template itself, not on a copy that resembles it', async () => {
    const workspaceId = newUlid();
    expectCommitted(await ingestService().ingestBatch([founding(workspaceId, newUlid())]));

    const rows = await workspaceStream(workspaceId);
    const { id: _id, version, ...shape } = rows[1]?.payload as Record<string, unknown> & {
      id: string;
      version: number;
    };
    expect(version).toBe(1);
    // `toEqual` against the exported template, not a hand-written copy of the
    // states and transitions: a second spelling of the default workflow here
    // could agree with itself while the product founded workspaces on
    // something else. Mutation: change one state name in
    // `SIMPLE_KANBAN_TEMPLATE` and this stays green (both sides move) while
    // the domain package's own validation test still guards the shape — which
    // is the division of labour intended, this file pins the WIRING.
    expect(shape).toEqual(SIMPLE_KANBAN_TEMPLATE);
  });

  it('leaves its founder owning the workspace', async () => {
    const workspaceId = newUlid();
    const founder = newUlid();
    expectCommitted(await ingestService().ingestBatch([founding(workspaceId, founder)]));

    const { rows } = await db.pool.query<{ role: string }>(
      `SELECT role FROM proj_memberships
       WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
      [workspaceId, founder],
    );
    expect(rows).toEqual([{ role: 'owner' }]);
  });

  it('planted defect: re-founding with the same event id does not bootstrap a second time', async () => {
    const ingest = ingestService();
    const workspaceId = newUlid();
    const first = founding(workspaceId, newUlid());
    expectCommitted(await ingest.ingestBatch([first]));
    const after = (await workspaceStream(workspaceId)).length;

    // Both of Plan 11's seed CLIs re-run by re-submitting the same
    // deterministic event id and counting `duplicate-event-id` as "already
    // present". Hooked to anything looser than `status === 'committed'`, every
    // re-run would append a second workflow and five more type definitions,
    // and Plan 11's "re-run is a no-op" test would be a lie.
    // Mutation: change the hook's condition to `result.status !== 'refused'`
    // and this goes from 8 to 15 (the duplicate is not appended; the second
    // bootstrap is: a workflow, five types, a grant).
    const again = await ingest.ingestBatch([first]);
    expect(again[0]).toMatchObject({ status: 'invalid', code: 'duplicate-event-id' });
    expect((await workspaceStream(workspaceId)).length).toBe(after);
    expect(after).toBe(8);
  });

  it('planted defect: a stranger cannot become owner by re-founding an existing workspace', async () => {
    // THE ESCALATION, end to end, and it was live in this task's first commit.
    // A second `workspace.created` is refused by nothing else in the system —
    // `parseEvent` accepts it, the entity↔workspace guard sees no mismatch
    // because the workspace ids agree, and `evaluateEvent` has no case for the
    // type — so the founding bypass admitted it, it committed, and the founding
    // sequence appended `membership.granted {role: 'owner'}` for the stranger.
    // Measured then: the stranger resolved as `owner` and the workspace held 14
    // events. Direct `membership.granted` is refused from below admin, so this
    // was the only path in.
    //
    // The FRESH entity id is the sharp half. The obvious guards — a head-row
    // lookup on `env.entity.id`, or the committed result's per-entity `seq` —
    // both pass here, because this entity has never been seen. Only asking
    // whether the WORKSPACE has a ledger catches it.
    // Mutation: drop `&& !ctx.workspaceExists` from `checkRolePermission`.
    const ingest = ingestService();
    const workspaceId = newUlid();
    const founder = newUlid();
    const stranger = newUlid();
    expectCommitted(await ingest.ingestBatch([founding(workspaceId, founder)]));

    const reFound: SubmittedEvent = {
      ...founding(workspaceId, stranger),
      entity: { kind: 'workspace', id: newUlid() }, // a fresh entity, same workspace
    };
    expect((await ingest.ingestClientBatch([reFound], stranger))[0]).toEqual({
      status: 'refused',
      eventId: reFound.id,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });

    const { rows } = await db.pool.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM proj_memberships
       WHERE workspace_id = $1 AND scope_kind = 'workspace'`,
      [workspaceId],
    );
    expect(rows).toEqual([{ user_id: founder, role: 'owner' }]);
    expect((await workspaceStream(workspaceId)).length).toBe(8);
  });

  it('planted defect: "already exists" is a question about the WORKSPACE, not about one entity id', async () => {
    // Nothing requires a workspace's founding event to be filed against an
    // entity whose id EQUALS the workspace id — the door admits any workspace
    // entity — so a `proj_entity_heads` lookup keyed on the workspace id is a
    // near-miss that passes every other test in this file, where the two always
    // coincide. Here they do not, and the near-miss reports "no such workspace"
    // for a workspace with a full eight-event ledger, re-opening the
    // escalation.
    // Mutation: read `proj_entity_heads WHERE entity_kind = 'workspace' AND
    // entity_id = $1` instead of `events WHERE workspace_id = $1` in
    // `workspaceHasLedger`, and this is the only test that goes red.
    const ingest = ingestService();
    const workspaceId = newUlid();
    const founder = newUlid();
    const oddlyFiled: SubmittedEvent = {
      ...founding(workspaceId, founder),
      entity: { kind: 'workspace', id: newUlid() },
    };
    expectCommitted(await ingest.ingestBatch([oddlyFiled]));
    expect((await workspaceStream(workspaceId)).length).toBe(8);

    const stranger = newUlid();
    const attempt = founding(workspaceId, stranger);
    expect((await ingest.ingestClientBatch([attempt], stranger))[0]).toEqual({
      status: 'refused',
      eventId: attempt.id,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });
  });

  it('planted defect: the INTERNAL door does not re-found an existing workspace either', async () => {
    // The internal door has no gate BY DESIGN, and Plan 11's seed CLIs and Task
    // 13 both use it, so the refusal above protects nothing here. The bootstrap
    // carries its own condition: `workspaceSeq === 1`, which is the workspace's
    // own first event and cannot be forged by choosing a fresh entity.
    // Mutation: relax the condition to `result.status === 'committed'` alone
    // (or to the per-entity `seq === 1`) and the stream below grows by a second
    // whole bootstrap.
    const ingest = ingestService();
    const workspaceId = newUlid();
    const founder = newUlid();
    expectCommitted(await ingest.ingestBatch([founding(workspaceId, founder)]));

    const second: SubmittedEvent = {
      ...founding(workspaceId, newUlid()),
      entity: { kind: 'workspace', id: newUlid() },
    };
    // It COMMITS — the internal door trusts its caller, and this is an
    // ordinary append — but it founds nothing.
    expectCommitted(await ingest.ingestBatch([second]));
    expect((await workspaceStream(workspaceId)).length).toBe(9);
    const { rows } = await db.pool.query<{ user_id: string }>(
      `SELECT user_id FROM proj_memberships WHERE workspace_id = $1 AND scope_kind = 'workspace'`,
      [workspaceId],
    );
    expect(rows).toEqual([{ user_id: founder }]);
  });

  it('planted defect: the FOUNDER cannot append a second founding to their own workspace', async () => {
    // CASE 6.52 end to end, and the actor is deliberately the OWNER rather than
    // a fresh member: every earlier guard in `checkRolePermission` passes on its
    // own for them — the actor IS the session user, the envelope-origin is
    // `'web'`, and their role is not null — so the refusal cannot be the
    // identity, provenance or membership check firing early. That is what makes
    // it a measurement of the new branch and not of one already proven.
    //
    // The FRESH entity id is kept from the escalation case above: the obvious
    // near-misses (a head-row lookup on `env.entity.id`, or the per-entity
    // `seq`) both pass here because this entity has never been seen.
    // Mutation: delete the `workspace.created` refusal in `checkRolePermission`
    // and the stream below goes from 7 to 8.
    const ingest = ingestService();
    const workspaceId = newUlid();
    const founder = newUlid();
    expectCommitted(await ingest.ingestBatch([founding(workspaceId, founder)]));

    const again: SubmittedEvent = {
      ...founding(workspaceId, founder),
      entity: { kind: 'workspace', id: newUlid() },
    };
    expect((await ingest.ingestClientBatch([again], founder))[0]).toEqual({
      status: 'refused',
      eventId: again.id,
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_ALREADY_FOUNDED_REASON,
    });
    expect((await workspaceStream(workspaceId)).length).toBe(8);

    // POSITIVE CONTROL, in the same suite and the same door: the SAME person
    // founding a workspace that does not exist yet still commits, and still
    // gets the whole sequence. Without it, "the client door refuses every
    // `workspace.created`" — which would break the product's only founding
    // path — passes this test.
    const fresh = newUlid();
    expectCommitted(await ingest.ingestClientBatch([founding(fresh, founder)], founder));
    expect((await workspaceStream(fresh)).length).toBe(8);
  });

  it('a REDELIVERED founding envelope — same event id, client door — is refused, not idempotently acked', async () => {
    // CASE 6.105, which until now had no covering test: it was written down
    // from reading `check-permission.ts` — a check-mark citing a SOURCE file,
    // the direction this catalogue's own rule forbids, and the direction four
    // wrong check-marks in §9 were once written in. This is the behaviour change
    // case 6.52 bought, and it is now run rather than read.
    //
    // It is NOT the case above. That one submits a FRESH event id (and a fresh
    // entity) and is refused because the workspace already exists. This one
    // submits THE SAME ENVELOPE TWICE — same event id, same entity id — which
    // is the path a redelivering client takes, and the two are exactly the
    // distinction this task's escalation turned on. Before the `workspace.created`
    // refusal landed, this answered `duplicate-event-id`, an `invalid` result
    // and a safe idempotent ack; it now answers a permission refusal, because
    // `checkRolePermission` runs before `insertEvent` and only the primary key
    // can tell a redelivery from a fresh claim.
    //
    // BOTH submissions go through the CLIENT door, deliberately: the first
    // establishes that this envelope founded this workspace through this door,
    // so the second's different answer cannot be the door changing underneath
    // it. Mutation: delete the `env.type === 'workspace.created'` refusal in
    // `checkRolePermission` and this reddens on the FIRST assertion — the
    // redelivery goes back to `duplicate-event-id`.
    const ingest = ingestService();
    const workspaceId = newUlid();
    const founder = newUlid();
    const envelope = founding(workspaceId, founder);

    expectCommitted(await ingest.ingestClientBatch([envelope], founder));
    expect((await workspaceStream(workspaceId)).length).toBe(8);

    // The redelivery. The founder now holds `owner`, so every earlier guard in
    // the gate passes on its own and the refusal can only be the new branch.
    expect((await ingest.ingestClientBatch([envelope], founder))[0]).toEqual({
      status: 'refused',
      eventId: envelope.id,
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_ALREADY_FOUNDED_REASON,
    });
    expect((await workspaceStream(workspaceId)).length).toBe(8);

    // THE DISCRIMINATOR, and without it "refused" is equally consistent with an
    // id the gate never got to. The SAME envelope through the INTERNAL door —
    // where nothing in `checkRolePermission` runs — still answers
    // `duplicate-event-id`, which is proof the id genuinely is in the ledger and
    // that what changed at the client door is the gate and nothing else. It is
    // also the door Plan 11's seed CLIs use, and case 6.26 depends on this
    // answer staying what it is.
    expect((await ingest.ingestBatch([envelope]))[0]).toMatchObject({
      status: 'invalid',
      code: 'duplicate-event-id',
    });
    expect((await workspaceStream(workspaceId)).length).toBe(8);
  });

  it('founds through the CLIENT door too — the gate admits the founding and not the sequence', async () => {
    // The discriminating case for the whole bootstrap design. The founding
    // sequence is envelope-origin `'server'`, which `checkRolePermission`
    // refuses outright; it commits only because `bootstrapWorkspace` appends
    // through the INTERNAL door. Mutation: pass `door` instead of `null` at the
    // bootstrap call site in `ingestAll` and this test fails with the
    // server-origin refusal — the whole workspace unusable, which is exactly
    // the failure the owner decision exists to prevent.
    const workspaceId = newUlid();
    const founder = newUlid();
    const results = await ingestService().ingestClientBatch([founding(workspaceId, founder)], founder);

    expectCommitted(results);
    expect((await workspaceStream(workspaceId)).map((row) => row.type)).toEqual([
      'workspace.created',
      'workflow.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'ticket-type.defined',
      'membership.granted',
    ]);
  });
});

describe('the gate at the client door — refusals before the rule engine', () => {
  /** Founds a workspace and returns the owner's id; the bootstrap makes them owner. */
  async function foundedWorkspace(ingest: IngestService) {
    const workspaceId = newUlid();
    const owner = newUlid();
    expectCommitted(await ingest.ingestBatch([founding(workspaceId, owner)]));
    return { workspaceId, owner };
  }

  async function grantMember(ingest: IngestService, workspaceId: string, owner: string, role: string) {
    const user = newUlid();
    expectCommitted(
      await ingest.ingestBatch([
        submitted({
          workspaceId,
          entity: { kind: 'membership', id: membershipId(workspaceId, user) },
          type: 'membership.granted',
          payload: { userId: user, role },
          actorId: owner,
        }),
      ]),
    );
    return user;
  }

  /**
   * A ticket every member of the workspace can SEE, seeded through the real
   * `ticket.created` event and a real `visibility.set`.
   *
   * Needed since Plan 4 Task 9: the gate now refuses a ticket-entity event
   * whose ticket the actor cannot see, and `canSee` answers false for a ticket
   * with no `proj_visibility` row exactly as it does for an invisible one. The
   * cases below used to file `ticket.assigned` against a bare `newUlid()`,
   * which the visibility check now refuses — so without this the two cases
   * would be red for a reason that has nothing to do with revocation or with
   * connection use, which is the "refusal fires before the interesting code"
   * failure this file's own comments warn about elsewhere.
   *
   * `'workspace'` mode rather than a project roster, deliberately: these cases
   * are about the role gate and the transaction, and a project attachment would
   * add a second thing that has to keep being true for them to stay green.
   */
  async function visibleTicket(workspaceId: string): Promise<string> {
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId: newUlid(), ticketId });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'workspace')]);
    return ticketId;
  }

  it('planted defect: a member ingesting workflow.defined is refused BEFORE the engine runs', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const member = await grantMember(ingest, workspaceId, owner, 'member');

    // The payload is envelope-VALID (so `parseEvent`, which runs ahead of the
    // gate, has nothing to say) and engine-INVALID: a first publish claiming
    // version 2 draws `workflow-version` from `evaluateWorkflowDefined`. Two
    // different refusals are therefore available for this one event, and which
    // one comes back says which check ran. A payload that only the gate could
    // refuse would make the ordering claim unfalsifiable.
    const workflowId = newUlid();
    const event = submitted({
      workspaceId,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: { ...SIMPLE_KANBAN_TEMPLATE, id: workflowId, version: 2 },
      actorId: member,
    });
    const results = await ingest.ingestClientBatch([event], member);

    expect(results[0]).toEqual({
      status: 'refused',
      eventId: event.id,
      rule: PERMISSION_ROLE_RULE,
      reason: adminOnlyReason('member'),
    });
    // "Before the engine" is the load-bearing half, and two independent things
    // pin it: the REASON above is the gate's and not `workflow-version`, and
    // the engine was never asked at all. Mutation: move the gate below
    // `deps.evaluate` in `commitInTx` — the reason becomes the engine's and this
    // line goes red too.
    expect(evaluated).not.toContain(event.id);
  });

  it('admits the same event from the workspace owner', async () => {
    // The admits direction, through the same door with the same shape. Without
    // it, a gate that refused every `workflow.defined` would pass the case
    // above. The payload is a real definition, because this one reaches the
    // engine.
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const workflowId = newUlid();
    const event = submitted({
      workspaceId,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: { ...SIMPLE_KANBAN_TEMPLATE, id: workflowId, version: 1 },
      actorId: owner,
    });

    expectCommitted(await ingest.ingestClientBatch([event], owner));
    expect(evaluated).toContain(event.id);
  });

  it('refuses a non-member of the workspace', async () => {
    const ingest = ingestService();
    const { workspaceId } = await foundedWorkspace(ingest);
    const stranger = newUlid();
    const event = submitted({
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.assigned',
      payload: { assigneeId: newUlid() },
      actorId: stranger,
    });

    expect((await ingest.ingestClientBatch([event], stranger))[0]).toEqual({
      status: 'refused',
      eventId: event.id,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });
  });

  it('refuses a claim attributed to someone else, even from a workspace owner', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const workflowId = newUlid();
    const event = submitted({
      workspaceId,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: { ...SIMPLE_KANBAN_TEMPLATE, id: workflowId, version: 1 },
      actorId: newUlid(), // not the session
    });

    expect((await ingest.ingestClientBatch([event], owner))[0]).toEqual({
      status: 'refused',
      eventId: event.id,
      rule: PERMISSION_ROLE_RULE,
      reason: IDENTITY_SPOOF_REASON,
    });
  });

  /**
   * 6.46 — the gate reads roles through `resolveEffectiveRole`, so a REVOKED member is refused at once rather than at the next cache boundary.
   */
  it('reads the role through resolveEffectiveRole, so a revoked member is refused at once', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const member = await grantMember(ingest, workspaceId, owner, 'member');

    const ticketId = await visibleTicket(workspaceId);
    const ticketEvent = () =>
      submitted({
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.assigned',
        payload: { assigneeId: member },
        actorId: member,
      });
    // Before: an ordinary member's ordinary ticket work goes through.
    expectCommitted(await ingest.ingestClientBatch([ticketEvent()], member));

    expectCommitted(
      await ingest.ingestBatch([
        submitted({
          workspaceId,
          entity: { kind: 'membership', id: membershipId(workspaceId, member) },
          type: 'membership.revoked',
          payload: { userId: member },
          actorId: owner,
        }),
      ]),
    );

    // After: the same claim from the same person, refused. This is the pair
    // that makes the gate's answer depend on the LEDGER rather than on the
    // session — a gate that cached a role, or that read the request instead of
    // `proj_memberships`, passes the first half and fails here.
    const afterRevoke = ticketEvent();
    expect((await ingest.ingestClientBatch([afterRevoke], member))[0]).toEqual({
      status: 'refused',
      eventId: afterRevoke.id,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });
  });

  /**
   * 6.150 — E6-21 — a member can leave a workspace, through the real client
   * door. (Case id in `test-cases/06-auth-visibility.md`, not a bare in-file
   * marker — see that file's own note on why this file carries none of the
   * gate's older cases.)
   * Before this fix, `membership.revoked` gated EVERY submission (including
   * one's own) on `isWorkspaceAdmin`, so a plain member's own leave-claim was
   * refused `WORKSPACE_MEMBERSHIP_REASON` — the same refusal aimed at someone
   * trying to manage a DIFFERENT person's membership. Two documents already
   * assumed leaving was possible: `http-origin.ts` excludes the invite-accept
   * door from the CSRF set because acceptance lands "in a workspace they can
   * leave", and the export's privacy copy promises the same.
   */
  it('lets a member leave the workspace by revoking their own membership', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const member = await grantMember(ingest, workspaceId, owner, 'member');

    const leave = submitted({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, member) },
      type: 'membership.revoked',
      payload: { userId: member },
      actorId: member,
    });
    expectCommitted(await ingest.ingestClientBatch([leave], member));

    // After leaving, the same person is a non-member — the ledger-driven
    // read 6.46 above already proves for an OWNER-initiated revoke, and this
    // shows the self-initiated one has the identical effect.
    const workflowId = newUlid();
    const afterLeave = submitted({
      workspaceId,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: { ...SIMPLE_KANBAN_TEMPLATE, id: workflowId, version: 1 },
      actorId: member,
    });
    expect((await ingest.ingestClientBatch([afterLeave], member))[0]).toEqual({
      status: 'refused',
      eventId: afterLeave.id,
      rule: PERMISSION_ROLE_RULE,
      reason: NOT_A_MEMBER_REASON,
    });
  });

  /**
   * The control for the case above: a plain member still cannot revoke
   * SOMEONE ELSE'S membership — the fix is scoped to SELF-revocation, not a
   * blanket bypass of `WORKSPACE_MEMBERSHIP_REASON` for the event type.
   */
  it('still refuses a member revoking someone else — the fix does not widen past self', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const member = await grantMember(ingest, workspaceId, owner, 'member');
    const other = await grantMember(ingest, workspaceId, owner, 'member');

    const revokeOther = submitted({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, other) },
      type: 'membership.revoked',
      payload: { userId: other },
      actorId: member,
    });
    expect((await ingest.ingestClientBatch([revokeOther], member))[0]).toEqual({
      status: 'refused',
      eventId: revokeOther.id,
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_MEMBERSHIP_REASON,
    });
  });

  /**
   * 6.45 — project-roster changes are gated on PROJECT-ADMIN rights, not on workspace membership.
   */
  it('gates the project roster on project-admin rights, not on workspace membership', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const projectAdmin = await grantMember(ingest, workspaceId, owner, 'member');
    const plainMember = await grantMember(ingest, workspaceId, owner, 'member');
    const projectId = newUlid();

    const project = submitted({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: { name: 'First project' },
      actorId: owner,
    });
    expectCommitted(await ingest.ingestClientBatch([project], owner));

    // The owner puts one member on the project AS a project admin.
    expectCommitted(
      await ingest.ingestClientBatch(
        [
          submitted({
            workspaceId,
            entity: { kind: 'project', id: projectId },
            type: 'project.member_added',
            payload: { userId: projectAdmin, projectAdmin: true },
            actorId: owner,
          }),
        ],
        owner,
      ),
    );

    // That project admin may now run the roster...
    expectCommitted(
      await ingest.ingestClientBatch(
        [
          submitted({
            workspaceId,
            entity: { kind: 'project', id: projectId },
            type: 'project.member_added',
            payload: { userId: plainMember, projectAdmin: false },
            actorId: projectAdmin,
          }),
        ],
        projectAdmin,
      ),
    );

    // ...and the member they just added may not, though both are members of the
    // same workspace and both are on the same project. Workspace membership is
    // not project-admin rights; that is the whole distinction.
    const overreach = submitted({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId: newUlid(), projectAdmin: true },
      actorId: plainMember,
    });
    expect((await ingest.ingestClientBatch([overreach], plainMember))[0]).toEqual({
      status: 'refused',
      eventId: overreach.id,
      rule: PERMISSION_ROLE_RULE,
      reason: PROJECT_ROSTER_REASON,
    });
  });

  /**
   * 6.44 — the gate reads the ingest transaction’s OWN connection, never a second one from the pool.
   */
  it('planted defect: the gate reads the ingest transaction, never a second connection', async () => {
    // Set up through the ordinary service; only the gated submission runs
    // against the one-connection pool, so the setup cannot itself trip it.
    const setup = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(setup);
    const member = await grantMember(setup, workspaceId, owner, 'member');

    const constrained = createIngestService({
      pool: poolAllowingOneClient(db.pool),
      evaluate: evaluateEvent,
      projections: buildProjectionRegistry(),
    });
    const event = submitted({
      workspaceId,
      entity: { kind: 'ticket', id: await visibleTicket(workspaceId) },
      type: 'ticket.assigned',
      payload: { assigneeId: member },
      actorId: member,
    });

    // Mutation: `{ db: deps.pool, ... }` at the gate call site in `commitInTx`.
    // This then rejects with the planted error above instead of committing —
    // verified by running it, and verified for the MECHANISM and not only the
    // colour: the planted sentence appears in the mutated run's output and
    // `db.query is not a function` does not. Before `poolAllowingOneClient`
    // grew a faithful `query` those two counts were the other way round, and
    // the test was red for a reason that had nothing to do with a second
    // connection.
    expectCommitted(await constrained.ingestClientBatch([event], member));
  });

  it('the INTERNAL door is not gated — the same refused event commits through it', async () => {
    // The discriminating case for the two-door design: identical event, one
    // difference, opposite answers. Mutation: apply the gate in `ingestBatch`
    // and this reddens, along with every server append in the product.
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const member = await grantMember(ingest, workspaceId, owner, 'member');
    const workflowId = newUlid();
    const event = submitted({
      workspaceId,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: { ...SIMPLE_KANBAN_TEMPLATE, id: workflowId, version: 1 },
      actorId: member,
    });

    expect((await ingest.ingestClientBatch([{ ...event, id: newUlid() }], member))[0]).toMatchObject({
      status: 'refused',
      rule: PERMISSION_ROLE_RULE,
    });
    expectCommitted(await ingest.ingestBatch([event]));
  });
});

/**
 * The last-owner guard against the REAL database (owner ruling 2026-09-18).
 *
 * ## Why this block exists when `packages/rule-engine/test/membership.test.ts` is green
 *
 * That suite drives the guard through a hand-rolled context — it has to, because
 * neither in-memory context can serve a membership role for anybody but the
 * actor. A stub context proves the guard's LOGIC and says nothing whatever about
 * the other half of it: `countWorkspaceOwners` is a `SELECT` against
 * `proj_memberships`, and every branch of the guard is downstream of whether
 * that query returns the number the guard thinks it returns. A wrong column, a
 * predicate that excludes the wrong rows, or a count that ignores
 * `excludingUserId` would leave the stub suite 16/16 green while the guard did
 * nothing on the only path that runs in production. That is this repository's
 * signature failure — a mocked contract is the thing that excuses the server
 * from existing — and the remedy is to drive the real ingest service against a
 * real database, which is what these cases do.
 *
 * ## The control is the point, not the decoration
 *
 * Two of the three cases below exist to stop the first from passing for the
 * wrong reason. A guard hard-coded to refuse "an admin changing an owner" would
 * satisfy the attack case alone; the second-owner case is what forces the count
 * to be read. A gate that refused every `membership.granted` naming `owner`
 * would satisfy the self-promotion case; the owner's own grant is what forces
 * the actor check to be a comparison rather than a blanket refusal.
 */
describe('the last-owner guard on the real door — the SELECT, not just the rule', () => {
  /**
   * EVERY event below goes through `ingestClientBatch`, and the first cut of
   * this block did not — it used `ingestBatch` and the self-promotion case came
   * back `committed`. The cause is the two-door design the case ABOVE this
   * block pins: `ingestBatch` is the internal append path and does NOT run the
   * permission gate, so a case asserting a permission refusal through it is
   * vacuous — it passes or fails for reasons unrelated to the rule, and here it
   * failed, which is the only reason the mistake was visible at all. `last-owner`
   * would have hidden the same error, because the engine runs on both doors.
   * The client door is the one the product uses and the only one that runs both
   * halves.
   */
  async function foundedWorkspace(ingest: IngestService) {
    const workspaceId = newUlid();
    const owner = newUlid();
    expectCommitted(await ingest.ingestBatch([founding(workspaceId, owner)]));
    return { workspaceId, owner };
  }

  const setRole = (workspaceId: string, actor: string, userId: string, role: string): SubmittedEvent =>
    submitted({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role },
      actorId: actor,
    });

  /** Grants `role`, through the CLIENT door as `actor`, and returns the new user. */
  async function grantMember(
    ingest: IngestService,
    workspaceId: string,
    actor: string,
    role: string,
  ): Promise<string> {
    const user = newUlid();
    const result = await ingest.ingestClientBatch([setRole(workspaceId, actor, user, role)], actor);
    expectCommitted(result);
    return user;
  }

  /**
   * 13.820 (the real-door half) — the attack the task exists for, plus the
   * controls that make the refusal mean something.
   */
  it('refuses an admin demoting the SOLE owner, and commits the same demotion once a second owner exists', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const admin = await grantMember(ingest, workspaceId, owner, 'admin');

    // The attack: an ADMIN demotes the SOLE OWNER. **SUPERSEDED — the rule that
    // refuses this is no longer `last-owner`.** The owner ruled on 2026-09-18
    // (second sitting) that an admin may not demote a non-last owner either, so
    // the act is refused for a reason that does not depend on the count at all:
    // changing who is an owner is owner-only, in both directions. The gate now
    // refuses it BEFORE the engine runs, which is why this arm asserts the gate's
    // id — and why this arm no longer proves anything about the count. The arm
    // that does is below, and it had to move to an OWNER actor to survive.
    expect((await ingest.ingestClientBatch([setRole(workspaceId, admin, owner, 'member')], admin))[0]).toMatchObject(
      { status: 'refused', rule: 'remove-owner-requires-owner' },
    );

    // The other door to the same state, and it must answer the same.
    expect(
      (
        await ingest.ingestClientBatch(
          [
            submitted({
              workspaceId,
              entity: { kind: 'membership', id: membershipId(workspaceId, owner) },
              type: 'membership.revoked',
              payload: { userId: owner },
              actorId: admin,
            }),
          ],
          admin,
        )
      )[0],
    ).toMatchObject({ status: 'refused', rule: 'remove-owner-requires-owner' });

    // THE COUNT-PROOF, RE-ESTABLISHED ON THE ONLY PATH THE NEW RULE LEAVES OPEN.
    //
    // The arm that used to live here — "mint a second owner, then the SAME admin
    // demotion commits" — is no longer true and no longer SHOULD be: the owner
    // ruled that an admin may not demote a NON-LAST owner either, so an admin
    // never reaches the engine's world-half at all. Deleting the arm would take
    // the count's only real-door witness with it, so it moves to the one act the
    // gate still admits and the count alone decides: **an OWNER demoting
    // THEMSELVES out of the last ownership.** An owner may change an owner's
    // role; only the workspace going empty makes it a refusal. A query that
    // always answered 1, or one that ignored `excludingUserId` and counted the
    // target, would let this through.
    expect((await ingest.ingestClientBatch([setRole(workspaceId, owner, owner, 'member')], owner))[0]).toMatchObject(
      { status: 'refused', rule: 'last-owner' },
    );

    // CONTROL. A second owner is minted by the owner (who may), and the SAME
    // self-demotion then COMMITS — the guard follows the table rather than
    // reusing its first answer. Without this arm the refusal above is equally
    // consistent with a guard that refused every self-demotion.
    await grantMember(ingest, workspaceId, owner, 'owner');
    expectCommitted(await ingest.ingestClientBatch([setRole(workspaceId, owner, owner, 'member')], owner));

    const { rows } = await db.pool.query<{ user_id: string }>(
      `SELECT user_id FROM proj_memberships
        WHERE workspace_id = $1 AND scope_kind = 'workspace' AND role = 'owner'`,
      [workspaceId],
    );
    expect(rows).toHaveLength(1);

    // BATCHING must not be a way around the guard, and this is measured rather
    // than assumed. Two events in ONE submission are judged one at a time, and
    // the context reads through the ingest TRANSACTION's own client, so the
    // count for the second event sees the first one's effect. An admin who
    // demotes BOTH owners in a single batch therefore commits the first and is
    // refused `last-owner` on the second. Without that visibility each event
    // would see two owners, both would commit, and the workspace would reach
    // zero owners — so THIS is the assertion that pins the property, and the
    // per-event arm above it does not.
    //
    // The actor is an ADMIN rather than an owner on purpose: an owner demoting
    // himself to member is refused on the SECOND event by the role gate (he is
    // no longer an admin by then), which would make the case pass while the
    // count was blind. An admin who is never demoted isolates the count.
    const second = rows[0]!.user_id; // the one owner left after the self-demotion above
    // `grantMember` MINTS its target, so this is a THIRD person, not `owner`
    // restored — an earlier cut of this case demoted `owner` (a plain member by
    // now) and `second` (one of two owners) and both committed, which is the
    // assertion doing its job on the test rather than on the code.
    //
    // THE ACTOR IS AN OWNER, and it has to be: an admin can no longer reach the
    // engine's world-half for ANY owner-targeted change, so a batch driven by an
    // admin would be refused at the first event by the gate and this arm would
    // pin nothing. `second` is an owner for BOTH events — the second is the one
    // that gets refused, so its role never changes mid-batch.
    const third = await grantMember(ingest, workspaceId, second, 'owner'); // owners: second + third
    const batch = await ingest.ingestClientBatch(
      [setRole(workspaceId, second, third, 'member'), setRole(workspaceId, second, second, 'member')],
      second,
    );
    expect(batch).toMatchObject([
      { status: 'committed' },
      { status: 'refused', rule: 'last-owner' },
    ]);
    const after = await db.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM proj_memberships
        WHERE workspace_id = $1 AND scope_kind = 'workspace' AND role = 'owner'`,
      [workspaceId],
    );
    expect(Number(after.rows[0]!.n)).toBe(1);
  });

  /**
   * 13.823 (the real-door half) — the escalation the world-half alone cannot
   * close, because the workspace never holds zero owners at any step of it.
   */
  it('refuses an admin promoting THEMSELVES to owner, and commits the same grant from an owner', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const admin = await grantMember(ingest, workspaceId, owner, 'admin');

    expect(
      (await ingest.ingestClientBatch([setRole(workspaceId, admin, admin, 'owner')], admin))[0],
    ).toMatchObject({ status: 'refused', rule: 'grant-owner-requires-owner' });

    // CONTROL: the same event type from the OWNER, through the SAME door,
    // commits — so the rule is a comparison against the actor's role and not a
    // refusal of the event type. Without this, a gate that refused every
    // owner-grant would pass the case above, and no workspace could ever gain a
    // second owner.
    expectCommitted(
      await ingest.ingestClientBatch([setRole(workspaceId, owner, newUlid(), 'owner')], owner),
    );
  });

  /**
   * 13.883 — an admin may not demote a NON-LAST owner (owner ruling 2026-09-18,
   * second sitting: *"may an admin demote a non-last owner: **no**."*).
   *
   * ## The door, the four attempts, and why each control is here
   *
   * Every event below goes through `ingestClientBatch` — the CLIENT door, which
   * is the only one that runs both halves. `ingestBatch` is the internal append
   * path and does NOT apply the permission gate, so a case asserting a
   * PERMISSION refusal through it is vacuous; the block above records a first
   * cut that made exactly that mistake and only noticed because the assertion
   * failed.
   *
   * The ruling is a single sentence and it needs FOUR measurements, because
   * three of them are refusals-or-admissions that a WRONG implementation would
   * also produce:
   *
   *  - `remove-owner-requires-owner` fires for an admin on ANY owner, not just
   *    the last one. This is the whole of the new rule, and the state it needs
   *    is the TARGET's row — the two owners are the control on each other.
   *  - A blanket "refuse everything an admin does to an owner" would satisfy
   *    attempt 1. **The OWNER's own demotion is what forces it to be a
   *    comparison** rather than a refusal of the act.
   *  - A blanket "refuse every `membership.granted`" would satisfy attempts 1
   *    and 4. **The admin promoting a plain member to admin is what forces it to
   *    be about OWNER status** and not about the event at all — and it is the
   *    behaviour the ruling explicitly preserves.
   *  - Attempt 4 pins that the GRANT half still answers with its own id, so this
   *    change did not swallow the rule that already shipped.
   */
  it('13.883 refuses an admin removing owner status from ANY owner, and leaves every other admin act working', async () => {
    const ingest = ingestService();
    const { workspaceId, owner } = await foundedWorkspace(ingest);
    const admin = await grantMember(ingest, workspaceId, owner, 'admin');
    // A second owner, so NO refusal below can be the world-half: the workspace
    // holds two owners throughout attempts 1, 3 and 4, and `last-owner` would
    // allow every one of them.
    const secondOwner = await grantMember(ingest, workspaceId, owner, 'owner');
    const member = await grantMember(ingest, workspaceId, owner, 'member');

    // ATTEMPT 1 — admin demotes a NON-LAST owner. The attack the ruling closes.
    expect(
      (await ingest.ingestClientBatch([setRole(workspaceId, admin, secondOwner, 'member')], admin))[0],
    ).toMatchObject({ status: 'refused', rule: 'remove-owner-requires-owner' });

    // The same act through the OTHER membership event, which names no role and
    // therefore reaches the rule by a different read. Both must answer alike.
    expect(
      (
        await ingest.ingestClientBatch(
          [
            submitted({
              workspaceId,
              entity: { kind: 'membership', id: membershipId(workspaceId, secondOwner) },
              type: 'membership.revoked',
              payload: { userId: secondOwner },
              actorId: admin,
            }),
          ],
          admin,
        )
      )[0],
    ).toMatchObject({ status: 'refused', rule: 'remove-owner-requires-owner' });

    // ATTEMPT 3 — admin moves a plain MEMBER to admin. MUST COMMIT: the ruling
    // narrows owner transitions only, and a rule that refused this would have
    // taken away the roster management admins are for.
    expectCommitted(
      await ingest.ingestClientBatch([setRole(workspaceId, admin, member, 'admin')], admin),
    );

    // ATTEMPT 4 — admin GRANTS owner. Still the sibling rule, by its own id, so
    // this change did not absorb it.
    expect(
      (await ingest.ingestClientBatch([setRole(workspaceId, admin, member, 'owner')], admin))[0],
    ).toMatchObject({ status: 'refused', rule: 'grant-owner-requires-owner' });

    // ATTEMPT 2 — the OWNER performs the same demotion the admin was refused.
    // MUST COMMIT — this is how ownership is actually transferred, and it is the
    // arm that proves the rule reads the actor's role rather than refusing the
    // act outright.
    expectCommitted(
      await ingest.ingestClientBatch([setRole(workspaceId, owner, secondOwner, 'member')], owner),
    );

    // The refusal above left the target's row UNTOUCHED — read from the
    // projection rather than inferred from the refusal, because a gate that
    // refused the event and a projection that wrote it anyway would look
    // identical from the verdict alone.
    const { rows } = await db.pool.query<{ role: string }>(
      `SELECT role FROM proj_memberships
        WHERE workspace_id = $1 AND scope_kind = 'workspace' AND user_id = $2`,
      [workspaceId, secondOwner],
    );
    expect(rows[0]!.role).toBe('member'); // by the OWNER's event, not the admin's
  });
});

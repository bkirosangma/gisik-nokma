import { describe, expect, it } from 'vitest';
import {
  makeEnvelope,
  membershipId,
  newUlid,
  type EventEnvelope,
  type WorkspaceRole,
} from '@gisik-nokma/domain';
import type { EngineContext, TenantScope } from '../src/engine.js';
import { checkMembershipGranted, checkMembershipRevoked } from '../src/checks/membership.js';
import { evaluateEvent } from '../src/evaluate.js';
import { WS } from '../src/checks/test-support.js';

/**
 * The last-owner guard (owner ruling 2026-09-18), and why this file does NOT
 * use the shared fixture suite.
 *
 * Measured before writing, and it is the reason the context below is
 * hand-rolled rather than imported: of the four `EngineContext`
 * implementations, only the SERVER and the FIXTURE HARNESS can serve a
 * membership with a role at all. `buildMemoryContext` answers `null` for every
 * membership by design (its own suite pins that), and the offline replica
 * serves only the ACTOR's own membership from bootstrap `me`. A guard whose
 * entire input is "what role does this OTHER person hold" can therefore not be
 * driven by either of the two in-memory contexts the fixture suite uses — and
 * the harness, which does serve roles, is reached only through fixture JSON,
 * none of which carries a `membership.granted` candidate.
 *
 * So the guard's witness is here. That is a real limit and it is recorded in
 * `Features.md` as a hedge rather than left for a reader to infer, because a
 * guard whose only witness is a stub is one step weaker than a guard the
 * fixture suite drives.
 *
 * ## Ids are ULIDs, and that is load-bearing
 *
 * `membershipGrantedPayload` is `.strict()` with `userId: ulidString` —
 * `z.string().regex(ULID_REGEX, 'must be a ULID')`. A readable placeholder like
 * `'u1'` fails the payload parse and the check answers `malformed-payload`,
 * which is a refusal, so a test asserting `last-owner` against `'u1'` would be
 * red for a reason that has nothing to do with this guard — and the tempting
 * repair is to relax the assertion, which would delete the witness. Every id
 * below is minted, or comes from `test-support.ts`, where they are ULIDs.
 *
 * Note also that Crockford base32 has no `I`, `L`, `O` or `U`: a hand-written
 * constant such as `01J9GUSR...` is invalid for that reason alone.
 */

/** One stub per case, shaped like the server's: memberships carry a role. */
function ctxWith(opts: {
  /** Owners of the workspace INCLUDING the target, when the target is one. */
  owners: number;
  target?: { userId: string; role: WorkspaceRole } | null;
  /** Omit the counter entirely — a context that predates this guard. */
  cannotCount?: boolean;
}): EngineContext {
  const target = opts.target ?? null;
  return {
    async getEntityState(kind, id) {
      if (kind !== 'membership' || target === null) return null;
      return { kind: 'membership', id, workspaceId: WS, userId: target.userId, role: target.role };
    },
    async getChildrenStates() {
      return [];
    },
    async getWorkflowDef() {
      return null;
    },
    async getTicketTypeDef() {
      return null;
    },
    ...(opts.cannotCount === true
      ? {}
      : {
          // The target is one of `owners` when they hold the role, so excluding
          // them leaves one fewer. That arithmetic is the stub's, and the two
          // cases below that pin it are the reason it is not `opts.owners`
          // unconditionally: a stub that ignored `excludingUserId` would make
          // the two-owner case pass for the wrong reason.
          async countWorkspaceOwners(_scope: TenantScope, excludingUserId?: string) {
            return excludingUserId === undefined ? opts.owners : Math.max(0, opts.owners - 1);
          },
        }),
  };
}

const grant = (userId: string, role: WorkspaceRole): EventEnvelope =>
  makeEnvelope({
    type: 'membership.granted',
    entity: { kind: 'membership', id: membershipId(WS, userId) },
    workspaceId: WS,
    payload: { userId, role },
  });

const revoke = (userId: string): EventEnvelope =>
  makeEnvelope({
    type: 'membership.revoked',
    entity: { kind: 'membership', id: membershipId(WS, userId) },
    workspaceId: WS,
    payload: { userId },
  });

const LAST_OWNER_REASON =
  'This change would leave the workspace with no owner. Grant the owner role to somebody else first.';

/** 13.820 — the guard on the grant door. */
describe('13.820 a membership.granted that would leave the workspace ownerless', () => {
  it('refuses demoting the only owner, naming last-owner', async () => {
    const owner = newUlid();
    const r = await checkMembershipGranted(
      grant(owner, 'member'),
      ctxWith({ owners: 1, target: { userId: owner, role: 'owner' } }),
    );
    expect(r).toEqual({ refused: true, rule: 'last-owner', reason: LAST_OWNER_REASON });
  });

  it('accepts demoting one of TWO owners — the other still holds it', async () => {
    // The counter-example that makes the count MEAN something. Without it, a
    // guard that refused every demotion of an owner would pass the case above.
    const owner = newUlid();
    const r = await checkMembershipGranted(
      grant(owner, 'member'),
      ctxWith({ owners: 2, target: { userId: owner, role: 'owner' } }),
    );
    expect(r).toEqual({ refused: false });
  });

  it('accepts a change that does not move anybody OUT of owner, however few owners there are', async () => {
    // The sharpest of the accept arms: ONE owner exists, and the event is a
    // demotion-shaped grant — but the target is a plain member, so nothing is
    // emptied and the count is never consulted. A guard keyed on the ROLE IN
    // THE PAYLOAD rather than on the target's CURRENT role would refuse this.
    const member = newUlid();
    const r = await checkMembershipGranted(
      grant(member, 'guest'),
      ctxWith({ owners: 1, target: { userId: member, role: 'member' } }),
    );
    expect(r).toEqual({ refused: false });
  });

  it('accepts re-stating the only owner as an owner', async () => {
    // The other half of the same distinction: this event IS about the sole
    // owner, and the only thing that saves it is that the role does not CHANGE.
    const owner = newUlid();
    const r = await checkMembershipGranted(
      grant(owner, 'owner'),
      ctxWith({ owners: 1, target: { userId: owner, role: 'owner' } }),
    );
    expect(r).toEqual({ refused: false });
  });

  it('accepts a grant to somebody who holds no membership here yet', async () => {
    const stranger = newUlid();
    const r = await checkMembershipGranted(grant(stranger, 'admin'), ctxWith({ owners: 1, target: null }));
    expect(r).toEqual({ refused: false });
  });

  it('is reachable through evaluateEvent, not only by direct call', async () => {
    // The dispatch arm is what makes the guard live on the server path; a check
    // that is correct but unreachable refuses nothing.
    const owner = newUlid();
    expect(
      await evaluateEvent(grant(owner, 'member'), ctxWith({ owners: 1, target: { userId: owner, role: 'owner' } })),
    ).toMatchObject({ rule: 'last-owner' });
  });
});

/** 13.821 — the guard on the revocation door. */
describe('13.821 a membership.revoked of the only owner', () => {
  it('refuses revoking the only owner, naming last-owner', async () => {
    const owner = newUlid();
    const r = await checkMembershipRevoked(revoke(owner), ctxWith({ owners: 1, target: { userId: owner, role: 'owner' } }));
    expect(r).toEqual({ refused: true, rule: 'last-owner', reason: LAST_OWNER_REASON });
  });

  it('accepts revoking one of two owners', async () => {
    const owner = newUlid();
    const r = await checkMembershipRevoked(revoke(owner), ctxWith({ owners: 2, target: { userId: owner, role: 'owner' } }));
    expect(r).toEqual({ refused: false });
  });

  it('accepts revoking somebody who is not an owner', async () => {
    const member = newUlid();
    const r = await checkMembershipRevoked(revoke(member), ctxWith({ owners: 1, target: { userId: member, role: 'admin' } }));
    expect(r).toEqual({ refused: false });
  });

  it('is reachable through evaluateEvent', async () => {
    const owner = newUlid();
    expect(
      await evaluateEvent(revoke(owner), ctxWith({ owners: 1, target: { userId: owner, role: 'owner' } })),
    ).toMatchObject({ rule: 'last-owner' });
  });
});

/** 13.822 — what the check does with a context that cannot count, and with a stranger's event. */
describe('13.822 the guard fails loudly rather than inventing a refusal', () => {
  it('THROWS when the context cannot count owners and the guard needs the count', async () => {
    // The witnessed half of the plan's "THROW rather than refuse". A refusal
    // minted from an absent counter would read as a statement about the
    // workspace — the exact sentence `last-owner` carries — made by a context
    // that never counted anything.
    const owner = newUlid();
    await expect(
      checkMembershipGranted(
        grant(owner, 'member'),
        ctxWith({ owners: 1, target: { userId: owner, role: 'owner' }, cannotCount: true }),
      ),
    ).rejects.toThrow('This context cannot count workspace owners, so the last-owner guard cannot run.');
  });

  it('CONTROL: the same cannot-count context ACCEPTS a change that never needs the count', async () => {
    // Same path, same context shape, one difference: whether the guard asks.
    // Without this the case above cannot distinguish "throws because the count
    // is unavailable" from "throws on every membership event", and the second
    // would make every context that predates this guard unusable.
    const member = newUlid();
    const r = await checkMembershipGranted(
      grant(member, 'admin'),
      ctxWith({ owners: 1, target: { userId: member, role: 'member' }, cannotCount: true }),
    );
    expect(r).toEqual({ refused: false });
  });

  it('refuses a malformed payload as malformed-payload, naming the field', async () => {
    const r = await checkMembershipGranted(
      makeEnvelope({
        type: 'membership.granted',
        entity: { kind: 'membership', id: membershipId(WS, newUlid()) },
        workspaceId: WS,
        // 'superuser' is not a WorkspaceRole. The point is that a SHAPE problem
        // is not reported as a role problem.
        payload: { userId: newUlid(), role: 'superuser' },
      }),
      ctxWith({ owners: 2, target: null }),
    );
    expect(r).toMatchObject({ refused: true, rule: 'malformed-payload' });
    expect((r as { reason: string }).reason).toContain('role');
  });

  it('refuses a payload whose userId is not a ULID — the shape the plan text used', async () => {
    // The defect this file was written around, pinned so it cannot return: a
    // readable placeholder is a MALFORMED payload, not a domain refusal.
    const r = await checkMembershipGranted(
      makeEnvelope({
        type: 'membership.granted',
        entity: { kind: 'membership', id: 'ws_1:u1' },
        workspaceId: WS,
        payload: { userId: 'u1', role: 'member' },
      }),
      ctxWith({ owners: 1, target: { userId: 'u1', role: 'owner' } }),
    );
    expect(r).toMatchObject({ refused: true, rule: 'malformed-payload' });
  });

  it('refuses a misfiled entity kind, naming it, rather than accepting it', async () => {
    // The kind guard the plan's code block omitted and its own prose required.
    const r = await checkMembershipGranted(
      makeEnvelope({
        type: 'membership.granted',
        entity: { kind: 'ticket', id: newUlid() },
        workspaceId: WS,
        payload: { userId: newUlid(), role: 'member' },
      }),
      ctxWith({ owners: 1, target: null }),
    );
    expect(r).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This membership.granted event does not point at a membership; it points at a ticket.',
    });
  });

  it('ACCEPTs an event that is not ours, untouched', async () => {
    // `evaluateEvent` dispatches by type, but each check is also entered
    // directly, and the type guard is what makes a direct call safe.
    const r = await checkMembershipGranted(
      makeEnvelope({ type: 'ticket.closed', entity: { kind: 'ticket', id: newUlid() }, workspaceId: WS, payload: {} }),
      ctxWith({ owners: 1, target: null, cannotCount: true }),
    );
    expect(r).toEqual({ refused: false });
  });
});

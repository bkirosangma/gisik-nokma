import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  INVITE_CHANNELS,
  INVITE_ROLES,
  inviteAcceptedPayload,
  inviteRevokedPayload,
  inviteSentPayload,
} from '../../src/events/invites.js';
import { WORKSPACE_ROLES } from '../../src/events/membership.js';
import { newUlid } from '../../src/ids.js';
import { parseEvent } from '../../src/parse-event.js';
import { domainRegistry } from '../../src/vocabulary.js';

/**
 * Same helper as `membership.test.ts` and `envelope.test.ts`, for the same
 * reason: a bare `.success === false` stays green when the check underneath it
 * is deleted, so every refusal below asserts the path AND the exact message.
 */
function rejectionIssues<Input, Output>(
  result: z.SafeParseReturnType<Input, Output>,
): Array<{ path: (string | number)[]; message: string }> {
  if (result.success) {
    throw new Error('expected safeParse to fail, but it succeeded');
  }
  return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

const INVITE_ID = newUlid();
const PROJECT_ID = newUlid();

function sent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    inviteId: INVITE_ID,
    address: 'accountant@example.com',
    channel: 'email',
    role: 'member',
    ...overrides,
  };
}

describe('inviteSentPayload', () => {
  it('accepts an address-named invite with no projects', () => {
    expect(inviteSentPayload.parse(sent())).toEqual({
      inviteId: INVITE_ID,
      address: 'accountant@example.com',
      channel: 'email',
      role: 'member',
    });
  });

  it('accepts a phone-channel invite carrying projects for a non-guest', () => {
    expect(inviteSentPayload.parse(sent({ channel: 'phone', address: '+919876543210', projectIds: [PROJECT_ID] })))
      .toEqual({
        inviteId: INVITE_ID,
        address: '+919876543210',
        channel: 'phone',
        role: 'member',
        projectIds: [PROJECT_ID],
      });
  });

  /**
   * The address is a CLAIM, not an identity, and this is the assertion that
   * keeps it one: an address is not checked against any pattern, so the schema
   * makes no statement about what kind of thing it names or whom it belongs to.
   * A regex here would be the product being wrong about a person's own contact
   * details; worse, it would be the first step towards treating an address as a
   * key that identifies someone.
   */
  it('does not validate the address as an email or a phone number — it is a claim, not an identity', () => {
    expect(inviteSentPayload.parse(sent({ address: 'the corner shop, second floor' })).address).toBe(
      'the corner shop, second floor',
    );
    expect(inviteSentPayload.parse(sent({ channel: 'email', address: '+919876543210' })).address).toBe(
      '+919876543210',
    );
  });

  it('does not normalise the address — the ledger stores the claim as it was made', () => {
    expect(inviteSentPayload.parse(sent({ address: '  Accountant@Example.COM ' })).address).toBe(
      '  Accountant@Example.COM ',
    );
  });

  it('planted defect: refuses a blank address, which reaches nobody while looking like one', () => {
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ address: '   ' })))).toContainEqual({
      path: ['address'],
      message: 'must not be blank — an address of only spaces reaches nobody',
    });
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ address: '' })))).toContainEqual({
      path: ['address'],
      message: 'String must contain at least 1 character(s)',
    });
  });

  /**
   * Case 6.33, first half. `owner` is refused BY OMISSION from the role enum,
   * and the sentence says why — an invitation cannot make somebody the owner of
   * a workspace they have not yet entered.
   *
   * `owner` and a nonsense string are BOTH asserted, and the pair is the point:
   * `owner` alone would pass if the enum were widened to every workspace role
   * and the refusal moved to a `.refine` somebody later deleted, while nonsense
   * alone would pass with `owner` admitted. Together they pin the exact set.
   */
  it('planted defect: refuses role owner by omission, with the reason named', () => {
    for (const role of ['owner', 'superuser']) {
      expect(rejectionIssues(inviteSentPayload.safeParse(sent({ role })))).toContainEqual({
        path: ['role'],
        message: "requires role 'admin'|'member'|'guest': an invite cannot confer ownership",
      });
    }
  });

  /**
   * The other direction of the same fact, and the reason this is not redundant
   * with the refusal above: an enum can be wrong by admitting too little as well
   * as too much, and a refusal test alone never notices a role that has quietly
   * stopped being invitable.
   */
  it('admits exactly admin, member and guest', () => {
    for (const role of INVITE_ROLES) {
      expect(inviteSentPayload.parse(sent({ role })).role).toBe(role);
    }
    // The invitable roles are the workspace roles minus `owner`, stated against
    // the OTHER file's list so a role added to the product without a decision
    // about whether it is invitable fails here rather than passing silently.
    expect([...INVITE_ROLES]).toEqual(WORKSPACE_ROLES.filter((role) => role !== 'owner'));
  });

  it('planted defect: refuses a channel outside email and phone, with the reason named', () => {
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ channel: 'whatsapp' })))).toContainEqual({
      path: ['channel'],
      message: "requires channel 'email' or 'phone'",
    });
    for (const channel of INVITE_CHANNELS) {
      expect(inviteSentPayload.parse(sent({ channel })).channel).toBe(channel);
    }
  });

  /**
   * Case 6.33, second half: the 2026-08-27 membership collapse removed inert
   * project associations, and the invite form is exactly where one would grow
   * back — it is the one screen where a person picks a role and a set of
   * projects in one gesture. The refusal names the remedy, because "no" without
   * "instead, do this" is how a person concludes the product cannot share work
   * with a guest at all.
   */
  it('planted defect: refuses projectIds on a guest invite, naming visibility.set as the remedy', () => {
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ role: 'guest', projectIds: [PROJECT_ID] }))))
      .toContainEqual({
        path: ['projectIds'],
        message: 'cannot put a guest on a project; share tickets with visibility.set instead',
      });
  });

  /**
   * The positive control for the refusal above, and it is not decoration: a
   * `superRefine` that always added the issue would pass the refusal test, and
   * only these two lines say the rule is about the PAIR rather than about
   * guests or about projectIds.
   */
  it('a guest invite with NO projectIds is accepted, and a member invite WITH them is too', () => {
    expect(inviteSentPayload.parse(sent({ role: 'guest' })).role).toBe('guest');
    expect(inviteSentPayload.parse(sent({ role: 'admin', projectIds: [PROJECT_ID] })).projectIds).toEqual([
      PROJECT_ID,
    ]);
  });

  it('planted defect: refuses a projectIds entry that is not a ULID, and an empty one', () => {
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ projectIds: ['not-a-ulid'] })))).toContainEqual({
      path: ['projectIds', 0],
      message: 'must be a ULID',
    });
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ projectIds: [''] })))).toContainEqual({
      path: ['projectIds', 0],
      message: 'must be a ULID',
    });
  });

  /**
   * `.strict()`, asserted rather than assumed. An unknown key silently dropped
   * would let a client believe it had asked for something the ledger never
   * recorded — and on THIS payload the plausible unknown key is `userId`, which
   * is precisely the assertion an address-named invite must never carry.
   */
  it('planted defect: refuses an unknown key — including the userId an invite must not carry', () => {
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ userId: newUlid() })))).toContainEqual({
      path: [],
      message: "Unrecognized key(s) in object: 'userId'",
    });
  });
});

describe('inviteAcceptedPayload and inviteRevokedPayload', () => {
  it('accept binds an invite to a user id, and both fields are ULIDs', () => {
    const userId = newUlid();
    expect(inviteAcceptedPayload.parse({ inviteId: INVITE_ID, userId })).toEqual({ inviteId: INVITE_ID, userId });
    expect(rejectionIssues(inviteAcceptedPayload.safeParse({ inviteId: INVITE_ID, userId: 'usr_1' })))
      .toContainEqual({ path: ['userId'], message: 'must be a ULID' });
    expect(rejectionIssues(inviteAcceptedPayload.safeParse({ inviteId: INVITE_ID }))).toContainEqual({
      path: ['userId'],
      message: 'Required',
    });
  });

  /**
   * The structural half of "an address is not an identity": `invite.accepted`
   * carries no address, so no single event in the ledger can be read as "this
   * address IS this person". The binding is made once, by the server, against a
   * token the person proved they held — and what it records is that binding,
   * not a claim about who owns an inbox.
   */
  /**
   * 6.121 — an address is not an identity, and the schemas keep that STRUCTURAL: `invite.sent` refuses a `userId`, `invite.accepted` refuses an `address`. No single event in the vocabulary can be read as "this address IS this person".
   */
  it('planted defect: invite.accepted refuses an address, and invite.sent refuses a userId', () => {
    expect(
      rejectionIssues(inviteAcceptedPayload.safeParse({ inviteId: INVITE_ID, userId: newUlid(), address: 'a@b.c' })),
    ).toContainEqual({ path: [], message: "Unrecognized key(s) in object: 'address'" });
    expect(rejectionIssues(inviteSentPayload.safeParse(sent({ userId: newUlid() })))).toContainEqual({
      path: [],
      message: "Unrecognized key(s) in object: 'userId'",
    });
  });

  it('revoke names the invite and nothing else', () => {
    expect(inviteRevokedPayload.parse({ inviteId: INVITE_ID })).toEqual({ inviteId: INVITE_ID });
    expect(rejectionIssues(inviteRevokedPayload.safeParse({ inviteId: INVITE_ID, reason: 'left the firm' })))
      .toContainEqual({ path: [], message: "Unrecognized key(s) in object: 'reason'" });
  });
});

describe('the invite registrations', () => {
  it('all three are registered at version 1 against entityKind invite', () => {
    for (const type of ['invite.sent', 'invite.accepted', 'invite.revoked']) {
      expect(domainRegistry.get(type, 1)?.entityKind, type).toBe('invite');
    }
  });

  /**
   * The kind binding is what stops an invite event being filed against a ticket
   * or a workspace, in a ledger that is append-only by trigger. Asserted through
   * `parseEvent` rather than by reading the registration, because the
   * registration is the input to the check and reading it back would prove only
   * that the object literal says what it says.
   */
  it('planted defect: an invite event filed against a ticket is refused entity-kind-mismatch', () => {
    const result = parseEvent(envelope({ entity: { kind: 'ticket', id: INVITE_ID } }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('entity-kind-mismatch');
  });

  /**
   * The coherence rule (`parse-event.ts`): an invite's entity id IS its
   * inviteId. Without it, an `invite.revoked` filed at invite A whose payload
   * names invite B commits cleanly — the projection keys on the payload and
   * revokes B, while A's stream carries the claim, and the ledger is
   * append-only so neither can be taken back.
   */
  /**
   * 6.120 — an invite’s entity id IS its `inviteId`, refused at PARSE when they disagree. Without this, an event filed at invitation A whose payload names B parses cleanly, and the server’s entity↔workspace guard cannot catch it.
   */
  it('planted defect: an invite event whose entity id and inviteId disagree is refused', () => {
    const otherInvite = newUlid();
    const result = parseEvent(envelope({ entity: { kind: 'invite', id: otherInvite } }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('malformed-envelope');
    expect(result.message).toContain("it is about invite '" + INVITE_ID + "'");
    expect(result.message).toContain("an invite's entity id IS its inviteId");
  });

  /**
   * The positive control for the two refusals above: the same builder, left
   * alone, parses. Without it both assertions would pass on an envelope that was
   * malformed for some entirely unrelated reason.
   */
  it('the same envelope, correctly filed, parses', () => {
    const result = parseEvent(envelope({}));
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
});

/** A well-formed `invite.sent` submission, with one field swappable per test. */
function envelope(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: newUlid(),
    workspaceId: newUlid(),
    entity: { kind: 'invite', id: INVITE_ID },
    type: 'invite.sent',
    version: 1,
    payload: sent(),
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-31T10:00:00.000Z',
    ...overrides,
  };
}

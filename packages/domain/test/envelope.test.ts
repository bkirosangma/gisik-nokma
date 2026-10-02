import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import { ENTITY_KINDS, eventEnvelopeSchema, submittedEventSchema } from '../src/envelope.js';

function validSubmitted(): Record<string, unknown> {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
}

/**
 * Plucks {path, message} pairs out of a failed safeParse so planted-defect
 * tests can assert the exact rejection (path AND message) instead of a bare
 * `.success === false` — a bare boolean stays green even if the underlying
 * check is deleted.
 */
function rejectionIssues<Input, Output>(
  result: z.SafeParseReturnType<Input, Output>,
): Array<{ path: (string | number)[]; message: string }> {
  if (result.success) {
    throw new Error('expected safeParse to fail, but it succeeded');
  }
  return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

/**
 * 3.1 — cited on the block: a well-formed submitted event passes envelope validation, and a non-ULID id, an unknown entity kind, a missing actor, an unreal datetime and microsecond precision are each refused by their own test here.
 */
describe('submittedEventSchema', () => {
  it('accepts a well-formed submitted event', () => {
    expect(submittedEventSchema.safeParse(validSubmitted()).success).toBe(true);
  });

  it('accepts an offset clientTime — the wire admits any stated offset; storage normalises the instant', () => {
    const event = { ...validSubmitted(), clientTime: '2026-08-20T14:30:00.000+05:30' };
    expect(submittedEventSchema.safeParse(event).success).toBe(true);
  });

  it('two clients stating the same instant with different offsets are the same instant', () => {
    // The envelope does not care which label the device attached; Task 6 proves
    // the ledger stores these two as one instant (owner decision: Asia/Kolkata).
    const ist = { ...validSubmitted(), clientTime: '2026-08-20T14:30:00.000+05:30' };
    const utc = { ...validSubmitted(), clientTime: '2026-08-20T09:00:00.000Z' };
    expect(submittedEventSchema.safeParse(ist).success).toBe(true);
    expect(submittedEventSchema.safeParse(utc).success).toBe(true);
    expect(Date.parse('2026-08-20T14:30:00.000+05:30')).toBe(Date.parse('2026-08-20T09:00:00.000Z'));
  });

  it('planted defect: refuses a non-ULID id', () => {
    const event = { ...validSubmitted(), id: 'not-a-ulid' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({ path: ['id'], message: 'must be a ULID' });
  });

  it('planted defect: refuses an unknown entity kind', () => {
    const event = { ...validSubmitted(), entity: { kind: 'shop', id: newUlid() } };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['entity', 'kind'],
      message:
        "Invalid enum value. Expected 'workspace' | 'project' | 'ticket' | 'workflow' | 'ticket-type' | 'membership' | 'invite' | 'note' | 'group', received 'shop'",
    });
  });

  it('planted defect: refuses microsecond precision — a JS Date cannot hold it, so it would not read back as the same instant', () => {
    const event = { ...validSubmitted(), clientTime: '2026-08-20T09:00:00.123456Z' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['clientTime'],
      message: 'must be ISO 8601 with at most millisecond precision',
    });
  });

  it('planted defect: refuses a clientTime that is not a real datetime', () => {
    const event = { ...validSubmitted(), clientTime: 'yesterday' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    // 'yesterday' is not ISO-shaped at all — it fails the format check, distinct
    // from the Feb-30 case below which is ISO-shaped but not a real date.
    expect(rejectionIssues(result)).toContainEqual({
      path: ['clientTime'],
      message: 'must be ISO 8601 with at most millisecond precision',
    });
  });

  it('planted defect: refuses a missing actorId — every claim is attributed', () => {
    const event = validSubmitted();
    delete event['actorId'];
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({ path: ['actorId'], message: 'Required' });
  });

  it('planted defect: refuses an empty workspaceId', () => {
    const event = { ...validSubmitted(), workspaceId: '' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({ path: ['workspaceId'], message: 'must be a ULID' });
  });

  it('planted defect: refuses an empty entity.id', () => {
    const event = { ...validSubmitted(), entity: { kind: 'workspace', id: '' } };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({ path: ['entity', 'id'], message: 'must be a ULID' });
  });

  it('planted defect: refuses an empty type', () => {
    const event = { ...validSubmitted(), type: '' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['type'],
      message: 'String must contain at least 1 character(s)',
    });
  });

  it('planted defect: refuses a version of zero', () => {
    const event = { ...validSubmitted(), version: 0 };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['version'],
      message: 'Number must be greater than 0',
    });
  });

  it('planted defect: refuses a non-integer version', () => {
    const event = { ...validSubmitted(), version: 1.5 };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['version'],
      message: 'Expected integer, received float',
    });
  });

  it('planted defect: refuses an unknown origin', () => {
    const event = { ...validSubmitted(), origin: 'carrier-pigeon' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['origin'],
      message: "Invalid enum value. Expected 'web' | 'mobile' | 'desktop' | 'server' | 'mcp', received 'carrier-pigeon'",
    });
  });

  it('planted defect: refuses day-of-month overflow — 2026-02-30 does not exist and Date.parse would silently roll it to March', () => {
    const event = { ...validSubmitted(), clientTime: '2026-02-30T09:00:00.000Z' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    // ISO-shaped, so only the calendar refine fails — this is what distinguishes
    // the refine from the plain regex check above.
    expect(rejectionIssues(result)).toEqual([{ path: ['clientTime'], message: 'must be a real calendar datetime' }]);
  });

  it('planted defect: refuses 2026-02-29 — 2026 is not a leap year', () => {
    const event = { ...validSubmitted(), clientTime: '2026-02-29T09:00:00.000Z' };
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toEqual([{ path: ['clientTime'], message: 'must be a real calendar datetime' }]);
  });

  it('accepts 2028-02-29 — 2028 is a leap year', () => {
    const event = { ...validSubmitted(), clientTime: '2028-02-29T09:00:00.000Z' };
    expect(submittedEventSchema.safeParse(event).success).toBe(true);
  });
});

describe('eventEnvelopeSchema', () => {
  it('additionally requires serverTime and a positive seq', () => {
    const full = { ...validSubmitted(), serverTime: '2026-08-20T09:00:01.000Z', seq: 1 };
    expect(eventEnvelopeSchema.safeParse(full).success).toBe(true);
  });

  it('planted defect: refuses seq 0 — sequences start at 1', () => {
    const full = { ...validSubmitted(), serverTime: '2026-08-20T09:00:01.000Z', seq: 0 };
    const result = eventEnvelopeSchema.safeParse(full);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({ path: ['seq'], message: 'Number must be greater than 0' });
  });

  it('planted defect: refuses a missing serverTime', () => {
    const full = { ...validSubmitted(), seq: 1 };
    const result = eventEnvelopeSchema.safeParse(full);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({ path: ['serverTime'], message: 'Required' });
  });

  it('planted defect: refuses a malformed serverTime', () => {
    const full = { ...validSubmitted(), serverTime: 'nope', seq: 1 };
    const result = eventEnvelopeSchema.safeParse(full);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['serverTime'],
      message: 'must be ISO 8601 with at most millisecond precision',
    });
  });
});

/**
 * Amendment 1 (coordination decision 5, owner-ratified 2026-08-28). The door
 * behaves differently per entity kind for the first time, so all THREE
 * directions are asserted: the composite admitted for `membership`, a bare ULID
 * refused for `membership`, and — the one that makes "every other kind is
 * unchanged" a proof rather than a claim — a non-membership kind still refusing
 * the composite with the byte-identical `must be a ULID`.
 */
describe('entity id, kind by kind', () => {
  function membershipEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const workspaceId = newUlid();
    const userId = newUlid();
    return {
      ...validSubmitted(),
      workspaceId,
      entity: { kind: 'membership', id: `${workspaceId}:${userId}` },
      type: 'membership.granted',
      payload: { userId, role: 'member' },
      ...overrides,
    };
  }

  it("accepts a membership's composite entity id — `${workspaceId}:${userId}`", () => {
    expect(submittedEventSchema.safeParse(membershipEvent()).success).toBe(true);
  });

  it('planted defect: refuses a membership entity id that is a bare ULID — the composite IS the addressing', () => {
    const event = membershipEvent({ entity: { kind: 'membership', id: newUlid() } });
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['entity', 'id'],
      message: 'must be a membership entity id — workspaceId:userId, two ULIDs joined by a colon',
    });
  });

  it('planted defect: every OTHER kind still refuses a composite, byte-for-byte as before', () => {
    // The regression guard for the whole amendment. Delete the kind test in
    // envelope.ts and this is the assertion that notices.
    for (const kind of ['workspace', 'project', 'ticket', 'workflow', 'ticket-type', 'invite'] as const) {
      const event = { ...validSubmitted(), entity: { kind, id: `${newUlid()}:${newUlid()}` } };
      const result = submittedEventSchema.safeParse(event);
      expect(result.success).toBe(false);
      expect(rejectionIssues(result)).toContainEqual({ path: ['entity', 'id'], message: 'must be a ULID' });
    }
  });

  it('planted defect: refuses a composite naming a DIFFERENT workspace — the shape is right and the claim is not', () => {
    // Shape-valid on purpose, so only the cross-field check can fail here: if
    // this asserted a malformed composite instead, the regex above would mask a
    // deleted workspace check and the test would stay green without it.
    const event = membershipEvent({ entity: { kind: 'membership', id: `${newUlid()}:${newUlid()}` } });
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['entity', 'id'],
      // 23.371 (HK-3): no spaced em dash; the quoted tokens are unchanged.
      message: "must name this event's own workspace: a membership entity id is workspaceId:userId",
    });
  });

  it('eventEnvelopeSchema inherits both membership checks from the shared base object', () => {
    const full = {
      ...membershipEvent({ entity: { kind: 'membership', id: `${newUlid()}:${newUlid()}` } }),
      serverTime: '2026-08-20T09:00:01.000Z',
      seq: 1,
    };
    const result = eventEnvelopeSchema.safeParse(full);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['entity', 'id'],
      // 23.371 (HK-3): no spaced em dash; the quoted tokens are unchanged.
      message: "must name this event's own workspace: a membership entity id is workspaceId:userId",
    });
  });
});

/**
 * Amendment 2. `'invite'` is inert until Plan 4's invite types are registered:
 * the envelope admits the kind, and `parseEvent` still has nothing to file
 * against it. Both halves are asserted so "additive and inert" is checked, not
 * assumed.
 *
 * `'note'` joined the list in the notes series (Plan 1 of 6, spec §3.1) and is
 * NOT inert in the same sense: nine `note.*` types are registered against it in
 * the same commit. It appears in this exact-list assertion because the list is
 * closed, which is the property this case exists to pin — an added kind that
 * nothing registered against would still show here, and that is deliberate.
 */
describe("ENTITY_KINDS admits 'invite'", () => {
  it('accepts an invite entity with a bare ULID id', () => {
    const event = { ...validSubmitted(), entity: { kind: 'invite', id: newUlid() } };
    expect(submittedEventSchema.safeParse(event).success).toBe(true);
  });

  it('lists exactly the nine kinds', () => {
    expect([...ENTITY_KINDS]).toEqual([
      'workspace',
      'project',
      'ticket',
      'workflow',
      'ticket-type',
      'membership',
      'invite',
      'note',
      'group',
    ]);
  });
});

/**
 * Amendment 3. `z.unknown()` does not require the key, so an event could carry
 * no claim at all into an append-only table. ONLY absence is the defect: the
 * two acceptances below are pinned deliberately, because a fix that also
 * refused `null` or `{}` would look correct and quietly refuse legitimate
 * claims — an empty claim is still a claim.
 */
describe('payload is required', () => {
  it('planted defect: refuses an absent payload — an event with no claim is not an event', () => {
    const event = validSubmitted();
    delete event['payload'];
    const result = submittedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['payload'],
      message: 'is required — an event with no payload is not a claim',
    });
  });

  it('planted defect: refuses an explicitly undefined payload — JSON erases the difference from absence', () => {
    const result = submittedEventSchema.safeParse({ ...validSubmitted(), payload: undefined });
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['payload'],
      message: 'is required — an event with no payload is not a claim',
    });
  });

  it('accepts a null payload — a null claim is still a claim', () => {
    expect(submittedEventSchema.safeParse({ ...validSubmitted(), payload: null }).success).toBe(true);
  });

  it('accepts an empty-object payload — an empty claim is still a claim', () => {
    expect(submittedEventSchema.safeParse({ ...validSubmitted(), payload: {} }).success).toBe(true);
  });

  it('eventEnvelopeSchema inherits the requirement', () => {
    const full: Record<string, unknown> = {
      ...validSubmitted(),
      serverTime: '2026-08-20T09:00:01.000Z',
      seq: 1,
    };
    delete full['payload'];
    const result = eventEnvelopeSchema.safeParse(full);
    expect(result.success).toBe(false);
    expect(rejectionIssues(result)).toContainEqual({
      path: ['payload'],
      message: 'is required — an event with no payload is not a claim',
    });
  });
});

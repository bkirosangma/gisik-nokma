import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import { eventEnvelopeSchema, submittedEventSchema } from '../src/envelope.js';

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
        "Invalid enum value. Expected 'workspace' | 'project' | 'ticket' | 'workflow' | 'ticket-type' | 'membership', received 'shop'",
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
      message: "Invalid enum value. Expected 'web' | 'mobile' | 'desktop' | 'server', received 'carrier-pigeon'",
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

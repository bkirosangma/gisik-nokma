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
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses an unknown entity kind', () => {
    const event = { ...validSubmitted(), entity: { kind: 'shop', id: newUlid() } };
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses microsecond precision — a JS Date cannot hold it, so it would not read back as the same instant', () => {
    const event = { ...validSubmitted(), clientTime: '2026-08-20T09:00:00.123456Z' };
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses a clientTime that is not a real datetime', () => {
    const event = { ...validSubmitted(), clientTime: 'yesterday' };
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });

  it('planted defect: refuses a missing actorId — every claim is attributed', () => {
    const event = validSubmitted();
    delete event['actorId'];
    expect(submittedEventSchema.safeParse(event).success).toBe(false);
  });
});

describe('eventEnvelopeSchema', () => {
  it('additionally requires serverTime and a positive seq', () => {
    const full = { ...validSubmitted(), serverTime: '2026-08-20T09:00:01.000Z', seq: 1 };
    expect(eventEnvelopeSchema.safeParse(full).success).toBe(true);
  });

  it('planted defect: refuses seq 0 — sequences start at 1', () => {
    const full = { ...validSubmitted(), serverTime: '2026-08-20T09:00:01.000Z', seq: 0 };
    expect(eventEnvelopeSchema.safeParse(full).success).toBe(false);
  });
});

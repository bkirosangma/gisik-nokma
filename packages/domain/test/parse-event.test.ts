import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import { parseEvent } from '../src/parse-event.js';

function rawWorkspaceCreated(): Record<string, unknown> {
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

describe('parseEvent', () => {
  it('accepts a valid workspace.created and returns the typed submitted event', () => {
    const raw = rawWorkspaceCreated();
    const result = parseEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe('workspace.created');
      expect(result.event.payload).toEqual({ name: 'Convenience Corner' });
    }
  });

  it('planted defect: refuses an unknown event type, naming it', () => {
    const raw: Record<string, unknown> = { ...rawWorkspaceCreated(), type: 'shop.opened' };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'unknown-event-type',
      message: "unknown event type 'shop.opened' — the ledger accepts only what it can later replay",
      eventId: raw['id'],
    });
  });

  it('planted defect: refuses a known type at an unknown version', () => {
    const raw: Record<string, unknown> = { ...rawWorkspaceCreated(), version: 2 };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'unknown-event-version',
      message: "unknown version 2 of event type 'workspace.created'",
      eventId: raw['id'],
    });
  });

  it('planted defect: refuses a payload missing its required field', () => {
    const raw: Record<string, unknown> = { ...rawWorkspaceCreated(), payload: {} };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'invalid-payload',
      message: "payload for 'workspace.created' v1 is invalid at name: Required",
      eventId: raw['id'],
    });
  });

  it('planted defect: refuses a payload smuggling extra keys (strict schemas)', () => {
    const raw: Record<string, unknown> = { ...rawWorkspaceCreated(), payload: { name: 'CC', sneaky: true } };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'invalid-payload',
      message: "payload for 'workspace.created' v1 is invalid: Unrecognized key(s) in object: 'sneaky'",
      eventId: raw['id'],
    });
  });

  it('planted defect: refuses a non-object with a null eventId', () => {
    const result = parseEvent(42);
    expect(result).toEqual({
      ok: false,
      code: 'malformed-envelope',
      message: 'event envelope is malformed: Expected object, received number',
      eventId: null,
    });
  });

  it('echoes a readable claimed id even when the envelope is malformed', () => {
    const raw: Record<string, unknown> = { ...rawWorkspaceCreated(), origin: 'carrier-pigeon' };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'malformed-envelope',
      message:
        "event envelope is malformed at origin: Invalid enum value. Expected 'web' | 'mobile' | 'desktop' | 'server', received 'carrier-pigeon'",
      eventId: raw['id'],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { newUlid } from '../src/ids.js';
import { parseEvent } from '../src/parse-event.js';
import { createEventTypeRegistry } from '../src/registry.js';

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

  it('accepts a workspace event pointed at a workspace — the kinds agree', () => {
    const raw = rawWorkspaceCreated();
    expect(raw['entity']).toMatchObject({ kind: 'workspace' });
    expect(parseEvent(raw).ok).toBe(true);
  });

  it('planted defect: refuses a workspace.created filed against a ticket, naming both kinds', () => {
    // The ledger is append-only by trigger: a mis-filed event can never be
    // corrected, only superseded, and until then the ticket's head row says a
    // workspace was created on it (coordination doc §11).
    const raw: Record<string, unknown> = {
      ...rawWorkspaceCreated(),
      entity: { kind: 'ticket', id: newUlid() },
    };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'entity-kind-mismatch',
      message:
        "event type 'workspace.created' records what happens to a workspace, but this envelope points at a ticket",
      eventId: raw['id'],
    });
  });

  it('a registration that declares no entity kind still admits any kind', () => {
    // Backward compatibility, pinned: the binding is opt-in per registration,
    // so a type that genuinely spans kinds is not refused by omission.
    const registry = createEventTypeRegistry();
    registry.register({
      type: 'anything.happened',
      version: 1,
      payloadSchema: z.object({}).strict(),
    });
    const raw: Record<string, unknown> = {
      ...rawWorkspaceCreated(),
      entity: { kind: 'ticket', id: newUlid() },
      type: 'anything.happened',
      payload: {},
    };
    expect(parseEvent(raw, registry).ok).toBe(true);
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

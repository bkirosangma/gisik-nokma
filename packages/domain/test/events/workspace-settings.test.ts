import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent } from '../../src/index.js';
import { workspaceSettingsSetPayloadSchema } from '../../src/events/workspace-settings.js';

/**
 * 7.55 — cited on the block because the row states three clauses asserted by three tests below: `workspaceSettingsSetPayloadSchema` accepts either knob alone or both, refuses the empty claim, and refuses unknown keys, non-integers and out-of-range values.
 */
describe('workspaceSettingsSetPayloadSchema', () => {
  it('accepts either knob alone or both together', () => {
    expect(workspaceSettingsSetPayloadSchema.parse({ staleDays: 3 })).toEqual({ staleDays: 3 });
    expect(workspaceSettingsSetPayloadSchema.parse({ dueSoonDays: 14 })).toEqual({ dueSoonDays: 14 });
    expect(workspaceSettingsSetPayloadSchema.parse({ staleDays: 3, dueSoonDays: 14 })).toEqual({
      staleDays: 3,
      dueSoonDays: 14,
    });
  });

  it('refuses the empty claim — a settings event must set at least one setting', () => {
    expect(() => workspaceSettingsSetPayloadSchema.parse({})).toThrow();
  });

  it('refuses unknown keys, non-integers, and out-of-range values', () => {
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 3, velocity: 9 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 2.5 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 0 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ dueSoonDays: -1 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ staleDays: 366 })).toThrow();
  });
});

describe('workspace.settings_set registration', () => {
  /**
   * 7.56 — a well-formed `workspace.settings_set` v1 envelope round-trips `parseEvent` as `ok: true`. The malformed-payload half of the row is the refusal test below.
   */
  it('round-trips parseEvent as a registered v1 type', () => {
    const workspaceId = newUlid();
    const raw = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      version: 1,
      payload: { staleDays: 10 },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
    const parsed = parseEvent(raw);
    expect(parsed.ok).toBe(true);
  });

  it('refuses a malformed settings payload at the door', () => {
    const workspaceId = newUlid();
    const raw = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      version: 1,
      payload: {},
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
    const parsed = parseEvent(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('invalid-payload');
  });

  // CORRECTION 2 (see task instructions): `entityKind` on the registration is
  // OPTIONAL, so the two tests above cannot tell whether this registration set
  // it — `parsed.ok === true` passes whether `entityKind` is 'workspace',
  // 'ticket', or omitted. This test discriminates: an envelope claiming
  // `workspace.settings_set` but pointing `entity.kind` at 'ticket' must be
  // refused by `parseEvent`'s kind guard (parse-event.ts), not admitted.
  /**
   * 7.57 — planted-defect proof that the registration’s `entityKind: 'workspace'` is load-bearing rather than decorative — an envelope whose `entity.kind` disagrees is refused.
   */
  it('refuses a settings claim whose entity.kind disagrees with the registration', () => {
    const workspaceId = newUlid();
    const ticketId = newUlid();
    const raw = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'workspace.settings_set',
      version: 1,
      payload: { staleDays: 10 },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
    const parsed = parseEvent(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('entity-kind-mismatch');
  });
});

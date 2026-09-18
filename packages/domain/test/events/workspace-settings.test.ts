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

/**
 * Second wave, Task 6 (spec §8). `autoCloseAfterDays` is the third knob and the
 * first one whose value is a UNION of "a number of days" and "off".
 *
 * The distinction this schema exists to carry: `null` is a CLAIM ("auto-close is
 * off"), `undefined` is an ABSENCE ("this claim did not mention the knob"). A
 * schema that collapsed them would make "turn auto-close off" indistinguishable
 * from "leave auto-close alone", and the projection one layer down could not
 * tell them apart either — which is why the column is written with a CASE rather
 * than a COALESCE (see the projection's own docblock).
 */
describe('13.713 workspaceSettingsSetPayloadSchema — autoCloseAfterDays', () => {
  /**
   * 13.713 — `autoCloseAfterDays` is accepted alone as a number and alone as
   * `null`; `null` and `undefined` are DIFFERENT values and the parse keeps them
   * different rather than normalising one into the other.
   */
  it('accepts autoCloseAfterDays alone, as a number and as null', () => {
    expect(workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: 30 })).toEqual({
      autoCloseAfterDays: 30,
    });
    expect(workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: null })).toEqual({
      autoCloseAfterDays: null,
    });
    // The two are distinguishable in the PARSED output, not merely accepted.
    expect(workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: null })).not.toEqual({});
    expect(workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: null })).not.toEqual({
      autoCloseAfterDays: undefined,
    });
    expect(
      workspaceSettingsSetPayloadSchema.parse({
        staleDays: 3,
        dueSoonDays: 5,
        autoCloseAfterDays: 14,
      }),
    ).toEqual({ staleDays: 3, dueSoonDays: 5, autoCloseAfterDays: 14 });
  });

  /**
   * 13.713 — the range is 1..365 and `null` is the ONLY zero-ish value that is
   * accepted: `0` is refused exactly as `366` is, so "off" has one spelling
   * rather than two (`0` and `null` both meaning off would be a second way to
   * say one thing, and the projection's CASE could not tell them apart).
   */
  it('refuses 0 and 366 — off is spelled null, and only null', () => {
    expect(() => workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: 0 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: 366 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: -1 })).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: 2.5 })).toThrow();
    // 1 and 365 are the closed bounds and are accepted.
    expect(workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: 1 })).toEqual({
      autoCloseAfterDays: 1,
    });
    expect(workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: 365 })).toEqual({
      autoCloseAfterDays: 365,
    });
  });

  /**
   * 13.713 — the refine still refuses a claim that names NO setting, and
   * `autoCloseAfterDays: undefined` does not count as naming one. A claim whose
   * only key is explicitly `undefined` is the empty claim wearing a key, and the
   * projection would treat it as "not present" — so it must be refused at the
   * door rather than land as a no-op row write.
   */
  it('refuses the empty claim, including one whose only key is undefined', () => {
    expect(() => workspaceSettingsSetPayloadSchema.parse({})).toThrow();
    expect(() =>
      workspaceSettingsSetPayloadSchema.parse({ autoCloseAfterDays: undefined }),
    ).toThrow();
    expect(() => workspaceSettingsSetPayloadSchema.parse({ unknownKnob: 4 })).toThrow();
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

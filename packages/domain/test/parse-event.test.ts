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

  /**
   * 3.2 — an event of an UNREGISTERED type is refused `unknown-event-type`, with the type named rather than a generic rejection.
   */
  it('planted defect: refuses an unknown event type, naming it', () => {
    const raw: Record<string, unknown> = { ...rawWorkspaceCreated(), type: 'shop.opened' };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'unknown-event-type',
      message: "unknown event type 'shop.opened': the ledger accepts only what it can later replay",
      eventId: raw['id'],
    });
  });

  /**
   * 3.3 — a REGISTERED type at an unregistered version is refused `unknown-event-version`: the version is part of the identity, not a hint.
   */
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

  /**
   * 3.4 — a payload missing a required field is refused `invalid-payload`. The row’s other half — a payload SMUGGLING extra keys, refused by the strict schemas — is the test below.
   */
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
    // workspace was created on it (coordination doc §11). The sentence is the
    // engine's canonical kind-refusal copy, generic over the registration —
    // the same condition refused at either layer reads the same either way.
    const raw: Record<string, unknown> = {
      ...rawWorkspaceCreated(),
      entity: { kind: 'ticket', id: newUlid() },
    };
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'entity-kind-mismatch',
      message: 'This workspace.created event does not point at a workspace; it points at a ticket.',
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
        "event envelope is malformed at origin: Invalid enum value. Expected 'web' | 'mobile' | 'desktop' | 'server' | 'mcp', received 'carrier-pigeon'",
      eventId: raw['id'],
    });
  });
});

/**
 * The USER half of the membership coherence check (coordination decision 5).
 *
 * It is asserted HERE, through `parseEvent`, and its fixtures are all
 * prefix-CORRECT: the envelope schema's own workspace check would otherwise
 * mask it, and a masked check is one that can be deleted without any assertion
 * noticing. Everything below differs from a valid membership event in the user
 * alone.
 */
describe('parseEvent — a membership event must be filed at its own (workspace, user)', () => {
  function rawMembershipGranted(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const workspaceId = newUlid();
    const userId = newUlid();
    return {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'membership', id: `${workspaceId}:${userId}` },
      type: 'membership.granted',
      version: 1,
      payload: { userId, role: 'member' },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
      ...overrides,
    };
  }

  it('accepts a membership.granted addressed as membershipId() writes it', () => {
    const result = parseEvent(rawMembershipGranted());
    expect(result.ok).toBe(true);
  });

  it('planted defect: refuses an id naming a DIFFERENT user than the payload grants', () => {
    // Right workspace, right shape, wrong person. Nothing else in the system
    // catches this: the server's entity↔workspace guard only fires once a head
    // row exists, so this event would commit and a later, correctly-addressed
    // revoke would open a second stream at seq 1 for the same person.
    const workspaceId = newUlid();
    const grantedUser = newUlid();
    const otherUser = newUlid();
    const raw = rawMembershipGranted({
      workspaceId,
      entity: { kind: 'membership', id: `${workspaceId}:${otherUser}` },
      payload: { userId: grantedUser, role: 'admin' },
    });
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'malformed-envelope',
      message: `This membership event is filed at entity '${workspaceId}:${otherUser}', but it is about user '${grantedUser}' in workspace '${workspaceId}': a membership's entity id is workspaceId:userId. Filing it anywhere else starts a second stream for the same person.`,
      eventId: raw['id'],
    });
  });

  it('planted defect: refuses membership.revoked filed at the wrong user just as it refuses a grant', () => {
    const workspaceId = newUlid();
    const revokedUser = newUlid();
    const otherUser = newUlid();
    const raw = rawMembershipGranted({
      workspaceId,
      entity: { kind: 'membership', id: `${workspaceId}:${otherUser}` },
      type: 'membership.revoked',
      payload: { userId: revokedUser },
    });
    const result = parseEvent(raw);
    expect(result).toEqual({
      ok: false,
      code: 'malformed-envelope',
      message: `This membership event is filed at entity '${workspaceId}:${otherUser}', but it is about user '${revokedUser}' in workspace '${workspaceId}': a membership's entity id is workspaceId:userId. Filing it anywhere else starts a second stream for the same person.`,
      eventId: raw['id'],
    });
  });

  it('planted defect: refuses a membership event whose payload names no user at all', () => {
    // Reachable only through an injected registry today, because both shipped
    // membership types require `userId` — but the check is written for the KIND,
    // not for the two types, so a future membership type that forgot its user
    // meets a refusal rather than an unaddressable stream. Asserting it here is
    // what keeps that branch from being a check that cannot fail.
    const registry = createEventTypeRegistry();
    registry.register({
      type: 'membership.something',
      version: 1,
      entityKind: 'membership',
      payloadSchema: z.object({ note: z.string() }).strict(),
    });
    const workspaceId = newUlid();
    const entityId = `${workspaceId}:${newUlid()}`;
    const raw = rawMembershipGranted({
      workspaceId,
      entity: { kind: 'membership', id: entityId },
      type: 'membership.something',
      payload: { note: 'no user here' },
    });
    const result = parseEvent(raw, registry);
    expect(result).toEqual({
      ok: false,
      code: 'malformed-envelope',
      message: `This membership event is filed at entity '${entityId}' but its payload names no user: a membership's entity id is workspaceId:userId, so an event that does not say who it is about cannot be addressed at all.`,
      eventId: raw['id'],
    });
  });

  it('leaves every non-membership kind alone — a ticket payload may carry any userId it likes', () => {
    // The regression guard for this check: it is scoped to `kind === membership`
    // and must not start inspecting ids on kinds that never had a composite.
    const ticketId = newUlid();
    const raw: Record<string, unknown> = {
      ...rawWorkspaceCreated(),
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.collaborator_added',
      payload: { userId: newUlid() },
    };
    expect(parseEvent(raw).ok).toBe(true);
  });
});

/**
 * 18.003 — the door's kind binding, seen from the two directions that matter for
 * notes. `comment.added` is the ONE type that spans kinds (the registry now
 * declares `['ticket', 'note']`), so it must be admitted on both; every
 * `note.*` type stays bound to `'note'` alone, and the control is a note event
 * filed against a ticket, refused as `entity-kind-mismatch`.
 *
 * The note id is `newUlid()` rather than a literal. The plan text's literal
 * (`01J9GNOT…`) contains `O`, which Crockford base32 excludes (`ULID_REGEX`,
 * `../src/ids.ts`), so the envelope would have been refused `malformed-envelope`
 * — the refusal would have fired one gate EARLIER than the one this case is
 * about, and the case would have passed while testing nothing it named.
 */
describe('18.003 the kind binding at the door', () => {
  it('18.003 comment.added parses against a note entity; note.renamed against a ticket is a kind mismatch', () => {
    const base = {
      id: '01J9GEV0000000000000000000',
      workspaceId: '01J9GWS0000000000000000000',
      version: 1,
      actorId: '01J9GACT000000000000000000',
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
    expect(
      parseEvent({
        ...base,
        entity: { kind: 'note', id: newUlid() },
        type: 'comment.added',
        payload: { body: { type: 'doc' } },
      }).ok,
    ).toBe(true);
    expect(
      parseEvent({
        ...base,
        entity: { kind: 'ticket', id: '01J9GTKA000000000000000000' },
        type: 'comment.added',
        payload: { body: { type: 'doc' } },
      }).ok,
    ).toBe(true);
    const bad = parseEvent({
      ...base,
      entity: { kind: 'ticket', id: '01J9GTKA000000000000000000' },
      type: 'note.renamed',
      payload: { title: 'x' },
    });
    expect(bad.ok).toBe(false);
    expect((bad as { code: string }).code).toBe('entity-kind-mismatch');
  });
});

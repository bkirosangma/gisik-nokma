import { describe, expect, it, vi } from 'vitest';
import { isUlid, newSubmittedEvent, submittedEventSchema } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '../src/submit.js';
import { PROJECT, TICKET, WS } from './helpers/seed.js';

// This file builds events the door WOULD refuse, on purpose — the factory is tested for its envelope and stamps, with `{}` payloads that say nothing. The
// suite-wide payload guard in `test/setup.ts` would throw at the factory, so it
// is switched off for this file alone.
vi.unmock('@gisik-nokma/domain');

/**
 * A ULID actor id. `seed.ts` uses `user_kiro`-shaped ids, which are fine where
 * nothing validates them and refused the moment anything crosses the envelope
 * door (`actorId: ulidString`) — coordination §5's known latent issue. The
 * factory's output IS checked against that door below, so this file uses the
 * shape the door demands.
 */
const ACTOR = '01J9GKRA000000000000000000';

const AT = new Date('2026-08-20T09:30:00.000Z');

const make = makeSubmittedFactory({ actorId: ACTOR, origin: 'web', now: () => AT });

describe('makeSubmittedFactory — every claim leaves through one door', () => {
  it('uses ids the envelope door would admit (the fixtures this file rests on)', () => {
    expect([ACTOR, WS, PROJECT, TICKET].filter((id) => !isUlid(id))).toEqual([]);
  });

  it('mints a fresh ULID per claim', () => {
    const first = make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.assigned', payload: {} });
    const second = make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.assigned', payload: {} });
    expect(isUlid(first.id)).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it('stamps the signed-in actor', () => {
    const event = make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.assigned', payload: {} });
    expect(event.actorId).toBe(ACTOR);
  });

  it('stamps the origin it was built for', () => {
    const event = make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.assigned', payload: {} });
    expect(event.origin).toBe('web');
  });

  it('stamps the injected clock as clientTime, never the ambient one', () => {
    const event = make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.assigned', payload: {} });
    expect(event.clientTime).toBe('2026-08-20T09:30:00.000Z');
  });

  it('defaults version to 1', () => {
    const event = make({ workspaceId: WS, entity: { kind: 'ticket', id: TICKET }, type: 'ticket.assigned', payload: {} });
    expect(event.version).toBe(1);
  });

  it('passes an explicit version through', () => {
    const event = make({
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.assigned',
      payload: {},
      version: 2,
    });
    expect(event.version).toBe(2);
  });

  it("carries the caller's payload unchanged", () => {
    const event = make({
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.assigned',
      payload: { assigneeId: ACTOR },
    });
    expect(event.payload).toEqual({ assigneeId: ACTOR });
  });

  it("carries the caller's entity and workspace unchanged", () => {
    const event = make({
      workspaceId: WS,
      entity: { kind: 'project', id: PROJECT },
      type: 'project.created',
      payload: { name: 'Registrations' },
    });
    expect({ workspaceId: event.workspaceId, entity: event.entity }).toEqual({
      workspaceId: WS,
      entity: { kind: 'project', id: PROJECT },
    });
  });

  it("never stamps serverTime — that is the server's to assign", () => {
    const event = make({ workspaceId: WS, entity: { kind: 'project', id: PROJECT }, type: 'project.created', payload: {} });
    expect('serverTime' in event).toBe(false);
  });

  it("never stamps seq — that is the server's to assign", () => {
    const event = make({ workspaceId: WS, entity: { kind: 'project', id: PROJECT }, type: 'project.created', payload: {} });
    expect('seq' in event).toBe(false);
  });

  /**
   * The factory is an ergonomic wrapper, not a second builder: `newUlid` and
   * the `clientTime` stamp live in `newSubmittedEvent` (`@gisik-nokma/domain`)
   * and nowhere else. Two builders would be two definitions of what a claim is,
   * free to drift the moment one of them grows a field.
   */
  it('produces exactly what the domain builder produces from the same inputs — id apart', () => {
    const seed = {
      workspaceId: WS,
      entity: { kind: 'ticket' as const, id: TICKET },
      type: 'ticket.assigned',
      payload: { assigneeId: null },
    };
    const viaFactory = make(seed);
    const viaDomain = newSubmittedEvent({ ...seed, actorId: ACTOR, origin: 'web', now: () => AT });
    expect({ ...viaFactory, id: 'pinned' }).toEqual({ ...viaDomain, id: 'pinned' });
  });

  /** A claim that could not survive the door is not a claim; it is a bug waiting for a server. */
  it('mints claims the envelope door admits', () => {
    const event = make({
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.assigned',
      payload: { assigneeId: null },
    });
    expect(submittedEventSchema.safeParse(event).success).toBe(true);
  });
});

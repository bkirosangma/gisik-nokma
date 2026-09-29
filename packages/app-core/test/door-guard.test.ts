import { describe, expect, it } from 'vitest';
import { makeSubmittedFactory } from '../src/submit.js';

const make = makeSubmittedFactory({ actorId: 'u_1', origin: 'web' });
const NOTE = { kind: 'note' as const, id: 'n_1' };

/**
 * 18.431 — the suite-wide payload guard in `test/setup.ts`.
 *
 * It is the reason no view test can agree with its own caller about a wrong
 * payload shape (the scope editor's nested `note.scope_set`, case 18.430), so
 * it gets its own witness: a hook that silently stopped firing would leave every
 * other case green.
 */
describe('18.431 the payload guard in test/setup.ts', () => {
  it('refuses a payload the registry would refuse, at the factory', () => {
    expect(() =>
      make({ workspaceId: 'ws_1', entity: NOTE, type: 'note.scope_set', payload: { scope: { mode: 'workspace' } } }),
    ).toThrow(/the door would refuse note\.scope_set/);
  });

  it('admits the flat shape the schema wants (control)', () => {
    const event = make({ workspaceId: 'ws_1', entity: NOTE, type: 'note.scope_set', payload: { mode: 'workspace' } });
    expect(event.payload).toEqual({ mode: 'workspace' });
  });

  it('judges the payload SHAPE, not id format or unregistered types', () => {
    expect(() =>
      make({ workspaceId: 'ws_1', entity: { kind: 'invite', id: 'i_1' }, type: 'invite.revoked', payload: { inviteId: 'not-a-ulid' } }),
    ).not.toThrow();
    expect(() => make({ workspaceId: 'ws_1', entity: NOTE, type: 'not.registered', payload: {} })).not.toThrow();
  });

  it('lets a case opt out with the flag…', () => {
    (globalThis as Record<string, unknown>).__gnAllowRefusedPayloads = true;
    expect(() => make({ workspaceId: 'ws_1', entity: NOTE, type: 'note.scope_set', payload: {} })).not.toThrow();
  });

  it('…and the flag does not leak into the next case', () => {
    expect(() => make({ workspaceId: 'ws_1', entity: NOTE, type: 'note.scope_set', payload: {} })).toThrow(/refuse/);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { readLastUserId, rememberLastUserId } from '../src/last-user-id.js';
import { readProjectTab, rememberProjectTab } from '../src/use-last-project.js';

describe('the last user id lets the remembered tab answer before the session does (spec D9; audit SM-02)', () => {
  beforeEach(() => window.localStorage.clear());

  it('25.042 a tab remembered for u_kiro is readable through the stored id, and NOT after the id is cleared', () => {
    rememberLastUserId('u_kiro');
    rememberProjectTab('prj', 'list', 'u_kiro');
    expect(readLastUserId()).toBe('u_kiro');
    expect(readProjectTab('prj', readLastUserId())).toBe('list');
    rememberLastUserId(null);
    expect(readLastUserId()).toBeNull();
    expect(readProjectTab('prj', readLastUserId())).toBeNull();
  });

  it('25.042 a stored id for someone else never opens u_kiro\'s tab, and a blocked store answers null', () => {
    rememberProjectTab('prj', 'list', 'u_kiro');
    rememberLastUserId('u_other');
    expect(readProjectTab('prj', readLastUserId())).toBeNull();
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('site data blocked');
      },
    });
    try {
      expect(readLastUserId()).toBeNull();
      expect(() => rememberLastUserId('u_kiro')).not.toThrow();
    } finally {
      if (original !== undefined) Object.defineProperty(window, 'localStorage', original);
    }
    expect(readLastUserId()).toBe('u_other'); // the control: the store works again
  });
});

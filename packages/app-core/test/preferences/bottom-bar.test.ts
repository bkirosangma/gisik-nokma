import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOTTOM_BAR_KEY, DEFAULT_BAR, readBottomBar, rememberBottomBar, resetBottomBar } from '../../src/preferences/bottom-bar.js';

/** The web app on phones, Plan Task 3 — the store half (cases 21.020–21.022). */
beforeEach(() => localStorage.clear());

describe('21.020 defaults on failure', () => {
  it('21.020 nothing saved, throwing storage and a malformed value → DEFAULT_BAR; a valid saved value reads back', () => {
    expect(readBottomBar('u1')).toEqual([...DEFAULT_BAR]);

    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readBottomBar('u1')).toEqual([...DEFAULT_BAR]);
    spy.mockRestore();

    localStorage.setItem(BOTTOM_BAR_KEY, '{not json');
    expect(readBottomBar('u1')).toEqual([...DEFAULT_BAR]);
    // A document of the right shape whose slots are not an array is malformed too.
    localStorage.setItem(BOTTOM_BAR_KEY, JSON.stringify({ userId: 'u1', slots: 'board' }));
    expect(readBottomBar('u1')).toEqual([...DEFAULT_BAR]);

    // CONTROL — a valid saved value is returned as saved (so the defaults above are not the only thing it can say).
    rememberBottomBar('u1', ['calendar', 'inbox']);
    expect(readBottomBar('u1')).toEqual(['calendar', 'inbox']);
  });

  it('21.020 a write that throws is swallowed (a lost convenience, never a crash)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberBottomBar('u1', ['notes'])).not.toThrow();
    expect(() => resetBottomBar('u1')).not.toThrow();
    spy.mockRestore();
  });
});

describe('21.021 keyed by user', () => {
  it('21.021 a value saved for A is not read for B; A reads its own', () => {
    rememberBottomBar('a', ['notes']);
    expect(readBottomBar('b')).toEqual([...DEFAULT_BAR]);
    expect(readBottomBar('a')).toEqual(['notes']);
  });
});

describe('21.022 at most 4, deduped, known destinations only', () => {
  it('21.022 five valid slots keep four, a duplicate and an unknown id are dropped; three save as three; reset restores the default', () => {
    rememberBottomBar('u', ['board', 'board', 'notes', 'zz' as never, 'inbox', 'list', 'calendar']);
    expect(readBottomBar('u')).toEqual(['board', 'notes', 'inbox', 'list']);
    // CONTROL — three valid slots save as three (the cap is a cap, not a pad).
    rememberBottomBar('u', ['board', 'notes', 'inbox']);
    expect(readBottomBar('u')).toHaveLength(3);
    // The READ side enforces the same door: a hand-written five-slot document is cut, not honoured.
    localStorage.setItem(BOTTOM_BAR_KEY, JSON.stringify({ userId: 'u', slots: ['board', 'my-work', 'notes', 'inbox', 'list'] }));
    expect(readBottomBar('u')).toEqual(['board', 'my-work', 'notes', 'inbox']);
    resetBottomBar('u');
    expect(readBottomBar('u')).toEqual([...DEFAULT_BAR]);
  });
});

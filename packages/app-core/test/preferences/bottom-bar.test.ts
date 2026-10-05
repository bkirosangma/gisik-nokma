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

describe('21.034 a saved EMPTY bar is a choice, not a failure', () => {
  it('21.034 remembering [] reads back as [] and is never promoted to the default; a saved non-empty bar reads as saved', () => {
    rememberBottomBar('u', []);
    expect(readBottomBar('u')).toEqual([]);
    // The stored bytes carry the empty array itself (not a removed record, which WOULD read as the default).
    expect(JSON.parse(localStorage.getItem(BOTTOM_BAR_KEY) ?? 'null')).toEqual({ userId: 'u', slots: [] });
    // CONTROL — a non-empty saved bar reads as saved, so the `[]` above is the stored choice and not a blanket answer.
    rememberBottomBar('u', ['calendar']);
    expect(readBottomBar('u')).toEqual(['calendar']);
  });
});

describe('21.035 the owner’s default bar, spelled out', () => {
  it('21.035 DEFAULT_BAR is exactly Board · My work · Notes · Inbox, four entries (More is not counted)', () => {
    expect([...DEFAULT_BAR]).toEqual(['board', 'my-work', 'notes', 'inbox']);
    expect(DEFAULT_BAR).toHaveLength(4);
    // CONTROL — the same literal is what an unreadable store answers.
    expect(readBottomBar('nobody')).toEqual(['board', 'my-work', 'notes', 'inbox']);
  });
});

describe('21.036 the write side cuts to four known ids as well', () => {
  it('21.036 the bytes rememberBottomBar wrote hold at most four known, de-duplicated ids', () => {
    const stored = (): { userId: string; slots: string[] } => JSON.parse(localStorage.getItem(BOTTOM_BAR_KEY) ?? 'null');
    rememberBottomBar('u', ['board', 'my-work', 'notes', 'inbox', 'list']);
    expect(stored().slots).toEqual(['board', 'my-work', 'notes', 'inbox']);
    rememberBottomBar('u', ['notes', 'notes', 'zz' as never, 'inbox']);
    expect(stored().slots).toEqual(['notes', 'inbox']);
    // CONTROL — three valid slots are stored as three, under this user.
    rememberBottomBar('u', ['board', 'notes', 'inbox']);
    expect(stored()).toEqual({ userId: 'u', slots: ['board', 'notes', 'inbox'] });
  });
});

describe('28.198 Drafts is a destination a bar may pin (drafts T8 FIX 1; planner ruled B 09:11)', () => {
  it('28.198 a pinned drafts slot reads back through the door, and the bytes hold it; an unknown id beside it is still dropped', () => {
    rememberBottomBar('u', ['drafts', 'zz' as never, 'notes']);
    expect(readBottomBar('u')).toEqual(['drafts', 'notes']);
    expect(JSON.parse(localStorage.getItem(BOTTOM_BAR_KEY) ?? 'null')).toEqual({ userId: 'u', slots: ['drafts', 'notes'] });
    // CONTROL — offered, never slotted by default: the owner's default bar does not carry it.
    expect(DEFAULT_BAR).not.toContain('drafts');
  });
});

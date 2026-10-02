import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROJECT_GROUPING,
  projectGroupingKey,
  readProjectGrouping,
  rememberProjectGrouping,
} from '../../src/preferences/project-grouping.js';

/**
 * Prefixes and groups plan Task 7, case 22.122 (the store half): the Grouped / Plain choice is kept per
 * person on each device. `new-ticket-start.ts`'s shape — every storage access wrapped, every failure
 * answering the default.
 */
const KIRO = 'user_kiro';
const OTHER = 'user_other';
const WORKSPACE = 'ws_1';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('22.122 the grouped/plain choice is remembered per user and per workspace', () => {
  it('22.122 a remembered choice reads back; another user, another workspace and an empty store read the default', () => {
    expect(DEFAULT_PROJECT_GROUPING).toBe('plain');
    expect(readProjectGrouping(KIRO, WORKSPACE)).toBe('plain');

    rememberProjectGrouping(KIRO, WORKSPACE, 'grouped');
    expect(readProjectGrouping(KIRO, WORKSPACE)).toBe('grouped');

    // CONTROL: the same device, the same workspace, a different person: the default, never Kiro's choice.
    expect(readProjectGrouping(OTHER, WORKSPACE)).toBe('plain');
    // CONTROL: the choice is per workspace, so the same person in another workspace has none.
    expect(readProjectGrouping(KIRO, 'ws_2')).toBe('plain');

    rememberProjectGrouping(KIRO, WORKSPACE, 'plain');
    expect(readProjectGrouping(KIRO, WORKSPACE)).toBe('plain');
  });

  it('22.122 a corrupt or foreign value, a blocked store and an empty id all answer the default and never throw', () => {
    window.localStorage.setItem(projectGroupingKey(WORKSPACE), '{not json');
    expect(readProjectGrouping(KIRO, WORKSPACE)).toBe('plain');
    window.localStorage.setItem(projectGroupingKey(WORKSPACE), JSON.stringify({ userId: KIRO, choice: 'tree' }));
    expect(readProjectGrouping(KIRO, WORKSPACE)).toBe('plain');

    rememberProjectGrouping('', WORKSPACE, 'grouped');
    expect(window.localStorage.getItem(projectGroupingKey(WORKSPACE))).toContain('tree'); // the empty id wrote nothing over it

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readProjectGrouping(KIRO, WORKSPACE)).toBe('plain');
    expect(() => rememberProjectGrouping(KIRO, WORKSPACE, 'grouped')).not.toThrow();
  });
});

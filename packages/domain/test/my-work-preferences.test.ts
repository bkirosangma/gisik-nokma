import { describe, expect, it } from 'vitest';
import { DEFAULT_MY_WORK_PREFERENCES, myWorkPreferencesSchema } from '../src/my-work-preferences.js';

/**
 * 30.013, the domain half: the one default instance `getMyWorkPreferences` hands every person with no row.
 * Reviewer rider (P44): nothing pinned the freeze the constant's docblock promises (mutants O4a / O4b survived).
 */
describe('30.013 DEFAULT_MY_WORK_PREFERENCES is the shared default', () => {
  it('30.013 the default and its show array are both frozen, so a caller that pushes into show edits no later default; control: a parsed copy of the same doc is not frozen', () => {
    // Control: the check below reads a real difference, not a property every doc has.
    const copy = myWorkPreferencesSchema.parse(DEFAULT_MY_WORK_PREFERENCES);
    expect(copy).toEqual({ show: ['created', 'assigned'], grouping: 'workspace-project' });
    expect(Object.isFrozen(copy)).toBe(false);
    expect(Object.isFrozen(copy.show)).toBe(false);
    // Object.freeze is shallow: the document AND its array are frozen.
    expect(Object.isFrozen(DEFAULT_MY_WORK_PREFERENCES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MY_WORK_PREFERENCES.show)).toBe(true);
    expect(() => (DEFAULT_MY_WORK_PREFERENCES.show as string[]).push('ws-admin')).toThrow(TypeError);
    expect(DEFAULT_MY_WORK_PREFERENCES).toEqual({ show: ['created', 'assigned'], grouping: 'workspace-project' });
  });
});

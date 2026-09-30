import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLUMN_COLLAPSE_KEY,
  NO_COLUMN_CHOICES,
  columnCollapseKey,
  readColumnCollapse,
  rememberColumnCollapse,
} from '../../src/preferences/column-collapse.js';
import { WORKFLOW_COLLAPSE_KEY } from '../../src/preferences/workflow-collapse.js';

/**
 * Styling refresh Plan A Task 5B — case 20.111. The column memory is
 * `workflow-collapse.ts`'s shape one level down; these arms pin the same
 * doors (per user AND project, choices only, every failure answers the
 * default) against the column module's own names.
 */
const USER = 'user_kiro';
const PROJECT = 'prj_1';
const OTHER_PROJECT = 'prj_2';
const KEY = columnCollapseKey('wf-errand', 'done');

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(COLUMN_COLLAPSE_KEY) ?? 'null');
}

describe('20.111 the column memory is per user and per project, choices only', () => {
  it('20.111 the key is workflow:state, the storage key is its own, and a read answers what was written', () => {
    expect(COLUMN_COLLAPSE_KEY).toBe('gn-board-column-collapse');
    expect(KEY).toBe('wf-errand:done');
    expect(readColumnCollapse(USER, PROJECT)).toBe(NO_COLUMN_CHOICES);
    rememberColumnCollapse(USER, PROJECT, { [KEY]: false });
    expect(stored()).toEqual({ userId: USER, projects: { [PROJECT]: { [KEY]: false } } });
    expect(readColumnCollapse(USER, PROJECT)).toEqual({ [KEY]: false });
  });

  it('20.111 a write merges one project without touching another, and an empty record removes its project', () => {
    rememberColumnCollapse(USER, PROJECT, { [KEY]: false });
    rememberColumnCollapse(USER, OTHER_PROJECT, { [KEY]: true });
    expect(readColumnCollapse(USER, PROJECT)).toEqual({ [KEY]: false });
    expect(readColumnCollapse(USER, OTHER_PROJECT)).toEqual({ [KEY]: true });
    rememberColumnCollapse(USER, PROJECT, {});
    expect(readColumnCollapse(USER, PROJECT)).toBe(NO_COLUMN_CHOICES);
    expect(readColumnCollapse(USER, OTHER_PROJECT)).toEqual({ [KEY]: true });
  });

  it('20.111 no session reads and writes nothing', () => {
    rememberColumnCollapse('', PROJECT, { [KEY]: false });
    expect(window.localStorage.getItem(COLUMN_COLLAPSE_KEY)).toBeNull();
    rememberColumnCollapse(USER, PROJECT, { [KEY]: false });
    expect(readColumnCollapse('', PROJECT)).toBe(NO_COLUMN_CHOICES);
  });

  it("20.111 another user's document is not honoured on read, and its projects are not carried into this user's write", () => {
    window.localStorage.setItem(
      COLUMN_COLLAPSE_KEY,
      JSON.stringify({ userId: 'usr_grace', projects: { [PROJECT]: { [KEY]: false }, [OTHER_PROJECT]: { [KEY]: false } } }),
    );
    // CONTROL — the same bytes DO answer for the user they name.
    expect(readColumnCollapse('usr_grace', PROJECT)).toEqual({ [KEY]: false });
    expect(readColumnCollapse(USER, PROJECT)).toBe(NO_COLUMN_CHOICES);
    rememberColumnCollapse(USER, PROJECT, { [KEY]: true });
    expect(stored()).toEqual({ userId: USER, projects: { [PROJECT]: { [KEY]: true } } });
  });

  it.each([
    ['unparseable text', 'not json {'],
    ['a non-object document', '42'],
    ['a document with no user', JSON.stringify({ projects: {} })],
    ['projects that are an array', JSON.stringify({ userId: USER, projects: [] })],
    ['a project record with a non-boolean value', JSON.stringify({ userId: USER, projects: { [PROJECT]: { [KEY]: 'yes' } } })],
  ])('20.111 %s answers the default', (_label, raw) => {
    window.localStorage.setItem(COLUMN_COLLAPSE_KEY, raw);
    expect(readColumnCollapse(USER, PROJECT)).toBe(NO_COLUMN_CHOICES);
  });

  it('20.111 a throwing accessor answers the default on read and does not throw on write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('site data blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('site data blocked');
    });
    expect(readColumnCollapse(USER, PROJECT)).toBe(NO_COLUMN_CHOICES);
    expect(() => rememberColumnCollapse(USER, PROJECT, { [KEY]: false })).not.toThrow();
  });

  it("20.111 CONTROL: a column write leaves the workflow group's key untouched", () => {
    window.localStorage.setItem(WORKFLOW_COLLAPSE_KEY, '{"userId":"user_kiro","projects":{}}');
    rememberColumnCollapse(USER, PROJECT, { [KEY]: false });
    expect(window.localStorage.getItem(WORKFLOW_COLLAPSE_KEY)).toBe('{"userId":"user_kiro","projects":{}}');
    expect(window.localStorage.getItem(COLUMN_COLLAPSE_KEY)).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent, PURGE_DELAY_DAYS, purgeDueAt } from '../src/index.js';

const base = (type: string, kind: string, payload: unknown = {}) => ({
  id: newUlid(), version: 1, origin: 'web', clientTime: '2026-09-23T10:00:00.000Z',
  actorId: newUlid(), workspaceId: newUlid(),
  entity: { kind, id: newUlid() }, type, payload,
});

const PAIRS: Array<[string, string]> = [
  ['workspace.archived', 'workspace'], ['workspace.restored', 'workspace'],
  ['workspace.deleted', 'workspace'], ['workspace.undeleted', 'workspace'],
  ['project.deleted', 'project'], ['project.undeleted', 'project'],
];

describe('19.001 each lifecycle type parses against its entity kind', () => {
  it.each(PAIRS)('%s against %s', (type, kind) => {
    expect(parseEvent(base(type, kind)).ok).toBe(true);
    const wrong = kind === 'workspace' ? 'project' : 'workspace';
    const result = parseEvent(base(type, wrong));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('entity-kind-mismatch');
  });
});

describe('19.002 every lifecycle payload refuses a stranger field', () => {
  it.each([...PAIRS, ['purge.marked', 'ticket'], ['purge.unmarked', 'ticket']] as Array<[string, string]>)(
    '%s', (type, kind) => {
      expect(parseEvent(base(type, kind, {})).ok).toBe(true);
      const strangerField = parseEvent(base(type, kind, { projectId: 'x' }));
      expect(strangerField.ok).toBe(false);
      expect(!strangerField.ok && strangerField.code).toBe('invalid-payload');
      const dueAtField = parseEvent(base(type, kind, { dueAt: '2026-10-08T10:00:00.000Z' }));
      expect(dueAtField.ok).toBe(false);
      expect(!dueAtField.ok && dueAtField.code).toBe('invalid-payload');
    });
});

describe('19.003 purge.marked/unmarked are filed against the four purgeable kinds only', () => {
  it.each(['workspace', 'project', 'ticket', 'note'])('%s accepted', (kind) => {
    expect(parseEvent(base('purge.marked', kind)).ok).toBe(true);
    expect(parseEvent(base('purge.unmarked', kind)).ok).toBe(true);
  });
  it('workflow refused', () => {
    const result = parseEvent(base('purge.marked', 'workflow'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('entity-kind-mismatch');
  });
});

describe('19.004 purgeDueAt adds PURGE_DELAY_DAYS to the mark instant', () => {
  it('computes the due instant', () => {
    expect(purgeDueAt('2026-09-23T10:00:00.000Z')).toBe('2026-10-08T10:00:00.000Z');
    const ms = Date.parse(purgeDueAt('2026-01-01T00:00:00.000Z')) - Date.parse('2026-01-01T00:00:00.000Z');
    expect(ms).toBe(PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000);
  });
});

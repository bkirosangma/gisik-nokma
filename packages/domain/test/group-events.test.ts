import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent } from '../src/index.js';

const envelope = (type: string, payload: unknown, kind = 'group') => ({
  id: newUlid(), version: 1, origin: 'web', clientTime: '2026-10-02T00:00:00.000Z',
  actorId: newUlid(), workspaceId: newUlid(),
  entity: { kind, id: newUlid() }, type, payload,
});

describe('22.090 group.created carries a level that agrees with its parent being present', () => {
  it('22.090 L1 with no parent and L2 with one parse; control: L1 with a parent, L2 without, L5, a stranger key and a non-group entity are refused', () => {
    const created = (payload: unknown, kind = 'group') => parseEvent(envelope('group.created', payload, kind));
    expect(created({ parentId: null, level: 1, name: 'Retail', rank: 'm' }).ok).toBe(true);
    expect(created({ parentId: 'G1', level: 2, name: 'North', rank: 'm' }).ok).toBe(true);
    expect(created({ parentId: 'G1', level: 4, name: 'Deep', rank: 'm' }).ok).toBe(true);
    // The refusals — each one a different clause of the schema.
    expect(created({ parentId: 'G1', level: 1, name: 'Retail', rank: 'm' }).ok).toBe(false);
    expect(created({ parentId: null, level: 2, name: 'North', rank: 'm' }).ok).toBe(false);
    expect(created({ parentId: 'G1', level: 5, name: 'Too deep', rank: 'm' }).ok).toBe(false);
    expect(created({ parentId: null, level: 1, name: '   ', rank: 'm' }).ok).toBe(false);
    expect(created({ parentId: null, level: 1, name: 'Retail', rank: 'm0' }).ok).toBe(false);
    expect(created({ parentId: null, level: 1, name: 'Retail', rank: 'm', colour: 'red' }).ok).toBe(false);
    expect(created({ parentId: null, level: 1, name: 'Retail', rank: 'm' }, 'project').ok).toBe(false);
  });

  it('22.090 the other three group events: rename takes a name, reorder a rank, delete nothing', () => {
    const parse = (type: string, payload: unknown) => parseEvent(envelope(type, payload)).ok;
    expect(parse('group.renamed', { name: 'South' })).toBe(true);
    expect(parse('group.renamed', {})).toBe(false);
    expect(parse('group.reordered', { rank: 'n' })).toBe(true);
    expect(parse('group.reordered', { rank: '' })).toBe(false);
    expect(parse('group.deleted', {})).toBe(true);
    expect(parse('group.deleted', { force: true })).toBe(false); // control: a stranger key
  });
});

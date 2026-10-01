import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent } from '../src/index.js';

const envelope = (type: string, kind: string, payload: unknown, kindOverride = kind) => ({
  id: newUlid(), version: 1, origin: 'web', clientTime: '2026-10-02T00:00:00.000Z',
  actorId: newUlid(), workspaceId: newUlid(),
  entity: { kind: kindOverride, id: newUlid() }, type, payload,
});

describe('22.001 workspace.prefix_changed carries one valid prefix', () => {
  it('22.001 accepts {prefix:"SH"} filed against the workspace; control: refuses "sh", "ABCD", "", a stranger key and another entity kind', () => {
    const prefixChanged = (payload: unknown, kind = 'workspace') =>
      parseEvent(envelope('workspace.prefix_changed', 'workspace', payload, kind));
    expect(prefixChanged({ prefix: 'SH' }).ok).toBe(true);
    for (const bad of ['sh', 'ABCD', '']) {
      expect(prefixChanged({ prefix: bad }).ok).toBe(false);
    }
    expect(prefixChanged({}).ok).toBe(false);
    expect(prefixChanged({ prefix: 'SH', name: 'x' }).ok).toBe(false);
    expect(prefixChanged({ prefix: 'SH' }, 'project').ok).toBe(false);
  });
});

describe('22.002 project.updated may carry only a prefix, or only a group', () => {
  it('22.002 {prefix} alone, {groupId} alone and {groupId:null} parse; control: {} and a malformed prefix or empty groupId are refused', () => {
    const updated = (payload: unknown) => parseEvent(envelope('project.updated', 'project', payload));
    expect(updated({ prefix: 'SH' }).ok).toBe(true);
    expect(updated({ groupId: 'G1' }).ok).toBe(true);
    expect(updated({ groupId: null }).ok).toBe(true);
    expect(updated({ name: 'Shop', prefix: 'SH', groupId: 'G1' }).ok).toBe(true);
    expect(updated({}).ok).toBe(false);
    expect(updated({ prefix: 'sh' }).ok).toBe(false);
    expect(updated({ groupId: '' }).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { BUILTIN_TICKET_TYPE_SEEDS } from '@gisik-nokma/domain';
import { defaultRootTypeFor } from '../../src/views/new-ticket-dialog.js';
import { subtaskTypeFor } from '../../src/views/ticket-sheet.js';
import { TYPE_ICON_NAMES, TYPE_ICONS } from '../../src/workflow-builder/ticket-types/icons.js';

const L = (id: string, rank: number) => ({ id, name: id, rank, workflowId: 'wf', icon: 'check', fields: [] });

describe('29.134 a Decision is never a default type', () => {
  it('29.134 a new root ticket and a new sub-item skip the Decision that ties Task on rank', () => {
    const ladder = [L('epic', 1), L('story', 2), L('task', 3), L('sub-task', 4), L('decision', 3)];
    expect(defaultRootTypeFor(ladder)?.id).toBe('task');
    expect(defaultRootTypeFor(ladder.filter((t) => t.id !== 'task'))?.id).toBe('story'); // control: Decision is skipped even when Task is absent
    expect(subtaskTypeFor(ladder.filter((t) => t.id !== 'task'), 2)?.id).toBe('sub-task');
    expect(defaultRootTypeFor([L('task', 3), L('decision', 3)])?.id).toBe('task'); // one other legal type is enough to skip it
    expect(defaultRootTypeFor([L('chore', 3), L('errand', 3)])?.id).toBe('chore'); // control: the id tie-break still applies to others
    expect(defaultRootTypeFor([L('decision', 3)])?.id).toBe('decision'); // control: legal and alone, so the last resort
    expect(subtaskTypeFor([L('story', 2), L('decision', 3)], 2)?.id).toBe('decision'); // control: the last resort for a child
  });

  it('29.134 the diamond glyph is drawn, and every built-in seed names an icon the picker has', () => {
    expect(TYPE_ICONS.diamond).toEqual([{ kind: 'path', d: 'M12 2 22 12 12 22 2 12z' }]);
    for (const seed of BUILTIN_TICKET_TYPE_SEEDS) expect(TYPE_ICON_NAMES, seed.id).toContain(seed.icon);
  });
});

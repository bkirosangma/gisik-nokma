import { describe, expect, it } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { subtaskTypeFor } from '../../src/views/ticket-sheet.js';

const def = (id: string, rank: number): TicketTypeDef => ({ id, name: id, icon: 'check', rank, workflowId: 'wf', fields: [] });

describe('29.144 subtaskTypeFor and the Decision seed', () => {
  it('29.144 never defaults a child to the Decision when another type is legal, and still can when it is the only one', () => {
    // No `task` in this custom ladder, so rule 2 (shallowest legal, ties by id) decides: 'decision' < 'errand'.
    expect(subtaskTypeFor([def('story', 2), def('decision', 3), def('errand', 3), def('sub-task', 4)], 2)?.id).toBe('errand');
    expect(subtaskTypeFor([def('story', 2), def('decision', 3), def('sub-task', 4)], 2)?.id).toBe('sub-task');
    expect(subtaskTypeFor([def('epic', 1), def('story', 2), def('task', 3), def('decision', 3), def('sub-task', 4)], 1)?.id).toBe('task'); // rule 1 unchanged
    expect(subtaskTypeFor([def('story', 2), def('decision', 3)], 2)?.id).toBe('decision'); // control: the last resort
  });
});

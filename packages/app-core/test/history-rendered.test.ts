// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TicketHistoryEvent } from '../src/view-types.js';
import { describeEvent, HISTORY_RENDERED_TYPES } from '../src/views/history-copy.js';

/**
 * 27.517's app half (KG-D Task 7, the D2 audit). `HISTORY_RENDERED_TYPES` is the list the server half reads to judge
 * each MCP write tool's `history` leg, and it is data copied from `describeEvent`'s switch. Three legs hold it there:
 * the samples cover the list exactly; each sample renders a sentence, not the raw type (a listed type with no arm
 * falls through to its own name); and the switch's case labels, read from the source, are the list (an arm added
 * without listing it). Each sample is read from its arm's own `str(payload, …)` reads.
 */
const C = '01J9ZQ8Y6N4V2K7M3H5T1R0W8C';

const SAMPLES: Record<string, unknown> = {
  'ticket.created': { typeId: 'task', projectId: 'prj', parentId: null, title: 'HSN codes' },
  'ticket.field_set': { fieldId: 'priority', value: 'P1' },
  'ticket.transitioned': { to: 'doing' },
  'visibility.set': { ticketId: 't1', mode: 'project' },
  'ticket.assigned': { assigneeId: 'user_anselma' },
  'ticket.collaborator_added': { userId: 'user_anselma' },
  'ticket.collaborator_removed': { userId: 'user_anselma' },
  'ticket.workflow_rebound': { toWorkflowId: 'wf-1', toStateId: 'doing' },
  'ticket.reparented': { newParentId: null },
  'ticket.ranked': { rank: 'a1' },
  'ticket.closed': {},
  'ticket.reopened': {},
  'ticket.deleted': {},
  'ticket.restored': {},
  'comment.added': { body: {} },
  'comment.edited': { commentId: 'c1', body: {} },
  'comment.deleted': { commentId: 'c1' },
  'attachment.added': { kind: 'upload', attachmentId: 'a1', filename: 'gst-return.pdf' },
  'ticket.link_added': { kind: 'blocks', targetId: '01J9GTKB000000000000000000' },
  'ticket.link_removed': { kind: 'relates', targetId: '01J9GTKB000000000000000000' },
  'claim.contested': { originalEvent: {}, rule: 'r', reason: 'why' },
  'claim.contested_resolved': { resolution: 'redone' },
  'concept.created': { name: 'Scroll' },
  'concept.renamed': { name: 'Scroll jumps' },
  'concept.described': { summary: 'x' },
  'concept.item_tagged': { itemKind: 'ticket', itemId: 't1' },
  'concept.item_untagged': { itemKind: 'note', itemId: 'n1' },
  'concept.linked': { otherId: C, relation: 'broader' },
  'concept.unlinked': { otherId: C, relation: 'related' },
  'concept.merged': { intoId: C },
  'concept.deleted': {},
  'workspace.concept_suggestion_rejected': { signature: 'a'.repeat(64), itemHashes: ['b'.repeat(32)] },
};

function eventOf(type: string): TicketHistoryEvent {
  return {
    id: '01J9ZQ8Y6N4V2K7M3H5T1R0W8F',
    type,
    version: 1,
    payload: SAMPLES[type],
    actorId: 'u1',
    origin: 'web',
    clientTime: '2026-10-05T09:00:00.000Z',
    serverTime: '2026-10-05T09:00:00.100Z',
    seq: 1,
  };
}

describe('27.517 (app half) HISTORY_RENDERED_TYPES is exactly the types describeEvent renders', () => {
  it('27.517 a sample per listed type renders a sentence, and the list equals the switch case labels both ways', () => {
    expect(Object.keys(SAMPLES).sort(), 'a listed type with no sample, or a sample for an unlisted type').toEqual([...HISTORY_RENDERED_TYPES].sort());
    for (const type of HISTORY_RENDERED_TYPES) expect(describeEvent(eventOf(type)), `${type} has no arm`).not.toBe(type);
    // The reverse: an arm added to the switch but not to the list. The hyphen is in the class for `ticket-type.*`.
    const source = readFileSync(fileURLToPath(new URL('../src/views/history-copy.ts', import.meta.url)), 'utf8');
    const labels = [...source.matchAll(/case '([a-z_.-]+)':/g)].map((match) => match[1]!);
    expect(labels.length).toBeGreaterThan(20); // precondition: a regex that matches nothing cannot pass
    expect([...labels].sort(), 'describeEvent gained or lost an arm: update HISTORY_RENDERED_TYPES').toEqual([...HISTORY_RENDERED_TYPES].sort());
    // Control: an unlisted, arm-less type falls through to its own name, so the "not the raw type" leg can fail.
    expect(describeEvent({ ...eventOf('ticket.closed'), type: 'note.renamed', payload: { title: 'x' } })).toBe('note.renamed');
  });
});

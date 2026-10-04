import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_ALLOWED_EVENT_TYPES,
  DRAFT_GATE_EXEMPT_EVENT_TYPES,
  draftAllows,
  plainTextToDoc,
  type EventEnvelope,
} from '@gisik-nokma/domain';
import { checkTicketDraftGate, DRAFT_NOT_ALLOWED_RULE } from '../src/checks/drafts.js';
import { evaluateEvent } from '../src/evaluate.js';
import { buildMemoryContext } from '../src/memory-context.js';
import {
  AUTHOR, OTHER, PROJECT, STORY, TASK, WF, created, draftCreated, onTicket, typeDefined,
} from '../src/checks/test-support.js';

/**
 * 28.090 — the engine twin of the author's allowlist (drafts spec R6, R7, R12). Every expectation asserts the
 * LITERAL sentence: a test that asserts the function it is testing certifies a typo in it.
 */
const D = '01J9GDRF000000000000000000';
const PUB = '01J9GPBT000000000000000000';
const GHOST = '01J9GGHT000000000000000000';
const COMMENT = '01J9GCMT000000000000000000';
const ATTACHMENT = '01J9GATT000000000000000000';

/** A published ticket PUB and a draft D by AUTHOR, both tasks at the project root. */
const world = (...after: EventEnvelope[]) =>
  buildMemoryContext(
    [WF],
    [typeDefined(STORY), typeDefined(TASK), created(PUB, 'task', null), draftCreated(D, 'task', null), ...after],
  );

type Row = [type: string, payloadFor: (id: string) => unknown];
const ALLOWED: Row[] = [
  ['ticket.field_set', () => ({ fieldId: 'title', value: 'renamed' })],
  ['ticket.assigned', () => ({ assigneeId: OTHER })],
  ['ticket.reparented', () => ({ newParentId: null })],
  ['ticket.link_added', () => ({ kind: 'blocks', targetId: PUB })],
  ['ticket.link_removed', () => ({ kind: 'blocks', targetId: PUB })],
  ['attachment.added', () => ({ attachmentId: ATTACHMENT, filename: 'a.txt', mime: 'text/plain', size: 1, sha256: 'ab' })],
  ['ticket.published', () => ({ projectId: PROJECT })],
  ['ticket.discarded', () => ({})],
];
const REFUSED: Array<[...Row, reason: string]> = [
  ['ticket.transitioned', () => ({ to: 'doing' }), 'A draft cannot be moved. Publish it first, or discard it.'],
  ['ticket.closed', () => ({}), 'A draft cannot be closed. Publish it first, or discard it.'],
  ['ticket.reopened', () => ({}), 'A draft cannot be reopened. Publish it first, or discard it.'],
  ['ticket.ranked', () => ({ rank: 'a1' }), 'A draft cannot be ranked. Publish it first, or discard it.'],
  ['ticket.collaborator_added', () => ({ userId: OTHER }), 'A draft cannot be shared with collaborators. Publish it first, or discard it.'],
  ['ticket.collaborator_removed', () => ({ userId: OTHER }), 'A draft cannot be shared with collaborators. Publish it first, or discard it.'],
  ['ticket.workflow_rebound', () => ({ toWorkflowId: WF.id, toStateId: 'todo' }), 'A draft cannot be moved to another workflow. Publish it first, or discard it.'],
  ['comment.added', () => ({ body: plainTextToDoc('a comment') }), 'A draft cannot be commented on. Publish it first, or discard it.'],
  ['comment.edited', () => ({ commentId: COMMENT, body: plainTextToDoc('an edit') }), 'A draft cannot be commented on. Publish it first, or discard it.'],
  ['comment.deleted', () => ({ commentId: COMMENT }), 'A draft cannot be commented on. Publish it first, or discard it.'],
  ['visibility.set', (id) => ({ ticketId: id, mode: 'explicit', userIds: [OTHER] }), 'A draft cannot be shared. Publish it first, or discard it.'],
  ['ticket.deleted', () => ({}), 'A draft cannot be deleted. Discard it instead.'],
  ['ticket.restored', () => ({}), 'A draft cannot be restored. Publish it first, or discard it.'],
];

describe('28.090 the engine draft gate', () => {
  it('the tables here are the domain allowlist and its complement, so neither can drift from it', () => {
    expect(ALLOWED.map(([type]) => type).sort()).toEqual([...DRAFT_ALLOWED_EVENT_TYPES].sort());
    for (const [type] of REFUSED) expect(draftAllows(type), type).toBe(false);
    expect(DRAFT_NOT_ALLOWED_RULE).toBe('draft.not-allowed');
  });

  it('the allowed, refused and exempt tables together are the WHOLE ticket-scoped vocabulary: a new ticket type must pick a side', () => {
    // The universe is the source that REGISTERS it, read as text, exactly as `live-ticket.test.ts` (17.121)
    // reads it: a block is ticket-scoped when its `entityKind` expression NAMES `'ticket'` (`comment.*` spell
    // `['ticket', 'note']`). Without this, "refuses the thirteen other writes" would be a claim about this
    // file's table, and a type registered later would pass the gate on a draft unseen.
    const source = readFileSync(new URL('../../domain/src/vocabulary.ts', import.meta.url), 'utf8');
    const blocks = source.split('domainRegistry.register({').slice(1);
    const ticketScoped = blocks
      .filter((block) => /entityKind: [^\n]*'ticket'/.test(block))
      .map((block) => /\btype: '([^']+)'/.exec(block)?.[1])
      .sort();
    // CONTROLS: the parse found the registrations at all, rather than an empty file against empty tables
    expect(blocks.length).toBeGreaterThan(20);
    expect(ticketScoped.length).toBeGreaterThan(20);
    const covered = [...ALLOWED.map(([type]) => type), ...REFUSED.map(([type]) => type), ...DRAFT_GATE_EXEMPT_EVENT_TYPES].sort();
    expect(covered).toEqual(ticketScoped);
  });

  it('admits the allowlist on a draft (the link pair is only not refused as draft.not-allowed)', async () => {
    for (const [type, payloadFor] of ALLOWED) {
      const verdict = await evaluateEvent(onTicket(D, type, payloadFor(D)), world());
      if (type === 'ticket.link_added' || type === 'ticket.link_removed') {
        expect(verdict, type).not.toMatchObject({ rule: 'draft.not-allowed' });
      } else {
        expect(verdict, type).toEqual({ refused: false });
      }
    }
  });

  it.each(REFUSED)('%s on a draft is refused with the way out in the sentence, whoever sends it; the published twin passes the gate', async (type, payloadFor, reason) => {
    const refusal = { refused: true, rule: 'draft.not-allowed', reason };
    expect(await evaluateEvent(onTicket(D, type, payloadFor(D)), world())).toEqual(refusal);
    expect(await evaluateEvent(onTicket(D, type, payloadFor(D), OTHER), world())).toEqual(refusal);
    // CONTROL: the same event on the published twin is not the gate's to refuse
    expect(await checkTicketDraftGate(onTicket(PUB, type, payloadFor(PUB)), world())).toEqual({ refused: false });
  });

  it('a discarded draft answers every event as an unknown ticket, except the exempt bookkeeping; the live draft does not', async () => {
    const gone = world(onTicket(D, 'ticket.discarded', {}));
    const unknown = { refused: true, rule: 'ticket.unknown', reason: 'This ticket does not exist in this workspace.' };
    for (const [type, payloadFor] of [...ALLOWED, ...REFUSED.map(([t, p]): Row => [t, p])]) {
      expect(await evaluateEvent(onTicket(D, type, payloadFor(D)), gone), type).toEqual(unknown);
    }
    // the server's record of a refusal still reaches a discarded draft (an offline edit that met the erasure)
    expect(await checkTicketDraftGate(onTicket(D, 'claim.contested', {}, OTHER), gone)).toEqual({ refused: false });
    // CONTROL: the live draft takes the same field_set
    expect(await evaluateEvent(onTicket(D, 'ticket.field_set', { fieldId: 'title', value: 'x' }), world())).toEqual({ refused: false });
  });

  it('does not judge WHO sends an allowed event (authority is the permission gate, G1)', async () => {
    expect(await evaluateEvent(onTicket(D, 'ticket.field_set', { fieldId: 'title', value: 'x' }, OTHER), world())).toEqual({
      refused: false,
    });
    expect(AUTHOR).not.toBe(OTHER);
  });

  it('is not the business of a ticket that does not resolve, a published one, or another entity kind', async () => {
    expect(await checkTicketDraftGate(onTicket(GHOST, 'ticket.closed', {}), world())).toEqual({ refused: false });
    expect(await checkTicketDraftGate(onTicket(PUB, 'ticket.closed', {}), world())).toEqual({ refused: false });
    const note = { ...onTicket(D, 'note.attached', { ticketId: D }), entity: { kind: 'note' as const, id: D } };
    expect(await checkTicketDraftGate(note, world())).toEqual({ refused: false });
    // CONTROL: the same `ticket.closed` on the draft itself is the gate's
    expect(await checkTicketDraftGate(onTicket(D, 'ticket.closed', {}), world())).toMatchObject({ refused: true, rule: 'draft.not-allowed' });
  });
});

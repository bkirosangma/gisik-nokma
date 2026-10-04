import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  makeEnvelope,
  newUlid,
  ticketLinkAddedPayload,
  ticketLinkRemovedPayload,
  type TicketState,
  type TicketStateDeps,
  type TicketTypeDef,
  type WorkflowDef,
} from '../src/index.js';

const DRAFT = newUlid();
const SOURCE = newUlid();
const ELSEWHERE = newUlid();
const PROJECT = newUlid();
const AUTHOR = '01J9GUKR000000000000000000';

const WF: WorkflowDef = {
  id: 'wf-a',
  version: 1,
  name: 'wf-a',
  initialStateId: 'todo',
  states: [{ id: 'todo', name: 'To do', category: 'open' }],
  transitions: [{ from: '*', to: 'todo', rules: [] }],
};
const deps: TicketStateDeps = {
  getTicketType: (id): TicketTypeDef | undefined =>
    id === 'task' ? { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-a', fields: [] } : undefined,
  getWorkflow: (id) => (id === 'wf-a' ? WF : undefined),
};
const on = (type: string, payload: unknown) =>
  makeEnvelope({ type, entity: { kind: 'ticket', id: DRAFT }, actorId: AUTHOR, payload });
const draftState = (): TicketState =>
  applyTicketEvent(
    undefined,
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: DRAFT },
      actorId: AUTHOR,
      serverTime: '2026-10-03T09:00:00.000Z',
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Chiller', start: 'backlog', draft: true },
    }),
    deps,
  );

describe('28.110 the from member of the link payloads and its fold', () => {
  const plain = { kind: 'blocks', targetId: ELSEWHERE };
  const fromBlocks = { kind: 'blocks', targetId: DRAFT, from: SOURCE };
  const fromRelates = { kind: 'relates', targetId: DRAFT, from: SOURCE };

  it('28.110 from is optional, strict and never the target; the fold keeps the shapes apart; publish drops only the from entries', () => {
    for (const schema of [ticketLinkAddedPayload, ticketLinkRemovedPayload]) {
      expect(schema.safeParse(plain).success).toBe(true); // CONTROL: every stored link event
      expect(schema.safeParse(fromBlocks).success).toBe(true);
      expect(schema.safeParse({ ...fromBlocks, from: DRAFT }).success).toBe(false);
      expect(schema.safeParse({ ...fromBlocks, from: 'not-a-ulid' }).success).toBe(false);
      expect(schema.safeParse({ ...fromBlocks, extra: 1 }).success).toBe(false);
    }
    // The refusal's sentence, exactly, on BOTH payloads (P20 class 2d: the message is user-visible through the
    // engine's malformed-payload reason).
    for (const schema of [ticketLinkAddedPayload, ticketLinkRemovedPayload]) {
      const equal = schema.safeParse({ ...fromBlocks, from: DRAFT });
      expect(!equal.success && equal.error.issues[0]?.message).toBe('a link\'s "from" must be a different ticket from its target');
    }

    let state = draftState();
    for (const payload of [plain, fromBlocks, fromBlocks, fromRelates]) {
      state = applyTicketEvent(state, on('ticket.link_added', payload), deps);
    }
    expect(state.links).toEqual([plain, fromBlocks, fromRelates]); // the repeated add folded once
    expect(state.links?.[0]).not.toHaveProperty('from'); // the plain entry carries no key at all
    // SAME kind and target, different `from` (absent, or another source): each is its own entry. `plain` above names
    // ELSEWHERE, so without these two legs no entry pair differed by `from` alone.
    const samePlain = { kind: 'blocks', targetId: DRAFT };
    const otherSource = { ...fromBlocks, from: ELSEWHERE };
    expect(applyTicketEvent(state, on('ticket.link_added', samePlain), deps).links).toEqual([plain, fromBlocks, fromRelates, samePlain]);
    expect(applyTicketEvent(state, on('ticket.link_added', otherSource), deps).links).toEqual([plain, fromBlocks, fromRelates, otherSource]);

    // a plain removal naming the draft itself matches no entry: only from entries name it
    expect(applyTicketEvent(state, on('ticket.link_removed', { kind: 'blocks', targetId: DRAFT }), deps).links).toEqual(state.links);
    expect(applyTicketEvent(state, on('ticket.link_removed', fromBlocks), deps).links).toEqual([plain, fromRelates]);

    const published = applyTicketEvent(state, on('ticket.published', { projectId: PROJECT }), deps);
    expect(published.links).toEqual([plain]);
    expect('draft' in published).toBe(false);
    const onlyFrom = applyTicketEvent(draftState(), on('ticket.link_added', fromBlocks), deps);
    expect('links' in applyTicketEvent(onlyFrom, on('ticket.published', { projectId: PROJECT }), deps)).toBe(false);
  });
});

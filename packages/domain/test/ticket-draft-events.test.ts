import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  domainRegistry,
  DRAFT_ALLOWED_EVENT_TYPES,
  DRAFT_GATE_EXEMPT_EVENT_TYPES,
  draftAllows,
  draftNotAllowedReason,
  isDiscardedDraft,
  isDraft,
  makeEnvelope,
  newUlid,
  parseEvent,
  ticketCreatedPayload,
  ticketDiscardedPayload,
  ticketPublishedPayload,
  type EventTypeRegistration,
  type TicketState,
  type TicketStateDeps,
  type TicketTypeDef,
  type WorkflowDef,
} from '../src/index.js';

const TICKET = newUlid();
const PROJECT = newUlid();
const AUTHOR = '01J9GUKR000000000000000000';
const AT = '2026-10-03T09:00:00.000Z';

const wf = (id: string, version: number): WorkflowDef => ({
  id,
  version,
  name: id,
  initialStateId: 'todo',
  states: [{ id: 'todo', name: 'To do', category: 'open' }],
  transitions: [{ from: '*', to: 'todo', rules: [] }],
});
const WORKFLOWS = [wf('wf-a', 1), wf('wf-b', 3)];

/** The type's binding is mutable on purpose: 28.003 re-points it while the ticket is a draft. */
let boundTo = 'wf-a';
const deps: TicketStateDeps = {
  getTicketType: (id): TicketTypeDef | undefined =>
    id === 'task' ? { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: boundTo, fields: [] } : undefined,
  getWorkflow: (id) => WORKFLOWS.find((w) => w.id === id),
};

const created = (extra: Record<string, unknown> = {}) =>
  makeEnvelope({
    type: 'ticket.created',
    entity: { kind: 'ticket', id: TICKET },
    actorId: AUTHOR,
    serverTime: AT,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Plan the launch', ...extra },
  });
const on = (type: string, payload: unknown = {}) =>
  makeEnvelope({ type, entity: { kind: 'ticket', id: TICKET }, actorId: AUTHOR, payload });

const draftState = (): TicketState => applyTicketEvent(undefined, created({ start: 'backlog', draft: true }), deps);
const plainState = (): TicketState => applyTicketEvent(undefined, created({ start: 'backlog' }), deps);

describe('28.001 the draft member of ticket.created', () => {
  const base = { typeId: 'task', projectId: PROJECT, parentId: null, title: 't' };
  it('28.001 draft needs start backlog and no stateId; the v1 shapes still parse', () => {
    expect(ticketCreatedPayload.safeParse({ ...base, start: 'backlog', draft: true }).success).toBe(true);
    for (const bad of [
      { start: 'focus', draft: true },
      { draft: true },
      { start: 'backlog', stateId: 'doing', draft: true },
      { start: 'backlog', draft: false },
    ]) {
      expect(ticketCreatedPayload.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    const refused = ticketCreatedPayload.safeParse({ ...base, draft: true });
    expect(!refused.success && refused.error.issues[0]?.message).toBe(
      'a draft is born in the backlog: send start: "backlog" and no stateId',
    );
    // control: without `draft` nothing changed
    expect(ticketCreatedPayload.safeParse({ ...base, start: 'focus' }).success).toBe(true);
    expect(ticketCreatedPayload.safeParse({ ...base }).success).toBe(true);
  });
});

describe('28.002 ticket.published / ticket.discarded', () => {
  it('28.002 strict payloads; registered at v1 against ticket only; the door admits them on a ticket, not a note', () => {
    expect(ticketPublishedPayload.safeParse({ projectId: PROJECT }).success).toBe(true);
    expect(ticketPublishedPayload.safeParse({ projectId: 'GN' }).success).toBe(false);
    expect(ticketPublishedPayload.safeParse({ projectId: PROJECT, extra: 1 }).success).toBe(false);
    expect(ticketPublishedPayload.safeParse({}).success).toBe(false);
    expect(ticketDiscardedPayload.safeParse({}).success).toBe(true);
    expect(ticketDiscardedPayload.safeParse({ reason: 'x' }).success).toBe(false);
    const keys = domainRegistry.registrations().map((r) => `${r.type}@${r.version}`);
    for (const type of ['ticket.published', 'ticket.discarded']) {
      expect(domainRegistry.get(type, 1)?.entityKind).toBe('ticket');
      expect(keys.filter((k) => k === `${type}@1`)).toHaveLength(1);
    }
    const door = (type: string, payload: unknown, kind: 'ticket' | 'note') => {
      const { serverTime: _s, seq: _q, ...submitted } = makeEnvelope({ type, entity: { kind, id: TICKET }, payload });
      return parseEvent(submitted);
    };
    expect(door('ticket.published', { projectId: PROJECT }, 'ticket').ok).toBe(true); // control
    expect(door('ticket.discarded', {}, 'ticket').ok).toBe(true);
    const onNote = door('ticket.published', { projectId: PROJECT }, 'note');
    expect(!onNote.ok && onNote.code).toBe('entity-kind-mismatch');
    expect(door('ticket.discarded', {}, 'note').ok).toBe(false);
  });
});

describe('28.003 the reducer: drafted, then published', () => {
  it('28.003 draft = {authorId, at}; publish clears it and re-pins to the type binding in force NOW; control: a non-draft is unchanged', () => {
    boundTo = 'wf-a';
    const born = draftState();
    expect(born.draft).toEqual({ authorId: AUTHOR, at: AT });
    expect(born.stateId).toBe('backlog');
    expect(born.rank).toBeNull();
    expect(born.workflowId).toBe('wf-a');
    const plain = plainState();
    expect('draft' in plain).toBe(false); // control

    boundTo = 'wf-b'; // the type was re-pointed while the draft sat
    try {
      const published = applyTicketEvent(born, on('ticket.published', { projectId: PROJECT }), deps);
      expect('draft' in published).toBe(false);
      expect(published.workflowId).toBe('wf-b');
      expect(published.workflowVersion).toBe(3);
      expect(published.stateId).toBe('backlog');
      expect(published.stateCategory).toBe('open');
      expect(published.fields['title']?.value).toBe('Plan the launch');
      // control: the ticket that was never a draft stayed on the workflow it was created under
      expect(plain.workflowId).toBe('wf-a');
    } finally {
      boundTo = 'wf-a';
    }
  });
});

describe('28.004 discarded, and the arms that throw', () => {
  it('28.004 discard marks the flag and keeps who and when; publish and discard on a non-draft throw', () => {
    const born = draftState();
    expect(isDraft(born)).toBe(true);
    expect(isDiscardedDraft(born)).toBe(false); // control
    const gone = applyTicketEvent(born, on('ticket.discarded'), deps);
    expect(gone.draft).toEqual({ authorId: AUTHOR, at: AT, discarded: true });
    expect(isDraft(gone)).toBe(true);
    expect(isDiscardedDraft(gone)).toBe(true);
    const plain = plainState();
    expect(isDraft(plain)).toBe(false);
    expect(() => applyTicketEvent(plain, on('ticket.published', { projectId: PROJECT }), deps)).toThrow(
      new RegExp(`ticket.published for ticket ${TICKET} that is not a draft`),
    );
    expect(() => applyTicketEvent(plain, on('ticket.discarded'), deps)).toThrow(
      new RegExp(`ticket.discarded for ticket ${TICKET} that is not a draft`),
    );
  });
});

const onTicket = (r: EventTypeRegistration) =>
  r.entityKind === 'ticket' || (Array.isArray(r.entityKind) && r.entityKind.includes('ticket'));

/**
 * The refused side of the partition, written out. A NEW ticket-scoped type is in none of the three lists
 * and the census below reports it: the author decides which side it is on.
 */
const REFUSED: readonly string[] = [
  'ticket.transitioned',
  'ticket.collaborator_added',
  'ticket.collaborator_removed',
  'ticket.workflow_rebound',
  'ticket.closed',
  'ticket.reopened',
  'ticket.ranked',
  'ticket.deleted',
  'ticket.restored',
  'comment.added',
  'comment.edited',
  'comment.deleted',
  'visibility.set',
];

function unclassified(registrations: readonly EventTypeRegistration[]): string[] {
  const known = new Set<string>([...DRAFT_ALLOWED_EVENT_TYPES, ...DRAFT_GATE_EXEMPT_EVENT_TYPES, ...REFUSED]);
  return registrations.filter((r) => onTicket(r) && !known.has(r.type)).map((r) => r.type);
}

describe('28.007 the author allowlist', () => {
  it('28.007 eight allowed, bookkeeping exempt, the rest refused with a sentence that names the way out; the census partitions the registry', () => {
    expect([...DRAFT_ALLOWED_EVENT_TYPES].sort()).toEqual(
      [
        'attachment.added',
        'ticket.assigned',
        'ticket.discarded',
        'ticket.field_set',
        'ticket.link_added',
        'ticket.link_removed',
        'ticket.published',
        'ticket.reparented',
      ].sort(),
    );
    for (const type of DRAFT_ALLOWED_EVENT_TYPES) expect(draftAllows(type), type).toBe(true);
    for (const type of DRAFT_GATE_EXEMPT_EVENT_TYPES) expect(draftAllows(type), type).toBe(true);
    for (const type of REFUSED) {
      expect(draftAllows(type), type).toBe(false);
      expect(draftNotAllowedReason(type), type).toMatch(
        /^A draft cannot be .+\. Publish it first, or discard it\.$|^A draft cannot be deleted\. Discard it instead\.$/,
      );
    }
    expect(draftNotAllowedReason('ticket.deleted')).toBe('A draft cannot be deleted. Discard it instead.');
    expect(draftNotAllowedReason('ticket.closed')).toBe('A draft cannot be closed. Publish it first, or discard it.');
    expect(draftNotAllowedReason('comment.added')).toBe(
      'A draft cannot be commented on. Publish it first, or discard it.',
    );
    // the census: control first (a planted type is reported), then the registry itself
    const planted = {
      type: 'ticket.planted_for_census',
      version: 1,
      entityKind: 'ticket',
      payloadSchema: undefined as never,
    } as EventTypeRegistration;
    expect(unclassified([...domainRegistry.registrations(), planted])).toEqual(['ticket.planted_for_census']);
    expect(unclassified(domainRegistry.registrations())).toEqual([]);
    // the three lists are disjoint
    const all = [...DRAFT_ALLOWED_EVENT_TYPES, ...DRAFT_GATE_EXEMPT_EVENT_TYPES, ...REFUSED];
    expect(new Set(all).size).toBe(all.length);
  });
});

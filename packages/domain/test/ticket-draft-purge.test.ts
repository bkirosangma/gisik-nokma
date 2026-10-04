import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  builtinTicketTypeDefs,
  foldTicketEvent,
  isRedactedTicketCreated,
  isRedactedTicketPublished,
  makeEnvelope,
  newUlid,
  redactedTicketCreatedPayload,
  redactedTicketPublishedPayload,
  simpleKanbanWorkflowDef,
  type TicketStateDeps,
} from '../src/index.js';

/** Drafts T2, case 28.026 (`test-cases/28-drafts.md` §28.2): the redacted shapes of the numbering rows. */

const workflow = simpleKanbanWorkflowDef(newUlid());
const types = builtinTicketTypeDefs(workflow.id);
const deps: TicketStateDeps = {
  getTicketType: (id) => types.find((type) => type.id === id),
  getWorkflow: (id) => (id === workflow.id ? workflow : undefined),
};

describe('28.026 the redacted shapes of the numbering rows', () => {
  it('28.026 the payloads, the predicate, the named throw and the fold', () => {
    const P = newUlid();
    expect(redactedTicketCreatedPayload(P)).toEqual({ projectId: P, purged: true });
    expect(redactedTicketCreatedPayload(P, true)).toEqual({ projectId: P, purged: true, draft: true });
    expect(redactedTicketPublishedPayload(P)).toEqual({ projectId: P, purged: true });
    expect(isRedactedTicketPublished({ type: 'ticket.published', payload: redactedTicketPublishedPayload(P) })).toBe(true);
    expect(isRedactedTicketPublished({ type: 'ticket.published', payload: { projectId: P } })).toBe(false); // control
    expect(isRedactedTicketPublished({ type: 'ticket.published', payload: { projectId: P, purged: 'true' } })).toBe(false);
    expect(isRedactedTicketPublished({ type: 'ticket.published', payload: null })).toBe(false);
    expect(isRedactedTicketPublished({ type: 'ticket.created', payload: { purged: true } })).toBe(false);
    // a redacted DRAFT creation is still a redacted creation, so every existing reader skips it
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: redactedTicketCreatedPayload(P, true) })).toBe(true);
    const redacted = makeEnvelope({
      type: 'ticket.published',
      entity: { kind: 'ticket', id: newUlid() },
      payload: redactedTicketPublishedPayload(P),
    });
    expect(() => applyTicketEvent(undefined, redacted, deps)).toThrow(/ticket\.published .* purged \(redacted\) row/);
    expect(foldTicketEvent(undefined, redacted, deps)).toBeUndefined();
    // control: an ordinary draft folds, and an ordinary publish folds onto it
    const id = newUlid();
    const draft = makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id },
      payload: { typeId: 'task', projectId: P, parentId: null, title: 'd', start: 'backlog', draft: true },
    });
    const born = foldTicketEvent(undefined, draft, deps);
    expect(born?.draft?.authorId).toBeDefined();
    // the redacted publish of an existing ticket returns that ticket's state, untouched
    const sameId = makeEnvelope({ type: 'ticket.published', entity: { kind: 'ticket', id }, payload: redactedTicketPublishedPayload(P) });
    expect(foldTicketEvent(born, sameId, deps)).toBe(born);
    const done = foldTicketEvent(born, makeEnvelope({ type: 'ticket.published', entity: { kind: 'ticket', id }, payload: { projectId: P } }), deps);
    expect(done).toBeDefined();
    expect(done && 'draft' in done).toBe(false);
  });
});

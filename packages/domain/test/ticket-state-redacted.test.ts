import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  builtinTicketTypeDefs,
  foldTicketEvent,
  makeEnvelope,
  newUlid,
  redactedTicketCreatedPayload,
  simpleKanbanWorkflowDef,
  type TicketStateDeps,
} from '../src/index.js';

/** Trash series Plan 2, Task 3 — case 19.091 (`test-cases/19-trash.md` §19.11). */

const workflow = simpleKanbanWorkflowDef(newUlid());
const types = builtinTicketTypeDefs(workflow.id);
const deps: TicketStateDeps = {
  getTicketType: (id) => types.find((type) => type.id === id),
  getWorkflow: (id) => (id === workflow.id ? workflow : undefined),
};

describe('19.091 a redacted ticket.created produces no ticket', () => {
  it('applyTicketEvent names the purged row; foldTicketEvent returns the input state; an ordinary creation still folds', () => {
    const redacted = makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: newUlid() },
      payload: redactedTicketCreatedPayload(newUlid()),
    });
    expect(() => applyTicketEvent(undefined, redacted, deps)).toThrow(/purged \(redacted\) row/);
    expect(foldTicketEvent(undefined, redacted, deps)).toBeUndefined();

    // CONTROL — the same helper folds an ordinary creation.
    const ordinary = makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: newUlid() },
      payload: { typeId: 'task', projectId: newUlid(), parentId: null, title: 'Reconcile the till' },
    });
    expect(foldTicketEvent(undefined, ordinary, deps)?.fields['title']?.value).toBe('Reconcile the till');
  });
});

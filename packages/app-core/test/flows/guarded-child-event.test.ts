import { describe, expect, it } from 'vitest';
import type { IngestResult, SubmittedEvent, WorkflowDef } from '@gisik-nokma/domain';
import {
  UnansweredClaimError,
  reopenAndProceed,
  reopenStateOptions,
  submitChildEvent,
} from '../../src/flows/guarded-child-event.js';
import { makeSubmittedFactory } from '../../src/submit.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { PARENT, TICKET, WF_ERRAND, WS, submittedTicketCreated } from '../helpers/seed.js';

const make = makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });

/** The engine's own words, copied from `checks/hierarchy.ts`'s refusal shape. */
const PARENT_TERMINAL_REASON =
  'Parent "Registrations" is Done; it must reopen because it is acquiring live work.';

function parentTerminalRefusal(eventId: string): IngestResult {
  return {
    status: 'refused',
    eventId,
    rule: 'hierarchy.parent-terminal',
    reason: PARENT_TERMINAL_REASON,
  };
}

function committed(eventId: string): IngestResult {
  return { status: 'committed', eventId, seq: 9, serverTime: '2026-08-20T09:10:00.000Z' };
}

function refusedWith(eventId: string, rule: string, reason: string): IngestResult {
  return { status: 'refused', eventId, rule, reason };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('3.77 · 13.1 reopenStateOptions — structurally reachable, non-terminal only', () => {
  it('13.1a offers only non-terminal states with a declared transition from the current terminal state', () => {
    // From 'done', WF_ERRAND declares done→doing and the wildcard *→todo.
    expect(reopenStateOptions(WF_ERRAND, 'done').map((state) => state.id).sort()).toEqual([
      'doing',
      'todo',
    ]);
  });

  it('13.1b carries each state name, so no option renders as a bare id', () => {
    expect(reopenStateOptions(WF_ERRAND, 'done')).toEqual(
      expect.arrayContaining([
        { id: 'doing', name: 'Doing' },
        { id: 'todo', name: 'To do' },
      ]),
    );
  });

  it('13.1c never offers a terminal state, even when one is structurally reachable', () => {
    const twoTerminals: WorkflowDef = {
      ...WF_ERRAND,
      states: [...WF_ERRAND.states, { id: 'cancelled', name: 'Cancelled', category: 'terminal' }],
      transitions: [...WF_ERRAND.transitions, { from: 'done', to: 'cancelled', rules: [] }],
    };
    const offered = reopenStateOptions(twoTerminals, 'done').map((state) => state.id);
    expect(offered).not.toContain('cancelled');
    // Positive control, same run: the added edge really was reachable, so the
    // absence above is an exclusion and not an empty walk.
    expect(offered.sort()).toEqual(['doing', 'todo']);
  });

  it('13.1d does not offer a state the definition never declares an edge to', () => {
    // WF_ERRAND declares no edge done→waiting, and 'waiting' is non-terminal.
    expect(reopenStateOptions(WF_ERRAND, 'done').map((state) => state.id)).not.toContain('waiting');
  });

  it('13.1e a wildcard edge back into the current state is not an option (it moves nothing)', () => {
    const selfWildcard: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [{ from: '*', to: 'doing', rules: [] }, { from: 'doing', to: 'todo', rules: [] }],
    };
    expect(reopenStateOptions(selfWildcard, 'doing').map((state) => state.id)).toEqual(['todo']);
  });

  it('13.1f keeps a rule-bearing target on the list — the server, not this client, refuses it', () => {
    // done→doing in WF_ERRAND carries no rules, so build one that does: the
    // owner decision says the parent's own rules apply ON ATTEMPT.
    const guarded: WorkflowDef = {
      ...WF_ERRAND,
      transitions: [{ from: 'done', to: 'doing', rules: [{ kind: 'restrict-to', roles: ['owner'] }] }],
    };
    expect(reopenStateOptions(guarded, 'done')).toEqual([{ id: 'doing', name: 'Doing' }]);
  });
});

describe('3.77 · 13.2 submitChildEvent — one refusal is a remedy, the rest are refusals', () => {
  it('13.2a passes a committed child straight through', async () => {
    const source = createFakeDataSource();
    const outcome = await submitChildEvent(source, submittedTicketCreated());
    expect(outcome.kind).toBe('committed');
  });

  it('13.2b surfaces hierarchy.parent-terminal as needs-reopen, rule and reason intact', async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) => parentTerminalRefusal(event.id)),
    );
    const outcome = await submitChildEvent(source, submittedTicketCreated());
    expect(outcome).toEqual({
      kind: 'needs-reopen',
      refusal: { rule: 'hierarchy.parent-terminal', reason: PARENT_TERMINAL_REASON },
    });
  });

  it('13.2c reparent refusals take the same path — the rule is shared', async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) => parentTerminalRefusal(event.id)),
    );
    const reparent = make({
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.reparented',
      payload: { newParentId: PARENT },
    });
    expect((await submitChildEvent(source, reparent)).kind).toBe('needs-reopen');
  });

  it('13.2d any other refusal stays an ordinary refusal, reason verbatim', async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) =>
        refusedWith(event.id, 'hierarchy.rank', 'A task cannot sit under a sub-task.'),
      ),
    );
    expect(await submitChildEvent(source, submittedTicketCreated())).toEqual({
      kind: 'refused',
      refusal: { rule: 'hierarchy.rank', reason: 'A task cannot sit under a sub-task.' },
    });
  });

  it('13.2e an invalid answer is neither committed nor a refusal, and keeps the door code', async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) => ({
        status: 'invalid' as const,
        eventId: event.id,
        code: 'duplicate-event-id' as const,
        message: 'This event id has already been recorded.',
      })),
    );
    const outcome = await submitChildEvent(source, submittedTicketCreated());
    expect(outcome.kind).toBe('invalid');
    if (outcome.kind === 'invalid') {
      expect(outcome.result).toMatchObject({
        code: 'duplicate-event-id',
        message: 'This event id has already been recorded.',
      });
    }
  });

  it('13.2f a one-claim batch answered with nothing is UNKNOWN, never a silent commit', async () => {
    const source = createFakeDataSource({}, () => []);
    await expect(submitChildEvent(source, submittedTicketCreated())).rejects.toThrow(
      UnansweredClaimError,
    );
  });
});

describe('3.78 · 13.3 reopenAndProceed — parent first, cause attached, refusals surfaced', () => {
  const childEvent = submittedTicketCreated();
  const childTicketId = childEvent.entity.id;
  const plan = {
    parent: { ticketId: PARENT, workspaceId: WS },
    toStateId: 'doing',
    childTicketId,
    childEvent,
  };

  it('13.3a ingests the parent transition (with cause, wire spelling) before the child, then commits both', async () => {
    const source = createFakeDataSource();
    const outcome = await reopenAndProceed(source, plan, make);
    expect(outcome.kind).toBe('committed');
    expect(source.ingested).toHaveLength(2);
    const [firstBatch, secondBatch] = source.ingested;
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch?.[0]?.type).toBe('ticket.transitioned');
    expect(firstBatch?.[0]?.entity).toEqual({ kind: 'ticket', id: PARENT });
    // `to`, not `toStateId`: ticketTransitionedPayloadSchema is the authority.
    expect(firstBatch?.[0]?.payload).toEqual({
      to: 'doing',
      cause: { kind: 'reopened-for-child', childTicketId },
    });
    // The child's ENTITY id, never the event id — the two are different ULIDs here.
    expect(childTicketId).not.toBe(childEvent.id);
    expect(secondBatch?.[0]).toBe(childEvent); // the SAME claim, retried after the remedy
  });

  it('13.3b the parent claim is a real envelope: this actor, this workspace, no server fields', async () => {
    const source = createFakeDataSource();
    await reopenAndProceed(source, plan, make);
    const parent = source.ingested[0]?.[0] as SubmittedEvent;
    expect(parent.actorId).toBe('user_kiro');
    expect(parent.origin).toBe('web');
    expect(parent.workspaceId).toBe(WS);
    expect(parent).not.toHaveProperty('seq');
    expect(parent).not.toHaveProperty('serverTime');
  });

  it('13.3c SEQUENCING: the child is not sent while the parent answer is still outstanding', async () => {
    const gate = deferred<IngestResult[]>();
    const source = createFakeDataSource({}, (events) =>
      events[0]?.type === 'ticket.transitioned'
        ? gate.promise
        : events.map((event) => committed(event.id)),
    );
    const running = reopenAndProceed(source, plan, make);
    // Flush several microtask turns: anything that issued both claims together
    // has already pushed both batches by now.
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();

    expect(source.ingested).toHaveLength(1);
    expect(source.ingested[0]?.[0]?.type).toBe('ticket.transitioned');

    gate.resolve([committed(source.ingested[0]?.[0]?.id ?? '')]);
    expect((await running).kind).toBe('committed');
    expect(source.ingested).toHaveLength(2);
    expect(source.ingested[1]?.[0]).toBe(childEvent);
  });

  it("13.3d the parent's own transition rules still apply — its refusal surfaces and the child is never sent", async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) =>
        refusedWith(event.id, 'restrict-to', 'Only Anselma Marak may move this out of Done.'),
      ),
    );
    const outcome = await reopenAndProceed(source, plan, make);
    expect(outcome).toEqual({
      kind: 'parent-refused',
      refusal: { rule: 'restrict-to', reason: 'Only Anselma Marak may move this out of Done.' },
    });
    expect(source.ingested).toHaveLength(1); // the child claim was never submitted
    expect(source.ingested[0]?.[0]?.type).toBe('ticket.transitioned');
  });

  it('13.3e a require-comment refusal on the reopen is honoured the same way — no rule is privileged', async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) =>
        refusedWith(event.id, 'require-comment', 'This move needs a comment saying why.'),
      ),
    );
    const outcome = await reopenAndProceed(source, plan, make);
    expect(outcome.kind).toBe('parent-refused');
    expect(source.ingested).toHaveLength(1);
  });

  it('13.3f an INVALID parent answer also stops the child — invalid is not acceptance', async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) => ({
        status: 'invalid' as const,
        eventId: event.id,
        code: 'unknown-event-type' as const,
        message: 'No such event type in this vocabulary.',
      })),
    );
    expect((await reopenAndProceed(source, plan, make)).kind).toBe('invalid');
    expect(source.ingested).toHaveLength(1);
  });

  it('13.3g a child refusal after the reopen keeps the reopen standing and reports both truths', async () => {
    let call = 0;
    const source = createFakeDataSource({}, (events) => {
      call += 1;
      if (call === 1) return events.map((event) => committed(event.id));
      return events.map((event) =>
        refusedWith(event.id, 'hierarchy.rank', 'A task cannot sit under a sub-task.'),
      );
    });
    const outcome = await reopenAndProceed(source, plan, make);
    expect(outcome.kind).toBe('child-refused-after-reopen');
    if (outcome.kind === 'child-refused-after-reopen') {
      // recorded history — nothing rolled back, nothing hidden
      expect(outcome.parentResult.status).toBe('committed');
      expect(outcome.refusal).toEqual({
        rule: 'hierarchy.rank',
        reason: 'A task cannot sit under a sub-task.',
      });
    }
    // Two claims went out and NO third: nothing compensates the reopen away.
    expect(source.ingested).toHaveLength(2);
  });
});

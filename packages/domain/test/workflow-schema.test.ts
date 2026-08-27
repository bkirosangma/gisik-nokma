import { describe, expect, it } from 'vitest';
import { newUlid } from '../src/ids.js';
import { parseEvent } from '../src/index.js';
import {
  foldStateIdForward,
  hasStateMapping,
  ruleSchema,
  ticketTransitionedPayloadSchema,
  workflowDefSchema,
  workflowDefinedPayloadSchema,
  workflowStateSchema,
} from '../src/workflow.js';

const validDef = {
  id: 'wf_basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
  ],
};

describe('workflowDefSchema', () => {
  it('accepts a well-formed definition', () => {
    expect(workflowDefSchema.safeParse(validDef).success).toBe(true);
  });

  it('refuses a state with an invented category', () => {
    const bad = { ...validDef, states: [{ id: 's', name: 'S', category: 'paused' }] };
    expect(workflowDefSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses a version below 1', () => {
    expect(workflowDefSchema.safeParse({ ...validDef, version: 0 }).success).toBe(false);
  });
});

describe('workflowStateSchema — amendment 9', () => {
  it('carries the blocked flag through the parse instead of stripping it', () => {
    // .success alone cannot see this: a schema without the field parses the
    // same input just as happily and silently drops the flag, which is exactly
    // how the attention strip's "blocked" bucket would end up always empty.
    const parsed = workflowStateSchema.parse({
      id: 'blocked',
      name: 'Blocked',
      category: 'active',
      blocked: true,
    });
    expect(parsed).toEqual({ id: 'blocked', name: 'Blocked', category: 'active', blocked: true });
  });

  it('refuses a non-boolean blocked flag', () => {
    expect(
      workflowStateSchema.safeParse({ id: 'b', name: 'B', category: 'active', blocked: 'yes' })
        .success,
    ).toBe(false);
  });
});

describe('ruleSchema', () => {
  it('accepts each member of the closed vocabulary', () => {
    const rules = [
      { kind: 'restrict-to', assignee: true, roles: ['admin'], userIds: ['user_a'] },
      { kind: 'require-comment' },
      { kind: 'require-evidence' },
      { kind: 'require-field', field: 'due_date' },
      { kind: 'require-different-user', thanActorOf: { to: 'review' } },
    ];
    for (const rule of rules) {
      expect(ruleSchema.safeParse(rule).success).toBe(true);
    }
  });

  it('refuses a kind outside the vocabulary — the vocabulary is closed', () => {
    expect(ruleSchema.safeParse({ kind: 'run-webhook', url: 'https://x' }).success).toBe(false);
  });

  it('refuses require-field without a field name', () => {
    expect(ruleSchema.safeParse({ kind: 'require-field' }).success).toBe(false);
  });
});

describe('workflowDefinedPayloadSchema', () => {
  it('accepts a definition with a stateMapping', () => {
    const payload = { ...validDef, version: 2, stateMapping: { doing: 'todo' } };
    expect(workflowDefinedPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts a definition without a stateMapping', () => {
    expect(workflowDefinedPayloadSchema.safeParse(validDef).success).toBe(true);
  });

  it('keeps the stateMapping in the parsed payload — it is what gets stored and served', () => {
    // The plain WorkflowDef schema also reports success on this input and
    // returns it without the mapping; only reading the output can tell the two
    // apart, and a dropped mapping is a ticket stranded at the next publish.
    const parsed = workflowDefinedPayloadSchema.parse({
      ...validDef,
      version: 2,
      stateMapping: { doing: 'todo' },
    });
    expect(parsed.stateMapping).toEqual({ doing: 'todo' });
    expect(hasStateMapping(parsed)).toBe(true);
    expect(hasStateMapping(workflowDefSchema.parse(validDef))).toBe(false);
  });
});

describe('ticketTransitionedPayloadSchema', () => {
  it('requires the target state', () => {
    expect(ticketTransitionedPayloadSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a move with comment and evidence', () => {
    const payload = { to: 'done', comment: { text: 'Shipped.' }, evidenceAttachmentId: 'att_1' };
    expect(ticketTransitionedPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

describe('foldStateIdForward — the one version walk', () => {
  const v1 = workflowDefSchema.parse(validDef);
  const v2 = workflowDefinedPayloadSchema.parse({
    ...validDef,
    version: 2,
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [{ from: 'todo', to: 'done', rules: [] }],
    stateMapping: { doing: 'todo' },
  });
  const v3 = workflowDefinedPayloadSchema.parse({
    ...validDef,
    version: 3,
    states: [
      { id: 'queued', name: 'Queued', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [{ from: 'queued', to: 'done', rules: [] }],
    stateMapping: { todo: 'queued' },
  });
  const chain = new Map([
    [1, v1],
    [2, v2],
  ]);
  const intermediate = (version: number): typeof v1 | null => chain.get(version) ?? null;

  it('leaves a state the later versions still have exactly where it is', () => {
    expect(foldStateIdForward('done', 1, v2, intermediate)).toEqual({ ok: true, stateId: 'done' });
  });

  it('follows one mapping', () => {
    expect(foldStateIdForward('doing', 1, v2, intermediate)).toEqual({ ok: true, stateId: 'todo' });
  });

  it('follows mappings through every intermediate version, not just the last', () => {
    // doing → todo (v2) → queued (v3): the intermediate hop is where a walk
    // that only consulted the newest definition would silently lose the ticket.
    expect(foldStateIdForward('doing', 1, v3, intermediate)).toEqual({ ok: true, stateId: 'queued' });
  });

  it('reports the id at the point the chain broke, not the one it started from', () => {
    const orphan = workflowDefinedPayloadSchema.parse({
      ...validDef,
      version: 3,
      states: [{ id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [],
    });
    expect(foldStateIdForward('doing', 1, orphan, intermediate)).toEqual({
      ok: false,
      unmappedStateId: 'todo',
    });
  });

  it('a state the latest version no longer has is unmapped even with no versions to walk', () => {
    const dropped = workflowDefSchema.parse({
      ...validDef,
      states: [{ id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [],
    });
    expect(foldStateIdForward('todo', 1, dropped, intermediate)).toEqual({
      ok: false,
      unmappedStateId: 'todo',
    });
  });

  it('stops at a version the caller cannot supply rather than skipping over it', () => {
    // intermediate() answers null for version 2 here. Skipping the gap and
    // carrying on would land this ticket in "queued" via v3's mapping — an
    // answer arrived at by never reading the version that may well have moved
    // it somewhere else first. A fold nobody can justify is not a fold.
    expect(foldStateIdForward('todo', 1, v3, () => null)).toEqual({
      ok: false,
      unmappedStateId: 'todo',
    });
  });
});

describe('workflow.defined registration', () => {
  function rawWorkflowDefined(): Record<string, unknown> {
    const workflowId = newUlid();
    return {
      id: newUlid(),
      workspaceId: newUlid(),
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      version: 1,
      payload: { ...validDef, id: workflowId },
      actorId: newUlid(),
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    };
  }

  it('parseEvent accepts a workflow.defined envelope', () => {
    expect(parseEvent(rawWorkflowDefined()).ok).toBe(true);
  });

  it('planted defect: an unregistered workflow type is still refused', () => {
    // The positive case above passes just as well against a registry that
    // admits everything; this is the half that proves registration is what
    // opened the door.
    const result = parseEvent({ ...rawWorkflowDefined(), type: 'workflow.undefined' });
    expect(result).toMatchObject({ ok: false, code: 'unknown-event-type' });
  });

  it('planted defect: a workflow.defined payload missing its states is refused', () => {
    const raw = rawWorkflowDefined();
    const payload = { ...(raw['payload'] as Record<string, unknown>) };
    delete payload['states'];
    const result = parseEvent({ ...raw, payload });
    expect(result).toMatchObject({ ok: false, code: 'invalid-payload' });
  });
});

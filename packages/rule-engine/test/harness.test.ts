import { describe, expect, it } from 'vitest';
import {
  assertFixtureOutcome,
  buildInMemoryContext,
  completeCandidate,
  fixtureSchema,
  type Fixture,
} from '../src/fixtures/harness.js';

const wfBasic = {
  id: 'wf_basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' as const },
    { id: 'doing', name: 'Doing', category: 'active' as const },
    { id: 'done', name: 'Done', category: 'terminal' as const },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
    { from: 'done', to: 'doing', rules: [] },
  ],
};

function fixture(partial: Partial<Fixture>): Fixture {
  return fixtureSchema.parse({
    name: 'test fixture',
    workflowDefs: [wfBasic],
    memberships: [],
    priorEvents: [],
    candidateEvent: {
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 't1' },
      actorId: 'user_a',
      payload: { to: 'doing' },
    },
    expected: { refused: false },
    ...partial,
  });
}

describe('buildInMemoryContext', () => {
  it('folds prior events into ticket state: created, transitioned, assigned, field_set', async () => {
    const fx = fixture({
      priorEvents: [
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic' } },
        { type: 'ticket.transitioned', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_b', payload: { to: 'doing' } },
        { type: 'ticket.assigned', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { assigneeId: 'user_b' } },
        { type: 'ticket.field_set', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { field: 'due_date', value: '2026-09-01' } },
      ],
    });
    const ctx = buildInMemoryContext(fx);
    const ticket = await ctx.getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.stateId).toBe('doing');
    expect(ticket.stateCategory).toBe('active');
    expect(ticket.assigneeId).toBe('user_b');
    expect(ticket.fields).toEqual({
      due_date: {
        value: '2026-09-01',
        actorId: 'user_a',
        clientTime: '2026-08-20T00:00:00.000Z',
        serverTime: '2026-08-20T00:00:00.000Z',
      },
    });
    expect(ticket.transitions).toEqual([
      { toStateId: 'doing', actorId: 'user_b', seq: 2, workflowId: 'wf_basic', workflowVersion: 1 },
    ]);
  });

  it("a created ticket starts in its workflow's initialStateId", async () => {
    const fx = fixture({
      priorEvents: [
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic' } },
      ],
    });
    const ticket = await buildInMemoryContext(fx).getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.stateId).toBe(wfBasic.initialStateId);
    expect(ticket.stateCategory).toBe('open');
  });

  it('children are found by parentId', async () => {
    const fx = fixture({
      priorEvents: [
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic' } },
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't2' }, actorId: 'user_a', payload: { workflowId: 'wf_basic', parentId: 't1' } },
      ],
    });
    const children = await buildInMemoryContext(fx).getChildrenStates('t1');
    expect(children.map((child) => child.id)).toEqual(['t2']);
  });

  it('memberships resolve by the ws_1:user convention', async () => {
    const fx = fixture({ memberships: [{ userId: 'user_a', role: 'admin' }] });
    const membership = await buildInMemoryContext(fx).getEntityState('membership', 'ws_1:user_a');
    if (membership === null || membership.kind !== 'membership') throw new Error('expected a membership');
    expect(membership.role).toBe('admin');
  });

  it('getWorkflowDef returns the latest version by default and exact versions on request', async () => {
    const v2 = { ...wfBasic, version: 2, name: 'Basic v2' };
    const fx = fixture({ workflowDefs: [wfBasic, v2] });
    const ctx = buildInMemoryContext(fx);
    expect((await ctx.getWorkflowDef('wf_basic'))?.version).toBe(2);
    expect((await ctx.getWorkflowDef('wf_basic', 1))?.name).toBe('Basic');
    expect(await ctx.getWorkflowDef('wf_ghost')).toBeNull();
  });

  // Coordination doc §6: a fixture whose pairs all coincide cannot see a
  // transposition. The default envelope ids are pairwise distinct (ws_1 /
  // user_a / t1 / fx_evt_N), but the two clocks and the two version numbers
  // coincide under the defaults — so the two tests below plant values that
  // pull each pair apart.
  it('a field claim keeps the actor and the two clocks apart', async () => {
    const fx = fixture({
      priorEvents: [
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic' } },
        {
          type: 'ticket.field_set',
          entity: { kind: 'ticket', id: 't1' },
          actorId: 'user_b',
          payload: { field: 'due_date', value: '2026-09-01' },
          clientTime: '2026-08-20T01:00:00.000Z',
          serverTime: '2026-08-20T02:00:00.000Z',
        },
      ],
    });
    const ticket = await buildInMemoryContext(fx).getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.fields['due_date']).toEqual({
      value: '2026-09-01',
      actorId: 'user_b',
      clientTime: '2026-08-20T01:00:00.000Z',
      serverTime: '2026-08-20T02:00:00.000Z',
    });
  });

  it('a rebind moves the pinned workflow, version and state, and appends no log entry', async () => {
    const wfOther = {
      id: 'wf_other',
      version: 5,
      name: 'Other',
      initialStateId: 'new',
      states: [
        { id: 'new', name: 'New', category: 'open' as const },
        { id: 'in_review', name: 'In review', category: 'active' as const },
      ],
      transitions: [{ from: 'new', to: 'in_review', rules: [] }],
    };
    const fx = fixture({
      workflowDefs: [wfBasic, { ...wfBasic, version: 2 }, { ...wfBasic, version: 3 }, wfOther],
      priorEvents: [
        // Pinned at 2 while the latest wf_basic is 3 and the envelope's own
        // `version` is 1 — three distinct numbers, so a transposition among
        // them is visible rather than silently right.
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { workflowId: 'wf_basic', workflowVersion: 2 } },
        { type: 'ticket.transitioned', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_b', payload: { to: 'doing' } },
        { type: 'ticket.workflow_rebound', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { toWorkflowId: 'wf_other', toStateId: 'in_review' } },
      ],
    });
    const ticket = await buildInMemoryContext(fx).getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.workflowId).toBe('wf_other');
    expect(ticket.workflowVersion).toBe(5);
    expect(ticket.stateId).toBe('in_review');
    expect(ticket.stateCategory).toBe('active');
    // A migration is not a transition: the log gains nothing, and the entry
    // already in it keeps the vocabulary it was written in (wf_basic@2).
    expect(ticket.transitions).toEqual([
      { toStateId: 'doing', actorId: 'user_b', seq: 2, workflowId: 'wf_basic', workflowVersion: 2 },
    ]);
  });

  it('a prior event of any other type is a fixture-authoring error', () => {
    const fx = fixture({
      priorEvents: [{ type: 'comment.added', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: {} }],
    });
    expect(() => buildInMemoryContext(fx)).toThrow(/prior events may only be/);
  });
});

describe('completeCandidate', () => {
  it('fills deterministic defaults', () => {
    const env = completeCandidate(fixture({}));
    expect(env).toEqual({
      id: 'fx_evt_1',
      workspaceId: 'ws_1',
      entity: { kind: 'ticket', id: 't1' },
      type: 'ticket.transitioned',
      version: 1,
      payload: { to: 'doing' },
      actorId: 'user_a',
      origin: 'server',
      clientTime: '2026-08-20T00:00:00.000Z',
      serverTime: '2026-08-20T00:00:00.000Z',
      seq: 1,
    });
  });
});

describe('assertFixtureOutcome', () => {
  it('accepts what was expected and names what was not', () => {
    const accepting = fixture({});
    expect(() => assertFixtureOutcome({ refused: false }, accepting)).not.toThrow();
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'require-comment', reason: 'x' }, accepting),
    ).toThrow(/expected acceptance/);

    const refusing = fixture({
      expected: { refused: true, rule: 'require-comment', reason: 'This move must carry a comment explaining it, and none was provided.' },
    });
    expect(() =>
      assertFixtureOutcome(
        { refused: true, rule: 'require-comment', reason: 'This move must carry a comment explaining it, and none was provided.' },
        refusing,
      ),
    ).not.toThrow();
    expect(() => assertFixtureOutcome({ refused: false }, refusing)).toThrow(/expected refusal/);
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'require-comment', reason: 'wrong words' }, refusing),
    ).toThrow(/reason mismatch/);

    const prefix = fixture({
      expected: { refused: true, rule: 'malformed-payload', reasonStartsWith: 'This ticket.transitioned event' },
    });
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'malformed-payload', reason: 'This ticket.transitioned event is broken' }, prefix),
    ).not.toThrow();
  });

  // The three assertions above leave three mutants of assertFixtureOutcome alive:
  // deleting the rule-id comparison, deleting/negating the startsWith check, and
  // never exercising the rule-only branch at all. A runner that cannot fail on a
  // wrong outcome is the mocked-contract defect this whole suite exists to
  // prevent, so each surviving mutant gets its own killer below.
  it('names a refusal that fired under the wrong rule', () => {
    const refusing = fixture({
      expected: { refused: true, rule: 'require-comment', reason: 'This move must carry a comment explaining it, and none was provided.' },
    });
    expect(() =>
      assertFixtureOutcome(
        { refused: true, rule: 'require-evidence', reason: 'This move must carry a comment explaining it, and none was provided.' },
        refusing,
      ),
    ).toThrow(/expected rule "require-comment", got "require-evidence"/);
  });

  it('rejects a reason that does not start with the expected prefix', () => {
    const prefix = fixture({
      expected: { refused: true, rule: 'malformed-payload', reasonStartsWith: 'This ticket.transitioned event' },
    });
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'malformed-payload', reason: 'Some other sentence entirely' }, prefix),
    ).toThrow(/does not start with/);
    // A prefix match must be anchored at the start, not merely contained.
    expect(() =>
      assertFixtureOutcome(
        { refused: true, rule: 'malformed-payload', reason: 'Prelude: This ticket.transitioned event is broken' },
        prefix,
      ),
    ).toThrow(/does not start with/);
  });

  it('a rule-only fixture leaves the wording to the owning plan but still pins the rule', () => {
    const ruleOnly = fixture({ expected: { refused: true, rule: 'require-comment' } });
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'require-comment', reason: 'any wording the owning plan chooses' }, ruleOnly),
    ).not.toThrow();
    expect(() =>
      assertFixtureOutcome({ refused: true, rule: 'require-evidence', reason: 'any wording the owning plan chooses' }, ruleOnly),
    ).toThrow(/expected rule "require-comment"/);
    expect(() => assertFixtureOutcome({ refused: false }, ruleOnly)).toThrow(/expected refusal/);
  });
});

// A misspelled key that parses clean is the silent-typo class this series has
// now refused three times. Left lenient, `reasonStartWith` / `resaon` /
// `reason: 123` all fall through to the rule-only branch and quietly retire the
// character-for-character reason check, and `paylod` yields `payload:
// undefined` — which from Task 5 on looks exactly like a real planted defect.
//
// `loadFixtures` is the door these die at, but it reads the real `fixtures/`
// directory and takes no directory argument, so a malformed witness cannot be
// committed as a file: it would red the entire runner. These tests therefore
// drive the schema `loadFixtures` parses with, and render the detail string
// exactly as `loadFixtures` interpolates it, so the assertion lands on the
// sentence a fixture author would actually be shown.
function malformedDetail(raw: unknown): string {
  const parsed = fixtureSchema.safeParse(raw);
  if (parsed.success) {
    throw new Error('expected this fixture to be refused at load, but it parsed clean');
  }
  return parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

describe('a typo in a fixture refuses at load rather than downgrading the discipline', () => {
  const wellFormed = {
    name: 'well formed',
    workflowDefs: [wfBasic],
    memberships: [],
    priorEvents: [],
    candidateEvent: {
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 't1' },
      actorId: 'user_a',
      payload: { to: 'doing' },
    },
    expected: { refused: true, rule: 'require-comment', reason: 'This move must carry a comment explaining it, and none was provided.' },
  };

  it('the well-formed original parses — the planted defects below differ from it by one key', () => {
    expect(fixtureSchema.safeParse(wellFormed).success).toBe(true);
  });

  it('a misspelled reasonStartsWith cannot fall through to the rule-only branch', () => {
    expect(
      malformedDetail({ ...wellFormed, expected: { refused: true, rule: 'require-comment', reasonStartWith: 'This move' } }),
    ).toBe("expected: Unrecognized key(s) in object: 'reasonStartWith'");
  });

  it('a misspelled reason cannot fall through to the rule-only branch', () => {
    expect(
      malformedDetail({ ...wellFormed, expected: { refused: true, rule: 'require-comment', resaon: 'This move' } }),
    ).toBe("expected: Unrecognized key(s) in object: 'resaon'");
  });

  it('a wrong-typed reason cannot fall through to the rule-only branch', () => {
    expect(
      malformedDetail({ ...wellFormed, expected: { refused: true, rule: 'require-comment', reason: 123 } }),
    ).toBe("expected: Unrecognized key(s) in object: 'reason'");
  });

  it('a misspelled payload key refuses instead of arriving as an undefined payload', () => {
    expect(
      malformedDetail({
        ...wellFormed,
        candidateEvent: {
          type: 'ticket.transitioned',
          entity: { kind: 'ticket', id: 't1' },
          actorId: 'user_a',
          paylod: { to: 'doing' },
        },
      }),
    ).toBe("candidateEvent: Unrecognized key(s) in object: 'paylod'");
  });

  // The three rows above all die on the rule-only branch's strictness. These
  // three make the OTHER branches' strictness load-bearing too: each is a key
  // the author wrote on purpose that a lenient branch would silently drop,
  // taking the author's intent with it.
  it('a stray reason on an accepting fixture refuses rather than being dropped', () => {
    expect(malformedDetail({ ...wellFormed, expected: { refused: false, reason: 'this fixture accepts, so why is there a reason?' } })).toBe(
      "expected: Unrecognized key(s) in object: 'reason'",
    );
  });

  it('a fixture demanding both an exact reason and a prefix refuses rather than silently picking one', () => {
    expect(
      malformedDetail({
        ...wellFormed,
        expected: { refused: true, rule: 'require-comment', reason: 'the exact sentence', reasonStartsWith: 'the exact' },
      }),
    ).toBe("expected: Unrecognized key(s) in object: 'reasonStartsWith'");
  });

  it('a stray key beside a prefix expectation refuses rather than being dropped', () => {
    expect(
      malformedDetail({
        ...wellFormed,
        expected: { refused: true, rule: 'malformed-payload', reasonStartsWith: 'This ticket.transitioned event', note: 'see plan 5' },
      }),
    ).toBe("expected: Unrecognized key(s) in object: 'note'");
  });

  it('all four legitimate expected shapes still parse (backward-compat pin)', () => {
    const shapes = [
      { refused: false },
      { refused: true, rule: 'require-comment', reason: 'This move must carry a comment explaining it, and none was provided.' },
      { refused: true, rule: 'malformed-payload', reasonStartsWith: 'This ticket.transitioned event' },
      // The rule-only branch — the one strictness had to preserve while
      // closing the typo hole that hid behind it.
      { refused: true, rule: 'require-comment' },
    ];
    for (const expected of shapes) {
      expect(fixtureSchema.safeParse({ ...wellFormed, expected }).success).toBe(true);
    }
  });
});

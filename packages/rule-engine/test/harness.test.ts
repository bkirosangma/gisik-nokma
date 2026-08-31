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
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: 'Fixture ticket t1', workflowId: 'wf_basic' } },
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
    // The title is a field CLAIM on creation, exactly as `applyTicketEvent`
    // records it — not a column, and not absent. `toEqual` over the whole map
    // rather than one key is what makes that assertable: a fold that dropped
    // the title, or one that recorded it under a different claimant or clock,
    // fails here rather than surfacing later as a refusal quoting a raw ticket
    // id where a title belongs.
    expect(ticket.fields).toEqual({
      title: {
        value: 'Fixture ticket t1',
        actorId: 'user_a',
        clientTime: '2026-08-20T00:00:00.000Z',
        serverTime: '2026-08-20T00:00:00.000Z',
      },
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
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: 'Fixture ticket t1', workflowId: 'wf_basic' } },
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
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: 'Fixture ticket t1', workflowId: 'wf_basic' } },
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't2' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', title: 'Fixture ticket t2', workflowId: 'wf_basic', parentId: 't1' } },
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
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: 'Fixture ticket t1', workflowId: 'wf_basic' } },
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
        { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: 'Fixture ticket t1', workflowId: 'wf_basic', workflowVersion: 2 } },
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

  // TWO issues now, and the second is the point of the presence fix: strictness
  // catches the typo, and `payload`'s own refine catches what the typo LEFT
  // BEHIND — an event with no claim at all. Before the refine, `z.unknown()`
  // admitted the missing key, so a fixture whose payload key was misspelled in
  // a way `.strict()` could not see (a prior event assembled in code, say) got
  // an undefined payload and a malformed-payload refusal indistinguishable from
  // a real planted defect. The two answers are deliberately the same sentence
  // the domain envelope gives (`envelope.ts`'s `requiredPayload`).
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
    ).toBe(
      "candidateEvent.payload: is required — an event with no payload is not a claim; candidateEvent: Unrecognized key(s) in object: 'paylod'",
    );
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

  // Round 2 of the closure: the same class one level out. A top-level typo is
  // the worst of the family, because three of the fixture's fields carry a
  // `.default()` — `memberhips` is not an error, it is a silent `[]`, and the
  // fixture goes on proving whatever survived the misspelling.
  it('a misspelled top-level key refuses instead of falling back to its default', () => {
    expect(malformedDetail({ ...wellFormed, memberhips: [{ userId: 'user_a', role: 'admin' }] })).toBe(
      ": Unrecognized key(s) in object: 'memberhips'",
    );
  });

  it('a singular priorEvent refuses instead of silently defaulting to no history', () => {
    expect(
      malformedDetail({
        ...wellFormed,
        priorEvent: [{ type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, payload: { workflowId: 'wf_basic' } }],
      }),
    ).toBe(": Unrecognized key(s) in object: 'priorEvent'");
  });

  it('a stray key on the candidate entity refuses', () => {
    expect(
      malformedDetail({
        ...wellFormed,
        candidateEvent: {
          type: 'ticket.transitioned',
          entity: { kind: 'ticket', id: 't1', label: 'the ticket' },
          actorId: 'user_a',
          payload: { to: 'doing' },
        },
      }),
    ).toBe("candidateEvent.entity: Unrecognized key(s) in object: 'label'");
  });

  it('a misspelled entity kind names both the missing key and the typo', () => {
    expect(
      malformedDetail({
        ...wellFormed,
        candidateEvent: {
          type: 'ticket.transitioned',
          entity: { kidn: 'ticket', id: 't1' },
          actorId: 'user_a',
          payload: { to: 'doing' },
        },
      }),
    ).toBe("candidateEvent.entity.kind: Required; candidateEvent.entity: Unrecognized key(s) in object: 'kidn'");
  });

  it('a stray key on a prior event entity refuses, and the path names which event', () => {
    expect(
      malformedDetail({
        ...wellFormed,
        priorEvents: [
          {
            type: 'ticket.created',
            entity: { kind: 'ticket', id: 't1', label: 'the ticket' },
            actorId: 'user_a',
            payload: { workflowId: 'wf_basic' },
          },
        ],
      }),
    ).toBe("priorEvents.0.entity: Unrecognized key(s) in object: 'label'");
  });

  it('a stray key on a membership refuses', () => {
    expect(malformedDetail({ ...wellFormed, memberships: [{ userId: 'user_a', role: 'admin', name: 'A' }] })).toBe(
      "memberships.0: Unrecognized key(s) in object: 'name'",
    );
  });

  // 4.51 — the annotation field. JSON has no comments, and a fixture whose
  // SHAPE carries meaning beyond the outcome it asserts (the wf_rules
  // definition's deliberately-uncovered wildcard edge) had nowhere to say so.
  // A note nested inside the def would have been stripped in silence by
  // workflowDefinedPayloadSchema's non-strict parse, so it lives at the top
  // level, where strictness applies and a typo dies like any other.
  it('4.51 notes is prose the loader keeps, and a misspelled note still refuses', () => {
    const annotated = fixtureSchema.safeParse({ ...wellFormed, notes: 'why this shape matters' });
    expect(annotated.success ? annotated.data.notes : null).toBe('why this shape matters');
    expect(malformedDetail({ ...wellFormed, note: 'why this shape matters' })).toBe(
      ": Unrecognized key(s) in object: 'note'",
    );
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

  it('every legitimate optional field still parses under strictness (backward-compat pin)', () => {
    // Everything a fixture author is entitled to write: the omitted-defaults
    // form, a fully-populated envelope on both the candidate and a prior event,
    // and a membership. If strictness ever over-reaches, this is what notices.
    expect(fixtureSchema.safeParse({ name: 'defaults omitted', candidateEvent: wellFormed.candidateEvent, expected: { refused: false } }).success).toBe(true);
    expect(
      fixtureSchema.safeParse({
        ...wellFormed,
        memberships: [{ userId: 'user_a', role: 'admin' }],
        priorEvents: [
          {
            id: 'evt_custom',
            workspaceId: 'ws_1',
            entity: { kind: 'ticket', id: 't1' },
            type: 'ticket.created',
            version: 1,
            payload: { workflowId: 'wf_basic' },
            actorId: 'user_a',
            origin: 'web',
            clientTime: '2026-08-20T01:00:00.000Z',
            serverTime: '2026-08-20T02:00:00.000Z',
            seq: 1,
          },
        ],
      }).success,
    ).toBe(true);
  });
});

/**
 * Ruling P10, and the discriminator it turns on: **a harness schema may diverge
 * from its domain twin in VALUE FORMAT; it may not diverge in PRESENCE.**
 *
 * Format divergence is deliberate and load-bearing — fixtures use `t1` and
 * `ws_1` because a prior event enters at `evaluateEvent` and never passes
 * `parseEvent`'s door, so tightening `z.string()` to `ulidString` would
 * invalidate every shipped fixture for nothing. Presence divergence has no such
 * defence: it lets a fixture stage a prior state the real create door would
 * have refused, and the suite then proves a refusal against a world the server
 * cannot reach.
 *
 * Four defects were open here, all of them silent: `parentId` optional where
 * the domain requires it, `typeId`/`projectId`/`title` absent from the schema
 * entirely, the envelope's own `payload` a bare `z.unknown()`, and the prior
 * field claim's `value` the same. The last one was the worst of them — the fold
 * carried `payload.value ?? null`, character-for-character the production
 * fabrication it exists to catch, so no fixture could witness the difference
 * between the two doors.
 */
describe('prior-event schemas mirror the domain doors in PRESENCE', () => {
  const CANDIDATE = {
    type: 'ticket.transitioned',
    entity: { kind: 'ticket', id: 't1' },
    actorId: 'user_a',
    payload: { to: 'doing' },
  };

  /** A well-formed create in the prior dialect — the baseline every probe below differs from by one key. */
  function created(id: string, extra: Record<string, unknown> = {}): unknown {
    return {
      type: 'ticket.created',
      entity: { kind: 'ticket', id },
      actorId: 'user_a',
      payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: `Fixture ticket ${id}`, workflowId: 'wf_basic', ...extra },
    };
  }

  function contextOf(priorEvents: unknown[]) {
    return buildInMemoryContext(
      fixtureSchema.parse({
        name: 'presence probe',
        workflowDefs: [wfBasic],
        priorEvents,
        candidateEvent: CANDIDATE,
        expected: { refused: false },
      }),
    );
  }

  // --- the envelope's own payload -------------------------------------------
  // Four assertions, not "make the key required": two of them are ACCEPTANCES,
  // and they are the half a careless fix breaks. `null` is a claim and `{}` is
  // an empty claim; only ABSENCE is the defect, and absent and
  // present-but-`undefined` are the same thing on the wire.

  it('an event with no payload key at all refuses at load', () => {
    expect(
      malformedDetail({
        name: 'no payload',
        workflowDefs: [wfBasic],
        candidateEvent: { type: 'ticket.transitioned', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a' },
        expected: { refused: false },
      }),
    ).toBe('candidateEvent.payload: is required — an event with no payload is not a claim');
  });

  it('an event whose payload is present but undefined refuses at load — the wire cannot tell it from absent', () => {
    expect(
      malformedDetail({
        name: 'undefined payload',
        workflowDefs: [wfBasic],
        candidateEvent: { ...CANDIDATE, payload: undefined },
        expected: { refused: false },
      }),
    ).toBe('candidateEvent.payload: is required — an event with no payload is not a claim');
  });

  it('a null payload still parses — a null claim is a claim', () => {
    expect(
      fixtureSchema.safeParse({
        name: 'null payload',
        workflowDefs: [wfBasic],
        candidateEvent: { ...CANDIDATE, payload: null },
        expected: { refused: false },
      }).success,
    ).toBe(true);
  });

  it('an empty payload still parses — an empty claim is a claim', () => {
    expect(
      fixtureSchema.safeParse({
        name: 'empty payload',
        workflowDefs: [wfBasic],
        candidateEvent: { ...CANDIDATE, payload: {} },
        expected: { refused: false },
      }).success,
    ).toBe(true);
  });

  // --- a prior field claim's value -------------------------------------------

  it('a prior field claim with no value is a fixture-authoring error, not a clearing', () => {
    expect(() =>
      contextOf([created('t1'), { type: 'ticket.field_set', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { field: 'due_date' } }]),
    ).toThrow('is required — a field claim with no value would record a clearing nobody made');
  });

  it('a prior field claim whose value is present but undefined is refused the same way', () => {
    expect(() =>
      contextOf([
        created('t1'),
        { type: 'ticket.field_set', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { field: 'due_date', value: undefined } },
      ]),
    ).toThrow('is required — a field claim with no value would record a clearing nobody made');
  });

  it('a prior field claim clearing a field to null is folded as the claim it is', async () => {
    const ctx = contextOf([
      created('t1'),
      { type: 'ticket.field_set', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_b', payload: { field: 'due_date', value: null } },
    ]);
    const ticket = await ctx.getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    // The claimant survives the clearing: "who emptied this, and when" is the
    // whole reason a clearing is a claim rather than a deletion.
    expect(ticket.fields['due_date']).toEqual({
      value: null,
      actorId: 'user_b',
      clientTime: '2026-08-20T00:00:00.000Z',
      serverTime: '2026-08-20T00:00:00.000Z',
    });
  });

  it('a prior field claim of any other value is folded verbatim', async () => {
    const ctx = contextOf([
      created('t1'),
      { type: 'ticket.field_set', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { field: 'due_date', value: {} } },
    ]);
    const ticket = await ctx.getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.fields['due_date']?.value).toEqual({});
  });

  // --- the create payload's four domain-required keys -------------------------

  it.each(['typeId', 'projectId', 'parentId', 'title'])(
    'a prior create omitting %s is a fixture-authoring error, exactly as the real door refuses it',
    (key) => {
      const payload: Record<string, unknown> = {
        typeId: 'task',
        projectId: 'prj_1',
        parentId: null,
        title: 'Fixture ticket t1',
        workflowId: 'wf_basic',
      };
      delete payload[key];
      expect(() =>
        contextOf([{ type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload }]),
      ).toThrow(new RegExp(`"${key}"`));
    },
  );

  it('a prior create says which project and which type it is in, rather than inheriting a constant', async () => {
    const ctx = contextOf([created('t1', { typeId: 'story', projectId: 'prj_other' })]);
    const ticket = await ctx.getEntityState('ticket', 't1');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    // Both were hardcoded `task`/`prj_1` before this task. Plan 3's hierarchy
    // checks read both, so a fixture that could not say either could not stage
    // a rank refusal at all and met a cross-project refusal for a project it
    // never chose.
    expect(ticket.typeId).toBe('story');
    expect(ticket.projectId).toBe('prj_other');
  });

  // --- the reparent payload ----------------------------------------------------

  it('a prior reparent with no newParentId is a fixture-authoring error — absence is not "to the root"', () => {
    expect(() =>
      contextOf([created('t1'), { type: 'ticket.reparented', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: {} }]),
    ).toThrow(/"newParentId"/);
  });

  it('a prior reparent to null moves the ticket to the project root', async () => {
    const ctx = contextOf([
      created('t1'),
      created('t2', { parentId: 't1' }),
      { type: 'ticket.reparented', entity: { kind: 'ticket', id: 't2' }, actorId: 'user_a', payload: { newParentId: null } },
    ]);
    expect((await ctx.getChildrenStates('t1')).map((child) => child.id)).toEqual([]);
    const ticket = await ctx.getEntityState('ticket', 't2');
    if (ticket === null || ticket.kind !== 'ticket') throw new Error('expected a ticket');
    expect(ticket.parentId).toBeNull();
  });
});

/**
 * The two event types this dialect could not fold, and the method that threw
 * because of it. `getTicketTypeDef` used to raise an exception naming this task;
 * a fixture reaching a rank check had no definition to be judged against, and
 * answering `null` would have made the check refuse for a reason that read
 * entirely legitimate.
 *
 * Both folds are mirrored from `buildMemoryContext` deliberately (pre-flight
 * A15/C-06): these fixtures do NOT traverse the shared reducer, so nothing but
 * the mirroring keeps the two folds honest about what a rule sees.
 */
describe('buildInMemoryContext folds ticket-type.defined and ticket.reparented', () => {
  const TASK_TYPE = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [] };

  function typeDefined(def: Record<string, unknown>): unknown {
    return { type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: def['id'] }, actorId: 'user_a', payload: def };
  }

  function contextOf(priorEvents: unknown[]) {
    return buildInMemoryContext(
      fixtureSchema.parse({
        name: 'type fold probe',
        workflowDefs: [wfBasic],
        priorEvents,
        candidateEvent: { type: 'ticket.transitioned', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { to: 'doing' } },
        expected: { refused: false },
      }),
    );
  }

  it('getTicketTypeDef answers a defined type, and null for one this workspace never defined', async () => {
    const ctx = contextOf([typeDefined(TASK_TYPE)]);
    expect(await ctx.getTicketTypeDef('task')).toEqual(TASK_TYPE);
    // `null`, not a throw, and not an invented definition: on the server this is
    // what "no such type here" looks like, and the checks turn it into
    // `ticket.unknown-type` / `hierarchy.parent-type-unknown` themselves.
    expect(await ctx.getTicketTypeDef('ghost')).toBeNull();
  });

  it('last definition wins — which is what makes a rank RE-definition, and the loop it enables, reachable', async () => {
    const ctx = contextOf([
      typeDefined({ id: 'phase', name: 'Phase', icon: 'flag', rank: 1, workflowId: 'wf_basic', fields: [] }),
      typeDefined({ id: 'phase', name: 'Phase', icon: 'flag', rank: 3, workflowId: 'wf_basic', fields: [] }),
    ]);
    expect((await ctx.getTicketTypeDef('phase'))?.rank).toBe(3);
  });

  it('a malformed type definition is a fixture-authoring error rather than a half-built type', () => {
    expect(() => contextOf([typeDefined({ id: 'broken', name: 'Broken', icon: 'x', rank: 3, workflowId: 'wf_basic' })])).toThrow(
      /"fields"/,
    );
  });

  it('a reparent moves parentId and nothing else, so getChildrenStates follows it', async () => {
    const ctx = contextOf([
      { type: 'ticket.created', entity: { kind: 'ticket', id: 't1' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: 'Root', workflowId: 'wf_basic' } },
      { type: 'ticket.created', entity: { kind: 'ticket', id: 't2' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: null, title: 'Other root', workflowId: 'wf_basic' } },
      { type: 'ticket.created', entity: { kind: 'ticket', id: 't3' }, actorId: 'user_a', payload: { typeId: 'task', projectId: 'prj_1', parentId: 't1', title: 'Child', workflowId: 'wf_basic' } },
      { type: 'ticket.transitioned', entity: { kind: 'ticket', id: 't3' }, actorId: 'user_b', payload: { to: 'doing' } },
      { type: 'ticket.reparented', entity: { kind: 'ticket', id: 't3' }, actorId: 'user_a', payload: { newParentId: 't2' } },
    ]);
    expect((await ctx.getChildrenStates('t1')).map((child) => child.id)).toEqual([]);
    expect((await ctx.getChildrenStates('t2')).map((child) => child.id)).toEqual(['t3']);
    const moved = await ctx.getEntityState('ticket', 't3');
    if (moved === null || moved.kind !== 'ticket') throw new Error('expected a ticket');
    // A move is not a transition and not a re-creation: the status the ticket
    // was in and the log four-eyes reads both survive it.
    expect(moved.stateId).toBe('doing');
    expect(moved.transitions).toHaveLength(1);
  });

  it('a reparent of a ticket that was never created is a fixture-authoring error', () => {
    expect(() =>
      contextOf([{ type: 'ticket.reparented', entity: { kind: 'ticket', id: 'ghost' }, actorId: 'user_a', payload: { newParentId: null } }]),
    ).toThrow('fixture prior event touches unknown ticket ghost');
  });

  it('the fold still refuses an event type it does not understand, and names the ones it does', () => {
    expect(() =>
      contextOf([{ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf_basic' }, actorId: 'user_a', payload: wfBasic }]),
    ).toThrow(
      'fixture prior events may only be ticket-type.defined/ticket.created/ticket.transitioned/ticket.reparented/ticket.workflow_rebound/ticket.assigned/ticket.field_set; got workflow.defined',
    );
  });
});

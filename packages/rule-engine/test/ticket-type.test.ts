import { describe, expect, it } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { BUILTIN_TICKET_TYPE_SEEDS, DEEPEST_RANK, makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketTypeDefined } from '../src/checks/ticket-type.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, WF, WS, typeDefined } from '../src/checks/test-support.js';

/** Nothing this check asks is a question about workspace state; any context does. */
const ctx = () => buildMemoryContext([WF], []);

function def(over: Partial<TicketTypeDef> & Pick<TicketTypeDef, 'id' | 'name' | 'rank'>): TicketTypeDef {
  return { icon: 'list', workflowId: 'wf-basic', fields: [], ...over };
}

/**
 * Literal rule id and literal, fully-interpolated reason — never the builder.
 */
describe('checkTicketTypeDefined', () => {
  /**
   * The sharp case. Before this check the event was ACCEPTED, and every sub-task
   * in the workspace quietly escaped `hierarchy.deepest-rank-parent-required` —
   * `DEEPEST_RANK` is 4 *because* the built-in sub-task's rank is — while the
   * type builder went on displaying the lock it had no server behind.
   */
  /**
   * 5.36 — a built-in type's rank is locked at the server: redefining sub-task at rank 3 is refused type.builtin-rank, naming the type and its true rank.
   */
  it('planted defect: the built-in sub-task re-ranked to 3, which releases every sub-task from the parent rule', async () => {
    const env = typeDefined(def({ id: 'sub-task', name: 'Sub-task', rank: 3 }));
    expect(await checkTicketTypeDefined(env, ctx())).toEqual({
      refused: true,
      rule: 'type.builtin-rank',
      reason:
        '"Sub-task" is the built-in sub-task type; its rank is 4 and cannot be changed. Define a custom type for differently-ranked work.',
    });
  });

  /**
   * All four, and the lookup is BY ID: a check that compared against a single
   * seed, or against the first one, would let three of the four ladder rungs
   * move. The reason interpolates the seed's own id and rank, so a wrong-seed
   * comparison shows up in the sentence as well as in the verdict.
   */
  it('planted defect: every one of the four built-ins is locked, each named by its own seed', async () => {
    expect(await checkTicketTypeDefined(typeDefined(def({ id: 'epic', name: 'Epic', rank: 2 })), ctx())).toEqual({
      refused: true,
      rule: 'type.builtin-rank',
      reason:
        '"Epic" is the built-in epic type; its rank is 1 and cannot be changed. Define a custom type for differently-ranked work.',
    });
    expect(await checkTicketTypeDefined(typeDefined(def({ id: 'story', name: 'Story', rank: 1 })), ctx())).toEqual({
      refused: true,
      rule: 'type.builtin-rank',
      reason:
        '"Story" is the built-in story type; its rank is 2 and cannot be changed. Define a custom type for differently-ranked work.',
    });
    expect(await checkTicketTypeDefined(typeDefined(def({ id: 'task', name: 'Task', rank: 9 })), ctx())).toEqual({
      refused: true,
      rule: 'type.builtin-rank',
      reason:
        '"Task" is the built-in task type; its rank is 3 and cannot be changed. Define a custom type for differently-ranked work.',
    });
    expect(
      await checkTicketTypeDefined(typeDefined(def({ id: 'sub-task', name: 'Sub-task', rank: 5 })), ctx()),
    ).toEqual({
      refused: true,
      rule: 'type.builtin-rank',
      reason:
        '"Sub-task" is the built-in sub-task type; its rank is 4 and cannot be changed. Define a custom type for differently-ranked work.',
    });
  });

  /**
   * The lock is ONLY the lock. Name, icon and workflow binding of a built-in
   * stay an admin's to change (Plan 8 decision 7) — a check that refused any
   * re-definition of a built-in would break re-binding a built-in to a
   * workspace's own workflow, which is how built-ins are seeded in the first
   * place (`builtinTicketTypeDefs(defaultWorkflowId)`).
   */
  it('accepts a built-in re-defined with a new name, icon, workflow and fields at its own rank', async () => {
    const env = typeDefined({
      id: 'sub-task',
      name: 'Checklist item',
      icon: 'check-square',
      rank: 4,
      workflowId: 'wf-ops',
      fields: [{ id: 'effort', name: 'Effort', type: 'number' }],
    });
    expect(await checkTicketTypeDefined(env, ctx())).toEqual({ refused: false });
  });

  /**
   * Custom types stay re-rankable, at any rank and in either direction — and
   * that is not an oversight. It is the case the reparent cycle check exists
   * for: last-definition-wins on a custom type's rank is what makes a rank-legal
   * loop reachable at all (design decision 6, `checkTicketReparented`).
   */
  it('accepts a custom type at any rank, re-ranked in either direction', async () => {
    expect(await checkTicketTypeDefined(typeDefined(def({ id: 'phase', name: 'Phase', rank: 1 })), ctx())).toEqual({
      refused: false,
    });
    expect(await checkTicketTypeDefined(typeDefined(def({ id: 'phase', name: 'Phase', rank: 7 })), ctx())).toEqual({
      refused: false,
    });
    // Including a custom type sitting AT the built-in floor — same rank as
    // sub-task, different id, and nothing about it is locked.
    expect(
      await checkTicketTypeDefined(typeDefined(def({ id: 'checklist-item', name: 'Checklist item', rank: 4 })), ctx()),
    ).toEqual({ refused: false });
  });

  /**
   * The two-layer guard (pre-flight A19). The kind here is `'ticket-type'`, not
   * `'ticket'` — the type has its own entity kind and its own stream.
   */
  it('planted defect: a ticket-type.defined that does not point at a ticket type', async () => {
    const env = makeEnvelope({
      type: 'ticket-type.defined',
      entity: { kind: 'project', id: PROJECT },
      workspaceId: WS,
      payload: def({ id: 'phase', name: 'Phase', rank: 1 }),
    });
    expect(await checkTicketTypeDefined(env, ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket-type.defined event does not point at a ticket type; it points at a project.',
    });
  });

  it('planted defect: a malformed payload REFUSES rather than throwing out of the engine', async () => {
    const env = makeEnvelope({
      type: 'ticket-type.defined',
      entity: { kind: 'ticket-type', id: 'phase' },
      workspaceId: WS,
      payload: { id: 'phase', name: 'Phase', icon: 'flag', rank: 0, workflowId: 'wf-basic', fields: [] },
    });
    expect(await checkTicketTypeDefined(env, ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket-type.defined event\'s payload is malformed: at rank: Number must be greater than or equal to 1',
    });
  });

  /**
   * The connective tissue the refusal's whole justification rests on, asserted
   * rather than asserted-in-prose: `DEEPEST_RANK` is the built-in sub-task's
   * rank. If a future edit moved either, this lock would be guarding a number
   * that no longer means the floor of the hierarchy.
   */
  it("the locked sub-task rank IS DEEPEST_RANK — the reason this refusal is not tidiness", () => {
    const subTask = BUILTIN_TICKET_TYPE_SEEDS.find((seed) => seed.id === 'sub-task');
    expect(subTask?.rank).toBe(DEEPEST_RANK);
  });

  it('29.159 a custom field that shadows a flow built-in is refused at the door', async () => {
    const refused = await checkTicketTypeDefined(typeDefined(def({ id: 'invoice', name: 'Invoice', rank: 3, fields: [{ id: 'estimate', name: 'Estimate', type: 'number' }] })), ctx());
    expect(refused).toMatchObject({ refused: true, rule: 'malformed-payload' });
    expect((refused as { reason: string }).reason).toContain('shadows a built-in field');
    expect(await checkTicketTypeDefined(typeDefined(def({ id: 'invoice', name: 'Invoice', rank: 3, fields: [{ id: 'estimates', name: 'E', type: 'number' }] })), ctx())).toEqual({ refused: false }); // control
  });
});

/**
 * The dispatch, which every test above bypasses by calling the check directly.
 *
 * Until now `ticket-type.defined`'s routing was pinned ONLY by its two
 * fixtures. That is real coverage — the fixture suite enters at `evaluateEvent`
 * (`test/fixtures.test.ts:19`) — but it lives in another file, and a future
 * task relocating or rewriting those two fixtures would silently reopen exactly
 * the gap Task 6 was credited with finding: a fully mutation-proven check that
 * nothing reaches, and a built-in rank lock quietly released through the
 * pass-through default.
 */
describe('evaluateEvent dispatches ticket-type.defined', () => {
  it('routes the event to checkTicketTypeDefined rather than passing it through', async () => {
    const env = typeDefined(def({ id: 'sub-task', name: 'Sub-task', rank: 3 }));
    expect(await evaluateEvent(env, ctx())).toEqual({
      refused: true,
      rule: 'type.builtin-rank',
      reason:
        '"Sub-task" is the built-in sub-task type; its rank is 4 and cannot be changed. Define a custom type for differently-ranked work.',
    });
  });

  it('29.134 the Decision seed is rank-locked at 3 through the dispatch; the same def at rank 3 is accepted', async () => {
    expect(await evaluateEvent(typeDefined(def({ id: 'decision', name: 'Decision', rank: 4 })), ctx())).toEqual({
      refused: true,
      rule: 'type.builtin-rank',
      reason:
        '"Decision" is the built-in decision type; its rank is 3 and cannot be changed. Define a custom type for differently-ranked work.',
    });
    expect(await evaluateEvent(typeDefined(def({ id: 'decision', name: 'Decision', rank: 3 })), ctx())).toEqual({ refused: false }); // control
  });
});

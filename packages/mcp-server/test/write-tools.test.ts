import { describe, expect, it } from 'vitest';
import { ULID_REGEX, domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { writeTools } from '../src/tools/write-tools.js';
import type { Session } from '../src/session.js';

/**
 * Plan: MCP server, Task 9. Cases 14.70–14.77.
 */
/**
 * A REAL ULID. The plan's constants were `01J0USER…`, `01J0PROJ…` and
 * `01J0TICK…` — readable, and three of them are not ULIDs: Crockford base32
 * excludes I, L, O and U, so USER, PROJ and TICK each carry an illegal
 * character. Nothing caught it, because the one assertion that would have
 * (`parseEvent`) was written as `'error' in parsed`, and `parseEvent` returns
 * `{ok:true,…}` or `{ok:false,code,message,eventId}` — no `error` key in
 * EITHER shape, so it could not fail. Corrected together: the constants, and
 * the assertion that should have refused them.
 */
const USER = '01J0A5ER0000000000000000AA';

function sessionCapturing(result: unknown): { session: Session; sent: unknown[][] } {
  const sent: unknown[][] = [];
  const session: Session = {
    userId: () => USER,
    get: async () => { throw new Error('not a write'); },
    post: async () => { throw new Error('not a write'); },
    postEvents: async (events) => { sent.push(events); return result; },
  };
  return { session, sent };
}

function tool(name: string, session: Session) {
  const found = writeTools(session).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
}

const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-09-07T10:00:00.000Z' }] };

describe('every write builds an envelope the SERVER would accept', () => {
  it('14.70 create_ticket builds a ticket.created that parseEvent accepts', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('create_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA',
      projectId: '01J0PRJ000000000000000000A',
      typeId: 'task',
      title: 'Renew the trade licence',
      parentId: null,
    });
    const envelope = sent[0]?.[0];
    // The strongest available check short of a live server: the product's own
    // envelope parser, with the product's own registry. A payload key this
    // package guessed wrong fails HERE rather than as an `invalid-payload`
    // result after a round trip.
    const parsed = parseEvent({ ...(envelope as object), serverTime: '2026-09-07T10:00:00.000Z', seq: 1 }, domainRegistry);
    // `parsed.ok`, NOT `'error' in parsed` — which is what the plan wrote and
    // what this line replaced. `parseEvent` returns `{ok:true,event}` or
    // `{ok:false,code,message,eventId}`; NEITHER shape has an `error` key, so
    // `'error' in parsed` is false unconditionally and the assertion could not
    // fail. Measured: with `'mcp'` removed from ORIGINS and the domain dist
    // genuinely rebuilt to four members, all eight cases in this file still
    // passed. The plan calls this "the strongest available check short of a
    // live server"; as written it was not a check at all.
    if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
    expect(parsed.ok).toBe(true);
    expect(envelope).toMatchObject({
      type: 'ticket.created',
      version: 1,
      actorId: USER,
      origin: 'mcp',
      entity: { kind: 'ticket' },
      payload: { typeId: 'task', projectId: '01J0PRJ000000000000000000A', parentId: null, title: 'Renew the trade licence' },
    });
    expect((envelope as { entity: { id: string } }).entity.id).toMatch(ULID_REGEX);
  });

  it('14.71 create_ticket sends parentId as an explicit null, never an absent key', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('create_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PRJ000000000000000000A',
      typeId: 'task', title: 'x',
    });
    const payload = (sent[0]?.[0] as { payload: Record<string, unknown> }).payload;
    // `.nullable()` not `.optional()`: an absent key is `invalid-payload`.
    expect(Object.hasOwn(payload, 'parentId')).toBe(true);
    expect(payload['parentId']).toBeNull();
  });

  /**
   * 13.607 — Ruling 51, Finding 4 (final whole-branch review, 2026-09-17):
   * `create_ticket` is a SECOND production producer of `ticket.created`
   * (`write-tools.ts:91-100`), and until this fix it sent no `start` at all —
   * the domain schema's additive-field rule then read that as focus
   * (`ticket-state.ts:126`), so an MCP-created ticket landed on the board
   * instead of the backlog every other creation path uses by default (spec
   * §1.3). Both halves pinned: the argument's absence still sends an
   * EXPLICIT `start: 'backlog'` (never an absent key — the same discipline
   * `parentId` gets above), and a caller naming `'focus'` gets exactly that
   * back, unchanged.
   */
  it("13.607 create_ticket sends start: 'backlog' when the argument is absent, and 'focus' when given", async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('create_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PRJ000000000000000000A',
      typeId: 'task', title: 'x',
    });
    const defaulted = (sent[0]?.[0] as { payload: Record<string, unknown> }).payload;
    expect(Object.hasOwn(defaulted, 'start')).toBe(true);
    expect(defaulted['start']).toBe('backlog');

    await tool('create_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PRJ000000000000000000A',
      typeId: 'task', title: 'y', start: 'focus',
    });
    const explicit = (sent[1]?.[0] as { payload: Record<string, unknown> }).payload;
    expect(explicit['start']).toBe('focus');
  });

  it('14.72 transition_ticket uses the key `to`, not `toStateId`', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('transition_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TCK000000000000000000A',
      toStateId: undefined, to: 'in-progress', comment: 'starting',
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ to: 'in-progress', comment: { text: 'starting' } });
  });

  it('14.73 transition_ticket omits comment entirely when none is given', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('transition_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TCK000000000000000000A', to: 'done',
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ to: 'done' });
  });

  it('14.74 add_comment sends a document object, not a string', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('add_comment', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TCK000000000000000000A', text: 'hello',
    });
    const payload = (sent[0]?.[0] as { payload: { body: unknown } }).payload;
    expect(typeof payload.body).toBe('object');
    expect(payload.body).toMatchObject({ type: 'doc' });
  });

  it('14.75 assign_ticket sends an explicit null to unassign', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('assign_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TCK000000000000000000A', assigneeId: null,
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ assigneeId: null });
  });
});

describe('a refusal arrives with its own words', () => {
  it('14.76 a rule-engine refusal is thrown with rule and reason intact', async () => {
    const { session } = sessionCapturing({
      results: [{ status: 'refused', eventId: 'e', rule: 'require-comment', reason: 'Moving to done needs a comment saying what was done.' }],
    });
    await expect(
      tool('transition_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TCK000000000000000000A', to: 'done',
      }),
    ).rejects.toThrow('Moving to done needs a comment saying what was done.');
    // Verbatim, not paraphrased: the refusal's own words are the product's
    // contract with the person, and an assistant that reworded them would be
    // inventing a rule the product does not have.
    await expect(
      tool('transition_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TCK000000000000000000A', to: 'done',
      }),
    ).rejects.toThrow('require-comment');
  });

  it('14.77 an invalid result carries its code and message', async () => {
    const { session } = sessionCapturing({
      results: [{ status: 'invalid', eventId: 'e', code: 'invalid-payload', message: 'title: String must contain at least 1 character(s)' }],
    });
    await expect(
      tool('create_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PRJ000000000000000000A', typeId: 'task', title: 'x',
      }),
    ).rejects.toThrow(/invalid-payload/);
  });

  it('14.303 all four writes still go through the shared submit module: ticket entity, origin mcp, the session actor', async () => {
    // Guard for the move of `submitOne`/`envelope` into `tools/submit.ts` (MCP CRUD plan Task 5):
    // the existing 14.70–14.77 cases pin each tool; this one pins the common envelope across all four.
    const { session, sent } = sessionCapturing(COMMITTED);
    const ws = '01J0WS000000000000000000AA';
    const ticketId = '01J0TCK000000000000000000A';
    await tool('create_ticket', session).handler({ workspaceId: ws, projectId: '01J0PRJ000000000000000000A', typeId: 'task', title: 'x' });
    await tool('transition_ticket', session).handler({ workspaceId: ws, ticketId, to: 'done' });
    await tool('add_comment', session).handler({ workspaceId: ws, ticketId, text: 'hi' });
    await tool('assign_ticket', session).handler({ workspaceId: ws, ticketId, assigneeId: null });
    const events = sent.flat() as Array<{ origin: string; actorId: string; entity: { kind: string }; workspaceId: string }>;
    expect(events).toHaveLength(4);
    for (const e of events) {
      expect(e).toMatchObject({ origin: 'mcp', actorId: USER, entity: { kind: 'ticket' }, workspaceId: ws });
    }
    // CONTROL, same `it`: each event is its own envelope (one POST per call, not one accumulated batch).
    expect(sent.map((batch) => batch.length)).toEqual([1, 1, 1, 1]);
  });
});

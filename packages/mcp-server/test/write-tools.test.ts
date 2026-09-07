import { describe, expect, it } from 'vitest';
import { ULID_REGEX, domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { writeTools } from '../src/tools/write-tools.js';
import type { Session } from '../src/session.js';

/**
 * Plan: MCP server, Task 9. Cases 14.70–14.77.
 */
const USER = '01J0USER0000000000000000AA';

function sessionCapturing(result: unknown): { session: Session; sent: unknown[][] } {
  const sent: unknown[][] = [];
  const session: Session = {
    userId: () => USER,
    get: async () => { throw new Error('not a write'); },
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
      projectId: '01J0PROJ00000000000000000A',
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
    expect('error' in (parsed as object)).toBe(false);
    expect(envelope).toMatchObject({
      type: 'ticket.created',
      version: 1,
      actorId: USER,
      origin: 'mcp',
      entity: { kind: 'ticket' },
      payload: { typeId: 'task', projectId: '01J0PROJ00000000000000000A', parentId: null, title: 'Renew the trade licence' },
    });
    expect((envelope as { entity: { id: string } }).entity.id).toMatch(ULID_REGEX);
  });

  it('14.71 create_ticket sends parentId as an explicit null, never an absent key', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('create_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PROJ00000000000000000A',
      typeId: 'task', title: 'x',
    });
    const payload = (sent[0]?.[0] as { payload: Record<string, unknown> }).payload;
    // `.nullable()` not `.optional()`: an absent key is `invalid-payload`.
    expect(Object.hasOwn(payload, 'parentId')).toBe(true);
    expect(payload['parentId']).toBeNull();
  });

  it('14.72 transition_ticket uses the key `to`, not `toStateId`', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('transition_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A',
      toStateId: undefined, to: 'in-progress', comment: 'starting',
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ to: 'in-progress', comment: { text: 'starting' } });
  });

  it('14.73 transition_ticket omits comment entirely when none is given', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('transition_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', to: 'done',
    });
    expect((sent[0]?.[0] as { payload: unknown }).payload).toEqual({ to: 'done' });
  });

  it('14.74 add_comment sends a document object, not a string', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('add_comment', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', text: 'hello',
    });
    const payload = (sent[0]?.[0] as { payload: { body: unknown } }).payload;
    expect(typeof payload.body).toBe('object');
    expect(payload.body).toMatchObject({ type: 'doc' });
  });

  it('14.75 assign_ticket sends an explicit null to unassign', async () => {
    const { session, sent } = sessionCapturing(COMMITTED);
    await tool('assign_ticket', session).handler({
      workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', assigneeId: null,
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
        workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', to: 'done',
      }),
    ).rejects.toThrow('Moving to done needs a comment saying what was done.');
    // Verbatim, not paraphrased: the refusal's own words are the product's
    // contract with the person, and an assistant that reworded them would be
    // inventing a rule the product does not have.
    await expect(
      tool('transition_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', ticketId: '01J0TICK00000000000000000A', to: 'done',
      }),
    ).rejects.toThrow('require-comment');
  });

  it('14.77 an invalid result carries its code and message', async () => {
    const { session } = sessionCapturing({
      results: [{ status: 'invalid', eventId: 'e', code: 'invalid-payload', message: 'title: String must contain at least 1 character(s)' }],
    });
    await expect(
      tool('create_ticket', session).handler({
        workspaceId: '01J0WS000000000000000000AA', projectId: '01J0PROJ00000000000000000A', typeId: 'task', title: 'x',
      }),
    ).rejects.toThrow(/invalid-payload/);
  });
});

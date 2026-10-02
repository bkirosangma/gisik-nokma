import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { ticketTools } from '../src/tools/ticket-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

const ulid = (tag: string) => `01J0${tag}`.padEnd(26, '0');
const ME = ulid('ME');
const WS = ulid('WS');
const T = ulid('TKT');
const B = ulid('BBB');
const C = ulid('CCC');
const X = ulid('XXX');
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }] };

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] };
const text = (t: string): Node => ({ type: 'text', text: t } as Node);
const DESC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('Steps')] },
    { type: 'paragraph', content: [text('Ring the vendor, then wait.')] },
    { type: 'heading', attrs: { level: 2 }, content: [text('Notes')] },
    { type: 'paragraph', content: [text('Keep the receipt.')] },
  ],
};
const detail = (rank: string | null) => ({
  key: 'CCSO-4',
  title: 'Chiller',
  ticketState: { fields: { description: { value: DESC } }, rank, workflowId: 'wf' },
  rollup: { totalChildren: 2 },
});
const ROUTES: Record<string, unknown> = {
  [`/v1/workspaces/${WS}/tickets/${T}`]: detail('m'),
  [`/v1/workspaces/${WS}/tickets/${B}`]: detail('g'),
  [`/v1/workspaces/${WS}/tickets/${C}`]: detail('t'),
  [`/v1/workspaces/${WS}/tickets/${X}`]: detail(null),
};

/** A session whose `postEvents` records each BATCH, so "one batch" is a thing a test can count. */
function fake(routes: Record<string, unknown> = {}, result?: unknown) {
  const batches: Array<Array<Record<string, unknown>>> = [];
  const session: Session = {
    userId: () => ME,
    get: async (path) => {
      for (const [prefix, body] of Object.entries(routes)) if (path === prefix || path.startsWith(`${prefix}?`)) return body;
      throw new HttpError(404, { error: 'not_found' });
    },
    post: async () => ({}),
    postEvents: async (events) => {
      batches.push(events as Array<Record<string, unknown>>);
      return result ?? { results: events.map(() => COMMITTED.results[0]) }; // one committed result per event, index-aligned
    },
    ...NO_TRANSFER,
  };
  return { session, batches };
}
const tool = (name: string, s: Session) => {
  const t = ticketTools(s).find((x) => x.name === name);
  if (t === undefined) throw new Error(`no tool named ${name}`);
  return t;
};
const payloadOf = (e: Record<string, unknown> | undefined) => e?.['payload'] as Record<string, unknown>;

describe('14.451 update_ticket', () => {
  it('14.451 update_ticket: one batch, exactly the implied events', async () => {
    const f = fake(ROUTES);
    await tool('update_ticket', f.session).handler({
      workspaceId: WS, ticketId: T, title: 'Chiller v2', markdown: '1. call the vendor', mode: 'replace_section', section: 'Steps',
      priority: 'P1', dueDate: '2026-10-09', startDate: null, fields: { region: 'south' }, parentId: null,
      addCollaborators: ['me'], removeCollaborators: [ulid('XYZ')], workflow: { toWorkflowId: 'wf2', toStateId: 'todo' },
    });
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]!.map((e) => [e['type'], payloadOf(e)['fieldId'] ?? null])).toEqual([
      ['ticket.field_set', 'title'],
      ['ticket.field_set', 'description'],
      ['ticket.field_set', 'priority'],
      ['ticket.field_set', 'startDate'],
      ['ticket.field_set', 'dueDate'],
      ['ticket.field_set', 'region'],
      ['ticket.reparented', null],
      ['ticket.collaborator_added', null],
      ['ticket.collaborator_removed', null],
      ['ticket.workflow_rebound', null],
    ]);
    for (const e of f.batches[0]!) expect(e).toMatchObject({ origin: 'mcp', actorId: ME, entity: { kind: 'ticket', id: T } });
    const desc = (payloadOf(f.batches[0]![1]) as { value: { content: Node[] } }).value.content;
    expect(JSON.stringify(desc.at(-1)), '"Notes" kept byte-identical').toBe(JSON.stringify(DESC.content.at(-1)));
    expect(JSON.stringify(desc.at(-2)), 'the Notes heading is kept too').toBe(JSON.stringify(DESC.content.at(-2)));
    expect(desc.map((n) => n.type)).toEqual(['heading', 'orderedList', 'heading', 'paragraph']); // "Steps" body replaced
    expect(payloadOf(f.batches[0]![4])['value']).toEqual({ date: '2026-10-09' });
    expect(payloadOf(f.batches[0]![3])['value']).toBeNull();
    expect(payloadOf(f.batches[0]![6])['newParentId']).toBeNull();
    expect(payloadOf(f.batches[0]![7])['userId']).toBe(ME);
    expect(payloadOf(f.batches[0]![8])['userId']).toBe(ulid('XYZ'));
    await expect(tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow('update_ticket needs at least one change');
    await expect(tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, fields: { title: 'x' } })).rejects.toThrow(
      '"title" is a built-in field: use the title argument',
    );
    expect(f.batches, 'refusals send nothing').toHaveLength(1);
    await tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, title: 'Only' }); // control
    expect(f.batches[1]).toHaveLength(1);
    expect(f.batches[1]![0]).toMatchObject({ type: 'ticket.field_set', payload: { fieldId: 'title', value: 'Only' } });
  });

  it('14.451 update_ticket: append and replace keep the right nodes; a missing section refuses', async () => {
    const f = fake(ROUTES);
    await tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, markdown: 'Added line', mode: 'append' });
    const appended = (payloadOf(f.batches[0]![0]) as { value: { content: Node[] } }).value.content;
    expect(appended.slice(0, 4).map((n) => JSON.stringify(n))).toEqual(DESC.content.map((n) => JSON.stringify(n)));
    expect(appended).toHaveLength(5);
    await tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, markdown: 'Whole new text' });
    expect((payloadOf(f.batches[1]![0]) as { value: { content: Node[] } }).value.content).toHaveLength(1);
    await expect(
      tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, markdown: 'x', mode: 'replace_section', section: 'Nowhere' }),
    ).rejects.toThrow(/Nowhere/);
    expect(f.batches).toHaveLength(2);
  });
});

describe('14.452 close_ticket / reopen_ticket', () => {
  it('14.452 close and reopen: the optional comment rides FIRST in the same batch; the engine refusal is verbatim', async () => {
    const f = fake(ROUTES);
    await tool('close_ticket', f.session).handler({ workspaceId: WS, ticketId: T, comment: '**done**' });
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]!.map((e) => e['type'])).toEqual(['comment.added', 'ticket.closed']);
    const body = (payloadOf(f.batches[0]![0]) as { body: { content: Node[] } }).body.content[0]!;
    expect(JSON.stringify(body)).toContain('"bold"');
    await tool('close_ticket', f.session).handler({ workspaceId: WS, ticketId: T }); // control: no comment → one event
    expect(f.batches[1]!.map((e) => e['type'])).toEqual(['ticket.closed']);
    await tool('reopen_ticket', f.session).handler({ workspaceId: WS, ticketId: T, comment: 'back' });
    expect(f.batches[2]!.map((e) => e['type'])).toEqual(['comment.added', 'ticket.reopened']);
    await tool('reopen_ticket', f.session).handler({ workspaceId: WS, ticketId: T });
    expect(f.batches[3]!.map((e) => e['type'])).toEqual(['ticket.reopened']);
    for (const e of f.batches.flat()) {
      expect(e['origin']).toBe('mcp');
      expect(parseEvent({ ...e, serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok, String(e['type'])).toBe(true);
    }
    const refused = fake(ROUTES, {
      results: [{ status: 'refused', eventId: 'e', rule: 'workflow.close-requires-terminal', reason: 'Move the ticket to a terminal state before closing it.' }],
    });
    await expect(tool('close_ticket', refused.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(
      'event 0 refused by workflow.close-requires-terminal: Move the ticket to a terminal state before closing it.',
    );
  });
});

describe('14.453 delete_ticket / restore_ticket', () => {
  it('14.453 delete_ticket confirms against the KEY', async () => {
    const f = fake(ROUTES);
    expect(await tool('delete_ticket', f.session).handler({ workspaceId: WS, ticketId: T, confirm_name: 'Chiller' })).toMatchObject({
      preview: true, confirm: 'confirm_name must be "CCSO-4"', counts: { childTickets: 2 }, nothingChanged: true,
    });
    expect(await tool('delete_ticket', f.session).handler({ workspaceId: WS, ticketId: T })).toMatchObject({ preview: true });
    expect(JSON.stringify(await tool('delete_ticket', f.session).handler({ workspaceId: WS, ticketId: T }))).toContain('CCSO-4');
    expect(f.batches, 'a preview sends nothing').toEqual([]);
    await tool('delete_ticket', f.session).handler({ workspaceId: WS, ticketId: T, confirm_name: 'CCSO-4' }); // control: the exact key commits
    await tool('restore_ticket', f.session).handler({ workspaceId: WS, ticketId: T });
    expect(f.batches.flat().map((e) => e['type'])).toEqual(['ticket.deleted', 'ticket.restored']);
    expect(f.batches.flat().every((e) => e['origin'] === 'mcp')).toBe(true);
  });

  it('14.453 a ticket the caller cannot see answers the uniform sentence, before anything is sent', async () => {
    const f = fake({});
    await expect(tool('delete_ticket', f.session).handler({ workspaceId: WS, ticketId: T, confirm_name: 'CCSO-4' })).rejects.toThrow(
      'ticket not found or not visible to you',
    );
    expect(f.batches).toEqual([]);
  });
});

describe('14.454 get_ticket_history', () => {
  const line = (id: string, type: string, payload: unknown, origin: string, seq: number) =>
    ({ id, type, payload, actorId: ME, origin, serverTime: 't', seq, version: 1, clientTime: 't' });

  it('14.454 history never echoes a body', async () => {
    const f = fake({
      [`/v1/tickets/${T}/history`]: {
        ticketId: T,
        events: [
          line(ulid('C1'), 'comment.added', { body: { type: 'doc', content: [text('secret')] } }, 'web', 1),
          line(ulid('E2'), 'comment.edited', { commentId: ulid('C1'), body: { type: 'doc', content: [text('secret too')] } }, 'mcp', 2),
          line(ulid('F3'), 'ticket.field_set', { fieldId: 'description', value: { type: 'doc', content: [text('secret three')] } }, 'web', 3),
          line(ulid('A4'), 'ticket.assigned', { assigneeId: ME }, 'web', 4),
          line(ulid('D5'), 'comment.deleted', { commentId: ulid('C1') }, 'web', 5),
          line(ulid('M7'), 'ticket.transitioned', { to: 'done', comment: { text: 'secret five' } }, 'mcp', 7),
          line(ulid('K6'), 'ticket.created', { typeId: 'task', title: 'Chiller', description: { type: 'doc', content: [text('secret four')] } }, 'web', 6),
          // a claim the server refused carries the refused event WHOLE: the contest keeps WHAT was refused, never its text
          line(ulid('X8'), 'claim.contested', { rule: 'deleted-ticket', reason: 'ticket is deleted', originalEvent: { id: ulid('C9'), type: 'comment.added', payload: { body: { type: 'doc', content: [text('secret six')] } } } }, 'server', 8),
          line(ulid('X9'), 'claim.contested', { rule: 'deleted-ticket', reason: 'ticket is deleted', originalEvent: { id: ulid('F9'), type: 'ticket.field_set', payload: { fieldId: 'description', value: { type: 'doc', content: [text('secret seven')] } } } }, 'server', 9),
        ],
      },
    });
    const out = (await tool('get_ticket_history', f.session).handler({ ticketId: T })) as { events: Array<{ type: string; origin: string; payload: unknown }> };
    expect(out.events.map((e) => e.payload)).toEqual([
      { commentId: ulid('C1') }, // the added comment is named by its own event id, the comment id
      { commentId: ulid('C1') },
      { fieldId: 'description' },
      { assigneeId: ME }, // control: an ordinary line keeps its facts
      { commentId: ulid('C1') },
      { to: 'done' }, // a transition keeps its move, not the words that came with it
      { typeId: 'task', title: 'Chiller' },
      { rule: 'deleted-ticket', reason: 'ticket is deleted', originalEvent: { id: ulid('C9'), type: 'comment.added', payload: { commentId: ulid('C9') } } },
      { rule: 'deleted-ticket', reason: 'ticket is deleted', originalEvent: { id: ulid('F9'), type: 'ticket.field_set', payload: { fieldId: 'description' } } },
    ]);
    expect(out.events.map((e) => e.origin)).toEqual(['web', 'mcp', 'web', 'web', 'web', 'mcp', 'web', 'server', 'server']);
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('14.454 paging passes afterSeq and limit; a stranger gets the uniform sentence', async () => {
    const asked: string[] = [];
    const f = fake();
    const session: Session = { ...f.session, get: async (path) => { asked.push(path); throw new HttpError(404, {}); } };
    await expect(tool('get_ticket_history', session).handler({ ticketId: T, cursor: '12', limit: 5 })).rejects.toThrow('ticket not found or not visible to you');
    expect(asked).toEqual([`/v1/tickets/${T}/history?afterSeq=12&limit=5`]);
  });
});

describe('14.455 rank_ticket', () => {
  it('14.455 rank_ticket between neighbours', async () => {
    const f = fake(ROUTES);
    await tool('rank_ticket', f.session).handler({ workspaceId: WS, ticketId: T, before: B, after: C });
    expect(f.batches[0]).toHaveLength(1);
    expect(f.batches[0]![0]).toMatchObject({ type: 'ticket.ranked', entity: { id: T }, origin: 'mcp' });
    const rank = payloadOf(f.batches[0]![0])['rank'] as string;
    expect(rank > 'g' && rank < 't', `${rank} sits between g and t`).toBe(true);
    await tool('rank_ticket', f.session).handler({ workspaceId: WS, ticketId: T, after: C }); // control: one neighbour
    expect((payloadOf(f.batches[1]![0])['rank'] as string) < 't').toBe(true);
    await expect(tool('rank_ticket', f.session).handler({ workspaceId: WS, ticketId: T, before: X })).rejects.toThrow(
      `ticket ${X} is not in the backlog, so nothing can be ranked beside it`,
    );
    await expect(tool('rank_ticket', f.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow('rank_ticket needs before, after, or both');
    expect(f.batches).toHaveLength(2);
  });
});

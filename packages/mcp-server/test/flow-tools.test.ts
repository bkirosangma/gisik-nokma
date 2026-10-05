import { describe, expect, it } from 'vitest';
import { flowTools } from '../src/tools/flow-tools.js';
import { ticketTools } from '../src/tools/ticket-tools.js';
import { writeTools } from '../src/tools/write-tools.js';
import { ME, WS, fakeFlow, ulid } from './fixtures/flow-fixtures.js';

/** Graph Part 5 T1: `set_wait_for_all` (29.377) and `estimate` / `reworkEstimate` on create and update (29.378). */
const T = ulid('TKT');
const P = ulid('PRJ');
const find = <X extends { name: string }>(tools: X[], name: string): X => {
  const t = tools.find((x) => x.name === name);
  if (t === undefined) throw new Error(`no tool named ${name}`);
  return t;
};
const payload = (e: Record<string, unknown> | undefined) => e?.['payload'] as Record<string, unknown>;

describe('29.377 set_wait_for_all', () => {
  it('29.377 on files true, off files null (never false); update_ticket points at the tool; control: a custom field still passes', async () => {
    const f = fakeFlow();
    const wait = find(flowTools(f.session), 'set_wait_for_all');
    await wait.handler({ workspaceId: WS, ticketId: T, value: true });
    await wait.handler({ workspaceId: WS, ticketId: T, value: false });
    expect(f.batches.map((b) => b[0])).toMatchObject([
      { type: 'ticket.field_set', origin: 'mcp', actorId: ME, entity: { kind: 'ticket', id: T }, payload: { fieldId: 'waitForAll', value: true } },
      { type: 'ticket.field_set', payload: { fieldId: 'waitForAll', value: null } },
    ]);
    expect(f.batches.map((b) => b.length)).toEqual([1, 1]);
    await expect(wait.handler({ workspaceId: WS, ticketId: T, value: 'yes' })).rejects.toThrow(/boolean/); // the schema's refusal, not any throw
    expect(f.batches).toHaveLength(2);
    const update = find(ticketTools(f.session), 'update_ticket');
    await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { waitForAll: true } })).rejects.toThrow(/^"waitForAll" is a built-in field: use the set_wait_for_all tool$/);
    await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { title: 'x' } })).rejects.toThrow(/^"title" is a built-in field: use the title argument$/);
    expect(f.batches, 'refusals send nothing').toHaveLength(2);
    await update.handler({ workspaceId: WS, ticketId: T, fields: { region: 'south' } }); // control
    expect(f.batches[2]![0]).toMatchObject({ payload: { fieldId: 'region', value: 'south' } });
  });

  it('29.377 the module is the one tool, its input keys and its description word for word', () => {
    const tools = flowTools(fakeFlow().session);
    expect(tools.map((t) => t.name)).toEqual(['set_wait_for_all']);
    expect(Object.keys(tools[0]!.inputSchema).sort()).toEqual(['ticketId', 'value', 'workspaceId']);
    expect(tools[0]!.description).toBe(
      'Turn "wait for all incoming" on or off for a ticket in a flow. Off (the default): the ticket moves from Backlog to its first status as soon as ANY ticket that leads to it ' +
        'is done. On: it waits until ALL of them are done (a branch a Decision did not take does not count). Turn it off again with value false. update_ticket cannot set it.',
    );
  });
});

describe('29.378 estimate and reworkEstimate', () => {
  it('29.378 create carries estimate in ticket.created, absent when omitted; update files field_set, null clears', async () => {
    const f = fakeFlow();
    const create = find(writeTools(f.session), 'create_ticket');
    const base = { workspaceId: WS, projectId: P, typeId: 'task', title: 'Pitch' };
    await create.handler({ ...base, estimate: 3 });
    await create.handler(base);
    expect(payload(f.batches[0]![0])['estimate']).toBe(3);
    expect('estimate' in payload(f.batches[1]![0])).toBe(false);
    const update = find(ticketTools(f.session), 'update_ticket');
    await update.handler({ workspaceId: WS, ticketId: T, estimate: 5, reworkEstimate: 2 });
    await update.handler({ workspaceId: WS, ticketId: T, estimate: null, reworkEstimate: null });
    expect(f.batches[2]!.map((e) => [e['type'], payload(e)])).toEqual([['ticket.field_set', { fieldId: 'estimate', value: 5 }], ['ticket.field_set', { fieldId: 'reworkEstimate', value: 2 }]]);
    expect(f.batches[3]!.map((e) => payload(e))).toEqual([{ fieldId: 'estimate', value: null }, { fieldId: 'reworkEstimate', value: null }]);
    await update.handler({ workspaceId: WS, ticketId: T, reworkEstimate: 4 }); // one alone is one event
    expect(f.batches[4]!.map((e) => payload(e))).toEqual([{ fieldId: 'reworkEstimate', value: 4 }]);
  });

  it('29.378 0, 366 and 2.5 are refused unsent; 1 and 365 pass; estimate and reworkEstimate are built-ins for `fields`', async () => {
    const f = fakeFlow();
    const update = find(ticketTools(f.session), 'update_ticket');
    const create = find(writeTools(f.session), 'create_ticket');
    for (const bad of [0, 366, 2.5]) {
      // the ZodError names the member: a throw from anywhere else (a read, a submit) does not satisfy these legs
      await expect(update.handler({ workspaceId: WS, ticketId: T, estimate: bad })).rejects.toThrow(/"estimate"/);
      await expect(update.handler({ workspaceId: WS, ticketId: T, reworkEstimate: bad })).rejects.toThrow(/"reworkEstimate"/);
      await expect(create.handler({ workspaceId: WS, projectId: P, typeId: 'task', title: 'x', estimate: bad })).rejects.toThrow(/"estimate"/);
    }
    expect(f.batches, 'refused by the schema, nothing sent').toEqual([]);
    for (const good of [1, 365]) {
      // control: the bounds themselves pass, on every door
      await update.handler({ workspaceId: WS, ticketId: T, estimate: good });
      await update.handler({ workspaceId: WS, ticketId: T, reworkEstimate: good });
      await create.handler({ workspaceId: WS, projectId: P, typeId: 'task', title: 'x', estimate: good });
    }
    expect(f.batches).toHaveLength(6);
    await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { estimate: 3 } })).rejects.toThrow(/^"estimate" is a built-in field: use the estimate argument$/);
    await expect(update.handler({ workspaceId: WS, ticketId: T, fields: { reworkEstimate: 3 } })).rejects.toThrow(/^"reworkEstimate" is a built-in field: use the reworkEstimate argument$/);
    expect(f.batches).toHaveLength(6);
  });
});

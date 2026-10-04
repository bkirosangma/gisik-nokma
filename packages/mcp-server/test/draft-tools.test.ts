import { describe, expect, it } from 'vitest';
import { ULID_REGEX, domainRegistry, parseEvent } from '@gisik-nokma/domain';
import type { Session } from '../src/session.js';
import { readTools, type ToolDefinition } from '../src/tools/read-tools.js';
import { ticketTools } from '../src/tools/ticket-tools.js';
import { writeTools } from '../src/tools/write-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/**
 * Drafts plan, Task 7. Cases 28.130-28.141 (the hosted cases 28.142-28.145 are in
 * `apps/server/test/mcp/mcp-drafts.test.ts`).
 */
const USER = '01J0A5ER0000000000000000AA';
const WS = '01J0WS000000000000000000AA';
const PRJ = '01J0PRJ000000000000000000A';
/** A real ULID ending in `n` (Crockford: no I, L, O or U). */
const tid = (n: string): string => '01J0DRFT' + '0'.repeat(18 - n.length) + n;
const ROOT = tid('R1');
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' }] };
const DRAFT_IN_BACKLOG = 'a draft is born in the backlog: send start: "backlog" and no stateId';

type Routes = { get?: (path: string) => unknown; post?: (path: string, body: unknown) => unknown };
function fake(routes: Routes = {}) {
  const gets: string[] = [];
  const posts: Array<{ path: string; body: unknown }> = [];
  const sent: unknown[][] = [];
  const session: Session = {
    userId: () => USER,
    get: async (path) => {
      gets.push(path);
      if (routes.get === undefined) throw new Error(`unexpected GET ${path}`);
      return routes.get(path);
    },
    post: async (path, body) => {
      posts.push({ path, body });
      if (routes.post === undefined) throw new Error(`unexpected POST ${path}`);
      return routes.post(path, body);
    },
    postEvents: async (events) => {
      sent.push(events);
      return COMMITTED;
    },
    ...NO_TRANSFER,
  };
  return { session, gets, posts, sent };
}

function pick(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
}

/** What the server does with an envelope: the product's own parser and registry. */
const accepted = (envelope: unknown) =>
  parseEvent({ ...(envelope as object), serverTime: '2026-10-03T09:00:00.000Z', seq: 1 }, domainRegistry);

const BIRTH = { workspaceId: WS, projectId: PRJ, typeId: 'task', title: 'Plan the stock count' };
const payloadOf = (sent: unknown[][]) => ((sent[0]?.[0] as { payload: Record<string, unknown> }).payload);

/** A ticket read as the server answers the author's own draft (G7) or a published ticket. */
const detail = (opts: { draft: boolean; key?: string }) => ({
  key: opts.draft ? null : (opts.key ?? 'K-1'),
  title: 'Count the crates',
  ticketState: {
    fields: {},
    workflowId: 'wf',
    ...(opts.draft ? { draft: { authorId: USER, at: '2026-10-03T08:00:00.000Z' } } : {}),
  },
  rollup: null,
});

/**
 * `get_ticket` also reads the links route (typed-links T4) and the ticket's notes (MCP sweep 2 T3): a fake that
 * answered the detail on every path would die on `links.map`, a TypeError and not a verdict (drafts T7 drift).
 */
const ticketRead = (body: unknown) => (path: string) =>
  path.endsWith('/links') ? { links: [] } : path.endsWith('/notes') ? { notes: [] } : body;

describe('28.130 create_ticket {draft: true}', () => {
  it('28.130 sends a backlog draft with no stateId and answers draft: true, key: null; without draft the event and the reply are unchanged', async () => {
    const { session, sent } = fake();
    const out = await pick(writeTools(session), 'create_ticket').handler({ ...BIRTH, parentId: null, draft: true });
    const envelope = sent[0]?.[0] as { origin: string; actorId: string; type: string };
    expect(envelope).toMatchObject({ origin: 'mcp', actorId: USER, type: 'ticket.created' });
    expect(payloadOf(sent)).toEqual({
      typeId: 'task', projectId: PRJ, parentId: null, title: 'Plan the stock count', start: 'backlog', draft: true,
    });
    expect(accepted(envelope).ok, JSON.stringify(accepted(envelope))).toBe(true);
    expect(out).toEqual({
      ticketId: expect.stringMatching(ULID_REGEX),
      status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z',
      draft: true, key: null,
    });

    // CONTROL: no `draft`, and `draft: false`, are the ticket the tool has always made.
    for (const extra of [{}, { draft: false }]) {
      const plain = fake();
      const made = await pick(writeTools(plain.session), 'create_ticket').handler({ ...BIRTH, ...extra });
      expect('draft' in payloadOf(plain.sent), JSON.stringify(extra)).toBe(false);
      expect(payloadOf(plain.sent)['start']).toBe('backlog');
      expect(made).not.toHaveProperty('draft');
      expect(made).not.toHaveProperty('key');
    }
  });
});

describe('28.131 a draft cannot be born in focus', () => {
  it('28.131 stateId and start focus are refused in the domain sentence before anything is sent; the sentence is the domain\'s', async () => {
    const refused = fake();
    const create = pick(writeTools(refused.session), 'create_ticket');
    await expect(create.handler({ ...BIRTH, draft: true, stateId: 'doing' })).rejects.toThrow(DRAFT_IN_BACKLOG);
    await expect(create.handler({ ...BIRTH, draft: true, start: 'focus' })).rejects.toThrow(DRAFT_IN_BACKLOG);
    expect(refused.sent).toEqual([]);

    // CONTROL: the two inputs that stay legal are sent.
    const ok = fake();
    const createOk = pick(writeTools(ok.session), 'create_ticket');
    await createOk.handler({ ...BIRTH, draft: true, start: 'backlog' });
    await createOk.handler({ ...BIRTH, draft: false, start: 'focus' });
    expect(ok.sent).toHaveLength(2);
    expect(payloadOf([ok.sent[1] as unknown[]])['start']).toBe('focus');

    // The local constant IS the domain's sentence: tamper a real draft envelope and let `parseEvent` judge it.
    const envelope = ok.sent[0]?.[0] as { payload: Record<string, unknown> };
    const verdict = accepted({ ...envelope, payload: { ...envelope.payload, start: 'focus' } });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? '' : verdict.message).toContain(DRAFT_IN_BACKLOG);
  });
});

describe('28.132 the copy', () => {
  it('28.132 create_ticket says a draft is private and keyless; delete_ticket points at discard_draft; no other write tool carries the sentence', () => {
    const { session } = fake();
    const COPY = 'A draft is private to you until publish_draft. It has no key.';
    const create = pick(writeTools(session), 'create_ticket').description;
    expect(create).toContain(COPY);
    // Each user-visible sentence word for word (P20 class 2d), not only its tool name.
    expect(create).toContain('`draft: true` makes a private draft instead: it is born in the backlog, so pass no `stateId` and no start "focus". ');
    expect(pick(ticketTools(session), 'delete_ticket').description).toMatch(/ A draft cannot be deleted: use discard_draft\.$/);
    for (const name of ['transition_ticket', 'add_comment', 'assign_ticket']) {
      expect(pick(writeTools(session), name).description, name).not.toContain(COPY); // CONTROL
    }
  });
});

describe('28.139 get_ticket on a draft', () => {
  it('28.139 says draft: true beside key: null and the server\'s ticketState.draft; a published ticket has no draft member', async () => {
    const draft = fake({ get: ticketRead(detail({ draft: true })) });
    const out = (await pick(readTools(draft.session), 'get_ticket').handler({ workspaceId: WS, ticketId: ROOT })) as Record<string, unknown>;
    expect(out['draft']).toBe(true);
    expect(out['key']).toBeNull();
    expect((out['ticketState'] as { draft: { authorId: string } }).draft.authorId).toBe(USER);

    const published = fake({ get: ticketRead(detail({ draft: false })) });
    const plain = (await pick(readTools(published.session), 'get_ticket').handler({ workspaceId: WS, ticketId: ROOT })) as Record<string, unknown>;
    expect('draft' in plain).toBe(false); // CONTROL
    expect(plain['key']).toBe('K-1');
  });
});

describe('28.140 delete_ticket on a draft', () => {
  it('28.140 is refused in T1\'s sentence before any preview, with and without confirm_name; a published ticket still previews', async () => {
    const draft = fake({ get: () => detail({ draft: true }) });
    const del = pick(ticketTools(draft.session), 'delete_ticket');
    const SENTENCE = 'refused by draft.not-allowed: A draft cannot be deleted. Discard it instead.';
    await expect(del.handler({ workspaceId: WS, ticketId: ROOT })).rejects.toThrow(SENTENCE);
    await expect(del.handler({ workspaceId: WS, ticketId: ROOT, confirm_name: ROOT })).rejects.toThrow(SENTENCE);
    expect(draft.sent).toEqual([]);

    const published = fake({ get: () => detail({ draft: false, key: 'K-1' }) });
    const preview = await pick(ticketTools(published.session), 'delete_ticket').handler({ workspaceId: WS, ticketId: ROOT });
    expect(preview).toMatchObject({ preview: true, wouldChange: 'Moves K-1 "Count the crates" to Deleted items; it can be restored for 15 days.' }); // CONTROL
  });
});

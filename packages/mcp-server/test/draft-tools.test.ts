import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DRAFT_NO_OUTSIDERS_REASON, ULID_REGEX, domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { draftTools, eraseSetOf } from '../src/tools/draft-tools.js';
import { readTools, type ToolDefinition } from '../src/tools/read-tools.js';
import { allTools } from '../src/tools/register.js';
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
  it('28.131 stateId and start focus are refused in the domain sentence before anything is sent (a stateId with start backlog too: the draft refusal comes first); the sentence is the domain\'s', async () => {
    const refused = fake();
    const create = pick(writeTools(refused.session), 'create_ticket');
    await expect(create.handler({ ...BIRTH, draft: true, stateId: 'doing' })).rejects.toThrow(DRAFT_IN_BACKLOG);
    await expect(create.handler({ ...BIRTH, draft: true, start: 'focus' })).rejects.toThrow(DRAFT_IN_BACKLOG);
    // Decision 6: the draft refusal runs BEFORE the older stateId + backlog check, so the one input both checks refuse
    // gets the draft sentence.
    await expect(create.handler({ ...BIRTH, draft: true, stateId: 'doing', start: 'backlog' })).rejects.toThrow(DRAFT_IN_BACKLOG);
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

const ROW = (n: number, over: Record<string, unknown> = {}) => ({
  workspaceId: 'w1', ticketId: tid(`D${n}`), projectId: 'p1', projectName: 'Stock', title: `Draft ${n}`,
  typeId: 'task', parentId: null, updatedAt: `2026-10-03T0${n}:00:00.000Z`, ...over,
});

describe('28.133 list_my_drafts', () => {
  it('28.133 reads /v1/me/drafts, narrows by workspace and project, answers eight named fields, pages', async () => {
    const wire = [ROW(1, { attachmentCount: 2, key: 'LEAK-1' }), ROW(2), ROW(3)];
    const { session, gets } = fake({ get: () => ({ items: wire }) });
    const list = pick(draftTools(session), 'list_my_drafts');

    const all = (await list.handler({})) as { items: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(gets).toEqual(['/v1/me/drafts']); // no query string with no arguments
    expect(all.items).toHaveLength(3);
    expect(Object.keys(all.items[0] ?? {}).sort()).toEqual(
      ['parentId', 'projectId', 'projectName', 'ticketId', 'title', 'typeId', 'updatedAt', 'workspaceId'],
    );
    expect(all.items[0]).toEqual({
      workspaceId: 'w1', ticketId: tid('D1'), projectId: 'p1', projectName: 'Stock', title: 'Draft 1',
      typeId: 'task', parentId: null, updatedAt: '2026-10-03T01:00:00.000Z',
    }); // the planted `key` and `attachmentCount` did not reach the answer
    expect(all.nextCursor).toBeNull();

    await list.handler({ workspaceId: 'w 1', projectId: 'p/1' });
    expect(gets[1]).toBe('/v1/me/drafts?workspaceId=w+1&projectId=p%2F1');

    const first = (await list.handler({ limit: 2 })) as { items: unknown[]; nextCursor: string | null };
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const rest = (await list.handler({ limit: 2, cursor: first.nextCursor })) as { items: unknown[]; nextCursor: string | null };
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
  });
});

describe('28.134 publish_draft', () => {
  it('28.134 posts one id to the atomic route, sends no event, reads nothing first, and answers the key the route assigned', async () => {
    const { session, posts, gets, sent } = fake({ post: () => ({ results: [{ ticketId: ROOT, key: 'RP-7' }] }) });
    const publish = pick(draftTools(session), 'publish_draft');
    expect(await publish.handler({ workspaceId: 'w 1', ticketId: ROOT })).toEqual({ ticketId: ROOT, key: 'RP-7', published: true });
    expect(posts).toEqual([{ path: '/v1/workspaces/w%201/drafts/publish', body: { ticketIds: [ROOT], origin: 'mcp' } }]);
    expect(sent).toEqual([]);
    expect(gets).toEqual([]);

    // CONTROL: an answer with no row for this ticket is an error, never a success without a key.
    const empty = fake({ post: () => ({ results: [{ ticketId: tid('X9'), key: 'RP-8' }] }) });
    await expect(pick(draftTools(empty.session), 'publish_draft').handler({ workspaceId: WS, ticketId: ROOT })).rejects.toThrow(
      'gisik-nokma published no ticket for this draft',
    );
  });
});

describe('28.135 publish_draft refusals', () => {
  const raising = (error: unknown) => pick(draftTools(fake({ post: () => { throw error; } }).session), 'publish_draft');
  const call = { workspaceId: WS, ticketId: ROOT };

  it('28.135 a refused set is the engine\'s rule and sentence; a 404 is not found; other failures are rethrown as they are', async () => {
    const refusal = new HttpError(409, {
      rule: 'draft.publish-refused', ticketId: ROOT,
      cause: { rule: 'draft.parent-unpublished', reason: 'Publish its parent first.' },
    });
    await expect(raising(refusal).handler(call)).rejects.toThrow('refused by draft.parent-unpublished: Publish its parent first.');
    await expect(raising(new HttpError(404, {})).handler(call)).rejects.toThrow('draft not found or not visible to you');

    // CONTROL: a 500 and a 409 that is not this refusal are the HttpError they are. The other 409 carries a `cause`, so
    // only the `rule === 'draft.publish-refused'` test (not the `cause !== undefined` guard) keeps it from being rewritten.
    // Each clause of the 409 arm has its own control (P11): a publish-refused 409 with no `cause` (the `cause` clause),
    // and the same body under a 422 (the `status === 409` clause). An empty body reaches the tool as `null` (`readBody`):
    // a 409 and a 500 with no body are rethrown too, not a TypeError.
    const causeless = new HttpError(409, { rule: 'draft.publish-refused', ticketId: ROOT });
    const not409 = new HttpError(422, refusal.body);
    const bodiless = [new HttpError(409, null), new HttpError(500, null)];
    for (const other of [new HttpError(500, {}), new HttpError(409, { rule: 'something.else', cause: { rule: 'x.y', reason: 'z' } }), causeless, not409, ...bodiless]) {
      await expect(raising(other).handler(call)).rejects.toBe(other);
    }
  });
});

/** The workspace drafts list the preview walks: a root, a child, a grandchild, a sibling root and the sibling's child. */
const DRAFTS = [
  { ticketId: ROOT, parentId: null, attachmentCount: 1 },
  { ticketId: tid('C1'), parentId: ROOT, attachmentCount: 2 },
  { ticketId: tid('G1'), parentId: tid('C1'), attachmentCount: 0 },
  { ticketId: tid('S1'), parentId: null, attachmentCount: 5 },
  { ticketId: tid('S2'), parentId: tid('S1'), attachmentCount: 7 },
];
const discardRoutes = (isDraft: boolean) => (path: string) => {
  if (path === `/v1/workspaces/${WS}/tickets/${ROOT}`) return { ...detail({ draft: isDraft }), title: 'Count the crates' };
  if (path === `/v1/workspaces/${WS}/drafts`) return { items: DRAFTS };
  throw new Error(`unexpected GET ${path}`);
};
const PREVIEW = {
  preview: true,
  wouldChange:
    'Erases the draft "Count the crates", 2 sub-drafts and 3 attachments uploaded to them (permanently deleted). Linked notes are kept. This cannot be undone.',
  counts: { subDrafts: 2, attachments: 3 },
  nothingChanged: true,
  confirm: 'confirm_name must be "Count the crates"',
};

describe('28.136 discard_draft previews first', () => {
  it('28.136 without the exact title nothing is sent; with it one ticket.discarded goes and the drafts list is not read', async () => {
    const { session, sent } = fake({ get: discardRoutes(true) });
    const discard = pick(draftTools(session), 'discard_draft');
    for (const given of [undefined, 'count the crates', 'Count the crates ', '']) {
      expect(await discard.handler({ workspaceId: WS, ticketId: ROOT, ...(given === undefined ? {} : { confirm_name: given }) }), String(given)).toEqual(PREVIEW);
    }
    expect(sent).toEqual([]);

    // CONTROL: the exact title commits, and a confirmed discard makes no read of the list.
    const live = fake({ get: discardRoutes(true) });
    const out = await pick(draftTools(live.session), 'discard_draft').handler({ workspaceId: WS, ticketId: ROOT, confirm_name: 'Count the crates' });
    expect(out).toEqual({ ticketId: ROOT, discarded: true });
    expect(live.sent).toHaveLength(1);
    const envelope = live.sent[0]?.[0] as { type: string; payload: unknown; entity: unknown; actorId: string; origin: string; workspaceId: string };
    expect(envelope).toMatchObject({ type: 'ticket.discarded', payload: {}, entity: { kind: 'ticket', id: ROOT }, actorId: USER, origin: 'mcp', workspaceId: WS });
    expect(accepted(envelope).ok, JSON.stringify(accepted(envelope))).toBe(true);
    expect(live.gets).toEqual([`/v1/workspaces/${WS}/tickets/${ROOT}`]);
  });
});

describe('28.137 discard_draft on a ticket that is not a draft', () => {
  it('28.137 is refused with the pointer to delete_ticket, even with the exact name; an unreadable ticket is not found', async () => {
    const { session, sent, gets } = fake({ get: discardRoutes(false) });
    const discard = pick(draftTools(session), 'discard_draft');
    const MESSAGE = 'This ticket is not a draft. Use delete_ticket to remove a published ticket.';
    await expect(discard.handler({ workspaceId: WS, ticketId: ROOT })).rejects.toThrow(MESSAGE);
    await expect(discard.handler({ workspaceId: WS, ticketId: ROOT, confirm_name: 'Count the crates' })).rejects.toThrow(MESSAGE);
    expect(sent).toEqual([]);
    expect(gets.every((p) => !p.endsWith('/drafts'))).toBe(true);

    const missing = fake({ get: () => { throw new HttpError(404, {}); } });
    await expect(pick(draftTools(missing.session), 'discard_draft').handler({ workspaceId: WS, ticketId: ROOT })).rejects.toThrow(
      'ticket not found or not visible to you',
    );

    // CONTROL: the same call on a draft previews.
    const draft = fake({ get: discardRoutes(true) });
    expect(await pick(draftTools(draft.session), 'discard_draft').handler({ workspaceId: WS, ticketId: ROOT })).toMatchObject({ preview: true });
  });
});

describe('28.138 the erasure set', () => {
  it('28.138 counts descendants and their attachments, not siblings; survives a cycle; an unknown id is zero', () => {
    expect(eraseSetOf(DRAFTS, ROOT)).toEqual({ subDrafts: 2, attachments: 3 });
    expect(eraseSetOf(DRAFTS, tid('S1'))).toEqual({ subDrafts: 1, attachments: 12 }); // CONTROL: the sibling's own set
    expect(eraseSetOf(DRAFTS, tid('G1'))).toEqual({ subDrafts: 0, attachments: 0 }); // a leaf
    expect(eraseSetOf(DRAFTS, tid('Z9'))).toEqual({ subDrafts: 0, attachments: 0 });
    const loop = [
      { ticketId: tid('A1'), parentId: tid('B1'), attachmentCount: 1 },
      { ticketId: tid('B1'), parentId: tid('A1'), attachmentCount: 1 },
    ];
    expect(eraseSetOf(loop, tid('A1'))).toEqual({ subDrafts: 1, attachments: 2 });
  });
});

describe('28.141 the registry', () => {
  it('28.141 the module is the three tools in order, each described word for word, and allTools ends with them', () => {
    const { session } = fake();
    const tools = draftTools(session);
    expect(tools.map((t) => t.name)).toEqual(['list_my_drafts', 'publish_draft', 'discard_draft']);
    expect(tools.map((t) => Object.keys(t.inputSchema).sort())).toEqual([
      ['cursor', 'limit', 'projectId', 'workspaceId'],
      ['ticketId', 'workspaceId'],
      ['confirm_name', 'ticketId', 'workspaceId'],
    ]);
    for (const tool of tools) expect(tool.description.length, `${tool.name} has no description`).toBeGreaterThan(0);
    // What an assistant reads before it calls, pinned exactly (P20 class 2d).
    expect(tools.map((t) => t.description)).toEqual([
      'List your drafts: tickets only you can see, until you publish them. They have no key. Reads across every workspace you ' +
        'belong to; narrow it with `workspaceId` and/or `projectId`. Each draft names its project, type and parent. ' +
        'Pages with `cursor`; the response carries `nextCursor` (null on the last page).',
      'Publish one of your drafts: it takes its key and joins the end of its project\'s Backlog, and everyone who can see the project ' +
        'can now see it. A draft whose parent is still a draft cannot be published until the parent is. The answer carries the new key.',
      'Discard one of your drafts: it is erased, with its sub-drafts and the attachments uploaded to them, and cannot be recovered. ' +
        'confirm_name must be the draft\'s exact title; without it you get a preview of what would be erased and nothing changes. ' +
        'Only a draft can be discarded: use delete_ticket for a published ticket.',
    ]);
    expect(allTools(session).map((t) => t.name).slice(-4)).toEqual(['list_deleted', 'list_my_drafts', 'publish_draft', 'discard_draft']);
  });
});

/** The people-lookup answers 28.146 and 28.147 share: a member and an outsider. */
const ASHA = { userId: '01J0ASHA0000000000000000AA', name: 'Asha Rao', email: 'asha@example.com', inWorkspace: true };
const RAVI = { userId: '01J0RAV10000000000000000AA', name: 'Ravi Menon', email: 'ravi@example.com', inWorkspace: false };
const R8 = 'refused by draft.no-outsiders: Publish the ticket before inviting someone from outside';
const GUEST = 'Ravi Menon is not in this workspace and WILL BE ADDED AS A GUEST. They will join this workspace as a guest and see only this ticket.';

describe('28.146 create_ticket {draft} by email: an outsider is refused in the preview, in the server\'s words', () => {
  const DIRECTORY = { workspaces: [{ workspaceId: WS, name: 'Corner Shop', prefix: 'CS', role: 'owner', archived: false, projects: [{ projectId: PRJ, name: 'Counter', description: null, prefix: 'CC', archived: false }] }] };
  const call1 = async (person: typeof ASHA, extra: Record<string, unknown>) => {
    const f = fake({
      get: (path) => { if (path === '/v1/me/workspaces') return DIRECTORY; throw new Error(`unexpected GET ${path}`); },
      post: (path) => { if (path === `/v1/workspaces/${WS}/people-lookup`) return { user: person }; throw new Error(`unexpected POST ${path}`); },
    });
    const out = (await pick(writeTools(f.session), 'create_ticket').handler({ ...BIRTH, assignee_email: person.email, ...extra })) as {
      preview: boolean; wouldChange: string; joinsAsGuest: boolean;
    };
    expect(f.sent, 'call 1 creates nothing').toEqual([]);
    return out;
  };
  const head = (p: typeof ASHA) => `Creates "Plan the stock count" in Counter (Corner Shop) and assigns it to ${p.name} (${p.email}).`;

  it('28.146 a draft for an outsider previews the R8 refusal, not a guest; a member and a non-draft are unchanged; the sentence has one definition', async () => {
    // (1) draft + outsider: the server's own refusal, word for word, and no promise of a guest.
    const refused = await call1(RAVI, { draft: true });
    expect(refused.wouldChange).toBe(`${head(RAVI)} ${R8}`);
    expect(refused.wouldChange).not.toContain('WILL BE ADDED AS A GUEST');
    expect(refused.joinsAsGuest).toBe(false);

    // (2) CONTROL: draft + a member names the member and carries no R8 text.
    const member = await call1(ASHA, { draft: true });
    expect(member.wouldChange).toBe(`${head(ASHA)} Asha Rao is already in this workspace.`);
    expect(member.joinsAsGuest).toBe(false);

    // (3) CONTROL: not a draft + an outsider is the guest preview MCP sweep 2 T8 shipped, unchanged.
    for (const extra of [{}, { draft: false }]) {
      const guest = await call1(RAVI, extra);
      expect(guest.wouldChange, JSON.stringify(extra)).toBe(`${head(RAVI)} ${GUEST}`);
      expect(guest.joinsAsGuest).toBe(true);
    }

    // (4) ONE definition: the sentence is spelled once in the product's source, in the domain, and the server reads it there.
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
    const spelled: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && readFileSync(path, 'utf8').includes(DRAFT_NO_OUTSIDERS_REASON)) spelled.push(relative(root, path));
      }
    };
    for (const top of ['apps', 'packages']) {
      for (const pkg of readdirSync(join(root, top))) {
        for (const src of ['src', 'app']) {
          try { walk(join(root, top, pkg, src)); } catch { /* a package without that folder */ }
        }
      }
    }
    expect(spelled).toEqual(['packages/domain/src/draft.ts']);
    expect(readFileSync(join(root, 'apps/server/src/routes/people.ts'), 'utf8')).toMatch(/DRAFT_NO_OUTSIDERS_REASON,\n[^]*from '@gisik-nokma\/domain'/); // CONTROL: the server reads it
  });
});

describe('28.147 assign_ticket by email on an EXISTING draft: an outsider is refused in the preview, in the server\'s words', () => {
  const call1 = async (person: typeof ASHA, draft: boolean) => {
    const f = fake({
      get: (path) => { if (path === `/v1/workspaces/${WS}/tickets/${ROOT}`) return detail({ draft }); throw new Error(`unexpected GET ${path}`); },
      post: (path) => { if (path === `/v1/workspaces/${WS}/people-lookup`) return { user: person }; throw new Error(`unexpected POST ${path}`); },
    });
    const out = (await pick(writeTools(f.session), 'assign_ticket').handler({ workspaceId: WS, ticketId: ROOT, assignee_email: person.email })) as {
      preview: boolean; wouldChange: string; joinsAsGuest: boolean;
    };
    expect(f.sent, 'call 1 assigns nobody').toEqual([]);
    return out;
  };

  it('28.147 an existing draft for an outsider previews the R8 refusal, not a guest; a member and a published ticket are unchanged', async () => {
    // (1) an existing draft + an outsider: the server's own refusal, word for word, and no promise of a guest. A draft has no key,
    // so the preview names it by id.
    const refused = await call1(RAVI, true);
    expect(refused.wouldChange).toBe(`Assigns ${ROOT} "Count the crates" to Ravi Menon (ravi@example.com). ${R8}`);
    expect(refused.wouldChange).not.toContain('WILL BE ADDED AS A GUEST');
    expect(refused.joinsAsGuest).toBe(false);

    // (2) CONTROL: the same draft + a member names the member and carries no R8 text.
    const member = await call1(ASHA, true);
    expect(member.wouldChange).toBe(`Assigns ${ROOT} "Count the crates" to Asha Rao (asha@example.com). Asha Rao is already in this workspace.`);
    expect(member.joinsAsGuest).toBe(false);

    // (3) CONTROL: a published ticket + an outsider is the guest preview MCP sweep 2 shipped, unchanged.
    const guest = await call1(RAVI, false);
    expect(guest.wouldChange).toBe(`Assigns K-1 "Count the crates" to Ravi Menon (ravi@example.com). ${GUEST}`);
    expect(guest.joinsAsGuest).toBe(true);
  });
});

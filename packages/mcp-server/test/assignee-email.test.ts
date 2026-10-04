import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-client.js';
import { writeTools } from '../src/tools/write-tools.js';
import { eventBatches, recordingSession, type Recorded } from './fixtures/recording-session.js';

/**
 * MCP sweep 2 T7, package half of cases 14.638-14.649 and 14.652 (the hosted half is
 * `apps/server/test/mcp/mcp-assignee-email.test.ts`): what `assign_ticket` asks, shows and sends when it is given an
 * email address, with every request recorded. A preview is a successful answer that wrote nothing, so every case
 * asserts the RECORDED REQUESTS, never the reply alone.
 */
const WS = 'W1';
const T = 'T1';
const P = 'P1';
const ME = '01J0A5ER0000000000000000AA';
const LOOKUP = `/v1/workspaces/${WS}/people-lookup`;
const OUTSIDER = `/v1/workspaces/${WS}/assign-outsider`;
const ASHA = { userId: '01J0ASHA0000000000000000AA', name: 'Asha Rao', email: 'asha@example.com', inWorkspace: true };
const RAVI = { userId: '01J0RAVI0000000000000000AA', name: 'Ravi Menon', email: 'ravi@example.com', inWorkspace: false };
type Person = typeof ASHA;
const COMMITTED = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T00:00:00.000Z' };
const DETAIL = { key: 'CCSO-4', title: 'Fix login', ticketState: { fields: {}, workflowId: 'wf' }, rollup: null };
const DIRECTORY = { workspaces: [{ workspaceId: WS, name: 'Corner Shop', prefix: 'CCSO', role: 'owner', archived: false, projects: [{ projectId: P, name: 'Counter', description: null, prefix: 'CC', archived: false }] }] };
const miss = 'No user with that email. Someone you can already see in this workspace is assigned with assigneeId (find their userId with list_members).';
const GUEST_SENTENCE = 'They will join this workspace as a guest and see only this ticket.';
const WORKSPACE_GONE = 'workspace not found or not visible to you';

/** One row per tool that takes `assignee_email`. */
type Row = {
  tool: 'assign_ticket' | 'create_ticket';
  claim: 'ticket.assigned' | 'ticket.created';
  args(extra?: Record<string, unknown>): Record<string, unknown>;
  /** The first half of `wouldChange` for a person. */
  headline(p: Person): string;
  /** The GETs call 1 may make, in order, besides the lookup. */
  reads: string[];
  /** Whether call 1 reads a ticket (create has none yet). */
  readsTicket: boolean;
  /** The assignee the claim carries. */
  assigneeIn(claim: Record<string, unknown>): unknown;
};
export const ROWS: Row[] = [
  {
    tool: 'assign_ticket', claim: 'ticket.assigned', readsTicket: true, reads: [`/v1/workspaces/${WS}/tickets/${T}`],
    args: (extra = {}) => ({ workspaceId: WS, ticketId: T, assignee_email: ASHA.email, ...extra }),
    headline: (p) => `Assigns CCSO-4 "Fix login" to ${p.name} (${p.email}).`,
    assigneeIn: (claim) => (claim['payload'] as { assigneeId: unknown }).assigneeId,
  },
  {
    tool: 'create_ticket', claim: 'ticket.created', readsTicket: false, reads: ['/v1/me/workspaces'],
    args: (extra = {}) => ({ workspaceId: WS, projectId: P, typeId: 'task', title: 'Fix login', assignee_email: ASHA.email, ...extra }),
    headline: (p) => `Creates "Fix login" in Counter (Corner Shop) and assigns it to ${p.name} (${p.email}).`,
    assigneeIn: (claim) => (claim['payload'] as { assigneeId: unknown }).assigneeId,
  },
];

type Stub = ReturnType<typeof recordingSession>;
function stub(opts: { lookup?: (email: string, call: number) => Person | null; outsider?: (body: unknown) => unknown; events?: (events: Array<Record<string, unknown>>) => unknown } = {}): Stub & { lookups(): number } {
  let calls = 0;
  const byEmail = (email: string): Person | null => {
    const wanted = email.trim().toLowerCase();
    return wanted === ASHA.email ? ASHA : wanted === RAVI.email ? RAVI : null;
  };
  const rec = recordingSession({
    ...(opts.events === undefined ? {} : { events: opts.events }),
    routes: {
      [`GET /v1/workspaces/${WS}/tickets/${T}`]: DETAIL,
      'GET /v1/me/workspaces': DIRECTORY,
      [`POST ${LOOKUP}`]: (body: unknown) => {
        calls += 1;
        return { user: (opts.lookup ?? byEmail)((body as { email: string }).email, calls) };
      },
      [`POST ${OUTSIDER}`]: (body: unknown) => (opts.outsider === undefined ? { result: COMMITTED } : opts.outsider(body)),
    },
  });
  return { ...rec, lookups: () => calls };
}
const call = (row: Row, s: Stub, extra: Record<string, unknown> = {}) => {
  const found = writeTools(s.session).find((t) => t.name === row.tool);
  if (found === undefined) throw new Error(`no ${row.tool}`);
  return found.handler(row.args(extra));
};
const at = (requests: Recorded[], path: string) => requests.filter((r) => r.path === path);
/** Every request that is not a GET and not the lookup: a write of any kind. */
const writes = (requests: Recorded[]) => requests.filter((r) => r.method !== 'GET' && r.path !== LOOKUP);
type Preview = { preview: boolean; wouldChange: string; person: Person; joinsAsGuest: boolean; counts: object; nothingChanged: boolean; confirm: string };

describe('assign_ticket: the arguments', () => {
  it('14.638 assigneeId alone is unchanged (a person, or null); both, neither, or confirm_assignee without an email is refused before any request', async () => {
    const row = ROWS[0]!;
    const alone = stub();
    const assign = writeTools(alone.session).find((t) => t.name === 'assign_ticket')!;
    await assign.handler({ workspaceId: WS, ticketId: T, assigneeId: 'U2' });
    await assign.handler({ workspaceId: WS, ticketId: T, assigneeId: null });
    const batches = eventBatches(alone.requests);
    expect(batches.map((b) => (b[0]!['payload'] as { assigneeId: unknown }).assigneeId)).toEqual(['U2', null]);
    expect(alone.requests.filter((r) => r.method === 'GET' || r.path === LOOKUP), 'the old path reads and looks up nothing').toEqual([]);
    const exactlyOne = 'assign_ticket takes exactly one of assigneeId (a person\'s id, or null to unassign) and assignee_email (an address, confirmed in a second call)';
    for (const [label, args, sentence] of [
      ['both', { workspaceId: WS, ticketId: T, assigneeId: 'U2', assignee_email: ASHA.email }, exactlyOne],
      ['neither', { workspaceId: WS, ticketId: T }, exactlyOne],
      ['confirm without an email', { workspaceId: WS, ticketId: T, assigneeId: 'U2', confirm_assignee: ASHA.userId }, 'confirm_assignee only goes with assignee_email'],
    ] as const) {
      const s = stub();
      // The exact sentence (P20): `toThrow(new Error(...))` compares the whole message.
      await expect(writeTools(s.session).find((t) => t.name === row.tool)!.handler({ ...args }), label).rejects.toThrow(new Error(sentence));
      expect(s.requests, `${label}: nothing sent`).toEqual([]);
    }
    // `assignee_email` is `min(1)`: an empty address is refused before any request (just outside); a one-character
    // address reaches the lookup and is answered by it (just inside, here a miss).
    const empty = stub();
    await expect(call(row, empty, { assignee_email: '' })).rejects.toThrow();
    expect(empty.requests, 'an empty address: nothing sent').toEqual([]);
    const one = stub();
    await expect(call(row, one, { assignee_email: 'x' })).rejects.toThrow(new Error(miss));
    expect(at(one.requests, LOOKUP).map((r) => r.body)).toEqual([{ email: 'x' }]);
    // The tool's own description, exactly (MCP text an assistant reads; 14.75 relies on "assigneeId null").
    expect(assign.description).toBe(
      'Assign a ticket to somebody, or pass assigneeId null to leave it unassigned. To assign someone by their email address instead, pass assignee_email (and no assigneeId): ' +
        'the first call looks the address up and answers a PREVIEW naming the person and saying whether they are already in the workspace or WILL BE ADDED AS A GUEST (who would then see only this ticket); ' +
        'nothing changes. Repeat the call with confirm_assignee set to that person\'s userId from the preview to assign. The address must belong to a person with a verified account.',
    );
  });
});

describe('assignee_email: the confirmation (package)', () => {
  it('14.639 call 1 for a person in the workspace answers the preview with the app\'s sentence and makes only the reads and ONE lookup', async () => {
    for (const row of ROWS) {
      const s = stub();
      const out = (await call(row, s)) as Preview;
      expect(out, row.tool).toMatchObject({ preview: true, person: ASHA, joinsAsGuest: false, counts: {}, nothingChanged: true, confirm: `confirm_assignee must be "${ASHA.userId}"` });
      expect(out.wouldChange).toBe(`${row.headline(ASHA)} Asha Rao is already in this workspace.`);
      expect(at(s.requests, LOOKUP)).toHaveLength(1);
      expect(s.requests.filter((r) => r.method === 'GET').map((r) => r.path)).toEqual(row.reads);
      expect(writes(s.requests), `${row.tool}: no event, no assign-outsider`).toEqual([]);
      expect(out.wouldChange).not.toMatch(/guest/i);
    }
    // A ticket with no key yet is named by its id (`ticket.key ?? ticketId`).
    const keyless = recordingSession({ routes: { [`GET /v1/workspaces/${WS}/tickets/${T}`]: { ...DETAIL, key: null }, [`POST ${LOOKUP}`]: { user: ASHA } } });
    const out = (await call(ROWS[0]!, { ...stub(), ...keyless })) as Preview;
    expect(out.wouldChange).toBe(`Assigns ${T} "Fix login" to Asha Rao (asha@example.com). Asha Rao is already in this workspace.`);
  });

  it('14.640 call 1 for a person outside says in so many words they WILL BE ADDED AS A GUEST, then the app\'s own sentence, and sends nothing', async () => {
    for (const row of ROWS) {
      const s = stub();
      const out = (await call(row, s, { assignee_email: RAVI.email })) as Preview;
      expect(out, row.tool).toMatchObject({ preview: true, joinsAsGuest: true, person: RAVI, confirm: `confirm_assignee must be "${RAVI.userId}"` });
      expect(out.wouldChange).toBe(`${row.headline(RAVI)} Ravi Menon is not in this workspace and WILL BE ADDED AS A GUEST. ${GUEST_SENTENCE}`);
      expect(writes(s.requests)).toEqual([]);
    }
  });

  it('14.641 call 2 with the resolved userId for a person in the workspace sends ONE claim through /v1/events (origin mcp, the session user) and never calls assign-outsider', async () => {
    for (const row of ROWS) {
      const s = stub();
      const out = (await call(row, s, { confirm_assignee: ASHA.userId })) as Record<string, unknown>;
      expect(out['status'] ?? (out['eventId'] === undefined ? undefined : 'committed'), row.tool).toBe('committed');
      const batches = eventBatches(s.requests);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(1);
      expect(batches[0]![0]).toMatchObject({ type: row.claim, origin: 'mcp', actorId: ME, workspaceId: WS });
      expect(row.assigneeIn(batches[0]![0]!)).toBe(ASHA.userId);
      expect(at(s.requests, OUTSIDER)).toEqual([]);
      expect(at(s.requests, LOOKUP)).toHaveLength(1); // call 2 does its OWN lookup (this stub saw no call 1): a call 2 that trusted confirm_assignee without looking up would make 0
    }
  });

  it('14.642 call 2 for a person outside posts { userId, event } to assign-outsider once and sends nothing through /v1/events', async () => {
    for (const row of ROWS) {
      const s = stub();
      const out = (await call(row, s, { assignee_email: RAVI.email, confirm_assignee: RAVI.userId })) as Record<string, unknown>;
      expect(out['status'] ?? (out['eventId'] === undefined ? undefined : 'committed'), row.tool).toBe('committed');
      const posts = at(s.requests, OUTSIDER);
      expect(posts).toHaveLength(1);
      expect(posts[0]!.body).toMatchObject({ userId: RAVI.userId, event: { type: row.claim, origin: 'mcp', actorId: ME, workspaceId: WS } });
      expect(row.assigneeIn((posts[0]!.body as { event: Record<string, unknown> }).event)).toBe(RAVI.userId);
      expect(eventBatches(s.requests)).toEqual([]);
    }
  });

  it('14.643 a confirm_assignee that is not exactly the userId the email resolves to NOW (another id, the email, the name, a trailing space, the wrong case, empty) answers the fresh preview and writes nothing; the exact id writes', async () => {
    for (const row of ROWS) {
      const s = stub();
      for (const wrong of [RAVI.userId, ASHA.email, ASHA.name, `${ASHA.userId} `, ASHA.userId.toLowerCase(), '']) {
        const out = (await call(row, s, { confirm_assignee: wrong })) as Preview;
        expect(out.preview, `${row.tool}: ${JSON.stringify(wrong)}`).toBe(true);
        expect(out.person.userId).toBe(ASHA.userId); // the person the email resolves to now is the one shown
      }
      expect(writes(s.requests)).toEqual([]);
      await call(row, s, { confirm_assignee: ASHA.userId }); // CONTROL, same `it`
      expect(eventBatches(s.requests)).toHaveLength(1);
    }
  });

  it('14.644 re-resolution: when the email resolves to someone else between the calls, call 2 previews the NEW person and writes nothing; when it resolves to nobody, call 2 answers the miss', async () => {
    for (const row of ROWS) {
      const moved = stub({ lookup: (_email, n) => (n === 1 ? ASHA : RAVI) });
      const first = (await call(row, moved)) as Preview;
      expect(first.person.userId).toBe(ASHA.userId);
      const second = (await call(row, moved, { confirm_assignee: first.person.userId })) as Preview;
      expect(second).toMatchObject({ preview: true, joinsAsGuest: true, person: { userId: RAVI.userId } });
      expect(writes(moved.requests)).toEqual([]);
      const gone = stub({ lookup: (_email, n) => (n === 1 ? ASHA : null) });
      await call(row, gone);
      await expect(call(row, gone, { confirm_assignee: ASHA.userId }), row.tool).rejects.toThrow(miss);
      expect(writes(gone.requests)).toEqual([]);
    }
  });

  it('14.645 no match answers "No user with that email." and the hint, on call 1 and on call 2, and writes nothing', async () => {
    for (const row of ROWS) {
      const s = stub({ lookup: () => null });
      await expect(call(row, s, { assignee_email: 'nobody@example.com' }), row.tool).rejects.toThrow(new Error(miss));
      await expect(call(row, s, { assignee_email: 'nobody@example.com', confirm_assignee: ASHA.userId })).rejects.toThrow(new Error(miss));
      expect(writes(s.requests)).toEqual([]);
      // An answer with no `user` key at all is a miss too (the route always sends one; the tool must not parse `undefined`).
      const bare = recordingSession({ routes: { [`GET /v1/workspaces/${WS}/tickets/${T}`]: DETAIL, 'GET /v1/me/workspaces': DIRECTORY, [`POST ${LOOKUP}`]: {} } });
      await expect(call(row, { ...stub(), ...bare })).rejects.toThrow(new Error(miss));
      expect(writes(bare.requests)).toEqual([]);
    }
  });

  it('14.646 a ticket the caller cannot see answers the ticket sentence and makes NO lookup; a lookup the server refuses (a guest, a stranger) answers the workspace sentence', async () => {
    for (const row of ROWS.filter((r) => r.readsTicket)) {
      const s = stub({});
      const hidden = recordingSession({ routes: { [`POST ${LOOKUP}`]: { user: ASHA } } }); // no ticket route: a 404
      await expect(call(row, { ...s, ...hidden })).rejects.toThrow(new Error('ticket not found or not visible to you'));
      expect(at(hidden.requests, LOOKUP), 'no lookup for a ticket the caller cannot see').toEqual([]);
    }
    for (const row of ROWS) {
      const refused = recordingSession({
        routes: { [`GET /v1/workspaces/${WS}/tickets/${T}`]: DETAIL, 'GET /v1/me/workspaces': DIRECTORY, [`POST ${LOOKUP}`]: () => { throw new HttpError(404, { error: 'not_found' }); } },
      });
      await expect(call(row, { ...stub(), ...refused }), row.tool).rejects.toThrow(new Error(WORKSPACE_GONE));
      expect(writes(refused.requests)).toEqual([]);
      // The outsider door answers 404 too when the caller is no longer a member between the calls: the same sentence, and
      // nothing goes through /v1/events instead. CONTROL, same `it`: a 500 there is not reworded.
      const gone = stub({ outsider: () => { throw new HttpError(404, { error: 'not_found' }); } });
      await expect(call(row, gone, { assignee_email: RAVI.email, confirm_assignee: RAVI.userId })).rejects.toThrow(new Error(WORKSPACE_GONE));
      expect(at(gone.requests, OUTSIDER)).toHaveLength(1);
      expect(eventBatches(gone.requests)).toEqual([]);
      const broken = stub({ outsider: () => { throw new HttpError(500, { error: 'boom' }); } });
      await expect(call(row, broken, { assignee_email: RAVI.email, confirm_assignee: RAVI.userId })).rejects.toBeInstanceOf(HttpError);
    }
  });

  it('14.647 a refusal after confirmation is the server\'s words, never "answered 422": the outsider route\'s nested { result } is unwrapped, and the in-workspace refusal is spelled the same', async () => {
    const refusal = { status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'That person is not in this workspace.' };
    for (const row of ROWS) {
      const outsider = stub({ outsider: () => { throw new HttpError(422, { result: refusal }); } });
      const failure = await call(row, outsider, { assignee_email: RAVI.email, confirm_assignee: RAVI.userId }).catch((e: Error) => e);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message, row.tool).toBe('refused by permission.role: That person is not in this workspace.');
      expect((failure as Error).message).not.toContain('answered 422');
      const inside = stub({ events: () => ({ results: [refusal] }) });
      await expect(call(row, inside, { confirm_assignee: ASHA.userId })).rejects.toThrow('refused by permission.role: That person is not in this workspace.');
    }
  });

  it('14.648 a 429 from the lookup answers a sentence saying lookups are rate limited and how long to wait, and writes nothing', async () => {
    for (const row of ROWS) {
      const s = stub({ lookup: () => { throw new HttpError(429, { error: 'rate_limited', retryAfterSeconds: 42 }); } });
      await expect(call(row, s), row.tool).rejects.toThrow(new Error('Looking people up by email is rate limited right now. Wait about 42 seconds and call this again; nothing was changed.'));
      expect(writes(s.requests)).toEqual([]);
      await expect(call(row, stub())).resolves.toMatchObject({ preview: true }); // CONTROL: the same call without the 429
    }
  });

  it('14.649 the address goes to the lookup exactly as typed (the route trims and folds case), and the confirmation is the userId, so the case of the email never matters', async () => {
    for (const row of ROWS) {
      const s = stub();
      const typed = ' ASHA@Example.COM ';
      const first = (await call(row, s, { assignee_email: typed })) as Preview;
      expect(first.person.userId).toBe(ASHA.userId);
      expect(at(s.requests, LOOKUP)[0]!.body).toEqual({ email: typed });
      await call(row, s, { assignee_email: 'asha@example.com', confirm_assignee: first.person.userId });
      expect(eventBatches(s.requests)).toHaveLength(1);
    }
  });

  it('14.652 the preview says ADDED AS A GUEST if and only if the person is outside, and "guest" nowhere for a person in the workspace', async () => {
    for (const row of ROWS) {
      const inside = ((await call(row, stub())) as Preview).wouldChange;
      const outside = ((await call(row, stub(), { assignee_email: RAVI.email })) as Preview).wouldChange;
      expect(inside, row.tool).not.toContain('ADDED AS A GUEST');
      expect(inside).not.toMatch(/guest/i);
      expect(outside).toContain('ADDED AS A GUEST');
      expect(outside).toContain(GUEST_SENTENCE);
    }
  });
});

describe('create_ticket by email (package)', () => {
  const CREATE = (): Row => ROWS.find((r) => r.tool === 'create_ticket')!;
  const createWith = (s: Stub, extra: Record<string, unknown> = {}) => call(CREATE(), s, extra);
  const entityOf = (event: Record<string, unknown>) => (event['entity'] as { id: string }).id;

  it('14.653 assigneeId with assignee_email, and confirm_assignee without an email, are refused before any request; assigneeId alone and neither behave as before; the stateId/start check still runs first', async () => {
    for (const [label, extra, sentence] of [
      ['both', { assigneeId: 'U2' }, 'create_ticket takes at most one of assigneeId and assignee_email'],
      ['confirm without an email', { assignee_email: undefined, confirm_assignee: ASHA.userId }, 'confirm_assignee only goes with assignee_email'],
      // `assigneeId` too, so the new "at most one" check WOULD fire: only the order of the two checks decides the sentence.
      ['the older check first', { stateId: 'doing', start: 'backlog', assigneeId: 'U2' }, 'a backlog ticket has no starting status'],
    ] as const) {
      const s = stub();
      await expect(createWith(s, { ...extra }), label).rejects.toThrow(sentence);
      expect(s.requests, `${label}: nothing sent`).toEqual([]);
    }
    // assigneeId alone, "me" included, and neither: ONE event, no lookup, no read.
    const alone = stub();
    const make = writeTools(alone.session).find((t) => t.name === 'create_ticket')!;
    await make.handler({ workspaceId: WS, projectId: P, typeId: 'task', title: 'A', assigneeId: 'me' });
    await make.handler({ workspaceId: WS, projectId: P, typeId: 'task', title: 'B' });
    const batches = eventBatches(alone.requests);
    expect(batches.map((b) => (b[0]!['payload'] as { assigneeId?: string }).assigneeId)).toEqual([ME, undefined]);
    expect(alone.requests.filter((r) => r.method === 'GET' || r.path === LOOKUP), 'the old path reads and looks up nothing').toEqual([]);
  });

  it('14.654 call 1 creates nothing: one lookup, the directory read for the names, no event, no assign-outsider, and the markdown is not even converted', async () => {
    for (const email of [ASHA.email, RAVI.email]) {
      const s = stub();
      // A ticket key in the body: converting it is a `GET /v1/search` (`markdown-io.ts:32-36,48`), so a conversion on call 1 is
      // VISIBLE in the request list. Plain Markdown with no mention, key or note link makes no request at all.
      const out = (await createWith(s, { assignee_email: email, markdown: '## Steps\n\n1. ring the vendor about [[CCSO-12]]' })) as Preview;
      expect(out.preview).toBe(true);
      expect(at(s.requests, LOOKUP)).toHaveLength(1);
      expect(writes(s.requests)).toEqual([]);
      expect(s.requests.map((r) => r.path), 'the lookup, then the directory read for the names; nothing else').toEqual([LOOKUP, '/v1/me/workspaces']);
    }
    // CONTROL, same `it`: call 2 with the userId creates.
    const s = stub();
    await createWith(s, { confirm_assignee: ASHA.userId });
    expect(eventBatches(s.requests)).toHaveLength(1);
  });

  it('14.655 call 2 creates the ticket with assigneeId = the resolved userId (in the workspace: one ticket.created through /v1/events; an outsider: assign-outsider whose event IS that ticket.created), and the reply carries the new ticketId', async () => {
    const inside = stub();
    const a = (await createWith(inside, { confirm_assignee: ASHA.userId })) as { ticketId: string };
    const claim = eventBatches(inside.requests)[0]![0]!;
    expect(claim).toMatchObject({ type: 'ticket.created', origin: 'mcp', actorId: ME });
    expect((claim['payload'] as { assigneeId: string }).assigneeId).toBe(ASHA.userId);
    expect(a.ticketId).toBe(entityOf(claim));
    expect(a.ticketId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const outside = stub();
    const b = (await createWith(outside, { assignee_email: RAVI.email, confirm_assignee: RAVI.userId })) as { ticketId: string };
    const posted = at(outside.requests, OUTSIDER)[0]!.body as { userId: string; event: Record<string, unknown> };
    expect(posted.userId).toBe(RAVI.userId);
    expect(posted.event).toMatchObject({ type: 'ticket.created', origin: 'mcp', actorId: ME });
    expect((posted.event['payload'] as { assigneeId: string }).assigneeId).toBe(RAVI.userId);
    expect(b.ticketId).toBe(entityOf(posted.event));
    expect(eventBatches(outside.requests)).toEqual([]);
    expect(b.ticketId).not.toBe(a.ticketId); // CONTROL: each creation mints its own id
  });

  it('14.656 a confirmation that resolves to a miss or to a different person mints no ticket id into any request', async () => {
    const moved = stub({ lookup: (_e, n) => (n === 1 ? ASHA : RAVI) });
    await createWith(moved);
    await createWith(moved, { confirm_assignee: ASHA.userId });
    expect(writes(moved.requests)).toEqual([]);
    const gone = stub({ lookup: () => null });
    await expect(createWith(gone, { confirm_assignee: ASHA.userId })).rejects.toThrow(miss);
    expect(writes(gone.requests)).toEqual([]);
  });
});

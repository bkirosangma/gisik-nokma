import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS } from '@gisik-nokma/domain';
import { DEFAULT_POLL_INTERVAL_MS } from '../src/config.js';
import { createGisikClient } from '../src/http-client.js';
import { createSession, type Session } from '../src/session.js';
import { writeCachedToken } from '../src/token-cache.js';
import { discoveryTools } from '../src/tools/discovery-tools.js';
import { recordingSession, type Recorded } from './fixtures/recording-session.js';

/**
 * MCP sweep 2 T6, cases 14.627-14.630, 14.632-14.634, 14.637 (the hosted half is
 * `apps/server/test/mcp/mcp-preferences.test.ts`).
 */
const PREFS = '/v1/me/notification-preferences';
const find = (session: Session, name: string) => {
  const found = discoveryTools(session).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no ${name}`);
  return found;
};
const get = (s: Session) => find(s, 'get_notification_preferences').handler({});
const set = (s: Session, args: Record<string, unknown>) => find(s, 'set_notification_preferences').handler(args);
const puts = (requests: Recorded[]) => requests.filter((r) => r.method === 'PUT');
/** A server that keeps the document: GET reads it, PUT replaces it, as `apps/server/src/notification-preferences/store.ts:37-55` does. */
function stateful(initial: string[]) {
  let stored = { mutedKinds: initial };
  return recordingSession({ routes: { [`GET ${PREFS}`]: () => stored, [`PUT ${PREFS}`]: (body: unknown) => (stored = body as typeof stored) } });
}

/** The app's labels (`packages/app-core/src/account/notifications-section.tsx:4-12`), restated here so a drift in the tool's copy reddens. */
const KINDS_IN_WORDS =
  'assignment (A ticket is assigned to you); mention (You are mentioned in a comment, description or note); ' +
  'contested-claim (A claim of yours is contested); date-approaching (A date you are watching is approaching); ' +
  'stale-ticket (A ticket has sat unmoved for a while); flow-ready (A ticket is ready to start); ' +
  'flow-reopened (A ticket was reopened by a flow)';

describe('get_notification_preferences / set_notification_preferences (package)', () => {
  it('14.627 a person with nothing saved gets mutedKinds [] and every kind unmuted, in the domain\'s order; a malformed answer is an error, never "all on", and set writes nothing on it', async () => {
    const none = recordingSession({ routes: { [`GET ${PREFS}`]: { mutedKinds: [] } } });
    const out = (await get(none.session)) as { mutedKinds: string[]; kinds: Array<{ kind: string; muted: boolean }> };
    expect(out.mutedKinds).toEqual([]);
    expect(out.kinds).toEqual(NOTIFICATION_KINDS.map((kind) => ({ kind, muted: false })));
    expect(out.kinds.map((k) => k.kind)).toEqual(['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket', 'flow-ready', 'flow-reopened']);
    // CONTROL, same `it`: a muted kind shows as muted and only that one.
    const some = recordingSession({ routes: { [`GET ${PREFS}`]: { mutedKinds: ['mention'] } } });
    expect(((await get(some.session)) as typeof out).kinds.filter((k) => k.muted).map((k) => k.kind)).toEqual(['mention']);
    const odd = recordingSession({ routes: { [`GET ${PREFS}`]: { nope: 1 } } });
    await expect(get(odd.session)).rejects.toThrow(/^your notification preferences could not be read, so nothing was changed$/);
    // `set` reads through the same strict parse, so a malformed document that HAS mutes refuses and sends nothing: a read
    // that fell back to "nothing muted" would PUT ['assignment'] alone and wipe the stored `mention`. The PUT route echoes,
    // so a set that wrongly writes resolves instead of rejecting.
    const echo = (body: unknown) => body;
    const malformed = recordingSession({ routes: { [`GET ${PREFS}`]: { mutedKinds: ['mention'], extra: 1 }, [`PUT ${PREFS}`]: echo } });
    await expect(set(malformed.session, { mute: ['assignment'] })).rejects.toThrow(/^your notification preferences could not be read, so nothing was changed$/);
    expect(puts(malformed.requests)).toEqual([]);
    expect(malformed.requests).toEqual([{ method: 'GET', path: PREFS }]);
    // CONTROL, same `it`: the same call against the well-formed document PUTs the merge.
    const wellFormed = recordingSession({ routes: { [`GET ${PREFS}`]: { mutedKinds: ['mention'] }, [`PUT ${PREFS}`]: echo } });
    expect(await set(wellFormed.session, { mute: ['assignment'] })).toEqual({ mutedKinds: ['mention', 'assignment'], changed: true });
    expect(puts(wellFormed.requests)).toEqual([{ method: 'PUT', path: PREFS, body: { mutedKinds: ['mention', 'assignment'] } }]);
  });

  it('14.628 set sends the whole document with PUT and answers what was stored; a following get equals it; the stdio door does the same through a real client', async () => {
    const s = stateful([]);
    const stored = await set(s.session, { mute: ['mention'] });
    expect(stored).toEqual({ mutedKinds: ['mention'], changed: true });
    expect(puts(s.requests)).toEqual([{ method: 'PUT', path: PREFS, body: { mutedKinds: ['mention'] } }]);
    expect(await get(s.session)).toMatchObject({ mutedKinds: ['mention'] });
    // "What was stored" is the server's answer, not what was sent: a server that answers another document is believed.
    const other = recordingSession({ routes: { [`GET ${PREFS}`]: { mutedKinds: [] }, [`PUT ${PREFS}`]: { mutedKinds: ['stale-ticket', 'mention'] } } });
    expect(await set(other.session, { mute: ['mention'] })).toEqual({ mutedKinds: ['stale-ticket', 'mention'], changed: true });
    // An answer to the PUT that is not a preferences document is an error, never a success with no kinds.
    const broken = recordingSession({ routes: { [`GET ${PREFS}`]: { mutedKinds: [] }, [`PUT ${PREFS}`]: { nope: 1 } } });
    await expect(set(broken.session, { mute: ['mention'] })).rejects.toThrow();
    expect(puts(broken.requests)).toHaveLength(1);
    // The stdio door: createSession over a REAL client against a stub server (`Session.put` for real, NP-8).
    let doc = { mutedKinds: [] as string[] };
    const methods: string[] = [];
    const stub: typeof fetch = async (input, init) => {
      const req = new Request(input as string, init);
      methods.push(`${req.method} ${new URL(req.url).pathname}`);
      if (new URL(req.url).pathname !== PREFS) return new Response('{}', { status: 404 });
      if (req.method === 'PUT') doc = JSON.parse(await req.text()) as typeof doc;
      return new Response(JSON.stringify(doc), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const tokenPath = join(mkdtempSync(join(tmpdir(), 'gisik-np-')), 'mcp-token');
    await writeCachedToken(tokenPath, { token: 't', userId: 'U' });
    const real = await createSession({
      config: { serverUrl: 'http://server', tokenPath, pollIntervalMs: DEFAULT_POLL_INTERVAL_MS },
      client: createGisikClient('http://server', stub), prompt: () => {}, sleep: async () => {}, now: () => 0,
    });
    expect(await set(real, { mute: ['assignment'] })).toEqual({ mutedKinds: ['assignment'], changed: true });
    expect(((await get(real)) as { mutedKinds: string[] }).mutedKinds).toEqual(['assignment']);
    expect(methods).toEqual([`GET ${PREFS}`, `PUT ${PREFS}`, `GET ${PREFS}`]);
  });

  it('14.629 read-modify-write: mute adds, unmute removes, nothing is duplicated, and a call that changes nothing sends no PUT', async () => {
    const s = stateful(['mention']);
    expect(await set(s.session, { mute: ['assignment'] })).toEqual({ mutedKinds: ['mention', 'assignment'], changed: true });
    expect(await set(s.session, { unmute: ['mention'] })).toEqual({ mutedKinds: ['assignment'], changed: true });
    expect(puts(s.requests).map((p) => (p.body as { mutedKinds: string[] }).mutedKinds)).toEqual([['mention', 'assignment'], ['assignment']]);
    // No change: already muted, and unmuting what is not muted.
    expect(await set(s.session, { mute: ['assignment'] })).toEqual({ mutedKinds: ['assignment'], changed: false });
    expect(await set(s.session, { unmute: ['stale-ticket'] })).toEqual({ mutedKinds: ['assignment'], changed: false });
    expect(puts(s.requests)).toHaveLength(2);
    // CONTROL, same `it`: a repeated kind in one call is stored once.
    expect(await set(s.session, { mute: ['stale-ticket', 'stale-ticket'] })).toMatchObject({ mutedKinds: ['assignment', 'stale-ticket'], changed: true });
    // A change of the same length is a change (a swap), and so is a change that only shortens the list (its last kind unmuted).
    const swap = stateful(['mention']);
    expect(await set(swap.session, { mute: ['assignment'], unmute: ['mention'] })).toEqual({ mutedKinds: ['assignment'], changed: true });
    expect(puts(swap.requests).map((p) => p.body)).toEqual([{ mutedKinds: ['assignment'] }]);
    const tail = stateful(['assignment', 'stale-ticket']);
    expect(await set(tail.session, { unmute: ['stale-ticket'] })).toEqual({ mutedKinds: ['assignment'], changed: true });
    expect(puts(tail.requests).map((p) => p.body)).toEqual([{ mutedKinds: ['assignment'] }]);
  });

  it('14.630 both lists empty or absent, a kind in both, and an unknown kind are refused before any request', async () => {
    const NEEDS = /^set_notification_preferences needs mute, unmute or both, with at least one kind$/;
    for (const [label, args, sentence] of [
      ['nothing', {}, NEEDS],
      ['both empty', { mute: [], unmute: [] }, NEEDS],
      ['a kind in both', { mute: ['assignment', 'mention'], unmute: ['stale-ticket', 'mention'] }, /^mention is in both mute and unmute; choose one$/],
      ['an unknown kind', { mute: ['bogus'] }, /bogus/],
    ] as const) {
      const s = stateful([]);
      await expect(set(s.session, { ...args }), label).rejects.toThrow(sentence);
      expect(s.requests, `${label}: no request, not even the read`).toEqual([]);
    }
    // CONTROL, same `it`: one kind goes through.
    const ok = stateful([]);
    expect(await set(ok.session, { unmute: ['mention'], mute: ['assignment'] })).toMatchObject({ changed: true });
  });

  it('14.632 both descriptions name every member of NOTIFICATION_KINDS and the app\'s label for each, so a kind added later fails here', () => {
    const { session } = recordingSession();
    const missing = (description: string): string[] => NOTIFICATION_KINDS.filter((kind) => !description.includes(kind));
    for (const name of ['get_notification_preferences', 'set_notification_preferences']) {
      const description = find(session, name).description;
      expect(missing(description), `${name} is missing kinds`).toEqual([]);
      expect(description).toContain('You are mentioned in a comment, description or note'); // the app's label for mention
      // The kind NAMES come from NOTIFICATION_KINDS itself, so `missing()` stays green when a kind has no words: KINDS_IN_WORDS then
      // prints `kind (undefined)`. This leg is what turns "a kind added later" red at RUN time, not only at typecheck.
      expect(description).not.toContain('(undefined)');
      expect(description, `${name} carries every label in the domain's order`).toContain(`The kinds: ${KINDS_IN_WORDS}.`);
    }
    // Exact: what an assistant reads is pinned whole.
    expect(find(session, 'get_notification_preferences').description).toBe(
      'Which kinds of notification you have muted. The setting is yours alone and covers every workspace. A muted kind is hidden from your inbox and its unread ' +
        `count (list_notifications omits it) but is still recorded, so unmuting brings it back. The kinds: ${KINDS_IN_WORDS}.`,
    );
    expect(find(session, 'set_notification_preferences').description).toBe(
      'Mute or unmute kinds of notification, changing only the kinds you name; every other kind stays as it is. mute: [...] hides those kinds from your inbox, ' +
        `unmute: [...] shows them again. Give at least one kind, and no kind in both lists. The kinds: ${KINDS_IN_WORDS}.`,
    );
    // CONTROL, same `it`: the check can see a missing kind.
    expect(missing('mention only')).toEqual(NOTIFICATION_KINDS.filter((kind) => kind !== 'mention'));
  });

  it('14.633 the tools take no user: get has no arguments, set has only mute and unmute', () => {
    const { session } = recordingSession();
    expect(Object.keys(find(session, 'get_notification_preferences').inputSchema)).toEqual([]);
    expect(Object.keys(find(session, 'set_notification_preferences').inputSchema).sort()).toEqual(['mute', 'unmute']);
    expect(Object.keys(find(session, 'list_saved_filters').inputSchema)).toEqual(['workspaceId']);
  });
});

describe('list_saved_filters (package)', () => {
  // Stored order is f2 then f1 on purpose: sorted by id ('f1' < 'f2') or by name ('Mine, open' < 'P1s') both reverse it, so
  // "in stored order" can fail.
  const doc = {
    savedFilters: [
      { id: 'f2', name: 'P1s', filterSpec: { priority: 'P1' } },
      { id: 'f1', name: 'Mine, open', filterSpec: { assigneeId: 'U1', closed: false } },
    ],
    listColumns: { P1: ['status'] }, grouping: {},
  };
  const list = (s: Session) => find(s, 'list_saved_filters').handler({ workspaceId: 'W1' });

  it('14.634 lists the caller\'s saved filters for the workspace in stored order as { id, name, filter }, nothing else of the document; none saved is []; it only reads', async () => {
    const s = recordingSession({ routes: { 'GET /v1/me/preferences': doc } });
    expect(await list(s.session)).toEqual({
      workspaceId: 'W1',
      savedFilters: [
        { id: 'f2', name: 'P1s', filter: { priority: 'P1' } },
        { id: 'f1', name: 'Mine, open', filter: { assigneeId: 'U1', closed: false } },
      ],
    });
    expect(s.requests).toEqual([{ method: 'GET', path: '/v1/me/preferences?workspaceId=W1' }]);
    // CONTROL, same `it`: nothing saved is an empty list, and listColumns / grouping never leak.
    const empty = recordingSession({ routes: { 'GET /v1/me/preferences': { savedFilters: [], listColumns: {}, grouping: {} } } });
    expect(await list(empty.session)).toEqual({ workspaceId: 'W1', savedFilters: [] });
    expect(JSON.stringify(await list(s.session))).not.toContain('listColumns');
    // A document that is not a list of saved filters is an error in its own words, never an empty list.
    // One leg per guard: not a list, no id, no name, a filter that is not an object.
    for (const [label, bad] of [
      ['not a list', { savedFilters: 'x' }],
      ['no id', { savedFilters: [{ name: 'n', filterSpec: {} }] }],
      ['no name', { savedFilters: [{ id: 'f9', filterSpec: {} }] }],
      ['a filter that is not an object', { savedFilters: [{ id: 'f9', name: 'n', filterSpec: 'x' }] }],
    ] as const) {
      const odd = recordingSession({ routes: { 'GET /v1/me/preferences': bad } });
      await expect(list(odd.session), label).rejects.toThrow(/^your saved filters could not be read$/);
    }
    expect(find(s.session, 'list_saved_filters').description).toBe(
      'Your saved filters in one workspace (the named views on the project page): id, name and filter. Pass a filter to list_tickets or search exactly as it is. ' +
        'Only yours, and read-only.',
    );
  });

  it('14.637 a workspace the caller cannot see answers the uniform sentence, and the tool never writes', async () => {
    const gone = recordingSession(); // no route: a 404
    await expect(list(gone.session)).rejects.toThrow(/^workspace not found or not visible to you$/);
    // `every` over an empty list is true: pin the one read first, then that nothing else was sent.
    expect(gone.requests).toEqual([{ method: 'GET', path: '/v1/me/preferences?workspaceId=W1' }]);
    const ok = recordingSession({ routes: { 'GET /v1/me/preferences': doc } });
    await list(ok.session);
    expect(ok.requests).toEqual([{ method: 'GET', path: '/v1/me/preferences?workspaceId=W1' }]); // CONTROL: nor does a success
  });
});

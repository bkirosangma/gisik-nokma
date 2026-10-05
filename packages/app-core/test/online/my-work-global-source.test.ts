import { describe, expect, it } from 'vitest';
import { createOnlineDataSource } from '../../src/online/online-data-source.js';
import { MappingError } from '../../src/online/mappers.js';
import { HttpError } from '../../src/online/http.js';

/**
 * The global My work page's data-source half (my-work-global T3, cases 30.025–30.028): the
 * opt-in `show` on the attention read, `workspaceId` on every attention item, and the
 * user-level My work preferences document.
 */

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const ANSELMA = '01J9GUSA000000000000000000';

function recordingFetch(answers: Record<string, unknown>) {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push(init === undefined ? { input } : { input, init });
    const path = input.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? '';
    const body = answers[`${init?.method ?? 'GET'} ${path}`] ?? answers[path];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body,
    } as Response;
  };
  return { fetchImpl, calls };
}

const provenance = {
  actorId: ANSELMA,
  clientTime: '2026-10-01T04:00:00.000Z',
  serverTime: '2026-10-01T04:00:01.000Z',
};

/** The fields `mapAttentionItem` reads off a `TicketCard`, and the workspace it names. */
const card = (ticketId: string) => ({
  ticketId,
  workspaceId: WS,
  projectId: PROJECT,
  title: `Ticket ${ticketId}`,
  stateProvenance: provenance,
});

const ATTENTION_BODY = {
  workspaceId: WS,
  generatedAt: '2026-10-05T10:00:00.000Z',
  settings: { staleDays: 7, dueSoonDays: 7, autoCloseAfterDays: null, provenance: null },
  items: [{ kind: 'blocked', card: card('t-blocked'), stateName: 'Waiting', reason: 'In the blocked state "Waiting".' }],
};

const CONTESTS_BODY = {
  contests: [
    {
      workspaceId: WS,
      ticketId: 't-contested',
      title: 'Chase the licence renewal',
      projectId: PROJECT,
      rule: 'state-machine',
      reason: 'no transition from done to doing',
    },
  ],
};

const attentionAnswers = { [`/v1/workspaces/${WS}/attention`]: ATTENTION_BODY, '/v1/contests': CONTESTS_BODY };

/** The two requests `getAttention` makes for its items — the roster's own reads are not its subject. */
const itemUrls = (calls: Array<{ input: string }>) =>
  calls.map((call) => call.input).filter((url) => url.includes('/attention') || url.includes('/v1/contests'));

describe('getAttention and show', () => {
  it('30.025 without show requests exactly today\'s two URLs (the regression control)', async () => {
    const { fetchImpl, calls } = recordingFetch(attentionAnswers);
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await source.query.getAttention(WS);
    expect(itemUrls(calls).sort()).toEqual([
      `/v1/contests?workspaceId=${WS}&open=true`,
      `/v1/workspaces/${WS}/attention`,
    ]);
  });

  it('30.026 with show sends ?show=created,assigned to the attention route AND the contests route, commas unescaped', async () => {
    const { fetchImpl, calls } = recordingFetch(attentionAnswers);
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    await source.query.getAttention(WS, ['created', 'assigned']);
    // A literal comma: `URLSearchParams` would send `%2C`, which the route splits on nothing.
    expect(itemUrls(calls).sort()).toEqual([
      `/v1/contests?workspaceId=${WS}&open=true&show=created,assigned`,
      `/v1/workspaces/${WS}/attention?show=created,assigned`,
    ]);
    calls.length = 0;
    await source.query.getAttention(WS, ['ws-admin']);
    expect(itemUrls(calls).sort()).toEqual([
      `/v1/contests?workspaceId=${WS}&open=true&show=ws-admin`,
      `/v1/workspaces/${WS}/attention?show=ws-admin`,
    ]);
  });

  it('30.027 every mapped item carries its workspaceId — the swept kinds off the card, a contest off its own row', async () => {
    const { fetchImpl } = recordingFetch(attentionAnswers);
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    const items = await source.query.getAttention(WS);
    expect(items.map((item) => [item.kind, item.ticketId, item.workspaceId])).toEqual([
      ['blocked', 't-blocked', WS],
      ['contested', 't-contested', WS],
    ]);
    // A row with no workspace is a body this client does not understand: refused, never
    // filed under an empty or invented workspace.
    const { fetchImpl: noWorkspace } = recordingFetch({
      ...attentionAnswers,
      '/v1/contests': { contests: [{ ...CONTESTS_BODY.contests[0], workspaceId: undefined }] },
    });
    await expect(createOnlineDataSource({ baseUrl: '', fetchImpl: noWorkspace }).query.getAttention(WS)).rejects.toThrow(
      MappingError,
    );
  });
});

describe('the My work preferences document', () => {
  it('30.028 getMyWorkPreferences GETs /v1/me/my-work-preferences; putMyWorkPreferences PUTs the doc as JSON and answers the stored doc', async () => {
    const stored = { show: ['created', 'ws-admin'], grouping: 'flat' };
    const { fetchImpl, calls } = recordingFetch({
      'GET /v1/me/my-work-preferences': { show: ['assigned'], grouping: 'workspace-project' },
      'PUT /v1/me/my-work-preferences': stored,
    });
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });

    expect(await source.query.getMyWorkPreferences()).toEqual({ show: ['assigned'], grouping: 'workspace-project' });
    expect(calls[0]?.input).toBe('/v1/me/my-work-preferences');
    expect(calls[0]?.init?.method).toBe('GET');

    const answer = await source.query.putMyWorkPreferences({ show: ['created', 'ws-admin'], grouping: 'flat' });
    expect(calls[1]?.input).toBe('/v1/me/my-work-preferences');
    expect(calls[1]?.init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ show: ['created', 'ws-admin'], grouping: 'flat' });
    // The SERVER's answer, not the argument echoed back: it is what was stored.
    expect(answer).toEqual(stored);
  });

  it('30.028 refuses a document it does not understand, and a missing route is an error rather than the defaults', async () => {
    for (const body of [
      { show: ['bogus'], grouping: 'flat' },
      { show: 'created', grouping: 'flat' },
      { show: ['created'], grouping: 'tree' },
      { show: ['created'] },
    ]) {
      const { fetchImpl } = recordingFetch({ 'GET /v1/me/my-work-preferences': body });
      await expect(
        createOnlineDataSource({ baseUrl: '', fetchImpl }).query.getMyWorkPreferences(),
        JSON.stringify(body),
      ).rejects.toThrow(MappingError);
    }
    // The page falls back to the defaults on a failed read (T4) — that is the page's
    // decision to make, so the data source reports the failure instead of deciding it.
    const { fetchImpl } = recordingFetch({});
    await expect(createOnlineDataSource({ baseUrl: '', fetchImpl }).query.getMyWorkPreferences()).rejects.toThrow(HttpError);
  });
});

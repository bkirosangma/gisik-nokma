import { describe, expect, it } from 'vitest';
import { createHttpClient, HttpError, type FetchLike } from '@gisik-nokma/app-core/online';
import { createHttpNotificationsGateway } from '../src/notifications-gateway.js';
import { createHttpTicketLocator, ticketSheetPath } from '../src/ticket-location.js';

/**
 * ## The transport under test is the REAL one
 *
 * Same reason `data-source-gateway.test.ts` gives: the behaviour these cases are
 * about IS `createHttpClient`'s — a 404 answers `null` on a GET and THROWS on a
 * POST, a 204 answers `undefined`, a non-2xx carries its body. A hand-written
 * `HttpClient` stub would let this file decide those, and they are exactly what
 * the gateway is built on.
 *
 * The scripted bodies below are the SERVER'S, copied from the routes that serve
 * them (`apps/server/src/routes/notifications.ts`,
 * `apps/server/src/notifications/store.ts`, `apps/server/src/routes/tickets.ts`)
 * rather than from the plan's sketch — cases 11.130–11.139.
 */
function scriptedHttp(routes: Record<string, { status: number; body?: unknown }>) {
  const seen: Array<{ method: string; path: string; hadBody: boolean }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const method = init?.method ?? 'GET';
    seen.push({ method, path: input, hadBody: init?.body !== undefined });
    const scripted = routes[`${method} ${input}`];
    if (scripted === undefined) throw new Error(`this case scripted no ${method} ${input}`);
    return new Response(
      scripted.status === 204 || scripted.body === undefined
        ? null
        : JSON.stringify(scripted.body),
      {
        status: scripted.status,
        headers: scripted.body === undefined ? undefined : { 'content-type': 'application/json' },
      },
    );
  };
  return { http: createHttpClient('', fetchImpl), seen };
}

/** A row exactly as `listNotifications` selects it — `.strict()` schemas refuse anything else. */
function assignmentRow(id: string, read = false) {
  return {
    id,
    userId: 'u_kiro',
    workspaceId: 'ws_1',
    kind: 'assignment',
    dedupeKey: `assignment:${id}`,
    read,
    createdAt: '2026-08-20T10:00:00.000Z',
    payload: {
      ticketId: 't_7',
      ticketTitle: 'Restock the cold shelf',
      assignedBy: 'u_ana',
      eventId: 'ev_1',
      clientTime: '2026-08-20T09:59:00.000Z',
      serverTime: '2026-08-20T10:00:00.000Z',
    },
  };
}

describe('createHttpNotificationsGateway — against the routes that actually serve it', () => {
  it('11.130 asks for the first page with NO query string, and parses every row through the domain', async () => {
    const { http, seen } = scriptedHttp({
      'GET /v1/me/notifications': {
        status: 200,
        body: { notifications: [assignmentRow('n_2'), assignmentRow('n_1', true)], nextCursor: null },
      },
    });
    const page = await createHttpNotificationsGateway(http).list();

    expect(seen.map((call) => `${call.method} ${call.path}`)).toEqual(['GET /v1/me/notifications']);
    expect(page.notifications.map((n) => n.id)).toEqual(['n_2', 'n_1']);
    expect(page.nextCursor).toBeNull();
    // Parsed, not cast: the payload came back narrowed to its kind's schema.
    expect(page.notifications[0]?.payload).toMatchObject({ ticketId: 't_7', assignedBy: 'u_ana' });
  });

  it('11.131 sends the cursor back encoded, and only when there is one', async () => {
    const { http, seen } = scriptedHttp({
      'GET /v1/me/notifications?cursor=n%2F1%2B2': {
        status: 200,
        body: { notifications: [], nextCursor: null },
      },
    });
    await createHttpNotificationsGateway(http).list('n/1+2');
    expect(seen[0]?.path).toBe('/v1/me/notifications?cursor=n%2F1%2B2');
  });

  it('11.132 treats null and undefined as the same first-page request', async () => {
    const { http, seen } = scriptedHttp({
      'GET /v1/me/notifications': { status: 200, body: { notifications: [], nextCursor: null } },
    });
    const gateway = createHttpNotificationsGateway(http);
    await gateway.list(null);
    await gateway.list(undefined);
    expect(seen.map((call) => call.path)).toEqual(['/v1/me/notifications', '/v1/me/notifications']);
  });

  it('11.133 carries nextCursor through verbatim — the paging fact the fake could not lose', async () => {
    const { http } = scriptedHttp({
      'GET /v1/me/notifications': {
        status: 200,
        body: { notifications: [assignmentRow('n_9')], nextCursor: 'n_9' },
      },
    });
    expect((await createHttpNotificationsGateway(http).list()).nextCursor).toBe('n_9');
  });

  it('11.134 refuses a page whose payload does not match its kind, rather than handing it to the view', async () => {
    const { http } = scriptedHttp({
      'GET /v1/me/notifications': {
        status: 200,
        body: {
          // kind says mention; the payload is an assignment's. A cast would have
          // let this reach `notificationHeadline` and print undefined fields.
          notifications: [{ ...assignmentRow('n_bad'), kind: 'mention' }],
          nextCursor: null,
        },
      },
    });
    await expect(createHttpNotificationsGateway(http).list()).rejects.toThrow();
  });

  it('11.135 reads the unread total off the route that serves it', async () => {
    const { http, seen } = scriptedHttp({
      'GET /v1/me/notifications/unread-count': { status: 200, body: { unread: 137 } },
    });
    expect(await createHttpNotificationsGateway(http).unreadCount()).toBe(137);
    expect(seen[0]?.path).toBe('/v1/me/notifications/unread-count');
  });

  it('11.136 turns a 401 on either read into an HttpError that still names the status', async () => {
    const { http } = scriptedHttp({
      'GET /v1/me/notifications/unread-count': {
        status: 401,
        body: { error: 'unauthenticated' },
      },
    });
    await expect(createHttpNotificationsGateway(http).unreadCount()).rejects.toMatchObject({
      status: 401,
      body: { error: 'unauthenticated' },
    });
  });

  it('11.137 markRead POSTs to the row and accepts the route’s empty 204', async () => {
    const { http, seen } = scriptedHttp({
      'POST /v1/me/notifications/n_1/read': { status: 204 },
    });
    await expect(createHttpNotificationsGateway(http).markRead('n_1')).resolves.toBeUndefined();
    expect(seen[0]).toEqual({
      method: 'POST',
      path: '/v1/me/notifications/n_1/read',
      // No JSON body: the route reads nothing from one, and sending `{}` would
      // be this client claiming a request shape the route does not have.
      hadBody: false,
    });
  });

  it('11.138 markRead THROWS on the route’s 404 — the seam where a stub gateway was looser', async () => {
    const { http } = scriptedHttp({
      'POST /v1/me/notifications/n_theirs/read': { status: 404, body: { error: 'not_found' } },
    });
    // The route answers this same body for a row that is not yours AND for one
    // that does not exist. A resolved promise here would have let the page's
    // optimistic flip stand for a row the server never marked.
    await expect(
      createHttpNotificationsGateway(http).markRead('n_theirs'),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('11.139 names the path when a GET answers the transport’s null instead of a page', async () => {
    const { http } = scriptedHttp({
      'GET /v1/me/notifications': { status: 404, body: { error: 'not_found' } },
    });
    // `createHttpClient` maps a 404 on a GET to `null`. Unhandled that becomes
    // "Cannot read properties of null (reading 'notifications')", which names
    // neither the door nor the cause.
    await expect(createHttpNotificationsGateway(http).list()).rejects.toThrow(
      /\/v1\/me\/notifications answered 404/,
    );
  });

  /**
   * 11.175/11.176 — the 200 THIS CLIENT CANNOT READ.
   *
   * The pair to 11.139, and stated on the same terms: both are unreachable
   * against the route that ships, and both arrive from outside the pair this
   * file is written against — a rewrite, a proxy, a wrong origin. Before the
   * guard the envelope was an unchecked cast, so a 200 of the wrong shape threw
   * `Cannot read properties of undefined (reading 'map')` — the exact unnamed
   * `TypeError` the null guard one line above exists to prevent.
   *
   * The scripted body is a REFUSAL ENVELOPE served with a 200, which is what a
   * misconfigured gateway in front of this route actually does, rather than an
   * invented nonsense value.
   */
  it('11.175 names the path when the list route answers a 200 of the wrong shape', async () => {
    const { http } = scriptedHttp({
      'GET /v1/me/notifications': { status: 200, body: { error: 'upstream_unavailable' } },
    });
    await expect(createHttpNotificationsGateway(http).list()).rejects.toThrow(
      /\/v1\/me\/notifications answered 200 with a body this client cannot read/,
    );
  });

  it('11.176 does the same for the unread-count route, rather than badging undefined', async () => {
    const { http } = scriptedHttp({
      'GET /v1/me/notifications/unread-count': { status: 200, body: { count: 3 } },
    });
    // `{ count: 3 }` and not `{}`: a RENAMED field is the shape a cast is
    // likeliest to meet and likeliest to pass, and `body.unread` on it is
    // `undefined` — a badge drawn from nothing.
    await expect(createHttpNotificationsGateway(http).unreadCount()).rejects.toThrow(
      /unread-count answered 200 with a body this client cannot read/,
    );
  });
});

describe('createHttpTicketLocator — the deep link the plan’s /tickets/:id could not make', () => {
  const ticketRoute = '/v1/workspaces/ws_1/tickets/t_7';

  it('11.140 reads project_id off the proj_visibility row the route serves', async () => {
    const { http, seen } = scriptedHttp({
      [`GET ${ticketRoute}`]: {
        status: 200,
        body: {
          ticket: {
            ticket_id: 't_7',
            workspace_id: 'ws_1',
            project_id: 'p_corner',
            parent_id: null,
            own_mode: 'inherit',
            resolved_mode: 'workspace',
            seq: 12,
          },
          parent: null,
          rollup: null,
        },
      },
    });
    const location = await createHttpTicketLocator(http).locate('ws_1', 't_7');
    expect(location).toEqual({ workspaceId: 'ws_1', projectId: 'p_corner' });
    expect(seen[0]?.path).toBe(ticketRoute);
    expect(ticketSheetPath(location!, 't_7')).toBe('/w/ws_1/p/p_corner?ticket=t_7');
  });

  it('11.141 answers null for the route’s one 404, without deciding which of its two causes it was', async () => {
    const { http } = scriptedHttp({
      [`GET ${ticketRoute}`]: { status: 404, body: { error: 'not_found' } },
    });
    expect(await createHttpTicketLocator(http).locate('ws_1', 't_7')).toBeNull();
  });

  it('11.142 answers null rather than building /w/ws/p/?ticket= when the row carries no project', async () => {
    const { http } = scriptedHttp({
      [`GET ${ticketRoute}`]: {
        status: 200,
        body: { ticket: { ticket_id: 't_7', workspace_id: 'ws_1' }, parent: null, rollup: null },
      },
    });
    expect(await createHttpTicketLocator(http).locate('ws_1', 't_7')).toBeNull();
  });

  it('11.143 lets a 401 through as a session event rather than flattening it to null', async () => {
    const { http } = scriptedHttp({
      [`GET ${ticketRoute}`]: { status: 401, body: { error: 'unauthenticated' } },
    });
    await expect(createHttpTicketLocator(http).locate('ws_1', 't_7')).rejects.toMatchObject({
      status: 401,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { createHttpClient, type FetchLike } from '@gisik-nokma/app-core/online';
import { createHttpTicketLocator, ticketSheetPath } from '../src/ticket-location.js';

/**
 * The deep link the plan's `/tickets/:id` could not make — cases 11.140–11.143.
 *
 * Split out of `notifications-gateway.test.ts` on 2026-09-07 when
 * `createHttpNotificationsGateway` moved into `@gisik-nokma/app-core/online`.
 * `createHttpTicketLocator` did NOT move and should not: `ticketSheetPath`
 * builds `/w/:ws/p/:project?ticket=:id`, which is this shell's own route shape
 * and means nothing to the replica or to another client. The two halves of the
 * old file were a package-portable adapter and a Next.js URL builder sharing a
 * scripted-fetch helper; only the helper was common.
 *
 * The transport is the REAL `createHttpClient`, for the reason the old file
 * gave: the 404-answers-null-on-GET rule is the behaviour under test.
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

import { describe, expect, it, vi } from 'vitest';
import {
  createClientStateCache,
  SessionExpiredError,
  writeFailureCopy,
  writeFailureRefusalClass,
  SESSION_EXPIRED_COPY,
  withCacheFeed,
  type DataSource,
} from '@gisik-nokma/app-core';
import { createOnlineDataSource, HttpError } from '@gisik-nokma/app-core/online';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { withSignInOnExpiredWrite, EXPIRED_SESSION_COPY } from '../src/expired-session.js';

/**
 * E5-25 (round-2 ruling, IMPORTANT) — the WRITE half of the session-expiry rule.
 *
 * The read half has been tested since the module existed (`3.141`, in
 * `page-refusals.test.tsx`): a 401 on a read sends the person to sign in. The
 * write half did not exist. Nine write catches — three in `board.tsx`, one each
 * in `bulk-close-dialog.tsx`, `ticket-sheet.tsx`, `backlog-rank-controls.tsx`,
 * `backlog-start-button.tsx`, `workspace-settings-form.tsx` and the project
 * page's delete-Undo — painted a 401 as *"We could not reach the server"*, and
 * not one of them sent anybody anywhere.
 *
 * ## Why this file drives the REAL transport and the REAL wrapper
 *
 * The chain has three links and a test of any one of them alone would be the
 * mocked-contract shape this repo has paid for repeatedly:
 *
 *   1. a 401 from `fetch` becomes `SessionExpiredError` — the adapter's job, in
 *      `@gisik-nokma/app-core` (proven at the unit level in
 *      `packages/app-core/test/online/online-data-source.test.ts`);
 *   2. the shell's guard sees that class and pushes `/sign-in` — THIS file;
 *   3. a view paints the session sentence rather than the transport one —
 *      `packages/app-core/test/views/ticket-sheet.test.tsx` (E5-25) and
 *      `board-moves-ui.test.tsx` (E5-25), which drive the shipped components.
 *
 * So the cases below build the real `createOnlineDataSource` over a fake
 * `fetch`, wrap it in the real `withCacheFeed` (the order `providers.tsx` uses),
 * and drive the real guard. Nothing here is a stand-in for the thing it proves.
 */

/** The session guard's own event, as `providers.tsx` wires it. */
function fetchAnswering(status: number, body: unknown) {
  const calls: string[] = [];
  const fetchImpl = async (input: string) => {
    calls.push(input);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  };
  return { fetchImpl, calls };
}

/**
 * One submitted event, shaped as the ingest door takes them — every field the
 * `SubmittedEvent` envelope requires, so the typecheck proves it rather than a
 * cast hiding a missing one.
 */
function submitted(): SubmittedEvent {
  return {
    id: '01J9EVT00000000000000000000',
    workspaceId: '01J9GWS0000000000000000000',
    entity: { kind: 'ticket', id: '01J9TKT0000000000000000000' },
    type: 'ticket.closed',
    version: 1,
    payload: {},
    actorId: 'user_kiro',
    origin: 'web',
    clientTime: '2026-09-21T00:00:00.000Z',
  };
}

function sources(status: number, body: unknown) {
  const { fetchImpl } = fetchAnswering(status, body);
  const online = createOnlineDataSource({ baseUrl: '', fetchImpl });
  // The REAL cache and the REAL feed, in the order `providers.tsx` wraps them —
  // a hand-built stub here would be a second idea of what `withCacheFeed` does
  // with an ingest.
  const dataSource: DataSource = withCacheFeed(online, createClientStateCache());
  const onExpired = vi.fn();
  return { guarded: withSignInOnExpiredWrite(dataSource, onExpired), onExpired };
}

describe('E5-25 a write that ends in a 401 takes the person to sign in', () => {
  it('13.1158 E5-25 a 401 from the events door pushes /sign-in exactly once, and still throws', async () => {
    const { guarded, onExpired } = sources(401, { error: 'unauthenticated' });

    // The throw is asserted as well as the push: a guard that SWALLOWED the
    // failure would leave the calling view rendering a success it never had.
    await expect(guarded.ingest([submitted()])).rejects.toBeInstanceOf(SessionExpiredError);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('13.1158 E5-25 a 500 and a 403 do NOT send anyone to sign in', async () => {
    // The control for the case above, and the reason it is two statuses rather
    // than one: a 500 is the server's problem (a sign-in page is not the
    // remedy), and a 403 is a session the server ACCEPTED and then refused —
    // redirecting on it would throw away whatever the person had on screen.
    for (const status of [403, 500]) {
      const { guarded, onExpired } = sources(status, { message: 'nope' });
      const thrown = await guarded.ingest([submitted()]).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(thrown).toBeInstanceOf(HttpError);
      expect(onExpired).not.toHaveBeenCalled();
    }
  });

  it('E5-25 the sentence the write sites paint is the product’s one session copy', () => {
    // The third link, at its seam: the copy is IDENTICAL to the read arms' own
    // (one re-export, not two strings), and the register follows it, so a
    // session sentence is never painted in the transport class.
    expect(EXPIRED_SESSION_COPY).toBe(SESSION_EXPIRED_COPY);
    const transport = (message: string): string => `We could not reach the server for this save: ${message}`;
    expect(writeFailureCopy(new SessionExpiredError('/v1/events'), transport)).toBe(SESSION_EXPIRED_COPY);
    expect(writeFailureCopy(new Error('socket closed'), transport)).toBe(
      'We could not reach the server for this save: socket closed',
    );
    expect(writeFailureRefusalClass(SESSION_EXPIRED_COPY)).toContain('gn-refusal--session');
    expect(writeFailureRefusalClass('We could not reach the server for this save: x')).toContain(
      'gn-refusal--transport',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { HttpError, type HttpClient } from '../../src/online/http.js';
import { FoundingError, createHttpFoundingGateway } from '../../src/online/founding.js';

/**
 * `POST /v1/workspaces` — `apps/server/src/routes/workspaces.ts:74`, Plan 4
 * Task 13's door. Cases 3.100–3.103 (`test-cases/03-foundation-ledger.md`).
 */
type Call = { path: string; body: unknown };

function fakeHttp(answer: unknown): HttpClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    get: async () => null,
    post: async (path, body) => {
      calls.push({ path, body });
      if (answer instanceof Error) throw answer;
      return answer;
    },
    put: async () => undefined,
    del: async () => undefined,
  };
}

describe('3.100 createHttpFoundingGateway', () => {
  it('posts the name to the shipped door and hands back the workspace to enter', async () => {
    const http = fakeHttp({ workspaceId: 'ws_new' });
    expect(await createHttpFoundingGateway(http).foundWorkspace('Convenience Corner')).toEqual({
      workspaceId: 'ws_new',
    });
    expect(http.calls).toEqual([{ path: '/v1/workspaces', body: { name: 'Convenience Corner' } }]);
  });

  /**
   * 3.101 PLANTED DEFECT — the name is sent AS TYPED.
   *
   * A `name.trim()` here would be this client silently repairing a claim the
   * person made, handing the ledger a name they did not write. It would also
   * make the door's own 400 unreachable for the one input it exists to refuse:
   * `minLength: 1` admits `'   '`, and `routes/workspaces.ts` checks
   * `name.trim() === ''` above the ledger precisely because a whitespace name
   * names nothing while looking like a name everywhere it is displayed.
   */
  it('does not trim, pad or otherwise repair the name before submitting it', async () => {
    const http = fakeHttp(new HttpError(400, '/v1/workspaces', {}));
    await createHttpFoundingGateway(http).foundWorkspace('   ').catch(() => undefined);
    await createHttpFoundingGateway(http).foundWorkspace('  Corner Shop ').catch(() => undefined);
    expect(http.calls.map((call) => call.body)).toEqual([
      { name: '   ' },
      { name: '  Corner Shop ' },
    ]);
  });

  /**
   * 3.102 PLANTED DEFECT — both refusal shapes reach the screen in the door's
   * own words, and the two are told apart by status.
   *
   * Before `HttpError` carried a body, the most a page could render was
   * `HTTP 422 for /v1/workspaces`. That is the shell paraphrasing a refusal it
   * never read, on the founding path, which is the last hole in the onboarding
   * story — the reader would be told a number and not what to do.
   */
  it('carries a 400 refusal body’s sentence out as serverMessage', async () => {
    // THE DOOR'S OWN BODY, character for character: `INVALID_NAME_BODY` in
    // `apps/server/src/routes/workspaces.ts:10`. This literal previously read
    // `{ error: 'invalid_name', message: '… Whitespace alone is not one.' }` —
    // a discriminant no server sends and a sentence no door speaks — and the
    // case still passed, because it asserts `serverMessage` against
    // `body.message`, reading back the literal it had just written. Its title
    // claimed "the door's sentence" while pinning its own paraphrase.
    //
    // The title now says what this case actually keeps: that a 400 body's
    // `message` reaches `FoundingError.serverMessage`. **That the sentence is
    // the DOOR's is a claim only a round trip can make, and it is made at
    // 7.221** (`apps/server/test/integration/fixture-witnesses.test.ts`), where
    // the real gateway meets the real route and compares against the server
    // module's own constant.
    const body = {
      error: 'invalid',
      message: 'A workspace needs a name.',
    };
    const http = fakeHttp(new HttpError(400, '/v1/workspaces', body));
    await expect(createHttpFoundingGateway(http).foundWorkspace('   ')).rejects.toMatchObject({
      name: 'FoundingError',
      status: 400,
      serverMessage: body.message,
    });
  });

  it('3.102 carries the 422 IngestResult refusal out with the engine’s own reason', async () => {
    const refusal = {
      status: 'refused',
      eventId: '01J0000000000000000000000C',
      rule: 'permission.role',
      reason: 'This claim was refused by the ingest gate.',
    };
    const http = fakeHttp(new HttpError(422, '/v1/workspaces', refusal));
    await expect(createHttpFoundingGateway(http).foundWorkspace('Corner')).rejects.toMatchObject({
      name: 'FoundingError',
      status: 422,
      serverMessage: refusal.reason,
    });
  });

  it('3.103 a refusal with nothing readable behind it carries null, not an invented sentence', async () => {
    const http = fakeHttp(new HttpError(500, '/v1/workspaces', undefined));
    await expect(createHttpFoundingGateway(http).foundWorkspace('Corner')).rejects.toMatchObject({
      name: 'FoundingError',
      status: 500,
      serverMessage: null,
    });
  });

  /**
   * 3.103 PLANTED DEFECT — a 201 naming no workspace is not a success.
   *
   * The founding form routes into `/w/${workspaceId}/my-work` on the answer.
   * With `record.workspaceId` read straight through, an id-less 201 would send
   * the founder to `/w/undefined/my-work` — a 404 wearing the shape of success,
   * moments after they were told their workspace existed.
   */
  it('refuses a 201 that names no workspace rather than routing to nowhere', async () => {
    await expect(createHttpFoundingGateway(fakeHttp({})).foundWorkspace('Corner')).rejects.toBeInstanceOf(
      FoundingError,
    );
    await expect(
      createHttpFoundingGateway(fakeHttp(null)).foundWorkspace('Corner'),
    ).rejects.toBeInstanceOf(FoundingError);
    // CONTROL, same run: a real 201 still resolves, so the three above are the
    // check discriminating rather than the method always throwing.
    expect(await createHttpFoundingGateway(fakeHttp({ workspaceId: 'ws_1' })).foundWorkspace('C')).toEqual({
      workspaceId: 'ws_1',
    });
  });
});

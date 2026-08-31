import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ORIGINS, type Origin, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp, type AppDeps } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createIngestService, type ClientIngest, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * The envelope-origin gate at the client door.
 *
 * TERMINOLOGY: "envelope-origin" throughout means the event envelope's `origin`
 * field — the provenance enum `'web' | 'mobile' | 'desktop' | 'server'`. It is
 * NOT the browser `Origin` header, and this file tests nothing about CSRF or
 * cross-site requests.
 *
 * The two rule strings below are written out by hand rather than imported from
 * the module under test, deliberately: importing them would make the assertion
 * agree with whatever the module says, including a wrong value. The contract is
 * these exact characters (Plan 4 Task 5's plan text pins them), so the test
 * spells them.
 */
const EXPECTED_RULE = 'permission.role';
const EXPECTED_REASON = 'Only the server itself may record server-origin events.';

/**
 * Every origin a CLIENT may legitimately claim: the enum minus `'server'`.
 * Derived, never re-spelled — a second list of what the origins are would drift
 * from `ORIGINS` silently, and the gate's whole contract is which members it
 * refuses.
 */
const CLIENT_ORIGINS: Origin[] = ORIGINS.filter((origin) => origin !== 'server');

/**
 * The compile-time half of the gate, asserted so it cannot be undone quietly.
 *
 * Routes receive `ClientIngest`, which exposes the GATED door alone — the
 * ungated `ingestBatch` is deliberately out of a route's reach, because the
 * naming asymmetry is adverse: the dangerous door has the shorter, more obvious
 * name, and Plan 10's `POST /v1/sync` cannot be guarded by a runtime test that
 * does not exist yet.
 *
 * This is a real check rather than a comment: if `ClientIngest` is ever widened
 * back to the full `IngestService`, the error this directive expects stops
 * happening, the directive becomes an UNUSED `@ts-expect-error`, and
 * `pnpm turbo run typecheck` goes red. Verified by widening it and watching
 * typecheck fail.
 *
 * TWO guards, because the protection has two axes and the first covers only
 * one of them. The alias guard watches what `ClientIngest` MEANS; it says
 * nothing about whether `AppDeps` still BINDS to it. Review proved the gap:
 * widening `AppDeps.ingest` back to `IngestService` while leaving `ClientIngest`
 * narrow typechecks GREEN — the first directive is still satisfied and notices
 * nothing — and under that widening a Plan 10 registrar typed
 * `(app, i: IngestService)` compiles green too, which is the exact scenario the
 * narrowing exists to stop. A guard whose docblock claims "self-enforcing"
 * while covering half of what it guards is an overclaim, so the second axis
 * gets its own directive below.
 *
 * KNOWN LIMIT of the mechanism, recorded rather than fixed: `@ts-expect-error`
 * is satisfied by the expression erroring for ANY reason, so renaming
 * `ingestBatch` on `IngestService` would leave both directives green while the
 * protection lapsed. Inherent to the mechanism; the docblocks are the cover.
 */
// @ts-expect-error — a route may not reach the ungated internal append path
type _RoutesCannotReachTheInternalDoor = ClientIngest['ingestBatch'];
// @ts-expect-error — AppDeps.ingest must stay narrowed; see ClientIngest above.
type _AppDepsIngestIsNarrowed = AppDeps['ingest']['ingestBatch'];

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

function ingestService(): IngestService {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

let phoneCounter = 0;

/**
 * A running app and a caller signed into it.
 *
 * Every client-door case below needs one, because Task 5 put `requireSession`
 * on `/v1/events`: without a session the door answers 401 and the gate under
 * test never runs at all. Bearer, not cookie — a cookie-carrying POST to
 * `/api/auth/*` needs a trusted HTTP `Origin` header, and HTTP-Origin is a
 * different subject from this file's, which is the envelope's provenance enum.
 */
async function signedInApp(ingest: IngestService = ingestService()) {
  const otp = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
  });
  const app = buildApp({ db: db.pool, ingest, auth });
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9197000${String(phoneCounter).padStart(5, '0')}`);
  return { app, user, headers: { authorization: `Bearer ${user.token}` } };
}

/**
 * The reachable forgery, exactly as the coordination doc describes it: a
 * `claim.contested` whose OUTER envelope is honest — a real ticket filed under
 * its own workspace, so `ENTITY_WORKSPACE_MISMATCH_RULE` has nothing to catch —
 * carrying a fabricated claim inside `payload`, attributed to a victim actor in
 * a different workspace. Nothing binds the embedded event to the outer
 * envelope, so the only thing standing between this and a permanent
 * un-deletable ledger entry is `contest.server-only`, which reads envelope-origin.
 */
function forgedContest(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  const workspaceId = newUlid();
  const victimWorkspaceId = newUlid();
  const victimActorId = newUlid();
  const fabricatedClaim: SubmittedEvent = {
    id: newUlid(),
    workspaceId: victimWorkspaceId,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: victimActorId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'ticket', id: newUlid() },
    type: 'claim.contested',
    version: 1,
    payload: {
      originalEvent: fabricatedClaim,
      rule: 'workflow.transition-not-allowed',
      reason: 'this refusal never happened',
    },
    actorId: newUlid(),
    origin: 'server', // the forgery: the client wears the server's provenance
    clientTime: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
}

async function ledgerRowsFor(eventId: string): Promise<number> {
  const { rows } = await db.pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM events WHERE id = $1',
    [eventId],
  );
  return rows[0]?.count ?? 0;
}

/**
 * WHAT THESE CASES PIN AFTER TASK 5, which is not quite what they pinned before.
 *
 * `checkRolePermission` now runs an ACTOR-IDENTITY check ahead of the
 * envelope-origin one, and identity is checked first because every later check
 * depends on it. So a forgery with a random `actorId` — which is what these
 * cases used to send — is now refused with *"You cannot submit a claim as
 * another person."* and never reaches the branch this file is named after.
 * That is a check quietly changing meaning, and the fix is to remove the second
 * fault rather than to loosen the assertion: every forgery below is now
 * attributed to the signed-in caller, so the ONLY thing wrong with it is the
 * envelope-origin, and the refusal it draws is the one being tested.
 *
 * Read each case as: *given an honest actor and an honest session, a borrowed
 * server provenance is still refused.* Mutation that reddens them: delete the
 * `env.origin === 'server'` branch — they then answer `committed`, because
 * nothing else about these submissions is wrong.
 */
describe('envelope-origin gate — the client door (POST /v1/events)', () => { // test-cases 3.31
  it('refuses a client-submitted server-origin event with the exact rule and reason', async () => {
    const { app, user, headers } = await signedInApp();
    const forged = forgedContest({ actorId: user.userId });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [forged] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: unknown[] };
    expect(body.results[0]).toEqual({
      status: 'refused',
      eventId: forged.id,
      rule: EXPECTED_RULE,
      reason: EXPECTED_REASON,
    });
  });

  it('commits nothing for the refused forgery — the append-only ledger never sees it', async () => {
    const { app, user, headers } = await signedInApp();
    const forged = forgedContest({ actorId: user.userId });
    await app.inject({ method: 'POST', url: '/v1/events', headers, payload: { events: [forged] } });

    expect(await ledgerRowsFor(forged.id)).toBe(0);
  });

  it('refuses only the forgery in a batch, and keeps results index-aligned', async () => {
    const { app, user, headers } = await signedInApp();
    // The two honest events are workspace foundings, so each appends a founding
    // sequence of six more events INSIDE this same batch loop (Task 5). The
    // index alignment asserted below is therefore a stronger claim than it was:
    // `results[i]` still answers `events[i]` even though the server appended
    // twelve events of its own between them. A bootstrap that pushed its own
    // results onto the array would give this test five entries, not three.
    const before = submittedWorkspaceCreated({ actorId: user.userId });
    const forged = forgedContest({ actorId: user.userId });
    const after = submittedWorkspaceCreated({ actorId: user.userId });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [before, forged, after] },
    });

    const body = response.json() as { results: Array<{ status: string; eventId: string }> };
    expect(body.results).toHaveLength(3);
    expect(body.results[0]).toMatchObject({ status: 'committed', eventId: before.id });
    expect(body.results[1]).toMatchObject({ status: 'refused', eventId: forged.id, rule: EXPECTED_RULE });
    expect(body.results[2]).toMatchObject({ status: 'committed', eventId: after.id });
  });

  /**
   * The gate must refuse envelope-origin `'server'` and NOTHING ELSE, and this
   * case is parameterised over every non-server member of the enum because
   * testing `'web'` alone does not establish that.
   *
   * Found by review, by mutation: a gate written `env.origin !== 'web'` refuses
   * every mobile and desktop user in the product, and with only the `'web'` case
   * the entire 143-test server suite stayed green. The refusal direction was
   * well pinned; the admits direction was pinned for one value out of three.
   *
   * `CLIENT_ORIGINS` is derived from the domain's own `ORIGINS` rather than
   * re-spelled here, so a fifth origin member is covered the day it is added
   * instead of the day somebody remembers this file — the repository's rule that
   * where a format has one authority, tests assert through the authority.
   */
  it.each(CLIENT_ORIGINS)(
    'still admits an ordinary %s-origin client submission through the same door',
    async (origin) => {
      const { app, user, headers } = await signedInApp();
      const honest = submittedWorkspaceCreated({ origin, actorId: user.userId });
      const response = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers,
        payload: { events: [honest] },
      });

      const body = response.json() as { results: Array<{ status: string }> };
      expect(body.results[0]).toMatchObject({ status: 'committed', eventId: honest.id });
      expect(await ledgerRowsFor(honest.id)).toBe(1);
    },
  );
});

describe('envelope-origin gate — the internal door (ingestBatch) is NOT gated', () => { // test-cases 3.31
  /**
   * The discriminating case. The server's own appends are legitimately
   * server-origin — Task 5's workspace bootstrap and Task 14's invite
   * acceptance both append internally — and `claim.contested` is the sharpest
   * possible probe because `contest.server-only` REQUIRES envelope-origin
   * `'server'`: the event can only commit if the internal door leaves origin
   * alone AND the engine sees it. A gate wired blanket into the ingest path
   * turns this test red.
   */
  it('commits a server-origin claim.contested appended internally', async () => {
    const internal = forgedContest();
    const results = await ingestService().ingestBatch([internal]);

    expect(results[0]).toMatchObject({ status: 'committed', eventId: internal.id });
    expect(await ledgerRowsFor(internal.id)).toBe(1);
  });
});

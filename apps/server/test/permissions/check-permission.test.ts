import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ORIGINS, type Origin, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp, type AppDeps } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
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
  const app = buildApp({
    db: db.pool,
    pool: db.pool,
    ingest,
    auth,
    serverAppend: (events) => ingest.ingestBatch(events),
    webOrigin: 'http://localhost:3001',
    // Required on `AppDeps`, and free here: a `LocalDiskStore` constructor
    // touches no filesystem, and nothing in this file uploads anything.
    store: createObjectStoreFromEnv({}),
  });
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9197000${String(phoneCounter).padStart(5, '0')}`);
  return { app, user, headers: { authorization: `Bearer ${user.token}` } };
}

/**
 * The same caller, plus a workspace they really belong to.
 *
 * Every forgery case below needs one. `forgedContest()` invents its own
 * workspace id, so a caller who merely signed in is a NON-MEMBER of the
 * workspace the forgery names — and a non-member's submission is refused by the
 * membership check whether or not the envelope-origin branch exists. Founding
 * the workspace through the client door makes the caller its owner (the
 * founding sequence appends `membership.granted {role: 'owner'}`), which leaves
 * the borrowed provenance as the one and only thing wrong with the forgery.
 *
 * The founding is ASSERTED, not assumed. If it ever stops committing the caller
 * is silently a non-member again and all three cases below go back to passing
 * for the wrong reason — which is precisely the defect this helper exists to
 * remove, so it must not be able to come back unannounced.
 */
async function signedInFounder(ingest: IngestService = ingestService()) {
  const { app, user, headers } = await signedInApp(ingest);
  const founding = submittedWorkspaceCreated({ actorId: user.userId });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers,
    payload: { events: [founding] },
  });
  const body = response.json() as { results: Array<{ status: string; eventId: string }> };
  expect(body.results[0]).toMatchObject({ status: 'committed', eventId: founding.id });
  return { app, user, headers, workspaceId: founding.workspaceId };
}

/**
 * The reachable forgery: a `claim.contested` whose OUTER envelope is honest — a
 * real ticket filed under its own workspace, so `ENTITY_WORKSPACE_MISMATCH_RULE`
 * has nothing to catch — carrying a fabricated claim inside `payload`,
 * attributed to a victim actor. The one lie left in it is envelope-origin: the
 * client wears the server's own provenance to walk past `contest.server-only`.
 *
 * ## The embedded claim used to name a DIFFERENT ticket in a DIFFERENT
 * workspace, and it deliberately no longer does
 *
 * That second fault was §11's forgery — nothing bound a contest's embedded
 * claim to the envelope carrying it — and it is now refused by the §11 closer
 * (`src/sync/contest-coherence.ts`, Plan 10 Task 4), UNCONDITIONALLY, on both
 * doors. Leaving it in would make every case below pass for a reason unrelated
 * to the property this file is named after: the client-door cases would draw
 * `contest.incoherent-original` instead of the envelope-origin refusal, and the
 * internal-door case — whose whole point is that a legitimate server-origin
 * contest COMMITS through `ingestBatch` — could no longer commit at all.
 *
 * So the extra fault is removed from the fixture rather than the assertions
 * loosened, which is exactly what this file's own note below prescribes for the
 * identity and membership faults it removed before. What is left is one lie,
 * and every case here is now about that one lie. §11's own refusal is pinned
 * where it lives, in `test/sync/contest-coherence-door.test.ts`.
 */
function forgedContest(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  // The outer envelope FIRST, overrides applied, because the embedded claim has
  // to be built from the workspace and ticket the caller actually ended up
  // with: `forgedContest({ workspaceId })` is how the client-door cases file
  // the forgery into the caller's own workspace, and a payload built before
  // that override would silently be incoherent again.
  const outer = {
    id: newUlid(),
    workspaceId: newUlid(),
    entity: { kind: 'ticket', id: newUlid() } as SubmittedEvent['entity'],
    actorId: newUlid(),
    clientTime: '2026-08-20T09:00:00.000Z',
    ...overrides,
  };
  const victimActorId = newUlid();
  const fabricatedClaim: SubmittedEvent = {
    id: newUlid(),
    workspaceId: outer.workspaceId,
    entity: outer.entity,
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: victimActorId,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
  return {
    type: 'claim.contested',
    version: 1,
    payload: {
      originalEvent: fabricatedClaim,
      rule: 'workflow.transition-not-allowed',
      reason: 'this refusal never happened',
    },
    origin: 'server', // the forgery: the client wears the server's provenance
    ...outer,
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
 * `checkRolePermission` wraps the envelope-origin branch in two other checks —
 * ACTOR IDENTITY before it, WORKSPACE MEMBERSHIP after it — and a forgery that
 * trips either of them never exercises the branch this file is named after. The
 * fix for both is to remove the extra fault from the fixture rather than to
 * loosen the assertion. The first was removed when Task 5 landed; the second
 * was missed, and this is what it cost:
 *
 * - **Identity.** These cases used to send a random `actorId` and drew *"You
 *   cannot submit a claim as another person."* Every forgery below is now
 *   attributed to the signed-in caller.
 * - **Membership.** `forgedContest()` invents its own workspace, so the caller
 *   was a non-member of it. MEASURED at 6a6203c: with the `env.origin ===
 *   'server'` branch deleted, the membership check refused the forgery as *"You
 *   are not a member of this workspace."* and only 2 of the server's 200 tests
 *   went red — the two anywhere in the repository that assert the exact
 *   `reason`. The ledger case and the batch case stayed GREEN under a mutation
 *   that removes the gate they exist to pin. Nothing that asserts `rule` alone
 *   can tell the two refusals apart, because `SERVER_ORIGIN_RULE` is DEFINED AS
 *   `PERMISSION_ROLE_RULE` — every pre-engine refusal reports the same id — and
 *   `ledgerRowsFor` has no reason string to assert at all, so the case a
 *   security reviewer trusts most was the least falsifiable one here.
 *
 * So the caller now FOUNDS the workspace each forgery names (`signedInFounder`)
 * and submits into it as its owner. Asserting `reason` in the two weak cases
 * would not have been a fix: the ledger case has no string to assert.
 *
 * Read each case as: *given an honest actor, an honest session, and a workspace
 * the caller genuinely belongs to, a borrowed server provenance is still
 * refused.* Mutation that reddens them: delete the `env.origin === 'server'`
 * branch — nothing else about these submissions is wrong, so the forgery
 * COMMITS, the ledger count goes 0 → 1, and all three fall over together.
 */
describe('envelope-origin gate — the client door (POST /v1/events)', () => { // test-cases 3.31
  it('refuses a client-submitted server-origin event with the exact rule and reason', async () => {
    const { app, user, headers, workspaceId } = await signedInFounder();
    const forged = forgedContest({ actorId: user.userId, workspaceId });
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
    const { app, user, headers, workspaceId } = await signedInFounder();
    const forged = forgedContest({ actorId: user.userId, workspaceId });
    await app.inject({ method: 'POST', url: '/v1/events', headers, payload: { events: [forged] } });

    expect(await ledgerRowsFor(forged.id)).toBe(0);
  });

  it('refuses only the forgery in a batch, and keeps results index-aligned', async () => {
    const { app, user, headers, workspaceId } = await signedInFounder();
    // The two honest events are workspace foundings, so each appends a founding
    // sequence of six more events INSIDE this same batch loop (Task 5). The
    // index alignment asserted below is therefore a stronger claim than it was:
    // `results[i]` still answers `events[i]` even though the server appended
    // twelve events of its own between them. A bootstrap that pushed its own
    // results onto the array would give this test five entries, not three.
    const before = submittedWorkspaceCreated({ actorId: user.userId });
    // Into the workspace the caller already owns — see `signedInFounder`. A
    // forgery in a workspace the caller is not in is refused for the wrong
    // reason, and this case cannot see the difference.
    const forged = forgedContest({ actorId: user.userId, workspaceId });
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

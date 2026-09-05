import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { LogMagicLinkSender } from '../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../src/attachments/store-config.js';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkspaceCreated } from './helpers/events.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * `/v1/events` now carries `requireSession` (Plan 4 Task 5), so this file signs
 * people in for real: the OTP sender is held rather than discarded, because
 * `signInWithPhone` reads the issued code out of it.
 *
 * Bearer and not cookie, deliberately, and the reason is the CSRF rule this
 * plan measured: a cookie-carrying POST to `/api/auth/*` must also send a
 * trusted HTTP `Origin` or better-auth answers 403, while a bearer request
 * sends no cookie and is exempt. (HTTP-Origin, the browser header — nothing to
 * do with `EventEnvelope.origin`, the provenance enum the ingest gate reads.)
 */
function buildServer() {
  const otp = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
  });
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  return { server: buildApp({
    db: db.pool,
    pool: db.pool,
    ingest,
    auth,
    serverAppend: (events) => ingest.ingestBatch(events),
    webOrigin: 'http://localhost:3001',
    // Required on `AppDeps`, and free here: a `LocalDiskStore` constructor
    // touches no filesystem, and nothing in this file uploads anything.
    store: createObjectStoreFromEnv({}),
  }), otp };
}

function app() {
  return buildServer().server;
}

let phoneCounter = 0;

/** A signed-in caller and the app that knows them: one bearer header, no HTTP-Origin needed. */
async function signedIn() {
  const { server, otp } = buildServer();
  phoneCounter += 1;
  const user = await signInWithPhone(server, otp, `+9198000${String(phoneCounter).padStart(5, '0')}`);
  return { server, user, headers: { authorization: `Bearer ${user.token}` } };
}

describe('POST /v1/events', () => {
  it('answers 401 unauthenticated with no session, and never reaches ingest', async () => {
    // The door's identity guard, pinned on its own. Everything below this test
    // authenticates, so without this case the whole file would prove only that
    // a signed-in caller gets through — and a `requireSession` accidentally
    // dropped from the route registration would turn nothing red.
    // Mutation that reddens it: remove `preHandler: requireSession` from
    // `registerEventRoutes` and this answers 200.
    const server = app();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [submittedWorkspaceCreated()] },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthenticated' });
    await server.close();
  });

  it('answers 200 with index-aligned per-event results', async () => {
    const { server, user, headers } = await signedIn();
    // `actorId` is the signed-in user: the gate refuses a claim submitted as
    // another person before anything else, so a random actor would now be
    // refused rather than committed and this test would be pinning the
    // permission gate by accident instead of the route's index alignment.
    const valid = submittedWorkspaceCreated({ actorId: user.userId });
    const unknownType = { ...submittedWorkspaceCreated({ actorId: user.userId }), type: 'shop.opened' };
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      headers,
      payload: { events: [valid, unknownType] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: Array<{ status: string }> };
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ status: 'committed', eventId: valid.id, seq: 1 });
    expect(body.results[1]).toMatchObject({ status: 'invalid', code: 'unknown-event-type' });
    await server.close();
  });

  // The three refusals below pin the whole body, not just the status: a status
  // code says a rule fired, never WHICH rule, so swapping one constraint's
  // effect for another's would pass all three on statusCode alone.
  it('planted defect: a body without events is a 400, not a half-heard batch', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: "body must have required property 'events'",
    });
    await server.close();
  });

  it('planted defect: an empty batch is a 400', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events: [] } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'body/events must NOT have fewer than 1 items',
    });
    await server.close();
  });

  it('planted defect: a batch over 100 events is a 400', async () => {
    const server = app();
    const events = Array.from({ length: 101 }, () => submittedWorkspaceCreated());
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'body/events must NOT have more than 100 items',
    });
    await server.close();
  });

  it('planted defect: a body that is not an object at all is a 400', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: [1, 2, 3] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'body must be object',
    });
    await server.close();
  });

  it('planted defect: events as a plain object (not an array) is a 400', async () => {
    const server = app();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: { not: 'an array' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Bad Request', message: 'body/events must be array' });
    await server.close();
  });

  it('planted defect: events as a string is a 400, not silently wrapped into a one-event batch', async () => {
    const server = app();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: 'not-an-array' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Bad Request', message: 'body/events must be array' });
    await server.close();
  });

  it('planted defect: events as a number is a 400, not silently wrapped into a one-event batch', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events: 42 } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Bad Request', message: 'body/events must be array' });
    await server.close();
  });

  it('planted defect: events as null is a 400, not silently wrapped into a one-event batch', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events: null } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Bad Request', message: 'body/events must be array' });
    await server.close();
  });

  it('planted defect: an unknown top-level key is a 400, not a silently stripped extra', async () => {
    const server = app();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [submittedWorkspaceCreated()], tenantId: 'evil' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'body must NOT have additional properties',
    });
    await server.close();
  });

  it('planted defect: an unexpected mid-batch failure is a 500 that names no database internals', async () => {
    // The batch-abort semantics are the contract (the client retries and its
    // committed neighbours answer duplicate-event-id). What must never happen
    // is the DOOR explaining the breakage: Fastify's default handler would put
    // this projection's message — and a real one's SQL, constraint and table
    // names — straight into the response body.
    const projections = buildProjectionRegistry();
    projections.register({
      name: 'planted_exploding_projection',
      tables: [],
      async apply() {
        throw new Error('relation "proj_entity_heads" does not exist at character 13');
      },
      async reset() {},
    });
    const otp = new LogOtpSender(() => {});
    const auth = createAuth({
      pool: db.pool,
      otpSender: otp,
      magicLinkSender: new LogMagicLinkSender(() => {}),
      baseUrl: 'http://localhost:3000',
      secret: 'test-secret-not-used-anywhere-real',
    });
    const brokenIngest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections });
    const server = buildApp({
      db: db.pool,
      pool: db.pool,
      ingest: brokenIngest,
      auth,
      serverAppend: (events) => brokenIngest.ingestBatch(events),
      webOrigin: 'http://localhost:3001',
      store: createObjectStoreFromEnv({}),
    });
    // Signed in, because the door now refuses an anonymous caller at 401 and a
    // 401 would satisfy nothing this test asserts — it is about what the door
    // says when the work behind it BREAKS, which is only reachable by a caller
    // the door lets through.
    phoneCounter += 1;
    const user = await signInWithPhone(server, otp, `+9198000${String(phoneCounter).padStart(5, '0')}`);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { events: [submittedWorkspaceCreated({ actorId: user.userId })] },
    });

    expect(response.statusCode).toBe(500);
    // toEqual, not a "does not contain" check: the whole body is pinned, so a
    // future field carrying the message would fail here rather than ship.
    expect(response.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'the server could not complete this request',
    });
    await server.close();
  });
});

describe('GET /healthz against the real database', () => {
  it('answers ok on the real path — the double-backed ok test cannot prove a real pg Pool satisfies HealthDb', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await server.close();
  });
});

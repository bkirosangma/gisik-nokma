import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { LogMagicLinkSender } from '../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../src/auth/otp-sender.js';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/**
 * `buildApp` requires an auth instance from Plan 4 Task 2. This file never signs
 * anyone in — `/v1/events` carries no session guard yet — so the instance exists
 * only to satisfy the assembly, over the same test database as everything else.
 */
function testAuth() {
  return createAuth({
    pool: db.pool,
    otpSender: new LogOtpSender(() => {}),
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-not-used-anywhere-real',
  });
}

function app() {
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  return buildApp({ db: db.pool, ingest, auth: testAuth() });
}

describe('POST /v1/events', () => {
  it('answers 200 with index-aligned per-event results', async () => {
    const server = app();
    const valid = submittedWorkspaceCreated();
    const unknownType = { ...submittedWorkspaceCreated(), type: 'shop.opened' };
    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
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
    const server = buildApp({
      db: db.pool,
      ingest: createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections }),
      auth: testAuth(),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [submittedWorkspaceCreated()] },
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

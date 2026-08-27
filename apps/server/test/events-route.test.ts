import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildApp } from '../src/app.js';
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

function app() {
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  return buildApp({ db: db.pool, ingest });
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

  it('planted defect: a body without events is a 400, not a half-heard batch', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: {} });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('planted defect: an empty batch is a 400', async () => {
    const server = app();
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events: [] } });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('planted defect: a batch over 100 events is a 400', async () => {
    const server = app();
    const events = Array.from({ length: 101 }, () => submittedWorkspaceCreated());
    const response = await server.inject({ method: 'POST', url: '/v1/events', payload: { events } });
    expect(response.statusCode).toBe(400);
    await server.close();
  });
});

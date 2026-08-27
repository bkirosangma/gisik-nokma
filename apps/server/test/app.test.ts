import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { IngestService } from '../src/ingest/ingest-service.js';

const healthyDb = { query: async () => [{ ok: 1 }] };
const brokenDb = {
  query: async () => {
    throw new Error('connection refused');
  },
};

function fakeIngest(): IngestService {
  return {
    ingestBatch: async () => [],
    onEventCommitted: () => () => {},
  };
}

describe('GET /healthz', () => {
  it('answers ok when the database responds', async () => {
    const app = buildApp({ db: healthyDb, ingest: fakeIngest() });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('planted defect: answers 503 unavailable when the database is down — never a fake ok', async () => {
    const app = buildApp({ db: brokenDb, ingest: fakeIngest() });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    await app.close();
  });
});

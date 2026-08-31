import type { FastifyInstance } from 'fastify';
import type { ClientIngest } from '../ingest/ingest-service.js';

export const MAX_BATCH_SIZE = 100;

/**
 * Batch ingest. HTTP errors mean "this was not a batch" (schema refusal);
 * per-event results mean "this batch was heard" — envelope errors and rule
 * refusals ride inside results, index-aligned with the request array.
 *
 * This is the CLIENT-SUBMITTED door, which is why it calls `ingestClientBatch`
 * and not `ingestBatch`. Everything arriving here is a stranger's claim, so it
 * goes through the permission gate; the server's own appends use `ingestBatch`
 * directly and are not gated. Switching this call back to `ingestBatch` would
 * silently reopen the envelope-origin forgery — a client wearing
 * `origin: 'server'` to walk past `contest.server-only`.
 */
export function registerEventRoutes(app: FastifyInstance, ingest: ClientIngest): void {
  app.post(
    '/v1/events',
    {
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          additionalProperties: false,
          properties: {
            events: { type: 'array', minItems: 1, maxItems: MAX_BATCH_SIZE },
          },
        },
      },
    },
    async (request) => {
      const { events } = request.body as { events: unknown[] };
      const results = await ingest.ingestClientBatch(events);
      return { results };
    },
  );
}

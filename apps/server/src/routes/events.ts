import type { FastifyInstance } from 'fastify';
import type { IngestService } from '../ingest/ingest-service.js';

export const MAX_BATCH_SIZE = 100;

/**
 * Batch ingest. HTTP errors mean "this was not a batch" (schema refusal);
 * per-event results mean "this batch was heard" — envelope errors and rule
 * refusals ride inside results, index-aligned with the request array.
 */
export function registerEventRoutes(app: FastifyInstance, ingest: IngestService): void {
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
      const results = await ingest.ingestBatch(events);
      return { results };
    },
  );
}

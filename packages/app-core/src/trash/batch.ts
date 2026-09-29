import type { IngestResult } from '@gisik-nokma/domain';

/**
 * What one ingest answer MEANS for a batch of several claims (trash Plan 4,
 * D10). The door commits each event on its own, in order
 * (`apps/server/src/ingest/ingest-service.ts`'s `ingestAll` — one `commitOne`
 * per event), so a two-event batch has four outcomes, not two:
 *
 * - `committed` — every event committed;
 * - `refused` — none did; `reason` is the first non-committed answer's own
 *   sentence (a refusal's `reason`, or an invalid claim's `message`);
 * - `partly` — some did and some did not; `committed[i]` says which, so a
 *   caller can say WHICH half landed and never resend the half that did;
 * - `unanswered` — fewer answers than claims, so what happened is not known
 *   (the workspace home's own rule, `app/w/[workspaceId]/page.tsx:258-260`).
 */
export type BatchOutcome =
  | { status: 'committed' }
  | { status: 'refused'; reason: string }
  | { status: 'partly'; reason: string; committed: boolean[] }
  | { status: 'unanswered'; answered: number };

export function classifyBatch(results: readonly IngestResult[], sent: number): BatchOutcome {
  if (results.length !== sent) return { status: 'unanswered', answered: results.length };
  const committed = results.map((result) => result.status === 'committed');
  const firstBad = results.find((result) => result.status !== 'committed');
  if (firstBad === undefined) return { status: 'committed' };
  const reason =
    firstBad.status === 'refused' ? firstBad.reason : firstBad.status === 'invalid' ? firstBad.message : '';
  return committed.some(Boolean) ? { status: 'partly', reason, committed } : { status: 'refused', reason };
}

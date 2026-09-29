import type { DataSource } from '../data-source.js';
import type { AssignOutsider } from './types.js';

/**
 * A `DataSource['ingest']` that sends its ONE claim through the outsider door
 * (access plan W6). Handed to the existing submit machinery in place of
 * `dataSource.ingest`, so every outcome branch the caller already renders —
 * committed, refused, invalid — is reached unchanged. More than one claim is a
 * programming error: the door takes exactly the assignment.
 */
export function outsiderIngest(assignOutsider: AssignOutsider, userId: string): DataSource['ingest'] {
  return async (events) => {
    if (events.length !== 1) {
      throw new Error(`the outsider door takes exactly one claim, got ${events.length}`);
    }
    return [await assignOutsider(userId, events[0]!)];
  };
}

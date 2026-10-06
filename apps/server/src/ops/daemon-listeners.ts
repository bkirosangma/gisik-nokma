import type { Queryable } from '../db/queryable.js';
import type { IngestService } from '../ingest/ingest-service.js';
import { createNotificationFanout, type CanSeeFn } from '../notifications/fanout.js';
import type { NotificationTransport } from '../notifications/transport.js';

/**
 * The backup daemon files events too (the flow sweep's promotions, auto-close), through an ingest nobody listens to. Registering the
 * notification fan-out on it means a daemon-filed event reaches the same people a server-filed one would: whatever the fan-out answers
 * (an assignment; a sweep promotion's "Ready to start", NT-1, wtg2 T18's arm, 29.392). Every fan-out row is keyed by the event's id, so
 * a double delivery is one row. A separate module so a test can import it: `backup-daemon-main.ts` calls `main()` at import time.
 * Returns the unsubscribe.
 */
export function registerDaemonListeners(
  ingest: Pick<IngestService, 'onEventCommitted'>,
  deps: { pool: Queryable; transports: NotificationTransport[]; canSeeTicket?: CanSeeFn; log?: (message: string, error?: unknown) => void },
): () => void {
  const fanout = createNotificationFanout(deps);
  return ingest.onEventCommitted((event) => {
    void fanout.onCommitted(event);
  });
}

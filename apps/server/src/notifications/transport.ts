import type { Notification } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { insertNotification } from './store.js';

/**
 * A delivery channel. `deliver()` is at-least-once per `(userId,
 * notification.dedupeKey)`: the fan-out may retry and Task 6's sweep re-runs,
 * so implementations MUST be idempotent on that pair — `notification.id` will
 * differ between attempts, the dedupe key will not. The in-app transport gets
 * this from the `notifications` table's unique constraint; the push transports
 * (Plans 10/11) must keep the same contract by their own means.
 *
 * The interface deliberately names no database handle. A transport that
 * happens to store rows takes its handle at construction; one that opens a
 * socket takes none. That is what lets Plans 10 and 11 implement this without
 * inheriting `pg`.
 */
export interface NotificationTransport {
  readonly name: string;
  deliver(userId: string, notification: Notification): Promise<void>;
}

/**
 * In-app delivery IS the stored row: the inbox reads the table.
 *
 * DEVIATION FROM PLAN 9 TASK 5's declared cross-plan signature, recorded
 * deliberately: the plan writes `createInAppTransport(pool: Pool)`. It takes
 * `Queryable` (`Pool | PoolClient`) instead, because every function it composes
 * with — `insertNotification`, `canSee`, `getTicketStateFromDb` — already takes
 * `Queryable`, and because `app.ts` holds its handle as `AppDeps['pool']: Queryable`
 * and could not otherwise pass it. This is a WIDENING: a `Pool` is assignable
 * to `Queryable`, so every caller the plan anticipated still compiles, and
 * `NotificationTransport` itself names no handle type, so Plans 10/11 are
 * untouched.
 */
export function createInAppTransport(db: Queryable): NotificationTransport {
  return {
    name: 'in-app',
    async deliver(_userId, notification) {
      await insertNotification(db, notification);
    },
  };
}

/**
 * Every transport gets its chance; one failing channel never starves another,
 * and no failure escapes to the caller.
 *
 * The catch is per-transport rather than around the loop on purpose: a loop-level
 * catch would let the first failure cancel every channel after it, which is the
 * behaviour this function exists to prevent.
 */
export async function deliverToAll(
  transports: NotificationTransport[],
  notification: Notification,
  log: (message: string, error?: unknown) => void,
): Promise<void> {
  for (const transport of transports) {
    try {
      await transport.deliver(notification.userId, notification);
    } catch (error) {
      log(`notification transport ${transport.name} failed for ${notification.dedupeKey}`, error);
    }
  }
}

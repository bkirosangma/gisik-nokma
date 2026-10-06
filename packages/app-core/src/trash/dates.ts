import { istDayOf } from '@gisik-nokma/domain';
import { formatClaimDate } from '../claims/claim-labels.js';

/**
 * The IST day an instant falls in, as "8 Oct" (spec §6.3's own example). The
 * inbox's `sinceDay` pattern (`inbox/format.ts:55-64`): `istDayOf` — never a
 * ten-character slice, which would put 18:30Z–23:59Z on the wrong day — then
 * `formatClaimDate`, and a malformed instant is printed verbatim rather than
 * throwing a whole list down.
 */
export function istDayLabel(instant: string): string {
  try {
    return formatClaimDate(istDayOf(instant));
  } catch {
    return instant;
  }
}

/**
 * Due and not yet purged (spec §7: the row stays, "Permanently deleted on …").
 * `<=`, the server's own boundary: `purge.unmarked` is refused once
 * `purgeDueAt(purge_marked_at) <= now` (Plan 1, case 19.035).
 */
export function isPurgeOverdue(purgeDueAt: string | null, now: Date): boolean {
  return purgeDueAt !== null && Date.parse(purgeDueAt) <= now.getTime();
}
